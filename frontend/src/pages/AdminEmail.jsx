import { useState, useEffect } from 'react'
import AdminLayout from '../components/AdminLayout'
import { 
  Mail,
  Send,
  Users,
  User,
  Search,
  Check,
  X,
  Loader2,
  AlertCircle
} from 'lucide-react'
import { API_URL } from '../config/api'

const AdminEmail = () => {
  const [users, setUsers] = useState([])
  const [selectedUsers, setSelectedUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [sendToAll, setSendToAll] = useState(false)
  const [emailForm, setEmailForm] = useState({
    subject: '',
    content: ''
  })
  const [result, setResult] = useState(null)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/email/users`)
      const data = await res.json()
      if (data.success) {
        setUsers(data.users || [])
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    }
    setLoading(false)
  }

  const handleSelectUser = (userId) => {
    if (selectedUsers.includes(userId)) {
      setSelectedUsers(selectedUsers.filter(id => id !== userId))
    } else {
      setSelectedUsers([...selectedUsers, userId])
    }
    setSendToAll(false)
  }

  const handleSelectAll = () => {
    if (sendToAll) {
      setSendToAll(false)
      setSelectedUsers([])
    } else {
      setSendToAll(true)
      setSelectedUsers([])
    }
  }

  const handleSendEmail = async () => {
    if (!emailForm.subject.trim() || !emailForm.content.trim()) {
      alert('Please enter subject and content')
      return
    }

    if (!sendToAll && selectedUsers.length === 0) {
      alert('Please select at least one user or choose "Send to All"')
      return
    }

    setSending(true)
    setResult(null)

    try {
      const res = await fetch(`${API_URL}/email/send-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: sendToAll ? [] : selectedUsers,
          sendToAll,
          subject: emailForm.subject,
          htmlContent: emailForm.content.replace(/\n/g, '<br>')
        })
      })

      const data = await res.json()
      setResult(data)

      if (data.success) {
        setEmailForm({ subject: '', content: '' })
        setSelectedUsers([])
        setSendToAll(false)
      }
    } catch (error) {
      console.error('Error sending email:', error)
      setResult({ success: false, message: 'Failed to send email' })
    }

    setSending(false)
  }

  const filteredUsers = users.filter(user => 
    user.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
            <Mail className="text-purple-500" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Email Users</h1>
            <p className="text-gray-400 text-sm">Send emails to users from super admin</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* User Selection */}
          <div className="bg-dark-800 rounded-xl border border-gray-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Select Recipients</h2>
              <button
                onClick={handleSelectAll}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  sendToAll 
                    ? 'bg-purple-500 text-white' 
                    : 'bg-dark-700 text-gray-400 hover:text-white'
                }`}
              >
                {sendToAll ? '✓ All Users Selected' : 'Select All Users'}
              </button>
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input
                type="text"
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-dark-700 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Selected Count */}
            <div className="mb-3 px-3 py-2 bg-dark-700 rounded-lg">
              <p className="text-sm text-gray-400">
                {sendToAll 
                  ? `All ${users.length} users will receive this email`
                  : `${selectedUsers.length} user(s) selected`
                }
              </p>
            </div>

            {/* User List */}
            <div className="max-h-96 overflow-y-auto space-y-2">
              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading users...</div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No users found</div>
              ) : (
                filteredUsers.map(user => (
                  <div
                    key={user._id}
                    onClick={() => handleSelectUser(user._id)}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedUsers.includes(user._id) || sendToAll
                        ? 'bg-purple-500/20 border border-purple-500/50'
                        : 'bg-dark-700 hover:bg-dark-600 border border-transparent'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      selectedUsers.includes(user._id) || sendToAll
                        ? 'bg-purple-500'
                        : 'bg-dark-600'
                    }`}>
                      {selectedUsers.includes(user._id) || sendToAll ? (
                        <Check size={16} className="text-white" />
                      ) : (
                        <User size={16} className="text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="text-gray-500 text-sm truncate">{user.email}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Email Compose */}
          <div className="bg-dark-800 rounded-xl border border-gray-800 p-5">
            <h2 className="text-lg font-semibold text-white mb-4">Compose Email</h2>

            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-sm mb-1 block">Subject *</label>
                <input
                  type="text"
                  value={emailForm.subject}
                  onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                  placeholder="Enter email subject"
                  className="w-full bg-dark-700 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-gray-400 text-sm mb-1 block">Content *</label>
                <textarea
                  value={emailForm.content}
                  onChange={(e) => setEmailForm({ ...emailForm, content: e.target.value })}
                  placeholder="Enter email content..."
                  rows={10}
                  className="w-full bg-dark-700 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500 resize-none"
                />
                <p className="text-gray-500 text-xs mt-1">
                  You can use basic HTML tags for formatting. Line breaks will be preserved.
                </p>
              </div>

              {/* Result Message */}
              {result && (
                <div className={`p-4 rounded-lg ${
                  result.success 
                    ? 'bg-green-500/20 border border-green-500/50' 
                    : 'bg-red-500/20 border border-red-500/50'
                }`}>
                  <div className="flex items-center gap-2">
                    {result.success ? (
                      <Check className="text-green-500" size={20} />
                    ) : (
                      <AlertCircle className="text-red-500" size={20} />
                    )}
                    <p className={result.success ? 'text-green-500' : 'text-red-500'}>
                      {result.message}
                    </p>
                  </div>
                  {result.success && result.totalSent > 0 && (
                    <p className="text-gray-400 text-sm mt-2">
                      Successfully sent to {result.totalSent} user(s)
                      {result.totalFailed > 0 && `, ${result.totalFailed} failed`}
                    </p>
                  )}
                </div>
              )}

              <button
                onClick={handleSendEmail}
                disabled={sending || (!sendToAll && selectedUsers.length === 0)}
                className="w-full bg-purple-500 text-white py-3 rounded-lg font-medium hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {sending ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send size={20} />
                    Send Email
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Email Templates (Optional) */}
        <div className="mt-6 bg-dark-800 rounded-xl border border-gray-800 p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Quick Templates</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => setEmailForm({
                subject: 'Important Update from ProfitVisionFX',
                content: 'Dear User,\n\nWe have an important update to share with you.\n\n[Your message here]\n\nBest regards,\nProfitVisionFX Team'
              })}
              className="p-4 bg-dark-700 rounded-lg text-left hover:bg-dark-600 transition-colors"
            >
              <p className="text-white font-medium">Important Update</p>
              <p className="text-gray-500 text-sm">General announcement template</p>
            </button>
            <button
              onClick={() => setEmailForm({
                subject: 'New Feature Available!',
                content: 'Dear User,\n\nWe are excited to announce a new feature on ProfitVisionFX!\n\n[Feature description]\n\nLog in now to try it out.\n\nBest regards,\nProfitVisionFX Team'
              })}
              className="p-4 bg-dark-700 rounded-lg text-left hover:bg-dark-600 transition-colors"
            >
              <p className="text-white font-medium">New Feature</p>
              <p className="text-gray-500 text-sm">Feature announcement template</p>
            </button>
            <button
              onClick={() => setEmailForm({
                subject: 'Special Promotion for You!',
                content: 'Dear User,\n\nWe have a special promotion just for you!\n\n[Promotion details]\n\nDon\'t miss out on this limited-time offer.\n\nBest regards,\nProfitVisionFX Team'
              })}
              className="p-4 bg-dark-700 rounded-lg text-left hover:bg-dark-600 transition-colors"
            >
              <p className="text-white font-medium">Promotion</p>
              <p className="text-gray-500 text-sm">Promotional email template</p>
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}

export default AdminEmail
