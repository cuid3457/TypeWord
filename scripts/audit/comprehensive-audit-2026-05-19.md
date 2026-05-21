# Comprehensive cross-pair audit — 2026-05-19

- Pairs: 2912, errors: 0
- Wall time: 1392s, tokens in=14194266 out=523229

## Aggregate quality metrics

| Dimension | Pass | Total | % |
|---|---|---|---|
| POS in target list (raw AI) | 3074 | 3711 | 82.83% |
| POS in target list (post-stitch user-facing) | 3643 | 3711 | 98.17% |
| Def script clean (Latin target only check) | 3671 | 3711 | 98.92% |
| Marker exactly 1 pair | 3545 | 3560 | 99.58% |
| Marker contains headword | 3325 | 3560 | 93.40% |
| Example terminal punct | 3553 | 3560 | 99.80% |
| Syn = headword (fail count) | 2 | — | — |
| Syn parenthetical fab (fail count) | 0 | — | — |
| Syn cross-array leak (fail count) | 0 | — | — |
| Ant = headword (fail count) | 0 | — | — |
| Ant parenthetical fab (fail count) | 0 | — | — |
| Ant cross-array leak (fail count) | 0 | — | — |

## POS accuracy (post-stitch) by source → target

| Source ↓ / Target → | en | ja | zh-CN | es | fr | de | it |
|---|---|---|---|---|---|---|---|
| **ko** | 100.00% | 83.61% | 89.66% | 96.67% | 92.98% | 98.31% | 94.44% |
| **en** | — | 100.00% | 98.63% | 100.00% | 100.00% | 80.28% | 100.00% |
| **ja** | 98.57% | — | 97.14% | 100.00% | 100.00% | 94.20% | 100.00% |
| **zh-CN** | 100.00% | 95.77% | — | 92.96% | 100.00% | 94.20% | 97.06% |
| **es** | 100.00% | 100.00% | 100.00% | — | 100.00% | 100.00% | 100.00% |
| **fr** | 97.14% | 98.51% | 100.00% | 98.48% | — | 100.00% | 98.46% |
| **de** | 100.00% | 98.28% | 100.00% | 100.00% | 100.00% | — | 100.00% |
| **it** | 100.00% | 100.00% | 100.00% | 100.00% | 100.00% | 100.00% | — |

## Marker quality by category (across all source × target pairs)

| Category | Marker 1-pair | Marker contains headword |
|---|---|---|
| common | 100.00% (1018/1018) | 80.16% (816/1018) |
| polysemy | 100.00% (1111/1111) | 99.91% (1110/1111) |
| typos | 98.73% (310/314) | 96.82% (304/314) |
| edges | 98.15% (531/541) | 97.60% (528/541) |
| numbers | 100.00% (332/332) | 97.59% (324/332) |
| propers | 99.59% (243/244) | 99.59% (243/244) |

## Sample failures (max 30 entries)

### ko → en: `가다` (case=verb_adj_da, cat=common)

canonical: [0] (동사) 가다
translated: [0] (verb) to go
example[0]: 우리는 내일 학교에 **간다**.
example[0]: 민수는 어제 도서관에 **갔어요**.
example[0]: 친구들이 파티에 **갈게요**.
syn:  | ant: 오다

### ko → ja: `가다` (case=verb_adj_da, cat=common)

canonical: [0] (동사) 가다
translated: [0] (verb) 行く
example[0]: 민수는 학교에 **간다**.
example[0]: 우리는 내일 시장에 **갈게요**.
example[0]: 친구들이 도서관에 공부하러 **갔어요**.
syn:  | ant: 오다

### ko → zh-CN: `가다` (case=verb_adj_da, cat=common)

canonical: [0] (동사) 가다
translated: [0] (verb) 去, 走
example[0]: 우리는 내일 서울에 **간다**.
example[0]: 민수는 학교에 **갔어요**.
example[0]: 친구들과 같이 영화관에 **갈게요**.
syn:  | ant: 오다

