import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../config';

const WalletScreen = ({ navigation }) => {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState({ balance: 0 });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [localAmount, setLocalAmount] = useState('');
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [transactionRef, setTransactionRef] = useState('');
  const [currencies, setCurrencies] = useState([]);
  const [selectedCurrency, setSelectedCurrency] = useState({ currency: 'USD', symbol: '$', rateToUSD: 1, markup: 0 });

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchWalletData();
      fetchPaymentMethods();
      fetchCurrencies();
    }
  }, [user]);

  const fetchCurrencies = async () => {
    try {
      const res = await fetch(`${API_URL}/payment-methods/currencies/active`);
      const data = await res.json();
      setCurrencies(data.currencies || []);
    } catch (e) {
      console.error('Error fetching currencies:', e);
    }
  };

  const calculateUSDAmount = (localAmt, currency) => {
    if (!currency || currency.currency === 'USD') return localAmt;
    const effectiveRate = currency.rateToUSD * (1 + (currency.markup || 0) / 100);
    return localAmt / effectiveRate;
  };

  const loadUser = async () => {
    try {
      const userData = await SecureStore.getItemAsync('user');
      if (userData) {
        setUser(JSON.parse(userData));
      }
    } catch (e) {
      console.error('Error loading user:', e);
    }
  };

  const fetchWalletData = async () => {
    try {
      const [walletRes, transRes] = await Promise.all([
        fetch(`${API_URL}/wallet/${user._id}`),
        fetch(`${API_URL}/wallet/transactions/${user._id}`)
      ]);
      
      const walletData = await walletRes.json();
      const transData = await transRes.json();
      
      setWallet(walletData.wallet || { balance: 0 });
      setTransactions(transData.transactions || []);
    } catch (e) {
      console.error('Error fetching wallet:', e);
    }
    setLoading(false);
    setRefreshing(false);
  };

  const fetchPaymentMethods = async () => {
    try {
      const res = await fetch(`${API_URL}/payment-methods`);
      const data = await res.json();
      setPaymentMethods(data.paymentMethods || []);
    } catch (e) {
      console.error('Error fetching payment methods:', e);
    }
  };

  const handleDeposit = async () => {
    if (!localAmount || parseFloat(localAmount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    if (!selectedMethod) {
      Alert.alert('Error', 'Please select a payment method');
      return;
    }

    // Calculate USD amount from local currency
    const usdAmount = selectedCurrency && selectedCurrency.currency !== 'USD'
      ? calculateUSDAmount(parseFloat(localAmount), selectedCurrency)
      : parseFloat(localAmount);

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/wallet/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user._id,
          amount: usdAmount,
          localAmount: parseFloat(localAmount),
          currency: selectedCurrency?.currency || 'USD',
          currencySymbol: selectedCurrency?.symbol || '$',
          exchangeRate: selectedCurrency?.rateToUSD || 1,
          markup: selectedCurrency?.markup || 0,
          paymentMethod: selectedMethod.type || selectedMethod.name,
          transactionRef,
        })
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Success', 'Deposit request submitted! Awaiting approval.');
        setShowDepositModal(false);
        setAmount('');
        setLocalAmount('');
        setTransactionRef('');
        setSelectedMethod(null);
        setSelectedCurrency({ currency: 'USD', symbol: '$', rateToUSD: 1, markup: 0 });
        fetchWalletData();
      } else {
        Alert.alert('Error', data.message || 'Failed to submit deposit');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to submit deposit request');
    }
    setIsSubmitting(false);
  };

  const handleWithdraw = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    if (parseFloat(amount) > wallet.balance) {
      Alert.alert('Error', 'Insufficient balance');
      return;
    }
    if (!selectedMethod) {
      Alert.alert('Error', 'Please select a payment method');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/wallet/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user._id,
          amount: parseFloat(amount),
          paymentMethod: selectedMethod.type || selectedMethod.name,
        })
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Success', 'Withdrawal request submitted! Awaiting approval.');
        setShowWithdrawModal(false);
        setAmount('');
        setSelectedMethod(null);
        fetchWalletData();
      } else {
        Alert.alert('Error', data.message || 'Failed to submit withdrawal');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to submit withdrawal request');
    }
    setIsSubmitting(false);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Approved': 
      case 'APPROVED': 
      case 'Completed': 
        return '#d4af37';
      case 'Pending': 
      case 'PENDING': 
        return '#d4af37';
      case 'Rejected': 
      case 'REJECTED': 
        return '#d4af37';
      default: return '#666';
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#d4af37" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Wallet</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollContentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchWalletData(); }} tintColor="#d4af37" />
        }
      >
        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceAmount}>${wallet.balance?.toLocaleString() || '0.00'}</Text>
          
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.depositBtn} onPress={() => setShowDepositModal(true)}>
              <Ionicons name="arrow-down-circle" size={20} color="#000" />
              <Text style={styles.depositBtnText}>Deposit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.withdrawBtn} onPress={() => setShowWithdrawModal(true)}>
              <Ionicons name="arrow-up-circle" size={20} color="#d4af37" />
              <Text style={styles.withdrawBtnText}>Withdraw</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Transactions */}
        <View style={styles.transactionsSection}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          
          {transactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={48} color="#000000" />
              <Text style={styles.emptyText}>No transactions yet</Text>
            </View>
          ) : (
            transactions.map((tx) => {
              const isDeposit = tx.type === 'DEPOSIT' || tx.type === 'Deposit';
              return (
                <View key={tx._id} style={styles.transactionItem}>
                  <View style={styles.txLeft}>
                    <View style={[styles.txIcon, { backgroundColor: isDeposit ? '#d4af3720' : '#d4af3720' }]}>
                      <Ionicons 
                        name={isDeposit ? 'arrow-down' : 'arrow-up'} 
                        size={20} 
                        color={isDeposit ? '#d4af37' : '#d4af37'} 
                      />
                    </View>
                    <View>
                      <Text style={styles.txType}>{tx.type}</Text>
                      <Text style={styles.txDate}>{formatDate(tx.createdAt)}</Text>
                    </View>
                  </View>
                  <View style={styles.txRight}>
                    <Text style={[styles.txAmount, { color: isDeposit ? '#d4af37' : '#d4af37' }]}>
                      {isDeposit ? '+' : '-'}${tx.amount?.toLocaleString()}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(tx.status) + '20' }]}>
                      <Text style={[styles.statusText, { color: getStatusColor(tx.status) }]}>{tx.status}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Deposit Modal */}
      <Modal visible={showDepositModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Deposit Funds</Text>
              <TouchableOpacity onPress={() => {
                setShowDepositModal(false);
                setLocalAmount('');
                setTransactionRef('');
                setSelectedMethod(null);
                setSelectedCurrency({ currency: 'USD', symbol: '$', rateToUSD: 1, markup: 0 });
              }}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Currency Selection */}
            <Text style={styles.inputLabel}>Select Currency</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.methodsScroll}>
              <TouchableOpacity
                style={[styles.currencyCard, selectedCurrency?.currency === 'USD' && styles.currencyCardActive]}
                onPress={() => setSelectedCurrency({ currency: 'USD', symbol: '$', rateToUSD: 1, markup: 0 })}
              >
                <Text style={styles.currencySymbol}>$</Text>
                <Text style={styles.currencyName}>USD</Text>
              </TouchableOpacity>
              {currencies.map((curr) => (
                <TouchableOpacity
                  key={curr._id}
                  style={[styles.currencyCard, selectedCurrency?.currency === curr.currency && styles.currencyCardActive]}
                  onPress={() => setSelectedCurrency(curr)}
                >
                  <Text style={styles.currencySymbol}>{curr.symbol}</Text>
                  <Text style={styles.currencyName}>{curr.currency}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.inputLabel}>
              Amount ({selectedCurrency?.symbol || '$'} {selectedCurrency?.currency || 'USD'})
            </Text>
            <TextInput
              style={styles.input}
              value={localAmount}
              onChangeText={setLocalAmount}
              placeholder={`Enter amount in ${selectedCurrency?.currency || 'USD'}`}
              placeholderTextColor="#666"
              keyboardType="numeric"
            />

            {/* USD Conversion Display */}
            {selectedCurrency && selectedCurrency.currency !== 'USD' && localAmount && parseFloat(localAmount) > 0 && (
              <View style={styles.conversionBox}>
                <Text style={styles.conversionLabel}>You will receive</Text>
                <Text style={styles.conversionAmount}>
                  ${calculateUSDAmount(parseFloat(localAmount), selectedCurrency).toFixed(2)} USD
                </Text>
                <Text style={styles.conversionRate}>
                  Rate: 1 USD = {selectedCurrency.symbol}{(selectedCurrency.rateToUSD * (1 + (selectedCurrency.markup || 0) / 100)).toFixed(2)} {selectedCurrency.currency}
                </Text>
              </View>
            )}

            <Text style={styles.inputLabel}>Payment Method</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.methodsScroll}>
              {paymentMethods.map((method) => (
                <TouchableOpacity
                  key={method._id}
                  style={[styles.methodCard, selectedMethod?._id === method._id && styles.methodCardActive]}
                  onPress={() => setSelectedMethod(method)}
                >
                  <Text style={[styles.methodName, selectedMethod?._id === method._id && { color: '#000' }]}>
                    {method.type || method.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Payment Method Details */}
            {selectedMethod && (
              <View style={styles.methodDetails}>
                {selectedMethod.type === 'Bank Transfer' && (
                  <>
                    <Text style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Bank: </Text>
                      <Text style={styles.detailValue}>{selectedMethod.bankName}</Text>
                    </Text>
                    <Text style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Account: </Text>
                      <Text style={styles.detailValue}>{selectedMethod.accountNumber}</Text>
                    </Text>
                    <Text style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Name: </Text>
                      <Text style={styles.detailValue}>{selectedMethod.accountHolderName}</Text>
                    </Text>
                    <Text style={styles.detailRow}>
                      <Text style={styles.detailLabel}>IFSC: </Text>
                      <Text style={styles.detailValue}>{selectedMethod.ifscCode}</Text>
                    </Text>
                  </>
                )}
                {selectedMethod.type === 'UPI' && (
                  <Text style={styles.detailRow}>
                    <Text style={styles.detailLabel}>UPI ID: </Text>
                    <Text style={styles.detailValue}>{selectedMethod.upiId}</Text>
                  </Text>
                )}
                {selectedMethod.type === 'QR Code' && selectedMethod.qrCodeImage && (
                  <View style={styles.qrContainer}>
                    <Text style={styles.detailLabel}>Scan QR Code to Pay:</Text>
                    <Image 
                      source={{ uri: selectedMethod.qrCodeImage }} 
                      style={styles.qrImage}
                      resizeMode="contain"
                    />
                  </View>
                )}
              </View>
            )}

            <Text style={styles.inputLabel}>Transaction Reference (Optional)</Text>
            <TextInput
              style={styles.input}
              value={transactionRef}
              onChangeText={setTransactionRef}
              placeholder="Enter transaction ID or reference"
              placeholderTextColor="#666"
            />

            <TouchableOpacity 
              style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]} 
              onPress={handleDeposit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.submitBtnText}>Submit Deposit Request</Text>
              )}
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>

      {/* Withdraw Modal */}
      <Modal visible={showWithdrawModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Withdraw Funds</Text>
              <TouchableOpacity onPress={() => {
                setShowWithdrawModal(false);
                setAmount('');
                setSelectedMethod(null);
              }}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.availableBalance}>
              <Text style={styles.availableLabel}>Available Balance</Text>
              <Text style={styles.availableAmount}>${wallet.balance?.toLocaleString()}</Text>
            </View>

            <Text style={styles.inputLabel}>Amount (USD)</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              placeholder="Enter amount"
              placeholderTextColor="#666"
              keyboardType="numeric"
            />

            <Text style={styles.inputLabel}>Payment Method</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.methodsScroll}>
              {paymentMethods.map((method) => (
                <TouchableOpacity
                  key={method._id}
                  style={[styles.methodCard, selectedMethod?._id === method._id && styles.methodCardActive]}
                  onPress={() => setSelectedMethod(method)}
                >
                  <Text style={[styles.methodName, selectedMethod?._id === method._id && { color: '#000' }]}>
                    {method.type || method.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity 
              style={[styles.submitBtn, styles.withdrawSubmitBtn, isSubmitting && styles.submitBtnDisabled]} 
              onPress={handleWithdraw}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.submitBtnText, { color: '#fff' }]}>Submit Withdrawal Request</Text>
              )}
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  loadingContainer: { flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' },
  
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  
  scrollContent: { flex: 1 },
  scrollContentContainer: { paddingBottom: 40 },
  
  balanceCard: { margin: 16, padding: 20, backgroundColor: '#000000', borderRadius: 16 },
  balanceLabel: { color: '#666', fontSize: 14 },
  balanceAmount: { color: '#fff', fontSize: 36, fontWeight: 'bold', marginTop: 8 },
  
  actionButtons: { flexDirection: 'row', gap: 12, marginTop: 24 },
  depositBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#d4af37', paddingVertical: 14, borderRadius: 12 },
  depositBtnText: { color: '#000', fontSize: 16, fontWeight: '600' },
  withdrawBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#000000', borderWidth: 1, borderColor: '#d4af37', paddingVertical: 14, borderRadius: 12 },
  withdrawBtnText: { color: '#d4af37', fontSize: 16, fontWeight: '600' },
  
  transactionsSection: { padding: 16 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 16 },
  
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: '#666', fontSize: 14, marginTop: 12 },
  
  transactionItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#000000', borderRadius: 12, marginBottom: 8 },
  txLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  txIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  txType: { color: '#fff', fontSize: 14, fontWeight: '600' },
  txDate: { color: '#666', fontSize: 12, marginTop: 2 },
  txRight: { alignItems: 'flex-end' },
  txAmount: { fontSize: 16, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginTop: 4 },
  statusText: { fontSize: 10, fontWeight: '600' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#000000', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  
  inputLabel: { color: '#666', fontSize: 12, marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: '#000000', borderRadius: 12, padding: 16, color: '#fff', fontSize: 16, borderWidth: 1, borderColor: '#000000' },
  
  methodsScroll: { marginTop: 8 },
  methodCard: { backgroundColor: '#000000', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginRight: 8, borderWidth: 1, borderColor: '#000000' },
  methodCardActive: { backgroundColor: '#d4af37', borderColor: '#d4af37' },
  methodName: { color: '#fff', fontSize: 14, fontWeight: '500' },
  
  availableBalance: { backgroundColor: '#000000', padding: 16, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#000000' },
  availableLabel: { color: '#666', fontSize: 12 },
  availableAmount: { color: '#d4af37', fontSize: 24, fontWeight: 'bold', marginTop: 4 },
  
  submitBtn: { backgroundColor: '#d4af37', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  withdrawSubmitBtn: { backgroundColor: '#d4af37' },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
  
  // Currency selection styles
  currencyCard: { backgroundColor: '#000000', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, marginRight: 8, alignItems: 'center', minWidth: 60, borderWidth: 1, borderColor: '#000000' },
  currencyCardActive: { backgroundColor: '#d4af37' },
  currencySymbol: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  currencyName: { color: '#666', fontSize: 10, marginTop: 2 },
  
  // Conversion box styles
  conversionBox: { backgroundColor: '#d4af3720', borderWidth: 1, borderColor: '#d4af3750', borderRadius: 12, padding: 16, marginTop: 12, alignItems: 'center' },
  conversionLabel: { color: '#666', fontSize: 12 },
  conversionAmount: { color: '#d4af37', fontSize: 24, fontWeight: 'bold', marginTop: 4 },
  conversionRate: { color: '#666', fontSize: 11, marginTop: 8 },
  
  // Method details styles
  methodDetails: { backgroundColor: '#000000', borderRadius: 12, padding: 16, marginTop: 12, borderWidth: 1, borderColor: '#000000' },
  detailRow: { marginBottom: 8 },
  detailLabel: { color: '#666', fontSize: 13 },
  detailValue: { color: '#fff', fontSize: 13 },
  
  // QR Code styles
  qrContainer: { alignItems: 'center', marginTop: 8 },
  qrImage: { width: 200, height: 200, marginTop: 12, borderRadius: 8 },
});

export default WalletScreen;
