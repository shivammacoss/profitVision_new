import Trade from '../models/Trade.js'
import TradingAccount from '../models/TradingAccount.js'
import Charges from '../models/Charges.js'
import TradeSettings from '../models/TradeSettings.js'
import AdminLog from '../models/AdminLog.js'
import User from '../models/User.js'
import ibEngine from './ibEngineNew.js'
import referralEngine from './referralEngine.js'
import lpService from './lpService.js'
import { validateSlTpPlacement } from '../utils/slTpValidation.js'

class TradeEngine {
  constructor() {
    this.CONTRACT_SIZE = 100000
  }

  // Get contract size based on symbol type
  getContractSize(symbol) {
    // Metals - 100 oz for gold, 5000 oz for silver
    if (symbol === 'XAUUSD') return 100
    if (symbol === 'XAGUSD') return 5000
    // Crypto - 1 unit
    if (['BTCUSD', 'ETHUSD', 'LTCUSD', 'XRPUSD', 'BCHUSD'].includes(symbol)) return 1
    // Forex - standard 100,000
    return 100000
  }

  // Calculate execution price with spread
  // spreadValue is in PIPS for Forex, CENTS for Metals, USD for Crypto
  calculateExecutionPrice(side, bid, ask, spreadValue, spreadType, symbol = '') {
    let spreadInPrice = 0
    
    if (spreadType === 'PERCENTAGE') {
      spreadInPrice = (ask - bid) * (spreadValue / 100)
    } else {
      // FIXED spread - convert from pips/cents/usd to price units
      const isJPYPair = symbol.includes('JPY')
      const isMetal = ['XAUUSD', 'XAGUSD'].includes(symbol)
      const isCrypto = ['BTCUSD', 'ETHUSD', 'LTCUSD', 'XRPUSD', 'BCHUSD', 'BNBUSD', 'SOLUSD', 'ADAUSD', 'DOGEUSD', 'DOTUSD', 'MATICUSD', 'AVAXUSD', 'LINKUSD'].includes(symbol)
      
      if (isCrypto) {
        // Crypto: spread value is in USD directly
        spreadInPrice = spreadValue
      } else if (isMetal) {
        // Metals: spread value is in cents (e.g., 50 = $0.50)
        spreadInPrice = spreadValue * 0.01
      } else if (isJPYPair) {
        // JPY pairs: 1 pip = 0.01
        spreadInPrice = spreadValue * 0.01
      } else {
        // Standard Forex: 1 pip = 0.0001
        spreadInPrice = spreadValue * 0.0001
      }
    }
    
    if (side === 'BUY') {
      return ask + spreadInPrice
    } else {
      return bid - spreadInPrice
    }
  }

  // Calculate margin required for a trade
  // Formula: (Lots * Contract Size * Price) / Leverage
  // Example: 0.01 lot XAUUSD at $2650 with 1:100 leverage
  // = (0.01 * 100 * 2650) / 100 = $26.50 margin required
  calculateMargin(quantity, openPrice, leverage, contractSize = this.CONTRACT_SIZE) {
    const leverageNum = parseInt(leverage.toString().replace('1:', '')) || 100
    const margin = (quantity * contractSize * openPrice) / leverageNum
    return Math.round(margin * 100) / 100 // Round to 2 decimal places
  }

  // Calculate commission based on type
  calculateCommission(quantity, openPrice, commissionType, commissionValue, contractSize = this.CONTRACT_SIZE) {
    switch (commissionType) {
      case 'PER_LOT':
        return quantity * commissionValue
      case 'PER_TRADE':
        return commissionValue
      case 'PERCENTAGE':
        const tradeValue = quantity * contractSize * openPrice
        return tradeValue * (commissionValue / 100)
      default:
        return 0
    }
  }

  // Calculate PnL for a trade
  calculatePnl(side, openPrice, currentPrice, quantity, contractSize = this.CONTRACT_SIZE) {
    if (side === 'BUY') {
      return (currentPrice - openPrice) * quantity * contractSize
    } else {
      return (openPrice - currentPrice) * quantity * contractSize
    }
  }

  // Calculate spread cost in USD
  calculateSpreadCost(side, bid, ask, spreadValue, spreadType, quantity, contractSize, symbol = '') {
    let spreadInPrice = 0
    
    if (spreadType === 'PERCENTAGE') {
      spreadInPrice = (ask - bid) * (spreadValue / 100)
    } else {
      // FIXED spread - value is in PIPS, need to convert to price
      const isJPYPair = symbol.includes('JPY')
      const isMetal = ['XAUUSD', 'XAGUSD'].includes(symbol)
      const isCrypto = ['BTCUSD', 'ETHUSD', 'LTCUSD', 'XRPUSD', 'BCHUSD'].includes(symbol)
      
      if (isCrypto) {
        spreadInPrice = spreadValue
      } else if (isMetal) {
        spreadInPrice = spreadValue * 0.01
      } else if (isJPYPair) {
        spreadInPrice = spreadValue * 0.01
      } else {
        spreadInPrice = spreadValue * 0.0001
      }
    }
    
    // Spread cost = spread in price * quantity * contract size
    const spreadCost = spreadInPrice * quantity * contractSize
    return Math.round(spreadCost * 100) / 100
  }

