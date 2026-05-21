// Create 8 sample books (1 per source language) + 20 user_words each = 160 total.
// Then ENRICH-process each word and update result_json.

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USER_ID = '44e40709-8ea9-4d33-98e7-c839ae098dc0';

const c = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });

// 8 source languages × 20 words each, mixing common/polysemy/typo/edges/numbers/propers
// KO source → EN target (so 대표님 can review English output of Korean words)
// Other 7 source → KO target (so 대표님 can review Korean translation of foreign words)
const SAMPLES = {
  ko: { tgt: 'en', words: [
    // common (7)
    '학교','친구','사람','시간','책','가다','먹다',
    // polysemy (3)
    '배','다리','눈',
    // typo (2)
    '학굣','친귀',
    // edges (4) — set expression / loanword / na-adj / honorific
    '안녕하세요','잘 부탁드립니다','사이다','행복하다',
    // numbers (2)
    '42','3.14',
    // propers (2)
    '서울','BTS',
  ]},
  en: { tgt: 'ko', words: [
    'book','happy','school','friend','run','give','water',
    'bank','bat','spring',
    'recieve','definately',
    'look up','kick the bucket','ice cream','long-term',
    '42','100',
    'Microsoft','Tokyo',
  ]},
  ja: { tgt: 'ko', words: [
    '学校','友達','人','本','時間','食べる','飲む',
    '見る','取る','かける',
    'こんにちわ','ありがとうごじゃいます',
    'よろしくお願いします','コーヒー','マンション','美しい',
    '42','3.14',
    '東京','NHK',
  ]},
  'zh-CN': { tgt: 'ko', words: [
    '学校','朋友','人','时间','喝','看','吃',
    '行','长','重',
    '你号','謝謝',
    '你好','一帆风顺','咖啡','漂亮',
    '42','100',
    '北京','CCTV',
  ]},
  es: { tgt: 'ko', words: [
    'casa','agua','libro','amigo','comer','ir','hacer',
    'banco','vela','carta',
    'porfavor','graciaa',
    'por favor','buenos días','café','mañana',
    '42','100',
    'Madrid','FIFA',
  ]},
  fr: { tgt: 'ko', words: [
    'maison','eau','livre','ami','manger','aller','faire',
    'livre','tour','vol',
    'bojour','merci beacoup',
    'bonjour','s\'il vous plaît','café','main',
    '42','3.14',
    'Paris','SNCF',
  ]},
  de: { tgt: 'ko', words: [
    'Haus','Wasser','Buch','Freund','essen','gehen','machen',
    'Bank','Schloss','Mutter',
    'danke schon','guten morgan',
    'zum Beispiel','guten Tag','Kaffee','Gift',
    '42','100',
    'Berlin','BMW',
  ]},
  it: { tgt: 'ko', words: [
    'casa','acqua','libro','amico','mangiare','andare','fare',
    'calcio','ala','vela',
    'chiao','grazi',
    'per favore','buongiorno','caffè','morbido',
    '42','3.14',
    'Roma','FIAT',
  ]},
};

const SOURCE_LIST = ['ko','en','ja','zh-CN','es','fr','de','it'];

console.log('Creating 8 sample books + 160 user_words + ENRICH processing...\n');

for (const src of SOURCE_LIST) {
  const { tgt, words } = SAMPLES[src];
  if (words.length !== 20) { console.error(`${src} has ${words.length} words, expected 20`); process.exit(1); }

  const bookId = randomUUID();
  const title = `샘플 검증 (${src} → ${tgt}) 2026-05-19`;
  const now = new Date().toISOString();

  // Create book
  const { error: bErr } = await c.from('books').insert({
    id: bookId,
    user_id: USER_ID,
    title,
    source_lang: src,
    target_lang: tgt,
    study_lang: src,
    bidirectional: true,
    sort_order: 0,
    pinned: false,
    notif_enabled: false,
    notif_minute: 0,
    notif_days: 127,
    created_at: now,
    updated_at: now,
  });
  if (bErr) { console.error(`book ${src}:`, bErr); process.exit(1); }
  console.log(`Book "${title}" created: ${bookId}`);

  // Add 20 user_words + ENRICH each
  for (const w of words) {
    process.stdout.write(`  ${w.padEnd(28)} ... `);
    let result = null;
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/word-lookup-v2`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: w, sourceLang: src, targetLang: tgt, mode: 'enrich', forceFresh: true }),
      });
      if (!r.ok) { console.log(`HTTP ${r.status}`); continue; }
      const j = await r.json();
      result = j.result;
    } catch (e) { console.log(`ERR ${e.message?.slice(0, 50)}`); continue; }

    if (!result) { console.log('no result'); continue; }

    const { error: wErr } = await c.from('user_words').insert({
      id: randomUUID(),
      user_id: USER_ID,
      book_id: bookId,
      word: w,
      reading_key: '',
      result_json: result,
      source_sentence: null,
      ease_factor: 2.5,
      interval_days: 0,
      next_review: now,
      review_count: 0,
      created_at: now,
      updated_at: now,
    });
    if (wErr) { console.log(`INSERT ERR ${wErr.message?.slice(0, 60)}`); continue; }
    const note = result.note ? `(note=${result.note})` : `m${(result.meanings ?? []).length} ex${(result.examples ?? []).length}`;
    console.log(`OK ${note}`);
  }
  console.log();
}

console.log('All sample books created. Client will sync via AppState active.');
