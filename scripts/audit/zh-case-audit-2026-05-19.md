# ZH case-routing audit — 2026-05-19

Sample: 24 words × 6 cases. Model: gpt-4.1-mini. Target: ko.

## `42` — case=number_symbol

**OLD** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

headword: `42`

Meanings:
- [0] (数词) 四十二  →  (수사) 사십이

Examples:
- [m=0] 会议定在**42**号会议室举行。

<sub>tokens: in=7318 out=121</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

headword: `42`

Meanings:
- [0] (数词) 四十二  →  (수사) 사십이

Examples:
- [m=0] 这本书有**42**页。

<sub>tokens: in=3839 out=132</sub>

---

## `1984` — case=number_symbol

**OLD** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

headword: `1984`

Meanings:
- [0] (数词) 一九八四  →  (수사) 천구백팔십사

Examples:
- [m=0] 我出生于**1984**年。

<sub>tokens: in=7322 out=133</sub>

**NEW** — meanings 2, examples 2, syn 0, ant 0 (syn/ant skipped)

headword: `1984`

Meanings:
- [0] (数词) 一九八四  →  (수사) 일구팔사
- [1] (专有名词) 小说  →  (고유명사) 소설

Examples:
- [m=0] 这本书的页码是第**1984**页。
- [m=1] 乔治·奥威尔写了**1984**这部小说。

<sub>tokens: in=3854 out=231</sub>

---

## `@` — case=number_symbol

**OLD** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

headword: `@`

Meanings:
- [0] (expression) 电子邮件符号  →  (expression) 골뱅이

Examples:
- [m=0] 请在邮箱地址中输入**@**符号。

<sub>tokens: in=7265 out=129</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

headword: `@`

Meanings:
- [0] (符号) 艾特、at符号  →  (기호) 에이티, at 기호

Examples:
- [m=0] 请在邮件中输入 **@** 符号。

<sub>tokens: in=3842 out=142</sub>

---

## `3.14` — case=number_symbol

**OLD** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

headword: `3.14`

Meanings:
- [0] (数词) 三点一四  →  (수사) 삼점일사

Examples:
- [m=0] 圆周率约等于**3.14**。

<sub>tokens: in=7324 out=136</sub>

**NEW** — meanings 2, examples 2, syn 0, ant 0 (syn/ant skipped)

headword: `3.14`

Meanings:
- [0] (数词) 三点一四  →  (수사) 삼 점 일사
- [1] (名词) 圆周率  →  (명사) 원주율

Examples:
- [m=0] 这个圆的直径是**3.14**米。
- [m=1] **3.14**是圆周率的近似值。

<sub>tokens: in=3857 out=228</sub>

---

## `你好` — case=set_expression

**OLD** — meanings 1, examples 1, syn 0, ant 0

headword: `你好` [nǐhǎo]

Meanings:
- [0] (表达) 问候, 打招呼  →  (表达) 안녕하세요, 인사

Examples:
- [m=0] 我见到老师时对他说了**你好**。

<sub>tokens: in=8474 out=151</sub>

**NEW** — meanings 1, examples 1, syn 1, ant 0

headword: `你好` [nǐ hǎo]

Meanings:
- [0] (表达) 问候  →  (표현) 인사

Examples:
- [m=0] 早上好，**你好**！

syn: `您好`

<sub>tokens: in=4749 out=158</sub>

---

## `谢谢` — case=set_expression

**OLD** — meanings 1, examples 1, syn 1, ant 0

headword: `谢谢` [xièxie]

Meanings:
- [0] (动词) 感谢, 道谢  →  (동사) 감사합니다, 고맙습니다

Examples:
- [m=0] 我想对你说声**谢谢**！

syn: `感谢`

<sub>tokens: in=8476 out=161</sub>

**NEW** — meanings 1, examples 1, syn 1, ant 0

headword: `谢谢` [xiè xie]

Meanings:
- [0] (表达) 感谢  →  (표현) 감사

Examples:
- [m=0] 非常感谢您的帮助，**谢谢**！

syn: `感谢`

<sub>tokens: in=4749 out=156</sub>

---

## `对不起` — case=set_expression

**OLD** — meanings 1, examples 1, syn 2, ant 0

headword: `对不起` [duìbuqǐ]

Meanings:
- [0] (动词) 道歉, 抱歉  →  (동사) 미안하다, 죄송하다

Examples:
- [m=0] 我向老师**对不起**了，因为迟到了。

