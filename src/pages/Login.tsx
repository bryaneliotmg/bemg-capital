import { useState, type FormEvent } from 'react';
import { Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function handleMagicLink(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setSending(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  async function handleGoogle() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) setError(error.message);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper">
      <div className="glass-card p-10 w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-8">
          <svg width="32" height="32" viewBox="0 0 30 30" fill="none">
            <rect width="30" height="30" rx="8" className="fill-accent" />
            <rect x="8" y="16" width="4" height="8" rx="1" fill="#ffffff" />
            <rect x="14" y="11" width="4" height="13" rx="1" fill="#ffffff" />
            <rect x="20" y="6" width="4" height="18" rx="1" fill="#ffffff" />
          </svg>
          <div className="font-serif font-semibold text-lg tracking-tight">bEMG Capital</div>
        </div>

        {sent ? (
          <div className="text-[13px] text-ink-2 leading-relaxed">
            Check <span className="font-semibold text-ink">{email}</span> for a sign-in link.
          </div>
        ) : (
          <>
            <div className="text-[13px] text-ink-2 mb-6">Sign in with your bEMG account to continue.</div>
            <button
              className="glass-btn-outline w-full justify-center mb-4"
              onClick={handleGoogle}
              type="button"
            >
              Continue with Google
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-line" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-ink-3">or</span>
              <div className="flex-1 h-px bg-line" />
            </div>
            <form onSubmit={handleMagicLink} className="flex flex-col gap-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@bemgbusiness.com"
                className="w-full bg-surface-2 border border-line-2 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-accent"
              />
              <button className="glass-btn w-full justify-center" type="submit" disabled={sending}>
                <Mail className="w-3.5 h-3.5" />
                {sending ? 'Sending…' : 'Email me a sign-in link'}
              </button>
            </form>
          </>
        )}

        {error && <div className="text-[12px] font-semibold text-required mt-4">{error}</div>}
      </div>
    </div>
  );
}
