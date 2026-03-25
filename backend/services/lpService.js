import crypto from 'crypto'

class LPService {
  constructor() {
    this.runtimeConfig = null
    this.initialized = false
  }

  // Update LP config at runtime
  updateConfig(config) {
    this.runtimeConfig = {
      apiUrl: config.apiUrl || process.env.LP_API_URL || 'https://api.corecen.com',
      apiKey: config.apiKey || process.env.LP_API_KEY || '',
      apiSecret: config.apiSecret || process.env.LP_API_SECRET || ''
    }
    console.log('[LP Service] Runtime config updated')
  }

  // Get runtime config or env config
  getCorecenConfig() {
    return this.runtimeConfig || {
      apiUrl: process.env.LP_API_URL || 'https://api.corecen.com',
      apiKey: process.env.LP_API_KEY || '',
      apiSecret: process.env.LP_API_SECRET || ''
    }
  }

  // Check if LP is configured
  isConfigured() {
    const config = this.getCorecenConfig()
    return !!(config.apiKey && config.apiSecret && config.apiUrl)
  }

  // Get contract size based on symbol type (for P/L calculation sync with LP)
  getContractSize(symbol) {
    // Metals
    if (symbol === 'XAUUSD') return 100
    if (symbol === 'XAGUSD') return 5000
    // Crypto - 1 unit
    if (['BTCUSD', 'ETHUSD', 'LTCUSD', 'XRPUSD', 'BCHUSD', 'BNBUSD', 'SOLUSD', 'ADAUSD', 'DOGEUSD', 'DOTUSD', 'MATICUSD', 'LINKUSD', 'AVAXUSD'].includes(symbol)) return 1
    // Indices
    if (['US30', 'US500', 'US100', 'GER40', 'UK100'].includes(symbol)) return 1
    // Oil
    if (['USOIL', 'UKOIL'].includes(symbol)) return 1000
    // Forex - standard 100,000
    return 100000
  }

  // Generate HMAC signature for Corecen API
  generateCorecenSignature(timestamp, method, path, body = '') {
    const config = this.getCorecenConfig()
    const signatureData = timestamp + method + path + body
    return crypto
      .createHmac('sha256', config.apiSecret)
      .update(signatureData)
      .digest('hex')
  }

