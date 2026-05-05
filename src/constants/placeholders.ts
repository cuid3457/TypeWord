/** Language-specific placeholder examples for wordlist name and word lookup. */

const BOOKS: Record<string, string[]> = {
  en: [
    'The Great Gatsby', 'Jane Eyre', 'Pride and Prejudice', 'The Hobbit',
    'Little Women', 'Alice in Wonderland', 'The Catcher in the Rye', 'Winnie-the-Pooh',
    'Charlotte\'s Web', 'Anne of Green Gables', 'Treasure Island', 'The Secret Garden',
    'Peter Pan', 'A Wrinkle in Time', '1984', 'Life of Pi',
    'Wonder', 'The Giver', 'Tuesdays with Morrie', 'To Kill a Mockingbird',
  ],
  ko: [
    '채식주의자', '토지', '소나기', '혼불',
    '난장이가 쏘아올린 작은 공', '객주', '살인자의 기억법', '우리들의 행복한 시간',
    '상록수', '봄봄', '달러구트 꿈 백화점', '메밀꽃 필 무렵',
    '운수 좋은 날', '광장', '나목', '역마',
    '우리들의 일그러진 영웅', '당신들의 천국', '장마', '별들의 고향',
  ],
  ja: [
    'ノルウェイの森', '容疑者Xの献身', '窓ぎわのトットちゃん', '坊っちゃん',
    '吾輩は猫である', '走れメロス', '銀河鉄道の夜', '注文の多い料理店',
    '人間失格', 'コンビニ人間', '博士の愛した数式', '世界の終りとハードボイルド・ワンダーランド',
    '蜜蜂と遠雷', '夜は短し歩けよ乙女', 'キッチン', '色彩を持たない多崎つくる',
    'かもめ食堂', '図書館戦争', 'また同じ夢を見ていた', 'コーヒーが冷めないうちに',
  ],
  // Curated for politically/morally neutral classics + globally translated
  // works. Avoids titles tied to Cultural Revolution trauma, religious
  // sensitivity, or explicit content.
  'zh-CN': [
    // 4 Chinese classics (universal)
    '红楼梦', '西游记', '三国演义', '水浒传',
    // Universal Chinese literature (apolitical)
    '围城', '边城', '骆驼祥子', '城南旧事',
    // Taiwan author Sanmao — beloved travel writing
    '撒哈拉的故事',
    // Translated international classics
    '小王子', '老人与海', '哈利·波特', '简爱', '傲慢与偏见',
    '飘', '安徒生童话', '伊索寓言',
    // Modern light fiction (apolitical)
    '你好旧时光', '从你的全世界路过', '解忧杂货店',
  ],
  'zh-TW': [
    // 4 Chinese classics (universal)
    '紅樓夢', '西遊記', '三國演義', '水滸傳',
    // Taiwan-friendly authors (Sanmao, Lin Haiyin — beloved, apolitical)
    '撒哈拉的故事', '雨季不再來', '城南舊事',
    // Translated international classics
    '小王子', '老人與海', '哈利波特', '簡愛', '傲慢與偏見',
    '飄', '安徒生童話', '伊索寓言', '一千零一夜',
    // Universal Chinese literature
    '圍城', '邊城', '駱駝祥子',
    // Modern light fiction
    '解憂雜貨店', '從你的全世界路過',
  ],
  es: [
    'Cien años de soledad', 'Don Quijote', 'La sombra del viento', 'Como agua para chocolate',
    'El amor en los tiempos del cólera', 'Rayuela', 'La casa de los espíritus', 'El laberinto de los espíritus',
    'Paula', 'El túnel', 'Ficciones', 'Pedro Páramo',
    'La colmena', 'Nada', 'El aleph', 'Platero y yo',
    'La familia de Pascual Duarte', 'Veinte poemas de amor', 'La ciudad y los perros', 'El Llano en llamas',
  ],
  fr: [
    'Le Petit Prince', 'Les Misérables', 'Le Comte de Monte-Cristo', 'L\'Étranger',
    'Madame Bovary', 'Les Trois Mousquetaires', 'Notre-Dame de Paris', 'Germinal',
    'Le Grand Meaulnes', 'Cyrano de Bergerac', 'La Peste', 'Bel-Ami',
    'Candide', 'La Gloire de mon père', 'Le Petit Nicolas', 'Astérix',
    'Vingt mille lieues sous les mers', 'Vol de nuit', 'L\'Élégance du hérisson', 'La Délicatesse',
  ],
  de: [
    'Die unendliche Geschichte', 'Die Leiden des jungen Werther', 'Faust', 'Die Verwandlung',
    'Siddhartha', 'Das Parfum', 'Momo', 'Der Vorleser',
    'Im Westen nichts Neues', 'Tintenherz', 'Der Steppenwolf', 'Emil und die Detektive',
    'Effi Briest', 'Heidi', 'Der Zauberberg', 'Das Boot',
    'Krabat', 'Jim Knopf', 'Rico, Oskar und die Tieferschatten', 'Tschick',
  ],
  it: [
    'Il deserto dei Tartari', 'La divina commedia', 'Il nome della rosa', 'Se questo è un uomo',
    'Il Gattopardo', 'Pinocchio', 'La coscienza di Zeno', 'I promessi sposi',
    'Io non ho paura', 'L\'amica geniale', 'Se una notte d\'inverno un viaggiatore', 'Marcovaldo',
    'Il barone rampante', 'La luna e i falò', 'Il visconte dimezzato', 'Sostiene Pereira',
    'Va\' dove ti porta il cuore', 'Lessico famigliare', 'La solitudine dei numeri primi', 'Gomorra',
  ],
  pt: [
    'O Alquimista', 'Gabriela, Cravo e Canela', 'Dom Casmurro', 'Memórias Póstumas de Brás Cubas',
    'A Hora da Estrela', 'Capitães da Areia', 'Ensaio sobre a Cegueira', 'O Cortiço',
    'Vidas Secas', 'Grande Sertão: Veredas', 'O Auto da Compadecida', 'Memorial do Convento',
    'Mar Morto', 'Iracema', 'O Guarani', 'Os Lusíadas',
    'Dona Flor e Seus Dois Maridos', 'Til', 'A Cidade e as Serras', 'O Meu Pé de Laranja Lima',
  ],
  ru: [
    'Братья Карамазовы', 'Война и мир', 'Мастер и Маргарита', 'Преступление и наказание',
    'Анна Каренина', 'Евгений Онегин', 'Двенадцать стульев', 'Мы',
    'Доктор Живаго', 'Мёртвые души', 'Идиот', 'Отцы и дети',
    'Собачье сердце', 'Вишнёвый сад', 'Герой нашего времени', 'Обломов',
    'Чайка', 'Дядя Ваня', 'Тихий Дон', 'Золотой телёнок',
  ],
};