### ko → es: `가다` (case=verb_adj_da, cat=common)

canonical: [0] (동사) 가다
translated: [0] (verb) ir
example[0]: 우리는 내일 서울에 **간다**.
example[0]: 민수가 학교에 늦게 **갔어요**.
example[0]: 친구들이 공원으로 산책하러 **갈게요**.
syn:  | ant: 오다

### ko → fr: `가다` (case=verb_adj_da, cat=common)

canonical: [0] (동사) 가다
translated: [0] (verb) aller
example[0]: 우리는 내일 학교에 **간다**.
example[0]: 민수는 어제 친구 집에 **갔어요**.
example[0]: 비가 오니까 집으로 **갈게요**.
syn:  | ant: 오다

### ko → de: `가다` (case=verb_adj_da, cat=common)

canonical: [0] (동사) 가다
translated: [0] (verb) gehen, fahren
example[0]: 우리는 내일 시장에 **가요**.
example[0]: 민수는 학교에 늦게 **갔어요**.
example[0]: 친구들이 집에 올 때 나는 먼저 **간다**.
syn:  | ant: 오다

### ko → it: `가다` (case=verb_adj_da, cat=common)

canonical: [0] (동사) 가다
translated: [0] (verb) andare
example[0]: 우리는 내일 서울에 **간다**.
example[0]: 민수는 도서관에서 공부하러 **갔어요**.
example[0]: 친구들이 집에 올 때까지 나는 먼저 **갈게요**.
syn:  | ant: 

### ko → zh-CN: `사랑` (case=simple_word, cat=common)

canonical: [0] (명사) 사랑, 명사
translated: [0] (undefined) 爱, 名词
syn:  | ant: 

### ko → ja: `시간` (case=simple_word, cat=common)

canonical: [0] (명사) 시간, 명사; [1] (명사) 시간대, 명사
translated: [0] (undefined) 時間, 名詞; [1] (undefined) 時間帯, 名詞
syn:  | ant: 

### ko → zh-CN: `시간` (case=simple_word, cat=common)

canonical: [0] (명사) 시간
translated: [0] (undefined) 时间, 명사
syn:  | ant: 

### ko → en: `오다` (case=verb_adj_da, cat=common)

canonical: [0] (동사) 오다
translated: [0] (verb) to come
example[0]: 비가 내일 **온다**.
example[0]: 친구들이 학교에 **왔어요**.
example[0]: 민수가 집에 **올게요**.
syn:  | ant: 

### ko → ja: `오다` (case=verb_adj_da, cat=common)

canonical: [0] (동사) 오다
translated: [0] (verb) 来る
example[0]: 비가 내일 **온다**.
example[0]: 친구들이 학교에 **왔어요**.
example[0]: 수진이가 집에 **올게요**.
syn:  | ant: 

### ko → zh-CN: `오다` (case=verb_adj_da, cat=common)

canonical: [0] (동사) 오다
translated: [0] (verb) 来
example[0]: 비가 내일 **온다**.
example[0]: 친구들이 학교에 **왔다**.
example[0]: 민수가 집에 **올게요**.
syn:  | ant: 

### ko → es: `오다` (case=verb_adj_da, cat=common)

canonical: [0] (동사) 오다
translated: [0] (verb) venir
example[0]: 친구들이 내일 학교에 **온다**.
example[0]: 비가 많이 와서 집에 **왔어요**.
example[0]: 기차가 오후에 역에 **올게요**.
syn:  | ant: 

### ko → fr: `오다` (case=verb_adj_da, cat=common)

canonical: [0] (동사) 오다
translated: [0] (verb) venir
example[0]: 비가 오늘 밤에 **온다**.
example[0]: 친구들이 학교에 **왔어요**.
example[0]: 내일 가족이 집에 **올게요**.
syn:  | ant: 가다

