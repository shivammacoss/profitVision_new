import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { X, Mail, Check, Lock, Eye, EyeOff } from 'lucide-react'
import logo from '../assets/logo.png'

import { API_URL } from '../config/api'

const ForgotPassword = () => {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [step, setStep] = useState('email') // 'email', 'otp', 'password'
  const [resendTimer, setResendTimer] = useState(0)
  const [showPassword, setShowPassword] = useState(false)

  // Resend timer countdown
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [resendTimer])

  // Step 1: Send OTP to email
  const handleSendOTP = async (e) => {
    e.preventDefault()
    if (!email) {
      setError('Please enter your email address')
      return
    }

    setLoading(true)
    setError('')
    setSuccessMsg('')

    try {
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      const data = await res.json()

      if (data.success) {
        setSuccessMsg('OTP sent to your email!')
        setStep('otp')
        setResendTimer(60)
      } else {
        setError(data.message || 'Failed to send OTP')
      }
    } catch (err) {
      setError('Error sending OTP. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Step 2: Verify OTP
  const handleVerifyOTP = async (e) => {
    e.preventDefault()
    if (!otp || otp.length !== 6) {
      setError('Please enter a valid 6-digit OTP')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch(`${API_URL}/auth/verify-reset-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp })
      })
      const data = await res.json()

      if (data.success) {
        setSuccessMsg('OTP verified! Set your new password.')
        setStep('password')
      } else {
        setError(data.message || 'Invalid OTP')
      }
    } catch (err) {
      setError('Error verifying OTP. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Step 3: Set new password
  const handleResetPassword = async (e) => {
    e.preventDefault()
    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, newPassword })
      })
      const data = await res.json()

      if (data.success) {
        setSuccess(true)
      } else {
        setError(data.message || 'Failed to reset password')
      }
    } catch (err) {
      setError('Error resetting password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Resend OTP
  const handleResendOTP = async () => {
    if (resendTimer > 0) return
    
    setLoading(true)
    setError('')
    
    try {
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      const data = await res.json()

      if (data.success) {
        setSuccessMsg('OTP resent to your email!')
        setResendTimer(60)
      } else {
        setError(data.message || 'Failed to resend OTP')
      }
    } catch (err) {
      setError('Error resending OTP.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-r from-cyan-500/20 to-transparent rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-l from-orange-500/20 via-purple-500/20 to-transparent rounded-full blur-3xl" />
      
      <div className="relative bg-dark-700 rounded-2xl p-8 w-full max-w-md border border-gray-800">
        <Link to="/user/login" className="absolute top-4 right-4 w-8 h-8 bg-dark-600 rounded-full flex items-center justify-center hover:bg-dark-500 transition-colors">
          <X size={16} className="text-gray-400" />
        </Link>

        <div className="flex justify-center mb-6">
          <img src={logo} alt="ProfitVisionFX" className="h-32 object-contain" />
        </div>

        {success ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check size={32} className="text-green-500" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Password Reset Successful!</h2>
            <p className="text-gray-400 mb-6">
              Your password has been reset successfully. You can now login with your new password.
            </p>
            <Link 
              to="/user/login"
              className="inline-block bg-white text-black font-medium px-6 py-3 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Go to Login
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-white mb-2">
              {step === 'email' && 'Forgot Password'}
              {step === 'otp' && 'Verify OTP'}
              {step === 'password' && 'Set New Password'}
            </h1>
            <p className="text-gray-400 text-sm mb-6">
              {step === 'email' && 'Enter your email address and we\'ll send you an OTP to reset your password.'}
              {step === 'otp' && `Enter the 6-digit OTP sent to ${email}`}
              {step === 'password' && 'Create a new password for your account.'}
            </p>

            {step === 'email' && (
              <form onSubmit={handleSendOTP} className="space-y-4">
                <div className="relative">
                  <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="email"
                    placeholder="Enter your registered email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError('') }}
                    className="w-full bg-dark-600 border border-gray-700 rounded-lg pl-11 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-gray-600 transition-colors"
                  />
                </div>

                {error && <p className="text-red-500 text-sm">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-white text-black font-medium py-3 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Sending OTP...' : 'Send OTP'}
                </button>
              </form>
            )}

            {step === 'otp' && (
              <form onSubmit={handleVerifyOTP} className="space-y-4">
                <input
                  type="text"
                  placeholder="Enter 6-digit OTP"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  className="w-full bg-dark-600 border border-gray-700 rounded-lg px-4 py-3 text-white text-center text-2xl tracking-widest placeholder-gray-500 focus:outline-none focus:border-gray-600 transition-colors"
                />

                {error && <p className="text-red-500 text-sm">{error}</p>}
                {successMsg && <p className="text-green-500 text-sm">{successMsg}</p>}

                <button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className="w-full bg-white text-black font-medium py-3 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Verifying...' : 'Verify OTP'}
                </button>

                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => { setStep('email'); setOtp(''); setError(''); }}
                    className="text-gray-400 hover:text-white"
                  >
                    ← Back
                  </button>
                  <button
                    type="button"
                    onClick={handleResendOTP}
                    disabled={resendTimer > 0 || loading}
                    className={resendTimer > 0 ? 'text-gray-500' : 'text-white hover:underline'}
                  >
                    {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend OTP'}
                  </button>
                </div>
              </form>
            )}

            {step === 'password' && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="relative">
                  <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="New password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-dark-600 border border-gray-700 rounded-lg pl-11 pr-12 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-gray-600 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                <div className="relative">
                  <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-dark-600 border border-gray-700 rounded-lg pl-11 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-gray-600 transition-colors"
                  />
                </div>

                {error && <p className="text-red-500 text-sm">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-white text-black font-medium py-3 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Resetting...' : 'Reset Password'}
                </button>
              </form>
            )}

            <p className="text-center text-gray-500 text-sm mt-6">
              Remember your password?{' '}
              <Link to="/user/login" className="text-white hover:underline">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default ForgotPassword
