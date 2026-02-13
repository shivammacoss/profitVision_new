import IBModeSettings from '../models/IBModeSettings.js'
import MonthlyIBCommission from '../models/MonthlyIBCommission.js'
import MonthlyTradingLot from '../models/MonthlyTradingLot.js'
import IBUser from '../models/IBUser.js'
import IBReferral from '../models/IBReferral.js'
import User from '../models/User.js'
import { v4 as uuidv4 } from 'uuid'

class MonthlyIBEngine {
  constructor() {
    this.CONTRACT_SIZE = 100000
  }

  // Get current month period (YYYY-MM)
  getCurrentMonthPeriod() {
    return new Date().toISOString().slice(0, 7)
  }

  // Get previous month period
  getPreviousMonthPeriod() {
    const date = new Date()
    date.setMonth(date.getMonth() - 1)
    return date.toISOString().slice(0, 7)
  }

  // Get contract size based on symbol
  getContractSize(symbol) {
    if (symbol === 'XAUUSD') return 100
    if (symbol === 'XAGUSD') return 5000
    if (['BTCUSD', 'ETHUSD', 'LTCUSD', 'XRPUSD', 'BCHUSD'].includes(symbol)) return 1
    return 100000
  }

  // Record trade volume for monthly calculation (called when trade closes)
  async recordTradeVolume(trade) {
    const settings = await IBModeSettings.getSettings()
    
    // Only process if in monthly controlled mode
    if (!settings.isMonthlyMode() || !settings.monthlyTradingIB.enabled) {
      return { processed: false, reason: 'Monthly IB mode not enabled' }
    }

    const contractSize = this.getContractSize(trade.symbol)
    const volume = trade.quantity * contractSize

    // Add to monthly trading lot record
    const result = await MonthlyTradingLot.addTradeVolume(
      trade.userId,
      trade.quantity, // lots
      trade._id,
      volume
    )

    console.log(`[Monthly IB] Recorded ${trade.quantity} lots for user ${trade.userId} in ${this.getCurrentMonthPeriod()}`)

    return {
      processed: true,
      userId: trade.userId,
      lots: trade.quantity,
      monthPeriod: this.getCurrentMonthPeriod(),
      totalMonthlyLots: result.totalLots
    }
  }

  // Get upline chain for a user (up to maxLevels)
  async getUplineChain(userId, maxLevels = 11) {
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

      // Move up the chain - find the IB's user ID to continue
      currentUserId = ibUser.userId
    }

