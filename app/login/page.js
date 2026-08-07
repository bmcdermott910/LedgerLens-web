'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState('');

  async function sendLink(e) {
    e.preventDefault();
    setStatus('sending');
    setErrorMsg('');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Access is invite-only: the account has to already exist in Supabase Auth.
        // Without this, ANY address typed here would create an account and inherit
        // read access to the whole ledger.
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setStatus('error');
      // Supabase reports "Signups not allowed for otp" when the address is not on the
      // list. Surfaced as plain English, without confirming whether the address exists.
      const notInvited = /signups? not allowed|otp_disabled|user not found/i.test(error.message);
      setErrorMsg(
        notInvited
          ? "That address doesn't have access to LedgerLens. Contact Brian McDermott to be added."
          : error.message
      );
    } else {
      setStatus('sent');
    }
  }

  return (
    <div className="login-box">
      <h2 style={{ color: '#0f2a4a', marginTop: 0 }}>LedgerLens</h2>
      <p className="small-muted">Sign in with a magic link sent to your email. No password needed.</p>
      {status === 'sent' ? (
        <p>
          Check <strong>{email}</strong> for a sign-in link. It expires in one hour.
        </p>
      ) : (
        <form onSubmit={sendLink}>
          <input
            type="email"
            required
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" disabled={status === 'sending'}>
            {status === 'sending' ? 'Sending…' : 'Send magic link'}
          </button>
          {status === 'error' && <p className="small-muted" style={{ color: '#d64545' }}>{errorMsg}</p>}
        </form>
      )}
    </div>
  );
}
