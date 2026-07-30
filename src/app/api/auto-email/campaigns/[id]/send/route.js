import { NextResponse } from 'next/server';
const { queryOne, query } = require('@/lib/db');
const { getUserFromRequest, isAdmin } = require('@/lib/auth');
const { processCampaign } = require('@/lib/auto-email-worker');

export async function POST(request, { params }) {
  const user = getUserFromRequest(request);
  if (!user || (!isAdmin(user.role) && user.role !== 'marketing'))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const campaignId = parseInt(id);

  const campaign = await queryOne('SELECT id, template_id, status FROM gtm_email_campaigns WHERE id = $1', [campaignId]);
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  if (!campaign.template_id) return NextResponse.json({ error: 'Assign a template to this campaign first' }, { status: 400 });
  if (campaign.status === 'active') return NextResponse.json({ error: 'Campaign is already sending' }, { status: 409 });

  // Mark active immediately so the UI reflects it, then process in the background.
  // Sending is long-running (rate-limited delays per email) and would otherwise
  // exceed the proxy's request timeout. The Node server (pm2) keeps the promise alive.
  await query("UPDATE gtm_email_campaigns SET status = 'active', updated_at = NOW() WHERE id = $1", [campaignId]);

  processCampaign(campaignId)
    .then(r => console.log(`[auto-email] campaign ${campaignId} done:`, JSON.stringify(r)))
    .catch(async (err) => {
      console.error(`[auto-email] campaign ${campaignId} failed:`, err.message);
      try { await query("UPDATE gtm_email_campaigns SET status = 'paused', updated_at = NOW() WHERE id = $1", [campaignId]); } catch {}
    });

  return NextResponse.json({ started: true, message: 'Campaign started — emails are sending in the background. Progress updates automatically.' });
}
