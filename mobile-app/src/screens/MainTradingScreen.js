import React, { useState, useEffect, useRef } from 'react';
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
  Dimensions,
  FlatList,
  Animated,
  PanResponder,
  Keyboard,
  Platform,
  KeyboardAvoidingView,
  Alert,
  Linking,
  Image,
} from 'react-native';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../config';
import { useTheme } from '../context/ThemeContext';

const Tab = createBottomTabNavigator();
const { width, height } = Dimensions.get('window');

// iOS 26 Style Toast Notification Component
const ToastContext = React.createContext();

const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  
  const showToast = (message, type = 'info', duration = 3000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  };
  
  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <View style={toastStyles.container} pointerEvents="none">
        {toasts.map((toast, index) => (
          <ToastItem key={toast.id} toast={toast} index={index} />
        ))}
      </View>
    </ToastContext.Provider>
  );
};

const ToastItem = ({ toast, index }) => {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -100, duration: 300, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }, 2500);
    
    return () => clearTimeout(timer);
  }, []);
  
  const getToastStyle = () => {
    switch (toast.type) {
      case 'success': return { backgroundColor: 'rgba(34, 197, 94, 0.95)', icon: 'checkmark-circle' };
      case 'error': return { backgroundColor: 'rgba(239, 68, 68, 0.95)', icon: 'close-circle' };
      case 'warning': return { backgroundColor: 'rgba(251, 191, 36, 0.95)', icon: 'warning' };
      default: return { backgroundColor: 'rgba(59, 130, 246, 0.95)', icon: 'information-circle' };
    }
  };
  
  const style = getToastStyle();
  
  return (
    <Animated.View style={[
      toastStyles.toast,
      { backgroundColor: style.backgroundColor, transform: [{ translateY }], opacity, marginTop: index * 60 }
    ]}>
      <View style={toastStyles.toastContent}>
        <Ionicons name={style.icon} size={22} color="#fff" />
        <Text style={toastStyles.toastText}>{toast.message}</Text>
      </View>
    </Animated.View>
  );
};