  // Calculate floating PnL including charges
  // Note: spread and commission are already deducted from balance when trade opens
  // So floating PnL should NOT subtract them again (they're already accounted for)
  // Only swap is accumulated over time and needs to be subtracted
  calculateFloatingPnl(trade, currentBid, currentAsk) {
    const currentPrice = trade.side === 'BUY' ? currentBid : currentAsk
    const rawPnl = this.calculatePnl(trade.side, trade.openPrice, currentPrice, trade.quantity, trade.contractSize)
    return rawPnl - trade.swap
  }

  // Get account financial summary (real-time calculated values)
  async getAccountSummary(tradingAccountId, openTrades, currentPrices) {
    const account = await TradingAccount.findById(tradingAccountId)
    if (!account) throw new Error('Trading account not found')

    let usedMargin = 0
    let floatingPnl = 0

    for (const trade of openTrades) {
      usedMargin += trade.marginUsed
      const prices = currentPrices[trade.symbol]
      if (prices) {
        floatingPnl += this.calculateFloatingPnl(trade, prices.bid, prices.ask)
      }
    }

    const equity = account.balance + account.credit + floatingPnl
    const freeMargin = equity - usedMargin

    return {
      balance: account.balance,
      credit: account.credit,
      equity,
      usedMargin,
      freeMargin,
      floatingPnl,
      marginLevel: usedMargin > 0 ? (equity / usedMargin) * 100 : 0
    }
  }

  // Validate if trade can be opened
  async validateTradeOpen(tradingAccountId, symbol, side, quantity, openPrice, leverage, contractSize = this.CONTRACT_SIZE) {
    const account = await TradingAccount.findById(tradingAccountId).populate('accountTypeId')
    if (!account) {
      return { valid: false, error: 'Trading account not found' }
    }

    console.log(`Account validation: ID=${tradingAccountId}, Balance=${account.balance}, Credit=${account.credit}, Status=${account.status}`)

    if (account.status !== 'Active') {
      return { valid: false, error: `Account is ${account.status}` }
    }

    // CRITICAL: Check if account has any balance at all
    if (account.balance <= 0 && (account.credit || 0) <= 0) {
      return { valid: false, error: `Insufficient funds. Balance: $${account.balance}, Credit: $${account.credit || 0}. Please deposit to trade.` }
    }

    // Get open trades for margin calculation
    const openTrades = await Trade.find({ tradingAccountId, status: 'OPEN' })
    
    // Get trade settings
    const settings = await TradeSettings.getSettings(account.accountTypeId?._id)

    // Check max open trades
    if (openTrades.length >= settings.maxOpenTradesPerUser) {
      return { valid: false, error: 'Maximum open trades limit reached' }
    }

    // Check max lots
    const totalLots = openTrades.reduce((sum, t) => sum + t.quantity, 0) + quantity
    if (totalLots > settings.maxOpenLotsPerUser) {
      return { valid: false, error: 'Maximum lots limit exceeded' }
    }

    // Calculate margin required for new trade
    const marginRequired = this.calculateMargin(quantity, openPrice, leverage, contractSize)

    // Calculate current used margin from existing trades
    const usedMargin = openTrades.reduce((sum, t) => sum + (t.marginUsed || 0), 0)
    
    // Equity = Balance + Credit (floating PnL is calculated in real-time, not stored)
    // For validation, we use balance + credit as the base
    const equity = account.balance + (account.credit || 0)
    
    // Free margin = Equity - Used Margin
    const freeMargin = equity - usedMargin

    // CRITICAL: Ensure margin required doesn't exceed free margin
    if (marginRequired > freeMargin) {
      return { 
        valid: false, 
        error: `Insufficient margin. Required: $${marginRequired.toFixed(2)}, Available: $${freeMargin.toFixed(2)}` 
      }
    }

    // Additional check: Ensure user has at least the margin amount in their account
    if (marginRequired > equity) {
      return { 
        valid: false, 
        error: `Insufficient equity. Required margin: $${marginRequired.toFixed(2)}, Your equity: $${equity.toFixed(2)}` 
      }
    }

    return { valid: true, marginRequired, freeMargin, usedMargin, equity }
  }

