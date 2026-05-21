# Manual Audit Findings — Curated Wordlists

**Status:** Read-through complete (12 files, ~27,500 lines). Below are systematic patterns + file-specific critical errors.

---

## 🔴 CRITICAL SYSTEMIC ISSUES (highest priority for fix)

### 1. AWL: target language leakage (Spanish/French in en→en pairs)
Multiple AWL entries output **Spanish or French translations** in the [en] (en→en target) column where the right-hand side should be English:

**AWL part-1 affected words** (Spanish unless noted):
- `approach` (e1/e2/e3), `factor` (e1/e2/e3), `require` (e1/e2)
- `affect`, `conduct` (Spanish), `credit`, `impact`, `positive`, `reside` (French), `select` (French)
- `despite`, `justify`, `consent`, `status`, `summary`, `physical`, `task` (French)
- `constrain` (French), `conflict` (French), `confer`

**AWL part-2 affected words:**
- `accurate` (Spanish e1/e2/e3), `expertise` (Spanish e1/e2/e3)
- `incidence` (Spanish in **meanings** field — "ocurrencia, frecuencia[noun] | ángulo de incidencia[noun]")
- `lecture` (Spanish meanings AND examples), `highlight` (Spanish), `persist` (French)
- `supplement` (French), `convince` (Spanish), `revolution` (Spanish meanings + examples)
- `incline` (Spanish meanings), `invoke` (Spanish)

**Fix:** Re-curate all flagged AWL entries with strict en→en enforcement. Validation should reject any non-English on right side of `||` for [en] entries.

