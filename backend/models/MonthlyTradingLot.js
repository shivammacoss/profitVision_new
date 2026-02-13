import mongoose from 'mongoose'

// Tracks monthly trading lots per user for batch commission calculation
const monthlyTradingLotSchema = new mongoose.Schema({
  // The trader
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Month period (format: YYYY-MM)
  monthPeriod: {
    type: String,
    required: true
  },
  
  // Accumulated lots for the month
  totalLots: {
    type: Number,
    default: 0
  },
  
  // Trade count
  totalTrades: {
    type: Number,
    default: 0
  },
  
  // Volume in USD
  totalVolume: {
    type: Number,
    default: 0
  },
  
  // Status
  status: {
    type: String,
    enum: ['ACCUMULATING', 'PROCESSED', 'PAID'],
    default: 'ACCUMULATING'
  },
  
  // Processing details
  processedAt: {
    type: Date,
    default: null
  },
  
  paidAt: {
    type: Date,
    default: null
  },
  
  // Batch reference
  batchId: {
    type: String,
    default: null
  },
  
  // Last trade that updated this record
  lastTradeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trade',
    default: null
  },
  
  lastUpdatedAt: {
    type: Date,
    default: Date.now
  }
  
}, { timestamps: true })

// Compound index for unique user-month combination
monthlyTradingLotSchema.index({ userId: 1, monthPeriod: 1 }, { unique: true })
monthlyTradingLotSchema.index({ monthPeriod: 1, status: 1 })

// Static method to add lots for a trade
monthlyTradingLotSchema.statics.addTradeVolume = async function(userId, lots, tradeId, volume = 0) {
  const monthPeriod = new Date().toISOString().slice(0, 7) // YYYY-MM
  
  const result = await this.findOneAndUpdate(
    { userId, monthPeriod },
    {
      $inc: { totalLots: lots, totalTrades: 1, totalVolume: volume },
      $set: { lastTradeId: tradeId, lastUpdatedAt: new Date() }
    },
    { upsert: true, new: true }
  )
  
  return result
}

// Get all users with trading activity for a month
monthlyTradingLotSchema.statics.getMonthlyTraders = async function(monthPeriod) {
  return this.find({ 
    monthPeriod, 
    status: 'ACCUMULATING',
    totalLots: { $gt: 0 }
  }).populate('userId', 'firstName lastName email')
}

export default mongoose.model('MonthlyTradingLot', monthlyTradingLotSchema)
