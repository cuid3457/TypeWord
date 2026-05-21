# JA case-routing audit — 2026-05-19

Sample: 24 words × 6 cases. Model: gpt-4.1-mini. Target: ko.

Each entry shows OLD (current generic prompt) vs NEW (case-routed) side-by-side. Raw output — not metric-scored. Decide quality by reading.

## `42` — case=number_symbol

**OLD** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

headword: `42`

Meanings:
- [0] (数詞) 四十二  →  (수사) 사십이

Examples:
- [m=0] 彼は**42**歳で引退した。

<sub>tokens: in=7224 out=121</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

headword: `42`

Meanings:
- [0] (数詞) 四十二  →  (수사) 사십이

Examples:
- [m=0] 彼は**42**ページを読んだ。

<sub>tokens: in=3189 out=134</sub>

---

## `1984` — case=number_symbol

**OLD** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

headword: `1984`

Meanings:
- [0] (数詞) 千九百八十四  →  (수사) 천구백팔십사

Examples:
- [m=0] 彼は**1984**年に生まれました。

<sub>tokens: in=7229 out=131</sub>

**NEW** — meanings 2, examples 2, syn 0, ant 0 (syn/ant skipped)

headword: `1984`

Meanings:
- [0] (数詞) 千九百八十四  →  (수사) 천구백팔십사
- [1] (名詞) 小説  →  (명사) 소설

Examples:
- [m=0] 彼は**1984**年に生まれた。
- [m=1] ジョージ・オーウェルの**1984**は有名な小説だ。

<sub>tokens: in=3204 out=234</sub>

---

## `@` — case=number_symbol

**OLD** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

headword: `@`

Meanings:
- [0] (expression) アットマーク  →  (expression) 골뱅이

Examples:
- [m=0] メールアドレスに**@**を入れてください。

<sub>tokens: in=7170 out=123</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

note: `non_word`

headword: `@`

Meanings:
- [0] (記号) アットマーク  →  (기호) 골뱅이 기호

Examples:
- [m=0] メールアドレスに**@**を入れる。

<sub>tokens: in=3189 out=147</sub>

---

## `NHK` — case=number_symbol

**OLD** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

headword: `NHK`

Meanings:
- [0] (固有名詞) NHK, 放送局  →  (固有名詞) NHK, 방송국

Examples:
- [m=0] 昨日、**NHK**のニュースを見ました。

<sub>tokens: in=7165 out=134</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

headword: `NHK`

Meanings:
- [0] (固有名詞) 日本放送協会、放送局  →  (고유명사) 일본방송협회, 방송국

Examples:
- [m=0] 毎朝**NHK**のニュースを見ます。

<sub>tokens: in=3200 out=154</sub>

---

## `よろしくお願いします` — case=set_expression

**OLD** — meanings 0, examples 0, syn 0, ant 0

note: `sentence`

headword: `よろしくお願いします`

<sub>tokens: in=4185 out=48</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0

headword: `よろしくお願いします` [よろしくおねがいします]

Meanings:
- [0] (表現) 丁寧な依頼の挨拶  →  (표현) 정중한 부탁 인사(격식)

Examples:
- [m=0] 初めまして、どうぞ**よろしくお願いします**。

<sub>tokens: in=5367 out=172</sub>

---

## `いただきます` — case=set_expression

**OLD** — meanings 1, examples 1, syn 0, ant 0

headword: `いただきます` [いただきます]

Meanings:
- [0] (感嘆詞) 식사 전 인사  →  (감탄사) 잘 먹겠습니다, 인사말

Examples:
- [m=0] 食事の前にみんなで**いただきます**と言った。

<sub>tokens: in=8377 out=163</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0

headword: `いただきます` [いただきます]

Meanings:
- [0] (表現) 食事の前の挨拶  →  (표현) 식사 전 인사(격식)

Examples:
- [m=0] みんなでそろって**いただきます**と言った。

<sub>tokens: in=5366 out=176</sub>

---

## `ありがとう` — case=set_expression

**OLD** — meanings 1, examples 1, syn 0, ant 0

headword: `ありがとう`

Meanings:
- [0] (感嘆詞) 感謝, お礼  →  (感嘆詞) 고마움, 감사

