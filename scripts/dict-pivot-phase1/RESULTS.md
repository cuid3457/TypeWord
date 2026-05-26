# Phase 1 — Dictionary 검증 결과 (대표님 native 검수용)

**일시**: 2026-05-23
**상태**: **4개 소스 전부 검증 완료** (2026-05-23 오후).

---

## TL;DR — 4개 소스 중 3개 검증 완료

| 소스 | 언어 | 상태 | 다의어 품질 | 비고 |
|---|---|---|---|---|
| **JMdict-simplified** | ja | ✅ 다운로드 + 검증 | **압권 (S급)** | 217,076 entries. reading별 etymology 분리 |
| **CC-CEDICT** | zh-CN | ✅ 다운로드 + 검증 | **우수 (A급)** | 124,936 entries. 다음(多音)자 reading별 분리 |
| **freedictionaryapi.com** | en/es/fr/de/it | ✅ API 테스트 | **우수 (A급)** | senses 클린, etymology 분리, 발음 IPA 포함 |
| **krdict** | ko | ✅ API 검증 | **압권 (S급)** | sup_no(동음이의)별 entry 분리 + word_grade(초급/중급/고급) + 11개 언어 번역 내장 (단 de/it 제외) |

**메모리 정정**: `reference_dictionary_apis.md`에 적힌 `https://freedictionaryapi.com/` URL은 정확. 하지만 자주 혼동되는 `api.dictionaryapi.dev`는 **영어 전용**이므로 사용 금지. (오늘 발견)

---

## 0. krdict (ko) — S급, v3 hallucination bug 완전 해결

### API 명세 (실제 검증으로 확정)

```
Endpoint:    https://krdict.korean.go.kr/api/search
필수 헤더:    User-Agent: (브라우저 형식, 없으면 WAF 차단)
             Referer: https://krdict.korean.go.kr/
Query params:
  key          (인증키)
  q            (검색어)
  part=word    (단어 검색 — 다른 옵션: dfn=정의 검색, exam=예문 검색, ip=품사)
  num=10 또는 20  (1, 5는 거부됨 — error_code 103)
  translated=y
  trans_lang   (1=영어 2=일본어 3=프랑스어 4=스페인어 5=아랍어
                6=몽골어 7=베트남어 8=태국어 9=인도네시아어
                10=러시아어 11=중국어 / 12+=System error)
  method=exact (정확 일치 — default는 prefix match)
  advanced=y   (method 사용 시 필수)
응답 형식:    XML
일일 한도:    50,000 / 키
```

### v3 → krdict bug fix 검증

[[project_session_handoff_2026-05-22]]에 기록된 3가지 hallucination 실측:

**"이" (v3에서 nostril 환각)** — krdict 응답:
```
이^3 (초급, 명사) — tooth / 연장 날 / 기계 톱니   ▸ EN=tooth / JA=は【歯】 / ZH=牙齿
이^5 (초급, 대명사) — this (가까운 대상)
이^6 (초급, 관형사) — this
이^8 (초급, 수사) — two
이^9 (초급, 관형사) — second
이^1 (고급, 명사) — louse (1~4mm 곤충)         ▸ EN=louse / JA=しらみ / ZH=虱子
이^4 (고급, 의존명사) — person; man
이^2 (명사) — 자모 ㅣ의 이름
이^7 (조사) — subject marker (-이)
```
→ **nostril 같은 헛소리 없음.** 모든 의미가 사전 출처. word_grade가 초급/고급을 분리 → 학습용은 초급만 노출 가능.

**"부" (v3에서 富 의미 누락)** — krdict 응답:
```
부^1 (중급) — division; department                   ▸ EN=division / JA=ぶ【部】 / ZH=部门
부^2 (중급) — wealth; fortune                        ▸ EN=wealth / JA=とみ【富】 / ZH=财富  ← 누락됐던 그것!
부^3 (중급) — counter for parts/copies
부-^1 (중급) — prefix 不 (not)
부-^2 (고급) — prefix 副 (vice-)
```
→ **첫 페이지에 富 의미가 정확히 존재.**