syn: `抱歉`, `歉意`

<sub>tokens: in=8479 out=177</sub>

**NEW** — meanings 1, examples 1, syn 1, ant 0

headword: `对不起` [duì bu qǐ]

Meanings:
- [0] (表达) 사과의 표현  →  (표현) 미안함

Examples:
- [m=0] **对不起**，我迟到了。

syn: `抱歉`

<sub>tokens: in=4754 out=164</sub>

---

## `再见` — case=set_expression

**OLD** — meanings 2, examples 2, syn 2, ant 0

headword: `再见` [zàijiàn]

Meanings:
- [0] (名词) 告别, 离别  →  (명사) 안녕, 작별
- [1] (动词) 告别, 道别  →  (동사) 작별 인사하다, 헤어지다

Examples:
- [m=0] 我们在车站做了正式的**再见**。
- [m=1] 离开前，他向大家挥手**再见**了。

syn: `告别`, `辞别`

<sub>tokens: in=8509 out=249</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 0

headword: `再见` [zài jiàn]

Meanings:
- [0] (表达) 告别用语  →  (표현) 작별 인사

Examples:
- [m=0] 我们明天见，**再见**！

syn: `拜拜`, `告辞`

<sub>tokens: in=4756 out=169</sub>

---

## `一帆风顺` — case=chengyu_4char

**OLD** — meanings 1, examples 1, syn 2, ant 2

headword: `一帆风顺` [yīfān fēngshùn]

Meanings:
- [0] (成语) 顺利, 无阻碍  →  (성어) 순조롭게, 무난하게

Examples:
- [m=0] 祝你事业**一帆风顺**，步步高升！

syn: `顺风顺水`, `万事如意`
ant: `波折不断`, `坎坷不平`

<sub>tokens: in=8486 out=201</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 0

headword: `一帆风顺` [yī fān fēng shùn]

Meanings:
- [0] (表达) 事情进展非常顺利  →  (표현) 순조롭게 진행됨 (격식)

Examples:
- [m=0] 祝你新工作**一帆风顺**，事业蒸蒸日上！

syn: `顺风顺水`, `万事如意`

<sub>tokens: in=4677 out=194</sub>

---

## `马马虎虎` — case=chengyu_4char

**OLD** — meanings 1, examples 1, syn 2, ant 2

headword: `马马虎虎` [mǎmahūhu]

Meanings:
- [0] (形容词) 马虎, 不认真  →  (형용사) 그저 그런, 대충하는

Examples:
- [m=0] 他的工作态度非常**马马虎虎**，常出错。

syn: `敷衍`, `粗心`
ant: `认真`, `仔细`

<sub>tokens: in=8483 out=192</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 1

headword: `马马虎虎` [mǎ mǎ hū hū]

Meanings:
- [0] (表达) 马虎敷衍，不认真  →  (표현) 그저 그런, 대충 하는

Examples:
- [m=0] 他的工作态度总是 **马马虎虎**，难以让人放心。

syn: `敷衍`, `草率`
ant: `认真`

<sub>tokens: in=4676 out=200</sub>

---

## `中华民族` — case=chengyu_4char

**OLD** — meanings 1, examples 1, syn 0, ant 0

headword: `中华民族` [zhōnghuá mínzú]

Meanings:
- [0] (名词) 中国民族  →  (명사) 중화민족

Examples:
- [m=0] 我们学习了**中华民族**的历史和文化。

<sub>tokens: in=8469 out=160</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0

headword: `中华民族` [zhōng huá mín zú]

Meanings:
- [0] (专有名词) 中国的民族总称  →  (고유명사) 중국 민족

Examples:
- [m=0] 保护 **中华民族** 的文化遗产十分重要。

<sub>tokens: in=4670 out=168</sub>

---

## `人民日报` — case=chengyu_4char

**OLD** — meanings 1, examples 1, syn 0, ant 0

headword: `人民日报` [rénmínrìbào]

Meanings:
- [0] (专有名词) 人民日报, 报纸  →  (专有名词) 인민일보, 신문

Examples:
- [m=0] 我每天早上都会读**人民日报**。

<sub>tokens: in=8480 out=156</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0

headword: `人民日报` [rén mín rì bào]

Meanings:
- [0] (专有名词) 中国共产党中央委员会机关报  →  (고유명사) 중국 공산당 중앙위원회 기관지

