import nodemailer from 'nodemailer'

// Create transporter with SMTP settings
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.hostinger.com',
    port: parseInt(process.env.EMAIL_PORT) || 465,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false
    }
  })
}

// Generate 6-digit OTP
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// Send OTP email for registration verification
export const sendOTPEmail = async (email, otp, name) => {
  try {
    const transporter = createTransporter()
    
    const mailOptions = {
      from: `"ProfitVisionFX" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Verify Your Email - ProfitVisionFX',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0a0a0a;">
          <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; padding: 40px; border: 1px solid #333;">
              <!-- Logo -->
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #ef4444; font-size: 28px; margin: 0;">ProfitVisionFX</h1>
              </div>
              
              <!-- Content -->
              <div style="text-align: center;">
                <h2 style="color: #ffffff; font-size: 24px; margin-bottom: 10px;">Verify Your Email</h2>
                <p style="color: #9ca3af; font-size: 16px; margin-bottom: 30px;">
                  Hi ${name || 'there'},<br>
                  Use the OTP below to verify your email address.
                </p>
                
                <!-- OTP Box -->
                <div style="background: #0f0f23; border-radius: 12px; padding: 25px; margin: 30px 0;">
                  <p style="color: #9ca3af; font-size: 14px; margin: 0 0 10px 0;">Your verification code:</p>
                  <div style="font-size: 36px; font-weight: bold; color: #ef4444; letter-spacing: 8px;">${otp}</div>
                </div>
                
                <p style="color: #6b7280; font-size: 14px;">
                  This code will expire in <strong style="color: #ef4444;">10 minutes</strong>.
                </p>
                <p style="color: #6b7280; font-size: 14px;">
                  If you didn't request this, please ignore this email.
                </p>
              </div>
              
              <!-- Footer -->
              <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #333;">
                <p style="color: #6b7280; font-size: 12px; margin: 0;">
                  © 2026 ProfitVisionFX. All rights reserved.
                </p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `
    }
    
    await transporter.sendMail(mailOptions)
    return { success: true, message: 'OTP sent successfully' }
  } catch (error) {
    console.error('Error sending OTP email:', error)
    return { success: false, message: 'Failed to send OTP email', error: error.message }
  }
}

// Send welcome email after successful registration
export const sendWelcomeEmail = async (email, name) => {
  try {
    const transporter = createTransporter()
    
    const mailOptions = {
      from: `"ProfitVisionFX" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Welcome to ProfitVisionFX! 🎉',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0a0a0a;">
          <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; padding: 40px; border: 1px solid #333;">
              <!-- Logo -->
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #ef4444; font-size: 28px; margin: 0;">ProfitVisionFX</h1>
              </div>
              
              <!-- Content -->
              <div style="text-align: center;">
                <h2 style="color: #ffffff; font-size: 24px; margin-bottom: 10px;">Welcome Aboard! 🚀</h2>
                <p style="color: #9ca3af; font-size: 16px; margin-bottom: 20px;">
                  Hi ${name},<br><br>
                  Congratulations! Your account has been successfully created.
                </p>
              </div>
              
              <!-- Features -->
              <div style="background: #0f0f23; border-radius: 12px; padding: 25px; margin: 30px 0;">
                <h3 style="color: #ffffff; font-size: 18px; margin: 0 0 15px 0;">What you can do now:</h3>
                <ul style="color: #9ca3af; font-size: 14px; padding-left: 20px; margin: 0;">
                  <li style="margin-bottom: 10px;">📊 Trade Forex, Crypto & Commodities</li>
                  <li style="margin-bottom: 10px;">📈 Copy successful traders automatically</li>
                  <li style="margin-bottom: 10px;">💰 Earn through our IB referral program</li>
                  <li style="margin-bottom: 10px;">🔒 Secure & fast transactions</li>
                </ul>
              </div>
              
              <!-- CTA Button -->
              <div style="text-align: center; margin: 30px 0;">
                <a href="https://trade.profitvisionfx.com/dashboard" 
                   style="display: inline-block; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 8px; font-weight: bold; font-size: 16px;">
                  Start Trading Now
                </a>
              </div>
              
              <p style="color: #6b7280; font-size: 14px; text-align: center;">
                Need help? Contact our 24/7 support team.
              </p>
              
              <!-- Footer -->
              <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #333;">
                <p style="color: #6b7280; font-size: 12px; margin: 0;">
                  © 2026 ProfitVisionFX. All rights reserved.
                </p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `
    }
    
    await transporter.sendMail(mailOptions)
    return { success: true, message: 'Welcome email sent successfully' }
  } catch (error) {
    console.error('Error sending welcome email:', error)
    return { success: false, message: 'Failed to send welcome email', error: error.message }
  }
}

