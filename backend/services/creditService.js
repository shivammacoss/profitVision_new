import CreditLedger from '../models/CreditLedger.js'
import TradingAccount from '../models/TradingAccount.js'
import CopyFollower from '../models/CopyFollower.js'
import MasterTrader from '../models/MasterTrader.js'
import Wallet from '../models/Wallet.js'
import User from '../models/User.js'

/**
 * CreditService - Manages credit operations for copy trading
 * 
 * CORE RULES:
 * 1. Credit is used ONLY for copy trading exposure & loss deduction
 * 2. Credit is admin-controlled and cannot be withdrawn
 * 3. Losses are deducted from credit, NEVER from wallet_balance
 * 4. Profits are split 50/50: follower's share goes to wallet_balance
 * 5. If credit reaches 0, copy trading is automatically stopped
 */
class CreditService {
  
  /**
   * Add credit to a copy trading account (admin action)
   */
  async addCredit(tradingAccountId, amount, adminId, description = '') {
    if (amount <= 0) {
      throw new Error('Credit amount must be positive')
    }
    
    const account = await TradingAccount.findById(tradingAccountId)
    if (!account) {
      throw new Error('Trading account not found')
    }
    
    // Only allow credit on copy trading accounts
    if (!account.isCopyTrading) {
      throw new Error('Credit can only be added to copy trading accounts')
    }
    
    const result = await CreditLedger.recordTransaction({
      tradingAccountId,
      userId: account.userId,
      type: 'ADMIN_CREDIT',
      amount: amount,
      description: description || `Admin credit: +$${amount.toFixed(2)}`,
      adminId
    })
    
    console.log(`[CreditService] Added $${amount.toFixed(2)} credit to account ${account.accountId}. New balance: $${result.newBalance.toFixed(2)}`)
    
    return {
      success: true,
      creditAdded: amount,
      newCreditBalance: result.newBalance,
      ledgerEntry: result.entry
    }
  }
  
  /**
   * Remove credit from a copy trading account (admin action)
   */
  async removeCredit(tradingAccountId, amount, adminId, description = '') {
    if (amount <= 0) {
      throw new Error('Amount must be positive')
    }
    
    const account = await TradingAccount.findById(tradingAccountId)
    if (!account) {
      throw new Error('Trading account not found')
    }
    
    const currentCredit = account.credit || 0
    if (amount > currentCredit) {
      throw new Error(`Cannot remove $${amount.toFixed(2)}. Available credit: $${currentCredit.toFixed(2)}`)
    }
    
    const result = await CreditLedger.recordTransaction({
      tradingAccountId,
      userId: account.userId,
      type: 'ADMIN_DEBIT',
      amount: -amount,
      description: description || `Admin debit: -$${amount.toFixed(2)}`,
      adminId
    })
    
    console.log(`[CreditService] Removed $${amount.toFixed(2)} credit from account ${account.accountId}. New balance: $${result.newBalance.toFixed(2)}`)
    
    return {
      success: true,
      creditRemoved: amount,
      newCreditBalance: result.newBalance,
      ledgerEntry: result.entry
    }
  }
  
  /**
   * Check if account has sufficient credit for copy trading
   * Returns detailed info about credit availability
   */
  async checkCreditForTrade(tradingAccountId, marginRequired) {
    const account = await TradingAccount.findById(tradingAccountId)
    if (!account) {
      return { 
        canTrade: false, 
        reason: 'Account not found',
        creditBalance: 0,
        marginRequired
      }
    }
    
    const creditBalance = account.credit || 0
    
    // Check if credit is zero - copy trading should be blocked
    if (creditBalance <= 0) {
      return {
        canTrade: false,
        reason: 'No credit available. Copy trading requires credit balance.',
        creditBalance: 0,
        marginRequired,
        shouldStopCopyTrading: true
      }
    }
    
    // Check if sufficient credit for margin
    if (creditBalance < marginRequired) {
      return {
        canTrade: false,
        reason: `Insufficient credit. Required: $${marginRequired.toFixed(2)}, Available: $${creditBalance.toFixed(2)}`,
        creditBalance,
        marginRequired,
        shortfall: marginRequired - creditBalance
      }
    }
    
    return {
      canTrade: true,
      creditBalance,
      marginRequired,
      remainingCredit: creditBalance - marginRequired
    }
  }
  
