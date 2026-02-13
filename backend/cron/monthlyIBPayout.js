import cron from 'node-cron'
import monthlyIBEngine from '../services/monthlyIBEngine.js'
import IBModeSettings from '../models/IBModeSettings.js'

// Monthly IB Payout Cron Job
// Runs on the 1st of every month at 00:05 AM server time
// Processes the previous month's trading volume and distributes commissions

export function startMonthlyIBPayoutCron() {
  // Run at 00:05 on the 1st of every month
  cron.schedule('5 0 1 * *', async () => {
    console.log('[Monthly IB Cron] Starting monthly payout job...')
    
    try {
      const settings = await IBModeSettings.getSettings()
      
      // Only run if in monthly controlled mode and auto payout is enabled
      if (!settings.isMonthlyMode()) {
        console.log('[Monthly IB Cron] Skipping - not in MONTHLY_CONTROLLED mode')
        return
      }
      
      if (!settings.monthlyTradingIB.autoPayoutEnabled) {
        console.log('[Monthly IB Cron] Skipping - auto payout is disabled')
        return
      }
      
      // Process previous month's payout
      const result = await monthlyIBEngine.processMonthlyPayout()
      
      console.log('[Monthly IB Cron] Payout completed:', JSON.stringify(result, null, 2))
      
    } catch (error) {
      console.error('[Monthly IB Cron] Error processing monthly payout:', error)
    }
  }, {
    scheduled: true,
    timezone: 'UTC'
  })
  
  console.log('[Monthly IB Cron] Scheduled monthly payout job for 1st of each month at 00:05 UTC')
}

// Manual trigger function for testing or admin use
export async function triggerMonthlyPayout(monthPeriod = null) {
  console.log(`[Monthly IB] Manual trigger for month: ${monthPeriod || 'previous month'}`)
  return await monthlyIBEngine.processMonthlyPayout(monthPeriod)
}

export default { startMonthlyIBPayoutCron, triggerMonthlyPayout }
