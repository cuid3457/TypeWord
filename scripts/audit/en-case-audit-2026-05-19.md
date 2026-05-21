# EN case-routing audit — 2026-05-19

Sample: 20 words × 4 cases. Model: gpt-4.1-mini. Target: ko.

Each entry shows OLD (current generic prompt) vs NEW (case-routed) side-by-side. Raw output — not metric-scored. Decide quality by reading.

## `run` — case=simple_word

**OLD** — meanings 3, examples 3, syn 2, ant 2

Meanings:
- [0] (verb) move fast on foot  →  (verb) 달리다, 뛰다
- [1] (noun) period of operation  →  (noun) 운영, 경영
- [2] (noun) flow, stream  →  (noun) 흐름, 유동

Examples:
- [m=0] She **runs** every morning to stay healthy.
- [m=1] The machine had a long **run** without stopping.
- [m=2] The river **runs** through the green valley.

syn: `sprint`, `jog`
ant: `walk`, `stop`

<sub>tokens: in=8386 out=314</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 0

Meanings:
- [0] (verb) move fast on feet  →  (동사) 달리다, 운영하다

Examples:
- [m=0] The children **run** quickly to catch the bus.

syn: `sprint`, `jog`

<sub>tokens: in=4738 out=161</sub>

---

## `happy` — case=simple_word

**OLD** — meanings 1, examples 1, syn 2, ant 2

Meanings:
- [0] (adjective) joyful, content  →  (adjective) 행복한, 기쁜

Examples:
- [m=0] She felt **happy** after hearing the good news.

syn: `joyful`, `content`
ant: `sad`, `unhappy`

<sub>tokens: in=8346 out=168</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 1

Meanings:
- [0] (adjective) feeling or showing pleasure  →  (형용사) 행복한, 기쁜

Examples:
- [m=0] The children were **happy** playing in the park all afternoon.

syn: `joyful`, `content`
ant: `sad`

<sub>tokens: in=4740 out=175</sub>

---

## `book` — case=simple_word

**OLD** — meanings 2, examples 2, syn 2, ant 0

Meanings:
- [0] (noun) printed work  →  (noun) 책
- [1] (verb) reserve, arrange  →  (verb) 예약하다, 예약

Examples:
- [m=0] She borrowed a **book** from the library yesterday.
- [m=1] We need to **book** a table for dinner tonight.

syn: `reserve`, `schedule`

<sub>tokens: in=8362 out=214</sub>

**NEW** — meanings 2, examples 2, syn 0, ant 0

Meanings:
- [0] (noun) printed work, volume  →  (명사) 책
- [1] (verb) reserve, arrange, schedule  →  (동사) 예약하다, 잡다

Examples:
- [m=0] She borrowed a **book** about ancient history from the library.
- [m=1] Our team **booked** the conference room for tomorrow afternoon.

<sub>tokens: in=4762 out=231</sub>

---

## `give` — case=simple_word

**OLD** — meanings 1, examples 1, syn 3, ant 2

Meanings:
- [0] (verb) to present voluntarily  →  (verb) 주다, 제공하다

Examples:
- [m=0] She **gave** him a gift for his birthday.

syn: `grant`, `offer`, `bestow`
ant: `take`, `withhold`

<sub>tokens: in=8344 out=160</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 1

Meanings:
- [0] (verb) to present or offer  →  (동사) 주다, 제공하다

Examples:
- [m=0] She **gave** her friend a thoughtful birthday gift.

syn: `offer`, `present`
ant: `take`

<sub>tokens: in=4738 out=161</sub>

---

## `beautiful` — case=simple_word

**OLD** — meanings 1, examples 1, syn 2, ant 1

Meanings:
- [0] (adjective) pleasing, attractive  →  (adjective) 아름다운

Examples:
- [m=0] She wore a **beautiful** dress to the party.

syn: `attractive`, `pretty`
ant: `ugly`

<sub>tokens: in=8346 out=153</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 1

Meanings:
- [0] (adjective) pleasing to the senses  →  (형용사) 아름다운, 예쁜

Examples:
- [m=0] The garden looks **beautiful** in the morning light.

syn: `lovely`, `attractive`
ant: `ugly`

<sub>tokens: in=4740 out=173</sub>

---

## `look up` — case=set_expression

**OLD** — meanings 2, examples 2, syn 2, ant 2

Meanings:
- [0] (verb) search for information  →  (verb) 찾다, 조회하다
- [1] (verb) improve, get better  →  (verb) 호전되다, 좋아지다

