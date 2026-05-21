// Generate 300 new DELF words for each of A1, A2, B1 levels,
// avoiding overlap with existing curated words.
// Usage: node scripts/curation/_generate-delf-additions.js
// Outputs: /tmp/delf-new-{a1,a2,b1}.json

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY missing');

const existing = require('/tmp/delf-existing.json');

const LEVEL_GUIDANCE = {
  A1: {
    desc: 'CEFR A1 niveau débutant. Vocabulaire concret et le plus fréquent du quotidien : actions de base, objets familiers, expressions essentielles. Aucun terme abstrait, technique ou littéraire.',
    excludeRule: 'Ne pas inclure de mots déjà présents dans A1 existant.',
    domains: 'Familles de mots manquantes possibles : adjectifs descriptifs courants supplémentaires, verbes d\'action de base, formes de politesse étendues, objets domestiques courants, météo de base, sentiments simples, adverbes de fréquence/quantité de base.',
  },
  A2: {
    desc: 'CEFR A2 niveau élémentaire. Vocabulaire qui prolonge A1 : situations sociales, expressions de temps, opinions simples, modes de vie. Pas encore d\'abstrait avancé.',
    excludeRule: 'Ne pas inclure de mots déjà présents dans A1 OU A2 existants.',
    domains: 'Domaines à compléter : connecteurs logiques intermédiaires, expressions idiomatiques A2 fréquentes, verbes pronominaux supplémentaires, adjectifs d\'opinion simples, expressions de quantité/comparaison, vocabulaire scolaire/professionnel élémentaire, voyages/transports détaillés.',
  },
  B1: {
    desc: 'CEFR B1 niveau intermédiaire. Vocabulaire pour discuter, argumenter, raconter des expériences. Abstrait modéré, sujets de société, opinions nuancées, langue écrite courante.',
    excludeRule: 'Ne pas inclure de mots déjà présents dans A1, A2 OU B1 existants.',
    domains: 'Domaines à compléter : verbes d\'argumentation/réflexion, adjectifs nuancés (caractère, qualité, intensité), connecteurs argumentatifs avancés, lexique administratif/santé/éducation supplémentaire, expressions figurées courantes, vocabulaire associatif/citoyen, registre soutenu (presse).',
  },
};

async function callOpenAI(systemPrompt, userPrompt) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4.1',
      temperature: 0.3,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${txt}`);
  }
  const json = await resp.json();
  return json.choices[0].message.content;
}

const SYSTEM_PROMPT = `Tu es un expert en lexicographie française et en didactique du FLE (Français Langue Étrangère).

Tâche : produire exactement 300 nouveaux mots français adaptés au niveau CEFR indiqué, qui NE figurent PAS déjà dans la liste d'exclusion fournie.

Règles strictes :
1. Chaque entrée est UN SEUL mot français (forme canonique : verbe à l'infinitif, nom au singulier sans article, adjectif au masculin singulier).
2. Pas de phrases, pas de locutions de plus de 3 mots. Les locutions figées très courantes (ex : "tout de suite", "bien sûr") sont acceptées si fortement fréquentes et appropriées au niveau.
3. NE PAS répéter un mot déjà présent dans la liste d'exclusion ni un mot que tu as déjà produit dans cette réponse.
4. Niveau approprié : pas de mots trop avancés (au-dessus du niveau) ni trop basiques (en-dessous, sauf manques évidents).
5. Diversité des classes grammaticales : noms, verbes, adjectifs, adverbes, connecteurs proportionnellement à l'usage réel à ce niveau.
6. Pas de mots vulgaires, pas de proper nouns, pas de néologismes douteux.

Format de sortie JSON :
{
  "words": ["mot1", "mot2", ..., "mot300"]
}

Exactement 300 entrées. Pas de commentaire, pas de glose, pas d'index numérique.`;

function userPrompt(level, existingWords) {
  const g = LEVEL_GUIDANCE[level];
  return `Niveau : ${level}
Description : ${g.desc}
Domaines à compléter en priorité : ${g.domains}
Règle d'exclusion : ${g.excludeRule}

Liste d'exclusion (mots déjà présents, NE PAS RÉUTILISER) :
${existingWords.join(', ')}

Produis maintenant 300 nouveaux mots français adaptés au niveau ${level}, en respectant strictement les règles ci-dessus.`;
}

(async () => {
  const exclude = {
    A1: existing.A1,
    A2: [...existing.A1, ...existing.A2],
    B1: [...existing.A1, ...existing.A2, ...existing.B1],
  };

  for (const level of ['A1', 'A2', 'B1']) {
    console.log(`\n=== Generating ${level} (exclude ${exclude[level].length} words) ===`);
    const sys = SYSTEM_PROMPT;
    const usr = userPrompt(level, exclude[level]);
    const start = Date.now();
    const raw = await callOpenAI(sys, usr);
    const parsed = JSON.parse(raw);
    const words = parsed.words || [];
    console.log(`Got ${words.length} words in ${((Date.now()-start)/1000).toFixed(1)}s`);

    // Validate: no duplicates within batch, no overlap with exclude
    const seen = new Set();
    const excludeSet = new Set(exclude[level].map(w => w.toLowerCase()));
    const dedupe = [];
    const dupes = [];
    const overlaps = [];
    for (const w of words) {
      const key = String(w).trim().toLowerCase();
      if (seen.has(key)) { dupes.push(w); continue; }
      if (excludeSet.has(key)) { overlaps.push(w); continue; }
      seen.add(key);
      dedupe.push(String(w).trim());
    }
    console.log(`  ${dedupe.length} unique new (${dupes.length} internal dupes, ${overlaps.length} excluded overlaps)`);
    if (overlaps.length > 0 && overlaps.length <= 10) console.log('  overlaps:', overlaps.join(', '));

    fs.writeFileSync(`/tmp/delf-new-${level.toLowerCase()}.json`, JSON.stringify({ level, words: dedupe }, null, 2));
    console.log(`  saved /tmp/delf-new-${level.toLowerCase()}.json`);
  }
})().catch(err => { console.error(err); process.exit(1); });
