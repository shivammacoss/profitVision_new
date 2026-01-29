import express from 'express'
import creditService from '../services/creditService.js'
import CreditLedger from '../models/CreditLedger.js'
import TradingAccount from '../models/TradingAccount.js'
import CopyFollower from '../models/CopyFollower.js'
import User from '../models/User.js'
import { authenticateAdmin } from '../middleware/auth.js'

const router = express.Router()

// ==================== ADMIN CREDIT MANAGEMENT ====================

// POST /api/credit/add - Add credit to a copy trading account (Admin only)
router.post('/add', authenticateAdmin, async (req, res) => {
  try {
    const { tradingAccountId, amount, description } = req.body
    const adminId = req.adminId

    if (!tradingAccountId || !amount) {
      return res.status(400).json({ 
        success: false, 
        message: 'Trading account ID and amount are required' 
      })
    }

    if (amount <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Amount must be positive' 
      })
    }

    const result = await creditService.addCredit(
      tradingAccountId, 
      parseFloat(amount), 
      adminId, 
      description
    )

    res.json({
      success: true,
      message: `Successfully added $${amount} credit`,
      ...result
    })

  } catch (error) {
    console.error('Error adding credit:', error)
    res.status(400).json({ 
      success: false, 
      message: error.message 
    })
  }
})

// POST /api/credit/remove - Remove credit from a copy trading account (Admin only)
router.post('/remove', authenticateAdmin, async (req, res) => {
  try {
    const { tradingAccountId, amount, description } = req.body
    const adminId = req.adminId

    if (!tradingAccountId || !amount) {
      return res.status(400).json({ 
        success: false, 
        message: 'Trading account ID and amount are required' 
      })
    }

    if (amount <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Amount must be positive' 
      })
    }

    const result = await creditService.removeCredit(
      tradingAccountId, 
      parseFloat(amount), 
      adminId, 
      description
    )

    res.json({
      success: true,
      message: `Successfully removed $${amount} credit`,
      ...result
    })

  } catch (error) {
    console.error('Error removing credit:', error)
    res.status(400).json({ 
      success: false, 
      message: error.message 
    })
  }
})

// GET /api/credit/balance/:tradingAccountId - Get credit balance for an account
router.get('/balance/:tradingAccountId', async (req, res) => {
  try {
    const { tradingAccountId } = req.params

    const account = await TradingAccount.findById(tradingAccountId)
      .populate('userId', 'firstName lastName email')

    if (!account) {
      return res.status(404).json({ 
        success: false, 
        message: 'Trading account not found' 
      })
    }

    // Get copy follower info if exists
    const follower = await CopyFollower.findOne({ followerAccountId: tradingAccountId })
      .populate('masterId', 'displayName')

    res.json({
      success: true,
      accountId: account.accountId,
      tradingAccountId: account._id,
      user: account.userId,
      creditBalance: account.credit || 0,
      walletBalance: account.balance || 0,
      isCopyTrading: account.isCopyTrading || false,
      copyTradingStatus: follower?.status || null,
      masterTrader: follower?.masterId?.displayName || null
    })

  } catch (error) {
    console.error('Error fetching credit balance:', error)
    res.status(500).json({ 
      success: false, 
      message: error.message 
    })
  }
})

// GET /api/credit/history/:tradingAccountId - Get credit transaction history
router.get('/history/:tradingAccountId', async (req, res) => {
  try {
    const { tradingAccountId } = req.params
    const { limit = 50 } = req.query

    const result = await creditService.getCreditHistory(tradingAccountId, parseInt(limit))

    res.json({
      success: true,
      ...result
    })

  } catch (error) {
    console.error('Error fetching credit history:', error)
    res.status(500).json({ 
      success: false, 
      message: error.message 
    })
  }
})

// GET /api/credit/user/:userId - Get credit summary for a user
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params

    const result = await creditService.getUserCreditSummary(userId)

    res.json({
      success: true,
      ...result
    })

  } catch (error) {
    console.error('Error fetching user credit summary:', error)
    res.status(500).json({ 
      success: false, 
      message: error.message 
    })
  }
})

