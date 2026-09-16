'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useProject } from '@/context/ProjectContext';

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useProject();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const token = params.get('token');
  const email = params.get('email');

  const handleReset = async (e) => {
    e.preventDefault(); setError('');
    if (password !== confirm) { setError(t('Passwords do not match')); return; }
    if (password.length < 6) { setError(t('Password must be at least 6 characters')); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, token, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(t(data.error || 'Request failed'));
      setSuccess(true);
    } catch (err) { setError(err.message); }
    setSubmitting(false);
  };

  if (!token || !email) return (
    <div className="login-page">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <h2 style={{ color: '#ef4444' }}>{t('Invalid Reset Link')}</h2>
        <p style={{ color: '#94a3b8', marginTop: 8 }}>{t('This link is invalid or has expired.')}</p>
        <button onClick={() => router.push('/')} className="btn btn-primary" style={{ marginTop: 16 }}>{t('Go to Login')}</button>
      </div>
    </div>
  );

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <h1><span className="material-symbols-outlined" style={{ fontSize: 28, color: '#8A0029' }}>hub</span> GTM CRM</h1>
          <p>{t('Set your new password')}</p>
        </div>

        {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, fontSize: '0.82rem', marginBottom: 16, textAlign: 'center' }}>{error}</div>}

        {success ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <h3 style={{ color: '#10b981' }}>{t('Password Reset!')}</h3>
            <p style={{ color: '#94a3b8', marginTop: 8, fontSize: '0.85rem' }}>{t('Your password has been updated.')}</p>
            <button onClick={() => router.push('/')} className="btn btn-primary" style={{ marginTop: 16, width: '100%', padding: 12 }}>{t('Sign In')}</button>
          </div>
        ) : (
          <form onSubmit={handleReset}>
            <div className="form-group"><label>{t('New Password')}</label><input className="form-input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required /></div>
            <div className="form-group"><label>{t('Confirm Password')}</label><input className="form-input" type="password" placeholder="••••••••" value={confirm} onChange={e => setConfirm(e.target.value)} required /></div>
            <button type="submit" disabled={submitting} className="btn btn-primary" style={{ width: '100%', padding: 12, fontSize: '0.92rem', marginTop: 8 }}>
              {submitting ? t('Resetting...') : t('Reset Password')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<div className="page-loading">…</div>}><ResetForm /></Suspense>;
}
