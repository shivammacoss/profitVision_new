import MasterTrader from '../models/MasterTrader.js'
import CopyFollower from '../models/CopyFollower.js'
import CopyTrade from '../models/CopyTrade.js'
import CopyCommission from '../models/CopyCommission.js'
import CopySettings from '../models/CopySettings.js'
import Trade from '../models/Trade.js'
import TradingAccount from '../models/TradingAccount.js'
import Wallet from '../models/Wallet.js'
import tradeEngine from './tradeEngine.js'
import creditService from './creditService.js'
import CreditLedger from '../models/CreditLedger.js'

class CopyTradingEngine {
  constructor() {
    this.CONTRACT_SIZE = 100000
  }

  // Get today's date string
  getTradingDay() {
    return new Date().toISOString().split('T')[0]
  }

  // Calculate follower lot size based on copy mode
  // Note: BALANCE_BASED, EQUITY_BASED, and MULTIPLIER are calculated in copyTradeToFollowers
  // This function only handles FIXED_LOT mode
  calculateFollowerLotSize(masterLotSize, copyMode, copyValue, maxLotSize = 10) {
    let followerLot
    
    if (copyMode === 'FIXED_LOT') {
      // Use the fixed lot size specified by user
      followerLot = copyValue
      // Apply max lot size limit
      followerLot = Math.min(followerLot, maxLotSize)
      // Round to 2 decimal places
      return Math.round(followerLot * 100) / 100
    }
    
    // For BALANCE_BASED, EQUITY_BASED, MULTIPLIER - return master lot as placeholder
    // Actual calculation happens in copyTradeToFollowers with account data
    return masterLotSize
  }

  // Check if master has any open trades (for single trade restriction)
  async masterHasOpenTrade(masterId) {
    const master = await MasterTrader.findById(masterId)
    if (!master) return false
    
    const openTrades = await Trade.find({
      tradingAccountId: master.tradingAccountId,
      status: 'OPEN'
    })
    return openTrades.length > 0
  }

