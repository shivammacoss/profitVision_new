import express from 'express'
import crypto from 'crypto'
import User from '../models/User.js'
import Trade from '../models/Trade.js'
import TradingAccount from '../models/TradingAccount.js'
import lpService from '../services/lpService.js'
import dotenv from 'dotenv'

dotenv.config()

const router = express.Router()

// Get LP settings from environment variables
const getLpSettings = () => {
  return {
    lpApiKey: process.env.LP_API_KEY || '',
    lpApiSecret: process.env.LP_API_SECRET || '',
    lpApiUrl: process.env.LP_API_URL || 'https://api.corecen.com',
    corecenWsUrl: process.env.CORECEN_WS_URL || process.env.LP_API_URL || 'https://api.corecen.com',
    enabled: process.env.LP_ENABLED === 'true'
  }
}

// Runtime LP config (can be updated via API)
let runtimeLpConfig = null

// Update LP config at runtime (also updates lpService)
const updateLpConfig = (config) => {
  runtimeLpConfig = {
    apiUrl: config.apiUrl || process.env.LP_API_URL || 'https://api.corecen.com',
    apiKey: config.apiKey || process.env.LP_API_KEY || '',
    apiSecret: config.apiSecret || process.env.LP_API_SECRET || ''
  }
  // Sync with lpService so trade engine uses updated config
  lpService.updateConfig(runtimeLpConfig)
  console.log('[Book Management] LP config updated (runtime)')
}

// Get current LP config
const getCurrentLpConfig = () => {
  return runtimeLpConfig || {
    apiUrl: process.env.LP_API_URL || 'https://api.corecen.com',
    apiKey: process.env.LP_API_KEY || '',
    apiSecret: process.env.LP_API_SECRET || ''
  }
}

