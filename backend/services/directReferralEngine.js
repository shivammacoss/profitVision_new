import IBModeSettings from '../models/IBModeSettings.js'
import DirectReferralCommission from '../models/DirectReferralCommission.js'
import IBUser from '../models/IBUser.js'
import IBReferral from '../models/IBReferral.js'
import User from '../models/User.js'

class DirectReferralEngine {
  constructor() {}

  // Get upline chain for a user (up to maxLevels)
  async getUplineChain(userId, maxLevels = 18) {
    const chain = []
    let currentUserId = userId

    for (let level = 1; level <= maxLevels; level++) {
      // Find who referred this user
      const referral = await IBReferral.findOne({ 
        userId: currentUserId, 
        status: 'ACTIVE' 
      }).populate('referredByIBId')

      if (!referral || !referral.referredByIBId) break

      const ibUser = await IBUser.findById(referral.referredByIBId)
      if (!ibUser || ibUser.status !== 'ACTIVE') break

      chain.push({
        ibUser,
        ibUserId: ibUser.userId,
        level
      })

      // Move up the chain
      currentUserId = ibUser.userId
    }

    return chain
  }

  // Process direct referral commission when a new user activates
  // Trigger can be: REGISTRATION, FIRST_DEPOSIT, FIRST_TRADE, KYC_APPROVED
  async processNewUserActivation(newUserId, activationTrigger) {
    console.log(`[Direct Referral] Processing activation for user ${newUserId}, trigger: ${activationTrigger}`)

    const settings = await IBModeSettings.getSettings()

    // Check if direct joining income is enabled
    if (!settings.directJoiningIncome.enabled) {
      return { 
        processed: false, 
        reason: 'Direct joining income not enabled' 
      }
    }

    // Check if this is the correct activation trigger
    if (settings.directJoiningIncome.requireActivation && 
        settings.directJoiningIncome.activationCriteria !== activationTrigger) {
      return {
        processed: false,
        reason: `Activation criteria not met. Required: ${settings.directJoiningIncome.activationCriteria}, Got: ${activationTrigger}`
      }
    }

    // Check if commission already paid for this user
    const alreadyPaid = await DirectReferralCommission.isCommissionPaid(newUserId)
    if (alreadyPaid) {
      return {
        processed: false,
        reason: 'Commission already paid for this user'
      }
    }

    // Get the new user's info
    const newUser = await User.findById(newUserId)
    if (!newUser) {
      return { processed: false, reason: 'User not found' }
    }

    // Find who directly referred this user
    const directReferral = await IBReferral.findOne({ 
      userId: newUserId, 
      status: 'ACTIVE' 
    }).populate('referredByIBId')

    if (!directReferral || !directReferral.referredByIBId) {
      return { 
        processed: false, 
        reason: 'No referral found for this user' 
      }
    }

    const directReferrerId = directReferral.referredByIBId.userId

    // Get full upline chain
    const uplineChain = await this.getUplineChain(newUserId, settings.directJoiningIncome.maxLevels)

    if (uplineChain.length === 0) {
      return { 
        processed: false, 
        reason: 'No active IB upline found' 
      }
    }

    console.log(`[Direct Referral] Found ${uplineChain.length} levels in upline for user ${newUser.email}`)

    const results = {
      newUserId,
      newUserEmail: newUser.email,
      activationTrigger,
      commissionsCreated: 0,
      totalDistributed: 0,
      distributions: []
    }

    // Distribute commission to each level
    for (const { ibUser, ibUserId, level } of uplineChain) {
      const commissionAmount = settings.getJoiningLevelAmount(level)
      
      if (commissionAmount <= 0) continue

      try {
        // Create commission record
        const commission = await DirectReferralCommission.create({
          ibUserId,
          newUserId,
          directReferrerId,
          level,
          commissionAmount,
          activationTrigger,
          status: settings.directJoiningIncome.instantCredit ? 'CREDITED' : 'PENDING',
          creditedAt: settings.directJoiningIncome.instantCredit ? new Date() : null
        })

        // Credit to IB wallet if instant credit is enabled
        if (settings.directJoiningIncome.instantCredit) {
          ibUser.ibWalletBalance += commissionAmount
          ibUser.totalCommissionEarned += commissionAmount
          await ibUser.save()

          console.log(`[Direct Referral] Credited $${commissionAmount} to IB ${ibUserId} (Level ${level})`)
        }

        results.commissionsCreated++
        results.totalDistributed += commissionAmount
        results.distributions.push({
          ibUserId,
          level,
          amount: commissionAmount,
          status: commission.status
        })

      } catch (dupError) {
        if (dupError.code === 11000) {
          console.log(`[Direct Referral] Commission already exists for IB ${ibUserId}, user ${newUserId}, level ${level}`)
        } else {
          console.error(`[Direct Referral] Error creating commission:`, dupError)
        }
      }
    }

    console.log(`[Direct Referral] Distributed $${results.totalDistributed} across ${results.commissionsCreated} levels for user ${newUser.email}`)

    return {
      processed: true,
      ...results
    }
  }

