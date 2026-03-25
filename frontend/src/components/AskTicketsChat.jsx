import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { askTickets } from '../api/client';
import { Link } from 'react-router-dom';
import { Send, Sparkles } from 'lucide-react';

export default function AskTicketsChat() {
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'Hi! Ask me anything about past or current tickets.', refs: [] }
  ]);
  const [input, setInput] = useState('');
  const chatEndRef = useRef(null);

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

  return (
    <div className="bg-white rounded-2xl border border-theme-border flex flex-col h-full min-h-[300px] shadow-soft overflow-hidden">
      <div className="border-b border-theme-border p-5 bg-gray-50/50 flex items-center justify-between flex-shrink-0">
        <h2 className="text-lg font-semibold text-theme-textMain flex items-center gap-2">
          <Sparkles size={18} className="text-purple-500" /> Ask your tickets
        </h2>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((m, idx) => (
          <div key={idx} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`inline-block max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${m.role === 'user' ? 'bg-theme-primary text-white rounded-tr-sm' : 'bg-gray-100 text-theme-textMain rounded-tl-sm border border-gray-200'}`}>
              {dangerouslySetText(m.text)}
            </div>
            {m.refs && m.refs.length > 0 && (
              <div className="text-[11px] text-theme-textMuted mt-1.5 px-1">
                Referenced: {m.refs.map((id, i) => (
                  <span key={id}>
                    <Link to={`/tickets/${id}`} className="hover:underline text-theme-primary font-medium">#{id}</Link>
                    {i < m.refs.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {askMutation.isPending && (
          <div className="flex flex-col items-start">
             <div className="inline-block px-4 py-2.5 rounded-2xl text-sm bg-gray-100 text-gray-500 rounded-tl-sm border border-gray-200 animate-pulse">
               Thinking...
             </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-theme-border bg-white flex gap-3 flex-shrink-0">
        <input 
          className="flex-1 bg-gray-50 border border-theme-border rounded-xl px-4 py-2.5 text-sm text-theme-textMain focus:outline-none focus:border-theme-primary transition-colors" 
          placeholder="Ask anything about your tickets..." 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={askMutation.isPending}
          autoComplete="off"
        />
        <button 
          type="submit" 
          className="flex items-center justify-center w-12 bg-theme-sidebarActive hover:bg-theme-sidebar text-white rounded-xl transition-colors disabled:opacity-50"
          disabled={!input.trim() || askMutation.isPending}
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}

function dangerouslySetText(text) {
  const html = text
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold">$1</strong>')
    .replace(/\n/g, '<br />');
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
