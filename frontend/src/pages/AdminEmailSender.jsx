import { useState, useEffect } from 'react'
import AdminLayout from '../components/AdminLayout'
import { 
  Mail, 
  Send, 
  Users, 
  Search, 
  Check, 
  X,
  AlertCircle,
  CheckCircle
} from 'lucide-react'

import { API_URL } from '../config/api'

const AdminEmailSender = () => {
  const [users, setUsers] = useState([])
  const [filteredUsers, setFilteredUsers] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUsers, setSelectedUsers] = useState([])
  const [subject, setSubject] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [sendMode, setSendMode] = useState('selected') // 'selected' or 'all'

  useEffect(() => {
    fetchUsers()
  }, [])

  useEffect(() => {
    if (searchTerm) {
      const filtered = users.filter(user => 
        user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.firstName?.toLowerCase().includes(searchTerm.toLowerCase())
      )
      setFilteredUsers(filtered)
    } else {
      setFilteredUsers(users)
    }
  }, [searchTerm, users])

  const getAuthHeaders = () => {
    const token = localStorage.getItem('adminToken')
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  }

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/admin/users`, {
        headers: getAuthHeaders()
      })
      const data = await res.json()
      if (data.users) {
        setUsers(data.users)
        setFilteredUsers(data.users)
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    }
    setLoading(false)
  }

  const toggleUserSelection = (userId) => {
    if (selectedUsers.includes(userId)) {
      setSelectedUsers(selectedUsers.filter(id => id !== userId))
    } else {
      setSelectedUsers([...selectedUsers, userId])
    }
  }

  const selectAllUsers = () => {
    if (selectedUsers.length === filteredUsers.length) {
      setSelectedUsers([])
    } else {
      setSelectedUsers(filteredUsers.map(u => u._id))
    }
  }

  const handleSendEmail = async () => {
    if (!subject.trim()) {
      setError('Please enter a subject')
      return
    }
    if (!content.trim()) {
      setError('Please enter email content')
      return
    }
    if (sendMode === 'selected' && selectedUsers.length === 0) {
      setError('Please select at least one user')
      return
    }

    setSending(true)
    setError('')
    setSuccess('')

    try {
      const endpoint = sendMode === 'all' ? '/email/send-to-all' : '/email/send'
      const body = sendMode === 'all' 
        ? { subject, content }
        : { subject, content, userIds: selectedUsers }

      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(body)
      })
      const data = await res.json()

      if (data.success) {
        setSuccess(`Email sent successfully to ${data.recipients || selectedUsers.length} recipient(s)!`)
        setSubject('')
        setContent('')
        setSelectedUsers([])
      } else {
        setError(data.message || 'Failed to send email')
      }
    } catch (err) {
      setError('Error sending email. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <AdminLayout title="Email Sender" subtitle="Send emails to users">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Selection */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-gray-900 font-semibold flex items-center gap-2">
              <Users size={18} /> Select Recipients
            </h2>
          </div>

          <div className="p-4 space-y-4">
            {/* Send Mode Toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setSendMode('selected')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  sendMode === 'selected'
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Selected Users
              </button>
              <button
                onClick={() => setSendMode('all')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  sendMode === 'all'
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All Users
              </button>
            </div>

            {sendMode === 'selected' && (
              <>
                {/* Search */}
                <div className="relative">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-gray-100 border border-gray-300 rounded-lg pl-10 pr-4 py-2 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-gray-400"
                  />
                </div>

                {/* Select All */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={selectAllUsers}
                    className="text-sm text-blue-500 hover:underline"
                  >
                    {selectedUsers.length === filteredUsers.length ? 'Deselect All' : 'Select All'}
                  </button>
                  <span className="text-sm text-gray-500">
                    {selectedUsers.length} selected
                  </span>
                </div>

                {/* User List */}
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {loading ? (
                    <p className="text-gray-500 text-center py-4">Loading users...</p>
                  ) : filteredUsers.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No users found</p>
                  ) : (
                    filteredUsers.map(user => (
                      <div
                        key={user._id}
                        onClick={() => toggleUserSelection(user._id)}
                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                          selectedUsers.includes(user._id)
                            ? 'bg-blue-50 border border-blue-200'
                            : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                          selectedUsers.includes(user._id)
                            ? 'bg-red-500 border-blue-500'
                            : 'border-gray-300'
                        }`}>
                          {selectedUsers.includes(user._id) && (
                            <Check size={14} className="text-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-900 font-medium truncate">{user.firstName || 'No Name'}</p>
                          <p className="text-gray-500 text-sm truncate">{user.email}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {sendMode === 'all' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle size={18} className="text-yellow-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-yellow-800 font-medium">Send to All Users</p>
                    <p className="text-yellow-700 text-sm">
                      This will send the email to all {users.length} registered users.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Email Composer */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-gray-900 font-semibold flex items-center gap-2">
              <Mail size={18} /> Compose Email
            </h2>
          </div>

          <div className="p-4 space-y-4">
            {/* Subject */}
            <div>
              <label className="block text-gray-600 text-sm mb-2">Subject</label>
              <input
                type="text"
                placeholder="Enter email subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full bg-gray-100 border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-gray-400"
              />
            </div>

            {/* Content */}
            <div>
              <label className="block text-gray-600 text-sm mb-2">Message</label>
              <textarea
                placeholder="Enter your message (HTML supported)"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                className="w-full bg-gray-100 border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-gray-400 resize-none"
              />
              <p className="text-gray-500 text-xs mt-1">
                You can use HTML tags like &lt;b&gt;, &lt;i&gt;, &lt;a href=""&gt;, &lt;br&gt; for formatting.
              </p>
            </div>

            {/* Messages */}
            {error && (
              <div className="flex items-center gap-2 text-red-500 text-sm">
                <X size={16} /> {error}
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 text-green-500 text-sm">
                <CheckCircle size={16} /> {success}
              </div>
            )}

            {/* Send Button */}
            <button
              onClick={handleSendEmail}
              disabled={sending}
              className="w-full bg-red-500 text-white font-medium py-3 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {sending ? (
                'Sending...'
              ) : (
                <>
                  <Send size={18} />
                  Send Email
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}

export default AdminEmailSender
