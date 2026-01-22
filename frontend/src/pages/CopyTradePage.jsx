import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  LayoutDashboard, User, Wallet, Users, Copy, UserCircle, HelpCircle, FileText, LogOut,
  TrendingUp, Pause, Play, X, Search, DollarSign,
  ArrowLeft, Home, Sun, Moon
} from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import logo from '../assets/logo.png'

import { API_URL } from '../config/api'

const CopyTradePage = () => {
  const navigate = useNavigate()
  const { isDarkMode, toggleDarkMode } = useTheme()
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState('discover')
  const [masters, setMasters] = useState([])
  const [mySubscriptions, setMySubscriptions] = useState([])
  const [myCopyTrades, setMyCopyTrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [showFollowModal, setShowFollowModal] = useState(false)
  const [selectedMaster, setSelectedMaster] = useState(null)
  const [copyMode, setCopyMode] = useState('FIXED_LOT')
  const [copyValue, setCopyValue] = useState('0.01')
  const [depositAmount, setDepositAmount] = useState('')
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [walletBalance, setWalletBalance] = useState(0)
  const [challengeModeEnabled, setChallengeModeEnabled] = useState(false)
  
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  
  // Edit subscription states
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingSubscription, setEditingSubscription] = useState(null)
  const [editAccount, setEditAccount] = useState('')
  const [editCopyMode, setEditCopyMode] = useState('FIXED_LOT')
  const [editCopyValue, setEditCopyValue] = useState('0.01')

  const user = JSON.parse(localStorage.getItem('user') || '{}')

  const menuItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { name: 'Account', icon: User, path: '/account' },
    { name: 'Wallet', icon: Wallet, path: '/wallet' },
    { name: 'Orders', icon: FileText, path: '/orders' },
    { name: 'IB', icon: Users, path: '/ib' },
    { name: 'Copytrade', icon: Copy, path: '/copytrade' },
    { name: 'Profile', icon: UserCircle, path: '/profile' },
    { name: 'Support', icon: HelpCircle, path: '/support' },
    { name: 'Instructions', icon: FileText, path: '/instructions' },
  ]

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    fetchChallengeStatus()
    fetchMasters()
    fetchMySubscriptions()
    fetchMyCopyTrades()
    fetchAccounts()
    fetchWalletBalance()
  }, [])


  const fetchChallengeStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/prop/status`)
      const data = await res.json()
      if (data.success) setChallengeModeEnabled(data.enabled)
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const fetchMasters = async () => {
    try {
      const res = await fetch(`${API_URL}/copy/masters`)
      const data = await res.json()
      setMasters(data.masters || [])
    } catch (error) {
      console.error('Error fetching masters:', error)
    }
    setLoading(false)
  }

  const fetchMySubscriptions = async () => {
    try {
      const res = await fetch(`${API_URL}/copy/my-subscriptions/${user._id}`)
      const data = await res.json()
      setMySubscriptions(data.subscriptions || [])
    } catch (error) {
      console.error('Error fetching subscriptions:', error)
    }
  }

  const fetchMyCopyTrades = async () => {
    try {
      const res = await fetch(`${API_URL}/copy/my-copy-trades/${user._id}?limit=50`)
      const data = await res.json()
      setMyCopyTrades(data.copyTrades || [])
    } catch (error) {
      console.error('Error fetching copy trades:', error)
    }
  }

  const fetchAccounts = async () => {
    try {
      const res = await fetch(`${API_URL}/trading-accounts/user/${user._id}`)
      const data = await res.json()
      setAccounts(data.accounts || [])
      if (data.accounts?.length > 0) {
        setSelectedAccount(data.accounts[0]._id)
        setMasterForm(prev => ({ ...prev, tradingAccountId: data.accounts[0]._id }))
      }
    } catch (error) {
      console.error('Error fetching accounts:', error)
    }
  }

  const fetchWalletBalance = async () => {
    try {
      const res = await fetch(`${API_URL}/wallet/${user._id}`)
      const data = await res.json()
      setWalletBalance(data.wallet?.balance || 0)
    } catch (error) {
      console.error('Error fetching wallet balance:', error)
    }
  }


  const handleFollow = async () => {
    if (!selectedMaster) return

    const deposit = parseFloat(depositAmount) || 0
    const minDeposit = selectedMaster.minimumFollowerDeposit || 0

    if (deposit < minDeposit) {
      alert(`Minimum deposit of $${minDeposit} required to follow this master`)
      return
    }

    if (deposit > walletBalance) {
      alert(`Insufficient wallet balance. You have $${walletBalance}, need $${deposit}`)
      return
    }

    try {
      const res = await fetch(`${API_URL}/copy/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          followerUserId: user._id,
          masterId: selectedMaster._id,
          depositAmount: deposit,
          copyMode,
          copyValue: parseFloat(copyValue)
        })
      })

      const data = await res.json()
      if (data.success) {
        alert(`Successfully following ${selectedMaster.displayName}! A copy trading account has been created with $${deposit} credit.`)
        setShowFollowModal(false)
        setDepositAmount('')
        fetchMySubscriptions()
        fetchWalletBalance()
        fetchAccounts()
      } else {
        if (data.code === 'INSUFFICIENT_WALLET') {
          alert(`Insufficient wallet balance. You have $${data.current}, need $${data.required}`)
        } else if (data.code === 'INSUFFICIENT_DEPOSIT') {
          alert(`Minimum deposit of $${data.required} required. You entered $${data.provided}`)
        } else {
          alert(data.message || 'Failed to follow')
        }
      }
    } catch (error) {
      console.error('Error following master:', error)
      alert('Failed to follow master')
    }
  }

  const handlePauseResume = async (subscriptionId, currentStatus) => {
    const action = currentStatus === 'ACTIVE' ? 'pause' : 'resume'
    try {
      const res = await fetch(`${API_URL}/copy/follow/${subscriptionId}/${action}`, {
        method: 'PUT'
      })
      const data = await res.json()
      if (data.follower) {
        fetchMySubscriptions()
      }
    } catch (error) {
      console.error('Error updating subscription:', error)
    }
  }

  const handleStop = async (subscriptionId) => {
    if (!confirm('Are you sure you want to stop following this master?')) return

    try {
      const res = await fetch(`${API_URL}/copy/follow/${subscriptionId}/stop`, {
        method: 'PUT'
      })
      const data = await res.json()
      if (data.follower) {
        fetchMySubscriptions()
      }
    } catch (error) {
      console.error('Error stopping subscription:', error)
    }
  }

  const handleEditSubscription = (sub) => {
    setEditingSubscription(sub)
    setEditAccount(sub.followerAccountId?._id || sub.followerAccountId || '')
    setEditCopyMode(sub.copyMode || 'FIXED_LOT')
    setEditCopyValue(sub.copyValue?.toString() || '0.01')
    setShowEditModal(true)
  }

  const handleSaveSubscription = async () => {
    if (!editingSubscription) return

    try {
      const res = await fetch(`${API_URL}/copy/follow/${editingSubscription._id}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          followerAccountId: editAccount,
          copyMode: editCopyMode,
          copyValue: parseFloat(editCopyValue)
        })
      })
      const data = await res.json()
      if (data.success || data.follower) {
        alert('Subscription updated successfully!')
        setShowEditModal(false)
        setEditingSubscription(null)
        fetchMySubscriptions()
      } else {
        alert(data.message || 'Failed to update subscription')
      }
    } catch (error) {
      console.error('Error updating subscription:', error)
      alert('Failed to update subscription')
    }
  }

  const handleUnfollow = async (subscriptionId) => {
    if (!confirm('Are you sure you want to unfollow this master? This will stop all future copy trades.')) return

    try {
      const res = await fetch(`${API_URL}/copy/follow/${subscriptionId}/unfollow`, {
        method: 'DELETE'
      })
      const data = await res.json()
      if (data.success) {
        alert('Successfully unfollowed master')
        fetchMySubscriptions()
      } else {
        alert(data.message || 'Failed to unfollow')
      }
    } catch (error) {
      console.error('Error unfollowing:', error)
      alert('Failed to unfollow master')
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/user/login')
  }

  const filteredMasters = masters.filter(m => 
    m.displayName?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className={`min-h-screen flex flex-col md:flex-row transition-colors duration-300 ${isDarkMode ? 'bg-dark-900' : 'bg-gray-100'}`}>
      {/* Mobile Header */}
      {isMobile && (
        <header className={`fixed top-0 left-0 right-0 z-40 px-4 py-3 flex items-center gap-4 ${isDarkMode ? 'bg-dark-800 border-b border-gray-800' : 'bg-white border-b border-gray-200'}`}>
          <button onClick={() => navigate('/mobile')} className={`p-2 -ml-2 rounded-lg ${isDarkMode ? 'hover:bg-dark-700' : 'hover:bg-gray-100'}`}>
            <ArrowLeft size={22} className={isDarkMode ? 'text-white' : 'text-gray-900'} />
          </button>
          <h1 className={`font-semibold text-lg flex-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Copy Trading</h1>
          <button onClick={toggleDarkMode} className={`p-2 rounded-lg ${isDarkMode ? 'text-yellow-400 hover:bg-dark-700' : 'text-blue-500 hover:bg-gray-100'}`}>
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button onClick={() => navigate('/mobile')} className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-dark-700' : 'hover:bg-gray-100'}`}>
            <Home size={20} className="text-gray-400" />
          </button>
        </header>
      )}

      {/* Sidebar - Hidden on Mobile */}
      {!isMobile && (
        <aside 
          className={`${sidebarExpanded ? 'w-48' : 'w-16'} ${isDarkMode ? 'bg-dark-900 border-gray-800' : 'bg-white border-gray-200'} border-r flex flex-col transition-all duration-300`}
          onMouseEnter={() => setSidebarExpanded(true)}
          onMouseLeave={() => setSidebarExpanded(false)}
        >
          <div className="p-4 flex items-center justify-center">
            <img src={logo} alt="ProfitVisionFX" className="h-12 object-contain" />
          </div>
          <nav className="flex-1 px-2">
            {menuItems.map((item) => (
              <button
                key={item.name}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-colors ${
                  item.name === 'Copytrade' ? 'bg-accent-green text-black' : isDarkMode ? 'text-gray-400 hover:text-white hover:bg-dark-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <item.icon size={18} className="flex-shrink-0" />
                {sidebarExpanded && <span className="text-sm font-medium">{item.name}</span>}
              </button>
            ))}
          </nav>
          <div className={`p-2 border-t ${isDarkMode ? 'border-gray-800' : 'border-gray-200'}`}>
            <button onClick={toggleDarkMode} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 ${isDarkMode ? 'text-yellow-400 hover:bg-dark-700' : 'text-blue-500 hover:bg-gray-100'}`}>
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
              {sidebarExpanded && <span className="text-sm">{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>}
            </button>
            <button onClick={handleLogout} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg ${isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>
              <LogOut size={18} />
              {sidebarExpanded && <span className="text-sm">Log Out</span>}
            </button>
          </div>
        </aside>
      )}

      {/* Main Content */}
      <main className={`flex-1 overflow-auto ${isMobile ? 'pt-14' : ''}`}>
        {!isMobile && (
          <header className={`flex items-center justify-between px-6 py-4 border-b ${isDarkMode ? 'border-gray-800' : 'border-gray-200'}`}>
            <h1 className={`text-xl font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Copy Trading</h1>
          </header>
        )}

        <div className={`${isMobile ? 'p-4' : 'p-6'}`}>
          {/* Copy Trading Info Banner */}
          <div className={`bg-gradient-to-r from-accent-green/20 to-blue-500/20 rounded-xl ${isMobile ? 'p-4' : 'p-5'} border border-accent-green/30 mb-4`}>
            <div className={`${isMobile ? 'flex flex-col gap-3' : 'flex items-center justify-between'}`}>
              <div className="flex items-center gap-3">
                <div className={`${isMobile ? 'w-10 h-10' : 'w-12 h-12'} bg-accent-green/20 rounded-full flex items-center justify-center`}>
                  <Copy size={isMobile ? 20 : 24} className="text-accent-green" />
                </div>
                <div>
                  <h3 className={`${isDarkMode ? 'text-white' : 'text-gray-900'} font-semibold ${isMobile ? 'text-sm' : ''}`}>Copy Trading</h3>
                  <p className="text-gray-400 text-xs">Follow our expert trader and copy their trades automatically</p>
                </div>
              </div>
              <div className={`${isMobile ? 'w-full' : ''} px-4 py-2 bg-accent-green/10 border border-accent-green/30 rounded-lg`}>
                <p className="text-accent-green text-sm font-medium text-center">50/50 Profit Split</p>
                <p className="text-gray-400 text-xs text-center">You keep 50% of profits</p>
              </div>
            </div>
          </div>

          {/* Tabs - Scrollable on mobile */}
          <div className={`flex ${isMobile ? 'gap-2 overflow-x-auto pb-2' : 'gap-4'} mb-4`}>
            {['discover', 'subscriptions', 'trades'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`${isMobile ? 'px-3 py-1.5 text-xs whitespace-nowrap' : 'px-4 py-2'} rounded-lg font-medium transition-colors ${
                  activeTab === tab ? 'bg-accent-green text-black' : isDarkMode ? 'bg-dark-800 text-gray-400 hover:text-white' : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-200'
                }`}
              >
                {tab === 'discover' ? 'Discover' : 
                 tab === 'subscriptions' ? 'Subscriptions' : 'Trades'}
              </button>
            ))}
          </div>

          {/* Discover Masters */}
          {activeTab === 'discover' && (
            <div>
              <div className={`flex ${isMobile ? 'gap-2' : 'gap-4'} mb-4`}>
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                  <input
                    type="text"
                    placeholder="Search masters..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={`w-full rounded-lg pl-9 pr-3 ${isMobile ? 'py-2 text-sm' : 'py-2'} ${isDarkMode ? 'bg-dark-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-900'} border`}
                  />
                </div>
              </div>

              {loading ? (
                <div className="text-center py-12 text-gray-500">Loading masters...</div>
              ) : filteredMasters.length === 0 ? (
                <div className="text-center py-12">
                  <Copy size={48} className="mx-auto text-gray-600 mb-4" />
                  <p className="text-gray-500">No master traders available yet</p>
                  <p className="text-gray-600 text-sm mt-2">Check back later for trading experts to follow</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredMasters.map(master => {
                    const isFollowing = mySubscriptions.some(sub => sub.masterId?._id === master._id || sub.masterId === master._id)
                    return (
                      <div key={master._id} className={`${isDarkMode ? 'bg-dark-800 border-gray-800' : 'bg-white border-gray-200 shadow-sm'} rounded-xl p-5 border`}>
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-12 h-12 bg-accent-green/20 rounded-full flex items-center justify-center">
                            <span className="text-accent-green font-bold">{master.displayName?.charAt(0)}</span>
                          </div>
                          <div className="flex-1">
                            <h3 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{master.displayName}</h3>
                            <p className="text-gray-500 text-sm">{master.stats?.activeFollowers || 0} followers</p>
                          </div>
                          {isFollowing && (
                            <span className="px-2 py-1 bg-green-500/20 text-green-500 text-xs rounded-full font-medium">
                              Following
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <div className={`${isDarkMode ? 'bg-dark-700' : 'bg-gray-50'} rounded-lg p-3`}>
                            <p className="text-gray-500 text-xs">Win Rate</p>
                            <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{master.stats?.winRate?.toFixed(1) || 0}%</p>
                          </div>
                          <div className={`${isDarkMode ? 'bg-dark-700' : 'bg-gray-50'} rounded-lg p-3`}>
                            <p className="text-gray-500 text-xs">Total Trades</p>
                            <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{master.stats?.totalTrades || 0}</p>
                          </div>
                          <div className={`${isDarkMode ? 'bg-dark-700' : 'bg-gray-50'} rounded-lg p-3`}>
                            <p className="text-gray-500 text-xs">Commission</p>
                            <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{master.totalCommissionPercentage || master.approvedCommissionPercentage || 0}%</p>
                          </div>
                          <div className={`${isDarkMode ? 'bg-dark-700' : 'bg-gray-50'} rounded-lg p-3`}>
                            <p className="text-gray-500 text-xs">Profit</p>
                            <p className="text-accent-green font-semibold">${master.stats?.totalProfitGenerated?.toFixed(2) || '0.00'}</p>
                          </div>
                        </div>
                        {master.minimumFollowerDeposit > 0 && (
                          <div className="mb-3 px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                            <p className="text-yellow-500 text-xs font-medium">
                              Min. Deposit Required: ${master.minimumFollowerDeposit}
                            </p>
                          </div>
                        )}
                        {isFollowing ? (
                          <button
                            onClick={() => setActiveTab('subscriptions')}
                            className="w-full bg-green-500/20 text-green-500 py-2 rounded-lg font-medium border border-green-500/50 hover:bg-green-500/30"
                          >
                            ✓ Following
                          </button>
                        ) : (
                          <button
                            onClick={() => { setSelectedMaster(master); setShowFollowModal(true) }}
                            className="w-full bg-accent-green text-black py-2 rounded-lg font-medium hover:bg-accent-green/90"
                          >
                            Follow
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* My Subscriptions */}
          {activeTab === 'subscriptions' && (
            <div>
              {mySubscriptions.length === 0 ? (
                <div className="text-center py-12">
                  <Users size={48} className="mx-auto text-gray-600 mb-4" />
                  <p className="text-gray-500">You're not following any masters yet</p>
                  <button onClick={() => setActiveTab('discover')} className="mt-4 text-accent-green hover:underline">
                    Discover Masters →
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {mySubscriptions.map(sub => (
                    <div key={sub._id} className={`${isDarkMode ? 'bg-dark-800 border-gray-800' : 'bg-white border-gray-200 shadow-sm'} rounded-xl p-5 border`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-accent-green/20 rounded-full flex items-center justify-center">
                            <span className="text-accent-green font-bold">{sub.masterId?.displayName?.charAt(0)}</span>
                          </div>
                          <div>
                            <h3 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{sub.masterId?.displayName}</h3>
                            <p className="text-gray-500 text-sm">
                              {sub.copyMode === 'FIXED_LOT' && `Fixed: ${sub.copyValue} lots`}
                              {sub.copyMode === 'BALANCE_BASED' && 'Balance Based'}
                              {sub.copyMode === 'EQUITY_BASED' && 'Equity Based'}
                              {sub.copyMode === 'MULTIPLIER' && `Multiplier: ${sub.copyValue}x`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            sub.status === 'ACTIVE' ? 'bg-green-500/20 text-green-500' : 
                            sub.status === 'PAUSED' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-red-500/20 text-red-500'
                          }`}>
                            {sub.status}
                          </span>
                          <button
                            onClick={() => handleEditSubscription(sub)}
                            className="p-2 bg-dark-700 rounded-lg hover:bg-blue-500/20"
                            title="Edit Settings"
                          >
                            <Star size={16} className="text-blue-500" />
                          </button>
                          <button
                            onClick={() => handlePauseResume(sub._id, sub.status)}
                            className="p-2 bg-dark-700 rounded-lg hover:bg-dark-600"
                            title={sub.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                          >
                            {sub.status === 'ACTIVE' ? <Pause size={16} className="text-yellow-500" /> : <Play size={16} className="text-green-500" />}
                          </button>
                          <button
                            onClick={() => handleUnfollow(sub._id)}
                            className="p-2 bg-dark-700 rounded-lg hover:bg-red-500/20"
                            title="Unfollow"
                          >
                            <X size={16} className="text-red-500" />
                          </button>
                        </div>
                      </div>
                      <div className={`grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4 pt-4 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                        <div>
                          <p className="text-gray-500 text-xs">Total Trades</p>
                          <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{sub.stats?.totalCopiedTrades || 0}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Open / Closed</p>
                          <p className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                            <span className="text-blue-400">{sub.stats?.openTrades || 0}</span>
                            {' / '}
                            <span className="text-gray-400">{sub.stats?.closedTrades || 0}</span>
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Total Profit</p>
                          <p className="text-green-500 font-semibold">+${(sub.stats?.totalProfit || 0).toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Total Loss</p>
                          <p className="text-red-500 font-semibold">-${(sub.stats?.totalLoss || 0).toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Net P&L</p>
                          <p className={`font-semibold ${(sub.stats?.netPnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {(sub.stats?.netPnl || 0) >= 0 ? '+' : ''}${(sub.stats?.netPnl || 0).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Copy Trades History */}
          {activeTab === 'trades' && (
            <div>
              {myCopyTrades.length === 0 ? (
                <div className="text-center py-12">
                  <TrendingUp size={48} className="mx-auto text-gray-600 mb-4" />
                  <p className="text-gray-500">No copy trades yet</p>
                </div>
              ) : (
                <div className={`${isDarkMode ? 'bg-dark-800 border-gray-800' : 'bg-white border-gray-200 shadow-sm'} rounded-xl border overflow-hidden`}>
                  <table className="w-full">
                    <thead className={isDarkMode ? 'bg-dark-700' : 'bg-gray-50'}>
                      <tr>
                        <th className={`text-left text-xs font-medium px-4 py-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Master</th>
                        <th className={`text-left text-xs font-medium px-4 py-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Symbol</th>
                        <th className={`text-left text-xs font-medium px-4 py-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Side</th>
                        <th className={`text-left text-xs font-medium px-4 py-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Lots</th>
                        <th className={`text-left text-xs font-medium px-4 py-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Open Price</th>
                        <th className={`text-left text-xs font-medium px-4 py-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Close Price</th>
                        <th className={`text-left text-xs font-medium px-4 py-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>P/L</th>
                        <th className={`text-left text-xs font-medium px-4 py-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myCopyTrades.map(trade => (
                        <tr key={trade._id} className={`border-t ${isDarkMode ? 'border-gray-800' : 'border-gray-200'}`}>
                          <td className={`px-4 py-3 text-sm ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{trade.masterId?.displayName || '-'}</td>
                          <td className={`px-4 py-3 text-sm ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{trade.symbol}</td>
                          <td className={`px-4 py-3 text-sm ${trade.side === 'BUY' ? 'text-green-500' : 'text-red-500'}`}>{trade.side}</td>
                          <td className="px-4 py-3 text-white text-sm">{trade.followerLotSize}</td>
                          <td className="px-4 py-3 text-white text-sm">{trade.followerOpenPrice?.toFixed(5)}</td>
                          <td className="px-4 py-3 text-white text-sm">{trade.followerClosePrice?.toFixed(5) || '-'}</td>
                          <td className={`px-4 py-3 text-sm font-medium ${trade.followerPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            ${trade.followerPnl?.toFixed(2) || '0.00'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs ${
                              trade.status === 'OPEN' ? 'bg-blue-500/20 text-blue-500' :
                              trade.status === 'CLOSED' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'
                            }`}>
                              {trade.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      {/* Follow Modal */}
      {showFollowModal && selectedMaster && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-800 rounded-xl p-6 w-full max-w-md border border-gray-700 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold text-white mb-4">Follow {selectedMaster.displayName}</h2>
            
            <div className="space-y-4">
              {/* Wallet Balance Display */}
              <div className="bg-dark-700 rounded-lg p-4 border border-gray-600">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Your Wallet Balance</span>
                  <span className="text-white font-bold text-lg">${walletBalance.toFixed(2)}</span>
                </div>
              </div>

              {/* Deposit Amount Input */}
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Deposit Amount *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    min={selectedMaster.minimumFollowerDeposit || 0}
                    placeholder={`Min: $${selectedMaster.minimumFollowerDeposit || 0}`}
                    className="w-full pl-8 pr-4 py-3 bg-dark-700 border border-gray-600 rounded-lg text-white text-lg focus:outline-none focus:border-accent-green"
                  />
                </div>
                <p className="text-gray-500 text-xs mt-1">
                  This amount will be deducted from your wallet and added as credit to your copy trading account
                </p>
                {selectedMaster.minimumFollowerDeposit > 0 && (
                  <p className="text-yellow-500 text-xs mt-1">
                    Minimum deposit required: ${selectedMaster.minimumFollowerDeposit}
                  </p>
                )}
              </div>

              {/* Copy Mode */}
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Copy Mode</label>
                <select
                  value={copyMode}
                  onChange={(e) => {
                    setCopyMode(e.target.value)
                    if (e.target.value === 'FIXED_LOT') setCopyValue('0.01')
                    else if (e.target.value === 'MULTIPLIER') setCopyValue('1')
                    else setCopyValue('10')
                  }}
                  className="w-full bg-dark-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                >
                  <option value="FIXED_LOT">Fixed Lot Size</option>
                  <option value="BALANCE_BASED">Balance Based (Proportional)</option>
                  <option value="EQUITY_BASED">Equity Based (Proportional)</option>
                  <option value="MULTIPLIER">Multiplier</option>
                </select>
                <p className="text-gray-500 text-xs mt-1">
                  {copyMode === 'FIXED_LOT' && 'Use a fixed lot size for every copied trade'}
                  {copyMode === 'BALANCE_BASED' && 'Lot = Master Lot × (Your Credit / Master Balance)'}
                  {copyMode === 'EQUITY_BASED' && 'Lot = Master Lot × (Your Equity / Master Equity)'}
                  {copyMode === 'MULTIPLIER' && 'Lot = Master Lot × Your Multiplier'}
                </p>
              </div>

              {/* Copy Value */}
              <div>
                <label className="text-gray-400 text-sm mb-1 block">
                  {copyMode === 'FIXED_LOT' ? 'Lot Size' : 
                   copyMode === 'MULTIPLIER' ? 'Multiplier Value' : 'Max Lot Size'}
                </label>
                <input
                  type="number"
                  value={copyValue}
                  onChange={(e) => setCopyValue(e.target.value)}
                  min={copyMode === 'MULTIPLIER' ? '0.1' : '0.01'}
                  step={copyMode === 'MULTIPLIER' ? '0.1' : '0.01'}
                  className="w-full bg-dark-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                />
              </div>

              {/* Commission Info */}
              <div className="bg-dark-700 rounded-lg p-3">
                <p className="text-gray-400 text-sm">Commission: <span className="text-white">{selectedMaster.totalCommissionPercentage || selectedMaster.approvedCommissionPercentage}%</span> of daily profit</p>
              </div>

              {/* Info Box */}
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <p className="text-blue-400 text-sm font-medium mb-2">How it works:</p>
                <ul className="text-blue-400/80 text-xs space-y-1">
                  <li>• A new Copy Trading account will be created for you</li>
                  <li>• Your deposit goes to Credit (non-withdrawable)</li>
                  <li>• Profits from copied trades go to Balance (withdrawable)</li>
                  <li>• Losses and commissions are deducted from Credit</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowFollowModal(false); setDepositAmount(''); }}
                className="flex-1 bg-dark-700 text-white py-2 rounded-lg hover:bg-dark-600"
              >
                Cancel
              </button>
              <button
                onClick={handleFollow}
                disabled={!depositAmount || parseFloat(depositAmount) < (selectedMaster.minimumFollowerDeposit || 0)}
                className="flex-1 bg-accent-green text-black py-2 rounded-lg font-medium hover:bg-accent-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Deposit & Follow
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Subscription Modal */}
      {showEditModal && editingSubscription && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <h2 className="text-xl font-semibold text-white mb-4">Edit Subscription</h2>
            <p className="text-gray-400 text-sm mb-4">Following: {editingSubscription.masterId?.displayName}</p>
            
            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Trading Account</label>
                <select
                  value={editAccount}
                  onChange={(e) => setEditAccount(e.target.value)}
                  className="w-full bg-dark-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                >
                  {accounts.map(acc => (
                    <option key={acc._id} value={acc._id}>{acc.accountId} - ${acc.balance?.toFixed(2)}</option>
                  ))}
                </select>
                <p className="text-gray-500 text-xs mt-1">Change the account where trades will be copied</p>
              </div>

              <div>
                <label className="text-gray-400 text-sm mb-1 block">Copy Mode</label>
                <select
                  value={editCopyMode}
                  onChange={(e) => {
                    setEditCopyMode(e.target.value)
                    if (e.target.value === 'FIXED_LOT') setEditCopyValue('0.01')
                    else if (e.target.value === 'MULTIPLIER') setEditCopyValue('1')
                    else setEditCopyValue('10')
                  }}
                  className="w-full bg-dark-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                >
                  <option value="FIXED_LOT">Fixed Lot Size</option>
                  <option value="BALANCE_BASED">Balance Based (Proportional)</option>
                  <option value="EQUITY_BASED">Equity Based (Proportional)</option>
                  <option value="MULTIPLIER">Multiplier</option>
                </select>
                <p className="text-gray-500 text-xs mt-1">
                  {editCopyMode === 'FIXED_LOT' && 'Use a fixed lot size for every copied trade'}
                  {editCopyMode === 'BALANCE_BASED' && 'Lot = Master Lot × (Your Balance / Master Balance)'}
                  {editCopyMode === 'EQUITY_BASED' && 'Lot = Master Lot × (Your Equity / Master Equity)'}
                  {editCopyMode === 'MULTIPLIER' && 'Lot = Master Lot × Your Multiplier'}
                </p>
              </div>

              <div>
                <label className="text-gray-400 text-sm mb-1 block">
                  {editCopyMode === 'FIXED_LOT' ? 'Lot Size' : 
                   editCopyMode === 'MULTIPLIER' ? 'Multiplier Value' : 'Max Lot Size'}
                </label>
                <input
                  type="number"
                  value={editCopyValue}
                  onChange={(e) => setEditCopyValue(e.target.value)}
                  min={editCopyMode === 'MULTIPLIER' ? '0.1' : '0.01'}
                  step={editCopyMode === 'MULTIPLIER' ? '0.1' : '0.01'}
                  className="w-full bg-dark-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                />
                <p className="text-gray-500 text-xs mt-1">
                  {editCopyMode === 'FIXED_LOT' && 'Each copied trade will use this fixed lot size'}
                  {editCopyMode === 'BALANCE_BASED' && 'Maximum lot size limit for proportional calculation'}
                  {editCopyMode === 'EQUITY_BASED' && 'Maximum lot size limit for proportional calculation'}
                  {editCopyMode === 'MULTIPLIER' && 'Multiply master lot by this value'}
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowEditModal(false); setEditingSubscription(null); }}
                className="flex-1 bg-dark-700 text-white py-2 rounded-lg hover:bg-dark-600"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSubscription}
                className="flex-1 bg-blue-500 text-white py-2 rounded-lg font-medium hover:bg-blue-600"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CopyTradePage
