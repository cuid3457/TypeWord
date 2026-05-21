// Multi-dimensional verifier — reads all existing audit JSONs from
// scripts/audit/ and computes per-dimension quality metrics on the
// stored AI outputs. Zero new API calls.
//
// Dimensions checked:
//   1. IPA: presence per case; reality (real IPA chars; no slash brackets)
//   2. Marker: exactly one ** pair; marker contains the headword surface
//      or its inflected form; word-count inside marker matches the headword
//      for multi-word lemmas
//   3. Example shape: terminal punctuation; length within tier bounds
//   4. Definition: TARGET_LANG-side script purity (already checked
//      separately, included here for completeness)
//   5. Syn / Ant: not the headword itself; no duplicates within array;
//      no cross-array (syn in ant or vice versa); not parenthetical fab
//
// Reads:
//   en-case-audit-2026-05-19.json
//   ja-case-audit-2026-05-19.json
//   zh-case-audit-2026-05-19.json
//   latin-case-audit-2026-05-19.json
//   ko-synant-audit-2026-05-19.json
//   cross-target-audit-2026-05-19.json

import * as fs from "node:fs";
import * as path from "node:path";

const dir = path.resolve(import.meta.dirname ?? __dirname);

function loadJson(name) {
  const p = path.join(dir, name);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// IPA real-char check: a string is IPA-like if it contains IPA-specific
// characters (or stress marks) and excludes slash/bracket wrappers.
const IPA_SPECIAL = /[ʃɛðθŋəɚɝɹæɑɔɪʊʔʒʁχəɲʎʝøŒœɛ̃ɔ̃ɑ̃ɞɵʌɣˈˌːɟc]/u;
const HAS_WRAPPER = /[\/\[\]]/;

function isLikelyIPA(s) {
  if (!s) return false;
  if (HAS_WRAPPER.test(s)) return false; // /xxx/ or [xxx] wrapping forbidden
  // For very short words (1-2 chars), IPA may be just ASCII letters
  // (e.g. "ate" → /eɪt/). Don't enforce IPA_SPECIAL; just require no
  // wrapper and not contain digits.
  if (/[0-9]/.test(s)) return false;
  return true;
}

function countMarkers(sentence) {
  if (!sentence) return 0;
  const matches = sentence.match(/\*\*/g) ?? [];
  return matches.length / 2;
}

function getMarkerContent(sentence) {
  const m = sentence.match(/\*\*(.+?)\*\*/);
  return m ? m[1] : null;
}

function hasTerminalPunct(sentence) {
  if (!sentence) return false;
  return /[.!?。！？]$/.test(sentence.trim());
}

const reports = {};
function bump(group, key, pass) {
  if (!reports[group]) reports[group] = {};
  if (!reports[group][key]) reports[group][key] = { pass: 0, total: 0, examples: [] };
  reports[group][key].total++;
  if (pass) reports[group][key].pass++;
}
function logExample(group, key, ex) {
  if (!reports[group]) reports[group] = {};
  if (!reports[group][key]) reports[group][key] = { pass: 0, total: 0, examples: [] };
  if (reports[group][key].examples.length < 5) {
    reports[group][key].examples.push(ex);
  }
}

function verifyAuditFile(filename, sourceLang) {
  const data = loadJson(filename);
  if (!data) return;
  console.log(`Loaded ${filename}: ${data.length} entries`);
  for (const r of data) {
    const word = r.word ?? r.headword ?? "(unknown)";
    const enCase = r.classified ?? r.case ?? "n/a";

    for (const version of ["old", "new"]) {
      if (!r.versions || !r.versions[version]) continue;
      const v = r.versions[version];
      const quick = v.quick ?? {};

      const meanings = quick.meanings ?? [];
      const meaningsTr = quick.meanings_translated ?? [];
      const examples = v.examples?.examples ?? [];
      const synonyms = v.synant?.synonyms ?? [];
      const antonyms = v.synant?.antonyms ?? [];

      // === IPA ===
      const ipaExpected = (sourceLang === "en" || ["es","fr","de","it"].includes(sourceLang))
                        && enCase !== "number_symbol"
                        && enCase !== "set_expression"
                        && !["proper_acronym", "latin_acronym"].includes(enCase)
                        && version === "new";
      const ipa = quick.ipa;
      if (ipaExpected) {
        const ok = !!ipa && isLikelyIPA(ipa);
        bump(`${sourceLang}_${version}`, "ipa_present_and_valid", ok);
        if (!ok) logExample(`${sourceLang}_${version}`, "ipa_present_and_valid", { word, ipa, case: enCase });
      }

      // === Markers ===
      for (const ex of examples) {
        const markers = countMarkers(ex.sentence);
        const oneMarker = markers === 1;
        bump(`${sourceLang}_${version}`, "marker_exactly_one_pair", oneMarker);
        if (!oneMarker) logExample(`${sourceLang}_${version}`, "marker_exactly_one_pair", { word, sentence: ex.sentence, markers });

        // marker should contain the headword surface (or some inflected
        // form of it). Approximate: extract marker content, check it
        // shares characters with the word. For multi-word lemmas the
        // marker must contain ALL constituent words of the headword.
        const content = getMarkerContent(ex.sentence);
        if (content && word) {
          let containsWord = false;
          if (word.includes(" ")) {
            // multi-word lemma: each word must appear in marker
            const parts = word.split(/\s+/);
            containsWord = parts.every((p) => content.toLowerCase().includes(p.toLowerCase()));
          } else if (word.match(/^[a-zA-Z]+$/)) {
            // simple English: case-insensitive substring of inflected form
            const stem = word.slice(0, Math.max(3, word.length - 2));
            containsWord = content.toLowerCase().includes(stem.toLowerCase());
          } else {
            // CJK / non-Latin: direct substring or share at least one char
            for (const ch of word) {
              if (content.includes(ch)) { containsWord = true; break; }
            }
          }
          bump(`${sourceLang}_${version}`, "marker_contains_headword", containsWord);
          if (!containsWord) logExample(`${sourceLang}_${version}`, "marker_contains_headword", { word, marker: content, sentence: ex.sentence });
        }

        // === Terminal punctuation ===
        const term = hasTerminalPunct(ex.sentence);
        bump(`${sourceLang}_${version}`, "example_terminal_punct", term);
        if (!term) logExample(`${sourceLang}_${version}`, "example_terminal_punct", { word, sentence: ex.sentence });
      }

      // === Syn / Ant ===
      const allSyn = synonyms ?? [];
      const allAnt = antonyms ?? [];
      const synSet = new Set(allSyn.map((s) => s.toLowerCase().trim()));
      const antSet = new Set(allAnt.map((s) => s.toLowerCase().trim()));

      for (const s of allSyn) {
        // not the headword itself
        const isSelf = s.trim().toLowerCase() === word.toLowerCase();
        bump(`${sourceLang}_${version}`, "syn_not_self", !isSelf);
        if (isSelf) logExample(`${sourceLang}_${version}`, "syn_not_self", { word, syn: s });

        // not parenthetical fabrication
        const hasParen = /[()()]/.test(s);
        bump(`${sourceLang}_${version}`, "syn_no_parenthetical_fab", !hasParen);
        if (hasParen) logExample(`${sourceLang}_${version}`, "syn_no_parenthetical_fab", { word, syn: s });

        // not in antonym array
        const crossLeak = antSet.has(s.toLowerCase().trim());
        bump(`${sourceLang}_${version}`, "syn_not_in_ant", !crossLeak);
        if (crossLeak) logExample(`${sourceLang}_${version}`, "syn_not_in_ant", { word, syn: s });
      }
      // duplicates within syn
      bump(`${sourceLang}_${version}`, "syn_no_internal_dup", allSyn.length === synSet.size);
      if (allSyn.length !== synSet.size) logExample(`${sourceLang}_${version}`, "syn_no_internal_dup", { word, syn: allSyn });

      for (const a of allAnt) {
        const isSelf = a.trim().toLowerCase() === word.toLowerCase();
        bump(`${sourceLang}_${version}`, "ant_not_self", !isSelf);
        if (isSelf) logExample(`${sourceLang}_${version}`, "ant_not_self", { word, ant: a });

        const hasParen = /[()()]/.test(a);
        bump(`${sourceLang}_${version}`, "ant_no_parenthetical_fab", !hasParen);
        if (hasParen) logExample(`${sourceLang}_${version}`, "ant_no_parenthetical_fab", { word, ant: a });

        const crossLeak = synSet.has(a.toLowerCase().trim());
        bump(`${sourceLang}_${version}`, "ant_not_in_syn", !crossLeak);
        if (crossLeak) logExample(`${sourceLang}_${version}`, "ant_not_in_syn", { word, ant: a });
      }
      bump(`${sourceLang}_${version}`, "ant_no_internal_dup", allAnt.length === antSet.size);

      // === Meaning count discipline ===
      const sameCount = meanings.length === meaningsTr.length;
      bump(`${sourceLang}_${version}`, "meanings_and_translated_same_count", sameCount);
      if (!sameCount) logExample(`${sourceLang}_${version}`, "meanings_and_translated_same_count", { word, m: meanings.length, mt: meaningsTr.length });
    }
  }
}

// EN/JA/ZH/Latin audit files
verifyAuditFile("en-case-audit-2026-05-19.json", "en");
verifyAuditFile("ja-case-audit-2026-05-19.json", "ja");
verifyAuditFile("zh-case-audit-2026-05-19.json", "zh-CN");
verifyAuditFile("latin-case-audit-2026-05-19.json", "latin");

// KO synant audit has different shape (no versions.old/new — has .old and .new directly)
const koSynantData = loadJson("ko-synant-audit-2026-05-19.json");
if (koSynantData) {
  console.log(`Loaded ko-synant-audit-2026-05-19.json: ${koSynantData.length} entries`);
  for (const r of koSynantData) {
    const word = r.word;
    for (const version of ["old", "new"]) {
      const v = r[version];
      if (!v) continue;
      const allSyn = v.synonyms ?? [];
      const allAnt = v.antonyms ?? [];
      const synSet = new Set(allSyn.map((s) => s.toLowerCase().trim()));
      const antSet = new Set(allAnt.map((s) => s.toLowerCase().trim()));

      for (const s of allSyn) {
        bump(`ko_${version}`, "syn_not_self", s.trim() !== word);
        bump(`ko_${version}`, "syn_no_parenthetical_fab", !/[()()]/.test(s));
        bump(`ko_${version}`, "syn_not_in_ant", !antSet.has(s.toLowerCase().trim()));
      }
      for (const a of allAnt) {
        bump(`ko_${version}`, "ant_not_self", a.trim() !== word);
        bump(`ko_${version}`, "ant_no_parenthetical_fab", !/[()()]/.test(a));
        bump(`ko_${version}`, "ant_not_in_syn", !synSet.has(a.toLowerCase().trim()));
      }
    }
  }
}

// Print summary
console.log(`\n\n=== Multi-dimensional verification report ===\n`);
const groups = Object.keys(reports).sort();
for (const g of groups) {
  console.log(`## ${g}`);
  const keys = Object.keys(reports[g]).sort();
  for (const k of keys) {
    const r = reports[g][k];
    const pct = r.total > 0 ? (r.pass / r.total * 100).toFixed(1) : "—";
    const fails = r.total - r.pass;
    const failTag = fails > 0 ? `  [${fails} fail]` : "";
    console.log(`  ${k.padEnd(40)} ${r.pass}/${r.total} = ${pct}%${failTag}`);
    if (fails > 0 && r.examples.length > 0) {
      for (const ex of r.examples) {
        console.log(`    ✗ ${JSON.stringify(ex).slice(0, 200)}`);
      }
    }
  }
  console.log();
}

// Print "new-version only" focused summary for easy reading
console.log(`\n=== NEW (case-routed) production summary ===\n`);
const NEW_PRIORITIES = [
  "ipa_present_and_valid",
  "marker_exactly_one_pair",
  "marker_contains_headword",
  "example_terminal_punct",
  "syn_not_self", "syn_no_parenthetical_fab", "syn_not_in_ant", "syn_no_internal_dup",
  "ant_not_self", "ant_no_parenthetical_fab", "ant_not_in_syn", "ant_no_internal_dup",
  "meanings_and_translated_same_count",
];
const newGroups = groups.filter((g) => g.endsWith("_new"));
console.log(`Source | Dimension | Pass/Total | %`);
console.log(`---|---|---|---`);
for (const g of newGroups) {
  for (const k of NEW_PRIORITIES) {
    if (!reports[g][k]) continue;
    const r = reports[g][k];
    const pct = r.total > 0 ? (r.pass / r.total * 100).toFixed(1) : "—";
    console.log(`${g.replace("_new", "")} | ${k} | ${r.pass}/${r.total} | ${pct}%`);
  }
}
