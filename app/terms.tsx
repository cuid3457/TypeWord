import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

const EFFECTIVE_DATE = '2026-05-16';

// Provider business info has been moved to the dedicated business-info
// screen (app/business-info.tsx). Terms text references it without
// embedding the full registration details. Korean e-Commerce Act §10
// requires disclosure on the service but doesn't require it inside the
// Terms of Service text itself — a clearly-linked separate screen is
// compliant and matches industry practice (Kakao/Naver/Toss).
//
// Phone number intentionally removed everywhere — email-only contact.
const PROVIDER_KO = {
  name: '펀스턴',
  email: 'support@typeword.app',
};

const PROVIDER_EN = {
  name: 'Funston',
  email: 'support@typeword.app',
};

export default function TermsScreen() {
  const { t, i18n } = useTranslation();
  const isKo = i18n.language === 'ko';

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 80 }}>
        <View className="h-11 flex-row items-center mb-4">
          <Pressable onPress={() => router.back()} className="mr-2 p-1">
            <MaterialIcons name="arrow-back" size={24} color="#6b7280" />
          </Pressable>
          <Text className="text-base font-semibold text-black dark:text-white">
            {t('settings.terms')}
          </Text>
        </View>
        {isKo ? <TermsKo /> : <TermsEn />}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="mb-2 mt-6 text-lg font-bold text-black dark:text-white">
      {children}
    </Text>
  );
}

function P({ children }: { children: string }) {
  return (
    <Text className="mb-3 text-sm leading-5 text-gray-700 dark:text-gray-300">
      {children}
    </Text>
  );
}

function Bullet({ children }: { children: string }) {
  return (
    <Text className="mb-1 ml-4 text-sm leading-5 text-gray-700 dark:text-gray-300">
      {'\u2022'} {children}
    </Text>
  );
}

