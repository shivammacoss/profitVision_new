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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../config';

const SupportScreen = ({ navigation }) => {
  const [user, setUser] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [newTicket, setNewTicket] = useState({
    subject: '',
    message: '',
    priority: 'MEDIUM',
  });
  
  const [replyMessage, setReplyMessage] = useState('');

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchTickets();
    }
  }, [user]);

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

  const fetchTickets = async () => {
    try {
      const res = await fetch(`${API_URL}/support/user/${user._id}`);
      const data = await res.json();
      setTickets(data.tickets || []);
    } catch (e) {
      console.error('Error fetching tickets:', e);
    }
    setLoading(false);
    setRefreshing(false);
  };

  const handleCreateTicket = async () => {
    if (!newTicket.subject || !newTicket.message) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/support/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user._id,
          ...newTicket
        })
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert('Success', 'Support ticket created successfully');
        setShowNewTicketModal(false);
        setNewTicket({ subject: '', message: '', priority: 'MEDIUM' });
        fetchTickets();
      } else {
        Alert.alert('Error', data.message || 'Failed to create ticket');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to create ticket');
    }
    setIsSubmitting(false);
  };

  const handleReply = async () => {
    if (!replyMessage.trim()) {
      Alert.alert('Error', 'Please enter a message');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/support/reply/${selectedTicket._id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: replyMessage,
          isAdmin: false,
        })
      });
      const data = await res.json();
      if (data.success) {
        setReplyMessage('');
        setSelectedTicket(data.ticket);
        fetchTickets();
      } else {
        Alert.alert('Error', data.message || 'Failed to send reply');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to send reply');
    }
    setIsSubmitting(false);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'OPEN': return '#d4af37';
      case 'IN_PROGRESS': return '#d4af37';
      case 'RESOLVED': return '#d4af37';
      case 'CLOSED': return '#666';
      default: return '#666';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'HIGH': return '#d4af37';
      case 'MEDIUM': return '#d4af37';
      case 'LOW': return '#d4af37';
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
        <Text style={styles.headerTitle}>Support</Text>
        <TouchableOpacity onPress={() => setShowNewTicketModal(true)} style={styles.addBtn}>
          <Ionicons name="add" size={24} color="#d4af37" />
        </TouchableOpacity>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchTickets(); }} tintColor="#d4af37" />
        }
      >
        {tickets.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={64} color="#000000" />
            <Text style={styles.emptyTitle}>No Support Tickets</Text>
            <Text style={styles.emptyText}>Create a ticket if you need help</Text>
            <TouchableOpacity style={styles.createBtn} onPress={() => setShowNewTicketModal(true)}>
              <Text style={styles.createBtnText}>Create Ticket</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.ticketsList}>
            {tickets.map((ticket) => (
              <TouchableOpacity 
                key={ticket._id} 
                style={styles.ticketItem}
                onPress={() => { setSelectedTicket(ticket); setShowTicketModal(true); }}
              >
                <View style={styles.ticketHeader}>
                  <Text style={styles.ticketSubject} numberOfLines={1}>{ticket.subject}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(ticket.status) + '20' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(ticket.status) }]}>{ticket.status}</Text>
                  </View>
                </View>
                <Text style={styles.ticketMessage} numberOfLines={2}>{ticket.messages?.[0]?.message}</Text>
                <View style={styles.ticketFooter}>
                  <Text style={styles.ticketDate}>{formatDate(ticket.createdAt)}</Text>
                  <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(ticket.priority) + '20' }]}>
                    <Text style={[styles.priorityText, { color: getPriorityColor(ticket.priority) }]}>{ticket.priority}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* New Ticket Modal */}
      <Modal visible={showNewTicketModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Support Ticket</Text>
              <TouchableOpacity onPress={() => setShowNewTicketModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Subject</Text>
            <TextInput
              style={styles.input}
              value={newTicket.subject}
              onChangeText={(text) => setNewTicket({ ...newTicket, subject: text })}
              placeholder="Enter subject"
              placeholderTextColor="#666"
            />

            <Text style={styles.inputLabel}>Priority</Text>
            <View style={styles.priorityOptions}>
              {['LOW', 'MEDIUM', 'HIGH'].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.priorityOption, newTicket.priority === p && styles.priorityOptionActive]}
                  onPress={() => setNewTicket({ ...newTicket, priority: p })}
                >
                  <Text style={[styles.priorityOptionText, newTicket.priority === p && styles.priorityOptionTextActive]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Message</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={newTicket.message}
              onChangeText={(text) => setNewTicket({ ...newTicket, message: text })}
              placeholder="Describe your issue..."
              placeholderTextColor="#666"
              multiline
              numberOfLines={4}
            />

            <TouchableOpacity 
              style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]} 
              onPress={handleCreateTicket}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.submitBtnText}>Submit Ticket</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Ticket Detail Modal */}
      <Modal visible={showTicketModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>{selectedTicket?.subject}</Text>
              <TouchableOpacity onPress={() => setShowTicketModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.messagesContainer}>
              {selectedTicket?.messages?.map((msg, index) => (
                <View 
                  key={index} 
                  style={[styles.messageItem, msg.isAdmin ? styles.adminMessage : styles.userMessage]}
                >
                  <View style={styles.messageHeader}>
                    <Text style={styles.messageSender}>{msg.isAdmin ? 'Support' : 'You'}</Text>
                    <Text style={styles.messageTime}>{formatDate(msg.timestamp)}</Text>
                  </View>
                  <Text style={styles.messageText}>{msg.message}</Text>
                </View>
              ))}
            </ScrollView>

            {selectedTicket?.status !== 'CLOSED' && (
              <View style={styles.replySection}>
                <TextInput
                  style={styles.replyInput}
                  value={replyMessage}
                  onChangeText={setReplyMessage}
                  placeholder="Type your reply..."
                  placeholderTextColor="#666"
                  multiline
                />
                <TouchableOpacity 
                  style={styles.sendBtn} 
                  onPress={handleReply}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#000" size="small" />
                  ) : (
                    <Ionicons name="send" size={20} color="#000" />
                  )}
                </TouchableOpacity>
              </View>
            )}
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
  addBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  
  emptyState: { alignItems: 'center', paddingVertical: 80 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '600', marginTop: 16 },
  emptyText: { color: '#666', fontSize: 14, marginTop: 8 },
  createBtn: { backgroundColor: '#d4af37', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 24 },
  createBtnText: { color: '#000', fontSize: 16, fontWeight: '600' },
  
  ticketsList: { padding: 16 },
  ticketItem: { backgroundColor: '#000000', borderRadius: 12, padding: 16, marginBottom: 12 },
  ticketHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ticketSubject: { color: '#fff', fontSize: 16, fontWeight: '600', flex: 1, marginRight: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '600' },
  ticketMessage: { color: '#666', fontSize: 14, marginTop: 8 },
  ticketFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  ticketDate: { color: '#000000', fontSize: 12 },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  priorityText: { fontSize: 10, fontWeight: '600' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#000000', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', flex: 1, marginRight: 16 },
  
  inputLabel: { color: '#666', fontSize: 12, marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: '#000000', borderRadius: 12, padding: 16, color: '#fff', fontSize: 16 },
  textArea: { height: 120, textAlignVertical: 'top' },
  
  priorityOptions: { flexDirection: 'row', gap: 8 },
  priorityOption: { flex: 1, backgroundColor: '#000000', padding: 12, borderRadius: 8, alignItems: 'center' },
  priorityOptionActive: { backgroundColor: '#d4af37' },
  priorityOptionText: { color: '#666', fontSize: 14, fontWeight: '500' },
  priorityOptionTextActive: { color: '#000' },
  
  submitBtn: { backgroundColor: '#d4af37', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
  
  messagesContainer: { maxHeight: 400, marginBottom: 16 },
  messageItem: { padding: 12, borderRadius: 12, marginBottom: 8 },
  userMessage: { backgroundColor: '#000000', marginLeft: 40 },
  adminMessage: { backgroundColor: '#d4af3720', marginRight: 40 },
  messageHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  messageSender: { color: '#d4af37', fontSize: 12, fontWeight: '600' },
  messageTime: { color: '#666', fontSize: 10 },
  messageText: { color: '#fff', fontSize: 14 },
  
  replySection: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  replyInput: { flex: 1, backgroundColor: '#000000', borderRadius: 12, padding: 12, color: '#fff', fontSize: 14, maxHeight: 100 },
  sendBtn: { backgroundColor: '#d4af37', width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
});

export default SupportScreen;
