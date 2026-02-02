import express from 'express'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import { authenticateAdmin } from '../middleware/auth.js'

const router = express.Router()

// Apply admin authentication to 
router.use(authenticateAdmin)

// GET /api/admin/users - Get all users
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 })
    res.json({
      success: true,
      message: 'Users fetched successfully',
      users,
      total: users.length
    })
  } catch (error) {
    console.error('Error fetching users:', error)
    res.status(500).json({ success: false, message: 'Error fetching users', error: error.message })
  }
})

// GET /api/admin/users/:id - Get single user
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password')
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }
    res.json({ user })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user', error: error.message })
  }
})

// PUT /api/admin/users/:id/password - Change user password
router.put('/users/:id/password', async (req, res) => {
  try {
    const { password } = req.body
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' })
    }
    
    const user = await User.findById(req.params.id)
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }
    
    user.password = password
    await user.save()
    
    res.json({ success: true, message: 'Password updated successfully' })
  } catch (error) {
    console.error('Error updating password:', error)
    res.status(500).json({ success: false, message: 'Error updating password', error: error.message })
  }
})

// POST /api/admin/users/:id/deduct - Deduct funds from user wallet
router.post('/users/:id/deduct', async (req, res) => {
  try {
    const { amount, reason } = req.body
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' })
    }
    
    const user = await User.findById(req.params.id)
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }
    
    // Use Wallet model (same as user wallet page)
    const Wallet = (await import('../models/Wallet.js')).default
    let wallet = await Wallet.findOne({ userId: req.params.id })
    if (!wallet) {
      return res.status(400).json({ success: false, message: 'User has no wallet' })
    }
    
    if ((wallet.balance || 0) < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient wallet balance' })
    }
    
    wallet.balance = (wallet.balance || 0) - parseFloat(amount)
    await wallet.save()
    
    console.log(`[Admin] Deducted $${amount} from user ${user.email} wallet. New balance: $${wallet.balance}`)
    
    res.json({ 
      success: true,
      message: 'Funds deducted successfully',
      newBalance: wallet.balance
    })
  } catch (error) {
    console.error('Error deducting funds:', error)
    res.status(500).json({ success: false, message: 'Error deducting funds', error: error.message })
  }
})

// POST /api/admin/users/:id/add-fund - Add funds to user wallet (Admin only)
router.post('/users/:id/add-fund', async (req, res) => {
  try {
    const { amount, reason } = req.body
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' })
    }
    
    const user = await User.findById(req.params.id)
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }
    
    // Use Wallet model (same as user wallet page)
    const Wallet = (await import('../models/Wallet.js')).default
    let wallet = await Wallet.findOne({ userId: req.params.id })
    if (!wallet) {
      wallet = new Wallet({ userId: req.params.id, balance: 0 })
    }
    
    const previousBalance = wallet.balance || 0
    wallet.balance = previousBalance + parseFloat(amount)
    await wallet.save()
    
    console.log(`[Admin] Added $${amount} to user ${user.email} wallet. Balance: $${previousBalance} -> $${wallet.balance}`)
    
    res.json({ 
      success: true,
      message: 'Funds added successfully',
      previousBalance,
      newBalance: wallet.balance,
      amountAdded: parseFloat(amount)
    })
  } catch (error) {
    console.error('Error adding funds:', error)
    res.status(500).json({ success: false, message: 'Error adding funds', error: error.message })
  }
})

// POST /api/admin/trading-account/:id/add-fund - Add funds to trading account (Admin only)
router.post('/trading-account/:id/add-fund', async (req, res) => {
  try {
    const { amount, reason } = req.body
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' })
    }
    
    const TradingAccount = (await import('../models/TradingAccount.js')).default
    const account = await TradingAccount.findById(req.params.id)
    if (!account) {
      return res.status(404).json({ success: false, message: 'Trading account not found' })
    }
    
    account.balance = (account.balance || 0) + parseFloat(amount)
    await account.save()
    
    res.json({ 
      success: true,
      message: 'Funds added to trading account successfully',
      newBalance: account.balance
    })
  } catch (error) {
    console.error('Error adding funds to trading account:', error)
    res.status(500).json({ success: false, message: 'Error adding funds', error: error.message })
  }
})