  // Get referral income summary for an IB
  async getIBReferralSummary(ibUserId) {
    const commissions = await DirectReferralCommission.find({
      ibUserId,
      status: 'CREDITED'
    })
      .populate('newUserId', 'firstName lastName email createdAt')
      .sort({ createdAt: -1 })

    const summary = {
      totalCommission: 0,
      totalReferrals: 0,
      byLevel: {},
      recentCommissions: []
    }

    const uniqueUsers = new Set()

    for (const comm of commissions) {
      summary.totalCommission += comm.commissionAmount
      uniqueUsers.add(comm.newUserId._id.toString())

      if (!summary.byLevel[comm.level]) {
        summary.byLevel[comm.level] = { commission: 0, count: 0 }
      }
      summary.byLevel[comm.level].commission += comm.commissionAmount
      summary.byLevel[comm.level].count++

      if (summary.recentCommissions.length < 20) {
        summary.recentCommissions.push({
          newUserId: comm.newUserId._id,
          newUserName: `${comm.newUserId.firstName} ${comm.newUserId.lastName}`,
          newUserEmail: comm.newUserId.email,
          level: comm.level,
          amount: comm.commissionAmount,
          date: comm.creditedAt || comm.createdAt
        })
      }
    }

    summary.totalReferrals = uniqueUsers.size

    return summary
  }

  // Admin: Get all referral commissions for a period
  async getAdminReport(startDate, endDate) {
    const query = {
      status: 'CREDITED'
    }

    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) query.createdAt.$gte = new Date(startDate)
      if (endDate) query.createdAt.$lte = new Date(endDate)
    }

    const commissions = await DirectReferralCommission.find(query)
      .populate('ibUserId', 'firstName lastName email')
      .populate('newUserId', 'firstName lastName email')
      .sort({ createdAt: -1 })

    const summary = {
      totalCommissions: commissions.length,
      totalAmount: 0,
      byLevel: {},
      byIB: {}
    }

    for (const comm of commissions) {
      summary.totalAmount += comm.commissionAmount

      if (!summary.byLevel[comm.level]) {
        summary.byLevel[comm.level] = { count: 0, amount: 0 }
      }
      summary.byLevel[comm.level].count++
      summary.byLevel[comm.level].amount += comm.commissionAmount

      const ibKey = comm.ibUserId._id.toString()
      if (!summary.byIB[ibKey]) {
        summary.byIB[ibKey] = {
          name: `${comm.ibUserId.firstName} ${comm.ibUserId.lastName}`,
          email: comm.ibUserId.email,
          count: 0,
          amount: 0
        }
      }
      summary.byIB[ibKey].count++
      summary.byIB[ibKey].amount += comm.commissionAmount
    }

    return { summary, commissions }
  }

  // Reverse a commission (admin action)
  async reverseCommission(commissionId, adminId, reason) {
    const commission = await DirectReferralCommission.findById(commissionId)
    if (!commission) {
      throw new Error('Commission not found')
    }

    if (commission.status === 'REVERSED') {
      throw new Error('Commission already reversed')
    }

    // Deduct from IB wallet
    const ibUser = await IBUser.findOne({ userId: commission.ibUserId })
    if (ibUser) {
      ibUser.ibWalletBalance -= commission.commissionAmount
      ibUser.totalCommissionEarned -= commission.commissionAmount
      await ibUser.save()
    }

    // Update commission status
    commission.status = 'REVERSED'
    commission.reversedAt = new Date()
    commission.reversedBy = adminId
    commission.reversalReason = reason
    await commission.save()

    console.log(`[Direct Referral] Reversed commission ${commissionId}: $${commission.commissionAmount}`)

    return commission
  }
}

export default new DirectReferralEngine()