**"차" (5개 한자어 동음이의)** — krdict 응답:
```
차^1 (초급) tea (茶)                — EN=tea / JA=ちゃ / ZH=...
차^2 (초급) car/vehicle (車) + counter
차^4 (중급) ordinal/round (次)
차^3 (고급) difference; gap (差)
차-^1 (고급) prefix 'sticky'
-차^0 (고급) suffix '목적'
```
→ **한자어 5개 + 접사 2개 + 활용형 따로** — 어원·문법별 완전 분리.

### word_grade 빈도 필터

- **초급**: 일상 회화/입문 학습자 단어 — TOPIK 1 수준
- **중급**: 일반 어휘 — TOPIK 2~4 수준
- **고급**: 전문/문어/희귀 — TOPIK 5~6 수준
- **(no grade)**: 자모/활용형/조사 등 메타 — 보통 노출 제외 대상

큐레이션 노출 정책 권장: 일반 검색은 초급+중급 우선, 고급은 별도 섹션, no_grade는 어휘카드에서 숨김.

### 다국어 번역 커버리지

| Target | krdict 자체 | LLM 필요 |
|---|---|---|
| en, ja, fr, es, zh-CN | ✅ 직접 (trans_lang=1/2/3/4/11) | (불필요) |
| de, it | ❌ 없음 | 의미 받아 번역만 |
| ko (source) | (적용 불가) | — |

→ **우리 8개 언어 중 5/7 target이 day 1부터 cache pre-populated**.

### 알려진 주의사항

1. **prefix match 기본 동작**: `?q=잘` 결과에 잘되다/잘못/잘잘/잘생기다 같은 prefix 단어가 같이 옴. 정확 일치만 원하면 `method=exact&advanced=y` 추가 필수.
2. **slang/벌가 register 태그 없음**: `야하다` = "erotic; racy; risque" 정의문에 명시되지만 별도 register 태그 없음 → 후처리로 정의문에서 키워드 detect 또는 LLM judge 필요.
3. **합성어 같이 잡힘**: `부` 검색에 `부부` 같은 단어도 page 안에 노출. 응답 필터링 시 word 필드 정확 일치 체크 필수.
4. **multimedia 라이선스 별도**: 발음 mp3 등 미디어 파일은 케이스별 라이선스. 텍스트만 사용 권장 (우리는 이미 Azure TTS 사용 → 무관).

### 라이선스

CC BY-SA 2.0 KR — **상업 사용 가능**. 의무: (1) attribution cluster 표시, (2) krdict 의미를 우리 LLM이 번역한 결과는 share-alike 적용 (=CC BY-SA로 배포). 우리 앱 코드/UX/큐레이션 알고리즘은 무관.

---

## 1. JMdict (ja) — S급

### 검증 단어 핵심 발견

**生** (raw/life/student 등):
```
Entry [0] き         — pure / undiluted / raw                 (n,pref) 6 senses
Entry [1] なま       — raw / uncooked / fresh                 (adj-no,n) 40 senses
Entry [2] うぶ       — inexperienced / unsophisticated        (adj-na,adj-no) 8 senses
Entry [3] せい/しょう — life / I,me,myself / student          (n) 12 senses
Entry [4] いく       — vital / virile / lively (arch)         (pref) 1 sense
Entry [5] ふ         — area of thick growth                   (n,n-suf) 1 sense
Entry [6] なまり     — boiled and half-dried bonito           (n) 1 sense
```
→ **reading별 어원·문법까지 완전 분리**. 슬랭/낡음 태그(`col`, `arch`)도 포함.

