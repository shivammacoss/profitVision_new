import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../config';

const CopyTradeScreen = ({ navigation }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('discover');
  const [masters, setMasters] = useState([]);
  const [mySubscriptions, setMySubscriptions] = useState([]);
  const [myCopyTrades, setMyCopyTrades] = useState([]);
  const [myFollowers, setMyFollowers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [showFollowModal, setShowFollowModal] = useState(false);
  const [selectedMaster, setSelectedMaster] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [copyMode, setCopyMode] = useState('FIXED_LOT');
  const [copyValue, setCopyValue] = useState('0.01');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Master trader states
  const [myMasterProfile, setMyMasterProfile] = useState(null);
  const [showMasterModal, setShowMasterModal] = useState(false);
  const [masterForm, setMasterForm] = useState({
    displayName: '',
    description: '',
    tradingAccountId: ''
  });
  const [applyingMaster, setApplyingMaster] = useState(false);
  
  // Edit subscription states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState(null);
  const [editCopyMode, setEditCopyMode] = useState('FIXED_LOT');
  const [editCopyValue, setEditCopyValue] = useState('0.01');

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchAllData();
    }
  }, [user]);

  useEffect(() => {
    if (myMasterProfile?._id) {
      fetchMyFollowers();
    }
  }, [myMasterProfile]);

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

  const fetchAllData = async () => {
    try {
      await Promise.all([
        fetchMasters(),
        fetchMySubscriptions(),
        fetchMyCopyTrades(),
        fetchAccounts(),
        fetchMyMasterProfile()
      ]);
    } catch (e) {
      console.error('Error fetching data:', e);
    }
    setLoading(false);
    setRefreshing(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAllData();
  };

  const fetchMasters = async () => {
    try {
      const res = await fetch(`${API_URL}/copy/masters`);
      const data = await res.json();
      setMasters(data.masters || []);
    } catch (e) {
      console.error('Error fetching masters:', e);
    }
  };

  const fetchMySubscriptions = async () => {
    if (!user?._id) return;
    try {
      const res = await fetch(`${API_URL}/copy/my-subscriptions/${user._id}`);
      const data = await res.json();
      setMySubscriptions(data.subscriptions || []);
    } catch (e) {
      console.error('Error fetching subscriptions:', e);
    }
  };

  const fetchMyCopyTrades = async () => {
    if (!user?._id) return;
    try {
      const res = await fetch(`${API_URL}/copy/my-copy-trades/${user._id}?limit=50`);
      const data = await res.json();
      setMyCopyTrades(data.copyTrades || []);
    } catch (e) {
      console.error('Error fetching copy trades:', e);
    }
  };

  const fetchAccounts = async () => {
    if (!user?._id) return;
    try {
      const res = await fetch(`${API_URL}/trading-accounts/user/${user._id}`);
      const data = await res.json();
      setAccounts(data.accounts || []);
      if (data.accounts?.length > 0 && !selectedAccount) {
        setSelectedAccount(data.accounts[0]._id);
        setMasterForm(prev => ({ ...prev, tradingAccountId: data.accounts[0]._id }));
      }
    } catch (e) {
      console.error('Error fetching accounts:', e);
    }
  };

  const fetchMyMasterProfile = async () => {
    if (!user?._id) return;
    try {
      const res = await fetch(`${API_URL}/copy/master/my-profile/${user._id}`);
      const data = await res.json();
      if (data.master) {
        setMyMasterProfile(data.master);
      }
    } catch (e) {
      // User is not a master - that's okay
    }
  };

  const fetchMyFollowers = async () => {
    if (!myMasterProfile?._id) return;
    try {
      const res = await fetch(`${API_URL}/copy/my-followers/${myMasterProfile._id}`);
      const data = await res.json();
      setMyFollowers(data.followers || []);
    } catch (e) {
      console.error('Error fetching followers:', e);
    }
  };

  const handleApplyMaster = async () => {
    const accountId = masterForm.tradingAccountId || (accounts.length > 0 ? accounts[0]._id : '');
    
    if (!masterForm.displayName.trim()) {
      Alert.alert('Error', 'Please enter a display name');
      return;
    }
    if (!accountId) {
      Alert.alert('Error', 'Please select a trading account');
      return;
    }

    setApplyingMaster(true);
    try {
      const res = await fetch(`${API_URL}/copy/master/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user._id,
          displayName: masterForm.displayName,
          description: masterForm.description,
          tradingAccountId: accountId
        })
      });

      const data = await res.json();
      if (data.master) {
        Alert.alert('Success', 'Application submitted! Please wait for admin approval.');
        setShowMasterModal(false);
        fetchMyMasterProfile();
      } else {
        Alert.alert('Error', data.message || 'Failed to submit application');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to submit application');
    }
    setApplyingMaster(false);
  };

  const handleFollow = async () => {
    if (!selectedMaster || !selectedAccount) {
      Alert.alert('Error', 'Please select a trading account');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/copy/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          followerUserId: user._id,
          masterId: selectedMaster._id,
          followerAccountId: selectedAccount,
          copyMode,
          copyValue: parseFloat(copyValue)
        })
      });

      const data = await res.json();
      if (data.follower) {
        Alert.alert('Success', 'Successfully following master trader!');
        setShowFollowModal(false);
        setSelectedMaster(null);
        fetchMySubscriptions();
        fetchMasters();
      } else {
        Alert.alert('Error', data.message || 'Failed to follow');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to follow master');
    }
    setIsSubmitting(false);
  };

  const handlePauseResume = async (subscriptionId, currentStatus) => {
    const action = currentStatus === 'ACTIVE' ? 'pause' : 'resume';
    try {
      const res = await fetch(`${API_URL}/copy/follow/${subscriptionId}/${action}`, {
        method: 'PUT'
      });
      const data = await res.json();
      if (data.follower) {
        fetchMySubscriptions();
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to update subscription');
    }
  };

  const handleUnfollow = async (subscriptionId) => {
    Alert.alert(
      'Unfollow Master',
      'Are you sure you want to stop following this master?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfollow',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await fetch(`${API_URL}/copy/follow/${subscriptionId}/unfollow`, {
                method: 'DELETE'
              });
              const data = await res.json();
              if (data.success) {
                Alert.alert('Success', 'Successfully unfollowed master');
                fetchMySubscriptions();
                fetchMasters();
              } else {
                Alert.alert('Error', data.message || 'Failed to unfollow');
              }
            } catch (e) {
              Alert.alert('Error', 'Failed to unfollow');
            }
          }
        }
      ]
    );
  };

  const handleEditSubscription = (sub) => {
    setEditingSubscription(sub);
    setEditCopyMode(sub.copyMode || 'FIXED_LOT');
    setEditCopyValue(sub.copyValue?.toString() || '0.01');
    setShowEditModal(true);
  };

  const handleSaveSubscription = async () => {
    if (!editingSubscription) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/copy/follow/${editingSubscription._id}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          copyMode: editCopyMode,
          copyValue: parseFloat(editCopyValue)
        })
      });
      const data = await res.json();
      if (data.success || data.follower) {
        Alert.alert('Success', 'Subscription updated successfully!');
        setShowEditModal(false);
        setEditingSubscription(null);
        fetchMySubscriptions();
      } else {
        Alert.alert('Error', data.message || 'Failed to update subscription');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to update subscription');
    }
    setIsSubmitting(false);
  };

  const filteredMasters = masters.filter(m => 
    m.displayName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isFollowingMaster = (masterId) => {
    return mySubscriptions.some(sub => sub.masterId?._id === masterId || sub.masterId === masterId);
  };

  const getCopyModeLabel = (mode, value) => {
    switch (mode) {
      case 'FIXED_LOT': return `Fixed: ${value} lots`;
      case 'BALANCE_BASED': return 'Balance Based';
      case 'EQUITY_BASED': return 'Equity Based';
      case 'MULTIPLIER': return `Multiplier: ${value}x`;
      default: return mode;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#d4af37" />
      </View>
    );
  }

  const tabs = ['discover', 'subscriptions', 'trades'];
  if (myMasterProfile?.status === 'ACTIVE') {
    tabs.push('followers');
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Copy Trading</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#d4af37" />}
        showsVerticalScrollIndicator={false}
      >
        {/* Become a Master Banner */}
        {!myMasterProfile && (
          <TouchableOpacity style={styles.masterBanner} onPress={() => setShowMasterModal(true)}>
            <View style={styles.masterBannerIcon}>
              <Ionicons name="trophy" size={24} color="#d4af37" />
            </View>
            <View style={styles.masterBannerText}>
              <Text style={styles.masterBannerTitle}>Become a Master Trader</Text>
              <Text style={styles.masterBannerSub}>Share your trades and earn commission</Text>
            </View>
            <View style={styles.applyBtn}>
              <Text style={styles.applyBtnText}>Apply</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Master Status Banner */}
        {myMasterProfile && (
          <View style={[
            styles.masterStatusBanner,
            myMasterProfile.status === 'ACTIVE' ? styles.statusActive :
            myMasterProfile.status === 'PENDING' ? styles.statusPending : styles.statusRejected
          ]}>
            <View style={[
              styles.masterBannerIcon,
              myMasterProfile.status === 'ACTIVE' ? styles.iconActive :
              myMasterProfile.status === 'PENDING' ? styles.iconPending : styles.iconRejected
            ]}>
              <Ionicons name="trophy" size={24} color={
                myMasterProfile.status === 'ACTIVE' ? '#22c55e' :
                myMasterProfile.status === 'PENDING' ? '#eab308' : '#ef4444'
              } />
            </View>
            <View style={styles.masterBannerText}>
              <Text style={styles.masterBannerTitle}>{myMasterProfile.displayName}</Text>
              <Text style={styles.masterBannerSub}>
                <Text style={
                  myMasterProfile.status === 'ACTIVE' ? styles.statusTextActive :
                  myMasterProfile.status === 'PENDING' ? styles.statusTextPending : styles.statusTextRejected
                }>{myMasterProfile.status}</Text>
                {myMasterProfile.status === 'ACTIVE' && ` • ${myMasterProfile.stats?.activeFollowers || 0} followers`}
              </Text>
              {myMasterProfile.status === 'REJECTED' && myMasterProfile.rejectionReason && (
                <Text style={styles.rejectionReason}>Reason: {myMasterProfile.rejectionReason}</Text>
              )}
            </View>
            {myMasterProfile.status === 'ACTIVE' && (
              <Text style={styles.commissionText}>{myMasterProfile.approvedCommissionPercentage}%</Text>
            )}
          </View>
        )}

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
          <View style={styles.tabs}>
            {tabs.map(tab => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                  {tab === 'discover' ? 'Discover' :
                   tab === 'subscriptions' ? 'Subscriptions' :
                   tab === 'trades' ? 'Trades' : 'Followers'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Discover Tab */}
        {activeTab === 'discover' && (
          <View style={styles.listContainer}>
            {/* Search */}
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={18} color="#666" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search masters..."
                placeholderTextColor="#666"
                value={searchTerm}
                onChangeText={setSearchTerm}
              />
            </View>

            {filteredMasters.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={64} color="#333" />
                <Text style={styles.emptyTitle}>No Master Traders</Text>
                <Text style={styles.emptyText}>No master traders available yet</Text>
              </View>
            ) : (
              filteredMasters.map((master) => {
                const following = isFollowingMaster(master._id);
                return (
                  <View key={master._id} style={styles.masterCard}>
                    <View style={styles.masterHeader}>
                      <View style={styles.masterAvatar}>
                        <Text style={styles.avatarText}>{master.displayName?.charAt(0)}</Text>
                      </View>
                      <View style={styles.masterInfo}>
                        <Text style={styles.masterName}>{master.displayName}</Text>
                        <Text style={styles.masterFollowers}>{master.stats?.activeFollowers || 0} followers</Text>
                      </View>
                      {following && (
                        <View style={styles.followingBadge}>
                          <Text style={styles.followingBadgeText}>Following</Text>
                        </View>
                      )}
                    </View>
                    
                    <View style={styles.statsGrid}>
                      <View style={styles.statBox}>
                        <Text style={styles.statBoxLabel}>Win Rate</Text>
                        <Text style={styles.statBoxValue}>{master.stats?.winRate?.toFixed(1) || 0}%</Text>
                      </View>
                      <View style={styles.statBox}>
                        <Text style={styles.statBoxLabel}>Total Trades</Text>
                        <Text style={styles.statBoxValue}>{master.stats?.totalTrades || 0}</Text>
                      </View>
                      <View style={styles.statBox}>
                        <Text style={styles.statBoxLabel}>Commission</Text>
                        <Text style={styles.statBoxValue}>{master.approvedCommissionPercentage || 0}%</Text>
                      </View>
                      <View style={styles.statBox}>
                        <Text style={styles.statBoxLabel}>Profit</Text>
                        <Text style={[styles.statBoxValue, { color: '#22c55e' }]}>${master.stats?.totalProfitGenerated?.toFixed(2) || '0.00'}</Text>
                      </View>
                    </View>
                    
                    {following ? (
                      <TouchableOpacity style={styles.followingBtn} onPress={() => setActiveTab('subscriptions')}>
                        <Ionicons name="checkmark-circle" size={18} color="#d4af37" />
                        <Text style={styles.followingBtnText}>Following</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity 
                        style={styles.followBtn}
                        onPress={() => { setSelectedMaster(master); setShowFollowModal(true); }}
                      >
                        <Ionicons name="add-circle-outline" size={18} color="#000" />
                        <Text style={styles.followBtnText}>Follow</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* Subscriptions Tab */}
        {activeTab === 'subscriptions' && (
          <View style={styles.listContainer}>
            {mySubscriptions.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="link-outline" size={64} color="#333" />
                <Text style={styles.emptyTitle}>No Subscriptions</Text>
                <Text style={styles.emptyText}>You're not following any masters yet</Text>
                <TouchableOpacity style={styles.discoverBtn} onPress={() => setActiveTab('discover')}>
                  <Text style={styles.discoverBtnText}>Discover Masters →</Text>
                </TouchableOpacity>
              </View>
            ) : (
              mySubscriptions.map((sub) => (
                <View key={sub._id} style={styles.subscriptionCard}>
                  <View style={styles.subHeader}>
                    <View style={styles.masterAvatar}>
                      <Text style={styles.avatarText}>{sub.masterId?.displayName?.charAt(0)}</Text>
                    </View>
                    <View style={styles.subInfo}>
                      <Text style={styles.subMasterName}>{sub.masterId?.displayName}</Text>
                      <Text style={styles.subCopyMode}>{getCopyModeLabel(sub.copyMode, sub.copyValue)}</Text>
                    </View>
                    <View style={[
                      styles.statusBadge,
                      sub.status === 'ACTIVE' ? styles.statusBadgeActive :
                      sub.status === 'PAUSED' ? styles.statusBadgePaused : styles.statusBadgeStopped
                    ]}>
                      <Text style={[
                        styles.statusBadgeText,
                        sub.status === 'ACTIVE' ? styles.statusBadgeTextActive :
                        sub.status === 'PAUSED' ? styles.statusBadgeTextPaused : styles.statusBadgeTextStopped
                      ]}>{sub.status}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.subStatsGrid}>
                    <View style={styles.subStatBox}>
                      <Text style={styles.subStatLabel}>Total Trades</Text>
                      <Text style={styles.subStatValue}>{sub.stats?.totalCopiedTrades || 0}</Text>
                    </View>
                    <View style={styles.subStatBox}>
                      <Text style={styles.subStatLabel}>Open / Closed</Text>
                      <Text style={styles.subStatValue}>
                        <Text style={{ color: '#3b82f6' }}>{sub.stats?.openTrades || 0}</Text>
                        {' / '}
                        <Text style={{ color: '#888' }}>{sub.stats?.closedTrades || 0}</Text>
                      </Text>
                    </View>
                    <View style={styles.subStatBox}>
                      <Text style={styles.subStatLabel}>Profit</Text>
                      <Text style={[styles.subStatValue, { color: '#22c55e' }]}>+${(sub.stats?.totalProfit || 0).toFixed(2)}</Text>
                    </View>
                    <View style={styles.subStatBox}>
                      <Text style={styles.subStatLabel}>Loss</Text>
                      <Text style={[styles.subStatValue, { color: '#ef4444' }]}>-${(sub.stats?.totalLoss || 0).toFixed(2)}</Text>
                    </View>
                    <View style={styles.subStatBox}>
                      <Text style={styles.subStatLabel}>Net P&L</Text>
                      <Text style={[styles.subStatValue, { color: (sub.stats?.netPnl || 0) >= 0 ? '#22c55e' : '#ef4444' }]}>
                        {(sub.stats?.netPnl || 0) >= 0 ? '+' : ''}${(sub.stats?.netPnl || 0).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.subActions}>
                    <TouchableOpacity style={styles.editBtn} onPress={() => handleEditSubscription(sub)}>
                      <Ionicons name="settings-outline" size={18} color="#3b82f6" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.pauseBtn} onPress={() => handlePauseResume(sub._id, sub.status)}>
                      <Ionicons name={sub.status === 'ACTIVE' ? 'pause' : 'play'} size={18} color={sub.status === 'ACTIVE' ? '#eab308' : '#22c55e'} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.unfollowBtn} onPress={() => handleUnfollow(sub._id)}>
                      <Ionicons name="close" size={18} color="#ef4444" />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={styles.viewTradesBtn} 
                      onPress={() => {
                        const accountId = sub.followerAccountId?._id || sub.followerAccountId;
                        if (accountId) {
                          navigation.navigate('Trading', { accountId });
                        } else {
                          Alert.alert('Error', 'Copy trading account not found');
                        }
                      }}
                    >
                      <Text style={styles.viewTradesBtnText}>View Trades</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Trades Tab */}
        {activeTab === 'trades' && (
          <View style={styles.listContainer}>
            {myCopyTrades.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="trending-up-outline" size={64} color="#333" />
                <Text style={styles.emptyTitle}>No Copy Trades</Text>
                <Text style={styles.emptyText}>Your copied trades will appear here</Text>
              </View>
            ) : (
              myCopyTrades.map((trade) => (
                <View key={trade._id} style={styles.tradeCard}>
                  <View style={styles.tradeHeader}>
                    <View>
                      <Text style={styles.tradeSymbol}>{trade.symbol}</Text>
                      <Text style={styles.tradeMaster}>From: {trade.masterId?.displayName || '-'}</Text>
                    </View>
                    <View style={[styles.tradeSideBadge, { backgroundColor: trade.side === 'BUY' ? '#22c55e20' : '#ef444420' }]}>
                      <Text style={[styles.tradeSideText, { color: trade.side === 'BUY' ? '#22c55e' : '#ef4444' }]}>{trade.side}</Text>
                    </View>
                  </View>
                  <View style={styles.tradeDetails}>
                    <View style={styles.tradeDetailItem}>
                      <Text style={styles.tradeDetailLabel}>Lots</Text>
                      <Text style={styles.tradeDetailValue}>{trade.followerLotSize}</Text>
                    </View>
                    <View style={styles.tradeDetailItem}>
                      <Text style={styles.tradeDetailLabel}>Open</Text>
                      <Text style={styles.tradeDetailValue}>{trade.followerOpenPrice?.toFixed(5)}</Text>
                    </View>
                    <View style={styles.tradeDetailItem}>
                      <Text style={styles.tradeDetailLabel}>Close</Text>
                      <Text style={styles.tradeDetailValue}>{trade.followerClosePrice?.toFixed(5) || '-'}</Text>
                    </View>
                    <View style={styles.tradeDetailItem}>
                      <Text style={styles.tradeDetailLabel}>P/L</Text>
                      <Text style={[styles.tradeDetailValue, { color: (trade.followerPnl || 0) >= 0 ? '#22c55e' : '#ef4444' }]}>
                        {(trade.followerPnl || 0) >= 0 ? '+' : ''}${(trade.followerPnl || 0).toFixed(2)}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.tradeStatusBadge, { backgroundColor: trade.status === 'OPEN' ? '#3b82f620' : '#22c55e20' }]}>
                    <Text style={[styles.tradeStatusText, { color: trade.status === 'OPEN' ? '#3b82f6' : '#22c55e' }]}>{trade.status}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Followers Tab */}
        {activeTab === 'followers' && myMasterProfile?.status === 'ACTIVE' && (
          <View style={styles.listContainer}>
            {myFollowers.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={64} color="#333" />
                <Text style={styles.emptyTitle}>No Followers Yet</Text>
                <Text style={styles.emptyText}>Traders who follow you will appear here</Text>
              </View>
            ) : (
              myFollowers.map((follower) => (
                <View key={follower._id} style={styles.followerCard}>
                  <View style={styles.followerHeader}>
                    <View style={styles.masterAvatar}>
                      <Text style={styles.avatarText}>{follower.followerUserId?.firstName?.charAt(0)}</Text>
                    </View>
                    <View style={styles.followerInfo}>
                      <Text style={styles.followerName}>{follower.followerUserId?.firstName} {follower.followerUserId?.lastName}</Text>
                      <Text style={styles.followerEmail}>{follower.followerUserId?.email}</Text>
                      <Text style={styles.followerCopyMode}>{getCopyModeLabel(follower.copyMode, follower.copyValue)}</Text>
                    </View>
                    <View style={[
                      styles.statusBadge,
                      follower.status === 'ACTIVE' ? styles.statusBadgeActive : styles.statusBadgePaused
                    ]}>
                      <Text style={[
                        styles.statusBadgeText,
                        follower.status === 'ACTIVE' ? styles.statusBadgeTextActive : styles.statusBadgeTextPaused
                      ]}>{follower.status}</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Follow Modal */}
      <Modal visible={showFollowModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Follow Master</Text>
              <TouchableOpacity onPress={() => setShowFollowModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {selectedMaster && (
              <View style={styles.selectedMaster}>
                <View style={styles.masterAvatar}>
                  <Text style={styles.avatarText}>{selectedMaster.displayName?.charAt(0)}</Text>
                </View>
                <Text style={styles.selectedMasterName}>{selectedMaster.displayName}</Text>
              </View>
            )}

            <Text style={styles.inputLabel}>Select Your Account</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accountsScroll}>
              {accounts.map((acc) => (
                <TouchableOpacity
                  key={acc._id}
                  style={[styles.accountCard, selectedAccount === acc._id && styles.accountCardActive]}
                  onPress={() => setSelectedAccount(acc._id)}
                >
                  <Text style={[styles.accountNumber, selectedAccount === acc._id && { color: '#000' }]}>{acc.accountId}</Text>
                  <Text style={[styles.accountBalance, selectedAccount === acc._id && { color: '#000' }]}>${(acc.balance || 0).toLocaleString()}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.inputLabel}>Copy Mode</Text>
            <View style={styles.copyModeRow}>
              {['FIXED_LOT', 'MULTIPLIER'].map(mode => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.copyModeBtn, copyMode === mode && styles.copyModeBtnActive]}
                  onPress={() => setCopyMode(mode)}
                >
                  <Text style={[styles.copyModeText, copyMode === mode && styles.copyModeTextActive]}>
                    {mode === 'FIXED_LOT' ? 'Fixed Lot' : 'Multiplier'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>{copyMode === 'FIXED_LOT' ? 'Lot Size' : 'Multiplier'}</Text>
            <TextInput
              style={styles.input}
              value={copyValue}
              onChangeText={setCopyValue}
              placeholder={copyMode === 'FIXED_LOT' ? '0.01' : '1'}
              placeholderTextColor="#666"
              keyboardType="numeric"
            />
            <Text style={styles.inputHint}>
              {copyMode === 'FIXED_LOT' ? 'Fixed lot size for all copied trades' : '1 = Same size, 0.5 = Half, 2 = Double'}
            </Text>

            <TouchableOpacity 
              style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]} 
              onPress={handleFollow}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.submitBtnText}>Start Following</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Become Master Modal */}
      <Modal visible={showMasterModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Become a Master</Text>
              <TouchableOpacity onPress={() => setShowMasterModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Display Name *</Text>
            <TextInput
              style={styles.input}
              value={masterForm.displayName}
              onChangeText={(text) => setMasterForm(prev => ({ ...prev, displayName: text }))}
              placeholder="Your trading name"
              placeholderTextColor="#666"
            />

            <Text style={styles.inputLabel}>Description</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              value={masterForm.description}
              onChangeText={(text) => setMasterForm(prev => ({ ...prev, description: text }))}
              placeholder="Describe your trading strategy..."
              placeholderTextColor="#666"
              multiline
            />

            <Text style={styles.inputLabel}>Trading Account</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accountsScroll}>
              {accounts.map((acc) => (
                <TouchableOpacity
                  key={acc._id}
                  style={[styles.accountCard, masterForm.tradingAccountId === acc._id && styles.accountCardActive]}
                  onPress={() => setMasterForm(prev => ({ ...prev, tradingAccountId: acc._id }))}
                >
                  <Text style={[styles.accountNumber, masterForm.tradingAccountId === acc._id && { color: '#000' }]}>{acc.accountId}</Text>
                  <Text style={[styles.accountBalance, masterForm.tradingAccountId === acc._id && { color: '#000' }]}>${(acc.balance || 0).toLocaleString()}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Commission Info - Fixed 50/50 Split */}
            <View style={styles.commissionInfoBox}>
              <Text style={styles.commissionInfoTitle}>Commission Structure (Fixed)</Text>
              <View style={styles.commissionSplit}>
                <View style={styles.commissionItem}>
                  <Text style={styles.commissionPercent}>50%</Text>
                  <Text style={styles.commissionLabel}>You (Master)</Text>
                </View>
                <Text style={styles.commissionDivider}>|</Text>
                <View style={styles.commissionItem}>
                  <Text style={[styles.commissionPercent, { color: '#3B82F6' }]}>50%</Text>
                  <Text style={styles.commissionLabel}>Follower Keeps</Text>
                </View>
              </View>
              <Text style={styles.commissionNote}>Commission is automatically split 50/50 on profitable trades</Text>
            </View>

            <TouchableOpacity 
              style={[styles.submitBtn, applyingMaster && styles.submitBtnDisabled]} 
              onPress={handleApplyMaster}
              disabled={applyingMaster}
            >
              {applyingMaster ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.submitBtnText}>Submit Application</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit Subscription Modal */}
      <Modal visible={showEditModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Subscription</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {editingSubscription && (
              <View style={styles.selectedMaster}>
                <View style={styles.masterAvatar}>
                  <Text style={styles.avatarText}>{editingSubscription.masterId?.displayName?.charAt(0)}</Text>
                </View>
                <Text style={styles.selectedMasterName}>{editingSubscription.masterId?.displayName}</Text>
              </View>
            )}

            <Text style={styles.inputLabel}>Copy Mode</Text>
            <View style={styles.copyModeRow}>
              {['FIXED_LOT', 'MULTIPLIER'].map(mode => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.copyModeBtn, editCopyMode === mode && styles.copyModeBtnActive]}
                  onPress={() => setEditCopyMode(mode)}
                >
                  <Text style={[styles.copyModeText, editCopyMode === mode && styles.copyModeTextActive]}>
                    {mode === 'FIXED_LOT' ? 'Fixed Lot' : 'Multiplier'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>{editCopyMode === 'FIXED_LOT' ? 'Lot Size' : 'Multiplier'}</Text>
            <TextInput
              style={styles.input}
              value={editCopyValue}
              onChangeText={setEditCopyValue}
              placeholder={editCopyMode === 'FIXED_LOT' ? '0.01' : '1'}
              placeholderTextColor="#666"
              keyboardType="numeric"
            />

            <TouchableOpacity 
              style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]} 
              onPress={handleSaveSubscription}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.submitBtnText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  loadingContainer: { flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' },
  
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16 },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  
  // Master Banner
  masterBanner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12, padding: 16, backgroundColor: '#d4af3720', borderRadius: 16, borderWidth: 1, borderColor: '#d4af3750' },
  masterStatusBanner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 16, borderWidth: 1 },
  masterBannerIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#d4af3730', justifyContent: 'center', alignItems: 'center' },
  masterBannerText: { flex: 1, marginLeft: 12 },
  masterBannerTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  masterBannerSub: { color: '#888', fontSize: 12, marginTop: 2 },
  commissionText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  applyBtn: { backgroundColor: '#d4af37', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  applyBtnText: { color: '#000', fontSize: 13, fontWeight: '600' },
  
  // Status Banners
  statusActive: { backgroundColor: '#22c55e20', borderColor: '#22c55e50' },
  statusPending: { backgroundColor: '#eab30820', borderColor: '#eab30850' },
  statusRejected: { backgroundColor: '#ef444420', borderColor: '#ef444450' },
  iconActive: { backgroundColor: '#22c55e30' },
  iconPending: { backgroundColor: '#eab30830' },
  iconRejected: { backgroundColor: '#ef444430' },
  statusTextActive: { color: '#22c55e' },
  statusTextPending: { color: '#eab308' },
  statusTextRejected: { color: '#ef4444' },
  rejectionReason: { color: '#ef4444', fontSize: 11, marginTop: 4 },
  
  // Tabs
  tabsScroll: { maxHeight: 50, marginBottom: 8 },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, gap: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: '#111' },
  tabActive: { backgroundColor: '#d4af37' },
  tabText: { color: '#666', fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: '#000' },
  
  listContainer: { padding: 16 },
  
  // Search
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16, borderWidth: 1, borderColor: '#222' },
  searchInput: { flex: 1, marginLeft: 10, color: '#fff', fontSize: 14 },
  
  // Empty State
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '600', marginTop: 16 },
  emptyText: { color: '#666', fontSize: 14, marginTop: 8, textAlign: 'center' },
  discoverBtn: { marginTop: 16 },
  discoverBtnText: { color: '#d4af37', fontSize: 14, fontWeight: '600' },
  
  // Master Card
  masterCard: { backgroundColor: '#111', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#222' },
  masterHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  masterAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#d4af3730', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#d4af37', fontSize: 18, fontWeight: 'bold' },
  masterInfo: { flex: 1, marginLeft: 12 },
  masterName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  masterFollowers: { color: '#666', fontSize: 12, marginTop: 2 },
  followingBadge: { backgroundColor: '#22c55e20', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  followingBadgeText: { color: '#22c55e', fontSize: 11, fontWeight: '600' },
  
  // Stats Grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statBox: { flex: 1, minWidth: '45%', backgroundColor: '#0a0a0a', borderRadius: 10, padding: 12 },
  statBoxLabel: { color: '#666', fontSize: 11 },
  statBoxValue: { color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 4 },
  
  // Follow Button
  followBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#d4af37', paddingVertical: 12, borderRadius: 10 },
  followBtnText: { color: '#000', fontSize: 14, fontWeight: '600' },
  followingBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#22c55e20', paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#22c55e50' },
  followingBtnText: { color: '#22c55e', fontSize: 14, fontWeight: '600' },
  
  // Subscription Card
  subscriptionCard: { backgroundColor: '#111', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#222' },
  subHeader: { flexDirection: 'row', alignItems: 'center' },
  subInfo: { flex: 1, marginLeft: 12 },
  subMasterName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  subCopyMode: { color: '#666', fontSize: 12, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  statusBadgeActive: { backgroundColor: '#22c55e20' },
  statusBadgeTextActive: { color: '#22c55e' },
  statusBadgePaused: { backgroundColor: '#eab30820' },
  statusBadgeTextPaused: { color: '#eab308' },
  statusBadgeStopped: { backgroundColor: '#ef444420' },
  statusBadgeTextStopped: { color: '#ef4444' },
  
  // Sub Stats Grid
  subStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderColor: '#222', gap: 8 },
  subStatBox: { width: '30%', alignItems: 'center', marginBottom: 8 },
  subStatLabel: { color: '#666', fontSize: 10 },
  subStatValue: { color: '#fff', fontSize: 13, fontWeight: '600', marginTop: 4 },
  
  // Sub Actions
  subActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
  editBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#3b82f620', justifyContent: 'center', alignItems: 'center' },
  pauseBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#eab30820', justifyContent: 'center', alignItems: 'center' },
  unfollowBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#ef444420', justifyContent: 'center', alignItems: 'center' },
  viewTradesBtn: { paddingHorizontal: 12, height: 36, borderRadius: 10, backgroundColor: '#d4af37', justifyContent: 'center', alignItems: 'center' },
  viewTradesBtnText: { color: '#000', fontSize: 12, fontWeight: '600' },
  
  // Trade Card
  tradeCard: { backgroundColor: '#111', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#222' },
  tradeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  tradeSymbol: { color: '#fff', fontSize: 16, fontWeight: '600' },
  tradeMaster: { color: '#666', fontSize: 12, marginTop: 2 },
  tradeSideBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  tradeSideText: { fontSize: 12, fontWeight: '600' },
  tradeDetails: { flexDirection: 'row', gap: 8 },
  tradeDetailItem: { flex: 1, alignItems: 'center' },
  tradeDetailLabel: { color: '#666', fontSize: 10 },
  tradeDetailValue: { color: '#fff', fontSize: 13, fontWeight: '500', marginTop: 4 },
  tradeStatusBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 12 },
  tradeStatusText: { fontSize: 11, fontWeight: '600' },
  
  // Follower Card
  followerCard: { backgroundColor: '#111', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#222' },
  followerHeader: { flexDirection: 'row', alignItems: 'center' },
  followerInfo: { flex: 1, marginLeft: 12 },
  followerName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  followerEmail: { color: '#666', fontSize: 12, marginTop: 2 },
  followerCopyMode: { color: '#888', fontSize: 11, marginTop: 4 },
  
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#111', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  
  selectedMaster: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0a0a0a', padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#222' },
  selectedMasterName: { color: '#fff', fontSize: 16, fontWeight: '600', marginLeft: 12 },
  
  inputLabel: { color: '#888', fontSize: 12, marginBottom: 8, marginTop: 16 },
  accountsScroll: { marginBottom: 8 },
  accountCard: { backgroundColor: '#0a0a0a', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, marginRight: 8, minWidth: 120, borderWidth: 1, borderColor: '#222' },
  accountCardActive: { backgroundColor: '#d4af37', borderColor: '#d4af37' },
  accountNumber: { color: '#fff', fontSize: 14, fontWeight: '600' },
  accountBalance: { color: '#666', fontSize: 12, marginTop: 4 },
  
  // Copy Mode
  copyModeRow: { flexDirection: 'row', gap: 8 },
  copyModeBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#0a0a0a', alignItems: 'center', borderWidth: 1, borderColor: '#222' },
  copyModeBtnActive: { backgroundColor: '#d4af3720', borderColor: '#d4af37' },
  copyModeText: { color: '#666', fontSize: 13, fontWeight: '500' },
  copyModeTextActive: { color: '#d4af37' },
  
  input: { backgroundColor: '#0a0a0a', borderRadius: 12, padding: 16, color: '#fff', fontSize: 16, borderWidth: 1, borderColor: '#222' },
  inputHint: { color: '#666', fontSize: 12, marginTop: 8 },
  
  submitBtn: { backgroundColor: '#d4af37', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
  
  // Commission Info Box (Fixed 50/50 Split)
  commissionInfoBox: { backgroundColor: '#22c55e15', borderRadius: 12, padding: 16, marginTop: 16, borderWidth: 1, borderColor: '#22c55e30' },
  commissionInfoTitle: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 12, textAlign: 'center' },
  commissionSplit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  commissionItem: { flex: 1, alignItems: 'center' },
  commissionPercent: { color: '#22c55e', fontSize: 24, fontWeight: 'bold' },
  commissionLabel: { color: '#888', fontSize: 11, marginTop: 4 },
  commissionDivider: { color: '#444', fontSize: 20, marginHorizontal: 16 },
  commissionNote: { color: '#888', fontSize: 11, textAlign: 'center', marginTop: 12 },
});

export default CopyTradeScreen;
