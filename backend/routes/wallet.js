import express from 'express'
import Wallet from '../models/Wallet.js'
import Transaction from '../models/Transaction.js'
import TradingAccount from '../models/TradingAccount.js'
import User from '../models/User.js'
import AdminWallet from '../models/AdminWallet.js'
import AdminWalletTransaction from '../models/AdminWalletTransaction.js'
import referralEngine from '../services/referralEngine.js'

const router = express.Router()

/** Resolve main wallet when older records omitted walletId (e.g. manual crypto). */
async function getWalletForTransaction(transaction) {
  if (transaction.walletId) {
    const byId = await Wallet.findById(transaction.walletId)
    if (byId) return byId
  }
  return Wallet.findOne({ userId: transaction.userId })
}

// GET /api/wallet/:userId - Get user wallet
router.get('/:userId', async (req, res) => {
  try {
    let wallet = await Wallet.findOne({ userId: req.params.userId })
    if (!wallet) {
      wallet = new Wallet({ userId: req.params.userId, balance: 0 })
      await wallet.save()
    }
    res.json({ wallet })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching wallet', error: error.message })
  }
})

// POST /api/wallet/deposit - Create deposit request
router.post('/deposit', async (req, res) => {
  try {
    const { userId, amount, paymentMethod, transactionRef, screenshot } = req.body

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' })
    }

    // Get or create wallet
    let wallet = await Wallet.findOne({ userId })
    if (!wallet) {
      wallet = new Wallet({ userId, balance: 0 })
      await wallet.save()
    }

    // Create transaction
    const transaction = new Transaction({
      userId,
      walletId: wallet._id,
      type: 'Deposit',
      amount,
      paymentMethod,
      transactionRef,
      screenshot,
      status: 'Pending'
    })
    await transaction.save()

    // Update pending deposits
    wallet.pendingDeposits += amount
    await wallet.save()

    res.status(201).json({ message: 'Deposit request submitted', transaction })
  } catch (error) {
    res.status(500).json({ message: 'Error creating deposit', error: error.message })
  }
})

// POST /api/wallet/withdraw - Create withdrawal request
router.post('/withdraw', async (req, res) => {
  try {
    const { userId, amount, paymentMethod, bankAccountId, bankDetails } = req.body

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' })
    }

    // Get wallet
    const wallet = await Wallet.findOne({ userId })
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' })
    }

    // Check balance
    if (wallet.balance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' })
    }

    // Create transaction with bank details
    const transaction = new Transaction({
      userId,
      walletId: wallet._id,
      type: 'Withdrawal',
      amount,
      paymentMethod,
      status: 'Pending',
      bankAccountId,
      bankDetails: bankDetails || {}
    })
    await transaction.save()

    // Deduct from balance and add to pending
    wallet.balance -= amount
    wallet.pendingWithdrawals += amount
    await wallet.save()

    res.status(201).json({ message: 'Withdrawal request submitted', transaction })
  } catch (error) {
    res.status(500).json({ message: 'Error creating withdrawal', error: error.message })
  }
})

// POST /api/wallet/transfer-to-trading - Transfer from wallet to trading account
router.post('/transfer-to-trading', async (req, res) => {
  try {
    const { userId, tradingAccountId, amount } = req.body

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' })
    }

    // Get wallet
    const wallet = await Wallet.findOne({ userId })
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' })
    }

    // Check wallet balance
    if (wallet.balance < amount) {
      return res.status(400).json({ message: 'Insufficient wallet balance' })
    }

    // Get trading account
    const tradingAccount = await TradingAccount.findById(tradingAccountId)
    if (!tradingAccount) {
      return res.status(404).json({ message: 'Trading account not found' })
    }

    // Verify ownership
    if (tradingAccount.userId.toString() !== userId) {
      return res.status(403).json({ message: 'Unauthorized' })
    }

    // Transfer funds
    wallet.balance -= amount
    tradingAccount.balance += amount

    await wallet.save()
    await tradingAccount.save()

    res.json({ 
      message: 'Funds transferred successfully',
      walletBalance: wallet.balance,
      tradingAccountBalance: tradingAccount.balance
    })
  } catch (error) {
    res.status(500).json({ message: 'Error transferring funds', error: error.message })
  }
})

