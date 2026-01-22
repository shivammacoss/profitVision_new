import User from '../models/User.js'
import IBPlan from '../models/IBPlanNew.js'
import IBCommission from '../models/IBCommissionNew.js'
import IBWallet from '../models/IBWallet.js'
import IBLevel from '../models/IBLevel.js'
import IBSettings from '../models/IBSettings.js'
import Wallet from '../models/Wallet.js'
import Transaction from '../models/Transaction.js'

class IBEngine {
  constructor() {
    this.CONTRACT_SIZES = {
      'XAUUSD': 100,
      'XAGUSD': 5000,
      'BTCUSD': 1,
      'ETHUSD': 1,
      'DEFAULT_FOREX': 100000,
      'DEFAULT_CRYPTO': 1
    }
  }

  getContractSize(symbol) {
    if (this.CONTRACT_SIZES[symbol]) return this.CONTRACT_SIZES[symbol]
    if (symbol.includes('BTC') || symbol.includes('ETH') || symbol.includes('USD')) {
      if (symbol.length <= 6) return this.CONTRACT_SIZES.DEFAULT_CRYPTO
    }
    return this.CONTRACT_SIZES.DEFAULT_FOREX
  }

  // Get unlocked levels for an IB based on their direct referral count
  async getUnlockedLevelsForIB(ibUserId) {
    // Get direct referral count for this IB
    const referralCount = await User.countDocuments({ parentIBId: ibUserId })
    
    // Get unlock configuration from settings
    const unlockedLevels = await IBSettings.getUnlockedLevels(referralCount)
    
    return {
      ...unlockedLevels,
      referralCount
    }
  }

  // Get unlock progress for IB dashboard
  async getUnlockProgress(ibUserId) {
    const referralCount = await User.countDocuments({ parentIBId: ibUserId })
    const settings = await IBSettings.getSettings()
    
    const directTiers = settings.directIncomeUnlock?.tiers || [
      { referralsRequired: 1, levelsUnlocked: 6 },
      { referralsRequired: 2, levelsUnlocked: 12 },
      { referralsRequired: 3, levelsUnlocked: 18 }
    ]
    
    const referralTiers = settings.referralIncomeUnlock?.tiers || [
      { referralsRequired: 1, levelsUnlocked: 3 },
      { referralsRequired: 2, levelsUnlocked: 6 },
      { referralsRequired: 3, levelsUnlocked: 11 }
    ]
    
    // Calculate current unlocked levels
    let directIncomeLevels = 0
    let currentDirectTier = null
    let nextDirectTier = directTiers[0]
    
    for (let i = 0; i < directTiers.length; i++) {
      if (referralCount >= directTiers[i].referralsRequired) {
        directIncomeLevels = directTiers[i].levelsUnlocked
        currentDirectTier = directTiers[i]
        nextDirectTier = directTiers[i + 1] || null
      }
    }
    
    let referralIncomeLevels = 0
    let currentReferralTier = null
    let nextReferralTier = referralTiers[0]
    
    for (let i = 0; i < referralTiers.length; i++) {
      if (referralCount >= referralTiers[i].referralsRequired) {
        referralIncomeLevels = referralTiers[i].levelsUnlocked
        currentReferralTier = referralTiers[i]
        nextReferralTier = referralTiers[i + 1] || null
      }
    }
    
    return {
      referralCount,
      directIncome: {
        unlockedLevels: directIncomeLevels,
        maxLevels: settings.directIncomeUnlock?.maxLevels || 18,
        currentTier: currentDirectTier,
        nextTier: nextDirectTier,
        referralsNeeded: nextDirectTier ? nextDirectTier.referralsRequired - referralCount : 0,
        isFullyUnlocked: !nextDirectTier,
        tiers: directTiers
      },
      referralIncome: {
        unlockedLevels: referralIncomeLevels,
        maxLevels: settings.referralIncomeUnlock?.maxLevels || 11,
        currentTier: currentReferralTier,
        nextTier: nextReferralTier,
        referralsNeeded: nextReferralTier ? nextReferralTier.referralsRequired - referralCount : 0,
        isFullyUnlocked: !nextReferralTier,
        tiers: referralTiers
      }
    }
  }

  // Generate unique referral code
  async generateReferralCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code
    let exists = true
    
