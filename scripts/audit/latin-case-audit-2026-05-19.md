# Latin (es / fr / de / it) case-routing audit — 2026-05-19

Sample: 12 words × 4 languages. Model: gpt-4.1-mini. Target: ko.

# ES

## `comer` — case=simple_word

**OLD** — meanings 1, examples 1, syn 1, ant 1

ipa: `koˈmeɾ`

Meanings:
- [0] (verbo) ingerir alimentos  →  (verbo) 먹다, 식사하다

Examples:
- [m=0] Nos gusta **comer** frutas frescas en verano.

syn: `alimentarse`
ant: `ayunar`

<sub>tokens: in=8358 out=173</sub>

**NEW** — meanings 1, examples 1, syn 1, ant 0

ipa: `koˈmeɾ`

Meanings:
- [0] (verbo) ingerir alimento  →  (동사) 먹다, 식사하다

Examples:
- [m=0] Nos gusta **comer** frutas frescas después de la escuela.

syn: `alimentarse`

<sub>tokens: in=4892 out=172</sub>

---

## `libro` — case=simple_word

**OLD** — meanings 1, examples 1, syn 0, ant 0

ipa: `ˈliβɾo`

Meanings:
- [0] (sustantivo) libro [m]  →  (sustantivo) 책

Examples:
- [m=0] Ella compró un **libro** interesante en la feria.

<sub>tokens: in=8358 out=166</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 0

ipa: `ˈliβɾo`

Meanings:
- [0] (sustantivo) conjunto de hojas impresas [m]  →  (명사) 책

Examples:
- [m=0] Ana compró un **libro** nuevo para la clase de historia.

syn: `tomo`, `volumen`

<sub>tokens: in=4900 out=179</sub>

---

## `feliz` — case=simple_word

**OLD** — meanings 1, examples 1, syn 2, ant 1

ipa: `feˈlis`

Meanings:
- [0] (adjetivo) contento, alegre  →  (adjetivo) 행복한, 기쁜

Examples:
- [m=0] Ella está **feliz** con su nuevo trabajo.

syn: `contento`, `alegre`
ant: `triste`

<sub>tokens: in=8362 out=170</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 1

ipa: `feˈlis`

Meanings:
- [0] (adjetivo) contento, alegre  →  (형용사) 행복한, 기쁜

Examples:
- [m=0] Los niños están **felices** jugando en el parque.

syn: `contento`, `alegre`
ant: `triste`

<sub>tokens: in=4896 out=178</sub>

---

## `por favor` — case=set_expression

**OLD** — meanings 0, examples 0, syn 0, ant 0

note: `sentence`

<sub>tokens: in=4177 out=48</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 0

Meanings:
- [0] (expresión) petición, cortesía  →  (표현) 제발, 부탁해

Examples:
- [m=0] ¿Me pasas la sal, **por favor**?

syn: `porfa`, `porfis`

<sub>tokens: in=4513 out=157</sub>

---

## `a pesar de` — case=set_expression

**OLD** — meanings 0, examples 0, syn 0, ant 0

note: `sentence`

<sub>tokens: in=4178 out=50</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 0

Meanings:
- [0] (expresión) aunque, sin importar  →  (표현) 그럼에도 불구하고

Examples:
- [m=0] Salió a correr **a pesar de** la lluvia intensa.

syn: `aunque`, `sin importar`

<sub>tokens: in=4516 out=159</sub>

---

## `dar de comer` — case=set_expression

**OLD** — meanings 0, examples 0, syn 0, ant 0

note: `sentence`

<sub>tokens: in=4178 out=50</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 0

Meanings:
- [0] (verbo) alimentar, dar comida  →  (동사) 먹이다, 먹여 주다

Examples:
- [m=0] Cada mañana, ella **da de comer** a los gatos del vecindario con mucho cariño.

syn: `alimentar`, `nutrir`

<sub>tokens: in=4516 out=175</sub>

---

## `Madrid` — case=proper_acronym

**OLD** — meanings 1, examples 1, syn 0, ant 0

Meanings:
- [0] (nombre propio) Madrid, ciudad  →  (nombre propio) 마드리드, 도시

