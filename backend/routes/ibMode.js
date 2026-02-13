import express from 'express'
import IBModeSettings from '../models/IBModeSettings.js'
import MonthlyIBCommission from '../models/MonthlyIBCommission.js'
import DirectReferralCommission from '../models/DirectReferralCommission.js'
import MonthlyTradingLot from '../models/MonthlyTradingLot.js'
import monthlyIBEngine from '../services/monthlyIBEngine.js'
import directReferralEngine from '../services/directReferralEngine.js'
import IBUser from '../models/IBUser.js'

const router = express.Router()

// ==================== ADMIN SETTINGS ====================

// GET /api/ib-mode/settings - Get IB mode settings
router.get('/settings', async (req, res) => {
  try {
    const settings = await IBModeSettings.getSettings()
    res.json({ settings })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching settings', error: error.message })
  }
})

// PUT /api/ib-mode/settings - Update IB mode settings
router.put('/settings', async (req, res) => {
  try {
    const settings = await IBModeSettings.getSettings()
    const updates = req.body

    // Update commission mode
    if (updates.commissionMode) {
      if (!['REALTIME', 'MONTHLY_CONTROLLED'].includes(updates.commissionMode)) {
        return res.status(400).json({ message: 'Invalid commission mode' })
      }
      settings.commissionMode = updates.commissionMode
    }

    // Update monthly trading IB settings
    if (updates.monthlyTradingIB) {
      Object.assign(settings.monthlyTradingIB, updates.monthlyTradingIB)
    }

    // Update direct joining income settings
    if (updates.directJoiningIncome) {
      Object.assign(settings.directJoiningIncome, updates.directJoiningIncome)
    }

    // Update general settings
    if (updates.minWithdrawalAmount !== undefined) {
      settings.minWithdrawalAmount = updates.minWithdrawalAmount
    }
    if (updates.withdrawalApprovalRequired !== undefined) {
      settings.withdrawalApprovalRequired = updates.withdrawalApprovalRequired
    }
    if (updates.enableDetailedLogs !== undefined) {
      settings.enableDetailedLogs = updates.enableDetailedLogs
    }

    await settings.save()

    res.json({ 
      message: 'Settings updated successfully',
      settings 
    })
  } catch (error) {
    res.status(500).json({ message: 'Error updating settings', error: error.message })
  }
})

// PUT /api/ib-mode/toggle-mode - Quick toggle between modes
router.put('/toggle-mode', async (req, res) => {
  try {
    const { mode } = req.body
    
    if (!['REALTIME', 'MONTHLY_CONTROLLED'].includes(mode)) {
      return res.status(400).json({ message: 'Invalid mode. Use REALTIME or MONTHLY_CONTROLLED' })
    }

    const settings = await IBModeSettings.getSettings()
    const previousMode = settings.commissionMode
    settings.commissionMode = mode
    await settings.save()

    console.log(`[IB Mode] Switched from ${previousMode} to ${mode}`)

    res.json({
      message: `Commission mode switched to ${mode}`,
      previousMode,
      currentMode: mode
    })
  } catch (error) {
    res.status(500).json({ message: 'Error toggling mode', error: error.message })
  }
})

// ==================== MONTHLY IB ENDPOINTS ====================

// POST /api/ib-mode/monthly/process-payout - Trigger monthly payout (admin/cron)
router.post('/monthly/process-payout', async (req, res) => {
  try {
    const { monthPeriod } = req.body // Optional: specific month to process

    const result = await monthlyIBEngine.processMonthlyPayout(monthPeriod)

    res.json(result)
  } catch (error) {
    res.status(500).json({ message: 'Error processing monthly payout', error: error.message })
  }
})

// GET /api/ib-mode/monthly/summary/:ibUserId - Get IB's monthly summary
router.get('/monthly/summary/:ibUserId', async (req, res) => {
  try {
    const { ibUserId } = req.params
    const { monthPeriod } = req.query

    const summary = await monthlyIBEngine.getIBMonthlySummary(ibUserId, monthPeriod)

    res.json({ summary })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching summary', error: error.message })
  }
})

