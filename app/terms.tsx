import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

const EFFECTIVE_DATE = '2026-05-01';

export default function TermsScreen() {
  const { t, i18n } = useTranslation();
  const isKo = i18n.language === 'ko';

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 80 }}>
        <View className="flex-row items-center mb-4">
          <Pressable onPress={() => router.back()} className="mr-2 p-1">
            <MaterialIcons name="arrow-back" size={24} color="#6b7280" />
          </Pressable>
          <Text className="text-3xl font-bold text-black dark:text-white">
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

      <SectionTitle>1. 서비스 개요</SectionTitle>
      <P>TypeWord(이하 "앱")는 AI 기반 단어 검색 및 복습 기능을 제공하는 어휘 학습 서비스입니다. 본 약관은 앱의 이용에 관한 기본적인 사항을 규정합니다.</P>

      <SectionTitle>2. 이용 조건</SectionTitle>
      <P>앱을 다운로드하거나 사용하는 것은 본 약관에 동의하는 것으로 간주됩니다. 약관에 동의하지 않는 경우 앱 사용을 중단해 주세요.</P>

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
      <Bullet>구독은 취소하지 않는 한 구독 기간 종료 시 자동으로 갱신됩니다.</Bullet>
      <Bullet>자동 갱신은 현재 구독 기간 종료 최소 24시간 전에 취소할 수 있습니다.</Bullet>
      <Bullet>구독 관리 및 취소는 기기의 App Store/Play Store 설정에서 할 수 있습니다.</Bullet>
      <Bullet>환불은 Apple/Google의 환불 정책에 따릅니다.</Bullet>
      <P>프리미엄 구독 시 다음 혜택이 제공됩니다:</P>
      <Bullet>모든 복습 유형(받아쓰기, 문맥) 무제한 학습</Bullet>
      <Bullet>이미지 단어 추출 월 50회</Bullet>
      <Bullet>단어장 CSV 내보내기</Bullet>
      <Bullet>광고 제거</Bullet>

      <SectionTitle>5. 계정</SectionTitle>
      <P>클라우드 백업 및 동기화를 이용하려면 이메일 또는 Google 계정으로 로그인해야 합니다. 사용자는 계정 정보를 정확하게 유지할 책임이 있으며, 계정의 보안을 관리해야 합니다.</P>
      <P>사용자는 설정 화면에서 언제든지 계정을 삭제할 수 있으며, 삭제 시 서버에 저장된 모든 데이터가 영구적으로 제거됩니다.</P>

      <SectionTitle>6. 지적재산권</SectionTitle>
      <P>앱의 디자인, 코드, 로고 등 모든 콘텐츠에 대한 지적재산권은 개발자에게 있습니다. AI가 생성한 단어 뜻, 예문, 유의어 등의 콘텐츠는 서비스의 일부로 제공되며, 개발자에게 귀속됩니다. 사용자가 직접 구성한 단어장 목록(단어장 이름, 저장한 단어의 선택)은 사용자에게 귀속됩니다.</P>

      <SectionTitle>7. 금지 행위</SectionTitle>
      <P>다음 행위는 금지됩니다.</P>
      <Bullet>앱의 정상적인 운영을 방해하는 행위</Bullet>
      <Bullet>자동화 도구를 이용한 대량 검색</Bullet>
      <Bullet>앱을 역설계, 디컴파일 또는 무단 복제하는 행위</Bullet>
      <Bullet>다른 사용자 또는 제3자의 권리를 침해하는 행위</Bullet>
      <Bullet>구독 시스템을 우회하거나 조작하는 행위</Bullet>

      <SectionTitle>8. 면책 조항</SectionTitle>
      <P>AI 생성 결과의 정확성, 완전성에 대해 보증하지 않습니다. 앱 사용으로 인해 발생한 간접적, 부수적 손해에 대해 개발자는 책임을 지지 않습니다.</P>
      <P>앱은 "있는 그대로(AS IS)" 제공되며, 서비스의 중단 없는 제공을 보장하지 않습니다.</P>

      <SectionTitle>9. 광고</SectionTitle>
      <P>무료 사용자에게는 Google AdMob을 통한 광고가 표시될 수 있습니다. 광고 내용은 제3자가 제공하며, 개발자는 광고 내용에 대해 책임을 지지 않습니다. 프리미엄 구독 사용자에게는 광고가 표시되지 않습니다.</P>

      <SectionTitle>10. 서비스 변경 및 종료</SectionTitle>
      <P>개발자는 사전 고지 후 서비스 내용을 변경하거나 종료할 수 있습니다. 중대한 변경의 경우 앱 내 공지를 통해 안내합니다.</P>
      <P>서비스 종료 시, 유료 구독 사용자에게는 충분한 사전 고지 기간을 제공합니다.</P>

      <SectionTitle>11. 약관 변경</SectionTitle>
      <P>본 약관은 필요에 따라 변경될 수 있으며, 변경 시 앱 내 공지를 통해 사전에 안내합니다. 변경된 약관에 동의하지 않을 경우 앱 사용을 중단할 수 있습니다.</P>

      <SectionTitle>12. 책임 한도</SectionTitle>
      <P>관련 법률이 허용하는 최대 범위 내에서, 본 앱의 이용 또는 이용 불능과 관련하여 발생한 모든 직접·간접·부수적·결과적 손해에 대한 개발자의 누적 책임은 청구일 직전 12개월간 사용자가 본 앱에 실제로 지불한 구독료 총액으로 제한됩니다. 무료 사용자의 경우 책임 한도는 100,000원입니다.</P>
      <P>AI가 생성한 정의·예문·발음 정보는 학습 보조 자료로 제공되며, 시험·자격증·번역 등 정확성이 결정적으로 요구되는 용도에 사용해서는 안 됩니다.</P>

      <SectionTitle>13. 면책 보장</SectionTitle>
      <P>사용자는 (a) 사용자의 본 약관 위반, (b) 사용자가 입력하거나 저장한 콘텐츠로 인한 제3자의 권리 침해, (c) 사용자의 앱 사용으로 발생한 모든 청구·손해·비용(합리적인 변호사 비용 포함)에 대해 개발자를 면책하고, 개발자가 입을 수 있는 손해를 배상합니다.</P>

      <SectionTitle>14. 저작권 침해 신고</SectionTitle>
      <P>앱에서 표시되는 콘텐츠가 본인의 저작권 또는 기타 지적재산권을 침해한다고 판단하는 경우, 아래 정보를 포함하여 이메일로 신고해 주세요.</P>
      <Bullet>침해 대상 저작물의 식별 정보 (제목, 권리자명, 등록번호 등)</Bullet>
      <Bullet>침해 콘텐츠가 표시된 위치 (검색한 단어, 단어장, 화면 캡처 등)</Bullet>
      <Bullet>신고자의 이름·연락처</Bullet>
      <Bullet>신고자가 권리자 본인이거나 권리자로부터 정당하게 위임받은 자임을 확인하는 진술</Bullet>
      <P>정당한 침해 신고가 접수되면 통상 영업일 기준 3일 이내에 검토하여 해당 콘텐츠를 제거하거나 수정합니다.</P>
      <P>신고 이메일: support@typeword.app</P>

      <SectionTitle>15. 가분성</SectionTitle>
      <P>본 약관의 일부 조항이 법원이나 관련 기관에 의해 무효 또는 집행 불가능하다고 판단되더라도, 그 외의 조항은 계속해서 완전한 효력을 유지합니다.</P>

      <SectionTitle>16. 준거법 및 관할</SectionTitle>
      <P>본 약관은 대한민국 법률에 따라 해석되며, 관련 분쟁은 대한민국 법원을 관할 법원으로 합니다.</P>

      <SectionTitle>17. 문의</SectionTitle>
      <P>이용약관에 관한 문의는 아래로 연락해 주세요.</P>
      <P>이메일: support@typeword.app</P>
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

      <SectionTitle>1. Service Overview</SectionTitle>
      <P>TypeWord ("the App") is a vocabulary learning service that provides AI-powered word lookup and spaced repetition review features. These terms govern your use of the App.</P>

      <SectionTitle>2. Acceptance of Terms</SectionTitle>
      <P>By downloading or using the App, you agree to be bound by these Terms of Service. If you do not agree, please discontinue use of the App.</P>

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
      <Bullet>Subscriptions automatically renew at the end of each billing period unless cancelled.</Bullet>
      <Bullet>Auto-renewal may be cancelled at least 24 hours before the end of the current period.</Bullet>
      <Bullet>Subscription management and cancellation are available in your device's App Store/Play Store settings.</Bullet>
      <Bullet>Refunds are subject to Apple's/Google's refund policies.</Bullet>
      <P>Premium subscribers receive the following benefits:</P>
      <Bullet>Unlimited access to all review modes (dictation, context)</Bullet>
      <Bullet>50 image word extractions per month</Bullet>
      <Bullet>Wordlist CSV export</Bullet>
      <Bullet>Ad-free experience</Bullet>

      <SectionTitle>5. Accounts</SectionTitle>
      <P>Cloud backup and sync require signing in with your email or Google account. You are responsible for maintaining accurate account information and securing your account credentials.</P>
      <P>You may delete your account at any time from the Settings screen. Upon deletion, all server-stored data will be permanently removed.</P>

      <SectionTitle>6. Intellectual Property</SectionTitle>
      <P>All intellectual property rights in the App's design, code, and logos belong to the developer. AI-generated content such as definitions, example sentences, and synonyms is provided as part of the service and belongs to the developer. The organization of wordlists created by users (list names and selection of saved words) belongs to the respective users.</P>

      <SectionTitle>7. Prohibited Conduct</SectionTitle>
      <P>The following activities are prohibited.</P>
      <Bullet>Interfering with the normal operation of the App</Bullet>
      <Bullet>Using automated tools for mass lookups</Bullet>
      <Bullet>Reverse engineering, decompiling, or unauthorized copying of the App</Bullet>
      <Bullet>Infringing on the rights of other users or third parties</Bullet>
      <Bullet>Circumventing or manipulating the subscription system</Bullet>

      <SectionTitle>8. Disclaimer</SectionTitle>
      <P>We do not guarantee the accuracy or completeness of AI-generated results. The developer shall not be liable for any indirect or incidental damages arising from the use of the App.</P>
      <P>The App is provided "AS IS" without warranty of uninterrupted availability.</P>

      <SectionTitle>9. Advertising</SectionTitle>
      <P>Free-tier users may see advertisements through Google AdMob. Ad content is provided by third parties, and the developer is not responsible for the content of such advertisements. Premium subscribers will not see ads.</P>

      <SectionTitle>10. Service Modifications and Termination</SectionTitle>
      <P>The developer may modify or terminate the service after prior notice. Significant changes will be communicated through in-app notifications.</P>
      <P>In the event of service termination, paid subscribers will be given adequate advance notice.</P>

      <SectionTitle>11. Changes to These Terms</SectionTitle>
      <P>These terms may be updated as needed. Changes will be communicated through in-app notifications prior to taking effect. If you do not agree with the updated terms, you may discontinue use of the App.</P>

      <SectionTitle>12. Limitation of Liability</SectionTitle>
      <P>To the maximum extent permitted by applicable law, the developer's aggregate liability for any direct, indirect, incidental, or consequential damages arising out of or in connection with the App shall be limited to the amount actually paid by the user for the App in the twelve (12) months preceding the claim. For free users, the cap is USD 100 (or local equivalent).</P>
      <P>AI-generated definitions, examples, and pronunciation are provided as study aids only and must not be relied upon for use cases where accuracy is critical (exams, certifications, professional translation, etc.).</P>

      <SectionTitle>13. Indemnification</SectionTitle>
      <P>You agree to indemnify and hold the developer harmless from any claims, damages, losses, or costs (including reasonable legal fees) arising out of (a) your breach of these Terms, (b) third-party rights infringed by content you input or store, or (c) your use of the App.</P>

      <SectionTitle>14. Copyright Infringement Notices</SectionTitle>
      <P>If you believe content displayed in the App infringes your copyright or other intellectual property rights, please send an email containing the following information.</P>
      <Bullet>Identification of the work claimed to be infringed (title, rights holder, registration number where applicable)</Bullet>
      <Bullet>Location where the infringing content appears (search term, wordlist, screenshot, etc.)</Bullet>
      <Bullet>Your name and contact information</Bullet>
      <Bullet>A statement that you are the rights holder or authorized to act on the rights holder's behalf</Bullet>
      <P>Valid notices will typically be reviewed and acted upon within three (3) business days, with the disputed content removed or modified as appropriate.</P>
      <P>Notices: support@typeword.app</P>

      <SectionTitle>15. Severability</SectionTitle>
      <P>If any provision of these Terms is found by a court or other competent authority to be invalid or unenforceable, the remaining provisions shall continue in full force and effect.</P>

      <SectionTitle>16. Governing Law</SectionTitle>
      <P>These terms shall be governed by and construed in accordance with the laws of the Republic of Korea. Any disputes shall be subject to the jurisdiction of the courts of the Republic of Korea.</P>

      <SectionTitle>17. Contact Us</SectionTitle>
      <P>For inquiries regarding these Terms of Service, please contact us at:</P>
      <P>Email: support@typeword.app</P>
    </View>
  );
}