// Intermediate-level (~B1 / TOPIK 3 / HSK 3-4 / JLPT N3) words selected for
// beauty and positive connotation. Avoids literary/archaic/highly-compound forms.
const WORDS: Record<string, string[]> = {
  en: [
    'harmony', 'blossom', 'melody', 'horizon',
    'breeze', 'sparkle', 'gentle', 'whisper',
    'sunshine', 'kindness', 'cheerful', 'graceful',
    'rainbow', 'sunset', 'bloom', 'twilight',
    'meadow', 'comfort', 'wonder', 'cherish',
  ],
  ko: [
    '설렘', '여유', '따스함', '포근하다',
    '나들이', '반짝이다', '산들바람', '다정하다',
    '보람', '봄날', '풍경', '햇살',
    '노을', '향기', '미소', '꽃잎',
    '바람결', '평온', '햇볕', '예쁘다',
  ],
  ja: [
    '春風', '夕焼け', '星空', '陽だまり',
    '微笑み', '心地よい', '爽やか', '穏やか',
    '懐かしい', '風鈴', 'ときめき', '月明かり',
    '彩り', '朝日', 'そよ風', '輝き',
    '優しい', '楽しい', '元気', '希望',
  ],
  'zh-CN': [
    '温柔', '花开', '微风', '晨光',
    '清澈', '星辰', '明朗', '春意',
    '欢喜', '美好', '灿烂', '柔和',
    '宁静', '暖阳', '温暖', '幸福',
    '花香', '阳光', '希望', '快乐',
  ],
  'zh-TW': [
    '溫柔', '花開', '微風', '晨光',
    '清澈', '星辰', '明朗', '春意',
    '歡喜', '美好', '燦爛', '柔和',
    '寧靜', '暖陽', '溫暖', '幸福',
    '花香', '陽光', '希望', '快樂',
  ],
  es: [
    'mariposa', 'amanecer', 'brisa', 'jardín',
    'estrella', 'alegría', 'arcoíris', 'primavera',
    'sonrisa', 'melodía', 'horizonte', 'amistad',
    'dulce', 'luz', 'flor', 'brillante',
    'calma', 'cielo', 'esperanza', 'belleza',
  ],
  fr: [
    'lumière', 'papillon', 'sourire', 'douceur',
    'arc-en-ciel', 'étoile', 'fleur', 'aurore',
    'brise', 'chaleur', 'mélodie', 'printemps',
    'horizon', 'rêve', 'magie', 'joyeux',
    'amour', 'calme', 'soleil', 'jardin',
  ],
  de: [
    'Sonnenschein', 'Schmetterling', 'Frühling', 'Regenbogen',
    'Wärme', 'Sonnenaufgang', 'Blume', 'Freude',
    'Stern', 'Traum', 'Hoffnung', 'Garten',
    'Lächeln', 'Glück', 'Liebe', 'wunderbar',
    'herzlich', 'fröhlich', 'sanft', 'schön',
  ],
  it: [
    'dolcezza', 'farfalla', 'armonia', 'tramonto',
    'brezza', 'sorriso', 'primavera', 'arcobaleno',
    'melodia', 'aurora', 'amore', 'calma',
    'fiore', 'luce', 'sole', 'dolce',
    'bello', 'gentile', 'felice', 'cielo',
  ],
  pt: [
    'alegria', 'borboleta', 'amanhecer', 'brisa',
    'estrela', 'arco-íris', 'primavera', 'sorriso',
    'melodia', 'horizonte', 'brilho', 'cascata',
    'flor', 'luz', 'ternura', 'calma',
    'amigo', 'sol', 'esperança', 'beleza',
  ],
  ru: [
    'счастье', 'рассвет', 'бабочка', 'гармония',
    'звезда', 'мелодия', 'радуга', 'уют',
    'весна', 'улыбка', 'тепло', 'мечта',
    'свет', 'доброта', 'радость', 'солнце',
    'цветок', 'ласковый', 'чудесный', 'волшебный',
  ],
};

const EXAMPLE_PREFIX: Record<string, string> = {
  ko: '예:',
  en: 'e.g.',
  ja: '例:',
  zh: '例:',
  es: 'ej.',
  fr: 'ex.',
  de: 'z.B.',
  it: 'es.',
  pt: 'ex.',
  ru: 'напр.',
};

export function getExamplePrefix(langCode: string): string {
  return EXAMPLE_PREFIX[langCode] ?? EXAMPLE_PREFIX.en;
}

const FALLBACK_BOOKS = BOOKS.en;
const FALLBACK_WORDS = WORDS.en;

export function getPlaceholder(langCode: string): { book: string; word: string } {
  const books = BOOKS[langCode] ?? FALLBACK_BOOKS;
  const words = WORDS[langCode] ?? FALLBACK_WORDS;
  return {
    book: books[Math.floor(Math.random() * books.length)],
    word: words[Math.floor(Math.random() * words.length)],
  };
}