// POST /api/wallet/transfer-from-trading - Transfer from trading account to wallet
router.post('/transfer-from-trading', async (req, res) => {
  try {
    const { userId, tradingAccountId, amount } = req.body

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' })
    }

    // Get trading account
    const tradingAccount = await TradingAccount.findById(tradingAccountId)
    if (!tradingAccount) {
      return res.status(404).json({ message: 'Trading account not found' })
    }

    // Verify ownership
    if (tradingAccount.userId.toString() !== userId) {
      return res.status(403).json({ message: 'Unauthorized' })
    }

    // Check trading account balance
    if (tradingAccount.balance < amount) {
      return res.status(400).json({ message: 'Insufficient trading account balance' })
    }

    // Get or create wallet
    let wallet = await Wallet.findOne({ userId })
    if (!wallet) {
      wallet = new Wallet({ userId, balance: 0 })
    }

    // Transfer funds
    tradingAccount.balance -= amount
    wallet.balance += amount

    await tradingAccount.save()
    await wallet.save()

    res.json({ 
      message: 'Funds transferred successfully',
      walletBalance: wallet.balance,
      tradingAccountBalance: tradingAccount.balance
    })
  } catch (error) {
    res.status(500).json({ message: 'Error transferring funds', error: error.message })
  }
})

// GET /api/wallet/transactions/:userId - Get user transactions
router.get('/transactions/:userId', async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
    res.json({ transactions })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching transactions', error: error.message })
  }
})

// GET /api/wallet/transactions/all - Get all transactions (admin)
router.get('/admin/transactions', async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .populate('userId', 'firstName lastName email')
      .sort({ createdAt: -1 })
    
    // Filter out orphaned transactions (where user was deleted)
    const validTransactions = transactions.filter(t => t.userId !== null)
    
    res.json({ transactions: validTransactions })
  } catch (error) {
    res.status(500).json({ message: 'Error fetching transactions', error: error.message })
  }
})

// PUT /api/wallet/admin/approve/:id - Approve transaction (admin)
router.put('/admin/approve/:id', async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
    
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' })
    }

    if (transaction.status !== 'PENDING') {
      return res.status(400).json({ message: 'Transaction already processed' })
    }

    const wallet = await Wallet.findById(transaction.walletId)

    if (transaction.type === 'DEPOSIT') {
      wallet.balance += transaction.amount
      if (wallet.pendingDeposits) wallet.pendingDeposits -= transaction.amount
    } else {
      if (wallet.pendingWithdrawals) wallet.pendingWithdrawals -= transaction.amount
    }

    transaction.status = 'APPROVED'
    transaction.processedAt = new Date()

    await wallet.save()
    await transaction.save()

    if (transaction.type === 'DEPOSIT' || transaction.type === 'Deposit') {
      try {
        await referralEngine.checkAndProcessDepositCommission(transaction.userId)
      } catch (err) {
        console.error('[Wallet] Referral commission check error:', err.message)
      }
    }

    res.json({ message: 'Transaction approved', transaction })
  } catch (error) {
    res.status(500).json({ message: 'Error approving transaction', error: error.message })
  }
})