// Get all users with book type info
router.get('/users', async (req, res) => {
  try {
    const { search, bookType, page = 1, limit = 20 } = req.query
    
    let query = {}
    
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ]
    }
    
    if (bookType && ['A', 'B'].includes(bookType)) {
      query.bookType = bookType
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit)
    
    const users = await User.find(query)
      .select('firstName email phone bookType bookChangedAt createdAt isBlocked')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean()
    
    // Get trading account count and total trades for each user
    const usersWithStats = await Promise.all(users.map(async (user) => {
      const accountCount = await TradingAccount.countDocuments({ userId: user._id })
      const totalTrades = await Trade.countDocuments({ userId: user._id })
      const openTrades = await Trade.countDocuments({ userId: user._id, status: 'OPEN' })
      
      return {
        ...user,
        accountCount,
        totalTrades,
        openTrades
      }
    }))
    
    const total = await User.countDocuments(query)
    
    res.json({
      success: true,
      users: usersWithStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    })
  } catch (error) {
    console.error('Error fetching users for book management:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// Toggle user book type (A/B)
router.put('/users/:userId/book-type', async (req, res) => {
  try {
    const { userId } = req.params
    const { bookType } = req.body
    
    if (!['A', 'B'].includes(bookType)) {
      return res.status(400).json({ success: false, message: 'Invalid book type. Must be A or B' })
    }
    
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }
    
    const previousBookType = user.bookType
    
    user.bookType = bookType
    user.bookChangedAt = new Date()
    await user.save()
    
    res.json({
      success: true,
      message: `User moved from ${previousBookType}-Book to ${bookType}-Book`,
      user: {
        _id: user._id,
        firstName: user.firstName,
        email: user.email,
        bookType: user.bookType,
        bookChangedAt: user.bookChangedAt
      }
    })
  } catch (error) {
    console.error('Error updating user book type:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// Bulk update book type for multiple users
router.put('/users/bulk-book-type', async (req, res) => {
  try {
    const { userIds, bookType } = req.body
    
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ success: false, message: 'User IDs array is required' })
    }
    
    if (!['A', 'B'].includes(bookType)) {
      return res.status(400).json({ success: false, message: 'Invalid book type. Must be A or B' })
    }
    
    const result = await User.updateMany(
      { _id: { $in: userIds } },
      {
        $set: {
          bookType,
          bookChangedAt: new Date()
        }
      }
    )
    
    res.json({
      success: true,
      message: `${result.modifiedCount} users moved to ${bookType}-Book`,
      modifiedCount: result.modifiedCount
    })
  } catch (error) {
    console.error('Error bulk updating book type:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// Get book statistics
router.get('/stats', async (req, res) => {
  try {
    const aBookUsers = await User.countDocuments({ bookType: 'A' })
    const bBookUsers = await User.countDocuments({ bookType: 'B' })
    
    const aBookTrades = await Trade.countDocuments({ bookType: 'A', status: 'OPEN' })
    const bBookTrades = await Trade.countDocuments({ bookType: 'B', status: 'OPEN' })
    
    const aBookVolume = await Trade.aggregate([
      { $match: { bookType: 'A', status: 'OPEN' } },
      { $group: { _id: null, total: { $sum: '$quantity' } } }
    ])
    
    const bBookVolume = await Trade.aggregate([
      { $match: { bookType: 'B', status: 'OPEN' } },
      { $group: { _id: null, total: { $sum: '$quantity' } } }
    ])
    
    res.json({
      success: true,
      stats: {
        aBook: {
          users: aBookUsers,
          openTrades: aBookTrades,
          volume: aBookVolume[0]?.total || 0
        },
        bBook: {
          users: bBookUsers,
          openTrades: bBookTrades,
          volume: bBookVolume[0]?.total || 0
        }
      }
    })
  } catch (error) {
    console.error('Error fetching book stats:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// Get A-Book positions (open trades) - Optimized for high volume
router.get('/a-book/positions', async (req, res) => {
  try {
    const { page = 1, limit = 100, symbol } = req.query
    
    let query = { bookType: 'A', status: 'OPEN' }
    if (symbol) query.symbol = symbol
    
    const skip = (parseInt(page) - 1) * parseInt(limit)
    
    // Use lean() and select only needed fields for faster queries
    const [positions, total, summary] = await Promise.all([
      Trade.find(query)
        .select('tradeId userId tradingAccountId symbol side quantity openPrice leverage contractSize marginUsed commission swap openedAt stopLoss takeProfit')
        .populate('userId', 'firstName email')
        .populate('tradingAccountId', 'accountNumber')
        .sort({ openedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Trade.countDocuments(query),
      Trade.aggregate([
        { $match: { bookType: 'A', status: 'OPEN' } },
        { $group: {
          _id: null,
          totalVolume: { $sum: '$quantity' },
          totalExposure: { $sum: { $divide: [{ $multiply: ['$quantity', '$contractSize', '$openPrice'] }, '$leverage'] } },
          count: { $sum: 1 }
        }}
      ])
    ])
    
    res.json({
      success: true,
      positions,
      summary: summary[0] || { totalVolume: 0, totalExposure: 0, count: 0 },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    })
  } catch (error) {
    console.error('Error fetching A-Book positions:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// Get A-Book history (closed trades) - Optimized for high volume
router.get('/a-book/history', async (req, res) => {
  try {
    const { page = 1, limit = 100, symbol, dateFrom, dateTo } = req.query
    
    let query = { bookType: 'A', status: 'CLOSED' }
    if (symbol) query.symbol = symbol
    if (dateFrom || dateTo) {
      query.closedAt = {}
      if (dateFrom) query.closedAt.$gte = new Date(dateFrom)
      if (dateTo) query.closedAt.$lte = new Date(dateTo)
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit)
    
    const [history, total, summary] = await Promise.all([
      Trade.find(query)
        .select('tradeId userId tradingAccountId symbol side quantity openPrice closePrice leverage contractSize realizedPnl openedAt closedAt closedBy')
        .populate('userId', 'firstName email')
        .populate('tradingAccountId', 'accountNumber')
        .sort({ closedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Trade.countDocuments(query),
      Trade.aggregate([
        { $match: { bookType: 'A', status: 'CLOSED' } },
        { $group: {
          _id: null,
          totalPnl: { $sum: '$realizedPnl' },
          totalVolume: { $sum: '$quantity' },
          count: { $sum: 1 },
          winCount: { $sum: { $cond: [{ $gte: ['$realizedPnl', 0] }, 1, 0] } },
          lossCount: { $sum: { $cond: [{ $lt: ['$realizedPnl', 0] }, 1, 0] } }
        }}
      ])
    ])
    
    res.json({
      success: true,
      history,
      summary: summary[0] || { totalPnl: 0, totalVolume: 0, count: 0, winCount: 0, lossCount: 0 },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    })
  } catch (error) {
    console.error('Error fetching A-Book history:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// Get A-Book trades (legacy - for backward compatibility)
router.get('/a-book/trades', async (req, res) => {
  try {
    const { status = 'OPEN', page = 1, limit = 50, symbol } = req.query
    
    let query = { bookType: 'A' }
    
    if (status && status !== 'ALL') {
      query.status = status
    }
    
    if (symbol) {
      query.symbol = symbol
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit)
    
    const trades = await Trade.find(query)
      .populate('userId', 'firstName email bookType')
      .populate('tradingAccountId', 'accountNumber accountName')
      .sort({ openedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean()
    
    const total = await Trade.countDocuments(query)
    
    // Calculate totals
    const openABookTrades = await Trade.find({ bookType: 'A', status: 'OPEN' }).lean()
    const totalExposure = openABookTrades.reduce((sum, t) => {
      const exposure = t.quantity * t.contractSize * t.openPrice / t.leverage
      return sum + exposure
    }, 0)
    
    const totalVolume = openABookTrades.reduce((sum, t) => sum + t.quantity, 0)
    
    res.json({
      success: true,
      trades,
      summary: {
        totalExposure,
        totalVolume,
        openTradesCount: openABookTrades.length
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    })
  } catch (error) {
    console.error('Error fetching A-Book trades:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// Get B-Book trades (for reference)
router.get('/b-book/trades', async (req, res) => {
  try {
    const { status = 'OPEN', page = 1, limit = 50, symbol } = req.query
    
    let query = { bookType: 'B' }
    
    if (status && status !== 'ALL') {
      query.status = status
    }
    
    if (symbol) {
      query.symbol = symbol
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit)
    
    const trades = await Trade.find(query)
      .populate('userId', 'firstName email bookType')
      .populate('tradingAccountId', 'accountNumber accountName')
      .sort({ openedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean()
    
    const total = await Trade.countDocuments(query)
    
    res.json({
      success: true,
      trades,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    })
  } catch (error) {
    console.error('Error fetching B-Book trades:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// ============================================
// LP CONNECTION SETTINGS
// ============================================

// GET /api/book-management/lp-status - Check LP connection status
router.get('/lp-status', async (req, res) => {
  try {
    const settings = getLpSettings()
    
    if (!settings.lpApiUrl) {
      return res.json({
        success: true,
        connected: false,
        message: 'LP API URL not configured'
      })
    }
    
    const baseUrl = settings.lpApiUrl.replace(/\/api\/?$/, '')
    const healthUrl = `${baseUrl}/health`
    
    try {
      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(3000)
      })
      
      if (response.ok) {
        res.json({
          success: true,
          connected: true,
          message: 'LP is connected and responding',
          lpUrl: settings.lpApiUrl
        })
      } else {
        res.json({
          success: true,
          connected: false,
          message: `LP returned status ${response.status}`
        })
      }
    } catch (fetchError) {
      res.json({
        success: true,
        connected: false,
        message: fetchError.code === 'ECONNREFUSED' 
          ? 'LP server is not running' 
          : fetchError.name === 'TimeoutError' 
            ? 'LP connection timed out' 
            : fetchError.message
      })
    }
  } catch (error) {
    console.error('Error checking LP status:', error)
    res.json({
      success: false,
      connected: false,
      message: 'Error checking LP status'
    })
  }
})

// GET /api/book-management/lp-settings - Get LP connection settings
router.get('/lp-settings', async (req, res) => {
  try {
    const settings = getLpSettings()
    
    const maskedSettings = {
      ...settings,
      lpApiKey: settings.lpApiKey ? `${settings.lpApiKey.substring(0, 8)}...${settings.lpApiKey.slice(-8)}` : '',
      lpApiSecret: settings.lpApiSecret ? `${'*'.repeat(32)}...${settings.lpApiSecret.slice(-8)}` : ''
    }
    
    res.json({
      success: true,
      settings: maskedSettings,
      fullSettings: settings
    })
  } catch (error) {
    console.error('Error fetching LP settings:', error)
    res.status(500).json({ success: false, message: 'Error fetching LP settings', error: error.message })
  }
})

// PUT /api/book-management/lp-settings - Update LP connection settings (runtime only)
router.put('/lp-settings', async (req, res) => {
  try {
    const { lpApiKey, lpApiSecret, lpApiUrl, corecenWsUrl } = req.body
    
    updateLpConfig({
      apiUrl: lpApiUrl || process.env.LP_API_URL || 'http://localhost:3001',
      apiKey: lpApiKey || process.env.LP_API_KEY || '',
      apiSecret: lpApiSecret || process.env.LP_API_SECRET || ''
    })
    
    console.log('[Book Management] LP settings updated (runtime)')
    
    res.json({
      success: true,
      message: 'LP settings updated (runtime only). For permanent changes, update .env file and restart server.'
    })
  } catch (error) {
    console.error('Error updating LP settings:', error)
    res.status(500).json({ success: false, message: 'Error updating LP settings', error: error.message })
  }
})

// POST /api/book-management/test-lp-connection - Test LP connection
router.post('/test-lp-connection', async (req, res) => {
  try {
    const { lpApiKey, lpApiSecret, lpApiUrl } = req.body
    
    if (!lpApiUrl) {
      return res.status(400).json({ success: false, message: 'LP API URL is required' })
    }
    
    const healthUrl = `${lpApiUrl}/health`
    
    console.log(`[Book Management] Testing LP connection to ${healthUrl}`)
    
    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000)
    })
    
    if (response.ok) {
      const data = await response.json()
      
      if (lpApiKey && lpApiSecret) {
        try {
          const timestamp = Date.now().toString()
          const method = 'GET'
          const path = '/api/v1/broker-api/trades/stats'
          const body = ''
          
          const signatureData = timestamp + method + path + body
          const signature = crypto.createHmac('sha256', lpApiSecret)
            .update(signatureData)
            .digest('hex')
          
          const authTestUrl = `${lpApiUrl}${path}`
          const authResponse = await fetch(authTestUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': lpApiKey,
              'X-Timestamp': timestamp,
              'X-Signature': signature
            },
            signal: AbortSignal.timeout(5000)
          })
          
          if (authResponse.ok) {
            res.json({
              success: true,
              message: 'Connection successful! LP is reachable and credentials are valid.',
              lpStatus: data
            })
          } else {
            const authData = await authResponse.json().catch(() => ({}))
            res.json({
              success: true,
              message: `LP is reachable but authentication failed: ${authData.error?.message || 'Check your API key and secret.'}`,
              lpStatus: data,
              authStatus: 'failed'
            })
          }
        } catch (authError) {
          res.json({
            success: true,
            message: 'LP is reachable. Authentication test skipped.',
            lpStatus: data
          })
        }
      } else {
        res.json({
          success: true,
          message: 'Connection successful! LP is reachable. Add API credentials for full integration.',
          lpStatus: data
        })
      }
    } else {
      res.json({
        success: false,
        message: `LP returned status ${response.status}. Check the URL and ensure LP is running.`
      })
    }
  } catch (error) {
    console.error('Error testing LP connection:', error)
    
    let message = 'Connection failed. '
    if (error.name === 'TimeoutError' || error.code === 'ETIMEDOUT') {
      message += 'Request timed out. Check if the LP server is running and accessible.'
    } else if (error.code === 'ECONNREFUSED') {
      message += 'Connection refused. Ensure the LP server is running on the specified URL.'
    } else {
      message += error.message
    }
    
    res.json({
      success: false,
      message
    })
  }
})

// GET /api/book-management/user/:id/book-type - Get user's book type
router.get('/user/:id/book-type', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('bookType')
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }
    
    res.json({
      success: true,
      bookType: user.bookType || 'B'
    })
  } catch (error) {
    console.error('Error fetching user book type:', error)
    res.status(500).json({ success: false, message: 'Error fetching book type', error: error.message })
  }
})

// PUT /api/book-management/users/:id/transfer - Transfer user to A or B book (alternative endpoint)
router.put('/users/:id/transfer', async (req, res) => {
  try {
    const { bookType } = req.body
    
    if (!bookType || !['A', 'B'].includes(bookType)) {
      return res.status(400).json({ success: false, message: 'Invalid book type. Must be A or B' })
    }
    
    const user = await User.findById(req.params.id)
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }
    
    const previousBookType = user.bookType
    user.bookType = bookType
    user.bookChangedAt = new Date()
    await user.save()
    
    console.log(`[Book Management] User ${user.email} transferred from ${previousBookType || 'B'} Book to ${bookType} Book`)
    
    let closedTradesCount = 0
    
    // If transferring from A-Book to B-Book, close all open trades on Corecen LP
    // Demo account trades must NEVER be synced to/from LP — only close real-account trades there
    if (bookType === 'B' && previousBookType === 'A') {
      try {
        const lpService = (await import('../services/lpService.js')).default

        // Find all open A-Book trades for this user, with account populated so we can skip demo ones
        const openTrades = await Trade.find({
          userId: user._id,
          bookType: 'A',
          status: 'OPEN'
        }).populate('tradingAccountId', 'isDemo')

        const realTrades = openTrades.filter(t => !t.tradingAccountId?.isDemo)
        const demoTrades = openTrades.filter(t => t.tradingAccountId?.isDemo)

        console.log(`[Book Management] Found ${openTrades.length} open A-Book trades (${realTrades.length} real, ${demoTrades.length} demo). Only real trades will be closed on LP.`)

        // Demo trades: just flip local bookType to B, do NOT touch LP
        for (const trade of demoTrades) {
          try {
            trade.bookType = 'B'
            trade.lpSyncStatus = 'NOT_APPLICABLE'
            await trade.save()
          } catch (tradeError) {
            console.error(`[Book Management] Error flipping demo trade ${trade.tradeId} to B-book:`, tradeError.message)
          }
        }

        // Real trades: close on Corecen LP and then flip local bookType to B
        for (const trade of realTrades) {
          try {
            // Set close data for LP sync
            trade.closePrice = trade.currentPrice || trade.openPrice
            trade.closedAt = new Date()
            trade.closedBy = 'ADMIN'
            trade.realizedPnl = 0 // Will be calculated by Corecen

            const lpResult = await lpService.closeTradeOnCorecen(trade)
            if (lpResult.success) {
              console.log(`[Book Management] Trade ${trade.tradeId} closed on Corecen LP`)
              closedTradesCount++
            } else {
              console.error(`[Book Management] Failed to close trade ${trade.tradeId} on Corecen: ${lpResult.error}`)
            }

            // Update local trade bookType to B (so it won't sync anymore)
            trade.bookType = 'B'
            trade.lpSyncStatus = 'NOT_APPLICABLE'
            await trade.save()
          } catch (tradeError) {
            console.error(`[Book Management] Error closing trade ${trade.tradeId}:`, tradeError.message)
          }
        }

        console.log(`[Book Management] Closed ${closedTradesCount}/${realTrades.length} real-account trades on Corecen LP`)
      } catch (closeError) {
        console.error('[Book Management] Error closing trades on LP:', closeError.message)
      }
    }
    
    res.json({
      success: true,
      message: `User transferred to ${bookType} Book successfully${closedTradesCount > 0 ? `. ${closedTradesCount} trades closed on LP.` : ''}`,
      user: {
        _id: user._id,
        firstName: user.firstName,
        email: user.email,
        bookType: user.bookType,
        bookChangedAt: user.bookChangedAt
      },
      closedTradesOnLP: closedTradesCount
    })
  } catch (error) {
    console.error('Error transferring user:', error)
    res.status(500).json({ success: false, message: 'Error transferring user', error: error.message })
  }
})

// PUT /api/book-management/users/bulk-transfer - Bulk transfer users to A or B book
router.put('/users/bulk-transfer', async (req, res) => {
  try {
    const { userIds, bookType } = req.body
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ success: false, message: 'No users selected' })
    }
    
    if (!bookType || !['A', 'B'].includes(bookType)) {
      return res.status(400).json({ success: false, message: 'Invalid book type. Must be A or B' })
    }
    
    const result = await User.updateMany(
      { _id: { $in: userIds } },
      { 
        $set: { 
          bookType: bookType,
          bookChangedAt: new Date()
        }
      }
    )
    
    console.log(`[Book Management] Bulk transferred ${result.modifiedCount} users to ${bookType} Book`)
    
    res.json({
      success: true,
      message: `${result.modifiedCount} users transferred to ${bookType} Book successfully`,
      modifiedCount: result.modifiedCount
    })
  } catch (error) {
    console.error('Error bulk transferring users:', error)
    res.status(500).json({ success: false, message: 'Error transferring users', error: error.message })
  }
})

export default router
