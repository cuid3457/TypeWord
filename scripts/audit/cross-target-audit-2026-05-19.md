# Cross-target audit — 2026-05-19

Coverage: 147 (source, target, word) pairs. Model: gpt-4.1-mini.

## Summary metrics

- POS in target POS_BY_LANG list: 134/166 = 80.7%
- Definition free of cross-script leakage: 166/166 = 100.0%
- API errors: 0
- Tokens: in=406178, out=17188

## Failures (32 pairs)

| Source | Target | Word | Issue | POS | Def | Bad chars |
|---|---|---|---|---|---|---|
| ko | zh-CN | `학교` | POS not in target list | `명사` | `学校` | `` |
| ko | de | `학교` | POS not in target list | `명사` | `Schule` | `` |
| ko | it | `학교` | POS not in target list | `명사` | `scuola` | `` |
| ko | ja | `약속` | POS not in target list | `` | `約束, 名詞` | `` |
| ko | zh-CN | `약속` | POS not in target list | `명사` | `约定，承诺` | `` |
| ko | de | `약속` | POS not in target list | `명사` | `Versprechen, Abmachung` | `` |
| ko | it | `약속` | POS not in target list | `명사` | `promessa, impegno` | `` |
| ko | ja | `운영하다` | POS not in target list | `verb` | `運営する` | `` |
| ko | zh-CN | `운영하다` | POS not in target list | `verb` | `经营,管理` | `` |
| ko | es | `운영하다` | POS not in target list | `verb` | `operar, administrar` | `` |
| ko | fr | `운영하다` | POS not in target list | `verb` | `gérer, administrer` | `` |
| ko | de | `운영하다` | POS not in target list | `verb` | `betreiben, führen, verwalten` | `` |
| ko | it | `운영하다` | POS not in target list | `verb` | `gestire, amministrare` | `` |
| en | de | `book` | POS not in target list | `Substantiv` | `Buch` | `` |
| en | it | `book` | POS not in target list | `sostantivo` | `libro` | `` |
| en | de | `check` | POS not in target list | `Substantiv` | `Prüfung, Kontrolle` | `` |
| en | it | `check` | POS not in target list | `sostantivo` | `controllo, verifica` | `` |
| ja | zh-CN | `学校` | POS not in target list | `名詞` | `学校` | `` |
| ja | es | `学校` | POS not in target list | `nombre` | `escuela` | `` |
| ja | de | `学校` | POS not in target list | `名詞` | `Schule` | `` |
| ja | zh-CN | `約束` | POS not in target list | `名詞` | `约定,承诺` | `` |
| ja | de | `約束` | POS not in target list | `名詞` | `Versprechen, Abmachung` | `` |
| ja | de | `食べる` | POS not in target list | `動詞` | `essen` | `` |
| zh-CN | es | `学校` | POS not in target list | `名词` | `escuela, colegio` | `` |
| zh-CN | de | `学校` | POS not in target list | `名词` | `Schule` | `` |
| zh-CN | it | `学校` | POS not in target list | `名词` | `scuola, istituto` | `` |
| zh-CN | es | `朋友` | POS not in target list | `名词` | `amigo, compañero` | `` |
| zh-CN | de | `朋友` | POS not in target list | `名词` | `Freund, Kamerad` | `` |
| zh-CN | it | `朋友` | POS not in target list | `名词` | `amico, amica` | `` |
| zh-CN | es | `经济` | POS not in target list | `nombre` | `economía` | `` |
| zh-CN | de | `经济` | POS not in target list | `名词` | `Wirtschaft, Ökonomie` | `` |
| zh-CN | it | `经济` | POS not in target list | `名词` | `economia, economia politica` | `` |

## Per-pair details

### ko → en: `학교`

- [0] (`noun` ✓) school ✓

### ko → ja: `학교`

- [0] (`名詞` ✓) 学校 ✓

### ko → zh-CN: `학교`

- [0] (`명사` ✗) 学校 ✓

### ko → es: `학교`

- [0] (`sustantivo` ✓) escuela ✓

### ko → fr: `학교`

- [0] (`nom` ✓) école ✓

### ko → de: `학교`

- [0] (`명사` ✗) Schule ✓

### ko → it: `학교`

- [0] (`명사` ✗) scuola ✓

### ko → en: `약속`

- [0] (`noun` ✓) promise, appointment ✓

### ko → ja: `약속`

- [0] (`` ✗) 約束, 名詞 ✓

### ko → zh-CN: `약속`

- [0] (`명사` ✗) 约定，承诺 ✓

### ko → es: `약속`