    return chain
  }

  // Calculate and distribute monthly commissions (batch job)
  async processMonthlyPayout(monthPeriod = null) {
    const targetMonth = monthPeriod || this.getPreviousMonthPeriod()
    const batchId = `MONTHLY_${targetMonth}_${uuidv4().slice(0, 8)}`
    
    console.log(`[Monthly IB] Starting batch payout for ${targetMonth}, Batch ID: ${batchId}`)

    const settings = await IBModeSettings.getSettings()
    
    if (!settings.isMonthlyMode() || !settings.monthlyTradingIB.enabled) {
      return { 
        success: false, 
        reason: 'Monthly IB mode not enabled',
        batchId 
      }
    }

    // Check if already processed this month
    if (settings.lastMonthlyPayoutMonth === targetMonth) {
      return {
        success: false,
        reason: `Month ${targetMonth} already processed on ${settings.lastMonthlyPayoutDate}`,
        batchId
      }
    }

    // Get all traders with volume for this month
    const monthlyTraders = await MonthlyTradingLot.find({
      monthPeriod: targetMonth,
      status: 'ACCUMULATING',
      totalLots: { $gte: settings.monthlyTradingIB.minLotsForPayout }
    }).populate('userId', 'firstName lastName email')

    console.log(`[Monthly IB] Found ${monthlyTraders.length} traders with volume in ${targetMonth}`)

    const results = {
      batchId,
      monthPeriod: targetMonth,
      tradersProcessed: 0,
      commissionsCreated: 0,
      totalCommissionAmount: 0,
      errors: []
    }

    for (const traderRecord of monthlyTraders) {
      try {
        // Get upline chain for this trader
        const uplineChain = await this.getUplineChain(traderRecord.userId._id || traderRecord.userId)

        if (uplineChain.length === 0) {
          console.log(`[Monthly IB] No upline found for trader ${traderRecord.userId.email}`)
          continue
        }

        // Calculate and create commission for each level
        for (const { ibUser, ibUserId, level } of uplineChain) {
          const ratePerLot = settings.getMonthlyLevelRate(level)
          if (ratePerLot <= 0) continue

          const commissionAmount = Math.round(traderRecord.totalLots * ratePerLot * 100) / 100

          if (commissionAmount <= 0) continue

          try {
            // Create commission record
            const commission = await MonthlyIBCommission.create({
              ibUserId,
              traderId: traderRecord.userId._id || traderRecord.userId,
              monthPeriod: targetMonth,
              level,
              totalLots: traderRecord.totalLots,
              totalTrades: traderRecord.totalTrades,
              ratePerLot,
              commissionAmount,
              status: 'PENDING',
              batchId
            })

            results.commissionsCreated++
            results.totalCommissionAmount += commissionAmount

            console.log(`[Monthly IB] Created commission: $${commissionAmount} for IB ${ibUserId} (Level ${level}) from trader ${traderRecord.userId.email}`)

          } catch (dupError) {
            if (dupError.code === 11000) {
              console.log(`[Monthly IB] Commission already exists for IB ${ibUserId}, trader ${traderRecord.userId._id}, month ${targetMonth}, level ${level}`)
            } else {
              throw dupError
            }
          }
        }

        // Mark trader record as processed
        traderRecord.status = 'PROCESSED'
        traderRecord.processedAt = new Date()
        traderRecord.batchId = batchId
        await traderRecord.save()

        results.tradersProcessed++

      } catch (error) {
        console.error(`[Monthly IB] Error processing trader ${traderRecord.userId}:`, error)
        results.errors.push({
          traderId: traderRecord.userId._id || traderRecord.userId,
          error: error.message
        })
      }
    }

    // Now credit all pending commissions to wallets
    await this.creditPendingCommissions(batchId)

    // Update settings with last payout info
    settings.lastMonthlyPayoutDate = new Date()
    settings.lastMonthlyPayoutMonth = targetMonth
    await settings.save()

    console.log(`[Monthly IB] Batch payout complete. Traders: ${results.tradersProcessed}, Commissions: ${results.commissionsCreated}, Total: $${results.totalCommissionAmount}`)

    return {
      success: true,
      ...results
    }
  }

  // Credit pending commissions to IB wallets
  async creditPendingCommissions(batchId) {
    const pendingCommissions = await MonthlyIBCommission.find({
      batchId,
      status: 'PENDING'
    })

    console.log(`[Monthly IB] Crediting ${pendingCommissions.length} pending commissions`)

    for (const commission of pendingCommissions) {
      try {
        // Find or create IB user record
        let ibUser = await IBUser.findOne({ userId: commission.ibUserId })
        
        if (!ibUser) {
          console.log(`[Monthly IB] IB user not found for ${commission.ibUserId}, skipping`)
          commission.status = 'FAILED'
          commission.errorMessage = 'IB user not found'
          await commission.save()
          continue
        }

        // Credit to IB wallet
        ibUser.ibWalletBalance += commission.commissionAmount
        ibUser.totalCommissionEarned += commission.commissionAmount
        await ibUser.save()

        // Update commission status
        commission.status = 'CREDITED'
        commission.creditedAt = new Date()
        await commission.save()

        console.log(`[Monthly IB] Credited $${commission.commissionAmount} to IB ${commission.ibUserId}`)

      } catch (error) {
        console.error(`[Monthly IB] Error crediting commission ${commission._id}:`, error)
        commission.status = 'FAILED'
        commission.errorMessage = error.message
        await commission.save()
      }
    }
  }

  // Get monthly commission summary for an IB
  async getIBMonthlySummary(ibUserId, monthPeriod = null) {
    const targetMonth = monthPeriod || this.getCurrentMonthPeriod()

    const commissions = await MonthlyIBCommission.find({
      ibUserId,
      monthPeriod: targetMonth
    }).populate('traderId', 'firstName lastName email')

    const summary = {
      monthPeriod: targetMonth,
      totalCommission: 0,
      totalLots: 0,
      byLevel: {},
      commissions: []
    }

    for (const comm of commissions) {
      summary.totalCommission += comm.commissionAmount
      summary.totalLots += comm.totalLots

      if (!summary.byLevel[comm.level]) {
        summary.byLevel[comm.level] = { commission: 0, lots: 0, traders: 0 }
      }
      summary.byLevel[comm.level].commission += comm.commissionAmount
      summary.byLevel[comm.level].lots += comm.totalLots
      summary.byLevel[comm.level].traders++

      summary.commissions.push({
        traderId: comm.traderId?._id,
        traderName: comm.traderId ? `${comm.traderId.firstName} ${comm.traderId.lastName}` : 'Unknown',
        traderEmail: comm.traderId?.email || 'Unknown',
        level: comm.level,
        lots: comm.totalLots,
        ratePerLot: comm.ratePerLot,
        commission: comm.commissionAmount,
        status: comm.status
      })
    }

    return summary
  }

  // Admin: Get batch payout report
  async getBatchReport(batchId) {
    const commissions = await MonthlyIBCommission.find({ batchId })
      .populate('ibUserId', 'firstName lastName email')
      .populate('traderId', 'firstName lastName email')

    const summary = {
      batchId,
      totalCommissions: commissions.length,
      totalAmount: 0,
      byStatus: { PENDING: 0, CREDITED: 0, FAILED: 0 },
      byLevel: {}
    }

    for (const comm of commissions) {
      summary.totalAmount += comm.commissionAmount
      summary.byStatus[comm.status] = (summary.byStatus[comm.status] || 0) + 1
      
      if (!summary.byLevel[comm.level]) {
        summary.byLevel[comm.level] = { count: 0, amount: 0 }
      }
      summary.byLevel[comm.level].count++
      summary.byLevel[comm.level].amount += comm.commissionAmount
    }

    return { summary, commissions }
  }
}

export default new MonthlyIBEngine()
