import mongoose from 'mongoose'

/**
 * CreditRefillLedger - Tracks all credit auto-refill transactions for copy trading
 * 
 * BUSINESS RULES:
 * 1. Minimum credit balance must be maintained at 1000
 * 2. When losses reduce credit below 1000, system tracks the deficit
 * 3. Future profits are used to auto-refill the missing credit amount
 * 4. Once credit reaches 1000, refilling stops and profits go to wallet
 * 5. This applies ONLY to copy trading accounts
 */

const creditRefillLedgerSchema = new mongoose.Schema({
  // User and account references
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
  copyFollowerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CopyFollower',
    required: true
  },
  masterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MasterTrader',
    required: true
  },
  
  // Transaction type
  type: {
    type: String,
    enum: [
      'DEFICIT_CREATED',      // Loss caused credit to drop below minimum
      'PROFIT_REFILL',        // Profit used to refill credit
      'PARTIAL_REFILL',       // Partial profit used (remaining went to wallet)
      'REFILL_COMPLETE',      // Credit restored to minimum, refill mode ended
      'MANUAL_ADJUSTMENT'     // Admin manual adjustment
    ],
    required: true
  },
  
  // Financial amounts
  amount: {
    type: Number,
    required: true,
    default: 0
  },
  
  // Credit tracking
  creditBefore: {
    type: Number,
    required: true
  },
  creditAfter: {
    type: Number,
    required: true
  },
  
  // Deficit tracking
  deficitBefore: {
    type: Number,
    required: true,
    default: 0
  },
  deficitAfter: {
    type: Number,
    required: true,
    default: 0
  },
  
  // For profit refills - how much went where
  profitTotal: {
    type: Number,
    default: 0
  },
  profitToCredit: {
    type: Number,
    default: 0
  },
  profitToWallet: {
    type: Number,
    default: 0
  },
  
  // Reference to the trade that triggered this
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
  
  // Metadata for audit trail
  metadata: {
    symbol: { type: String, default: null },
    side: { type: String, default: null },
    lotSize: { type: Number, default: null },
    openPrice: { type: Number, default: null },
    closePrice: { type: Number, default: null },
    rawPnl: { type: Number, default: null },
    minimumCredit: { type: Number, default: 1000 }
  },
  
  // Description for human readability
  description: {
    type: String,
    default: ''
  },
  
  // Processing status
  status: {
    type: String,
    enum: ['PENDING', 'PROCESSED', 'FAILED', 'REVERSED'],
    default: 'PROCESSED'
  },
  
  // Admin who made manual adjustment (if applicable)
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null
  }
}, { 
  timestamps: true 
})

// Indexes for efficient queries
creditRefillLedgerSchema.index({ userId: 1, createdAt: -1 })
creditRefillLedgerSchema.index({ tradingAccountId: 1, createdAt: -1 })
creditRefillLedgerSchema.index({ copyFollowerId: 1, createdAt: -1 })
creditRefillLedgerSchema.index({ type: 1, createdAt: -1 })
creditRefillLedgerSchema.index({ tradeId: 1 })
creditRefillLedgerSchema.index({ copyTradeId: 1 })
creditRefillLedgerSchema.index({ status: 1 })

/**
 * Static method to record a deficit creation (when loss drops credit below minimum)
 */
creditRefillLedgerSchema.statics.recordDeficitCreated = async function(data) {
  const {
    userId,
    tradingAccountId,
    copyFollowerId,
    masterId,
    creditBefore,
    creditAfter,
    lossAmount,
    minimumCredit = 1000,
    tradeId,
    copyTradeId,
    metadata
  } = data
  
  const deficitBefore = Math.max(0, minimumCredit - creditBefore)
  const deficitAfter = Math.max(0, minimumCredit - creditAfter)
  
  const entry = await this.create({
    userId,
    tradingAccountId,
    copyFollowerId,
    masterId,
    type: 'DEFICIT_CREATED',
    amount: -lossAmount,
    creditBefore,
    creditAfter,
    deficitBefore,
    deficitAfter,
    tradeId,
    copyTradeId,
    metadata: {
      ...metadata,
      minimumCredit
    },
    description: `Loss of $${lossAmount.toFixed(2)} created deficit. Credit: $${creditAfter.toFixed(2)}, Deficit: $${deficitAfter.toFixed(2)}`
  })
  
  return entry
}

