import mongoose from 'mongoose'
import CopyFollower from '../models/CopyFollower.js'
import TradingAccount from '../models/TradingAccount.js'
import CreditLedger from '../models/CreditLedger.js'
import dotenv from 'dotenv'

dotenv.config()

/**
 * PRODUCTION MIGRATION: Copy Trading Minimum Credit Fix
 * 
 * PURPOSE: Fix old accounts to use User's deposit as minimumCredit
 * 
 * LOGIC: 
 * - minimumCredit should equal User's initialDeposit (not master's requirement)
 * - Each user gets their own minimum based on their deposit
 * - Auto-refill triggers when credit < user's deposit amount
 * 
 * EXAMPLES:
 * - User deposits $500: minimumCredit = $500
 * - User deposits $1500: minimumCredit = $1500
 * - User deposits $2000: minimumCredit = $2000
 * - User deposits $3000: minimumCredit = $3000
 * 
 * RUN ONCE: Deploy and run to fix all existing accounts
 */

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/profitvision'

async function fixMinimumCredit() {
  try {
    console.log('🔧 Starting Copy Trading Minimum Credit Fix...')
    console.log('=' .repeat(60))

    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    // Find all copy followers with potential issues
    const followers = await CopyFollower.find({
      $or: [
        { minimumCredit: 1000 }, // Default value (old accounts)
        { minimumCredit: { $exists: false } }, // Missing field
        { minimumCredit: null } // Null value
      ]
    }).populate('followerAccountId')

    console.log(`📊 Found ${followers.length} followers to check`)

    let fixedCount = 0
    let skippedCount = 0
    let errorCount = 0

    for (const follower of followers) {
      try {
        console.log(`\n🔍 Processing Follower: ${follower._id}`)
        console.log(`   User: ${follower.followerId}`)
        console.log(`   Master: ${follower.masterId}`)
        console.log(`   Account: ${follower.followerAccountId?.accountId || 'N/A'}`)

        // Get current values
        const currentMinimumCredit = follower.minimumCredit || 1000
        const initialDeposit = follower.initialDeposit || 0
        const currentCredit = follower.followerAccountId?.credit || 0

        console.log(`   Current minimumCredit: $${currentMinimumCredit}`)
        console.log(`   Initial deposit: $${initialDeposit}`)
        console.log(`   Current credit: $${currentCredit}`)

        // VALIDATION: Only fix if initial deposit > 1000 and different from current
        if (initialDeposit > 1000 && initialDeposit !== currentMinimumCredit) {
          console.log(`   ✅ NEEDS FIX: Setting minimumCredit to $${initialDeposit}`)

          // Update the follower record
          await CopyFollower.findByIdAndUpdate(follower._id, {
            $set: {
              minimumCredit: initialDeposit,
              // Recalculate deficit
              creditDeficit: Math.max(0, initialDeposit - currentCredit),
              isRefillMode: currentCredit < initialDeposit
            }
          })

          // Record the fix in CreditLedger
          await CreditLedger.create({
            userId: follower.followerId,
            tradingAccountId: follower.followerAccountId._id,
            type: 'MINIMUM_CREDIT_FIX',
            amount: initialDeposit - currentMinimumCredit,
            balanceBefore: currentMinimumCredit,
            balanceAfter: initialDeposit,
            description: `Fixed minimum credit from $${currentMinimumCredit} to $${initialDeposit} (initial deposit)`,
            metadata: {
              oldMinimumCredit: currentMinimumCredit,
              newMinimumCredit: initialDeposit,
              initialDeposit: initialDeposit,
              currentCredit: currentCredit,
              fixTimestamp: new Date().toISOString()
            }
          })

          console.log(`   🎯 FIXED: minimumCredit updated to $${initialDeposit}`)
          fixedCount++

        } else {
          console.log(`   ⏭️  SKIPPED: No fix needed`)
          skippedCount++
        }

      } catch (error) {
        console.error(`   ❌ ERROR fixing follower ${follower._id}:`, error.message)
        errorCount++
      }
    }

    console.log('\n' + '=' .repeat(60))
    console.log('📈 SUMMARY:')
    console.log(`   Total followers checked: ${followers.length}`)
    console.log(`   ✅ Fixed: ${fixedCount}`)
    console.log(`   ⏭️  Skipped: ${skippedCount}`)
    console.log(`   ❌ Errors: ${errorCount}`)
    console.log('=' .repeat(60))

    if (fixedCount > 0) {
      console.log('\n🎉 SUCCESS: Copy trading minimum credit has been fixed!')
      console.log('   Auto-refill will now work correctly for all followers.')
    } else {
      console.log('\nℹ️  INFO: No fixes were needed. All accounts are already correct.')
    }

  } catch (error) {
    console.error('💥 CRITICAL ERROR:', error)
    throw error
  } finally {
    await mongoose.disconnect()
    console.log('🔌 Disconnected from MongoDB')
  }
}

/**
 * VALIDATION: Check specific user account
 */
async function checkSpecificUser(userId) {
  try {
    console.log(`\n🔍 Checking specific user: ${userId}`)
    
    await mongoose.connect(MONGODB_URI)
    
    const followers = await CopyFollower.find({ 
      followerId: new mongoose.Types.ObjectId(userId) 
    }).populate('followerAccountId')

    for (const follower of followers) {
      console.log(`\n📊 Follower Details:`)
      console.log(`   ID: ${follower._id}`)
      console.log(`   Master: ${follower.masterId}`)
      console.log(`   Account ID: ${follower.followerAccountId?.accountId}`)
      console.log(`   Initial Deposit: $${follower.initialDeposit}`)
      console.log(`   Current Minimum Credit: $${follower.minimumCredit}`)
      console.log(`   Current Account Credit: $${follower.followerAccountId?.credit}`)
      console.log(`   Credit Deficit: $${follower.creditDeficit}`)
      console.log(`   Is Refill Mode: ${follower.isRefillMode}`)
      
      const shouldRefill = (follower.followerAccountId?.credit || 0) < (follower.minimumCredit || 1000)
      console.log(`   Should Auto-Refill: ${shouldRefill ? '✅ YES' : '❌ NO'}`)
    }
    
  } catch (error) {
    console.error('❌ Error checking user:', error.message)
  } finally {
    await mongoose.disconnect()
  }
}

// Run the script
if (process.argv.includes('--check-user')) {
  const userId = process.argv[process.argv.indexOf('--check-user') + 1]
  if (userId) {
    checkSpecificUser(userId)
  } else {
    console.error('❌ Please provide user ID with --check-user <userId>')
  }
} else {
  fixMinimumCredit().catch(console.error)
}