function TermsKo() {
  return (
    <View>
      <Text className="text-2xl font-bold text-black dark:text-white">
        이용약관
      </Text>
      <Text className="mt-1 text-xs text-gray-500">시행일: {EFFECTIVE_DATE}</Text>

      <SectionTitle>서비스 운영자</SectionTitle>
      <P>{`본 서비스는 ${PROVIDER_KO.name}에서 운영합니다. 사업자등록번호, 대표자, 주소, 통신판매업 신고번호 등 상세 사업자 정보는 설정 → 사업자 정보에서 확인하실 수 있습니다.`}</P>
      <P>{`문의: ${PROVIDER_KO.email}`}</P>

      <SectionTitle>1. 서비스 개요</SectionTitle>
      <P>MoaVoca(이하 "앱")는 AI 기반 단어 검색, 복습, 단어장 공유, 친구 초대 기능을 제공하는 어휘 학습 서비스입니다. 본 약관은 앱의 이용에 관한 기본적인 사항을 규정하며, 앱 사용자(이하 "이용자")와 운영자 간의 권리·의무·책임 사항을 정합니다.</P>

      <SectionTitle>2. 이용 조건</SectionTitle>
      <P>앱을 다운로드하거나 사용하는 것은 본 약관에 동의하는 것으로 간주됩니다. 약관에 동의하지 않는 경우 앱 사용을 중단해 주세요.</P>
      <P>만 18세 미만 이용자는 법정대리인(보호자)의 동의를 얻은 후에만 본 약관에 동의하고 서비스를 이용할 수 있습니다. 만 14세 미만의 경우 한국 개인정보보호법에 따라 법정대리인의 동의 없이는 서비스를 이용할 수 없습니다.</P>

      <SectionTitle>3. 서비스 이용</SectionTitle>
      <Bullet>앱은 별도의 회원가입 없이 기본 기능을 이용할 수 있습니다.</Bullet>
      <Bullet>단어 검색 기능은 AI를 활용하여 결과를 생성하므로, 결과의 정확성을 100% 보장하지 않습니다.</Bullet>
      <Bullet>무료 사용자는 단어 저장 및 검색을 무제한으로 이용할 수 있습니다.</Bullet>
      <Bullet>무료 사용자의 받아쓰기 및 문맥 복습 유형은 하루 각 50단어로 제한됩니다.</Bullet>
      <Bullet>회원가입 시 클라우드 백업 및 동기화 기능이 제공됩니다.</Bullet>
      <Bullet>이미지 단어 추출 기능은 무료 사용자에게 월 3회, 프리미엄 사용자에게 월 50회 제공됩니다. 사용량은 거주 지역 시간대 기준 매월 1일에 초기화됩니다.</Bullet>
      <Bullet>음성 검색 기능은 마이크 권한이 허용된 경우 사용할 수 있으며, 음성 인식은 기기 운영체제(Apple/Google)의 서비스를 통해 처리됩니다.</Bullet>
      <Bullet>학습 알림은 알림 권한이 허용된 경우 기기에 로컬로 표시되며, 설정에서 언제든 끄거나 켤 수 있습니다. 단어장별로 요일과 시각을 별도 설정할 수 있습니다.</Bullet>
      <Bullet>서비스 품질 유지를 위해 일일 검색 횟수가 제한될 수 있습니다.</Bullet>

      <SectionTitle>4. 프리미엄 구독</SectionTitle>
      <P>앱은 월간 및 연간 프리미엄 구독을 제공합니다.</P>
      <Bullet>구독은 Apple App Store 또는 Google Play Store를 통해 결제됩니다.</Bullet>
      <Bullet>구독료는 부가가치세(VAT)가 포함된 가격으로 표시됩니다.</Bullet>
      <Bullet>구독은 취소하지 않는 한 구독 기간 종료 시 자동으로 갱신됩니다.</Bullet>
      <Bullet>자동 갱신은 현재 구독 기간 종료 최소 24시간 전에 취소할 수 있습니다.</Bullet>
      <Bullet>구독 관리 및 취소는 기기의 App Store/Play Store 설정에서 할 수 있습니다.</Bullet>
      <Bullet>환불은 Apple/Google의 환불 정책에 따릅니다.</Bullet>
      <P>프리미엄 구독 시 다음 혜택이 제공됩니다:</P>
      <Bullet>모든 복습 유형(받아쓰기, 문맥) 무제한 학습</Bullet>
      <Bullet>이미지 단어 추출 월 50회</Bullet>
      <Bullet>단어장 CSV 내보내기</Bullet>
      <Bullet>광고 제거</Bullet>

      <SectionTitle>5. 계정 및 표시 이름</SectionTitle>
      <P>클라우드 백업 및 동기화를 이용하려면 이메일, Google 계정 또는 Apple 계정으로 로그인해야 합니다. Apple 로그인 시 "Hide My Email"을 사용하면 익명 릴레이 주소가 등록됩니다. 사용자는 계정 정보를 정확하게 유지할 책임이 있으며, 계정의 보안을 관리해야 합니다.</P>
      <P>친구 초대 또는 단어장 공유 기능 이용 시 사용자가 설정한 표시 이름(닉네임)이 다른 사용자에게 노출됩니다. 표시 이름은 타인의 권리(상표·실명·저작권 등)를 침해하지 않아야 하며, 음란·혐오·차별·광고·허위 표현을 포함할 수 없습니다.</P>
      <P>사용자는 설정 화면에서 언제든지 계정을 삭제할 수 있으며, 삭제 시 서버에 저장된 모든 데이터가 영구적으로 제거됩니다.</P>

      <SectionTitle>6. 사용자 콘텐츠 및 단어장 공유</SectionTitle>
      <P>이용자는 자신이 만든 단어장을 다른 사용자가 볼 수 있도록 공유할 수 있습니다. 공유한 콘텐츠(단어장 이름, 설명, 단어 구성 등)는 본 약관 적용 범위 내에서 다른 이용자에게 표시됩니다.</P>
      <P>{`사용자 콘텐츠의 권리는 사용자에게 귀속되며, 운영자는 서비스 제공·표시·전달·홍보 목적으로 해당 콘텐츠를 사용·복제·표시·배포할 수 있는 비독점적·전세계적·무상 라이선스를 부여받습니다. 사용자가 콘텐츠를 삭제하거나 계정을 탈퇴하는 경우 해당 라이선스도 종료됩니다(다만 법령 또는 계약에 따라 보관이 요구되는 경우는 예외).`}</P>
      <P>다음 콘텐츠를 공유하는 행위는 금지됩니다:</P>
      <Bullet>음란물, 노출, 성적 콘텐츠</Bullet>
      <Bullet>혐오 표현, 차별, 비하, 슬러</Bullet>
      <Bullet>폭력, 자해, 자살을 조장·미화하는 표현</Bullet>
      <Bullet>저작권·상표권·기타 지적재산권 침해 콘텐츠</Bullet>
      <Bullet>타인의 개인정보·사생활을 침해하는 정보</Bullet>
      <Bullet>광고·홍보·스팸성 콘텐츠</Bullet>
      <Bullet>외부 결제 유도, 사기, 피싱 시도</Bullet>
      <Bullet>대한민국 법률 또는 본 약관에 위배되는 모든 콘텐츠</Bullet>
      <P>운영자는 부적절하다고 판단되는 사용자 콘텐츠를 사전 통지 없이 비공개·삭제·제한할 수 있으며, 반복적 위반 시 계정 이용을 제한할 수 있습니다. 사용자는 신고 기능을 통해 부적절한 콘텐츠를 운영자에게 알릴 수 있습니다.</P>

      <SectionTitle>7. 친구 시스템</SectionTitle>
      <P>이용자는 초대 코드 또는 친구 추가 기능을 통해 다른 이용자와 친구 관계를 맺을 수 있습니다. 친구 간에는 서로의 표시 이름, 학습 통계, 공유한 단어장 등이 노출될 수 있으며, 구체적 노출 범위는 앱 내 설정에서 확인하고 조정할 수 있습니다.</P>
      <P>이용자는 언제든지 친구를 삭제하거나 차단할 수 있습니다. 차단된 사용자는 차단한 사용자의 콘텐츠에 접근할 수 없습니다.</P>
      <P>친구 관계는 양방향 동의로 성립합니다. 일방적인 친구 추가나 스토킹 행위, 차단 우회 시도는 금지됩니다.</P>

      <SectionTitle>8. 프로필 및 아바타</SectionTitle>
      <P>이용자의 프로필 아바타는 운영자가 제공하는 미리 만들어진 세트 또는 자동 생성된 이니셜 형태로만 설정할 수 있습니다. 임의의 사진·이미지 업로드 기능은 제공하지 않으며, 이는 부적절한 콘텐츠로 인한 위험을 방지하기 위함입니다.</P>
      <P>표시 이름과 아바타는 다른 사용자가 볼 수 있는 공개 정보로 취급됩니다.</P>

      <SectionTitle>9. 지적재산권</SectionTitle>
      <P>앱의 디자인, 코드, 로고 등 모든 콘텐츠에 대한 지적재산권은 개발자에게 있습니다. AI가 생성한 단어 뜻, 예문, 유의어 등의 콘텐츠는 서비스의 일부로 제공되며, 개발자에게 귀속됩니다. 사용자가 직접 구성한 단어장 목록(단어장 이름, 저장한 단어의 선택)은 사용자에게 귀속됩니다.</P>
      <P>{`운영자가 사전 제작·큐레이션하여 제공하는 단어장(시험 대비, 주제별, 빈출 어휘 등 — 이하 "큐레이션 콘텐츠")의 발음 기호(IPA), 읽기, 예문, 번역, 하이라이팅, 유의어, 반의어, 난이도 분류, 진열 순서, 단어장 묶음의 편집·선별 결과를 포함한 일체의 데이터베이스 권리 및 편집 저작권은 운영자에게 귀속됩니다. 사용자는 본인의 학습 목적에 한해 큐레이션 콘텐츠를 개인 단어장에 가져와 사용할 수 있으며, 그 외의 사용은 본 약관 제10조에 따라 제한됩니다.`}</P>

      <SectionTitle>10. 금지 행위</SectionTitle>
      <P>다음 행위는 금지됩니다.</P>
      <Bullet>앱의 정상적인 운영을 방해하는 행위</Bullet>
      <Bullet>자동화 도구를 이용한 대량 검색·요청</Bullet>
      <Bullet>{`큐레이션 콘텐츠(운영자가 사전 제작한 단어장)의 데이터 — 발음 기호, 예문, 번역, 하이라이팅, 유의어, 반의어, 단어장 편집·선별 결과 등 — 를 자동화 도구 또는 수동으로 수집·추출·복제·스크래핑하는 행위, 또는 이를 별도의 서비스·앱·웹사이트·데이터셋·LLM 학습 데이터에 사용하거나 제3자에게 배포·판매하는 행위`}</Bullet>
      <Bullet>앱을 역설계, 디컴파일 또는 무단 복제하는 행위</Bullet>
      <Bullet>다른 사용자 또는 제3자의 권리를 침해하는 행위</Bullet>
      <Bullet>구독 시스템을 우회하거나 조작하는 행위</Bullet>
      <Bullet>제6조에서 정한 부적절한 사용자 콘텐츠를 게시·공유하는 행위</Bullet>
      <Bullet>다른 이용자에 대한 괴롭힘, 스토킹, 차단 우회 행위</Bullet>
      <Bullet>운영자나 다른 사용자의 표시 이름·아바타를 사칭하는 행위</Bullet>
      <Bullet>외부 서비스로의 사기성 결제·홍보 유도</Bullet>

      <SectionTitle>11. 면책 조항</SectionTitle>
      <P>AI 생성 결과(정의, 예문, 발음 등)의 정확성, 완전성, 신뢰성에 대해 보증하지 않습니다. 운영자는 AI 응답에 포함될 수 있는 오류·편향·미흡함에 대해 책임을 지지 않으며, 해당 콘텐츠가 운영자의 공식 입장을 대변하지 않습니다. 앱 사용으로 인해 발생한 간접적·부수적·결과적 손해에 대해 운영자는 책임을 지지 않습니다.</P>
      <P>앱은 "있는 그대로(AS IS)" 제공되며, 서비스의 중단 없는 제공을 보장하지 않습니다.</P>

      <SectionTitle>12. 광고</SectionTitle>
      <P>무료 사용자에게는 Google AdMob을 통한 광고가 표시될 수 있습니다. 광고 내용은 제3자가 제공하며, 운영자는 광고 내용에 대해 책임을 지지 않습니다. 프리미엄 구독 사용자에게는 광고가 표시되지 않습니다.</P>

      <SectionTitle>13. 서비스 변경 및 종료</SectionTitle>
      <P>운영자는 사전 고지 후 서비스 내용을 변경하거나 종료할 수 있습니다. 중대한 변경의 경우 앱 내 공지를 통해 안내합니다.</P>
      <P>서비스 종료 시, 유료 구독 사용자에게는 충분한 사전 고지 기간을 제공합니다.</P>

      <SectionTitle>14. 약관 변경</SectionTitle>
      <P>본 약관은 필요에 따라 변경될 수 있으며, 변경 시 앱 내 공지를 통해 사전에 안내합니다. 변경된 약관에 동의하지 않을 경우 앱 사용을 중단할 수 있습니다.</P>

      <SectionTitle>15. 책임 한도</SectionTitle>
      <P>관련 법률이 허용하는 최대 범위 내에서, 본 앱의 이용 또는 이용 불능과 관련하여 발생한 모든 직접·간접·부수적·결과적 손해에 대한 운영자의 누적 책임은 청구일 직전 12개월간 사용자가 본 앱에 실제로 지불한 구독료 총액으로 제한됩니다. 무료 사용자의 경우 책임 한도는 100,000원입니다.</P>
      <P>AI가 생성한 정의·예문·발음 정보는 학습 보조 자료로 제공되며, 시험·자격증·번역 등 정확성이 결정적으로 요구되는 용도에 사용해서는 안 됩니다.</P>

      <SectionTitle>16. 면책 보장</SectionTitle>
      <P>사용자는 (a) 사용자의 본 약관 위반, (b) 사용자가 입력·저장·공유한 콘텐츠로 인한 제3자의 권리 침해, (c) 사용자의 앱 사용으로 발생한 모든 청구·손해·비용(합리적인 변호사 비용 포함)에 대해 운영자를 면책하고, 운영자가 입을 수 있는 손해를 배상합니다.</P>

      <SectionTitle>17. 저작권 침해 신고</SectionTitle>
      <P>앱에서 표시되는 콘텐츠가 본인의 저작권 또는 기타 지적재산권을 침해한다고 판단하는 경우, 아래 정보를 포함하여 이메일로 신고해 주세요.</P>
      <Bullet>침해 대상 저작물의 식별 정보 (제목, 권리자명, 등록번호 등)</Bullet>
      <Bullet>침해 콘텐츠가 표시된 위치 (검색한 단어, 단어장, 화면 캡처 등)</Bullet>
      <Bullet>신고자의 이름·연락처</Bullet>
      <Bullet>신고자가 권리자 본인이거나 권리자로부터 정당하게 위임받은 자임을 확인하는 진술</Bullet>
      <P>정당한 침해 신고가 접수되면 통상 영업일 기준 3일 이내에 검토하여 해당 콘텐츠를 제거하거나 수정합니다.</P>
      <P>신고 이메일: {PROVIDER_KO.email}</P>

      <SectionTitle>18. 가분성</SectionTitle>
      <P>본 약관의 일부 조항이 법원이나 관련 기관에 의해 무효 또는 집행 불가능하다고 판단되더라도, 그 외의 조항은 계속해서 완전한 효력을 유지합니다.</P>

      <SectionTitle>19. 준거법 및 관할</SectionTitle>
      <P>본 약관은 대한민국 법률에 따라 해석되며, 본 약관 또는 서비스와 관련하여 발생한 분쟁은 운영자의 영업소 소재지를 관할하는 법원(서울남부지방법원 또는 그 상위 법원)을 1심 전속관할 법원으로 합니다.</P>

      <SectionTitle>20. 문의</SectionTitle>
      <P>이용약관에 관한 문의는 이메일로 보내주시면 답변드리겠습니다.</P>
      <P>{`이메일: ${PROVIDER_KO.email}`}</P>
    </View>
  );
}

