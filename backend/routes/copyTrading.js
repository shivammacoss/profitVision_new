import express from 'express'
import mongoose from 'mongoose'
import MasterTrader from '../models/MasterTrader.js'
import CopyFollower from '../models/CopyFollower.js'
import CopyTrade from '../models/CopyTrade.js'
import CopyCommission from '../models/CopyCommission.js'
import CopySettings from '../models/CopySettings.js'
import TradingAccount from '../models/TradingAccount.js'
import AccountType from '../models/AccountType.js'
import Trade from '../models/Trade.js'
import User from '../models/User.js'
import Wallet from '../models/Wallet.js'
import Transaction from '../models/Transaction.js'
import copyTradingEngine from '../services/copyTradingEngine.js'

const router = express.Router()

// ==================== MASTER TRADER ROUTES ====================

// POST /api/copy/master/apply - Apply to become a master trader
// Commission is FIXED at 50% for master (50% of profit goes to master, 50% stays with follower)
router.post('/master/apply', async (req, res) => {
  try {
    const { userId, tradingAccountId, displayName, description, minimumFollowerDeposit } = req.body
    
    // FIXED COMMISSION: 50% to master, 50% stays with follower
    const FIXED_COMMISSION_PERCENTAGE = 50

    // Check if copy trading is enabled
    const settings = await CopySettings.getSettings()
    if (!settings.isEnabled || !settings.allowNewMasterApplications) {
      return res.status(400).json({ message: 'Master applications are currently closed' })
    }

    // Check if user already has a master application
    const existingMaster = await MasterTrader.findOne({ userId })
    if (existingMaster) {
      return res.status(400).json({ 
        message: 'You already have a master trader application',
        status: existingMaster.status
      })
    }

    // Validate trading account
    const tradingAccount = await TradingAccount.findById(tradingAccountId)
    if (!tradingAccount || tradingAccount.userId.toString() !== userId) {
      return res.status(400).json({ message: 'Invalid trading account' })
    }

    // Master cannot use a Copy Trading account - must use a regular trading account
    if (tradingAccount.isCopyTrading) {
      return res.status(400).json({ message: 'Cannot use a Copy Trading account as master. Please select a regular trading account.' })
    }

    // Check minimum equity
    const minEquityMet = tradingAccount.balance >= settings.masterRequirements.minEquity

    // Check trading history
    const tradeCount = await Trade.countDocuments({ 
      tradingAccountId, 
      status: 'CLOSED' 
    })
    const minTradesMet = tradeCount >= settings.masterRequirements.minTotalTrades

    // Create master application with FIXED 50% commission
    const master = await MasterTrader.create({
      userId,
      tradingAccountId,
      displayName,
      description,
      requestedCommissionPercentage: FIXED_COMMISSION_PERCENTAGE,
      minimumFollowerDeposit: minimumFollowerDeposit || 0,
      minimumEquityMet: minEquityMet,
      minimumTradesMet: minTradesMet,
      status: 'PENDING'
    })

    res.status(201).json({
      message: 'Master trader application submitted',
      master: {
        _id: master._id,
        displayName: master.displayName,
        status: master.status,
        commissionPercentage: FIXED_COMMISSION_PERCENTAGE
      }
    })

  } catch (error) {
    console.error('Error applying as master:', error)
    res.status(500).json({ message: 'Error submitting application', error: error.message })
  }
})

