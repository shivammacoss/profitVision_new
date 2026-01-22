import mongoose from 'mongoose'

const ibSettingsSchema = new mongoose.Schema({
  settingsType: {
    type: String,
    default: 'GLOBAL',
    unique: true
  },
  // IB Entry Fee
  entryFee: {
    type: Number,
    default: 0 // 0 means free, any positive value is the fee in USD
  },
  entryFeeEnabled: {
    type: Boolean,
    default: false
  },
  // IB Requirements
  ibRequirements: {
    kycRequired: { type: Boolean, default: true },
    minAccountAge: { type: Number, default: 0 }, // Days
    minBalance: { type: Number, default: 0 }
  },
  // Commission settings
  commissionSettings: {
    settlementType: { type: String, enum: ['REALTIME', 'DAILY'], default: 'REALTIME' },
    minWithdrawalAmount: { type: Number, default: 50 },
    withdrawalApprovalRequired: { type: Boolean, default: true }
  },
  // Level Unlock Configuration - Progressive unlock based on referral count
  // Direct Income (Trade Commission) - max 18 levels
  directIncomeUnlock: {
    maxLevels: { type: Number, default: 18 },
    tiers: [{
      referralsRequired: { type: Number, required: true },
      levelsUnlocked: { type: Number, required: true }
    }]
  },
  // Referral Income - max 11 levels
  referralIncomeUnlock: {
    maxLevels: { type: Number, default: 11 },
    tiers: [{
      referralsRequired: { type: Number, required: true },
      levelsUnlocked: { type: Number, required: true }
    }]
  },
  // Feature toggles
  isEnabled: {
    type: Boolean,
    default: true
  },
  allowNewApplications: {
    type: Boolean,
    default: true
  },
  autoApprove: {
    type: Boolean,
    default: false
  }
}, { timestamps: true })

// Static method to get settings
ibSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne({ settingsType: 'GLOBAL' })
  if (!settings) {
    settings = await this.create({ 
      settingsType: 'GLOBAL',
      directIncomeUnlock: {
        maxLevels: 18,
        tiers: [
          { referralsRequired: 1, levelsUnlocked: 6 },
          { referralsRequired: 2, levelsUnlocked: 12 },
          { referralsRequired: 3, levelsUnlocked: 18 }
        ]
      },
      referralIncomeUnlock: {
        maxLevels: 11,
        tiers: [
          { referralsRequired: 1, levelsUnlocked: 3 },
          { referralsRequired: 2, levelsUnlocked: 6 },
          { referralsRequired: 3, levelsUnlocked: 11 }
        ]
      }
    })
  }
  // Ensure unlock tiers exist (for existing settings without them)
  if (!settings.directIncomeUnlock || !settings.directIncomeUnlock.tiers || settings.directIncomeUnlock.tiers.length === 0) {
    settings.directIncomeUnlock = {
      maxLevels: 18,
      tiers: [
        { referralsRequired: 1, levelsUnlocked: 6 },
        { referralsRequired: 2, levelsUnlocked: 12 },
        { referralsRequired: 3, levelsUnlocked: 18 }
      ]
    }
    await settings.save()
  }
  if (!settings.referralIncomeUnlock || !settings.referralIncomeUnlock.tiers || settings.referralIncomeUnlock.tiers.length === 0) {
    settings.referralIncomeUnlock = {
      maxLevels: 11,
      tiers: [
        { referralsRequired: 1, levelsUnlocked: 3 },
        { referralsRequired: 2, levelsUnlocked: 6 },
        { referralsRequired: 3, levelsUnlocked: 11 }
      ]
    }
    await settings.save()
  }
  return settings
}

// Get unlocked levels for an IB based on their referral count
ibSettingsSchema.statics.getUnlockedLevels = async function(referralCount) {
  const settings = await this.getSettings()
  
  // Calculate unlocked direct income levels
  let directIncomeLevels = 0
  const directTiers = settings.directIncomeUnlock?.tiers || []
  for (const tier of directTiers) {
    if (referralCount >= tier.referralsRequired) {
      directIncomeLevels = tier.levelsUnlocked
    }
  }
  
  // Calculate unlocked referral income levels
  let referralIncomeLevels = 0
  const referralTiers = settings.referralIncomeUnlock?.tiers || []
  for (const tier of referralTiers) {
    if (referralCount >= tier.referralsRequired) {
      referralIncomeLevels = tier.levelsUnlocked
    }
  }
  
  return {
    directIncomeLevels,
    referralIncomeLevels,
    maxDirectLevels: settings.directIncomeUnlock?.maxLevels || 18,
    maxReferralLevels: settings.referralIncomeUnlock?.maxLevels || 11,
    referralCount
  }
}

export default mongoose.model('IBSettings', ibSettingsSchema)