// POST /api/admin/trading-account/:id/deduct - Deduct funds from trading account (Admin only)
router.post('/trading-account/:id/deduct', async (req, res) => {
  try {
    const { amount, reason } = req.body
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' })
    }
    
    const TradingAccount = (await import('../models/TradingAccount.js')).default
    const account = await TradingAccount.findById(req.params.id)
    if (!account) {
      return res.status(404).json({ success: false, message: 'Trading account not found' })
    }
    
    if ((account.balance || 0) < amount) {
      return res.status(400).json({ success: false, message: 'Insufficient balance in trading account' })
    }
    
    account.balance = (account.balance || 0) - parseFloat(amount)
    await account.save()
    
    res.json({ 
      success: true,
      message: 'Funds deducted from trading account successfully',
      newBalance: account.balance
    })
  } catch (error) {
    console.error('Error deducting funds from trading account:', error)
    res.status(500).json({ success: false, message: 'Error deducting funds', error: error.message })
  }
})

// PUT /api/admin/users/:id/block - Block/Unblock user
router.put('/users/:id/block', async (req, res) => {
  try {
    const { blocked, reason } = req.body
    
    const user = await User.findById(req.params.id)
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }
    
    user.isBlocked = blocked
    user.blockReason = blocked ? (reason || 'Blocked by admin') : ''
    await user.save()
    
    res.json({ 
      success: true,
      message: blocked ? 'User blocked successfully' : 'User unblocked successfully',
      isBlocked: user.isBlocked
    })
  } catch (error) {
    console.error('Error updating user block status:', error)
    res.status(500).json({ success: false, message: 'Error updating user status', error: error.message })
  }
})

// PUT /api/admin/users/:id/ban - Ban/Unban user
router.put('/users/:id/ban', async (req, res) => {
  try {
    const { banned, reason } = req.body
    
    const user = await User.findById(req.params.id)
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }
    
    user.isBanned = banned
    user.banReason = banned ? (reason || 'Banned by admin') : ''
    if (banned) {
      user.isBlocked = true
    }
    await user.save()
    
    res.json({ 
      success: true,
      message: banned ? 'User banned successfully' : 'User unbanned successfully',
      isBanned: user.isBanned
    })
  } catch (error) {
    console.error('Error updating user ban status:', error)
    res.status(500).json({ success: false, message: 'Error updating user status', error: error.message })
  }
})