// GET /api/copy/masters - Get all active public masters
router.get('/masters', async (req, res) => {
  try {
    const masters = await MasterTrader.find({
      status: 'ACTIVE',
      visibility: 'PUBLIC'
    })
      .populate('userId', 'firstName lastName')
      .select('-pendingCommission -totalCommissionEarned -totalCommissionWithdrawn')
      .sort({ 'stats.totalFollowers': -1 })
      .lean()

    // Add total commission (master + admin share) for display to users
    const mastersWithTotalCommission = masters.map(master => {
      const masterCommission = master.approvedCommissionPercentage || 0
      const adminSharePercent = master.adminSharePercentage || 30
      // Total commission user pays = master commission + (master commission * admin share / (100 - admin share))
      // Example: master 10%, admin takes 30% of total → user pays ~14.3% total
      // Simpler: if admin takes 30% of commission, master gets 70%, so total = master / 0.7
      const totalCommission = adminSharePercent < 100 ? 
        Math.round((masterCommission / (1 - adminSharePercent / 100)) * 10) / 10 : 
        masterCommission
      return {
        ...master,
        totalCommissionPercentage: totalCommission,
        masterCommissionPercentage: masterCommission
      }
    })

    res.json({ masters: mastersWithTotalCommission })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching masters', error: error.message })
  }
})

// GET /api/copy/master/:id - Get master details
router.get('/master/:id', async (req, res) => {
  try {
    const master = await MasterTrader.findById(req.params.id)
      .populate('userId', 'firstName lastName')
      .select('-pendingCommission -totalCommissionEarned -totalCommissionWithdrawn')

    if (!master) {
      return res.status(404).json({ message: 'Master not found' })
    }

    res.json({ master })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching master', error: error.message })
  }
})

// GET /api/copy/master/my-profile/:userId - Get user's master profile
router.get('/master/my-profile/:userId', async (req, res) => {
  try {
    const master = await MasterTrader.findOne({ userId: req.params.userId })
      .populate('tradingAccountId', 'accountId balance')

    if (!master) {
      return res.status(404).json({ message: 'Master profile not found' })
    }

    res.json({ master })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching master profile', error: error.message })
  }
})

// POST /api/copy/master/withdraw - Request commission withdrawal
router.post('/master/withdraw', async (req, res) => {
  try {
    const { masterId, amount } = req.body

    const result = await copyTradingEngine.processMasterWithdrawal(masterId, amount, null)

    res.json({
      message: 'Commission withdrawn successfully',
      ...result
    })
  } catch (error) {
    res.status(400).json({ message: error.message })
  }
})

// GET /api/copy/master/commissions/:masterId - Get master's commission history
router.get('/master/commissions/:masterId', async (req, res) => {
  try {
    const { masterId } = req.params
    const { limit = 50, status } = req.query

    const query = { masterId }
    if (status) query.status = status

    const commissions = await CopyCommission.find(query)
      .populate('followerUserId', 'firstName lastName email')
      .populate('followerAccountId', 'accountId')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))

    // Calculate totals
    const totals = await CopyCommission.aggregate([
      { $match: { masterId: new mongoose.Types.ObjectId(masterId) } },
      {
        $group: {
          _id: null,
          totalDailyProfit: { $sum: '$dailyProfit' },
          totalCommission: { $sum: '$totalCommission' },
          totalMasterShare: { $sum: '$masterShare' },
          totalAdminShare: { $sum: '$adminShare' }
        }
      }
    ])

    // Get master profile for pending/withdrawn amounts
    const master = await MasterTrader.findById(masterId)

    res.json({
      success: true,
      commissions,
      totals: totals[0] || { totalDailyProfit: 0, totalCommission: 0, totalMasterShare: 0, totalAdminShare: 0 },
      masterStats: {
        pendingCommission: master?.pendingCommission || 0,
        totalCommissionEarned: master?.totalCommissionEarned || 0,
        totalCommissionWithdrawn: master?.totalCommissionWithdrawn || 0
      }
    })
  } catch (error) {
    console.error('Error fetching master commissions:', error)
    res.status(500).json({ message: 'Error fetching commissions', error: error.message })
  }
})

// ==================== FOLLOWER ROUTES ====================

