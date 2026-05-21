/** Language-specific placeholder examples for wordlist name and word lookup.
 *
 * Supports the 8 app languages: en / ko / ja / zh-CN / es / fr / de / it.
 *
 * BOOKS (wordlist name placeholder) — 80 entries per language across 7
 * categories (books, films, travel, food, hobbies, culture, current).
 * The variety hints to learners that wordlists work for any topic.
 *
 * WORDS (word lookup placeholder) — 100 entries per language.
 * B1-level vocab selected for beauty, positivity, and everyday relevance.
 */

const BOOKS: Record<string, string[]> = {
  en: [
    // Books (20)
    'The Great Gatsby', 'Jane Eyre', 'Pride and Prejudice', 'The Hobbit',
    'Little Women', 'Alice in Wonderland', 'The Catcher in the Rye', 'Winnie-the-Pooh',
    'Charlotte\'s Web', 'Anne of Green Gables', 'Treasure Island', 'The Secret Garden',
    'Peter Pan', 'A Wrinkle in Time', '1984', 'Life of Pi',
    'Wonder', 'The Giver', 'Tuesdays with Morrie', 'To Kill a Mockingbird',
    // Films / drama (10)
    'La La Land', 'Forrest Gump', 'The Lion King', 'Inception',
    'The Shawshank Redemption', 'Friends', 'Stranger Things', 'Toy Story',
    'Finding Nemo', 'Pride and Prejudice (movie)',
    // Travel (10)
    'Paris trip', 'Backpacking Europe', 'Tokyo travel', 'New York City',
    'Iceland road trip', 'Bali vacation', 'Hiking the Alps', 'London weekend',
    'Coastal California', 'Italy itinerary',
    // Food / cooking (10)
    'Italian cooking', 'Baking basics', 'French pastry', 'Mediterranean diet',
    'Sushi making', 'Coffee culture', 'Vegan recipes', 'Sunday brunch',
    'BBQ classics', 'Comfort food',
    // Hobbies / sports (10)
    'Yoga practice', 'Photography', 'Marathon training', 'Gardening',
    'Soccer matches', 'Tennis', 'Knitting', 'Acoustic guitar',
    'Cycling trips', 'Chess openings',
    // Culture / art (10)
    'Classical music', 'Broadway musicals', 'Modern art', 'Impressionist painters',
    'Jazz history', 'Film scores', 'Pop culture', 'Architecture tour',
    'Museum highlights', 'Vintage cinema',
    // News / daily (10)
    'Business English', 'Daily news', 'TED Talks', 'Podcast listening',
    'Editorial vocab', 'Tech newsletters', 'Climate stories', 'Health & wellness',
    'Science magazines', 'Op-ed columns',
  ],
  ko: [
    // 책 (20)
    '채식주의자', '토지', '소나기', '혼불',
    '난장이가 쏘아올린 작은 공', '객주', '살인자의 기억법', '우리들의 행복한 시간',
    '상록수', '봄봄', '달러구트 꿈 백화점', '메밀꽃 필 무렵',
    '운수 좋은 날', '광장', '나목', '역마',
    '우리들의 일그러진 영웅', '당신들의 천국', '장마', '별들의 고향',
    // 영화/드라마 (10)
    '기생충', '오징어 게임', '미스터 션샤인', '응답하라 1988',
    '도깨비', '이상한 변호사 우영우', '국제시장', '극한직업',
    '라라랜드', '인사이드 아웃',
    // 여행 (10)
    '제주도 여행', '경주 여행', '부산 여행', '서울 시티투어',
    '강릉 여행', '유럽 배낭여행', '도쿄 여행', '파리 여행',
    '발리 휴양', '뉴욕 여행',
    // 요리/음식 (10)
    '한식 요리', '집밥 레시피', '베이킹 입문', '브런치 카페',
    '이탈리아 요리', '비건 요리', '디저트 만들기', '한국 길거리 음식',
    '도시락 만들기', '홈카페',
    // 취미/스포츠 (10)
    '등산', '요가', '사진 촬영', '러닝',
    '캠핑', '축구', '클라이밍', '필라테스',
    '뜨개질', '독서 습관',
    // 문화/예술 (10)
    'K-pop', '뮤지컬', '클래식 음악', '재즈',
    '인디 음악', '현대 미술', '서양화', '사진전',
    '한국 전통문화', '전시 관람',
    // 시사/일상 (10)
    '비즈니스 한국어', '시사 한국어', '경제 뉴스', '뉴스 받아쓰기',
    '면접 회화', '직장 회화', '환경 이야기', '건강 상식',
    '과학 칼럼', '에세이 읽기',
  ],
  ja: [
    // 書籍 (20)
    'ノルウェイの森', '容疑者Xの献身', '窓ぎわのトットちゃん', '坊っちゃん',
    '吾輩は猫である', '走れメロス', '銀河鉄道の夜', '注文の多い料理店',
    '人間失格', 'コンビニ人間', '博士の愛した数式', '世界の終りとハードボイルド・ワンダーランド',
    '蜜蜂と遠雷', '夜は短し歩けよ乙女', 'キッチン', '色彩を持たない多崎つくる',
    'かもめ食堂', '図書館戦争', 'また同じ夢を見ていた', 'コーヒーが冷めないうちに',
    // 映画・ドラマ (10)
    '千と千尋の神隠し', '君の名は', 'となりのトトロ', '天気の子',
    'ハウルの動く城', '逃げるは恥だが役に立つ', '半沢直樹', 'ONE PIECE',
    'スラムダンク', 'NARUTO',
    // 旅行 (10)
    '東京旅行', '京都観光', '北海道旅行', '沖縄旅行',
    '大阪グルメ旅', '富士山登山', '世界一周', 'ヨーロッパ旅',
    'ハワイ休暇', 'ソウル旅行',
    // 料理 (10)
    '和食レシピ', 'お弁当作り', '家庭料理', 'パン作り',
    'スイーツ作り', 'ラーメン巡り', '寿司の世界', 'イタリア料理',
    'ヘルシー料理', 'コーヒー入門',
    // 趣味・スポーツ (10)
    'ヨガ', '写真撮影', 'ランニング', 'キャンプ',
    'サッカー観戦', '釣り', '園芸', 'ピアノ練習',
    '編み物', '読書習慣',
    // 文化・芸術 (10)
    'J-POP', 'アニメ', '漫画', 'クラシック音楽',
    'ジャズ', '美術館巡り', '和の文化', '茶道',
    '書道', '映画音楽',
    // 時事・日常 (10)
    'ビジネス日本語', 'ニュース日本語', '経済ニュース', '面接会話',
    '職場会話', '健康トピック', '環境問題', '科学コラム',
    'エッセイ', 'TEDトーク',
  ],
  'zh-CN': [
    // 书籍 (20)
    '红楼梦', '西游记', '三国演义', '水浒传',
    '围城', '边城', '骆驼祥子', '城南旧事',
    '撒哈拉的故事', '小王子', '老人与海', '哈利·波特',
    '简爱', '傲慢与偏见', '飘', '安徒生童话',
    '伊索寓言', '你好旧时光', '从你的全世界路过', '解忧杂货店',
    // 电影/电视剧 (10)
    '流浪地球', '战狼', '哪吒之魔童降世', '你好,李焕英',
    '甄嬛传', '陈情令', '琅琊榜', '请回答1988',
    '功夫熊猫', '寻梦环游记',
    // 旅行 (10)
    '北京旅行', '上海旅行', '西安古城', '成都美食游',
    '云南风光', '西藏之旅', '日本旅行', '欧洲背包行',
    '香港周末', '台湾环岛',
    // 美食 (10)
    '中餐烹饪', '家常菜', '川菜入门', '粤式点心',
    '面食制作', '烘焙基础', '健康饮食', '甜品制作',
    '咖啡文化', '茶道入门',
    // 兴趣/运动 (10)
    '瑜伽', '摄影', '跑步', '登山',
    '足球比赛', '羽毛球', '书法', '园艺',
    '骑行', '阅读习惯',
    // 文化/艺术 (10)
    '古典音乐', '流行音乐', '现代艺术', '中国书画',
    '京剧入门', '电影音乐', '博物馆之旅', '建筑欣赏',
    '诗词鉴赏', '民乐',
    // 时事/日常 (10)
    '商务汉语', '新闻汉语', '经济新闻', '面试口语',
    '职场口语', '健康话题', '环境话题', '科技专栏',
    '随笔阅读', 'TED演讲',
  ],
  es: [
    // Libros (20)
    'Cien años de soledad', 'Don Quijote', 'La sombra del viento', 'Como agua para chocolate',
    'El amor en los tiempos del cólera', 'Rayuela', 'La casa de los espíritus', 'El laberinto de los espíritus',
    'Paula', 'El túnel', 'Ficciones', 'Pedro Páramo',
    'La colmena', 'Nada', 'El aleph', 'Platero y yo',
    'La familia de Pascual Duarte', 'Veinte poemas de amor', 'La ciudad y los perros', 'El Llano en llamas',
    // Cine / series (10)
    'El laberinto del fauno', 'Volver', 'Coco', 'Roma',
    'La casa de papel', 'Élite', 'Narcos', 'El bar',
    'Toy Story', 'Cinema Paradiso',
    // Viajes (10)
    'Viaje a Madrid', 'Barcelona en verano', 'Andalucía', 'Camino de Santiago',
    'Argentina y Patagonia', 'México lindo', 'Perú y Machu Picchu', 'Tokio',
    'París en primavera', 'Costa Rica',
    // Cocina (10)
    'Recetas españolas', 'Tapas y pinchos', 'Paella', 'Tortilla española',
    'Postres caseros', 'Cocina mexicana', 'Cocina italiana', 'Brunch dominical',
    'Repostería básica', 'Cafés del mundo',
    // Aficiones / deportes (10)
    'Yoga', 'Fotografía', 'Correr maratón', 'Senderismo',
    'Fútbol', 'Tenis', 'Jardinería', 'Guitarra acústica',
    'Pintura', 'Lectura diaria',
    // Cultura / arte (10)
    'Flamenco', 'Música clásica', 'Arte moderno', 'Pintores impresionistas',
    'Cine de autor', 'Museos imprescindibles', 'Arquitectura', 'Salsa y bachata',
    'Teatro clásico', 'Bandas sonoras',
    // Actualidad / vida (10)
    'Español de negocios', 'Noticias diarias', 'Economía', 'Charlas TED',
    'Vocabulario editorial', 'Entrevistas de trabajo', 'Medio ambiente', 'Salud y bienestar',
    'Ciencia divulgativa', 'Ensayos breves',
  ],
  fr: [
    // Livres (20)
    'Le Petit Prince', 'Les Misérables', 'Le Comte de Monte-Cristo', 'L\'Étranger',
    'Madame Bovary', 'Les Trois Mousquetaires', 'Notre-Dame de Paris', 'Germinal',
    'Le Grand Meaulnes', 'Cyrano de Bergerac', 'La Peste', 'Bel-Ami',
    'Candide', 'La Gloire de mon père', 'Le Petit Nicolas', 'Astérix',
    'Vingt mille lieues sous les mers', 'Vol de nuit', 'L\'Élégance du hérisson', 'La Délicatesse',
    // Cinéma / séries (10)
    'Amélie', 'Intouchables', 'La Vie d\'Adèle', 'Les Choristes',
    'Le Fabuleux Destin', 'Lupin', 'Dix pour cent', 'Plus belle la vie',
    'Le Voyage de Chihiro', 'Coco',
    // Voyages (10)
    'Voyage à Paris', 'Provence en été', 'Côte d\'Azur', 'Bretagne',
    'Alpes en hiver', 'Québec', 'Maroc', 'Vietnam',
    'Japon en automne', 'Italie et Toscane',
    // Cuisine (10)
    'Cuisine française', 'Pâtisserie', 'Recettes du marché', 'Petit-déjeuner',
    'Cuisine méditerranéenne', 'Cuisine italienne', 'Brunch dominical', 'Café et croissant',
    'Vins et fromages', 'Cuisine végétarienne',
    // Loisirs / sport (10)
    'Yoga', 'Photographie', 'Course à pied', 'Randonnée',
    'Football', 'Tennis', 'Jardinage', 'Guitare',
    'Tricot', 'Lecture quotidienne',
    // Culture / art (10)
    'Musique classique', 'Jazz', 'Art moderne', 'Impressionnistes',
    'Cinéma d\'auteur', 'Musées de Paris', 'Architecture haussmannienne', 'Opéra',
    'Théâtre classique', 'Bandes originales',
    // Actualité / vie (10)
    'Français des affaires', 'Actualité quotidienne', 'Économie', 'TED en français',
    'Vocabulaire éditorial', 'Entretien d\'embauche', 'Environnement', 'Santé et bien-être',
    'Science et vie', 'Essais courts',
  ],
  de: [
    // Bücher (20)
    'Die unendliche Geschichte', 'Die Leiden des jungen Werther', 'Faust', 'Die Verwandlung',
    'Siddhartha', 'Das Parfum', 'Momo', 'Der Vorleser',
    'Im Westen nichts Neues', 'Tintenherz', 'Der Steppenwolf', 'Emil und die Detektive',
    'Effi Briest', 'Heidi', 'Der Zauberberg', 'Das Boot',
    'Krabat', 'Jim Knopf', 'Rico, Oskar und die Tieferschatten', 'Tschick',
    // Filme / Serien (10)
    'Goodbye, Lenin!', 'Das Leben der Anderen', 'Lola rennt', 'Toni Erdmann',
    'Dark', 'Babylon Berlin', 'Tatort', 'Türkisch für Anfänger',
    'Der Pate', 'Der Herr der Ringe',
    // Reisen (10)
    'Berlin entdecken', 'München und Bayern', 'Schwarzwald-Reise', 'Hamburg am Hafen',
    'Wien in Wien', 'Alpenüberquerung', 'Italien-Tour', 'Japan im Herbst',
    'New York', 'Island-Roadtrip',
    // Küche (10)
    'Deutsche Küche', 'Backen für Anfänger', 'Brot backen', 'Sonntagsfrühstück',
    'Italienische Küche', 'Mediterrane Küche', 'Vegane Rezepte', 'Hausgemachte Suppen',
    'Kuchen und Torten', 'Kaffeekultur',
    // Hobbys / Sport (10)
    'Yoga', 'Fotografie', 'Laufen', 'Wandern',
    'Fußball', 'Tennis', 'Gartenarbeit', 'Klavier üben',
    'Stricken', 'Tägliches Lesen',
    // Kultur / Kunst (10)
    'Klassische Musik', 'Jazz', 'Moderne Kunst', 'Impressionisten',
    'Autorenkino', 'Museumsbesuche', 'Bauhaus-Design', 'Architektur',
    'Theater', 'Filmmusik',
    // Aktuelles / Alltag (10)
    'Wirtschaftsdeutsch', 'Tagesnachrichten', 'Wirtschaft', 'TED auf Deutsch',
    'Redaktionswortschatz', 'Bewerbungsgespräch', 'Umwelt', 'Gesundheit & Wellness',
    'Wissenschaftsmagazin', 'Kurze Essays',
  ],
  it: [
    // Libri (20)
    'Il deserto dei Tartari', 'La divina commedia', 'Il nome della rosa', 'Se questo è un uomo',
    'Il Gattopardo', 'Pinocchio', 'La coscienza di Zeno', 'I promessi sposi',
    'Io non ho paura', 'L\'amica geniale', 'Se una notte d\'inverno un viaggiatore', 'Marcovaldo',
    'Il barone rampante', 'La luna e i falò', 'Il visconte dimezzato', 'Sostiene Pereira',
    'Va\' dove ti porta il cuore', 'Lessico famigliare', 'La solitudine dei numeri primi', 'Gomorra',
    // Cinema / serie (10)
    'La vita è bella', 'Cinema Paradiso', 'Nuovo Cinema Paradiso', 'Il postino',
    'La dolce vita', 'Perfetti sconosciuti', 'My Brilliant Friend', 'Gomorra (serie)',
    'Coco', 'Up',
    // Viaggi (10)
    'Viaggio a Roma', 'Firenze d\'estate', 'Costiera Amalfitana', 'Venezia',
    'Cinque Terre', 'Sicilia in primavera', 'Tour della Toscana', 'Parigi',
    'Giappone in autunno', 'Spagna del sud',
    // Cucina (10)
    'Cucina italiana', 'Pasta fresca', 'Pizza fatta in casa', 'Dolci tradizionali',
    'Antipasti', 'Cucina mediterranea', 'Brunch domenicale', 'Caffè e cornetto',
    'Vini e formaggi', 'Cucina vegetariana',
    // Hobby / sport (10)
    'Yoga', 'Fotografia', 'Corsa', 'Trekking',
    'Calcio', 'Tennis', 'Giardinaggio', 'Pianoforte',
    'Lavoro a maglia', 'Lettura quotidiana',
    // Cultura / arte (10)
    'Musica classica', 'Opera lirica', 'Arte moderna', 'Rinascimento italiano',
    'Cinema d\'autore', 'Musei italiani', 'Architettura', 'Jazz',
    'Teatro classico', 'Colonne sonore',
    // Attualità / vita (10)
    'Italiano per affari', 'Notizie quotidiane', 'Economia', 'TED in italiano',
    'Vocabolario editoriale', 'Colloquio di lavoro', 'Ambiente', 'Salute e benessere',
    'Scienza divulgativa', 'Saggi brevi',
  ],
};