- [0] (`sustantivo` ✓) promesa, compromiso ✓

### ko → fr: `약속`

- [0] (`nom` ✓) promesse, rendez-vous ✓

### ko → de: `약속`

- [0] (`명사` ✗) Versprechen, Abmachung ✓

### ko → it: `약속`

- [0] (`명사` ✗) promessa, impegno ✓

### ko → en: `운영하다`

- [0] (`verb` ✓) to operate, manage ✓

### ko → ja: `운영하다`

- [0] (`verb` ✗) 運営する ✓

### ko → zh-CN: `운영하다`

- [0] (`verb` ✗) 经营,管理 ✓

### ko → es: `운영하다`

- [0] (`verb` ✗) operar, administrar ✓

### ko → fr: `운영하다`

- [0] (`verb` ✗) gérer, administrer ✓

### ko → de: `운영하다`

- [0] (`verb` ✗) betreiben, führen, verwalten ✓

### ko → it: `운영하다`

- [0] (`verb` ✗) gestire, amministrare ✓

### en → ja: `book`

- [0] (`名詞` ✓) 本, 書籍 ✓
- [1] (`動詞` ✓) 予約する, 予約 ✓

### en → zh-CN: `book`

- [0] (`名词` ✓) 书,册子 ✓
- [1] (`动词` ✓) 预订,预约 ✓

### en → es: `book`

- [0] (`sustantivo` ✓) libro ✓
- [1] (`verbo` ✓) reservar, contratar ✓

### en → fr: `book`

- [0] (`nom` ✓) livre ✓
- [1] (`verbe` ✓) réserver, retenir ✓

### en → de: `book`

- [0] (`Substantiv` ✗) Buch ✓
- [1] (`Verb` ✓) buchen, reservieren ✓

### en → it: `book`

- [0] (`sostantivo` ✗) libro ✓

### en → ja: `happy`

- [0] (`形容詞` ✓) 幸せな, 嬉しい ✓

### en → zh-CN: `happy`

- [0] (`形容词` ✓) 快乐的，幸福的 ✓

### en → es: `happy`

- [0] (`adjetivo` ✓) feliz, contento ✓

### en → fr: `happy`

- [0] (`adjectif` ✓) heureux, content, joyeux ✓

### en → de: `happy`

- [0] (`Adjektiv` ✓) glücklich, froh, zufrieden ✓

### en → it: `happy`

- [0] (`aggettivo` ✓) felice, contento, soddisfatto ✓

### en → ja: `check`

- [0] (`名詞` ✓) 点検、検査 ✓
- [1] (`動詞` ✓) 確認する、検査する ✓

### en → zh-CN: `check`

- [0] (`动词` ✓) 检查,核对 ✓
- [1] (`名词` ✓) 支票,账单 ✓

### en → es: `check`

- [0] (`verbo` ✓) verificar, comprobar ✓
- [1] (`sustantivo` ✓) cheque, comprobante ✓

### en → fr: `check`

- [0] (`verbe` ✓) vérifier, contrôler ✓
- [1] (`nom` ✓) chèque ✓

### en → de: `check`

- [0] (`Substantiv` ✗) Prüfung, Kontrolle ✓
- [1] (`Verb` ✓) prüfen, kontrollieren ✓

### en → it: `check`

- [0] (`sostantivo` ✗) controllo, verifica ✓
- [1] (`verbo` ✓) controllare, verificare ✓

### ja → en: `学校`

- [0] (`noun` ✓) school ✓

### ja → zh-CN: `学校`

- [0] (`名詞` ✗) 学校 ✓

### ja → es: `学校`

- [0] (`nombre` ✗) escuela ✓

### ja → fr: `学校`

- [0] (`nom` ✓) école ✓

### ja → de: `学校`

- [0] (`名詞` ✗) Schule ✓

### ja → it: `学校`

- [0] (`nome` ✓) scuola ✓

### ja → en: `約束`

- [0] (`noun` ✓) promise, agreement ✓

### ja → zh-CN: `約束`

- [0] (`名詞` ✗) 约定,承诺 ✓

### ja → es: `約束`

- [0] (`sustantivo` ✓) promesa, compromiso ✓

### ja → fr: `約束`

- [0] (`nom` ✓) promesse, accord ✓

### ja → de: `約束`

- [0] (`名詞` ✗) Versprechen, Abmachung ✓

### ja → it: `約束`

- [0] (`nome` ✓) promessa, accordo ✓

### ja → en: `食べる`

- [0] (`verb` ✓) to eat ✓

### ja → zh-CN: `食べる`

- [0] (`动词` ✓) 吃，食用 ✓