// POST /api/copy/follow - Follow a master trader
// New flow: User deposits funds -> Auto-create copy trading account -> Funds go to credit
router.post('/follow', async (req, res) => {
  try {
    const { followerUserId, masterId, depositAmount, maxLotSize, maxDailyLoss } = req.body
    
    // Force EQUITY_BASED mode - this is the only mode supported
    const copyMode = 'EQUITY_BASED'
    const copyValue = 1

    // Check if copy trading is enabled
    const settings = await CopySettings.getSettings()
    if (!settings.isEnabled || !settings.allowNewFollowers) {
      return res.status(400).json({ message: 'Following is currently disabled' })
    }

    // Validate master
    const master = await MasterTrader.findById(masterId).populate('tradingAccountId')
    if (!master || master.status !== 'ACTIVE') {
      return res.status(400).json({ message: 'Master trader not available' })
    }

    // Prevent master from following themselves
    if (master.userId.toString() === followerUserId) {
      return res.status(400).json({ message: 'You cannot follow yourself as a master trader' })
    }

    // Check follower limit
    if (master.stats.activeFollowers >= settings.copyLimits.maxFollowersPerMaster) {
      return res.status(400).json({ message: 'Master has reached maximum followers' })
    }

    // Validate deposit amount meets minimum requirement
    const minDeposit = master.minimumFollowerDeposit || 0
    if (depositAmount < minDeposit) {
      return res.status(400).json({ 
        message: `Minimum deposit of $${minDeposit} required to follow this master`,
        code: 'INSUFFICIENT_DEPOSIT',
        required: minDeposit,
        provided: depositAmount
      })
    }

    // Get user and wallet
    const user = await User.findById(followerUserId)
    if (!user) {
      return res.status(400).json({ message: 'User not found' })
    }

    let wallet = await Wallet.findOne({ userId: followerUserId })
    if (!wallet) {
      wallet = new Wallet({ userId: followerUserId, balance: 0 })
      await wallet.save()
    }

    if ((wallet.balance || 0) < depositAmount) {
      return res.status(400).json({ 
        message: `Insufficient wallet balance. You have $${wallet.balance || 0}, need $${depositAmount}`,
        code: 'INSUFFICIENT_WALLET',
        required: depositAmount,
        current: wallet.balance || 0
      })
    }

    // Check if already following this master
    const existingFollow = await CopyFollower.findOne({
      followerId: followerUserId,
      masterId,
      status: { $in: ['ACTIVE', 'PAUSED'] }
    })

    if (existingFollow) {
      return res.status(400).json({ message: 'Already following this master' })
    }

    // copyMode is now hardcoded to EQUITY_BASED - no validation needed

    // Get or create a Copy Trading account type
    let copyAccountType = await AccountType.findOne({ name: 'Copy Trading' })
    if (!copyAccountType) {
      copyAccountType = await AccountType.create({
        name: 'Copy Trading',
        description: 'Account for copy trading followers',
        minDeposit: 0,
        leverage: '1:100',
        exposureLimit: 0,
        minSpread: 0,
        commission: 0,
        isActive: true,
        isDemo: false
      })
    }

    // Deduct from user wallet
    wallet.balance = (wallet.balance || 0) - depositAmount
    await wallet.save()

    // Create transaction record for wallet deduction
    await Transaction.create({
      userId: followerUserId,
      type: 'Transfer_To_Account',
      amount: depositAmount,
      status: 'Completed',
      paymentMethod: 'System',
      adminRemarks: `Copy Trading deposit for following ${master.displayName}`
    })

    // Create copy trading account for the user
    const accountId = await TradingAccount.generateAccountId()
    const copyTradingAccount = await TradingAccount.create({
      userId: followerUserId,
      accountTypeId: copyAccountType._id,
      accountId,
      pin: '1234', // Default PIN, user can change later
      balance: 0, // Balance starts at 0 (profits go here)
      credit: depositAmount, // Deposit goes to credit (non-withdrawable)
      leverage: '1:100',
      exposureLimit: 0,
      status: 'Active',
      isDemo: false,
      isCopyTrading: true,
      copyTradingMasterId: masterId
    })

    // Create follower subscription
    const follower = await CopyFollower.create({
      followerId: followerUserId,
      masterId,
      followerAccountId: copyTradingAccount._id,
      copyMode,
      copyValue: copyValue || 0.01,
      maxLotSize: maxLotSize || 10,
      maxDailyLoss: maxDailyLoss || null,
      status: 'ACTIVE',
      initialDeposit: depositAmount
    })

    // Update master stats
    master.stats.totalFollowers += 1
    master.stats.activeFollowers += 1
    await master.save()

    res.status(201).json({
      success: true,
      message: 'Successfully following master trader',
      follower: {
        _id: follower._id,
        masterId: follower.masterId,
        copyMode: follower.copyMode,
        copyValue: follower.copyValue,
        status: follower.status
      },
      copyTradingAccount: {
        _id: copyTradingAccount._id,
        accountId: copyTradingAccount.accountId,
        credit: copyTradingAccount.credit,
        balance: copyTradingAccount.balance
      }
    })

  } catch (error) {
    console.error('Error following master:', error)
    res.status(500).json({ message: 'Error following master', error: error.message })
  }
})

