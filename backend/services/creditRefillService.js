import mongoose from 'mongoose'
import CopyFollower from '../models/CopyFollower.js'
import TradingAccount from '../models/TradingAccount.js'
import Wallet from '../models/Wallet.js'
import CreditLedger from '../models/CreditLedger.js'
import CreditRefillLedger from '../models/CreditRefillLedger.js'

/**
 * CreditRefillService - Production-grade auto-refill system for copy trading
 * 
 * CORE BUSINESS RULES:
 * 1. Every copy trading account must maintain minimum credit balance of 1000
 * 2. If trading losses reduce credit below 1000, system tracks deficit
 * 3. Future profits auto-refill the missing credit amount
 * 4. After credit reaches 1000, profits go directly to wallet
 * 5. This logic applies ONLY to copy trading accounts
 */
class CreditRefillService {
  constructor() {
    this.DEFAULT_MINIMUM_CREDIT = 1000
  }

  /**
   * Process a trade close and handle credit/profit distribution
   */
  async processTradeClose(params) {
    const {
      copyFollowerId,
      tradingAccountId,
      userId,
      masterId,
      rawPnl,
      masterSharePercentage = 50,
      tradeId,
      copyTradeId,
      metadata = {},
      io = null
    } = params

    console.log(`\n[CreditRefill] ========== PROCESSING TRADE CLOSE ==========`)
    console.log(`[CreditRefill] CopyFollower: ${copyFollowerId}, Raw P&L: $${rawPnl.toFixed(2)}`)

    const follower = await CopyFollower.findById(copyFollowerId)
    if (!follower) throw new Error(`CopyFollower not found: ${copyFollowerId}`)

    const account = await TradingAccount.findById(tradingAccountId)
    if (!account) throw new Error(`Trading account not found: ${tradingAccountId}`)

    const minimumCredit = follower.minimumCredit || this.DEFAULT_MINIMUM_CREDIT
    const creditBefore = account.credit || 0
    const deficitBefore = follower.creditDeficit || 0
    
    console.log(`[CreditRefill] Credit Before: $${creditBefore.toFixed(2)}, Minimum: $${minimumCredit}, Deficit Before: $${deficitBefore.toFixed(2)}`)
    console.log(`[CreditRefill] Is Below Minimum: ${creditBefore < minimumCredit}`)

    let result
    if (rawPnl < 0) {
      result = await this._handleLoss({
        follower, account, userId, masterId,
        lossAmount: Math.abs(rawPnl),
        minimumCredit, creditBefore, deficitBefore,
        tradeId, copyTradeId, metadata
      })
    } else if (rawPnl > 0) {
      result = await this._handleProfit({
        follower, account, userId, masterId,
        profitAmount: rawPnl, masterSharePercentage,
        minimumCredit, creditBefore, deficitBefore,
        tradeId, copyTradeId, metadata
      })
    } else {
      result = {
        success: true, action: 'NO_CHANGE', rawPnl: 0,
        creditChange: 0, walletChange: 0, masterShare: 0,
        creditAfter: creditBefore, deficitAfter: deficitBefore,
        isRefillMode: deficitBefore > 0
      }
    }

    if (io && result.success) {
      this._emitBalanceUpdate(io, userId, tradingAccountId, result)
    }

    console.log(`[CreditRefill] Action: ${result.action}, Credit: $${result.creditAfter.toFixed(2)}, Deficit: $${result.deficitAfter.toFixed(2)}`)
    return result
  }