Examples:
- [m=0] El museo más famoso está en **Madrid**.

<sub>tokens: in=8355 out=136</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (nombre propio) ciudad  →  (고유명사) 마드리드, 도시

Examples:
- [m=0] Visitamos el museo principal de **Madrid**.

<sub>tokens: in=3427 out=115</sub>

---

## `ONU` — case=proper_acronym

**OLD** — meanings 1, examples 1, syn 0, ant 0

Meanings:
- [0] (nombre propio) Organización de Naciones Unidas  →  (nombre propio) 국제연합, 기관

Examples:
- [m=0] La **ONU** trabaja para mantener la paz mundial.

<sub>tokens: in=8357 out=147</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (nombre propio) Organización de las Naciones Unidas, institución  →  (고유명사) 국제 연합, 기관

Examples:
- [m=0] El informe fue presentado a la **ONU** ayer.

<sub>tokens: in=3433 out=136</sub>

---

## `RAE` — case=proper_acronym

**OLD** — meanings 1, examples 1, syn 0, ant 0

Meanings:
- [0] (nombre propio) Real Academia Española, nombre propio  →  (nombre propio) 스페인 왕립 아카데미, 고유명사

Examples:
- [m=0] La **RAE** actualiza el diccionario cada cierto tiempo.

<sub>tokens: in=8364 out=161</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (nombre propio) Real Academia Española, institución  →  (고유명사) 스페인 왕립 아카데미, 기관

Examples:
- [m=0] Consultamos el diccionario de la **RAE** para aclarar dudas.

<sub>tokens: in=3433 out=145</sub>

---

## `42` — case=number_symbol

**OLD** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (numeral) cuarenta y dos  →  (numeral) 사십이

Examples:
- [m=0] El tren sale a las **42** minutos de la hora.

<sub>tokens: in=7218 out=124</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (numeral) cuarenta y dos  →  (수사) 사십이

Examples:
- [m=0] El libro tiene **42** páginas en total.

<sub>tokens: in=3905 out=127</sub>

---

## `3.14` — case=number_symbol

**OLD** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (numeral) tres punto catorce  →  (numeral) 삼점일사

Examples:
- [m=0] El valor de **3.14** es aproximado para pi.

<sub>tokens: in=7223 out=132</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (numeral) tres punto uno cuatro  →  (수사) 삼 점 일 사

Examples:
- [m=0] El valor aproximado de **3.14** es pi.

<sub>tokens: in=3909 out=135</sub>

---

## `@` — case=number_symbol

**OLD** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (expression) arroba  →  (expression) 골뱅이

Examples:
- [m=0] Por favor, escribe tu correo con la **@** correcta.

<sub>tokens: in=7160 out=120</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (símbolo) arroba, símbolo arroba  →  (기호) 골뱅이, 골뱅이 기호

Examples:
- [m=0] Por favor, envía el correo a juan**@**gmail.com.

<sub>tokens: in=3906 out=143</sub>

---

# FR

## `manger` — case=simple_word

**OLD** — meanings 1, examples 1, syn 2, ant 1

ipa: `mɑ̃ʒe`

Meanings:
- [0] (verbe) consommer nourriture  →  (verbe) 먹다

Examples:
- [m=0] Nous **mangeons** ensemble tous les soirs.

syn: `consommer`, `dévorer`
ant: `jeûner`

<sub>tokens: in=8353 out=168</sub>

**NEW** — meanings 1, examples 1, syn 1, ant 0

ipa: `mɑ̃ʒe`

Meanings:
- [0] (verbe) consommer de la nourriture  →  (동사) 먹다, 식사하다

Examples:
- [m=0] Nous **mangeons** souvent ensemble le dimanche midi.

syn: `bouffer`

<sub>tokens: in=5009 out=172</sub>

---

## `livre` — case=simple_word

**OLD** — meanings 2, examples 2, syn 1, ant 0

ipa: `livʁ`

Meanings:
- [0] (nom) ouvrage [m]  →  (nom) 책
- [1] (nom) unité de poids [f]  →  (nom) 파운드

