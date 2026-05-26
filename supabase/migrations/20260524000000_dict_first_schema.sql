-- Dict-first 아키텍처를 위한 스키마 확장 (Phase 2)
-- - word_entries에 source 컬럼 추가 (dictionary/llm/mixed)
-- - JMdict, CC-CEDICT 원본 사전을 Postgres에 적재할 테이블 신규
-- - krdict는 외부 API 호출이라 별도 테이블 필요 없음 (응답을 word_entries에 캐싱)
-- - freedict (Wiktionary 기반)도 외부 API 호출

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- word_entries: 의미·번역 출처 표기용 source 필드 추가
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE word_entries
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'llm';
-- 값: 'dictionary' (사전 enumerate만), 'llm' (전부 LLM 생성),
--     'mixed' (사전 + LLM 보강), 'curated' (큐레이터 수동).

CREATE INDEX IF NOT EXISTS idx_word_entries_source ON word_entries (source);

COMMENT ON COLUMN word_entries.source IS
  'Origin of meanings: dictionary/llm/mixed/curated. dict-first 흐름은 ''dictionary'' 또는 ''mixed''.';

-- meanings JSONB 구조 확장 (애플리케이션 레벨 contract):
--   기존: { meaning_index, ko, en, examples, ... }
--   추가: frequency_score (0-100), origin ('dictionary'|'llm'),
--         ko_def (사전 원본 정의문, AI 컨텍스트용)
-- 스키마 변경 없음 — JSONB 유연성 활용.

-- ────────────────────────────────────────────────────────────────────────
-- jmdict_entries: 일본어 사전 JMdict (jmdict-simplified all-languages 25MB)
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jmdict_entries (
  id BIGSERIAL PRIMARY KEY,
  jmdict_seq INTEGER NOT NULL UNIQUE,           -- JMdict sequence ID
  kanji_forms TEXT[] NOT NULL DEFAULT '{}',     -- e.g. ['生きる', '活きる']
  kana_forms TEXT[] NOT NULL DEFAULT '{}',      -- e.g. ['いきる']
  is_common BOOLEAN NOT NULL DEFAULT FALSE,     -- common 플래그 (kanji/kana 중 하나라도 common=true)
  data JSONB NOT NULL,                          -- 전체 entry (sense, gloss multi-lang, misc 태그 등)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jmdict_kanji ON jmdict_entries USING GIN (kanji_forms);
CREATE INDEX IF NOT EXISTS idx_jmdict_kana ON jmdict_entries USING GIN (kana_forms);
CREATE INDEX IF NOT EXISTS idx_jmdict_common ON jmdict_entries (is_common);

COMMENT ON TABLE jmdict_entries IS
  'JMdict 일본어 사전 (CC BY-SA 4.0, EDRDG). scriptin/jmdict-simplified all-languages 형식.';

-- ────────────────────────────────────────────────────────────────────────
-- cedict_entries: 중국어 사전 CC-CEDICT (~125K entries)
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cedict_entries (
  id BIGSERIAL PRIMARY KEY,
  traditional TEXT NOT NULL,                    -- 繁體字
  simplified TEXT NOT NULL,                     -- 简体字
  pinyin TEXT NOT NULL,                         -- e.g. 'xing2', 'chang2'
  senses TEXT[] NOT NULL DEFAULT '{}',          -- /로 구분된 의미 array
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 한자별 검색용 (simplified / traditional 둘 다 query 가능)
CREATE INDEX IF NOT EXISTS idx_cedict_simplified ON cedict_entries (simplified);
CREATE INDEX IF NOT EXISTS idx_cedict_traditional ON cedict_entries (traditional);

-- 같은 한자 + 다른 pinyin (多音字) 조합 unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_cedict_unique
  ON cedict_entries (simplified, traditional, pinyin);

COMMENT ON TABLE cedict_entries IS
  'CC-CEDICT 중국어 사전 (CC BY-SA 3.0/4.0). 다음(多音)자는 같은 한자 + 다른 pinyin으로 별도 row.';

-- ────────────────────────────────────────────────────────────────────────
-- (참고) krdict, freedictionaryapi.com은 외부 REST API 호출.
-- 응답을 word_entries.meanings JSONB에 캐싱하므로 별도 사전 테이블 불필요.
-- ────────────────────────────────────────────────────────────────────────

COMMIT;