// GET /api/ib-mode/monthly/batch-report/:batchId - Get batch payout report
router.get('/monthly/batch-report/:batchId', async (req, res) => {
  try {
    const { batchId } = req.params

    const report = await monthlyIBEngine.getBatchReport(batchId)

    res.json(report)
  } catch (error) {
    res.status(500).json({ message: 'Error fetching batch report', error: error.message })
  }
})

// GET /api/ib-mode/monthly/traders - Get all traders with monthly volume
router.get('/monthly/traders', async (req, res) => {
  try {
    const { monthPeriod } = req.query
    const targetMonth = monthPeriod || new Date().toISOString().slice(0, 7)

    const traders = await MonthlyTradingLot.find({ monthPeriod: targetMonth })
      .populate('userId', 'firstName lastName email')
      .sort({ totalLots: -1 })

    res.json({ 
      monthPeriod: targetMonth,
      traders 
    })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching traders', error: error.message })
  }
})

// GET /api/ib-mode/monthly/commissions - Get all monthly commissions
router.get('/monthly/commissions', async (req, res) => {
  try {
    const { monthPeriod, status, ibUserId } = req.query
    
    const query = {}
    if (monthPeriod) query.monthPeriod = monthPeriod
    if (status) query.status = status
    if (ibUserId) query.ibUserId = ibUserId

    const commissions = await MonthlyIBCommission.find(query)
      .populate('ibUserId', 'firstName lastName email')
      .populate('traderId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(500)

    const totals = await MonthlyIBCommission.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$commissionAmount' },
          totalLots: { $sum: '$totalLots' },
          count: { $sum: 1 }
        }
      }
    ])

    res.json({
      commissions,
      totals: totals[0] || { totalAmount: 0, totalLots: 0, count: 0 }
    })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching commissions', error: error.message })
  }
})

// ==================== DIRECT REFERRAL ENDPOINTS ====================

// POST /api/ib-mode/referral/process-activation - Process user activation (called on deposit/trade/kyc)
router.post('/referral/process-activation', async (req, res) => {
  try {
    const { userId, activationTrigger } = req.body

    if (!userId || !activationTrigger) {
      return res.status(400).json({ message: 'userId and activationTrigger required' })
    }

    const result = await directReferralEngine.processNewUserActivation(userId, activationTrigger)

    res.json(result)
  } catch (error) {
    res.status(500).json({ message: 'Error processing activation', error: error.message })
  }
})

// GET /api/ib-mode/referral/summary/:ibUserId - Get IB's referral income summary
router.get('/referral/summary/:ibUserId', async (req, res) => {
  try {
    const { ibUserId } = req.params

    const summary = await directReferralEngine.getIBReferralSummary(ibUserId)

    res.json({ summary })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching summary', error: error.message })
  }
})

// GET /api/ib-mode/referral/commissions - Get all referral commissions
router.get('/referral/commissions', async (req, res) => {
  try {
    const { startDate, endDate, ibUserId, status } = req.query
    
    const query = {}
    if (status) query.status = status
    if (ibUserId) query.ibUserId = ibUserId
    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) query.createdAt.$gte = new Date(startDate)
      if (endDate) query.createdAt.$lte = new Date(endDate)
    }

    const commissions = await DirectReferralCommission.find(query)
      .populate('ibUserId', 'firstName lastName email')
      .populate('newUserId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(500)

    const totals = await DirectReferralCommission.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$commissionAmount' },
          count: { $sum: 1 }
        }
      }
    ])

    res.json({
      commissions,
      totals: totals[0] || { totalAmount: 0, count: 0 }
    })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching commissions', error: error.message })
  }
})

// GET /api/ib-mode/referral/admin-report - Get admin report
router.get('/referral/admin-report', async (req, res) => {
  try {
    const { startDate, endDate } = req.query

    const report = await directReferralEngine.getAdminReport(startDate, endDate)

    res.json(report)
  } catch (error) {
    res.status(500).json({ message: 'Error fetching report', error: error.message })
  }
})