// PUT /api/copy/follow/:id/pause - Pause following
router.put('/follow/:id/pause', async (req, res) => {
  try {
    const follower = await CopyFollower.findById(req.params.id)
    if (!follower) {
      return res.status(404).json({ message: 'Subscription not found' })
    }

    follower.status = 'PAUSED'
    follower.pausedAt = new Date()
    await follower.save()

    // Update master stats
    const master = await MasterTrader.findById(follower.masterId)
    if (master) {
      master.stats.activeFollowers -= 1
      await master.save()
    }

    res.json({ message: 'Following paused', follower })
  } catch (error) {
    res.status(500).json({ message: 'Error pausing follow', error: error.message })
  }
})

// PUT /api/copy/follow/:id/resume - Resume following
router.put('/follow/:id/resume', async (req, res) => {
  try {
    const follower = await CopyFollower.findById(req.params.id)
    if (!follower) {
      return res.status(404).json({ message: 'Subscription not found' })
    }

    follower.status = 'ACTIVE'
    follower.pausedAt = null
    follower.stoppedAt = null
    await follower.save()

    // Update master stats
    const master = await MasterTrader.findById(follower.masterId)
    if (master) {
      master.stats.activeFollowers += 1
      await master.save()
    }

    res.json({ message: 'Following resumed', follower })
  } catch (error) {
    res.status(500).json({ message: 'Error resuming follow', error: error.message })
  }
})

// PUT /api/copy/follow/:id/stop - Stop following
router.put('/follow/:id/stop', async (req, res) => {
  try {
    const follower = await CopyFollower.findById(req.params.id)
    if (!follower) {
      return res.status(404).json({ message: 'Subscription not found' })
    }

    follower.status = 'STOPPED'
    follower.stoppedAt = new Date()
    await follower.save()

    // Update master stats
    const master = await MasterTrader.findById(follower.masterId)
    if (master && follower.status === 'ACTIVE') {
      master.stats.activeFollowers -= 1
      await master.save()
    }

    res.json({ message: 'Following stopped', follower })
  } catch (error) {
    res.status(500).json({ message: 'Error stopping follow', error: error.message })
  }
})

// PUT /api/copy/follow/:id/update - Update subscription settings (account, copy mode, etc.)
router.put('/follow/:id/update', async (req, res) => {
  try {
    const { followerAccountId, copyMode, copyValue } = req.body
    const follower = await CopyFollower.findById(req.params.id)
    
    if (!follower) {
      return res.status(404).json({ message: 'Subscription not found' })
    }

    // Update fields if provided
    if (followerAccountId) {
      // Validate the new account belongs to the same user
      const account = await TradingAccount.findById(followerAccountId)
      if (!account || account.userId.toString() !== follower.followerId.toString()) {
        return res.status(400).json({ message: 'Invalid trading account' })
      }
      follower.followerAccountId = followerAccountId
    }

    if (copyMode) {
      if (!['FIXED_LOT', 'BALANCE_BASED', 'EQUITY_BASED', 'MULTIPLIER', 'LOT_MULTIPLIER', 'AUTO'].includes(copyMode)) {
        return res.status(400).json({ message: 'Invalid copy mode' })
      }
      follower.copyMode = copyMode
    }

    if (copyValue !== undefined) {
      const mode = copyMode || follower.copyMode
      if (mode === 'FIXED_LOT') {
        follower.fixedLotSize = parseFloat(copyValue)
        follower.copyValue = parseFloat(copyValue)
      } else if (mode === 'MULTIPLIER' || mode === 'LOT_MULTIPLIER') {
        follower.multiplier = parseFloat(copyValue)
        follower.copyValue = parseFloat(copyValue)
      } else {
        // BALANCE_BASED, EQUITY_BASED - copyValue is maxLotSize
        follower.maxLotSize = parseFloat(copyValue)
        follower.copyValue = parseFloat(copyValue)
      }
    }

    await follower.save()

    res.json({ 
      success: true, 
      message: 'Subscription updated successfully', 
      follower 
    })
  } catch (error) {
    res.status(500).json({ message: 'Error updating subscription', error: error.message })
  }
})

