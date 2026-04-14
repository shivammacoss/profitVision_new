import express from 'express'
import mongoose from 'mongoose'
import cors from 'cors'
import dotenv from 'dotenv'
import { createServer } from 'http'
import { Server } from 'socket.io'
import authRoutes from './routes/auth.js'
import adminRoutes from './routes/admin.js'
import accountTypesRoutes from './routes/accountTypes.js'
import tradingAccountsRoutes from './routes/tradingAccounts.js'
import walletRoutes from './routes/wallet.js'
import paymentMethodsRoutes from './routes/paymentMethods.js'
import tradeRoutes from './routes/trade.js'
import walletTransferRoutes from './routes/walletTransfer.js'
import adminTradeRoutes from './routes/adminTrade.js'
import copyTradingRoutes from './routes/copyTrading.js'
import ibRoutes from './routes/ibNew.js'
import propTradingRoutes from './routes/propTrading.js'
import chargesRoutes from './routes/charges.js'
import pricesRoutes from './routes/prices.js'
import earningsRoutes from './routes/earnings.js'
import supportRoutes from './routes/support.js'
import kycRoutes from './routes/kyc.js'
import themeRoutes from './routes/theme.js'
import adminManagementRoutes from './routes/adminManagement.js'
import uploadRoutes from './routes/upload.js'
import newsRoutes from './routes/news.js'
import notificationsRoutes from './routes/notifications.js'
import bookManagementRoutes from './routes/bookManagement.js'
import referralRoutes from './routes/referralRoutes.js'
import superAdminRoutes from './routes/superAdmin.js'
import emailRoutes from './routes/email.js'
import oxapayRoutes from './routes/oxapay.js'
import paymentGatewaySettingsRoutes from './routes/paymentGatewaySettings.js'
import creditRoutes from './routes/credit.js'
import ibModeRoutes from './routes/ibMode.js'
import lpIntegrationRoutes, { getAllLpPrices } from './routes/lpIntegration.js'
import chartsRoutes from './routes/charts.js'
import { startPeriodicFlush } from './services/candleAggregator.js'
import lpConnectionMonitor from './services/lpConnectionMonitor.js'
import manualCryptoRoutes from './routes/manualCrypto.js'
import contactRoutes from './routes/contact.js'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

const app = express()
const httpServer = createServer(app)

// CORS configuration
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'
const TRADE_URL = process.env.TRADE_URL || 'http://localhost:5173'
const ADMIN_URL = process.env.ADMIN_URL || 'http://localhost:5173'
const allowedOrigins = process.env.NODE_ENV === 'production' 
  ? [FRONTEND_URL, TRADE_URL, ADMIN_URL, 'https://profitvisionfx.com', 'https://www.profitvisionfx.com', 'https://trade.profitvisionfx.com', 'https://admin.profitvisionfx.com', 'https://api.profitvisionfx.com'] 
  : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173']

// Socket.IO for real-time updates
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
})

// Store connected clients
const connectedClients = new Map()
const priceSubscribers = new Set()

// Price cache - populated by Corecen LP via /api/lp/prices endpoints
// All prices come from Infoway via Corecen LP - no fallback needed

// Background price streaming - uses LP prices from Corecen only
async function streamPrices() {
  if (priceSubscribers.size === 0) return
  
  const now = Date.now()
  const lpPrices = getAllLpPrices()
  
  if (lpPrices.size === 0) {
    // No prices available yet - waiting for Corecen LP
    return
  }
  
  const prices = {}
  const updated = {}
  for (const [symbol, data] of lpPrices) {
    prices[symbol] = { bid: data.bid, ask: data.ask, time: data.time || now }
    // Mark as updated if recent (within last 2 seconds)
    if (data.time && (now - data.time) < 2000) {
      updated[symbol] = prices[symbol]
    }
  }
  
  io.to('prices').emit('priceStream', {
    prices,
    updated,
    timestamp: now,
    source: 'CORECEN_LP'
  })
}