  /**
   * Handle loss - deduct from credit, auto-refill from wallet if below minimum
   */
  async _handleLoss(params) {
    const { follower, account, userId, masterId, lossAmount, minimumCredit,
            creditBefore, deficitBefore, tradeId, copyTradeId, metadata } = params

    let creditAfter = Math.max(0, creditBefore - lossAmount)
    const actualDeduction = creditBefore - creditAfter
    let walletRefillAmount = 0
    let walletDeducted = false

    // Record the loss in ledger first
    await CreditLedger.create({
      userId, tradingAccountId: account._id, type: 'TRADE_LOSS',
      amount: -actualDeduction, balanceAfter: creditAfter,
      tradeId, copyTradeId, masterId,
      description: `Copy trade loss: -$${actualDeduction.toFixed(2)}`,
      metadata: { ...metadata, pnl: -lossAmount, minimumCredit }
    })

    // AUTO-REFILL FROM WALLET: If credit drops below minimum, try to refill from wallet
    if (creditAfter < minimumCredit) {
      const deficit = minimumCredit - creditAfter
      const wallet = await Wallet.findOne({ userId })
      const walletBalance = wallet?.balance || 0

      if (walletBalance > 0) {
        // Refill as much as possible from wallet (up to deficit or wallet balance)
        walletRefillAmount = Math.min(deficit, walletBalance)
        
        // Deduct from wallet
        await Wallet.findOneAndUpdate(
          { userId },
          { $inc: { balance: -walletRefillAmount } }
        )
        
        // Add to credit
        creditAfter += walletRefillAmount
        walletDeducted = true

        console.log(`[CreditRefill] Auto-refill from wallet: $${walletRefillAmount.toFixed(2)}`)

        // Record wallet refill in credit ledger
        await CreditLedger.create({
          userId, tradingAccountId: account._id, type: 'WALLET_AUTO_REFILL',
          amount: walletRefillAmount, balanceAfter: creditAfter,
          tradeId, copyTradeId, masterId,
          description: `Auto-refill from wallet: +$${walletRefillAmount.toFixed(2)}`,
          metadata: { ...metadata, walletBalanceBefore: walletBalance, walletBalanceAfter: walletBalance - walletRefillAmount, minimumCredit }
        })

        // Record in Transaction history for user visibility
        const Transaction = (await import('../models/Transaction.js')).default
        await Transaction.create({
          userId,
          type: 'COPY_CREDIT_REFILL',
          amount: walletRefillAmount,
          status: 'APPROVED',
          description: `Auto credit refill from wallet for copy trading`,
          metadata: {
            tradingAccountId: account._id,
            creditBefore: creditAfter - walletRefillAmount,
            creditAfter: creditAfter,
            walletDeducted: walletRefillAmount,
            reason: 'Credit below minimum after trade loss'
          }
        })
      }
    }

    const deficitAfter = Math.max(0, minimumCredit - creditAfter)
    const isRefillMode = deficitAfter > 0

    // Atomic updates
    await TradingAccount.findByIdAndUpdate(account._id, { $set: { credit: creditAfter } })
    await CopyFollower.findByIdAndUpdate(follower._id, {
      $set: { currentCredit: creditAfter, creditDeficit: deficitAfter, isRefillMode }
    })

    if (deficitAfter > deficitBefore && !walletDeducted) {
      await CreditRefillLedger.recordDeficitCreated({
        userId, tradingAccountId: account._id, copyFollowerId: follower._id,
        masterId, creditBefore, creditAfter, lossAmount: actualDeduction,
        minimumCredit, tradeId, copyTradeId, metadata
      })
    }

    const creditDepleted = creditAfter <= 0
    if (creditDepleted) {
      await CopyFollower.findByIdAndUpdate(follower._id, {
        $set: { status: 'STOPPED', stoppedAt: new Date(), stopReason: 'Credit depleted - insufficient wallet balance' }
      })
    }

    return {
      success: true, action: walletDeducted ? 'LOSS_WITH_WALLET_REFILL' : 'LOSS_DEDUCTED', 
      rawPnl: -lossAmount,
      creditChange: -actualDeduction + walletRefillAmount, 
      walletChange: -walletRefillAmount, 
      walletRefillAmount,
      masterShare: 0,
      followerShare: -lossAmount, creditBefore, creditAfter,
      deficitBefore, deficitAfter, isRefillMode, creditDepleted
    }
  }