Examples:
- [m=0] プレゼントをもらって、**ありがとう**と言った。

<sub>tokens: in=8373 out=159</sub>

**NEW** — meanings 1, examples 1, syn 1, ant 0

headword: `ありがとう`

Meanings:
- [0] (表現) 감사의 인사  →  (표현) 고마워

Examples:
- [m=0] 友達に**ありがとう**と言った。

syn: `どうも`

<sub>tokens: in=5350 out=146</sub>

---

## `お疲れ様です` — case=set_expression

**OLD** — meanings 1, examples 1, syn 0, ant 0

headword: `お疲れ様です`

Meanings:
- [0] (表現) 수고, 인사말  →  (表現) 수고하셨습니다, 수고했어요

Examples:
- [m=0] 仕事が終わったら、みんなに**お疲れ様です**と言います。

<sub>tokens: in=8381 out=176</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0

headword: `お疲れ様です` [おつかれさまです]

Meanings:
- [0] (表現) 労いの挨拶  →  (표현) 수고하셨습니다(격식)

Examples:
- [m=0] 会議の後、彼は**お疲れ様です**と声をかけた。

<sub>tokens: in=5370 out=190</sub>

---

## `食べる` — case=verb_adj

**OLD** — meanings 1, examples 1, syn 2, ant 0

headword: `食べる` [たべる]

Meanings:
- [0] (動詞) 食事  →  (동사) 먹다

Examples:
- [m=0] 朝ごはんにパンを**食べる**。

syn: `いただく`, `食す`

<sub>tokens: in=8367 out=163</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0

headword: `食べる` [たべる]

Meanings:
- [0] (動詞) 食べる  →  (동사) 먹다

Examples:
- [m=0] 子どもたちはりんごを**食べます**。

<sub>tokens: in=6799 out=165</sub>

---

## `美しい` — case=verb_adj

**OLD** — meanings 1, examples 1, syn 2, ant 1

headword: `美しい` [うつくしい]

Meanings:
- [0] (形容詞) 美しい  →  (形容詞) 아름다운

Examples:
- [m=0] 彼女の笑顔はとても**美しい**です。

syn: `綺麗`, `麗しい`
ant: `醜い`

<sub>tokens: in=8366 out=164</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 1

headword: `美しい` [うつくしい]

Meanings:
- [0] (形容詞) 美しい  →  (형용사) 아름답다

Examples:
- [m=0] この庭の花がとても**美しい**です。

syn: `綺麗`, `麗しい`
ant: `醜い`

<sub>tokens: in=6796 out=177</sub>

---

## `する` — case=verb_adj

**OLD** — meanings 1, examples 1, syn 0, ant 0

headword: `する`

Meanings:
- [0] (動詞) 行う  →  (동사) 하다

Examples:
- [m=0] 彼は毎朝ジョギングを**する**。

<sub>tokens: in=8361 out=147</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0

headword: `する`

Meanings:
- [0] (動詞) する  →  (동사) 하다

Examples:
- [m=0] 毎朝ジョギングを**します**。

<sub>tokens: in=6791 out=144</sub>

---

## `見る` — case=verb_adj

**OLD** — meanings 1, examples 1, syn 2, ant 0

headword: `見る` [みる]

Meanings:
- [0] (動詞) 보다, 관찰하다  →  (동사) 보다, 관찰하다

Examples:
- [m=0] 私は空を**見る**のが好きです。

syn: `観る`, `眺める`

<sub>tokens: in=8367 out=162</sub>

**NEW** — meanings 2, examples 2, syn 2, ant 0

headword: `見る` [みる]

Meanings:
- [0] (動詞) 見る  →  (동사) 보다
- [1] (動詞) 世話をする  →  (동사) 돌보다

Examples:
- [m=0] 子どもたちが映画を**見ます**。
- [m=1] 彼は祖母の世話を**見ました**。

syn: `観る`, `眺める`

<sub>tokens: in=6817 out=249</sub>

---

## `コーヒー` — case=katakana_only

**OLD** — meanings 1, examples 1, syn 0, ant 0

headword: `コーヒー` [こーひー]