  // Push A-Book trade to Corecen when trade opens
  async pushTradeToCorecen(trade, user) {
    const config = this.getCorecenConfig()
    
    if (!config.apiKey || !config.apiSecret) {
      console.log('[LP Service] Corecen API credentials not configured, skipping trade push')
      return { success: false, message: 'LP credentials not configured' }
    }

    const timestamp = Date.now().toString()
    const method = 'POST'
    const path = '/api/v1/broker-api/trades/push'
    
    const tradeData = {
      external_trade_id: trade.tradeId || trade._id.toString(),
      user_id: user._id.toString(),
      user_email: user.email,
      user_name: user.firstName || user.name || 'Unknown',
      symbol: trade.symbol,
      side: trade.side.toUpperCase(),
      volume: trade.quantity || trade.volume,
      open_price: trade.openPrice,
      sl: trade.stopLoss || 0,
      tp: trade.takeProfit || 0,
      margin: trade.marginUsed || trade.margin || 0,
      leverage: trade.leverage || 100,
      contract_size: trade.contractSize || this.getContractSize(trade.symbol), // Send contract size for P/L calculation
      trading_account_id: trade.tradingAccountId?.toString() || '',
      opened_at: trade.openedAt?.toISOString() || new Date().toISOString()
    }

    const body = JSON.stringify(tradeData)
    const signature = this.generateCorecenSignature(timestamp, method, path, body)

    try {
      console.log(`[LP Service] Pushing trade ${trade.tradeId} to Corecen...`)
      
      const response = await fetch(`${config.apiUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': config.apiKey,
          'X-Timestamp': timestamp,
          'X-Signature': signature
        },
        body
      })

      const data = await response.json()
      
      if (response.ok) {
        console.log(`[LP Service] Trade ${trade.tradeId} pushed to Corecen successfully`)
        return { success: true, data }
      } else {
        console.error(`[LP Service] Failed to push trade to Corecen:`, data)
        return { success: false, error: data.error?.message || data.message || 'Push failed' }
      }
    } catch (error) {
      console.error('[LP Service] Error pushing trade to Corecen:', error)
      return { success: false, error: error.message }
    }
  }

  // Close A-Book trade on Corecen when trade closes
  async closeTradeOnCorecen(trade) {
    const config = this.getCorecenConfig()
    
    console.log(`[LP Service] ========== CLOSE TRADE REQUEST ==========`)
    console.log(`[LP Service] Trade ID: ${trade.tradeId}`)
    console.log(`[LP Service] LP API URL: ${config.apiUrl}`)
    console.log(`[LP Service] LP API Key configured: ${!!config.apiKey}`)
    console.log(`[LP Service] LP API Secret configured: ${!!config.apiSecret}`)
    
    if (!config.apiKey || !config.apiSecret) {
      console.error('[LP Service] ✗ Corecen API credentials not configured, skipping trade close')
      console.log(`[LP Service] ==========================================`)
      return { success: false, message: 'LP credentials not configured' }
    }

    const timestamp = Date.now().toString()
    const method = 'POST'
    const path = '/api/v1/broker-api/trades/close'
    
    const closeData = {
      external_trade_id: trade.tradeId || trade._id.toString(),
      close_price: trade.closePrice,
      pnl: trade.realizedPnl || trade.pnl || 0,
      closed_by: trade.closedBy || 'USER',
      closed_at: trade.closedAt?.toISOString() || new Date().toISOString(),
      contract_size: trade.contractSize || this.getContractSize(trade.symbol), // CRITICAL: Send actual contract size for P/L verification
    }

    console.log(`[LP Service] Close payload:`, JSON.stringify(closeData, null, 2))

    const body = JSON.stringify(closeData)
    const signature = this.generateCorecenSignature(timestamp, method, path, body)

    try {
      console.log(`[LP Service] Sending close request to ${config.apiUrl}${path}`)
      
      const response = await fetch(`${config.apiUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': config.apiKey,
          'X-Timestamp': timestamp,
          'X-Signature': signature
        },
        body
      })

      const data = await response.json()
      
      if (response.ok) {
        console.log(`[LP Service] ✓ Trade ${trade.tradeId} closed on Corecen`)
        console.log(`[LP Service] Response:`, JSON.stringify(data, null, 2))
        console.log(`[LP Service] ==========================================`)
        return { success: true, data }
      } else if (response.status === 404) {
        // Trade not found in Corecen - likely was never pushed or already closed
        console.warn(`[LP Service] ⚠ Trade ${trade.tradeId} not found in Corecen (404) - was it ever pushed?`)
        console.warn(`[LP Service] Response:`, JSON.stringify(data, null, 2))
        console.log(`[LP Service] ==========================================`)
        // Return success anyway since trade is being closed locally
        return { success: true, warning: 'Trade not found in Corecen but closing locally', data }
      } else {
        console.error(`[LP Service] ✗ Failed to close trade on Corecen`)
        console.error(`[LP Service] HTTP Status: ${response.status}`)
        console.error(`[LP Service] Response:`, JSON.stringify(data, null, 2))
        console.log(`[LP Service] ==========================================`)
        return { success: false, error: data.error?.message || data.message || 'Close failed' }
      }
    } catch (error) {
      console.error('[LP Service] ✗ Error closing trade on Corecen:', error.message)
      console.log(`[LP Service] ==========================================`)
      return { success: false, error: error.message }
    }
  }

  // Update trade SL/TP on Corecen
  async updateTradeOnCorecen(trade) {
    const config = this.getCorecenConfig()
    
    if (!config.apiKey || !config.apiSecret) {
      return { success: false, message: 'LP credentials not configured' }
    }

    const timestamp = Date.now().toString()
    const method = 'PUT'
    const path = '/api/v1/broker-api/trades/update'
    
    const updateData = {
      external_trade_id: trade.tradeId || trade._id.toString(),
      sl: trade.stopLoss || 0,
      tp: trade.takeProfit || 0,
      contract_size: trade.contractSize || this.getContractSize(trade.symbol), // CRITICAL: Send actual contract size for P/L consistency
    }

    const body = JSON.stringify(updateData)
    const signature = this.generateCorecenSignature(timestamp, method, path, body)

    try {
      const response = await fetch(`${config.apiUrl}${path}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': config.apiKey,
          'X-Timestamp': timestamp,
          'X-Signature': signature
        },
        body
      })

      const data = await response.json()
      
      if (response.ok) {
        console.log(`[LP Service] Trade ${trade.tradeId} updated on Corecen`)
        return { success: true, data }
      } else {
        return { success: false, error: data.error?.message || 'Update failed' }
      }
    } catch (error) {
      console.error('[LP Service] Error updating trade on Corecen:', error)
      return { success: false, error: error.message }
    }
  }

  // Remove A-Book user and close all their trades in LP
  // Called when admin deletes a user or transfers from A-Book to B-Book
  async removeABookUser(user) {
    const config = this.getCorecenConfig()
    
    if (!config.apiKey || !config.apiSecret) {
      console.log('[LP Service] Corecen API credentials not configured, skipping user removal')
      return { success: false, message: 'LP credentials not configured' }
    }

    const timestamp = Date.now().toString()
    const method = 'POST'
    const path = '/api/v1/broker-api/users/remove'
    
    const payload = {
      external_user_id: user._id.toString(),
      user_email: user.email || '',
      source_platform: 'PROFITVISION',
      timestamp: new Date().toISOString(),
    }

    const body = JSON.stringify(payload)
    const signature = this.generateCorecenSignature(timestamp, method, path, body)

    try {
      const response = await fetch(`${config.apiUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': config.apiKey,
          'X-Timestamp': timestamp,
          'X-Signature': signature
        },
        body
      })

      const data = await response.json()
      
      if (response.ok) {
        console.log(`[LP Service] User ${user.email} removed from Corecen`)
        return { success: true, data }
      } else {
        console.error(`[LP Service] Failed to remove user from Corecen:`, data)
        return { success: false, error: data.error?.message || 'User removal failed' }
      }
    } catch (error) {
      console.error('[LP Service] Error removing user from Corecen:', error)
      return { success: false, error: error.message }
    }
  }

  // Close all open A-Book trades for a user in LP
  // Called before deleting user or trades locally
  async closeAllUserTrades(userId) {
    try {
      // Find all open A-Book trades for this user
      const Trade = (await import('../models/Trade.js')).default
      const openTrades = await Trade.find({ 
        userId, 
        status: 'OPEN', 
        bookType: 'A' 
      })

      console.log(`[LP Service] Found ${openTrades.length} open A-Book trades for user ${userId}`)

      const results = []
      for (const trade of openTrades) {
        // Close trade at current market price (we'll use 0 for now, LP will handle)
        trade.status = 'CLOSED'
        trade.closedBy = 'ADMIN'
        trade.closedAt = new Date()
        trade.realizedPnl = 0 // LP will calculate actual P/L
        
        const result = await this.closeTradeOnCorecen(trade)
        results.push({ tradeId: trade.tradeId, result })
        
        // Update local trade status
        await trade.save()
      }

      const successCount = results.filter(r => r.result.success).length
      console.log(`[LP Service] Closed ${successCount}/${openTrades.length} trades in LP`)

      return { 
        success: true, 
        total: openTrades.length, 
        closed: successCount,
        results 
      }
    } catch (error) {
      console.error(`[LP Service] Error closing user trades: ${error.message}`)
      return { success: false, error: error.message }
    }
  }

  // Test connection to Corecen
  async testConnection() {
    const config = this.getCorecenConfig()
    
    if (!config.apiKey || !config.apiSecret) {
      return { success: false, message: 'LP credentials not configured' }
    }

    const timestamp = Date.now().toString()
    const method = 'GET'
    const path = '/api/v1/broker-api/health'
    
    const signature = this.generateCorecenSignature(timestamp, method, path, '')

    try {
      const response = await fetch(`${config.apiUrl}${path}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': config.apiKey,
          'X-Timestamp': timestamp,
          'X-Signature': signature
        }
      })

      if (response.ok) {
        return { success: true, message: 'Connection successful' }
      } else {
        const data = await response.json()
        return { success: false, message: data.error?.message || 'Connection failed' }
      }
    } catch (error) {
      return { success: false, message: error.message }
    }
  }
}

// Singleton instance
const lpService = new LPService()

export default lpService