  // Check if market is open for a symbol
  isMarketOpen(symbol) {
    const now = new Date()
    const utcDay = now.getUTCDay() // 0 = Sunday, 6 = Saturday
    const utcHour = now.getUTCHours()
    
    // Crypto markets are always open
    if (['BTCUSD', 'ETHUSD', 'LTCUSD', 'XRPUSD', 'BCHUSD', 'BNBUSD', 'SOLUSD', 'ADAUSD', 'DOGEUSD', 'DOTUSD', 'MATICUSD', 'AVAXUSD', 'LINKUSD'].includes(symbol)) {
      return true
    }
    
    // Forex and Metals: Closed from Friday 22:00 UTC to Sunday 22:00 UTC
    // Saturday (day 6) - fully closed
    if (utcDay === 6) return false
    // Sunday before 22:00 UTC - closed
    if (utcDay === 0 && utcHour < 22) return false
    // Friday after 22:00 UTC - closed
    if (utcDay === 5 && utcHour >= 22) return false
    
    return true
  }

  // Open a new trade
  // options: { isCopyTrade, masterTradeId, skipValidation, skipCommissionDeduction }
  async openTrade(userId, tradingAccountId, symbol, segment, side, orderType, quantity, bid, ask, sl = null, tp = null, userLeverage = null, entryPrice = null, options = {}) {
    const { isCopyTrade = false, masterTradeId = null, skipValidation = false, skipCommissionDeduction = false } = options
    const account = await TradingAccount.findById(tradingAccountId).populate('accountTypeId')
    if (!account) throw new Error('Trading account not found')

    // Check if market is open
    if (!this.isMarketOpen(symbol)) {
      throw new Error(`Market is closed for ${symbol}. Forex and metals trade Mon-Fri only.`)
    }

    // Validate bid/ask prices are valid
    if (!bid || !ask || bid <= 0 || ask <= 0) {
      throw new Error('Invalid market prices. Please try again.')
    }

    // Get charges for this trade
    const charges = await Charges.getChargesForTrade(userId, symbol, segment, account.accountTypeId?._id)
    
    // Log AccountType info for debugging
    console.log(`[Trade] AccountType: ${account.accountTypeId?.name || 'None'}, minSpread: ${account.accountTypeId?.minSpread}, commission: ${account.accountTypeId?.commission}`)
    
    // Fallback to AccountType's spread/commission if no charges found in Charges collection
    if (charges.spreadValue === 0 && account.accountTypeId?.minSpread > 0) {
      charges.spreadValue = account.accountTypeId.minSpread
      charges.spreadType = 'FIXED'
      console.log(`[Trade] Using AccountType minSpread fallback: ${charges.spreadValue} pips`)
    }
    if (charges.commissionValue === 0 && account.accountTypeId?.commission > 0) {
      charges.commissionValue = account.accountTypeId.commission
      charges.commissionType = 'PER_LOT'
      console.log(`[Trade] Using AccountType commission fallback: ${charges.commissionValue}`)
    }
    
    console.log(`[Trade] Final charges: spread=${charges.spreadValue} (${charges.spreadType}), commission=${charges.commissionValue} (${charges.commissionType})`)

    // Calculate execution price with spread
    const openPrice = this.calculateExecutionPrice(side, bid, ask, charges.spreadValue, charges.spreadType, symbol)

    // Get contract size based on symbol
    const contractSize = this.getContractSize(symbol)

    // Use user-selected leverage if provided, otherwise use account's leverage
    // User can select any leverage up to account's max leverage
    const accountMaxLeverage = parseInt(account.leverage.toString().replace('1:', '')) || 100
    let selectedLeverage = accountMaxLeverage
    
    if (userLeverage) {
      const userLeverageNum = parseInt(userLeverage.toString().replace('1:', '')) || accountMaxLeverage
      // User can only use leverage up to account's max
      selectedLeverage = Math.min(userLeverageNum, accountMaxLeverage)
    }
    
    const leverage = `1:${selectedLeverage}`
    const marginRequired = this.calculateMargin(quantity, openPrice, leverage, contractSize)
    
    // Log for debugging
    console.log(`Trade validation: ${quantity} lots ${symbol} @ ${openPrice}, Contract: ${contractSize}, Leverage: ${leverage}, Margin Required: $${marginRequired}`)

    // Validate trade - pass the correct parameters
    const validation = await this.validateTradeOpen(tradingAccountId, symbol, side, quantity, openPrice, leverage, contractSize)
    if (!validation.valid) {
      throw new Error(validation.error)
    }
    
    console.log(`Trade validated: Free Margin: $${validation.freeMargin}, Equity: $${validation.equity}`)

    // Calculate commission based on side and commission settings
    let commission = 0
    const shouldChargeCommission = (side === 'BUY' && charges.commissionOnBuy !== false) || 
                                   (side === 'SELL' && charges.commissionOnSell !== false)
    
    if (shouldChargeCommission && charges.commissionValue > 0) {
      commission = this.calculateCommission(quantity, openPrice, charges.commissionType, charges.commissionValue, contractSize)
    }
    console.log(`[Trade] Commission calculated: $${commission} (side=${side}, commissionOnBuy=${charges.commissionOnBuy}, commissionOnSell=${charges.commissionOnSell})`)

    // Calculate spread cost in USD (for earnings tracking)
    let spreadCost = 0
    if (charges.spreadValue > 0) {
      spreadCost = this.calculateSpreadCost(side, bid, ask, charges.spreadValue, charges.spreadType, quantity, contractSize, symbol)
    }
    console.log(`[Trade] Spread cost calculated: $${spreadCost} (spreadValue=${charges.spreadValue} pips)`)

    // Generate trade ID
    const tradeId = await Trade.generateTradeId()

    // For pending orders, use entryPrice if provided, otherwise use calculated openPrice
    const finalOpenPrice = (orderType !== 'MARKET' && entryPrice) ? entryPrice : openPrice
    const finalPendingPrice = orderType !== 'MARKET' ? (entryPrice || openPrice) : null

    const slTpErr = validateSlTpPlacement(side, finalOpenPrice, sl, tp)
    if (slTpErr) throw new Error(slTpErr)

    // Get user's book type (A or B) and name for LP push
    const user = await User.findById(userId).select('bookType firstName email')
    // Demo accounts must always stay B-book regardless of user.bookType — demo trades never go to LP
    const userBookType = account.isDemo ? 'B' : (user?.bookType || 'B')

    // Create trade
    const trade = await Trade.create({
      userId,
      tradingAccountId,
      tradeId,
      symbol,
      segment,
      side,
      orderType,
      quantity,
      openPrice: finalOpenPrice,
      stopLoss: sl,
      takeProfit: tp,
      marginUsed: marginRequired,
      leverage: parseInt(leverage.toString().replace('1:', '')) || 100,
      contractSize: contractSize,
      spread: spreadCost, // Store spread cost in USD (not pips)
      commission,
      swap: 0,
      floatingPnl: 0,
      status: orderType === 'MARKET' ? 'OPEN' : 'PENDING',
      pendingPrice: finalPendingPrice,
      bookType: userBookType,
      // Copy Trade fields - when isCopyTrade=true, closeTrade skips wallet mutation
      isCopyTrade: isCopyTrade,
      masterTradeId: masterTradeId
    })

    // Deduct commission from trading account balance when trade opens
    // NOTE: Spread is NOT deducted here because it's already built into the openPrice
    // (user buys at ask+spread or sells at bid-spread, so spread is reflected in P&L)
    // The spreadCost stored in trade.spread is for EARNINGS TRACKING only
    // SKIP for copy trades - copy trades don't deduct from wallet
    if (orderType === 'MARKET' && commission > 0 && !isCopyTrade && !skipCommissionDeduction) {
      account.balance -= commission
      if (account.balance < 0) account.balance = 0
      await account.save()
      console.log(`[Trade] Deducted commission from balance: $${commission} (spread $${spreadCost} is built into price, not deducted)`)
    }

    // Push A-Book trades to Corecen LP — never for demo accounts
    if (orderType === 'MARKET' && userBookType === 'A' && !account.isDemo && lpService.isConfigured()) {
      try {
        const lpResult = await lpService.pushTradeToCorecen(trade, user)
        if (lpResult.success) {
          console.log(`[TradeEngine] A-Book trade ${trade.tradeId} pushed to Corecen LP`)
          trade.lpPushed = true
          trade.lpPushedAt = new Date()
          await trade.save()
        } else {
          console.error(`[TradeEngine] Failed to push A-Book trade to LP: ${lpResult.error}`)
        }
      } catch (lpError) {
        console.error('[TradeEngine] Error pushing trade to LP:', lpError)
      }
    }

    return trade
  }

