import { useState, useEffect } from 'react';

export type Message = {
  id: string;
  role: 'user' | 'model';
  text: string;
};

export type ChatSession = {
  id: string;
  title: string;
  user_id?: string;
  cost_center?: string;
  messages: Message[];
  updatedAt: number;
};

const API_BASE = 'http://localhost:3001/api';

export function useChatHistory(initialMessage: Message, userId: string, costCenter: string) {
  const [history, setHistory] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string>(Date.now().toString());
  const [messages, setMessages] = useState<Message[]>([initialMessage]);
  const [isReady, setIsReady] = useState(false);

  // Load history from backend
  useEffect(() => {
    if (!userId || userId === 'Loading...') return;

    fetch(`${API_BASE}/sessions/${userId}`)
      .then(res => res.json())
      .then(sessions => {
        // sessions only contain id, title, user_id, cost_center, created_at
        // we map it to match our state
        const formatted = sessions.map((s: any) => ({
          ...s,
          updatedAt: new Date(s.created_at).getTime(),
          messages: []
        }));
        setHistory(formatted);
        setIsReady(true);
      })
      .catch(e => console.error('Failed to load sessions', e));
  }, [userId]);

  // Load messages when chat changes
  useEffect(() => {
    if (!isReady) return;
    
    // Check if session exists in history
    const sessionExists = history.some(h => h.id === currentChatId);
    if (!sessionExists && messages.length <= 1) return;

    fetch(`${API_BASE}/messages/${currentChatId}`)
      .then(res => res.json())
      .then(data => {
        if (data.length > 0) {
          const formatted = data.map((m: any) => ({
            id: m.id,
            role: m.role,
            text: m.content
          }));
          setMessages(formatted);
        } else {
          // If no messages found, reset to initial message
          setMessages([initialMessage]);
        }
      })
      .catch(e => console.error('Failed to load messages', e));
  }, [currentChatId, isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save current chat and messages
  useEffect(() => {
    if (!isReady || messages.length <= 1) return;

    const firstUserMessage = messages.find(m => m.role === 'user')?.text || 'New Chat';
    const title = firstUserMessage.length > 25 ? firstUserMessage.slice(0, 25) + '...' : firstUserMessage;
    
    const existingIdx = history.findIndex(c => c.id === currentChatId);
    
    if (existingIdx === -1) {
      // Create new session
      fetch(`${API_BASE}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentChatId, title, user_id: userId, cost_center: costCenter })
      }).catch(console.error);

      setHistory(prev => [{
        id: currentChatId, title, user_id: userId, cost_center: costCenter, messages: [], updatedAt: Date.now()
      }, ...prev]);
    }

    // Save the newest message to DB
    const lastMessage = messages[messages.length - 1];
    fetch(`${API_BASE}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: lastMessage.id,
        session_id: currentChatId,
        role: lastMessage.role,
        content: lastMessage.text
      })
    }).catch(console.error);

  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  const startNewChat = () => {
    setCurrentChatId(Date.now().toString());
    setMessages([initialMessage]);
  };

  const loadChat = (id: string) => {
    setCurrentChatId(id);
    // Messages will auto-load via useEffect
  };

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    fetch(`${API_BASE}/sessions/${id}`, { method: 'DELETE' }).catch(console.error);

    setHistory(prev => prev.filter(c => c.id !== id));
    if (currentChatId === id) {
      setCurrentChatId(Date.now().toString());
      setMessages([initialMessage]);
    }
  };

  return {
    messages,
    setMessages,
    history,
    currentChatId,
    startNewChat,
    loadChat,
    deleteChat
  };
}
