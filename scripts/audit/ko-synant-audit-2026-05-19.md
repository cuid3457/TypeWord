# KO SynAnt audit — 2026-05-19

Sample: 17 words designed to probe the 7 fabrication patterns from 5/18 TOPIK audit.
Model: gpt-4.1-mini. Target: en.

## `감사합니다` — case=set_expression

note: register: should reject 고맙다

**OLD** (generic SYN_ANT)
(empty)

**NEW** (case-routed KO SynAnt)
SKIPPED (case=set_expression routed to empty per shouldSkipKoSynAnt)

---

## `죄송합니다` — case=set_expression

note: register: should reject 미안하다

**OLD** (generic SYN_ANT)
syn: `미안합니다`

**NEW** (case-routed KO SynAnt)
SKIPPED (case=set_expression routed to empty per shouldSkipKoSynAnt)

---

## `너` — case=sino_monosyllable

note: register/peer: should reject 당신/자네; antonym=[]

**OLD** (generic SYN_ANT)
(empty)

**NEW** (case-routed KO SynAnt)
SKIPPED (case=sino_monosyllable routed to empty per shouldSkipKoSynAnt)

---

## `그것` — case=simple_word

note: peer: should reject 이것/저것 as antonym

**OLD** (generic SYN_ANT)
(empty)

**NEW** (case-routed KO SynAnt)
(empty)

---

## `여기` — case=simple_word

note: peer: should reject 거기/저기 as antonym

**OLD** (generic SYN_ANT)
syn: `이곳`, `이 자리`
ant: `저기`

**NEW** (case-routed KO SynAnt)
(empty)

---

## `손` — case=sino_monosyllable

note: part-whole: should reject 팔/주먹/손가락 as syn

**OLD** (generic SYN_ANT)
(empty)

**NEW** (case-routed KO SynAnt)
SKIPPED (case=sino_monosyllable routed to empty per shouldSkipKoSynAnt)

---

## `다리` — case=simple_word

note: part-whole: should reject 발/무릎 as syn

**OLD** (generic SYN_ANT)
(empty)

**NEW** (case-routed KO SynAnt)
(empty)

---

## `입` — case=sino_monosyllable

note: part-whole: should reject 입술/혀 as syn

**OLD** (generic SYN_ANT)
(empty)

**NEW** (case-routed KO SynAnt)
SKIPPED (case=sino_monosyllable routed to empty per shouldSkipKoSynAnt)

---

## `시계` — case=simple_word

note: hyponym: should reject 손목시계/벽시계

**OLD** (generic SYN_ANT)
(empty)

**NEW** (case-routed KO SynAnt)
(empty)

---

## `바지` — case=simple_word

note: hyponym: should reject 청바지/반바지

**OLD** (generic SYN_ANT)
syn: `팬츠`

**NEW** (case-routed KO SynAnt)
(empty)

---

## `안녕` — case=set_expression

note: loanword: should reject 하이

**OLD** (generic SYN_ANT)
syn: `안녕하세요`

**NEW** (case-routed KO SynAnt)
SKIPPED (case=set_expression routed to empty per shouldSkipKoSynAnt)

---

## `양말` — case=simple_word

note: loanword: should reject 삭스

**OLD** (generic SYN_ANT)
(empty)

**NEW** (case-routed KO SynAnt)
(empty)

---

## `방향` — case=simple_word

note: fabrication: should reject 이방향

**OLD** (generic SYN_ANT)
syn: `방위`, `쪽`

**NEW** (case-routed KO SynAnt)
(empty)

---

## `안경` — case=simple_word

note: fabrication: should reject 빛안경

**OLD** (generic SYN_ANT)
syn: `안경테`

**NEW** (case-routed KO SynAnt)
(empty)

---

## `얼굴` — case=simple_word

note: slang: should reject 얼짱

**OLD** (generic SYN_ANT)
(empty)

**NEW** (case-routed KO SynAnt)
(empty)

---

## `크다` — case=verb_adj_da

note: positive control: 작다 is legitimate ant

**OLD** (generic SYN_ANT)
syn: `거대하다`, `거창하다`
ant: `작다`

**NEW** (case-routed KO SynAnt)
syn: `거대하다`, `거창하다`
ant: `작다`

---

## `행복하다` — case=verb_adj_da

note: positive control: 슬프다 is legitimate ant

**OLD** (generic SYN_ANT)
syn: `기쁘다`, `즐겁다`
ant: `슬프다`, `불행하다`

**NEW** (case-routed KO SynAnt)
syn: `기쁘다`, `즐겁다`
ant: `슬프다`, `불행하다`

---
