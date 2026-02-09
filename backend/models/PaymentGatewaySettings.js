import mongoose from 'mongoose'

const paymentGatewaySettingsSchema = new mongoose.Schema({
  // OxaPay - enabled toggle (API keys in .env)
  oxapayEnabled: { type: Boolean, default: false },
  
  // ========== CRYPTO DEPOSIT APPROVAL SETTINGS ==========
  // If true: Auto-credit wallet when OxaPay confirms payment (no admin approval needed)
  // If false: Set status to "Auto-Verified", admin must manually approve to credit wallet
  cryptoAutoCredit: { type: Boolean, default: false },
  
  // Minimum amount that requires manual admin approval (even if autoCredit is ON)
  // Set to 0 to disable threshold-based approval
  cryptoManualApprovalThreshold: { type: Number, default: 0 },
  
  // Notify admin on every crypto deposit (even if auto-credited)
  cryptoNotifyAdmin: { type: Boolean, default: true },
  
  // ========== PAYOUT SETTINGS ==========
  oxapayPayoutEnabled: { type: Boolean, default: false },
  
  // Minimum withdrawal amount for crypto payout
  cryptoMinWithdrawal: { type: Number, default: 50 },
  
  // Maximum withdrawal amount per transaction
  cryptoMaxWithdrawal: { type: Number, default: 10000 },

  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  }
}, {
  timestamps: true
})

// Ensure only one settings document exists
paymentGatewaySettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne()
  if (!settings) {
    settings = await this.create({})
  }
  return settings
}

export default mongoose.model('PaymentGatewaySettings', paymentGatewaySettingsSchema)
