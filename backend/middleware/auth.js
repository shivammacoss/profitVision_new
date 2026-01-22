import jwt from 'jsonwebtoken'
import User from '../models/User.js'

const JWT_SECRET = process.env.JWT_SECRET || 'pv1x$3cur3K3y!2026@Pr0f1tV1s10nFX#Tr4d1ng$3rv3r'

// Middleware to verify user JWT token
export const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET)
    
    const user = await User.findById(decoded.id).select('-password')
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' })
    }

    if (user.isBanned || user.isBlocked) {
      return res.status(403).json({ success: false, message: 'Account is banned or blocked', forceLogout: true })
    }

    req.user = user
    req.userId = user._id
    next()
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired', forceLogout: true })
    }
    return res.status(401).json({ success: false, message: 'Invalid token' })
  }
}

// Middleware to verify admin JWT token
export const authenticateAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No admin token provided' })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET)
    
    // Check if it's a super admin token or regular admin token
    if (decoded.role === 'SUPER_ADMIN' || decoded.role === 'ADMIN' || decoded.isSuperAdmin) {
      req.admin = decoded
      req.adminId = decoded.adminId || decoded.id
      req.isSuperAdmin = decoded.role === 'SUPER_ADMIN' || decoded.isSuperAdmin
      return next()
    }

    return res.status(403).json({ success: false, message: 'Admin access required' })
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Admin token expired', forceLogout: true })
    }
    return res.status(401).json({ success: false, message: 'Invalid admin token' })
  }
}

// Middleware to verify super admin only
export const authenticateSuperAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, JWT_SECRET)
    
    if (decoded.role !== 'SUPER_ADMIN' && !decoded.isSuperAdmin) {
      return res.status(403).json({ success: false, message: 'Super admin access required' })
    }

    req.admin = decoded
    req.adminId = decoded.adminId || decoded.id
    req.isSuperAdmin = true
    next()
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token' })
  }
}

// Input validation helper
export const validateInput = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false })
    if (error) {
      const errors = error.details.map(detail => detail.message)
      return res.status(400).json({ success: false, message: 'Validation failed', errors })
    }
    next()
  }
}

// Rate limiting helper (simple in-memory)
const rateLimitStore = new Map()

export const rateLimit = (maxRequests = 100, windowMs = 60000) => {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress
    const key = `${ip}:${req.path}`
    const now = Date.now()
    
    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, { count: 1, resetTime: now + windowMs })
      return next()
    }
    
    const record = rateLimitStore.get(key)
    
    if (now > record.resetTime) {
      rateLimitStore.set(key, { count: 1, resetTime: now + windowMs })
      return next()
    }
    
    if (record.count >= maxRequests) {
      return res.status(429).json({ success: false, message: 'Too many requests, please try again later' })
    }
    
    record.count++
    next()
  }
}

// Clean up rate limit store periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of rateLimitStore.entries()) {
    if (now > value.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}, 60000)

export default { authenticateUser, authenticateAdmin, authenticateSuperAdmin, validateInput, rateLimit }
