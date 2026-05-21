// Final pass: ensure each new DELF level has 300 words with ZERO overlap
// across all existing DELF wordlists AND all newly generated lists.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const existing = require('/tmp/delf-existing.json');

const norm = (w) => String(w).trim().toLowerCase();

const ALL_EXISTING = new Set([...existing.A1, ...existing.A2, ...existing.B1].map(norm));

const GUIDANCE = {
  A1: 'CEFR A1 niveau débutant — quotidien concret. Domaines à couvrir : actions de base supplémentaires, objets domestiques, météo, sentiments simples, vêtements, nourriture courante, adjectifs descriptifs basiques.',
  A2: 'CEFR A2 niveau élémentaire — situations sociales et expressions de temps. Domaines : connecteurs logiques intermédiaires, verbes pronominaux supplémentaires, opinions/préférences, vocabulaire scolaire/professionnel élémentaire, voyages détaillés.',
  B1: 'CEFR B1 niveau intermédiaire — argumenter et raconter. Domaines : verbes d\'argumentation/réflexion, adjectifs nuancés, connecteurs argumentatifs, vocabulaire administratif/santé/éducation, registre soutenu (presse).',
};

const SYS = 'Tu es lexicographe FLE. Produis exactement N nouveaux mots français du niveau CEFR demandé, JAMAIS présents dans la liste d\'exclusion. Forme canonique uniquement (verbe inf., nom singulier sans article, adjectif masc. sing.). Pas de proper nouns. Sortie JSON: {"words": [...]}.';

async function gen(level, excludeArr, n) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1', temperature: 0.6,
      messages: [
        { role: 'system', content: SYS },
        { role: 'user', content: `Niveau: ${level}\n${GUIDANCE[level]}\n\nEXCLUSION (${excludeArr.length} mots — ne JAMAIS réutiliser):\n${excludeArr.join(', ')}\n\nProduis ${n} nouveaux mots adaptés au niveau ${level}.` },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!resp.ok) throw new Error('OpenAI ' + resp.status + ': ' + await resp.text());
  const json = await resp.json();
  return JSON.parse(json.choices[0].message.content).words || [];
}

async function fillLevel(level, alreadyHave, priorNewSets) {
  // priorNewSets is array of Sets of normalized words from levels generated before this one
  let clean = [];
  const seen = new Set();
  // Filter alreadyHave: drop anything in ALL_EXISTING or any priorNew
  for (const w of alreadyHave) {
    const k = norm(w);
    if (seen.has(k)) continue;
    if (ALL_EXISTING.has(k)) continue;
    let inPrior = false;
    for (const s of priorNewSets) if (s.has(k)) { inPrior = true; break; }
    if (inPrior) continue;
    seen.add(k);
    clean.push(w);
  }
  console.log(`  ${level}: had ${alreadyHave.length}, clean after filter ${clean.length}`);

  for (let att = 1; att <= 8 && clean.length < 300; att++) {
    const need = 300 - clean.length;
    const reqN = Math.max(need * 3, 60);
    const exclude = [...ALL_EXISTING, ...clean.map(norm)];
    for (const s of priorNewSets) for (const w of s) exclude.push(w);
    console.log(`    att ${att}: need ${need}, requesting ${reqN}, excluding ${exclude.length}`);
    const batch = await gen(level, exclude, reqN);
    const exSet = new Set(exclude);
    let added = 0;
    for (const w of batch) {
      const k = norm(w);
      if (seen.has(k) || exSet.has(k)) continue;
      seen.add(k);
      clean.push(String(w).trim());
      added++;
      if (clean.length >= 300) break;
    }
    console.log(`    +${added} → ${clean.length}`);
    if (added === 0) break;
  }
  return clean.slice(0, 300);
}

(async () => {
  console.log('=== A1 ===');
  const a1Cur = require('/tmp/delf-new-a1.json').words;
  const a1 = await fillLevel('A1', a1Cur, []);
  fs.writeFileSync('/tmp/delf-new-a1.json', JSON.stringify({ level: 'A1', words: a1 }, null, 2));

  console.log('\n=== A2 ===');
  const a2Cur = require('/tmp/delf-new-a2.json').words;
  const a2 = await fillLevel('A2', a2Cur, [new Set(a1.map(norm))]);
  fs.writeFileSync('/tmp/delf-new-a2.json', JSON.stringify({ level: 'A2', words: a2 }, null, 2));

  console.log('\n=== B1 ===');
  const b1Cur = require('/tmp/delf-new-b1.json').words;
  const b1 = await fillLevel('B1', b1Cur, [new Set(a1.map(norm)), new Set(a2.map(norm))]);
  fs.writeFileSync('/tmp/delf-new-b1.json', JSON.stringify({ level: 'B1', words: b1 }, null, 2));

  console.log('\n=== Final counts ===');
  console.log(`A1=${a1.length} A2=${a2.length} B1=${b1.length}`);
})().catch(e => { console.error(e); process.exit(1); });
