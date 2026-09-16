/**
 * Mailer with Multi-SMTP Rotation
 * Rotates between multiple SMTP accounts to improve deliverability
 * and reduce spam risk. Each account has its own daily sending limit.
 */
const nodemailer = require('nodemailer');

// ─── SMTP Account Pool ─────────────────────────────────────────────────────

// ─── Env-based accounts (fallback when no DB accounts configured) ──────────
function getEnvAccounts() {
  const accounts = [];

  // Primary account (from .env)
  if (process.env.SMTP_USER) {
    accounts.push({
      id: 'env-primary',
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      fromName: process.env.SMTP_FROM_NAME || 'GTM CRM',
      dailyLimit: parseInt(process.env.SMTP_DAILY_LIMIT || '30'),
    });
  }
  if (process.env.SMTP2_USER) {
    accounts.push({
      id: 'env-secondary',
      host: process.env.SMTP2_HOST || process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP2_PORT || process.env.SMTP_PORT || '465'),
      secure: (process.env.SMTP2_SECURE || process.env.SMTP_SECURE || 'true') === 'true',
      user: process.env.SMTP2_USER,
      pass: process.env.SMTP2_PASSWORD,
      from: process.env.SMTP2_FROM || process.env.SMTP2_USER,
      fromName: process.env.SMTP2_FROM_NAME || 'GTM CRM',
      dailyLimit: parseInt(process.env.SMTP2_DAILY_LIMIT || '30'),
    });
  }
  if (process.env.SMTP3_USER) {
    accounts.push({
      id: 'env-tertiary',
      host: process.env.SMTP3_HOST || process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP3_PORT || process.env.SMTP_PORT || '465'),
      secure: (process.env.SMTP3_SECURE || process.env.SMTP_SECURE || 'true') === 'true',
      user: process.env.SMTP3_USER,
      pass: process.env.SMTP3_PASSWORD,
      from: process.env.SMTP3_FROM || process.env.SMTP3_USER,
      fromName: process.env.SMTP3_FROM_NAME || 'GTM CRM',
      dailyLimit: parseInt(process.env.SMTP3_DAILY_LIMIT || '30'),
    });
  }

  return accounts;
}

/**
 * Load SMTP accounts for a given project from the database.
 * Priority: project-specific active accounts + global (project_id NULL) active accounts.
 * Falls back to env-configured accounts if the DB has none that apply.
 * @param {number|null} projectId
 * @returns {Promise<Array>}
 */
async function getSMTPAccounts(projectId = null) {
  try {
    const { queryAll } = require('@/lib/db');
    let rows;
    if (projectId) {
      rows = await queryAll(
        `SELECT * FROM gtm_smtp_accounts
         WHERE is_active = true AND (project_id = $1 OR project_id IS NULL)
         ORDER BY (project_id IS NULL) ASC, id ASC`,
        [projectId]
      );
    } else {
      rows = await queryAll(
        `SELECT * FROM gtm_smtp_accounts WHERE is_active = true ORDER BY id ASC`
      );
    }

    const dbAccounts = (rows || []).map(r => ({
      id: `db-${r.id}`,
      host: r.host,
      port: r.port,
      secure: r.secure,
      user: r.username,
      pass: r.password,
      from: r.from_email || r.username,
      fromName: r.from_name || 'GTM CRM',
      dailyLimit: r.daily_limit || 30,
    }));

    if (dbAccounts.length > 0) return dbAccounts;
  } catch (e) {
    console.error('[mailer] DB account load failed, using env fallback:', e.message);
  }

  return getEnvAccounts();
}

// ─── Transporter Pool ───────────────────────────────────────────────────────

const transporterPool = {};

// Key by credentials so an edited DB account (new password/host) rebuilds its transporter.
function transporterKey(account) {
  return `${account.host}:${account.port}:${account.secure}:${account.user}:${account.pass}`;
}

function getTransporter(account) {
  const key = transporterKey(account);
  if (!transporterPool[key]) {
    transporterPool[key] = nodemailer.createTransport({
      host: account.host,
      port: account.port,
      secure: account.secure,
      auth: {
        user: account.user,
        pass: account.pass,
      },
      pool: true,
      maxConnections: 3,
      maxMessages: 50,
      rateDelta: 5000,  // 5 seconds between messages
      rateLimit: 1,     // 1 message per rateDelta
    });
  }
  return transporterPool[key];
}

// ─── Daily Send Counter (in-memory, resets on restart) ──────────────────────

