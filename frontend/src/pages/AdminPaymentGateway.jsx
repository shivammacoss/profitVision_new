import { useState, useEffect } from 'react'
import AdminLayout from '../components/AdminLayout'
import { 
  ToggleLeft, 
  ToggleRight, 
  RefreshCw,
  Wallet,
  AlertCircle,
  CheckCircle
} from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { API_URL } from '../config/api'

const AdminPaymentGateway = () => {
  const { isDarkMode } = useTheme()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [oxapayEnabled, setOxapayEnabled] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  const adminUser = JSON.parse(localStorage.getItem('adminUser') || '{}')
  const isSuperAdmin = adminUser.role === 'SUPER_ADMIN'

  useEffect(() => {
    fetchSettings()
  }, [])

  const getAuthHeaders = () => {
    const token = localStorage.getItem('adminToken')
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  }

  const fetchSettings = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/payment-gateway/admin/settings`, {
        headers: getAuthHeaders()
      })
      const data = await res.json()
      if (data.success) {
        setOxapayEnabled(data.oxapayEnabled)
      }
    } catch (error) {
      console.error('Error fetching settings:', error)
    }
    setLoading(false)
  }

  const handleToggleOxaPay = async () => {
    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/payment-gateway/admin/oxapay/toggle`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ enabled: !oxapayEnabled })
      })
      const data = await res.json()
      if (data.success) {
        setOxapayEnabled(data.oxapayEnabled)
        setMessage({ type: 'success', text: data.message })
      } else {
        setMessage({ type: 'error', text: data.message })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to toggle OxaPay' })
    }
    setSaving(false)
    setTimeout(() => setMessage({ type: '', text: '' }), 3000)
  }

  if (!isSuperAdmin) {
    return (
      <AdminLayout title="Payment Gateway" subtitle="Access Denied">
        <div className={`${isDarkMode ? 'bg-dark-800' : 'bg-white'} rounded-xl p-8 text-center`}>
          <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
          <h2 className={`text-xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Access Denied</h2>
          <p className="text-gray-500">Only Super Admin can access payment gateway settings.</p>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout title="Payment Gateway" subtitle="Enable or disable crypto payments">
      {/* Message */}
      {message.text && (
        <div className={`mb-4 p-4 rounded-lg flex items-center gap-2 ${
          message.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
        }`}>
          {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw size={32} className="text-gray-500 animate-spin" />
        </div>
      ) : (
        <div className={`${isDarkMode ? 'bg-dark-800 border-gray-700' : 'bg-white border-gray-200'} rounded-xl p-6 border`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-orange-500/20 rounded-xl flex items-center justify-center">
                <Wallet size={28} className="text-orange-500" />
              </div>
              <div>
                <h2 className={`text-xl font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>OxaPay</h2>
                <p className="text-gray-500">Crypto Payment Gateway (BTC, ETH, USDT, 100+ coins)</p>
              </div>
            </div>
            <button
              onClick={handleToggleOxaPay}
              disabled={saving}
              className="flex items-center gap-3 disabled:opacity-50"
            >
              {saving ? (
                <RefreshCw size={24} className="text-gray-500 animate-spin" />
              ) : oxapayEnabled ? (
                <ToggleRight size={48} className="text-green-500 cursor-pointer" />
              ) : (
                <ToggleLeft size={48} className="text-gray-500 cursor-pointer" />
              )}
              <span className={`text-lg font-medium ${oxapayEnabled ? 'text-green-500' : 'text-gray-500'}`}>
                {oxapayEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </button>
          </div>

          {oxapayEnabled && (
            <div className={`mt-6 p-4 ${isDarkMode ? 'bg-green-500/10 border-green-500/30' : 'bg-green-50 border-green-200'} rounded-lg border`}>
              <p className={`text-sm ${isDarkMode ? 'text-green-400' : 'text-green-700'}`}>
                ✓ Users can now see the "Crypto" deposit option in their wallet
              </p>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  )
}

export default AdminPaymentGateway
