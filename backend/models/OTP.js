import mongoose from 'mongoose'

const otpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  otp: {
    type: String,
    required: true
  },
  purpose: {
    type: String,
    enum: ['registration', 'password_reset', 'email_verification'],
    default: 'registration'
  },
  userData: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  attempts: {
    type: Number,
    default: 0
  },
  verified: {
    type: Boolean,
    default: false
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
})

// Index for automatic expiration
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

// Index for faster lookups
otpSchema.index({ email: 1, purpose: 1 })

const OTP = mongoose.model('OTP', otpSchema)

export default OTP