const dailySendCounts = {};
let lastResetDate = new Date().toDateString();

function getDailySendCount(accountId) {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    // Reset all counters at midnight
    Object.keys(dailySendCounts).forEach(k => delete dailySendCounts[k]);
    lastResetDate = today;
  }
  return dailySendCounts[accountId] || 0;
}

function incrementDailySendCount(accountId) {
  dailySendCounts[accountId] = (dailySendCounts[accountId] || 0) + 1;
}

// ─── SMTP Rotation Logic ────────────────────────────────────────────────────

/**
 * Select the best SMTP account to use for the next send.
 * Strategy: Round-robin with daily limit enforcement.
 * Picks the account with the lowest daily send count that hasn't hit its limit.
 */
let rotationIndex = 0;

function selectAccount(accounts) {
  if (!accounts || accounts.length === 0) {
    throw new Error('No SMTP accounts configured for this project. Add one in Admin → Email / SMTP.');
  }

  // Filter to accounts under their daily limit
  const available = accounts.filter(a => getDailySendCount(a.id) < a.dailyLimit);

  if (available.length === 0) {
    // All accounts exhausted — find the one with most room
    const sorted = [...accounts].sort((a, b) => getDailySendCount(a.id) - getDailySendCount(b.id));
    console.warn(`[mailer] All SMTP accounts at daily limit. Using least-used: ${sorted[0].id}`);
    return sorted[0];
  }

  // Round-robin among available accounts
  rotationIndex = (rotationIndex + 1) % available.length;
  return available[rotationIndex];
}

/**
 * Get rotation status for all SMTP accounts (optionally scoped to a project)
 */
async function getRotationStatus(projectId = null) {
  const accounts = await getSMTPAccounts(projectId);
  return accounts.map(a => ({
    id: a.id,
    from: a.from,
    sentToday: getDailySendCount(a.id),
    dailyLimit: a.dailyLimit,
    remaining: Math.max(0, a.dailyLimit - getDailySendCount(a.id)),
    exhausted: getDailySendCount(a.id) >= a.dailyLimit,
  }));
}

/**
 * Get total remaining sends across all accounts (optionally scoped to a project)
 */
async function getTotalRemainingToday(projectId = null) {
  const accounts = await getSMTPAccounts(projectId);
  return accounts.reduce((sum, a) => sum + Math.max(0, a.dailyLimit - getDailySendCount(a.id)), 0);
}

// ─── Core Send Functions ────────────────────────────────────────────────────

/**
 * Send an email using SMTP rotation.
 * Automatically selects the best SMTP account for the given project.
 * @param {object} opts
 * @param {number|null} [opts.projectId] scope sending to this project's SMTP accounts
 */
async function sendMail({ to, subject, html, replyTo, projectId = null }) {
  const accounts = await getSMTPAccounts(projectId);
  const account = selectAccount(accounts);
  const transporter = getTransporter(account);

  const mailOptions = {
    from: `"${account.fromName}" <${account.from}>`,
    to,
    subject,
    html,
  };

  if (replyTo) mailOptions.replyTo = replyTo;

  // Add custom headers for deliverability
  mailOptions.headers = {
    'X-Mailer': 'GTM CRM',
    'List-Unsubscribe': `<mailto:unsubscribe@${account.from.split('@')[1]}>`,
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    incrementDailySendCount(account.id);

    console.log(`[mailer] ✓ Sent via ${account.id} (${account.from}) | Today: ${getDailySendCount(account.id)}/${account.dailyLimit}`);

    return { ...result, smtpAccount: account.id, smtpFrom: account.from };
  } catch (err) {
    console.error(`[mailer] ✗ Failed via ${account.id} (${account.from}):`, err.message);
    throw err;
  }
}

/**
 * Send a one-off test email using an explicit account config (bypasses rotation/limits).
 * Used by the Admin "Test" button to verify SMTP credentials.
 */
async function sendTestMail(accountConfig, toEmail) {
  const account = {
    id: 'test',
    host: accountConfig.host,
    port: parseInt(accountConfig.port) || 465,
    secure: accountConfig.secure !== false && String(accountConfig.secure) !== 'false',
    user: accountConfig.username,
    pass: accountConfig.password,
    from: accountConfig.from_email || accountConfig.username,
    fromName: accountConfig.from_name || 'GTM CRM',
  };
  const transporter = getTransporter(account);
  const result = await transporter.sendMail({
    from: `"${account.fromName}" <${account.from}>`,
    to: toEmail,
    subject: 'GTM CRM — SMTP Test ✓',
    html: `<div style="font-family:Inter,sans-serif;padding:24px;">
      <h2 style="color:#6366f1;">SMTP test successful ✅</h2>
      <p>This confirms <strong>${account.from}</strong> (${account.host}:${account.port}) can send email from GTM CRM.</p>
    </div>`,
  });
  return { messageId: result.messageId, from: account.from };
}

