import nodemailer from 'nodemailer'

// Create reusable transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  })
}

// Send welcome email on registration
export const sendWelcomeEmail = async (user) => {
  try {
    const transporter = createTransporter()
    
    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'ProfitVisionFX'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to: user.email,
      subject: 'Welcome to ProfitVisionFX!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0a0a0a;">
          <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; padding: 40px; border: 1px solid #2d2d4a;">
              
              <!-- Logo -->
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #00d4aa; font-size: 28px; margin: 0;">ProfitVisionFX</h1>
              </div>
              
              <!-- Welcome Message -->
              <h2 style="color: #ffffff; font-size: 24px; margin-bottom: 20px; text-align: center;">
                Welcome, ${user.firstName}! 🎉
              </h2>
              
              <p style="color: #b0b0b0; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                Thank you for joining ProfitVisionFX! Your account has been successfully created.
              </p>
              
              <p style="color: #b0b0b0; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
                You can now access all our trading features and start your journey towards financial success.
              </p>
              
              <!-- Account Details -->
              <div style="background-color: #0f0f1a; border-radius: 12px; padding: 20px; margin-bottom: 30px; border: 1px solid #2d2d4a;">
                <h3 style="color: #00d4aa; font-size: 16px; margin: 0 0 15px 0;">Your Account Details:</h3>
                <p style="color: #ffffff; margin: 5px 0;"><strong>Name:</strong> ${user.firstName}</p>
                <p style="color: #ffffff; margin: 5px 0;"><strong>Email:</strong> ${user.email}</p>
              </div>
              
              <!-- CTA Button -->
              <div style="text-align: center; margin-bottom: 30px;">
                <a href="${process.env.TRADE_URL || 'https://trade.profitvisionfx.com'}/dashboard" 
                   style="display: inline-block; background: linear-gradient(135deg, #00d4aa 0%, #00b894 100%); color: #000000; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  Go to Dashboard
                </a>
              </div>
              
              <!-- Footer -->
              <div style="border-top: 1px solid #2d2d4a; padding-top: 20px; text-align: center;">
                <p style="color: #666666; font-size: 12px; margin: 0;">
                  If you didn't create this account, please ignore this email.
                </p>
                <p style="color: #666666; font-size: 12px; margin: 10px 0 0 0;">
                  © ${new Date().getFullYear()} ProfitVisionFX. All rights reserved.
                </p>
              </div>
              
            </div>
          </div>
        </body>
        </html>
      `
    }

    const info = await transporter.sendMail(mailOptions)
    console.log('[Email] Welcome email sent to:', user.email, 'MessageId:', info.messageId)
    return { success: true, messageId: info.messageId }
  } catch (error) {
    console.error('[Email] Error sending welcome email:', error)
    return { success: false, error: error.message }
  }
}

// Send custom email from super admin
export const sendCustomEmail = async (to, subject, htmlContent, textContent) => {
  try {
    const transporter = createTransporter()
    
    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME || 'ProfitVisionFX'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
      to,
      subject,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0a0a0a;">
          <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; padding: 40px; border: 1px solid #2d2d4a;">
              
              <!-- Logo -->
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #00d4aa; font-size: 28px; margin: 0;">ProfitVisionFX</h1>
              </div>
              
              <!-- Content -->
              <div style="color: #b0b0b0; font-size: 16px; line-height: 1.6;">
                ${htmlContent}
              </div>
              
              <!-- Footer -->
              <div style="border-top: 1px solid #2d2d4a; padding-top: 20px; margin-top: 30px; text-align: center;">
                <p style="color: #666666; font-size: 12px; margin: 0;">
                  © ${new Date().getFullYear()} ProfitVisionFX. All rights reserved.
                </p>
              </div>
              
            </div>
          </div>
        </body>
        </html>
      `,
      text: textContent || subject
    }

    const info = await transporter.sendMail(mailOptions)
    console.log('[Email] Custom email sent to:', to, 'MessageId:', info.messageId)
    return { success: true, messageId: info.messageId }
  } catch (error) {
    console.error('[Email] Error sending custom email:', error)
    return { success: false, error: error.message }
  }
}

// Send bulk email to multiple users
export const sendBulkEmail = async (users, subject, htmlContent, textContent) => {
  const results = []
  
  for (const user of users) {
    const result = await sendCustomEmail(user.email, subject, htmlContent, textContent)
    results.push({ email: user.email, ...result })
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  return results
}

export default {
  sendWelcomeEmail,
  sendCustomEmail,
  sendBulkEmail
}