  // Close a trade
  // options.skipCreditProcessing: true when called from closeFollowerTrades (credit handled there)
  async closeTrade(tradeId, currentBid, currentAsk, closedBy = 'USER', adminId = null, options = {}) {
    const trade = await Trade.findById(tradeId).populate({ path: 'tradingAccountId', populate: { path: 'accountTypeId' } })
    if (!trade) throw new Error('Trade not found')
    if (trade.status !== 'OPEN') throw new Error('Trade is not open')

    const closePrice = trade.side === 'BUY' ? currentBid : currentAsk
    
    // Get charges to check if commission on close is enabled
    const charges = await Charges.getChargesForTrade(
      trade.userId, 
      trade.symbol, 
      trade.segment, 
      trade.tradingAccountId?.accountTypeId?._id
    )
    
    // Calculate commission on close if enabled
    let closeCommission = 0
    if (charges.commissionOnClose && charges.commissionValue > 0) {
      closeCommission = this.calculateCommission(trade.quantity, closePrice, charges.commissionType, charges.commissionValue, trade.contractSize)
      console.log(`Commission on close: $${closeCommission}`)
    }
    
    // Calculate final PnL
    // Note: Commission was deducted from balance when trade opened
    // Spread is built into the openPrice (not deducted separately)
    // So realizedPnlForBalance = rawPnl - swap - closeCommission (commission already deducted)
    // For display, we show: rawPnl - openCommission - swap - closeCommission
    // (spread is already reflected in rawPnl via the worse open price)
    const rawPnl = this.calculatePnl(trade.side, trade.openPrice, closePrice, trade.quantity, trade.contractSize)
    const openCommission = trade.commission || 0
    
    // realizedPnl for balance update (commission already deducted on open)
    const realizedPnlForBalance = rawPnl - trade.swap - closeCommission
    
    // realizedPnl for display (includes commission costs, spread is already in rawPnl)
    const realizedPnl = rawPnl - openCommission - trade.swap - closeCommission
    console.log(`[TradeClose] rawPnl: ${rawPnl}, openCommission: ${openCommission}, swap: ${trade.swap}, closeCommission: ${closeCommission}, realizedPnl: ${realizedPnl}, realizedPnlForBalance: ${realizedPnlForBalance}`)

    // Update trade
    trade.closePrice = closePrice
    trade.realizedPnl = realizedPnl
    trade.status = 'CLOSED'
    trade.closedBy = closedBy
    trade.closedAt = new Date()

    if (adminId) {
      trade.adminModified = true
      trade.adminModifiedBy = adminId
      trade.adminModifiedAt = new Date()
    }

    await trade.save()

    // ========== COPY TRADE CHECK ==========
    // If this is a copy trade, DO NOT mutate wallet/balance here
    // Copy trade P&L is handled by copyTradingEngine using CREDIT only
    if (trade.isCopyTrade) {
      console.log(`[TradeEngine] COPY TRADE detected (${trade.tradeId}) - skipping normal wallet mutation`)
      
      // If NOT called from closeFollowerTrades, process credit/wallet HERE
      // This handles: user manual close, SL/TP trigger, admin close, stop-out
      if (!options.skipCreditProcessing) {
        try {
          await this.processCopyTradeCredit(trade, realizedPnlForBalance)
        } catch (creditErr) {
          console.error(`[TradeEngine] Error processing copy trade credit for ${trade.tradeId}:`, creditErr)
        }
      } else {
        console.log(`[TradeEngine] P&L: $${realizedPnlForBalance.toFixed(2)} will be handled by copyTradingEngine`)
      }
    } else {
      // ========== MANUAL TRADE - Normal wallet mutation ==========
      // Update account balance with proper credit handling
      // Use realizedPnlForBalance (excludes already-deducted commission and spread)
      const account = await TradingAccount.findById(trade.tradingAccountId)
      
      if (realizedPnlForBalance >= 0) {
        // Profit: Add to balance only (credit stays the same)
        account.balance += realizedPnlForBalance
      } else {
        // Loss: First deduct from balance, then from credit if balance insufficient
        const loss = Math.abs(realizedPnlForBalance)
        
        if (account.balance >= loss) {
          // Balance can cover the loss
          account.balance -= loss
        } else {
          // Balance cannot cover the loss - use credit for remaining
          const remainingLoss = loss - account.balance
          account.balance = 0
          
          // Deduct remaining loss from credit
          if (account.credit > 0) {
            account.credit = Math.max(0, (account.credit || 0) - remainingLoss)
          }
        }
      }
      
      await account.save()
    }

    // Log admin action if applicable
    if (adminId) {
      await AdminLog.create({
        adminId,
        action: closedBy === 'ADMIN' ? 'TRADE_CLOSE' : 'TRADE_FORCE_CLOSE',
        targetType: 'TRADE',
        targetId: trade._id,
        previousValue: { status: 'OPEN' },
        newValue: { status: 'CLOSED', realizedPnl }
      })
    }

    // Process IB commission for this trade (legacy)
    try {
      await ibEngine.processTradeCommission(trade)
    } catch (ibError) {
      console.error('Error processing IB commission:', ibError)
    }

    // Process new Referral Income commission
    try {
      await referralEngine.processReferralIncome(trade)
    } catch (refError) {
      console.error('Error processing Referral Income:', refError)
    }

    // Close A-Book trade on Corecen LP — never for demo accounts
    const closingAccountIsDemo = trade.tradingAccountId?.isDemo === true
    if (trade.bookType === 'A' && !closingAccountIsDemo && lpService.isConfigured()) {
      try {
        const lpResult = await lpService.closeTradeOnCorecen(trade)
        if (lpResult.success) {
          console.log(`[TradeEngine] A-Book trade ${trade.tradeId} closed on Corecen LP`)
        } else {
          console.error(`[TradeEngine] Failed to close A-Book trade on LP: ${lpResult.error}`)
        }
      } catch (lpError) {
        console.error('[TradeEngine] Error closing trade on LP:', lpError)
      }
    }

    // Close follower trades if this is a master trade
    // IMPORTANT: Only call this for master trades, not for follower trades being closed
    // Check if this trade is a master trade by looking for a MasterTrader with this account
    await this.closeFollowerTradesIfMaster(trade, closePrice)

    return { trade, realizedPnl, realizedPnlForBalance }
  }