// DELETE /api/admin/users/:id - Delete user (COMPLETE CASCADING DELETE)
router.delete('/users/:id', async (req, res) => {
  try {
    const userId = req.params.id
    
    // First check if user exists
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }
    
    console.log(`[Admin] Starting complete deletion for user: ${user.email} (${userId})`)
    
    // Import all required models
    const TradingAccount = (await import('../models/TradingAccount.js')).default
    const Wallet = (await import('../models/Wallet.js')).default
    const Trade = (await import('../models/Trade.js')).default
    const CopyFollower = (await import('../models/CopyFollower.js')).default
    const MasterTrader = (await import('../models/MasterTrader.js')).default
    const CopyTrade = (await import('../models/CopyTrade.js')).default
    const CreditLedger = (await import('../models/CreditLedger.js')).default
    const Transaction = (await import('../models/Transaction.js')).default
    
    // Get user's trading accounts
    const tradingAccounts = await TradingAccount.find({ userId })
    const accountIds = tradingAccounts.map(acc => acc._id)
    
    console.log(`[Admin] Found ${tradingAccounts.length} trading accounts to delete`)
    
    // Delete in order to maintain data integrity
    
    // 1. Delete all trades for user's accounts
    const tradesDeleted = await Trade.deleteMany({ tradingAccountId: { $in: accountIds } })
    console.log(`[Admin] Deleted ${tradesDeleted.deletedCount} trades`)
    
    // 2. Delete copy trades where user is follower
    const copyTradesDeleted = await CopyTrade.deleteMany({ followerId: userId })
    console.log(`[Admin] Deleted ${copyTradesDeleted.deletedCount} copy trade records`)
    
    // 3. Delete copy follower records (where user is following someone)
    const followersDeleted = await CopyFollower.deleteMany({ followerId: userId })
    console.log(`[Admin] Deleted ${followersDeleted.deletedCount} follower records`)
    
    // 4. Delete master trader record if exists AND delete all followers of this master
    const masterRecord = await MasterTrader.findOne({ userId })
    let followersOfMasterDeleted = { deletedCount: 0 }
    let copyTradesOfMasterDeleted = { deletedCount: 0 }
    if (masterRecord) {
      // Delete all CopyFollower records where other users are following this master
      followersOfMasterDeleted = await CopyFollower.deleteMany({ masterId: masterRecord._id })
      console.log(`[Admin] Deleted ${followersOfMasterDeleted.deletedCount} followers of this master`)
      
      // Delete all CopyTrade records for this master
      copyTradesOfMasterDeleted = await CopyTrade.deleteMany({ masterId: masterRecord._id })
      console.log(`[Admin] Deleted ${copyTradesOfMasterDeleted.deletedCount} copy trades from this master`)
    }
    const masterDeleted = await MasterTrader.deleteMany({ userId })
    console.log(`[Admin] Deleted ${masterDeleted.deletedCount} master trader records`)
    
    // 5. Delete credit ledger entries
    const creditLedgerDeleted = await CreditLedger.deleteMany({ userId })
    console.log(`[Admin] Deleted ${creditLedgerDeleted.deletedCount} credit ledger entries`)
    
    // 6. Delete all transactions (deposits, withdrawals, etc.)
    const transactionsDeleted = await Transaction.deleteMany({ userId })
    console.log(`[Admin] Deleted ${transactionsDeleted.deletedCount} transactions`)
    
    // 7. Delete trading accounts
    const accountsDeleted = await TradingAccount.deleteMany({ userId })
    console.log(`[Admin] Deleted ${accountsDeleted.deletedCount} trading accounts`)
    
    // 8. Delete wallet
    const walletDeleted = await Wallet.deleteMany({ userId })
    console.log(`[Admin] Deleted ${walletDeleted.deletedCount} wallets`)
    
    // 9. Finally delete the user
    await User.findByIdAndDelete(userId)
    console.log(`[Admin] User ${user.email} completely deleted from system`)
    
    res.json({ 
      success: true,
      message: 'User and all related data deleted successfully',
      deletedData: {
        trades: tradesDeleted.deletedCount,
        copyTrades: copyTradesDeleted.deletedCount,
        followers: followersDeleted.deletedCount,
        followersOfMaster: followersOfMasterDeleted.deletedCount,
        copyTradesOfMaster: copyTradesOfMasterDeleted.deletedCount,
        masterTrader: masterDeleted.deletedCount,
        creditLedger: creditLedgerDeleted.deletedCount,
        transactions: transactionsDeleted.deletedCount,
        tradingAccounts: accountsDeleted.deletedCount,
        wallets: walletDeleted.deletedCount
      }
    })
  } catch (error) {
    console.error('[Admin] Error deleting user:', error)
    res.status(500).json({ message: 'Error deleting user', error: error.message })
  }
})

// ==================== CLEANUP ORPHANED DATA ====================

