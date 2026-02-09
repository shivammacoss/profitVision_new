import mongoose from 'mongoose'

/**
 * OxaPayWebhookLog - Audit trail for all OxaPay webhook events
 * 
 * PURPOSE:
 * 1. Complete audit trail of all webhook events
 * 2. Idempotent webhook handling (prevent duplicate processing)
 * 3. Admin visibility into payment lifecycle
 * 4. Fraud detection and compliance
 */

const oxaPayWebhookLogSchema = new mongoose.Schema({
  // OxaPay identifiers
  trackId: {
    type: String,
    required: true,
    index: true
  },
  orderId: {
    type: String,
    required: true,
    index: true
  },
  
  // Webhook event details
  status: {
    type: String,
    enum: ['Waiting', 'Paying', 'Paid', 'Expired', 'Failed', 'Refunded', 'Unknown'],
    required: true
  },
  previousStatus: {
    type: String,
    default: null
  },
  
  // Payment details
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'USD'
  },
  cryptoCurrency: {
    type: String,
    default: null
  },
  network: {
    type: String,
    default: null
  },
  
  // Blockchain details
  txHash: {
    type: String,
    default: null
  },
  senderAddress: {
    type: String,
    default: null
  },
  receiverAddress: {
    type: String,
    default: null
  },
  confirmations: {
    type: Number,
    default: 0
  },
  
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  userEmail: {
    type: String,
    default: null
  },
  
  // Transaction reference (linked after transaction is created)
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    default: null
  },
  
  // Processing status
  processed: {
    type: Boolean,
    default: false
  },
  processedAt: {
    type: Date,
    default: null
  },
  processingError: {
    type: String,
    default: null
  },
  
  // Idempotency key to prevent duplicate processing
  idempotencyKey: {
    type: String,
    unique: true,
    sparse: true
  },
  
  // Raw webhook payload for debugging
  rawPayload: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Request metadata
  ipAddress: {
    type: String,
    default: null
  },
  hmacValid: {
    type: Boolean,
    default: false
  }
}, { 
  timestamps: true 
})

// Compound index for efficient queries
oxaPayWebhookLogSchema.index({ trackId: 1, status: 1 })
oxaPayWebhookLogSchema.index({ userId: 1, createdAt: -1 })
oxaPayWebhookLogSchema.index({ processed: 1, status: 1 })
oxaPayWebhookLogSchema.index({ createdAt: -1 })

/**
 * Check if this exact webhook event was already processed (idempotency)
 */
oxaPayWebhookLogSchema.statics.isAlreadyProcessed = async function(trackId, status) {
  const existing = await this.findOne({
    trackId,
    status,
    processed: true
  })
  return !!existing
}

/**
 * Get webhook history for a specific payment
 */
oxaPayWebhookLogSchema.statics.getPaymentHistory = async function(trackId) {
  return this.find({ trackId })
    .sort({ createdAt: 1 })
    .populate('userId', 'firstName lastName email')
    .populate('transactionId')
}

/**
 * Get all pending webhooks that need admin attention
 */
oxaPayWebhookLogSchema.statics.getPendingForAdmin = async function() {
  return this.find({
    status: 'Paid',
    processed: true
  })
    .populate('userId', 'firstName lastName email')
    .populate('transactionId')
    .sort({ createdAt: -1 })
}

export default mongoose.model('OxaPayWebhookLog', oxaPayWebhookLogSchema)
