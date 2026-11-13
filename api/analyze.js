// Vunja AI - seva ndogo. Ufunguo wa siri unakaa hapa tu (si kwenye ukurasa wa tovuti).
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Tumia POST tu.' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY haijawekwa kwenye Vercel.' });

  const { summary, sample, request, lang } = req.body || {};
  if (!sample) return res.status(400).json({ error: 'Hakuna data iliyotumwa.' });

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const language = lang === 'en' ? 'Kiingereza' : 'Kiswahili';

  const system =
    'Wewe ni Vunja AI, mchambuzi wa takwimu. Unapewa muhtasari wa hesabu na sampuli ya data. ' +
    'Andika ripoti kwa ' + language + ' yenye sehemu hizi: Muhtasari, Matokeo Muhimu (kwa namba), ' +
    'Mwenendo na Mifumo, Mambo ya Kushangaza au Makosa kwenye data, Mapendekezo. ' +
    'Tumia majedwali ya markdown pale yanapofaa. Usibuni namba ambazo hazipo kwenye data. ' +
    'Ikiwa data haitoshi kujibu jambo fulani, sema wazi.';

  const prompt =
    'MAOMBI YA MTUMIAJI: ' + (request || 'Chambua data hii na uniandikie ripoti kamili.') +
    '\n\nMUHTASARI WA HESABU (kutoka kwenye data yote):\n' + summary +
    '\n\nSAMPULI YA DATA (CSV):\n' + sample;

  try {
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        }),
      }
    );
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: (data.error && data.error.message) || 'Gemini imeshindwa.' });
    const text = (((data.candidates || [])[0] || {}).content || {}).parts;
    return res.status(200).json({ report: text ? text.map((p) => p.text).join('') : 'Hakuna jibu lililorudi.' });
  } catch (e) {
    return res.status(500).json({ error: 'Hitilafu ya seva: ' + e.message });
  }
};
