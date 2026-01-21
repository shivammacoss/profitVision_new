import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../config/api';

const OrderBookScreen = ({ navigation }) => {
  const [user, setUser] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('all');
  const [activeTab, setActiveTab] = useState('positions'); // positions, pending, history
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openTrades, setOpenTrades] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [closedTrades, setClosedTrades] = useState([]);
  const [livePrices, setLivePrices] = useState({});
  const [showAccountPicker, setShowAccountPicker] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchAccounts();
    }
  }, [user]);

  useEffect(() => {
    if (accounts.length > 0) {
      fetchAllTrades();
    }
  }, [accounts, selectedAccount]);

  useEffect(() => {
    if (openTrades.length > 0) {
      fetchPrices();
      const interval = setInterval(fetchPrices, 3000);
      return () => clearInterval(interval);
    }
  }, [openTrades]);

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
    try {
      const res = await fetch(`${API_URL}/trading-accounts/user/${user._id}`);
      const data = await res.json();
      setAccounts(data.accounts || []);
    } catch (e) {
      console.error('Error fetching accounts:', e);
    }
  };

  const fetchPrices = async () => {
    const symbols = [...new Set(openTrades.map(t => t.symbol))];
    if (symbols.length === 0) return;
    
    try {
      const res = await fetch(`${API_URL}/prices/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols })
      });
      const data = await res.json();
      if (data.success && data.prices) {
        setLivePrices(data.prices);
      }
    } catch (e) {
      console.error('Error fetching prices:', e);
    }
  };

  const fetchAllTrades = async () => {
    setLoading(true);
    try {
      const accountsToFetch = selectedAccount === 'all' 
        ? accounts 
        : accounts.filter(a => a._id === selectedAccount);

      let allOpen = [];
      let allClosed = [];
      let allPending = [];

      for (const account of accountsToFetch) {
        // Fetch open trades
        const openRes = await fetch(`${API_URL}/trade/open/${account._id}`);
        const openData = await openRes.json();
        if (openData.success && openData.trades) {
          allOpen = [...allOpen, ...openData.trades.map(t => ({ ...t, accountName: account.accountId }))];
        }

        // Fetch closed trades (history)
        const historyRes = await fetch(`${API_URL}/trade/history/${account._id}?limit=50`);
        const historyData = await historyRes.json();
        if (historyData.success && historyData.trades) {
          allClosed = [...allClosed, ...historyData.trades.map(t => ({ ...t, accountName: account.accountId }))];
        }

        // Fetch pending orders
        const pendingRes = await fetch(`${API_URL}/trade/pending/${account._id}`);
        const pendingData = await pendingRes.json();
        if (pendingData.success && pendingData.trades) {
          allPending = [...allPending, ...pendingData.trades.map(o => ({ ...o, accountName: account.accountId }))];
        }
      }

      setOpenTrades(allOpen);
      setClosedTrades(allClosed.sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt)));
      setPendingOrders(allPending);
    } catch (e) {
      console.error('Error fetching trades:', e);
    }
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAllTrades();
    setRefreshing(false);
  };

  const getContractSize = (symbol) => {
    if (symbol === 'XAUUSD') return 100;
    if (symbol === 'XAGUSD') return 5000;
    if (['BTCUSD', 'ETHUSD', 'BNBUSD', 'SOLUSD', 'XRPUSD', 'ADAUSD', 'DOGEUSD', 'DOTUSD', 'MATICUSD', 'LTCUSD', 'AVAXUSD', 'LINKUSD'].includes(symbol)) return 1;
    return 100000;
  };

  const calculateFloatingPnl = (trade) => {
    const prices = livePrices[trade.symbol];
    if (!prices || !prices.bid) return 0;
    
    const currentPrice = trade.side === 'BUY' ? prices.bid : prices.ask;
    if (!currentPrice) return 0;
    
    const contractSize = trade.contractSize || getContractSize(trade.symbol);
    const pnl = trade.side === 'BUY'
      ? (currentPrice - trade.openPrice) * trade.quantity * contractSize
      : (trade.openPrice - currentPrice) * trade.quantity * contractSize;
    
    return pnl - (trade.commission || 0) - (trade.swap || 0);
  };

  const getTotalPnl = () => {
    return openTrades.reduce((sum, trade) => sum + calculateFloatingPnl(trade), 0);
  };

  const closeTrade = async (trade) => {
    Alert.alert(
      'Close Position',
      `Close ${trade.side} ${trade.quantity} ${trade.symbol}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close',
          style: 'destructive',
          onPress: async () => {
            try {
              const prices = livePrices[trade.symbol];
              const closePrice = trade.side === 'BUY' ? prices?.bid : prices?.ask;
              const res = await fetch(`${API_URL}/trade/close/${trade._id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ closePrice })
              });
              const data = await res.json();
              if (data.success) {
                Alert.alert('Success', `Trade closed! P/L: $${data.realizedPnl?.toFixed(2)}`);
                fetchAllTrades();
              } else {
                Alert.alert('Error', data.message || 'Failed to close trade');
              }
            } catch (e) {
              Alert.alert('Error', 'Network error');
            }
          }
        }
      ]
    );
  };

  const cancelPendingOrder = async (order) => {
    Alert.alert(
      'Cancel Order',
      `Cancel ${order.orderType} order for ${order.symbol}?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await fetch(`${API_URL}/trade/pending/${order._id}`, {
                method: 'DELETE'
              });
              const data = await res.json();
              if (data.success) {
                Alert.alert('Success', 'Order cancelled');
                fetchAllTrades();
              } else {
                Alert.alert('Error', data.message || 'Failed to cancel order');
              }
            } catch (e) {
              Alert.alert('Error', 'Network error');
            }
          }
        }
      ]
    );
  };

  const getSelectedAccountName = () => {
    if (selectedAccount === 'all') return 'All Accounts';
    const acc = accounts.find(a => a._id === selectedAccount);
    return acc?.accountId || 'Select Account';
  };

  const renderPositionItem = (trade) => {
    const pnl = calculateFloatingPnl(trade);
    const prices = livePrices[trade.symbol] || {};
    const currentPrice = trade.side === 'BUY' ? prices.bid : prices.ask;
    
    return (
      <View key={trade._id} style={styles.tradeCard}>
        <View style={styles.tradeHeader}>
          <View style={styles.tradeSymbolRow}>
            <Text style={styles.tradeSymbol}>{trade.symbol}</Text>
            <View style={[styles.sideBadge, { backgroundColor: trade.side === 'BUY' ? '#d4af3720' : '#d4af3720' }]}>
              <Text style={[styles.sideText, { color: trade.side === 'BUY' ? '#d4af37' : '#d4af37' }]}>
                {trade.side}
              </Text>
            </View>
          </View>
          <Text style={styles.accountLabel}>{trade.accountName}</Text>
        </View>
        
        <View style={styles.tradeDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Volume</Text>
            <Text style={styles.detailValue}>{trade.quantity}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Open Price</Text>
            <Text style={styles.detailValue}>{trade.openPrice?.toFixed(5)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Current</Text>
            <Text style={styles.detailValue}>{currentPrice?.toFixed(5) || '...'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>P/L</Text>
            <Text style={[styles.detailValue, { color: pnl >= 0 ? '#d4af37' : '#d4af37', fontWeight: '600' }]}>
              ${pnl.toFixed(2)}
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.closeBtn} onPress={() => closeTrade(trade)}>
          <Text style={styles.closeBtnText}>Close Position</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderPendingItem = (order) => (
    <View key={order._id} style={styles.tradeCard}>
      <View style={styles.tradeHeader}>
        <View style={styles.tradeSymbolRow}>
          <Text style={styles.tradeSymbol}>{order.symbol}</Text>
          <View style={[styles.sideBadge, { backgroundColor: '#d4af3720' }]}>
            <Text style={[styles.sideText, { color: '#d4af37' }]}>{order.orderType}</Text>
          </View>
        </View>
        <Text style={styles.accountLabel}>{order.accountName}</Text>
      </View>
      
      <View style={styles.tradeDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Side</Text>
          <Text style={[styles.detailValue, { color: order.side === 'BUY' ? '#d4af37' : '#d4af37' }]}>
            {order.side}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Volume</Text>
          <Text style={styles.detailValue}>{order.quantity}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Entry Price</Text>
          <Text style={styles.detailValue}>{order.entryPrice?.toFixed(5)}</Text>
        </View>
      </View>

      <TouchableOpacity style={[styles.closeBtn, { backgroundColor: '#d4af3720' }]} onPress={() => cancelPendingOrder(order)}>
        <Text style={[styles.closeBtnText, { color: '#d4af37' }]}>Cancel Order</Text>
      </TouchableOpacity>
    </View>
  );

  const renderHistoryItem = (trade) => (
    <View key={trade._id} style={styles.tradeCard}>
      <View style={styles.tradeHeader}>
        <View style={styles.tradeSymbolRow}>
          <Text style={styles.tradeSymbol}>{trade.symbol}</Text>
          <View style={[styles.sideBadge, { backgroundColor: trade.side === 'BUY' ? '#d4af3720' : '#d4af3720' }]}>
            <Text style={[styles.sideText, { color: trade.side === 'BUY' ? '#d4af37' : '#d4af37' }]}>
              {trade.side}
            </Text>
          </View>
        </View>
        <Text style={styles.accountLabel}>{trade.accountName}</Text>
      </View>
      
      <View style={styles.tradeDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Volume</Text>
          <Text style={styles.detailValue}>{trade.quantity}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Open</Text>
          <Text style={styles.detailValue}>{trade.openPrice?.toFixed(5)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Close</Text>
          <Text style={styles.detailValue}>{trade.closePrice?.toFixed(5)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>P/L</Text>
          <Text style={[styles.detailValue, { color: (trade.realizedPnl || 0) >= 0 ? '#d4af37' : '#d4af37', fontWeight: '600' }]}>
            ${(trade.realizedPnl || 0).toFixed(2)}
          </Text>
        </View>
      </View>
      
      <Text style={styles.dateText}>
        {new Date(trade.closedAt).toLocaleDateString()} {new Date(trade.closedAt).toLocaleTimeString()}
      </Text>
    </View>
  );

  if (loading && accounts.length === 0) {
    return (
      <View style={styles.centered}>
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
        <Text style={styles.headerTitle}>Order Book</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={22} color="#d4af37" />
        </TouchableOpacity>
      </View>

      {/* Account Selector */}
      <TouchableOpacity 
        style={styles.accountSelector}
        onPress={() => setShowAccountPicker(!showAccountPicker)}
      >
        <Ionicons name="briefcase-outline" size={18} color="#d4af37" />
        <Text style={styles.accountSelectorText}>{getSelectedAccountName()}</Text>
        <Ionicons name="chevron-down" size={18} color="#666" />
      </TouchableOpacity>

      {showAccountPicker && (
        <View style={styles.accountPickerDropdown}>
          <TouchableOpacity 
            style={[styles.accountOption, selectedAccount === 'all' && styles.accountOptionActive]}
            onPress={() => { setSelectedAccount('all'); setShowAccountPicker(false); }}
          >
            <Text style={styles.accountOptionText}>All Accounts</Text>
          </TouchableOpacity>
          {accounts.map(acc => (
            <TouchableOpacity 
              key={acc._id}
              style={[styles.accountOption, selectedAccount === acc._id && styles.accountOptionActive]}
              onPress={() => { setSelectedAccount(acc._id); setShowAccountPicker(false); }}
            >
              <Text style={styles.accountOptionText}>{acc.accountId}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'positions' && styles.tabActive]}
          onPress={() => setActiveTab('positions')}
        >
          <Text style={[styles.tabText, activeTab === 'positions' && styles.tabTextActive]}>
            Positions ({openTrades.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'pending' && styles.tabActive]}
          onPress={() => setActiveTab('pending')}
        >
          <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>
            Pending ({pendingOrders.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'history' && styles.tabActive]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
            History
          </Text>
        </TouchableOpacity>
      </View>

      {/* Summary Bar */}
      {activeTab === 'positions' && openTrades.length > 0 && (
        <View style={styles.summaryBar}>
          <Text style={styles.summaryLabel}>Total Floating P/L:</Text>
          <Text style={[styles.summaryValue, { color: getTotalPnl() >= 0 ? '#d4af37' : '#d4af37' }]}>
            ${getTotalPnl().toFixed(2)}
          </Text>
        </View>
      )}

      {/* Content */}
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#d4af37" />}
      >
        {loading ? (
          <ActivityIndicator size="large" color="#d4af37" style={{ marginTop: 40 }} />
        ) : (
          <>
            {activeTab === 'positions' && (
              openTrades.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="trending-up-outline" size={48} color="#000000" />
                  <Text style={styles.emptyTitle}>No Open Positions</Text>
                  <Text style={styles.emptyText}>Your open trades will appear here</Text>
                </View>
              ) : (
                openTrades.map(trade => renderPositionItem(trade))
              )
            )}

            {activeTab === 'pending' && (
              pendingOrders.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="time-outline" size={48} color="#000000" />
                  <Text style={styles.emptyTitle}>No Pending Orders</Text>
                  <Text style={styles.emptyText}>Your pending orders will appear here</Text>
                </View>
              ) : (
                pendingOrders.map(order => renderPendingItem(order))
              )
            )}

            {activeTab === 'history' && (
              closedTrades.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="document-text-outline" size={48} color="#000000" />
                  <Text style={styles.emptyTitle}>No Trade History</Text>
                  <Text style={styles.emptyText}>Your closed trades will appear here</Text>
                </View>
              ) : (
                closedTrades.slice(0, 50).map(trade => renderHistoryItem(trade))
              )
            )}
          </>
        )}
      </ScrollView>
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
  refreshBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#000000',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#000000',
  },
  accountSelectorText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  accountPickerDropdown: {
    marginHorizontal: 16,
    marginTop: 4,
    backgroundColor: '#000000',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#000000',
    overflow: 'hidden',
  },
  accountOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
  },
  accountOptionActive: {
    backgroundColor: '#d4af3720',
  },
  accountOptionText: {
    color: '#fff',
    fontSize: 14,
  },
  tabsContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#000000',
    borderRadius: 10,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#d4af37',
  },
  tabText: {
    color: '#666',
    fontSize: 13,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#000',
  },
  summaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#000000',
    borderRadius: 10,
  },
  summaryLabel: {
    color: '#666',
    fontSize: 14,
  },
  summaryValue: {
    fontSize: 16,
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
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
  },
  tradeCard: {
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#000000',
  },
  tradeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tradeSymbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tradeSymbol: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  sideBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sideText: {
    fontSize: 12,
    fontWeight: '600',
  },
  accountLabel: {
    color: '#666',
    fontSize: 12,
  },
  tradeDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  detailRow: {
    width: '48%',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    color: '#666',
    fontSize: 13,
  },
  detailValue: {
    color: '#fff',
    fontSize: 13,
  },
  closeBtn: {
    backgroundColor: '#d4af3720',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#d4af37',
    fontSize: 14,
    fontWeight: '600',
  },
  dateText: {
    color: '#666',
    fontSize: 12,
    textAlign: 'right',
  },
});

export default OrderBookScreen;