  /**
   * Deduct loss from credit when a copy trade closes with loss
   * CRITICAL: Loss ONLY affects credit, NEVER wallet_balance
   */
  async deductLossFromCredit(tradingAccountId, lossAmount, tradeId, copyTradeId, metadata = {}) {
    if (lossAmount <= 0) {
      throw new Error('Loss amount must be positive')
    }
    
    const account = await TradingAccount.findById(tradingAccountId)
    if (!account) {
      throw new Error('Trading account not found')
    }
    
    const currentCredit = account.credit || 0
    
    // Calculate actual deduction (cannot go below 0)
    const actualDeduction = Math.min(lossAmount, currentCredit)
    const remainingLoss = lossAmount - actualDeduction
    
    if (actualDeduction > 0) {
      await CreditLedger.recordTransaction({
        tradingAccountId,
        userId: account.userId,
        type: 'TRADE_LOSS',
        amount: -actualDeduction,
        description: `Copy trade loss: -$${actualDeduction.toFixed(2)} (${metadata.symbol || 'Unknown'})`,
        tradeId,
        copyTradeId,
        metadata: {
          ...metadata,
          pnl: -lossAmount,
          actualDeduction,
          remainingLoss
        }
      })
    }
    
    // Refresh account to get updated credit
    const updatedAccount = await TradingAccount.findById(tradingAccountId)
    const newCreditBalance = updatedAccount.credit || 0
    
    console.log(`[CreditService] Loss deducted: $${actualDeduction.toFixed(2)} from credit. New credit: $${newCreditBalance.toFixed(2)}`)
    
    // Check if credit is now zero - need to stop copy trading
    const shouldStopCopyTrading = newCreditBalance <= 0
    
    if (shouldStopCopyTrading) {
      console.log(`[CreditService] Credit depleted for account ${account.accountId}. Copy trading should be stopped.`)
      await this.stopCopyTradingForAccount(tradingAccountId, 'Credit balance depleted')
    }
    
    return {
      success: true,
      lossAmount,
      actualDeduction,
      remainingLoss, // Loss that couldn't be covered (should be 0 ideally)
      newCreditBalance,
      shouldStopCopyTrading,
      creditDepleted: newCreditBalance <= 0
    }
  }
  
  /**
   * Credit profit share to follower's wallet_balance
   * RULE: 50% of profit goes to follower's wallet (withdrawable)
   */
  async creditProfitToWallet(userId, profitShare, tradeId, copyTradeId, metadata = {}) {
    if (profitShare <= 0) {
      return { success: true, credited: 0, message: 'No profit to credit' }
    }
    
    // Get or create wallet
    let wallet = await Wallet.findOne({ userId })
    if (!wallet) {
      wallet = await Wallet.create({ userId, balance: 0 })
    }
    
    // Add profit share to wallet balance
    const previousBalance = wallet.balance || 0
    wallet.balance = previousBalance + profitShare
    await wallet.save()
    
    console.log(`[CreditService] Credited $${profitShare.toFixed(2)} profit to user ${userId} wallet. New balance: $${wallet.balance.toFixed(2)}`)
    
    return {
      success: true,
      credited: profitShare,
      previousWalletBalance: previousBalance,
      newWalletBalance: wallet.balance,
      tradeId,
      copyTradeId
    }
  }
  
  /**
   * Credit master's profit share (50% of profit)
   * Goes to master's pendingCommission
   */
  async creditMasterShare(masterId, masterShare, tradeId, copyTradeId, metadata = {}) {
    if (masterShare <= 0) {
      return { success: true, credited: 0, message: 'No profit to credit' }
    }
    
    const master = await MasterTrader.findById(masterId)
    if (!master) {
      throw new Error('Master trader not found')
    }
    
    master.pendingCommission = (master.pendingCommission || 0) + masterShare
    master.totalCommissionEarned = (master.totalCommissionEarned || 0) + masterShare
    await master.save()
    
    console.log(`[CreditService] Credited $${masterShare.toFixed(2)} to master ${master.displayName}. Pending: $${master.pendingCommission.toFixed(2)}`)
    
    return {
      success: true,
      credited: masterShare,
      newPendingCommission: master.pendingCommission,
      totalEarned: master.totalCommissionEarned
    }
  }
  
  /**
   * Stop copy trading for an account when credit is depleted
   */
  async stopCopyTradingForAccount(tradingAccountId, reason = 'Credit depleted') {
    // Find all active copy followers for this account
    const followers = await CopyFollower.find({
      followerAccountId: tradingAccountId,
      status: 'ACTIVE'
    })
    
    for (const follower of followers) {
      follower.status = 'STOPPED'
      follower.stoppedAt = new Date()
      follower.stopReason = reason
      await follower.save()
      
      // Update master stats
      const master = await MasterTrader.findById(follower.masterId)
      if (master) {
        master.stats.activeFollowers = Math.max(0, (master.stats.activeFollowers || 1) - 1)
        await master.save()
      }
      
      console.log(`[CreditService] Stopped copy trading for follower ${follower._id}. Reason: ${reason}`)
    }
    
    return {
      success: true,
      stoppedCount: followers.length,
      reason
    }
  }
  
  /**
   * Get credit history for an account
   */
  async getCreditHistory(tradingAccountId, limit = 50) {
    const entries = await CreditLedger.find({ tradingAccountId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('tradeId', 'tradeId symbol side quantity')
      .populate('adminId', 'firstName lastName email')
    
    const account = await TradingAccount.findById(tradingAccountId)
    
    return {
      currentBalance: account?.credit || 0,
      entries
    }
  }
  
  /**
   * Get credit summary for a user across all copy trading accounts
   */
  async getUserCreditSummary(userId) {
    const accounts = await TradingAccount.find({ 
      userId, 
      isCopyTrading: true 
    })
    
    let totalCredit = 0
    const accountSummaries = []
    
    for (const account of accounts) {
      const credit = account.credit || 0
      totalCredit += credit
      
      // Get recent transactions
      const recentTransactions = await CreditLedger.find({ tradingAccountId: account._id })
        .sort({ createdAt: -1 })
        .limit(5)
      
      accountSummaries.push({
        accountId: account.accountId,
        tradingAccountId: account._id,
        creditBalance: credit,
        walletBalance: account.balance || 0,
        recentTransactions
      })
    }
    
    return {
      userId,
      totalCredit,
      accountCount: accounts.length,
      accounts: accountSummaries
    }
  }
}

export default new CreditService()
