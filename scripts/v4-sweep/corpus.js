// Comprehensive lookup-quality test corpus.
// 50 entries per source language across these categories (the request):
//   common, polysemy, rare, idiom, typo, profanity, disputed, formula,
//   number, long_sentence, wrong_lang, edge, polyphone (CJK only)
// Each entry: { word, category, note?, readingHint? }
// "note" describes what the system should ideally do — used to grade output.

const SOURCE_LANGS = ['ko', 'ja', 'zh-CN', 'en', 'es', 'fr', 'de', 'it'];

const CORPUS = {
  ko: [
    // common (10)
    { word: '안녕', category: 'common' },
    { word: '사랑', category: 'common' },
    { word: '먹다', category: 'common' },
    { word: '학교', category: 'common' },
    { word: '커피', category: 'common' },
    { word: '친구', category: 'common' },
    { word: '시간', category: 'common' },
    { word: '돈', category: 'common' },
    { word: '집', category: 'common' },
    { word: '일하다', category: 'common' },
    // polysemy (6)
    { word: '배', category: 'polysemy', note: 'belly/boat/pear/double' },
    { word: '눈', category: 'polysemy', note: 'eye/snow' },
    { word: '말', category: 'polysemy', note: 'horse/speech' },
    { word: '쓰다', category: 'polysemy', note: 'write/use/bitter/wear' },
    { word: '차', category: 'polysemy', note: 'car/tea' },
    { word: '발', category: 'polysemy', note: 'foot — not imperial foot' },
    // rare/archaic (5)
    { word: '곰살궂다', category: 'rare' },
    { word: '아련하다', category: 'rare' },
    { word: '도탑다', category: 'rare' },
    { word: '시나브로', category: 'rare' },
    { word: '뜬금없이', category: 'rare' },
    // idioms (4)
    { word: '발이 넓다', category: 'idiom' },
    { word: '눈에 띄다', category: 'idiom' },
    { word: '한턱 내다', category: 'idiom' },
    { word: '코앞이다', category: 'idiom' },
    // typo (3)
    { word: '안녕하셰요', category: 'typo', note: 'should correct → 안녕하세요' },
    { word: '햑교', category: 'typo' },
    { word: '먹읏다', category: 'typo' },
    // profanity (3)
    { word: '씨발', category: 'profanity', note: 'general vulgarity — surface' },
    { word: '바보', category: 'profanity' },
    { word: '미친놈', category: 'profanity' },
    // disputed (3)
    { word: '독도', category: 'disputed', note: 'Korea/Japan' },
    { word: '윤석열', category: 'disputed', note: 'public figure — neutral' },
    { word: '북한', category: 'disputed' },
    // formula (2)
    { word: 'E=mc²', category: 'formula' },
    { word: 'x+y=z', category: 'formula' },
    // number (2)
    { word: '2024', category: 'number' },
    { word: '백만', category: 'number' },
    // long sentence (2)
    { word: '오늘 날씨가 정말 좋네요', category: 'long_sentence', note: 'should be rejected as sentence' },
    { word: '저는 한국어를 공부하고 있어요', category: 'long_sentence' },
    // wrong_lang (3) — entered english in ko source
    { word: 'hello', category: 'wrong_lang' },
    { word: 'computer', category: 'wrong_lang' },
    { word: '日本', category: 'wrong_lang', note: 'japanese chars in ko' },
    // edge (2)
    { word: 'ㅋㅋㅋ', category: 'edge', note: 'jamo only' },
    { word: '아', category: 'edge', note: 'single jamo' },
    // polyphone CJK (3)
    { word: '아니', category: 'polyphone' },
    { word: '내', category: 'polyphone' },
    { word: '있다', category: 'polyphone' },
  ],

  ja: [
    // common (10)
    { word: 'こんにちは', category: 'common' },
    { word: 'ありがとう', category: 'common' },
    { word: '食べる', category: 'common' },
    { word: '学校', category: 'common' },
    { word: '時間', category: 'common' },
    { word: '友達', category: 'common' },
    { word: 'お金', category: 'common' },
    { word: '家', category: 'common' },
    { word: '仕事', category: 'common' },
    { word: '猫', category: 'common' },
    // polysemy (6)
    { word: '橋', category: 'polysemy', note: 'bridge / chopsticks (端/橋/箸 homophones)' },
    { word: '雨', category: 'polysemy' },
    { word: '紙', category: 'polysemy', note: 'paper / god / hair' },
    { word: '気', category: 'polysemy', note: 'spirit/feeling/mind' },
    { word: '上', category: 'polyphone', readingHint: 'うえ', note: 'うえ vs じょう vs かみ' },
    { word: '生きる', category: 'polysemy' },
    // rare/archaic (5)
    { word: '幽玄', category: 'rare' },
    { word: '侘び寂び', category: 'rare' },
    { word: '泡沫', category: 'rare' },
    { word: '逢瀬', category: 'rare' },
    { word: '黄昏', category: 'rare' },
    // idioms (4)
    { word: '目から鱗', category: 'idiom' },
    { word: '猫の手も借りたい', category: 'idiom' },
    { word: '頭が固い', category: 'idiom' },
    { word: '腹が立つ', category: 'idiom' },
    // typo (3)
    { word: 'ありがとお', category: 'typo' },
    { word: 'こんにちわ', category: 'typo' },
    { word: 'お早う御座いまづ', category: 'typo' },
    // profanity (3)
    { word: 'くそ', category: 'profanity' },
    { word: '馬鹿', category: 'profanity' },
    { word: 'ふざけるな', category: 'profanity' },
    // disputed (3)
    { word: '竹島', category: 'disputed' },
    { word: '尖閣諸島', category: 'disputed' },
    { word: '岸田文雄', category: 'disputed' },
    // formula (2)
    { word: 'a²+b²=c²', category: 'formula' },
    { word: 'sin(x)', category: 'formula' },
    // number (2)
    { word: '令和六年', category: 'number' },
    { word: '一万', category: 'number' },
    // long sentence (2)
    { word: '日本語を勉強しています', category: 'long_sentence' },
    { word: '今日はとても暑いですね', category: 'long_sentence' },
    // wrong_lang (3)
    { word: 'thanks', category: 'wrong_lang' },
    { word: '한국', category: 'wrong_lang' },
    { word: 'gracias', category: 'wrong_lang' },
    // edge (2)
    { word: 'ゔ', category: 'edge' },
    { word: 'っ', category: 'edge' },
    // polyphone (3) — different readings
    { word: '日', category: 'polyphone', readingHint: 'ひ' },
    { word: '生', category: 'polyphone' },
    { word: '人', category: 'polyphone' },
  ],

  'zh-CN': [
    // common (10)
    { word: '你好', category: 'common' },
    { word: '谢谢', category: 'common' },
    { word: '吃', category: 'common' },
    { word: '学校', category: 'common' },
    { word: '时间', category: 'common' },
    { word: '朋友', category: 'common' },
    { word: '钱', category: 'common' },
    { word: '家', category: 'common' },
    { word: '工作', category: 'common' },
    { word: '猫', category: 'common' },
    // polysemy (6)
    { word: '长', category: 'polysemy', readingHint: 'cháng — long' },
    { word: '行', category: 'polysemy', readingHint: 'háng — row' },
    { word: '重', category: 'polysemy' },
    { word: '会', category: 'polysemy', readingHint: 'huì' },
    { word: '银行', category: 'polysemy', note: 'bank not row' },
    { word: '东西', category: 'polysemy' },
    // rare (5)
    { word: '蹒跚', category: 'rare' },
    { word: '阑珊', category: 'rare' },
    { word: '婀娜', category: 'rare' },
    { word: '踟蹰', category: 'rare' },
    { word: '徜徉', category: 'rare' },
    // idiom (4)
    { word: '画蛇添足', category: 'idiom' },
    { word: '一举两得', category: 'idiom' },
    { word: '杯弓蛇影', category: 'idiom' },
    { word: '入乡随俗', category: 'idiom' },
    // typo (3)
    { word: '你侯', category: 'typo' },
    { word: '吃饭饭', category: 'typo' },
    { word: '谢射', category: 'typo' },
    // profanity (3)
    { word: '操', category: 'profanity' },
    { word: '傻逼', category: 'profanity' },
    { word: '混蛋', category: 'profanity' },
    // disputed (3)
    { word: '台湾', category: 'disputed' },
    { word: '习近平', category: 'disputed' },
    { word: '钓鱼岛', category: 'disputed' },
    // formula (2)
    { word: '2+2=4', category: 'formula' },
    { word: 'π', category: 'formula' },
    // number (2)
    { word: '二零二四', category: 'number' },
    { word: '万', category: 'number' },
    // long_sentence (2)
    { word: '我喜欢吃中国菜', category: 'long_sentence' },
    { word: '今天天气很好', category: 'long_sentence' },
    // wrong_lang (3)
    { word: 'hello', category: 'wrong_lang' },
    { word: '日本語', category: 'wrong_lang' },
    { word: '안녕', category: 'wrong_lang' },
    // edge (2)
    { word: '了', category: 'edge', note: 'particle' },
    { word: '的', category: 'edge', note: 'particle' },
    // polyphone (3)
    { word: '乐', category: 'polyphone', readingHint: 'lè — happy' },
    { word: '为', category: 'polyphone' },
    { word: '种', category: 'polyphone' },
  ],

  en: [
    // common (10)
    { word: 'hello', category: 'common' },
    { word: 'love', category: 'common' },
    { word: 'eat', category: 'common' },
    { word: 'school', category: 'common' },
    { word: 'coffee', category: 'common' },
    { word: 'friend', category: 'common' },
    { word: 'time', category: 'common' },
    { word: 'money', category: 'common' },
    { word: 'house', category: 'common' },
    { word: 'work', category: 'common' },
    // polysemy (6)
    { word: 'bank', category: 'polysemy', note: 'river/financial' },
    { word: 'spring', category: 'polysemy', note: 'season/coil/water' },
    { word: 'bat', category: 'polysemy', note: 'animal/baseball' },
    { word: 'light', category: 'polysemy', note: 'illumination/weight' },
    { word: 'set', category: 'polysemy', note: 'most polysemous English word' },
    { word: 'run', category: 'polysemy' },
    // rare (5)
    { word: 'sesquipedalian', category: 'rare' },
    { word: 'defenestration', category: 'rare' },
    { word: 'mellifluous', category: 'rare' },
    { word: 'petrichor', category: 'rare' },
    { word: 'sonder', category: 'rare', note: 'neologism' },
    // idiom (4)
    { word: 'piece of cake', category: 'idiom' },
    { word: 'break a leg', category: 'idiom' },
    { word: 'spill the beans', category: 'idiom' },
    { word: 'hit the books', category: 'idiom' },
    // typo (3)
    { word: 'recieve', category: 'typo' },
    { word: 'definately', category: 'typo' },
    { word: 'beautifull', category: 'typo' },
    // profanity (3)
    { word: 'shit', category: 'profanity' },
    { word: 'damn', category: 'profanity' },
    { word: 'asshole', category: 'profanity' },
    // disputed (3)
    { word: 'Trump', category: 'disputed' },
    { word: 'Taiwan', category: 'disputed' },
    { word: 'Crimea', category: 'disputed' },
    // formula (2)
    { word: 'E=mc^2', category: 'formula' },
    { word: 'x²+y²=z²', category: 'formula' },
    // number (2)
    { word: '2024', category: 'number' },
    { word: 'million', category: 'number' },
    // long_sentence (2)
    { word: 'I love learning languages', category: 'long_sentence' },
    { word: 'The weather is beautiful today', category: 'long_sentence' },
    // wrong_lang (3)
    { word: '안녕', category: 'wrong_lang' },
    { word: 'こんにちは', category: 'wrong_lang' },
    { word: 'gracias', category: 'wrong_lang' },
    // edge (2)
    { word: 'a', category: 'edge', note: 'single letter' },
    { word: 'the', category: 'edge', note: 'function word' },
    // tech/loanword (3)
    { word: 'kimchi', category: 'polyphone', note: 'loanword' },
    { word: 'algorithm', category: 'polyphone' },
    { word: 'meme', category: 'polyphone' },
  ],

  es: [
    // common (10)
    { word: 'hola', category: 'common' },
    { word: 'amor', category: 'common' },
    { word: 'comer', category: 'common' },
    { word: 'escuela', category: 'common' },
    { word: 'café', category: 'common' },
    { word: 'amigo', category: 'common' },
    { word: 'tiempo', category: 'common' },
    { word: 'dinero', category: 'common' },
    { word: 'casa', category: 'common' },
    { word: 'trabajar', category: 'common' },
    // polysemy (6)
    { word: 'banco', category: 'polysemy', note: 'bench/bank' },
    { word: 'gato', category: 'polysemy', note: 'cat/jack' },
    { word: 'mango', category: 'polysemy', note: 'fruit/handle' },
    { word: 'cabo', category: 'polysemy', note: 'cape/corporal/end' },
    { word: 'planta', category: 'polysemy', note: 'plant/floor/sole' },
    { word: 'partido', category: 'polysemy' },
    // rare (5)
    { word: 'arrebol', category: 'rare' },
    { word: 'inefable', category: 'rare' },
    { word: 'tertulia', category: 'rare' },
    { word: 'pundonor', category: 'rare' },
    { word: 'sobremesa', category: 'rare' },
    // idiom (4)
    { word: 'tomar el pelo', category: 'idiom' },
    { word: 'estar en las nubes', category: 'idiom' },
    { word: 'echar agua al mar', category: 'idiom' },
    { word: 'no tener pelos en la lengua', category: 'idiom' },
    // typo (3)
    { word: 'gracías', category: 'typo' },
    { word: 'hablär', category: 'typo' },
    { word: 'avitación', category: 'typo' },
    // profanity (3)
    { word: 'mierda', category: 'profanity' },
    { word: 'cabrón', category: 'profanity' },
    { word: 'joder', category: 'profanity' },
    // disputed (3)
    { word: 'Cataluña', category: 'disputed' },
    { word: 'Maduro', category: 'disputed' },
    { word: 'Malvinas', category: 'disputed' },
    // formula (2)
    { word: 'E=mc²', category: 'formula' },
    { word: 'πr²', category: 'formula' },
    // number (2)
    { word: 'mil', category: 'number' },
    { word: '2024', category: 'number' },
    // long_sentence (2)
    { word: 'Me gusta aprender idiomas', category: 'long_sentence' },
    { word: 'Hoy hace mucho calor', category: 'long_sentence' },
    // wrong_lang (3)
    { word: 'hello', category: 'wrong_lang' },
    { word: '안녕', category: 'wrong_lang' },
    { word: 'merci', category: 'wrong_lang' },
    // edge (2)
    { word: 'sí', category: 'edge' },
    { word: 'a', category: 'edge' },
    // special chars (3)
    { word: 'señor', category: 'polyphone' },
    { word: 'corazón', category: 'polyphone' },
    { word: 'mañana', category: 'polyphone' },
  ],

  fr: [
    // common (10)
    { word: 'bonjour', category: 'common' },
    { word: 'amour', category: 'common' },
    { word: 'manger', category: 'common' },
    { word: 'école', category: 'common' },
    { word: 'café', category: 'common' },
    { word: 'ami', category: 'common' },
    { word: 'temps', category: 'common' },
    { word: 'argent', category: 'common' },
    { word: 'maison', category: 'common' },
    { word: 'travailler', category: 'common' },
    // polysemy (6)
    { word: 'avocat', category: 'polysemy', note: 'lawyer / avocado' },
    { word: 'temps', category: 'polysemy', note: 'time / weather' },
    { word: 'voler', category: 'polysemy', note: 'fly / steal' },
    { word: 'louer', category: 'polysemy', note: 'rent / praise' },
    { word: 'verre', category: 'polysemy', note: 'glass material / drinking glass' },
    { word: 'pas', category: 'polysemy', note: 'step / negation' },
    // rare (5)
    { word: 'flâner', category: 'rare' },
    { word: 'dépaysement', category: 'rare' },
    { word: 'savoir-vivre', category: 'rare' },
    { word: 'cocasse', category: 'rare' },
    { word: 'guilleret', category: 'rare' },
    // idiom (4)
    { word: 'avoir le cafard', category: 'idiom' },
    { word: 'coûter les yeux de la tête', category: 'idiom' },
    { word: 'poser un lapin', category: 'idiom' },
    { word: 'tomber dans les pommes', category: 'idiom' },
    // typo (3)
    { word: 'mercie', category: 'typo' },
    { word: 'belle̊', category: 'typo' },
    { word: 'commencons', category: 'typo' },
    // profanity (3)
    { word: 'merde', category: 'profanity' },
    { word: 'putain', category: 'profanity' },
    { word: 'connard', category: 'profanity' },
    // disputed (3)
    { word: 'Macron', category: 'disputed' },
    { word: 'Algérie française', category: 'disputed' },
    { word: 'Kanaky', category: 'disputed' },
    // formula (2)
    { word: 'E=mc²', category: 'formula' },
    { word: 'x²-y²', category: 'formula' },
    // number (2)
    { word: 'mille', category: 'number' },
    { word: 'quatre-vingts', category: 'number' },
    // long_sentence (2)
    { word: 'J\'aime apprendre les langues', category: 'long_sentence' },
    { word: 'Il fait beau aujourd\'hui', category: 'long_sentence' },
    // wrong_lang (3)
    { word: 'hello', category: 'wrong_lang' },
    { word: '안녕', category: 'wrong_lang' },
    { word: 'danke', category: 'wrong_lang' },
    // edge (2)
    { word: 'le', category: 'edge' },
    { word: 'à', category: 'edge' },
    // accent/elision (3)
    { word: 'château', category: 'polyphone' },
    { word: 'œuvre', category: 'polyphone' },
    { word: 'aujourd\'hui', category: 'polyphone' },
  ],

  de: [
    // common (10)
    { word: 'hallo', category: 'common' },
    { word: 'Liebe', category: 'common' },
    { word: 'essen', category: 'common' },
    { word: 'Schule', category: 'common' },
    { word: 'Kaffee', category: 'common' },
    { word: 'Freund', category: 'common' },
    { word: 'Zeit', category: 'common' },
    { word: 'Geld', category: 'common' },
    { word: 'Haus', category: 'common' },
    { word: 'arbeiten', category: 'common' },
    // polysemy (6)
    { word: 'Bank', category: 'polysemy', note: 'bench / bank' },
    { word: 'Schloss', category: 'polysemy', note: 'castle / lock' },
    { word: 'Birne', category: 'polysemy', note: 'pear / lightbulb' },
    { word: 'Atlas', category: 'polysemy' },
    { word: 'Mutter', category: 'polysemy', note: 'mother / nut hardware' },
    { word: 'Strom', category: 'polysemy', note: 'current / river' },
    // rare (5)
    { word: 'Fernweh', category: 'rare' },
    { word: 'Torschlusspanik', category: 'rare' },
    { word: 'Backpfeifengesicht', category: 'rare' },
    { word: 'Drachenfutter', category: 'rare' },
    { word: 'Kummerspeck', category: 'rare' },
    // idiom (4)
    { word: 'Tomaten auf den Augen haben', category: 'idiom' },
    { word: 'die Daumen drücken', category: 'idiom' },
    { word: 'das ist mir Wurst', category: 'idiom' },
    { word: 'um den heißen Brei reden', category: 'idiom' },
    // typo (3)
    { word: 'wievile', category: 'typo' },
    { word: 'Schulle', category: 'typo' },
    { word: 'Wißen', category: 'typo' },
    // profanity (3)
    { word: 'Scheiße', category: 'profanity' },
    { word: 'Arschloch', category: 'profanity' },
    { word: 'verdammt', category: 'profanity' },
    // disputed (3)
    { word: 'Königsberg', category: 'disputed' },
    { word: 'Sudetenland', category: 'disputed' },
    { word: 'Merkel', category: 'disputed' },
    // formula (2)
    { word: 'E=mc²', category: 'formula' },
    { word: 'a+b=c', category: 'formula' },
    // number (2)
    { word: 'tausend', category: 'number' },
    { word: 'einundzwanzig', category: 'number' },
    // long_sentence (2)
    { word: 'Ich lerne gerne Sprachen', category: 'long_sentence' },
    { word: 'Heute ist das Wetter schön', category: 'long_sentence' },
    // wrong_lang (3)
    { word: 'hello', category: 'wrong_lang' },
    { word: '안녕', category: 'wrong_lang' },
    { word: 'grazie', category: 'wrong_lang' },
    // edge (2)
    { word: 'das', category: 'edge' },
    { word: 'ja', category: 'edge' },
    // umlaut/sharp s (3)
    { word: 'Mädchen', category: 'polyphone' },
    { word: 'Straße', category: 'polyphone' },
    { word: 'fünf', category: 'polyphone' },
  ],

  it: [
    // common (10)
    { word: 'ciao', category: 'common' },
    { word: 'amore', category: 'common' },
    { word: 'mangiare', category: 'common' },
    { word: 'scuola', category: 'common' },
    { word: 'caffè', category: 'common' },
    { word: 'amico', category: 'common' },
    { word: 'tempo', category: 'common' },
    { word: 'soldi', category: 'common' },
    { word: 'casa', category: 'common' },
    { word: 'lavorare', category: 'common' },
    // polysemy (6)
    { word: 'banca', category: 'polysemy' },
    { word: 'pesca', category: 'polysemy', note: 'peach / fishing' },
    { word: 'piano', category: 'polysemy', note: 'plan/slow/floor/piano' },
    { word: 'capitale', category: 'polysemy', note: 'capital city / money' },
    { word: 'campagna', category: 'polysemy', note: 'countryside / campaign' },
    { word: 'campo', category: 'polysemy' },
    // rare (5)
    { word: 'meraviglioso', category: 'rare' },
    { word: 'culaccino', category: 'rare' },
    { word: 'sprezzatura', category: 'rare' },
    { word: 'gattara', category: 'rare' },
    { word: 'apericena', category: 'rare' },
    // idiom (4)
    { word: 'in bocca al lupo', category: 'idiom' },
    { word: 'avere le mani in pasta', category: 'idiom' },
    { word: 'non vedere l\'ora', category: 'idiom' },
    { word: 'prendere due piccioni con una fava', category: 'idiom' },
    // typo (3)
    { word: 'grazzie', category: 'typo' },
    { word: 'beleza', category: 'typo' },
    { word: 'cassa', category: 'typo' },
    // profanity (3)
    { word: 'merda', category: 'profanity' },
    { word: 'cazzo', category: 'profanity' },
    { word: 'stronzo', category: 'profanity' },
    // disputed (3)
    { word: 'Mussolini', category: 'disputed' },
    { word: 'Trieste', category: 'disputed' },
    { word: 'Berlusconi', category: 'disputed' },
    // formula (2)
    { word: 'E=mc²', category: 'formula' },
    { word: '2π', category: 'formula' },
    // number (2)
    { word: 'mille', category: 'number' },
    { word: 'venti', category: 'number' },
    // long_sentence (2)
    { word: 'Mi piace imparare le lingue', category: 'long_sentence' },
    { word: 'Oggi fa molto caldo', category: 'long_sentence' },
    // wrong_lang (3)
    { word: 'hello', category: 'wrong_lang' },
    { word: '안녕', category: 'wrong_lang' },
    { word: 'gracias', category: 'wrong_lang' },
    // edge (2)
    { word: 'è', category: 'edge' },
    { word: 'a', category: 'edge' },
    // accent (3)
    { word: 'perché', category: 'polyphone' },
    { word: 'più', category: 'polyphone' },
    { word: 'così', category: 'polyphone' },
  ],
};

