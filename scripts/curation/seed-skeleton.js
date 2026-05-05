/**
 * Seeds the `curated_wordlists` table with all planned wordlist metadata
 * (no words yet). Each row is inserted with `is_active = false` so users
 * don't see empty lists in the library — flip is_active to true as
 * content gets curated for each.
 *
 * Idempotent: re-running upserts on slug.
 */
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL or SERVICE_ROLE_KEY missing');
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Helper to keep slugs / metadata consistent.
function exam({ slug, names, source, examType, level, order, descKo }) {
  return {
    slug,
    name_i18n: names,
    description_i18n: descKo ? { ko: descKo, en: '' } : {},
    source_lang: source,
    exam_type: examType,
    level,
    category: 'exam',
    display_order: order,
    is_active: false,
  };
}

const LISTS = [
  // ───── 중국어 (zh-CN) ─────
  exam({ slug: 'hsk-1', source: 'zh-CN', examType: 'HSK', level: '1', order: 11,
    names: { ko: 'HSK 1급', en: 'HSK Level 1', 'zh-CN': 'HSK 一级', ja: 'HSK 1級' },
    descKo: '중국어 능력시험 1급 공식 어휘 150선' }),
  exam({ slug: 'hsk-2', source: 'zh-CN', examType: 'HSK', level: '2', order: 12,
    names: { ko: 'HSK 2급', en: 'HSK Level 2', 'zh-CN': 'HSK 二级', ja: 'HSK 2級' },
    descKo: 'HSK 2급 신규 어휘 150선' }),
  exam({ slug: 'hsk-3', source: 'zh-CN', examType: 'HSK', level: '3', order: 13,
    names: { ko: 'HSK 3급', en: 'HSK Level 3', 'zh-CN': 'HSK 三级', ja: 'HSK 3級' },
    descKo: 'HSK 3급 신규 어휘 300선' }),
  exam({ slug: 'hsk-4', source: 'zh-CN', examType: 'HSK', level: '4', order: 14,
    names: { ko: 'HSK 4급', en: 'HSK Level 4', 'zh-CN': 'HSK 四级', ja: 'HSK 4級' },
    descKo: 'HSK 4급 신규 어휘 600선' }),
  exam({ slug: 'hsk-5', source: 'zh-CN', examType: 'HSK', level: '5', order: 15,
    names: { ko: 'HSK 5급', en: 'HSK Level 5', 'zh-CN': 'HSK 五级', ja: 'HSK 5級' },
    descKo: 'HSK 5급 신규 어휘 1,300선' }),
  exam({ slug: 'hsk-6', source: 'zh-CN', examType: 'HSK', level: '6', order: 16,
    names: { ko: 'HSK 6급', en: 'HSK Level 6', 'zh-CN': 'HSK 六级', ja: 'HSK 6級' },
    descKo: 'HSK 6급 신규 어휘 2,500선' }),

  // ───── 중국어 번체 (zh-TW) ─────
  exam({ slug: 'tocfl-1', source: 'zh-TW', examType: 'TOCFL', level: '1', order: 21,
    names: { ko: 'TOCFL 1급', en: 'TOCFL Level 1', 'zh-TW': 'TOCFL 入門級' },
    descKo: '대만 화어문능력시험 1급 어휘' }),
  exam({ slug: 'tocfl-2', source: 'zh-TW', examType: 'TOCFL', level: '2', order: 22,
    names: { ko: 'TOCFL 2급', en: 'TOCFL Level 2', 'zh-TW': 'TOCFL 基礎級' },
    descKo: '대만 화어문능력시험 2급 어휘' }),
  exam({ slug: 'tocfl-3', source: 'zh-TW', examType: 'TOCFL', level: '3', order: 23,
    names: { ko: 'TOCFL 3급', en: 'TOCFL Level 3', 'zh-TW': 'TOCFL 進階級' },
    descKo: '대만 화어문능력시험 3급 어휘' }),
  exam({ slug: 'tocfl-4', source: 'zh-TW', examType: 'TOCFL', level: '4', order: 24,
    names: { ko: 'TOCFL 4급', en: 'TOCFL Level 4', 'zh-TW': 'TOCFL 高階級' },
    descKo: '대만 화어문능력시험 4급 어휘' }),
  exam({ slug: 'tocfl-5', source: 'zh-TW', examType: 'TOCFL', level: '5', order: 25,
    names: { ko: 'TOCFL 5급', en: 'TOCFL Level 5', 'zh-TW': 'TOCFL 流利級' },
    descKo: '대만 화어문능력시험 5급 어휘' }),

  // ───── 한국어 (ko) — 외국인 학습자용 ─────
  exam({ slug: 'topik-1', source: 'ko', examType: 'TOPIK', level: '1', order: 31,
    names: { ko: 'TOPIK 1급', en: 'TOPIK Level 1', ja: 'TOPIK 1級', 'zh-CN': 'TOPIK 1级' },
    descKo: '한국어능력시험 1급 어휘 약 800선' }),
  exam({ slug: 'topik-2', source: 'ko', examType: 'TOPIK', level: '2', order: 32,
    names: { ko: 'TOPIK 2급', en: 'TOPIK Level 2', ja: 'TOPIK 2級' },
    descKo: 'TOPIK 2급 신규 어휘' }),
  exam({ slug: 'topik-3', source: 'ko', examType: 'TOPIK', level: '3', order: 33,
    names: { ko: 'TOPIK 3급', en: 'TOPIK Level 3', ja: 'TOPIK 3級' },
    descKo: 'TOPIK 3급 신규 어휘' }),
  exam({ slug: 'topik-4', source: 'ko', examType: 'TOPIK', level: '4', order: 34,
    names: { ko: 'TOPIK 4급', en: 'TOPIK Level 4', ja: 'TOPIK 4級' },
    descKo: 'TOPIK 4급 신규 어휘' }),
  exam({ slug: 'topik-5', source: 'ko', examType: 'TOPIK', level: '5', order: 35,
    names: { ko: 'TOPIK 5급', en: 'TOPIK Level 5', ja: 'TOPIK 5級' },
    descKo: 'TOPIK 5급 신규 어휘' }),
  exam({ slug: 'topik-6', source: 'ko', examType: 'TOPIK', level: '6', order: 36,
    names: { ko: 'TOPIK 6급', en: 'TOPIK Level 6', ja: 'TOPIK 6級' },
    descKo: 'TOPIK 6급 신규 어휘' }),

  // ───── 일본어 (ja) ─────
  exam({ slug: 'jlpt-n5', source: 'ja', examType: 'JLPT', level: 'N5', order: 41,
    names: { ko: 'JLPT N5', en: 'JLPT N5', ja: 'JLPT N5' },
    descKo: '일본어 능력시험 N5 어휘 약 800선' }),
  exam({ slug: 'jlpt-n4', source: 'ja', examType: 'JLPT', level: 'N4', order: 42,
    names: { ko: 'JLPT N4', en: 'JLPT N4', ja: 'JLPT N4' },
    descKo: 'JLPT N4 신규 어휘 약 800선' }),
  exam({ slug: 'jlpt-n3', source: 'ja', examType: 'JLPT', level: 'N3', order: 43,
    names: { ko: 'JLPT N3', en: 'JLPT N3', ja: 'JLPT N3' },
    descKo: 'JLPT N3 신규 어휘 약 1,800선' }),
  exam({ slug: 'jlpt-n2', source: 'ja', examType: 'JLPT', level: 'N2', order: 44,
    names: { ko: 'JLPT N2', en: 'JLPT N2', ja: 'JLPT N2' },
    descKo: 'JLPT N2 신규 어휘 약 2,000선' }),
  exam({ slug: 'jlpt-n1', source: 'ja', examType: 'JLPT', level: 'N1', order: 45,
    names: { ko: 'JLPT N1', en: 'JLPT N1', ja: 'JLPT N1' },
    descKo: 'JLPT N1 신규 어휘 약 4,500선' }),

  // ───── 영어 (en) ─────
  exam({ slug: 'awl-full', source: 'en', examType: 'AWL', level: null, order: 51,
    names: {
      ko: 'AWL 학술 영어 (Coxhead 2000)',
      en: 'AWL Academic English (Coxhead 2000)',
      ja: 'AWL 学術英語 (Coxhead 2000)',
      'zh-CN': 'AWL 学术英语 (Coxhead 2000)',
    },
    descKo: 'Coxhead Academic Word List 전체 570단어. TOEFL, IELTS, 학술 논문/교과서 대비.' }),
  exam({ slug: 'toeic-frequent', source: 'en', examType: 'TOEIC', level: null, order: 52,
    names: { ko: 'TOEIC 빈출 어휘', en: 'TOEIC Frequent Vocabulary', ja: 'TOEIC 頻出語彙' },
    descKo: '비즈니스 영어 빈출 단어 (COCA 비즈니스 코퍼스 기반, TOEIC 대비)' }),
  exam({ slug: 'toefl-academic', source: 'en', examType: 'TOEFL', level: null, order: 53,
    names: { ko: 'TOEFL 학술 어휘', en: 'TOEFL Academic Vocabulary' },
    descKo: 'TOEFL iBT 학술 영어 빈출 어휘' }),
  exam({ slug: 'ielts-academic', source: 'en', examType: 'IELTS', level: null, order: 54,
    names: { ko: 'IELTS 학술 어휘', en: 'IELTS Academic Vocabulary' },
    descKo: 'IELTS 학술 모듈 빈출 어휘' }),
  exam({ slug: 'gsl', source: 'en', examType: 'GSL', level: null, order: 55,
    names: { ko: 'GSL 일반 빈출 (West 1953)', en: 'GSL General Service List' },
    descKo: '일반 영어 빈출 2,000단어 (영어 학습 기초)' }),
  exam({ slug: 'ngsl', source: 'en', examType: 'NGSL', level: null, order: 56,
    names: { ko: 'NGSL 현대 일반 빈출 (Browne 2014)', en: 'NGSL New General Service List' },
    descKo: '현대 영어 빈출 2,800단어' }),
  exam({ slug: 'opic-conversational', source: 'en', examType: 'OPIc', level: null, order: 57,
    names: { ko: 'OPIc 회화 어휘', en: 'OPIc Conversational Vocabulary' },
    descKo: 'OPIc 회화 시험 빈출 표현 및 어휘' }),
  exam({ slug: 'sat-vocabulary', source: 'en', examType: 'SAT', level: null, order: 58,
    names: { ko: 'SAT 어휘', en: 'SAT Vocabulary' },
    descKo: 'SAT 시험 빈출 고급 어휘' }),

  // ───── 스페인어 (es) ─────
  exam({ slug: 'dele-a1', source: 'es', examType: 'DELE', level: 'A1', order: 61,
    names: { ko: 'DELE A1', en: 'DELE A1', es: 'DELE A1' },
    descKo: 'Cervantes 공식 DELE A1 어휘' }),
  exam({ slug: 'dele-a2', source: 'es', examType: 'DELE', level: 'A2', order: 62,
    names: { ko: 'DELE A2', en: 'DELE A2', es: 'DELE A2' },
    descKo: 'DELE A2 신규 어휘' }),
  exam({ slug: 'dele-b1', source: 'es', examType: 'DELE', level: 'B1', order: 63,
    names: { ko: 'DELE B1', en: 'DELE B1', es: 'DELE B1' },
    descKo: 'DELE B1 신규 어휘' }),
  exam({ slug: 'dele-b2', source: 'es', examType: 'DELE', level: 'B2', order: 64,
    names: { ko: 'DELE B2', en: 'DELE B2', es: 'DELE B2' },
    descKo: 'DELE B2 신규 어휘' }),
  exam({ slug: 'dele-c1', source: 'es', examType: 'DELE', level: 'C1', order: 65,
    names: { ko: 'DELE C1', en: 'DELE C1', es: 'DELE C1' },
    descKo: 'DELE C1 신규 어휘' }),

  // ───── 프랑스어 (fr) ─────
  exam({ slug: 'delf-a1', source: 'fr', examType: 'DELF', level: 'A1', order: 71,
    names: { ko: 'DELF A1', en: 'DELF A1', fr: 'DELF A1' },
    descKo: 'France Éducation 공식 DELF A1 어휘' }),
  exam({ slug: 'delf-a2', source: 'fr', examType: 'DELF', level: 'A2', order: 72,
    names: { ko: 'DELF A2', en: 'DELF A2', fr: 'DELF A2' },
    descKo: 'DELF A2 신규 어휘' }),
  exam({ slug: 'delf-b1', source: 'fr', examType: 'DELF', level: 'B1', order: 73,
    names: { ko: 'DELF B1', en: 'DELF B1', fr: 'DELF B1' },
    descKo: 'DELF B1 신규 어휘' }),
  exam({ slug: 'delf-b2', source: 'fr', examType: 'DELF', level: 'B2', order: 74,
    names: { ko: 'DELF B2', en: 'DELF B2', fr: 'DELF B2' },
    descKo: 'DELF B2 신규 어휘' }),
  exam({ slug: 'dalf-c1', source: 'fr', examType: 'DALF', level: 'C1', order: 75,
    names: { ko: 'DALF C1', en: 'DALF C1', fr: 'DALF C1' },
    descKo: 'DALF C1 고급 어휘' }),

  // ───── 독일어 (de) ─────
  exam({ slug: 'goethe-a1', source: 'de', examType: 'Goethe', level: 'A1', order: 81,
    names: { ko: 'Goethe A1', en: 'Goethe A1', de: 'Goethe A1' },
    descKo: '괴테 인스티튜트 A1 어휘 (Start Deutsch 1)' }),
  exam({ slug: 'goethe-a2', source: 'de', examType: 'Goethe', level: 'A2', order: 82,
    names: { ko: 'Goethe A2', en: 'Goethe A2', de: 'Goethe A2' },
    descKo: 'Goethe A2 신규 어휘' }),
  exam({ slug: 'goethe-b1', source: 'de', examType: 'Goethe', level: 'B1', order: 83,
    names: { ko: 'Goethe B1', en: 'Goethe B1', de: 'Goethe B1' },
    descKo: 'Goethe B1 신규 어휘' }),
  exam({ slug: 'goethe-b2', source: 'de', examType: 'Goethe', level: 'B2', order: 84,
    names: { ko: 'Goethe B2', en: 'Goethe B2', de: 'Goethe B2' },
    descKo: 'Goethe B2 신규 어휘' }),
  exam({ slug: 'goethe-c1', source: 'de', examType: 'Goethe', level: 'C1', order: 85,
    names: { ko: 'Goethe C1', en: 'Goethe C1', de: 'Goethe C1' },
    descKo: 'Goethe C1 고급 어휘' }),

  // ───── 이탈리아어 (it) ─────
  exam({ slug: 'cils-a1', source: 'it', examType: 'CILS', level: 'A1', order: 91,
    names: { ko: 'CILS A1', en: 'CILS A1', it: 'CILS A1' },
    descKo: 'Siena 대학 CILS A1 어휘' }),
  exam({ slug: 'cils-a2', source: 'it', examType: 'CILS', level: 'A2', order: 92,
    names: { ko: 'CILS A2', en: 'CILS A2', it: 'CILS A2' },
    descKo: 'CILS A2 신규 어휘' }),
  exam({ slug: 'cils-b1', source: 'it', examType: 'CILS', level: 'B1', order: 93,
    names: { ko: 'CILS B1', en: 'CILS B1', it: 'CILS B1' },
    descKo: 'CILS B1 신규 어휘' }),
  exam({ slug: 'cils-b2', source: 'it', examType: 'CILS', level: 'B2', order: 94,
    names: { ko: 'CILS B2', en: 'CILS B2', it: 'CILS B2' },
    descKo: 'CILS B2 신규 어휘' }),

  // ───── 포르투갈어 (pt) ─────
  exam({ slug: 'celpe-bras', source: 'pt', examType: 'CELPE-Bras', level: null, order: 101,
    names: { ko: 'CELPE-Bras (브라질)', en: 'CELPE-Bras (Brazilian)', pt: 'CELPE-Bras' },
    descKo: '브라질 포르투갈어 능력시험 어휘' }),
  exam({ slug: 'ciple-a2', source: 'pt', examType: 'CIPLE', level: 'A2', order: 102,
    names: { ko: 'CIPLE A2 (포르투갈)', en: 'CIPLE A2 (Portuguese)', pt: 'CIPLE A2' },
    descKo: '포르투갈 포르투갈어 A2 어휘' }),

  // ───── 러시아어 (ru) ─────
  exam({ slug: 'torfl-a1', source: 'ru', examType: 'TORFL', level: 'A1', order: 111,
    names: { ko: 'TORFL A1 (ТРКИ)', en: 'TORFL A1', ru: 'ТРКИ A1' },
    descKo: '러시아어 능력시험 A1 (Elementary) 어휘' }),
  exam({ slug: 'torfl-a2', source: 'ru', examType: 'TORFL', level: 'A2', order: 112,
    names: { ko: 'TORFL A2', en: 'TORFL A2', ru: 'ТРКИ A2' },
    descKo: 'TORFL A2 (Basic) 신규 어휘' }),
  exam({ slug: 'torfl-b1', source: 'ru', examType: 'TORFL', level: 'B1', order: 113,
    names: { ko: 'TORFL B1', en: 'TORFL B1', ru: 'ТРКИ B1' },
    descKo: 'TORFL B1 (First) 신규 어휘' }),
  exam({ slug: 'torfl-b2', source: 'ru', examType: 'TORFL', level: 'B2', order: 114,
    names: { ko: 'TORFL B2', en: 'TORFL B2', ru: 'ТРКИ B2' },
    descKo: 'TORFL B2 (Second) 신규 어휘' }),

  // ───── 추천 단어장 (topic) ─────
  // 영어 일상 회화 / 직업 / 여행 등 주제별 큐레이션. 콘텐츠 미작성 상태 →
  // 라이브러리에서 "준비 중" 배지 + 비활성 카드로 표시.
  topic({ slug: 'topic-travel-en', source: 'en', order: 201,
    names: { ko: '영어 여행 회화', en: 'English for Travel', ja: '旅行英会話' },
    descKo: '공항, 호텔, 길 묻기 등 여행에서 자주 쓰는 영어 어휘' }),
  topic({ slug: 'topic-restaurant-en', source: 'en', order: 202,
    names: { ko: '영어 음식점 주문', en: 'English at Restaurants', ja: 'レストランで使う英語' },
    descKo: '메뉴 읽기, 주문하기, 결제 등 음식점 영어' }),
  topic({ slug: 'topic-business-meeting-en', source: 'en', order: 203,
    names: { ko: '영어 비즈니스 회의', en: 'Business Meeting English' },
    descKo: '회의, 발표, 이메일 등 비즈니스 상황 영어' }),
  topic({ slug: 'topic-medical-en', source: 'en', order: 204,
    names: { ko: '영어 병원·의료', en: 'English at the Hospital' },
    descKo: '병원 방문, 증상 설명, 약 처방 등 의료 영어' }),
  topic({ slug: 'topic-it-en', source: 'en', order: 205,
    names: { ko: 'IT·소프트웨어 영어', en: 'IT & Software English' },
    descKo: '개발자, 디자이너, PM 등 IT 직군 빈출 어휘' }),

  topic({ slug: 'topic-travel-ja', source: 'ja', order: 211,
    names: { ko: '일본 여행 회화', ja: '日本旅行で使う日本語', en: 'Japanese for Travel' },
    descKo: '관광, 호텔, 식당 등 일본 여행 필수 어휘' }),
  topic({ slug: 'topic-restaurant-ja', source: 'ja', order: 212,
    names: { ko: '일본 음식점 주문', ja: 'レストランで使う日本語' },
    descKo: '라멘집, 이자카야, 카페 등 일본 음식점 어휘' }),

  topic({ slug: 'topic-travel-zh-CN', source: 'zh-CN', order: 221,
    names: { ko: '중국 여행 회화', 'zh-CN': '中国旅行汉语', en: 'Chinese for Travel' },
    descKo: '관광, 길 찾기, 쇼핑 등 중국 여행 어휘' }),
  topic({ slug: 'topic-restaurant-zh-CN', source: 'zh-CN', order: 222,
    names: { ko: '중국 음식점 주문', 'zh-CN': '餐厅点餐汉语' },
    descKo: '주문, 결제, 음식 이름 등 중국 음식점 어휘' }),

  topic({ slug: 'topic-travel-es', source: 'es', order: 231,
    names: { ko: '스페인어 여행 회화', es: 'Español para viajar' },
    descKo: '관광, 길 찾기 등 스페인어권 여행 어휘' }),
  topic({ slug: 'topic-travel-fr', source: 'fr', order: 241,
    names: { ko: '프랑스어 여행 회화', fr: 'Français pour voyager' },
    descKo: '관광, 호텔, 식당 등 프랑스 여행 어휘' }),
];