  // Only close follower trades if this is actually a master trade
  async closeFollowerTradesIfMaster(trade, closePrice) {
    try {
      const MasterTrader = (await import('../models/MasterTrader.js')).default
      
      // Extract _id from populated tradingAccountId (populated object vs ObjectId)
      const accountId = trade.tradingAccountId?._id || trade.tradingAccountId
      
      // Check if this trade's account belongs to an active master
      const master = await MasterTrader.findOne({
        tradingAccountId: accountId,
        status: 'ACTIVE'
      })
      
      if (!master) {
        // Not a master trade, don't try to close follower trades
        return
      }
      
      console.log(`[CopyTrade] Master trade detected, closing follower trades for trade ${trade._id}`)
      
      const copyTradingEngine = (await import('./copyTradingEngine.js')).default
      const results = await copyTradingEngine.closeFollowerTrades(trade._id, closePrice)
      if (results.length > 0) {
        console.log(`[CopyTrade] Closed ${results.length} follower trades for master trade ${trade._id}`)
      }
    } catch (error) {
      console.error('Error closing follower trades:', error)
    }
  }

  // Process credit/wallet for a copy trade closed directly (not via closeFollowerTrades)
  // This handles: user manual close, SL/TP trigger, admin close, stop-out
  async processCopyTradeCredit(trade, realizedPnlForBalance) {
    const CopyTrade = (await import('../models/CopyTrade.js')).default
    const CopyFollower = (await import('../models/CopyFollower.js')).default
    const MasterTrader = (await import('../models/MasterTrader.js')).default
    const creditRefillService = (await import('./creditRefillService.js')).default

    // Find the CopyTrade record for this follower trade
    const copyTrade = await CopyTrade.findOne({ followerTradeId: trade._id, status: { $in: ['OPEN', 'CLOSING'] } })
    if (!copyTrade) {
      console.log(`[TradeEngine] No open CopyTrade record found for trade ${trade.tradeId} - credit may already be processed`)
      return
    }

    console.log(`[TradeEngine] Processing copy trade credit directly for ${trade.tradeId}, P&L: $${realizedPnlForBalance.toFixed(2)}`)

    const master = await MasterTrader.findById(copyTrade.masterId)
    const sharePercentage = master?.approvedCommissionPercentage || 50

    // Process through credit refill service (same logic as closeFollowerTrades)
    const refillResult = await creditRefillService.processTradeClose({
      copyFollowerId: copyTrade.followerId,
      tradingAccountId: copyTrade.followerAccountId,
      userId: copyTrade.followerUserId,
      masterId: copyTrade.masterId,
      rawPnl: realizedPnlForBalance,
      masterSharePercentage: sharePercentage,
      tradeId: trade._id,
      copyTradeId: copyTrade._id,
      metadata: {
        symbol: trade.symbol,
        side: trade.side,
        lotSize: trade.quantity,
        openPrice: trade.openPrice,
        closePrice: trade.closePrice,
        closedBy: trade.closedBy,
        directClose: true
      }
    })

    // Credit master's share if profit
    const masterShare = refillResult.masterShare || 0
    if (masterShare > 0 && master) {
      master.pendingCommission = (master.pendingCommission || 0) + masterShare
      master.totalCommissionEarned = (master.totalCommissionEarned || 0) + masterShare
      await master.save()
      console.log(`[TradeEngine] Master credited: $${masterShare.toFixed(2)}`)
    }

    // Update CopyTrade record
    copyTrade.masterClosePrice = trade.closePrice
    copyTrade.followerClosePrice = trade.closePrice
    copyTrade.rawPnl = realizedPnlForBalance
    copyTrade.followerPnl = refillResult.followerShare || 0
    copyTrade.masterPnl = masterShare
    copyTrade.creditBefore = refillResult.creditBefore || 0
    copyTrade.creditAfter = refillResult.creditAfter || 0
    copyTrade.creditChange = refillResult.creditChange || 0
    copyTrade.walletCredited = refillResult.walletChange || 0
    copyTrade.refillAction = refillResult.action
    copyTrade.profitToCredit = refillResult.profitToCredit || 0
    copyTrade.profitToWallet = refillResult.profitToWallet || 0
    copyTrade.deficitAfter = refillResult.deficitAfter || 0
    copyTrade.status = 'CLOSED'
    copyTrade.closedAt = new Date()
    copyTrade.commissionApplied = true
    await copyTrade.save()

    // Update follower stats
    const followerShare = refillResult.followerShare || 0
    await CopyFollower.findByIdAndUpdate(copyTrade.followerId, {
      $inc: {
        'stats.activeCopiedTrades': -1,
        'stats.totalProfit': followerShare >= 0 ? followerShare : 0,
        'stats.totalLoss': followerShare < 0 ? Math.abs(followerShare) : 0,
        'stats.totalCommissionPaid': masterShare > 0 ? masterShare : 0
      }
    })

    console.log(`[TradeEngine] ✅ Copy trade credit processed: Action=${refillResult.action}, Credit: $${refillResult.creditAfter?.toFixed(2)}, Wallet: $${refillResult.walletChange?.toFixed(2)}`)
  }

