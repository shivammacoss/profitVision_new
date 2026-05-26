import express from 'express'
import ManualCryptoWallet from '../models/ManualCryptoWallet.js'
import Transaction from '../models/Transaction.js'
import Wallet from '../models/Wallet.js'
import User from '../models/User.js'
import { authenticateUser, authenticateSuperAdmin } from '../middleware/auth.js'
import referralEngine from '../services/referralEngine.js'

const router = express.Router()

// ============================================
// USER ROUTES
// ============================================

/**
 * GET /api/manual-crypto/wallets
 * Get all active manual crypto wallets for users
 */
router.get('/wallets', async (req, res) => {
  try {
    const wallets = await ManualCryptoWallet.getActiveWallets()
    
    res.json({
      success: true,
      wallets: wallets.map(w => ({
        _id: w._id,
        currency: w.currency,
        network: w.network,
        address: w.address,
        qrCodeData: w.qrCodeData,
        displayName: w.displayName || `${w.currency} (${w.network})`,
        feePercentage: w.feePercentage,
        minDeposit: w.minDeposit,
        maxDeposit: w.maxDeposit,
        instructions: w.instructions
      }))
    })
  } catch (error) {
    console.error('[ManualCrypto] Error fetching wallets:', error)
    res.status(500).json({ success: false, message: 'Error fetching wallets' })
  }
})

/**
 * POST /api/manual-crypto/calculate-fee
 * Calculate fee for a deposit amount
 */
router.post('/calculate-fee', async (req, res) => {
  try {
    const { walletId, amount } = req.body
    
    if (!walletId || !amount) {
      return res.status(400).json({ success: false, message: 'Wallet ID and amount required' })
    }
    
    const wallet = await ManualCryptoWallet.findById(walletId)
    if (!wallet || !wallet.isActive) {
      return res.status(404).json({ success: false, message: 'Wallet not found or inactive' })
    }
    
    const calculation = wallet.calculateTotal(parseFloat(amount))
    
    // Also calculate OxaPay fee for comparison (1.5%)
    const oxapayFee = parseFloat(amount) * 0.015
    const oxapayTotal = parseFloat(amount) + oxapayFee
    
    res.json({
      success: true,
      manual: {
        ...calculation,
        currency: wallet.currency,
        network: wallet.network
      },
      oxapay: {
        depositAmount: parseFloat(amount),
        feePercentage: 1.5,
        feeAmount: parseFloat(oxapayFee.toFixed(2)),
        totalToPay: parseFloat(oxapayTotal.toFixed(2))
      },
      savings: parseFloat((oxapayTotal - calculation.totalToPay).toFixed(2))
    })
  } catch (error) {
    console.error('[ManualCrypto] Error calculating fee:', error)
    res.status(500).json({ success: false, message: 'Error calculating fee' })
  }
})

/**
 * POST /api/manual-crypto/submit-deposit
 * User submits a manual crypto deposit request
 */
router.post('/submit-deposit', authenticateUser, async (req, res) => {
  try {
    const { walletId, amount, txHash, screenshotUrl } = req.body
    const userId = req.user.id || req.user._id
    
    if (!walletId || !amount || !txHash) {
      return res.status(400).json({ 
        success: false, 
        message: 'Wallet ID, amount, and transaction hash are required' 
      })
    }
    
    const wallet = await ManualCryptoWallet.findById(walletId)
    if (!wallet || !wallet.isActive) {
      return res.status(404).json({ success: false, message: 'Wallet not found or inactive' })
    }
    
    const depositAmount = parseFloat(amount)
    
    // Validate amount
    if (depositAmount < wallet.minDeposit) {
      return res.status(400).json({ 
        success: false, 
        message: `Minimum deposit is $${wallet.minDeposit}` 
      })
    }
    
    if (depositAmount > wallet.maxDeposit) {
      return res.status(400).json({ 
        success: false, 
        message: `Maximum deposit is $${wallet.maxDeposit}` 
      })
    }
    
    // Check for duplicate txHash
    const existingTx = await Transaction.findOne({ cryptoTxHash: txHash })
    if (existingTx) {
      return res.status(400).json({ 
        success: false, 
        message: 'This transaction hash has already been submitted' 
      })
    }
    
    // Calculate fee
    const calculation = wallet.calculateTotal(depositAmount)
    
    // Get user
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }

    // User's main wallet (required for fund-management approve flow)
    let userWallet = await Wallet.findOne({ userId })
    if (!userWallet) {
      userWallet = await Wallet.create({ userId, balance: 0, pendingDeposits: 0 })
    }
    
    // Create transaction record
    const transaction = await Transaction.create({
      userId,
      walletId: userWallet._id,
      type: 'Deposit',
      amount: depositAmount,
      paymentMethod: 'Manual Crypto',
      status: 'Pending',
      description: `Manual ${wallet.currency} (${wallet.network}) deposit`,
      
      // Crypto details
      cryptoCurrency: wallet.currency,
      cryptoNetwork: wallet.network,
      cryptoTxHash: txHash,
      
      // Fee info
      feePercentage: wallet.feePercentage,
      feeAmount: calculation.feeAmount,
      totalPaid: calculation.totalToPay,
      
      // Manual crypto specific
      manualCryptoWalletId: wallet._id,
      manualCryptoAddress: wallet.address,
      screenshotUrl: screenshotUrl || null,
      
      // Tracking
      submittedAt: new Date()
    })
    
    userWallet.pendingDeposits = (userWallet.pendingDeposits || 0) + depositAmount
    await userWallet.save()
    
    console.log(`[ManualCrypto] Deposit submitted: $${depositAmount} by user ${userId}, TxHash: ${txHash}`)
    
    res.json({
      success: true,
      message: 'Deposit request submitted successfully. Admin will verify your transaction.',
      transaction: {
        _id: transaction._id,
        amount: depositAmount,
        feeAmount: calculation.feeAmount,
        totalPaid: calculation.totalToPay,
        currency: wallet.currency,
        network: wallet.network,
        txHash,
        status: 'Pending'
      }
    })
  } catch (error) {
    console.error('[ManualCrypto] Error submitting deposit:', error)
    res.status(500).json({ success: false, message: 'Error submitting deposit request' })
  }
})

