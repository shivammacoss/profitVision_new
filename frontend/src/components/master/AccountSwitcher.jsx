import React, { useState, useEffect } from 'react'
import { Settings, RefreshCw } from 'lucide-react'
import { API_URL } from '../../config/api'

export default function AccountSwitcher({ userId, isDarkMode = true }) {
  const [accounts, setAccounts] = useState([])
  const [master, setMaster] = useState(null)
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(false)
  const [message, setMessage] = useState('')
  const [switchHistory, setSwitchHistory] = useState([])

  useEffect(() => {
    if (userId) {
      fetchAccounts()
    }
  }, [userId])

  const fetchAccounts = async () => {
    if (!userId) {
      setMessage('User ID not found. Please login again.')
      setLoading(false)
      return
    }
    
    try {
      const response = await fetch(`${API_URL}/copy/master/accounts/${userId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      const data = await response.json()
      
      if (response.ok) {
        setAccounts(data.accounts || [])
        setMaster(data.master)
        setSwitchHistory(data.switchHistory || [])
      } else {
        setMessage(data.message || 'Error fetching accounts')
      }
    } catch (error) {
      setMessage('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSwitchPrimary = async (accountId) => {
    if (!userId) {
      setMessage('User ID not found. Please login again.')
      return
    }
    
    setSwitching(true)
    setMessage('')
    
    try {
      const response = await fetch(`${API_URL}/copy/master/primary/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          accountId,
          reason: 'Manual switch by master'
        })
      })
      
      const data = await response.json()
      
      if (response.ok) {
        setMessage('✅ Primary account switched successfully! All future trades will be copied from this account.')
        fetchAccounts() // Refresh data
      } else {
        setMessage(data.message || 'Error switching account')
      }
    } catch (error) {
      setMessage('Network error. Please try again.')
    } finally {
      setSwitching(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Master Info */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h2 className="text-2xl font-bold mb-4 text-white">👑 Master Account Settings</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <p className="text-gray-400">Master Name</p>
            <p className="font-semibold text-white">{master?.displayName}</p>
          </div>
          <div>
            <p className="text-gray-400">Current Primary Account</p>
            <p className="font-semibold text-white">
              {accounts.find(acc => acc.isPrimary)?.accountId || 'Not set'}
            </p>
          </div>
        </div>

        {message && (
          <div className={`p-4 rounded-lg mb-4 ${
            message.includes('✅') ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
          }`}>
            {message}
          </div>
        )}
      </div>

      {/* Trading Accounts */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-xl font-bold mb-4 text-white">📋 My Trading Accounts</h3>
        
        <div className="space-y-4">
          {accounts.map((account) => (
            <div
              key={account._id}
              className={`border rounded-lg p-4 transition-all ${
                account.isPrimary 
                  ? 'border-green-500 bg-green-500/10' 
                  : 'border-gray-600 hover:border-gray-500'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <h4 className="font-semibold text-lg text-white">Account #{account.accountId}</h4>
                    {account.isPrimary && (
                      <span className="bg-green-500 text-white px-2 py-1 rounded-full text-xs font-medium">
                        ⭐ PRIMARY
                      </span>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm">
                    <div>
                      <p className="text-gray-400">Balance</p>
                      <p className="font-medium text-white">${account.balance}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Credit</p>
                      <p className="font-medium text-white">${account.credit}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Leverage</p>
                      <p className="font-medium text-white">{account.leverage}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Status</p>
                      <p className="font-medium">
                        <span className={`px-2 py-1 rounded text-xs ${
                          account.status === 'Active' 
                            ? 'bg-green-500/20 text-green-400' 
                            : 'bg-gray-500/20 text-gray-400'
                        }`}>
                          {account.status}
                        </span>
                      </p>
                    </div>
                  </div>
                  
                  <div className="mt-2 text-xs text-gray-500">
                    Created: {new Date(account.createdAt).toLocaleDateString()}
                  </div>
                </div>
                
                <div className="flex flex-col space-y-2">
                  {!account.isPrimary ? (
                    <button
                      onClick={() => handleSwitchPrimary(account._id)}
                      disabled={switching}
                      className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
                    >
                      {switching ? (
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                      ) : (
                        <>
                          <RefreshCw size={16} />
                          Make Primary
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="text-center">
                      <p className="text-green-400 font-medium text-sm">✅ Active</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {accounts.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <Settings size={48} className="mx-auto mb-4" />
            <p>No copy trading accounts found.</p>
            <p className="text-sm">Create a copy trading account to get started.</p>
          </div>
        )}
      </div>

      {/* Switch History */}
      {switchHistory.length > 0 && (
        <div className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-xl p-6 border`}>
          <h3 className={`text-xl font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>📜 Switch History</h3>
          
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {switchHistory.slice().reverse().map((history, index) => (
              <div 
                key={index} 
                className={`${isDarkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-200'} rounded-lg p-3 border text-sm`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>From:</span>
                    <span className={`font-medium ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                      #{history.fromAccountId?.accountId || history.fromAccountId || 'N/A'}
                    </span>
                    <span className={`${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>→</span>
                    <span className={`font-medium ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                      #{history.toAccountId?.accountId || history.toAccountId || 'N/A'}
                    </span>
                  </div>
                  <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    {new Date(history.switchedAt).toLocaleString()}
                  </span>
                </div>
                {history.reason && (
                  <p className={`mt-1 text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    Reason: {history.reason}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className={`${isDarkMode ? 'bg-blue-500/10 border-blue-500/30' : 'bg-blue-50 border-blue-200'} rounded-xl p-6 border`}>
        <h3 className={`text-lg font-semibold mb-3 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>📖 How It Works</h3>
        <ul className={`space-y-2 text-sm ${isDarkMode ? 'text-blue-300' : 'text-blue-700'}`}>
          <li>• <strong>Primary Account:</strong> The account from which trades are copied to your followers</li>
          <li>• <strong>Switch Anytime:</strong> You can switch primary account anytime - trades will reflect immediately</li>
          <li>• <strong>No Interruption:</strong> Followers continue receiving trades from your new primary account</li>
          <li>• <strong>History Tracked:</strong> All switches are recorded for transparency</li>
        </ul>
      </div>
    </div>
  )
}