// DELETE /api/copy/follow/:id/unfollow - Completely unfollow a master
router.delete('/follow/:id/unfollow', async (req, res) => {
  try {
    const follower = await CopyFollower.findById(req.params.id)
    
    if (!follower) {
      return res.status(404).json({ message: 'Subscription not found' })
    }

    const masterId = follower.masterId

    // Delete the follower record
    await CopyFollower.findByIdAndDelete(req.params.id)

    // Update master stats
    const master = await MasterTrader.findById(masterId)
    if (master) {
      master.stats.totalFollowers = Math.max(0, (master.stats.totalFollowers || 1) - 1)
      master.stats.activeFollowers = Math.max(0, (master.stats.activeFollowers || 1) - 1)
      await master.save()
    }

    res.json({ 
      success: true, 
      message: 'Successfully unfollowed master' 
    })
  } catch (error) {
    res.status(500).json({ message: 'Error unfollowing', error: error.message })
  }
})

// GET /api/copy/my-subscriptions/:userId - Get user's copy subscriptions
router.get('/my-subscriptions/:userId', async (req, res) => {
  try {
    const subscriptions = await CopyFollower.find({ followerId: req.params.userId })
      .populate('masterId', 'displayName stats approvedCommissionPercentage')
      .populate('followerAccountId', 'accountId balance')
      .sort({ createdAt: -1 })

    // Calculate actual profit/loss for each subscription from copy trades
    const subscriptionsWithStats = await Promise.all(subscriptions.map(async (sub) => {
      const subObj = sub.toObject()
      
      // Get all copy trades for this subscription
      const copyTrades = await CopyTrade.find({
        followerUserId: req.params.userId,
        masterId: sub.masterId?._id
      })

      let totalProfit = 0
      let totalLoss = 0
      let totalCopiedTrades = copyTrades.length
      let openTrades = 0
      let closedTrades = 0

      copyTrades.forEach(trade => {
        if (trade.status === 'CLOSED') {
          closedTrades++
          const pnl = trade.followerPnl || 0
          if (pnl >= 0) {
            totalProfit += pnl
          } else {
            totalLoss += Math.abs(pnl)
          }
        } else if (trade.status === 'OPEN') {
          openTrades++
        }
      })

      // Update stats with actual calculated values
      subObj.stats = {
        ...subObj.stats,
        totalCopiedTrades,
        totalProfit,
        totalLoss,
        netPnl: totalProfit - totalLoss,
        openTrades,
        closedTrades
      }

      return subObj
    }))

    res.json({ subscriptions: subscriptionsWithStats })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching subscriptions', error: error.message })
  }
})

// GET /api/copy/my-copy-trades/:userId - Get user's copied trades
router.get('/my-copy-trades/:userId', async (req, res) => {
  try {
    const { status, limit = 50 } = req.query

    const query = { followerUserId: req.params.userId }
    if (status) query.status = status

    const copyTrades = await CopyTrade.find(query)
      .populate('masterId', 'displayName')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))

    res.json({ copyTrades })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching copy trades', error: error.message })
  }
})