// PUT /api/wallet/admin/reject/:id - Reject transaction (admin)
router.put('/admin/reject/:id', async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
    
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' })
    }

    if (transaction.status !== 'PENDING') {
      return res.status(400).json({ message: 'Transaction already processed' })
    }

    const wallet = await Wallet.findById(transaction.walletId)

    if (transaction.type === 'DEPOSIT') {
      if (wallet.pendingDeposits) wallet.pendingDeposits -= transaction.amount
    } else {
      // Refund withdrawal amount
      wallet.balance += transaction.amount
      if (wallet.pendingWithdrawals) wallet.pendingWithdrawals -= transaction.amount
    }

    transaction.status = 'REJECTED'
    transaction.processedAt = new Date()

    await wallet.save()
    await transaction.save()

    res.json({ message: 'Transaction rejected', transaction })
  } catch (error) {
    res.status(500).json({ message: 'Error rejecting transaction', error: error.message })
  }
})

// PUT /api/wallet/transaction/:id/approve - Approve transaction (admin)
router.put('/transaction/:id/approve', async (req, res) => {
  try {
    const { adminRemarks } = req.body
    const transaction = await Transaction.findById(req.params.id)
    
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' })
    }

    if (transaction.status !== 'Pending') {
      return res.status(400).json({ message: 'Transaction already processed' })
    }

    if (transaction.type !== 'Deposit' && transaction.type !== 'Withdrawal') {
      return res.status(400).json({ message: 'This transaction type cannot be approved from fund management' })
    }

    const wallet = await getWalletForTransaction(transaction)
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found for this transaction' })
    }
    if (!transaction.walletId) {
      transaction.walletId = wallet._id
    }

    if (transaction.type === 'Deposit') {
      wallet.balance = (wallet.balance || 0) + transaction.amount
      wallet.pendingDeposits = Math.max(0, (wallet.pendingDeposits || 0) - transaction.amount)
      if (transaction.paymentMethod === 'Manual Crypto') {
        transaction.walletCredited = true
        transaction.walletCreditedAt = new Date()
      }
    } else {
      wallet.pendingWithdrawals = Math.max(0, (wallet.pendingWithdrawals || 0) - transaction.amount)
    }

    transaction.status = 'Approved'
    transaction.adminRemarks = adminRemarks || ''
    transaction.processedAt = new Date()

    await wallet.save()
    await transaction.save()

    if (transaction.type === 'Deposit') {
      try {
        await referralEngine.checkAndProcessDepositCommission(transaction.userId)
      } catch (err) {
        console.error('[Wallet] Referral commission check error:', err.message)
      }
    }

    res.json({ message: 'Transaction approved', transaction })
  } catch (error) {
    res.status(500).json({ message: 'Error approving transaction', error: error.message })
  }
})

// PUT /api/wallet/transaction/:id/reject - Reject transaction (admin)
router.put('/transaction/:id/reject', async (req, res) => {
  try {
    const { adminRemarks } = req.body
    const transaction = await Transaction.findById(req.params.id)
    
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' })
    }

    if (transaction.status !== 'Pending') {
      return res.status(400).json({ message: 'Transaction already processed' })
    }

    if (transaction.type !== 'Deposit' && transaction.type !== 'Withdrawal') {
      return res.status(400).json({ message: 'This transaction type cannot be rejected from fund management' })
    }

    const wallet = await getWalletForTransaction(transaction)
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found for this transaction' })
    }
    if (!transaction.walletId) {
      transaction.walletId = wallet._id
    }

    if (transaction.type === 'Deposit') {
      wallet.pendingDeposits = Math.max(0, (wallet.pendingDeposits || 0) - transaction.amount)
    } else {
      // Refund withdrawal amount
      wallet.balance = (wallet.balance || 0) + transaction.amount
      wallet.pendingWithdrawals = Math.max(0, (wallet.pendingWithdrawals || 0) - transaction.amount)
    }

    transaction.status = 'Rejected'
    transaction.adminRemarks = adminRemarks || ''
    transaction.processedAt = new Date()

    await wallet.save()
    await transaction.save()

    res.json({ message: 'Transaction rejected', transaction })
  } catch (error) {
    res.status(500).json({ message: 'Error rejecting transaction', error: error.message })
  }
})

export default router
