import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/coinlytix'

async function cleanDatabase() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB')

    const db = mongoose.connection.db

    // Collections to completely delete (all documents)
    const collectionsToClean = [
      'users',
      'tradingaccounts',
      'trades',
      'transactions',
      'wallets',
      'ibwallets',
      'ibcommissions',
      'ibcommissionnews',
      'ibreferrals',
      'ibusers',
      'referralcommissions',
      'copytraders',
      'copytrades',
      'mastertraders',
      'challenges',
      'challengeaccounts',
      'notifications',
      'supporttickets',
      'kycdocuments',
      'adminlogs'
    ]

    // Collections to reset to defaults (delete all, will be recreated)
    const collectionsToReset = [
      'accounttypes',
      'charges',
      'ibplans',
      'ibplannews',
      'iblevels',
      'referralincomeplans',
      'directjoiningplans',
      'tradesettings',
      'ibsettings',
      'copytradesettings'
    ]

    console.log('\n=== Cleaning User Data Collections ===')
    for (const collName of collectionsToClean) {
      try {
        const collection = db.collection(collName)
        const result = await collection.deleteMany({})
        console.log(`✓ ${collName}: Deleted ${result.deletedCount} documents`)
      } catch (err) {
        console.log(`- ${collName}: Collection not found or error`)
      }
    }

    console.log('\n=== Resetting Configuration Collections ===')
    for (const collName of collectionsToReset) {
      try {
        const collection = db.collection(collName)
        const result = await collection.deleteMany({})
        console.log(`✓ ${collName}: Deleted ${result.deletedCount} documents`)
      } catch (err) {
        console.log(`- ${collName}: Collection not found or error`)
      }
    }

    // Keep admin users but reset their data
    console.log('\n=== Cleaning Admin Collection (keeping structure) ===')
    try {
      const adminsCollection = db.collection('admins')
      // Keep admins but you may want to reset password or keep as is
      const adminCount = await adminsCollection.countDocuments()
      console.log(`✓ admins: Kept ${adminCount} admin accounts`)
    } catch (err) {
      console.log('- admins: Collection not found')
    }

    console.log('\n=== Database Cleanup Complete ===')
    console.log('All user data, trades, transactions, and configurations have been reset.')
    console.log('You can now register new accounts and set up the system fresh.')

    await mongoose.disconnect()
    console.log('\nDisconnected from MongoDB')
    process.exit(0)

  } catch (error) {
    console.error('Error cleaning database:', error)
    process.exit(1)
  }
}

cleanDatabase()
