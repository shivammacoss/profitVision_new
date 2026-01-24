import express from 'express'
import oxapayService from '../services/oxapayService.js'
import Transaction from '../models/Transaction.js'
import Wallet from '../models/Wallet.js'
import User from '../models/User.js'
import PaymentGatewaySettings from '../models/PaymentGatewaySettings.js'
import { authenticateUser, authenticateSuperAdmin } from '../middleware/auth.js'

const router = express.Router()

/**
 * POST /api/oxapay/create-deposit
 * Create a crypto deposit invoice via OxaPay
 */
router.post('/create-deposit', async (req, res) => {
  try {
    const { amount, userId } = req.body
    
    // Try to get userId from auth token first, fallback to body
    let authenticatedUserId = userId
    
    // Try to verify token if provided
    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwt = await import('jsonwebtoken')
        const token = authHeader.split(' ')[1]
        const JWT_SECRET = process.env.JWT_SECRET || 'pv1x$3cur3K3y!2026@Pr0f1tV1s10nFX#Tr4d1ng$3rv3r'
        const decoded = jwt.default.verify(token, JWT_SECRET)
        authenticatedUserId = decoded.id
      } catch (tokenError) {
        console.log('Token verification failed, using userId from body:', tokenError.message)
      }
    }
    
    if (!authenticatedUserId) {
      return res.status(401).json({ success: false, message: 'User authentication required' })
    }

    // Check if OxaPay is enabled
    const settings = await PaymentGatewaySettings.getSettings()
    if (!settings.oxapayEnabled) {
      return res.status(400).json({ success: false, message: 'Crypto deposits are currently disabled' })
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' })
    }

    // Minimum deposit $10
    if (amount < 10) {
      return res.status(400).json({ success: false, message: 'Minimum deposit is $10' })
    }

    // Get user info
    const user = await User.findById(authenticatedUserId)
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }

    // Get or create wallet
    let wallet = await Wallet.findOne({ userId: authenticatedUserId })
    if (!wallet) {
      wallet = new Wallet({ userId: authenticatedUserId, balance: 0 })
      await wallet.save()
    }

    // Generate unique order ID
    const orderId = `DEP-${authenticatedUserId.toString().slice(-6)}-${Date.now()}`

    // Create OxaPay invoice
    let invoice
    try {
      invoice = await oxapayService.createInvoice({
        amount: parseFloat(amount),
        orderId: orderId,
        email: user.email,
        description: `Deposit $${amount} to ProfitVisionFX wallet`
      })
    } catch (oxaError) {
      console.error('[OxaPay] Invoice creation failed:', oxaError.message)
      // For localhost/development, return a mock response
      if (process.env.NODE_ENV !== 'production' || !process.env.OXAPAY_MERCHANT_API_KEY) {
        return res.status(400).json({ 
          success: false, 
          message: 'OxaPay API key not configured. Please configure OXAPAY_MERCHANT_API_KEY in environment variables.' 
        })
      }
      throw oxaError
    }

    // Create pending transaction
    const transaction = new Transaction({
      userId: authenticatedUserId,
      walletId: wallet._id,
      type: 'Deposit',
      amount: parseFloat(amount),
      paymentMethod: 'Crypto',
      transactionRef: invoice.trackId,
      status: 'Pending'
    })
    await transaction.save()

    // Update pending deposits
    wallet.pendingDeposits += parseFloat(amount)
    await wallet.save()

    console.log(`[OxaPay Deposit] Created invoice for user ${user.email}, amount: $${amount}, trackId: ${invoice.trackId}`)

    res.json({
      success: true,
      message: 'Payment invoice created',
      paymentUrl: invoice.paymentUrl,
      trackId: invoice.trackId,
      orderId: orderId,
      amount: amount,
      expiresAt: new Date(invoice.expiredAt * 1000).toISOString()
    })
  } catch (error) {
    console.error('[OxaPay] Create deposit error:', error)
    res.status(500).json({ success: false, message: error.message || 'Failed to create payment' })
  }
})

