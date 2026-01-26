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
    enum: ['Pending', 'Approved', 'Rejected', 'Completed'],
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
    ref: 'User'
  }
}, { timestamps: true })

export default mongoose.model('Transaction', transactionSchema)
