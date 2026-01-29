import mongoose from 'mongoose'

// CreditLedger tracks all credit transactions for copy trading
// Credit is virtual money given by admin, used ONLY for copy trading exposure
// Credit cannot be withdrawn, only profits from copy trading go to wallet_balance

const creditLedgerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  tradingAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TradingAccount',
    required: true
  },
  // Transaction type
  type: {
    type: String,
    enum: [
      'ADMIN_CREDIT',      // Admin adds credit
      'ADMIN_DEBIT',       // Admin removes credit
      'TRADE_LOSS',        // Loss deducted from credit
      'MARGIN_HOLD',       // Margin held for open trade
      'MARGIN_RELEASE',    // Margin released when trade closes
      'EXPOSURE_ADJUST'    // Exposure adjustment
    ],
    required: true
  },
  // Amount (positive for credit, negative for debit)
  amount: {
    type: Number,
    required: true
  },
  // Balance after this transaction
  balanceAfter: {
    type: Number,
    required: true
  },
  // Reference to related entities
  tradeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trade',
    default: null
  },
  copyTradeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CopyTrade',
    default: null
  },
  masterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MasterTrader',
    default: null
  },
  // Admin who performed the action (for ADMIN_CREDIT/ADMIN_DEBIT)
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  },
  // Description/notes
  description: {
    type: String,
    default: ''
  },
  // Metadata for audit
  metadata: {
    openPrice: { type: Number, default: null },
    closePrice: { type: Number, default: null },
    lotSize: { type: Number, default: null },
    symbol: { type: String, default: null },
    pnl: { type: Number, default: null }
  }
}, { timestamps: true })

// Indexes for efficient queries
creditLedgerSchema.index({ userId: 1, createdAt: -1 })
creditLedgerSchema.index({ tradingAccountId: 1, createdAt: -1 })
creditLedgerSchema.index({ type: 1, createdAt: -1 })
creditLedgerSchema.index({ tradeId: 1 })
creditLedgerSchema.index({ copyTradeId: 1 })

// Static method to get credit balance for an account
creditLedgerSchema.statics.getCreditBalance = async function(tradingAccountId) {
  const account = await mongoose.model('TradingAccount').findById(tradingAccountId)
  return account?.credit || 0
}

// Static method to record a credit transaction
creditLedgerSchema.statics.recordTransaction = async function(data) {
  const { tradingAccountId, type, amount, description, tradeId, copyTradeId, masterId, adminId, metadata, userId } = data
  
  // Get current credit balance
  const account = await mongoose.model('TradingAccount').findById(tradingAccountId)
  if (!account) throw new Error('Trading account not found')
  
  const currentCredit = account.credit || 0
  const newBalance = currentCredit + amount
  
  // Prevent negative credit
  if (newBalance < 0) {
    throw new Error(`Insufficient credit. Current: $${currentCredit.toFixed(2)}, Required: $${Math.abs(amount).toFixed(2)}`)
  }
  
  // Update account credit
  account.credit = newBalance
  await account.save()
  
  // Create ledger entry
  const entry = await this.create({
    userId: userId || account.userId,
    tradingAccountId,
    type,
    amount,
    balanceAfter: newBalance,
    description,
    tradeId,
    copyTradeId,
    masterId,
    adminId,
    metadata
  })
  
  return { entry, newBalance }
}

// Static method to check if account has sufficient credit for a trade
creditLedgerSchema.statics.hasSufficientCredit = async function(tradingAccountId, requiredAmount) {
  const account = await mongoose.model('TradingAccount').findById(tradingAccountId)
  const credit = account?.credit || 0
  return {
    sufficient: credit >= requiredAmount,
    available: credit,
    required: requiredAmount,
    shortfall: Math.max(0, requiredAmount - credit)
  }
}

export default mongoose.model('CreditLedger', creditLedgerSchema)
