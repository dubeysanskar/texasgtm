/**
 * Text translation for the daily work log — reuses the same OpenAI setup as auto-email's LLM
 * personalization (src/lib/auto-email.js). Requires OPENAI_API_KEY; without it every call throws a
 * clear "not configured" error the UI can show instead of a raw failure.
 */
const LANG_NAME = { en: 'English', ru: 'Russian' };

async function translateText(text, targetLang) {
  const clean = String(text || '').trim();
  if (!clean) return '';
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error('Translation is not configured on this server');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }
  const target = LANG_NAME[targetLang] || 'English';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `Translate the user's message into ${target}. Reply with ONLY the translation, no quotes, no commentary. Keep names, numbers and company names as-is. If the text is already in ${target}, reply with it unchanged.` },
        { role: 'user', content: clean.slice(0, 4000) },
      ],
      temperature: 0.2,
      max_tokens: 800,
    }),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.error('[translate] OpenAI API error:', errText);
    throw new Error('Translation failed');
  }
  const data = await response.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}

module.exports = { translateText };
