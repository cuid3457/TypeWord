// Build final TOPIK 1급 (900) + TOPIK 2급 (900) lists from cross-referenced sources.
//
// Strategy:
//   Tier A (definite Level 1) = TOPIK_GUIDE ∩ LingoDeer (in BOTH Level 1-focused 600-word lists)
//   Tier B (likely Level 1)   = TOPIK_GUIDE ∪ LingoDeer minus Tier A (in only one)
//   Tier C (likely Level 2)   = Tammy 1671 \ (Level 1-focused lists)
//
// 1급 final = Tier A + (Tier B prioritized by also-in-Tammy) up to 900
// 2급 final = Tier C + Tier B overflow up to 900
const fs = require('fs');
const path = require('path');

const TAMMY = fs.readFileSync(path.resolve(__dirname, '_topik1-source-analysis.js'), 'utf8')
  .match(/const TAMMY = `([^`]+)`/)[1].split(',').map(s => s.trim()).filter(Boolean);
const TOPIK_GUIDE = fs.readFileSync(path.resolve(__dirname, '_topik1-source-analysis.js'), 'utf8')
  .match(/const TOPIK_GUIDE = `([^`]+)`/)[1].split(',').map(s => s.trim()).filter(Boolean);
const LINGODEER = fs.readFileSync(path.resolve(__dirname, '_topik1-source-analysis.js'), 'utf8')
  .match(/const LINGODEER = `([^`]+)`/)[1].split(',').map(s => s.trim()).filter(Boolean);

const tammySet = new Set(TAMMY);
const guideSet = new Set(TOPIK_GUIDE);
const lingoSet = new Set(LINGODEER);

// Tier A: in BOTH Level 1 sources
const tierA = [...new Set([...guideSet].filter(w => lingoSet.has(w)))];
// Tier B: in ONE Level 1 source (not both)
const tierB = [...new Set([
  ...[...guideSet].filter(w => !lingoSet.has(w)),
  ...[...lingoSet].filter(w => !guideSet.has(w)),
])];
// Tier C: only in Tammy 1671
const tierC = [...tammySet].filter(w => !guideSet.has(w) && !lingoSet.has(w));

console.log('=== Tier sizes ===');
console.log('Tier A (definite L1, in BOTH 600-word lists):', tierA.length);
console.log('Tier B (likely L1, in ONE 600-word list):', tierB.length);
console.log('Tier C (likely L2, only in Tammy 1671):', tierC.length);

// Sort Tier B: those also in Tammy 1671 come first (more validated)
const tierBSorted = [...tierB].sort((a, b) => (tammySet.has(b) ? 1 : 0) - (tammySet.has(a) ? 1 : 0));

// 1급 final = Tier A + Tier B (sorted, validated first) up to 900
let level1Final = [...tierA];
for (const w of tierBSorted) {
  if (level1Final.length >= 900) break;
  level1Final.push(w);
}
console.log('\n1급 final size:', level1Final.length);

// 2급 final = remaining Tier B + Tier C up to 900
const level1Set = new Set(level1Final);
const remainingB = tierBSorted.filter(w => !level1Set.has(w));
let level2Final = [...remainingB, ...tierC];
// Cap at 900
level2Final = level2Final.slice(0, 900);
console.log('2급 final size:', level2Final.length);

// Diff vs current
const userPart1 = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'data/topik-1-part-1.json'), 'utf8'));
const userPart2 = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'data/topik-1-part-2.json'), 'utf8'));
const userPart3 = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'data/topik-1-part-3.json'), 'utf8'));
const userCurrent1 = new Set([...userPart1.words, ...userPart2.words, ...userPart3.words]);
const removed1 = [...userCurrent1].filter(w => !level1Set.has(w));
const added1 = level1Final.filter(w => !userCurrent1.has(w));

console.log('\n=== 1급 diff vs current ===');
console.log('Words REMOVED from current 1급:', removed1.length);
console.log('Sample REMOVED:', removed1.slice(0, 30).join(', '));
console.log('\nWords ADDED to 1급:', added1.length);
console.log('Sample ADDED:', added1.slice(0, 30).join(', '));

const userPart2_1 = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'data/topik-2-part-1.json'), 'utf8'));
const userPart2_2 = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'data/topik-2-part-2.json'), 'utf8'));
const userPart2_3 = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'data/topik-2-part-3.json'), 'utf8'));
const userCurrent2 = new Set([...userPart2_1.words, ...userPart2_2.words, ...userPart2_3.words]);
const level2Set = new Set(level2Final);
const removed2 = [...userCurrent2].filter(w => !level2Set.has(w));
const added2 = level2Final.filter(w => !userCurrent2.has(w));

console.log('\n=== 2급 diff vs current ===');
console.log('Words REMOVED from current 2급:', removed2.length);
console.log('Sample REMOVED:', removed2.slice(0, 30).join(', '));
console.log('\nWords ADDED to 2급:', added2.length);
console.log('Sample ADDED:', added2.slice(0, 30).join(', '));

// Write outputs
fs.writeFileSync('/tmp/topik1-final-900.json', JSON.stringify({ words: level1Final }, null, 2));
fs.writeFileSync('/tmp/topik2-final-900.json', JSON.stringify({ words: level2Final }, null, 2));
fs.writeFileSync('/tmp/topik1-removed.json', JSON.stringify(removed1, null, 2));
fs.writeFileSync('/tmp/topik1-added.json', JSON.stringify(added1, null, 2));
fs.writeFileSync('/tmp/topik2-removed.json', JSON.stringify(removed2, null, 2));
fs.writeFileSync('/tmp/topik2-added.json', JSON.stringify(added2, null, 2));

console.log('\nFiles written:');
console.log('  /tmp/topik1-final-900.json  (' + level1Final.length + ' words)');
console.log('  /tmp/topik2-final-900.json  (' + level2Final.length + ' words)');
console.log('  /tmp/topik1-removed.json    (' + removed1.length + ' words removed from current 1급)');
console.log('  /tmp/topik1-added.json      (' + added1.length + ' words added to 1급)');
console.log('  /tmp/topik2-removed.json    (' + removed2.length + ' words removed from current 2급)');
console.log('  /tmp/topik2-added.json      (' + added2.length + ' words added to 2급)');
