import { NextResponse } from 'next/server';
const { queryOne, query } = require('@/lib/db');
const { getUserFromRequest, isStaff } = require('@/lib/auth');
const { translateText } = require('@/lib/translate');

// POST /api/daily-updates/[id]/translate { lang: 'en'|'ru' } — translate this entry's text into `lang`
// and cache it (re-translates only if a different language is requested next time).
export async function POST(request, { params }) {
  const user = getUserFromRequest(request);
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { lang } = await request.json();
  const targetLang = lang === 'ru' ? 'ru' : 'en';
  const row = await queryOne('SELECT id, text, translated_text, translated_lang FROM gtm_daily_updates WHERE id = $1', [id]);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (row.translated_lang === targetLang && row.translated_text) {
    return NextResponse.json({ translated_text: row.translated_text, lang: targetLang, cached: true });
  }
  try {
    const translated = await translateText(row.text, targetLang);
    await query('UPDATE gtm_daily_updates SET translated_text = $1, translated_lang = $2 WHERE id = $3', [translated, targetLang, id]);
    return NextResponse.json({ translated_text: translated, lang: targetLang, cached: false });
  } catch (e) {
    return NextResponse.json({ error: e.code === 'NOT_CONFIGURED' ? e.message : 'Translation failed' }, { status: e.code === 'NOT_CONFIGURED' ? 503 : 500 });
  }
}
