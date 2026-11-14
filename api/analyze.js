// Vunja AI - small server. The secret key lives here only (never on the web page).
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST only.' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY is not set in Vercel.' });

  const { summary, sample, request, history, question, columns } = req.body || {};
  if (!sample) return res.status(400).json({ error: 'No data was sent.' });

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

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

  const prompt =
    'USER REQUEST: ' + (request || 'Analyze this data and write a full report.') +
    '\n\nSUMMARY STATISTICS (computed from all the data):\n' + summary +
    '\n\nCOLUMNS: ' + (columns || []).join(' | ') +
    '\n\nDATA SAMPLE (CSV):\n' + sample;

  const contents = [{ role: 'user', parts: [{ text: prompt }] }];
  (history || []).forEach((h) => contents.push({ role: h.role, parts: [{ text: h.text }] }));
  if (question) contents.push({ role: 'user', parts: [{ text: question }] });

  const models = [model, 'gemini-flash-lite-latest'];
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: (question ? chatSystem : reportSystem) + chartRule }] },
    contents: contents,
  });
  let lastError = 'Gemini failed.';
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
        return res.status(200).json({ report: parts ? parts.map((p) => p.text).join('') : 'No answer was returned.' });
      }
      lastError = (data.error && data.error.message) || lastError;
      if (r.status !== 429 && r.status !== 503) break;
      await new Promise((ok) => setTimeout(ok, 2000));
    }
    return res.status(502).json({ error: lastError });
  } catch (e) {
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
};
