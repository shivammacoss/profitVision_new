import express from 'express'
import PaymentGatewaySettings from '../models/PaymentGatewaySettings.js'
import { authenticateSuperAdmin } from '../middleware/auth.js'

const router = express.Router()

/**
 * GET /api/payment-gateway/settings
 * Get payment gateway settings (public - for checking if enabled)
 */
router.get('/settings', async (req, res) => {
  try {
    const settings = await PaymentGatewaySettings.getSettings()
    
    res.json({
      success: true,
      oxapayEnabled: settings.oxapayEnabled
    })
  } catch (error) {
    console.error('[PaymentGateway] Get settings error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

/**
 * GET /api/payment-gateway/admin/settings
 * Get payment gateway settings (Super Admin only)
 */
router.get('/admin/settings', authenticateSuperAdmin, async (req, res) => {
  try {
    const settings = await PaymentGatewaySettings.getSettings()
    res.json({ 
      success: true, 
      oxapayEnabled: settings.oxapayEnabled 
    })
  } catch (error) {
    console.error('[PaymentGateway] Get admin settings error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

/**
 * PUT /api/payment-gateway/admin/oxapay/toggle
 * Toggle OxaPay on/off (Super Admin only)
 */
router.put('/admin/oxapay/toggle', authenticateSuperAdmin, async (req, res) => {
  try {
    const { enabled } = req.body
    
    const settings = await PaymentGatewaySettings.getSettings()
    settings.oxapayEnabled = enabled
    // Only set updatedBy if adminId is a valid ObjectId (not a string like "super-admin")
    if (req.adminId && req.adminId.match && req.adminId.match(/^[0-9a-fA-F]{24}$/)) {
      settings.updatedBy = req.adminId
    }
    await settings.save()
    
    console.log(`[PaymentGateway] OxaPay ${enabled ? 'enabled' : 'disabled'} by admin ${req.adminId}`)
    
    res.json({
      success: true,
      message: `OxaPay ${enabled ? 'enabled' : 'disabled'} successfully`,
      oxapayEnabled: settings.oxapayEnabled
    })
  } catch (error) {
    console.error('[PaymentGateway] Toggle OxaPay error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

export default router
