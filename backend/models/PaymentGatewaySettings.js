import mongoose from 'mongoose'

const paymentGatewaySettingsSchema = new mongoose.Schema({
  // OxaPay - just enabled toggle (API keys in .env)
  oxapayEnabled: { type: Boolean, default: false },

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