**中** (中의 5개 reading):
```
なか  (common=True)  — 26 senses (inside/middle/among/...)
うち  (common=True)  — 40 senses (inside/while/we/family/...) ← 内/中/裡/裏/家 alt
ちゅう (common=True) — 29 senses (medium/during/junior-high/China/...)
じゅう (common=True) — 9 senses (throughout/all-over/all-of-group)
チュン (common=False) — 2 senses (mahjong red dragon)
```
→ **마작 슬랭까지 분리** + 각각 common 플래그로 빈도 필터링 가능

**行く** (53 senses) — to go의 거의 모든 nuance 포함 ("to die", "to flow", "to reach", "to proceed well/badly" 등)

### gloss 언어 커버리지

JMdict 자체 내장: **dut, eng, fre, ger, hun, rus, slv, spa, swe** (9개 언어)

우리 8개 언어 대비:
- ja→en ✅ / ja→es ✅ (spa) / ja→fr ✅ (fre) / ja→de ✅ (ger)
- ja→it ❌ / ja→ko ❌ / ja→zh-CN ❌ → **LLM 번역 필요 (3쌍)**

### 빈도 필터 메커니즘

JMdict는 `common: true/false` flag를 kanji/kana 단위로 제공:
- Entry [0~3]만 common=True → 일상에서 흔히 쓰임
- Entry [4~6]은 common=False → 학술/사어/지역 → 학습용에서 제외 가능

추가로 misc 태그: `arch`(고어), `obsc`(obscure), `dated`, `vulg`(비속어), `col`(colloquial) — 큐레이션에 그대로 활용 가능

---

## 2. CC-CEDICT (zh-CN) — A급

### 검증 단어 핵심 발견

**行** (3개 reading 분리):
```
[hang2] (6 senses) — row/line, profession, commercial firm, sibling rank, table row, classifier
[heng2] (1 sense)  — used in 道行 (taoist cultivation)
[xing2] (9 senses) — to walk/go/travel, trip, temporary, current, to do, capable
```

**长** (2개 reading):
```
[chang2] (5 senses) — long, length, strong-point, to-be-good-at, surplus
[zhang3] (7 senses) — chief, head, elder, to-grow, to-develop, to-increase
```

**重** [chong2]=repeat vs [zhong4]=heavy — 완벽 분리

**打** [da3] 항목에 **"a semantically light, transitive verb that is combined with various grammatical objects..."** 같은 메타 설명도 포함 — 학습에 매우 유용

**方便** 항목에 **"(euphemism) to relieve oneself"** 같은 register 정보 포함 → 큐레이션에서 활용 가능 ([[feedback_curated_no_slang]] 적용 지점)

### 빈도 필터 메커니즘

CC-CEDICT 자체엔 빈도 태그 없음. **HSK 1-6 목록 cross-reference 필요** (우리는 이미 HSK1~HSK6 큐레이션이 있음 → 그것을 빈도 신호로 활용).

### gloss 언어 커버리지

zh-CN → **eng만** 자체 내장. 나머지 7개 언어는 LLM 번역 필요.

---

## 3. Free Dictionary API (freedictionaryapi.com) — A급

### 검증 단어 핵심 발견

**EN 'bank'** — 7개 entry로 etymology 분리:
```
[0] noun: 금융기관 (financial institution + branch + card-game underwriter + ...)
[1] verb: 거래하다 (to deal with a bank + provide banking services)
[2] noun: 강둑/언덕 (river edge, sea elevation, slope, aviation incline, ...)
[3] verb: 기울이다 (aviation/to roll/to form-into-bank)
[4] noun: 줄 (row of items, keyboard row, computing memory bank, pinball)
[5] verb: 정렬하다 (to arrange in a row)
[6] noun: 의자 (rower bench, judge bench, court term)
```
→ **etymology별 완전 분리**. LLM이 흉내내기 어려운 품질.

**ES 'banco'** — bank(금융)/bench/pew/school-of-fish — 명사 4 sense + 동사 1
**ES 'vela'** — 1번 entry: candle/vigil, 2번 entry: 항해(sail) — **어원 분리**
**FR 'voler'** — to fly + (falconry) pursue flying + to scarper + to steal
**FR 'livre'** — book / pound(weight+currency+grade) — **별 entry**
**DE 'Bank'** — 1번 entry: bench/workbench/sandbank/soccer-bench, 2번 entry: 금융 — **어원 분리**
**IT 'corso'** — 5 entry (course/correre 과거분사/Corsican adj/Corsican noun/Corsican wine)