Examples:
- [m=0] Elle a acheté un **livre** intéressant hier.
- [m=1] Ce sac contient cinq **livres** de farine.

syn: `ouvrage`

<sub>tokens: in=8367 out=236</sub>

**NEW** — meanings 2, examples 2, syn 2, ant 0

ipa: `livʁ`

Meanings:
- [0] (nom) ouvrage, volume [m]  →  (명사) 책
- [1] (nom) unité, poids [f]  →  (명사) 파운드

Examples:
- [m=0] Marie a acheté un **livre** passionnant hier.
- [m=1] Le colis pèse exactement un **livre** selon la balance.

syn: `ouvrage`, `volume`

<sub>tokens: in=5023 out=241</sub>

---

## `heureux` — case=simple_word

**OLD** — meanings 1, examples 1, syn 2, ant 2

ipa: `øʁø`

Meanings:
- [0] (adjectif) heureux, content [mf]  →  (adjectif) 행복한, 기쁜

Examples:
- [m=0] Elle est **heureuse** de sa réussite.

syn: `content`, `joyeux`
ant: `malheureux`, `triste`

<sub>tokens: in=8355 out=180</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 1

ipa: `œʁø`

Meanings:
- [0] (adjectif) heureux, content, joyeux  →  (형용사) 행복한, 기쁜

Examples:
- [m=0] Les enfants sont **heureux** de jouer dehors cet après-midi.

syn: `content`, `joyeux`
ant: `malheureux`

<sub>tokens: in=5013 out=183</sub>

---

## `s'il vous plaît` — case=set_expression

**OLD** — meanings 0, examples 0, syn 0, ant 0

note: `sentence`

<sub>tokens: in=4174 out=52</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0

Meanings:
- [0] (expression) formule de politesse  →  (표현) 부탁합니다

Examples:
- [m=0] Pouvez-vous m'aider, **s'il vous plaît** ?

<sub>tokens: in=4630 out=159</sub>

---

## `à cause de` — case=set_expression

**OLD** — meanings 0, examples 0, syn 0, ant 0

note: `sentence`

<sub>tokens: in=4173 out=50</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 0

Meanings:
- [0] (préposition) cause, raison, motif  →  (전치사) 때문에, 원인으로

Examples:
- [m=0] Le train est en retard **à cause de** la neige abondante ce matin.

syn: `en raison de`, `du fait de`

<sub>tokens: in=4631 out=175</sub>

---

## `avoir faim` — case=set_expression

**OLD** — meanings 0, examples 0, syn 0, ant 0

note: `sentence`

<sub>tokens: in=4172 out=48</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0

Meanings:
- [0] (verbe) ressentir la faim  →  (동사) 배고프다

Examples:
- [m=0] Après la longue randonnée, il **a eu faim** et a mangé rapidement.

<sub>tokens: in=4626 out=160</sub>

---

## `Paris` — case=proper_acronym

**OLD** — meanings 1, examples 1, syn 0, ant 0

Meanings:
- [0] (nom propre) Paris, ville [mf]  →  (nom propre) 파리, 도시

Examples:
- [m=0] Nous visitons **Paris** pendant les vacances d'été.

<sub>tokens: in=8350 out=144</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (nom propre) ville  →  (고유명사) 파리, 도시

Examples:
- [m=0] Nous avons lu un article sur **Paris**.

<sub>tokens: in=3540 out=126</sub>

---

## `SNCF` — case=proper_acronym

**OLD** — meanings 1, examples 1, syn 0, ant 0

Meanings:
- [0] (nom propre) société nationale chemins fer [f]  →  (nom propre) 프랑스 국영 철도 회사

Examples:
- [m=0] La gare est gérée par la **SNCF**.

<sub>tokens: in=8358 out=163</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (nom propre) société nationale des chemins de fer français, institution  →  (고유명사) 프랑스 국영 철도 회사, 기관

Examples:
- [m=0] Le fonctionnement de la **SNCF** est étudié en cours.

<sub>tokens: in=3552 out=151</sub>

---

## `Dupont` — case=proper_acronym

**OLD** — meanings 1, examples 1, syn 0, ant 0