/**
 * GET /api/manual-crypto/my-deposits
 * Get user's manual crypto deposit history
 */
router.get('/my-deposits', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id
    
    const deposits = await Transaction.find({
      userId,
      paymentMethod: 'Manual Crypto'
    })
    .sort({ createdAt: -1 })
    .limit(50)
    
    res.json({
      success: true,
      deposits
    })
  } catch (error) {
    console.error('[ManualCrypto] Error fetching deposits:', error)
    res.status(500).json({ success: false, message: 'Error fetching deposits' })
  }
})

// ============================================
// ADMIN ROUTES
// ============================================

/**
 * GET /api/manual-crypto/admin/wallets
 * Get all wallets (including inactive) for admin
 */
router.get('/admin/wallets', authenticateSuperAdmin, async (req, res) => {
  try {
    const wallets = await ManualCryptoWallet.find().sort({ createdAt: -1 })
    
    res.json({
      success: true,
      wallets
    })
  } catch (error) {
    console.error('[ManualCrypto Admin] Error fetching wallets:', error)
    res.status(500).json({ success: false, message: 'Error fetching wallets' })
  }
})

/**
 * POST /api/manual-crypto/admin/wallets
 * Create a new manual crypto wallet
 */
router.post('/admin/wallets', authenticateSuperAdmin, async (req, res) => {
  try {
    const { 
      currency, 
      network, 
      address, 
      qrCodeData, 
      displayName,
      feePercentage,
      minDeposit,
      maxDeposit,
      instructions 
    } = req.body
    
    if (!currency || !network || !address) {
      return res.status(400).json({ 
        success: false, 
        message: 'Currency, network, and address are required' 
      })
    }
    
    // Check for duplicate
    const existing = await ManualCryptoWallet.findOne({ currency, network, address })
    if (existing) {
      return res.status(400).json({ 
        success: false, 
        message: 'A wallet with this currency, network, and address already exists' 
      })
    }
    
    const wallet = await ManualCryptoWallet.create({
      currency,
      network,
      address,
      qrCodeData: qrCodeData || null,
      displayName: displayName || `${currency} (${network})`,
      feePercentage: feePercentage || 0.5,
      minDeposit: minDeposit || 10,
      maxDeposit: maxDeposit || 50000,
      instructions: instructions || 'Send the exact amount shown to the wallet address. After sending, submit your transaction hash for verification.',
      isActive: true
    })
    
    console.log(`[ManualCrypto Admin] Wallet created: ${currency} (${network}) - ${address}`)
    
    res.json({
      success: true,
      message: 'Wallet created successfully',
      wallet
    })
  } catch (error) {
    console.error('[ManualCrypto Admin] Error creating wallet:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

/**
 * PUT /api/manual-crypto/admin/wallets/:walletId
 * Update a manual crypto wallet
 */
router.put('/admin/wallets/:walletId', authenticateSuperAdmin, async (req, res) => {
  try {
    const { walletId } = req.params
    const updates = req.body
    
    const wallet = await ManualCryptoWallet.findById(walletId)
    if (!wallet) {
      return res.status(404).json({ success: false, message: 'Wallet not found' })
    }
    
    // Update allowed fields
    const allowedFields = ['currency', 'network', 'address', 'qrCodeData', 'displayName', 
                          'feePercentage', 'minDeposit', 'maxDeposit', 'instructions', 'isActive']
    
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        wallet[field] = updates[field]
      }
    })
    
    await wallet.save()
    
    console.log(`[ManualCrypto Admin] Wallet updated: ${wallet._id}`)
    
    res.json({
      success: true,
      message: 'Wallet updated successfully',
      wallet
    })
  } catch (error) {
    console.error('[ManualCrypto Admin] Error updating wallet:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

/**
 * DELETE /api/manual-crypto/admin/wallets/:walletId
 * Delete a manual crypto wallet
 */
router.delete('/admin/wallets/:walletId', authenticateSuperAdmin, async (req, res) => {
  try {
    const { walletId } = req.params
    
    const wallet = await ManualCryptoWallet.findByIdAndDelete(walletId)
    if (!wallet) {
      return res.status(404).json({ success: false, message: 'Wallet not found' })
    }
    
    console.log(`[ManualCrypto Admin] Wallet deleted: ${walletId}`)
    
    res.json({
      success: true,
      message: 'Wallet deleted successfully'
    })
  } catch (error) {
    console.error('[ManualCrypto Admin] Error deleting wallet:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

/**
 * GET /api/manual-crypto/admin/pending-deposits
 * Get all pending manual crypto deposits for admin review
 */
router.get('/admin/pending-deposits', authenticateSuperAdmin, async (req, res) => {
  try {
    const { status = 'Pending' } = req.query
    
    const query = { paymentMethod: 'Manual Crypto' }
    if (status !== 'all') {
      query.status = status
    }
    
    const deposits = await Transaction.find(query)
      .populate('userId', 'firstName lastName email phone')
      .sort({ createdAt: -1 })
      .limit(100)
    
    res.json({
      success: true,
      deposits
    })
  } catch (error) {
    console.error('[ManualCrypto Admin] Error fetching pending deposits:', error)
    res.status(500).json({ success: false, message: 'Error fetching deposits' })
  }
})

/**
 * POST /api/manual-crypto/admin/approve/:transactionId
 * Approve a manual crypto deposit
 */
router.post('/admin/approve/:transactionId', authenticateSuperAdmin, async (req, res) => {
  try {
    const { transactionId } = req.params
    const { adminRemarks } = req.body
    
    const transaction = await Transaction.findById(transactionId)
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' })
    }
    
    if (transaction.paymentMethod !== 'Manual Crypto') {
      return res.status(400).json({ success: false, message: 'Not a manual crypto deposit' })
    }
    
    if (transaction.walletCredited) {
      return res.status(400).json({ 
        success: false, 
        message: 'Wallet already credited for this transaction' 
      })
    }
    
    if (transaction.status === 'Approved') {
      return res.status(400).json({ success: false, message: 'Transaction already approved' })
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
    transaction.adminRemarks = adminRemarks || `Approved. TxHash verified: ${transaction.cryptoTxHash}`
    await transaction.save()
    
    console.log(`[ManualCrypto Admin] Deposit approved: $${transaction.amount} for user ${transaction.userId}`)

    try {
      await referralEngine.checkAndProcessDepositCommission(transaction.userId)
    } catch (err) {
      console.error('[ManualCrypto] Referral commission check error:', err.message)
    }

    res.json({
      success: true,
      message: `Deposit of $${transaction.amount} approved and credited`,
      transaction: {
        _id: transaction._id,
        amount: transaction.amount,
        status: transaction.status
      },
      newWalletBalance: wallet.balance
    })
  } catch (error) {
    console.error('[ManualCrypto Admin] Error approving deposit:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

/**
 * POST /api/manual-crypto/admin/reject/:transactionId
 * Reject a manual crypto deposit
 */
router.post('/admin/reject/:transactionId', authenticateSuperAdmin, async (req, res) => {
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
    
    if (transaction.paymentMethod !== 'Manual Crypto') {
      return res.status(400).json({ success: false, message: 'Not a manual crypto deposit' })
    }
    
    if (transaction.walletCredited) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot reject - wallet already credited' 
      })
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
    transaction.adminRemarks = `Rejected: ${reason}`
    await transaction.save()
    
    console.log(`[ManualCrypto Admin] Deposit rejected: $${transaction.amount} for user ${transaction.userId}. Reason: ${reason}`)
    
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
    console.error('[ManualCrypto Admin] Error rejecting deposit:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

export default router