function TermsEn() {
  return (
    <View>
      <Text className="text-2xl font-bold text-black dark:text-white">
        Terms of Service
      </Text>
      <Text className="mt-1 text-xs text-gray-500">Effective: {EFFECTIVE_DATE}</Text>

      <SectionTitle>Service Provider</SectionTitle>
      <P>{`This Service is operated by ${PROVIDER_EN.name}. Detailed business registration information (registration number, representative, address, mail-order business registration) is available under Settings → Business Information.`}</P>
      <P>{`Contact: ${PROVIDER_EN.email}`}</P>

      <SectionTitle>1. Service Overview</SectionTitle>
      <P>MoaVoca ("the App") is a vocabulary learning service that provides AI-powered word lookup, spaced repetition review, wordlist sharing, and friend invitation features. These terms govern your use of the App and define the rights, obligations, and responsibilities between users ("you") and the service provider ("we" or "the Provider").</P>

      <SectionTitle>2. Acceptance of Terms</SectionTitle>
      <P>By downloading or using the App, you agree to be bound by these Terms of Service. If you do not agree, please discontinue use of the App.</P>
      <P>Users under the age of 18 may use the Service only with prior consent from a parent or legal guardian. Users under the age of 14 may not use the Service without parental or legal guardian consent, in accordance with the Personal Information Protection Act of the Republic of Korea.</P>

      <SectionTitle>3. Use of Service</SectionTitle>
      <Bullet>The App can be used without creating an account for basic features.</Bullet>
      <Bullet>Word lookup results are generated using AI and are not guaranteed to be 100% accurate.</Bullet>
      <Bullet>Free users can save and look up words without limits.</Bullet>
      <Bullet>Free users are limited to 50 dictation and 50 context review exercises per day.</Bullet>
      <Bullet>Registering an account enables cloud backup and cross-device sync.</Bullet>
      <Bullet>Image word extraction is available up to 3 times per month for free users and 50 times per month for premium users. Usage resets on the 1st of each month based on the timezone of your selected region.</Bullet>
      <Bullet>Voice search is available when microphone permission is granted and uses the speech recognition service provided by your operating system (Apple/Google).</Bullet>
      <Bullet>Learning reminders are shown locally on the device when notification permission is granted, and can be turned on or off at any time from Settings. You can configure separate days of the week and time per wordlist.</Bullet>
      <Bullet>Daily lookup limits may be applied to maintain service quality.</Bullet>

      <SectionTitle>4. Premium Subscription</SectionTitle>
      <P>The App offers monthly and annual premium subscriptions.</P>
      <Bullet>Subscriptions are billed through the Apple App Store or Google Play Store.</Bullet>
      <Bullet>Displayed prices include applicable taxes (e.g., Korean VAT).</Bullet>
      <Bullet>Subscriptions automatically renew at the end of each billing period unless cancelled.</Bullet>
      <Bullet>Auto-renewal may be cancelled at least 24 hours before the end of the current period.</Bullet>
      <Bullet>Subscription management and cancellation are available in your device's App Store/Play Store settings.</Bullet>
      <Bullet>Refunds are subject to Apple's/Google's refund policies.</Bullet>
      <P>Premium subscribers receive the following benefits:</P>
      <Bullet>Unlimited access to all review modes (dictation, context)</Bullet>
      <Bullet>50 image word extractions per month</Bullet>
      <Bullet>Wordlist CSV export</Bullet>
      <Bullet>Ad-free experience</Bullet>

      <SectionTitle>5. Accounts and Display Name</SectionTitle>
      <P>Cloud backup and sync require signing in with your email, Google account, or Apple account. When signing in with Apple, you may choose "Hide My Email" so that only an anonymous relay address is registered. You are responsible for maintaining accurate account information and securing your account credentials.</P>
      <P>When you use friend or wordlist-sharing features, the display name (nickname) you set is visible to other users. Display names must not infringe on others' rights (trademarks, real names, copyright) and must not contain obscene, hateful, discriminatory, advertising, or false content.</P>
      <P>You may delete your account at any time from the Settings screen. Upon deletion, all server-stored data will be permanently removed.</P>

      <SectionTitle>6. User-Generated Content and Wordlist Sharing</SectionTitle>
      <P>You may share wordlists you create so other users can view them. Shared content (wordlist names, descriptions, word selections, etc.) is displayed to other users within the scope of these Terms.</P>
      <P>{`You retain ownership of your user content. By sharing content, you grant the Provider a non-exclusive, worldwide, royalty-free license to use, reproduce, display, distribute, and promote that content solely for the purpose of operating, presenting, and promoting the App. This license terminates when you delete the content or your account (except where retention is required by law or contract).`}</P>
      <P>You must not share content that:</P>
      <Bullet>Is obscene, sexual, or contains nudity</Bullet>
      <Bullet>Promotes hate, discrimination, harassment, or slurs</Bullet>
      <Bullet>Glorifies or encourages violence, self-harm, or suicide</Bullet>
      <Bullet>Infringes copyright, trademark, or other intellectual property</Bullet>
      <Bullet>Violates others' privacy or personal information</Bullet>
      <Bullet>Is advertising, promotional, or spam</Bullet>
      <Bullet>Solicits external payments, scams, or attempts phishing</Bullet>
      <Bullet>Otherwise violates Korean law or these Terms</Bullet>
      <P>The Provider may, without prior notice, hide, remove, or restrict user content deemed inappropriate, and may restrict account access for repeated violations. You can report inappropriate content through the in-app reporting feature.</P>

      <SectionTitle>7. Friend System</SectionTitle>
      <P>You may form friend relationships with other users via invitation codes or friend-add features. Friends may see each other's display name, learning statistics, and shared wordlists. The exact scope of visibility is shown and adjustable in the in-app settings.</P>
      <P>You may remove or block friends at any time. Blocked users cannot access content from the user who blocked them.</P>
      <P>Friend relationships are formed by mutual consent. Unilateral friend additions, stalking, or attempts to circumvent blocks are prohibited.</P>

      <SectionTitle>8. Profile and Avatars</SectionTitle>
      <P>Profile avatars may only be selected from a Provider-supplied set of predefined avatars or auto-generated initials. Custom photo or image upload is not supported, in order to prevent the risk of inappropriate content.</P>
      <P>Display names and avatars are treated as public information visible to other users.</P>

      <SectionTitle>9. Intellectual Property</SectionTitle>
      <P>All intellectual property rights in the App's design, code, and logos belong to the developer. AI-generated content such as definitions, example sentences, and synonyms is provided as part of the service and belongs to the developer. The organization of wordlists created by users (list names and selection of saved words) belongs to the respective users.</P>
      <P>{`Curated wordlists pre-produced by the Provider (exam-preparation lists, topical lists, frequency lists, etc. — collectively "Curated Content") together with their phonetic transcriptions (IPA), readings, example sentences, translations, highlighting markers, synonyms, antonyms, proficiency classifications, display order, and the editorial selection/arrangement of the lists themselves — including all underlying database rights and compilation copyrights — are owned by the Provider. You may import Curated Content into your personal wordlists for your own learning use only; all other uses are restricted under Section 10.`}</P>

      <SectionTitle>10. Prohibited Conduct</SectionTitle>
      <P>The following activities are prohibited.</P>
      <Bullet>Interfering with the normal operation of the App</Bullet>
      <Bullet>Using automated tools for mass lookups or requests</Bullet>
      <Bullet>{`Harvesting, extracting, copying, or scraping data from Curated Content (Provider-produced wordlists) — including phonetic transcriptions, example sentences, translations, highlighting, synonyms, antonyms, and editorial list selections — whether by automated tools or manually; and using such data in any separate service, application, website, dataset, or LLM training corpus, or distributing or selling it to third parties`}</Bullet>
      <Bullet>Reverse engineering, decompiling, or unauthorized copying of the App</Bullet>
      <Bullet>Infringing on the rights of other users or third parties</Bullet>
      <Bullet>Circumventing or manipulating the subscription system</Bullet>
      <Bullet>Posting or sharing inappropriate user content as defined in Section 6</Bullet>
      <Bullet>Harassing, stalking, or attempting to circumvent blocks of other users</Bullet>
      <Bullet>Impersonating the Provider or other users (display names, avatars)</Bullet>
      <Bullet>Soliciting fraudulent payments or promotions toward external services</Bullet>

      <SectionTitle>11. Disclaimer</SectionTitle>
      <P>We do not guarantee the accuracy, completeness, or reliability of AI-generated results (definitions, example sentences, pronunciation, etc.). The Provider is not responsible for errors, biases, or shortcomings that may appear in AI responses, and such content does not represent the Provider's official position. The Provider shall not be liable for any indirect, incidental, or consequential damages arising from the use of the App.</P>
      <P>The App is provided "AS IS" without warranty of uninterrupted availability.</P>

      <SectionTitle>12. Advertising</SectionTitle>
      <P>Free-tier users may see advertisements through Google AdMob. Ad content is provided by third parties, and the Provider is not responsible for the content of such advertisements. Premium subscribers will not see ads.</P>

      <SectionTitle>13. Service Modifications and Termination</SectionTitle>
      <P>The Provider may modify or terminate the service after prior notice. Significant changes will be communicated through in-app notifications.</P>
      <P>In the event of service termination, paid subscribers will be given adequate advance notice.</P>

      <SectionTitle>14. Changes to These Terms</SectionTitle>
      <P>These terms may be updated as needed. Changes will be communicated through in-app notifications prior to taking effect. If you do not agree with the updated terms, you may discontinue use of the App.</P>

      <SectionTitle>15. Limitation of Liability</SectionTitle>
      <P>To the maximum extent permitted by applicable law, the Provider's aggregate liability for any direct, indirect, incidental, or consequential damages arising out of or in connection with the App shall be limited to the amount actually paid by the user for the App in the twelve (12) months preceding the claim. For free users, the cap is USD 100 (or local equivalent).</P>
      <P>AI-generated definitions, examples, and pronunciation are provided as study aids only and must not be relied upon for use cases where accuracy is critical (exams, certifications, professional translation, etc.).</P>

      <SectionTitle>16. Indemnification</SectionTitle>
      <P>You agree to indemnify and hold the Provider harmless from any claims, damages, losses, or costs (including reasonable legal fees) arising out of (a) your breach of these Terms, (b) third-party rights infringed by content you input, store, or share, or (c) your use of the App.</P>

      <SectionTitle>17. Copyright Infringement Notices</SectionTitle>
      <P>If you believe content displayed in the App infringes your copyright or other intellectual property rights, please send an email containing the following information.</P>
      <Bullet>Identification of the work claimed to be infringed (title, rights holder, registration number where applicable)</Bullet>
      <Bullet>Location where the infringing content appears (search term, wordlist, screenshot, etc.)</Bullet>
      <Bullet>Your name and contact information</Bullet>
      <Bullet>A statement that you are the rights holder or authorized to act on the rights holder's behalf</Bullet>
      <P>Valid notices will typically be reviewed and acted upon within three (3) business days, with the disputed content removed or modified as appropriate.</P>
      <P>{`Notices: ${PROVIDER_EN.email}`}</P>

      <SectionTitle>18. Severability</SectionTitle>
      <P>If any provision of these Terms is found by a court or other competent authority to be invalid or unenforceable, the remaining provisions shall continue in full force and effect.</P>

      <SectionTitle>19. Governing Law and Jurisdiction</SectionTitle>
      <P>These terms shall be governed by and construed in accordance with the laws of the Republic of Korea. Any dispute arising out of or in connection with these Terms or the service shall be subject to the exclusive first-instance jurisdiction of the court having competence over the Provider's principal place of business (Seoul Southern District Court or its appellate court).</P>

      <SectionTitle>20. Contact Us</SectionTitle>
      <P>For inquiries regarding these Terms of Service, please reach out by email.</P>
      <P>{`Email: ${PROVIDER_EN.email}`}</P>
    </View>
  );
}
