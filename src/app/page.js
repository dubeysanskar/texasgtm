'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

const MI = ({ name, size = 18 }) => (
  <span className="material-symbols-outlined" style={{ fontSize: `${size}px`, verticalAlign: 'middle' }}>{name}</span>
);

// Fetch wrapper that always yields a readable error, even when the server
// returns a non-JSON 5xx page (e.g. when the database is unreachable).
async function api(url, body, method = 'POST') {
  let res;
  try {
    res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('Cannot reach the server. Check your connection and try again.');
  }
  let data = {};
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) {
    throw new Error(data.error || (res.status >= 500
      ? 'Server error — the database may be unavailable. Please try again shortly.'
      : `Request failed (${res.status})`));
  }
  return data;
}

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState('login'); // login | otp | register | forgot
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [regName, setRegName] = useState('');
  const [regProjectId, setRegProjectId] = useState('');
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (!loading && user) router.push('/dashboard'); }, [user, loading, router]);

  // Projects for the signup "Project Allotment" dropdown
  useEffect(() => {
    if (mode !== 'register' || projects.length) return;
    fetch('/api/projects/public').then(r => r.json()).then(d => setProjects(Array.isArray(d) ? d : [])).catch(() => {});
  }, [mode, projects.length]);

  // OTP resend countdown
  useEffect(() => {
    if (otpCountdown <= 0) return;
    const t = setTimeout(() => setOtpCountdown(otpCountdown - 1), 1000);
    return () => clearTimeout(t);
  }, [otpCountdown]);

  // Detect admin/manager accounts (OTP-only, no password) as the email is typed
  useEffect(() => {
    if (mode !== 'login' || !email.includes('@')) { setIsAdmin(false); return; }
    const t = setTimeout(async () => {
      try {
        const d = await api('/api/auth/check-email', { email });
        setIsAdmin(d.is_admin === true);
      } catch { setIsAdmin(false); }
    }, 500);
    return () => clearTimeout(t);
  }, [email, mode]);

  const clearMsgs = () => { setError(''); setSuccess(''); };
  const go = (m) => { setMode(m); setOtp(''); clearMsgs(); };

  // Step 1: email (+ password for non-admins) → sends OTP
  const handleLogin = async (e) => {
    e.preventDefault(); clearMsgs(); setSubmitting(true);
    try {
      const check = await api('/api/auth/check-email', { email });
      if (!check.exists) throw new Error('No account found with this email');
      if (!check.is_admin) {
        await api('/api/auth/login', { email, password });
      }
      await api('/api/auth/otp/send', { email, purpose: check.is_admin ? 'admin_login' : 'login' });
      setIsAdmin(check.is_admin);
      setMode('otp'); setOtpCountdown(60);
      setSuccess('Verification code sent to your email');
    } catch (err) { setError(err.message); }
    setSubmitting(false);
  };

  // Step 2: OTP → session cookie
  const handleOtpVerify = async (e) => {
    e.preventDefault(); clearMsgs(); setSubmitting(true);
    try {
      const d = await api('/api/auth/otp/send', { email, otp }, 'PUT');
      localStorage.setItem('gtm-user', JSON.stringify(d.user));
      window.location.href = '/dashboard';
    } catch (err) { setError(err.message); setSubmitting(false); }
  };

  const resendOtp = async () => {
    clearMsgs(); setSubmitting(true);
    try { await api('/api/auth/otp/send', { email }); setOtpCountdown(60); setSuccess('New verification code sent'); }
    catch (err) { setError(err.message); }
    setSubmitting(false);
  };

  const handleRegister = async (e) => {
    e.preventDefault(); clearMsgs(); setSubmitting(true);
    try {
      await api('/api/auth/register', { name: regName, email, password, project_id: Number(regProjectId) });
      window.location.href = '/dashboard'; // register sets the session cookie
    } catch (err) { setError(err.message); setSubmitting(false); }
  };

  const handleForgot = async (e) => {
    e.preventDefault(); clearMsgs(); setSubmitting(true);
    try { await api('/api/auth/forgot-password', { email }); setSuccess('If that email exists, a reset link has been sent.'); }
    catch (err) { setError(err.message); }
    setSubmitting(false);
  };

  if (loading) return <div className="page-loading">Loading...</div>;
  if (user) return null;

  const maskedEmail = email ? email.replace(/(.{2})(.*)(@.*)/, '$1***$3') : '';
  const heading = { login: 'Welcome back', otp: 'Verify your identity', register: 'Create your account', forgot: 'Reset your password' }[mode];
  const sub = {
    login: 'Sign in to your CRM account to continue',
    otp: `Enter the 6-digit code sent to ${maskedEmail}`,
    register: 'Join your team workspace',
    forgot: 'We will email you a link to set a new password',
  }[mode];

  return (
    <div className="login-page-v2">
      <div className="login-bg-decoration">
        <div className="login-bg-circle login-bg-circle-1" />
        <div className="login-bg-circle login-bg-circle-2" />
        <div className="login-bg-circle login-bg-circle-3" />
        <div className="login-bg-grid" />
      </div>

      <div className="login-wrapper">
        {/* ═══ Branding panel ═══ */}
        <div className="login-branding-panel">
          <div className="login-branding-content">
            <img src="/taha-logo.png" alt="Taha Airwaves" className="login-logo" />
            <div className="login-branding-text">
              <h2>TexasGTM CRM</h2>
              <p>Manage leads, campaigns, and your team across Arabic, Russian, and global markets — all in one workspace.</p>
            </div>
            <div className="login-features">
              <div className="login-feature-item">
                <span className="login-feature-icon"><MI name="verified_user" size={22} /></span>
                <div><strong>2-Step Verification</strong><span>OTP-secured login for all users</span></div>
              </div>
              <div className="login-feature-item">
                <span className="login-feature-icon"><MI name="leaderboard" size={22} /></span>
                <div><strong>Lead Intelligence</strong><span>Track and score leads by region</span></div>
              </div>
              <div className="login-feature-item">
                <span className="login-feature-icon"><MI name="forward_to_inbox" size={22} /></span>
                <div><strong>Automated Outreach</strong><span>Multilingual email campaigns at scale</span></div>
              </div>
            </div>
          </div>
          <div className="login-branding-footer">
            <span>&copy; {new Date().getFullYear()} Taha Airwaves</span>
            <span>Where Talent Meets Reliability</span>
          </div>
        </div>

        {/* ═══ Form panel ═══ */}
        <div className="login-form-panel">
          <div className="login-form-content">
            <div className="login-form-header">
              <img src="/taha-logo.png" alt="Taha Airwaves" className="login-form-logo-mobile" />
              <h1>{heading}</h1>
              <p>{sub}</p>
            </div>

            {success && <div className="login-alert login-alert-success"><span className="login-alert-icon"><MI name="check_circle" /></span>{success}</div>}
            {error && <div className="login-alert login-alert-error"><span className="login-alert-icon"><MI name="warning" /></span>{error}</div>}

            {/* ── LOGIN ── */}
            {mode === 'login' && (
              <form onSubmit={handleLogin} className="login-v2-form">
                <div className="login-field">
                  <label htmlFor="login-email">Email Address</label>
                  <div className="login-input-wrapper">
                    <span className="login-input-icon"><MI name="mail" /></span>
                    <input id="login-email" type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} placeholder="you@company.com" required autoComplete="email" autoFocus />
                    {isAdmin && <span className="login-admin-tag"><MI name="shield" size={12} /> Admin</span>}
                  </div>
                </div>

                {isAdmin ? (
                  <>
                    <div className="login-alert login-alert-info">
                      <span className="login-alert-icon"><MI name="verified_user" /></span>
                      Admin detected. Click below to receive your login code.
                    </div>
                    <button type="submit" className="login-submit-btn login-submit-btn-admin" disabled={submitting}>
                      {submitting ? <><span className="login-spinner" /> Sending OTP...</> : <><MI name="send" size={16} /> Request OTP</>}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="login-field">
                      <label htmlFor="login-password">Password</label>
                      <div className="login-input-wrapper">
                        <span className="login-input-icon"><MI name="lock" /></span>
                        <input id="login-password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required autoComplete="current-password" />
                        <button type="button" className="login-password-toggle" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                          <MI name={showPassword ? 'visibility_off' : 'visibility'} />
                        </button>
                      </div>
                    </div>
                    <div className="login-forgot-row">
                      <button type="button" className="login-link-btn" onClick={() => go('forgot')}>Forgot Password?</button>
                    </div>
                    <button type="submit" className="login-submit-btn" disabled={submitting}>
                      {submitting ? <><span className="login-spinner" /> Verifying credentials...</> : <>Continue <MI name="arrow_forward" size={16} /></>}
                    </button>
                  </>
                )}
                <div className="login-secure-note"><MI name="shield" size={13} /> Secured with OTP verification</div>
              </form>
            )}

            {/* ── OTP ── */}
            {mode === 'otp' && (
              <form onSubmit={handleOtpVerify} className="login-v2-form">
                <div className="login-alert login-alert-otp">
                  <span className="login-alert-icon"><MI name="shield" /></span>
                  A 6-digit verification code has been sent to your email. Check your inbox and spam folder.
                </div>
                <div className="login-field">
                  <label>Verification Code</label>
                  <div className="login-input-wrapper">
                    <span className="login-input-icon"><MI name="pin" /></span>
                    <input type="text" inputMode="numeric" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Enter 6-digit code" required maxLength={6} autoFocus className="login-otp-input" />
                  </div>
                </div>
                <button type="submit" className="login-submit-btn" disabled={submitting || otp.length !== 6}>
                  {submitting ? <><span className="login-spinner" /> Verifying...</> : <>Verify &amp; Sign In <span>&rarr;</span></>}
                </button>
                <div className="login-otp-actions">
                  <button type="button" className="login-link-btn" onClick={resendOtp} disabled={otpCountdown > 0 || submitting} style={{ color: otpCountdown > 0 ? 'var(--text-muted)' : undefined }}>
                    {otpCountdown > 0 ? `Resend in ${otpCountdown}s` : 'Resend Code'}
                  </button>
                  <button type="button" className="login-link-btn login-link-muted" onClick={() => go('login')}><MI name="arrow_back" size={14} /> Back to login</button>
                </div>
              </form>
            )}

            {/* ── REGISTER ── */}
            {mode === 'register' && (
              <form onSubmit={handleRegister} className="login-v2-form">
                <div className="login-field">
                  <label>Full Name</label>
                  <div className="login-input-wrapper">
                    <span className="login-input-icon"><MI name="person" /></span>
                    <input value={regName} onChange={e => setRegName(e.target.value)} placeholder="John Doe" required autoFocus />
                  </div>
                </div>
                <div className="login-field">
                  <label>Email Address</label>
                  <div className="login-input-wrapper">
                    <span className="login-input-icon"><MI name="mail" /></span>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required autoComplete="email" />
                  </div>
                </div>
                <div className="login-field">
                  <label>Password</label>
                  <div className="login-input-wrapper">
                    <span className="login-input-icon"><MI name="lock" /></span>
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Create a password" required autoComplete="new-password" />
                    <button type="button" className="login-password-toggle" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                      <MI name={showPassword ? 'visibility_off' : 'visibility'} />
                    </button>
                  </div>
                </div>
                <div className="login-field">
                  <label>Project Allotment</label>
                  <div className="login-input-wrapper">
                    <span className="login-input-icon"><MI name="folder" /></span>
                    <select value={regProjectId} onChange={e => setRegProjectId(e.target.value)} required>
                      <option value="">Select your project...</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.country ? ` — ${p.country}` : ''}</option>)}
                    </select>
                  </div>
                </div>
                <button type="submit" className="login-submit-btn" disabled={submitting || !regProjectId}>
                  {submitting ? <><span className="login-spinner" /> Creating...</> : <>Create Account <MI name="arrow_forward" size={16} /></>}
                </button>
              </form>
            )}

            {/* ── FORGOT ── */}
            {mode === 'forgot' && (
              <form onSubmit={handleForgot} className="login-v2-form">
                <div className="login-field">
                  <label>Email Address</label>
                  <div className="login-input-wrapper">
                    <span className="login-input-icon"><MI name="mail" /></span>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required autoFocus />
                  </div>
                </div>
                <button type="submit" className="login-submit-btn" disabled={submitting}>
                  {submitting ? <><span className="login-spinner" /> Sending...</> : <><MI name="send" size={16} /> Send Reset Link</>}
                </button>
                <div className="login-otp-actions">
                  <button type="button" className="login-link-btn login-link-muted" onClick={() => go('login')}><MI name="arrow_back" size={14} /> Back to login</button>
                </div>
              </form>
            )}

            <div className="login-register-link">
              {mode === 'register'
                ? <><span>Already have an account?</span><button type="button" className="login-link-btn" onClick={() => go('login')}>Sign in</button></>
                : <><span>Don&apos;t have an account?</span><button type="button" className="login-link-btn" onClick={() => go('register')}>Create one here</button></>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