Meanings:
- [0] (nom propre) Dupont, nom  →  (nom propre) 듀퐁, 성

Examples:
- [m=0] Le professeur **Dupont** a corrigé les copies rapidement.

<sub>tokens: in=8355 out=151</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (nom propre) nom propre  →  (고유명사) 듀퐁, 고유명사

Examples:
- [m=0] Nous avons rencontré **Dupont** lors de la réunion.

<sub>tokens: in=3543 out=137</sub>

---

## `42` — case=number_symbol

**OLD** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (numéral) quarante-deux  →  (numéral) 사십이

Examples:
- [m=0] Il y a **42** chaises dans la salle.

<sub>tokens: in=7213 out=130</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (numéral) quarante-deux  →  (수사) 사십이

Examples:
- [m=0] Le livre commence à la page **42**.

<sub>tokens: in=4018 out=126</sub>

---

## `3.14` — case=number_symbol

**OLD** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (numéral) trois virgule quatorze  →  (numéral) 삼점일사

Examples:
- [m=0] Le nombre **3.14** est utilisé en mathématiques.

<sub>tokens: in=7219 out=132</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (numéral) trois, point, un, quatre  →  (수사) 삼 점 일 사

Examples:
- [m=0] Le nombre **3.14** est une approximation de pi.

<sub>tokens: in=4025 out=138</sub>

---

## `@` — case=number_symbol

**OLD** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (expression) arobase  →  (expression) 골뱅이

Examples:
- [m=0] Mon adresse e-mail contient le symbole **@**.

<sub>tokens: in=7155 out=126</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (symbole) arobase  →  (기호) 골뱅이

Examples:
- [m=0] Mon adresse email contient un **@**.

<sub>tokens: in=4014 out=124</sub>

---

# DE

## `essen` — case=simple_word

**OLD** — meanings 1, examples 1, syn 1, ant 0

ipa: `ˈɛsn̩`

Meanings:
- [0] (Verb) essen  →  (동사) 먹다, 식사하다

Examples:
- [m=0] Wir **essen** heute Abend gemeinsam Pizza.

syn: `speisen`

<sub>tokens: in=8349 out=162</sub>

**NEW** — meanings 1, examples 1, syn 1, ant 0

ipa: `ˈɛsn̩`

Meanings:
- [0] (Verb) essen, speisen  →  (동사) 먹다, 식사하다

Examples:
- [m=0] Wir **essen** heute Abend zusammen im Restaurant.

syn: `speisen`

<sub>tokens: in=5030 out=166</sub>

---

## `Buch` — case=simple_word

**OLD** — meanings 1, examples 1, syn 0, ant 0

ipa: `buːx`

Meanings:
- [0] (Nomen) Buch [n]  →  (Nomen) 책

Examples:
- [m=0] Das **Buch** liegt auf dem Tisch.

<sub>tokens: in=8354 out=157</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 0

ipa: `buːx`

Meanings:
- [0] (Nomen) Schriftwerk, Textsammlung [n]  →  (명사) 책

Examples:
- [m=0] Anna liest ein spannendes **Buch** über Geschichte.

syn: `Werk`, `Schriftstück`

<sub>tokens: in=5039 out=172</sub>

---

## `glücklich` — case=simple_word

**OLD** — meanings 1, examples 1, syn 2, ant 2

ipa: `ˈɡlʏklɪç`

Meanings:
- [0] (Adjektiv) glücklich, froh  →  (Adjektiv) 행복한, 기쁜

Examples:
- [m=0] Sie ist **glücklich** über das gute Ergebnis.

syn: `froh`, `zufrieden`
ant: `unglücklich`, `traurig`

<sub>tokens: in=8360 out=182</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 1

ipa: `ˈɡlʏklɪç`

Meanings:
- [0] (Adjektiv) glücklich, froh, zufrieden  →  (형용사) 행복한, 기쁜

Examples:
- [m=0] Anna ist **glücklich**, weil sie gute Nachrichten erhielt.

syn: `froh`, `zufrieden`
ant: `unglücklich`

<sub>tokens: in=5039 out=188</sub>