// GET /api/copy/my-followers/:masterId - Get followers for a master trader with detailed stats
router.get('/my-followers/:masterId', async (req, res) => {
  try {
    const followers = await CopyFollower.find({ masterId: req.params.masterId })
      .populate('followerId', 'firstName lastName email')
      .populate('followerAccountId', 'accountId balance credit')
      .sort({ createdAt: -1 })

    // Enhance each follower with detailed stats
    const followersWithStats = await Promise.all(followers.map(async (follower) => {
      const followerObj = follower.toObject()
      
      // Get copy trades for this follower
      const copyTrades = await CopyTrade.find({ 
        masterId: req.params.masterId,
        followerAccountId: follower.followerAccountId?._id 
      })
      
      // Calculate stats
      const closedTrades = copyTrades.filter(t => t.status === 'CLOSED')
      const totalProfit = closedTrades.reduce((sum, t) => sum + Math.max(0, t.followerPnl || 0), 0)
      const totalLoss = closedTrades.reduce((sum, t) => sum + Math.min(0, t.followerPnl || 0), 0)
      const totalCommissionPaid = closedTrades.reduce((sum, t) => sum + (t.masterPnl || 0), 0)
      const openTrades = copyTrades.filter(t => t.status === 'OPEN').length
      
      // Get follower account equity
      const account = follower.followerAccountId
      const equity = account ? (account.balance || 0) + (account.credit || 0) : 0
      
      return {
        ...followerObj,
        stats: {
          totalCopiedTrades: copyTrades.length,
          closedTrades: closedTrades.length,
          openTrades,
          totalProfit,
          totalLoss,
          netPnl: totalProfit + totalLoss,
          totalCommissionPaid,
          equity,
          balance: account?.balance || 0,
          credit: account?.credit || 0
        },
        joinedAt: follower.createdAt
      }
    }))

    res.json({ followers: followersWithStats })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching followers', error: error.message })
  }
})

// ==================== ADMIN ROUTES ====================

// GET /api/copy/admin/applications - Get pending master applications
router.get('/admin/applications', async (req, res) => {
  try {
    const applications = await MasterTrader.find({ status: 'PENDING' })
      .populate('userId', 'firstName lastName email')
      .populate('tradingAccountId', 'accountId balance')
      .sort({ createdAt: -1 })

    res.json({ applications })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching applications', error: error.message })
  }
})

// PUT /api/copy/admin/approve/:id - Approve master application
// Commission is FIXED at 50% - admin cannot change it
router.put('/admin/approve/:id', async (req, res) => {
  try {
    const { adminId, visibility } = req.body
    
    // FIXED COMMISSION: 50% to master, 0% admin share (follower keeps 50%)
    const FIXED_COMMISSION_PERCENTAGE = 50
    const FIXED_ADMIN_SHARE = 0 // Admin takes nothing, follower keeps their 50%

    const master = await MasterTrader.findById(req.params.id)
    if (!master) {
      return res.status(404).json({ message: 'Application not found' })
    }

    if (master.status !== 'PENDING') {
      return res.status(400).json({ message: 'Application already processed' })
    }

    master.status = 'ACTIVE'
    master.approvedCommissionPercentage = FIXED_COMMISSION_PERCENTAGE // Always 50%
    master.visibility = visibility || 'PUBLIC'
    master.adminSharePercentage = FIXED_ADMIN_SHARE // Admin takes 0%, follower keeps 50%
    master.approvedBy = adminId
    master.approvedAt = new Date()
    await master.save()

    res.json({ 
      message: 'Master approved successfully with fixed 50/50 commission split', 
      master,
      commissionInfo: {
        masterShare: '50%',
        followerKeeps: '50%',
        adminShare: '0%'
      }
    })
  } catch (error) {
    res.status(500).json({ message: 'Error approving master', error: error.message })
  }
})

