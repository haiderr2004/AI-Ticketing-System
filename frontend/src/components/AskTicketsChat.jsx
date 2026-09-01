import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { askTickets } from '../api/client';
import { Link } from 'react-router-dom';
import { Send, Sparkles, X, MessageSquare } from 'lucide-react';

export default function AskTicketsChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'Hi! Ask me anything about past or current tickets.', refs: [] }
  ]);
  const [input, setInput] = useState('');
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  const askMutation = useMutation({
    mutationFn: askTickets,
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        { role: 'ai', text: data.answer, refs: data.relevant_ticket_ids || [] }
      ]);
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        { role: 'ai', text: 'Sorry, I encountered an error searching the tickets.', refs: [] }
      ]);
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || askMutation.isPending) return;
    setMessages((prev) => [...prev, { role: 'user', text: input.trim(), refs: [] }]);
    askMutation.mutate(input.trim());
    setInput('');
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, askMutation.isPending]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  const unreadCount = open ? 0 : messages.filter((m) => m.role === 'ai').length - 1;

  return (
    <>
      {/* Chat Panel */}
      <div
        className={`fixed top-24 right-6 z-50 w-[340px] sm:w-[400px] bg-white rounded-2xl border border-theme-border shadow-2xl flex flex-col overflow-hidden transition-all duration-300 origin-top-right
          ${open ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'}`}
        style={{ maxHeight: '520px' }}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-theme-sidebar flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-theme-primary/20 flex items-center justify-center">
              <Sparkles size={14} className="text-theme-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white leading-none">Ask your tickets</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Powered by Claude AI</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
          >
            <X size={16} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scroll" style={{ minHeight: 0 }}>
          {messages.map((m, idx) => (
            <div key={idx} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div
                className={`inline-block max-w-[85%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed
                  ${m.role === 'user'
                    ? 'bg-theme-primary text-white rounded-tr-sm'
                    : 'bg-gray-100 text-theme-textMain rounded-tl-sm border border-gray-200'
                  }`}
              >
                {renderText(m.text)}
              </div>
              {m.refs?.length > 0 && (
                <div className="text-[11px] text-theme-textMuted mt-1 px-1">
                  Referenced:{' '}
                  {m.refs.map((id, i) => (
                    <span key={id}>
                      <Link
                        to={`/tickets/${id}`}
                        className="hover:underline text-theme-primary font-medium"
                        onClick={() => setOpen(false)}
                      >
                        #{id}
                      </Link>
                      {i < m.refs.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {askMutation.isPending && (
            <div className="flex items-start">
              <div className="px-3.5 py-2 rounded-2xl rounded-tl-sm bg-gray-100 border border-gray-200 text-sm text-gray-400 flex items-center gap-2">
                <span className="flex gap-0.5">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-3 border-t border-theme-border flex gap-2 flex-shrink-0 bg-white">
          <input
            ref={inputRef}
            className="flex-1 bg-gray-50 border border-theme-border rounded-xl px-3.5 py-2 text-sm text-theme-textMain focus:outline-none focus:border-theme-primary transition-colors placeholder:text-gray-400"
            placeholder="Ask about tickets…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={askMutation.isPending}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={!input.trim() || askMutation.isPending}
            className="flex items-center justify-center w-9 h-9 bg-theme-primary hover:bg-theme-primaryHover text-white rounded-xl transition-colors disabled:opacity-40 flex-shrink-0"
          >
            <Send size={14} />
          </button>
        </form>
      </div>

      {/* Pill Button — top right, centered in purple header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`fixed top-7 right-6 z-50 flex items-center gap-2.5 px-6 py-2.5 rounded-full shadow-lg font-semibold text-base text-white transition-all duration-200
          ${open ? 'bg-theme-sidebar' : 'bg-theme-primary hover:bg-theme-primaryHover'}`}
      >
        {open ? <X size={18} className="text-white" /> : <MessageSquare size={18} className="text-white" />}
        Ask
        {!open && unreadCount > 0 && (
          <span className="w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </button>
    </>
  );
}

function renderText(text) {
  const html = text
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold">$1</strong>')
    .replace(/\n/g, '<br />');
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
