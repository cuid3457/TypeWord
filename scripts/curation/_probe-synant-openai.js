const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const SYS = `<role>List synonyms and antonyms for a vocabulary headword. English only.</role>

<schema>{ "synonyms": string[], "antonyms": string[] }</schema>

<rules>
- Each entry: ONE bare word or fixed compound. NO parentheticals, NO glosses, NO disclaimers. Parenthetical content = fabrication signal → reject.
- Each entry: real attested English word, genuinely interchangeable with headword in at least one common sense.
- NEVER the headword itself. NEVER inflected/declined headword forms ("lecture orale" ≠ synonym of "lecture").
- NEVER register variants (ko/ja honorific/humble = same lexeme).
- NEVER cross arrays.
- Synonyms ≤5, antonyms ≤3. Empty array ALWAYS better than fabrication.
</rules>

<peer_group_antonym>
Members of finite semantic groups (seasons, cardinal directions, weekdays, months, suits, primary colors, numerals): peers are PEERS, NOT antonyms.
- Seasons: ONE paired opposite each (spring↔autumn, summer↔winter).
- Cardinal directions: ONE opposite each (north↔south, east↔west).
- Weekdays / months / suits / primary colors / numerals: typically NO antonym → [].
- When unsure: [].
</peer_group_antonym>`;

const USER = `Headword (English): "happy"

Canonical meanings (context for which senses' syn/ant to draw from):
[0] (adjective) feeling or showing pleasure or contentment

Output synonyms and antonyms. English only. Prefer [] over fabrication.`;

(async () => {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      messages: [{ role: 'system', content: SYS }, { role: 'user', content: USER }],
      response_format: { type: 'json_object' },
    }),
  });
  console.log('status:', r.status);
  const txt = await r.text();
  console.log(txt.slice(0, 1500));
})();
