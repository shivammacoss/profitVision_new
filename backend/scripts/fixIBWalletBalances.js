import mongoose from 'mongoose'
import dotenv from 'dotenv'
import IBWallet from '../models/IBWallet.js'
import IBCommission from '../models/IBCommissionNew.js'
import ReferralCommission from '../models/ReferralCommission.js'
import IBWithdrawalRequest from '../models/IBWithdrawalRequest.js'

dotenv.config()

/**
 * ONE-TIME FIX: Reconcile IBWallet balance splits
 *
 * PROBLEM: Earlier code used legacy wallet.creditCommission() which only updated
 * the combined balance/totalEarned fields, never the separate directIncomeBalance
 * or referralIncomeBalance. That broke the split-withdrawal flow.
 *
 * THIS SCRIPT (per IB user):
 *   directIncomeTotalEarned    = sum(ReferralCommission where CREDITED and DIRECT_JOINING)
 *                              + sum(IBCommission where CREDITED and commissionType=FIRST_JOIN)
 *   referralIncomeTotalEarned  = sum(ReferralCommission where CREDITED and REFERRAL_INCOME)
 *                              + sum(IBCommission where CREDITED and commissionType != FIRST_JOIN)
 *   totalEarned                = directIncomeTotalEarned + referralIncomeTotalEarned
 *
 *   directWithdrawn   = sum(IBWithdrawalRequest where type=DIRECT and status=COMPLETED)
 *   directPending     = sum(IBWithdrawalRequest where type=DIRECT and status=PENDING)
 *   referralWithdrawn = sum(IBWithdrawalRequest where type=REFERRAL and status=COMPLETED)
 *   referralPending   = sum(IBWithdrawalRequest where type=REFERRAL and status=PENDING)
 *
 *   directIncomeBalance    = directIncomeTotalEarned - directWithdrawn - directPending
 *   referralIncomeBalance  = referralIncomeTotalEarned - referralWithdrawn - referralPending
 *   balance                = directIncomeBalance + referralIncomeBalance
 *   totalWithdrawn         = directWithdrawn + referralWithdrawn
 *   pendingWithdrawal      = directPending + referralPending
 *
 * SAFE: Runs in DRY RUN mode by default. Pass --apply to write changes.
 */

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/profitvision'
const DRY_RUN = !process.argv.includes('--apply')

async function aggSum(Model, match, field = 'commissionAmount') {
  const r = await Model.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: `$${field}` } } }
  ])
  return r[0]?.total || 0
}

async function reconcileWallet(wallet) {
  const userId = wallet.ibUserId

  const [
    signupFromReferral,
    firstJoinFromIB,
    referralFromReferral,
    tradeFromIB,
    directCompleted,
    directPending,
    referralCompleted,
    referralPending
  ] = await Promise.all([
    aggSum(ReferralCommission, { recipientUserId: userId, commissionType: 'DIRECT_JOINING', status: 'CREDITED' }),
    aggSum(IBCommission, { ibUserId: userId, commissionType: 'FIRST_JOIN', status: 'CREDITED' }),
    aggSum(ReferralCommission, { recipientUserId: userId, commissionType: 'REFERRAL_INCOME', status: 'CREDITED' }),
    aggSum(IBCommission, { ibUserId: userId, commissionType: { $ne: 'FIRST_JOIN' }, status: 'CREDITED' }),
    aggSum(IBWithdrawalRequest, { ibUserId: userId, withdrawalType: 'DIRECT', status: 'COMPLETED' }, 'amount'),
    aggSum(IBWithdrawalRequest, { ibUserId: userId, withdrawalType: 'DIRECT', status: 'PENDING' }, 'amount'),
    aggSum(IBWithdrawalRequest, { ibUserId: userId, withdrawalType: 'REFERRAL', status: 'COMPLETED' }, 'amount'),
    aggSum(IBWithdrawalRequest, { ibUserId: userId, withdrawalType: 'REFERRAL', status: 'PENDING' }, 'amount')
  ])

  const directIncomeTotalEarned = signupFromReferral + firstJoinFromIB
  const referralIncomeTotalEarned = referralFromReferral + tradeFromIB

  const directIncomeBalance = Math.max(0, directIncomeTotalEarned - directCompleted - directPending)
  const referralIncomeBalance = Math.max(0, referralIncomeTotalEarned - referralCompleted - referralPending)

  const next = {
    directIncomeTotalEarned,
    directIncomeWithdrawn: directCompleted,
    directIncomePendingWithdrawal: directPending,
    directIncomeBalance,
    referralIncomeTotalEarned,
    referralIncomeWithdrawn: referralCompleted,
    referralIncomePendingWithdrawal: referralPending,
    referralIncomeBalance,
    balance: directIncomeBalance + referralIncomeBalance,
    totalEarned: directIncomeTotalEarned + referralIncomeTotalEarned,
    totalWithdrawn: directCompleted + referralCompleted,
    pendingWithdrawal: directPending + referralPending
  }

  const before = {
    directIncomeBalance: wallet.directIncomeBalance,
    referralIncomeBalance: wallet.referralIncomeBalance,
    balance: wallet.balance,
    totalEarned: wallet.totalEarned
  }

  const changed =
    before.directIncomeBalance !== next.directIncomeBalance ||
    before.referralIncomeBalance !== next.referralIncomeBalance ||
    Math.abs(before.balance - next.balance) > 0.001 ||
    Math.abs(before.totalEarned - next.totalEarned) > 0.001

  if (!DRY_RUN && changed) {
    Object.assign(wallet, next, { lastUpdated: new Date() })
    await wallet.save()
  }

  return { userId: userId.toString(), before, next, changed }
}

async function main() {
  console.log(`\n=== IB Wallet Balance Reconciliation ===`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY (writing changes)'}\n`)

  await mongoose.connect(MONGODB_URI)
  console.log('Connected to MongoDB')

  const wallets = await IBWallet.find({})
  console.log(`Found ${wallets.length} IB wallets to check\n`)

  let changedCount = 0
  for (const wallet of wallets) {
    const result = await reconcileWallet(wallet)
    if (result.changed) {
      changedCount++
      console.log(`User ${result.userId}:`)
      console.log(`  Before: direct=$${result.before.directIncomeBalance.toFixed(2)} referral=$${result.before.referralIncomeBalance.toFixed(2)} balance=$${result.before.balance.toFixed(2)} earned=$${result.before.totalEarned.toFixed(2)}`)
      console.log(`  After:  direct=$${result.next.directIncomeBalance.toFixed(2)} referral=$${result.next.referralIncomeBalance.toFixed(2)} balance=$${result.next.balance.toFixed(2)} earned=$${result.next.totalEarned.toFixed(2)}`)
    }
  }

  console.log(`\nSummary: ${changedCount}/${wallets.length} wallets ${DRY_RUN ? 'would be' : 'were'} updated.`)
  if (DRY_RUN) console.log(`\nRe-run with --apply to persist changes.`)

  await mongoose.disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