// B1-level vocabulary selected for beauty, positivity, and everyday relevance.
// Mix: nature, emotion, relationships, color/season, everyday objects,
// abstract positive concepts. 100 entries per language.
const WORDS: Record<string, string[]> = {
  en: [
    // Nature (20)
    'harmony', 'blossom', 'horizon', 'breeze', 'sunshine',
    'rainbow', 'sunset', 'twilight', 'meadow', 'cherish',
    'starlight', 'moonlight', 'ocean', 'forest', 'sunrise',
    'pebble', 'orchard', 'dewdrop', 'springtime', 'autumn',
    // Emotion / feeling (20)
    'joy', 'serenity', 'wonder', 'comfort', 'kindness',
    'gentle', 'cheerful', 'graceful', 'whisper', 'tender',
    'delight', 'gratitude', 'peaceful', 'hopeful', 'curious',
    'playful', 'fond', 'warmth', 'bliss', 'awe',
    // Relationships / people (15)
    'friendship', 'family', 'companion', 'neighbor', 'mentor',
    'soulmate', 'kindred', 'beloved', 'sibling', 'gathering',
    'reunion', 'embrace', 'laughter', 'storyteller', 'community',
    // Color / season / time (15)
    'lavender', 'crimson', 'azure', 'amber', 'pearl',
    'emerald', 'turquoise', 'morning', 'afternoon', 'evening',
    'midnight', 'weekend', 'holiday', 'springtime', 'harvest',
    // Everyday (15)
    'coffee', 'bakery', 'garden', 'window', 'journal',
    'lantern', 'umbrella', 'blanket', 'cottage', 'fireplace',
    'library', 'bookshop', 'teacup', 'postcard', 'melody',
    // Abstract positive (15)
    'hope', 'dream', 'wisdom', 'courage', 'beauty',
    'peace', 'freedom', 'wonder', 'patience', 'gratitude',
    'inspiration', 'imagination', 'sincerity', 'optimism', 'kindness',
  ],
  ko: [
    // 자연 (20)
    '햇살', '바람결', '봄날', '꽃잎', '노을',
    '별빛', '달빛', '새벽', '하늘', '바다',
    '숲길', '풀밭', '이슬', '단풍', '눈송이',
    '향기', '파도', '들꽃', '소나기', '무지개',
    // 감정/느낌 (20)
    '설렘', '여유', '평온', '포근하다', '다정하다',
    '따스함', '미소', '반짝이다', '잔잔하다', '맑다',
    '온화하다', '기쁨', '즐거움', '편안하다', '행복',
    '감동', '뭉클하다', '벅차다', '뿌듯하다', '상냥하다',
    // 관계/사람 (15)
    '친구', '가족', '동무', '이웃', '인연',
    '우정', '사랑', '추억', '함께', '동행',
    '대화', '인사', '웃음', '약속', '모임',
    // 색/계절 (15)
    '하늘색', '연두', '분홍', '노랑', '연한',
    '봄', '여름', '가을', '겨울', '아침',
    '점심', '저녁', '주말', '휴일', '명절',
    // 일상 (15)
    '커피', '빵집', '정원', '창문', '일기',
    '램프', '우산', '담요', '오두막', '벽난로',
    '도서관', '서점', '찻잔', '엽서', '음악',
    // 추상 긍정 (15)
    '희망', '꿈', '지혜', '용기', '아름다움',
    '평화', '자유', '경이', '인내', '감사',
    '영감', '상상력', '진심', '낙관', '친절',
  ],
  ja: [
    // 自然 (20)
    '春風', '夕焼け', '星空', '陽だまり', '木漏れ日',
    '朝日', '月明かり', 'そよ風', '潮風', '小川',
    '草原', '紅葉', '雪景色', '虹', '花畑',
    '海辺', '森林', '滝', '湖畔', '霧',
    // 感情・感覚 (20)
    '微笑み', '心地よい', '爽やか', '穏やか', '懐かしい',
    'ときめき', '嬉しい', '楽しい', '元気', '希望',
    '優しい', '温かい', '幸せ', '安らぎ', '癒し',
    '満足', '感激', '感謝', '励まし', '楽観',
    // 関係・人 (15)
    '友達', '家族', '仲間', '隣人', '絆',
    '友情', '愛情', '思い出', '出会い', '再会',
    '会話', '挨拶', '笑顔', '約束', '集まり',
    // 色・季節 (15)
    '水色', '若葉色', '桃色', '黄色', '淡い',
    '春', '夏', '秋', '冬', '朝',
    '昼', '夕方', '週末', '休日', '祝日',
    // 日常 (15)
    'コーヒー', 'パン屋', '庭', '窓', '日記',
    'ランプ', '傘', '毛布', '小屋', '暖炉',
    '図書館', '本屋', 'お茶', 'はがき', '音楽',
    // 抽象的・前向き (15)
    '希望', '夢', '知恵', '勇気', '美しさ',
    '平和', '自由', '驚き', '忍耐', '感謝',
    'ひらめき', '想像', '誠実', '楽観', '思いやり',
  ],
  'zh-CN': [
    // 自然 (20)
    '阳光', '微风', '春意', '花开', '晚霞',
    '星辰', '月光', '清晨', '蓝天', '海风',
    '森林', '草地', '露珠', '红叶', '雪花',
    '花香', '波浪', '野花', '细雨', '彩虹',
    // 感情/感觉 (20)
    '温柔', '宁静', '惊喜', '舒适', '亲切',
    '温暖', '微笑', '闪烁', '柔和', '清澈',
    '安详', '欢喜', '快乐', '幸福', '感动',
    '满足', '感激', '希望', '从容', '热情',
    // 关系/人 (15)
    '朋友', '家人', '伙伴', '邻居', '缘分',
    '友谊', '亲情', '回忆', '相聚', '同行',
    '谈话', '问候', '笑声', '约定', '聚会',
    // 颜色/季节 (15)
    '天蓝', '嫩绿', '粉色', '金黄', '柔和',
    '春天', '夏天', '秋天', '冬天', '清晨',
    '午后', '黄昏', '周末', '假期', '节日',
    // 日常 (15)
    '咖啡', '面包店', '花园', '窗户', '日记',
    '灯笼', '雨伞', '毛毯', '小屋', '壁炉',
    '图书馆', '书店', '茶杯', '明信片', '音乐',
    // 抽象积极 (15)
    '希望', '梦想', '智慧', '勇气', '美丽',
    '和平', '自由', '惊奇', '耐心', '感恩',
    '灵感', '想象', '真诚', '乐观', '善意',
  ],
  es: [
    // Naturaleza (20)
    'amanecer', 'brisa', 'horizonte', 'mariposa', 'arcoíris',
    'jardín', 'flor', 'estrella', 'crepúsculo', 'manantial',
    'pradera', 'bosque', 'orilla', 'rocío', 'aurora',
    'colina', 'arena', 'cielo', 'nube', 'primavera',
    // Emoción (20)
    'alegría', 'sonrisa', 'ternura', 'calidez', 'serenidad',
    'esperanza', 'dulce', 'suave', 'gentil', 'amable',
    'cariño', 'cariñoso', 'feliz', 'tranquilo', 'paciencia',
    'gratitud', 'consuelo', 'plenitud', 'ilusión', 'júbilo',
    // Relaciones (15)
    'amistad', 'familia', 'compañero', 'vecino', 'mentor',
    'amor', 'recuerdo', 'reunión', 'abrazo', 'risa',
    'conversación', 'saludo', 'promesa', 'comunidad', 'encuentro',
    // Color / temporada (15)
    'lavanda', 'turquesa', 'dorado', 'plateado', 'rosado',
    'verano', 'invierno', 'otoño', 'mañana', 'mediodía',
    'tarde', 'noche', 'fin de semana', 'vacaciones', 'fiesta',
    // Cotidiano (15)
    'café', 'panadería', 'jardín', 'ventana', 'diario',
    'farol', 'paraguas', 'manta', 'cabaña', 'chimenea',
    'biblioteca', 'librería', 'taza', 'postal', 'melodía',
    // Abstracto positivo (15)
    'esperanza', 'sueño', 'sabiduría', 'valor', 'belleza',
    'paz', 'libertad', 'maravilla', 'paciencia', 'gratitud',
    'inspiración', 'imaginación', 'sinceridad', 'optimismo', 'bondad',
  ],
  fr: [
    // Nature (20)
    'lumière', 'aurore', 'brise', 'papillon', 'arc-en-ciel',
    'jardin', 'fleur', 'étoile', 'crépuscule', 'rivière',
    'prairie', 'forêt', 'rivage', 'rosée', 'horizon',
    'colline', 'sable', 'ciel', 'nuage', 'printemps',
    // Émotion (20)
    'sourire', 'douceur', 'tendresse', 'chaleur', 'sérénité',
    'espoir', 'joie', 'gentil', 'aimable', 'paisible',
    'tendre', 'affection', 'heureux', 'calme', 'patience',
    'gratitude', 'réconfort', 'plénitude', 'enchantement', 'allégresse',
    // Relations (15)
    'amitié', 'famille', 'compagnon', 'voisin', 'mentor',
    'amour', 'souvenir', 'retrouvailles', 'étreinte', 'rire',
    'conversation', 'salutation', 'promesse', 'communauté', 'rencontre',
    // Couleur / saison (15)
    'lavande', 'turquoise', 'doré', 'argenté', 'rosé',
    'été', 'hiver', 'automne', 'matin', 'midi',
    'après-midi', 'soir', 'week-end', 'vacances', 'fête',
    // Quotidien (15)
    'café', 'boulangerie', 'jardin', 'fenêtre', 'journal',
    'lanterne', 'parapluie', 'couverture', 'chalet', 'cheminée',
    'bibliothèque', 'librairie', 'tasse', 'carte postale', 'mélodie',
    // Abstrait positif (15)
    'espoir', 'rêve', 'sagesse', 'courage', 'beauté',
    'paix', 'liberté', 'merveille', 'patience', 'gratitude',
    'inspiration', 'imagination', 'sincérité', 'optimisme', 'bonté',
  ],
  de: [
    // Natur (20)
    'Sonnenschein', 'Sonnenaufgang', 'Brise', 'Schmetterling', 'Regenbogen',
    'Garten', 'Blume', 'Stern', 'Dämmerung', 'Bach',
    'Wiese', 'Wald', 'Ufer', 'Tautropfen', 'Horizont',
    'Hügel', 'Sand', 'Himmel', 'Wolke', 'Frühling',
    // Gefühl (20)
    'Lächeln', 'Wärme', 'Zärtlichkeit', 'Gelassenheit', 'Hoffnung',
    'Freude', 'sanft', 'freundlich', 'herzlich', 'gemütlich',
    'fröhlich', 'Geborgenheit', 'glücklich', 'ruhig', 'Geduld',
    'Dankbarkeit', 'Trost', 'Erfüllung', 'Vorfreude', 'Heiterkeit',
    // Beziehungen (15)
    'Freundschaft', 'Familie', 'Gefährte', 'Nachbar', 'Mentor',
    'Liebe', 'Erinnerung', 'Wiedersehen', 'Umarmung', 'Lachen',
    'Gespräch', 'Gruß', 'Versprechen', 'Gemeinschaft', 'Begegnung',
    // Farbe / Jahreszeit (15)
    'Lavendel', 'Türkis', 'Golden', 'Silbern', 'Rosa',
    'Sommer', 'Winter', 'Herbst', 'Morgen', 'Mittag',
    'Nachmittag', 'Abend', 'Wochenende', 'Urlaub', 'Feiertag',
    // Alltag (15)
    'Kaffee', 'Bäckerei', 'Garten', 'Fenster', 'Tagebuch',
    'Laterne', 'Regenschirm', 'Decke', 'Hütte', 'Kamin',
    'Bibliothek', 'Buchladen', 'Teetasse', 'Postkarte', 'Melodie',
    // Abstrakt positiv (15)
    'Hoffnung', 'Traum', 'Weisheit', 'Mut', 'Schönheit',
    'Frieden', 'Freiheit', 'Wunder', 'Geduld', 'Dankbarkeit',
    'Inspiration', 'Phantasie', 'Aufrichtigkeit', 'Optimismus', 'Güte',
  ],
  it: [
    // Natura (20)
    'aurora', 'brezza', 'farfalla', 'arcobaleno', 'tramonto',
    'giardino', 'fiore', 'stella', 'crepuscolo', 'ruscello',
    'prato', 'bosco', 'riva', 'rugiada', 'orizzonte',
    'collina', 'sabbia', 'cielo', 'nuvola', 'primavera',
    // Emozione (20)
    'sorriso', 'dolcezza', 'tenerezza', 'calore', 'serenità',
    'speranza', 'gioia', 'gentile', 'affettuoso', 'sereno',
    'allegro', 'tranquillo', 'felice', 'calmo', 'pazienza',
    'gratitudine', 'conforto', 'pienezza', 'entusiasmo', 'allegria',
    // Relazioni (15)
    'amicizia', 'famiglia', 'compagno', 'vicino', 'mentore',
    'amore', 'ricordo', 'ritrovo', 'abbraccio', 'risata',
    'conversazione', 'saluto', 'promessa', 'comunità', 'incontro',
    // Colore / stagione (15)
    'lavanda', 'turchese', 'dorato', 'argentato', 'rosa',
    'estate', 'inverno', 'autunno', 'mattina', 'mezzogiorno',
    'pomeriggio', 'sera', 'weekend', 'vacanza', 'festa',
    // Quotidiano (15)
    'caffè', 'panetteria', 'giardino', 'finestra', 'diario',
    'lanterna', 'ombrello', 'coperta', 'baita', 'camino',
    'biblioteca', 'libreria', 'tazza', 'cartolina', 'melodia',
    // Astratto positivo (15)
    'speranza', 'sogno', 'saggezza', 'coraggio', 'bellezza',
    'pace', 'libertà', 'meraviglia', 'pazienza', 'gratitudine',
    'ispirazione', 'immaginazione', 'sincerità', 'ottimismo', 'gentilezza',
  ],
};

const EXAMPLE_PREFIX: Record<string, string> = {
  ko: '예:',
  en: 'e.g.',
  ja: '例:',
  zh: '例:',
  'zh-CN': '例:',
  es: 'ej.',
  fr: 'ex.',
  de: 'z.B.',
  it: 'es.',
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