/**
 * POST /api/oxapay/webhook
 * Handle OxaPay payment callbacks (IPN)
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const rawBody = req.body.toString()
    const hmacHeader = req.headers['hmac']

    // Validate signature
    if (!oxapayService.validateWebhookSignature(rawBody, hmacHeader, 'payment')) {
      console.error('[OxaPay Webhook] Invalid signature')
      return res.status(401).json({ success: false, message: 'Invalid signature' })
    }

    const payload = JSON.parse(rawBody)
    const { track_id, status, amount, order_id, type, currency, txs } = payload

    console.log(`[OxaPay Webhook] Received: trackId=${track_id}, status=${status}, amount=${amount}, orderId=${order_id}`)

    // Find the transaction by track_id
    const transaction = await Transaction.findOne({ transactionRef: track_id })
    if (!transaction) {
      console.error(`[OxaPay Webhook] Transaction not found for trackId: ${track_id}`)
      return res.status(404).json({ success: false, message: 'Transaction not found' })
    }

    // Handle different statuses
    switch (status) {
      case 'Waiting':
        // Payment created, waiting for user to pay
        transaction.status = 'Pending'
        await transaction.save()
        break

      case 'Paying':
        // Payment received, awaiting confirmations
        transaction.status = 'Pending'
        transaction.adminRemarks = 'Payment received, awaiting blockchain confirmation'
        await transaction.save()
        break

      case 'Paid':
        // Payment confirmed - credit the user's wallet
        if (transaction.status !== 'Approved') {
          const wallet = await Wallet.findOne({ userId: transaction.userId })
          if (wallet) {
            // Remove from pending and add to balance
            wallet.pendingDeposits = Math.max(0, wallet.pendingDeposits - transaction.amount)
            wallet.balance += transaction.amount
            await wallet.save()

            transaction.status = 'Approved'
            transaction.processedAt = new Date()
            transaction.adminRemarks = `Auto-approved via OxaPay. Crypto: ${currency}, TxHash: ${txs?.[0]?.tx_hash || 'N/A'}`
            await transaction.save()

            console.log(`[OxaPay Webhook] Deposit approved for user ${transaction.userId}, amount: $${transaction.amount}`)
          }
        }
        break

      case 'Expired':
        // Payment expired
        if (transaction.status === 'Pending') {
          const wallet = await Wallet.findOne({ userId: transaction.userId })
          if (wallet) {
            wallet.pendingDeposits = Math.max(0, wallet.pendingDeposits - transaction.amount)
            await wallet.save()
          }

          transaction.status = 'Rejected'
          transaction.adminRemarks = 'Payment expired - no payment received'
          await transaction.save()

          console.log(`[OxaPay Webhook] Deposit expired for user ${transaction.userId}`)
        }
        break

      case 'Failed':
        // Payment failed
        if (transaction.status === 'Pending') {
          const wallet = await Wallet.findOne({ userId: transaction.userId })
          if (wallet) {
            wallet.pendingDeposits = Math.max(0, wallet.pendingDeposits - transaction.amount)
            await wallet.save()
          }

          transaction.status = 'Rejected'
          transaction.adminRemarks = 'Payment failed'
          await transaction.save()

          console.log(`[OxaPay Webhook] Deposit failed for user ${transaction.userId}`)
        }
        break

      default:
        console.log(`[OxaPay Webhook] Unknown status: ${status}`)
    }

    res.json({ success: true, message: 'Webhook processed' })
  } catch (error) {
    console.error('[OxaPay Webhook] Error:', error)
    res.status(500).json({ success: false, message: 'Webhook processing failed' })
  }
})

/**
 * POST /api/oxapay/simulate-webhook/:trackId
 * Simulate webhook for localhost testing (development only)
 */