### ko → de: `오다` (case=verb_adj_da, cat=common)

canonical: [0] (동사) 오다
translated: [0] (verb) kommen
example[0]: 비가 지금 **온다**.
example[0]: 친구들이 학교에 **왔어요**.
example[0]: 내일 아침에 기차가 **올게요**.
syn:  | ant: 가다

### ko → it: `오다` (case=verb_adj_da, cat=common)

canonical: [0] (동사) 오다
translated: [0] (verb) venire
example[0]: 비가 내일 **온다**.
example[0]: 친구들이 학교에 **왔어요**.
example[0]: 민수는 집에 빨리 **올게요**.
syn:  | ant: 

### ko → en: `보다` (case=verb_adj_da, cat=common)

canonical: [0] (동사) 보다, 바라보다; [1] (동사) 비교하다
translated: [0] (verb) to see, look at; [1] (verb) to compare
example[0]: 우리는 영화를 **봐요**.
example[1]: 이 제품을 저것과 **비교해 봅니다**.
syn: 바라보다 | ant: 

### ko → es: `보다` (case=verb_adj_da, cat=common)

canonical: [0] (동사) 보다, 관찰하다; [1] (동사) 비교하다
translated: [0] (verb) ver, mirar; [1] (verb) comparar
example[0]: 우리는 별을 **본다** 밤에.
example[1]: 이 책과 저 책을 **비교해 봤어요**.
syn: 관찰하다 | ant: 

### ko → de: `보다` (case=verb_adj_da, cat=common)

canonical: [0] (동사) 보다
translated: [0] (verb) sehen, anschauen
example[0]: 우리는 영화를 **봐요**.
syn:  | ant: 

### ko → zh-CN: `주다` (case=verb_adj_da, cat=common)

canonical: [0] (동사) to give
translated: [0] (verb) 给予,给
example[0]: 선생님이 학생들에게 책을 **줬어요**.
syn:  | ant: 

### ko → es: `주다` (case=verb_adj_da, cat=common)

canonical: [0] (동사) 주다
translated: [0] (verb) dar
example[0]: 선생님이 학생들에게 책을 **줬어요**.
syn:  | ant: 

### ko → zh-CN: `거리` (case=simple_word, cat=polysemy)

canonical: [0] (명사) 길, 거리, 도로; [1] (명사) 두 점 사이 간격
translated: [0] (undefined) 街道, 名词; [1] (undefined) 距离, 名词
syn:  | ant: 

### ko → ja: `갓어요` (case=simple_word, cat=typos)

canonical: [0] (동사) 가다의 과거형, 동사
translated: [0] (undefined) 行った, 動詞

### ko → ja: `회새` (case=simple_word, cat=typos)

canonical: [0] (명사) 갈매기, 명사
translated: [0] (undefined) カモメ, 名詞
syn:  | ant: 

### ko → ja: `캐나다` (case=simple_word, cat=edges)

canonical: [0] (고유명사) 캐나다, 국가
translated: [0] (undefined) Canada, 国
syn:  | ant: 

### ko → ja: `42` (case=number_symbol, cat=numbers)

canonical: [0] (표현) 사십이
translated: [0] (表現) 사십이
example[0]: 책은 **사십이** 쪽에 있어요.

### ko → ja: `1984` (case=number_symbol, cat=numbers)

canonical: [0] (표현) 일구팔사
translated: [0] (表現) いちきゅうはちよん
example[0]: 우리는 **일**구팔사에 모였어요.

### ko → es: `@` (case=number_symbol, cat=numbers)

canonical: [0] (기호) 골뱅이
translated: [0] (símbolo) arroba, símbolo de correo
example[0]: 이메일 주소에 **골뱅이**가 있어요.

### ko → en: `100` (case=number_symbol, cat=numbers)

canonical: [0] (표현) 일백
translated: [0] (expression) one hundred
example[0]: **백** 원이 필요해요.