    while (exists) {
      code = 'IB'
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length))
      }
      exists = await User.findOne({ referralCode: code })
    }
    
    return code
  }

  // Get IB entry fee settings
  async getEntryFeeSettings() {
    const settings = await IBSettings.getSettings()
    return {
      entryFeeEnabled: settings.entryFeeEnabled || false,
      entryFee: settings.entryFee || 0
    }
  }

  // Check if user can pay entry fee
  async checkEntryFeeEligibility(userId) {
    const settings = await IBSettings.getSettings()
    
    // If entry fee is not enabled or is 0, user is eligible
    if (!settings.entryFeeEnabled || settings.entryFee <= 0) {
      return { eligible: true, entryFee: 0, walletBalance: 0, needsDeposit: false }
    }

    const entryFee = settings.entryFee
    const wallet = await Wallet.findOne({ userId })
    const walletBalance = wallet ? wallet.balance : 0

    if (walletBalance >= entryFee) {
      return { eligible: true, entryFee, walletBalance, needsDeposit: false }
    } else {
      return { 
        eligible: false, 
        entryFee, 
        walletBalance, 
        needsDeposit: true,
        shortfall: entryFee - walletBalance
      }
    }
  }

  // Apply to become IB (with entry fee)
  async applyForIB(userId) {
    const user = await User.findById(userId)
    if (!user) throw new Error('User not found')
    
    if (user.isIB) {
      throw new Error('User is already an IB')
    }

    // Check entry fee eligibility
    const settings = await IBSettings.getSettings()
    
    if (settings.entryFeeEnabled && settings.entryFee > 0) {
      const wallet = await Wallet.findOne({ userId })
      const walletBalance = wallet ? wallet.balance : 0

      if (walletBalance < settings.entryFee) {
        throw new Error(`INSUFFICIENT_BALANCE:${settings.entryFee}:${walletBalance}`)
      }

      // Deduct entry fee from wallet
      wallet.balance -= settings.entryFee
      await wallet.save()

      // Create transaction record for entry fee
      await Transaction.create({
        userId,
        type: 'IB_Entry_Fee',
        amount: settings.entryFee,
        status: 'Completed',
        paymentMethod: 'System',
        adminRemarks: 'IB Registration Entry Fee'
      })
    }

    const referralCode = await this.generateReferralCode()
    
    user.isIB = true
    // Auto-approve if entry fee is paid, otherwise set to PENDING
    user.ibStatus = (settings.entryFeeEnabled && settings.entryFee > 0) ? 'ACTIVE' : 'PENDING'
    user.referralCode = referralCode
    user.ibEntryFeePaid = settings.entryFeeEnabled ? settings.entryFee : 0
    
    // If user was referred by an IB, set parent and level
    if (user.referredBy) {
      const parentIB = await User.findOne({ 
        referralCode: user.referredBy, 
        isIB: true, 
        ibStatus: 'ACTIVE' 
      })
      if (parentIB) {
        user.parentIBId = parentIB._id
        user.ibLevel = parentIB.ibLevel + 1
      } else {
        user.ibLevel = 1
      }
    } else {
      user.ibLevel = 1
    }

    await user.save()
    
    // Create IB wallet
    await IBWallet.getOrCreateWallet(userId)

    // If auto-approved (entry fee paid), assign initial level
    if (user.ibStatus === 'ACTIVE') {
      await this.assignInitialLevel(userId)
    }
    
    return user
  }

  // Admin approve IB
  async approveIB(userId, planId = null) {
    const user = await User.findById(userId)
    if (!user) throw new Error('User not found')
    if (!user.isIB) throw new Error('User is not an IB applicant')

    user.ibStatus = 'ACTIVE'
    
    // Assign initial IB level (Standard - order 1)
    await this.assignInitialLevel(userId)
    
    // Plan is optional now - commission is based on IB Levels
    if (planId) {
      user.ibPlanId = planId
    }

    await user.save()
    return user
  }

  // Admin block IB
  async blockIB(userId, reason = '') {
    const user = await User.findById(userId)
    if (!user) throw new Error('User not found')

    user.ibStatus = 'BLOCKED'
    await user.save()
    return user
  }

  // Register user with referral code
  async registerWithReferral(userId, referralCode) {
    const user = await User.findById(userId)
    if (!user) throw new Error('User not found')

    const referringIB = await User.findOne({ 
      referralCode, 
      isIB: true, 
      ibStatus: 'ACTIVE' 
    })
    
    if (!referringIB) {
      throw new Error('Invalid or inactive referral code')
    }

    user.referredBy = referralCode
    user.parentIBId = referringIB._id
    await user.save()

    return { user, referringIB }
  }

  // Get IB chain for a trader (upline IBs)
  async getIBChain(userId, maxLevels = 5) {
    const chain = []
    let currentUser = await User.findById(userId)
    
    if (!currentUser) return chain

    let parentId = currentUser.parentIBId
    let level = 1

    while (parentId && level <= maxLevels) {
      const parentIB = await User.findById(parentId)
        .populate('ibPlanId')
      
      if (!parentIB || !parentIB.isIB || parentIB.ibStatus !== 'ACTIVE') {
        break
      }

      chain.push({
        ibUser: parentIB,
        level
      })

      parentId = parentIB.parentIBId
      level++
    }

    return chain
  }

  // Calculate and distribute IB commission when a trade closes
  async processTradeCommission(trade) {
    console.log(`Processing IB commission for trade ${trade.tradeId || trade._id}, userId: ${trade.userId}`)
    
    // Get the IB chain for the trader (up to 18 levels for direct income)
    const ibChain = await this.getIBChain(trade.userId, 18)
    
    console.log(`IB Chain length: ${ibChain.length}`)
    
    if (ibChain.length === 0) {
      console.log('No IB chain found for trader')
      return { processed: false, reason: 'No IB chain found for trader' }
    }

    const commissionResults = []
    const contractSize = this.getContractSize(trade.symbol)

    for (const { ibUser, level } of ibChain) {
      try {
        console.log(`Processing level ${level} for IB ${ibUser.firstName} (${ibUser._id})`)
        
        // Check IB's unlocked levels based on their referral count
        const unlockedLevels = await this.getUnlockedLevelsForIB(ibUser._id)
        console.log(`IB ${ibUser.firstName} has ${unlockedLevels.referralCount} referrals, unlocked ${unlockedLevels.directIncomeLevels} direct income levels`)
        
        // Check if this level is unlocked for this IB
        if (level > unlockedLevels.directIncomeLevels) {
          console.log(`Level ${level} not unlocked for IB ${ibUser.firstName} (only ${unlockedLevels.directIncomeLevels} levels unlocked)`)
          continue
        }
        
        // Get IB's plan - always fetch fresh from DB
        let plan = await IBPlan.findById(ibUser.ibPlanId)
        if (!plan) {
          plan = await IBPlan.getDefaultPlan()
        }
        if (!plan) {
          console.log(`No plan found for IB ${ibUser.firstName}`)
          continue
        }
        
        console.log(`Plan: ${plan.name}, maxLevels: ${plan.maxLevels}, commissionType: ${plan.commissionType}`)
        console.log(`levelCommissions:`, plan.levelCommissions)

        // Check if level is within plan's max levels (also respect plan limits)
        if (level > plan.maxLevels) {
          console.log(`Level ${level} exceeds plan maxLevels ${plan.maxLevels}`)
          continue
        }

        // Get rate for this level - support both levelCommissions object and levels array
        let rate = 0
        if (plan.levelCommissions && plan.levelCommissions[`level${level}`]) {
          rate = plan.levelCommissions[`level${level}`]
        } else if (plan.levels && plan.levels.length > 0) {
          const levelConfig = plan.levels.find(l => l.level === level)
          rate = levelConfig ? levelConfig.rate : 0
        } else if (plan.getRateForLevel) {
          rate = plan.getRateForLevel(level)
        }
        
        console.log(`Level ${level} rate: ${rate}`)
        
        if (rate <= 0) {
          console.log(`Rate is 0 for level ${level}`)
          continue
        }

        // Calculate commission based on commission type
        let commissionAmount = 0
        let baseAmount = trade.quantity // lot size
        
        if (plan.commissionType === 'PER_LOT') {
          // PER_LOT: rate is $ per lot
          commissionAmount = trade.quantity * rate
        } else {
          // PERCENTAGE: rate is % of trade value
          const tradeValue = trade.quantity * contractSize * (trade.openPrice || 0)
          commissionAmount = tradeValue * (rate / 100)
        }

        if (commissionAmount <= 0) {
          console.log(`IB Commission: Skipping - commission amount is 0 for level ${level}`)
          continue
        }

        // Check if commission already exists for this trade and IB to prevent duplicates
        const existingCommission = await IBCommission.findOne({
          tradeId: trade._id,
          ibUserId: ibUser._id,
          level
        })
        
        if (existingCommission) {
          console.log(`IB Commission: Skipping - commission already exists for trade ${trade._id} and IB ${ibUser._id} at level ${level}`)
          continue
        }

        // Create commission record
        const commission = await IBCommission.create({
          tradeId: trade._id,
          traderUserId: trade.userId,
          ibUserId: ibUser._id,
          level,
          baseAmount,
          commissionAmount,
          symbol: trade.symbol,
          tradeLotSize: trade.quantity,
          contractSize,
          commissionType: plan.commissionType,
          status: 'CREDITED'
        })

        // Credit IB wallet
        const wallet = await IBWallet.getOrCreateWallet(ibUser._id)
        await wallet.creditCommission(commissionAmount)

        commissionResults.push({
          ibUserId: ibUser._id,
          ibName: ibUser.firstName,
          level,
          baseAmount,
          commissionAmount,
          commissionId: commission._id
        })

        console.log(`IB Commission: Level ${level} IB ${ibUser.firstName} earned $${commissionAmount.toFixed(2)} from trade ${trade.tradeId}`)

      } catch (error) {
        console.error(`Error processing IB commission for level ${level}:`, error)
      }
    }

    return {
      processed: true,
      commissionsGenerated: commissionResults.length,
      results: commissionResults
    }
  }

  // Reverse commission (admin action)
  async reverseCommission(commissionId, adminId, reason = '') {
    const commission = await IBCommission.findById(commissionId)
    if (!commission) throw new Error('Commission not found')
    if (commission.status === 'REVERSED') throw new Error('Commission already reversed')

    // Deduct from IB wallet
    const wallet = await IBWallet.getOrCreateWallet(commission.ibUserId)
    await wallet.reverseCommission(commission.commissionAmount)

    // Update commission status
    commission.status = 'REVERSED'
    commission.reversedAt = new Date()
    commission.reversedBy = adminId
    commission.reversalReason = reason
    await commission.save()

    return commission
  }

  // Get IB tree using $graphLookup (for admin visualization)
  async getIBTree(ibId, maxDepth = 5) {
    const result = await User.aggregate([
      { $match: { _id: ibId } },
      {
        $graphLookup: {
          from: 'users',
          startWith: '$_id',
          connectFromField: '_id',
          connectToField: 'parentIBId',
          as: 'downlines',
          maxDepth: maxDepth - 1,
          depthField: 'level'
        }
      },
      {
        $project: {
          _id: 1,
          firstName: 1,
          email: 1,
          referralCode: 1,
          ibStatus: 1,
          ibLevel: 1,
          downlines: {
            _id: 1,
            firstName: 1,
            email: 1,
            referralCode: 1,
            ibStatus: 1,
            isIB: 1,
            parentIBId: 1,
            level: 1
          }
        }
      }
    ])

    return result[0] || null
  }

  // Get IB stats for admin dashboard
  async getIBStats(ibUserId) {
    const user = await User.findById(ibUserId)
    if (!user || !user.isIB) throw new Error('IB not found')

    // Get wallet
    const wallet = await IBWallet.getOrCreateWallet(ibUserId)

    // Get direct referrals count
    const directReferrals = await User.countDocuments({ parentIBId: ibUserId })

    // Get total downline count (all levels)
    const tree = await this.getIBTree(user._id, 5)
    const totalDownline = tree?.downlines?.length || 0

    // Get commission stats
    const commissionStats = await IBCommission.aggregate([
      { $match: { ibUserId: user._id, status: 'CREDITED' } },
      {
        $group: {
          _id: null,
          totalCommission: { $sum: '$commissionAmount' },
          totalTrades: { $sum: 1 }
        }
      }
    ])

    // Get active traders (users who traded in last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const activeTraders = await IBCommission.aggregate([
      { 
        $match: { 
          ibUserId: user._id, 
          createdAt: { $gte: thirtyDaysAgo } 
        } 
      },
      { $group: { _id: '$traderUserId' } },
      { $count: 'count' }
    ])

    // Get commission counts per level
    const levelCommissions = await IBCommission.aggregate([
      { $match: { ibUserId: user._id, status: 'CREDITED' } },
      {
        $group: {
          _id: '$level',
          count: { $sum: 1 },
          totalAmount: { $sum: '$commissionAmount' }
        }
      },
      { $sort: { _id: 1 } }
    ])

    // Build level counts object
    const levelCounts = {}
    for (let i = 1; i <= 5; i++) {
      const levelData = levelCommissions.find(l => l._id === i)
      levelCounts[`level${i}Count`] = levelData?.count || 0
      levelCounts[`level${i}Commission`] = levelData?.totalAmount || 0
    }

    return {
      ibUser: {
        _id: user._id,
        firstName: user.firstName,
        email: user.email,
        referralCode: user.referralCode,
        ibStatus: user.ibStatus,
        ibLevel: user.ibLevel
      },
      wallet: {
        balance: wallet.balance,
        totalEarned: wallet.totalEarned,
        totalWithdrawn: wallet.totalWithdrawn,
        pendingWithdrawal: wallet.pendingWithdrawal
      },
      stats: {
        directReferrals,
        totalDownline,
        totalCommission: commissionStats[0]?.totalCommission || 0,
        totalTrades: commissionStats[0]?.totalTrades || 0,
        activeTraders: activeTraders[0]?.count || 0,
        ...levelCounts
      }
    }
  }

  // Withdraw from IB wallet to main wallet
  async withdrawToWallet(ibUserId, amount) {
    const user = await User.findById(ibUserId)
    if (!user || !user.isIB) throw new Error('IB not found')

    const wallet = await IBWallet.getOrCreateWallet(ibUserId)
    
    if (amount > wallet.balance) {
      throw new Error('Insufficient IB wallet balance')
    }

    // Deduct from IB wallet
    await wallet.requestWithdrawal(amount)
    
    // Add to user's main wallet balance
    user.walletBalance = (user.walletBalance || 0) + amount
    await user.save()

    // Complete the withdrawal
    await wallet.completeWithdrawal(amount)

    return {
      ibWalletBalance: wallet.balance,
      mainWalletBalance: user.walletBalance,
      withdrawnAmount: amount
    }
  }

  // Get IB level progress for user dashboard - now returns unlock progress
  async getIBLevelProgress(ibUserId) {
    const user = await User.findById(ibUserId).populate('ibLevelId')
    if (!user || !user.isIB) throw new Error('IB not found')

    // Return the new unlock progress system
    return await this.getUnlockProgress(ibUserId)
  }

  // Assign initial level to new IB
  async assignInitialLevel(userId) {
    const user = await User.findById(userId)
    if (!user) throw new Error('User not found')

    // Get the first level (Standard)
    let firstLevel = await IBLevel.findOne({ order: 1, isActive: true })
    if (!firstLevel) {
      await IBLevel.initializeDefaultLevels()
      firstLevel = await IBLevel.findOne({ order: 1, isActive: true })
    }

    if (firstLevel) {
      user.ibLevelId = firstLevel._id
      user.ibLevelOrder = firstLevel.order
      await user.save()
    }

    return user
  }

  // Get IB chain with extended levels (up to 50)
  async getIBChainExtended(userId, maxLevels = 50) {
    const chain = []
    let currentUser = await User.findById(userId)
    
    if (!currentUser) return chain

    let parentId = currentUser.parentIBId
    let level = 1

    while (parentId && level <= maxLevels) {
      const parentIB = await User.findById(parentId)
        .populate('ibPlanId')
        .populate('ibLevelId')
      
      if (!parentIB || !parentIB.isIB || parentIB.ibStatus !== 'ACTIVE') {
        break
      }

      chain.push({
        ibUser: parentIB,
        level,
        ibLevel: parentIB.ibLevelId
      })

      parentId = parentIB.parentIBId
      level++
    }

    return chain
  }

  // Process First Join Commission - when a new user joins via referral
  async processFirstJoinCommission(newUserId, depositAmount = 0) {
    console.log(`Processing First Join Commission for user ${newUserId}`)
    
    const ibChain = await this.getIBChainExtended(newUserId)
    
    if (ibChain.length === 0) {
      console.log('No IB chain found for new user')
      return { processed: false, reason: 'No IB chain found' }
    }

    const commissionResults = []

    for (const { ibUser, level, ibLevel } of ibChain) {
      try {
        // Get commission config from IB's level
        const levelConfig = ibLevel || await IBLevel.findById(ibUser.ibLevelId)
        if (!levelConfig) continue

        // Check if level is within max downline levels
        if (level > (levelConfig.maxDownlineLevels || 5)) continue

        // Find first join commission for this level
        const commissionConfig = levelConfig.firstJoinCommission?.find(c => c.level === level)
        if (!commissionConfig || commissionConfig.amount <= 0) continue

        // Calculate commission
        let commissionAmount = 0
        if (commissionConfig.type === 'FIXED') {
          commissionAmount = commissionConfig.amount
        } else if (commissionConfig.type === 'PERCENT' && depositAmount > 0) {
          commissionAmount = depositAmount * (commissionConfig.amount / 100)
        }

        if (commissionAmount <= 0) continue

        // Check for duplicate
        const existingCommission = await IBCommission.findOne({
          traderUserId: newUserId,
          ibUserId: ibUser._id,
          level,
          commissionType: 'FIRST_JOIN'
        })
        
        if (existingCommission) continue

        // Create commission record
        const commission = await IBCommission.create({
          traderUserId: newUserId,
          ibUserId: ibUser._id,
          level,
          baseAmount: depositAmount,
          commissionAmount,
          commissionType: 'FIRST_JOIN',
          status: 'CREDITED'
        })

        // Credit IB wallet
        const wallet = await IBWallet.getOrCreateWallet(ibUser._id)
        await wallet.creditCommission(commissionAmount)

        commissionResults.push({
          ibUserId: ibUser._id,
          ibName: ibUser.firstName,
          level,
          commissionAmount,
          type: 'FIRST_JOIN'
        })

        console.log(`First Join Commission: Level ${level} IB ${ibUser.firstName} earned $${commissionAmount.toFixed(2)}`)

      } catch (error) {
        console.error(`Error processing first join commission for level ${level}:`, error)
      }
    }

    return {
      processed: true,
      commissionsGenerated: commissionResults.length,
      results: commissionResults
    }
  }

  // Process Referral Commission - when a downline IB refers someone new
  async processReferralCommission(referringIBId, newReferralId) {
    console.log(`Processing Referral Commission for IB ${referringIBId} referring ${newReferralId}`)
    
    // Get the upline chain of the referring IB (up to 11 levels for referral income)
    const ibChain = await this.getIBChainExtended(referringIBId, 11)
    
    if (ibChain.length === 0) {
      console.log('No upline IB chain found')
      return { processed: false, reason: 'No upline IB chain found' }
    }

    const commissionResults = []

    for (const { ibUser, level, ibLevel } of ibChain) {
      try {
        // Check IB's unlocked referral income levels based on their referral count
        const unlockedLevels = await this.getUnlockedLevelsForIB(ibUser._id)
        console.log(`IB ${ibUser.firstName} has ${unlockedLevels.referralCount} referrals, unlocked ${unlockedLevels.referralIncomeLevels} referral income levels`)
        
        // Check if this level is unlocked for referral income
        if (level > unlockedLevels.referralIncomeLevels) {
          console.log(`Level ${level} not unlocked for referral income for IB ${ibUser.firstName} (only ${unlockedLevels.referralIncomeLevels} levels unlocked)`)
          continue
        }

        const levelConfig = ibLevel || await IBLevel.findById(ibUser.ibLevelId)
        if (!levelConfig) continue

        if (level > (levelConfig.maxDownlineLevels || 11)) continue

        // Find referral commission for this level
        const commissionConfig = levelConfig.referralCommission?.find(c => c.level === level)
        if (!commissionConfig || commissionConfig.amount <= 0) continue

        let commissionAmount = commissionConfig.amount // Fixed amount for referral bonus

        if (commissionAmount <= 0) continue

        // Check for duplicate
        const existingCommission = await IBCommission.findOne({
          traderUserId: newReferralId,
          ibUserId: ibUser._id,
          level,
          commissionType: 'REFERRAL_BONUS',
          referringIBId: referringIBId
        })
        
        if (existingCommission) continue

        // Create commission record
        const commission = await IBCommission.create({
          traderUserId: newReferralId,
          ibUserId: ibUser._id,
          referringIBId: referringIBId,
          level,
          baseAmount: 0,
          commissionAmount,
          commissionType: 'REFERRAL_BONUS',
          status: 'CREDITED'
        })

        // Credit IB wallet
        const wallet = await IBWallet.getOrCreateWallet(ibUser._id)
        await wallet.creditCommission(commissionAmount)

        commissionResults.push({
          ibUserId: ibUser._id,
          ibName: ibUser.firstName,
          level,
          commissionAmount,
          type: 'REFERRAL_BONUS'
        })

        console.log(`Referral Commission: Level ${level} IB ${ibUser.firstName} earned $${commissionAmount.toFixed(2)}`)

      } catch (error) {
        console.error(`Error processing referral commission for level ${level}:`, error)
      }
    }

    return {
      processed: true,
      commissionsGenerated: commissionResults.length,
      results: commissionResults
    }
  }

  // Process Trade Commission with extended levels
  async processTradeCommissionExtended(trade) {
    console.log(`Processing Extended Trade Commission for trade ${trade.tradeId || trade._id}`)
    
    const ibChain = await this.getIBChainExtended(trade.userId)
    
    if (ibChain.length === 0) {
      return { processed: false, reason: 'No IB chain found for trader' }
    }

    const commissionResults = []
    const contractSize = this.getContractSize(trade.symbol)

    for (const { ibUser, level, ibLevel } of ibChain) {
      try {
        const levelConfig = ibLevel || await IBLevel.findById(ibUser.ibLevelId)
        if (!levelConfig) continue

        if (level > (levelConfig.maxDownlineLevels || 5)) continue

        // Find trade commission for this level
        const commissionConfig = levelConfig.tradeCommission?.find(c => c.level === level)
        
        // Fallback to legacy downlineCommission if new config not available
        let rate = 0
        let commissionType = 'PER_LOT'
        
        if (commissionConfig && commissionConfig.amount > 0) {
          rate = commissionConfig.amount
          commissionType = commissionConfig.type
        } else if (levelConfig.downlineCommission && levelConfig.downlineCommission[`level${level}`]) {
          rate = levelConfig.downlineCommission[`level${level}`]
        }

        if (rate <= 0) continue

        // Calculate commission
        let commissionAmount = 0
        if (commissionType === 'PER_LOT') {
          commissionAmount = trade.quantity * rate
        } else if (commissionType === 'PERCENT') {
          const tradeValue = trade.quantity * contractSize * (trade.openPrice || 0)
          commissionAmount = tradeValue * (rate / 100)
        }

        if (commissionAmount <= 0) continue

        // Check for duplicate
        const existingCommission = await IBCommission.findOne({
          tradeId: trade._id,
          ibUserId: ibUser._id,
          level
        })
        
        if (existingCommission) continue

        // Create commission record
        const commission = await IBCommission.create({
          tradeId: trade._id,
          traderUserId: trade.userId,
          ibUserId: ibUser._id,
          level,
          baseAmount: trade.quantity,
          commissionAmount,
          symbol: trade.symbol,
          tradeLotSize: trade.quantity,
          contractSize,
          commissionType: 'TRADE',
          status: 'CREDITED'
        })

        // Credit IB wallet
        const wallet = await IBWallet.getOrCreateWallet(ibUser._id)
        await wallet.creditCommission(commissionAmount)

        commissionResults.push({
          ibUserId: ibUser._id,
          ibName: ibUser.firstName,
          level,
          commissionAmount,
          type: 'TRADE'
        })

        console.log(`Trade Commission: Level ${level} IB ${ibUser.firstName} earned $${commissionAmount.toFixed(2)}`)

      } catch (error) {
        console.error(`Error processing trade commission for level ${level}:`, error)
      }
    }

    return {
      processed: true,
      commissionsGenerated: commissionResults.length,
      results: commissionResults
    }
  }
}

export default new IBEngine()
