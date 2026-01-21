import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../config/api';

const AccountsScreen = ({ navigation, route }) => {
  const [user, setUser] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [primaryAccountId, setPrimaryAccountId] = useState(null);
  const [showOpenAccountModal, setShowOpenAccountModal] = useState(false);
  const [accountTypes, setAccountTypes] = useState([]);
  const [openingAccount, setOpeningAccount] = useState(false);
  
  // Transfer states
  const [walletBalance, setWalletBalance] = useState(0);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showAccountTransferModal, setShowAccountTransferModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [targetAccount, setTargetAccount] = useState(null);
  const [transferAmount, setTransferAmount] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  
  // Handle incoming route params for deposit/withdraw action
  const [pendingAction, setPendingAction] = useState(null);

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchAccounts();
      fetchWalletBalance();
    }
  }, [user]);
  
  // Handle route params to auto-open deposit/withdraw modal
  useEffect(() => {
    if (route?.params?.action && route?.params?.accountId && accounts.length > 0) {
      const account = accounts.find(a => a._id === route.params.accountId);
      if (account) {
        setSelectedAccount(account);
        setTransferAmount('');
        if (route.params.action === 'deposit') {
          fetchWalletBalance();
          setShowTransferModal(true);
        } else if (route.params.action === 'withdraw') {
          setShowWithdrawModal(true);
        }
        // Clear the params to prevent re-triggering
        navigation.setParams({ action: null, accountId: null });
      }
    }
  }, [route?.params, accounts]);

  const fetchWalletBalance = async () => {
    try {
      const res = await fetch(`${API_URL}/wallet/${user._id}`);
      const data = await res.json();
      setWalletBalance(data.wallet?.balance || 0);
    } catch (e) {
      console.error('Error fetching wallet:', e);
    }
  };

  const loadUser = async () => {
    try {
      const userData = await SecureStore.getItemAsync('user');
      if (userData) {
        setUser(JSON.parse(userData));
      } else {
        navigation.replace('Login');
      }
    } catch (e) {
      console.error('Error loading user:', e);
    }
  };

  const fetchAccounts = async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API_URL}/trading-accounts/user/${user._id}`);
      const data = await res.json();
      setAccounts(data.accounts || []);
      
      // Find primary account
      const primary = data.accounts?.find(acc => acc.isPrimary);
      if (primary) {
        setPrimaryAccountId(primary._id);
      } else if (data.accounts?.length > 0) {
        setPrimaryAccountId(data.accounts[0]._id);
      }
    } catch (e) {
      console.error('Error fetching accounts:', e);
    }
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAccounts();
    setRefreshing(false);
  };

  const setPrimaryAccount = async (accountId) => {
    try {
      const res = await fetch(`${API_URL}/trading-accounts/${accountId}/set-primary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user._id })
      });
      const data = await res.json();
      if (data.success) {
        setPrimaryAccountId(accountId);
        Alert.alert('Success', 'Primary account updated');
        fetchAccounts();
      } else {
        Alert.alert('Error', data.message || 'Failed to set primary account');
      }
    } catch (e) {
      Alert.alert('Error', 'Network error');
    }
  };

  const handleDeposit = (account) => {
    console.log('Opening deposit modal for account:', account.accountId, account._id);
    setSelectedAccount(account);
    setTransferAmount('');
    fetchWalletBalance(); // Refresh wallet balance
    setShowTransferModal(true);
  };

  const handleWithdraw = (account) => {
    console.log('Opening withdraw modal for account:', account.accountId, account._id);
    setSelectedAccount(account);
    setTransferAmount('');
    setShowWithdrawModal(true);
  };

  const handleAccountTransfer = (account) => {
    setSelectedAccount(account);
    setTargetAccount(null);
    setTransferAmount('');
    setShowAccountTransferModal(true);
  };

  // Transfer from wallet to account
  const handleTransferFunds = async () => {
    if (!selectedAccount || !selectedAccount._id) {
      Alert.alert('Error', 'No account selected');
      return;
    }
    if (!transferAmount || parseFloat(transferAmount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    if (parseFloat(transferAmount) > walletBalance) {
      Alert.alert('Error', 'Insufficient wallet balance');
      return;
    }

    setIsTransferring(true);
    try {
      console.log('Transfer request:', {
        url: `${API_URL}/trading-accounts/${selectedAccount._id}/transfer`,
        userId: user._id,
        amount: parseFloat(transferAmount),
        direction: 'deposit'
      });
      
      const res = await fetch(`${API_URL}/trading-accounts/${selectedAccount._id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user._id,
          amount: parseFloat(transferAmount),
          direction: 'deposit',
          skipPinVerification: true
        })
      });
      const data = await res.json();
      console.log('Transfer response:', res.status, data);
      
      if (res.ok) {
        Alert.alert('Success', 'Funds transferred successfully!');
        setShowTransferModal(false);
        setTransferAmount('');
        setSelectedAccount(null);
        fetchAccounts();
        fetchWalletBalance();
      } else {
        Alert.alert('Error', data.message || 'Transfer failed');
      }
    } catch (e) {
      console.error('Transfer error:', e);
      Alert.alert('Error', 'Error transferring funds: ' + e.message);
    }
    setIsTransferring(false);
  };

  // Withdraw from account to wallet
  const handleWithdrawFromAccount = async () => {
    if (!transferAmount || parseFloat(transferAmount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    if (!selectedAccount) {
      Alert.alert('Error', 'No account selected');
      return;
    }
    if (parseFloat(transferAmount) > (selectedAccount.balance || 0)) {
      Alert.alert('Error', 'Insufficient account balance');
      return;
    }

    setIsTransferring(true);
    try {
      const res = await fetch(`${API_URL}/trading-accounts/${selectedAccount._id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user._id,
          amount: parseFloat(transferAmount),
          direction: 'withdraw',
          skipPinVerification: true
        })
      });
      const data = await res.json();
      
      if (res.ok) {
        Alert.alert('Success', 'Funds withdrawn to main wallet!');
        setShowWithdrawModal(false);
        setTransferAmount('');
        setSelectedAccount(null);
        fetchAccounts();
        fetchWalletBalance();
      } else {
        Alert.alert('Error', data.message || 'Withdrawal failed');
      }
    } catch (e) {
      Alert.alert('Error', 'Error withdrawing funds');
    }
    setIsTransferring(false);
  };

  // Transfer between accounts
  const handleAccountToAccountTransfer = async () => {
    if (!transferAmount || parseFloat(transferAmount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    if (!targetAccount) {
      Alert.alert('Error', 'Please select a target account');
      return;
    }
    if (parseFloat(transferAmount) > selectedAccount.balance) {
      Alert.alert('Error', 'Insufficient account balance');
      return;
    }

    setIsTransferring(true);
    try {
      const res = await fetch(`${API_URL}/trading-accounts/account-transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user._id,
          fromAccountId: selectedAccount._id,
          toAccountId: targetAccount._id,
          amount: parseFloat(transferAmount),
          skipPinVerification: true
        })
      });
      const data = await res.json();
      
      if (res.ok) {
        Alert.alert('Success', `$${transferAmount} transferred successfully!`);
        setShowAccountTransferModal(false);
        setTransferAmount('');
        setSelectedAccount(null);
        setTargetAccount(null);
        fetchAccounts();
      } else {
        Alert.alert('Error', data.message || 'Transfer failed');
      }
    } catch (e) {
      Alert.alert('Error', 'Error transferring funds');
    }
    setIsTransferring(false);
  };

  const selectAccountForTrading = (account) => {
    // Navigate to MainTrading with selected account
    navigation.navigate('MainTrading', { selectedAccountId: account._id });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#d4af37" />
      </View>
    );
  }

  // Fetch account types for opening new account
  const fetchAccountTypes = async () => {
    try {
      console.log('Fetching account types from:', `${API_URL}/account-types`);
      const res = await fetch(`${API_URL}/account-types`);
      const data = await res.json();
      console.log('Account types response:', data);
      if (data.success && data.accountTypes) {
        setAccountTypes(data.accountTypes);
      } else {
        Alert.alert('Error', 'Failed to load account types');
      }
    } catch (e) {
      console.error('Error fetching account types:', e);
      Alert.alert('Error', 'Network error loading account types');
    }
  };

  const openNewAccount = async (accountType) => {
    if (openingAccount) return;
    setOpeningAccount(true);
    try {
      const res = await fetch(`${API_URL}/trading-accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user._id,
          accountTypeId: accountType._id
        })
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert('Success', `Account ${data.account?.accountId || ''} created successfully!`);
        setShowOpenAccountModal(false);
        fetchAccounts();
      } else {
        Alert.alert('Error', data.message || 'Failed to create account');
      }
    } catch (e) {
      Alert.alert('Error', 'Network error');
    } finally {
      setOpeningAccount(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Accounts</Text>
        <TouchableOpacity 
          style={styles.openAccountBtn} 
          onPress={() => { fetchAccountTypes(); setShowOpenAccountModal(true); }}
        >
          <Ionicons name="add-circle" size={24} color="#d4af37" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#d4af37" />}
      >
        {accounts.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="wallet-outline" size={64} color="#000000" />
            <Text style={styles.emptyTitle}>No Trading Accounts</Text>
            <Text style={styles.emptyText}>You don't have any trading accounts yet.</Text>
          </View>
        ) : (
          accounts.map((account) => {
            const isPrimary = account._id === primaryAccountId || account.isPrimary;
            return (
              <View key={account._id} style={[styles.accountCard, isPrimary && styles.primaryCard]}>
                {/* Primary Badge */}
                {isPrimary && (
                  <View style={styles.primaryBadge}>
                    <Ionicons name="star" size={12} color="#000" />
                    <Text style={styles.primaryBadgeText}>Primary</Text>
                  </View>
                )}

                {/* Account Header */}
                <TouchableOpacity 
                  style={styles.accountHeader}
                  onPress={() => selectAccountForTrading(account)}
                >
                  <View style={styles.accountIconContainer}>
                    <Ionicons name="briefcase-outline" size={24} color="#d4af37" />
                  </View>
                  <View style={styles.accountInfo}>
                    <Text style={styles.accountId}>{account.accountId}</Text>
                    <Text style={styles.accountType}>{account.accountType || 'Standard'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#666" />
                </TouchableOpacity>

                {/* Balance Info */}
                <View style={styles.balanceSection}>
                  <View style={styles.balanceRow}>
                    <View style={styles.balanceItem}>
                      <Text style={styles.balanceLabel}>Balance</Text>
                      <Text style={styles.balanceValue}>${(account.balance || 0).toFixed(2)}</Text>
                    </View>
                    <View style={styles.balanceItem}>
                      <Text style={styles.balanceLabel}>Credit</Text>
                      <Text style={styles.balanceValue}>${(account.credit || 0).toFixed(2)}</Text>
                    </View>
                    <View style={styles.balanceItem}>
                      <Text style={styles.balanceLabel}>Leverage</Text>
                      <Text style={styles.balanceValue}>{account.leverage || '1:100'}</Text>
                    </View>
                  </View>
                </View>

                {/* Action Buttons */}
                <View style={styles.actionButtons}>
                  <TouchableOpacity 
                    style={styles.depositBtn}
                    onPress={() => handleDeposit(account)}
                  >
                    <Ionicons name="arrow-down-circle-outline" size={18} color="#000" />
                    <Text style={styles.depositBtnText}>Deposit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.withdrawBtn}
                    onPress={() => handleWithdraw(account)}
                  >
                    <Ionicons name="arrow-up-circle-outline" size={18} color="#fff" />
                    <Text style={styles.withdrawBtnText}>Withdraw</Text>
                  </TouchableOpacity>
                </View>

                {/* Set as Primary Button */}
                {!isPrimary && (
                  <TouchableOpacity 
                    style={styles.setPrimaryBtn}
                    onPress={() => setPrimaryAccount(account._id)}
                  >
                    <Ionicons name="star-outline" size={16} color="#d4af37" />
                    <Text style={styles.setPrimaryBtnText}>Set as Primary</Text>
                  </TouchableOpacity>
                )}

                {/* Trade Button */}
                <TouchableOpacity 
                  style={styles.tradeBtn}
                  onPress={() => selectAccountForTrading(account)}
                >
                  <Ionicons name="trending-up" size={18} color="#000" />
                  <Text style={styles.tradeBtnText}>Trade with this Account</Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Open Account Modal */}
      <Modal visible={showOpenAccountModal} animationType="slide" transparent onRequestClose={() => setShowOpenAccountModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowOpenAccountModal(false)} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Open New Account</Text>
              <TouchableOpacity onPress={() => setShowOpenAccountModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.accountTypesList}>
              {accountTypes.length === 0 ? (
                <View style={styles.loadingTypes}>
                  <ActivityIndicator size="small" color="#d4af37" />
                  <Text style={styles.loadingText}>Loading account types...</Text>
                </View>
              ) : (
                accountTypes.map(type => (
                  <TouchableOpacity 
                    key={type._id}
                    style={styles.accountTypeItem}
                    onPress={() => openNewAccount(type)}
                    disabled={openingAccount}
                  >
                    <View style={styles.accountTypeIcon}>
                      <Ionicons name={type.isDemo ? "flask" : "briefcase"} size={24} color="#d4af37" />
                    </View>
                    <View style={styles.accountTypeInfo}>
                      <Text style={styles.accountTypeName}>{type.name}</Text>
                      <Text style={styles.accountTypeDesc}>{type.description || 'Standard trading account'}</Text>
                      <View style={styles.accountTypeDetails}>
                        <Text style={styles.accountTypeDetail}>Min: ${type.minDeposit || 0}</Text>
                        <Text style={styles.accountTypeDetail}>Leverage: {type.leverage || '1:100'}</Text>
                        {type.isDemo && <Text style={[styles.accountTypeDetail, {color: '#d4af37'}]}>Demo</Text>}
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#666" />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Deposit Modal - Transfer from Wallet to Account */}
      <Modal visible={showTransferModal} animationType="slide" transparent onRequestClose={() => setShowTransferModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowTransferModal(false)} />
          <View style={styles.transferModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Deposit to Account</Text>
              <TouchableOpacity onPress={() => setShowTransferModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.transferInfo}>
              <View style={styles.transferInfoRow}>
                <Text style={styles.transferLabel}>From</Text>
                <Text style={styles.transferValue}>Main Wallet</Text>
              </View>
              <View style={styles.transferInfoRow}>
                <Text style={styles.transferLabel}>Available</Text>
                <Text style={styles.transferValueGold}>${walletBalance.toFixed(2)}</Text>
              </View>
              <View style={styles.transferInfoRow}>
                <Text style={styles.transferLabel}>To</Text>
                <Text style={styles.transferValue}>{selectedAccount?.accountId}</Text>
              </View>
            </View>

            <Text style={styles.inputLabel}>Amount (USD)</Text>
            <TextInput
              style={styles.transferInput}
              value={transferAmount}
              onChangeText={setTransferAmount}
              placeholder="Enter amount"
              placeholderTextColor="#666"
              keyboardType="numeric"
            />

            <TouchableOpacity 
              style={[styles.transferSubmitBtn, isTransferring && styles.btnDisabled]}
              onPress={handleTransferFunds}
              disabled={isTransferring}
            >
              {isTransferring ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.transferSubmitBtnText}>Transfer to Account</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Withdraw Modal - Transfer from Account to Wallet */}
      <Modal visible={showWithdrawModal} animationType="slide" transparent onRequestClose={() => setShowWithdrawModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowWithdrawModal(false)} />
          <View style={styles.transferModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Withdraw to Wallet</Text>
              <TouchableOpacity onPress={() => setShowWithdrawModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.transferInfo}>
              <View style={styles.transferInfoRow}>
                <Text style={styles.transferLabel}>From</Text>
                <Text style={styles.transferValue}>{selectedAccount?.accountId}</Text>
              </View>
              <View style={styles.transferInfoRow}>
                <Text style={styles.transferLabel}>Available</Text>
                <Text style={styles.transferValueGold}>${(selectedAccount?.balance || 0).toFixed(2)}</Text>
              </View>
              <View style={styles.transferInfoRow}>
                <Text style={styles.transferLabel}>To</Text>
                <Text style={styles.transferValue}>Main Wallet</Text>
              </View>
            </View>

            <Text style={styles.inputLabel}>Amount (USD)</Text>
            <TextInput
              style={styles.transferInput}
              value={transferAmount}
              onChangeText={setTransferAmount}
              placeholder="Enter amount"
              placeholderTextColor="#666"
              keyboardType="numeric"
            />

            <TouchableOpacity 
              style={[styles.withdrawSubmitBtn, isTransferring && styles.btnDisabled]}
              onPress={handleWithdrawFromAccount}
              disabled={isTransferring}
            >
              {isTransferring ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.withdrawSubmitBtnText}>Withdraw to Wallet</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Account to Account Transfer Modal */}
      <Modal visible={showAccountTransferModal} animationType="slide" transparent onRequestClose={() => setShowAccountTransferModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowAccountTransferModal(false)} />
          <View style={styles.transferModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Transfer Between Accounts</Text>
              <TouchableOpacity onPress={() => setShowAccountTransferModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.transferInfo}>
              <View style={styles.transferInfoRow}>
                <Text style={styles.transferLabel}>From</Text>
                <Text style={styles.transferValue}>{selectedAccount?.accountId}</Text>
              </View>
              <View style={styles.transferInfoRow}>
                <Text style={styles.transferLabel}>Available</Text>
                <Text style={styles.transferValueGold}>${(selectedAccount?.balance || 0).toFixed(2)}</Text>
              </View>
            </View>

            <Text style={styles.inputLabel}>Select Target Account</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accountsScroll}>
              {accounts.filter(a => a._id !== selectedAccount?._id).map(account => (
                <TouchableOpacity
                  key={account._id}
                  style={[styles.accountSelectCard, targetAccount?._id === account._id && styles.accountSelectCardActive]}
                  onPress={() => setTargetAccount(account)}
                >
                  <Text style={[styles.accountSelectId, targetAccount?._id === account._id && { color: '#000' }]}>{account.accountId}</Text>
                  <Text style={styles.accountSelectBalance}>${(account.balance || 0).toFixed(2)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.inputLabel}>Amount (USD)</Text>
            <TextInput
              style={styles.transferInput}
              value={transferAmount}
              onChangeText={setTransferAmount}
              placeholder="Enter amount"
              placeholderTextColor="#666"
              keyboardType="numeric"
            />

            <TouchableOpacity 
              style={[styles.transferSubmitBtn, isTransferring && styles.btnDisabled]}
              onPress={handleAccountToAccountTransfer}
              disabled={isTransferring}
            >
              {isTransferring ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.transferSubmitBtnText}>Transfer</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
  },
  accountCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#000000',
  },
  primaryCard: {
    borderColor: '#d4af37',
    borderWidth: 2,
  },
  primaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#d4af37',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 12,
    gap: 4,
  },
  primaryBadgeText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '600',
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  accountIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#d4af3720',
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountInfo: {
    flex: 1,
    marginLeft: 12,
  },
  accountId: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  accountType: {
    color: '#666',
    fontSize: 13,
    marginTop: 2,
  },
  balanceSection: {
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  balanceItem: {
    alignItems: 'center',
  },
  balanceLabel: {
    color: '#666',
    fontSize: 12,
    marginBottom: 4,
  },
  balanceValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  depositBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    backgroundColor: '#d4af37',
    borderRadius: 10,
  },
  depositBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  withdrawBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    backgroundColor: '#000000',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#000000',
  },
  withdrawBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  setPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginBottom: 12,
  },
  setPrimaryBtnText: {
    color: '#d4af37',
    fontSize: 14,
  },
  tradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: '#d4af37',
    borderRadius: 10,
  },
  tradeBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '600',
  },
  openAccountBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  modalContent: {
    backgroundColor: '#000000',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  accountTypesList: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  loadingTypes: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    color: '#666',
    marginTop: 12,
  },
  accountTypeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginVertical: 6,
    backgroundColor: '#000000',
    borderRadius: 12,
  },
  accountTypeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#d4af3720',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  accountTypeInfo: {
    flex: 1,
  },
  accountTypeName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  accountTypeDesc: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  accountTypeDetails: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  accountTypeDetail: {
    color: '#888',
    fontSize: 11,
  },
  // PIN Modal Styles
  pinModalContent: {
    backgroundColor: '#000000',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  pinDescription: {
    color: '#888',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  pinInputContainer: {
    marginBottom: 16,
  },
  pinLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 8,
  },
  pinInput: {
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 8,
  },
  createAccountBtn: {
    backgroundColor: '#d4af37',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  createAccountBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  
  // Transfer Modal Styles
  transferModalContent: {
    backgroundColor: '#000000',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
  },
  transferInfo: {
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  transferInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
  },
  transferLabel: {
    color: '#888',
    fontSize: 14,
  },
  transferValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  transferValueGold: {
    color: '#d4af37',
    fontSize: 16,
    fontWeight: 'bold',
  },
  inputLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 8,
    marginTop: 8,
  },
  transferInput: {
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
  },
  transferSubmitBtn: {
    backgroundColor: '#d4af37',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  transferSubmitBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  withdrawSubmitBtn: {
    backgroundColor: '#d4af37',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  withdrawSubmitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  accountsScroll: {
    marginVertical: 8,
  },
  accountSelectCard: {
    backgroundColor: '#000000',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginRight: 10,
    alignItems: 'center',
    minWidth: 100,
    borderWidth: 1,
    borderColor: '#000000',
  },
  accountSelectCardActive: {
    backgroundColor: '#d4af37',
    borderColor: '#d4af37',
  },
  accountSelectId: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  accountSelectBalance: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
});

export default AccountsScreen;
