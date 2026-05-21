// Smart merge final TOPIK 1급 + 2급 lists.
// Strategy:
//   1급 = always-keep essentials (greetings/numerals/pronouns/days/seasons/etc.)
//         + cross-ref consensus (Tier A from both 600-word lists)
//         + Tier B prioritized to fill 900
//   2급 = Tier C (Tammy only) + Tier B overflow + 2급 essentials
//         to fill 900
// Output: 6 JSON files (3 parts × 2 levels × 300 words each), thematic split.
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.resolve(__dirname, '_topik1-source-analysis.js'), 'utf8');
const TAMMY = src.match(/const TAMMY = `([^`]+)`/)[1].split(',').map(s => s.trim()).filter(Boolean);
const TOPIK_GUIDE = src.match(/const TOPIK_GUIDE = `([^`]+)`/)[1].split(',').map(s => s.trim()).filter(Boolean);
const LINGODEER = src.match(/const LINGODEER = `([^`]+)`/)[1].split(',').map(s => s.trim()).filter(Boolean);

const tammySet = new Set(TAMMY);
const guideSet = new Set(TOPIK_GUIDE);
const lingoSet = new Set(LINGODEER);

// ============================================================
// 1급 ESSENTIALS — always-keep regardless of source membership
// ============================================================
const L1_ESSENTIALS = {
  '인사·예의 표현': [
    '안녕하세요', '안녕히 가세요', '안녕히 계세요', '반갑습니다', '어서 오세요',
    '잘 부탁드립니다', '알겠습니다', '감사합니다', '고맙다', '죄송합니다',
    '미안하다', '천만에요', '잘',
  ],
  '인칭·지시 대명사': [
    '나', '너', '저', '우리', '그', '그녀', '저희', '자기',
    '이', '그', '저', '이것', '그것', '저것', '여기', '거기', '저기',
    '이쪽', '그쪽', '저쪽', '사람', '누구',
  ],
  '의문사': [
    '무엇', '뭐', '어디', '언제', '어떻게', '왜', '몇', '누구',
    '누가', '어느', '어떤', '무슨', '얼마', '얼마나',
  ],
  '숫자 (Sino)': [
    '일', '이', '삼', '사', '오', '육', '칠', '팔', '구', '십',
    '백', '천', '만',
  ],
  '숫자 (Native)': [
    '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열',
    '스물', '서른',
  ],
  '시간': [
    '시', '분', '초', '어제', '오늘', '내일', '지금', '아침', '점심', '저녁',
    '밤', '오전', '오후', '시간', '주말', '주', '월', '년', '요일', '날',
    '때', '며칠', '매일', '매주', '매월', '매년', '평일', '잠깐', '잠시', '나중',
    '먼저', '다음', '이전',
  ],
  '요일': [
    '월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일',
  ],
  '계절': ['봄', '여름', '가을', '겨울'],
  '가족 기본': [
    '가족', '아버지', '어머니', '아빠', '엄마', '부모', '부모님',
    '형', '누나', '오빠', '언니', '동생', '할아버지', '할머니',
    '아들', '딸', '아내', '남편', '아이', '아기', '친구',
  ],
  '학교·직장 기본': [
    '학교', '학생', '선생님', '회사', '회사원', '직장', '직업', '의사',
    '책', '가방', '공부', '시험', '숙제', '수업', '교실', '이름', '나이',
  ],
  '음식 기본': [
    '밥', '김치', '빵', '우유', '물', '커피', '주스', '음식', '과일', '사과',
    '바나나', '고기', '생선', '계란', '라면', '김밥', '비빔밥', '떡', '과자',
    '케이크', '식당', '카페', '메뉴', '맛',
  ],
  '동사 기본': [
    '가다', '오다', '먹다', '마시다', '자다', '일어나다', '앉다', '서다',
    '보다', '듣다', '말하다', '읽다', '쓰다', '만나다', '살다', '알다',
    '모르다', '좋아하다', '싫어하다', '원하다', '사다', '팔다', '받다', '주다',
    '가르치다', '배우다', '일하다', '쉬다', '놀다', '기다리다', '시작하다', '끝나다',
    '입다', '벗다', '만들다', '찾다', '보내다', '운동하다', '청소하다', '요리하다',
    '노래하다', '운전하다', '공부하다', '전화하다', '하다', '있다', '없다',
  ],
  '형용사 기본': [
    '좋다', '나쁘다', '크다', '작다', '많다', '적다', '길다', '짧다', '높다',
    '낮다', '무겁다', '가볍다', '비싸다', '싸다', '빠르다', '느리다',
    '뜨겁다', '차갑다', '따뜻하다', '시원하다', '춥다', '덥다', '맛있다',
    '맛없다', '예쁘다', '재미있다', '어렵다', '쉽다', '달다',
  ],
  '부사·접속사': [
    '매우', '아주', '너무', '잘', '못', '안', '다시', '또', '자주', '항상',
    '빨리', '천천히', '같이', '함께', '혼자', '많이', '조금', '먼저',
    '그리고', '그래서', '그러나', '하지만', '그런데', '그러면',
  ],
  '장소': [
    '집', '방', '부엌', '화장실', '병원', '은행', '시장', '공원', '도서관',
    '호텔', '가게', '길', '도시', '한국', '미국', '일본', '중국',
    '백화점', '학교', '회사',
  ],
  '교통 기본': [
    '차', '버스', '택시', '지하철', '기차', '비행기', '자전거', '역', '공항',
  ],
  '신체': [
    '머리', '눈', '코', '입', '귀', '손', '발', '다리', '팔', '배', '얼굴',
  ],
  '의복': [
    '옷', '바지', '치마', '신발', '모자', '양말', '시계', '안경',
  ],
  '색깔': [
    '색깔', '빨간색', '파란색', '노란색', '검은색', '흰색', '초록색',
  ],
  '날씨·자연': [
    '날씨', '비', '눈', '바람', '하늘', '산', '바다', '꽃', '나무',
  ],
  '동물': ['개', '고양이', '새', '물고기', '동물'],
  '추상·기타': [
    '돈', '곳', '것', '시간', '말', '전화', '음악', '영화',
  ],
};

// Build flat 1급 list from essentials
const l1Essentials = [];
const l1EssentialSet = new Set();
for (const [cat, words] of Object.entries(L1_ESSENTIALS)) {
  for (const w of words) {
    if (!l1EssentialSet.has(w)) {
      l1Essentials.push({ word: w, category: cat, source: 'essential' });
      l1EssentialSet.add(w);
    }
  }
}
console.log('1급 essentials:', l1Essentials.length);

// Add Tier A (consensus, in BOTH 600-word lists) not already in essentials
const tierA = [...new Set([...guideSet].filter(w => lingoSet.has(w)))];
for (const w of tierA) {
  if (!l1EssentialSet.has(w)) {
    l1Essentials.push({ word: w, category: 'consensus', source: 'A' });
    l1EssentialSet.add(w);
  }
}
console.log('After Tier A:', l1Essentials.length);

// Add Tier B (in ONE 600-word list) sorted by also-in-Tammy
const tierB = [...new Set([
  ...[...guideSet].filter(w => !lingoSet.has(w)),
  ...[...lingoSet].filter(w => !guideSet.has(w)),
])].sort((a, b) => (tammySet.has(b) ? 1 : 0) - (tammySet.has(a) ? 1 : 0));

for (const w of tierB) {
  if (l1Essentials.length >= 900) break;
  if (!l1EssentialSet.has(w)) {
    l1Essentials.push({ word: w, category: 'consensus', source: 'B' });
    l1EssentialSet.add(w);
  }
}
console.log('After Tier B fill:', l1Essentials.length);

// If still short, fill from Tammy
const tierC = [...tammySet].filter(w => !guideSet.has(w) && !lingoSet.has(w));
for (const w of tierC) {
  if (l1Essentials.length >= 900) break;
  if (!l1EssentialSet.has(w)) {
    l1Essentials.push({ word: w, category: 'extended', source: 'C' });
    l1EssentialSet.add(w);
  }
}
console.log('1급 final:', l1Essentials.length);

// ============================================================
// 2급 ESSENTIALS — Level 2 specific (more advanced)
// ============================================================
const L2_ESSENTIALS = {
  '인사·표현 확장': [
    '오랜만이다', '안부', '인사', '환영', '환영하다', '축하', '축하하다',
    '위로', '응원', '사과', '칭찬', '관심',
  ],
  '가족·관계 확장': [
    '자식', '자녀', '어른', '어르신', '어린이', '청소년', '노인',
    '친척', '이웃', '선배', '후배', '지인', '애인', '연인',
    '부부', '결혼', '결혼하다', '결혼식', '사촌', '이모', '고모', '삼촌',
    '조카', '손자', '손녀',
  ],
  '학교·공부 확장': [
    '대학교', '대학생', '초등학교', '초등학생', '중학교', '중학생',
    '고등학교', '고등학생', '유치원', '학년', '학기', '방학',
    '입학', '입학하다', '졸업', '졸업하다', '입학식', '졸업식',
    '단어', '문장', '문법', '발음', '글자', '한글', '외국어',
    '정답', '오답', '문제', '점수', '성적', '합격', '합격하다',
    '출석', '결석', '교과서', '강의', '교수',
  ],
  '직장·업무': [
    '사무실', '회의', '회의실', '직원', '사장', '동료', '월급', '취직', '취직하다',
    '출근', '출근하다', '퇴근', '퇴근하다', '휴가', '명함', '서류',
    '발표', '보고', '면접',
  ],
  '시간·날짜·기간 확장': [
    '그저께', '모레', '휴일', '공휴일', '새해', '작년', '내년',
    '지난주', '지난달', '지난해', '일주일', '한참', '잠시',
    '하루', '이틀', '사흘', '시각', '기간',
  ],
  '음식·요리 확장': [
    '한식', '양식', '일식', '중식', '음료', '음료수', '맥주', '와인', '소주',
    '녹차', '홍차', '설탕', '소금', '후추', '식초', '간장', '된장', '고추장',
    '마늘', '양파', '당근', '감자', '오이', '배추', '무', '시금치',
    '쌀', '두부', '미역', '김', '오징어', '새우',
    '햄', '치즈', '버터', '아이스크림', '초콜릿', '사탕',
    '햄버거', '피자', '샐러드', '후식', '디저트',
    '떡볶이', '김치찌개', '된장찌개', '불고기', '갈비',
    '굽다', '끓이다', '볶다', '찌다', '삶다', '자르다', '섞다',
  ],
  '쇼핑·돈': [
    '가격', '값', '비용', '현금', '신용카드', '카드', '영수증', '거스름돈',
    '할인', '세일', '무료', '환불', '교환', '포장', '배달', '택배',
    '계산', '계산하다', '상품', '주문', '주문하다',
  ],
  '옷·미용': [
    '셔츠', '티셔츠', '점퍼', '자켓', '코트', '청바지', '반바지', '한복',
    '정장', '운동화', '구두', '슬리퍼', '머리띠', '목도리', '넥타이', '벨트',
    '핸드백', '지갑', '장갑', '우산', '양산', '화장', '화장하다', '화장품',
    '향수',
  ],
  '신체·건강': [
    '몸', '얼굴', '목', '어깨', '가슴', '허리', '무릎', '발목', '손목',
    '손가락', '발가락', '머리카락', '이마', '입술', '이', '눈썹',
    '피', '땀', '눈물',
    '건강', '건강하다', '아프다', '다치다', '병', '감기', '열', '두통',
    '약', '약국', '간호사', '환자', '치료', '치료하다',
    '입원', '입원하다', '퇴원', '퇴원하다',
  ],
  '집·주거': [
    '거실', '안방', '침실', '베란다', '마당', '정원', '옥상', '지하실',
    '계단', '엘리베이터', '복도', '현관', '문', '창문', '벽', '천장', '바닥',
    '가구', '옷장', '서랍', '책장', '냉장고', '세탁기', '전자레인지',
    '에어컨', '선풍기', '청소기', '소파', '식탁', '커튼', '카펫',
    '베개', '이불', '거울', '수건', '비누', '치약', '칫솔', '휴지',
    '냄비', '프라이팬', '컵', '잔', '그릇', '접시', '숟가락', '젓가락', '포크',
  ],
  '교통': [
    '자동차', '오토바이', '거리', '횡단보도', '교차로', '신호등', '터널', '다리',
    '운전사', '기사', '승객', '갈아타다', '내리다', '타다', '막히다',
    '교통사고', '운전', '운전면허', '주차', '주차하다',
    '매표소', '차표', '좌석', '출구', '입구',
  ],
  '여행·관광': [
    '여행', '여행하다', '관광', '관광지', '관광객', '명소', '박물관', '미술관',
    '동물원', '식물원', '놀이공원', '해수욕장', '캠핑', '캠핑장', '등산', '등산하다',
    '산책', '산책하다', '여권', '비자', '환전', '환율', '항공편', '가이드',
    '짐', '가방',
  ],
  '날씨·계절·자연': [
    '눈', '구름', '안개', '천둥', '번개', '무지개', '폭우', '폭설',
    '소나기', '장마', '태풍', '가뭄', '홍수', '일기예보', '기온', '온도',
    '쌀쌀하다', '무덥다', '흐리다', '맑다',
    '강', '호수', '섬', '폭포', '바위', '동굴', '계곡', '언덕', '사막',
    '풀', '잎', '가지', '뿌리', '씨앗', '흙', '돌', '모래',
  ],
  '감정·심리': [
    '사랑', '사랑하다', '생각', '기분', '느낌', '꿈', '희망', '걱정', '걱정하다',
    '행복', '행복하다', '기쁨', '기쁘다', '슬픔', '슬프다', '분노', '화나다',
    '외로움', '외롭다', '무섭다', '두렵다', '안심', '안심하다',
    '미안하다', '고맙다', '감사하다', '심심하다', '지루하다', '신나다',
    '긴장', '긴장하다', '편하다', '편안하다', '불편하다',
    '만족', '만족하다', '부럽다', '서운하다',
  ],
  '성격·태도': [
    '성격', '착하다', '친절하다', '부지런하다', '게으르다', '영리하다', '솔직하다',
    '정직하다', '거짓말', '거짓말하다', '점잖다', '활발하다', '명랑하다', '우울하다',
    '조용하다', '시끄럽다', '똑똑하다',
  ],
  '동물·식물': [
    '강아지', '새', '물고기', '동물', '호랑이', '사자', '곰', '토끼', '사슴',
    '코끼리', '원숭이', '돼지', '소', '양', '닭', '오리', '거북이', '뱀',
    '나비', '벌', '개미', '거미', '기린', '식물', '꽃', '나무',
    '장미', '백합', '튤립', '벚꽃', '진달래', '개나리', '해바라기',
    '당근', '양파', '토마토',
  ],
  '색깔·모양 확장': [
    '분홍색', '갈색', '회색', '보라색', '주황색', '하늘색', '남색', '청록색',
    '연두색', '황금색', '은색', '진하다', '연하다', '밝다', '어둡다',
    '점', '선', '곡선', '직선',
  ],
  '취미·문화': [
    '취미', '운동', '운동하다', '산책', '쇼핑', '노래', '노래하다', '춤', '춤추다',
    '게임', '수영', '수영하다', '낚시', '노래방', '캠핑',
    '골프', '테니스', '야구', '축구', '농구', '배구',
    '영화', '드라마', '콘서트', '연극', '뮤지컬', '미술',
    '피아노', '기타', '바이올린', '악기',
  ],
  '통신·매체': [
    '핸드폰', '휴대폰', '스마트폰', '컴퓨터', '텔레비전', '라디오', '신문',
    '잡지', '광고', '뉴스', '방송', '채널',
    '이메일', '메시지', '인터넷', '사이트',
    '카메라', '사진', '그림',
  ],
  '동작 동사 확장': [
    '연락하다', '소개하다', '추천하다', '거절하다', '동의하다', '반대하다',
    '기대하다', '후회하다', '잊다', '기억하다', '이해하다', '이야기하다',
    '대화하다', '알리다', '부르다', '출국하다', '입국하다',
    '도전하다', '성공하다', '실패하다', '변하다', '놀라다', '노력하다',
    '지키다', '느끼다', '떨어지다', '자라다', '보이다', '들리다',
    '씻다', '닦다', '빨래하다', '설거지하다', '정리하다',
    '켜다', '끄다', '열다', '닫다', '놓다', '잡다', '잃다',
    '올라가다', '내려가다', '들어가다', '나가다', '들어오다', '나오다',
    '돌아가다', '돌아오다', '도착하다', '출발하다', '떠나다', '이사하다',
    '도와주다', '설명하다', '대답하다', '질문하다', '물어보다', '약속하다',
    '결정하다', '준비하다', '사용하다', '부탁하다', '끝내다',
    '주문하다', '예약하다', '신청하다', '등록하다', '빌리다', '던지다', '들다',
    '누르다', '잠그다', '풀다', '매다', '묶다', '떼다', '붙이다',
    '옮기다', '빼다',
  ],
  '형용사 확장': [
    '깨끗하다', '더럽다', '같다', '다르다', '비슷하다', '늙다', '젊다',
    '강하다', '약하다', '밝다', '어둡다', '둥글다', '가깝다', '멀다',
    '부드럽다', '단단하다', '넓다', '좁다', '두껍다', '얇다',
    '위험하다', '안전하다', '깊다', '얕다', '간단하다',
    '자세하다', '정확하다', '옳다', '중요하다', '가능하다', '불가능하다',
    '유명하다', '특별하다', '신기하다', '멋지다', '복잡하다',
    '부족하다', '충분하다', '풍부하다',
  ],
  '부사·접속사 확장': [
    '거의', '가끔', '늘', '절대', '확실히', '미리', '이미', '벌써', '방금',
    '우선', '나중에', '일단', '점점', '갈수록', '어쩌면', '마침내', '결국',
    '차라리', '오히려', '게다가', '그러므로', '따라서', '한편', '즉',
    '정말', '진짜', '그냥', '혹시', '만약', '아마', '갑자기', '즉시',
    '또한', '곧', '더', '덜', '별로',
  ],
  '한자어 명사·추상': [
    '의미', '가치', '권리', '자유', '평화', '미래', '과거', '역사', '문화',
    '사회', '경제', '정치', '종교', '환경', '자연', '결과', '원인',
    '시작', '끝', '변화', '발전', '방법', '수단', '방향', '종류',
    '부분', '일부', '대부분', '중간', '계속', '계속하다', '진실', '평등',
    '인생', '삶', '죽음', '운명', '우연', '운', '행운', '불행',
    '차이', '공통점', '본질', '내용', '길이', '너비', '높이', '깊이',
    '무게', '둘레', '면적', '부피', '표면',
  ],
  '행사·명절': [
    '명절', '추석', '설날', '광복절', '한글날', '크리스마스', '어린이날',
    '어버이날', '기념일', '제사', '잔치', '파티', '생일', '행사',
  ],
  '수량·단위': [
    '명', '마리', '살', '권', '송이', '켤레', '그루', '채', '대', '인분',
    '원', '달러', '미터', '킬로미터', '그램', '킬로그램', '리터', '도', '퍼센트',
    '개', '번', '병', '잔', '장', '층', '통', '회',
  ],
};

const l2Essentials = [];
const l2EssentialSet = new Set();
for (const [cat, words] of Object.entries(L2_ESSENTIALS)) {
  for (const w of words) {
    if (!l2EssentialSet.has(w) && !l1EssentialSet.has(w)) {
      l2Essentials.push({ word: w, category: cat, source: 'essential' });
      l2EssentialSet.add(w);
    }
  }
}
console.log('\n2급 essentials:', l2Essentials.length);

// Fill 2급 with Tier C (Tammy only) + Tier B overflow not in 1급
const tierBOverflow = tierB.filter(w => !l1EssentialSet.has(w) && !l2EssentialSet.has(w));
for (const w of tierBOverflow) {
  if (l2Essentials.length >= 900) break;
  l2Essentials.push({ word: w, category: 'consensus-overflow', source: 'B' });
  l2EssentialSet.add(w);
}
console.log('After Tier B overflow:', l2Essentials.length);

const tierCAvail = tierC.filter(w => !l1EssentialSet.has(w) && !l2EssentialSet.has(w));
for (const w of tierCAvail) {
  if (l2Essentials.length >= 900) break;
  l2Essentials.push({ word: w, category: 'extended', source: 'C' });
  l2EssentialSet.add(w);
}
console.log('2급 final:', l2Essentials.length);

// ============================================================
// Output 6 thematic JSON files (3 parts × 2 levels × 300 each)
// ============================================================
function splitIntoThree(entries) {
  // Group by category, then distribute into 3 parts roughly equal in size,
  // keeping categories contiguous when possible.
  const byCategory = {};
  const catOrder = [];
  for (const e of entries) {
    if (!byCategory[e.category]) {
      byCategory[e.category] = [];
      catOrder.push(e.category);
    }
    byCategory[e.category].push(e);
  }
  const parts = [[], [], []];
  let pi = 0;
  for (const cat of catOrder) {
    for (const e of byCategory[cat]) {
      while (parts[pi].length >= 300 && pi < 2) pi++;
      parts[pi].push(e);
    }
  }
  return parts;
}

const l1Parts = splitIntoThree(l1Essentials);
const l2Parts = splitIntoThree(l2Essentials);

// Write to /tmp for user review (plain text, easy to scan)
function writeReviewFile(filePath, parts, level) {
  const lines = [`# TOPIK ${level}급 — Total: ${parts.flat().length} words / 3 parts × 300`];
  parts.forEach((part, idx) => {
    lines.push(`\n══════════ Part ${idx + 1} (${part.length} words) ══════════`);
    let lastCat = null;
    for (const e of part) {
      if (e.category !== lastCat) {
        lines.push(`\n── ${e.category} ──`);
        lastCat = e.category;
      }
      lines.push(`  ${e.word}  [${e.source}]`);
    }
  });
  fs.writeFileSync(filePath, lines.join('\n'));
}

