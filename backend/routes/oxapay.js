import express from 'express'
import oxapayService from '../services/oxapayService.js'
import Transaction from '../models/Transaction.js'
import Wallet from '../models/Wallet.js'
import User from '../models/User.js'
import PaymentGatewaySettings from '../models/PaymentGatewaySettings.js'
import OxaPayWebhookLog from '../models/OxaPayWebhookLog.js'
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

    // Generate unique order ID - include full userId for webhook to find user
    const orderId = `DEP-${authenticatedUserId.toString()}-${Date.now()}`

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

    // NOTE: We do NOT create a transaction here anymore
    // Transaction will be created when webhook receives "Paying" or "Paid" status
    // This prevents showing pending deposits that user never actually paid
    
    // Store invoice info temporarily (will be used by webhook)
    // We use a simple in-memory store or rely on orderId pattern to reconstruct user info
    console.log(`[OxaPay Deposit] Created invoice for user ${user.email}, amount: $${amount}, trackId: ${invoice.trackId}, orderId: ${orderId}`)

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
 * 
 * HYBRID APPROVAL SYSTEM:
 * - All webhooks are logged for audit trail
 * - Idempotent handling prevents duplicate processing
 * - On "Paid" status: Set to "Auto-Verified" (visible to admin)
 * - Wallet credit depends on cryptoAutoCredit setting
 * - Admin can manually approve/reject Auto-Verified deposits
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress
  let webhookLog = null
  
  try {
    const rawBody = req.body.toString()
    const hmacHeader = req.headers['hmac']

    // Validate HMAC signature
    const hmacValid = oxapayService.validateWebhookSignature(rawBody, hmacHeader, 'payment')
    
    const payload = JSON.parse(rawBody)
    const { track_id, status, amount, order_id, currency, network, txs } = payload

    console.log(`[OxaPay Webhook] Received: trackId=${track_id}, status=${status}, amount=${amount}, orderId=${order_id}`)

    // Generate idempotency key to prevent duplicate processing
    const idempotencyKey = `${track_id}-${status}-${Date.now()}`
    
    // Check if this exact event was already processed
    const alreadyProcessed = await OxaPayWebhookLog.isAlreadyProcessed(track_id, status)
    if (alreadyProcessed && status === 'Paid') {
      console.log(`[OxaPay Webhook] Duplicate webhook ignored: ${track_id} - ${status}`)
      return res.json({ success: true, message: 'Already processed' })
    }

    // Extract blockchain details
    const txHash = txs?.[0]?.tx_hash || null
    const senderAddress = txs?.[0]?.address || null
    const confirmations = txs?.[0]?.confirmations || 0

    // Helper function to extract userId from order_id
    const extractUserId = (orderId) => {
      if (!orderId) return null
      const parts = orderId.split('-')
      if (parts.length >= 3 && parts[0] === 'DEP') {
        return parts[1]
      }
      return null
    }

    const userId = extractUserId(order_id)
    const user = userId ? await User.findById(userId) : null

    // Create webhook log entry for audit trail
    webhookLog = await OxaPayWebhookLog.create({
      trackId: track_id,
      orderId: order_id,
      status: status,
      amount: parseFloat(amount),
      currency: 'USD',
      cryptoCurrency: currency,
      network: network,
      txHash: txHash,
      senderAddress: senderAddress,
      confirmations: confirmations,
      userId: user?._id || null,
      userEmail: user?.email || null,
      rawPayload: payload,
      ipAddress: ipAddress,
      hmacValid: hmacValid,
      idempotencyKey: idempotencyKey
    })

    // Reject if HMAC is invalid
    if (!hmacValid) {
      console.error('[OxaPay Webhook] Invalid HMAC signature')
      webhookLog.processingError = 'Invalid HMAC signature'
      await webhookLog.save()
      return res.status(401).json({ success: false, message: 'Invalid signature' })
    }

    // Find existing transaction by trackId
    let transaction = await Transaction.findOne({ oxapayTrackId: track_id })
    
    // Get payment gateway settings for auto-credit decision
    const settings = await PaymentGatewaySettings.getSettings()
    const autoCredit = settings?.cryptoAutoCredit || false
    const manualThreshold = settings?.cryptoManualApprovalThreshold || 0

    // Handle different statuses
    switch (status) {
      case 'Waiting':
        // Invoice created, waiting for payment - log only
        console.log(`[OxaPay Webhook] Invoice waiting: ${track_id}`)
        webhookLog.processed = true
        webhookLog.processedAt = new Date()
        await webhookLog.save()
        break

      case 'Paying':
        // Payment detected, awaiting confirmations - create transaction as "Confirming"
        if (!transaction && user) {
          let wallet = await Wallet.findOne({ userId: user._id })
          if (!wallet) {
            wallet = new Wallet({ userId: user._id, balance: 0 })
            await wallet.save()
          }
          
          transaction = new Transaction({
            userId: user._id,
            walletId: wallet._id,
            type: 'Deposit',
            amount: parseFloat(amount),
            paymentMethod: 'Crypto (OxaPay)',
            transactionRef: track_id,
            oxapayTrackId: track_id,
            oxapayOrderId: order_id,
            cryptoCurrency: currency,
            cryptoNetwork: network,
            cryptoTxHash: txHash,
            cryptoSenderAddress: senderAddress,
            cryptoConfirmations: confirmations,
            status: 'Confirming',
            adminRemarks: 'Payment detected, awaiting blockchain confirmations',
            webhookLogId: webhookLog._id
          })
          await transaction.save()
          
          wallet.pendingDeposits = (wallet.pendingDeposits || 0) + parseFloat(amount)
          await wallet.save()
          
          webhookLog.transactionId = transaction._id
          console.log(`[OxaPay Webhook] Created confirming transaction for ${user.email}: $${amount}`)
        } else if (transaction) {
          transaction.cryptoConfirmations = confirmations
          transaction.adminRemarks = `Awaiting confirmations (${confirmations})`
          await transaction.save()
        }
        
        webhookLog.processed = true
        webhookLog.processedAt = new Date()
        await webhookLog.save()
        break

      case 'Paid':
        // Payment confirmed by blockchain
        if (!user) {
          console.error(`[OxaPay Webhook] User not found for order: ${order_id}`)
          webhookLog.processingError = 'User not found'
          webhookLog.processed = true
          webhookLog.processedAt = new Date()
          await webhookLog.save()
          break
        }

        let wallet = await Wallet.findOne({ userId: user._id })
        if (!wallet) {
          wallet = new Wallet({ userId: user._id, balance: 0 })
          await wallet.save()
        }

        // Determine if we should auto-credit or require admin approval
        const amountNum = parseFloat(amount)
        const requiresManualApproval = !autoCredit || (manualThreshold > 0 && amountNum >= manualThreshold)

        if (!transaction) {
          // Create new transaction (Paying webhook was missed)
          transaction = new Transaction({
            userId: user._id,
            walletId: wallet._id,
            type: 'Deposit',
            amount: amountNum,
            paymentMethod: 'Crypto (OxaPay)',
            transactionRef: track_id,
            oxapayTrackId: track_id,
            oxapayOrderId: order_id,
            cryptoCurrency: currency,
            cryptoNetwork: network,
            cryptoTxHash: txHash,
            cryptoSenderAddress: senderAddress,
            cryptoConfirmations: confirmations,
            autoVerified: true,
            autoVerifiedAt: new Date(),
            webhookLogId: webhookLog._id
          })
        } else {
          // Update existing transaction
          transaction.cryptoTxHash = txHash
          transaction.cryptoConfirmations = confirmations
          transaction.autoVerified = true
          transaction.autoVerifiedAt = new Date()
        }

        if (requiresManualApproval) {
          // ========== ADMIN APPROVAL REQUIRED ==========
          transaction.status = 'Auto-Verified'
          transaction.adminRemarks = `Blockchain confirmed. TxHash: ${txHash || 'N/A'}. Awaiting admin approval.`
          transaction.walletCredited = false
          
          // Keep in pending deposits until admin approves
          if (!transaction._id) {
            wallet.pendingDeposits = (wallet.pendingDeposits || 0) + amountNum
            await wallet.save()
          }
          
          console.log(`[OxaPay Webhook] Deposit AUTO-VERIFIED (awaiting admin): ${user.email}, $${amountNum}`)
        } else {
          // ========== AUTO-CREDIT ENABLED ==========
          transaction.status = 'Approved'
          transaction.processedAt = new Date()
          transaction.adminRemarks = `Auto-approved. TxHash: ${txHash || 'N/A'}`
          transaction.walletCredited = true
          transaction.walletCreditedAt = new Date()
          
          // Credit wallet immediately
          wallet.pendingDeposits = Math.max(0, (wallet.pendingDeposits || 0) - amountNum)
          wallet.balance = (wallet.balance || 0) + amountNum
          await wallet.save()
          
          console.log(`[OxaPay Webhook] Deposit AUTO-CREDITED: ${user.email}, $${amountNum}`)
        }

        await transaction.save()
        webhookLog.transactionId = transaction._id
        webhookLog.processed = true
        webhookLog.processedAt = new Date()
        await webhookLog.save()
        break

      case 'Expired':
        if (transaction && ['Pending', 'Confirming'].includes(transaction.status)) {
          const wallet = await Wallet.findOne({ userId: transaction.userId })
          if (wallet) {
            wallet.pendingDeposits = Math.max(0, (wallet.pendingDeposits || 0) - transaction.amount)
            await wallet.save()
          }
          transaction.status = 'Rejected'
          transaction.adminRemarks = 'Payment expired - blockchain confirmation timeout'
          await transaction.save()
          console.log(`[OxaPay Webhook] Deposit expired: ${transaction.userId}`)
        }
        webhookLog.processed = true
        webhookLog.processedAt = new Date()
        await webhookLog.save()
        break

      case 'Failed':
        if (transaction && ['Pending', 'Confirming'].includes(transaction.status)) {
          const wallet = await Wallet.findOne({ userId: transaction.userId })
          if (wallet) {
            wallet.pendingDeposits = Math.max(0, (wallet.pendingDeposits || 0) - transaction.amount)
            await wallet.save()
          }
          transaction.status = 'Rejected'
          transaction.adminRemarks = 'Payment failed on blockchain'
          await transaction.save()
          console.log(`[OxaPay Webhook] Deposit failed: ${transaction.userId}`)
        }
        webhookLog.processed = true
        webhookLog.processedAt = new Date()
        await webhookLog.save()
        break

      default:
        console.log(`[OxaPay Webhook] Unknown status: ${status}`)
        webhookLog.status = 'Unknown'
        webhookLog.processed = true
        webhookLog.processedAt = new Date()
        await webhookLog.save()
    }

    res.json({ success: true, message: 'Webhook processed' })
  } catch (error) {
    console.error('[OxaPay Webhook] Error:', error)
    if (webhookLog) {
      webhookLog.processingError = error.message
      webhookLog.processed = true
      webhookLog.processedAt = new Date()
      await webhookLog.save()
    }
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

// ==================== CRYPTO DEPOSIT ADMIN ROUTES ====================

/**
 * GET /api/oxapay/admin/crypto-deposits
 * Get all crypto deposits for admin review
 * Includes: Confirming, Auto-Verified, Approved, Rejected
 */
router.get('/admin/crypto-deposits', authenticateSuperAdmin, async (req, res) => {
  try {
    const { status, limit = 100 } = req.query
    
    const query = {
      paymentMethod: 'Crypto (OxaPay)',
      type: 'Deposit'
    }
    
    if (status) {
      query.status = status
    }
    
    const deposits = await Transaction.find(query)
      .populate('userId', 'firstName lastName email phone')
      .populate('webhookLogId')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
    
    // Get counts by status
    const counts = await Transaction.aggregate([
      { $match: { paymentMethod: 'Crypto (OxaPay)', type: 'Deposit' } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ])
    
    const statusCounts = {}
    counts.forEach(c => { statusCounts[c._id] = c.count })
    
    res.json({
      success: true,
      deposits,
      counts: statusCounts,
      total: deposits.length
    })
  } catch (error) {
    console.error('[OxaPay Admin] Get crypto deposits error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

/**
 * GET /api/oxapay/admin/pending-crypto-deposits
 * Get crypto deposits awaiting admin approval (Auto-Verified status)
 */
router.get('/admin/pending-crypto-deposits', authenticateSuperAdmin, async (req, res) => {
  try {
    const deposits = await Transaction.find({
      paymentMethod: 'Crypto (OxaPay)',
      type: 'Deposit',
      status: { $in: ['Auto-Verified', 'Confirming'] }
    })
      .populate('userId', 'firstName lastName email phone')
      .populate('webhookLogId')
      .sort({ createdAt: -1 })
    
    res.json({
      success: true,
      deposits,
      total: deposits.length
    })
  } catch (error) {
    console.error('[OxaPay Admin] Get pending crypto deposits error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

/**
 * POST /api/oxapay/admin/approve-crypto-deposit/:transactionId
 * Admin approves a crypto deposit and credits the wallet
 * Double-credit protection included
 */
router.post('/admin/approve-crypto-deposit/:transactionId', authenticateSuperAdmin, async (req, res) => {
  try {
    const { transactionId } = req.params
    const { adminRemarks } = req.body
    
    const transaction = await Transaction.findById(transactionId)
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' })
    }
    
    if (transaction.type !== 'Deposit' || transaction.paymentMethod !== 'Crypto (OxaPay)') {
      return res.status(400).json({ success: false, message: 'Not a crypto deposit' })
    }
    
    // Double-credit protection
    if (transaction.walletCredited) {
      return res.status(400).json({ 
        success: false, 
        message: 'Wallet already credited for this transaction',
        creditedAt: transaction.walletCreditedAt
      })
    }
    
    if (transaction.status === 'Approved') {
      return res.status(400).json({ success: false, message: 'Transaction already approved' })
    }
    
    if (transaction.status === 'Rejected') {
      return res.status(400).json({ success: false, message: 'Cannot approve a rejected transaction' })
    }
    
    // Credit the wallet
    const wallet = await Wallet.findOne({ userId: transaction.userId })
    if (!wallet) {
      return res.status(404).json({ success: false, message: 'User wallet not found' })
    }
    
    // Remove from pending and add to balance
    wallet.pendingDeposits = Math.max(0, (wallet.pendingDeposits || 0) - transaction.amount)
    wallet.balance = (wallet.balance || 0) + transaction.amount
    await wallet.save()
    
    // Update transaction
    transaction.status = 'Approved'
    transaction.walletCredited = true
    transaction.walletCreditedAt = new Date()
    transaction.processedAt = new Date()
    // Only set processedBy if it's a valid ObjectId (not super-admin string)
    if (req.admin.id && req.admin.id !== 'super-admin' && /^[0-9a-fA-F]{24}$/.test(req.admin.id)) {
      transaction.processedBy = req.admin.id
    }
    transaction.adminRemarks = adminRemarks || `Approved by admin. TxHash: ${transaction.cryptoTxHash || 'N/A'}`
    await transaction.save()
    
    console.log(`[OxaPay Admin] Crypto deposit approved: $${transaction.amount} for user ${transaction.userId}`)
    
    res.json({
      success: true,
      message: `Deposit of $${transaction.amount} approved and credited`,
      transaction: {
        _id: transaction._id,
        amount: transaction.amount,
        status: transaction.status,
        walletCredited: transaction.walletCredited
      },
      newWalletBalance: wallet.balance
    })
  } catch (error) {
    console.error('[OxaPay Admin] Approve crypto deposit error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

/**
 * POST /api/oxapay/admin/reject-crypto-deposit/:transactionId
 * Admin rejects a crypto deposit
 */
router.post('/admin/reject-crypto-deposit/:transactionId', authenticateSuperAdmin, async (req, res) => {
  try {
    const { transactionId } = req.params
    const { reason } = req.body
    
    if (!reason) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required' })
    }
    
    const transaction = await Transaction.findById(transactionId)
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' })
    }
    
    if (transaction.type !== 'Deposit' || transaction.paymentMethod !== 'Crypto (OxaPay)') {
      return res.status(400).json({ success: false, message: 'Not a crypto deposit' })
    }
    
    if (transaction.walletCredited) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot reject - wallet already credited. Contact support for refund process.'
      })
    }
    
    if (transaction.status === 'Rejected') {
      return res.status(400).json({ success: false, message: 'Transaction already rejected' })
    }
    
    // Remove from pending deposits
    const wallet = await Wallet.findOne({ userId: transaction.userId })
    if (wallet) {
      wallet.pendingDeposits = Math.max(0, (wallet.pendingDeposits || 0) - transaction.amount)
      await wallet.save()
    }
    
    // Update transaction
    transaction.status = 'Rejected'
    transaction.processedAt = new Date()
    transaction.processedBy = req.admin.id
    transaction.adminRemarks = `Rejected: ${reason}`
    await transaction.save()
    
    console.log(`[OxaPay Admin] Crypto deposit rejected: $${transaction.amount} for user ${transaction.userId}. Reason: ${reason}`)
    
    res.json({
      success: true,
      message: 'Deposit rejected',
      transaction: {
        _id: transaction._id,
        amount: transaction.amount,
        status: transaction.status,
        adminRemarks: transaction.adminRemarks
      }
    })
  } catch (error) {
    console.error('[OxaPay Admin] Reject crypto deposit error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

/**
 * GET /api/oxapay/admin/webhook-logs
 * Get all webhook logs for audit
 */
router.get('/admin/webhook-logs', authenticateSuperAdmin, async (req, res) => {
  try {
    const { trackId, status, limit = 100 } = req.query
    
    const query = {}
    if (trackId) query.trackId = trackId
    if (status) query.status = status
    
    const logs = await OxaPayWebhookLog.find(query)
      .populate('userId', 'firstName lastName email')
      .populate('transactionId')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
    
    res.json({
      success: true,
      logs,
      total: logs.length
    })
  } catch (error) {
    console.error('[OxaPay Admin] Get webhook logs error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

/**
 * GET /api/oxapay/admin/payment-history/:trackId
 * Get complete payment history for a specific OxaPay payment
 */
router.get('/admin/payment-history/:trackId', authenticateSuperAdmin, async (req, res) => {
  try {
    const { trackId } = req.params
    
    // Get all webhook logs for this payment
    const webhookLogs = await OxaPayWebhookLog.getPaymentHistory(trackId)
    
    // Get the transaction
    const transaction = await Transaction.findOne({ oxapayTrackId: trackId })
      .populate('userId', 'firstName lastName email phone')
      .populate('processedBy', 'firstName lastName email')
    
    // Get OxaPay status if available
    let oxapayStatus = null
    try {
      const paymentInfo = await oxapayService.getPaymentInfo(trackId)
      oxapayStatus = paymentInfo.data
    } catch (e) {
      console.log(`[OxaPay Admin] Could not fetch OxaPay status for ${trackId}:`, e.message)
    }
    
    res.json({
      success: true,
      trackId,
      transaction,
      webhookLogs,
      oxapayStatus,
      timeline: webhookLogs.map(log => ({
        status: log.status,
        timestamp: log.createdAt,
        processed: log.processed,
        error: log.processingError
      }))
    })
  } catch (error) {
    console.error('[OxaPay Admin] Get payment history error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

/**
 * POST /api/oxapay/admin/verify-payment/:trackId
 * Manually verify a payment from OxaPay and create/update transaction
 * Use this when webhook didn't arrive (e.g., callback URL misconfigured)
 */
router.post('/admin/verify-payment/:trackId', authenticateSuperAdmin, async (req, res) => {
  try {
    const { trackId } = req.params
    const { userId } = req.body
    
    if (!trackId) {
      return res.status(400).json({ success: false, message: 'Track ID is required' })
    }
    
    // Check if transaction already exists
    let transaction = await Transaction.findOne({ oxapayTrackId: trackId })
    if (transaction) {
      return res.json({
        success: true,
        message: 'Transaction already exists',
        transaction,
        alreadyExists: true
      })
    }
    
    // Fetch payment info from OxaPay
    let paymentInfo
    try {
      paymentInfo = await oxapayService.getPaymentInfo(trackId)
    } catch (e) {
      return res.status(400).json({ success: false, message: `Could not fetch payment from OxaPay: ${e.message}` })
    }
    
    const payment = paymentInfo.data
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found in OxaPay' })
    }
    
    // Check payment status (OxaPay returns status in different formats)
    const paymentStatus = payment.status || payment.paymentStatus
    if (paymentStatus !== 'Paid' && paymentStatus !== 'paid') {
      return res.status(400).json({ 
        success: false, 
        message: `Payment status is "${paymentStatus}", not "Paid". Cannot verify.`,
        oxapayStatus: paymentStatus,
        fullResponse: payment
      })
    }
    
    // Extract userId from order_id or orderId or use provided userId
    const orderId = payment.order_id || payment.orderId
    let targetUserId = userId
    if (!targetUserId && orderId) {
      const parts = orderId.split('-')
      if (parts.length >= 3 && parts[0] === 'DEP') {
        targetUserId = parts[1]
      }
    }
    
    if (!targetUserId) {
      return res.status(400).json({ success: false, message: 'Could not determine user. Please provide userId in request body.' })
    }
    
    const user = await User.findById(targetUserId)
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }
    
    // Get or create wallet
    let wallet = await Wallet.findOne({ userId: user._id })
    if (!wallet) {
      wallet = new Wallet({ userId: user._id, balance: 0 })
      await wallet.save()
    }
    
    const amount = parseFloat(payment.amount)
    
    // Create transaction as Auto-Verified (admin can then approve)
    const txHash = payment.txHash || payment.txs?.[0]?.tx_hash || null
    const senderAddress = payment.senderAddress || payment.txs?.[0]?.address || null
    const confirmations = payment.confirmations || payment.txs?.[0]?.confirmations || 0
    const cryptoCurrency = payment.currency || payment.cryptoCurrency || null
    const cryptoNetwork = payment.network || payment.cryptoNetwork || null
    
    transaction = new Transaction({
      userId: user._id,
      walletId: wallet._id,
      type: 'Deposit',
      amount: amount,
      paymentMethod: 'Crypto (OxaPay)',
      transactionRef: trackId,
      oxapayTrackId: trackId,
      oxapayOrderId: orderId,
      cryptoCurrency: cryptoCurrency,
      cryptoNetwork: cryptoNetwork,
      cryptoTxHash: txHash,
      cryptoSenderAddress: senderAddress,
      cryptoConfirmations: confirmations,
      status: 'Auto-Verified',
      autoVerified: true,
      autoVerifiedAt: new Date(),
      adminRemarks: `Manually verified by admin. OxaPay status: ${paymentStatus}. TxHash: ${txHash || 'N/A'}`
    })
    await transaction.save()
    
    // Add to pending deposits
    wallet.pendingDeposits = (wallet.pendingDeposits || 0) + amount
    await wallet.save()
    
    console.log(`[OxaPay Admin] Manually verified payment: $${amount} for user ${user.email}, trackId: ${trackId}`)
    
    res.json({
      success: true,
      message: `Payment of $${amount} verified and transaction created. Admin can now approve to credit wallet.`,
      transaction: {
        _id: transaction._id,
        amount: transaction.amount,
        status: transaction.status,
        userId: user._id,
        userEmail: user.email
      },
      oxapayData: payment
    })
  } catch (error) {
    console.error('[OxaPay Admin] Verify payment error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

/**
 * GET /api/oxapay/admin/settings
 * Get crypto payment gateway settings
 */
router.get('/admin/settings', authenticateSuperAdmin, async (req, res) => {
  try {
    const settings = await PaymentGatewaySettings.getSettings()
    res.json({
      success: true,
      settings: {
        oxapayEnabled: settings.oxapayEnabled,
        cryptoAutoCredit: settings.cryptoAutoCredit,
        cryptoManualApprovalThreshold: settings.cryptoManualApprovalThreshold,
        cryptoNotifyAdmin: settings.cryptoNotifyAdmin,
        oxapayPayoutEnabled: settings.oxapayPayoutEnabled,
        cryptoMinWithdrawal: settings.cryptoMinWithdrawal,
        cryptoMaxWithdrawal: settings.cryptoMaxWithdrawal
      }
    })
  } catch (error) {
    console.error('[OxaPay Admin] Get settings error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

/**
 * PUT /api/oxapay/admin/settings
 * Update crypto payment gateway settings
 */
router.put('/admin/settings', authenticateSuperAdmin, async (req, res) => {
  try {
    const {
      oxapayEnabled,
      cryptoAutoCredit,
      cryptoManualApprovalThreshold,
      cryptoNotifyAdmin,
      oxapayPayoutEnabled,
      cryptoMinWithdrawal,
      cryptoMaxWithdrawal
    } = req.body
    
    const settings = await PaymentGatewaySettings.getSettings()
    
    if (oxapayEnabled !== undefined) settings.oxapayEnabled = oxapayEnabled
    if (cryptoAutoCredit !== undefined) settings.cryptoAutoCredit = cryptoAutoCredit
    if (cryptoManualApprovalThreshold !== undefined) settings.cryptoManualApprovalThreshold = cryptoManualApprovalThreshold
    if (cryptoNotifyAdmin !== undefined) settings.cryptoNotifyAdmin = cryptoNotifyAdmin
    if (oxapayPayoutEnabled !== undefined) settings.oxapayPayoutEnabled = oxapayPayoutEnabled
    if (cryptoMinWithdrawal !== undefined) settings.cryptoMinWithdrawal = cryptoMinWithdrawal
    if (cryptoMaxWithdrawal !== undefined) settings.cryptoMaxWithdrawal = cryptoMaxWithdrawal
    
    settings.updatedBy = req.admin.id
    await settings.save()
    
    console.log(`[OxaPay Admin] Settings updated by admin ${req.admin.id}`)
    
    res.json({
      success: true,
      message: 'Settings updated',
      settings
    })
  } catch (error) {
    console.error('[OxaPay Admin] Update settings error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

export default router