### 2. Lecture, cookie, marbre, bon marché, coutume — wrong primary meaning (false friends)
- **`lecture` (DELF B1 part-2)**: 강의 (Korean meaning) is WRONG. French "lecture" = "reading", not "lecture/conference". Examples reinforce wrong meaning.
- **`cookie` (DELF B1 part-3)**: Only food meaning given (쿠키, 비스킷); MISSING tech/browser cookie meaning despite being in cybersecurity wordlist context.
- **`marbre` (DELF B1 part-4)**: Second meaning "몸의 근육" is wrong; "comme du marbre" only means "firm-like-marble", not "muscle".
- **`bon marché` (DELF A2-2)**: Second meaning "시장[명사]" wrong (conflated with bare "marché"). Examples reinforce wrong sense.
- **`coutume` (DELF A2-2)**: Second meaning "세관[명사]" wrong. Coutume never means customs office (that's "douane"). False-friend with English "customs".
- **`COP` (DELF B1 part-3)**: Means "Conference of the Parties (UN climate)", but glossed as "중앙아프리카 프랑[명사]" (CFA franc). Wrong domain — entry is in environmental wordlist.
- **`tube` (DELF B1 part-2)**: Second meaning "튜브(텔레비전 수상기)" — that's English slang ("boob tube"), not French.

### 3. Lemma / headword mismatches (verb-form vs. noun confusion)
- **`post` (DELF B1 part-3) e1**: French sentence uses **"poteau"** (post/pillar) instead of headword **"post"** (social media post). Headword totally absent.
- **`cru`** (DELF A2-1): Mixes noun "vintage" sense with verb "cru" (past participle of croire). Examples flip between senses.
- **`concéder` (DELF B1 part-4) e2**: Uses "Je conçois" (concevoir) instead of concéder. Different verb entirely.
- **`joue`** (DELF A2-1): Mixes noun "cheek" with verb "joue" (jouer conjugated) under same headword.
- **`mollet`** (DELF A2-1): Conflates noun "calf (body)" with adjective "soft" — different lemmas.

### 4. Korean SOV violations (verb-object reversed)
Pattern persists across all wordlists with Korean target. Examples:
- HSK-1: `看 e1` "노을을 **본다** 좋아한다" / `吃 e1` "**먹자** 저녁을"
- HSK-2: similar pattern
- DELF A2-1: `cuit e1` "**익었다** 완벽하게" / `rôtir e1` "**굽겠다** 닭을"
- DELF A2-2: `il y a e1` "있다 정원이" / `d'après e1` "그 **따르면** 신문에"
- DELF B1-2: `s'inspirer e1` "**영감을 얻는다** 자신의 그림에"
- DELF B1-4: `bloquer e1` "수문수가 **막았다** 공을"
- AWL part-2: `collapse e3` "거의 **쓰러졌다** 피로로 인해"

### 5. French elision violations in source (le/la/de + vowel)
- DELF A2-1: "La étoile" (étoile e1), "Le ascenseur" (ascenseur e1), "La étagère"
- DELF A2-2: "Le vieux arbre" (should be "vieil arbre"), "Ne oublie" (oublier)
- DELF A2-1: "Je éternue", "Je épluche", "Elle a décidé de **arrêter**"
- DELF B1-1: "L' actualité" with curly apostrophe issues
- DELF B1-2: cosmetic curly vs. straight apostrophes throughout (escalier examples)

### 6. Wrong synonyms / antonyms
- **Antonym listed as synonym** (critical):
  - `tutoyer` (DELF A2-2) syn includes "vouvoyer" (opposite!)
  - `vouvoyer` (DELF A2-2) syn includes "tutoyer" (opposite!)
  - `raccrocher` (DELF A2-2) syn includes "décrocher" (opposite!)
  - `partout` (DELF A2-2/B1) syn includes "partiellement" (opposite!)
  - `ensuite` (DELF A2-1) e2 treats it as a noun — broken French
- **Self-synonym with parens**: `mensuel(le)`, `interviewé(e)`, `interviewer (verbe)` — headword variant listed as syn
- **Wrong-language syn**: many AWL/DELF entries include English words ("booking", "round-trip", "comic", "loan", "masterpiece", "ugliness", "rom-com", "communauté"-→"community" mixups)
- **Made-up French**: `voter` syn "suffrager, électoraliser" (neither word exists), `embûche` syn "trarpa", `industriel` syn "usinal"

### 7. Marker (** **) issues
- **Marker on Korean particle**: `페미니즘은`, `작곡가가`, `종속절은`, `학생 수가` — marker includes 은/가 postposition
- **Marker on compound part**: 都 (HSK-1) marked inside 都市 / 大都市; 个 marked in 个子; 본 marked in 본질; 속도 inside 고속도로
- **Headword missing from sentence**: `compositrice e1` Korean only marks "작곡가가" but not the feminine; `dispose e1` (AWL-1) French uses "dispose" but Korean unmarked
- **Marker on different word than headword**: dozens of cases where Korean marks a related word (e.g., 변환 instead of 변형)

### 8. Marker translation mismatches (false meaning)
- HSK-1 `那 e1` "**那**是我的朋友" → "**저**는 나의 친구" (那=that, 저=I — wrong)
- DELF A2-1 `quatre/cinq cents` (numerals) — Korean numbers off
- DELF A2-1 `presque (ko) e2` "il est **presque** midi" → "그는 **거의** 정오예요" (그 = he, but "il" is impersonal)
- DELF A2-1 `vague (ko) e3` "vague de chaleur" → "**더위가**" (lost wave-of meaning)
- DELF A2-2 `souris (ko) syn` lists unrelated rodent species

### 9. Korean translation typos / awkwardness
- `depuis (ko) e2` "아팩니다" (typo for 아픕니다)
- `mollet (ko) e1` "야**양**" (extra 야 character)
- `clair (ko) e2` "물샘" (non-standard for "spring/source")
- `escalier` Korean uses curly apostrophe consistently
- `comédie` "코메디" should be "코미디"
- `bouleverser e3` "혼란시키었다" should be "혼란시켰다"
- `humble e2` "**천한** 집" — "천한" carries class-base connotation but humble in French = simple/modest
- `amertume` "쓴슬픔" non-standard compound

### 10. IPA errors / typos
- `xénophobie` (B1-1): "ɡze.nɔ.fɔ.bi" should be "kse.nɔ.fɔ.bi"
- `bitcoin` (B1-3): "biktwɛ̃" wrong
- `pollution` (A2-2): "pɔ.li.sjɔ̃" should be "pɔlysjɔ̃"
- `recycler` (A2-2): "ʁəsikliː" non-standard ː
- `parfaitement` (A2-2): "paʁ.fɛkt.mɑ̃" should be "paʁ.fɛt.mɑ̃"
- `cliquer`, `oublier`, `quoique` (kɔk wrong), `informaticien`, `programmation` — IPA issues
- `tableau` (AWL): used Cyrillic "о" (cosmetic)

---

## 🟡 PER-FILE NOTABLE ISSUES

### HSK-1
- 二 used in "二个苹果" (should be 两); 多 used as "많은" without 很; 个 missing 一
- Translation/sense mismatches: 那→저, 不客气→거만하지 않음, 几→新的几
- ~25-30% issue rate (15+ critical, 8+ awkward in first 70 read)

### HSK-2
- Similar patterns to HSK-1
- Pinyin/measure word issues continue

### DELF A1 part-1
- French verb conjugation issues
- Korean particle/marker placement inconsistent

### DELF A1 part-2
- `porter (en) e3`: used "portier" instead of porter (lemma error)
- `étoile (en) e1`: "La étoile" elision violation
- `chanter (ko) syn`: "cantesse, chanterie" (non-existent French words)
- Korean SOV violations in porter/jouer entries

### DELF A2 part-1 (300 words)
- 13+ critical: SOV broken, elision, lemma confusion (cru, joue, mollet)
- Wrong meanings: cave="warning" (NOT a French meaning), pizza="음식" (too generic)
- Spanish syn lists in `quatre`/`fou`r entries (legacy from earlier audit)
- Multi-word marker on compound: `talon` vs 굽 (마커 inside word)

### DELF A2 part-2 (300 words, ko-only)
- `coutume` 세관 / `bon marché` 시장 / `gratuit` 불필요한 — wrong second meanings
- `tutoyer ↔ vouvoyer` and `raccrocher ↔ décrocher` listed as synonyms (they're opposites)
- `presque e2` "il" → "그" wrong gender/person
- `vague e3` lost "wave" sense
- Many Korean SOV/marker issues throughout

### DELF B1 part-1 (Politics/Economy, 300 words)
- `ministre e2` "성직자" + Catholic mass — wrong (mass is celebrated by prêtre, not ministre)
- `voter` synonyms made up ("suffrager", "électoraliser")
- `industrie` Korean examples broken word order: "산업 자동차" instead of "자동차 산업"
- `pension` second meaning "연차수당" wrong
- `taxe e3` marker on 지방세 inside compound

### DELF B1 part-2 (Literature/Arts, 300 words)
- `lecture` ENTIRELY wrong primary meaning (강의 instead of 읽기)
- `tube` wrong secondary meaning (boob tube — English slang)
- `marbre` wrong secondary meaning (muscle)
- `single` completely broken: meanings only cover 독신자, examples nonsensical ("un single jardinier")
- `bande dessinée` syn includes English/Italian (comic, fumetti, strip)
- `chef-d'œuvre` syn "masterpiece" (English)
- `vers` missing "verse, line of poetry" meaning
- `Académie française` marker only on partial Korean translation
- `nouvelle` missing "novella" + "new (fem)" meanings

### DELF B1 part-3 (Environment/Tech/Media, 300 words)
- `COP` totally wrong (currency vs. climate conference)
- `cookie` only food meaning, no tech meaning
- `post` headword mismatch (uses "poteau" in example)
- `composter e1` "찍으세요" doesn't match headword
- `correspondant e2` "**상응하는 것**이 있어요" awkward Korean
- `coutume` already covered

### DELF B1 part-4 (Emotions/Reflection, 300 words)
- `méditer e1` "Chaque matin, je **méditer**" — infinitive instead of conjugated form
- `concéder e2` uses concevoir conjugation (different verb entirely)
- `compatir e1` "Je compatirs" typo
- `haïr e2` "Je haïs" wrong conjugation
- `las e1` "Elle est **las**" should be "lasse" (gender agreement)
- `humble e2` "천한" carries class-base meaning, mismatch with humble=modest
- `amertume` "쓴슬픔" non-standard Korean
- Korean SOV issues continue (tenace, bouleverser)

### AWL part-1 (300 words, en→en,ko)
- ~15+ entries with Spanish/French target language (see Critical #1)
- Many "en" examples have identical L/R English (by design but redundant)
- Generally cleaner than DELF on synonym/IPA fronts but suffers from target-language leakage

### AWL part-2 (270 words, en→en,ko)
- `accurate`, `expertise`, `incidence`, `lecture`, `highlight`, `convince`, `persist`, `revolution`, `supplement`, `incline`, `invoke` — all Spanish/French target leakage
- `incidence` even has Spanish in **meanings** field — most severe
- Otherwise cleanest of the 12 files

---

## 📊 TOTAL ESTIMATED ISSUE COUNTS

- **Critical (semantic/grammar/wrong meaning)**: ~150–200 across all 12 files
- **Awkward (acceptable but suboptimal)**: ~300+
- **Marker placement (Korean particle inside, compound break)**: ~80+
- **Synonym wrong-language/antonym/made-up**: ~60+
- **IPA typos**: ~30+
- **Spanish/French target-language leakage (AWL-specific)**: ~30 entries

## 🎯 Recommended fix strategy
1. **AWL target-language fix** — strict en-only validation in prompt; re-curate ~30 entries
2. **False-friend fix list** — manually patch lecture, cookie, marbre, bon marché, coutume, COP, tube
3. **Lemma-collision fix** — flag headwords where conjugated forms or different lexemes appear (post, cru, joue, concéder, méditer, compatir, haïr, las)
4. **Korean SOV pass** — automated detector for sentences where Korean ends with 한국어 verb followed by remaining content (multi-word post-verb)
5. **Synonym opposite check** — automated detection for headwords whose syn list includes any antonym from a known opposite-pair table (tutoyer/vouvoyer, raccrocher/décrocher, etc.)
6. **Synonym language check** — reject English words in French syn lists, French in English, etc.
7. **IPA validation** — check for non-standard characters, misplaced length marks, wrong vowels
8. **Marker-on-particle check** — detect ** wrapping Korean particles 은/는/이/가/을/를/의

