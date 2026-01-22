import express from 'express'
import User from '../models/User.js'
import { sendCustomEmail, sendBulkEmail } from '../services/emailService.js'

const router = express.Router()

// POST /api/email/send - Send email to a single user (Super Admin only)
router.post('/send', async (req, res) => {
  try {
    const { userId, email, subject, htmlContent, textContent } = req.body

    if (!subject || !htmlContent) {
      return res.status(400).json({ success: false, message: 'Subject and content are required' })
    }

    let targetEmail = email

    // If userId provided, get email from user
    if (userId) {
      const user = await User.findById(userId)
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' })
      }
      targetEmail = user.email
    }

    if (!targetEmail) {
      return res.status(400).json({ success: false, message: 'Email address is required' })
    }

    const result = await sendCustomEmail(targetEmail, subject, htmlContent, textContent)

    if (result.success) {
      res.json({ success: true, message: 'Email sent successfully', messageId: result.messageId })
    } else {
      res.status(500).json({ success: false, message: 'Failed to send email', error: result.error })
    }
  } catch (error) {
    console.error('Error sending email:', error)
    res.status(500).json({ success: false, message: 'Error sending email', error: error.message })
  }
})

// POST /api/email/send-bulk - Send email to multiple users (Super Admin only)
router.post('/send-bulk', async (req, res) => {
  try {
    const { userIds, subject, htmlContent, textContent, sendToAll } = req.body

    if (!subject || !htmlContent) {
      return res.status(400).json({ success: false, message: 'Subject and content are required' })
    }

    let users = []

    if (sendToAll) {
      // Send to all users
      users = await User.find({ status: 'ACTIVE' }).select('email firstName')
    } else if (userIds && userIds.length > 0) {
      // Send to specific users
      users = await User.find({ _id: { $in: userIds } }).select('email firstName')
    } else {
      return res.status(400).json({ success: false, message: 'Please specify users or select send to all' })
    }

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'No users found' })
    }

    const results = await sendBulkEmail(users, subject, htmlContent, textContent)

    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    res.json({
      success: true,
      message: `Emails sent: ${successCount} successful, ${failCount} failed`,
      totalSent: successCount,
      totalFailed: failCount,
      results
    })
  } catch (error) {
    console.error('Error sending bulk email:', error)
    res.status(500).json({ success: false, message: 'Error sending bulk email', error: error.message })
  }
})

// GET /api/email/users - Get list of users for email selection
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({ status: 'ACTIVE' })
      .select('firstName lastName email createdAt')
      .sort({ createdAt: -1 })

    res.json({ success: true, users })
  } catch (error) {
    console.error('Error fetching users:', error)
    res.status(500).json({ success: false, message: 'Error fetching users', error: error.message })
  }
})

export default router