Examples:
- [m=0] She **looked up** the word in the dictionary.
- [m=1] The weather will **look up** after the storm.

syn: `search`, `consult`
ant: `deteriorate`, `worsen`

<sub>tokens: in=8369 out=243</sub>

**NEW** — meanings 2, examples 2, syn 2, ant 1

Meanings:
- [0] (verb) to search for information  →  (동사) 찾아보다
- [1] (verb) to improve, get better  →  (동사) 좋아지다, 개선되다

Examples:
- [m=0] She **looked up** the train schedule before leaving the house.
- [m=1] Things finally **looked up** after he found a new job last month.

syn: `search`, `consult`
ant: `decline`

<sub>tokens: in=4750 out=256</sub>

---

## `give in` — case=set_expression

**OLD** — meanings 1, examples 1, syn 2, ant 2

Meanings:
- [0] (phrasal verb) yield, surrender  →  (phrasal verb) 굴복하다, 양보하다

Examples:
- [m=0] After hours of debate, he finally **gave in** to their demands.

syn: `yield`, `surrender`
ant: `resist`, `withhold`

<sub>tokens: in=8353 out=176</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 2

Meanings:
- [0] (verb) to surrender, yield  →  (동사) 항복하다, 굴복하다

Examples:
- [m=0] After hours of arguing, he finally **gave in** and accepted their terms.

syn: `yield`, `surrender`
ant: `resist`, `withstand`

<sub>tokens: in=4726 out=174</sub>

---

## `ice cream` — case=set_expression

**OLD** — meanings 1, examples 1, syn 0, ant 0

Meanings:
- [0] (noun) frozen sweet dessert  →  (noun) 아이스크림

Examples:
- [m=0] We bought **ice cream** to enjoy on a hot day.

<sub>tokens: in=8347 out=146</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0

Meanings:
- [0] (noun) frozen sweet dessert  →  (명사) 아이스크림

Examples:
- [m=0] She bought a cone of **ice cream** to enjoy on the hot summer day.

<sub>tokens: in=4724 out=158</sub>

---

## `kick the bucket` — case=set_expression

**OLD** — meanings 0, examples 0, syn 0, ant 0

note: `sentence`

<sub>tokens: in=4169 out=50</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 0

Meanings:
- [0] (expression) to die  →  (표현) 죽다(속어)

Examples:
- [m=0] Everyone was shocked when the old man **kicked the bucket** last night.

syn: `pass away`, `die`

<sub>tokens: in=4725 out=164</sub>

---

## `as soon as possible` — case=set_expression

**OLD** — meanings 0, examples 0, syn 0, ant 0

note: `sentence`

<sub>tokens: in=4170 out=52</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 0

Meanings:
- [0] (expression) without delay, immediately  →  (표현) 가능한 한 빨리

Examples:
- [m=0] Please send me the report **as soon as possible** so I can review it today.

syn: `immediately`, `at once`

<sub>tokens: in=4732 out=176</sub>

---

## `Seoul` — case=proper_acronym

**OLD** — meanings 1, examples 1, syn 0, ant 0

Meanings:
- [0] (proper noun) Seoul, city  →  (proper noun) 서울, 도시

Examples:
- [m=0] We visited **Seoul** during our summer vacation.

<sub>tokens: in=8349 out=145</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (proper noun) Seoul, city  →  (고유명사) 서울, 도시

Examples:
- [m=0] We learned about **Seoul** in geography class.

<sub>tokens: in=3144 out=140</sub>

---

## `Microsoft` — case=proper_acronym

**OLD** — meanings 1, examples 1, syn 0, ant 0

Meanings:
- [0] (proper noun) Microsoft, company  →  (proper noun) 마이크로소프트, 회사

Examples:
- [m=0] My friend works at **Microsoft** in Seattle.

<sub>tokens: in=8346 out=145</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (proper noun) Microsoft, company  →  (고유명사) 마이크로소프트, 회사

Examples:
- [m=0] I read about **Microsoft** in a technology textbook.

<sub>tokens: in=3142 out=141</sub>

---

## `NASA` — case=proper_acronym

**OLD** — meanings 1, examples 1, syn 0, ant 0

Meanings:
- [0] (proper noun) NASA, agency  →  (proper noun) 나사, 기관

Examples:
- [m=0] The **NASA** team launched a new satellite yesterday.

<sub>tokens: in=8346 out=143</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (proper noun) National Aeronautics and Space Administration, agency  →  (고유명사) 미국 항공우주국, 기관

