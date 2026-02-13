import mongoose from 'mongoose'

const directReferralCommissionSchema = new mongoose.Schema({
  // IB who receives the commission
  ibUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // The new user who joined (triggered the commission)
  newUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // The IB who directly referred the new user
  directReferrerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Level in the referral hierarchy (1 = direct referrer)
  level: {
    type: Number,
    required: true,
    min: 1,
    max: 18
  },
  
  // Commission amount (fixed per level)
  commissionAmount: {
    type: Number,
    required: true,
    default: 0
  },
  
  // Activation trigger that caused this commission
  activationTrigger: {
    type: String,
    enum: ['REGISTRATION', 'FIRST_DEPOSIT', 'FIRST_TRADE', 'KYC_APPROVED'],
    required: true
  },
  
  // Status
  status: {
    type: String,
    enum: ['PENDING', 'CREDITED', 'FAILED', 'REVERSED'],
    default: 'CREDITED'
  },
  
  // Processing details
  creditedAt: {
    type: Date,
    default: Date.now
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

// Indexes for efficient queries
directReferralCommissionSchema.index({ ibUserId: 1, createdAt: -1 })
directReferralCommissionSchema.index({ newUserId: 1 })
directReferralCommissionSchema.index({ directReferrerId: 1 })
directReferralCommissionSchema.index({ status: 1 })

// Prevent duplicate commission for same IB-newUser-level combination
directReferralCommissionSchema.index(
  { ibUserId: 1, newUserId: 1, level: 1 },
  { unique: true }
)

// Static method to check if commission already paid for a new user
directReferralCommissionSchema.statics.isCommissionPaid = async function(newUserId) {
  const count = await this.countDocuments({ 
    newUserId, 
    status: { $in: ['CREDITED', 'PENDING'] }
  })
  return count > 0
}

export default mongoose.model('DirectReferralCommission', directReferralCommissionSchema)