  // Modify trade SL/TP
  // options.skipSlTpValidation: e.g. copy-trade mirror (levels already validated on master)
  async modifyTrade(tradeId, sl = null, tp = null, adminId = null, options = {}) {
    const { skipSlTpValidation = false } = options
    const trade = await Trade.findById(tradeId)
    if (!trade) throw new Error('Trade not found')
    if (trade.status !== 'OPEN') throw new Error('Trade is not open')

    const previousValue = { stopLoss: trade.stopLoss, takeProfit: trade.takeProfit }

    // Update both stopLoss/takeProfit and sl/tp fields for compatibility
    // Allow setting to null (clearing) or to a valid number
    if (sl !== undefined) {
      const slValue = (sl !== null && !isNaN(sl)) ? sl : null
      trade.stopLoss = slValue
      trade.sl = slValue
    }
    if (tp !== undefined) {
      const tpValue = (tp !== null && !isNaN(tp)) ? tp : null
      trade.takeProfit = tpValue
      trade.tp = tpValue
    }
    
    console.log('Modifying trade SL/TP:', { tradeId, sl: trade.stopLoss, tp: trade.takeProfit })

    if (!adminId && !skipSlTpValidation) {
      const err = validateSlTpPlacement(trade.side, trade.openPrice, trade.stopLoss, trade.takeProfit)
      if (err) throw new Error(err)
    }

    if (adminId) {
      trade.adminModified = true
      trade.adminModifiedBy = adminId
      trade.adminModifiedAt = new Date()
    }

    await trade.save()

    // Log admin action
    if (adminId) {
      await AdminLog.create({
        adminId,
        action: sl !== null ? 'TRADE_MODIFY_SL' : 'TRADE_MODIFY_TP',
        targetType: 'TRADE',
        targetId: trade._id,
        previousValue,
        newValue: { stopLoss: trade.stopLoss, takeProfit: trade.takeProfit }
      })
    }

    return trade
  }

