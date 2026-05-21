// Precision filter v3: targeted drops + manual whitelist/blacklist tweaks.
const fs = require('fs');

const FABRICATED_SUFFIXES = new Set([
  '장소', '계획', '약속', '행사', '참석자', '참석명단', '사진촬영',
  '동영상', '행진곡', '준비물', '초대장', '의상', '결과', '기록',
  '연주', '공연', '축사', '연설', '음악', '노래', '케이크', '파티',
  '축하', '선물', '음식', '모임', '순', '사회', '끝', '시작',
  '기념', '이후', '장수여', '앨범사진',
]);

const FORCE_DROP = new Set([
  '졸업앨범사진', '졸업장수여', '졸업기념일', '졸업이후', '졸업모임',
  '끝장내기내기', '끝장내기내기하다', '끝장내기내기되다', '끝장내기내기보다',
]);

const FORCE_KEEP = new Set([
  '끝장내다', '끝장내기',
]);

function isFabricatedByStem(w) {
  if (FORCE_KEEP.has(w)) return false;
  if (FORCE_DROP.has(w)) return true;
  if (w === '졸업식') return false;
  if (w.startsWith('졸업식') && w !== '졸업식장') return true;
  if (w === '끝장' || w === '끝장나다') return false;
  if (w.startsWith('끝장')) return true;
  if (w === '마지막') return false;
  if (w.startsWith('마지막') && w !== '마지막날') return true;
  if (w === '처음') return false;
  if (w.startsWith('처음') && w.length > 2) return true;
  return false;
}

const input = JSON.parse(fs.readFileSync('/tmp/topik2-words.json', 'utf8'));
const all = input.words;
const wordSet = new Set(all);

function isFabricated(w) {
  if (FORCE_KEEP.has(w)) return false;
  if (FORCE_DROP.has(w)) return true;
  if (isFabricatedByStem(w)) return true;
  for (let i = 2; i <= w.length - 1; i++) {
    const prefix = w.slice(0, i);
    const suffix = w.slice(i);
    if (wordSet.has(prefix) && FABRICATED_SUFFIXES.has(suffix)) return true;
  }
  return false;
}

const good = [];
const bad = [];
for (const w of all) {
  if (isFabricated(w)) bad.push(w);
  else good.push(w);
}

fs.writeFileSync('/tmp/topik2-words-filtered.json', JSON.stringify({ words: good }, null, 2));
fs.writeFileSync('/tmp/topik2-words-dropped.json', JSON.stringify({ words: bad }, null, 2));
console.log(`Kept: ${good.length}, Dropped: ${bad.length}`);
console.log(`Need backfill: ${900 - good.length} words`);
