import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { createTicket } from '../api/client';
import { Sparkles, ArrowRight } from 'lucide-react';

export default function NewTicket() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    submitter_name: '',
    submitter_email: '',
    title: '',
    description: '',
    source: 'web_form',
  });

  const mutation = useMutation({
    mutationFn: createTicket,
    onSuccess: (data) => {
      navigate(`/tickets/${data.id}`);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.title.length < 5 || formData.description.length < 20) {
      return;
    }
    mutation.mutate(formData);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-theme-bg min-h-0 flex justify-center">
      <div className="w-full max-w-3xl flex flex-col gap-6">
        
        <div className="bg-white rounded-3xl p-8 border border-theme-border shadow-soft">
          <h2 className="text-xl font-bold text-theme-textMain mb-6">Submit a New Request</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-theme-textMain">Full Name</label>
                <input 
                  required
                  name="submitter_name"
                  value={formData.submitter_name}
                  onChange={handleChange}
                  className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-theme-textMain focus:outline-none focus:border-theme-primary transition-colors" 
                  type="text" 
                  placeholder="e.g. Jane Doe" 
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-theme-textMain">Email Address</label>
                <input 
                  required
                  name="submitter_email"
                  value={formData.submitter_email}
                  onChange={handleChange}
                  className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-theme-textMain focus:outline-none focus:border-theme-primary transition-colors" 
                  type="email" 
                  placeholder="jane@company.com" 
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="flex items-center justify-between text-sm font-semibold text-theme-textMain">
                <span>Summary <span className="text-gray-400 font-normal ml-1">(min 5 chars)</span></span>
                <span className={`text-[11px] font-medium ${formData.title.length < 5 && formData.title.length > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                  {formData.title.length}/255
                </span>
              </label>
              <input 
                required
                minLength={5}
                maxLength={255}
                name="title"
                value={formData.title}
                onChange={handleChange}
                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-theme-textMain focus:outline-none focus:border-theme-primary transition-colors" 
                type="text" 
                placeholder="Brief description of the issue" 
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="flex items-center justify-between text-sm font-semibold text-theme-textMain">
                <span>Detailed Description <span className="text-gray-400 font-normal ml-1">(min 20 chars)</span></span>
                <span className={`text-[11px] font-medium ${formData.description.length < 20 && formData.description.length > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                  {formData.description.length} chars
                </span>
              </label>
              <textarea 
                required
                minLength={20}
                name="description"
                value={formData.description}
                onChange={handleChange}
                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-theme-textMain focus:outline-none focus:border-theme-primary transition-colors min-h-[140px] resize-y leading-relaxed" 
                placeholder="Please provide steps to reproduce, error messages, or any relevant context..." 
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-theme-textMain">Origin Source</label>
              <div className="relative border border-gray-200 rounded-xl overflow-hidden bg-gray-50 focus-within:border-theme-primary transition-colors">
                <select 
                  name="source"
                  value={formData.source}
                  onChange={handleChange}
                  className="w-full appearance-none bg-transparent px-4 py-3 text-sm text-theme-textMain outline-none cursor-pointer"
                >
                  <option value="web_form">Web Portal</option>
                  <option value="email">Email System</option>
                  <option value="slack">Slack Integration</option>
                  <option value="api">External API</option>
                  <option value="github">GitHub Issues</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 mt-2 border-t border-gray-100">
              <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 px-4 py-2 rounded-lg border border-gray-100">
                <Sparkles size={16} className="text-purple-500" />
                <span>Auto-triage enabled</span>
              </div>
              
              <button 
                type="submit" 
                disabled={mutation.isPending || formData.title.length < 5 || formData.description.length < 20}
                className="flex items-center gap-2 bg-theme-primary hover:bg-theme-primaryHover text-white rounded-xl py-3 px-8 font-semibold shadow-lg shadow-theme-primary/20 transition-all text-sm disabled:opacity-50"
              >
                {mutation.isPending ? 'Submitting...' : 'Submit Ticket'} <ArrowRight size={16} />
              </button>
            </div>
            
            {mutation.isError && (
              <div className="p-4 bg-red-50 text-red-700 text-sm rounded-xl border border-red-200 font-medium">
                Failed to submit ticket. Please check your connection and try again.
              </div>
            )}
          </form>
        </div>

        <div className="bg-gradient-to-r from-theme-sidebar to-theme-sidebarActive p-6 rounded-3xl text-white shadow-soft relative overflow-hidden">
          <Sparkles size={100} className="absolute -right-6 -bottom-6 text-white/5 rotate-12" />
          <h3 className="text-sm font-bold tracking-wider uppercase mb-4 text-white/80">What happens next?</h3>
          <ul className="text-sm text-white/90 space-y-3 font-medium">
            <li className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">1</div>
              Ticket is created instantly and recorded in the system.
            </li>
            <li className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">2</div>
              Claude AI reads your description and assigns category and priority.
            </li>
            <li className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">3</div>
              Support agents receive suggested actions and duplicate alerts.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
