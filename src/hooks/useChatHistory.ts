import { useState, useEffect } from 'react';

export type Message = {
  id: string;
  role: 'user' | 'model';
  text: string;
};

export type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
};

const STORAGE_KEY = 'procurement_sql_agent_history';

export function useChatHistory(initialMessage: Message) {
  const [history, setHistory] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string>(Date.now().toString());
  const [messages, setMessages] = useState<Message[]>([initialMessage]);

  // Load history on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Sort by newest first
        setHistory(parsed.sort((a: ChatSession, b: ChatSession) => b.updatedAt - a.updatedAt));
      } catch (e) {
        console.error('Failed to parse chat history', e);
      }
    }
  }, []);

  // Save history to localstorage whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  // Auto-save current chat when messages change
  useEffect(() => {
    if (messages.length > 1) {
      const firstUserMessage = messages.find(m => m.role === 'user')?.text || 'New Chat';
      const title = firstUserMessage.length > 25 ? firstUserMessage.slice(0, 25) + '...' : firstUserMessage;
      
      setHistory(prev => {
        const existingIdx = prev.findIndex(c => c.id === currentChatId);
        const newSession: ChatSession = {
          id: currentChatId,
          title,
          messages,
          updatedAt: Date.now()
        };

        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = newSession;
          // Sort so updated chat jumps to top
          return updated.sort((a, b) => b.updatedAt - a.updatedAt);
        }
        return [newSession, ...prev].sort((a, b) => b.updatedAt - a.updatedAt);
      });
    }
  }, [messages, currentChatId]);

  const startNewChat = () => {
    setCurrentChatId(Date.now().toString());
    setMessages([initialMessage]);
  };

  const loadChat = (id: string) => {
    const session = history.find(c => c.id === id);
    if (session) {
      setCurrentChatId(id);
      setMessages(session.messages);
    }
  };

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent triggering loadChat
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
