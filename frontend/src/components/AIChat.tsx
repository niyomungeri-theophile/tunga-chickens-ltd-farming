import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, Send, X, Bot, User, Loader2, Sparkles, AlertCircle, Trash2 } from 'lucide-react';
import { parseApiResponse } from '../utils/parseApiResponse';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

const STORAGE_KEY = 'ecoSmartChat';
const MAX_MESSAGES = 30;
const RATE_LIMIT_MS = 2000;
const MAX_INPUT_LENGTH = 500;

// Generate unique ID (crypto.randomUUID fallback)
const generateId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
};

const INITIAL_MESSAGE: Message = {
  id: generateId(),
  role: 'model',
  text: 'Muraho! Ndi Eco-Smart AI. Ngufashe iki ku bijyanye n\'ubworozi n\'igenzura ry\'imishwi?',
  timestamp: Date.now(),
};

const AIChat: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>(() => {
    // Load from localStorage on init
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : [INITIAL_MESSAGE];
      }
    } catch (e) {
      console.warn('Failed to load chat history');
    }
    return [INITIAL_MESSAGE];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastMessageTime, setLastMessageTime] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Persist messages to localStorage
  useEffect(() => {
    try {
      // Only keep last MAX_MESSAGES to prevent storage bloat
      const trimmedMessages = messages.slice(-MAX_MESSAGES);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedMessages));
    } catch (e) {
      console.warn('Failed to save chat history');
    }
  }, [messages]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Escape key to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const clearChat = useCallback(() => {
    if (window.confirm('Kanda OK niba ushaka gusiba ubutumwa bwose.')) {
      setMessages([{ ...INITIAL_MESSAGE, id: generateId(), timestamp: Date.now() }]);
      setError(null);
    }
  }, []);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedInput = input.trim();
    
    // Validation
    if (!trimmedInput || isLoading) return;
    if (trimmedInput.length > MAX_INPUT_LENGTH) {
      setError(`Ubutumwa ntiburenge ${MAX_INPUT_LENGTH} inyuguti.`);
      return;
    }
    
    // Rate limiting
    const now = Date.now();
    if (now - lastMessageTime < RATE_LIMIT_MS) {
      const waitSeconds = Math.ceil((RATE_LIMIT_MS - (now - lastMessageTime)) / 1000);
      setError(`Nyamuneka tegereza amasegonda ${waitSeconds}...`);
      return;
    }

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      text: trimmedInput,
      timestamp: now,
    };

    setInput('');
    setError(null);
    setMessages(prev => [...prev, userMessage]);
    setLastMessageTime(now);
    setIsLoading(true);
    setIsTyping(true);

    // Create abort controller for this request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      // Call backend proxy instead of direct Gemini API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: trimmedInput,
          history: messages.map(m => ({
            role: m.role,
            text: m.text,
          })),
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await parseApiResponse(response).catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await parseApiResponse(response);
      
      const aiMessage: Message = {
        id: generateId(),
        role: 'model',
        text: data.response || "Ntabwo nshoboye kubona igisubizo nonaha. Ongera ugerageze.",
        timestamp: Date.now(),
      };
      
      setMessages(prev => [...prev, aiMessage]);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Request aborted');
        return;
      }
      
      console.error("Chat Error:", err);
      
      let errorMessage = "Habaye ikibazo mu itumanaho. Ongera ugerageze mukanya.";
      if (err.message.includes('fetch')) {
        errorMessage = "Ntibyashobotse guhuza na seriveri. Reba internet yawe.";
      }
      
      setError(errorMessage);
      
      const fallbackMessage: Message = {
        id: generateId(),
        role: 'model',
        text: "Mumbabarire, habaye ikibazo cyo guhuza na AI. Reba niba internet yawe ikora neza cyangwa ongera ugerageze mukanya.",
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, fallbackMessage]);
    } finally {
      setIsLoading(false);
      setIsTyping(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString('rw-RW', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed bottom-6 right-6 z-[100] font-['Poppins',_sans-serif]">
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="w-16 h-16 bg-emerald-500 text-white rounded-full shadow-2xl flex items-center justify-center hover:bg-emerald-600 transition-all hover:scale-110 active:scale-95 group relative"
          aria-label="Open chat"
        >
          <div className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-20 group-hover:opacity-0"></div>
          <MessageSquare size={28} />
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="bg-white dark:bg-slate-900 w-[calc(100vw-3rem)] max-w-[400px] h-[500px] sm:h-[550px] rounded-[2rem] sm:rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-slate-100 dark:border-white/5 flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 p-5 flex items-center justify-between text-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
                <Sparkles size={20} />
              </div>
              <div>
                <h3 className="font-black text-sm uppercase tracking-widest">Eco-Smart AI</h3>
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 ${isTyping ? 'bg-yellow-300' : 'bg-emerald-300'} rounded-full ${!isTyping && 'animate-pulse'}`}></div>
                  <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">
                    {isTyping ? 'Typing...' : 'Online Assistant'}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={clearChat}
                className="p-2 hover:bg-white/20 rounded-xl transition-all"
                aria-label="Clear chat"
                title="Clear conversation"
              >
                <Trash2 size={18} />
              </button>
              <button 
                onClick={() => setIsOpen(false)} 
                className="p-2 hover:bg-white/20 rounded-xl transition-all"
                aria-label="Close chat"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div 
            ref={scrollRef} 
            className="flex-grow overflow-y-auto p-5 space-y-4 bg-slate-50/50 dark:bg-slate-950/50"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#10b981 #f1f5f9',
            }}
          >
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] group relative ${
                  m.role === 'user' 
                    ? 'bg-emerald-500 text-white rounded-2xl rounded-tr-none' 
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-100 dark:border-white/5 rounded-2xl rounded-tl-none'
                } p-3.5 shadow-sm`}>
                  <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap break-words">
                    {m.text}
                  </p>
                  <span className="text-[9px] opacity-50 mt-1 block text-right">
                    {formatTime(m.timestamp)}
                  </span>
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl rounded-tl-none border border-slate-100 dark:border-white/5">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"></span>
                  </div>
                </div>
              </div>
            )}
            
            {error && (
              <div className="flex items-center justify-center gap-2 text-rose-500 text-[10px] font-black uppercase tracking-widest bg-rose-50 dark:bg-rose-500/10 p-3 rounded-2xl border border-rose-100 dark:border-rose-500/10 animate-in slide-in-from-bottom-2 duration-300">
                <AlertCircle size={14} /> {error}
              </div>
            )}
          </div>

          {/* Input Area */}
          <form onSubmit={handleSendMessage} className="p-5 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-white/5">
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Andika ubutumwa bwawe..."
                maxLength={MAX_INPUT_LENGTH}
                disabled={isLoading}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-white/5 rounded-2xl pl-5 pr-14 py-3.5 text-sm font-medium focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all dark:text-white disabled:opacity-50"
                aria-label="Message input"
              />
              <div className="absolute right-14 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold">
                {input.length}/{MAX_INPUT_LENGTH}
              </div>
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center hover:bg-emerald-600 transition-all disabled:opacity-30 disabled:hover:bg-emerald-500 active:scale-90"
                aria-label="Send message"
              >
                <Send size={18} />
              </button>
            </div>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider text-center mt-3">
              Eco-Smart AI • {messages.length} ubutumwa
            </p>
          </form>
        </div>
      )}
      
      <style jsx>{`
        @keyframes ping {
          75%, 100% {
            transform: scale(2);
            opacity: 0;
          }
        }
        .animate-ping {
          animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
      `}</style>
    </div>
  );
};

export default AIChat;