### ja → es: `食べる`

- [0] (`verbo` ✓) comer ✓

### ja → fr: `食べる`

- [0] (`verbe` ✓) manger ✓

### ja → de: `食べる`

- [0] (`動詞` ✗) essen ✓

### ja → it: `食べる`

- [0] (`verbo` ✓) mangiare ✓

### zh-CN → en: `学校`

- [0] (`noun` ✓) school, educational institution ✓

### zh-CN → ja: `学校`

- [0] (`名詞` ✓) がっこう ✓

### zh-CN → es: `学校`

- [0] (`名词` ✗) escuela, colegio ✓

### zh-CN → fr: `学校`

- [0] (`nom` ✓) école ✓

### zh-CN → de: `学校`

- [0] (`名词` ✗) Schule ✓

### zh-CN → it: `学校`

- [0] (`名词` ✗) scuola, istituto ✓

### zh-CN → en: `朋友`

- [0] (`noun` ✓) friend ✓

### zh-CN → ja: `朋友`

- [0] (`名詞` ✓) 友達 ✓

### zh-CN → es: `朋友`

- [0] (`名词` ✗) amigo, compañero ✓

### zh-CN → fr: `朋友`

- [0] (`nom` ✓) ami, copain ✓

### zh-CN → de: `朋友`

- [0] (`名词` ✗) Freund, Kamerad ✓

### zh-CN → it: `朋友`

- [0] (`名词` ✗) amico, amica ✓

### zh-CN → en: `经济`

- [0] (`noun` ✓) economy, economic ✓

### zh-CN → ja: `经济`

- [0] (`名詞` ✓) けいざい ✓

### zh-CN → es: `经济`

- [0] (`nombre` ✗) economía ✓

### zh-CN → fr: `经济`

- [0] (`nom` ✓) économie ✓

### zh-CN → de: `经济`

- [0] (`名词` ✗) Wirtschaft, Ökonomie ✓

### zh-CN → it: `经济`

- [0] (`名词` ✗) economia, economia politica ✓

### es → en: `hola`

- [0] (`interjection` ✓) hello, hi ✓

### es → ja: `hola`

- [0] (`感嘆詞` ✓) こんにちは、やあ ✓

### es → zh-CN: `hola`

- [0] (`叹词` ✓) 你好 ✓

### es → fr: `hola`

- [0] (`interjection` ✓) salut, bonjour ✓

### es → de: `hola`

- [0] (`Interjektion` ✓) Hallo, Hi, Guten Tag ✓

### es → it: `hola`

- [0] (`interiezione` ✓) ciao, saluto ✓

### es → en: `mañana`

- [0] (`noun` ✓) morning ✓
- [1] (`noun` ✓) tomorrow ✓

### es → ja: `mañana`

- [0] (`名詞` ✓) 明日, あす ✓
- [1] (`名詞` ✓) 朝, 午前 ✓

### es → zh-CN: `mañana`

- [0] (`名词` ✓) 明天 ✓
- [1] (`名词` ✓) 早晨,上午 ✓
- [2] (`名词` ✓) 将来 ✓

### es → fr: `mañana`

- [0] (`nom` ✓) demain ✓
- [1] (`nom` ✓) matin ✓

### es → de: `mañana`

- [0] (`Nomen` ✓) Morgen ✓
- [1] (`Adverb` ✓) morgen ✓

### es → it: `mañana`

- [0] (`avverbio` ✓) domani ✓
- [1] (`nome` ✓) mattina ✓

### es → en: `correr`

- [0] (`verb` ✓) run, race, flow ✓

### es → ja: `correr`

- [0] (`動詞` ✓) 走る,駆ける ✓

### es → zh-CN: `correr`

- [0] (`动词` ✓) 跑，奔跑 ✓

### es → fr: `correr`

- [0] (`verbe` ✓) courir ✓

### es → de: `correr`

- [0] (`Verb` ✓) laufen, rennen ✓

### es → it: `correr`

- [0] (`verbo` ✓) correre ✓

### fr → en: `bonjour`

- [0] (`interjection` ✓) greeting, hello ✓

### fr → ja: `bonjour`

- [0] (`感嘆詞` ✓) こんにちは, おはよう ✓

### fr → zh-CN: `bonjour`

- [0] (`名词` ✓) 问候，您好 ✓

### fr → es: `bonjour`

- [0] (`interjección` ✓) saludo, buenos días ✓

### fr → de: `bonjour`

- [0] (`Interjektion` ✓) Begrüßung, Guten Tag ✓

### fr → it: `bonjour`

- [0] (`interiezione` ✓) saluto, buongiorno ✓

