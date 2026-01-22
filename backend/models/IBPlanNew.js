import mongoose from 'mongoose'

const ibPlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  maxLevels: {
    type: Number,
    required: true,
    min: 1,
    max: 18,
    default: 18
  },
  commissionType: {
    type: String,
    enum: ['PER_LOT', 'PERCENT'],
    default: 'PER_LOT'
  },
  levels: [{
    level: {
      type: Number,
      required: true
    },
    rate: {
      type: Number,
      required: true,
      default: 0
    }
  }],
  source: {
    spread: {
      type: Boolean,
      default: true
    },
    tradeCommission: {
      type: Boolean,
      default: true
    },
    swap: {
      type: Boolean,
      default: false
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
})

// Get default plan
ibPlanSchema.statics.getDefaultPlan = async function() {
  let plan = await this.findOne({ name: 'Default', isActive: true })
  if (!plan) {
    plan = await this.create({
      name: 'Default',
      maxLevels: 18,
      commissionType: 'PER_LOT',
      levels: [
        { level: 1, rate: 5 },
        { level: 2, rate: 4 },
        { level: 3, rate: 3 },
        { level: 4, rate: 2.5 },
        { level: 5, rate: 2 },
        { level: 6, rate: 1.5 },
        { level: 7, rate: 1 },
        { level: 8, rate: 0.8 },
        { level: 9, rate: 0.6 },
        { level: 10, rate: 0.5 },
        { level: 11, rate: 0.4 },
        { level: 12, rate: 0.3 },
        { level: 13, rate: 0.25 },
        { level: 14, rate: 0.2 },
        { level: 15, rate: 0.15 },
        { level: 16, rate: 0.1 },
        { level: 17, rate: 0.08 },
        { level: 18, rate: 0.05 }
      ],
      source: {
        spread: true,
        tradeCommission: true,
        swap: false
      }
    })
  }
  return plan
}

// Get rate for a specific level
ibPlanSchema.methods.getRateForLevel = function(level) {
  const levelConfig = this.levels.find(l => l.level === level)
  return levelConfig ? levelConfig.rate : 0
}

export default mongoose.model('IBPlan', ibPlanSchema)