Examples:
- [m=0] I read about **NASA** in a textbook.

<sub>tokens: in=3148 out=148</sub>

---

## `FBI` — case=proper_acronym

**OLD** — meanings 1, examples 1, syn 0, ant 0

Meanings:
- [0] (proper noun) United States Federal Bureau of Investigation  →  (proper noun) 미국 연방수사국

Examples:
- [m=0] The **FBI** investigated the cybercrime last year.

<sub>tokens: in=8355 out=152</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (proper noun) Federal Bureau of Investigation, agency  →  (고유명사) 연방수사국, 기관

Examples:
- [m=0] The documentary explained the role of the **FBI**.

<sub>tokens: in=3147 out=147</sub>

---

## `Tokyo` — case=proper_acronym

**OLD** — meanings 1, examples 1, syn 0, ant 0

Meanings:
- [0] (proper noun) Tokyo, city  →  (proper noun) 도쿄, 도시

Examples:
- [m=0] We planned a trip to **Tokyo** next summer.

<sub>tokens: in=8346 out=144</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (proper noun) Tokyo, city  →  (고유명사) 도쿄, 도시

Examples:
- [m=0] We learned about **Tokyo** in geography class.

<sub>tokens: in=3142 out=138</sub>

---

## `42` — case=number_symbol

**OLD** — meanings 2, examples 2, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (numeral) forty-two  →  (numeral) 사십이
- [1] (noun) answer to life  →  (noun) 인생의 답

Examples:
- [m=0] The number **42** is often used in math problems.
- [m=1] In the story, **42** is the answer to life’s biggest question.

<sub>tokens: in=7217 out=223</sub>

**NEW** — meanings 2, examples 2, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (numeral) forty-two  →  (수사) 사십이
- [1] (noun) the answer to life, the universe, and everything  →  (명사) 생명, 우주, 모든 것에 대한 해답

Examples:
- [m=0] The book has **42** chapters in total.
- [m=1] He claimed **42** was the answer to life’s mysteries.

<sub>tokens: in=3842 out=234</sub>

---

## `1984` — case=number_symbol

**OLD** — meanings 2, examples 2, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (numeral) one thousand nine hundred eighty-four  →  (numeral) 천구백팔십사
- [1] (proper noun) 1984, novel  →  (proper noun) 1984, 소설

Examples:
- [m=0] The event happened in the year **1984**.
- [m=1] We studied **1984** by George Orwell in class.

<sub>tokens: in=7226 out=230</sub>

**NEW** — meanings 2, examples 2, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (numeral) nineteen eighty-four  →  (수사) 천구백팔십사
- [1] (proper noun) novel  →  (고유명사) 소설

Examples:
- [m=0] The year **1984** marked many historic events.
- [m=1] She is reading **1984** by George Orwell this semester.

<sub>tokens: in=3837 out=227</sub>

---

## `@` — case=number_symbol

**OLD** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (expression) at sign  →  (expression) 골뱅이

Examples:
- [m=0] Please include your email with the **@** sign.

<sub>tokens: in=7151 out=125</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (symbol) at sign  →  (기호) 골뱅이 기호

Examples:
- [m=0] Please send the email to john**@**example.com.

<sub>tokens: in=3822 out=136</sub>

---

## `100` — case=number_symbol

**OLD** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (numeral) one hundred  →  (numeral) 백

Examples:
- [m=0] There are **100** pages in this book.

<sub>tokens: in=7207 out=124</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (numeral) one hundred  →  (수사) 백

Examples:
- [m=0] She counted exactly **100** coins in her jar.

<sub>tokens: in=3825 out=132</sub>

---

## `3.14` — case=number_symbol

**OLD** — meanings 2, examples 2, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (numeral) three point one four  →  (numeral) 삼점일사
- [1] (noun) pi  →  (noun) 원주율

Examples:
- [m=0] The circle's diameter is 2, so its circumference is **3.14** times that.
- [m=1] We learned that **3.14** is the approximate value of pi.

<sub>tokens: in=7221 out=221</sub>

**NEW** — meanings 2, examples 2, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (numeral) three point one four  →  (수사) 삼 점 일사
- [1] (noun) constant  →  (명사) 상수

Examples:
- [m=0] The value of **3.14** is often used for pi.
- [m=1] In math class, we studied the constant **3.14**.

<sub>tokens: in=3839 out=226</sub>

---

## Token totals

- OLD: in=152956, out=3328
- NEW: in=82263, out=3498
- delta: in=-70693 (-46.2%), out=170 (5.1%)