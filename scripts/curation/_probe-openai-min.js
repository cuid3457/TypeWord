const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });
(async () => {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      messages: [{ role: 'system', content: 'List synonyms and antonyms in JSON.' }, { role: 'user', content: 'happy' }],
      response_format: { type: 'json_object' },
    }),
  });
  console.log('status:', r.status);
  console.log((await r.text()).slice(0, 800));
})();