const toastStyles = StyleSheet.create({
  container: { position: 'absolute', top: 60, left: 16, right: 16, zIndex: 9999 },
  toast: { 
    borderRadius: 16, 
    paddingVertical: 14, 
    paddingHorizontal: 18, 
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  toastContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toastText: { color: '#fff', fontSize: 15, fontWeight: '600', flex: 1 },
});

const useToast = () => React.useContext(ToastContext);

// Default instruments - same as mobile web view
const defaultInstruments = [
  { symbol: 'EURUSD', name: 'EUR/USD', bid: 0, ask: 0, spread: 0, category: 'Forex', starred: true },
  { symbol: 'GBPUSD', name: 'GBP/USD', bid: 0, ask: 0, spread: 0, category: 'Forex', starred: true },
  { symbol: 'USDJPY', name: 'USD/JPY', bid: 0, ask: 0, spread: 0, category: 'Forex', starred: false },
  { symbol: 'USDCHF', name: 'USD/CHF', bid: 0, ask: 0, spread: 0, category: 'Forex', starred: false },
  { symbol: 'AUDUSD', name: 'AUD/USD', bid: 0, ask: 0, spread: 0, category: 'Forex', starred: false },
  { symbol: 'NZDUSD', name: 'NZD/USD', bid: 0, ask: 0, spread: 0, category: 'Forex', starred: false },
  { symbol: 'USDCAD', name: 'USD/CAD', bid: 0, ask: 0, spread: 0, category: 'Forex', starred: false },
  { symbol: 'EURGBP', name: 'EUR/GBP', bid: 0, ask: 0, spread: 0, category: 'Forex', starred: false },
  { symbol: 'EURJPY', name: 'EUR/JPY', bid: 0, ask: 0, spread: 0, category: 'Forex', starred: false },
  { symbol: 'GBPJPY', name: 'GBP/JPY', bid: 0, ask: 0, spread: 0, category: 'Forex', starred: false },
  { symbol: 'XAUUSD', name: 'Gold', bid: 0, ask: 0, spread: 0, category: 'Metals', starred: true },
  { symbol: 'XAGUSD', name: 'Silver', bid: 0, ask: 0, spread: 0, category: 'Metals', starred: false },
  { symbol: 'BTCUSD', name: 'Bitcoin', bid: 0, ask: 0, spread: 0, category: 'Crypto', starred: true },
  { symbol: 'ETHUSD', name: 'Ethereum', bid: 0, ask: 0, spread: 0, category: 'Crypto', starred: false },
  { symbol: 'BNBUSD', name: 'BNB', bid: 0, ask: 0, spread: 0, category: 'Crypto', starred: false },
  { symbol: 'SOLUSD', name: 'Solana', bid: 0, ask: 0, spread: 0, category: 'Crypto', starred: false },
  { symbol: 'XRPUSD', name: 'XRP', bid: 0, ask: 0, spread: 0, category: 'Crypto', starred: false },
  { symbol: 'ADAUSD', name: 'Cardano', bid: 0, ask: 0, spread: 0, category: 'Crypto', starred: false },
  { symbol: 'DOGEUSD', name: 'Dogecoin', bid: 0, ask: 0, spread: 0, category: 'Crypto', starred: false },
  { symbol: 'DOTUSD', name: 'Polkadot', bid: 0, ask: 0, spread: 0, category: 'Crypto', starred: false },
  { symbol: 'MATICUSD', name: 'Polygon', bid: 0, ask: 0, spread: 0, category: 'Crypto', starred: false },
  { symbol: 'LTCUSD', name: 'Litecoin', bid: 0, ask: 0, spread: 0, category: 'Crypto', starred: false },
  { symbol: 'AVAXUSD', name: 'Avalanche', bid: 0, ask: 0, spread: 0, category: 'Crypto', starred: false },
  { symbol: 'LINKUSD', name: 'Chainlink', bid: 0, ask: 0, spread: 0, category: 'Crypto', starred: false },
];

// Shared context for trading data
const TradingContext = React.createContext();

const TradingProvider = ({ children, navigation }) => {
  const [user, setUser] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [openTrades, setOpenTrades] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [tradeHistory, setTradeHistory] = useState([]);
  const [instruments, setInstruments] = useState(defaultInstruments);
  const [livePrices, setLivePrices] = useState({});
  const [adminSpreads, setAdminSpreads] = useState({});
  const [loading, setLoading] = useState(true);
  const [accountSummary, setAccountSummary] = useState({
    balance: 0, equity: 0, credit: 0, freeMargin: 0, usedMargin: 0, floatingPnl: 0
  });
  const [marketWatchNews, setMarketWatchNews] = useState([]);
  const [loadingNews, setLoadingNews] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchAccounts(user._id);
    }
  }, [user]);

  useEffect(() => {
    if (selectedAccount) {
      fetchOpenTrades();
      fetchPendingOrders();
      fetchTradeHistory();
      fetchAccountSummary();
      
      // Faster polling for real-time sync with web (every 2 seconds)
      const interval = setInterval(() => {
        fetchOpenTrades();
        fetchPendingOrders();
        fetchAccountSummary();
      }, 2000);
      
      // Refresh history less frequently (every 10 seconds)
      const historyInterval = setInterval(() => {
        fetchTradeHistory();
      }, 10000);
      
      return () => {
        clearInterval(interval);
        clearInterval(historyInterval);
      };
    }
  }, [selectedAccount]);

  useEffect(() => {
    fetchLivePrices();
    fetchAdminSpreads();
    fetchMarketWatchNews();
    // Faster price updates (every 1 second for responsive trading)
    const priceInterval = setInterval(fetchLivePrices, 1000);
    // Refresh news every 30 seconds
    const newsInterval = setInterval(fetchMarketWatchNews, 30000);
    return () => {
      clearInterval(priceInterval);
      clearInterval(newsInterval);
    };
  }, []);

  const fetchAdminSpreads = async () => {
    try {
      const res = await fetch(`${API_URL}/charges/spreads`);
      const data = await res.json();
      if (data.success) {
        setAdminSpreads(data.spreads || {});
      }
    } catch (e) {
      console.error('Error fetching admin spreads:', e);
    }
  };

  const fetchMarketWatchNews = async () => {
    try {
      const res = await fetch(`${API_URL}/news/marketwatch`);
      const data = await res.json();
      if (data.success && data.news) {
        setMarketWatchNews(data.news);
      }
    } catch (e) {
      console.error('Error fetching MarketWatch news:', e);
    } finally {
      setLoadingNews(false);
    }
  };

  const loadUser = async () => {
    try {
      const userData = await SecureStore.getItemAsync('user');
      console.log('DEBUG: User data from SecureStore:', userData ? 'Found' : 'Not found');
      if (userData) {
        const parsedUser = JSON.parse(userData);
        console.log('DEBUG: Parsed user ID:', parsedUser?._id);
        setUser(parsedUser);
      } else {
        console.log('DEBUG: No user data, redirecting to Login');
        navigation.replace('Login');
      }
    } catch (e) {
      console.error('Error loading user:', e);
    }
    setLoading(false);
  };

  const fetchAccounts = async (userId) => {
    try {
      console.log('DEBUG: Fetching accounts for userId:', userId);
      const res = await fetch(`${API_URL}/trading-accounts/user/${userId}`);
      const data = await res.json();
      console.log('DEBUG: Accounts response:', data.success, 'Count:', data.accounts?.length);
      setAccounts(data.accounts || []);
      if (data.accounts?.length > 0) {
        console.log('DEBUG: Setting selected account:', data.accounts[0].accountId);
        setSelectedAccount(data.accounts[0]);
      }
    } catch (e) {
      console.error('Error fetching accounts:', e);
    }
  };

  const fetchOpenTrades = async () => {
    if (!selectedAccount) return;
    try {
      const res = await fetch(`${API_URL}/trade/open/${selectedAccount._id}`);
      const data = await res.json();
      if (data.success) setOpenTrades(data.trades || []);
    } catch (e) {}
  };

  const fetchPendingOrders = async () => {
    if (!selectedAccount) return;
    try {
      const res = await fetch(`${API_URL}/trade/pending/${selectedAccount._id}`);
      const data = await res.json();
      if (data.success) setPendingOrders(data.trades || []);
    } catch (e) {
      console.error('Error fetching pending orders:', e);
    }
  };

  const fetchTradeHistory = async () => {
    if (!selectedAccount) return;
    try {
      const res = await fetch(`${API_URL}/trade/history/${selectedAccount._id}?limit=50`);
      const data = await res.json();
      if (data.success) setTradeHistory(data.trades || []);
    } catch (e) {}
  };

  const fetchAccountSummary = async () => {
    if (!selectedAccount) return;
    try {
      // Pass current prices to backend for accurate floating PnL calculation
      const pricesParam = Object.keys(livePrices).length > 0 
        ? `?prices=${encodeURIComponent(JSON.stringify(livePrices))}` 
        : '';
      const res = await fetch(`${API_URL}/trade/summary/${selectedAccount._id}${pricesParam}`);
      const data = await res.json();
      if (data.success) setAccountSummary(data.summary);
    } catch (e) {}
  };

  const fetchLivePrices = async () => {
    try {
      const symbols = instruments.map(i => i.symbol);
      console.log('Fetching prices from:', `${API_URL}/prices/batch`);
      const res = await fetch(`${API_URL}/prices/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols })
      });
      const data = await res.json();
      console.log('Prices response:', data.success ? `Got ${Object.keys(data.prices || {}).length} prices` : 'Failed');
      if (data.success && data.prices) {
        setLivePrices(prev => {
          const merged = { ...prev };
          Object.entries(data.prices).forEach(([symbol, price]) => {
            if (price && price.bid) merged[symbol] = price;
          });
          return merged;
        });
        
        setInstruments(prev => prev.map(inst => {
          const price = data.prices[inst.symbol];
          if (price && price.bid) {
            return { ...inst, bid: price.bid, ask: price.ask || price.bid, spread: Math.abs((price.ask || price.bid) - price.bid) };
          }
          return inst;
        }));
      }
    } catch (e) {
      console.error('Error fetching prices:', e.message);
    }
  };

  const calculatePnl = (trade) => {
    const prices = livePrices[trade.symbol];
    if (!prices || !prices.bid) return 0;
    const currentPrice = trade.side === 'BUY' ? prices.bid : prices.ask;
    const contractSize = trade.contractSize || 100000;
    const pnl = trade.side === 'BUY'
      ? (currentPrice - trade.openPrice) * trade.quantity * contractSize
      : (trade.openPrice - currentPrice) * trade.quantity * contractSize;
    return pnl - (trade.commission || 0) - (trade.swap || 0);
  };

  // Use state for real-time values to trigger re-renders
  const [realTimeValues, setRealTimeValues] = useState({
    totalFloatingPnl: 0,
    realTimeEquity: 0,
    realTimeFreeMargin: 0,
    totalUsedMargin: 0
  });

  // Update real-time values when prices or trades change
  useEffect(() => {
    const balance = accountSummary.balance || 0;
    const credit = accountSummary.credit || 0;
    
    // If no open trades, use values directly from account summary
    if (openTrades.length === 0) {
      setRealTimeValues({
        totalFloatingPnl: 0,
        realTimeEquity: balance + credit,
        realTimeFreeMargin: balance + credit,
        totalUsedMargin: 0
      });
      return;
    }

    // Calculate real-time PnL from live prices
    let totalPnl = 0;
    let totalMargin = 0;

    openTrades.forEach(trade => {
      totalPnl += calculatePnl(trade);
      totalMargin += trade.marginUsed || 0;
    });

    const equity = balance + credit + totalPnl;
    const freeMargin = equity - totalMargin;

    setRealTimeValues({
      totalFloatingPnl: Math.round(totalPnl * 100) / 100,
      realTimeEquity: Math.round(equity * 100) / 100,
      realTimeFreeMargin: Math.round(freeMargin * 100) / 100,
      totalUsedMargin: Math.round(totalMargin * 100) / 100
    });
  }, [livePrices, openTrades, accountSummary]);

  const { totalFloatingPnl, realTimeEquity, realTimeFreeMargin, totalUsedMargin } = realTimeValues;

  const logout = async () => {
    await SecureStore.deleteItemAsync('user');
    await SecureStore.deleteItemAsync('token');
    navigation.replace('Login');
  };

  return (
    <TradingContext.Provider value={{
      user, accounts, selectedAccount, setSelectedAccount,
      openTrades, pendingOrders, tradeHistory, instruments, livePrices, adminSpreads,
      loading, accountSummary, totalFloatingPnl, realTimeEquity, realTimeFreeMargin,
      fetchOpenTrades, fetchPendingOrders, fetchTradeHistory, fetchAccountSummary,
      calculatePnl, logout, setInstruments,
      marketWatchNews, loadingNews, fetchMarketWatchNews
    }}>
      {children}
    </TradingContext.Provider>
  );
};

// HOME TAB
const HomeTab = ({ navigation }) => {
  const ctx = React.useContext(TradingContext);
  const parentNav = navigation.getParent();
  const [refreshing, setRefreshing] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [ctx.user]);

  const fetchUnreadCount = async () => {
    if (!ctx.user?._id) return;
    try {
      const res = await fetch(`${API_URL}/notifications/user/${ctx.user._id}/unread-count`);
      const data = await res.json();
      setUnreadNotifications(data.count || 0);
    } catch (e) {
      // Silently fail - not critical
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await ctx.fetchAccountSummary();
    await ctx.fetchOpenTrades();
    await fetchUnreadCount();
    setRefreshing(false);
  };

  if (ctx.loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#d4af37" />
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#d4af37" />}
    >
      {/* Header */}
      <View style={styles.homeHeader}>
        <View>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.userName}>{ctx.user?.firstName || 'Trader'}</Text>
        </View>
        <TouchableOpacity 
          style={styles.notificationBtn}
          onPress={() => parentNav?.navigate('Notifications')}
        >
          <Ionicons name="notifications-outline" size={24} color="#fff" />
          {unreadNotifications > 0 && (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>{unreadNotifications > 9 ? '9+' : unreadNotifications}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Account Card - Real-time responsive */}
      {ctx.selectedAccount && (
        <View style={styles.accountCard}>
          <TouchableOpacity style={styles.accountCardHeader}>
            <View style={styles.accountIconContainer}>
              <Ionicons name="person-outline" size={20} color="#d4af37" />
            </View>
            <View style={styles.accountInfo}>
              <Text style={styles.accountId}>{ctx.selectedAccount.accountId}</Text>
              <Text style={styles.accountType}>{ctx.selectedAccount.accountType || 'Standard'} • {ctx.selectedAccount.leverage || '1:100'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>
          
          {/* Real-time Balance & Equity Row */}
          <View style={styles.balanceRow}>
            <View>
              <Text style={styles.balanceLabel}>Balance</Text>
              <Text style={styles.balanceValue}>${(ctx.accountSummary?.balance || ctx.selectedAccount?.balance || 0).toFixed(2)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.balanceLabel}>Equity</Text>
              <Text style={[styles.equityValue, { color: ctx.totalFloatingPnl >= 0 ? '#d4af37' : '#d4af37' }]}>
                ${ctx.realTimeEquity?.toFixed(2) || '0.00'}
              </Text>
            </View>
          </View>

          {/* Real-time P&L Row */}
          <View style={styles.pnlRow}>
            <View>
              <Text style={styles.balanceLabel}>Floating P&L</Text>
              <Text style={[styles.pnlValue, { color: ctx.totalFloatingPnl >= 0 ? '#d4af37' : '#d4af37' }]}>
                {ctx.totalFloatingPnl >= 0 ? '+' : ''}${ctx.totalFloatingPnl?.toFixed(2) || '0.00'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.balanceLabel}>Free Margin</Text>
              <Text style={[styles.freeMarginValue, { color: ctx.realTimeFreeMargin >= 0 ? '#d4af37' : '#d4af37' }]}>
                ${ctx.realTimeFreeMargin?.toFixed(2) || '0.00'}
              </Text>
            </View>
          </View>

          {/* Deposit/Withdraw Buttons inside card */}
          <View style={styles.cardActionButtons}>
            <TouchableOpacity 
              style={styles.depositBtn}
              onPress={() => parentNav?.navigate('Accounts', { action: 'deposit', accountId: ctx.selectedAccount?._id })}
            >
              <Ionicons name="arrow-down-circle-outline" size={16} color="#000" />
              <Text style={styles.depositBtnText}>Deposit</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.withdrawBtn}
              onPress={() => parentNav?.navigate('Accounts', { action: 'withdraw', accountId: ctx.selectedAccount?._id })}
            >
              <Ionicons name="arrow-up-circle-outline" size={16} color="#fff" />
              <Text style={styles.withdrawBtnText}>Withdraw</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Quick Actions - Only 4 buttons */}
      <View style={styles.quickActionsRow}>
        <TouchableOpacity style={styles.quickActionCard} onPress={() => parentNav?.navigate('Accounts')}>
          <View style={[styles.quickActionIconBg, { backgroundColor: '#d4af3720' }]}>
            <Ionicons name="wallet-outline" size={22} color="#d4af37" />
          </View>
          <Text style={styles.quickActionLabel}>Accounts</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickActionCard} onPress={() => parentNav?.navigate('Wallet')}>
          <View style={[styles.quickActionIconBg, { backgroundColor: '#d4af3720' }]}>
            <Ionicons name="card-outline" size={22} color="#d4af37" />
          </View>
          <Text style={styles.quickActionLabel}>Wallet</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickActionCard} onPress={() => parentNav?.navigate('CopyTrade')}>
          <View style={[styles.quickActionIconBg, { backgroundColor: '#d4af3720' }]}>
            <Ionicons name="copy-outline" size={22} color="#d4af37" />
          </View>
          <Text style={styles.quickActionLabel}>Copy Trade</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickActionCard} onPress={() => parentNav?.navigate('IB')}>
          <View style={[styles.quickActionIconBg, { backgroundColor: '#d4af3720' }]}>
            <Ionicons name="people-outline" size={22} color="#d4af37" />
          </View>
          <Text style={styles.quickActionLabel}>IB</Text>
        </TouchableOpacity>
      </View>

      {/* MarketWatch Real-Time News */}
      <View style={styles.marketWatchSection}>
        <View style={styles.marketWatchHeader}>
          <View style={styles.marketWatchTitleRow}>
            <Ionicons name="newspaper-outline" size={20} color="#d4af37" />
            <Text style={styles.marketWatchTitle}>MarketWatch News</Text>
          </View>
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>
        
        {ctx.loadingNews ? (
          <View style={styles.newsLoadingContainer}>
            <ActivityIndicator size="small" color="#d4af37" />
            <Text style={styles.newsLoadingText}>Loading news...</Text>
          </View>
        ) : (
          <View style={styles.newsListContainer}>
            {ctx.marketWatchNews?.slice(0, 20).map((item, index) => (
              <TouchableOpacity 
                key={item.id || index} 
                style={styles.newsCard}
                onPress={() => item.url && Linking.openURL(item.url)}
                activeOpacity={0.7}
              >
                {item.image && (
                  <Image 
                    source={{ uri: item.image }} 
                    style={styles.newsCardImage}
                    resizeMode="cover"
                  />
                )}
                <View style={styles.newsCardContent}>
                  <View style={styles.newsCardHeader}>
                    <View style={styles.newsCategoryBadge}>
                      <Text style={styles.newsCategoryText}>{item.category || 'Markets'}</Text>
                    </View>
                    <Text style={styles.newsTimeText}>{item.time}</Text>
                  </View>
                  <Text style={styles.newsCardTitle} numberOfLines={3}>{item.title}</Text>
                  {item.summary ? (
                    <Text style={styles.newsCardSummary} numberOfLines={2}>{item.summary}</Text>
                  ) : null}
                  <View style={styles.newsCardFooter}>
                    <View style={styles.newsSourceRow}>
                      <Ionicons name="globe-outline" size={12} color="#888" />
                      <Text style={styles.newsSourceText}>{item.source || 'MarketWatch'}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#666" />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
};

// QUOTES TAB - Full Order Panel with all order types
const QuotesTab = ({ navigation }) => {
  const ctx = React.useContext(TradingContext);
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('watchlist');
  const [expandedSegment, setExpandedSegment] = useState(null);
  const [selectedInstrument, setSelectedInstrument] = useState(null);
  const [showOrderPanel, setShowOrderPanel] = useState(false);
  const [orderSide, setOrderSide] = useState('BUY');
  const [orderType, setOrderType] = useState('MARKET');
  const [pendingType, setPendingType] = useState('LIMIT');
  const [volume, setVolume] = useState(0.01);
  const [pendingPrice, setPendingPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [leverage, setLeverage] = useState('1:100');
  const leverageOptions = ['1:50', '1:100', '1:200', '1:500'];
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  
  const segments = ['Forex', 'Metals', 'Crypto'];

  const openTradePanel = (instrument) => {
    setSelectedInstrument(instrument);
    setShowOrderPanel(true);
  };

  // Helper to get segment/category from symbol
  const getSymbolCategory = (symbol) => {
    if (['XAUUSD', 'XAGUSD'].includes(symbol)) return 'Metals';
    if (['BTCUSD', 'ETHUSD', 'BNBUSD', 'SOLUSD', 'XRPUSD', 'ADAUSD', 'DOGEUSD', 'DOTUSD', 'MATICUSD', 'LTCUSD', 'AVAXUSD', 'LINKUSD'].includes(symbol)) return 'Crypto';
    return 'Forex';
  };

  const executeTrade = async () => {
    if (!selectedInstrument || !ctx.selectedAccount || !ctx.user) return;
    if (isExecuting) return;
    
    setIsExecuting(true);
    try {
      const prices = ctx.livePrices[selectedInstrument.symbol];
      const bid = prices?.bid;
      const ask = prices?.ask;
      
      // Validate prices
      if (!bid || !ask || bid <= 0 || ask <= 0) {
        toast?.showToast('Market is closed or no price data available', 'error');
        setIsExecuting(false);
        return;
      }

      // Validate pending price for pending orders
      if (orderType === 'PENDING' && !pendingPrice) {
        toast?.showToast('Please enter a pending price', 'warning');
        setIsExecuting(false);
        return;
      }

      const segment = getSymbolCategory(selectedInstrument.symbol);
      
      // For pending orders, use entry price for bid/ask (matching web version)
      const finalBid = (orderType === 'PENDING' && pendingPrice) ? parseFloat(pendingPrice) : parseFloat(bid);
      const finalAsk = (orderType === 'PENDING' && pendingPrice) ? parseFloat(pendingPrice) : parseFloat(ask);
      
      // Build order data matching web format
      // Pending order types: BUY_LIMIT, BUY_STOP, SELL_LIMIT, SELL_STOP
      const orderData = {
        userId: ctx.user._id,
        tradingAccountId: ctx.selectedAccount._id,
        symbol: selectedInstrument.symbol,
        segment: segment,
        side: orderSide,
        orderType: orderType === 'MARKET' ? 'MARKET' : `${orderSide}_${pendingType}`,
        quantity: parseFloat(volume) || 0.01,
        bid: finalBid,
        ask: finalAsk,
        leverage: leverage,
      };
      
      // Add SL/TP if set
      if (stopLoss) orderData.sl = parseFloat(stopLoss);
      if (takeProfit) orderData.tp = parseFloat(takeProfit);

      console.log('Trade order data:', JSON.stringify(orderData, null, 2));
      
      const res = await fetch(`${API_URL}/trade/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      });
      const data = await res.json();
      console.log('Trade response:', res.status, JSON.stringify(data, null, 2));
      
      if (data.success) {
        toast?.showToast(`${orderSide} ${orderType === 'MARKET' ? 'Market' : pendingType} order placed!`, 'success');
        setShowOrderPanel(false);
        setPendingPrice('');
        setStopLoss('');
        setTakeProfit('');
        ctx.fetchOpenTrades();
        ctx.fetchPendingOrders();
        ctx.fetchAccountSummary();
      } else {
        console.error('Trade failed:', data.message);
        toast?.showToast(data.message || 'Failed to place order', 'error');
      }
    } catch (e) {
      console.error('Trade execution error:', e);
      toast?.showToast('Network error: ' + e.message, 'error');
    } finally {
      setIsExecuting(false);
    }
  };

  const toggleStar = (symbol) => {
    ctx.setInstruments(prev => prev.map(i => 
      i.symbol === symbol ? { ...i, starred: !i.starred } : i
    ));
  };

  const watchlistInstruments = ctx.instruments.filter(inst => {
    const matchesSearch = inst.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inst.name.toLowerCase().includes(searchTerm.toLowerCase());
    return inst.starred && matchesSearch;
  });

  const getSegmentInstruments = (segment) => {
    return ctx.instruments.filter(inst => {
      const matchesSearch = inst.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inst.name.toLowerCase().includes(searchTerm.toLowerCase());
      return inst.category === segment && matchesSearch;
    });
  };

  const renderInstrumentItem = (item) => {
    const prices = ctx.livePrices[item.symbol] || {};
    return (
      <TouchableOpacity 
        key={item.symbol}
        style={styles.instrumentItem}
        onPress={() => openTradePanel(item)}
        activeOpacity={0.7}
      >
        <TouchableOpacity 
          style={styles.starBtn}
          onPress={() => toggleStar(item.symbol)}
        >
          <Ionicons 
            name={item.starred ? "star" : "star-outline"} 
            size={18} 
            color={item.starred ? "#d4af37" : "#666"} 
          />
        </TouchableOpacity>
        <View style={styles.instrumentInfo}>
          <Text style={styles.instrumentSymbol}>{item.symbol}</Text>
          <Text style={styles.instrumentName}>{item.name}</Text>
        </View>
        <View style={styles.instrumentPriceCol}>
          <Text style={styles.bidPrice}>{prices.bid?.toFixed(prices.bid > 100 ? 2 : 5) || '...'}</Text>
          <Text style={styles.priceLabel}>Bid</Text>
        </View>
        <View style={styles.spreadBadgeCol}>
          <Text style={styles.spreadBadgeText}>
            {ctx.adminSpreads[item.symbol]?.spread > 0 
              ? (item.symbol.includes('JPY') 
                  ? (ctx.adminSpreads[item.symbol].spread * 100).toFixed(1)
                  : prices.bid > 100 
                    ? ctx.adminSpreads[item.symbol].spread.toFixed(2)
                    : (ctx.adminSpreads[item.symbol].spread * 10000).toFixed(1))
              : (prices.bid && prices.ask ? ((prices.ask - prices.bid) * (prices.bid > 100 ? 1 : 10000)).toFixed(1) : '-')}
          </Text>
        </View>
        <View style={styles.instrumentPriceCol}>
          <Text style={styles.askPrice}>{prices.ask?.toFixed(prices.ask > 100 ? 2 : 5) || '...'}</Text>
          <Text style={styles.priceLabel}>Ask</Text>
        </View>
        <TouchableOpacity 
          style={styles.chartIconBtn}
          onPress={() => navigation.navigate('Chart', { symbol: item.symbol })}
        >
          <Ionicons name="trending-up" size={18} color="#d4af37" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.marketSearchContainer}>
        <Ionicons name="search" size={20} color="#666" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search instruments..."
          placeholderTextColor="#666"
          value={searchTerm}
          onChangeText={setSearchTerm}
        />
        {searchTerm.length > 0 && (
          <TouchableOpacity onPress={() => setSearchTerm('')}>
            <Ionicons name="close-circle" size={20} color="#666" />
          </TouchableOpacity>
        )}
      </View>

      {/* Account Selector - Below search bar */}
      <TouchableOpacity style={styles.accountSelector} onPress={() => setShowAccountPicker(true)}>
        <View style={styles.accountSelectorLeft}>
          <View style={styles.accountIcon}>
            <Ionicons name="wallet" size={16} color="#d4af37" />
          </View>
          <View>
            <Text style={styles.accountSelectorLabel}>Account</Text>
            <Text style={styles.accountSelectorValue}>
              {ctx.selectedAccount?.accountNumber || 'Select'} • ${(ctx.accountSummary?.balance || 0).toFixed(2)}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-down" size={18} color="#666" />
      </TouchableOpacity>

      {/* Watchlist / Markets Toggle */}
      <View style={styles.marketTabsContainer}>
        <TouchableOpacity
          style={[styles.marketTabBtn, activeTab === 'watchlist' && styles.marketTabBtnActive]}
          onPress={() => setActiveTab('watchlist')}
        >
          <Text style={[styles.marketTabText, activeTab === 'watchlist' && styles.marketTabTextActive]}>
            Watchlist
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.marketTabBtn, activeTab === 'markets' && styles.marketTabBtnActive]}
          onPress={() => setActiveTab('markets')}
        >
          <Text style={[styles.marketTabText, activeTab === 'markets' && styles.marketTabTextActive]}>
            Markets
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.marketContent} showsVerticalScrollIndicator={false}>
        {activeTab === 'watchlist' ? (
          <>
            {watchlistInstruments.length === 0 ? (
              <View style={styles.emptyWatchlist}>
                <Ionicons name="star-outline" size={48} color="#000000" />
                <Text style={styles.emptyWatchlistTitle}>No instruments in watchlist</Text>
                <Text style={styles.emptyWatchlistText}>
                  Tap the star icon on any instrument to add it to your watchlist
                </Text>
              </View>
            ) : (
              watchlistInstruments.map(item => renderInstrumentItem(item))
            )}
          </>
        ) : (
          <>
            {segments.map(segment => {
              const segmentInstruments = getSegmentInstruments(segment);
              const isExpanded = expandedSegment === segment;
              return (
                <View key={segment} style={styles.segmentContainer}>
                  <TouchableOpacity 
                    style={styles.segmentHeader}
                    onPress={() => setExpandedSegment(isExpanded ? null : segment)}
                  >
                    <View style={styles.segmentHeaderLeft}>
                      <Ionicons 
                        name={segment === 'Forex' ? 'swap-horizontal' : segment === 'Metals' ? 'diamond' : 'logo-bitcoin'} 
                        size={20} 
                        color="#d4af37" 
                      />
                      <Text style={styles.segmentTitle}>{segment}</Text>
                      <View style={styles.segmentCount}>
                        <Text style={styles.segmentCountText}>{segmentInstruments.length}</Text>
                      </View>
                    </View>
                    <Ionicons 
                      name={isExpanded ? "chevron-up" : "chevron-down"} 
                      size={20} 
                      color="#666" 
                    />
                  </TouchableOpacity>
                  {isExpanded && (
                    <View style={styles.segmentInstruments}>
                      {segmentInstruments.map(item => renderInstrumentItem(item))}
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* Order Panel Slide Up - Full Order Types */}
      <Modal visible={showOrderPanel} animationType="slide" transparent>
        <View style={styles.orderModalOverlay}>
          <TouchableOpacity 
            style={styles.orderPanelBackdrop} 
            activeOpacity={1} 
            onPress={() => setShowOrderPanel(false)}
          />
          <ScrollView style={styles.orderPanelScroll} bounces={false}>
            <View style={styles.orderPanelContainer}>
              {/* Handle Bar */}
              <View style={styles.orderPanelHandle} />
              
              {/* Header */}
              <View style={styles.orderPanelHeaderRow}>
                <View>
                  <Text style={styles.orderPanelSymbol}>{selectedInstrument?.symbol}</Text>
                  <Text style={styles.orderPanelName}>{selectedInstrument?.name}</Text>
                </View>
                <TouchableOpacity onPress={() => setShowOrderPanel(false)} style={styles.orderCloseBtn}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              {/* Leverage Selector */}
              <View style={styles.leverageRow}>
                <Text style={styles.leverageLabel}>Leverage</Text>
                <View style={styles.leverageSelector}>
                  {leverageOptions.map(lev => (
                    <TouchableOpacity 
                      key={lev}
                      style={[styles.leverageOption, leverage === lev && styles.leverageOptionActive]}
                      onPress={() => setLeverage(lev)}
                    >
                      <Text style={[styles.leverageOptionText, leverage === lev && styles.leverageOptionTextActive]}>{lev}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* One-Click Buy/Sell - Slim Buttons */}
              <View style={styles.quickTradeRow}>
                <TouchableOpacity 
                  style={[styles.quickSellBtn, isExecuting && styles.btnDisabled]}
                  onPress={() => { setOrderSide('SELL'); setOrderType('MARKET'); executeTrade(); }}
                  disabled={isExecuting}
                >
                  <Text style={styles.quickBtnLabel}>SELL</Text>
                  <Text style={styles.quickBtnPrice}>
                    {ctx.livePrices[selectedInstrument?.symbol]?.bid?.toFixed(selectedInstrument?.category === 'Forex' ? 5 : 2) || '-'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.quickBuyBtn, isExecuting && styles.btnDisabled]}
                  onPress={() => { setOrderSide('BUY'); setOrderType('MARKET'); executeTrade(); }}
                  disabled={isExecuting}
                >
                  <Text style={styles.quickBtnLabel}>BUY</Text>
                  <Text style={styles.quickBtnPrice}>
                    {ctx.livePrices[selectedInstrument?.symbol]?.ask?.toFixed(selectedInstrument?.category === 'Forex' ? 5 : 2) || '-'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Spread Info */}
              <View style={styles.spreadInfoRow}>
                <Text style={styles.spreadInfoText}>
                  Spread: {ctx.livePrices[selectedInstrument?.symbol]?.bid ? 
                    ((ctx.livePrices[selectedInstrument?.symbol]?.ask - ctx.livePrices[selectedInstrument?.symbol]?.bid) * 
                    (selectedInstrument?.category === 'Forex' ? 10000 : 1)).toFixed(1) : '-'} pips
                </Text>
              </View>

              {/* Order Type Toggle */}
              <View style={styles.orderTypeRow}>
                <TouchableOpacity 
                  style={[styles.orderTypeBtn, orderType === 'MARKET' && styles.orderTypeBtnActive]}
                  onPress={() => setOrderType('MARKET')}
                >
                  <Text style={[styles.orderTypeBtnText, orderType === 'MARKET' && styles.orderTypeBtnTextActive]}>Market</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.orderTypeBtn, orderType === 'PENDING' && styles.orderTypeBtnActive]}
                  onPress={() => setOrderType('PENDING')}
                >
                  <Text style={[styles.orderTypeBtnText, orderType === 'PENDING' && styles.orderTypeBtnTextActive]}>Pending</Text>
                </TouchableOpacity>
              </View>

              {/* Pending Order Types */}
              {orderType === 'PENDING' && (
                <View style={styles.pendingTypeRow}>
                  {['LIMIT', 'STOP'].map(type => (
                    <TouchableOpacity 
                      key={type}
                      style={[styles.pendingTypeBtn, pendingType === type && styles.pendingTypeBtnActive]}
                      onPress={() => setPendingType(type)}
                    >
                      <Text style={[styles.pendingTypeText, pendingType === type && styles.pendingTypeTextActive]}>
                        {type === 'LIMIT' ? 'Limit' : 'Stop'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Pending Price Input */}
              {orderType === 'PENDING' && (
                <View style={styles.inputSection}>
                  <Text style={styles.inputLabel}>
                    {pendingType === 'LIMIT' ? 'Limit Price' : 'Stop Price'}
                  </Text>
                  <TextInput
                    style={styles.priceInput}
                    value={pendingPrice}
                    onChangeText={setPendingPrice}
                    placeholder={ctx.livePrices[selectedInstrument?.symbol]?.bid?.toFixed(2) || '0.00'}
                    placeholderTextColor="#666"
                    keyboardType="decimal-pad"
                  />
                </View>
              )}

              {/* Volume Control */}
              <View style={styles.inputSection}>
                <Text style={styles.inputLabel}>Volume (Lots)</Text>
                <View style={styles.volumeControlRow}>
                  <TouchableOpacity 
                    style={styles.volumeControlBtn} 
                    onPress={() => setVolume(Math.max(0.01, volume - 0.01))}
                  >
                    <Ionicons name="remove" size={18} color="#fff" />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.volumeInputField}
                    value={volume.toFixed(2)}
                    onChangeText={(t) => setVolume(parseFloat(t) || 0.01)}
                    keyboardType="decimal-pad"
                  />
                  <TouchableOpacity 
                    style={styles.volumeControlBtn} 
                    onPress={() => setVolume(volume + 0.01)}
                  >
                    <Ionicons name="add" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Stop Loss & Take Profit */}
              <View style={styles.slTpRow}>
                <View style={styles.slTpCol}>
                  <Text style={styles.inputLabel}>Stop Loss</Text>
                  <TextInput
                    style={styles.slTpInputOrder}
                    value={stopLoss}
                    onChangeText={setStopLoss}
                    placeholder="Optional"
                    placeholderTextColor="#666"
                    keyboardType="decimal-pad"
                    selectionColor="#d4af37"
                  />
                </View>
                <View style={styles.slTpCol}>
                  <Text style={styles.inputLabel}>Take Profit</Text>
                  <TextInput
                    style={styles.slTpInputOrder}
                    value={takeProfit}
                    onChangeText={setTakeProfit}
                    placeholder="Optional"
                    placeholderTextColor="#666"
                    keyboardType="decimal-pad"
                    selectionColor="#d4af37"
                  />
                </View>
              </View>

              {/* Final Buy/Sell Buttons - Slim */}
              <View style={styles.finalTradeRow}>
                <TouchableOpacity 
                  style={[styles.finalSellBtn, isExecuting && styles.btnDisabled]}
                  onPress={() => { setOrderSide('SELL'); executeTrade(); }}
                  disabled={isExecuting}
                >
                  <Text style={styles.finalBtnText}>
                    {isExecuting ? 'EXECUTING...' : orderType === 'PENDING' ? `SELL ${pendingType}` : 'SELL'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.finalBuyBtn, isExecuting && styles.btnDisabled]}
                  onPress={() => { setOrderSide('BUY'); executeTrade(); }}
                  disabled={isExecuting}
                >
                  <Text style={styles.finalBtnText}>
                    {isExecuting ? 'EXECUTING...' : orderType === 'PENDING' ? `BUY ${pendingType}` : 'BUY'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Account Picker Modal */}
      <Modal visible={showAccountPicker} animationType="slide" transparent onRequestClose={() => setShowAccountPicker(false)}>
        <View style={styles.accountPickerOverlay}>
          <TouchableOpacity style={styles.accountPickerBackdrop} onPress={() => setShowAccountPicker(false)} />
          <View style={styles.accountPickerContent}>
            <View style={styles.accountPickerHeader}>
              <Text style={styles.accountPickerTitle}>Select Account</Text>
              <TouchableOpacity onPress={() => setShowAccountPicker(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.accountPickerList}>
              {ctx.accounts.map(account => (
                <TouchableOpacity 
                  key={account._id}
                  style={[styles.accountPickerItem, ctx.selectedAccount?._id === account._id && styles.accountPickerItemActive]}
                  onPress={() => { ctx.setSelectedAccount(account); setShowAccountPicker(false); }}
                >
                  <View style={styles.accountPickerItemLeft}>
                    <View style={[styles.accountPickerIcon, ctx.selectedAccount?._id === account._id && styles.accountPickerIconActive]}>
                      <Ionicons name="wallet" size={20} color={ctx.selectedAccount?._id === account._id ? '#d4af37' : '#666'} />
                    </View>
                    <View>
                      <Text style={styles.accountPickerNumber}>{account.accountNumber}</Text>
                      <Text style={styles.accountPickerType}>{account.accountType || 'Standard'} • {account.leverage}</Text>
                    </View>
                  </View>
                  <View style={styles.accountPickerItemRight}>
                    <Text style={styles.accountPickerBalance}>${(account.balance || 0).toFixed(2)}</Text>
                    {ctx.selectedAccount?._id === account._id && (
                      <Ionicons name="checkmark-circle" size={20} color="#d4af37" />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// TRADE TAB - Account summary + Positions/Pending/History (like mobile web view)
const TradeTab = () => {
  const ctx = React.useContext(TradingContext);
  const toast = useToast();
  const [tradeTab, setTradeTab] = useState('positions');
  const [showSlTpModal, setShowSlTpModal] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [closingTradeId, setClosingTradeId] = useState(null);
  const [showCloseAllModal, setShowCloseAllModal] = useState(false);
  const [closeAllType, setCloseAllType] = useState('all');
  const [isClosingAll, setIsClosingAll] = useState(false);
  const [showKillSwitch, setShowKillSwitch] = useState(false);
  const [isKillSwitchActive, setIsKillSwitchActive] = useState(false);
  const [showTradeDetails, setShowTradeDetails] = useState(false);
  const [detailTrade, setDetailTrade] = useState(null);
  const [showHistoryDetails, setShowHistoryDetails] = useState(false);
  const [historyDetailTrade, setHistoryDetailTrade] = useState(null);

  const totalUsedMargin = ctx.openTrades.reduce((sum, trade) => sum + (trade.marginUsed || 0), 0);

  // Calculate PnL for a trade
  const calculatePnl = (trade) => {
    const prices = ctx.livePrices[trade.symbol];
    if (!prices?.bid || !prices?.ask) return 0;
    const currentPrice = trade.side === 'BUY' ? prices.bid : prices.ask;
    return trade.side === 'BUY'
      ? (currentPrice - trade.openPrice) * trade.quantity * trade.contractSize
      : (trade.openPrice - currentPrice) * trade.quantity * trade.contractSize;
  };

  // Close single trade
  const closeTrade = async (trade) => {
    if (closingTradeId) return;
    const prices = ctx.livePrices[trade.symbol];
    if (!prices?.bid || !prices?.ask) {
      toast?.showToast('No price data available', 'error');
      return;
    }
    
    setClosingTradeId(trade._id);
    try {
      const res = await fetch(`${API_URL}/trade/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tradeId: trade._id,
          bid: prices.bid,
          ask: prices.ask
        })
      });
      const data = await res.json();
      if (data.success) {
        const pnl = data.trade?.realizedPnl || data.realizedPnl || 0;
        toast?.showToast(`Closed! P/L: $${pnl.toFixed(2)}`, pnl >= 0 ? 'success' : 'warning');
        ctx.fetchOpenTrades();
        ctx.fetchTradeHistory();
        ctx.fetchAccountSummary();
      } else {
        toast?.showToast(data.message || 'Failed to close', 'error');
      }
    } catch (e) {
      console.error('Close trade error:', e);
      toast?.showToast('Failed to close trade', 'error');
    } finally {
      setClosingTradeId(null);
    }
  };

  // Close all trades (all, profit, or loss)
  const closeAllTrades = async (type) => {
    setCloseAllType(type);
    setShowCloseAllModal(true);
  };

  const confirmCloseAll = async () => {
    setIsClosingAll(true);
    const tradesToClose = ctx.openTrades.filter(trade => {
      const pnl = calculatePnl(trade);
      if (closeAllType === 'profit') return pnl > 0;
      if (closeAllType === 'loss') return pnl < 0;
      return true;
    });

    let closedCount = 0;
    for (const trade of tradesToClose) {
      const prices = ctx.livePrices[trade.symbol];
      if (!prices?.bid || !prices?.ask) continue;
      
      try {
        const res = await fetch(`${API_URL}/trade/close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tradeId: trade._id,
            bid: prices.bid,
            ask: prices.ask
          })
        });
        const data = await res.json();
        if (data.success) closedCount++;
      } catch (e) {
        console.error('Close trade error:', e);
      }
    }

    setShowCloseAllModal(false);
    setIsClosingAll(false);
    toast?.showToast(`Closed ${closedCount} trade(s)`, 'success');
    ctx.fetchOpenTrades();
    ctx.fetchTradeHistory();
    ctx.fetchAccountSummary();
  };

  // Kill Switch - Close all trades and cancel all pending orders
  const executeKillSwitch = async () => {
    setIsKillSwitchActive(true);
    let closedTrades = 0;
    let cancelledOrders = 0;

    // Close all open trades
    for (const trade of ctx.openTrades) {
      const prices = ctx.livePrices[trade.symbol];
      if (!prices?.bid || !prices?.ask) continue;
      try {
        const res = await fetch(`${API_URL}/trade/close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tradeId: trade._id, bid: prices.bid, ask: prices.ask })
        });
        const data = await res.json();
        if (data.success) closedTrades++;
      } catch (e) {
        console.error('Kill switch close error:', e);
      }
    }

    // Cancel all pending orders
    for (const order of ctx.pendingOrders) {
      try {
        const res = await fetch(`${API_URL}/trade/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tradeId: order._id })
        });
        const data = await res.json();
        if (data.success) cancelledOrders++;
      } catch (e) {
        console.error('Kill switch cancel error:', e);
      }
    }

    setShowKillSwitch(false);
    setIsKillSwitchActive(false);
    toast?.showToast(`Kill Switch: Closed ${closedTrades} trades, cancelled ${cancelledOrders} orders`, 'warning');
    ctx.fetchOpenTrades();
    ctx.fetchPendingOrders();
    ctx.fetchTradeHistory();
    ctx.fetchAccountSummary();
  };

  const openSlTpModal = (trade) => {
    setSelectedTrade(trade);
    setStopLoss(trade.stopLoss ? trade.stopLoss.toString() : '');
    setTakeProfit(trade.takeProfit ? trade.takeProfit.toString() : '');
    setShowSlTpModal(true);
  };

  const updateSlTp = async () => {
    if (!selectedTrade) return;
    try {
      const slValue = stopLoss && stopLoss.trim() !== '' ? parseFloat(stopLoss) : null;
      const tpValue = takeProfit && takeProfit.trim() !== '' ? parseFloat(takeProfit) : null;
      
      console.log('Updating SL/TP:', { tradeId: selectedTrade._id, sl: slValue, tp: tpValue });
      
      const res = await fetch(`${API_URL}/trade/modify`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tradeId: selectedTrade._id,
          sl: slValue,
          tp: tpValue
        })
      });
      const data = await res.json();
      console.log('SL/TP update response:', data);
      
      if (data.success) {
        toast?.showToast('SL/TP updated successfully', 'success');
        setShowSlTpModal(false);
        setSelectedTrade(null);
        ctx.fetchOpenTrades();
      } else {
        toast?.showToast(data.message || 'Failed to update SL/TP', 'error');
      }
    } catch (e) {
      console.error('Update SL/TP error:', e);
      toast?.showToast('Network error', 'error');
    }
  };

  // Cancel pending order
  const [cancellingOrderId, setCancellingOrderId] = useState(null);
  const cancelPendingOrder = async (order) => {
    if (cancellingOrderId) return;
    setCancellingOrderId(order._id);
    try {
      const res = await fetch(`${API_URL}/trade/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradeId: order._id })
      });
      const data = await res.json();
      if (data.success) {
        toast?.showToast('Order cancelled', 'success');
        ctx.fetchPendingOrders();
      } else {
        toast?.showToast(data.message || 'Failed to cancel order', 'error');
      }
    } catch (e) {
      toast?.showToast('Network error', 'error');
    } finally {
      setCancellingOrderId(null);
    }
  };

  return (
    <View style={styles.container}>
      {/* Account Summary - Like mobile web view */}
      <View style={styles.accountSummaryList}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Balance</Text>
          <Text style={styles.summaryValue}>{(ctx.accountSummary.balance || 0).toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Equity</Text>
          <Text style={[styles.summaryValue, { color: ctx.totalFloatingPnl >= 0 ? '#fff' : '#d4af37' }]}>
            {ctx.realTimeEquity.toFixed(2)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Credit</Text>
          <Text style={styles.summaryValue}>{(ctx.accountSummary.credit || 0).toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Used Margin</Text>
          <Text style={styles.summaryValue}>{totalUsedMargin.toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Free Margin</Text>
          <Text style={[styles.summaryValue, { color: ctx.realTimeFreeMargin >= 0 ? '#d4af37' : '#d4af37' }]}>
            {ctx.realTimeFreeMargin.toFixed(2)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Floating PL</Text>
          <Text style={[styles.summaryValue, { color: ctx.totalFloatingPnl >= 0 ? '#d4af37' : '#d4af37' }]}>
            {ctx.totalFloatingPnl.toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Trade Tabs - Positions / Pending / History */}
      <View style={styles.tradeTabs}>
        {['positions', 'pending', 'history'].map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tradeTabBtn, tradeTab === tab && styles.tradeTabBtnActive]}
            onPress={() => setTradeTab(tab)}
          >
            <Text style={[styles.tradeTabText, tradeTab === tab && styles.tradeTabTextActive]}>
              {tab === 'positions' ? `Positions (${ctx.openTrades.length})` :
               tab === 'pending' ? `Pending (${ctx.pendingOrders.length})` : 'History'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Close All Buttons - Only show when positions tab is active and has trades */}
      {tradeTab === 'positions' && ctx.openTrades.length > 0 && (
        <View style={styles.closeAllRow}>
          <TouchableOpacity style={styles.closeAllBtn} onPress={() => closeAllTrades('all')}>
            <Text style={styles.closeAllText}>Close All ({ctx.openTrades.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeProfitBtn} onPress={() => closeAllTrades('profit')}>
            <Text style={styles.closeProfitText}>Close Profit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeLossBtn} onPress={() => closeAllTrades('loss')}>
            <Text style={styles.closeLossText}>Close Loss</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Content */}
      <ScrollView style={styles.tradesList}>
        {tradeTab === 'positions' && (
          ctx.openTrades.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="trending-up-outline" size={48} color="#000000" />
              <Text style={styles.emptyText}>No open positions</Text>
            </View>
          ) : (
            ctx.openTrades.map(trade => {
              const pnl = ctx.calculatePnl(trade);
              const prices = ctx.livePrices[trade.symbol];
              const currentPrice = trade.side === 'BUY' ? prices?.bid : prices?.ask;
              
              const renderRightActions = (progress, dragX) => {
                return (
                  <TouchableOpacity 
                    style={styles.swipeCloseBtn} 
                    onPress={() => closeTrade(trade)}
                  >
                    <Ionicons name="close-circle" size={24} color="#fff" />
                    <Text style={styles.swipeCloseText}>Close</Text>
                  </TouchableOpacity>
                );
              };
              
              return (
                <Swipeable 
                  key={trade._id} 
                  renderRightActions={renderRightActions}
                  rightThreshold={40}
                  overshootRight={false}
                >
                  <TouchableOpacity style={styles.positionItem} onPress={() => { setDetailTrade(trade); setShowTradeDetails(true); }}>
                    <View style={styles.positionRow}>
                      <View style={styles.positionInfo}>
                        <View style={styles.positionSymbolRow}>
                          <Text style={styles.positionSymbol}>{trade.symbol}</Text>
                          <View style={[styles.sideBadge, { backgroundColor: trade.side === 'BUY' ? '#d4af3720' : '#d4af3720' }]}>
                            <Text style={[styles.sideText, { color: trade.side === 'BUY' ? '#d4af37' : '#d4af37' }]}>{trade.side}</Text>
                          </View>
                        </View>
                        <Text style={styles.positionDetail}>{trade.quantity} lots @ {trade.openPrice?.toFixed(5)}</Text>
                        {(trade.stopLoss || trade.takeProfit) && (
                          <Text style={styles.slTpText}>
                            {trade.stopLoss ? `SL: ${trade.stopLoss}` : ''} {trade.takeProfit ? `TP: ${trade.takeProfit}` : ''}
                          </Text>
                        )}
                      </View>
                      <View style={styles.positionActions}>
                        <TouchableOpacity style={styles.editBtn} onPress={(e) => { e.stopPropagation(); openSlTpModal(trade); }}>
                          <Ionicons name="pencil" size={16} color="#d4af37" />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.positionPnlCol}>
                        <Text style={[styles.positionPnl, { color: pnl >= 0 ? '#d4af37' : '#d4af37' }]}>
                          ${pnl >= 0 ? '' : '-'}{Math.abs(pnl).toFixed(2)}
                        </Text>
                        <Text style={styles.currentPriceText}>{currentPrice?.toFixed(5) || '-'}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                </Swipeable>
              );
            })
          )
        )}

        {tradeTab === 'pending' && (
          ctx.pendingOrders.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="time-outline" size={48} color="#000000" />
              <Text style={styles.emptyText}>No pending orders</Text>
            </View>
          ) : (
            ctx.pendingOrders.map(order => (
              <View key={order._id} style={styles.positionItem}>
                <View style={styles.positionRow}>
                  <View style={styles.positionInfo}>
                    <View style={styles.positionSymbolRow}>
                      <Text style={styles.positionSymbol}>{order.symbol}</Text>
                      <View style={[styles.sideBadge, { backgroundColor: '#d4af3720' }]}>
                        <Text style={[styles.sideText, { color: '#d4af37' }]}>{order.orderType}</Text>
                      </View>
                    </View>
                    <Text style={styles.positionDetail}>{order.quantity} lots @ {order.pendingPrice?.toFixed(5)}</Text>
                    {(order.stopLoss || order.takeProfit) && (
                      <Text style={styles.slTpText}>
                        {order.stopLoss ? `SL: ${order.stopLoss}` : ''} {order.takeProfit ? `TP: ${order.takeProfit}` : ''}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity 
                    style={[styles.cancelOrderBtn, cancellingOrderId === order._id && styles.btnDisabled]} 
                    onPress={() => cancelPendingOrder(order)}
                    disabled={cancellingOrderId === order._id}
                  >
                    <Ionicons name="close-circle" size={20} color="#d4af37" />
                    <Text style={styles.cancelOrderText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )
        )}

        {tradeTab === 'history' && (
          ctx.tradeHistory.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={48} color="#000000" />
              <Text style={styles.emptyText}>No trade history</Text>
            </View>
          ) : (
            ctx.tradeHistory.map(trade => (
              <TouchableOpacity 
                key={trade._id} 
                style={styles.historyItem}
                onPress={() => { setHistoryDetailTrade(trade); setShowHistoryDetails(true); }}
              >
                <View style={styles.historyHeader}>
                  <View style={styles.historyLeft}>
                    <Text style={styles.historySymbol}>{trade.symbol}</Text>
                    <Text style={[styles.historySide, { color: trade.side === 'BUY' ? '#d4af37' : '#d4af37' }]}>{trade.side}</Text>
                    {trade.closedBy === 'ADMIN' && (
                      <View style={styles.adminBadge}>
                        <Text style={styles.adminBadgeText}>Admin Close</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.historyPnl, { color: (trade.realizedPnl || 0) >= 0 ? '#d4af37' : '#d4af37' }]}>
                    {(trade.realizedPnl || 0) >= 0 ? '+' : ''}${(trade.realizedPnl || 0).toFixed(2)}
                  </Text>
                </View>
                <View style={styles.historyDetails}>
                  <Text style={styles.historyDetail}>{trade.quantity} lots</Text>
                  <Text style={styles.historyDetail}>{new Date(trade.closedAt).toLocaleDateString()}</Text>
                </View>
              </TouchableOpacity>
            ))
          )
        )}
      </ScrollView>

      {/* SL/TP Modal */}
      <Modal visible={showSlTpModal} animationType="slide" transparent onRequestClose={() => setShowSlTpModal(false)}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.slTpModalOverlay}
        >
          <TouchableOpacity 
            style={styles.slTpModalBackdrop} 
            activeOpacity={1} 
            onPress={() => { Keyboard.dismiss(); setShowSlTpModal(false); }}
          />
          <View style={styles.slTpModalContent}>
            <View style={styles.slTpModalHandle} />
            <View style={styles.slTpModalHeader}>
              <Text style={styles.slTpModalTitle}>
                {selectedTrade?.symbol} - Set SL/TP
              </Text>
              <TouchableOpacity onPress={() => { setShowSlTpModal(false); Keyboard.dismiss(); }}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.slTpInputGroup}>
              <Text style={styles.slTpLabel}>Stop Loss</Text>
              <TextInput
                style={styles.slTpInput}
                value={stopLoss}
                onChangeText={setStopLoss}
                placeholder="Enter stop loss price"
                placeholderTextColor="#666"
                keyboardType="decimal-pad"
                returnKeyType="next"
                autoCorrect={false}
                autoCapitalize="none"
                selectionColor="#d4af37"
                editable={true}
              />
            </View>
            
            <View style={styles.slTpInputGroup}>
              <Text style={styles.slTpLabel}>Take Profit</Text>
              <TextInput
                style={styles.slTpInput}
                value={takeProfit}
                onChangeText={setTakeProfit}
                placeholder="Enter take profit price"
                placeholderTextColor="#666"
                keyboardType="decimal-pad"
                returnKeyType="done"
                autoCorrect={false}
                autoCapitalize="none"
                selectionColor="#d4af37"
                editable={true}
                onSubmitEditing={updateSlTp}
              />
            </View>

            <View style={styles.slTpCurrentInfo}>
              <Text style={styles.slTpCurrentText}>
                Open: {selectedTrade?.openPrice?.toFixed(5) || '-'}
              </Text>
              <Text style={styles.slTpCurrentText}>
                {selectedTrade?.side || '-'} | {selectedTrade?.quantity || 0} lots
              </Text>
            </View>
            
            <View style={styles.slTpButtonRow}>
              <TouchableOpacity 
                style={styles.slTpClearBtn} 
                onPress={() => { setStopLoss(''); setTakeProfit(''); }}
              >
                <Text style={styles.slTpClearBtnText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.slTpSaveBtn} onPress={updateSlTp}>
                <Text style={styles.slTpSaveBtnText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Trade Details Modal */}
      <Modal visible={showTradeDetails} animationType="slide" transparent onRequestClose={() => setShowTradeDetails(false)}>
        <View style={styles.slTpModalOverlay}>
          <TouchableOpacity style={styles.slTpModalBackdrop} activeOpacity={1} onPress={() => setShowTradeDetails(false)} />
          <View style={styles.tradeDetailsContent}>
            <View style={styles.slTpModalHandle} />
            <View style={styles.slTpModalHeader}>
              <Text style={styles.slTpModalTitle}>{detailTrade?.symbol} Trade Details</Text>
              <TouchableOpacity onPress={() => setShowTradeDetails(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            {detailTrade && (
              <ScrollView style={styles.tradeDetailsScroll}>
                {/* Trade ID & Status */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Trade Info</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Trade ID</Text>
                    <Text style={styles.detailValue}>{detailTrade.tradeId}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Status</Text>
                    <Text style={[styles.detailValue, { color: '#d4af37' }]}>{detailTrade.status}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Side</Text>
                    <Text style={[styles.detailValue, { color: detailTrade.side === 'BUY' ? '#d4af37' : '#d4af37' }]}>{detailTrade.side}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Order Type</Text>
                    <Text style={styles.detailValue}>{detailTrade.orderType}</Text>
                  </View>
                </View>

                {/* Position Details */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Position</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Volume</Text>
                    <Text style={styles.detailValue}>{detailTrade.quantity} lots</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Open Price</Text>
                    <Text style={styles.detailValue}>{detailTrade.openPrice?.toFixed(5)}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Current Price</Text>
                    <Text style={styles.detailValue}>
                      {(detailTrade.side === 'BUY' ? ctx.livePrices[detailTrade.symbol]?.bid : ctx.livePrices[detailTrade.symbol]?.ask)?.toFixed(5) || '-'}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Contract Size</Text>
                    <Text style={styles.detailValue}>{detailTrade.contractSize?.toLocaleString()}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Leverage</Text>
                    <Text style={styles.detailValue}>1:{detailTrade.leverage}</Text>
                  </View>
                </View>

                {/* SL/TP */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Stop Loss / Take Profit</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Stop Loss</Text>
                    <Text style={[styles.detailValue, { color: detailTrade.stopLoss ? '#d4af37' : '#666' }]}>
                      {detailTrade.stopLoss || 'Not Set'}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Take Profit</Text>
                    <Text style={[styles.detailValue, { color: detailTrade.takeProfit ? '#d4af37' : '#666' }]}>
                      {detailTrade.takeProfit || 'Not Set'}
                    </Text>
                  </View>
                </View>

                {/* Charges */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Charges</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Margin Used</Text>
                    <Text style={styles.detailValue}>${detailTrade.marginUsed?.toFixed(2)}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Spread</Text>
                    <Text style={styles.detailValue}>{detailTrade.spread || 0} pips</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Commission</Text>
                    <Text style={styles.detailValue}>${detailTrade.commission?.toFixed(2) || '0.00'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Swap</Text>
                    <Text style={styles.detailValue}>${detailTrade.swap?.toFixed(2) || '0.00'}</Text>
                  </View>
                </View>

                {/* P&L */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Profit & Loss</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Floating P&L</Text>
                    <Text style={[styles.detailValue, { color: ctx.calculatePnl(detailTrade) >= 0 ? '#d4af37' : '#d4af37', fontWeight: 'bold' }]}>
                      ${ctx.calculatePnl(detailTrade).toFixed(2)}
                    </Text>
                  </View>
                </View>

                {/* Time */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Time</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Opened At</Text>
                    <Text style={styles.detailValue}>{new Date(detailTrade.openedAt || detailTrade.createdAt).toLocaleString()}</Text>
                  </View>
                </View>

                {/* Action Buttons */}
                <View style={styles.detailActions}>
                  <TouchableOpacity 
                    style={styles.detailEditBtn} 
                    onPress={() => { setShowTradeDetails(false); openSlTpModal(detailTrade); }}
                  >
                    <Ionicons name="pencil" size={18} color="#d4af37" />
                    <Text style={styles.detailEditText}>Edit SL/TP</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.detailCloseBtn} 
                    onPress={() => { setShowTradeDetails(false); closeTrade(detailTrade); }}
                  >
                    <Ionicons name="close-circle" size={18} color="#fff" />
                    <Text style={styles.detailCloseText}>Close Trade</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Close All Confirmation Modal */}
      <Modal visible={showCloseAllModal} animationType="fade" transparent onRequestClose={() => setShowCloseAllModal(false)}>
        <View style={styles.confirmModalOverlay}>
          <View style={styles.confirmModalContent}>
            <View style={[styles.confirmModalIcon, { backgroundColor: closeAllType === 'profit' ? '#d4af3720' : closeAllType === 'loss' ? '#d4af3720' : '#d4af3720' }]}>
              <Ionicons name={closeAllType === 'profit' ? 'trending-up' : closeAllType === 'loss' ? 'trending-down' : 'close-circle'} size={32} color={closeAllType === 'profit' ? '#d4af37' : closeAllType === 'loss' ? '#d4af37' : '#d4af37'} />
            </View>
            <Text style={styles.confirmModalTitle}>
              {closeAllType === 'all' && 'Close All Trades?'}
              {closeAllType === 'profit' && 'Close Winning Trades?'}
              {closeAllType === 'loss' && 'Close Losing Trades?'}
            </Text>
            <Text style={styles.confirmModalMessage}>
              {closeAllType === 'all' && `This will close all ${ctx.openTrades.length} open trade(s)`}
              {closeAllType === 'profit' && 'This will close all trades currently in profit'}
              {closeAllType === 'loss' && 'This will close all trades currently in loss'}
            </Text>
            <View style={styles.confirmModalButtons}>
              <TouchableOpacity style={styles.confirmCancelBtn} onPress={() => setShowCloseAllModal(false)} disabled={isClosingAll}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.confirmCloseBtn, { backgroundColor: closeAllType === 'profit' ? '#d4af37' : closeAllType === 'loss' ? '#d4af37' : '#d4af37' }, isClosingAll && styles.btnDisabled]} 
                onPress={confirmCloseAll}
                disabled={isClosingAll}
              >
                <Text style={styles.confirmCloseText}>{isClosingAll ? 'Closing...' : 'Confirm'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* History Trade Details Modal */}
      <Modal visible={showHistoryDetails} animationType="slide" transparent onRequestClose={() => setShowHistoryDetails(false)}>
        <View style={styles.slTpModalOverlay}>
          <TouchableOpacity style={styles.slTpModalBackdrop} activeOpacity={1} onPress={() => setShowHistoryDetails(false)} />
          <View style={styles.tradeDetailsContent}>
            <View style={styles.slTpModalHandle} />
            <View style={styles.slTpModalHeader}>
              <Text style={styles.slTpModalTitle}>{historyDetailTrade?.symbol} - Closed Trade</Text>
              <TouchableOpacity onPress={() => setShowHistoryDetails(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            {historyDetailTrade && (
              <ScrollView style={styles.tradeDetailsScroll}>
                {/* Trade Info */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Trade Info</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Trade ID</Text>
                    <Text style={styles.detailValue}>{historyDetailTrade.tradeId}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Status</Text>
                    <Text style={[styles.detailValue, { color: '#888' }]}>{historyDetailTrade.status}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Side</Text>
                    <Text style={[styles.detailValue, { color: historyDetailTrade.side === 'BUY' ? '#d4af37' : '#d4af37' }]}>{historyDetailTrade.side}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Order Type</Text>
                    <Text style={styles.detailValue}>{historyDetailTrade.orderType}</Text>
                  </View>
                  {historyDetailTrade.closedBy === 'ADMIN' && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Closed By</Text>
                      <Text style={[styles.detailValue, { color: '#d4af37' }]}>Admin</Text>
                    </View>
                  )}
                </View>

                {/* Position Details */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Position</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Volume</Text>
                    <Text style={styles.detailValue}>{historyDetailTrade.quantity} lots</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Open Price</Text>
                    <Text style={styles.detailValue}>{historyDetailTrade.openPrice?.toFixed(5)}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Close Price</Text>
                    <Text style={styles.detailValue}>{historyDetailTrade.closePrice?.toFixed(5)}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Contract Size</Text>
                    <Text style={styles.detailValue}>{historyDetailTrade.contractSize?.toLocaleString()}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Leverage</Text>
                    <Text style={styles.detailValue}>1:{historyDetailTrade.leverage}</Text>
                  </View>
                </View>

                {/* SL/TP */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Stop Loss / Take Profit</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Stop Loss</Text>
                    <Text style={[styles.detailValue, { color: historyDetailTrade.stopLoss ? '#d4af37' : '#666' }]}>
                      {historyDetailTrade.stopLoss || 'Not Set'}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Take Profit</Text>
                    <Text style={[styles.detailValue, { color: historyDetailTrade.takeProfit ? '#d4af37' : '#666' }]}>
                      {historyDetailTrade.takeProfit || 'Not Set'}
                    </Text>
                  </View>
                </View>

                {/* Charges */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Charges</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Margin Used</Text>
                    <Text style={styles.detailValue}>${historyDetailTrade.marginUsed?.toFixed(2) || '0.00'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Spread</Text>
                    <Text style={styles.detailValue}>{historyDetailTrade.spread || 0} pips</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Commission</Text>
                    <Text style={styles.detailValue}>${historyDetailTrade.commission?.toFixed(2) || '0.00'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Swap</Text>
                    <Text style={styles.detailValue}>${historyDetailTrade.swap?.toFixed(2) || '0.00'}</Text>
                  </View>
                </View>

                {/* P&L */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Realized Profit & Loss</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Realized P&L</Text>
                    <Text style={[styles.detailValue, { color: (historyDetailTrade.realizedPnl || 0) >= 0 ? '#d4af37' : '#d4af37', fontWeight: 'bold', fontSize: 18 }]}>
                      {(historyDetailTrade.realizedPnl || 0) >= 0 ? '+' : ''}${(historyDetailTrade.realizedPnl || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>

                {/* Time */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Time</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Opened At</Text>
                    <Text style={styles.detailValue}>{new Date(historyDetailTrade.openedAt || historyDetailTrade.createdAt).toLocaleString()}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Closed At</Text>
                    <Text style={styles.detailValue}>{new Date(historyDetailTrade.closedAt).toLocaleString()}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Duration</Text>
                    <Text style={styles.detailValue}>
                      {(() => {
                        const openTime = new Date(historyDetailTrade.openedAt || historyDetailTrade.createdAt);
                        const closeTime = new Date(historyDetailTrade.closedAt);
                        const diffMs = closeTime - openTime;
                        const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
                        const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                        return diffHrs > 0 ? `${diffHrs}h ${diffMins}m` : `${diffMins}m`;
                      })()}
                    </Text>
                  </View>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

    </View>
  );
};

// HISTORY TAB
const HistoryTab = () => {
  const ctx = React.useContext(TradingContext);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await ctx.fetchTradeHistory();
    setRefreshing(false);
  };

  return (
    <FlatList
      style={styles.container}
      data={ctx.tradeHistory}
      keyExtractor={item => item._id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#d4af37" />}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={48} color="#000000" />
          <Text style={styles.emptyText}>No trade history</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.historyItemFull}>
          <View style={styles.historyHeader}>
            <View style={styles.historyLeft}>
              <Text style={styles.historySymbol}>{item.symbol}</Text>
              <View style={[styles.sideBadge, { backgroundColor: item.side === 'BUY' ? '#d4af3720' : '#d4af3720' }]}>
                <Text style={[styles.sideText, { color: item.side === 'BUY' ? '#d4af37' : '#d4af37' }]}>{item.side}</Text>
              </View>
              {item.closedBy === 'ADMIN' && (
                <View style={styles.adminBadge}>
                  <Text style={styles.adminBadgeText}>Admin Close</Text>
                </View>
              )}
            </View>
            <Text style={[styles.historyPnl, { color: (item.realizedPnl || 0) >= 0 ? '#d4af37' : '#d4af37' }]}>
              {(item.realizedPnl || 0) >= 0 ? '+' : ''}${(item.realizedPnl || 0).toFixed(2)}
            </Text>
          </View>
          <View style={styles.historyMeta}>
            <Text style={styles.historyMetaText}>{item.quantity} lots</Text>
            <Text style={styles.historyMetaText}>Open: {item.openPrice?.toFixed(5)}</Text>
            <Text style={styles.historyMetaText}>Close: {item.closePrice?.toFixed(5)}</Text>
          </View>
          <Text style={styles.historyDate}>{new Date(item.closedAt).toLocaleDateString()}</Text>
        </View>
      )}
    />
  );
};

// CHART TAB - Full screen TradingView chart with multiple chart tabs
const ChartTab = () => {
  const ctx = React.useContext(TradingContext);
  const toast = useToast();
  const [chartTabs, setChartTabs] = useState([{ symbol: 'XAUUSD', id: 1 }]);
  const [activeTabId, setActiveTabId] = useState(1);
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const [showOrderPanel, setShowOrderPanel] = useState(false);
  const [orderSide, setOrderSide] = useState('BUY');
  const [volume, setVolume] = useState(0.01);
  const [volumeText, setVolumeText] = useState('0.01');
  const [isExecuting, setIsExecuting] = useState(false);
  const [showLeveragePicker, setShowLeveragePicker] = useState(false);
  const [selectedLeverage, setSelectedLeverage] = useState(ctx.selectedAccount?.leverage || '1:100');
  const leverageOptions = ['1:50', '1:100', '1:200', '1:500', '1:1000'];

  const activeTab = chartTabs.find(t => t.id === activeTabId) || chartTabs[0];
  const activeSymbol = activeTab?.symbol || 'XAUUSD';

  const addNewChartTab = (symbol) => {
    const newId = Math.max(...chartTabs.map(t => t.id)) + 1;
    setChartTabs([...chartTabs, { symbol, id: newId }]);
    setActiveTabId(newId);
    setShowSymbolPicker(false);
  };

  const removeChartTab = (id) => {
    if (chartTabs.length > 1) {
      const newTabs = chartTabs.filter(t => t.id !== id);
      setChartTabs(newTabs);
      if (activeTabId === id) {
        setActiveTabId(newTabs[0].id);
      }
    }
  };

  const currentInstrument = ctx.instruments.find(i => i.symbol === activeSymbol) || ctx.instruments[0];
  const currentPrice = ctx.livePrices[activeSymbol];
  const isForex = currentInstrument?.category === 'Forex';
  const decimals = isForex ? 5 : 2;

  const getSymbolForTradingView = (symbol) => {
    const symbolMap = {
      'EURUSD': 'OANDA:EURUSD', 'GBPUSD': 'OANDA:GBPUSD', 'USDJPY': 'OANDA:USDJPY',
      'USDCHF': 'OANDA:USDCHF', 'AUDUSD': 'OANDA:AUDUSD', 'NZDUSD': 'OANDA:NZDUSD',
      'USDCAD': 'OANDA:USDCAD', 'EURGBP': 'OANDA:EURGBP', 'EURJPY': 'OANDA:EURJPY',
      'GBPJPY': 'OANDA:GBPJPY', 'XAUUSD': 'OANDA:XAUUSD', 'XAGUSD': 'OANDA:XAGUSD',
      'BTCUSD': 'COINBASE:BTCUSD', 'ETHUSD': 'COINBASE:ETHUSD', 'LTCUSD': 'COINBASE:LTCUSD',
      'XRPUSD': 'BITSTAMP:XRPUSD', 'BNBUSD': 'BINANCE:BNBUSDT', 'SOLUSD': 'COINBASE:SOLUSD',
      'ADAUSD': 'COINBASE:ADAUSD', 'DOGEUSD': 'BINANCE:DOGEUSDT', 'DOTUSD': 'COINBASE:DOTUSD',
      'MATICUSD': 'COINBASE:MATICUSD', 'AVAXUSD': 'COINBASE:AVAXUSD', 'LINKUSD': 'COINBASE:LINKUSD',
    };
    return symbolMap[symbol] || `OANDA:${symbol}`;
  };

  const openOrderPanel = (side) => {
    setOrderSide(side);
    setShowOrderPanel(true);
  };

  // One-click trade execution - Fast execution
  const executeOneClickTrade = async (side) => {
    if (isExecuting) return;
    if (!ctx.selectedAccount) {
      toast?.showToast('Please select a trading account first', 'error');
      return;
    }
    if (!currentPrice?.bid || !currentPrice?.ask) {
      toast?.showToast('No price data available', 'error');
      return;
    }
    
    setIsExecuting(true);
    try {
      const price = side === 'BUY' ? currentPrice.ask : currentPrice.bid;
      const segment = currentInstrument?.category === 'Forex' ? 'Forex' : 
                      currentInstrument?.category === 'Metals' ? 'Metals' : 'Crypto';
      
      const res = await fetch(`${API_URL}/trade/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: ctx.user?._id,
          tradingAccountId: ctx.selectedAccount._id,
          symbol: activeSymbol,
          segment: segment,
          side: side,
          quantity: volume,
          bid: currentPrice.bid,
          ask: currentPrice.ask,
          leverage: ctx.selectedAccount.leverage || '1:100',
          orderType: 'MARKET'
        })
      });
      const data = await res.json();
      if (data.success) {
        toast?.showToast(`${side} ${volume} ${activeSymbol} @ ${price.toFixed(decimals)}`, 'success');
        ctx.fetchOpenTrades();
        ctx.fetchAccountSummary();
      } else {
        toast?.showToast(data.message || 'Failed to place order', 'error');
      }
    } catch (e) {
      toast?.showToast('Network error', 'error');
    } finally {
      setIsExecuting(false);
    }
  };

  const executeTrade = async () => {
    try {
      const price = orderSide === 'BUY' ? currentPrice?.ask : currentPrice?.bid;
      const segment = currentInstrument?.category === 'Forex' ? 'Forex' : 
                      currentInstrument?.category === 'Metals' ? 'Metals' : 'Crypto';
      
      const res = await fetch(`${API_URL}/trade/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: ctx.user?._id,
          tradingAccountId: ctx.selectedAccount?._id,
          symbol: activeSymbol,
          segment: segment,
          side: orderSide,
          quantity: volume,
          bid: currentPrice?.bid,
          ask: currentPrice?.ask,
          leverage: ctx.selectedAccount?.leverage || '1:100',
          orderType: 'MARKET'
        })
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert('Success', `${orderSide} order placed!`);
        setShowOrderPanel(false);
        ctx.fetchOpenTrades();
        ctx.fetchAccountSummary();
      } else {
        Alert.alert('Error', data.message || 'Failed to place order');
      }
    } catch (e) {
      Alert.alert('Error', 'Network error');
    }
  };

  const chartHtml = `
    <!DOCTYPE html>
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <style>*{margin:0;padding:0;box-sizing:border-box;}html,body{height:100%;width:100%;background:#000;overflow:hidden;}</style></head>
    <body>
    <div class="tradingview-widget-container" style="height:100%;width:100%">
      <div id="tradingview_chart" style="height:100%;width:100%"></div>
    </div>
    <script type="text/javascript" src="https://s3.tradingview.com/tv.js"></script>
    <script type="text/javascript">
    new TradingView.widget({
      "autosize": true,
      "symbol": "${getSymbolForTradingView(activeSymbol)}",
      "interval": "5",
      "timezone": "Etc/UTC",
      "theme": "dark",
      "style": "1",
      "locale": "en",
      "toolbar_bg": "#000",
      "enable_publishing": false,
      "hide_top_toolbar": false,
      "hide_legend": false,
      "save_image": false,
      "container_id": "tradingview_chart",
      "backgroundColor": "#000000",
      "withdateranges": true,
      "allow_symbol_change": false,
      "details": true,
      "hotlist": false,
      "calendar": false,
      "studies": ["Volume@tv-basicstudies"]
    });
    </script></body></html>
  `;

  return (
    <View style={styles.chartContainer}>
      {/* Top Bar - Multiple Chart Tabs */}
      <View style={styles.chartTabsBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chartTabsScroll}>
          {chartTabs.map(tab => (
            <TouchableOpacity 
              key={tab.id}
              style={[styles.chartTab, activeTabId === tab.id && styles.chartTabActive]}
              onPress={() => setActiveTabId(tab.id)}
              onLongPress={() => removeChartTab(tab.id)}
            >
              <Text style={[styles.chartTabText, activeTabId === tab.id && styles.chartTabTextActive]}>
                {tab.symbol}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.addChartBtn} onPress={() => setShowSymbolPicker(true)}>
          <Ionicons name="add" size={20} color="#666" />
        </TouchableOpacity>
      </View>

      {/* Quick Trade Bar - Screenshot Style: SELL price | - lot + | BUY price */}
      <View style={styles.quickTradeBarTop}>
        {/* SELL Button with Price */}
        <TouchableOpacity 
          style={[styles.sellPriceBtn, isExecuting && styles.btnDisabled]}
          onPress={() => executeOneClickTrade('SELL')}
          disabled={isExecuting}
        >
          <Text style={styles.sellLabel}>sell</Text>
          <Text style={styles.sellPrice}>{currentPrice?.bid?.toFixed(decimals) || '-'}</Text>
        </TouchableOpacity>

        {/* Lot Size with +/- */}
        <View style={styles.lotControlCenter}>
          <TouchableOpacity style={styles.lotMinusBtn} onPress={() => { const v = Math.max(0.01, volume - 0.01); setVolume(v); setVolumeText(v.toFixed(2)); }}>
            <Text style={styles.lotControlText}>−</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.lotCenterInput}
            value={volumeText}
            onChangeText={(text) => {
              if (text === '' || /^\d*\.?\d*$/.test(text)) {
                setVolumeText(text);
              }
            }}
            onBlur={() => {
              const val = parseFloat(volumeText);
              if (isNaN(val) || val <= 0) {
                setVolumeText('0.01');
                setVolume(0.01);
              } else {
                setVolume(val);
              }
            }}
            keyboardType="decimal-pad"
            selectTextOnFocus
          />
          <TouchableOpacity style={styles.lotPlusBtn} onPress={() => { const v = volume + 0.01; setVolume(v); setVolumeText(v.toFixed(2)); }}>
            <Text style={styles.lotControlText}>+</Text>
          </TouchableOpacity>
        </View>

        {/* BUY Button with Price */}
        <TouchableOpacity 
          style={[styles.buyPriceBtn, isExecuting && styles.btnDisabled]}
          onPress={() => executeOneClickTrade('BUY')}
          disabled={isExecuting}
        >
          <Text style={styles.buyLabel}>buy</Text>
          <Text style={styles.buyPrice}>{currentPrice?.ask?.toFixed(decimals) || '-'}</Text>
        </TouchableOpacity>
      </View>

      {/* Full Screen Chart */}
      <View style={styles.chartWrapper}>
        <WebView
          key={activeSymbol}
          source={{ html: chartHtml }}
          style={{ flex: 1, backgroundColor: '#000000' }}
          javaScriptEnabled={true}
          scrollEnabled={false}
        />
      </View>

      {/* Leverage Picker Modal */}
      <Modal visible={showLeveragePicker} animationType="fade" transparent onRequestClose={() => setShowLeveragePicker(false)}>
        <TouchableOpacity style={styles.leverageModalOverlay} activeOpacity={1} onPress={() => setShowLeveragePicker(false)}>
          <View style={styles.leverageModalContent}>
            <Text style={styles.leverageModalTitle}>Select Leverage</Text>
            {leverageOptions.map(lev => (
              <TouchableOpacity 
                key={lev}
                style={[styles.leverageModalItem, selectedLeverage === lev && styles.leverageModalItemActive]}
                onPress={() => { setSelectedLeverage(lev); setShowLeveragePicker(false); }}
              >
                <Text style={[styles.leverageModalItemText, selectedLeverage === lev && styles.leverageModalItemTextActive]}>{lev}</Text>
                {selectedLeverage === lev && <Ionicons name="checkmark" size={18} color="#d4af37" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Order Panel Slide Up */}
      <Modal visible={showOrderPanel} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.orderSlidePanel}>
            <View style={styles.orderPanelHandle} />
            <View style={styles.orderPanelHeader}>
              <Text style={styles.orderPanelTitle}>{activeSymbol}</Text>
              <TouchableOpacity onPress={() => setShowOrderPanel(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Side Toggle */}
            <View style={styles.sideToggle}>
              <TouchableOpacity 
                style={[styles.sideBtn, orderSide === 'SELL' && styles.sideBtnSell]}
                onPress={() => setOrderSide('SELL')}
              >
                <Text style={styles.sideBtnText}>SELL</Text>
                <Text style={styles.sideBtnPrice}>{currentPrice?.bid?.toFixed(decimals) || '-'}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.sideBtn, orderSide === 'BUY' && styles.sideBtnBuy]}
                onPress={() => setOrderSide('BUY')}
              >
                <Text style={styles.sideBtnText}>BUY</Text>
                <Text style={styles.sideBtnPrice}>{currentPrice?.ask?.toFixed(decimals) || '-'}</Text>
              </TouchableOpacity>
            </View>

            {/* Volume */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Volume (Lots)</Text>
              <View style={styles.volumeInput}>
                <TouchableOpacity style={styles.volumeBtn} onPress={() => setVolume(Math.max(0.01, volume - 0.01))}>
                  <Ionicons name="remove" size={20} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.volumeValue}>{volume.toFixed(2)}</Text>
                <TouchableOpacity style={styles.volumeBtn} onPress={() => setVolume(volume + 0.01)}>
                  <Ionicons name="add" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Execute Button */}
            <TouchableOpacity 
              style={[styles.executeBtn, { backgroundColor: orderSide === 'BUY' ? '#d4af37' : '#d4af37' }]}
              onPress={executeTrade}
            >
              <Text style={styles.executeBtnText}>
                {orderSide} {volume.toFixed(2)} {activeSymbol}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Symbol Picker Modal - Add new chart */}
      <Modal visible={showSymbolPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.symbolPickerModal}>
            <View style={styles.symbolPickerHeader}>
              <Text style={styles.symbolPickerTitle}>Add Chart</Text>
              <TouchableOpacity onPress={() => setShowSymbolPicker(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {ctx.instruments.map(inst => (
                <TouchableOpacity
                  key={inst.symbol}
                  style={[styles.symbolPickerItem, chartTabs.some(t => t.symbol === inst.symbol) && styles.symbolPickerItemActive]}
                  onPress={() => addNewChartTab(inst.symbol)}
                >
                  <View>
                    <Text style={styles.symbolPickerSymbol}>{inst.symbol}</Text>
                    <Text style={styles.symbolPickerName}>{inst.name}</Text>
                  </View>
                  {chartTabs.some(t => t.symbol === inst.symbol) && <Ionicons name="checkmark" size={20} color="#d4af37" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// MORE TAB - Matching screenshot exactly
const MoreTab = ({ navigation }) => {
  const ctx = React.useContext(TradingContext);
  const parentNav = navigation.getParent();
  const [isDarkMode, setIsDarkMode] = useState(true);

  const menuItems = [
    { icon: 'book-outline', label: 'Orders', screen: 'OrderBook', isTab: false, color: '#d4af37' },
    { icon: 'wallet-outline', label: 'Wallet', screen: 'Wallet', isTab: false, color: '#d4af37' },
    { icon: 'copy-outline', label: 'Copy Trade', screen: 'CopyTrade', isTab: false, color: '#d4af37' },
    { icon: 'people-outline', label: 'IB Program', screen: 'IB', isTab: false, color: '#d4af37' },
    { icon: 'person-outline', label: 'Profile', screen: 'Profile', isTab: false, color: '#d4af37' },
    { icon: 'help-circle-outline', label: 'Support', screen: 'Support', isTab: false, color: '#d4af37' },
    { icon: 'document-text-outline', label: 'Instructions', screen: 'Instructions', isTab: false, color: '#d4af37' },
  ];

  const handleNavigate = (screen, isTab) => {
    if (isTab) {
      navigation.navigate(screen);
    } else if (parentNav) {
      parentNav.navigate(screen);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.moreMenuHeader}>
        <Text style={styles.moreMenuTitle}>More</Text>
      </View>

      {/* Menu Items */}
      <ScrollView style={styles.moreMenuList}>
        {menuItems.map((item, index) => (
          <TouchableOpacity key={index} style={styles.moreMenuItem} onPress={() => handleNavigate(item.screen, item.isTab)}>
            <View style={[styles.moreMenuIcon, { backgroundColor: `${item.color}20` }]}>
              <Ionicons name={item.icon} size={20} color={item.color} />
            </View>
            <Text style={styles.moreMenuItemText}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={18} color="#666" />
          </TouchableOpacity>
        ))}

        {/* Dark/Light Mode Toggle */}
        <View style={styles.themeToggleItem}>
          <View style={[styles.moreMenuIcon, { backgroundColor: '#d4af3720' }]}>
            <Ionicons name={isDarkMode ? 'moon' : 'sunny'} size={20} color="#d4af37" />
          </View>
          <Text style={styles.moreMenuItemText}>Dark Mode</Text>
          <TouchableOpacity 
            style={[styles.themeToggle, isDarkMode && styles.themeToggleActive]}
            onPress={() => setIsDarkMode(!isDarkMode)}
          >
            <View style={[styles.themeToggleThumb, isDarkMode && styles.themeToggleThumbActive]} />
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.moreMenuItem} onPress={ctx.logout}>
          <View style={[styles.moreMenuIcon, { backgroundColor: '#d4af3720' }]}>
            <Ionicons name="log-out-outline" size={20} color="#d4af37" />
          </View>
          <Text style={[styles.moreMenuItemText, { color: '#d4af37' }]}>Log Out</Text>
          <Ionicons name="chevron-forward" size={18} color="#666" />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

// MAIN SCREEN
const MainTradingScreen = ({ navigation }) => {
  return (
    <ToastProvider>
      <TradingProvider navigation={navigation}>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarStyle: styles.tabBar,
            tabBarActiveTintColor: '#d4af37',
            tabBarInactiveTintColor: '#666',
            tabBarIcon: ({ focused, color, size }) => {
              let iconName;
              if (route.name === 'Home') iconName = focused ? 'home' : 'home-outline';
              else if (route.name === 'Market') iconName = focused ? 'stats-chart' : 'stats-chart-outline';
              else if (route.name === 'Trade') iconName = focused ? 'trending-up' : 'trending-up-outline';
              else if (route.name === 'Chart') iconName = focused ? 'analytics' : 'analytics-outline';
              else if (route.name === 'More') iconName = focused ? 'menu' : 'menu-outline';
              return <Ionicons name={iconName} size={size} color={color} />;
            },
          })}
        >
          <Tab.Screen name="Home" component={HomeTab} />
          <Tab.Screen name="Market" component={QuotesTab} />
          <Tab.Screen name="Trade" component={TradeTab} />
          <Tab.Screen name="Chart" component={ChartTab} />
          <Tab.Screen name="More" component={MoreTab} />
        </Tab.Navigator>
      </TradingProvider>
    </ToastProvider>
  );
};

// Gold color constant
const GOLD = '#d4af37';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000000' },
  tabBar: { backgroundColor: '#000000', borderTopColor: '#000000', height: 60, paddingBottom: 8 },
  
  // Home
  homeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 50 },
  greeting: { color: '#666', fontSize: 14 },
  userName: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  notificationBtn: { padding: 10, backgroundColor: '#111', borderRadius: 12, borderWidth: 1, borderColor: '#222', position: 'relative' },
  notificationBadge: { position: 'absolute', top: 4, right: 4, backgroundColor: '#ef4444', width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  notificationBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  
  accountCard: { margin: 16, padding: 16, backgroundColor: '#000000', borderRadius: 16, borderWidth: 1, borderColor: '#000000' },
  accountCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  accountIconContainer: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#d4af3720', justifyContent: 'center', alignItems: 'center' },
  accountInfo: { flex: 1, marginLeft: 12 },
  accountId: { color: '#fff', fontSize: 16, fontWeight: '600' },
  accountType: { color: '#666', fontSize: 12, marginTop: 2 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  balanceLabel: { color: '#666', fontSize: 11, marginBottom: 2 },
  balanceValue: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  equityValue: { fontSize: 20, fontWeight: 'bold' },
  pnlRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#000000' },
  pnlValue: { fontSize: 16, fontWeight: '600' },
  freeMarginValue: { fontSize: 16, fontWeight: '600' },
  cardActionButtons: { flexDirection: 'row', gap: 8, marginTop: 4 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 16, borderTopWidth: 1, borderTopColor: '#000000' },
  statItem: { flex: 1 },
  statLabel: { color: '#666', fontSize: 12, marginBottom: 4 },
  statValue: { color: '#fff', fontSize: 16, fontWeight: '600' },
  
  // Deposit/Withdraw Buttons
  actionButtons: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 12 },
  depositBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, backgroundColor: '#d4af37', borderRadius: 12 },
  depositBtnText: { color: '#000', fontSize: 14, fontWeight: '600' },
  withdrawBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, backgroundColor: '#000000', borderRadius: 12, borderWidth: 1, borderColor: '#000000' },
  withdrawBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  
  // Quick Actions Row - 4 buttons only
  quickActionsRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  quickActionCard: { flex: 1, alignItems: 'center', paddingVertical: 16, backgroundColor: '#000000', borderRadius: 12, borderWidth: 1, borderColor: '#000000' },
  quickActionIconBg: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  quickActionLabel: { color: '#fff', fontSize: 11, fontWeight: '500' },
  
  // MarketWatch News Section
  marketWatchSection: { marginHorizontal: 16, marginTop: 16 },
  marketWatchHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  marketWatchTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  marketWatchTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ef444420', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ef4444', marginRight: 4 },
  liveText: { color: '#ef4444', fontSize: 10, fontWeight: '700' },
  newsLoadingContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 30, gap: 10 },
  newsLoadingText: { color: '#666', fontSize: 14 },
  newsListContainer: { gap: 12 },
  newsCard: { backgroundColor: '#111', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#222' },
  newsCardImage: { width: '100%', height: 160, backgroundColor: '#1a1a1a' },
  newsCardContent: { padding: 14 },
  newsCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  newsCategoryBadge: { backgroundColor: '#d4af3720', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  newsCategoryText: { color: '#d4af37', fontSize: 11, fontWeight: '600' },
  newsTimeText: { color: '#666', fontSize: 11 },
  newsCardTitle: { color: '#fff', fontSize: 15, fontWeight: '600', lineHeight: 22, marginBottom: 6 },
  newsCardSummary: { color: '#888', fontSize: 13, lineHeight: 18, marginBottom: 10 },
  newsCardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  newsSourceRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  newsSourceText: { color: '#888', fontSize: 12 },
  
  // Positions Card
  positionsCard: { margin: 16, padding: 16, backgroundColor: '#000000', borderRadius: 16, borderWidth: 1, borderColor: '#000000' },
  positionsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  positionsTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  positionsCount: { color: '#d4af37', fontSize: 14 },
  noPositionsText: { color: '#666', fontSize: 14, textAlign: 'center', paddingVertical: 16 },
  positionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: '#000000', borderRadius: 12, marginBottom: 8 },
  positionSide: { fontSize: 12, marginTop: 2 },
  positionPnlValue: { fontSize: 16, fontWeight: '600' },
  viewAllText: { color: '#d4af37', fontSize: 14, textAlign: 'center', paddingTop: 8 },
  
  // News Section (Home Tab)
  newsSection: { margin: 16, marginTop: 8 },
  newsSectionTitle: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 12 },
  newsTabs: { flexDirection: 'row', backgroundColor: '#000000', borderRadius: 12, padding: 4, marginBottom: 12, borderWidth: 1, borderColor: '#000000' },
  newsTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  newsTabActive: { backgroundColor: '#000000' },
  newsTabText: { color: '#666', fontSize: 12, fontWeight: '500' },
  newsTabTextActive: { color: '#d4af37' },
  newsContent: {},
  newsItem: { backgroundColor: '#000000', borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#000000' },
  newsCategory: { backgroundColor: '#d4af3720', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start', marginBottom: 8 },
  newsCategoryText: { color: '#d4af37', fontSize: 11, fontWeight: '600' },
  newsTitle: { color: '#fff', fontSize: 14, fontWeight: '500', lineHeight: 20, marginBottom: 8 },
  newsMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  newsSource: { color: '#888', fontSize: 12 },
  newsTime: { color: '#666', fontSize: 12 },
  calendarContent: { backgroundColor: '#000000', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#000000' },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#000000', borderBottomWidth: 1, borderBottomColor: '#000000' },
  calendarHeaderText: { color: '#666', fontSize: 11, fontWeight: '600', width: 50, textAlign: 'center' },
  calendarRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#000000' },
  calendarTime: { color: '#fff', fontSize: 12, fontWeight: '500', width: 50, textAlign: 'center' },
  currencyBadge: { backgroundColor: '#d4af3720', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, width: 50, alignItems: 'center' },
  currencyText: { color: '#d4af37', fontSize: 11, fontWeight: '600' },
  eventName: { color: '#fff', fontSize: 13, fontWeight: '500' },
  eventForecast: { color: '#666', fontSize: 10, marginTop: 2 },
  impactDot: { width: 10, height: 10, borderRadius: 5 },
  
  // TradingView Widget Container
  tradingViewContainer: { height: 700, backgroundColor: '#000000', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#1a1a1a' },
  tradingViewWebView: { flex: 1, backgroundColor: '#000000' },
  webViewLoading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000000' },
  webViewLoadingText: { color: '#666', fontSize: 12, marginTop: 8 },
  
  section: { padding: 16 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 12 },
  emptyState: { alignItems: 'center', padding: 40 },
  emptyText: { color: '#666', marginTop: 12 },
  
  tradeItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#000000', borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#000000' },
  tradeLeft: {},
  tradeSymbol: { color: '#fff', fontSize: 16, fontWeight: '600' },
  tradeSide: { fontSize: 12, marginTop: 4 },
  tradePnl: { fontSize: 16, fontWeight: '600' },
  
  // Quotes/Market - Venta Black Style (Responsive)
  searchContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginHorizontal: 12, 
    marginTop: 50, 
    marginBottom: 10, 
    paddingHorizontal: 12, 
    paddingVertical: 10, 
    backgroundColor: '#000000', 
    borderRadius: 10,
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#000000',
  },
  searchInput: { flex: 1, marginLeft: 8, color: '#fff', fontSize: 14, paddingVertical: 0 },
  
  // Market Section - New Styles
  marketSearchContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginHorizontal: 12, 
    marginTop: 50, 
    marginBottom: 12, 
    paddingHorizontal: 14, 
    paddingVertical: 12, 
    backgroundColor: '#000000', 
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#000000',
  },
  marketTabsContainer: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginBottom: 12,
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 4,
  },
  marketTabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  marketTabBtnActive: {
    backgroundColor: '#d4af37',
  },
  marketTabText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  marketTabTextActive: {
    color: '#000',
  },
  marketContent: {
    flex: 1,
    paddingHorizontal: 12,
  },
  emptyWatchlist: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyWatchlistTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyWatchlistText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
  },
  segmentContainer: {
    marginBottom: 8,
    backgroundColor: '#000000',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#000000',
  },
  segmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  segmentHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  segmentTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  segmentCount: {
    backgroundColor: '#000000',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  segmentCountText: {
    color: '#666',
    fontSize: 12,
  },
  segmentInstruments: {
    borderTopWidth: 1,
    borderTopColor: '#000000',
  },
  categoriesContainer: { paddingHorizontal: 10, marginBottom: 8, height: 40 },
  categoryBtn: { 
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    marginRight: 6, 
    borderRadius: 16, 
    backgroundColor: '#000000',
    height: 34,
    justifyContent: 'center',
    minWidth: 50,
    borderWidth: 1,
    borderColor: '#000000',
  },
  categoryBtnActive: { backgroundColor: '#d4af37' },
  categoryText: { color: '#666', fontSize: 12, fontWeight: '500' },
  categoryTextActive: { color: '#000', fontWeight: '600' },
  
  instrumentItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 12, 
    paddingVertical: 12, 
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
  },
  starBtn: { width: 28, height: 28, justifyContent: 'center', alignItems: 'center' },
  instrumentInfo: { flex: 1, marginLeft: 8 },
  instrumentSymbol: { color: '#fff', fontSize: 14, fontWeight: '600' },
  instrumentName: { color: '#666', fontSize: 10, marginTop: 2 },
  instrumentPriceCol: { width: 60, alignItems: 'center' },
  bidPrice: { color: '#3b82f6', fontSize: 13, fontWeight: '500' },
  askPrice: { color: '#ef4444', fontSize: 13, fontWeight: '500' },
  priceLabel: { color: '#666', fontSize: 9, marginTop: 1 },
  spreadBadgeCol: { backgroundColor: '#000000', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 4, marginHorizontal: 4, minWidth: 32, alignItems: 'center', borderWidth: 1, borderColor: '#000000' },
  spreadBadgeText: { color: '#d4af37', fontSize: 11, fontWeight: '600' },
  chartIconBtn: { 
    width: 32, 
    height: 32, 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: '#000000', 
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#000000',
  },
  
  // Chart Trading Panel - One Click Buy/Sell
  chartTradingPanel: { backgroundColor: '#000000', paddingHorizontal: 12, paddingVertical: 10, paddingBottom: 16 },
  chartVolRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  chartVolMinusBtn: { width: 36, height: 36, backgroundColor: '#000000', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  chartVolPlusBtn: { width: 36, height: 36, backgroundColor: '#000000', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  chartVolDisplay: { alignItems: 'center', marginHorizontal: 16, minWidth: 80 },
  chartVolLabel: { color: '#666', fontSize: 10 },
  chartVolValue: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  chartTradeButtons: { flexDirection: 'row', gap: 10 },
  chartSellButton: { flex: 1, backgroundColor: '#d4af37', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  chartBuyButton: { flex: 1, backgroundColor: '#d4af37', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  chartSellLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600' },
  chartBuyLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600' },
  chartSellPrice: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  chartBuyPrice: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  chartSpreadText: { color: '#666', fontSize: 11, textAlign: 'center', marginTop: 8 },
  
  // Order Panel - Slide from Bottom (Fixed - positioned at bottom)
  orderModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' },
  orderPanelBackdrop: { flex: 1 },
  orderPanelScroll: { position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: height * 0.85 },
  orderPanelContainer: { backgroundColor: '#000000', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingBottom: 40, paddingTop: 8 },
  orderPanelHandle: { width: 40, height: 4, backgroundColor: '#000000', borderRadius: 2, alignSelf: 'center', marginTop: 8, marginBottom: 12 },
  orderPanelHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  orderPanelSymbol: { color: '#fff', fontSize: 16, fontWeight: '600' },
  orderPanelName: { color: '#666', fontSize: 12, marginTop: 2 },
  orderCloseBtn: { padding: 6 },
  leverageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#000000', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  leverageLabel: { color: '#888', fontSize: 12 },
  leverageValue: { color: '#d4af37', fontSize: 14, fontWeight: 'bold' },
  quickTradeRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  quickSellBtn: { flex: 1, backgroundColor: '#ef4444', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  quickBuyBtn: { flex: 1, backgroundColor: '#3b82f6', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  quickBtnLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600' },
  quickBtnPrice: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  btnDisabled: { opacity: 0.5 },
  spreadInfoRow: { alignItems: 'center', marginBottom: 10 },
  spreadInfoText: { color: '#666', fontSize: 11 },
  orderTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  orderTypeBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', backgroundColor: '#000000' },
  orderTypeBtnActive: { backgroundColor: '#d4af37' },
  orderTypeBtnText: { color: '#666', fontSize: 13, fontWeight: '600' },
  orderTypeBtnTextActive: { color: '#000' },
  pendingTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  pendingTypeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: '#000000', borderWidth: 1, borderColor: '#000000' },
  pendingTypeBtnActive: { backgroundColor: '#000000', borderColor: '#d4af37' },
  pendingTypeText: { color: '#666', fontSize: 12 },
  pendingTypeTextActive: { color: '#d4af37' },
  inputSection: { marginBottom: 10 },
  inputLabel: { color: '#888', fontSize: 11, marginBottom: 4 },
  priceInput: { backgroundColor: '#000000', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: '#fff', fontSize: 15 },
  volumeControlRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  volumeControlBtn: { padding: 10, backgroundColor: '#000000', borderRadius: 8 },
  volumeInputField: { flex: 1, backgroundColor: '#000000', borderRadius: 8, paddingVertical: 10, textAlign: 'center', color: '#fff', fontSize: 15 },
  slTpRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  slTpCol: { flex: 1 },
  slTpInputOrder: { backgroundColor: '#000000', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: '#fff', fontSize: 14 },
  finalTradeRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  finalSellBtn: { flex: 1, backgroundColor: '#ef4444', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  finalBuyBtn: { flex: 1, backgroundColor: '#3b82f6', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  finalBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  spreadBadge: { backgroundColor: '#000000', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginHorizontal: 8, borderWidth: 1, borderColor: '#000000' },
  spreadText: { color: '#d4af37', fontSize: 10 },
  
  // Trade
  priceBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#000000' },
  currentSymbol: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  currentName: { color: '#666', fontSize: 12 },
  priceDisplay: { flexDirection: 'row', gap: 16 },
  bidPriceMain: { color: '#3b82f6', fontSize: 16, fontWeight: '600' },
  askPriceMain: { color: '#ef4444', fontSize: 16, fontWeight: '600' },
  
  // Account Summary (Trade Tab)
  accountSummaryList: { backgroundColor: '#000000', borderBottomWidth: 1, borderBottomColor: '#000000', paddingTop: 50 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#000000' },
  summaryLabel: { color: '#666', fontSize: 14 },
  summaryValue: { color: '#fff', fontSize: 14 },
  pendingStatus: { color: '#d4af37', fontSize: 12, fontWeight: '600' },
  historySide: { fontSize: 12, marginLeft: 8 },
  
  tradeTabs: { flexDirection: 'row', backgroundColor: '#000000', borderBottomWidth: 1, borderBottomColor: '#000000' },
  tradeTabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tradeTabBtnActive: { borderBottomWidth: 2, borderBottomColor: '#d4af37' },
  tradeTabText: { color: '#666', fontSize: 14 },
  tradeTabTextActive: { color: '#d4af37', fontWeight: '600' },
  
  tradesList: { flex: 1 },
  positionItem: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#000000' },
  positionRow: { flexDirection: 'row', alignItems: 'center' },
  positionInfo: { flex: 1 },
  positionSymbolRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  positionSymbol: { color: '#fff', fontSize: 15, fontWeight: '600' },
  sideBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  sideText: { fontSize: 10, fontWeight: '600' },
  positionDetail: { color: '#666', fontSize: 12, marginTop: 4 },
  slTpText: { color: '#888', fontSize: 11, marginTop: 2 },
  positionActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 8 },
  editBtn: { padding: 10, backgroundColor: '#d4af3720', borderRadius: 10 },
  closeTradeBtn: { padding: 10, backgroundColor: '#d4af3720', borderRadius: 10 },
  positionPnlCol: { alignItems: 'flex-end' },
  positionPnl: { fontSize: 15, fontWeight: '600' },
  currentPriceText: { color: '#666', fontSize: 12, marginTop: 2 },
  closeBtn: { backgroundColor: '#d4af3720', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 6 },
  closeBtnText: { color: '#d4af37', fontSize: 12, fontWeight: '600' },
  
  // SL/TP Modal
  slTpModalOverlay: { flex: 1, justifyContent: 'flex-end' },
  slTpModalBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)' },
  slTpModalContent: { backgroundColor: '#000000', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  slTpModalHandle: { width: 40, height: 4, backgroundColor: '#000000', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  slTpModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  slTpModalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  slTpInputGroup: { marginBottom: 16 },
  slTpLabel: { color: '#888', fontSize: 13, marginBottom: 8 },
  slTpInput: { backgroundColor: '#000000', borderRadius: 12, padding: 16, color: '#fff', fontSize: 16, borderWidth: 1, borderColor: '#000000' },
  slTpCurrentInfo: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, paddingHorizontal: 4 },
  slTpCurrentText: { color: '#888', fontSize: 13 },
  slTpButtonRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  slTpClearBtn: { flex: 1, backgroundColor: '#000000', padding: 16, borderRadius: 12, alignItems: 'center' },
  slTpClearBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  slTpSaveBtn: { flex: 2, backgroundColor: '#d4af37', padding: 16, borderRadius: 12, alignItems: 'center' },
  slTpSaveBtnText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
  
  // Trade Details Modal
  tradeDetailsContent: { backgroundColor: '#000000', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: '85%' },
  tradeDetailsScroll: { maxHeight: 500 },
  detailSection: { backgroundColor: '#000000', borderRadius: 12, padding: 16, marginBottom: 12 },
  detailSectionTitle: { color: '#d4af37', fontSize: 14, fontWeight: 'bold', marginBottom: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#000000' },
  detailLabel: { color: '#888', fontSize: 14 },
  detailValue: { color: '#fff', fontSize: 14, fontWeight: '500' },
  detailActions: { flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 20 },
  detailEditBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#d4af3720', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#d4af37' },
  detailEditText: { color: '#d4af37', fontSize: 15, fontWeight: '600' },
  detailCloseBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#d4af37', padding: 14, borderRadius: 12 },
  detailCloseText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  
  // iOS-style Confirmation Modal
  confirmModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 40 },
  confirmModalContent: { backgroundColor: '#000000', borderRadius: 20, padding: 24, width: '100%', alignItems: 'center' },
  confirmModalIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#d4af3720', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  confirmModalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  confirmModalMessage: { color: '#888', fontSize: 15, textAlign: 'center', marginBottom: 24 },
  confirmModalButtons: { flexDirection: 'row', gap: 12, width: '100%' },
  confirmCancelBtn: { flex: 1, backgroundColor: '#000000', padding: 14, borderRadius: 12, alignItems: 'center' },
  confirmCancelText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  confirmCloseBtn: { flex: 1, backgroundColor: '#d4af37', padding: 14, borderRadius: 12, alignItems: 'center' },
  confirmCloseText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  
  // Close All Buttons
  closeAllRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#000000' },
  closeAllBtn: { flex: 1, backgroundColor: '#d4af3720', paddingVertical: 8, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#d4af37' },
  closeAllText: { color: '#d4af37', fontSize: 12, fontWeight: '600' },
  closeProfitBtn: { flex: 1, backgroundColor: '#d4af3720', paddingVertical: 8, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#d4af37' },
  closeProfitText: { color: '#d4af37', fontSize: 12, fontWeight: '600' },
  closeLossBtn: { flex: 1, backgroundColor: '#d4af3720', paddingVertical: 8, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#d4af37' },
  closeLossText: { color: '#d4af37', fontSize: 12, fontWeight: '600' },
  
  // Cancel Order Button
  cancelOrderBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#d4af3720', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#d4af37' },
  cancelOrderText: { color: '#d4af37', fontSize: 12, fontWeight: '600' },
  
  // Swipe to Close
  swipeCloseBtn: { backgroundColor: '#d4af37', justifyContent: 'center', alignItems: 'center', width: 80, height: '100%' },
  swipeCloseText: { color: '#fff', fontSize: 12, fontWeight: '600', marginTop: 4 },
  
  tradeButton: { margin: 16, padding: 16, backgroundColor: '#d4af37', borderRadius: 12, alignItems: 'center' },
  tradeButtonText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
  
  // Order Panel
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  orderPanel: { backgroundColor: '#000000', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  orderPanelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  orderPanelTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  
  sideToggle: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  sideBtn: { flex: 1, padding: 16, borderRadius: 12, backgroundColor: '#000000', alignItems: 'center' },
  sideBtnSell: { backgroundColor: '#d4af37' },
  sideBtnBuy: { backgroundColor: '#d4af37' },
  sideBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  sideBtnPrice: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginTop: 4 },
  
  inputGroup: { marginBottom: 16 },
  inputLabel: { color: '#666', fontSize: 12, marginBottom: 8 },
  volumeInput: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#000000', borderRadius: 12 },
  volumeBtn: { padding: 16 },
  volumeValue: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 18, fontWeight: '600' },
  
  slTpRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  slTpInputWrapper: { flex: 1 },
  input: { backgroundColor: '#000000', borderRadius: 12, padding: 14, color: '#fff', fontSize: 16 },
  
  executeBtn: { padding: 16, borderRadius: 12, alignItems: 'center' },
  executeBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  
  // History
  historyItemFull: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#000000' },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  historySymbol: { color: '#fff', fontSize: 16, fontWeight: '600' },
  historyPnl: { fontSize: 16, fontWeight: '600' },
  historyMeta: { flexDirection: 'row', gap: 16, marginTop: 8 },
  historyMetaText: { color: '#666', fontSize: 12 },
  historyDate: { color: '#000000', fontSize: 11, marginTop: 8 },
  historyItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#000000' },
  historyDetails: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  historyDetail: { color: '#666', fontSize: 12 },
  adminBadge: { backgroundColor: '#d4af3720', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  adminBadgeText: { color: '#d4af37', fontSize: 10 },
  
  // More Menu - Matching screenshot
  moreMenuHeader: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20 },
  moreMenuTitle: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  moreMenuList: { flex: 1, paddingHorizontal: 16 },
  moreMenuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#000000' },
  moreMenuIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  moreMenuItemText: { flex: 1, color: '#fff', fontSize: 16 },
  themeToggleItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#000000' },
  themeToggle: { width: 50, height: 28, backgroundColor: '#000000', borderRadius: 14, justifyContent: 'center', paddingHorizontal: 2 },
  themeToggleActive: { backgroundColor: '#d4af37' },
  themeToggleThumb: { width: 24, height: 24, backgroundColor: '#fff', borderRadius: 12 },
  themeToggleThumbActive: { marginLeft: 'auto' },
  
  // Chart Tab - Full screen with multiple tabs
  chartContainer: { flex: 1, backgroundColor: '#000000' },
  chartTabsBar: { flexDirection: 'row', alignItems: 'center', paddingTop: 50, paddingLeft: 8, backgroundColor: '#000000', borderBottomWidth: 1, borderBottomColor: '#000000' },
  chartTabsScroll: { flexGrow: 0 },
  chartTab: { paddingHorizontal: 14, paddingVertical: 10, marginRight: 2, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  chartTabActive: { borderBottomColor: '#d4af37' },
  chartTabText: { color: '#666', fontSize: 13, fontWeight: '500' },
  chartTabTextActive: { color: '#d4af37' },
  addChartBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  chartWrapper: { flex: 1, backgroundColor: '#000000' },
  chartPriceBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#000000' },
  chartPriceItem: { alignItems: 'center' },
  chartPriceLabel: { color: '#666', fontSize: 11, marginBottom: 2 },
  chartBidPrice: { color: '#3b82f6', fontSize: 16, fontWeight: '600' },
  chartAskPrice: { color: '#ef4444', fontSize: 16, fontWeight: '600' },
  chartSpread: { color: '#fff', fontSize: 14 },
  chartOneClickContainer: { backgroundColor: '#000000', paddingBottom: 16 },
  chartVolumeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 16 },
  chartVolBtn: { width: 32, height: 32, backgroundColor: '#000000', borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  chartVolText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  chartButtons: { flexDirection: 'row', gap: 10, paddingHorizontal: 12 },
  chartSellBtn: { flex: 1, backgroundColor: '#ef4444', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  chartBuyBtn: { flex: 1, backgroundColor: '#3b82f6', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  chartBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  chartBtnLabel: { color: '#fff', fontSize: 12, fontWeight: '600', opacity: 0.9 },
  chartBtnPrice: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginTop: 2 },
  orderSlidePanel: { backgroundColor: '#000000', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
  orderPanelHandle: { width: 40, height: 4, backgroundColor: '#000000', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  symbolPickerModal: { backgroundColor: '#000000', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%' },
  symbolPickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#000000' },
  symbolPickerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  symbolPickerItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#000000' },
  symbolPickerItemActive: { backgroundColor: '#d4af3710' },
  symbolPickerSymbol: { color: '#fff', fontSize: 16, fontWeight: '600' },
  symbolPickerName: { color: '#666', fontSize: 12, marginTop: 2 },
  
  // Quick Trade Bar - Screenshot Style
  quickTradeBarTop: { 
    flexDirection: 'row', 
    alignItems: 'stretch', 
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
  },
  sellPriceBtn: { 
    flex: 1,
    backgroundColor: '#ef4444',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: '#ef4444',
  },
  sellLabel: { color: '#fff', fontSize: 11, fontWeight: '500' },
  sellPrice: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  buyPriceBtn: { 
    flex: 1,
    backgroundColor: '#3b82f6',
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'flex-end',
    borderWidth: 2,
    borderColor: '#3b82f6',
  },
  buyLabel: { color: '#fff', fontSize: 11, fontWeight: '500' },
  buyPrice: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  lotControlCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000',
    paddingHorizontal: 4,
  },
  lotMinusBtn: {
    width: 28,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lotPlusBtn: {
    width: 28,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lotControlText: { color: '#888', fontSize: 18, fontWeight: '300' },
  lotCenterInput: {
    width: 50,
    height: 36,
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 0,
  },
  btnDisabled: { opacity: 0.5 },
  
  // Leverage Picker Modal
  leverageModalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.8)' },
  leverageModalContent: { backgroundColor: '#000000', borderRadius: 16, padding: 16, width: 200 },
  leverageModalTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'center', marginBottom: 12 },
  leverageModalItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8 },
  leverageModalItemActive: { backgroundColor: '#d4af3720' },
  leverageModalItemText: { color: '#888', fontSize: 14, fontWeight: '600' },
  leverageModalItemTextActive: { color: '#d4af37' },
  
  // Leverage Selector
  leverageSelector: { flexDirection: 'row', gap: 6 },
  leverageOption: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#000000', borderRadius: 6, borderWidth: 1, borderColor: '#000000' },
  leverageOptionActive: { backgroundColor: '#d4af3720', borderColor: '#d4af37' },
  leverageOptionText: { color: '#888', fontSize: 12, fontWeight: '600' },
  leverageOptionTextActive: { color: '#d4af37' },
  
  // Account Selector - Below search bar
  accountSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#000000', marginHorizontal: 12, marginTop: 0, marginBottom: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#000000' },
  accountSelectorLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accountIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#d4af3720', justifyContent: 'center', alignItems: 'center' },
  accountSelectorLabel: { color: '#666', fontSize: 9 },
  accountSelectorValue: { color: '#fff', fontSize: 12, fontWeight: '600' },
  
  // Account Picker Modal
  accountPickerOverlay: { flex: 1, justifyContent: 'flex-end' },
  accountPickerBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)' },
  accountPickerContent: { backgroundColor: '#000000', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '60%' },
  accountPickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#000000' },
  accountPickerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  accountPickerList: { paddingHorizontal: 12, paddingBottom: 40 },
  accountPickerItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, marginVertical: 4, backgroundColor: '#000000', borderRadius: 12 },
  accountPickerItemActive: { backgroundColor: '#d4af3715', borderWidth: 1, borderColor: '#d4af37' },
  accountPickerItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  accountPickerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' },
  accountPickerIconActive: { backgroundColor: '#d4af3720' },
  accountPickerNumber: { color: '#fff', fontSize: 15, fontWeight: '600' },
  accountPickerType: { color: '#666', fontSize: 12, marginTop: 2 },
  accountPickerItemRight: { alignItems: 'flex-end', gap: 4 },
  accountPickerBalance: { color: '#d4af37', fontSize: 16, fontWeight: 'bold' },
});

export default MainTradingScreen;
