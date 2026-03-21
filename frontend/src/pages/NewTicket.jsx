import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { createTicket } from '../api/client';

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
      // Redirect to the detail page
      navigate(`/tickets/${data.id}`);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.title.length < 5 || formData.description.length < 20) {
      return; // Handled by standard HTML5 validation or simple checks below
    }
    mutation.mutate(formData);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="max-w-[560px]">
      <div className="section-head mb-4 text-gray-500 font-semibold tracking-wider text-xs uppercase">
        Submit a new ticket
      </div>

      <form onSubmit={handleSubmit} className="card bg-white p-5 rounded-xl border border-gray-200">
        <div className="form-group mb-4">
          <label className="form-label block text-xs font-medium text-gray-900 mb-1">Your name</label>
          <input 
            required
            name="submitter_name"
            value={formData.submitter_name}
            onChange={handleChange}
            className="form-input w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors" 
            type="text" 
            placeholder="Full name" 
          />
        </div>

        <div className="form-group mb-4">
          <label className="form-label block text-xs font-medium text-gray-900 mb-1">Email address</label>
          <input 
            required
            name="submitter_email"
            value={formData.submitter_email}
            onChange={handleChange}
            className="form-input w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors" 
            type="email" 
            placeholder="you@company.com" 
          />
        </div>

        <div className="form-group mb-4">
          <label className="form-label block text-xs font-medium text-gray-900 mb-1 flex justify-between">
            <span>Title <span className="font-normal text-gray-400">— min 5 characters</span></span>
            <span className={`font-normal ${formData.title.length < 5 && formData.title.length > 0 ? 'text-red-500' : 'text-gray-400'}`}>
              {formData.title.length} / 255
            </span>
          </label>
          <input 
            required
            minLength={5}
            maxLength={255}
            name="title"
            value={formData.title}
            onChange={handleChange}
            className="form-input w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors" 
            type="text" 
            placeholder="Brief summary of the issue" 
          />
        </div>

        <div className="form-group mb-4">
          <label className="form-label block text-xs font-medium text-gray-900 mb-1 flex justify-between">
            <span>Description <span className="font-normal text-gray-400">— min 20 characters</span></span>
            <span className={`font-normal ${formData.description.length < 20 && formData.description.length > 0 ? 'text-red-500' : 'text-gray-400'}`}>
              {formData.description.length} chars
            </span>
          </label>
          <textarea 
            required
            minLength={20}
            name="description"
            value={formData.description}
            onChange={handleChange}
            className="form-textarea w-full border border-gray-300 rounded-md px-3 py-2 text-sm min-h-[100px] resize-y focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors" 
            placeholder="Describe the issue in detail..." 
          />
        </div>

        <div className="form-group mb-6">
          <label className="form-label block text-xs font-medium text-gray-900 mb-1">Source</label>
          <select 
            name="source"
            value={formData.source}
            onChange={handleChange}
            className="form-select w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors bg-white"
          >
            <option value="web_form">Web form</option>
            <option value="email">Email</option>
            <option value="slack">Slack</option>
            <option value="api">API</option>
            <option value="github">GitHub</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <button 
            type="submit" 
            disabled={mutation.isPending || formData.title.length < 5 || formData.description.length < 20}
            className="btn-primary bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mutation.isPending ? 'Submitting...' : 'Submit ticket'}
          </button>
          {mutation.isPending && (
             <span className="text-xs text-gray-500 animate-pulse">Ticket submitted. Waiting for initial response...</span>
          )}
          {!mutation.isPending && (
             <span className="text-xs text-gray-500">AI triage runs automatically after submission</span>
          )}
        </div>
        
        {mutation.isError && (
          <div className="mt-4 p-3 bg-red-50 text-red-700 text-sm rounded-md border border-red-100">
            Failed to submit ticket. Please check your connection and try again.
          </div>
        )}
      </form>

      <div className="info-box mt-5 bg-gray-50 p-4 rounded-xl border border-gray-200">
        <div className="info-box-title text-xs font-semibold text-gray-600 mb-2">What happens after you submit</div>
        <div className="info-box-body text-xs text-gray-500 leading-relaxed space-y-1">
          <p>1. Ticket is created instantly and you receive a confirmation.</p>
          <p>2. Claude AI reads your description and classifies it — category and priority.</p>
          <p>3. A draft reply is prepared for the IT team to review and send.</p>
          <p>4. If your issue matches an open ticket, it's automatically flagged as a duplicate.</p>
          <p>5. High and critical tickets trigger an instant Slack alert to the on-call team.</p>
        </div>
      </div>
    </div>
  );
}
