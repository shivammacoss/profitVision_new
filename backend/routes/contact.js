import express from 'express'
import { sendAdminEmail } from '../services/emailService.js'

const router = express.Router()

// POST /api/contact/send - Send contact form message to support email
router.post('/send', async (req, res) => {
  try {
    const { name, email, message } = req.body

    // Validate required fields
    if (!name || !email || !message) {
      return res.status(400).json({ 
        success: false,
        message: 'Name, email, and message are required' 
      })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid email format' 
      })
    }

    // Create email content
    const subject = `New Contact Form Submission from ${name}`
    const htmlContent = `
      <h2>New Contact Form Submission</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Message:</strong></p>
      <p>${message.replace(/\n/g, '<br>')}</p>
      <hr>
      <p><small>This message was sent from the Profit Vision FX contact form.</small></p>
    `

    // Send email to support
    const result = await sendAdminEmail(
      ['support@profitvisionfx.com'],
      subject,
      htmlContent
    )

    if (result.success) {
      return res.json({ 
        success: true, 
        message: 'Your message has been sent successfully. We will get back to you soon!'
      })
    } else {
      return res.status(500).json({ 
        success: false,
        message: 'Failed to send message. Please try again later.'
      })
    }
  } catch (error) {
    console.error('Contact form error:', error)
    res.status(500).json({ 
      success: false,
      message: 'Error processing your request',
      error: error.message 
    })
  }
})

export default router
