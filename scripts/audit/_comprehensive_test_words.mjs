// Comprehensive 8-source × 50-word test list for cross-pair audit.
// Categories per source:
//   common (15)    — HSK1 / N5 / TOPIK1 / A1 daily vocabulary
//   polysemy (8)   — homonyms / polysemes
//   typos (7)      — single-char typo + inflected forms (verifier should
//                    lemmatize)
//   edges (10)     — sentence-like input / loanword / greeting / na-adj /
//                    proper noun / honorific / hyphen / mixed-script
//   numbers (5)    — digit / decimal / symbol / acronym
//   propers (5)    — place / brand / person / acronym

export const TEST_WORDS = {
  ko: {
    common: ["학교", "친구", "먹다", "사람", "책", "가다", "사랑", "시간", "일", "마시다", "오다", "보다", "주다", "받다", "좋다"],
    polysemy: ["배", "다리", "눈", "손", "차", "말", "사과", "자", "거리", "기름"],
    typos: ["학굣", "친귀", "먹는다", "있어요", "갓어요", "회새", "사림"],
    edges: ["안녕하세요", "감사합니다", "잘 부탁드립니다", "사이다", "캐나다", "비행기를 타다", "고추장", "엄청 좋다", "아이폰", "보고싶다"],
    numbers: ["42", "1984", "3.14", "@", "100"],
    propers: ["서울", "한국", "김치", "BTS", "삼성"],
  },
  en: {
    common: ["book", "happy", "give", "school", "friend", "eat", "go", "see", "have", "make", "love", "time", "day", "house", "water"],
    polysemy: ["bank", "bat", "bear", "spring", "light", "run", "watch", "play", "right", "match"],
    typos: ["recieve", "definately", "seperate", "occured", "untill", "wierd", "thier"],
    edges: ["look up", "kick the bucket", "as soon as possible", "long-term", "Wi-Fi", "iPhone", "well-known", "state-of-the-art", "running", "ate"],
    numbers: ["42", "1984", "3.14", "@", "100"],
    propers: ["Seoul", "Microsoft", "NASA", "Tokyo", "Anna"],
  },
  ja: {
    common: ["学校", "友達", "食べる", "人", "本", "行く", "好き", "時間", "日", "飲む", "見る", "話す", "聞く", "書く", "読む"],
    polysemy: ["見る", "かける", "取る", "出る", "つく", "あげる", "やる", "切る", "つける", "止める"],
    typos: ["こんにちわ", "おはようござます", "ありがとうごじゃいます", "おねがします", "食べました", "行きまし", "飲みたい"],
    edges: ["よろしくお願いします", "いただきます", "ごちそうさま", "サボる", "コーヒー", "マンション", "クレーム", "お茶", "ご飯", "美しい"],
    numbers: ["42", "1984", "3.14", "@", "100"],
    propers: ["東京", "日本", "ソニー", "NHK", "JR"],
  },
  "zh-CN": {
    common: ["学校", "朋友", "吃", "人", "书", "去", "喜欢", "时间", "天", "喝", "看", "说", "听", "写", "读"],
    polysemy: ["行", "长", "重", "还", "着", "都", "觉", "干", "好", "中"],
    typos: ["你号", "謝謝", "對不起", "再見", "学习", "工作", "知道"],
    edges: ["你好", "谢谢", "对不起", "再见", "一帆风顺", "马马虎虎", "好吃", "漂亮", "学校", "电脑"],
    numbers: ["42", "1984", "3.14", "@", "100"],
    propers: ["北京", "中国", "上海", "CCTV", "NBA"],
  },
  es: {
    common: ["casa", "comer", "agua", "libro", "amigo", "ir", "hacer", "tener", "decir", "ver", "querer", "saber", "poder", "venir", "estar"],
    polysemy: ["banco", "vela", "muñeca", "carta", "cabo", "lima", "campo", "frente", "orden", "planta"],
    typos: ["hablar", "querio", "mananas", "porfavor", "graciaa", "comprar", "tarde"],
    edges: ["por favor", "buenos días", "muchas gracias", "está bien", "hasta luego", "mañana", "señor", "rápidamente", "embarazada", "actualmente"],
    numbers: ["42", "1984", "3.14", "@", "100"],
    propers: ["Madrid", "España", "Picasso", "ONU", "FIFA"],
  },
  fr: {
    common: ["maison", "manger", "eau", "livre", "ami", "aller", "faire", "avoir", "dire", "voir", "vouloir", "savoir", "pouvoir", "venir", "être"],
    polysemy: ["livre", "tour", "vol", "carte", "pièce", "feu", "cours", "lettre", "voile", "glace"],
    typos: ["bojour", "merci beacoup", "comment alle vous", "porfait", "samain", "biensur", "atention"],
    edges: ["bonjour", "s'il vous plaît", "merci beaucoup", "au revoir", "ça va", "c'est", "l'eau", "j'aime", "lecture", "sensible"],
    numbers: ["42", "1984", "3.14", "@", "100"],
    propers: ["Paris", "France", "Louvre", "SNCF", "EDF"],
  },
  de: {
    common: ["Haus", "essen", "Wasser", "Buch", "Freund", "gehen", "machen", "haben", "sagen", "sehen", "wollen", "wissen", "können", "kommen", "sein"],
    polysemy: ["Bank", "Schloss", "Strauß", "Mutter", "Decke", "Kiefer", "Tau", "Hahn", "Leiter", "Ball"],
    typos: ["danke schon", "guten morgan", "auf wiedersehn", "entschuldigun", "essen Sie", "ich liebe dich", "wie geht's"],
    edges: ["zum Beispiel", "guten Tag", "vielen Dank", "auf Wiedersehen", "Wie geht's?", "aufstehen", "Sonnenuntergang", "Krankenhaus", "Gift", "sensibel"],
    numbers: ["42", "1984", "3.14", "@", "100"],
    propers: ["Berlin", "Deutschland", "BMW", "NATO", "EU"],
  },
  it: {
    common: ["casa", "mangiare", "acqua", "libro", "amico", "andare", "fare", "avere", "dire", "vedere", "volere", "sapere", "potere", "venire", "essere"],
    polysemy: ["calcio", "ala", "vela", "campo", "vista", "porto", "credo", "molla", "lima", "torre"],
    typos: ["chiao", "grazi", "buongiorni", "perfavore", "scusami", "amici", "tardi"],
    edges: ["per favore", "buongiorno", "grazie mille", "arrivederci", "come stai", "morbido", "fattoria", "camera", "parente", "magazzino"],
    numbers: ["42", "1984", "3.14", "@", "100"],
    propers: ["Roma", "Italia", "Ferrari", "FIAT", "Rossi"],
  },
};

// Flatten with category tags for reporting
export function flattenTestWords() {
  const out = [];
  for (const [lang, cats] of Object.entries(TEST_WORDS)) {
    for (const [cat, words] of Object.entries(cats)) {
      for (const w of words) {
        out.push({ source: lang, category: cat, word: w });
      }
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Standalone run: print summary
  for (const [lang, cats] of Object.entries(TEST_WORDS)) {
    const total = Object.values(cats).reduce((a, b) => a + b.length, 0);
    console.log(`${lang.padEnd(8)} total=${total} (${Object.entries(cats).map(([k, v]) => `${k}=${v.length}`).join(", ")})`);
  }
  const flat = flattenTestWords();
  console.log(`\nGrand total: ${flat.length} test items`);
}