  // Check and execute stop-out
  async checkStopOut(tradingAccountId, currentPrices) {
    const account = await TradingAccount.findById(tradingAccountId).populate('accountTypeId')
    if (!account) return null

    const openTrades = await Trade.find({ tradingAccountId, status: 'OPEN' })
    if (openTrades.length === 0) return null

    const settings = await TradeSettings.getSettings(account.accountTypeId?._id)
    const summary = await this.getAccountSummary(tradingAccountId, openTrades, currentPrices)

    // CRITICAL: Check if equity is negative or zero - immediate stop out
    // Also check if margin level is below stop-out level (default 20%)
    const stopOutLevel = settings.stopOutLevel || 20
    const shouldStopOut = 
      summary.equity <= 0 || 
      summary.freeMargin < 0 ||
      (summary.marginLevel > 0 && summary.marginLevel <= stopOutLevel)

    if (shouldStopOut) {
      console.log(`STOP OUT TRIGGERED for account ${tradingAccountId}: Equity=${summary.equity}, FreeMargin=${summary.freeMargin}, MarginLevel=${summary.marginLevel}%`)
      
      // Force close all trades
      const closedTrades = []
      for (const trade of openTrades) {
        const prices = currentPrices[trade.symbol]
        if (prices) {
          try {
            const result = await this.closeTrade(trade._id, prices.bid, prices.ask, 'STOP_OUT')
            closedTrades.push(result)
          } catch (err) {
            console.error(`Error closing trade ${trade.tradeId} during stop out:`, err)
          }
        }
      }

      // Reset account balance if negative
      const finalAccount = await TradingAccount.findById(tradingAccountId)
      if (finalAccount.balance < 0) {
        finalAccount.balance = 0
      }
      await finalAccount.save()

      return { 
        stopOutTriggered: true, 
        closedTrades,
        reason: summary.equity <= 0 ? 'EQUITY_ZERO' : summary.freeMargin < 0 ? 'NEGATIVE_FREE_MARGIN' : 'MARGIN_LEVEL',
        finalEquity: summary.equity,
        finalMarginLevel: summary.marginLevel
      }
    }

    return { stopOutTriggered: false }
  }