---

## `zum Beispiel` — case=set_expression

**OLD** — meanings 0, examples 0, syn 0, ant 0

note: `sentence`

<sub>tokens: in=4177 out=48</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 0

Meanings:
- [0] (Ausdruck) Beispielhaft, als Beispiel  →  (표현) 예를 들어

Examples:
- [m=0] Du kannst viele Früchte essen, **zum Beispiel** Äpfel oder Bananen.

syn: `beispielsweise`, `etwa`

<sub>tokens: in=4656 out=176</sub>

---

## `auf Wiedersehen` — case=set_expression

**OLD** — meanings 0, examples 0, syn 0, ant 0

note: `sentence`

<sub>tokens: in=4178 out=50</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 0

Meanings:
- [0] (Ausdruck) Abschiedsgruß  →  (표현) 안녕, 작별 인사

Examples:
- [m=0] Wir sagen jetzt **auf Wiedersehen**, bis zum nächsten Mal!

syn: `lebwohl`, `tschüss`

<sub>tokens: in=4657 out=162</sub>

---

## `vor allem` — case=set_expression

**OLD** — meanings 1, examples 1, syn 2, ant 0

Meanings:
- [0] (Präposition) vor allem, insbesondere  →  (Präposition) 무엇보다도, 특히

Examples:
- [m=0] Wir sollten **vor allem** die Sicherheit beachten.

syn: `insbesondere`, `hauptsächlich`

<sub>tokens: in=8362 out=157</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 0

Meanings:
- [0] (Ausdruck) besonders, hauptsächlich  →  (표현) 무엇보다도

Examples:
- [m=0] Ich mag **vor allem** die Ruhe hier am Wochenende.

syn: `insbesondere`, `hauptsächlich`

<sub>tokens: in=4652 out=167</sub>

---

## `BMW` — case=proper_acronym

**OLD** — meanings 1, examples 1, syn 0, ant 0

Meanings:
- [0] (Eigenname) Automobilhersteller  →  (Eigenname) 비엠더블유, 자동차 회사

Examples:
- [m=0] Der neue **BMW** steht in der Garage.

<sub>tokens: in=8357 out=148</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (proper noun) Bayerische Motoren Werke, Eigenname  →  (고유명사) 바이에른 모터스, 기관

Examples:
- [m=0] Wir lesen einen Artikel über den neuen **BMW**.

<sub>tokens: in=3575 out=139</sub>

---

## `ICE` — case=proper_acronym

**OLD** — meanings 1, examples 1, syn 0, ant 0

Meanings:
- [0] (Nomen) Hochgeschwindigkeitszug [m]  →  (Nomen) 고속열차

Examples:
- [m=0] Der **ICE** fährt pünktlich um acht Uhr ab.

<sub>tokens: in=8359 out=156</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (proper noun) Intercity-Express, Agentur  →  (undefined) 인터시티익스프레스, 기관

Examples:
- [m=0] Der **ICE** verbindet viele deutsche Städte schnell.

<sub>tokens: in=3574 out=125</sub>

---

## `EU` — case=proper_acronym

**OLD** — meanings 1, examples 1, syn 0, ant 0

Meanings:
- [0] (Eigenname) Europäische Union  →  (Eigenname) 유럽 연합, 고유명사

Examples:
- [m=0] Die **EU** hat neue Umweltgesetze beschlossen.

<sub>tokens: in=8355 out=149</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (Eigenname) Europäische Union, Institution  →  (고유명사) 유럽 연합, 기관

Examples:
- [m=0] Viele Länder sind Mitglied der **EU**.

<sub>tokens: in=3572 out=132</sub>

---

## `42` — case=number_symbol

**OLD** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (Numerale) zweiundvierzig  →  (숫자) 사십이

Examples:
- [m=0] Das Buch hat genau **42** Seiten.

<sub>tokens: in=7218 out=129</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (Numerale) zweiundvierzig  →  (수사) 사십이

Examples:
- [m=0] Das Buch hat genau **42** Seiten.

<sub>tokens: in=4046 out=126</sub>

---

## `3.14` — case=number_symbol