### fr → en: `main`

- [0] (`noun` ✓) hand ✓

### fr → ja: `main`

- [0] (`名詞` ✓) 手 ✓

### fr → zh-CN: `main`

- [0] (`名词` ✓) 手 ✓

### fr → es: `main`

- [0] (`sustantivo` ✓) mano ✓

### fr → de: `main`

- [0] (`Nomen` ✓) Hand ✓

### fr → it: `main`

- [0] (`nome` ✓) mano ✓

### fr → en: `libre`

- [0] (`adjective` ✓) free, available ✓

### fr → ja: `libre`

- [0] (`形容詞` ✓) 自由な、解放された ✓

### fr → zh-CN: `libre`

- [0] (`形容词` ✓) 自由的,空闲的 ✓

### fr → es: `libre`

- [0] (`adjetivo` ✓) libre, disponible, gratuito ✓
- [1] (`sustantivo` ✓) libertad ✓

### fr → de: `libre`

- [0] (`Adjektiv` ✓) frei, unabhängig, ungebunden ✓

### fr → it: `libre`

- [0] (`aggettivo` ✓) libero, disponibile, gratuito ✓

### de → en: `Haus`

- [0] (`noun` ✓) house, building, home ✓

### de → ja: `Haus`

- [0] (`名詞` ✓) 家、住宅、建物 ✓

### de → zh-CN: `Haus`

- [0] (`名词` ✓) 房子,住宅 ✓

### de → es: `Haus`

- [0] (`sustantivo` ✓) casa ✓

### de → fr: `Haus`

- [0] (`nom` ✓) maison, bâtiment, domicile ✓

### de → it: `Haus`

- [0] (`nome` ✓) casa, edificio ✓

### de → en: `gehen`

- [0] (`verb` ✓) to go, walk ✓

### de → ja: `gehen`

- [0] (`動詞` ✓) 行く, 歩く, 進む ✓

### de → zh-CN: `gehen`

- [0] (`动词` ✓) 走，步行 ✓

### de → es: `gehen`

- [0] (`verbo` ✓) ir, caminar ✓

### de → fr: `gehen`

- [0] (`verbe` ✓) aller, marcher ✓

### de → it: `gehen`

- [0] (`verbo` ✓) andare, camminare ✓

### de → en: `Gift`

- [0] (`noun` ✓) poison ✓

### de → ja: `Gift`

- [0] (`名詞` ✓) 毒 ✓

### de → zh-CN: `Gift`

- [0] (`名词` ✓) 毒药, 毒素 ✓

### de → es: `Gift`

- [0] (`sustantivo` ✓) veneno ✓

### de → fr: `Gift`

- [0] (`nom` ✓) poison ✓

### de → it: `Gift`

- [0] (`nome` ✓) veleno ✓

### it → en: `ciao`

- [0] (`interjection` ✓) hello, hi, bye ✓

### it → ja: `ciao`

- [0] (`感嘆詞` ✓) やあ, こんにちは, さようなら ✓

### it → zh-CN: `ciao`

- [0] (`叹词` ✓) 你好,再见 ✓

### it → es: `ciao`

- [0] (`interjección` ✓) saludo, adiós ✓

### it → fr: `ciao`

- [0] (`interjection` ✓) salut, bonjour, au revoir ✓

### it → de: `ciao`

- [0] (`Interjektion` ✓) Hallo, Tschüss ✓

### it → en: `morbido`

- [0] (`adjective` ✓) soft ✓

### it → ja: `morbido`

- [0] (`形容詞` ✓) 柔らかい ✓

### it → zh-CN: `morbido`

- [0] (`形容词` ✓) 柔软的，软的 ✓

### it → es: `morbido`

- [0] (`adjetivo` ✓) suave, blando, tierno ✓

### it → fr: `morbido`

- [0] (`adjectif` ✓) doux, moelleux, tendre ✓

### it → de: `morbido`

- [0] (`Adjektiv` ✓) weich, sanft, zart ✓

### it → en: `grande`

- [0] (`adjective` ✓) big, large, great ✓

### it → ja: `grande`

- [0] (`形容詞` ✓) 大きい, 偉大な ✓

### it → zh-CN: `grande`

- [0] (`形容词` ✓) 大, 巨大, 伟大 ✓

### it → es: `grande`

- [0] (`adjetivo` ✓) grande, importante, mayor ✓

### it → fr: `grande`

- [0] (`adjectif` ✓) grand, gros, important ✓

### it → de: `grande`

- [0] (`Adjektiv` ✓) groß, bedeutend, wichtig ✓
