import mongoose from 'mongoose'

const ibModeSettingsSchema = new mongoose.Schema({
  settingsType: {
    type: String,
    default: 'IB_MODE_CONFIG',
    unique: true
  },
  
  // Main commission mode toggle
  // 'REALTIME' = Legacy realtime broker IB (per-trade commission)
  // 'MONTHLY_CONTROLLED' = New monthly batch + direct referral mode
  commissionMode: {
    type: String,
    enum: ['REALTIME', 'MONTHLY_CONTROLLED'],
    default: 'MONTHLY_CONTROLLED'
  },
  
  // ==================== MODE 1: Monthly Trading IB ====================
  monthlyTradingIB: {
    enabled: { type: Boolean, default: true },
    maxLevels: { type: Number, default: 11 },
    // Fixed per-lot commission rates per level
    levelRates: {
      level1: { type: Number, default: 4 },   // $4 per lot
      level2: { type: Number, default: 3 },   // $3 per lot
      level3: { type: Number, default: 3 },   // $3 per lot
      level4: { type: Number, default: 2 },   // $2 per lot
      level5: { type: Number, default: 2 },   // $2 per lot
      level6: { type: Number, default: 1 },   // $1 per lot
      level7: { type: Number, default: 1 },   // $1 per lot
      level8: { type: Number, default: 0.5 }, // $0.5 per lot
      level9: { type: Number, default: 0.5 }, // $0.5 per lot
      level10: { type: Number, default: 0.5 }, // $0.5 per lot
      level11: { type: Number, default: 0.5 }  // $0.5 per lot
    },
    // Payout schedule
    payoutDay: { type: Number, default: 1 }, // Day of month for payout (1 = 1st)
    autoPayoutEnabled: { type: Boolean, default: true },
    minLotsForPayout: { type: Number, default: 0.01 } // Minimum lots to qualify
  },
  
  // ==================== MODE 2: Direct Joining Income ====================
  directJoiningIncome: {
    enabled: { type: Boolean, default: true },
    maxLevels: { type: Number, default: 18 },
    totalDistributionPool: { type: Number, default: 90 }, // $90 total
    // Fixed amounts per level
    levelAmounts: {
      level1: { type: Number, default: 15 },  // $15
      level2: { type: Number, default: 10 },  // $10
      level3: { type: Number, default: 5 },   // $5
      level4: { type: Number, default: 4 },   // $4
      level5: { type: Number, default: 4 },   // $4
      level6: { type: Number, default: 4 },   // $4
      level7: { type: Number, default: 4 },   // $4
      level8: { type: Number, default: 4 },   // $4
      level9: { type: Number, default: 4 },   // $4
      level10: { type: Number, default: 4 },  // $4
      level11: { type: Number, default: 4 },  // $4
      level12: { type: Number, default: 4 },  // $4
      level13: { type: Number, default: 4 },  // $4
      level14: { type: Number, default: 4 },  // $4
      level15: { type: Number, default: 4 },  // $4
      level16: { type: Number, default: 4 },  // $4
      level17: { type: Number, default: 4 },  // $4
      level18: { type: Number, default: 4 }   // $4
    },
    // Activation requirements
    requireActivation: { type: Boolean, default: true },
    activationCriteria: {
      type: String,
      enum: ['REGISTRATION', 'FIRST_DEPOSIT', 'FIRST_TRADE', 'KYC_APPROVED'],
      default: 'FIRST_DEPOSIT'
    },
    instantCredit: { type: Boolean, default: true }
  },
  
  // ==================== General Settings ====================
  minWithdrawalAmount: { type: Number, default: 50 },
  withdrawalApprovalRequired: { type: Boolean, default: true },
  enableDetailedLogs: { type: Boolean, default: true },
  
  // Last payout tracking
  lastMonthlyPayoutDate: { type: Date, default: null },
  lastMonthlyPayoutMonth: { type: String, default: null }
  
}, { timestamps: true })

// Static method to get settings
ibModeSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne({ settingsType: 'IB_MODE_CONFIG' })
  if (!settings) {
    settings = await this.create({ settingsType: 'IB_MODE_CONFIG' })
  }
  return settings
}

// Get level rate for monthly trading IB
ibModeSettingsSchema.methods.getMonthlyLevelRate = function(level) {
  if (level < 1 || level > this.monthlyTradingIB.maxLevels) return 0
  const key = `level${level}`
  return this.monthlyTradingIB.levelRates[key] || 0
}

// Get level amount for direct joining income
ibModeSettingsSchema.methods.getJoiningLevelAmount = function(level) {
  if (level < 1 || level > this.directJoiningIncome.maxLevels) return 0
  const key = `level${level}`
  return this.directJoiningIncome.levelAmounts[key] || 0
}

// Check if using monthly controlled mode
ibModeSettingsSchema.methods.isMonthlyMode = function() {
  return this.commissionMode === 'MONTHLY_CONTROLLED'
}

// Check if using realtime mode (legacy)
ibModeSettingsSchema.methods.isRealtimeMode = function() {
  return this.commissionMode === 'REALTIME'
}

export default mongoose.model('IBModeSettings', ibModeSettingsSchema)