// POST /api/admin/cleanup-orphaned-data - Remove orphaned data from deleted users
router.post('/cleanup-orphaned-data', async (req, res) => {
  try {
    console.log('[Admin] Starting orphaned data cleanup...')
    
    const TradingAccount = (await import('../models/TradingAccount.js')).default
    const Wallet = (await import('../models/Wallet.js')).default
    const Trade = (await import('../models/Trade.js')).default
    const CopyFollower = (await import('../models/CopyFollower.js')).default
    const MasterTrader = (await import('../models/MasterTrader.js')).default
    const CopyTrade = (await import('../models/CopyTrade.js')).default
    const CreditLedger = (await import('../models/CreditLedger.js')).default
    const Transaction = (await import('../models/Transaction.js')).default
    
    // Get all valid user IDs
    const validUsers = await User.find({}, '_id')
    const validUserIds = validUsers.map(u => u._id.toString())
    
    console.log(`[Admin] Found ${validUserIds.length} valid users`)
    
    // Find and delete orphaned transactions (userId not in valid users)
    const allTransactions = await Transaction.find({})
    const orphanedTxnIds = allTransactions
      .filter(t => !validUserIds.includes(t.userId?.toString()))
      .map(t => t._id)
    const txnDeleted = await Transaction.deleteMany({ _id: { $in: orphanedTxnIds } })
    console.log(`[Admin] Deleted ${txnDeleted.deletedCount} orphaned transactions`)
    
    // Find and delete orphaned wallets
    const allWallets = await Wallet.find({})
    const orphanedWalletIds = allWallets
      .filter(w => !validUserIds.includes(w.userId?.toString()))
      .map(w => w._id)
    const walletsDeleted = await Wallet.deleteMany({ _id: { $in: orphanedWalletIds } })
    console.log(`[Admin] Deleted ${walletsDeleted.deletedCount} orphaned wallets`)
    
    // Find and delete orphaned trading accounts
    const allAccounts = await TradingAccount.find({})
    const orphanedAccountIds = allAccounts
      .filter(a => !validUserIds.includes(a.userId?.toString()))
      .map(a => a._id)
    const accountsDeleted = await TradingAccount.deleteMany({ _id: { $in: orphanedAccountIds } })
    console.log(`[Admin] Deleted ${accountsDeleted.deletedCount} orphaned trading accounts`)
    
    // Find and delete orphaned trades (for deleted accounts)
    const validAccountIds = (await TradingAccount.find({}, '_id')).map(a => a._id.toString())
    const allTrades = await Trade.find({})
    const orphanedTradeIds = allTrades
      .filter(t => !validAccountIds.includes(t.tradingAccountId?.toString()))
      .map(t => t._id)
    const tradesDeleted = await Trade.deleteMany({ _id: { $in: orphanedTradeIds } })
    console.log(`[Admin] Deleted ${tradesDeleted.deletedCount} orphaned trades`)
    
    // Delete orphaned credit ledger entries
    const allCreditLedger = await CreditLedger.find({})
    const orphanedCreditIds = allCreditLedger
      .filter(c => !validUserIds.includes(c.userId?.toString()))
      .map(c => c._id)
    const creditDeleted = await CreditLedger.deleteMany({ _id: { $in: orphanedCreditIds } })
    console.log(`[Admin] Deleted ${creditDeleted.deletedCount} orphaned credit ledger entries`)
    
    // Delete orphaned copy followers
    const allFollowers = await CopyFollower.find({})
    const orphanedFollowerIds = allFollowers
      .filter(f => !validUserIds.includes(f.followerId?.toString()))
      .map(f => f._id)
    const followersDeleted = await CopyFollower.deleteMany({ _id: { $in: orphanedFollowerIds } })
    console.log(`[Admin] Deleted ${followersDeleted.deletedCount} orphaned copy followers`)
    
    // Delete orphaned master traders
    const allMasters = await MasterTrader.find({})
    const orphanedMasterIds = allMasters
      .filter(m => !validUserIds.includes(m.userId?.toString()))
      .map(m => m._id)
    const mastersDeleted = await MasterTrader.deleteMany({ _id: { $in: orphanedMasterIds } })
    console.log(`[Admin] Deleted ${mastersDeleted.deletedCount} orphaned master traders`)
    
    // Delete CopyFollower records that reference deleted masters
    const validMasterIds = (await MasterTrader.find({}, '_id')).map(m => m._id.toString())
    const followersWithDeletedMaster = allFollowers
      .filter(f => !validMasterIds.includes(f.masterId?.toString()))
      .map(f => f._id)
    const followersOfDeletedMastersDeleted = await CopyFollower.deleteMany({ _id: { $in: followersWithDeletedMaster } })
    console.log(`[Admin] Deleted ${followersOfDeletedMastersDeleted.deletedCount} followers of deleted masters`)
    
    // Delete CopyTrade records that reference deleted masters
    const copyTradesWithDeletedMaster = await CopyTrade.find({})
    const orphanedCopyTradeIds = copyTradesWithDeletedMaster
      .filter(ct => !validMasterIds.includes(ct.masterId?.toString()))
      .map(ct => ct._id)
    const copyTradesOfDeletedMastersDeleted = await CopyTrade.deleteMany({ _id: { $in: orphanedCopyTradeIds } })
    console.log(`[Admin] Deleted ${copyTradesOfDeletedMastersDeleted.deletedCount} copy trades of deleted masters`)
    
    console.log('[Admin] Orphaned data cleanup complete')
    
    res.json({
      success: true,
      message: 'Orphaned data cleanup complete',
      cleaned: {
        transactions: txnDeleted.deletedCount,
        wallets: walletsDeleted.deletedCount,
        tradingAccounts: accountsDeleted.deletedCount,
        trades: tradesDeleted.deletedCount,
        creditLedger: creditDeleted.deletedCount,
        copyFollowers: followersDeleted.deletedCount,
        followersOfDeletedMasters: followersOfDeletedMastersDeleted.deletedCount,
        copyTradesOfDeletedMasters: copyTradesOfDeletedMastersDeleted.deletedCount,
        masterTraders: mastersDeleted.deletedCount
      }
    })
  } catch (error) {
    console.error('[Admin] Error cleaning up orphaned data:', error)
    res.status(500).json({ success: false, message: 'Error cleaning up data', error: error.message })
  }
})