// ─── Transactional email copy (EN / RU) ─────────────────────────────────────

const BRAND = 'GTM CRM';
const BRAND_LONG = 'Taha Airwaves · GTM CRM';

const COPY = {
  en: {
    otpSubject: `${BRAND} — Your Verification Code`,
    otpTitle: 'Verification Code',
    otpIntro: 'Use this code to complete your verification:',
    otpExpires: 'This code expires in 10 minutes.',
    ignore: "If you didn't request this, ignore this email.",
    resetSubject: `${BRAND} — Reset Your Password`,
    resetTitle: 'Password Reset',
    resetIntro: 'Click the button below to reset your password:',
    resetButton: 'Reset Password',
    resetExpires: 'This link expires in 1 hour.',
    inviteSubject: `${BRAND} — You have been invited`,
    welcomeSubject: `${BRAND} — Welcome aboard!`,
    inviteTitle: 'Team Invitation',
    welcomeTitle: 'Welcome',
    hi: (name) => `Hi <strong>${name}</strong>,`,
    welcomeBody: (role) => `Your <strong>${BRAND} CRM</strong> account has been created. Your role: <strong>${role}</strong>.`,
    inviteBody: (role) => `You've been invited to join <strong>${BRAND} CRM</strong> as <strong>${role}</strong>.`,
    projects: (n) => `Assigned project${n > 1 ? 's' : ''}:`,
    goButton: `Go to ${BRAND}`,
    welcomeHint: "Sign in with your email and password — you'll receive an OTP to verify each login.",
    inviteHint: 'Just enter your email on the login page — you\'ll receive an OTP to sign in. Use "Forgot password" to set your own password.',
  },
  ru: {
    otpSubject: `${BRAND} — Ваш код подтверждения`,
    otpTitle: 'Код подтверждения',
    otpIntro: 'Введите этот код, чтобы завершить проверку:',
    otpExpires: 'Код действителен 10 минут.',
    ignore: 'Если вы не запрашивали это письмо, просто проигнорируйте его.',
    resetSubject: `${BRAND} — Сброс пароля`,
    resetTitle: 'Сброс пароля',
    resetIntro: 'Нажмите кнопку ниже, чтобы задать новый пароль:',
    resetButton: 'Сбросить пароль',
    resetExpires: 'Ссылка действительна 1 час.',
    inviteSubject: `${BRAND} — Вас пригласили в систему`,
    welcomeSubject: `${BRAND} — Добро пожаловать!`,
    inviteTitle: 'Приглашение в команду',
    welcomeTitle: 'Добро пожаловать',
    hi: (name) => `Здравствуйте, <strong>${name}</strong>!`,
    welcomeBody: (role) => `Ваш аккаунт в <strong>${BRAND} CRM</strong> создан. Ваша роль: <strong>${role}</strong>.`,
    inviteBody: (role) => `Вас пригласили в <strong>${BRAND} CRM</strong> с ролью <strong>${role}</strong>.`,
    projects: (n) => (n > 1 ? 'Назначенные проекты:' : 'Назначенный проект:'),
    goButton: `Перейти в ${BRAND}`,
    welcomeHint: 'Входите по email и паролю — при каждом входе на почту придёт одноразовый код (OTP).',
    inviteHint: 'Просто введите свой email на странице входа — на почту придёт одноразовый код (OTP). Чтобы задать собственный пароль, используйте «Забыли пароль».',
  },
};

const ROLE_RU = {
  super_admin: 'Супер-администратор', 'super admin': 'Супер-администратор',
  manager: 'Менеджер', staff: 'Сотрудник', marketing: 'Маркетинг', viewer: 'Наблюдатель',
};

function pickCopy(lang) { return COPY[lang === 'ru' ? 'ru' : 'en']; }