Meanings:
- [0] (名詞) コーヒー  →  (名詞) 커피

Examples:
- [m=0] 朝はいつも**コーヒー**を飲みます。

<sub>tokens: in=8374 out=173</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0

headword: `コーヒー`

Meanings:
- [0] (名詞) コーヒー  →  (명사) 커피

Examples:
- [m=0] 朝に**コーヒー**を飲みます。

<sub>tokens: in=5687 out=157</sub>

---

## `マンション` — case=katakana_only

**OLD** — meanings 1, examples 1, syn 1, ant 0

headword: `マンション` [まんしょん]

Meanings:
- [0] (名詞) アパート, マンション  →  (名詞) 아파트, 맨션

Examples:
- [m=0] 新しい**マンション**に引っ越しました。

syn: `アパート`

<sub>tokens: in=8374 out=178</sub>

**NEW** — meanings 1, examples 1, syn 1, ant 0

headword: `マンション`

Meanings:
- [0] (名詞) 高層アパートメント、分譲集合住宅  →  (명사) 고층 아파트, 콘도미니엄

Examples:
- [m=0] 友達が新しい**マンション**に引っ越しました。

syn: `アパート`

<sub>tokens: in=5699 out=176</sub>

---

## `クレーム` — case=katakana_only

**OLD** — meanings 1, examples 1, syn 2, ant 0

headword: `クレーム` [くれーむ]

Meanings:
- [0] (名詞) 不満, 苦情  →  (名詞) 불만, 항의

Examples:
- [m=0] お客様から**クレーム**が来たので対応しています。

syn: `苦情`, `不満`

<sub>tokens: in=8375 out=166</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 0

headword: `クレーム`

Meanings:
- [0] (名詞) 苦情, 抗議  →  (명사) 불만, 항의

Examples:
- [m=0] お客様が**クレーム**を言いました。

syn: `苦情`, `抗議`

<sub>tokens: in=5690 out=166</sub>

---

## `アメリカ` — case=katakana_only

**OLD** — meanings 1, examples 1, syn 0, ant 0

headword: `アメリカ` [あめりか]

Meanings:
- [0] (固有名詞) アメリカ, 大陸  →  (固有名詞) 아메리카, 대륙

Examples:
- [m=0] 夏休みに**アメリカ**へ旅行に行きました。

<sub>tokens: in=8381 out=184</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0

headword: `アメリカ`

Meanings:
- [0] (固有名詞) アメリカ合衆国  →  (고유명사) 미국

Examples:
- [m=0] 来年、**アメリカ**へ旅行します。

<sub>tokens: in=5694 out=161</sub>

---

## `水` — case=single_kanji

**OLD** — meanings 1, examples 1, syn 0, ant 0

headword: `水` [みず]

Meanings:
- [0] (名詞) 물  →  (名詞) 물

Examples:
- [m=0] 夏は**水**をたくさん飲みます。

<sub>tokens: in=8359 out=155</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0

headword: `水` [みず]

Meanings:
- [0] (名詞) 水  →  (명사) 물

Examples:
- [m=0] 暑い日には**水**を飲みます。

<sub>tokens: in=5948 out=149</sub>

---

## `月` — case=single_kanji

**OLD** — meanings 2, examples 2, syn 0, ant 0

headword: `月` [つき]

Meanings:
- [0] (名詞) 月, 天体  →  (명사) 달
- [1] (名詞) 月, 月間  →  (명사) 월

Examples:
- [m=0] 今夜は**月**がとても明るいです。
- [m=1] 彼は来月の**月**末に旅行します。

<sub>tokens: in=8389 out=227</sub>

**NEW** — meanings 2, examples 2, syn 0, ant 0

headword: `月` [つき, がつ]

Meanings:
- [0] (名詞) 月  →  (명사) 달
- [1] (名詞) 月(カレンダーの単位)  →  (명사) 달(월)

Examples:
- [m=0] 夜空に**月**が輝いています。
- [m=1] 来週の**月**は忙しいです。

<sub>tokens: in=5980 out=225</sub>

---

## `人` — case=single_kanji

**OLD** — meanings 1, examples 1, syn 0, ant 0

headword: `人` [ひと]

