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
  zh: [
    '红楼梦', '西游记', '三国演义', '水浒传',
    '子夜', '活着', '围城', '平凡的世界',
    '骆驼祥子', '边城', '呐喊', '白鹿原',
    '许三观卖血记', '家', '长恨歌', '穆斯林的葬礼',
    '你好旧时光', '从你的全世界路过', '撒哈拉的故事', '兄弟',
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

const WORDS: Record<string, string[]> = {
  en: [
    'serendipity', 'harmony', 'blossom', 'wanderlust',
    'aurora', 'cascade', 'melody', 'horizon',
    'radiance', 'voyage', 'tranquil', 'whisper',
    'velvet', 'breeze', 'jubilant', 'lullaby',
    'sparkle', 'cherish', 'gentle', 'luminous',
  ],
  ko: [
    '설렘', '여유', '따스함', '싱그럽다',
    '포근하다', '나들이', '어울림', '반짝이다',
    '산들바람', '다정하다', '꿈결', '보람',
    '봄날', '고즈넉하다', '풍경', '어여쁘다',
    '햇살', '나른하다', '노을', '향기',
  ],
  ja: [
    '木漏れ日', '花吹雪', '風鈴', 'ときめき',
    '月明かり', '春風', '夕焼け', '星空',
    '陽だまり', '微笑み', '心地よい', '彩り',
    '爽やか', '穏やか', '煌めき', '懐かしい',
    '小春日和', '風薫る', '清らか', '和やか',
  ],
  zh: [
    '缘分', '温柔', '花开', '微风',
    '晨光', '清澈', '星辰', '和煦',
    '明朗', '安然', '春意', '欢喜',
    '如意', '美好', '芬芳', '灿烂',
    '柔和', '宁静', '悠然', '暖阳',
  ],
  es: [
    'mariposa', 'amanecer', 'brisa', 'encanto',
    'jardín', 'dulzura', 'estrella', 'alegría',
    'arcoíris', 'primavera', 'sonrisa', 'melodía',
    'horizonte', 'destello', 'cascada', 'susurro',
    'cristalino', 'florido', 'luminoso', 'sereno',
  ],
  fr: [
    'lumière', 'papillon', 'rêverie', 'sourire',
    'douceur', 'arc-en-ciel', 'étoile', 'fleur',
    'harmonie', 'aurore', 'merveille', 'brise',
    'chaleur', 'pétillant', 'tendresse', 'mélodie',
    'étincelle', 'printemps', 'sérénité', 'horizon',
  ],
  de: [
    'Wanderlust', 'Sonnenschein', 'Schmetterling', 'Frühling',
    'Sternenstaub', 'Geborgenheit', 'Morgenrot', 'Blütenblatt',
    'Lebensfreude', 'Sternschnuppe', 'Regenbogen', 'Windstille',
    'Glücklich', 'Traumhaft', 'Zauberhaft', 'Wunderbar',
    'Herzlich', 'Sanftmut', 'Heiterkeit', 'Lichtblick',
  ],
  it: [
    'dolcezza', 'farfalla', 'armonia', 'tramonto',
    'brezza', 'incanto', 'sorriso', 'primavera',
    'serenità', 'arcobaleno', 'melodia', 'aurora',
    'fioritura', 'scintilla', 'splendore', 'tenerezza',
    'luminoso', 'delicato', 'gioioso', 'meraviglia',
  ],
  pt: [
    'alegria', 'borboleta', 'saudade', 'amanhecer',
    'brisa', 'encanto', 'estrela', 'harmonia',
    'arco-íris', 'primavera', 'sorriso', 'melodia',
    'horizonte', 'brilho', 'cascata', 'serenidade',
    'florescer', 'luminoso', 'acolhedor', 'suavidade',
  ],
  ru: [
    'счастье', 'рассвет', 'бабочка', 'гармония',
    'звезда', 'мелодия', 'радуга', 'уют',
    'весна', 'улыбка', 'тепло', 'сияние',
    'мечта', 'рассвет', 'нежность', 'вдохновение',
    'светлый', 'ласковый', 'чудесный', 'волшебный',
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