**OLD** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (Ausdruck) drei Komma vierzehn  →  (Ausdruck) 삼점일사

Examples:
- [m=0] Die Zahl **3.14** ist eine Annäherung an Pi.

<sub>tokens: in=7224 out=141</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (Numerale) drei Komma eins vier  →  (수사) 삼 점 일 사

Examples:
- [m=0] Die Zahl **3.14** ist eine Näherung für Pi.

<sub>tokens: in=4051 out=138</sub>

---

## `@` — case=number_symbol

**OLD** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (expression) At-Zeichen  →  (expression) 골뱅이

Examples:
- [m=0] Die E-Mail-Adresse enthält das **@**-Zeichen.

<sub>tokens: in=7162 out=122</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (Symbol) At-Zeichen  →  (기호) 골뱅이

Examples:
- [m=0] Bitte senden Sie die E-Mail an **@**.

<sub>tokens: in=4043 out=126</sub>

---

# IT

## `mangiare` — case=simple_word

**OLD** — meanings 1, examples 1, syn 1, ant 1

ipa: `manˈdʒaːre`

Meanings:
- [0] (verbo) mangiare  →  (동사) 먹다

Examples:
- [m=0] Ogni giorno noi **mangiamo** insieme a pranzo.

syn: `consumare`
ant: `digiunare`

<sub>tokens: in=8359 out=167</sub>

**NEW** — meanings 1, examples 1, syn 1, ant 1

ipa: `manˈdʒaːre`

Meanings:
- [0] (verbo) consumare cibo  →  (동사) 먹다, 식사하다

Examples:
- [m=0] I bambini **mangiano** la frutta fresca ogni giorno.

syn: `consumare`
ant: `digiunare`

<sub>tokens: in=4910 out=181</sub>

---

## `libro` — case=simple_word

**OLD** — meanings 1, examples 1, syn 0, ant 0

ipa: `ˈli.bro`

Meanings:
- [0] (nome) libro [m]  →  (nome) 책

Examples:
- [m=0] Ho comprato un nuovo **libro** interessante ieri.

<sub>tokens: in=8352 out=157</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 0

ipa: `ˈli.bro`

Meanings:
- [0] (nome) testo, volume, pubblicazione [m]  →  (명사) 책

Examples:
- [m=0] Marco ha comprato un nuovo **libro** di cucina italiana.

syn: `volume`, `testo`

<sub>tokens: in=4909 out=173</sub>

---

## `felice` — case=simple_word

**OLD** — meanings 1, examples 1, syn 2, ant 2

ipa: `feˈli.tʃe`

Meanings:
- [0] (aggettivo) felice, contento  →  (aggettivo) 행복한, 기쁜

Examples:
- [m=0] Maria è molto **felice** oggi per la buona notizia.

syn: `contento`, `allegro`
ant: `infelice`, `triste`

<sub>tokens: in=8364 out=176</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 1

ipa: `feˈli.tʃe`

Meanings:
- [0] (aggettivo) felice, contento, lieto  →  (형용사) 행복한, 기쁜, 즐거운

Examples:
- [m=0] Marco è molto **felice** del suo nuovo lavoro.

syn: `contento`, `lieto`
ant: `infelice`

<sub>tokens: in=4917 out=191</sub>

---

## `per favore` — case=set_expression

**OLD** — meanings 0, examples 0, syn 0, ant 0

note: `sentence`

<sub>tokens: in=4177 out=48</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 0

Meanings:
- [0] (espressione) espressione di cortesia  →  (표현) 부탁합니다

Examples:
- [m=0] Puoi chiudere la finestra, **per favore**?

syn: `per piacere`, `per cortesia`

<sub>tokens: in=4532 out=152</sub>

---

## `a causa di` — case=set_expression

**OLD** — meanings 0, examples 0, syn 0, ant 0

note: `sentence`

<sub>tokens: in=4178 out=50</sub>

**NEW** — meanings 1, examples 1, syn 2, ant 0

Meanings:
- [0] (preposizione) per via di, a motivo di  →  (전치사) 때문에

