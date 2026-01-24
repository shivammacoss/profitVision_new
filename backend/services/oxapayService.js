import crypto from 'crypto'

const OXAPAY_API_URL = 'https://api.oxapay.com/v1'

class OxaPayService {
  // Read env vars lazily when methods are called, not in constructor
  get merchantApiKey() {
    return process.env.OXAPAY_MERCHANT_API_KEY
  }
  
  get payoutApiKey() {
    return process.env.OXAPAY_PAYOUT_API_KEY
  }
  
  get callbackUrl() {
    return process.env.OXAPAY_CALLBACK_URL || 'http://localhost:5001/api/oxapay/webhook'
  }
  
  get returnUrl() {
    return process.env.OXAPAY_RETURN_URL || 'http://localhost:5173/wallet'
  }
  
  get sandbox() {
    return process.env.NODE_ENV !== 'production'
  }

  /**
   * Generate a payment invoice for deposits
   * @param {Object} options - Invoice options
   * @param {number} options.amount - Amount in USD
   * @param {string} options.orderId - Unique order ID
   * @param {string} options.email - Customer email
   * @param {string} options.description - Payment description
   * @param {number} options.lifetime - Invoice lifetime in minutes (default: 60)
   * @returns {Promise<Object>} - Invoice data with payment URL
   */
  async createInvoice(options) {
    const {
      amount,
      orderId,
      email,
      description = 'Deposit to ProfitVisionFX',
      lifetime = 60
    } = options

    if (!this.merchantApiKey) {
      throw new Error('OxaPay merchant API key not configured')
    }

    const payload = {
      amount: parseFloat(amount),
      currency: 'USD',
      lifetime: lifetime,
      fee_paid_by_payer: 1, // Payer covers the fee
      under_paid_coverage: 2.5, // Allow 2.5% underpayment
      to_currency: 'USDT', // Convert to USDT
      auto_withdrawal: false, // Keep in OxaPay balance
      mixed_payment: true, // Allow paying remainder with different coin
      callback_url: this.callbackUrl,
      return_url: this.returnUrl,
      email: email,
      order_id: orderId,
      thanks_message: 'Thank you for your deposit to ProfitVisionFX!',
      description: description,
      sandbox: this.sandbox
    }

    try {
      const response = await fetch(`${OXAPAY_API_URL}/payment/invoice`, {
        method: 'POST',
        headers: {
          'merchant_api_key': this.merchantApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      if (data.status !== 200) {
        console.error('[OxaPay] Invoice creation failed:', data)
        throw new Error(data.message || 'Failed to create payment invoice')
      }

      console.log(`[OxaPay] Invoice created: ${data.data.track_id} for order ${orderId}`)

      return {
        success: true,
        trackId: data.data.track_id,
        paymentUrl: data.data.payment_url,
        expiredAt: data.data.expired_at,
        createdAt: data.data.date
      }
    } catch (error) {
      console.error('[OxaPay] Error creating invoice:', error)
      throw error
    }
  }

  /**
   * Get payment information by track ID
   * @param {string} trackId - OxaPay track ID
   * @returns {Promise<Object>} - Payment information
   */
  async getPaymentInfo(trackId) {
    if (!this.merchantApiKey) {
      throw new Error('OxaPay merchant API key not configured')
    }

    try {
      const response = await fetch(`${OXAPAY_API_URL}/payment/inquiry`, {
        method: 'POST',
        headers: {
          'merchant_api_key': this.merchantApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ track_id: trackId })
      })

      const data = await response.json()

      if (data.status !== 200) {
        throw new Error(data.message || 'Failed to get payment info')
      }

      return {
        success: true,
        data: data.data
      }
    } catch (error) {
      console.error('[OxaPay] Error getting payment info:', error)
      throw error
    }
  }

  /**
   * Create a payout (withdrawal) to user's crypto address
   * @param {Object} options - Payout options
   * @param {string} options.address - Recipient crypto address
   * @param {number} options.amount - Amount to send
   * @param {string} options.currency - Cryptocurrency symbol (e.g., USDT, BTC)
   * @param {string} options.network - Network (e.g., TRC20, ERC20, BEP20)
   * @param {string} options.orderId - Unique order ID
   * @param {string} options.description - Payout description
   * @returns {Promise<Object>} - Payout result
   */
  async createPayout(options) {
    const {
      address,
      amount,
      currency = 'USDT',
      network = 'TRC20',
      orderId,
      description = 'Withdrawal from ProfitVisionFX'
    } = options

    if (!this.payoutApiKey) {
      throw new Error('OxaPay payout API key not configured')
    }

    const payload = {
      address: address,
      amount: parseFloat(amount),
      currency: currency,
      network: network,
      callback_url: this.callbackUrl,
      order_id: orderId,
      description: description
    }

    try {
      const response = await fetch(`${OXAPAY_API_URL}/payout`, {
        method: 'POST',
        headers: {
          'payout_api_key': this.payoutApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      if (data.status !== 200) {
        console.error('[OxaPay] Payout creation failed:', data)
        throw new Error(data.message || 'Failed to create payout')
      }

      console.log(`[OxaPay] Payout created: ${data.data.track_id} for order ${orderId}`)

      return {
        success: true,
        trackId: data.data.track_id,
        status: data.data.status
      }
    } catch (error) {
      console.error('[OxaPay] Error creating payout:', error)
      throw error
    }
  }

  /**
   * Validate webhook callback signature
   * @param {string} rawBody - Raw request body as string
   * @param {string} hmacHeader - HMAC header from request
   * @param {string} type - 'payment' or 'payout'
   * @returns {boolean} - Whether signature is valid
   */
  validateWebhookSignature(rawBody, hmacHeader, type = 'payment') {
    const secretKey = type === 'payout' ? this.payoutApiKey : this.merchantApiKey

    if (!secretKey) {
      console.error('[OxaPay] API key not configured for webhook validation')
      return false
    }

    const calculatedHmac = crypto
      .createHmac('sha512', secretKey)
      .update(rawBody)
      .digest('hex')

    return calculatedHmac === hmacHeader
  }

  /**
   * Get supported currencies
   * @returns {Promise<Object>} - List of supported currencies
   */
  async getSupportedCurrencies() {
    try {
      const response = await fetch(`${OXAPAY_API_URL}/currencies`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (data.status !== 200) {
        throw new Error(data.message || 'Failed to get currencies')
      }

      return {
        success: true,
        currencies: data.data
      }
    } catch (error) {
      console.error('[OxaPay] Error getting currencies:', error)
      throw error
    }
  }

  /**
   * Get merchant balance
   * @returns {Promise<Object>} - Merchant balance info
   */
  async getMerchantBalance() {
    if (!this.merchantApiKey) {
      throw new Error('OxaPay merchant API key not configured')
    }

    try {
      const response = await fetch(`${OXAPAY_API_URL}/balance`, {
        method: 'POST',
        headers: {
          'merchant_api_key': this.merchantApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      })

      const data = await response.json()

      if (data.status !== 200) {
        throw new Error(data.message || 'Failed to get balance')
      }

      return {
        success: true,
        balance: data.data
      }
    } catch (error) {
      console.error('[OxaPay] Error getting balance:', error)
      throw error
    }
  }
}

// Export singleton instance
const oxapayService = new OxaPayService()
export default oxapayService
