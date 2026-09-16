'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';

const MI = ({ name, size = 18, style = {} }) => <span className="material-symbols-outlined" style={{ fontSize: size, verticalAlign: 'middle', ...style }}>{name}</span>;

export default function MessagesPage() {
  const { user, roleLabels, roleColors } = useAuth();
  const { projectId, t } = useProject();
  const [conversations, setConversations] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const pollRef = useRef(null);

  const fetchConversations = useCallback(async () => {
    const res = await fetch(`/api/messages${projectId ? '?project_id=' + projectId : ''}`); const data = await res.json();
    setConversations(data.conversations || []); setAllUsers(data.allUsers || []);
  }, [projectId]);

  const fetchChat = useCallback(async (userId) => {
    if (!userId) return;
    const res = await fetch(`/api/messages/${userId}`); const data = await res.json();
    setMessages(data.messages || []);
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);
  useEffect(() => { if (!selectedUser) return; pollRef.current = setInterval(() => fetchChat(selectedUser.id), 3000); return () => clearInterval(pollRef.current); }, [selectedUser, fetchChat]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  const openChat = (u) => { setSelectedUser(u); fetchChat(u.id); };

  const sendMessage = async (e) => {
    e.preventDefault(); if (!newMsg.trim() || !selectedUser || sending) return;
    setSending(true);
    await fetch('/api/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ receiver_id: selectedUser.id, message: newMsg, project_id: projectId }) });
    setNewMsg(''); setSending(false); fetchChat(selectedUser.id); fetchConversations();
  };

  const contactIds = new Set(conversations.map(c => c.id));
  const newContacts = allUsers.filter(u => !contactIds.has(u.id));

  return (
    <div className="page-content messaging-page">
      <div className="page-header">
        <h1><MI name="chat" size={24} /> {t('Messages')}</h1>
      </div>
      <div className="messaging-container">
        <div className="contacts-panel">
          {conversations.length > 0 && (
          <div className="contacts-section">
            <p className="contacts-title"><MI name="chat_bubble" size={14} /> {t('Conversations')}</p>
            {conversations.map(c => (
              <div key={c.id} className={`contact-item ${selectedUser?.id === c.id ? 'active' : ''}`} onClick={() => openChat(c)}>
                <div className="contact-avatar" style={{ background: roleColors[c.role] }}>{c.name.charAt(0)}{c.unread_count > 0 && <span className="unread-badge">{c.unread_count}</span>}</div>
                <div className="contact-info"><span className="contact-name">{c.name}</span><span className="contact-preview">{c.last_message?.substring(0, 40)}</span></div>
              </div>
            ))}
          </div>
          )}
          <div className="contacts-section">
            <p className="contacts-title"><MI name="group" size={14} /> {t('Team')}</p>
            {newContacts.length === 0 && conversations.length === 0 && <p className="no-data">{t('No other users yet')}</p>}
            {newContacts.map(u => (
              <div key={u.id} className={`contact-item ${selectedUser?.id === u.id ? 'active' : ''}`} onClick={() => openChat(u)}>
                <div className="contact-avatar" style={{ background: roleColors[u.role] }}>{u.name.charAt(0)}</div>
                <div className="contact-info"><span className="contact-name">{u.name}</span><span className="contact-role">{t(roleLabels[u.role] || u.role)}</span></div>
              </div>
            ))}
          </div>
        </div>
        <div className="chat-panel">
          {!selectedUser ? (
            <div className="chat-empty"><span className="chat-empty-icon"><MI name="chat" size={48} /></span><p>{t('Select a conversation or start a new chat')}</p></div>
          ) : (
            <>
              <div className="chat-header-bar">
                <div className="contact-avatar small" style={{ background: roleColors[selectedUser.role] }}>{selectedUser.name.charAt(0)}</div>
                <div style={{ flex: 1 }}><strong>{selectedUser.name}</strong><span className="contact-role"> {t(roleLabels[selectedUser.role] || '')}</span></div>
              </div>
              <div className="chat-messages" ref={scrollRef}>
                {messages.map(m => (
                  <div key={m.id} className={`chat-bubble ${m.sender_id === user.id ? 'own' : 'other'}`}>
                    <div className="chat-name">{m.sender_name}</div>
                    <div>{m.message}</div>
                    <div className="chat-time">{new Date(m.created_at).toLocaleString()}</div>
                  </div>
                ))}
                {messages.length === 0 && <p className="no-data" style={{ padding: 40 }}>{t('No messages yet. Say hello!')}</p>}
              </div>
              <form className="chat-input" onSubmit={sendMessage}>
                <input placeholder={t('Type a message...')} value={newMsg} onChange={e => setNewMsg(e.target.value)} disabled={sending} />
                <button type="submit" disabled={sending || !newMsg.trim()}>{sending ? '...' : t('Send')}</button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
