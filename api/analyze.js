// Vunja AI - small server. Secret keys live here only (never on the web page).
// If ANTHROPIC_API_KEY is set in Vercel, Claude is used. Otherwise Gemini (GEMINI_API_KEY) is used.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST only.' });

  const claudeKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!claudeKey && !geminiKey) return res.status(500).json({ error: 'No API key is set in Vercel (ANTHROPIC_API_KEY or GEMINI_API_KEY).' });

  const { summary, sample, request, history, question, columns } = req.body || {};
  if (!sample) return res.status(400).json({ error: 'No data was sent.' });

  const reportSystem =
    'You are Vunja AI, a statistics analyst. You receive computed summary statistics and a sample of the data. ' +
    'Write the whole report in English only (never mix in other languages). Use these sections: Summary, Key Findings (with numbers), ' +
    'Trends and Patterns, Anomalies or Data Issues, Recommendations. ' +
    'Use markdown tables where they help. Do not invent numbers that are not in the data. ' +
    'If the data is not enough to answer something, say so clearly.';

  const chatSystem =
    'You are Vunja AI, a statistics analyst. The user asks questions about their data and the report you wrote. ' +
    'Always answer in English only, briefly and clearly, using numbers from the data. ' +
    'Do not invent numbers. If the data cannot answer, say so.';

  const chartRule =
    ' At the very end of your answer, if charts would help (especially if the user asked for charts), add this block: ' +
    '```charts\n[{"title":"Title","type":"bar","x":"COLUMN NAME","y":"NUMERIC COLUMN NAME","agg":"sum","top":5,"lastDays":10,"exclude":["TOTAL"]}]\n```. ' +
    '"type" is bar or line. "agg" is sum, avg or count. "top" (optional) is how many top items to show. ' +
    '"lastDays" (optional) is the number of most recent days; use it only when x is a date column. ' +
    '"exclude" (optional) is a list of x values to leave out of the chart. ' +
    'Use column names exactly as listed under COLUMNS. Do not write chart numbers yourself; the app computes them. Add 1 to 3 charts. Chart titles must be in English.';

  const systemText = (question ? chatSystem : reportSystem) + chartRule;

  const prompt =
    'USER REQUEST: ' + (request || 'Analyze this data and write a full report.') +
    '\n\nSUMMARY STATISTICS (computed from all the data):\n' + summary +
    '\n\nCOLUMNS: ' + (columns || []).join(' | ') +
    '\n\nDATA SAMPLE (CSV):\n' + sample;

  const turns = [{ role: 'user', text: prompt }]
    .concat((history || []).map((h) => ({ role: h.role === 'model' ? 'assistant' : 'user', text: h.text })));
  if (question) turns.push({ role: 'user', text: question });

  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

  async function viaClaude() {
    const models = [process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', 'claude-haiku-5-5'];
    let lastError = 'Claude failed.';
    for (let attempt = 0; attempt < 4; attempt++) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: models[attempt < 2 ? 0 : 1],
          max_tokens: 4096,
          system: systemText,
          messages: turns.map((t) => ({ role: t.role, content: t.text })),
        }),
      });
      const data = await r.json();
      if (r.ok) return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('') || 'No answer was returned.';
      lastError = (data.error && data.error.message) || lastError;
      if (![429, 500, 503, 529].includes(r.status)) break;
      await wait(2000);
    }
    throw new Error(lastError);
  }

  async function viaGemini() {
    const models = [process.env.GEMINI_MODEL || 'gemini-2.0-flash', 'gemini-flash-lite-latest'];
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: systemText }] },
      contents: turns.map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.text }] })),
    });
    let lastError = 'Gemini failed.';
    for (let attempt = 0; attempt < 4; attempt++) {
      const r = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + models[attempt < 2 ? 0 : 1] + ':generateContent',
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey }, body }
      );
      const data = await r.json();
      if (r.ok) {
        const parts = (((data.candidates || [])[0] || {}).content || {}).parts;
        return parts ? parts.map((p) => p.text).join('') : 'No answer was returned.';
      }
      lastError = (data.error && data.error.message) || lastError;
      if (r.status !== 429 && r.status !== 503) break;
      await wait(2000);
    }
    throw new Error(lastError);
  }

  try {
    const report = claudeKey ? await viaClaude() : await viaGemini();
    return res.status(200).json({ report });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
