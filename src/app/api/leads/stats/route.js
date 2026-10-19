import { NextResponse } from 'next/server';
const { queryOne } = require('@/lib/db');
const { getUserFromRequest, isManager } = require('@/lib/auth');

// GET /api/leads/stats?project_id=&achieved=1
// The counters for the Lead Management page (working leads) or, with achieved=1, the Achieved Leads page.
// `achieved` (how many leads are on the Achieved page) is always included for the header button.
export async function GET(request) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const pid = searchParams.get('project_id');
  const pf = pid ? ' AND project_id = ' + parseInt(pid) : '';
  const scope = `deleted_at IS NULL AND achieved_at IS ${searchParams.get('achieved') === '1' ? 'NOT NULL' : 'NULL'}${pf}`;

  const total = await queryOne(`SELECT COUNT(*) as c FROM gtm_leads WHERE ${scope}`);
  const hot = await queryOne(`SELECT COUNT(*) as c FROM gtm_leads WHERE ${scope} AND priority = 'HOT'`);
  const high = await queryOne(`SELECT COUNT(*) as c FROM gtm_leads WHERE ${scope} AND priority = 'HIGH'`);
  const active = await queryOne(`SELECT COUNT(*) as c FROM gtm_leads WHERE ${scope} AND status NOT IN ('not_contacted','not_interested')`);
  const signed = await queryOne(`SELECT COUNT(*) as c FROM gtm_leads WHERE ${scope} AND status = 'contract_signed'`);
  const partner = await queryOne(`SELECT COUNT(*) as c FROM gtm_leads WHERE ${scope} AND priority = 'PARTNER'`);
  const achieved = await queryOne(`SELECT COUNT(*) as c FROM gtm_leads WHERE deleted_at IS NULL AND achieved_at IS NOT NULL${pf}`);

  return NextResponse.json({
    total: parseInt(total?.c||0), hot: parseInt(hot?.c||0), high: parseInt(high?.c||0),
    active: parseInt(active?.c||0), signed: parseInt(signed?.c||0), partner: parseInt(partner?.c||0),
    achieved: parseInt(achieved?.c||0),
  });
}