function shell(lang, title, inner) {
  return `
      <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;background:#f5f0f2;border-radius:16px;" lang="${lang === 'ru' ? 'ru' : 'en'}">
        <div style="text-align:center;margin-bottom:24px;">
          <h1 style="font-size:1.5rem;color:#8A0029;margin:0;">${BRAND}</h1>
          <p style="color:#94a3b8;font-size:0.85rem;margin:4px 0 0;">${title}</p>
        </div>
        <div style="background:#fff;border-radius:12px;padding:24px;text-align:center;border:1px solid #e2e8f0;">
          ${inner}
        </div>
        <p style="text-align:center;margin-top:16px;font-size:0.72rem;color:#94a3b8;">${BRAND_LONG}</p>
      </div>`;
}

/**
 * Send OTP verification email (always uses primary account)
 * @param {string} email
 * @param {string} otp
 * @param {string} [lang] 'en' | 'ru'
 */
async function sendOTP(email, otp, lang = 'en') {
  const c = pickCopy(lang);
  return sendMail({
    to: email,
    subject: c.otpSubject,
    html: shell(lang, c.otpTitle, `
          <p style="margin:0 0 16px;color:#475569;font-size:0.92rem;">${c.otpIntro}</p>
          <div style="font-size:2rem;font-weight:800;letter-spacing:8px;color:#8A0029;padding:16px;background:rgba(138,0,41,0.05);border-radius:10px;">${otp}</div>
          <p style="margin:16px 0 0;font-size:0.78rem;color:#94a3b8;">${c.otpExpires}</p>
          <p style="margin:12px 0 0;font-size:0.72rem;color:#94a3b8;">${c.ignore}</p>`),
  });
}

/**
 * Send password reset email
 */
async function sendPasswordReset(email, resetUrl, lang = 'en') {
  const c = pickCopy(lang);
  return sendMail({
    to: email,
    subject: c.resetSubject,
    html: shell(lang, c.resetTitle, `
          <p style="margin:0 0 20px;color:#475569;font-size:0.92rem;">${c.resetIntro}</p>
          <a href="${resetUrl}" style="display:inline-block;padding:12px 32px;background:#8A0029;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:0.92rem;">${c.resetButton}</a>
          <p style="margin:20px 0 0;font-size:0.78rem;color:#94a3b8;">${c.resetExpires}</p>
          <p style="margin:12px 0 0;font-size:0.72rem;color:#94a3b8;">${c.ignore}</p>`),
  });
}

/**
 * Send invite / welcome email for a new account.
 * Used by all three user-creation paths: Team invite, Admin add-user, self signup.
 * @param {object} opts
 * @param {string} opts.email    recipient
 * @param {string} opts.name     user's display name
 * @param {string} opts.roleName human-readable role (e.g. "Staff" or "super admin")
 * @param {string[]} [opts.projectNames] projects the user was assigned to
 * @param {boolean} [opts.isWelcome]     true = self-signup welcome, false = invitation
 * @param {string}  [opts.lang]          'en' | 'ru' — language of the email
 */
async function sendInvite({ email, name, roleName, projectNames = [], isWelcome = false, lang = 'en' }) {
  const c = pickCopy(lang);
  const baseUrl = process.env.NEXT_PUBLIC_URL || process.env.APP_URL || 'https://gtm.tahaairwavescrm.cloud';
  const role = lang === 'ru' ? (ROLE_RU[String(roleName || '').toLowerCase()] || roleName) : roleName;
  const projectLine = projectNames.length
    ? `<p style="margin:0 0 20px;color:#475569;font-size:0.88rem;">${c.projects(projectNames.length)} <strong>${projectNames.join(', ')}</strong></p>`
    : '';
  return sendMail({
    to: email,
    subject: isWelcome ? c.welcomeSubject : c.inviteSubject,
    html: shell(lang, isWelcome ? c.welcomeTitle : c.inviteTitle, `
          <p style="margin:0 0 8px;color:#475569;font-size:0.92rem;">${c.hi(name)}</p>
          <p style="margin:0 0 12px;color:#475569;font-size:0.88rem;">${isWelcome ? c.welcomeBody(role) : c.inviteBody(role)}</p>
          ${projectLine}
          <a href="${baseUrl}" style="display:inline-block;padding:12px 32px;background:#8A0029;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:0.92rem;">${c.goButton}</a>
          <p style="margin:20px 0 0;font-size:0.78rem;color:#94a3b8;">${isWelcome ? c.welcomeHint : c.inviteHint}</p>`),
  });
}

module.exports = { sendMail, sendTestMail, sendOTP, sendPasswordReset, sendInvite, getSMTPAccounts, getRotationStatus, getTotalRemainingToday };
