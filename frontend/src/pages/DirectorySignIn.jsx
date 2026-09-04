import { useState } from 'react';
import { KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useDirectoryAuth } from '../auth/DirectoryAuthContext';

export default function DirectorySignIn() {
  const { signIn } = useDirectoryAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await signIn({ username: username.trim(), password });
    } catch (requestError) {
      setPassword('');
      setError(requestError.response?.data?.detail || 'Unable to verify your MissionControl technician account.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-theme-sidebar flex items-center justify-center p-6 font-sans">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white p-8 shadow-2xl">
        <div className="mb-7 flex items-center gap-3">
          <div className="rounded-2xl bg-theme-primary p-3 text-white"><ShieldCheck size={24} /></div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-theme-primary">MissionControl</p>
            <h1 className="text-xl font-bold text-theme-textMain">Technician sign in</h1>
          </div>
        </div>
        <p className="mb-6 text-sm leading-6 text-theme-textMuted">Use your Active Directory technician account. Ticketing does not create or store separate credentials.</p>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-semibold text-theme-textMain">
            Username
            <input
              autoComplete="username"
              className="mt-1.5 w-full rounded-xl border border-theme-border bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-theme-primary"
              disabled={isSubmitting}
              onChange={(event) => setUsername(event.target.value)}
              required
              value={username}
            />
          </label>
          <label className="block text-sm font-semibold text-theme-textMain">
            Password
            <input
              autoComplete="current-password"
              className="mt-1.5 w-full rounded-xl border border-theme-border bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-theme-primary"
              disabled={isSubmitting}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}
          <button
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-theme-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-theme-primaryHover disabled:opacity-50"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? <LoaderCircle className="animate-spin" size={16} /> : <KeyRound size={16} />}
            {isSubmitting ? 'Signing in…' : 'Sign in to Ticketing'}
          </button>
        </form>
      </section>
    </main>
  );
}