function topic({ slug, source, names, descKo, order }) {
  return {
    slug,
    name_i18n: names,
    description_i18n: descKo ? { ko: descKo, en: '' } : {},
    source_lang: source,
    exam_type: null,
    level: null,
    category: 'topic',
    display_order: order,
    is_active: true, // visible in topic library; word_count=0 triggers "Coming soon" badge
  };
}

async function main() {
  console.log(`📋 Seeding ${LISTS.length} curated wordlist skeletons (is_active=false)`);

  // Lists already populated should keep their is_active and word_count.
  // We do a per-row upsert, but only set is_active=false when row is new.
  for (const row of LISTS) {
    const { data: existing } = await admin
      .from('curated_wordlists')
      .select('id, is_active, word_count')
      .eq('slug', row.slug)
      .maybeSingle();

    if (existing) {
      // Don't overwrite is_active for already-populated lists.
      const { error } = await admin
        .from('curated_wordlists')
        .update({
          name_i18n: row.name_i18n,
          description_i18n: row.description_i18n,
          source_lang: row.source_lang,
          exam_type: row.exam_type,
          level: row.level,
          category: row.category,
          display_order: row.display_order,
        })
        .eq('id', existing.id);
      if (error) console.error(`✗ ${row.slug}: ${error.message}`);
      else console.log(`  updated ${row.slug} (kept is_active=${existing.is_active}, word_count=${existing.word_count})`);
    } else {
      const { error } = await admin.from('curated_wordlists').insert(row);
      if (error) console.error(`✗ ${row.slug}: ${error.message}`);
      else console.log(`  inserted ${row.slug} (is_active=false)`);
    }
  }

  console.log('✅ Done');
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