  // Check SL/TP for all open trades
  async checkSlTpForAllTrades(currentPrices) {
    const openTrades = await Trade.find({ status: 'OPEN' })
    const triggeredTrades = []

    for (const trade of openTrades) {
      const prices = currentPrices[trade.symbol]
      if (!prices) continue

      const trigger = trade.checkSlTp(prices.bid, prices.ask)
      if (trigger) {
        try {
          const result = await this.closeTrade(trade._id, prices.bid, prices.ask, trigger)
          triggeredTrades.push({ trade: result.trade, trigger, pnl: result.realizedPnl })
        } catch (error) {
          // Trade may have been closed by another process (race condition)
          // This is expected behavior - just skip and continue
          if (error.message === 'Trade is not open' || error.message === 'Trade not found') {
            console.log(`[SL/TP Check] Trade ${trade.tradeId} already closed, skipping`)
            continue
          }
          // Re-throw unexpected errors
          throw error
        }
      }
    }

    return triggeredTrades
  }

  // Check and execute pending orders when price is reached
  async checkPendingOrders(currentPrices) {
    const pendingTrades = await Trade.find({ status: 'PENDING' })
    const executedTrades = []

    for (const trade of pendingTrades) {
      const prices = currentPrices[trade.symbol]
      if (!prices) continue

      let shouldExecute = false
      const currentBid = prices.bid
      const currentAsk = prices.ask

      switch (trade.orderType) {
        case 'BUY_LIMIT':
          // Execute when ask price drops to or below pending price
          if (currentAsk <= trade.pendingPrice) shouldExecute = true
          break
        case 'BUY_STOP':
          // Execute when ask price rises to or above pending price
          if (currentAsk >= trade.pendingPrice) shouldExecute = true
          break
        case 'SELL_LIMIT':
          // Execute when bid price rises to or above pending price
          if (currentBid >= trade.pendingPrice) shouldExecute = true
          break
        case 'SELL_STOP':
          // Execute when bid price drops to or below pending price
          if (currentBid <= trade.pendingPrice) shouldExecute = true
          break
      }

      if (shouldExecute) {
        try {
          // Update trade to OPEN status
          trade.status = 'OPEN'
          trade.openPrice = trade.side === 'BUY' ? currentAsk : currentBid
          trade.openedAt = new Date()
          await trade.save()

          executedTrades.push({
            trade,
            executedAt: new Date(),
            executionPrice: trade.openPrice
          })

          console.log(`Pending order ${trade.tradeId} executed at ${trade.openPrice}`)
        } catch (error) {
          console.error(`Error executing pending order ${trade.tradeId}:`, error)
        }
      }
    }

    return executedTrades
  }

  // Apply swap to all open trades (called at rollover time)
  async applySwap() {
    const openTrades = await Trade.find({ status: 'OPEN' }).populate({
      path: 'tradingAccountId',
      populate: { path: 'accountTypeId' }
    })

    for (const trade of openTrades) {
      const charges = await Charges.getChargesForTrade(
        trade.userId,
        trade.symbol,
        trade.segment,
        trade.tradingAccountId?.accountTypeId?._id
      )

      const swapRate = trade.side === 'BUY' ? charges.swapLong : charges.swapShort
      let swapAmount = 0

      if (charges.swapType === 'POINTS') {
        swapAmount = trade.quantity * trade.contractSize * swapRate
      } else {
        // Percentage of trade value
        const tradeValue = trade.quantity * trade.contractSize * trade.openPrice
        swapAmount = tradeValue * (swapRate / 100)
      }

      trade.swap += swapAmount
      await trade.save()
    }
  }
}

export default new TradeEngine()
