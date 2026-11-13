// Vunja AI - seva ndogo. Ufunguo wa siri unakaa hapa tu (si kwenye ukurasa wa tovuti).
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Tumia POST tu.' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY haijawekwa kwenye Vercel.' });

  const { summary, sample, request, lang, history, question, columns } = req.body || {};
  if (!sample) return res.status(400).json({ error: 'Hakuna data iliyotumwa.' });

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const language = lang === 'en' ? 'Kiingereza' : 'Kiswahili';

  const chatSystem =
    'Wewe ni Vunja AI, mchambuzi wa takwimu. Mtumiaji anakuuliza maswali kuhusu data yake na ripoti uliyoandika. ' +
    'Jibu kwa ' + language + ', kwa ufupi na kwa uwazi, ukitumia namba kutoka kwenye data. ' +
    'Usibuni namba. Ikiwa data haina jibu, sema wazi.';

  const reportSystem =
    'Wewe ni Vunja AI, mchambuzi wa takwimu. Unapewa muhtasari wa hesabu na sampuli ya data. ' +
    'Andika ripoti kwa ' + language + ' yenye sehemu hizi: Muhtasari, Matokeo Muhimu (kwa namba), ' +
    'Mwenendo na Mifumo, Mambo ya Kushangaza au Makosa kwenye data, Mapendekezo. ' +
    'Tumia majedwali ya markdown pale yanapofaa. Usibuni namba ambazo hazipo kwenye data. ' +
    'Ikiwa data haitoshi kujibu jambo fulani, sema wazi.';

  const prompt =
    'MAOMBI YA MTUMIAJI: ' + (request || 'Chambua data hii na uniandikie ripoti kamili.') +
    '\n\nMUHTASARI WA HESABU (kutoka kwenye data yote):\n' + summary +
    '\n\nNGUZO ZILIZOPO: ' + (columns || []).join(' | ') +
    '\n\nSAMPULI YA DATA (CSV):\n' + sample;

  const contents = [{ role: 'user', parts: [{ text: prompt }] }];
  (history || []).forEach((h) => contents.push({ role: h.role, parts: [{ text: h.text }] }));
  if (question) contents.push({ role: 'user', parts: [{ text: question }] });

  const chartRule =
    ' Mwishoni kabisa mwa jibu, ikiwa grafu zingesaidia (hasa kama mtumiaji ameomba grafu), ongeza kizuizi hiki: ' +
    '```charts\n[{"title":"Kichwa","type":"bar","x":"JINA LA NGUZO","y":"JINA LA NGUZO YA NAMBA","agg":"sum","top":5,"lastDays":10}]\n```. ' +
    'type ni bar au line. agg ni sum, avg au count. "top" (hiari) ni idadi ya vipengele vya juu. ' +
    '"lastDays" (hiari) ni siku za mwisho, tumia tu kama x ni nguzo ya tarehe. ' +
    'Tumia majina ya nguzo kama yalivyo hasa kwenye NGUZO ZILIZOPO. Usiandike namba za grafu mwenyewe; programu itazihesabu. Ongeza grafu 1 hadi 3.';

  const models = [model, 'gemini-flash-lite-latest'];
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: (question ? chatSystem : reportSystem) + chartRule }] },
    contents: contents,
  });
  let lastError = 'Gemini imeshindwa.';
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const m = models[attempt < 2 ? 0 : 1];
      const r = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent',
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body }
      );
      const data = await r.json();
      if (r.ok) {
        const parts = (((data.candidates || [])[0] || {}).content || {}).parts;
        return res.status(200).json({ report: parts ? parts.map((p) => p.text).join('') : 'Hakuna jibu lililorudi.' });
      }
      lastError = (data.error && data.error.message) || lastError;
      if (r.status !== 429 && r.status !== 503) break;
      await new Promise((ok) => setTimeout(ok, 2000));
    }
    return res.status(502).json({ error: lastError });
  } catch (e) {
    return res.status(500).json({ error: 'Hitilafu ya seva: ' + e.message });
  }
};