Examples:
- [m=0] Il volo è stato cancellato **a causa di** una tempesta improvvisa.

syn: `per via di`, `a motivo di`

<sub>tokens: in=4537 out=160</sub>

---

## `avere fame` — case=set_expression

**OLD** — meanings 0, examples 0, syn 0, ant 0

note: `sentence`

<sub>tokens: in=4178 out=50</sub>

**NEW** — meanings 1, examples 1, syn 1, ant 1

Meanings:
- [0] (espressione) provare appetito  →  (표현) 배고프다

Examples:
- [m=0] Dopo la lunga passeggiata, **avevo fame** e volevo mangiare subito.

syn: `essere affamato`
ant: `essere sazio`

<sub>tokens: in=4531 out=162</sub>

---

## `Roma` — case=proper_acronym

**OLD** — meanings 1, examples 1, syn 0, ant 0

Meanings:
- [0] (nome proprio) Roma, città [f]  →  (nome proprio) 로마, 도시

Examples:
- [m=0] Ho visitato **Roma** durante le vacanze estive.

<sub>tokens: in=8355 out=152</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (nome proprio) città  →  (고유명사) 로마, 도시

Examples:
- [m=0] Molti turisti visitano **Roma** ogni anno.

<sub>tokens: in=3440 out=130</sub>

---

## `FIAT` — case=proper_acronym

**OLD** — meanings 1, examples 1, syn 0, ant 0

Meanings:
- [0] (nome proprio) Fiat, azienda automobilistica [mf]  →  (nome proprio) 피아트, 자동차 회사

Examples:
- [m=0] La **Fiat** ha presentato una nuova auto elettrica.

<sub>tokens: in=8364 out=160</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (nome proprio) Fabbrica Italiana Automobili Torino, nome proprio  →  (고유명사) 피아트, 회사

Examples:
- [m=0] Lo studio si concentra sulla storia della **FIAT**.

<sub>tokens: in=3451 out=140</sub>

---

## `Rossi` — case=proper_acronym

**OLD** — meanings 1, examples 1, syn 0, ant 0

ipa: `ˈrɔssi`

Meanings:
- [0] (nome proprio) cognome [mf]  →  (nome proprio) 로시, 성

Examples:
- [m=0] La famiglia **Rossi** abita vicino al parco.

<sub>tokens: in=8356 out=172</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (nome proprio) nome proprio  →  (고유명사) 로시, 고유명사

Examples:
- [m=0] Ho incontrato **Rossi** al mercato ieri mattina.

<sub>tokens: in=3443 out=135</sub>

---

## `42` — case=number_symbol

**OLD** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (numerale) quarantadue  →  (numerale) 사십이

Examples:
- [m=0] Ci sono esattamente **42** sedie nella stanza.

<sub>tokens: in=7217 out=131</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (numerale) quarantadue  →  (수사) 사십이

Examples:
- [m=0] Ho letto il capitolo **42** del libro.

<sub>tokens: in=3917 out=127</sub>

---

## `3.14` — case=number_symbol

**OLD** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (numerale) tre punto quattordici  →  (numerale) 삼점일사

Examples:
- [m=0] La costante matematica è **3.14** approssimata.

<sub>tokens: in=7224 out=140</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (numerale) tre, punto, uno, quattro  →  (수사) 삼 점 일 사

Examples:
- [m=0] Il valore di **3.14** approssima pi greco.

<sub>tokens: in=3925 out=139</sub>

---

## `@` — case=number_symbol

**OLD** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (expression) chiocciola  →  (expression) 골뱅이

Examples:
- [m=0] L'indirizzo email contiene la **@** tra nome e dominio.

<sub>tokens: in=7161 out=130</sub>

**NEW** — meanings 1, examples 1, syn 0, ant 0 (syn/ant skipped)

Meanings:
- [0] (simbolo) chiocciola, at  →  (기호) 골뱅이

Examples:
- [m=0] Inserisci la tua email con **@** per favore.

<sub>tokens: in=3917 out=129</sub>

---

## Token totals

- OLD: in=341272, out=6191
- NEW: in=204233, out=7349
- delta: in=-40.2%, out=18.7%