// ==================== CREDIT/BONUS SYSTEM ====================

// POST /api/admin/trading-account/:id/add-credit - Add credit/bonus to trading account
router.post('/trading-account/:id/add-credit', async (req, res) => {
  try {
    const { amount, reason, adminId } = req.body
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' })
    }
    
    const TradingAccount = (await import('../models/TradingAccount.js')).default
    const account = await TradingAccount.findById(req.params.id)
    if (!account) {
      return res.status(404).json({ success: false, message: 'Trading account not found' })
    }
    
    const previousCredit = account.credit || 0
    account.credit = previousCredit + parseFloat(amount)
    await account.save()
    
    // Log the credit addition (optional - don't fail if logging fails)
    if (adminId) {
      try {
        const AdminLog = (await import('../models/AdminLog.js')).default
        await AdminLog.create({
          adminId,
          action: 'ADD_CREDIT',
          targetType: 'TRADING_ACCOUNT',
          targetId: account._id,
          previousValue: { credit: previousCredit },
          newValue: { credit: account.credit },
          reason: reason || 'Credit/Bonus added'
        })
      } catch (logError) {
        console.error('Error logging credit addition:', logError)
      }
    }
    
    res.json({ 
      success: true,
      message: 'Credit added successfully',
      previousCredit,
      newCredit: account.credit,
      balance: account.balance
    })
  } catch (error) {
    console.error('Error adding credit:', error)
    res.status(500).json({ success: false, message: 'Error adding credit', error: error.message })
  }
})

// POST /api/admin/trading-account/:id/remove-credit - Remove credit from trading account
router.post('/trading-account/:id/remove-credit', async (req, res) => {
  try {
    const { amount, reason, adminId } = req.body
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' })
    }
    
    const TradingAccount = (await import('../models/TradingAccount.js')).default
    const account = await TradingAccount.findById(req.params.id)
    if (!account) {
      return res.status(404).json({ message: 'Trading account not found' })
    }
    
    const previousCredit = account.credit || 0
    if (amount > previousCredit) {
      return res.status(400).json({ message: 'Cannot remove more credit than available' })
    }
    
    account.credit = previousCredit - parseFloat(amount)
    await account.save()
    
    // Log the credit removal (optional)
    if (adminId) {
      try {
        const AdminLog = (await import('../models/AdminLog.js')).default
        await AdminLog.create({
          adminId,
          action: 'REMOVE_CREDIT',
          targetType: 'TRADING_ACCOUNT',
          targetId: account._id,
          previousValue: { credit: previousCredit },
          newValue: { credit: account.credit },
          reason: reason || 'Credit removed'
        })
      } catch (logError) {
        console.error('Error logging credit removal:', logError)
      }
    }
    
    res.json({ 
      message: 'Credit removed successfully',
      previousCredit,
      newCredit: account.credit
    })
  } catch (error) {
    console.error('Error removing credit:', error)
    res.status(500).json({ message: 'Error removing credit', error: error.message })
  }
})

// GET /api/admin/trading-account/:id/summary - Get account summary with equity calculation
router.get('/trading-account/:id/summary', async (req, res) => {
  try {
    const TradingAccount = (await import('../models/TradingAccount.js')).default
    const Trade = (await import('../models/Trade.js')).default
    
    const account = await TradingAccount.findById(req.params.id).populate('userId', 'firstName lastName email')
    if (!account) {
      return res.status(404).json({ message: 'Trading account not found' })
    }
    
    // Get open trades for margin calculation
    const openTrades = await Trade.find({ tradingAccountId: account._id, status: 'OPEN' })
    
    const usedMargin = openTrades.reduce((sum, t) => sum + (t.marginUsed || 0), 0)
    const floatingPnl = openTrades.reduce((sum, t) => sum + (t.floatingPnl || 0), 0)
    
    // Equity = Balance + Credit + Floating PnL
    const equity = account.balance + (account.credit || 0) + floatingPnl
    const freeMargin = equity - usedMargin
    const marginLevel = usedMargin > 0 ? (equity / usedMargin) * 100 : 0
    
    res.json({
      account: {
        _id: account._id,
        accountId: account.accountId,
        userId: account.userId,
        balance: account.balance,
        credit: account.credit || 0,
        equity,
        usedMargin,
        freeMargin,
        marginLevel: marginLevel.toFixed(2),
        floatingPnl,
        leverage: account.leverage,
        status: account.status,
        openTradesCount: openTrades.length
      }
    })
  } catch (error) {
    console.error('Error fetching account summary:', error)
    res.status(500).json({ message: 'Error fetching account summary', error: error.message })
  }
})

