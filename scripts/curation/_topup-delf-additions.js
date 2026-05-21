// Top up DELF new-word lists to exactly 300 each, iterating.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const existing = require('/tmp/delf-existing.json');

const LEVEL_GUIDANCE = {
  A1: { desc: 'CEFR A1 — vocabulaire concret le plus fréquent du quotidien', domains: 'adjectifs descriptifs courants, verbes d\'action de base, objets domestiques, météo, sentiments simples' },
  A2: { desc: 'CEFR A2 — situations sociales, expressions de temps, opinions simples', domains: 'connecteurs logiques intermédiaires, verbes pronominaux, adjectifs d\'opinion, vocabulaire scolaire/professionnel élémentaire, voyages détaillés' },
  B1: { desc: 'CEFR B1 — argumenter, raconter, abstrait modéré', domains: 'verbes d\'argumentation, adjectifs nuancés, connecteurs argumentatifs, lexique administratif/santé/éducation, registre soutenu (presse)' },
};

const SYS = `Tu es lexicographe FLE. Produis exactement N nouveaux mots français du niveau CEFR indiqué, EXCLUS de la liste fournie. Forme canonique uniquement (verbe inf., nom singulier sans article, adjectif masc. sing.). Pas de proper nouns, pas de vulgarités. Sortie JSON: {"words": [...]}.`;

async function genBatch(level, exclude, n) {
  const g = LEVEL_GUIDANCE[level];
  const usr = `Niveau: ${level}
${g.desc}
Domaines: ${g.domains}

Liste d'EXCLUSION (${exclude.length} mots — ne JAMAIS réutiliser):
${exclude.join(', ')}

Produis exactement ${n} nouveaux mots français de niveau ${level}, jamais présents dans la liste d'exclusion.`;
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1',
      temperature: 0.5,
      messages: [{ role: 'system', content: SYS }, { role: 'user', content: usr }],
      response_format: { type: 'json_object' },
    }),
  });
  if (!resp.ok) throw new Error(`OpenAI ${resp.status}: ${await resp.text()}`);
  const json = await resp.json();
  const parsed = JSON.parse(json.choices[0].message.content);
  return parsed.words || [];
}

async function topUp(level, target = 300) {
  const file = `/tmp/delf-new-${level.toLowerCase()}.json`;
  const cur = JSON.parse(fs.readFileSync(file, 'utf-8'));
  let words = [...cur.words];
  const baseExclude = level === 'A1' ? existing.A1
    : level === 'A2' ? [...existing.A1, ...existing.A2]
    : [...existing.A1, ...existing.A2, ...existing.B1];

  let attempts = 0;
  while (words.length < target && attempts < 6) {
    attempts++;
    const need = target - words.length;
    const reqN = Math.max(need * 2, 50);
    const exclude = [...baseExclude, ...words];
    console.log(`  ${level} attempt ${attempts}: have ${words.length}/${target}, requesting ${reqN}, excluding ${exclude.length}`);
    const batch = await genBatch(level, exclude, reqN);
    const seen = new Set(words.map(w => w.toLowerCase()));
    const excludeSet = new Set(exclude.map(w => w.toLowerCase()));
    let added = 0;
    for (const w of batch) {
      const k = String(w).trim().toLowerCase();
      if (seen.has(k) || excludeSet.has(k)) continue;
      seen.add(k);
      words.push(String(w).trim());
      added++;
      if (words.length >= target) break;
    }
    console.log(`    +${added} new (total ${words.length})`);
    if (added === 0) break;
  }
  words = words.slice(0, target);
  fs.writeFileSync(file, JSON.stringify({ level, words }, null, 2));
  console.log(`  ${level} final: ${words.length} words → ${file}`);
}

(async () => {
  for (const level of ['A1', 'A2', 'B1']) {
    console.log(`\n=== Top-up ${level} ===`);
    await topUp(level, 300);
  }
})().catch(err => { console.error(err); process.exit(1); });