  // Copy master trade to all active followers
  // Uses batched processing to handle large numbers of followers reliably
  async copyTradeToFollowers(masterTrade, masterId) {
    console.log(`[CopyTrade] ========== STARTING COPY TO FOLLOWERS ==========`)
    console.log(`[CopyTrade] Master Trade ID: ${masterTrade._id}, Symbol: ${masterTrade.symbol}, Lot: ${masterTrade.quantity}`)
    
    const master = await MasterTrader.findById(masterId)
    if (!master || master.status !== 'ACTIVE') {
      console.log(`[CopyTrade] Master ${masterId} not active, skipping copy`)
      return []
    }

    // Get all active followers for this master - NO LIMIT
    const followers = await CopyFollower.find({
      masterId: masterId,
      status: 'ACTIVE'
    }).populate('followerAccountId')

    console.log(`[CopyTrade] Found ${followers.length} active followers for master ${masterId}`)
    console.log(`[CopyTrade] Symbol being copied: ${masterTrade.symbol}`)

    if (followers.length === 0) {
      console.log(`[CopyTrade] No active followers found for master ${masterId}`)
      return []
    }

    const tradingDay = this.getTradingDay()
    const allResults = []
    
    // Process followers in batches of 10 to avoid overwhelming the database
    // This ensures ALL followers get processed reliably
    const BATCH_SIZE = 10
    
    // Log all followers that will be processed
    console.log(`[CopyTrade] ╔══════════════════════════════════════════════════════════════╗`)
    console.log(`[CopyTrade] ║ FOLLOWER LIST - TOTAL: ${followers.length} followers                           ║`)
    console.log(`[CopyTrade] ╠══════════════════════════════════════════════════════════════╣`)
    followers.forEach((f, idx) => {
      const accountId = f.followerAccountId?._id || f.followerAccountId
      console.log(`[CopyTrade] ║ ${idx + 1}. Follower: ${f._id} | Account: ${accountId}`)
    })
    console.log(`[CopyTrade] ╚══════════════════════════════════════════════════════════════╝`)
    
    for (let i = 0; i < followers.length; i += BATCH_SIZE) {
      const batch = followers.slice(i, i + BATCH_SIZE)
      console.log(`[CopyTrade] Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(followers.length/BATCH_SIZE)} (${batch.length} followers)`)
      
      // Log each follower in this batch
      batch.forEach((f, idx) => {
        const accountId = f.followerAccountId?._id || f.followerAccountId
        console.log(`[CopyTrade]   -> Batch item ${idx + 1}: Follower ${f._id}, Account ${accountId}`)
      })
      
      // Process batch in parallel
      const batchResults = await Promise.all(batch.map(async (follower) => {
        const followerAccountId = follower.followerAccountId?._id || follower.followerAccountId
        console.log(`[CopyTrade] >>> STARTING copy for follower ${follower._id}, account ${followerAccountId}`)
        try {
          const result = await this._copyTradeToSingleFollower(masterTrade, master, follower, tradingDay)
          console.log(`[CopyTrade] <<< COMPLETED copy for follower ${follower._id}: ${result.status} - ${result.reason || 'OK'}`)
          return result
        } catch (error) {
          console.error(`[CopyTrade] <<< EXCEPTION for follower ${follower._id}:`, error.message)
          console.error(`[CopyTrade] Stack:`, error.stack)
          return {
            followerId: follower._id,
            status: 'FAILED',
            reason: error.message
          }
        }
      }))
      
      console.log(`[CopyTrade] Batch ${Math.floor(i/BATCH_SIZE) + 1} complete: ${batchResults.filter(r => r.status === 'SUCCESS').length} success, ${batchResults.filter(r => r.status === 'FAILED').length} failed`)
      allResults.push(...batchResults)
      
      // Small delay between batches to prevent database overload
      if (i + BATCH_SIZE < followers.length) {
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    }
    
    const successCount = allResults.filter(r => r.status === 'SUCCESS').length
    const failedCount = allResults.filter(r => r.status === 'FAILED').length
    const skippedCount = allResults.filter(r => r.status === 'SKIPPED').length
    
    console.log(`[CopyTrade] ========== COPY COMPLETE ==========`)
    console.log(`[CopyTrade] Total: ${followers.length}, Success: ${successCount}, Failed: ${failedCount}, Skipped: ${skippedCount}`)
    
    // Log failed followers for debugging
    const failedResults = allResults.filter(r => r.status === 'FAILED')
    if (failedResults.length > 0) {
      console.log(`[CopyTrade] Failed followers:`, failedResults.map(r => ({ id: r.followerId, reason: r.reason })))
      
      // RETRY MECHANISM: Retry failed copies once after a short delay
      console.log(`[CopyTrade] ========== RETRYING FAILED COPIES ==========`)
      await new Promise(resolve => setTimeout(resolve, 500)) // Wait 500ms before retry
      
      for (const failedResult of failedResults) {
        try {
          const follower = followers.find(f => f._id.toString() === failedResult.followerId.toString())
          if (follower && failedResult.retryable !== false) {
            console.log(`[CopyTrade] Retrying copy for follower ${follower._id}...`)
            const retryResult = await this._copyTradeToSingleFollower(masterTrade, master, follower, tradingDay, true)
            
            // Update result in allResults
            const idx = allResults.findIndex(r => r.followerId.toString() === failedResult.followerId.toString())
            if (idx !== -1 && retryResult.status === 'SUCCESS') {
              allResults[idx] = retryResult
              console.log(`[CopyTrade] Retry SUCCESS for follower ${follower._id}`)
            } else if (retryResult.status === 'FAILED') {
              console.log(`[CopyTrade] Retry FAILED for follower ${follower._id}: ${retryResult.reason}`)
            }
          }
        } catch (retryError) {
          console.error(`[CopyTrade] Retry error for follower ${failedResult.followerId}:`, retryError.message)
        }
      }
      
      // Recalculate counts after retry
      const finalSuccessCount = allResults.filter(r => r.status === 'SUCCESS').length
      const finalFailedCount = allResults.filter(r => r.status === 'FAILED').length
      console.log(`[CopyTrade] ========== AFTER RETRY: Success: ${finalSuccessCount}, Failed: ${finalFailedCount} ==========`)
    }
    
    // FINAL STATE VERIFICATION: Ensure trade count matches
    const masterTradeCount = 1 // Master opened 1 trade
    const followerTradeCount = allResults.filter(r => r.status === 'SUCCESS').length
    const expectedFollowerCount = followers.length
    
    console.log(`[CopyTrade] ╔══════════════════════════════════════════════════════════════╗`)
    console.log(`[CopyTrade] ║ FINAL STATE VERIFICATION                                     ║`)
    console.log(`[CopyTrade] ║   Master Trade Count:     ${masterTradeCount}                                      ║`)
    console.log(`[CopyTrade] ║   Expected Followers:     ${expectedFollowerCount}                                      ║`)
    console.log(`[CopyTrade] ║   Successful Copies:      ${followerTradeCount}                                      ║`)
    console.log(`[CopyTrade] ║   Sync Status:            ${followerTradeCount === expectedFollowerCount ? '✅ 100% SYNCED' : '❌ INCOMPLETE'}              ║`)
    console.log(`[CopyTrade] ╚══════════════════════════════════════════════════════════════╝`)
    
    if (followerTradeCount !== expectedFollowerCount) {
      console.log(`[CopyTrade] ⚠️ WARNING: Not all followers received the trade!`)
      console.log(`[CopyTrade] Missing: ${expectedFollowerCount - followerTradeCount} followers`)
      allResults.filter(r => r.status === 'FAILED').forEach(r => {
        console.log(`[CopyTrade]   - Follower ${r.followerId}: ${r.reason}`)
      })
    }
    
    return allResults
  }
  
  // Internal method to copy trade to a single follower
  async _copyTradeToSingleFollower(masterTrade, master, follower, tradingDay, isRetry = false) {
    const masterId = master._id
    const debugTimestamp = new Date().toISOString()
    
    try {
      console.log(`\n[CopyTrade DEBUG ${debugTimestamp}] ==================== COPY TRADE START ====================`)
      console.log(`[CopyTrade DEBUG] Follower ID: ${follower._id}`)
      console.log(`[CopyTrade DEBUG] Copy Mode: ${follower.copyMode} (type: ${typeof follower.copyMode})`)
      console.log(`[CopyTrade DEBUG] Copy Value: ${follower.copyValue}, Max Lot: ${follower.maxLotSize}`)
      console.log(`[CopyTrade DEBUG] Master Trade: ${masterTrade._id}, Symbol: ${masterTrade.symbol}`)
      console.log(`[CopyTrade DEBUG] Master Lot from DB: ${masterTrade.quantity} (type: ${typeof masterTrade.quantity})`)
      
      // CRITICAL: Check if copyMode is actually set
      if (!follower.copyMode) {
        console.log(`[CopyTrade WARNING] copyMode is NULL/UNDEFINED! Defaulting behavior may cause 0.01 lot`)
      }
      
      // Check if already copied for this specific follower (prevent duplicates per follower)
      const existingFollowerCopy = await CopyTrade.findOne({
        masterTradeId: masterTrade._id,
        followerId: follower._id
      })
      
      if (existingFollowerCopy) {
          console.log(`[CopyTrade] Trade already copied for follower ${follower._id}, skipping`)
          return {
            followerId: follower._id,
            status: 'SKIPPED',
            reason: 'Already copied'
          }
        }

        // Calculate follower lot size based on copy mode
        let followerLotSize = this.calculateFollowerLotSize(
          masterTrade.quantity,
          follower.copyMode,
          follower.copyValue,
          follower.maxLotSize
        )
        console.log(`[CopyTrade] Initial lot size from calculateFollowerLotSize: ${followerLotSize}`)

        // Validate follower account - handle both populated and non-populated cases
        const followerAccountId = follower.followerAccountId?._id || follower.followerAccountId
        const followerAccount = follower.followerAccountId?._id 
          ? follower.followerAccountId // Already populated
          : await TradingAccount.findById(followerAccountId)
        
        if (!followerAccount || followerAccount.status !== 'Active') {
          console.log(`[CopyTrade] Follower account not active or not found: ${followerAccountId}, status: ${followerAccount?.status}`)
          return {
            followerId: follower._id,
            status: 'FAILED',
            reason: `Account not active (status: ${followerAccount?.status || 'not found'})`
          }
        }
        
        console.log(`[CopyTrade] Follower account validated: ${followerAccount.accountId}, balance: ${followerAccount.balance}, credit: ${followerAccount.credit}`)

        // Get master's account for credit comparison
        const masterAccount = await TradingAccount.findById(master.tradingAccountId)
        
        // CREDIT-BASED: For Copy Trading accounts, Equity = Credit only (no manual deposits allowed)
        // Balance is always 0 for copy trading accounts, admin grants credit only
        const masterBalance = masterAccount?.balance || 0
        const masterCredit = masterAccount?.credit || 0
        const masterEquity = masterCredit // Equity = Credit only for copy trading
        
        const followerBalance = followerAccount.balance || 0
        const followerCredit = followerAccount.credit || 0
        const followerEquity = followerCredit // Equity = Credit only for copy trading
        
        // ========== CREDIT-BASED PROPORTIONAL LOT SIZING ==========
        // Formula: followerLot = masterLot × (followerCredit / masterCredit)
        // Copy Trading accounts use Credit only (admin-granted, no manual deposits)
        
        console.log(`[CopyTrade CREDIT] ========== CREDIT-BASED LOT SIZING ==========`)
        console.log(`[CopyTrade CREDIT] Master Balance: $${masterBalance.toFixed(2)} (ignored), Credit: $${masterCredit.toFixed(2)}, Equity: $${masterEquity.toFixed(2)}`)
        console.log(`[CopyTrade CREDIT] Follower Balance: $${followerBalance.toFixed(2)} (ignored), Credit: $${followerCredit.toFixed(2)}, Equity: $${followerEquity.toFixed(2)}`)

        // ========== PROPORTIONAL LOT CALCULATION (CREDIT-BASED) ==========
        // Formula: followerLot = masterLot × (followerCredit / masterCredit)
        // Broker rules: Min lot = 0.01, Max lot = 100, Lot step = 0.01, Round DOWN (floor)
        
        const MIN_LOT = 0.01
        const MAX_LOT = 100
        const LOT_STEP = 0.01
        
        const masterLot = masterTrade.quantity
        const equityRatio = masterEquity > 0 ? (followerEquity / masterEquity) : 0
        const calculatedLotRaw = masterLot * equityRatio
        
        // Round DOWN to nearest lot step (floor) - never round up
        const roundedLot = Math.floor(calculatedLotRaw / LOT_STEP) * LOT_STEP
        // Ensure 2 decimal places
        const roundedLot2dp = Math.round(roundedLot * 100) / 100
        // Apply minimum and maximum lot limits
        followerLotSize = Math.min(MAX_LOT, Math.max(MIN_LOT, roundedLot2dp))
        
        console.log(`[CopyTrade LOT] ╔══════════════════════════════════════════════════════════════╗`)
        console.log(`[CopyTrade LOT] ║     CREDIT-BASED PROPORTIONAL LOT CALCULATION                ║`)
        console.log(`[CopyTrade LOT] ╠══════════════════════════════════════════════════════════════╣`)
        console.log(`[CopyTrade LOT] ║   Formula: followerLot = masterLot × (followerCr/masterCr)  ║`)
        console.log(`[CopyTrade LOT] ╠══════════════════════════════════════════════════════════════╣`)
        console.log(`[CopyTrade LOT] ║   Master Lot:            ${masterLot}`)
        console.log(`[CopyTrade LOT] ║   Master Credit:         $${masterCredit.toFixed(2)} (Equity = Credit only)`)
        console.log(`[CopyTrade LOT] ║   Follower Credit:       $${followerCredit.toFixed(2)} (Equity = Credit only)`)
        console.log(`[CopyTrade LOT] ║   Credit Ratio:          ${equityRatio.toFixed(4)}x`)
        console.log(`[CopyTrade LOT] ║   ─────────────────────────────────────`)
        console.log(`[CopyTrade LOT] ║   Calculated Lot (raw):  ${calculatedLotRaw.toFixed(4)}`)
        console.log(`[CopyTrade LOT] ║   After Floor Rounding:  ${roundedLot2dp}`)
        console.log(`[CopyTrade LOT] ║   After Min/Max Applied: ${followerLotSize}`)
        console.log(`[CopyTrade LOT] ╠══════════════════════════════════════════════════════════════╣`)
        
        // Apply max lot size limit if set by user (additional user-defined limit)
        if (follower.maxLotSize && follower.maxLotSize > 0 && followerLotSize > follower.maxLotSize) {
          const beforeMaxLimit = followerLotSize
          followerLotSize = follower.maxLotSize
          console.log(`[CopyTrade LOT] ║   User Max Lot Applied:  ${follower.maxLotSize} (was ${beforeMaxLimit})`)
        }
        
        console.log(`[CopyTrade LOT] ║ ✅ FINAL LOT SIZE: ${followerLotSize}`)
        console.log(`[CopyTrade LOT] ╚══════════════════════════════════════════════════════════════╝`)
        console.log(`[CopyTrade LOT] Copy Mode: CREDIT-BASED PROPORTIONAL`)
        
        console.log(`[CopyTrade DEBUG] ========== PRE-EXECUTION LOT SIZE: ${followerLotSize} ==========`)

        // ========== CREDIT-BASED MARGIN CHECK ==========
        // Copy trading uses CREDIT only for margin (no manual deposits allowed)
        const contractSize = tradeEngine.getContractSize(masterTrade.symbol)
        const marginRequired = tradeEngine.calculateMargin(
          followerLotSize,
          masterTrade.openPrice,
          followerAccount.leverage,
          contractSize
        )

        // Calculate used margin from existing open copy trades on this account
        const existingTrades = await Trade.find({ 
          tradingAccountId: followerAccountId,
          status: 'OPEN',
          isCopyTrade: true
        })
        const usedMargin = existingTrades.reduce((sum, t) => sum + (t.marginUsed || 0), 0)
        
        // FREE MARGIN = Equity - Used Margin
        const freeMargin = followerEquity - usedMargin
        
        // MARGIN CHECK LOGGING
        console.log(`[CopyTrade] ╔══════════════════════════════════════════════════════════════╗`)
        console.log(`[CopyTrade] ║ CREDIT-BASED MARGIN CHECK                                    ║`)
        console.log(`[CopyTrade] ║   Symbol:              ${masterTrade.symbol}`)
        console.log(`[CopyTrade] ║   Lot Size:            ${followerLotSize}`)
        console.log(`[CopyTrade] ║   Contract Size:       ${contractSize}`)
        console.log(`[CopyTrade] ║   Leverage:            ${followerAccount.leverage}`)
        console.log(`[CopyTrade] ║   Open Price:          ${masterTrade.openPrice}`)
        console.log(`[CopyTrade] ║   ─────────────────────────────────────`)
        console.log(`[CopyTrade] ║   Margin Required:     $${marginRequired.toFixed(4)}`)
        console.log(`[CopyTrade] ║   Follower Credit:     $${followerCredit.toFixed(4)} (Credit = Equity for Copy Trading)`)
        console.log(`[CopyTrade] ║   Used Margin:         $${usedMargin.toFixed(4)} (${existingTrades.length} open copy trades)`)
        console.log(`[CopyTrade] ║   Free Margin:         $${freeMargin.toFixed(4)}`)
        console.log(`[CopyTrade] ║   Margin Available:    ${marginRequired <= freeMargin ? '✅ YES' : '❌ NO'}`)
        console.log(`[CopyTrade] ╚══════════════════════════════════════════════════════════════╝`)
        
        // CRITICAL: Block copy trading if credit is zero or depleted
        if (followerEquity <= 0) {
          console.log(`[CopyTrade] ❌ BLOCKED: Zero credit. Copy trading requires admin-granted credit.`)
          
          await CopyTrade.create({
            masterTradeId: masterTrade._id,
            masterId: masterId,
            followerTradeId: null,
            followerId: follower._id,
            followerUserId: follower.followerId,
            followerAccountId: followerAccountId,
            symbol: masterTrade.symbol,
            side: masterTrade.side,
            masterLotSize: masterTrade.quantity,
            followerLotSize: followerLotSize,
            copyMode: follower.copyMode,
            copyValue: follower.copyValue,
            masterOpenPrice: masterTrade.openPrice,
            followerOpenPrice: 0,
            status: 'FAILED',
            failureReason: 'Zero credit - copy trading stopped',
            tradingDay
          })
          
          return {
            followerId: follower._id,
            status: 'FAILED',
            reason: 'Zero credit. Copy trading stopped. Please contact admin to add credit.',
            creditDepleted: true
          }
        }
        
        if (marginRequired > freeMargin) {
          // Record failed copy trade
          await CopyTrade.create({
            masterTradeId: masterTrade._id,
            masterId: masterId,
            followerTradeId: null,
            followerId: follower._id,
            followerUserId: follower.followerId,
            followerAccountId: followerAccountId,
            symbol: masterTrade.symbol,
            side: masterTrade.side,
            masterLotSize: masterTrade.quantity,
            followerLotSize: followerLotSize,
            copyMode: follower.copyMode,
            copyValue: follower.copyValue,
            masterOpenPrice: masterTrade.openPrice,
            followerOpenPrice: 0,
            status: 'FAILED',
            failureReason: `Insufficient margin`,
            tradingDay
          })
          
          return {
            followerId: follower._id,
            status: 'FAILED',
            reason: `Insufficient margin. Required: $${marginRequired.toFixed(2)}, Available: $${freeMargin.toFixed(2)}`
          }
        }

        // Execute trade for follower - use the resolved followerAccountId
        console.log(`[CopyTrade DEBUG] ==================== EXECUTING TRADE ====================`)
        console.log(`[CopyTrade DEBUG] CALCULATED Lot Size to Send: ${followerLotSize}`)
        console.log(`[CopyTrade DEBUG] Account ID: ${followerAccountId}`)
        console.log(`[CopyTrade DEBUG] Symbol: ${masterTrade.symbol}, Side: ${masterTrade.side}`)
        console.log(`[CopyTrade DEBUG] Open Price: ${masterTrade.openPrice}`)
        
        let followerTrade
        try {
          // ========== COPY TRADE EXECUTION ==========
          // Pass isCopyTrade: true so tradeEngine knows to:
          // 1. Skip wallet/balance mutation on close (P/L handled by copyTradingEngine)
          // 2. Skip commission deduction from wallet
          // All P&L will be handled by copyTradingEngine using account balance
          followerTrade = await tradeEngine.openTrade(
            follower.followerId,
            followerAccountId,
            masterTrade.symbol,
            masterTrade.segment,
            masterTrade.side,
            'MARKET',
            followerLotSize,
            masterTrade.openPrice,
            masterTrade.openPrice,
            masterTrade.stopLoss,
            masterTrade.takeProfit,
            null, // userLeverage
            null, // entryPrice
            {
              isCopyTrade: true,
              masterTradeId: masterTrade._id,
              skipCommissionDeduction: true // Commission handled via credit
            }
          )
        } catch (tradeError) {
          console.log(`[CopyTrade ERROR] tradeEngine.openTrade failed for follower ${follower._id}: ${tradeError.message}`)
          return {
            followerId: follower._id,
            status: 'FAILED',
            reason: `Trade execution failed: ${tradeError.message}`
          }
        }

        // Check if trade was created successfully
        if (!followerTrade || !followerTrade._id) {
          console.log(`[CopyTrade ERROR] Trade execution returned null/undefined for follower ${follower._id}`)
          console.log(`[CopyTrade ERROR] followerTrade:`, JSON.stringify(followerTrade))
          return {
            followerId: follower._id,
            status: 'FAILED',
            reason: 'Trade execution failed - no trade returned'
          }
        }

        console.log(`[CopyTrade DEBUG] Trade created successfully: ${followerTrade._id}`)

        // Calculate equity ratio for storage (using equity-based system)
        const equityRatioForStorage = masterEquity > 0 ? followerEquity / masterEquity : 0
        const calculatedLotBeforeRounding = masterTrade.quantity * equityRatioForStorage

        // Record successful copy trade with equity snapshots
        await CopyTrade.create({
          masterTradeId: masterTrade._id,
          masterId: masterId,
          followerTradeId: followerTrade._id,
          followerId: follower._id,
          followerUserId: follower.followerId,
          followerAccountId: followerAccountId, // Use the resolved ID
          symbol: masterTrade.symbol,
          side: masterTrade.side,
          masterLotSize: masterTrade.quantity,
          followerLotSize: followerLotSize,
          copyMode: follower.copyMode,
          copyValue: follower.copyValue,
          masterOpenPrice: masterTrade.openPrice,
          followerOpenPrice: followerTrade.openPrice,
          // Store equity snapshots for audit/proof (equity-based system)
          masterEquitySnapshot: masterEquity,
          followerEquitySnapshot: followerEquity,
          calculatedLotBeforeRounding: calculatedLotBeforeRounding,
          equityRatio: equityRatioForStorage,
          status: 'OPEN',
          tradingDay
        })

        // Update follower stats using atomic update to avoid parallel save errors
        await CopyFollower.findByIdAndUpdate(follower._id, {
          $inc: {
            'stats.totalCopiedTrades': 1,
            'stats.activeCopiedTrades': 1
          }
        })

        // Update master stats using atomic update to avoid parallel save errors
        await MasterTrader.findByIdAndUpdate(masterId, {
          $inc: {
            'stats.totalCopiedVolume': followerLotSize
          }
        })

        console.log(`[CopyTrade DEBUG] ==================== TRADE EXECUTED ====================`)
        console.log(`[CopyTrade DEBUG] EXECUTED Trade ID: ${followerTrade._id}`)
        console.log(`[CopyTrade DEBUG] EXECUTED Lot Size: ${followerTrade.quantity}`)
        console.log(`[CopyTrade DEBUG] EXECUTED Open Price: ${followerTrade.openPrice}`)
        console.log(`[CopyTrade DEBUG] CALCULATED vs EXECUTED Lot: ${followerLotSize} vs ${followerTrade.quantity}`)
        
        // VERIFY: Check if calculated matches executed
        if (followerLotSize !== followerTrade.quantity) {
          console.log(`[CopyTrade WARNING] LOT SIZE MISMATCH! Calculated: ${followerLotSize}, Executed: ${followerTrade.quantity}`)
        }
        
        return {
          followerId: follower._id,
          status: 'SUCCESS',
          followerTradeId: followerTrade._id,
          lotSize: followerLotSize
        }

    } catch (error) {
      console.error(`[CopyTrade] Error copying trade to follower ${follower._id}:`, error)
      return {
        followerId: follower._id,
        status: 'FAILED',
        reason: error.message,
        retryable: true // Mark as retryable for the retry mechanism
      }
    }
  }

  // Mirror SL/TP modification to all follower trades
  async mirrorSlTpModification(masterTradeId, newSl, newTp) {
    console.log(`[CopyTrade] Mirroring SL/TP to followers: masterTradeId=${masterTradeId}, SL=${newSl}, TP=${newTp}`)
    
    const copyTrades = await CopyTrade.find({
      masterTradeId,
      status: 'OPEN'
    })

    console.log(`[CopyTrade] Found ${copyTrades.length} follower trades to update SL/TP`)

    if (copyTrades.length === 0) return []

    // Process ALL in parallel
    const results = await Promise.all(copyTrades.map(async (copyTrade) => {
      try {
        await tradeEngine.modifyTrade(copyTrade.followerTradeId, newSl, newTp)
        return {
          copyTradeId: copyTrade._id,
          status: 'SUCCESS'
        }
      } catch (error) {
        console.error(`Error mirroring SL/TP to copy trade ${copyTrade._id}:`, error)
        return {
          copyTradeId: copyTrade._id,
          status: 'FAILED',
          reason: error.message
        }
      }
    }))

    console.log(`[CopyTrade] SL/TP mirror complete: ${results.filter(r => r.status === 'SUCCESS').length}/${copyTrades.length} success`)
    return results
  }

  // Close all follower trades when master closes
  // ========== CREDIT-BASED P/L SYSTEM ==========
  // LOSS: Deducted from credit_balance ONLY (wallet_balance untouched)
  // PROFIT: Split 50/50 - follower's share goes to wallet_balance, master gets 50%
  // Uses atomic update to prevent duplicate processing
  async closeFollowerTrades(masterTradeId, masterClosePrice) {
    console.log(`[CopyTrade CREDIT] ========== CLOSING FOLLOWER TRADES (CREDIT-BASED) ==========`)
    console.log(`[CopyTrade CREDIT] Master Trade ID: ${masterTradeId}, Close Price: ${masterClosePrice}`)
    
    // Use findOneAndUpdate with status check to atomically claim trades for processing
    // This prevents duplicate processing if called multiple times
    const copyTrades = []
    let claimedTrade
    
    do {
      // Atomically find and mark a trade as CLOSING to prevent duplicate processing
      claimedTrade = await CopyTrade.findOneAndUpdate(
        { masterTradeId, status: 'OPEN' },
        { $set: { status: 'CLOSING' } },
        { new: true }
      )
      if (claimedTrade) {
        copyTrades.push(claimedTrade)
      }
    } while (claimedTrade)

    console.log(`[CopyTrade] Found ${copyTrades.length} open copy trades to close`)
    
    if (copyTrades.length === 0) return []

    const results = []
    
    // Process sequentially to avoid race conditions
    for (const copyTrade of copyTrades) {
      try {
        console.log(`\n[CopyTrade DEBUG] ==================== CLOSING TRADE ${copyTrade._id} ====================`)
        console.log(`[CopyTrade DEBUG] Follower Trade ID: ${copyTrade.followerTradeId}`)
        console.log(`[CopyTrade DEBUG] Follower Lot Size (from DB): ${copyTrade.followerLotSize}`)
        console.log(`[CopyTrade DEBUG] Master Lot Size (from DB): ${copyTrade.masterLotSize}`)
        
        // Check if the follower trade is still open before trying to close
        const followerTrade = await Trade.findById(copyTrade.followerTradeId)
        if (!followerTrade) {
          console.log(`[CopyTrade WARNING] Follower trade ${copyTrade.followerTradeId} not found, marking copy trade as closed`)
          copyTrade.status = 'CLOSED'
          copyTrade.closedAt = new Date()
          copyTrade.failureReason = 'Follower trade not found'
          await copyTrade.save()
          results.push({ copyTradeId: copyTrade._id, status: 'SKIPPED', reason: 'Trade not found' })
          continue
        }
        
        if (followerTrade.status !== 'OPEN') {
          console.log(`[CopyTrade WARNING] Follower trade ${copyTrade.followerTradeId} is already ${followerTrade.status}, skipping close`)
          // Update copy trade record to match
          copyTrade.status = 'CLOSED'
          copyTrade.closedAt = new Date()
          copyTrade.followerClosePrice = followerTrade.closePrice || masterClosePrice
          copyTrade.rawPnl = followerTrade.realizedPnl || 0
          copyTrade.followerPnl = followerTrade.realizedPnl || 0
          copyTrade.masterPnl = 0
          await copyTrade.save()
          results.push({ copyTradeId: copyTrade._id, status: 'SKIPPED', reason: `Trade already ${followerTrade.status}` })
          continue
        }
        
        // Close the follower trade - this calculates the full P/L
        // tradeEngine.closeTrade already adds full P/L to follower's account
        let result
        try {
          result = await tradeEngine.closeTrade(
            copyTrade.followerTradeId,
            masterClosePrice,
            masterClosePrice,
            'USER'
          )
        } catch (closeError) {
          // Handle race condition - trade might have been closed by another process
          if (closeError.message === 'Trade is not open') {
            console.log(`[CopyTrade WARNING] Trade ${copyTrade.followerTradeId} was already closed (race condition), updating copy trade record`)
            const closedTrade = await Trade.findById(copyTrade.followerTradeId)
            copyTrade.status = 'CLOSED'
            copyTrade.closedAt = new Date()
            copyTrade.followerClosePrice = closedTrade?.closePrice || masterClosePrice
            copyTrade.rawPnl = closedTrade?.realizedPnl || 0
            copyTrade.followerPnl = closedTrade?.realizedPnl || 0
            copyTrade.masterPnl = 0
            await copyTrade.save()
            results.push({ copyTradeId: copyTrade._id, status: 'SKIPPED', reason: 'Trade already closed (race condition)' })
            continue
          }
          throw closeError // Re-throw other errors
        }

        const rawPnl = result.realizedPnl
        
        console.log(`[CopyTrade CREDIT] ========== CREDIT-BASED P/L CALCULATION ==========`)
        console.log(`[CopyTrade CREDIT] Raw P/L from tradeEngine: $${rawPnl.toFixed(2)}`)
        console.log(`[CopyTrade CREDIT] Trade Close Price: ${result.trade.closePrice}`)
        console.log(`[CopyTrade CREDIT] Trade Open Price: ${result.trade.openPrice}`)
        console.log(`[CopyTrade CREDIT] Trade Quantity (executed): ${result.trade.quantity}`)
        
        // CRITICAL: Check if commission was already applied (prevent double deduction)
        if (copyTrade.commissionApplied) {
          console.log(`[CopyTrade CREDIT WARNING] Commission already applied for copy trade ${copyTrade._id}, skipping`)
          copyTrade.status = 'CLOSED'
          await copyTrade.save()
          results.push({ copyTradeId: copyTrade._id, status: 'SKIPPED', reason: 'Commission already applied' })
          continue
        }
        
        // ========== EQUITY-BASED P/L SYSTEM ==========
        // LOSS: Deducted from account BALANCE (equity) directly
        // PROFIT: Split between follower and master based on sharePercentage
        // - Follower's share added to account balance
        // - Master's share goes to pendingCommission
        
        const master = await MasterTrader.findById(copyTrade.masterId)
        const sharePercentage = master?.approvedCommissionPercentage || 50
        
        const followerAccount = await TradingAccount.findById(copyTrade.followerAccountId)
        if (!followerAccount) {
          console.log(`[CopyTrade] ERROR: Follower account not found: ${copyTrade.followerAccountId}`)
          results.push({ copyTradeId: copyTrade._id, status: 'FAILED', reason: 'Follower account not found' })
          continue
        }
        
        // Get follower's wallet for profit crediting
        let followerWallet = await Wallet.findOne({ userId: copyTrade.followerUserId })
        if (!followerWallet) {
          followerWallet = await Wallet.create({ userId: copyTrade.followerUserId, balance: 0 })
        }
        
        let masterShare = 0
        let followerShare = 0
        let creditChange = 0
        let walletCredited = 0
        
        const creditBefore = followerAccount.credit || 0
        const walletBefore = followerWallet.balance || 0
        
        console.log(`[CopyTrade] ========== CREDIT-BASED SETTLEMENT ==========`)
        console.log(`[CopyTrade] Share Percentage (Master): ${sharePercentage}%`)
        console.log(`[CopyTrade] Raw P/L: $${rawPnl.toFixed(2)}`)
        console.log(`[CopyTrade] Follower Credit BEFORE: $${creditBefore.toFixed(2)}`)
        console.log(`[CopyTrade] Follower Wallet BEFORE: $${walletBefore.toFixed(2)}`)
        
        if (rawPnl < 0) {
          // ========== LOSS CASE ==========
          // Loss is deducted from CREDIT only (not wallet)
          // Master does NOT share in losses - follower bears full loss
          // Credit cannot go below 0
          
          const lossAmount = Math.abs(rawPnl)
          
          console.log(`[CopyTrade] ========== LOSS HANDLING ==========`)
          console.log(`[CopyTrade] Loss Amount: $${lossAmount.toFixed(2)}`)
          console.log(`[CopyTrade] RULE: Loss deducted from CREDIT only (capped at 0)`)
          
          // Deduct loss from CREDIT (cap at 0, no negative credit)
          const newCredit = Math.max(0, creditBefore - lossAmount)
          followerAccount.credit = newCredit
          await followerAccount.save()
          creditChange = newCredit - creditBefore // Will be negative
          
          console.log(`[CopyTrade] Credit Before: $${creditBefore.toFixed(2)}`)
          console.log(`[CopyTrade] Loss Deducted: $${lossAmount.toFixed(2)}`)
          console.log(`[CopyTrade] Credit After: $${newCredit.toFixed(2)}`)
          console.log(`[CopyTrade] Wallet: $${walletBefore.toFixed(2)} (UNCHANGED)`)
          
          // Check if credit is depleted - auto-stop copy trading
          if (newCredit <= 0) {
            console.log(`[CopyTrade] ⚠️ Credit depleted! Auto-stopping copy trading.`)
            // Update follower status to STOPPED
            await CopyFollower.updateOne(
              { followerAccountId: copyTrade.followerAccountId },
              { status: 'STOPPED', stoppedReason: 'Credit depleted from trade loss' }
            )
          }
          
          // For loss, master doesn't get anything, follower bears full loss from credit
          masterShare = 0
          followerShare = rawPnl // Negative value
          
        } else if (rawPnl > 0) {
          // ========== PROFIT CASE ==========
          // Profit is split 50/50 between follower and master
          // - Follower's share goes to MAIN WALLET (withdrawable)
          // - Master's share goes to pendingCommission
          // - Credit is NOT increased (it's for exposure only)
          
          masterShare = rawPnl * (sharePercentage / 100)
          followerShare = rawPnl - masterShare
          
          console.log(`[CopyTrade] ========== PROFIT HANDLING ==========`)
          console.log(`[CopyTrade] Total Profit: $${rawPnl.toFixed(2)}`)
          console.log(`[CopyTrade] Master Share (${sharePercentage}%): $${masterShare.toFixed(2)}`)
          console.log(`[CopyTrade] Follower Share (${100 - sharePercentage}%): $${followerShare.toFixed(2)}`)
          
          // Credit follower's share to MAIN WALLET (not credit)
          followerWallet.balance = walletBefore + followerShare
          await followerWallet.save()
          walletCredited = followerShare
          
          console.log(`[CopyTrade] Wallet Before: $${walletBefore.toFixed(2)}`)
          console.log(`[CopyTrade] Follower Share to Wallet: $${followerShare.toFixed(2)}`)
          console.log(`[CopyTrade] Wallet After: $${followerWallet.balance.toFixed(2)}`)
          console.log(`[CopyTrade] Credit: $${creditBefore.toFixed(2)} (UNCHANGED)`)
          
          // Credit master's share
          if (master) {
            master.pendingCommission = (master.pendingCommission || 0) + masterShare
            master.totalCommissionEarned = (master.totalCommissionEarned || 0) + masterShare
            await master.save()
            console.log(`[CopyTrade] Master Credited: $${masterShare.toFixed(2)}`)
            console.log(`[CopyTrade] Master Pending Commission: $${master.pendingCommission.toFixed(2)}`)
          }
        }
        
        // Get final credit for tracking
        const finalAccount = await TradingAccount.findById(copyTrade.followerAccountId)
        const creditAfter = finalAccount?.credit || 0
        
        console.log(`[CopyTrade] ========== FINAL SETTLEMENT ==========`)
        console.log(`[CopyTrade] Raw P/L: $${rawPnl.toFixed(2)}`)
        console.log(`[CopyTrade] Master Share: $${masterShare.toFixed(2)}`)
        console.log(`[CopyTrade] Follower Share: $${followerShare.toFixed(2)}`)
        console.log(`[CopyTrade] Credit Change: $${creditChange.toFixed(2)}`)
        console.log(`[CopyTrade] Wallet Credited: $${walletCredited.toFixed(2)}`)
        console.log(`[CopyTrade] Credit After: $${creditAfter.toFixed(2)}`)

        // Update copy trade record
        copyTrade.masterClosePrice = masterClosePrice
        copyTrade.followerClosePrice = result.trade.closePrice
        copyTrade.rawPnl = rawPnl
        copyTrade.followerPnl = followerShare
        copyTrade.masterPnl = masterShare
        copyTrade.creditBefore = creditBefore
        copyTrade.creditAfter = creditAfter
        copyTrade.creditChange = creditChange
        copyTrade.walletCredited = walletCredited
        copyTrade.status = 'CLOSED'
        copyTrade.closedAt = new Date()
        copyTrade.commissionApplied = true
        await copyTrade.save()

        // Update follower stats with their net P/L (50% share)
        await CopyFollower.findByIdAndUpdate(copyTrade.followerId, {
          $inc: {
            'stats.activeCopiedTrades': -1,
            'stats.totalProfit': followerShare >= 0 ? followerShare : 0,
            'stats.totalLoss': followerShare < 0 ? Math.abs(followerShare) : 0,
            'stats.totalCommissionPaid': masterShare > 0 ? masterShare : 0,
            'dailyProfit': followerShare >= 0 ? followerShare : 0,
            'dailyLoss': followerShare < 0 ? Math.abs(followerShare) : 0
          }
        })

        results.push({
          copyTradeId: copyTrade._id,
          status: 'SUCCESS',
          rawPnl: rawPnl,
          followerPnl: followerShare,
          masterShare: masterShare
        })

      } catch (error) {
        console.error(`[CopyTrade] Error closing copy trade ${copyTrade._id}:`, error)
        results.push({
          copyTradeId: copyTrade._id,
          status: 'FAILED',
          reason: error.message
        })
      }
    }

    const successCount = results.filter(r => r.status === 'SUCCESS').length
    console.log(`[CopyTrade] ========== CLOSE COMPLETE: ${successCount}/${copyTrades.length} success ==========`)
    return results
  }

  // Apply commission immediately after a trade closes (for profitable trades only)
  // Commission-based system: Master gets % of profit, Follower keeps the rest
  // On loss: No commission, Follower bears full loss
  async _applyCommissionForTrade(copyTrade, pnl) {
    // No commission on losing trades - follower bears full loss
    if (pnl <= 0) {
      console.log(`[CopyTrade] No commission on loss. PnL: $${pnl.toFixed(2)}`)
      return null
    }

    const master = await MasterTrader.findById(copyTrade.masterId)
    if (!master) return null

    // Commission percentage from master's approved rate (default 50%)
    const commissionPercentage = master.approvedCommissionPercentage || 50
    const adminSharePercentage = master.adminSharePercentage || 0

    // Calculate commission on PROFIT only
    const totalCommission = pnl * (commissionPercentage / 100)
    const adminShare = totalCommission * (adminSharePercentage / 100)
    const masterShare = totalCommission - adminShare

    console.log(`[CopyTrade] Commission calculation: PnL=$${pnl.toFixed(2)}, Rate=${commissionPercentage}%, Commission=$${totalCommission.toFixed(2)}`)

    // Deduct commission from follower account
    const followerAccount = await TradingAccount.findById(copyTrade.followerAccountId)
    if (followerAccount && followerAccount.balance >= totalCommission) {
      followerAccount.balance -= totalCommission
      await followerAccount.save()

      // Create commission record
      const commission = await CopyCommission.create({
        masterId: copyTrade.masterId,
        followerId: copyTrade.followerId,
        followerUserId: copyTrade.followerUserId,
        followerAccountId: copyTrade.followerAccountId,
        tradingDay: this.getTradingDay(),
        dailyProfit: pnl,
        commissionPercentage,
        totalCommission,
        adminShare,
        masterShare,
        adminSharePercentage,
        status: 'DEDUCTED',
        deductedAt: new Date(),
        tradeId: copyTrade._id
      })

      // Update master pending commission
      master.pendingCommission += masterShare
      master.totalCommissionEarned += masterShare
      await master.save()

      // Update admin pool if admin share exists
      if (adminShare > 0) {
        const settings = await CopySettings.getSettings()
        if (settings) {
          settings.adminCopyPool += adminShare
          await settings.save()
        }
      }

      // Update follower stats
      await CopyFollower.findByIdAndUpdate(copyTrade.followerId, {
        $inc: { 'stats.totalCommissionPaid': totalCommission }
      })

      // Mark trade as commission applied
      copyTrade.commissionApplied = true
      await copyTrade.save()

      console.log(`[CopyTrade] Commission applied: $${totalCommission.toFixed(2)} (Master: $${masterShare.toFixed(2)}, Admin: $${adminShare.toFixed(2)})`)
      return commission
    }

    console.log(`[CopyTrade] Insufficient balance for commission. Balance: $${followerAccount?.balance || 0}, Required: $${totalCommission.toFixed(2)}`)
    return null
  }

  // Calculate and apply daily commission (run at end of day)
  async calculateDailyCommission(tradingDay = null) {
    const day = tradingDay || this.getTradingDay()
    
    // Get all closed copy trades for the day that haven't had commission applied
    const copyTrades = await CopyTrade.find({
      tradingDay: day,
      status: 'CLOSED',
      commissionApplied: false
    })

    // Group by master and follower
    const groupedTrades = {}
    for (const trade of copyTrades) {
      const key = `${trade.masterId}_${trade.followerId}`
      if (!groupedTrades[key]) {
        groupedTrades[key] = {
          masterId: trade.masterId,
          followerId: trade.followerId,
          followerUserId: trade.followerUserId,
          followerAccountId: trade.followerAccountId,
          trades: [],
          totalPnl: 0
        }
      }
      groupedTrades[key].trades.push(trade)
      groupedTrades[key].totalPnl += trade.followerPnl
    }

    const commissionResults = []

    for (const key in groupedTrades) {
      const group = groupedTrades[key]
      
      // Only apply commission on profitable days
      if (group.totalPnl <= 0) {
        // Mark trades as processed (no commission)
        for (const trade of group.trades) {
          trade.commissionApplied = true
          await trade.save()
        }
        continue
      }

      try {
        // Get master's commission percentage
        // FIXED RULE: 50% to master, 50% stays with follower, 0% to admin
        const master = await MasterTrader.findById(group.masterId)
        if (!master) continue

        // Commission is FIXED at 50% - master.approvedCommissionPercentage should always be 50
        // If for some reason it's not set, default to 50%
        const commissionPercentage = master.approvedCommissionPercentage || 50
        // Admin share is 0% - all commission goes to master
        const adminSharePercentage = master.adminSharePercentage || 0

        // Calculate commission: 50% of profit goes to master, 50% stays with follower
        const totalCommission = group.totalPnl * (commissionPercentage / 100)
        const adminShare = totalCommission * (adminSharePercentage / 100) // Should be 0
        const masterShare = totalCommission - adminShare // Should equal totalCommission

        // Deduct from follower account
        const followerAccount = await TradingAccount.findById(group.followerAccountId)
        if (followerAccount && followerAccount.balance >= totalCommission) {
          followerAccount.balance -= totalCommission
          await followerAccount.save()

          // Create commission record
          const commission = await CopyCommission.create({
            masterId: group.masterId,
            followerId: group.followerId,
            followerUserId: group.followerUserId,
            followerAccountId: group.followerAccountId,
            tradingDay: day,
            dailyProfit: group.totalPnl,
            commissionPercentage,
            totalCommission,
            adminShare,
            masterShare,
            adminSharePercentage,
            status: 'DEDUCTED',
            deductedAt: new Date()
          })

          // Update master pending commission
          master.pendingCommission += masterShare
          master.totalCommissionEarned += masterShare
          await master.save()

          // Update admin pool
          const settings = await CopySettings.getSettings()
          settings.adminCopyPool += adminShare
          await settings.save()

          // Update follower stats
          const follower = await CopyFollower.findById(group.followerId)
          if (follower) {
            follower.stats.totalCommissionPaid += totalCommission
            await follower.save()
          }

          // Mark trades as processed
          for (const trade of group.trades) {
            trade.commissionApplied = true
            await trade.save()
          }

          commissionResults.push({
            masterId: group.masterId,
            followerId: group.followerId,
            dailyProfit: group.totalPnl,
            commission: totalCommission,
            status: 'SUCCESS'
          })

        } else {
          // Insufficient balance for commission
          await CopyCommission.create({
            masterId: group.masterId,
            followerId: group.followerId,
            followerUserId: group.followerUserId,
            followerAccountId: group.followerAccountId,
            tradingDay: day,
            dailyProfit: group.totalPnl,
            commissionPercentage,
            totalCommission,
            adminShare,
            masterShare,
            adminSharePercentage,
            status: 'FAILED',
            deductionError: 'Insufficient balance'
          })

          commissionResults.push({
            masterId: group.masterId,
            followerId: group.followerId,
            status: 'FAILED',
            reason: 'Insufficient balance'
          })
        }

      } catch (error) {
        console.error(`Error calculating commission for ${key}:`, error)
        commissionResults.push({
          masterId: group.masterId,
          followerId: group.followerId,
          status: 'FAILED',
          reason: error.message
        })
      }
    }

    return commissionResults
  }

  // Process master commission withdrawal
  async processMasterWithdrawal(masterId, amount, adminId) {
    const master = await MasterTrader.findById(masterId)
    if (!master) throw new Error('Master not found')

    if (amount > master.pendingCommission) {
      throw new Error(`Insufficient pending commission. Available: $${master.pendingCommission.toFixed(2)}`)
    }

    const settings = await CopySettings.getSettings()
    if (amount < settings.commissionSettings.minPayoutAmount) {
      throw new Error(`Minimum payout amount is $${settings.commissionSettings.minPayoutAmount}`)
    }

    // Get master's trading account
    const tradingAccount = await TradingAccount.findById(master.tradingAccountId)
    if (!tradingAccount) throw new Error('Master trading account not found')

    // Transfer commission to master
    tradingAccount.balance += amount
    await tradingAccount.save()

    // Update master records
    master.pendingCommission -= amount
    master.totalCommissionWithdrawn += amount
    await master.save()

    return {
      amount,
      newPendingCommission: master.pendingCommission,
      newAccountBalance: tradingAccount.balance
    }
  }

  // Close all follower trades when master is banned
  async closeAllMasterFollowerTrades(masterId, currentPrices) {
    const copyTrades = await CopyTrade.find({
      masterId,
      status: 'OPEN'
    })

    const results = []

    for (const copyTrade of copyTrades) {
      try {
        const price = currentPrices[copyTrade.symbol]
        if (!price) continue

        const result = await tradeEngine.closeTrade(
          copyTrade.followerTradeId,
          price.bid,
          price.ask,
          'ADMIN'
        )

        copyTrade.status = 'CLOSED'
        copyTrade.followerClosePrice = result.trade.closePrice
        copyTrade.followerPnl = result.realizedPnl
        copyTrade.closedAt = new Date()
        await copyTrade.save()

        results.push({
          copyTradeId: copyTrade._id,
          status: 'SUCCESS',
          pnl: result.realizedPnl
        })

      } catch (error) {
        results.push({
          copyTradeId: copyTrade._id,
          status: 'FAILED',
          reason: error.message
        })
      }
    }

    return results
  }
}

export default new CopyTradingEngine()