  /**
   * Handle profit - apply auto-refill logic if in deficit
   */
  async _handleProfit(params) {
    const { follower, account, userId, masterId, profitAmount, masterSharePercentage,
            minimumCredit, creditBefore, deficitBefore, tradeId, copyTradeId, metadata } = params

    const masterShare = profitAmount * (masterSharePercentage / 100)
    const followerGrossShare = profitAmount - masterShare

    console.log(`[CreditRefill] PROFIT: Raw=$${profitAmount.toFixed(2)}, MasterShare=$${masterShare.toFixed(2)}, FollowerShare=$${followerGrossShare.toFixed(2)}`)
    console.log(`[CreditRefill] PROFIT: CreditBefore=$${creditBefore.toFixed(2)}, MinimumCredit=$${minimumCredit}`)

    let profitToCredit = 0, profitToWallet = 0
    let creditAfter = creditBefore, deficitAfter = deficitBefore
    let isRefillMode = deficitBefore > 0, refillComplete = false

    if (creditBefore < minimumCredit) {
      // AUTO-REFILL MODE
      const currentDeficit = minimumCredit - creditBefore
      console.log(`[CreditRefill] REFILL MODE: CurrentDeficit=$${currentDeficit.toFixed(2)}`)
      
      if (followerGrossShare >= currentDeficit) {
        profitToCredit = currentDeficit
        profitToWallet = followerGrossShare - currentDeficit
        creditAfter = minimumCredit
        deficitAfter = 0
        isRefillMode = false
        refillComplete = true
        console.log(`[CreditRefill] REFILL COMPLETE: $${profitToCredit.toFixed(2)} to credit, $${profitToWallet.toFixed(2)} to wallet`)
      } else {
        profitToCredit = followerGrossShare
        profitToWallet = 0
        creditAfter = creditBefore + followerGrossShare
        deficitAfter = minimumCredit - creditAfter
        isRefillMode = true
        console.log(`[CreditRefill] PARTIAL REFILL: $${profitToCredit.toFixed(2)} to credit, remaining deficit=$${deficitAfter.toFixed(2)}`)
      }
    } else {
      // NORMAL MODE - all to wallet
      profitToWallet = followerGrossShare
      console.log(`[CreditRefill] NORMAL MODE: $${profitToWallet.toFixed(2)} to wallet`)
    }

    // Atomic updates
    if (profitToCredit > 0) {
      await TradingAccount.findByIdAndUpdate(account._id, { $set: { credit: creditAfter } })
      await CreditLedger.create({
        userId, tradingAccountId: account._id,
        type: refillComplete ? 'REFILL_COMPLETE' : 'PROFIT_REFILL',
        amount: profitToCredit, balanceAfter: creditAfter,
        tradeId, copyTradeId, masterId,
        description: refillComplete
          ? `Credit restored. $${profitToCredit.toFixed(2)} refilled, $${profitToWallet.toFixed(2)} to wallet.`
          : `Profit refill: $${profitToCredit.toFixed(2)}. Deficit: $${deficitAfter.toFixed(2)}`,
        metadata: { ...metadata, profitTotal: profitAmount, profitToCredit, profitToWallet, minimumCredit }
      })
    }

    if (profitToWallet > 0) {
      await Wallet.findOneAndUpdate({ userId }, { $inc: { balance: profitToWallet } }, { upsert: true })
    }

    const followerUpdate = {
      $set: { currentCredit: creditAfter, creditDeficit: deficitAfter, isRefillMode }
    }
    if (profitToCredit > 0) {
      followerUpdate.$inc = { totalRefilled: profitToCredit, refillCount: 1 }
      followerUpdate.$set.lastRefillAt = new Date()
    }
    if (profitToWallet > 0) {
      followerUpdate.$inc = followerUpdate.$inc || {}
      followerUpdate.$inc.totalProfitToWallet = profitToWallet
    }
    await CopyFollower.findByIdAndUpdate(follower._id, followerUpdate)

    if (profitToCredit > 0) {
      await CreditRefillLedger.recordProfitRefill({
        userId, tradingAccountId: account._id, copyFollowerId: follower._id,
        masterId, creditBefore, creditAfter, deficitBefore, deficitAfter,
        profitTotal: profitAmount, profitToCredit, profitToWallet,
        tradeId, copyTradeId, metadata, isComplete: refillComplete
      })
    }

    return {
      success: true,
      action: refillComplete ? 'REFILL_COMPLETE' : (profitToCredit > 0 ? 'PROFIT_REFILL' : 'PROFIT_TO_WALLET'),
      rawPnl: profitAmount, creditChange: profitToCredit, walletChange: profitToWallet,
      masterShare, followerShare: followerGrossShare, profitToCredit, profitToWallet,
      creditBefore, creditAfter, deficitBefore, deficitAfter, isRefillMode, refillComplete
    }
  }

  _emitBalanceUpdate(io, userId, tradingAccountId, result) {
    try {
      io.to(`user:${userId}`).emit('creditUpdate', {
        tradingAccountId, creditBalance: result.creditAfter,
        creditDeficit: result.deficitAfter, isRefillMode: result.isRefillMode,
        walletChange: result.walletChange, action: result.action, timestamp: Date.now()
      })
    } catch (e) { console.error(`[CreditRefill] WebSocket error:`, e.message) }
  }

  async getRefillStatus(copyFollowerId) {
    const follower = await CopyFollower.findById(copyFollowerId).populate('followerAccountId')
    if (!follower) throw new Error('Subscription not found')
    const account = follower.followerAccountId
    const minimumCredit = follower.minimumCredit || this.DEFAULT_MINIMUM_CREDIT
    const currentCredit = account?.credit || 0
    return {
      copyFollowerId, minimumCredit, currentCredit,
      currentDeficit: Math.max(0, minimumCredit - currentCredit),
      isRefillMode: currentCredit < minimumCredit,
      totalRefilled: follower.totalRefilled || 0,
      totalProfitToWallet: follower.totalProfitToWallet || 0,
      refillCount: follower.refillCount || 0
    }
  }

  async getRefillHistory(copyFollowerId, limit = 50) {
    return CreditRefillLedger.getRefillHistory(copyFollowerId, limit)
  }
}

export default new CreditRefillService()
