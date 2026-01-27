import MasterTrader from '../models/MasterTrader.js'
import CopyFollower from '../models/CopyFollower.js'
import CopyTrade from '../models/CopyTrade.js'
import CopyCommission from '../models/CopyCommission.js'
import CopySettings from '../models/CopySettings.js'
import Trade from '../models/Trade.js'
import TradingAccount from '../models/TradingAccount.js'
import tradeEngine from './tradeEngine.js'

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
    for (let i = 0; i < followers.length; i += BATCH_SIZE) {
      const batch = followers.slice(i, i + BATCH_SIZE)
      console.log(`[CopyTrade] Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(followers.length/BATCH_SIZE)} (${batch.length} followers)`)
      
      // Process batch in parallel
      const batchResults = await Promise.all(batch.map(async (follower) => {
        try {
          return await this._copyTradeToSingleFollower(masterTrade, master, follower, tradingDay)
        } catch (error) {
          console.error(`[CopyTrade] Unexpected error for follower ${follower._id}:`, error)
          return {
            followerId: follower._id,
            status: 'FAILED',
            reason: error.message
          }
        }
      }))
      
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

        // Get master's account for balance/equity comparison
        const masterAccount = await TradingAccount.findById(master.tradingAccountId)
        const masterBalance = masterAccount ? masterAccount.balance : 0
        
        // Calculate master's true equity (balance + credit + unrealized P/L)
        let masterFloatingPnl = 0
        const masterOpenTrades = await Trade.find({ 
          tradingAccountId: master.tradingAccountId, 
          status: 'OPEN' 
        })
        for (const trade of masterOpenTrades) {
          // Use master trade's open price as approximation for current price
          // In real scenario, you'd get live prices
          masterFloatingPnl += trade.currentPnl || 0
        }
        const masterEquity = masterAccount ? (masterAccount.balance + (masterAccount.credit || 0) + masterFloatingPnl) : 0
        
        // Get follower's balance and calculate true equity (balance + credit + unrealized P/L)
        const followerBalance = followerAccount.balance
        let followerFloatingPnl = 0
        const followerOpenTrades = await Trade.find({ 
          tradingAccountId: followerAccountId, // Use resolved ID
          status: 'OPEN' 
        })
        for (const trade of followerOpenTrades) {
          followerFloatingPnl += trade.currentPnl || 0
        }
        const followerEquity = followerAccount.balance + (followerAccount.credit || 0) + followerFloatingPnl

        // BALANCE_BASED MODE: Lot = Master Lot × (Follower Balance / Master Balance)
        if (follower.copyMode === 'BALANCE_BASED') {
          console.log(`[CopyTrade] ========== BALANCE_BASED LOT CALCULATION ==========`)
          console.log(`[CopyTrade] Master Balance: $${masterBalance.toFixed(2)}`)
          console.log(`[CopyTrade] Follower Balance: $${followerBalance.toFixed(2)}`)
          console.log(`[CopyTrade] Master Lot Size: ${masterTrade.quantity}`)
          
          if (masterBalance > 0) {
            const ratio = followerBalance / masterBalance
            const calculatedLot = masterTrade.quantity * ratio
            const roundedLot = Math.round(calculatedLot * 100) / 100
            followerLotSize = Math.max(0.01, roundedLot)
            
            console.log(`[CopyTrade] Balance Ratio: ${ratio.toFixed(6)} (Follower/Master)`)
            console.log(`[CopyTrade] Calculated Lot (raw): ${calculatedLot.toFixed(6)}`)
            console.log(`[CopyTrade] Rounded Lot: ${roundedLot}`)
            console.log(`[CopyTrade] After Min 0.01 Applied: ${followerLotSize}`)
          } else {
            followerLotSize = masterTrade.quantity
            console.log(`[CopyTrade] WARNING: Master balance is 0, using master lot size: ${followerLotSize}`)
          }
          
          // Apply max lot size limit if set by user
          const beforeMaxLimit = followerLotSize
          if (follower.maxLotSize && follower.maxLotSize > 0 && followerLotSize > follower.maxLotSize) {
            followerLotSize = follower.maxLotSize
            console.log(`[CopyTrade] Max Lot Size Limit Applied: ${follower.maxLotSize} (was ${beforeMaxLimit})`)
          }
          
          console.log(`[CopyTrade] ========== FINAL LOT SIZE: ${followerLotSize} ==========`)
        }

        // EQUITY_BASED MODE: Lot = Master Lot × (Follower Equity / Master Equity)
        if (follower.copyMode === 'EQUITY_BASED') {
          const timestamp = new Date().toISOString()
          const brokerLotStep = 0.01 // Standard broker lot step
          
          console.log(`\n[CopyTrade CALC] ╔══════════════════════════════════════════════════════════════╗`)
          console.log(`[CopyTrade CALC] ║           EQUITY-BASED LOT CALCULATION                       ║`)
          console.log(`[CopyTrade CALC] ║           Timestamp: ${timestamp}            ║`)
          console.log(`[CopyTrade CALC] ╠══════════════════════════════════════════════════════════════╣`)
          
          // MASTER EQUITY SNAPSHOT
          console.log(`[CopyTrade CALC] ║ MASTER EQUITY SNAPSHOT:                                      ║`)
          console.log(`[CopyTrade CALC] ║   Account ID: ${master.tradingAccountId}`)
          console.log(`[CopyTrade CALC] ║   Balance:        $${(masterAccount?.balance || 0).toFixed(4)}`)
          console.log(`[CopyTrade CALC] ║   Credit:         $${(masterAccount?.credit || 0).toFixed(4)}`)
          console.log(`[CopyTrade CALC] ║   Floating P/L:   $${masterFloatingPnl.toFixed(4)} (from ${masterOpenTrades.length} open trades)`)
          console.log(`[CopyTrade CALC] ║   ─────────────────────────────────────`)
          console.log(`[CopyTrade CALC] ║   TOTAL EQUITY:   $${masterEquity.toFixed(4)}`)
          console.log(`[CopyTrade CALC] ╠══════════════════════════════════════════════════════════════╣`)
          
          // FOLLOWER EQUITY SNAPSHOT
          console.log(`[CopyTrade CALC] ║ FOLLOWER EQUITY SNAPSHOT:                                    ║`)
          console.log(`[CopyTrade CALC] ║   Account ID: ${followerAccountId}`)
          console.log(`[CopyTrade CALC] ║   Balance:        $${(followerAccount.balance || 0).toFixed(4)}`)
          console.log(`[CopyTrade CALC] ║   Credit:         $${(followerAccount.credit || 0).toFixed(4)}`)
          console.log(`[CopyTrade CALC] ║   Floating P/L:   $${followerFloatingPnl.toFixed(4)} (from ${followerOpenTrades.length} open trades)`)
          console.log(`[CopyTrade CALC] ║   ─────────────────────────────────────`)
          console.log(`[CopyTrade CALC] ║   TOTAL EQUITY:   $${followerEquity.toFixed(4)}`)
          console.log(`[CopyTrade CALC] ╠══════════════════════════════════════════════════════════════╣`)
          
          if (masterEquity > 0) {
            const ratio = followerEquity / masterEquity
            const calculatedLotRaw = masterTrade.quantity * ratio
            // Broker lot step rounding (standard is 0.01)
            const roundedLot = Math.round(calculatedLotRaw / brokerLotStep) * brokerLotStep
            const roundedLot2dp = Math.round(roundedLot * 100) / 100 // Ensure 2 decimal places
            const beforeMinApplied = roundedLot2dp
            followerLotSize = Math.max(0.01, roundedLot2dp)
            
            // LOT CALCULATION DETAILS
            console.log(`[CopyTrade CALC] ║ LOT CALCULATION:                                             ║`)
            console.log(`[CopyTrade CALC] ║   Master Lot Size:           ${masterTrade.quantity}`)
            console.log(`[CopyTrade CALC] ║   Equity Ratio:              ${ratio.toFixed(8)} (Follower/Master)`)
            console.log(`[CopyTrade CALC] ║   ─────────────────────────────────────`)
            console.log(`[CopyTrade CALC] ║   Calculated Lot (EXACT):    ${calculatedLotRaw.toFixed(8)}`)
            console.log(`[CopyTrade CALC] ║   Broker Lot Step:           ${brokerLotStep}`)
            console.log(`[CopyTrade CALC] ║   After Lot Step Rounding:   ${roundedLot2dp}`)
            console.log(`[CopyTrade CALC] ║   After Min 0.01 Applied:    ${followerLotSize}`)
            
            // Show rounding impact
            const roundingDiff = calculatedLotRaw - followerLotSize
            const roundingPct = (roundingDiff / calculatedLotRaw * 100).toFixed(2)
            console.log(`[CopyTrade CALC] ║   Rounding Impact:           ${roundingDiff.toFixed(8)} lots (${roundingPct}%)`)
            
            // CRITICAL: Detect if Math.max is masking a calculation failure
            if (beforeMinApplied < 0.01 && beforeMinApplied > 0) {
              console.log(`[CopyTrade CALC] ║   ⚠️  WARNING: Lot was ${beforeMinApplied}, forced to 0.01 by minimum!`)
            }
            if (calculatedLotRaw === 0 || isNaN(calculatedLotRaw)) {
              console.log(`[CopyTrade CALC] ║   ❌ ERROR: Calculated lot is 0 or NaN!`)
            }
          } else {
            followerLotSize = masterTrade.quantity
            console.log(`[CopyTrade CALC] ║   ⚠️  WARNING: Master equity is $${masterEquity}, using master lot: ${followerLotSize}`)
          }
          
          // Apply max lot size limit ONLY if user explicitly set a limit AND it's reasonable
          const beforeMaxLimit = followerLotSize
          if (follower.maxLotSize && follower.maxLotSize > 0 && followerLotSize > follower.maxLotSize) {
            followerLotSize = follower.maxLotSize
            console.log(`[CopyTrade CALC] ║   Max Lot Limit Applied:     ${follower.maxLotSize} (was ${beforeMaxLimit})`)
          }
          
          console.log(`[CopyTrade CALC] ╠══════════════════════════════════════════════════════════════╣`)
          console.log(`[CopyTrade CALC] ║ ✅ FINAL LOT SIZE: ${followerLotSize}`)
          console.log(`[CopyTrade CALC] ╚══════════════════════════════════════════════════════════════╝\n`)
        }

        // MULTIPLIER MODE (also handles LOT_MULTIPLIER for backward compatibility): Lot = Master Lot × Multiplier
        if (follower.copyMode === 'MULTIPLIER' || follower.copyMode === 'LOT_MULTIPLIER') {
          const multiplier = follower.multiplier || follower.copyValue || 1
          followerLotSize = masterTrade.quantity * multiplier
          // Round to 2 decimal places and ensure minimum 0.01
          followerLotSize = Math.max(0.01, Math.round(followerLotSize * 100) / 100)
          
          // Apply max lot size limit if set by user
          if (follower.maxLotSize && follower.maxLotSize > 0) {
            followerLotSize = Math.min(followerLotSize, follower.maxLotSize)
          }
          
          console.log(`[CopyTrade] MULTIPLIER: Multiplier=${multiplier}, MasterLot=${masterTrade.quantity}, FinalLot=${followerLotSize}`)
        }

        // AUTO MODE: Same as EQUITY_BASED - Lot = Master Lot × (Follower Equity / Master Equity)
        if (follower.copyMode === 'AUTO') {
          console.log(`[CopyTrade DEBUG] ========== AUTO (EQUITY_BASED) LOT CALCULATION ==========`)
          console.log(`[CopyTrade DEBUG] Master Equity: $${masterEquity.toFixed(2)}`)
          console.log(`[CopyTrade DEBUG] Follower Equity: $${followerEquity.toFixed(2)}`)
          console.log(`[CopyTrade DEBUG] Master Lot Size: ${masterTrade.quantity}`)
          
          if (masterEquity > 0) {
            const ratio = followerEquity / masterEquity
            const calculatedLot = masterTrade.quantity * ratio
            const roundedLot = Math.round(calculatedLot * 100) / 100
            const beforeMinApplied = roundedLot
            followerLotSize = Math.max(0.01, roundedLot)
            
            console.log(`[CopyTrade DEBUG] Equity Ratio: ${ratio.toFixed(6)} (Follower/Master)`)
            console.log(`[CopyTrade DEBUG] Calculated Lot (raw): ${calculatedLot.toFixed(6)}`)
            console.log(`[CopyTrade DEBUG] Rounded Lot: ${roundedLot}`)
            console.log(`[CopyTrade DEBUG] After Min 0.01 Applied: ${followerLotSize}`)
            
            if (beforeMinApplied < 0.01 && beforeMinApplied > 0) {
              console.log(`[CopyTrade WARNING] Lot was ${beforeMinApplied}, forced to 0.01 by Math.max!`)
            }
          } else {
            followerLotSize = masterTrade.quantity
            console.log(`[CopyTrade WARNING] Master equity is 0, using master lot size: ${followerLotSize}`)
          }
          
          // Apply max lot size limit ONLY if it would actually limit the trade
          const beforeMaxLimit = followerLotSize
          if (follower.maxLotSize && follower.maxLotSize > 0 && followerLotSize > follower.maxLotSize) {
            followerLotSize = follower.maxLotSize
            console.log(`[CopyTrade] Max Lot Size Limit Applied: ${follower.maxLotSize} (was ${beforeMaxLimit})`)
          }
          
          console.log(`[CopyTrade] ========== FINAL LOT SIZE: ${followerLotSize} ==========`)
        }

        // CRITICAL: Check if NO copyMode matched - this means lot size was never calculated
        const validCopyModes = ['BALANCE_BASED', 'EQUITY_BASED', 'MULTIPLIER', 'LOT_MULTIPLIER', 'AUTO', 'FIXED_LOT']
        if (!validCopyModes.includes(follower.copyMode)) {
          console.log(`[CopyTrade ERROR] INVALID copyMode: "${follower.copyMode}"! Valid modes: ${validCopyModes.join(', ')}`)
          console.log(`[CopyTrade ERROR] Lot size was NOT calculated properly, using fallback: ${followerLotSize}`)
        }
        
        console.log(`[CopyTrade DEBUG] ========== PRE-EXECUTION LOT SIZE: ${followerLotSize} ==========`)

        // Check margin
        const contractSize = tradeEngine.getContractSize(masterTrade.symbol)
        const marginRequired = tradeEngine.calculateMargin(
          followerLotSize,
          masterTrade.openPrice,
          followerAccount.leverage,
          contractSize
        )

        // Calculate used margin from existing open trades
        const existingTrades = await Trade.find({ 
          tradingAccountId: followerAccountId, // Use resolved ID
          status: 'OPEN' 
        })
        const usedMargin = existingTrades.reduce((sum, t) => sum + (t.marginUsed || 0), 0)
        const totalEquityForMargin = followerAccount.balance + (followerAccount.credit || 0)
        const freeMargin = totalEquityForMargin - usedMargin
        
        // MARGIN CHECK LOGGING
        console.log(`[CopyTrade MARGIN] ╔══════════════════════════════════════════════════════════════╗`)
        console.log(`[CopyTrade MARGIN] ║ MARGIN CHECK:                                                ║`)
        console.log(`[CopyTrade MARGIN] ║   Symbol:              ${masterTrade.symbol}`)
        console.log(`[CopyTrade MARGIN] ║   Lot Size:            ${followerLotSize}`)
        console.log(`[CopyTrade MARGIN] ║   Contract Size:       ${contractSize}`)
        console.log(`[CopyTrade MARGIN] ║   Leverage:            ${followerAccount.leverage}`)
        console.log(`[CopyTrade MARGIN] ║   Open Price:          ${masterTrade.openPrice}`)
        console.log(`[CopyTrade MARGIN] ║   ─────────────────────────────────────`)
        console.log(`[CopyTrade MARGIN] ║   Margin Required:     $${marginRequired.toFixed(4)}`)
        console.log(`[CopyTrade MARGIN] ║   Total Equity:        $${totalEquityForMargin.toFixed(4)}`)
        console.log(`[CopyTrade MARGIN] ║   Used Margin:         $${usedMargin.toFixed(4)} (${existingTrades.length} open trades)`)
        console.log(`[CopyTrade MARGIN] ║   Free Margin:         $${freeMargin.toFixed(4)}`)
        console.log(`[CopyTrade MARGIN] ║   Margin Available:    ${marginRequired <= freeMargin ? '✅ YES' : '❌ NO'}`)
        console.log(`[CopyTrade MARGIN] ╚══════════════════════════════════════════════════════════════╝`)
        
        if (marginRequired > freeMargin) {
          // Record failed copy trade
          await CopyTrade.create({
            masterTradeId: masterTrade._id,
            masterId: masterId,
            followerTradeId: null,
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
          followerTrade = await tradeEngine.openTrade(
            follower.followerId,
            followerAccountId, // Use the resolved ID from earlier
            masterTrade.symbol,
            masterTrade.segment,
            masterTrade.side,
            'MARKET',
            followerLotSize,
            masterTrade.openPrice, // Use master's price as bid
            masterTrade.openPrice, // Use master's price as ask
            masterTrade.stopLoss,
            masterTrade.takeProfit
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

        // Calculate equity ratio for storage
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
          // Store equity snapshots for audit/proof
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
  // Commission-based system: Follower gets full P/L, Master gets commission only on profit
  async closeFollowerTrades(masterTradeId, masterClosePrice) {
    console.log(`[CopyTrade] ========== CLOSING FOLLOWER TRADES ==========`)
    console.log(`[CopyTrade] Master Trade ID: ${masterTradeId}, Close Price: ${masterClosePrice}`)
    
    const copyTrades = await CopyTrade.find({
      masterTradeId,
      status: 'OPEN'
    })

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
        
        console.log(`[CopyTrade DEBUG] ========== P/L CALCULATION ==========`)
        console.log(`[CopyTrade DEBUG] Raw P/L from tradeEngine: $${rawPnl.toFixed(2)}`)
        console.log(`[CopyTrade DEBUG] Trade Close Price: ${result.trade.closePrice}`)
        console.log(`[CopyTrade DEBUG] Trade Open Price: ${result.trade.openPrice}`)
        console.log(`[CopyTrade DEBUG] Trade Quantity (executed): ${result.trade.quantity}`)
        
        // ========== 50-50 PROFIT/LOSS SHARING SYSTEM ==========
        // Both profit AND loss are shared 50-50 between master and follower
        // Profit: Master gets 50%, Follower keeps 50%
        // Loss: Master bears 50%, Follower bears 50%
        
        const master = await MasterTrader.findById(copyTrade.masterId)
        const sharePercentage = master?.approvedCommissionPercentage || 50
        
        // Calculate master's share (50% of P/L - can be positive or negative)
        const masterShare = rawPnl * (sharePercentage / 100)
        // Follower's share is the remaining 50%
        const followerShare = rawPnl - masterShare
        
        console.log(`[CopyTrade DEBUG] ========== 50-50 SHARING CALCULATION ==========`)
        console.log(`[CopyTrade DEBUG] Share Percentage: ${sharePercentage}%`)
        console.log(`[CopyTrade DEBUG] Raw P/L: $${rawPnl.toFixed(2)}`)
        console.log(`[CopyTrade DEBUG] Master Share (${sharePercentage}%): $${masterShare.toFixed(2)}`)
        console.log(`[CopyTrade DEBUG] Follower Share (${100 - sharePercentage}%): $${followerShare.toFixed(2)}`)
        
        const followerAccount = await TradingAccount.findById(copyTrade.followerAccountId)
        
        if (rawPnl > 0) {
          // PROFIT CASE: Deduct master's share from follower's balance
          if (followerAccount && master) {
            console.log(`[CopyTrade DEBUG] PROFIT - Follower Balance BEFORE: $${followerAccount.balance.toFixed(2)}`)
            
            if (followerAccount.balance >= masterShare) {
              followerAccount.balance -= masterShare
              await followerAccount.save()
              console.log(`[CopyTrade DEBUG] PROFIT - Follower Balance AFTER: $${followerAccount.balance.toFixed(2)}`)
              console.log(`[CopyTrade DEBUG] PROFIT - Master share deducted: $${masterShare.toFixed(2)}`)
              
              // Add to master's pending commission
              master.pendingCommission += masterShare
              master.totalCommissionEarned += masterShare
              await master.save()
              console.log(`[CopyTrade DEBUG] PROFIT - Master pendingCommission: $${master.pendingCommission.toFixed(2)}`)
            } else {
              console.log(`[CopyTrade WARNING] Insufficient balance for profit share!`)
            }
          }
        } else if (rawPnl < 0) {
          // LOSS CASE: Master bears 50% of the loss
          // tradeEngine.closeTrade already deducted full loss from follower
          // We need to refund 50% of the loss back to follower (master bears that portion)
          const lossRefund = Math.abs(masterShare) // masterShare is negative, so we take absolute
          
          if (followerAccount && master) {
            console.log(`[CopyTrade DEBUG] LOSS - Follower Balance BEFORE refund: $${followerAccount.balance.toFixed(2)}`)
            console.log(`[CopyTrade DEBUG] LOSS - Master bears 50% of loss: $${lossRefund.toFixed(2)}`)
            
            // Refund 50% of loss to follower (master bears this)
            followerAccount.balance += lossRefund
            await followerAccount.save()
            console.log(`[CopyTrade DEBUG] LOSS - Follower Balance AFTER refund: $${followerAccount.balance.toFixed(2)}`)
            
            // Deduct from master's pending commission (can go negative)
            master.pendingCommission -= lossRefund
            await master.save()
            console.log(`[CopyTrade DEBUG] LOSS - Master pendingCommission (after loss): $${master.pendingCommission.toFixed(2)}`)
          }
        }
        
        console.log(`[CopyTrade DEBUG] ========== FINAL VALUES ==========`)
        console.log(`[CopyTrade DEBUG] Raw P/L: $${rawPnl.toFixed(2)}`)
        console.log(`[CopyTrade DEBUG] Master Share: $${masterShare.toFixed(2)}`)
        console.log(`[CopyTrade DEBUG] Follower Net P/L: $${followerShare.toFixed(2)}`)

        // Update copy trade record
        copyTrade.masterClosePrice = masterClosePrice
        copyTrade.followerClosePrice = result.trade.closePrice
        copyTrade.rawPnl = rawPnl // Original full P/L
        copyTrade.followerPnl = followerShare // Follower's net P/L (50%)
        copyTrade.masterPnl = masterShare // Master's share (50% - can be negative on loss)
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