// GET /api/credit/copy-accounts - Get all copy trading accounts with credit info (Admin)
router.get('/copy-accounts', authenticateAdmin, async (req, res) => {
  try {
    const { status, minCredit, maxCredit } = req.query

    // Find all copy trading accounts
    let query = { isCopyTrading: true }

    const accounts = await TradingAccount.find(query)
      .populate('userId', 'firstName lastName email')
      .sort({ credit: -1 })

    // Get follower info for each account
    const accountsWithFollowerInfo = await Promise.all(accounts.map(async (account) => {
      const follower = await CopyFollower.findOne({ followerAccountId: account._id })
        .populate('masterId', 'displayName')

      // Apply filters
      if (status && follower?.status !== status) return null
      if (minCredit && (account.credit || 0) < parseFloat(minCredit)) return null
      if (maxCredit && (account.credit || 0) > parseFloat(maxCredit)) return null

      return {
        _id: account._id,
        accountId: account.accountId,
        user: account.userId,
        creditBalance: account.credit || 0,
        walletBalance: account.balance || 0,
        leverage: account.leverage,
        status: account.status,
        copyTradingStatus: follower?.status || 'UNKNOWN',
        stopReason: follower?.stopReason || null,
        masterTrader: follower?.masterId?.displayName || null,
        initialDeposit: follower?.initialDeposit || 0,
        createdAt: account.createdAt
      }
    }))

    // Filter out nulls
    const filteredAccounts = accountsWithFollowerInfo.filter(a => a !== null)

    // Calculate totals
    const totalCredit = filteredAccounts.reduce((sum, a) => sum + a.creditBalance, 0)
    const totalWallet = filteredAccounts.reduce((sum, a) => sum + a.walletBalance, 0)
    const activeCount = filteredAccounts.filter(a => a.copyTradingStatus === 'ACTIVE').length
    const stoppedCount = filteredAccounts.filter(a => a.copyTradingStatus === 'STOPPED').length
    const depletedCount = filteredAccounts.filter(a => a.creditBalance <= 0).length

    res.json({
      success: true,
      accounts: filteredAccounts,
      summary: {
        totalAccounts: filteredAccounts.length,
        totalCredit,
        totalWallet,
        activeCount,
        stoppedCount,
        depletedCount
      }
    })

  } catch (error) {
    console.error('Error fetching copy accounts:', error)
    res.status(500).json({ 
      success: false, 
      message: error.message 
    })
  }
})

// POST /api/credit/bulk-add - Bulk add credit to multiple accounts (Admin)
router.post('/bulk-add', authenticateAdmin, async (req, res) => {
  try {
    const { accounts, description } = req.body
    const adminId = req.adminId

    // accounts = [{ tradingAccountId, amount }, ...]
    if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Accounts array is required' 
      })
    }

    const results = []
    for (const { tradingAccountId, amount } of accounts) {
      try {
        const result = await creditService.addCredit(
          tradingAccountId, 
          parseFloat(amount), 
          adminId, 
          description || 'Bulk credit addition'
        )
        results.push({ tradingAccountId, status: 'SUCCESS', ...result })
      } catch (error) {
        results.push({ tradingAccountId, status: 'FAILED', error: error.message })
      }
    }

    const successCount = results.filter(r => r.status === 'SUCCESS').length
    const failedCount = results.filter(r => r.status === 'FAILED').length

    res.json({
      success: true,
      message: `Processed ${accounts.length} accounts: ${successCount} success, ${failedCount} failed`,
      results
    })

  } catch (error) {
    console.error('Error bulk adding credit:', error)
    res.status(500).json({ 
      success: false, 
      message: error.message 
    })
  }
})

// POST /api/credit/reactivate - Reactivate copy trading after adding credit (Admin)
router.post('/reactivate', authenticateAdmin, async (req, res) => {
  try {
    const { tradingAccountId, creditAmount } = req.body
    const adminId = req.adminId

    if (!tradingAccountId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Trading account ID is required' 
      })
    }

    // Find the stopped follower
    const follower = await CopyFollower.findOne({ 
      followerAccountId: tradingAccountId,
      status: 'STOPPED'
    })

    if (!follower) {
      return res.status(404).json({ 
        success: false, 
        message: 'No stopped copy trading subscription found for this account' 
      })
    }

    // Add credit if specified
    if (creditAmount && creditAmount > 0) {
      await creditService.addCredit(
        tradingAccountId, 
        parseFloat(creditAmount), 
        adminId, 
        'Credit added for reactivation'
      )
    }

    // Check if account now has credit
    const account = await TradingAccount.findById(tradingAccountId)
    if ((account.credit || 0) <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot reactivate without credit. Please add credit first.' 
      })
    }

    // Reactivate the follower
    follower.status = 'ACTIVE'
    follower.stoppedAt = null
    follower.stopReason = null
    await follower.save()

    // Update master stats
    const MasterTrader = (await import('../models/MasterTrader.js')).default
    const master = await MasterTrader.findById(follower.masterId)
    if (master) {
      master.stats.activeFollowers = (master.stats.activeFollowers || 0) + 1
      await master.save()
    }

    res.json({
      success: true,
      message: 'Copy trading reactivated successfully',
      follower: {
        _id: follower._id,
        status: follower.status,
        masterId: follower.masterId
      },
      creditBalance: account.credit
    })

  } catch (error) {
    console.error('Error reactivating copy trading:', error)
    res.status(500).json({ 
      success: false, 
      message: error.message 
    })
  }
})

export default router