/**
 * Static method to record a profit refill
 */
creditRefillLedgerSchema.statics.recordProfitRefill = async function(data) {
  const {
    userId,
    tradingAccountId,
    copyFollowerId,
    masterId,
    creditBefore,
    creditAfter,
    deficitBefore,
    deficitAfter,
    profitTotal,
    profitToCredit,
    profitToWallet,
    tradeId,
    copyTradeId,
    metadata,
    isComplete = false
  } = data
  
  const type = isComplete ? 'REFILL_COMPLETE' : (profitToWallet > 0 ? 'PARTIAL_REFILL' : 'PROFIT_REFILL')
  
  let description = ''
  if (isComplete) {
    description = `Credit restored to minimum. Refill complete. $${profitToCredit.toFixed(2)} to credit, $${profitToWallet.toFixed(2)} to wallet.`
  } else if (profitToWallet > 0) {
    description = `Partial refill: $${profitToCredit.toFixed(2)} to credit, $${profitToWallet.toFixed(2)} to wallet. Remaining deficit: $${deficitAfter.toFixed(2)}`
  } else {
    description = `Profit refill: $${profitToCredit.toFixed(2)} applied to credit. Remaining deficit: $${deficitAfter.toFixed(2)}`
  }
  
  const entry = await this.create({
    userId,
    tradingAccountId,
    copyFollowerId,
    masterId,
    type,
    amount: profitToCredit,
    creditBefore,
    creditAfter,
    deficitBefore,
    deficitAfter,
    profitTotal,
    profitToCredit,
    profitToWallet,
    tradeId,
    copyTradeId,
    metadata,
    description
  })
  
  return entry
}

/**
 * Get refill history for a copy follower subscription
 */
creditRefillLedgerSchema.statics.getRefillHistory = async function(copyFollowerId, limit = 50) {
  return this.find({ copyFollowerId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('tradeId', 'tradeId symbol side quantity')
    .populate('copyTradeId', 'symbol side masterLotSize followerLotSize')
}

/**
 * Get current deficit for a subscription
 */
creditRefillLedgerSchema.statics.getCurrentDeficit = async function(copyFollowerId) {
  const latestEntry = await this.findOne({ copyFollowerId })
    .sort({ createdAt: -1 })
  
  return latestEntry?.deficitAfter || 0
}

/**
 * Get refill summary statistics
 */
creditRefillLedgerSchema.statics.getRefillSummary = async function(copyFollowerId) {
  const entries = await this.find({ copyFollowerId })
  
  let totalDeficitCreated = 0
  let totalRefilled = 0
  let totalToWallet = 0
  let refillCount = 0
  
  for (const entry of entries) {
    if (entry.type === 'DEFICIT_CREATED') {
      totalDeficitCreated += Math.abs(entry.amount)
    } else if (['PROFIT_REFILL', 'PARTIAL_REFILL', 'REFILL_COMPLETE'].includes(entry.type)) {
      totalRefilled += entry.profitToCredit || 0
      totalToWallet += entry.profitToWallet || 0
      refillCount++
    }
  }
  
  const latestEntry = entries.length > 0 ? entries[entries.length - 1] : null
  
  return {
    currentDeficit: latestEntry?.deficitAfter || 0,
    currentCredit: latestEntry?.creditAfter || 0,
    totalDeficitCreated,
    totalRefilled,
    totalToWallet,
    refillCount,
    isInRefillMode: (latestEntry?.deficitAfter || 0) > 0
  }
}

export default mongoose.model('CreditRefillLedger', creditRefillLedgerSchema)