writeReviewFile('/tmp/topik-1-final-review.txt', l1Parts, 1);
writeReviewFile('/tmp/topik-2-final-review.txt', l2Parts, 2);

// Also write JSON files matching the existing spec format
function writeSpecJson(filePath, words, level, partNum) {
  const spec = {
    slug: `topik-${level}-part-${partNum}`,
    name_i18n: {
      ko: `TOPIK ${level}급 (${partNum}/3)`,
      en: `TOPIK Level ${level} (Part ${partNum}/3)`,
      'zh-CN': `TOPIK ${level}级 (${partNum}/3)`,
      ja: `TOPIK ${level}級 (${partNum}/3)`,
      es: `TOPIK Nivel ${level} (${partNum}/3)`,
      fr: `TOPIK Niveau ${level} (${partNum}/3)`,
      de: `TOPIK Stufe ${level} (${partNum}/3)`,
      it: `TOPIK Livello ${level} (${partNum}/3)`,
      pt: `TOPIK Nível ${level} (${partNum}/3)`,
      ru: `TOPIK Уровень ${level} (${partNum}/3)`,
    },
    description_i18n: {
      ko: `한국어능력시험 ${level}급 핵심 어휘 300선 (${partNum}부 / 총 ${level === 1 ? '900' : '900'}단어)`,
      en: `TOPIK Level ${level} core vocabulary, Part ${partNum} (300 of 900 words)`,
    },
    source_lang: 'ko',
    exam_type: 'TOPIK',
    level: String(level),
    category: 'exam',
    display_order: level === 1 ? 17 + partNum : 20 + partNum,
    target_langs: ['en', 'ja', 'zh-CN', 'es', 'fr', 'de', 'it'],
    words,
  };
  fs.writeFileSync(filePath, JSON.stringify(spec, null, 2));
}

l1Parts.forEach((part, idx) => {
  const words = part.map(e => e.word);
  writeSpecJson(`/tmp/topik-1-part-${idx + 1}.json`, words, 1, idx + 1);
});
l2Parts.forEach((part, idx) => {
  const words = part.map(e => e.word);
  writeSpecJson(`/tmp/topik-2-part-${idx + 1}.json`, words, 2, idx + 1);
});

console.log('\n=== Files written ===');
console.log('  /tmp/topik-1-final-review.txt  (human-readable 1급 review)');
console.log('  /tmp/topik-2-final-review.txt  (human-readable 2급 review)');
console.log('  /tmp/topik-1-part-1/2/3.json   (JSON specs ready for curation)');
console.log('  /tmp/topik-2-part-1/2/3.json   (JSON specs ready for curation)');