router.post('/simulate-webhook/:trackId', async (req, res) => {
  try {
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ success: false, message: 'Not allowed in production' })
    }

    const { trackId } = req.params
    
    // Find the transaction
    const transaction = await Transaction.findOne({ transactionRef: trackId })
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' })
    }

    if (transaction.status === 'Approved') {
      return res.json({ success: true, message: 'Transaction already approved' })
    }

    // Credit the wallet
    const wallet = await Wallet.findOne({ userId: transaction.userId })
    if (wallet) {
      wallet.balance += transaction.amount
      wallet.pendingDeposits = Math.max(0, wallet.pendingDeposits - transaction.amount)
      await wallet.save()

      transaction.status = 'Approved'
      transaction.adminRemarks = 'Simulated webhook approval (development)'
      await transaction.save()

      console.log(`[OxaPay Simulate] Deposit approved for user ${transaction.userId}, amount: $${transaction.amount}`)
      
      return res.json({ 
        success: true, 
        message: `Deposit of $${transaction.amount} approved successfully`,
        newBalance: wallet.balance
      })
    }

    res.status(404).json({ success: false, message: 'Wallet not found' })
  } catch (error) {
    console.error('[OxaPay Simulate] Error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

/**
 * GET /api/oxapay/payment-status/:trackId
 * Check payment status
 */
router.get('/payment-status/:trackId', authenticateUser, async (req, res) => {
  try {
    const { trackId } = req.params

    // Get payment info from OxaPay
    const paymentInfo = await oxapayService.getPaymentInfo(trackId)

    // Also get local transaction
    const transaction = await Transaction.findOne({ transactionRef: trackId })

    res.json({
      success: true,
      oxapayStatus: paymentInfo.data?.status,
      localStatus: transaction?.status,
      amount: transaction?.amount,
      createdAt: transaction?.createdAt
    })
  } catch (error) {
    console.error('[OxaPay] Payment status error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

/**
 * GET /api/oxapay/supported-currencies
 * Get list of supported cryptocurrencies
 */
router.get('/supported-currencies', async (req, res) => {
  try {
    const currencies = await oxapayService.getSupportedCurrencies()
    res.json(currencies)
  } catch (error) {
    console.error('[OxaPay] Get currencies error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

/**
 * POST /api/oxapay/admin/payout
 * Admin processes a withdrawal by sending crypto to user's wallet address
 */
router.post('/admin/payout', authenticateSuperAdmin, async (req, res) => {
  try {
    const { transactionId, walletAddress, currency, network } = req.body

    if (!transactionId || !walletAddress) {
      return res.status(400).json({ success: false, message: 'Transaction ID and wallet address are required' })
    }

    // Find the pending withdrawal transaction
    const transaction = await Transaction.findById(transactionId)
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' })
    }

    if (transaction.type !== 'Withdrawal') {
      return res.status(400).json({ success: false, message: 'Transaction is not a withdrawal' })
    }

    if (transaction.status !== 'Pending') {
      return res.status(400).json({ success: false, message: 'Transaction already processed' })
    }

    // Get user info
    const user = await User.findById(transaction.userId)
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }

    // Generate unique order ID for payout
    const orderId = `PAYOUT-${transactionId.toString().slice(-8)}-${Date.now()}`

    // Create OxaPay payout
    const payout = await oxapayService.createPayout({
      address: walletAddress,
      amount: transaction.amount,
      currency: currency || 'USDT',
      network: network || 'TRC20',
      orderId: orderId,
      description: `Withdrawal payout to ${user.email}`
    })

    // Update transaction status
    transaction.status = 'Approved'
    transaction.transactionRef = payout.trackId
    transaction.adminRemarks = `Crypto payout sent. TrackID: ${payout.trackId}, Address: ${walletAddress}, Currency: ${currency || 'USDT'}`
    transaction.processedAt = new Date()
    transaction.processedBy = req.admin.id
    await transaction.save()

    // Update wallet - remove from pending withdrawals
    const wallet = await Wallet.findOne({ userId: transaction.userId })
    if (wallet) {
      wallet.pendingWithdrawals = Math.max(0, wallet.pendingWithdrawals - transaction.amount)
      await wallet.save()
    }

    console.log(`[OxaPay Admin Payout] Sent $${transaction.amount} to ${walletAddress} for user ${user.email}`)

    res.json({
      success: true,
      message: 'Payout sent successfully',
      trackId: payout.trackId,
      amount: transaction.amount,
      address: walletAddress,
      currency: currency || 'USDT'
    })
  } catch (error) {
    console.error('[OxaPay Admin Payout] Error:', error)
    res.status(500).json({ success: false, message: error.message || 'Failed to process payout' })
  }
})

/**
 * GET /api/oxapay/admin/balance
 * Get OxaPay merchant balance (admin only)
 */
router.get('/admin/balance', authenticateSuperAdmin, async (req, res) => {
  try {
    const balance = await oxapayService.getMerchantBalance()
    res.json(balance)
  } catch (error) {
    console.error('[OxaPay] Get balance error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

/**
 * GET /api/oxapay/admin/pending-withdrawals
 * Get all pending withdrawal transactions (admin only)
 */
router.get('/admin/pending-withdrawals', authenticateSuperAdmin, async (req, res) => {
  try {
    const withdrawals = await Transaction.find({ 
      type: 'Withdrawal', 
      status: 'Pending' 
    })
    .populate('userId', 'firstName lastName email')
    .sort({ createdAt: -1 })

    res.json({
      success: true,
      withdrawals: withdrawals
    })
  } catch (error) {
    console.error('[OxaPay] Get pending withdrawals error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

export default router
