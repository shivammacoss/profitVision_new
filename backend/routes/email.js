import express from 'express'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import { sendAdminEmail } from '../services/emailService.js'

const router = express.Router()

// Middleware to verify super admin
const verifySuperAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) {
      return res.status(401).json({ message: 'No token provided' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    
    // Check if it's super admin (from adminToken)
    if (!decoded.isSuperAdmin) {
      return res.status(403).json({ message: 'Super admin access required' })
    }

    req.adminId = decoded.id
    next()
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' })
  }
}

// POST /api/email/send - Send email to specific user(s)
router.post('/send', verifySuperAdmin, async (req, res) => {
  try {
    const { to, subject, content, userIds } = req.body

    if (!subject || !content) {
      return res.status(400).json({ message: 'Subject and content are required' })
    }

    let recipients = []

    // If userIds provided, get emails from users
    if (userIds && userIds.length > 0) {
      const users = await User.find({ _id: { $in: userIds } }).select('email firstName')
      recipients = users.map(u => u.email)
    } else if (to) {
      // Direct email addresses
      recipients = Array.isArray(to) ? to : [to]
    } else {
      return res.status(400).json({ message: 'Recipients are required (to or userIds)' })
    }

    if (recipients.length === 0) {
      return res.status(400).json({ message: 'No valid recipients found' })
    }

    // Send email
    const result = await sendAdminEmail(recipients, subject, content)

    if (result.success) {
      res.json({ 
        success: true, 
        message: `Email sent successfully to ${recipients.length} recipient(s)`,
        recipients: recipients.length
      })
    } else {
      res.status(500).json({ message: result.message })
    }
  } catch (error) {
    console.error('Send email error:', error)
    res.status(500).json({ message: 'Error sending email', error: error.message })
  }
})

// POST /api/email/send-to-all - Send email to all users
router.post('/send-to-all', verifySuperAdmin, async (req, res) => {
  try {
    const { subject, content, filters } = req.body

    if (!subject || !content) {
      return res.status(400).json({ message: 'Subject and content are required' })
    }

    // Build query based on filters
    let query = {}
    if (filters) {
      if (filters.isVerified !== undefined) query.emailVerified = filters.isVerified
      if (filters.isIB !== undefined) query.isIB = filters.isIB
      if (filters.hasDeposit !== undefined) query['wallet.balance'] = filters.hasDeposit ? { $gt: 0 } : { $eq: 0 }
    }

    // Get all user emails
    const users = await User.find(query).select('email firstName')
    
    if (users.length === 0) {
      return res.status(400).json({ message: 'No users found matching the criteria' })
    }

    const emails = users.map(u => u.email)

    // Send email in batches of 50 to avoid SMTP limits
    const batchSize = 50
    let successCount = 0
    let failCount = 0

    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize)
      const result = await sendAdminEmail(batch, subject, content)
      if (result.success) {
        successCount += batch.length
      } else {
        failCount += batch.length
      }
    }

    res.json({ 
      success: true, 
      message: `Email sent to ${successCount} users. Failed: ${failCount}`,
      total: users.length,
      success: successCount,
      failed: failCount
    })
  } catch (error) {
    console.error('Send to all error:', error)
    res.status(500).json({ message: 'Error sending emails', error: error.message })
  }
})

// GET /api/email/users - Get users list for email selection
router.get('/users', verifySuperAdmin, async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query
    
    let query = {}
    if (search) {
      query = {
        $or: [
          { firstName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      }
    }

    const users = await User.find(query)
      .select('firstName email phone createdAt emailVerified')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))

    const total = await User.countDocuments(query)

    res.json({
      success: true,
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Get users error:', error)
    res.status(500).json({ message: 'Error fetching users', error: error.message })
  }
})

export default router