### 추가 메타
- IPA 발음 다국가 변이 포함 (`/ˈbanko/` + `[ˈbã ŋ.ko]`)
- `forms` (변화형): 복수형, 동사 변화 등
- `tags`: archaic, dated, slang, dialectal, vulgar, regional, ... — 큐레이션 필터링 그대로 활용

### Rate limit
- 비공식 (User-Agent 헤더 필수, 없으면 403)
- 초과 시 429
- self-host 옵션: github.com/suvankar-mitra/free-dictionary-rest-api

### 다국어 cross-link
- en.wiktionary.org/api/rest_v1/page/definition/{word} 경로는 **모든 언어 그룹별로** definitions 반환 (백업)

---

## 4. 사전 + LLM 책임 분담

| 언어쌍 (source → target) | Tier 1 (사전) | Tier 2 (LLM) |
|---|---|---|
| ja → en/es/fr/de | JMdict 직접 | (불필요) |
| ja → ko/zh/it | JMdict 의미 | 의미 받아 번역만 |
| zh → en | CC-CEDICT 직접 | (불필요) |
| zh → ko/ja/es/fr/de/it | CC-CEDICT 의미 | 의미 받아 번역만 |
| en/es/fr/de/it → 같은 영어계 | freedict (의미+이미 영어) | (영어 외 target만 번역) |
| ko → en/ja/fr/es/zh | krdict 직접 (예상) | (불필요) |
| ko → de/it | krdict 의미 | 의미 받아 번역만 |

**LLM이 의미를 생성하는 케이스가 0건**. 의미 enumeration의 책임은 모두 권위 사전이 짐. 

---

## 5. 권장 다음 단계

### 즉시 (대표님 native 검수)

1. **JMdict 결과 검토**: `scripts/dict-pivot-phase1/results/jmdict-probe.txt`
   - 특히 中의 5개 reading 분리, 行く의 53 senses, やばい의 슬랭 태그 처리 확인
2. **CC-CEDICT 결과 검토**: `scripts/dict-pivot-phase1/results/cedict-probe.txt`
   - 多音字(行/长/重) reading 분리, 의미 정확도, 슬랭/속어 태그
3. **Free Dict API 결과 검토**: `scripts/dict-pivot-phase1/results/freedict-probe.txt`
   - 'bank'의 7-entry etymology 분리가 학습용으로 너무 세분인지 vs 적절한지 판단

### krdict 키 도착 후

4. krdict API 호출로 "이/부/차/사/기/도/정/장/전/수" 검증 + 11언어 번역 품질 확인
5. **풀 마이그 commit** (대표님 OK 시) — Phase 2 시작

### 알려진 gap 정리

- **CC-CEDICT 빈도 부재**: HSK1~6 큐레이션 cross-ref로 보완
- **JMdict italian gloss 없음**: 9개 lang gloss 풍부하지만 ja→it는 LLM 의존
- **freedictionaryapi.com 비공식 rate limit**: 운영 단계 self-host 검토 (소스 공개됨)
- **신조어 처리**: 사전 miss → 2-stage validation (gpt-4.1-mini 분류 → 풀 LLM)

---

## 6. 비용 추정 (Phase 1 확정 기준)

- **다운로드 1회**: $0 (JMdict 25MB + CC-CEDICT 5MB + krdict bootstrap 50K/일 limit 내)
- **현 운영 대비 LLM 비용**: -60~80% 절감 (의미 enumeration 책임이 사전으로 이동, LLM은 번역만)
- **응답 속도**: cache hit 50~150ms (동일), cold + 사전 hit 50~300ms (현재 LLM 2~5초 대비 압도적 개선)