// PUT /api/copy/admin/update-commission/:id - DISABLED: Commission is now fixed at 50/50
// This route is kept for backward compatibility but will return an error
router.put('/admin/update-commission/:id', async (req, res) => {
  // Commission is FIXED at 50% master / 50% follower - cannot be changed
  return res.status(400).json({ 
    success: false, 
    message: 'Commission cannot be modified. It is fixed at 50% for master and 50% for follower.',
    commissionInfo: {
      masterShare: '50%',
      followerKeeps: '50%',
      note: 'This is a fixed rule and cannot be changed'
    }
  })
})

// PUT /api/copy/admin/reject/:id - Reject master application
router.put('/admin/reject/:id', async (req, res) => {
  try {
    const { adminId, rejectionReason } = req.body

    const master = await MasterTrader.findById(req.params.id)
    if (!master) {
      return res.status(404).json({ message: 'Application not found' })
    }

    master.status = 'REJECTED'
    master.rejectedBy = adminId
    master.rejectedAt = new Date()
    master.rejectionReason = rejectionReason
    await master.save()

    res.json({ message: 'Master rejected', master })
  } catch (error) {
    res.status(500).json({ message: 'Error rejecting master', error: error.message })
  }
})

// PUT /api/copy/admin/suspend/:id - Suspend master
router.put('/admin/suspend/:id', async (req, res) => {
  try {
    const { adminId, reason, currentPrices } = req.body

    const master = await MasterTrader.findById(req.params.id)
    if (!master) {
      return res.status(404).json({ message: 'Master not found' })
    }

    // Close all follower trades if prices provided
    let closedTrades = []
    if (currentPrices) {
      closedTrades = await copyTradingEngine.closeAllMasterFollowerTrades(master._id, currentPrices)
    }

    master.status = 'SUSPENDED'
    await master.save()

    res.json({ 
      message: 'Master suspended', 
      master,
      closedTrades: closedTrades.length
    })
  } catch (error) {
    res.status(500).json({ message: 'Error suspending master', error: error.message })
  }
})

// GET /api/copy/admin/masters - Get all masters (admin view)
router.get('/admin/masters', async (req, res) => {
  try {
    const masters = await MasterTrader.find()
      .populate('userId', 'firstName lastName email')
      .populate('tradingAccountId', 'accountId balance')
      .sort({ createdAt: -1 })

    res.json({ masters })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching masters', error: error.message })
  }
})

// GET /api/copy/admin/followers - Get all followers (admin view)
router.get('/admin/followers', async (req, res) => {
  try {
    const followers = await CopyFollower.find()
      .populate('followerId', 'firstName lastName email')
      .populate('masterId', 'displayName')
      .populate('followerAccountId', 'accountId balance')
      .sort({ createdAt: -1 })

    res.json({ followers })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching followers', error: error.message })
  }
})

// GET /api/copy/admin/commissions - Get commission records
router.get('/admin/commissions', async (req, res) => {
  try {
    const { status, tradingDay, limit = 100 } = req.query

    const query = {}
    if (status) query.status = status
    if (tradingDay) query.tradingDay = tradingDay

    const commissions = await CopyCommission.find(query)
      .populate('masterId', 'displayName')
      .populate('followerUserId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))

    // Calculate totals
    const totals = await CopyCommission.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalCommission: { $sum: '$totalCommission' },
          totalAdminShare: { $sum: '$adminShare' },
          totalMasterShare: { $sum: '$masterShare' }
        }
      }
    ])

    res.json({ 
      commissions,
      totals: totals[0] || { totalCommission: 0, totalAdminShare: 0, totalMasterShare: 0 }
    })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching commissions', error: error.message })
  }
})

// POST /api/copy/admin/calculate-daily-commission - Trigger daily commission calculation
router.post('/admin/calculate-daily-commission', async (req, res) => {
  try {
    const { tradingDay } = req.body
    const results = await copyTradingEngine.calculateDailyCommission(tradingDay)

    res.json({
      message: 'Daily commission calculated',
      results,
      processed: results.length
    })
  } catch (error) {
    res.status(500).json({ message: 'Error calculating commission', error: error.message })
  }
})

