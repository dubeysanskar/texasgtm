// Runs once when the Next.js server starts: start the follow-up email reminder loop (Node runtime only).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.FOLLOWUP_REMINDERS === 'off') return;
  const { startReminderLoop } = await import('./lib/followups');
  startReminderLoop();
}
