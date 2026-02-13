import mongoose from 'mongoose'

const monthlyIBCommissionSchema = new mongoose.Schema({
  // IB who receives the commission
  ibUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // The trader whose trades generated this commission
  traderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Month period (format: YYYY-MM)
  monthPeriod: {
    type: String,
    required: true
  },
  
  // Level in the referral hierarchy (1 = direct referral)
  level: {
    type: Number,
    required: true,
    min: 1,
    max: 11
  },
  
  // Trading volume details
  totalLots: {
    type: Number,
    required: true,
    default: 0
  },
  
  totalTrades: {
    type: Number,
    default: 0
  },
  
  // Commission calculation
  ratePerLot: {
    type: Number,
    required: true
  },
  
  commissionAmount: {
    type: Number,
    required: true,
    default: 0
  },
  
  // Status
  status: {
    type: String,
    enum: ['PENDING', 'CREDITED', 'FAILED', 'REVERSED'],
    default: 'PENDING'
  },
  
  // Processing details
  calculatedAt: {
    type: Date,
    default: Date.now
  },
  
  creditedAt: {
    type: Date,
    default: null
  },
  
  // Batch processing reference
  batchId: {
    type: String,
    default: null
  },
  
  // Error tracking
  errorMessage: {
    type: String,
    default: null
  },
  
  // Reversal tracking
  reversedAt: {
    type: Date,
    default: null
  },
  
  reversedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  reversalReason: {
    type: String,
    default: null
  },
  
  adminNotes: {
    type: String,
    default: null
  }
  
}, { timestamps: true })

// Compound indexes for efficient queries
monthlyIBCommissionSchema.index({ ibUserId: 1, monthPeriod: 1 })
monthlyIBCommissionSchema.index({ traderId: 1, monthPeriod: 1 })
monthlyIBCommissionSchema.index({ monthPeriod: 1, status: 1 })
monthlyIBCommissionSchema.index({ batchId: 1 })

// Prevent duplicate commission for same IB-trader-month-level combination
monthlyIBCommissionSchema.index(
  { ibUserId: 1, traderId: 1, monthPeriod: 1, level: 1 },
  { unique: true }
)

export default mongoose.model('MonthlyIBCommission', monthlyIBCommissionSchema)