// POST /api/copy/admin/fix-commission-settings - Fix all masters to have correct 50/50 commission split
router.post('/admin/fix-commission-settings', async (req, res) => {
  try {
    // Update all masters to have correct commission settings
    const result = await MasterTrader.updateMany(
      {}, // All masters
      {
        $set: {
          approvedCommissionPercentage: 50, // Master gets 50% of profit
          adminSharePercentage: 0 // Admin takes 0%, so follower keeps 50%
        }
      }
    )

    // Also update historical commission records to show 50%
    const commissionResult = await CopyCommission.updateMany(
      {}, // All commission records
      {
        $set: {
          commissionPercentage: 50
        }
      }
    )

    res.json({
      success: true,
      message: 'All masters and commission history updated to 50/50 commission split',
      mastersModified: result.modifiedCount,
      mastersMatched: result.matchedCount,
      commissionsModified: commissionResult.modifiedCount,
      commissionsMatched: commissionResult.matchedCount
    })
  } catch (error) {
    res.status(500).json({ message: 'Error fixing commission settings', error: error.message })
  }
})

// GET /api/copy/admin/settings - Get copy trading settings
router.get('/admin/settings', async (req, res) => {
  try {
    const settings = await CopySettings.getSettings()
    res.json({ settings })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching settings', error: error.message })
  }
})

// PUT /api/copy/admin/settings - Update copy trading settings
router.put('/admin/settings', async (req, res) => {
  try {
    const settings = await CopySettings.getSettings()
    
    const { masterRequirements, commissionSettings, copyLimits, isEnabled, allowNewMasterApplications, allowNewFollowers } = req.body

    if (masterRequirements) settings.masterRequirements = { ...settings.masterRequirements, ...masterRequirements }
    if (commissionSettings) settings.commissionSettings = { ...settings.commissionSettings, ...commissionSettings }
    if (copyLimits) settings.copyLimits = { ...settings.copyLimits, ...copyLimits }
    if (isEnabled !== undefined) settings.isEnabled = isEnabled
    if (allowNewMasterApplications !== undefined) settings.allowNewMasterApplications = allowNewMasterApplications
    if (allowNewFollowers !== undefined) settings.allowNewFollowers = allowNewFollowers

    await settings.save()

    res.json({ message: 'Settings updated', settings })
  } catch (error) {
    res.status(500).json({ message: 'Error updating settings', error: error.message })
  }
})

// GET /api/copy/admin/dashboard - Get admin dashboard stats
router.get('/admin/dashboard', async (req, res) => {
  try {
    const settings = await CopySettings.getSettings()

    const [
      totalMasters,
      activeMasters,
      pendingApplications,
      totalFollowers,
      activeFollowers,
      totalCopyTrades,
      openCopyTrades
    ] = await Promise.all([
      MasterTrader.countDocuments(),
      MasterTrader.countDocuments({ status: 'ACTIVE' }),
      MasterTrader.countDocuments({ status: 'PENDING' }),
      CopyFollower.countDocuments(),
      CopyFollower.countDocuments({ status: 'ACTIVE' }),
      CopyTrade.countDocuments(),
      CopyTrade.countDocuments({ status: 'OPEN' })
    ])

    // Today's stats
    const today = new Date().toISOString().split('T')[0]
    const todayCommissions = await CopyCommission.aggregate([
      { $match: { tradingDay: today } },
      {
        $group: {
          _id: null,
          totalCommission: { $sum: '$totalCommission' },
          adminShare: { $sum: '$adminShare' },
          masterShare: { $sum: '$masterShare' }
        }
      }
    ])

    res.json({
      dashboard: {
        masters: {
          total: totalMasters,
          active: activeMasters,
          pending: pendingApplications
        },
        followers: {
          total: totalFollowers,
          active: activeFollowers
        },
        copyTrades: {
          total: totalCopyTrades,
          open: openCopyTrades
        },
        adminPool: settings.adminCopyPool,
        todayCommissions: todayCommissions[0] || { totalCommission: 0, adminShare: 0, masterShare: 0 }
      }
    })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching dashboard', error: error.message })
  }
})

export default router