// Send custom email from super admin to user(s)
export const sendAdminEmail = async (to, subject, htmlContent) => {
  try {
    const transporter = createTransporter()
    
    const mailOptions = {
      from: `"ProfitVisionFX Admin" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject: subject,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0a0a0a;">
          <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; padding: 40px; border: 1px solid #333;">
              <!-- Logo -->
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #ef4444; font-size: 28px; margin: 0;">ProfitVisionFX</h1>
              </div>
              
              <!-- Content -->
              <div style="color: #ffffff; font-size: 16px; line-height: 1.6;">
                ${htmlContent}
              </div>
              
              <!-- Footer -->
              <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #333;">
                <p style="color: #6b7280; font-size: 12px; margin: 0;">
                  © 2026 ProfitVisionFX. All rights reserved.
                </p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `
    }
    
    await transporter.sendMail(mailOptions)
    return { success: true, message: 'Email sent successfully' }
  } catch (error) {
    console.error('Error sending admin email:', error)
    return { success: false, message: 'Failed to send email', error: error.message }
  }
}

// Send password reset OTP email
export const sendPasswordResetOTP = async (email, otp, name) => {
  try {
    const transporter = createTransporter()
    
    const mailOptions = {
      from: `"ProfitVisionFX" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Password Reset OTP - ProfitVisionFX',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0a0a0a;">
          <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; padding: 40px; border: 1px solid #333;">
              <!-- Logo -->
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #ef4444; font-size: 28px; margin: 0;">ProfitVisionFX</h1>
              </div>
              
              <!-- Content -->
              <div style="text-align: center;">
                <h2 style="color: #ffffff; font-size: 24px; margin-bottom: 10px;">Reset Your Password</h2>
                <p style="color: #9ca3af; font-size: 16px; margin-bottom: 30px;">
                  Hi ${name || 'there'},<br>
                  Use the OTP below to reset your password.
                </p>
                
                <!-- OTP Box -->
                <div style="background: #0f0f23; border-radius: 12px; padding: 25px; margin: 30px 0;">
                  <p style="color: #9ca3af; font-size: 14px; margin: 0 0 10px 0;">Your password reset code:</p>
                  <div style="font-size: 36px; font-weight: bold; color: #ef4444; letter-spacing: 8px;">${otp}</div>
                </div>
                
                <p style="color: #6b7280; font-size: 14px;">
                  This code will expire in <strong style="color: #ef4444;">10 minutes</strong>.
                </p>
                <p style="color: #6b7280; font-size: 14px;">
                  If you didn't request this, please ignore this email.
                </p>
              </div>
              
              <!-- Footer -->
              <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #333;">
                <p style="color: #6b7280; font-size: 12px; margin: 0;">
                  © 2026 ProfitVisionFX. All rights reserved.
                </p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `
    }
    
    await transporter.sendMail(mailOptions)
    return { success: true, message: 'Password reset OTP sent successfully' }
  } catch (error) {
    console.error('Error sending password reset OTP:', error)
    return { success: false, message: 'Failed to send password reset OTP', error: error.message }
  }
}

export default {
  generateOTP,
  sendOTPEmail,
  sendWelcomeEmail,
  sendAdminEmail,
  sendPasswordResetOTP
}