Examples:
- [m=0] 最新消息由**人民日报**权威发布。

<sub>tokens: in=4669 out=170</sub>

---

## `水` — case=single_char

**OLD** — meanings 1, examples 1, syn 0, ant 0

headword: `水` [shuǐ]

Meanings:
- [0] (名词) 水, 名词  →  (명사) 물

Examples:
- [m=0] 请给我一杯**水**，谢谢！

<sub>tokens: in=8470 out=155</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0

headword: `水` [shuǐ]

Meanings:
- [0] (名词) 水  →  (명사) 물

Examples:
- [m=0] 孩子们喝着 **水** 玩耍。

<sub>tokens: in=5770 out=141</sub>

---

## `月` — case=single_char

**OLD** — meanings 2, examples 2, syn 0, ant 0

headword: `月` [yuè]

Meanings:
- [0] (名词) 月亮  →  (명사) 달
- [1] (名词) 月份  →  (명사) 월

Examples:
- [m=0] 今晚的**月**非常圆亮。
- [m=1] 我计划下个**月**去旅行。

<sub>tokens: in=8486 out=204</sub>

**NEW** — meanings 2, examples 2, syn 0, ant 0

headword: `月` [yuè]

Meanings:
- [0] (名词) 月份  →  (명사) 달
- [1] (名词) 月亮  →  (명사) 달

Examples:
- [m=0] 我今年有十二个 **月** 。
- [m=1] 今晚的 **月** 很圆很亮。

<sub>tokens: in=5792 out=215</sub>

---

## `人` — case=single_char

**OLD** — meanings 1, examples 1, syn 0, ant 0

headword: `人` [rén]

Meanings:
- [0] (名词) 人, 人物  →  (명사) 사람

Examples:
- [m=0] 公园里有很多**人**在散步。

<sub>tokens: in=8470 out=156</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0

headword: `人` [rén]

Meanings:
- [0] (名词) 人类、个人  →  (명사) 사람,인간

Examples:
- [m=0] **人** 是社会的主体。

<sub>tokens: in=5776 out=152</sub>

---

## `行` — case=single_char

**OLD** — meanings 3, examples 3, syn 2, ant 0

headword: `行` [xíng, háng]

Meanings:
- [0] (动词) 走, 行走  →  (동사) 가다, 걷다
- [1] (名词) 道路, 街道  →  (명사) 길, 도로
- [2] (形容词) 可以, 允许  →  (형용사) 괜찮다, 가능하다

Examples:
- [m=0] 我们每天都要**行**走很多路。
- [m=1] 这条**行**是通往学校的主要道路。
- [m=2] 如果你觉得这样做**行**，我们就开始吧！

syn: `走`, `走路`

<sub>tokens: in=8528 out=335</sub>

**NEW** — meanings 2, examples 2, syn 1, ant 0

headword: `行` [xíng, háng]

Meanings:
- [0] (动词) 走，进行  →  (동사) 걷다, 진행하다
- [1] (名词) 行列，行业  →  (명사) 줄, 업종

Examples:
- [m=0] 我们 **行** 了很长时间。
- [m=1] 这个 **行** 业发展很快。

syn: `走`

<sub>tokens: in=5800 out=229</sub>

---

## `CCTV` — case=latin_acronym

**OLD** — meanings 1, examples 1, syn 0, ant 0

headword: `CCTV`

Meanings:
- [0] (名词) 闭路电视  →  (명사) 폐쇄회로 텔레비전

Examples:
- [m=0] 商店门口安装了新的**CCTV**监控。

<sub>tokens: in=8473 out=154</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

headword: `CCTV`

Meanings:
- [0] (专有名词) 中国中央电视台、电视台  →  (고유명사) 중국중앙텔레비전, 방송국

Examples:
- [m=0] 我在课上学了 **CCTV**。

<sub>tokens: in=3326 out=153</sub>

---

## `NBA` — case=latin_acronym

**OLD** — meanings 1, examples 1, syn 0, ant 0

headword: `NBA`

Meanings:
- [0] (专有名词) NBA, 篮球联盟  →  (专有名词) NBA, 농구 리그

Examples:
- [m=0] 昨天晚上我看了**NBA**的比赛直播。

<sub>tokens: in=8478 out=154</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

headword: `NBA`

Meanings:
- [0] (专有名词) 美国职业篮球联赛、体育联盟  →  (고유명사) 미국프로농구, 연맹