// PUT /api/ib-mode/referral/reverse/:commissionId - Reverse a commission
router.put('/referral/reverse/:commissionId', async (req, res) => {
  try {
    const { commissionId } = req.params
    const { adminId, reason } = req.body

    if (!reason) {
      return res.status(400).json({ message: 'Reversal reason required' })
    }

    const commission = await directReferralEngine.reverseCommission(commissionId, adminId, reason)

    res.json({
      message: 'Commission reversed successfully',
      commission
    })
  } catch (error) {
    res.status(400).json({ message: error.message })
  }
})

// ==================== COMBINED DASHBOARD ====================

// GET /api/ib-mode/dashboard/:userId - Get combined IB dashboard for a user
router.get('/dashboard/:userId', async (req, res) => {
  try {
    const { userId } = req.params

    const settings = await IBModeSettings.getSettings()
    const ibUser = await IBUser.findOne({ userId })

    if (!ibUser) {
      return res.status(404).json({ message: 'IB user not found' })
    }

    // Get current month period
    const currentMonth = new Date().toISOString().slice(0, 7)

    // Get monthly trading summary
    const monthlySummary = await monthlyIBEngine.getIBMonthlySummary(userId, currentMonth)

    // Get referral income summary
    const referralSummary = await directReferralEngine.getIBReferralSummary(userId)

    res.json({
      commissionMode: settings.commissionMode,
      ibUser: {
        _id: ibUser._id,
        userId: ibUser.userId,
        ibWalletBalance: ibUser.ibWalletBalance,
        totalCommissionEarned: ibUser.totalCommissionEarned,
        totalCommissionWithdrawn: ibUser.totalCommissionWithdrawn,
        status: ibUser.status
      },
      monthlyTrading: {
        enabled: settings.monthlyTradingIB.enabled,
        currentMonth,
        summary: monthlySummary
      },
      directReferral: {
        enabled: settings.directJoiningIncome.enabled,
        summary: referralSummary
      },
      levelRates: {
        monthly: settings.monthlyTradingIB.levelRates,
        referral: settings.directJoiningIncome.levelAmounts
      }
    })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching dashboard', error: error.message })
  }
})

// ==================== ADMIN OVERVIEW ====================

// GET /api/ib-mode/admin/overview - Get admin overview of IB system
router.get('/admin/overview', async (req, res) => {
  try {
    const settings = await IBModeSettings.getSettings()
    const currentMonth = new Date().toISOString().slice(0, 7)

    // Monthly trading stats
    const monthlyStats = await MonthlyIBCommission.aggregate([
      { $match: { monthPeriod: currentMonth } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          amount: { $sum: '$commissionAmount' }
        }
      }
    ])

    // Direct referral stats (this month)
    const startOfMonth = new Date(currentMonth + '-01')
    const referralStats = await DirectReferralCommission.aggregate([
      { $match: { createdAt: { $gte: startOfMonth } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          amount: { $sum: '$commissionAmount' }
        }
      }
    ])

    // Total IB wallet balances
    const walletStats = await IBUser.aggregate([
      { $match: { status: 'ACTIVE' } },
      {
        $group: {
          _id: null,
          totalBalance: { $sum: '$ibWalletBalance' },
          totalEarned: { $sum: '$totalCommissionEarned' },
          totalWithdrawn: { $sum: '$totalCommissionWithdrawn' },
          activeIBs: { $sum: 1 }
        }
      }
    ])

    // Traders with volume this month
    const tradersWithVolume = await MonthlyTradingLot.countDocuments({
      monthPeriod: currentMonth,
      totalLots: { $gt: 0 }
    })

    res.json({
      currentMode: settings.commissionMode,
      currentMonth,
      lastMonthlyPayout: {
        date: settings.lastMonthlyPayoutDate,
        month: settings.lastMonthlyPayoutMonth
      },
      monthlyTrading: {
        enabled: settings.monthlyTradingIB.enabled,
        stats: monthlyStats,
        tradersWithVolume
      },
      directReferral: {
        enabled: settings.directJoiningIncome.enabled,
        stats: referralStats
      },
      walletStats: walletStats[0] || {
        totalBalance: 0,
        totalEarned: 0,
        totalWithdrawn: 0,
        activeIBs: 0
      }
    })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching overview', error: error.message })
  }
})

export default router