Meanings:
- [0] (名詞) 人  →  (名詞) 사람

Examples:
- [m=0] 駅にたくさんの**人**がいます。

<sub>tokens: in=8359 out=154</sub>

**NEW** — meanings 2, examples 2, syn 0, ant 0

headword: `人` [ひと, にん]

Meanings:
- [0] (名詞) 人  →  (명사) 사람
- [1] (名詞) 人数  →  (명사) 사람 수, 인원

Examples:
- [m=0] 公園に**人**がたくさんいます。
- [m=1] 明日は五**人**で食事に行きます。

<sub>tokens: in=5968 out=225</sub>

---

## `一` — case=single_kanji

**OLD** — meanings 1, examples 1, syn 0, ant 0

headword: `一` [いち]

Meanings:
- [0] (名詞) 数字の1  →  (명사) 일

Examples:
- [m=0] 時計の針が**一**時を指している。

<sub>tokens: in=8365 out=158</sub>

**NEW** — meanings 2, examples 1, syn 0, ant 0

headword: `一` [いち, ひと]

Meanings:
- [0] (数詞) 一  →  (수사) 일
- [1] (数詞) 一つ  →  (수사) 하나

Examples:
- [m=0] **一** 時に会いましょう。

<sub>tokens: in=5968 out=187</sub>

---

## `日本語` — case=simple_word

**OLD** — meanings 1, examples 1, syn 0, ant 0

headword: `日本語` [にほんご]

Meanings:
- [0] (名詞) 日本の言語  →  (명사) 일본어

Examples:
- [m=0] 彼は**日本語**を勉強しています。

<sub>tokens: in=8368 out=156</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0

headword: `日本語` [にほんご]

Meanings:
- [0] (名詞) 日本の言語  →  (명사) 일본어

Examples:
- [m=0] 花子は**日本語**を毎日勉強します。

<sub>tokens: in=6078 out=160</sub>

---

## `学校` — case=simple_word

**OLD** — meanings 1, examples 1, syn 0, ant 0

headword: `学校` [がっこう]

Meanings:
- [0] (名詞) 学校  →  (명사) 학교

Examples:
- [m=0] 毎朝、**学校**へ歩いて行きます。

<sub>tokens: in=8361 out=156</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0

headword: `学校` [がっこう]

Meanings:
- [0] (名詞) 学校  →  (명사) 학교

Examples:
- [m=0] 子どもたちは**学校**で遊びます。

<sub>tokens: in=6071 out=156</sub>

---

## `元気` — case=simple_word

**OLD** — meanings 2, examples 2, syn 2, ant 2

headword: `元気` [げんき]

Meanings:
- [0] (名詞) 健康, 活力  →  (名詞) 건강, 활기
- [1] (形容詞) 健康な, 活発な  →  (形容詞) 건강한, 활기찬

Examples:
- [m=0] 子供たちの**元気**が公園にあふれている。
- [m=1] 田中さんはいつも**元気**で明るいです。

syn: `健康`, `活力`
ant: `不健康`, `病気`

<sub>tokens: in=8406 out=294</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 0

headword: `元気` [げんき]

Meanings:
- [0] (名詞) 健康, 活力  →  (명사) 건강, 활기

Examples:
- [m=0] 子どもたちはみんな**元気**です。

syn: `健康`, `活力`

<sub>tokens: in=6082 out=171</sub>

---

## `お茶` — case=simple_word

**OLD** — meanings 1, examples 1, syn 0, ant 0

headword: `お茶` [おちゃ]

Meanings:
- [0] (名詞) 茶  →  (명사) 차

Examples:
- [m=0] 午後に**お茶**を飲んで休みます。

<sub>tokens: in=8364 out=145</sub>

**NEW** — meanings 1, examples 1, syn 1, ant 0

headword: `お茶` [おちゃ]

Meanings:
- [0] (名詞) 茶  →  (명사) 차

Examples:
- [m=0] 朝はいつも**お茶**を飲みます。

syn: `茶`

<sub>tokens: in=6074 out=159</sub>

---

## Token totals

- OLD: in=192040, out=3837
- NEW: in=132377, out=4180
- delta: in=-59663 (-31.1%), out=343 (8.9%)