Examples:
- [m=0] 我在电视上看了 **NBA** 的比赛。

<sub>tokens: in=3325 out=151</sub>

---

## `WTO` — case=latin_acronym

**OLD** — meanings 1, examples 1, syn 0, ant 0

headword: `WTO`

Meanings:
- [0] (专有名词) 世界贸易组织  →  (专有名词) 세계무역기구

Examples:
- [m=0] 中国是**WTO**的成员国之一。

<sub>tokens: in=8475 out=151</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

headword: `WTO`

Meanings:
- [0] (专有名词) 世界贸易组织、国际组织  →  (고유명사) 세계무역기구, 기관

Examples:
- [m=0] 我在课上学了 **WTO**。

<sub>tokens: in=3325 out=148</sub>

---

## `BTS` — case=latin_acronym

**OLD** — meanings 1, examples 1, syn 0, ant 0

headword: `BTS`

Meanings:
- [0] (专有名词) 防弹少年团, 音乐组合  →  (专有名词) 방탄소년단, 그룹

Examples:
- [m=0] 我非常喜欢**BTS**的音乐和舞蹈。

<sub>tokens: in=8487 out=161</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

headword: `BTS`

Meanings:
- [0] (专有名词) 防弹少年团、专有名词  →  (고유명사) 방탄소년단, 고유명사

Examples:
- [m=0] 我喜欢听 **BTS** 的音乐。

<sub>tokens: in=3328 out=152</sub>

---

## `北京` — case=simple_word

**OLD** — meanings 1, examples 1, syn 0, ant 0

headword: `北京` [běijīng]

Meanings:
- [0] (专有名词) 中国首都  →  (专有名词) 베이징, 도시

Examples:
- [m=0] 我计划下个月去**北京**旅游。

<sub>tokens: in=8472 out=158</sub>

**NEW** — meanings 1, examples 3, syn 0, ant 0

headword: `北京` [běi jīng]

Meanings:
- [0] (专有名词) 北京、城市  →  (고유명사) 베이징, 도시

Examples:
- [m=0] 我明天去**北京**旅游。
- [m=0] **北京**的冬天很冷。
- [m=0] 如果你去**北京**，一定要尝试当地美食！

<sub>tokens: in=5985 out=223</sub>

---

## `中国` — case=simple_word

**OLD** — meanings 1, examples 1, syn 0, ant 0

headword: `中国` [zhōngguó]

Meanings:
- [0] (专有名词) 中国, 国家  →  (专有名词) 중국, 나라

Examples:
- [m=0] 我计划明年去**中国**旅游。

<sub>tokens: in=8472 out=158</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0

headword: `中国` [zhōng guó]

Meanings:
- [0] (专有名词) 中国、国家  →  (고유명사) 중국, 국가

Examples:
- [m=0] 我计划明年去**中国**旅游。

<sub>tokens: in=5985 out=164</sub>

---

## `学校` — case=simple_word

**OLD** — meanings 1, examples 1, syn 0, ant 0

headword: `学校` [xuéxiào]

Meanings:
- [0] (名词) 学校  →  (명사) 학교

Examples:
- [m=0] 我们明天去参观**学校**。

<sub>tokens: in=8466 out=140</sub>

**NEW** — meanings 1, examples 3, syn 0, ant 0

headword: `学校` [xué xiào]

Meanings:
- [0] (名词) 学校, 教育机构  →  (명사) 학교, 교육 기관

Examples:
- [m=0] 孩子们每天去**学校**学习。
- [m=0] **学校**在市中心，交通很方便。
- [m=0] 因为天气好，学生们在**学校**操场上玩耍。

<sub>tokens: in=5987 out=222</sub>

---

## `朋友` — case=simple_word

**OLD** — meanings 1, examples 1, syn 2, ant 0

headword: `朋友` [péngyǒu]

Meanings:
- [0] (名词) 朋友  →  (명사) 친구

Examples:
- [m=0] 我和**朋友**一起去公园散步。

syn: `友人`, `伙伴`

<sub>tokens: in=8466 out=163</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0

headword: `朋友` [péng yǒu]

Meanings:
- [0] (名词) 朋友  →  (명사) 친구

Examples:
- [m=0] 小明和我都是好**朋友**。

<sub>tokens: in=5979 out=157</sub>

---

## Token totals

- OLD: in=198828, out=4055
- NEW: in=113470, out=4219
- delta: in=-85358 (-42.9%), out=164 (4.0%)