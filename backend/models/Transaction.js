import mongoose from 'mongoose'

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  walletId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet'
  },
  type: {
    type: String,
    enum: ['Deposit', 'Withdrawal', 'Transfer_To_Account', 'Transfer_From_Account', 'Account_Transfer_Out', 'Account_Transfer_In', 'Demo_Credit', 'Demo_Reset', 'IB_Entry_Fee'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  paymentMethod: {
    type: String,
    enum: ['Bank Transfer', 'UPI', 'QR Code', 'Internal', 'System', 'Crypto', 'Crypto (OxaPay)'],
    default: 'Internal'
  },
  // For internal transfers
  tradingAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TradingAccount'
  },
  tradingAccountName: {
    type: String,
    default: ''
  },
  // For account-to-account transfers
  toTradingAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TradingAccount'
  },
  toTradingAccountName: {
    type: String,
    default: ''
  },
  fromTradingAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TradingAccount'
  },
  fromTradingAccountName: {
    type: String,
    default: ''
  },
  transactionRef: {
    type: String,
    default: ''
  },
  screenshot: {
    type: String,
    default: ''
  },
  // For withdrawals - bank account details
  bankAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserBankAccount'
  },
  bankDetails: {
    bankName: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    accountHolderName: { type: String, default: '' },
    ifscCode: { type: String, default: '' },
    upiId: { type: String, default: '' }
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Completed', 'Auto-Verified', 'Confirming'],
    default: 'Pending'
  },
  adminRemarks: {
    type: String,
    default: ''
  },
  processedAt: {
    type: Date
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  
  // ========== CRYPTO DEPOSIT FIELDS (OxaPay) ==========
  // OxaPay tracking
  oxapayTrackId: {
    type: String,
    default: null,
    index: true
  },
  oxapayOrderId: {
    type: String,
    default: null
  },
  
  // Crypto payment details
  cryptoCurrency: {
    type: String,
    default: null
  },
  cryptoNetwork: {
    type: String,
    default: null
  },
  cryptoTxHash: {
    type: String,
    default: null
  },
  cryptoSenderAddress: {
    type: String,
    default: null
  },
  cryptoConfirmations: {
    type: Number,
    default: 0
  },
  
  // Verification tracking
  autoVerified: {
    type: Boolean,
    default: false
  },
  autoVerifiedAt: {
    type: Date,
    default: null
  },
  walletCredited: {
    type: Boolean,
    default: false
  },
  walletCreditedAt: {
    type: Date,
    default: null
  },
  
  // Webhook log reference
  webhookLogId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OxaPayWebhookLog',
    default: null
  }
}, { timestamps: true })

export default mongoose.model('Transaction', transactionSchema)