// Start price streaming interval (broadcasts LP prices or fallback)
setInterval(streamPrices, 500)

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id)

  // Subscribe to real-time price stream
  socket.on('subscribePrices', async () => {
    socket.join('prices')
    priceSubscribers.add(socket.id)
    
    const now = Date.now()
    const lpPrices = getAllLpPrices()
    
    // Send LP prices from Corecen
    const prices = {}
    for (const [symbol, data] of lpPrices) {
      prices[symbol] = { bid: data.bid, ask: data.ask, time: data.time || now }
    }
    socket.emit('priceStream', {
      prices,
      updated: {},
      timestamp: now,
      source: 'CORECEN_LP'
    })
    console.log(`Socket ${socket.id} subscribed to price stream (LP), cache size: ${lpPrices.size}`)
  })

  // Unsubscribe from price stream
  socket.on('unsubscribePrices', () => {
    socket.leave('prices')
    priceSubscribers.delete(socket.id)
  })

  // Subscribe to account updates
  socket.on('subscribe', (data) => {
    const { tradingAccountId } = data
    if (tradingAccountId) {
      socket.join(`account:${tradingAccountId}`)
      connectedClients.set(socket.id, tradingAccountId)
      console.log(`Socket ${socket.id} subscribed to account ${tradingAccountId}`)
    }
  })

  // Unsubscribe from account updates
  socket.on('unsubscribe', (data) => {
    const { tradingAccountId } = data
    if (tradingAccountId) {
      socket.leave(`account:${tradingAccountId}`)
      connectedClients.delete(socket.id)
    }
  })

  // Subscribe to price stream
  socket.on('subscribePrices', () => {
    socket.join('prices')
    priceSubscribers.add(socket.id)
    console.log(`Socket ${socket.id} subscribed to price stream`)
    
    // Send current prices immediately
    const lpPrices = getAllLpPrices()
    if (lpPrices && lpPrices.size > 0) {
      socket.emit('priceStream', {
        prices: Object.fromEntries(lpPrices),
        updated: {},
        timestamp: Date.now()
      })
    }
  })

  // Unsubscribe from price stream
  socket.on('unsubscribePrices', () => {
    socket.leave('prices')
    priceSubscribers.delete(socket.id)
    console.log(`Socket ${socket.id} unsubscribed from price stream`)
  })

  // Handle price updates from client (for PnL calculation)
  socket.on('priceUpdate', async (data) => {
    const { tradingAccountId, prices } = data
    if (tradingAccountId && prices) {
      // Broadcast updated account summary to all subscribers
      io.to(`account:${tradingAccountId}`).emit('accountUpdate', {
        tradingAccountId,
        prices,
        timestamp: Date.now()
      })
    }
  })

  // Subscribe to credit/refill updates for a user
  socket.on('subscribeCreditUpdates', (data) => {
    const { userId } = data
    if (userId) {
      socket.join(`user:${userId}`)
      console.log(`Socket ${socket.id} subscribed to credit updates for user ${userId}`)
    }
  })

  // Unsubscribe from credit updates
  socket.on('unsubscribeCreditUpdates', (data) => {
    const { userId } = data
    if (userId) {
      socket.leave(`user:${userId}`)
    }
  })

  socket.on('disconnect', () => {
    connectedClients.delete(socket.id)
    priceSubscribers.delete(socket.id)
    console.log('Client disconnected:', socket.id)
  })
})

// Make io accessible to routes
app.set('io', io)

// Initialize copyTradingEngine with Socket.IO for real-time credit updates
import copyTradingEngine from './services/copyTradingEngine.js'
copyTradingEngine.setSocketIO(io)

// Middleware
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) return callback(null, true)
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true
}))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err))

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/account-types', accountTypesRoutes)
app.use('/api/trading-accounts', tradingAccountsRoutes)
app.use('/api/wallet', walletRoutes)
app.use('/api/payment-methods', paymentMethodsRoutes)
app.use('/api/trade', tradeRoutes)
app.use('/api/wallet-transfer', walletTransferRoutes)
app.use('/api/admin/trade', adminTradeRoutes)
app.use('/api/copy', copyTradingRoutes)
app.use('/api/ib', ibRoutes)
app.use('/api/prop', propTradingRoutes)
app.use('/api/charges', chargesRoutes)
app.use('/api/prices', pricesRoutes)
app.use('/api/earnings', earningsRoutes)
app.use('/api/support', supportRoutes)
app.use('/api/kyc', kycRoutes)
app.use('/api/theme', themeRoutes)
app.use('/api/admin-mgmt', adminManagementRoutes)
app.use('/api/upload', uploadRoutes)
app.use('/api/news', newsRoutes)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/book-management', bookManagementRoutes)
app.use('/api/referral', referralRoutes)
app.use('/api/super-admin', superAdminRoutes)
app.use('/api/email', emailRoutes)
app.use('/api/oxapay', oxapayRoutes)
app.use('/api/payment-gateway', paymentGatewaySettingsRoutes)
app.use('/api/credit', creditRoutes)
app.use('/api/ib-mode', ibModeRoutes)
app.use('/api/lp', lpIntegrationRoutes)
app.use('/api/charts', chartsRoutes)
app.use('/api/manual-crypto', manualCryptoRoutes)
app.use('/api/contact', contactRoutes)

// Make io globally accessible for LP price updates
global.io = io

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'ProfitVisionFX API is running', version: '1.0.0' })
})

// LP Connection Health Check
app.get('/api/lp-health', async (req, res) => {
  try {
    const status = await lpConnectionMonitor.forceHealthCheck()
    res.json({ success: true, lpConnection: status, timestamp: new Date().toISOString() })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, timestamp: new Date().toISOString() })
  }
})

const PORT = process.env.PORT || 5000
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`)
  
  // Start LP connection monitor - pings Corecen every 30 seconds
  lpConnectionMonitor.startMonitor()
  // Start candle aggregator periodic flush
  startPeriodicFlush()
})
