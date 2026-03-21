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
    <div className="card flex flex-col h-[400px]">
      <div className="card-title flex items-center gap-2">
        <Sparkles size={14} className="text-purple-500" /> Ask your tickets
      </div>
      
      <div className="chat-area flex-1 overflow-y-auto mb-3 pr-2">
        {messages.map((m, idx) => (
          <div key={idx} className={`chat-msg ${m.role === 'user' ? 'chat-q' : ''}`}>
            <div className={`chat-bubble ${m.role === 'user' ? 'user' : 'ai'}`}>
              {dangerouslySetText(m.text)}
            </div>
            {m.refs && m.refs.length > 0 && (
              <div className="refs mt-1">
                Referenced: {m.refs.map((id, i) => (
                  <span key={id}>
                    <Link to={`/tickets/${id}`} className="hover:underline text-blue-600">#{id}</Link>
                    {i < m.refs.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {askMutation.isPending && (
          <div className="chat-msg">
            <div className="chat-bubble ai text-gray-400">Thinking...</div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input 
          className="search-input" 
          placeholder="Ask anything about your tickets..." 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={askMutation.isPending}
        />
        <button 
          type="submit" 
          className="btn-primary flex items-center justify-center min-w-[40px]"
          disabled={!input.trim() || askMutation.isPending}
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}

// Simple helper to safely format basic bolding that Claude might return
function dangerouslySetText(text) {
  // Replace **text** with <strong>text</strong>
  const html = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br />');
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
