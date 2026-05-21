/**
 * Test word lists per source language for the v2 matrix sweep.
 *
 * 200 words per source language, distributed across categories so the
 * validator can grade behavior by category. Categories:
 *
 *   common         (40) — daily-life vocabulary (top-frequency)
 *   polysemy       (30) — homonyms with multiple senses
 *   idiom          (25) — fixed expressions / proverbs
 *   number_expr    (20) — numerals, math expressions, symbols
 *   sensitive      (20) — Korea-position disputes, political figures, atrocity events
 *   typo           (15) — intentional misspellings of common words
 *   sentence       (10) — full sentences (should be rejected with note="sentence")
 *   rare           (15) — archaic / literary / low-frequency
 *   false_friend   (15) — words that look like other-language words but differ
 *   multi_word     (10) — compound phrases, phrasal verbs, set expressions
 */

export type Category =
  | 'common' | 'polysemy' | 'idiom' | 'number_expr'
  | 'sensitive' | 'typo' | 'sentence' | 'rare'
  | 'false_friend' | 'multi_word';

export interface TestWord { word: string; category: Category }

// Helper to type a list compactly
const w = (word: string, category: Category): TestWord => ({ word, category });

export const WORDS_BY_SOURCE: Record<string, TestWord[]> = {
  // ── English (200) ──
  en: [
    // common (40)
    w('book','common'), w('water','common'), w('time','common'), w('love','common'), w('sky','common'),
    w('food','common'), w('home','common'), w('school','common'), w('work','common'), w('family','common'),
    w('friend','common'), w('day','common'), w('night','common'), w('hand','common'), w('eye','common'),
    w('mother','common'), w('father','common'), w('child','common'), w('city','common'), w('car','common'),
    w('run','common'), w('eat','common'), w('drink','common'), w('sleep','common'), w('walk','common'),
    w('see','common'), w('hear','common'), w('think','common'), w('know','common'), w('believe','common'),
    w('beautiful','common'), w('strong','common'), w('small','common'), w('big','common'), w('hot','common'),
    w('cold','common'), w('happy','common'), w('sad','common'), w('quickly','common'), w('slowly','common'),
    // polysemy (30)
    w('bank','polysemy'), w('light','polysemy'), w('spring','polysemy'), w('bat','polysemy'), w('bow','polysemy'),
    w('chair','polysemy'), w('crane','polysemy'), w('match','polysemy'), w('mine','polysemy'), w('mole','polysemy'),
    w('park','polysemy'), w('pitch','polysemy'), w('plant','polysemy'), w('present','polysemy'), w('right','polysemy'),
    w('rock','polysemy'), w('saw','polysemy'), w('seal','polysemy'), w('sole','polysemy'), w('star','polysemy'),
    w('state','polysemy'), w('strike','polysemy'), w('table','polysemy'), w('train','polysemy'), w('trip','polysemy'),
    w('watch','polysemy'), w('wave','polysemy'), w('well','polysemy'), w('yard','polysemy'), w('fair','polysemy'),
    // idiom (25)
    w('break a leg','idiom'), w('piece of cake','idiom'), w('spill the beans','idiom'), w('kick the bucket','idiom'),
    w('hit the road','idiom'), w('hit the books','idiom'), w('cost an arm and a leg','idiom'), w('bite the bullet','idiom'),
    w('let the cat out of the bag','idiom'), w('once in a blue moon','idiom'), w('under the weather','idiom'),
    w('the ball is in your court','idiom'), w('beat around the bush','idiom'), w('call it a day','idiom'),
    w('cut to the chase','idiom'), w('every cloud has a silver lining','idiom'), w('get out of hand','idiom'),
    w('go down in flames','idiom'), w('keep your chin up','idiom'), w('lose your marbles','idiom'),
    w('on the same page','idiom'), w('pull yourself together','idiom'), w('see eye to eye','idiom'),
    w('through thick and thin','idiom'), w('time flies','idiom'),
    // number_expr (20)
    w('1','number_expr'), w('7','number_expr'), w('42','number_expr'), w('100','number_expr'), w('1000','number_expr'),
    w('1000000','number_expr'), w('3.14','number_expr'), w('1/2','number_expr'), w('3/4','number_expr'),
    w('2+2','number_expr'), w('5*6','number_expr'), w('10-3','number_expr'), w('?','number_expr'), w('!','number_expr'),
    w('@','number_expr'), w('#','number_expr'), w('&','number_expr'), w('%','number_expr'), w('...','number_expr'), w('$','number_expr'),
    // sensitive (20)
    w('Sea of Japan','sensitive'), w('Takeshima','sensitive'), w('Dokdo','sensitive'), w('Trump','sensitive'),
    w('Putin','sensitive'), w('Xi Jinping','sensitive'), w('Hitler','sensitive'), w('Stalin','sensitive'),
    w('Holocaust','sensitive'), w('Nanjing Massacre','sensitive'), w('Taiwan','sensitive'), w('Tibet','sensitive'),
    w('Hong Kong','sensitive'), w('Crimea','sensitive'), w('Kashmir','sensitive'), w('Jerusalem','sensitive'),
    w('Kosovo','sensitive'), w('Jesus','sensitive'), w('Muhammad','sensitive'), w('comfort women','sensitive'),
    // typo (15)
    w('teh','typo'), w('recieve','typo'), w('definately','typo'), w('seperate','typo'), w('untill','typo'),
    w('begining','typo'), w('occured','typo'), w('publically','typo'), w('grammer','typo'), w('priviledge','typo'),
    w('embarass','typo'), w('cemetary','typo'), w('refered','typo'), w('foriegn','typo'), w('wierd','typo'),
    // sentence (10) — should be rejected
    w("I went to the store yesterday and bought some apples",'sentence'),
    w("Can you please help me with this problem",'sentence'),
    w("The quick brown fox jumps over the lazy dog",'sentence'),
    w("What is your name",'sentence'),
    w("It was a dark and stormy night",'sentence'),
    w("He believes the answer is hidden in the book",'sentence'),
    w("Why does the chicken cross the road",'sentence'),
    w("They decided to leave early in the morning",'sentence'),
    w("She told me she was leaving tomorrow",'sentence'),
    w("Where are we going for dinner tonight",'sentence'),
    // rare (15)
    w('defenestration','rare'), w('petrichor','rare'), w('sonder','rare'), w('mellifluous','rare'),
    w('perspicacious','rare'), w('quintessential','rare'), w('sesquipedalian','rare'), w('serendipity','rare'),
    w('aplomb','rare'), w('ephemeral','rare'), w('halcyon','rare'), w('ineffable','rare'),
    w('luminescence','rare'), w('penumbra','rare'), w('vicissitude','rare'),
    // false_friend (15)
    w('actual','false_friend'),    // ≠ Spanish "actual" (current)
    w('gift','false_friend'),      // ≠ German "Gift" (poison)
    w('library','false_friend'),   // ≠ Spanish "librería" (bookstore)
    w('sensible','false_friend'),  // ≠ French "sensible" (sensitive)
    w('embarrassed','false_friend'), // ≠ Spanish "embarazada" (pregnant)
    w('chef','false_friend'),       // ≠ French "chef" (boss)
    w('lecture','false_friend'),    // ≠ French "lecture" (reading)
    w('coin','false_friend'),       // ≠ French "coin" (corner)
    w('pain','false_friend'),       // ≠ French "pain" (bread)
    w('rest','false_friend'),       // ≠ Spanish "resto" (the rest of...)
    w('exit','false_friend'),       // ≠ Spanish "éxito" (success)
    w('molest','false_friend'),     // ≠ Spanish "molestar" (annoy)
    w('preservative','false_friend'), // ≠ Romance "preservativo" (condom)
    w('arena','false_friend'),      // ≠ Spanish "arena" (sand)
    w('compass','false_friend'),    // ≠ Spanish "compás" (musical beat)
    // multi_word (10)
    w('look up','multi_word'), w('give in','multi_word'), w('take off','multi_word'), w('run into','multi_word'),
    w('put up with','multi_word'), w('break down','multi_word'), w('come up','multi_word'),
    w('get along','multi_word'), w('turn down','multi_word'), w('back up','multi_word'),
  ],

  // ── Korean (200) ──
  ko: [
    // common (40)
    w('사과','common'), w('하늘','common'), w('사랑','common'), w('시간','common'), w('꿈','common'),
    w('학교','common'), w('집','common'), w('음식','common'), w('물','common'), w('가족','common'),
    w('친구','common'), w('아침','common'), w('점심','common'), w('저녁','common'), w('밤','common'),
    w('어머니','common'), w('아버지','common'), w('아이','common'), w('도시','common'), w('자동차','common'),
    w('달리다','common'), w('먹다','common'), w('마시다','common'), w('자다','common'), w('걷다','common'),
    w('보다','common'), w('듣다','common'), w('생각하다','common'), w('알다','common'), w('믿다','common'),
    w('아름답다','common'), w('강하다','common'), w('작다','common'), w('크다','common'), w('뜨겁다','common'),
    w('차갑다','common'), w('행복하다','common'), w('슬프다','common'), w('빠르게','common'), w('천천히','common'),
    // polysemy (30) — true Korean homonyms
    w('배','polysemy'), w('눈','polysemy'), w('밤','polysemy'), w('말','polysemy'), w('다리','polysemy'),
    w('차','polysemy'), w('손','polysemy'), w('머리','polysemy'), w('발','polysemy'), w('길','polysemy'),
    w('병','polysemy'), w('상','polysemy'), w('절','polysemy'), w('정','polysemy'), w('체','polysemy'),
    w('빛','polysemy'), w('점','polysemy'), w('맛','polysemy'), w('상자','polysemy'), w('인사','polysemy'),
    w('이','polysemy'), w('수','polysemy'), w('과','polysemy'), w('의','polysemy'), w('전','polysemy'),
    w('기','polysemy'), w('대','polysemy'), w('만','polysemy'), w('내','polysemy'), w('일','polysemy'),
    // idiom (25)
    w('식은 죽 먹기','idiom'), w('눈 코 뜰 새 없다','idiom'), w('발 없는 말이 천 리 간다','idiom'),
    w('소 잃고 외양간 고친다','idiom'), w('가는 말이 고와야 오는 말이 곱다','idiom'),
    w('티끌 모아 태산','idiom'), w('우물 안 개구리','idiom'), w('낮말은 새가 듣고 밤말은 쥐가 듣는다','idiom'),
    w('백문이 불여일견','idiom'), w('호랑이도 제 말 하면 온다','idiom'),
    w('등잔 밑이 어둡다','idiom'), w('금강산도 식후경','idiom'), w('빈 수레가 요란하다','idiom'),
    w('세 살 버릇 여든까지 간다','idiom'), w('하늘의 별 따기','idiom'),
    w('고래 싸움에 새우 등 터진다','idiom'), w('가지 많은 나무 바람 잘 날 없다','idiom'),
    w('첫술에 배부르랴','idiom'), w('찬물도 위 아래가 있다','idiom'),
    w('도둑이 제 발 저린다','idiom'), w('서당개 삼 년이면 풍월을 읊는다','idiom'),
    w('낫 놓고 기역자도 모른다','idiom'), w('뛰는 놈 위에 나는 놈 있다','idiom'),
    w('하나를 들으면 열을 안다','idiom'), w('말이 씨가 된다','idiom'),
    // number_expr (20)
    w('1','number_expr'), w('7','number_expr'), w('42','number_expr'), w('100','number_expr'), w('1000','number_expr'),
    w('1000000','number_expr'), w('3.14','number_expr'), w('1/2','number_expr'), w('3/4','number_expr'),
    w('2+2','number_expr'), w('5*6','number_expr'), w('10-3','number_expr'), w('?','number_expr'), w('!','number_expr'),
    w('백만','number_expr'), w('일억','number_expr'), w('세','number_expr'), w('다섯','number_expr'), w('%','number_expr'), w('@','number_expr'),
    // sensitive (20) — Korea-position + global
    w('일본해','sensitive'), w('다케시마','sensitive'), w('독도','sensitive'), w('동해','sensitive'),
    w('위안부','sensitive'), w('김치','sensitive'), w('한복','sensitive'), w('백두산','sensitive'),
    w('장백산','sensitive'), w('트럼프','sensitive'), w('푸틴','sensitive'), w('시진핑','sensitive'),
    w('히틀러','sensitive'), w('홀로코스트','sensitive'), w('난징대학살','sensitive'), w('대만','sensitive'),
    w('티베트','sensitive'), w('홍콩','sensitive'), w('예수','sensitive'), w('세종대왕','sensitive'),
    // typo (15) — Korean common typos
    w('안녕하세욧','typo'), w('감사합미다','typo'), w('갑사합니다','typo'), w('미앙하다','typo'),
    w('맜있다','typo'), w('있슴니다','typo'), w('네웅','typo'), w('학굣','typo'),
    w('지근','typo'), w('어재','typo'), w('재미잇다','typo'), w('마니','typo'),
    w('됬다','typo'), w('어떻해','typo'), w('웬일','typo'),
    // sentence (10)
    w('나는 어제 가게에 가서 사과를 샀어요','sentence'),
    w('이 문제를 어떻게 풀어야 할지 모르겠어요','sentence'),
    w('오늘 날씨가 정말 좋네요','sentence'),
    w('당신의 이름은 무엇인가요','sentence'),
    w('내일 학교에 갈 수 있을까요','sentence'),
    w('우리는 함께 영화를 보러 갔어요','sentence'),
    w('그 책은 매우 흥미로웠다','sentence'),
    w('저녁에 친구를 만나기로 했어요','sentence'),
    w('이 일은 정말로 중요한 결정입니다','sentence'),
    w('한국어를 공부한 지 얼마나 되셨어요','sentence'),
    // rare (15)
    w('미쁘다','rare'), w('갈무리','rare'), w('아득바득','rare'), w('지청구','rare'),
    w('나래','rare'), w('아라','rare'), w('가람','rare'), w('새벽녘','rare'),
    w('도란도란','rare'), w('소슬하다','rare'), w('속절없다','rare'), w('애오라지','rare'),
    w('애끊다','rare'), w('지즐대다','rare'), w('가시버시','rare'),
    // false_friend (15) — Korean words that look like English/Sino words
    w('아파트','false_friend'),  // apartment but only refers to flat-building
    w('서비스','false_friend'),  // "free gift" not "service"
    w('컨닝','false_friend'),    // "cheating on test" not "cunning"
    w('미팅','false_friend'),    // "blind date" not "business meeting"
    w('펜션','false_friend'),    // "vacation cottage" not "pension"
    w('샤프','false_friend'),    // "mechanical pencil" not "sharp"
    w('호치키스','false_friend'),// "stapler" (brand-derived)
    w('스킨십','false_friend'),  // konglish for physical affection
    w('파이팅','false_friend'),  // konglish for "go go!"
    w('헬스','false_friend'),    // konglish for gym
    w('샌드위치','false_friend'),// proper loan but in Korean lookup context
    w('컴퓨터','false_friend'),  // loan, ok
    w('아이쇼핑','false_friend'),// konglish "window shopping"
    w('한손','false_friend'),    // ambiguous
    w('백수','false_friend'),    // homonym (100/jobless person)
    // multi_word (10)
    w('수고하셨습니다','multi_word'), w('잘 부탁드립니다','multi_word'), w('생일 축하해요','multi_word'),
    w('안녕히 가세요','multi_word'), w('잘 다녀오세요','multi_word'),
    w('알아 듣다','multi_word'), w('마음에 들다','multi_word'), w('도와 주다','multi_word'),
    w('한 번 더','multi_word'), w('잘 모르겠어요','multi_word'),
  ],

  // ── Japanese (200) ──
  ja: [
    // common (40)
    w('りんご','common'), w('本','common'), w('時間','common'), w('愛','common'), w('空','common'),
    w('学校','common'), w('家','common'), w('食べ物','common'), w('水','common'), w('家族','common'),
    w('友達','common'), w('朝','common'), w('昼','common'), w('夜','common'), w('夢','common'),
    w('母','common'), w('父','common'), w('子供','common'), w('都市','common'), w('車','common'),
    w('走る','common'), w('食べる','common'), w('飲む','common'), w('寝る','common'), w('歩く','common'),
    w('見る','common'), w('聞く','common'), w('考える','common'), w('知る','common'), w('信じる','common'),
    w('美しい','common'), w('強い','common'), w('小さい','common'), w('大きい','common'), w('熱い','common'),
    w('寒い','common'), w('嬉しい','common'), w('悲しい','common'), w('速い','common'), w('遅い','common'),
    // polysemy (30) — Japanese homonyms
    w('橋','polysemy'), w('箸','polysemy'), w('端','polysemy'), w('神','polysemy'), w('紙','polysemy'),
    w('髪','polysemy'), w('雨','polysemy'), w('飴','polysemy'), w('海','polysemy'), w('熊','polysemy'),
    w('暑い','polysemy'), w('熱い','polysemy'), w('厚い','polysemy'), w('生','polysemy'), w('下','polysemy'),
    w('上','polysemy'), w('行','polysemy'), w('明日','polysemy'), w('今日','polysemy'), w('間','polysemy'),
    w('時','polysemy'), w('色','polysemy'), w('国','polysemy'), w('白','polysemy'), w('赤','polysemy'),
    w('木','polysemy'), w('森','polysemy'), w('林','polysemy'), w('花','polysemy'), w('鼻','polysemy'),
    // idiom (25)
    w('猫の手も借りたい','idiom'), w('井の中の蛙','idiom'), w('馬の耳に念仏','idiom'),
    w('鬼に金棒','idiom'), w('一石二鳥','idiom'), w('七転び八起き','idiom'),
    w('猿も木から落ちる','idiom'), w('棚から牡丹餅','idiom'), w('十人十色','idiom'),
    w('百聞は一見に如かず','idiom'), w('石の上にも三年','idiom'), w('花より団子','idiom'),
    w('焼け石に水','idiom'), w('縁の下の力持ち','idiom'), w('絵に描いた餅','idiom'),
    w('泣きっ面に蜂','idiom'), w('蛇の道は蛇','idiom'), w('餅は餅屋','idiom'),
    w('能ある鷹は爪を隠す','idiom'), w('郷に入っては郷に従え','idiom'),
    w('案ずるより産むが易し','idiom'), w('情けは人の為ならず','idiom'),
    w('臭い物に蓋','idiom'), w('善は急げ','idiom'), w('時は金なり','idiom'),
    // number_expr (20)
    w('1','number_expr'), w('7','number_expr'), w('42','number_expr'), w('100','number_expr'), w('1000','number_expr'),
    w('一','number_expr'), w('七','number_expr'), w('百','number_expr'), w('千','number_expr'), w('万','number_expr'),
    w('3.14','number_expr'), w('1/2','number_expr'), w('3/4','number_expr'),
    w('2+2','number_expr'), w('5*6','number_expr'), w('10-3','number_expr'), w('?','number_expr'), w('!','number_expr'),
    w('%','number_expr'), w('@','number_expr'),
    // sensitive (20)
    w('日本海','sensitive'), w('竹島','sensitive'), w('独島','sensitive'), w('東海','sensitive'),
    w('慰安婦','sensitive'), w('キムチ','sensitive'), w('韓服','sensitive'), w('白頭山','sensitive'),
    w('トランプ','sensitive'), w('プーチン','sensitive'), w('習近平','sensitive'), w('ヒトラー','sensitive'),
    w('ホロコースト','sensitive'), w('南京大虐殺','sensitive'), w('台湾','sensitive'), w('チベット','sensitive'),
    w('香港','sensitive'), w('靖国神社','sensitive'), w('イエス','sensitive'), w('ムハンマド','sensitive'),
    // typo (15) — common Japanese typos (kana / kanji substitution)
    w('ありがとお','typo'), w('こんにちわ','typo'), w('すいません','typo'), w('わたくしわ','typo'),
    w('かのうじょ','typo'), w('しょおかい','typo'), w('にほんごお','typo'), w('おねがいします','typo'),
    w('にほん語','typo'), w('日本ご','typo'), w('かんいくに','typo'), w('じゅうがつ','typo'),
    w('わかんない','typo'), w('みれない','typo'), w('はやくする','typo'),
    // sentence (10)
    w('昨日、私は店に行ってりんごを買いました','sentence'),
    w('この問題をどう解決すればよいか分かりません','sentence'),
    w('今日は天気がとても良いですね','sentence'),
    w('あなたの名前は何ですか','sentence'),
    w('明日学校に行けますか','sentence'),
    w('私たちは一緒に映画を見に行きました','sentence'),
    w('その本はとても面白かった','sentence'),
    w('夕方友達と会う約束をしました','sentence'),
    w('この仕事は本当に重要な決定です','sentence'),
    w('日本語を勉強してどのくらいですか','sentence'),
    // rare (15)
    w('黎明','rare'), w('凜然','rare'), w('燦然','rare'), w('幽玄','rare'),
    w('侘び寂び','rare'), w('儚い','rare'), w('刹那','rare'), w('煌めく','rare'),
    w('懐かしい','rare'), w('木漏れ日','rare'), w('森閑','rare'), w('蒼穹','rare'),
    w('黄昏','rare'), w('清廉潔白','rare'), w('泰然自若','rare'),
    // false_friend (15)
    w('マンション','false_friend'),  // apartment (not mansion)
    w('スマート','false_friend'),    // thin/slender (not smart)
    w('クレーム','false_friend'),    // complaint (not claim)
    w('カンニング','false_friend'),  // cheating (not cunning)
    w('ナイーブ','false_friend'),    // sensitive (not naive)
    w('テンション','false_friend'),  // mood/energy (not tension)
    w('プリント','false_friend'),    // handout (not just print)
    w('ハイテンション','false_friend'), // high energy
    w('リフォーム','false_friend'),  // renovation
    w('サラリーマン','false_friend'),// office worker
    w('OL','false_friend'),
    w('ワンピース','false_friend'),  // dress (not "one piece")
    w('バイキング','false_friend'),  // buffet (from Vikings)
    w('ペーパードライバー','false_friend'),
    w('コンセント','false_friend'),  // outlet (not consent)
    // multi_word (10)
    w('ありがとうございます','multi_word'), w('お疲れ様でした','multi_word'),
    w('お元気ですか','multi_word'), w('よろしくお願いします','multi_word'),
    w('お先に失礼します','multi_word'), w('いただきます','multi_word'),
    w('ごちそうさまでした','multi_word'), w('お邪魔します','multi_word'),
    w('お世話になりました','multi_word'), w('お疲れ様','multi_word'),
  ],

  // ── Chinese Simplified (200) ──
  'zh-CN': [
    // common (40)
    w('苹果','common'), w('水','common'), w('时间','common'), w('爱','common'), w('天','common'),
    w('学校','common'), w('家','common'), w('食物','common'), w('家庭','common'), w('朋友','common'),
    w('早上','common'), w('晚上','common'), w('夜','common'), w('梦','common'), w('书','common'),
    w('妈妈','common'), w('爸爸','common'), w('孩子','common'), w('城市','common'), w('车','common'),
    w('跑','common'), w('吃','common'), w('喝','common'), w('睡','common'), w('走','common'),
    w('看','common'), w('听','common'), w('想','common'), w('知道','common'), w('相信','common'),
    w('美丽','common'), w('强','common'), w('小','common'), w('大','common'), w('热','common'),
    w('冷','common'), w('开心','common'), w('伤心','common'), w('快','common'), w('慢','common'),
    // polysemy (30) — Chinese homonyms (often via tones / contexts)
    w('行','polysemy'), w('长','polysemy'), w('好','polysemy'), w('重','polysemy'), w('便','polysemy'),
    w('得','polysemy'), w('觉','polysemy'), w('地','polysemy'), w('了','polysemy'), w('着','polysemy'),
    w('过','polysemy'), w('为','polysemy'), w('的','polysemy'), w('和','polysemy'), w('还','polysemy'),
    w('给','polysemy'), w('家','polysemy'), w('打','polysemy'), w('开','polysemy'), w('上','polysemy'),
    w('下','polysemy'), w('中','polysemy'), w('生','polysemy'), w('日','polysemy'), w('月','polysemy'),
    w('年','polysemy'), w('马','polysemy'), w('车','polysemy'), w('国','polysemy'), w('心','polysemy'),
    // idiom (25) — 成语
    w('画蛇添足','idiom'), w('塞翁失马','idiom'), w('守株待兔','idiom'), w('对牛弹琴','idiom'),
    w('井底之蛙','idiom'), w('狐假虎威','idiom'), w('班门弄斧','idiom'), w('掩耳盗铃','idiom'),
    w('望梅止渴','idiom'), w('刻舟求剑','idiom'), w('一石二鸟','idiom'), w('破釜沉舟','idiom'),
    w('卧薪尝胆','idiom'), w('滥竽充数','idiom'), w('叶公好龙','idiom'), w('愚公移山','idiom'),
    w('画饼充饥','idiom'), w('指鹿为马','idiom'), w('亡羊补牢','idiom'), w('草木皆兵','idiom'),
    w('唇亡齿寒','idiom'), w('鸡犬不宁','idiom'), w('风雨同舟','idiom'), w('百闻不如一见','idiom'),
    w('一鸣惊人','idiom'),
    // number_expr (20)
    w('1','number_expr'), w('7','number_expr'), w('42','number_expr'), w('100','number_expr'), w('1000','number_expr'),
    w('一','number_expr'), w('七','number_expr'), w('百','number_expr'), w('千','number_expr'), w('万','number_expr'),
    w('3.14','number_expr'), w('1/2','number_expr'), w('3/4','number_expr'),
    w('2+2','number_expr'), w('5*6','number_expr'), w('10-3','number_expr'), w('?','number_expr'), w('!','number_expr'),
    w('%','number_expr'), w('@','number_expr'),
    // sensitive (20)
    w('日本海','sensitive'), w('钓鱼岛','sensitive'), w('辛奇','sensitive'), w('泡菜','sensitive'),
    w('韩服','sensitive'), w('汉服','sensitive'), w('长白山','sensitive'), w('白头山','sensitive'),
    w('特朗普','sensitive'), w('普京','sensitive'), w('希特勒','sensitive'), w('大屠杀','sensitive'),
    w('南京大屠杀','sensitive'), w('台湾','sensitive'), w('西藏','sensitive'), w('香港','sensitive'),
    w('六四','sensitive'), w('文化大革命','sensitive'), w('耶稣','sensitive'), w('穆罕默德','sensitive'),
    // typo (15)
    w('谢谢妳','typo'), w('对不起呀','typo'), w('北京市','typo'), w('一直在','typo'),
    w('生日快了','typo'), w('我很饿','typo'), w('做朋友','typo'), w('开始','typo'),
    w('给我面包','typo'), w('我去会议','typo'), w('美丽天空','typo'), w('心情很好','typo'),
    w('快点呢','typo'), w('好久好见','typo'), w('听到','typo'),
    // sentence (10)
    w('昨天我去商店买了一些苹果','sentence'),
    w('这个问题我不知道怎么解决','sentence'),
    w('今天天气真好','sentence'),
    w('你的名字是什么','sentence'),
    w('明天能去学校吗','sentence'),
    w('我们一起去看电影了','sentence'),
    w('那本书非常有趣','sentence'),
    w('我们晚上约好见朋友','sentence'),
    w('这是一个非常重要的决定','sentence'),
    w('你学中文多久了','sentence'),
    // rare (15)
    w('叆叇','rare'), w('饕餮','rare'), w('彳亍','rare'), w('阒寂','rare'),
    w('峥嵘','rare'), w('翩跹','rare'), w('梦寐','rare'), w('忐忑','rare'),
    w('憧憬','rare'), w('斐然','rare'), w('沧桑','rare'), w('蜿蜒','rare'),
    w('蹒跚','rare'), w('婆娑','rare'), w('琉璃','rare'),
    // false_friend (15) — Chinese words that look like Japanese kanji or similar
    w('手紙','false_friend'),  // means toilet paper in zh (letter in ja)
    w('湯','false_friend'),    // soup (not hot water)
    w('娘','false_friend'),    // mother (not daughter as in ja)
    w('勉強','false_friend'),  // reluctantly (not study as in ja)
    w('便宜','false_friend'),  // cheap (multiple senses)
    w('清楚','false_friend'),  // clear (not pure as in ja)
    w('馒头','false_friend'),  // steamed bun (not bao)
    w('点心','false_friend'),  // dim sum (vs ja point/score)
    w('青菜','false_friend'),  // green vegetable
    w('地铁','false_friend'),  // subway (vs ja 地下鉄)
    w('情人','false_friend'),  // lover (multiple senses)
    w('感情','false_friend'),  // emotion (vs ja love)
    w('東西','false_friend'),  // thing (zh) vs east-west (ja)
    w('放心','false_friend'),  // relax (zh) vs ja
    w('结婚','false_friend'),  // marry
    // multi_word (10)
    w('谢谢你','multi_word'), w('不好意思','multi_word'), w('请问一下','multi_word'),
    w('对不起','multi_word'), w('辛苦了','multi_word'), w('回头见','multi_word'),
    w('生日快乐','multi_word'), w('新年快乐','multi_word'),
    w('马马虎虎','multi_word'), w('随便你','multi_word'),
  ],

  // ── French (200) ──
  fr: [
    // common (40)
    w('pomme','common'), w('eau','common'), w('temps','common'), w('amour','common'), w('ciel','common'),
    w('école','common'), w('maison','common'), w('nourriture','common'), w('famille','common'), w('ami','common'),
    w('matin','common'), w('soir','common'), w('nuit','common'), w('rêve','common'), w('livre','common'),
    w('mère','common'), w('père','common'), w('enfant','common'), w('ville','common'), w('voiture','common'),
    w('courir','common'), w('manger','common'), w('boire','common'), w('dormir','common'), w('marcher','common'),
    w('voir','common'), w('entendre','common'), w('penser','common'), w('savoir','common'), w('croire','common'),
    w('beau','common'), w('fort','common'), w('petit','common'), w('grand','common'), w('chaud','common'),
    w('froid','common'), w('heureux','common'), w('triste','common'), w('vite','common'), w('lentement','common'),
    // polysemy (30) — French homonyms
    w('lecture','polysemy'), w('avocat','polysemy'), w('addition','polysemy'), w('bureau','polysemy'),
    w('canard','polysemy'), w('grève','polysemy'), w('livre','polysemy'), w('manche','polysemy'),
    w('mémoire','polysemy'), w('mode','polysemy'), w('orange','polysemy'), w('palais','polysemy'),
    w('partie','polysemy'), w('pièce','polysemy'), w('plante','polysemy'), w('point','polysemy'),
    w('poste','polysemy'), w('rose','polysemy'), w('somme','polysemy'), w('tour','polysemy'),
    w('vase','polysemy'), w('voile','polysemy'), w('vol','polysemy'), w('place','polysemy'),
    w('temps','polysemy'), w('train','polysemy'), w('chèvre','polysemy'), w('but','polysemy'),
    w('chair','polysemy'), w('coin','polysemy'),
    // idiom (25)
    w("avoir le cafard",'idiom'), w("avoir le cœur sur la main",'idiom'),
    w("avoir un poil dans la main",'idiom'), w("casser les pieds",'idiom'),
    w("chercher midi à quatorze heures",'idiom'), w("coûter les yeux de la tête",'idiom'),
    w("donner sa langue au chat",'idiom'), w("être au bout du rouleau",'idiom'),
    w("faire la grasse matinée",'idiom'), w("filer à l'anglaise",'idiom'),
    w("jeter l'éponge",'idiom'), w("mettre les pieds dans le plat",'idiom'),
    w("ne pas être dans son assiette",'idiom'), w("pleuvoir des cordes",'idiom'),
    w("poser un lapin",'idiom'), w("prendre ses jambes à son cou",'idiom'),
    w("raconter des salades",'idiom'), w("rendre la monnaie de sa pièce",'idiom'),
    w("revenons à nos moutons",'idiom'), w("tomber dans les pommes",'idiom'),
    w("vendre la peau de l'ours avant de l'avoir tué",'idiom'),
    w("appeler un chat un chat",'idiom'), w("être tiré à quatre épingles",'idiom'),
    w("avoir un chat dans la gorge",'idiom'), w("dormir comme un loir",'idiom'),
    // number_expr (20)
    w('1','number_expr'), w('7','number_expr'), w('42','number_expr'), w('100','number_expr'), w('1000','number_expr'),
    w('un','number_expr'), w('sept','number_expr'), w('cent','number_expr'), w('mille','number_expr'), w('million','number_expr'),
    w('3.14','number_expr'), w('1/2','number_expr'), w('3/4','number_expr'),
    w('2+2','number_expr'), w('5*6','number_expr'), w('10-3','number_expr'), w('?','number_expr'), w('!','number_expr'),
    w('%','number_expr'), w('@','number_expr'),
    // sensitive (20)
    w("mer du Japon",'sensitive'), w('Takeshima','sensitive'), w('Dokdo','sensitive'),
    w('Trump','sensitive'), w('Poutine','sensitive'), w('Xi Jinping','sensitive'),
    w('Hitler','sensitive'), w('Holocauste','sensitive'), w('Massacre de Nankin','sensitive'),
    w('Taïwan','sensitive'), w('Tibet','sensitive'), w('Hong Kong','sensitive'),
    w('Crimée','sensitive'), w('Cachemire','sensitive'), w('Jérusalem','sensitive'),
    w('Kosovo','sensitive'), w('Jésus','sensitive'), w('Mahomet','sensitive'),
    w('Bouddha','sensitive'), w('femmes de réconfort','sensitive'),
    // typo (15)
    w('défintion','typo'), w('apellation','typo'), w('proffeseur','typo'),
    w('rendez-vous','typo'), w('chacque','typo'), w('parce-que','typo'),
    w('réservez','typo'), w('français','typo'), w('mai','typo'),
    w('boucheur','typo'), w('temp','typo'), w('coté','typo'),
    w('a coté','typo'), w('ça va','typo'), w('peu être','typo'),
    // sentence (10)
    w("Hier je suis allé au magasin pour acheter des pommes",'sentence'),
    w("Je ne sais pas comment résoudre ce problème",'sentence'),
    w("Il fait très beau aujourd'hui",'sentence'),
    w("Comment t'appelles-tu",'sentence'),
    w("Pourras-tu venir à l'école demain",'sentence'),
    w("Nous sommes allés voir un film ensemble",'sentence'),
    w("Ce livre était vraiment intéressant",'sentence'),
    w("Nous avons rendez-vous avec des amis ce soir",'sentence'),
    w("C'est une décision très importante",'sentence'),
    w("Depuis quand apprends-tu le français",'sentence'),
    // rare (15)
    w('crépuscule','rare'), w('éphémère','rare'), w('imbroglio','rare'),
    w('palimpseste','rare'), w('phylactère','rare'), w('quintessence','rare'),
    w('saudade','rare'), w('schizophrénie','rare'), w('serendipité','rare'),
    w('sérendipité','rare'), w('ubiquité','rare'), w('zéphyr','rare'),
    w('chimère','rare'), w('mélancolie','rare'), w('vespéral','rare'),
    // false_friend (15)
    w('actuellement','false_friend'),  // currently, NOT actually
    w('éventuellement','false_friend'),// possibly, NOT eventually
    w('sensible','false_friend'),      // sensitive, NOT sensible
    w('librairie','false_friend'),     // bookstore, NOT library
    w('rester','false_friend'),        // to stay, NOT to rest
    w('rude','false_friend'),          // tough/harsh, NOT rude
    w('demander','false_friend'),      // to ask, NOT to demand
    w('attendre','false_friend'),      // to wait, NOT to attend
    w('coin','false_friend'),          // corner, NOT coin
    w('pain','false_friend'),          // bread, NOT pain
    w('chair','false_friend'),         // flesh, NOT chair
    w('blesser','false_friend'),       // to injure, NOT to bless
    w('monnaie','false_friend'),       // change/currency, NOT money in general
    w('gentil','false_friend'),        // kind, NOT genteel
    w('preservatif','false_friend'),   // condom, NOT preservative
    // multi_word (10)
    w('bon appétit','multi_word'), w("s'il vous plaît",'multi_word'),
    w('au revoir','multi_word'), w('à bientôt','multi_word'),
    w("excusez-moi",'multi_word'), w("c'est-à-dire",'multi_word'),
    w("tout le monde",'multi_word'), w("tout à fait",'multi_word'),
    w("avoir envie de",'multi_word'), w("d'accord",'multi_word'),
  ],

  // ── German (200) ──
  de: [
    // common (40)
    w('Apfel','common'), w('Wasser','common'), w('Zeit','common'), w('Liebe','common'), w('Himmel','common'),
    w('Schule','common'), w('Haus','common'), w('Essen','common'), w('Familie','common'), w('Freund','common'),
    w('Morgen','common'), w('Abend','common'), w('Nacht','common'), w('Traum','common'), w('Buch','common'),
    w('Mutter','common'), w('Vater','common'), w('Kind','common'), w('Stadt','common'), w('Auto','common'),
    w('laufen','common'), w('essen','common'), w('trinken','common'), w('schlafen','common'), w('gehen','common'),
    w('sehen','common'), w('hören','common'), w('denken','common'), w('wissen','common'), w('glauben','common'),
    w('schön','common'), w('stark','common'), w('klein','common'), w('groß','common'), w('heiß','common'),
    w('kalt','common'), w('glücklich','common'), w('traurig','common'), w('schnell','common'), w('langsam','common'),
    // polysemy (30) — German homonyms
    w('Bank','polysemy'), w('Schloss','polysemy'), w('Schimmel','polysemy'), w('Hahn','polysemy'),
    w('Kiefer','polysemy'), w('Strauß','polysemy'), w('Birne','polysemy'), w('Mutter','polysemy'),
    w('See','polysemy'), w('Steuer','polysemy'), w('Ball','polysemy'), w('Tor','polysemy'),
    w('Leiter','polysemy'), w('Decke','polysemy'), w('Atlas','polysemy'), w('Maus','polysemy'),
    w('Band','polysemy'), w('Buch','polysemy'), w('Wirt','polysemy'), w('Wirtschaft','polysemy'),
    w('Schale','polysemy'), w('Linie','polysemy'), w('Note','polysemy'), w('Spiel','polysemy'),
    w('Stoff','polysemy'), w('Wand','polysemy'), w('Welle','polysemy'), w('Brief','polysemy'),
    w('Lager','polysemy'), w('Pflaster','polysemy'),
    // idiom (25)
    w("Daumen drücken",'idiom'), w("die Katze aus dem Sack lassen",'idiom'),
    w("ins kalte Wasser springen",'idiom'), w("ein Frosch im Hals",'idiom'),
    w("Tomaten auf den Augen haben",'idiom'), w("über den Berg sein",'idiom'),
    w("alles in Butter",'idiom'), w("auf den Punkt bringen",'idiom'),
    w("aus heiterem Himmel",'idiom'), w("Bauchgefühl",'idiom'),
    w("das ist mir Wurst",'idiom'), w("den Faden verlieren",'idiom'),
    w("ein Auge zudrücken",'idiom'), w("ins Schwarze treffen",'idiom'),
    w("jemandem auf den Wecker gehen",'idiom'),
    w("Klappe zu, Affe tot",'idiom'), w("Lampenfieber",'idiom'),
    w("auf großem Fuß leben",'idiom'), w("nicht alle Tassen im Schrank haben",'idiom'),
    w("Pech haben",'idiom'), w("schwarzes Schaf",'idiom'),
    w("seinen Senf dazugeben",'idiom'), w("Tomaten züchten",'idiom'),
    w("vom Hocker hauen",'idiom'), w("zwischen den Stühlen sitzen",'idiom'),
    // number_expr (20)
    w('1','number_expr'), w('7','number_expr'), w('42','number_expr'), w('100','number_expr'), w('1000','number_expr'),
    w('eins','number_expr'), w('sieben','number_expr'), w('hundert','number_expr'), w('tausend','number_expr'), w('Million','number_expr'),
    w('3.14','number_expr'), w('1/2','number_expr'), w('3/4','number_expr'),
    w('2+2','number_expr'), w('5*6','number_expr'), w('10-3','number_expr'), w('?','number_expr'), w('!','number_expr'),
    w('%','number_expr'), w('@','number_expr'),
    // sensitive (20)
    w('Japanisches Meer','sensitive'), w('Takeshima','sensitive'), w('Dokdo','sensitive'),
    w('Trump','sensitive'), w('Putin','sensitive'), w('Xi Jinping','sensitive'),
    w('Hitler','sensitive'), w('Holocaust','sensitive'), w('Massaker von Nanking','sensitive'),
    w('Taiwan','sensitive'), w('Tibet','sensitive'), w('Hongkong','sensitive'),
    w('Krim','sensitive'), w('Kaschmir','sensitive'), w('Jerusalem','sensitive'),
    w('Kosovo','sensitive'), w('Jesus','sensitive'), w('Mohammed','sensitive'),
    w('Buddha','sensitive'), w('Trostfrauen','sensitive'),
    // typo (15)
    w('definativ','typo'), w('vieleicht','typo'), w('Realität','typo'),
    w('schreibst','typo'), w('Apfelsaft','typo'), w('seperat','typo'),
    w('strasse','typo'), w('Mädchen','typo'), w('weiss','typo'),
    w('das gleiche','typo'), w('jeden Tag','typo'), w('drei Uhr','typo'),
    w('viele Leute','typo'), w('grosse Stadt','typo'), w('koennen','typo'),
    // sentence (10)
    w("Gestern bin ich in den Laden gegangen und habe Äpfel gekauft",'sentence'),
    w("Ich weiß nicht, wie ich dieses Problem lösen soll",'sentence'),
    w("Heute ist das Wetter sehr schön",'sentence'),
    w("Wie heißt du",'sentence'),
    w("Kannst du morgen zur Schule gehen",'sentence'),
    w("Wir sind zusammen ins Kino gegangen",'sentence'),
    w("Dieses Buch war sehr interessant",'sentence'),
    w("Wir haben uns für heute Abend mit Freunden verabredet",'sentence'),
    w("Das ist eine sehr wichtige Entscheidung",'sentence'),
    w("Wie lange lernst du schon Deutsch",'sentence'),
    // rare (15)
    w('Sehnsucht','rare'), w('Fernweh','rare'), w('Schadenfreude','rare'),
    w('Weltschmerz','rare'), w('Zeitgeist','rare'), w('Doppelgänger','rare'),
    w('Verschlimmbesserung','rare'), w('Backpfeifengesicht','rare'),
    w('Treppenwitz','rare'), w('Kummerspeck','rare'), w('Torschlusspanik','rare'),
    w('Vergangenheitsbewältigung','rare'), w('Waldeinsamkeit','rare'),
    w('Augenblick','rare'), w('Erkenntnis','rare'),
    // false_friend (15)
    w('Gift','false_friend'),         // poison NOT gift
    w('Rat','false_friend'),          // advice NOT rat
    w('Chef','false_friend'),         // boss NOT chef
    w('Brief','false_friend'),        // letter NOT brief
    w('Bald','false_friend'),         // soon NOT bald
    w('Fast','false_friend'),         // almost NOT fast
    w('Handy','false_friend'),        // mobile phone NOT handy
    w('Smoking','false_friend'),      // tuxedo NOT smoking
    w('Konsequent','false_friend'),   // consistent NOT consequent
    w('Sensibel','false_friend'),     // sensitive NOT sensible
    w('Rente','false_friend'),        // pension NOT rent
    w('Stadt','false_friend'),        // city NOT stadium
    w('Note','false_friend'),         // grade NOT note in some senses
    w('Eventuell','false_friend'),    // possibly NOT eventually
    w('Aktuell','false_friend'),      // current NOT actual
    // multi_word (10)
    w('guten Morgen','multi_word'), w('guten Abend','multi_word'),
    w('auf Wiedersehen','multi_word'), w('bis bald','multi_word'),
    w('vielen Dank','multi_word'), w('bitte schön','multi_word'),
    w('zum Wohl','multi_word'), w('alles klar','multi_word'),
    w('keine Ahnung','multi_word'), w('das stimmt','multi_word'),
  ],

  // ── Spanish (200) ──
  es: [
    // common (40)
    w('manzana','common'), w('agua','common'), w('tiempo','common'), w('amor','common'), w('cielo','common'),
    w('escuela','common'), w('casa','common'), w('comida','common'), w('familia','common'), w('amigo','common'),
    w('mañana','common'), w('tarde','common'), w('noche','common'), w('sueño','common'), w('libro','common'),
    w('madre','common'), w('padre','common'), w('niño','common'), w('ciudad','common'), w('coche','common'),
    w('correr','common'), w('comer','common'), w('beber','common'), w('dormir','common'), w('caminar','common'),
    w('ver','common'), w('oír','common'), w('pensar','common'), w('saber','common'), w('creer','common'),
    w('hermoso','common'), w('fuerte','common'), w('pequeño','common'), w('grande','common'), w('caliente','common'),
    w('frío','common'), w('feliz','common'), w('triste','common'), w('rápido','common'), w('lento','common'),
    // polysemy (30)
    w('banco','polysemy'), w('vela','polysemy'), w('llama','polysemy'), w('cabo','polysemy'),
    w('carrera','polysemy'), w('clase','polysemy'), w('cola','polysemy'), w('cura','polysemy'),
    w('frente','polysemy'), w('hoja','polysemy'), w('hora','polysemy'), w('lengua','polysemy'),
    w('manga','polysemy'), w('manzana','polysemy'), w('media','polysemy'), w('muñeca','polysemy'),
    w('orden','polysemy'), w('parte','polysemy'), w('pasta','polysemy'), w('pico','polysemy'),
    w('planta','polysemy'), w('plato','polysemy'), w('punto','polysemy'), w('radio','polysemy'),
    w('sierra','polysemy'), w('suelo','polysemy'), w('tarjeta','polysemy'), w('tienda','polysemy'),
    w('vino','polysemy'), w('vista','polysemy'),
    // idiom (25)
    w("estar en las nubes",'idiom'), w("estar como pez en el agua",'idiom'),
    w("no tener pelos en la lengua",'idiom'), w("ser pan comido",'idiom'),
    w("tomar el pelo",'idiom'), w("estar de mala uva",'idiom'),
    w("buscarle tres pies al gato",'idiom'), w("dar en el clavo",'idiom'),
    w("dar gato por liebre",'idiom'), w("echar leña al fuego",'idiom'),
    w("estar en la luna",'idiom'), w("hacer la vista gorda",'idiom'),
    w("ir al grano",'idiom'), w("llover a cántaros",'idiom'),
    w("matar dos pájaros de un tiro",'idiom'), w("meter la pata",'idiom'),
    w("no decir ni pío",'idiom'), w("pasar la noche en vela",'idiom'),
    w("ponerse las pilas",'idiom'), w("ser uña y carne",'idiom'),
    w("subirse por las paredes",'idiom'), w("tener la sartén por el mango",'idiom'),
    w("tirar la toalla",'idiom'), w("ver las estrellas",'idiom'),
    w("volverse loco",'idiom'),
    // number_expr (20)
    w('1','number_expr'), w('7','number_expr'), w('42','number_expr'), w('100','number_expr'), w('1000','number_expr'),
    w('uno','number_expr'), w('siete','number_expr'), w('cien','number_expr'), w('mil','number_expr'), w('millón','number_expr'),
    w('3.14','number_expr'), w('1/2','number_expr'), w('3/4','number_expr'),
    w('2+2','number_expr'), w('5*6','number_expr'), w('10-3','number_expr'), w('?','number_expr'), w('!','number_expr'),
    w('%','number_expr'), w('@','number_expr'),
    // sensitive (20)
    w('mar de Japón','sensitive'), w('Takeshima','sensitive'), w('Dokdo','sensitive'),
    w('Trump','sensitive'), w('Putin','sensitive'), w('Xi Jinping','sensitive'),
    w('Hitler','sensitive'), w('Holocausto','sensitive'), w('Masacre de Nanjing','sensitive'),
    w('Taiwán','sensitive'), w('Tíbet','sensitive'), w('Hong Kong','sensitive'),
    w('Crimea','sensitive'), w('Cachemira','sensitive'), w('Jerusalén','sensitive'),
    w('Kosovo','sensitive'), w('Jesús','sensitive'), w('Mahoma','sensitive'),
    w('Buda','sensitive'), w('mujeres de consuelo','sensitive'),
    // typo (15)
    w('echar','typo'), w('echarse','typo'), w('ablar','typo'), w('haber','typo'),
    w('mi nombre','typo'), w('hago','typo'), w('reciviste','typo'),
    w('Telefono','typo'), w('Tu','typo'), w('si','typo'),
    w('me llamo','typo'), w('un poko','typo'), w('alli','typo'),
    w('a ver','typo'), w('por que','typo'),
    // sentence (10)
    w("Ayer fui a la tienda y compré algunas manzanas",'sentence'),
    w("No sé cómo resolver este problema",'sentence'),
    w("Hoy hace muy buen tiempo",'sentence'),
    w("¿Cómo te llamas",'sentence'),
    w("¿Podrás ir a la escuela mañana",'sentence'),
    w("Fuimos juntos al cine",'sentence'),
    w("Ese libro fue muy interesante",'sentence'),
    w("Quedamos con amigos esta noche",'sentence'),
    w("Esta es una decisión muy importante",'sentence'),
    w("¿Cuánto tiempo llevas estudiando español",'sentence'),
    // rare (15)
    w('inefable','rare'), w('ósculo','rare'), w('quimera','rare'),
    w('ínclito','rare'), w('petricor','rare'), w('saudade','rare'),
    w('soliloquio','rare'), w('serendipia','rare'), w('vetusto','rare'),
    w('zalamero','rare'), w('idílico','rare'), w('apolíneo','rare'),
    w('crepuscular','rare'), w('panegírico','rare'), w('parsimonia','rare'),
    // false_friend (15)
    w('actual','false_friend'),     // current, NOT actual
    w('embarazada','false_friend'), // pregnant, NOT embarrassed
    w('éxito','false_friend'),      // success, NOT exit
    w('asistir','false_friend'),    // to attend, NOT assist
    w('introducir','false_friend'), // to insert, NOT introduce
    w('molestar','false_friend'),   // to annoy, NOT molest
    w('arena','false_friend'),      // sand, NOT arena
    w('campo','false_friend'),      // countryside, NOT camp
    w('carpeta','false_friend'),    // folder, NOT carpet
    w('constipado','false_friend'), // having a cold, NOT constipated
    w('decepción','false_friend'),  // disappointment, NOT deception
    w('largo','false_friend'),      // long, NOT large
    w('librería','false_friend'),   // bookstore, NOT library
    w('pretender','false_friend'),  // to intend, NOT pretend
    w('preservativo','false_friend'),// condom
    // multi_word (10)
    w('buenos días','multi_word'), w('buenas tardes','multi_word'),
    w('hasta luego','multi_word'), w('hasta mañana','multi_word'),
    w('por favor','multi_word'), w('de nada','multi_word'),
    w('lo siento','multi_word'), w('mucho gusto','multi_word'),
    w('a veces','multi_word'), w('en serio','multi_word'),
  ],

  // ── Italian (200) ──
  it: [
    // common (40)
    w('mela','common'), w('acqua','common'), w('tempo','common'), w('amore','common'), w('cielo','common'),
    w('scuola','common'), w('casa','common'), w('cibo','common'), w('famiglia','common'), w('amico','common'),
    w('mattino','common'), w('sera','common'), w('notte','common'), w('sogno','common'), w('libro','common'),
    w('madre','common'), w('padre','common'), w('bambino','common'), w('città','common'), w('macchina','common'),
    w('correre','common'), w('mangiare','common'), w('bere','common'), w('dormire','common'), w('camminare','common'),
    w('vedere','common'), w('sentire','common'), w('pensare','common'), w('sapere','common'), w('credere','common'),
    w('bello','common'), w('forte','common'), w('piccolo','common'), w('grande','common'), w('caldo','common'),
    w('freddo','common'), w('felice','common'), w('triste','common'), w('veloce','common'), w('lento','common'),
    // polysemy (30)
    w('banca','polysemy'), w('campo','polysemy'), w('canto','polysemy'), w('capo','polysemy'),
    w('carta','polysemy'), w('colpo','polysemy'), w('corso','polysemy'), w('credito','polysemy'),
    w('dito','polysemy'), w('fronte','polysemy'), w('giro','polysemy'), w('lettera','polysemy'),
    w('lingua','polysemy'), w('mano','polysemy'), w('mezzo','polysemy'), w('nota','polysemy'),
    w('numero','polysemy'), w('orso','polysemy'), w('parte','polysemy'), w('passo','polysemy'),
    w('pezzo','polysemy'), w('piano','polysemy'), w('piatto','polysemy'), w('porta','polysemy'),
    w('punto','polysemy'), w('rete','polysemy'), w('segno','polysemy'), w('sole','polysemy'),
    w('terra','polysemy'), w('via','polysemy'),
    // idiom (25)
    w("in bocca al lupo",'idiom'), w("avere le mani in pasta",'idiom'),
    w("essere al settimo cielo",'idiom'), w("fare orecchie da mercante",'idiom'),
    w("non vedere l'ora",'idiom'), w("prendere due piccioni con una fava",'idiom'),
    w("rompere il ghiaccio",'idiom'), w("toccare il cielo con un dito",'idiom'),
    w("a buon intenditor poche parole",'idiom'), w("acqua in bocca",'idiom'),
    w("avere la testa fra le nuvole",'idiom'), w("chi dorme non piglia pesci",'idiom'),
    w("essere come cane e gatto",'idiom'), w("essere un pesce fuor d'acqua",'idiom'),
    w("fare il portoghese",'idiom'), w("mettere una pulce nell'orecchio",'idiom'),
    w("non avere peli sulla lingua",'idiom'), w("piove sul bagnato",'idiom'),
    w("prendere lucciole per lanterne",'idiom'), w("ridere sotto i baffi",'idiom'),
    w("tagliare la corda",'idiom'), w("tutto fumo e niente arrosto",'idiom'),
    w("vedere rosso",'idiom'), w("avere la coda di paglia",'idiom'),
    w("essere alle stelle",'idiom'),
    // number_expr (20)
    w('1','number_expr'), w('7','number_expr'), w('42','number_expr'), w('100','number_expr'), w('1000','number_expr'),
    w('uno','number_expr'), w('sette','number_expr'), w('cento','number_expr'), w('mille','number_expr'), w('milione','number_expr'),
    w('3.14','number_expr'), w('1/2','number_expr'), w('3/4','number_expr'),
    w('2+2','number_expr'), w('5*6','number_expr'), w('10-3','number_expr'), w('?','number_expr'), w('!','number_expr'),
    w('%','number_expr'), w('@','number_expr'),
    // sensitive (20)
    w('mare del Giappone','sensitive'), w('Takeshima','sensitive'), w('Dokdo','sensitive'),
    w('Trump','sensitive'), w('Putin','sensitive'), w('Xi Jinping','sensitive'),
    w('Hitler','sensitive'), w('Olocausto','sensitive'), w('Massacro di Nanchino','sensitive'),
    w('Taiwan','sensitive'), w('Tibet','sensitive'), w('Hong Kong','sensitive'),
    w('Crimea','sensitive'), w('Kashmir','sensitive'), w('Gerusalemme','sensitive'),
    w('Kosovo','sensitive'), w('Gesù','sensitive'), w('Maometto','sensitive'),
    w('Buddha','sensitive'), w('donne di conforto','sensitive'),
    // typo (15)
    w('cuello','typo'), w('persino','typo'), w('eccellente','typo'),
    w('finchè','typo'), w('benvenuto','typo'), w('aviso','typo'),
    w('po','typo'), w('quà','typo'), w('là','typo'),
    w('peace','typo'), w('aboracce','typo'), w('sucessione','typo'),
    w('discotteca','typo'), w('giusto','typo'), w('di la','typo'),
    // sentence (10)
    w("Ieri sono andato al negozio e ho comprato delle mele",'sentence'),
    w("Non so come risolvere questo problema",'sentence'),
    w("Oggi fa bel tempo",'sentence'),
    w("Come ti chiami",'sentence'),
    w("Potrai andare a scuola domani",'sentence'),
    w("Siamo andati al cinema insieme",'sentence'),
    w("Quel libro era davvero interessante",'sentence'),
    w("Stasera abbiamo appuntamento con degli amici",'sentence'),
    w("Questa è una decisione molto importante",'sentence'),
    w("Da quanto tempo studi italiano",'sentence'),
    // rare (15)
    w('ineffabile','rare'), w('crepuscolo','rare'), w('quintessenza','rare'),
    w('subdolo','rare'), w('vetusto','rare'), w('saudade','rare'),
    w('serendipità','rare'), w('limpido','rare'), w('etereo','rare'),
    w('arcano','rare'), w('palinsesto','rare'), w('cromatico','rare'),
    w('aulico','rare'), w('luccichio','rare'), w('vespertino','rare'),
    // false_friend (15)
    w('attualmente','false_friend'),// currently, NOT actually
    w('eventualmente','false_friend'),// possibly, NOT eventually
    w('annoiare','false_friend'),    // to bore, NOT to annoy
    w('camera','false_friend'),      // bedroom, NOT camera
    w('caldo','false_friend'),       // hot, NOT cold (false friend with es/fr)
    w('libreria','false_friend'),    // bookshelf/bookstore, NOT library
    w('morbido','false_friend'),     // soft, NOT morbid
    w('parente','false_friend'),     // relative, NOT parent
    w('rumore','false_friend'),      // noise, NOT rumor
    w('sensibile','false_friend'),   // sensitive, NOT sensible
    w('confetti','false_friend'),    // sugared almonds, NOT confetti
    w('fattoria','false_friend'),    // farm, NOT factory
    w('largo','false_friend'),       // wide, NOT large
    w('preservativo','false_friend'),// condom
    w('crudo','false_friend'),       // raw, NOT crude
    // multi_word (10)
    w('buongiorno','multi_word'), w('buonasera','multi_word'),
    w('arrivederci','multi_word'), w('a presto','multi_word'),
    w('per favore','multi_word'), w('grazie mille','multi_word'),
    w('mi dispiace','multi_word'), w('come stai','multi_word'),
    w("non ho idea",'multi_word'), w("va bene",'multi_word'),
  ],
};

// Sanity check at module load
for (const [lang, words] of Object.entries(WORDS_BY_SOURCE)) {
  if (words.length !== 200) {
    console.warn(`[words.ts] ${lang} has ${words.length} entries, expected 200`);
  }
}

export const SOURCE_LANGS = Object.keys(WORDS_BY_SOURCE);
export const TARGET_LANGS_BY_SOURCE: Record<string, string[]> = Object.fromEntries(
  SOURCE_LANGS.map((src) => [src, SOURCE_LANGS.filter((t) => t !== src)]),
);