// POST /api/admin/login-as-user/:userId - Generate token to login as user
router.post('/login-as-user/:userId', async (req, res) => {
  try {
    const { adminId } = req.body
    
    const user = await User.findById(req.params.userId).select('-password')
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }
    
    // Log the admin login as user action (optional)
    if (adminId) {
      try {
        const AdminLog = (await import('../models/AdminLog.js')).default
        await AdminLog.create({
          adminId,
          action: 'LOGIN_AS_USER',
          targetType: 'USER',
          targetId: user._id,
          reason: `Admin logged in as user: ${user.email}`
        })
      } catch (logError) {
        console.error('Error logging login as user:', logError)
      }
    }
    
    // Generate a simple token (in production, use JWT)
    const jwt = (await import('jsonwebtoken')).default
    const token = jwt.sign(
      { userId: user._id, email: user.email, isAdminSession: true },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '2h' }
    )
    
    res.json({
      message: 'Login as user successful',
      token,
      user
    })
  } catch (error) {
    console.error('Error logging in as user:', error)
    res.status(500).json({ message: 'Error logging in as user', error: error.message })
  }
})

// ==================== PASSWORD RESET REQUESTS ====================

// GET /api/admin/password-reset-requests - Get all password reset requests
router.get('/password-reset-requests', async (req, res) => {
  try {
    const PasswordResetRequest = (await import('../models/PasswordResetRequest.js')).default
    const { status } = req.query
    
    const filter = status ? { status } : {}
    const requests = await PasswordResetRequest.find(filter)
      .populate('userId', 'firstName lastName email phone')
      .sort({ createdAt: -1 })
    
    // Get stats
    const pendingCount = await PasswordResetRequest.countDocuments({ status: 'Pending' })
    const completedCount = await PasswordResetRequest.countDocuments({ status: 'Completed' })
    const rejectedCount = await PasswordResetRequest.countDocuments({ status: 'Rejected' })
    
    res.json({ 
      success: true, 
      requests,
      stats: { pending: pendingCount, completed: completedCount, rejected: rejectedCount }
    })
  } catch (error) {
    console.error('Error fetching password reset requests:', error)
    res.status(500).json({ success: false, message: 'Error fetching requests', error: error.message })
  }
})

// PUT /api/admin/password-reset-requests/:id/process - Process password reset request
router.put('/password-reset-requests/:id/process', async (req, res) => {
  try {
    const { action, newPassword, adminRemarks } = req.body
    const PasswordResetRequest = (await import('../models/PasswordResetRequest.js')).default
    
    const request = await PasswordResetRequest.findById(req.params.id).populate('userId')
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' })
    }
    
    if (request.status !== 'Pending') {
      return res.status(400).json({ success: false, message: 'Request already processed' })
    }
    
    if (action === 'approve') {
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' })
      }
      
      // Update user password
      const user = await User.findById(request.userId._id)
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' })
      }
      
      // Update email if requested
      if (request.newEmail) {
        user.email = request.newEmail
      }
      
      user.password = newPassword
      await user.save()
      
      request.status = 'Completed'
      request.processedAt = new Date()
      request.adminRemarks = adminRemarks || 'Password reset and sent to user email'
      await request.save()
      
      console.log(`[Password Reset] Completed for user: ${user.email}`)
      
      res.json({ 
        success: true, 
        message: `Password reset for ${user.email}. New password: ${newPassword}`,
        email: request.newEmail || request.email
      })
    } else if (action === 'reject') {
      request.status = 'Rejected'
      request.processedAt = new Date()
      request.adminRemarks = adminRemarks || 'Request rejected'
      await request.save()
      
      res.json({ success: true, message: 'Request rejected' })
    } else {
      return res.status(400).json({ success: false, message: 'Invalid action' })
    }
  } catch (error) {
    console.error('Error processing password reset:', error)
    res.status(500).json({ success: false, message: 'Error processing request', error: error.message })
  }
})

export default router