// Reverse lookup corpus — fewer entries since reverse is a separate flow.
// Per study lang: 8 native-lang inputs the user might enter wanting candidates.
const REVERSE_CORPUS = {
  // sourceLang (study) → list of input words in various target/native langs
  ko: [
    { word: 'apple', inputLang: 'en' },
    { word: 'love', inputLang: 'en' },
    { word: 'りんご', inputLang: 'ja' },
    { word: '苹果', inputLang: 'zh-CN' },
    { word: 'manzana', inputLang: 'es' },
    { word: 'Apfel', inputLang: 'de' },
    { word: 'sad', inputLang: 'en' },
    { word: 'mountain', inputLang: 'en' },
  ],
  ja: [
    { word: 'apple', inputLang: 'en' },
    { word: 'happy', inputLang: 'en' },
    { word: '사과', inputLang: 'ko' },
    { word: '苹果', inputLang: 'zh-CN' },
    { word: 'pomme', inputLang: 'fr' },
    { word: 'Wasser', inputLang: 'de' },
    { word: 'rain', inputLang: 'en' },
    { word: 'study', inputLang: 'en' },
  ],
  'zh-CN': [
    { word: 'apple', inputLang: 'en' },
    { word: 'water', inputLang: 'en' },
    { word: '사과', inputLang: 'ko' },
    { word: 'りんご', inputLang: 'ja' },
    { word: 'casa', inputLang: 'es' },
    { word: 'libro', inputLang: 'it' },
    { word: 'beautiful', inputLang: 'en' },
    { word: 'friend', inputLang: 'en' },
  ],
  en: [
    { word: '사과', inputLang: 'ko' },
    { word: 'りんご', inputLang: 'ja' },
    { word: '苹果', inputLang: 'zh-CN' },
    { word: 'manzana', inputLang: 'es' },
    { word: 'pomme', inputLang: 'fr' },
    { word: 'Apfel', inputLang: 'de' },
    { word: 'mela', inputLang: 'it' },
    { word: '사랑', inputLang: 'ko' },
  ],
  es: [
    { word: 'apple', inputLang: 'en' },
    { word: 'house', inputLang: 'en' },
    { word: '사과', inputLang: 'ko' },
    { word: 'りんご', inputLang: 'ja' },
    { word: 'Wasser', inputLang: 'de' },
    { word: 'libro', inputLang: 'it' },
    { word: 'family', inputLang: 'en' },
    { word: 'beautiful', inputLang: 'en' },
  ],
  fr: [
    { word: 'apple', inputLang: 'en' },
    { word: 'water', inputLang: 'en' },
    { word: '사과', inputLang: 'ko' },
    { word: 'りんご', inputLang: 'ja' },
    { word: 'manzana', inputLang: 'es' },
    { word: 'Brot', inputLang: 'de' },
    { word: 'family', inputLang: 'en' },
    { word: 'beautiful', inputLang: 'en' },
  ],
  de: [
    { word: 'apple', inputLang: 'en' },
    { word: 'water', inputLang: 'en' },
    { word: '사과', inputLang: 'ko' },
    { word: 'りんご', inputLang: 'ja' },
    { word: 'manzana', inputLang: 'es' },
    { word: 'pomme', inputLang: 'fr' },
    { word: 'family', inputLang: 'en' },
    { word: 'beautiful', inputLang: 'en' },
  ],
  it: [
    { word: 'apple', inputLang: 'en' },
    { word: 'water', inputLang: 'en' },
    { word: '사과', inputLang: 'ko' },
    { word: 'りんご', inputLang: 'ja' },
    { word: 'manzana', inputLang: 'es' },
    { word: 'pomme', inputLang: 'fr' },
    { word: 'family', inputLang: 'en' },
    { word: 'beautiful', inputLang: 'en' },
  ],
};

module.exports = { SOURCE_LANGS, CORPUS, REVERSE_CORPUS };
