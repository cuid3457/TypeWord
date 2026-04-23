import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

const EFFECTIVE_DATE = '2026-04-22';

export default function PrivacyPolicyScreen() {
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
            {t('settings.privacy')}
          </Text>
        </View>
        {isKo ? <PolicyKo /> : <PolicyEn />}
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
      • {children}
    </Text>
  );
}

function PolicyKo() {
  return (
    <View>
      <Text className="text-2xl font-bold text-black dark:text-white">
        개인정보처리방침
      </Text>
      <Text className="mt-1 text-xs text-gray-500">시행일: {EFFECTIVE_DATE}</Text>

      <SectionTitle>1. 수집하는 정보</SectionTitle>
      <P>TypeWord(이하 "앱")는 서비스 제공을 위해 아래 정보를 수집합니다.</P>
      <Bullet>이메일 주소: 계정 등록 및 로그인 시 수집 (선택 사항)</Bullet>
      <Bullet>비밀번호: 이메일 계정 인증 목적으로 수집되며 암호화되어 저장됩니다</Bullet>
      <Bullet>Google 프로필 정보: Google 로그인 시 이메일 주소와 이름이 수집됩니다 (선택 사항)</Bullet>
      <Bullet>언어 설정: 모국어, 원서 언어, 번역 언어</Bullet>
      <Bullet>단어장 정보: 단어장 이름, 저장한 단어 및 AI 생성 정의</Bullet>
      <Bullet>기기 언어: 앱 초기 언어 설정을 위해 1회 확인 (서버 전송 없음)</Bullet>
      <Bullet>카메라/사진: 이미지 단어 추출 기능 사용 시 촬영하거나 선택한 이미지가 AI 처리를 위해 서버로 전송됩니다. 이미지는 처리 후 즉시 삭제되며 서버에 저장되지 않습니다.</Bullet>
      <Bullet>API 사용 기록: 단어 검색 횟수, 응답 시간, 비용 (서비스 운영 목적)</Bullet>
      <Bullet>구독 상태: 프리미엄 구독 여부 및 관련 거래 정보</Bullet>

      <SectionTitle>2. 수집하지 않는 정보</SectionTitle>
      <Bullet>전화번호 등 추가 개인 식별 정보</Bullet>
      <Bullet>위치 정보</Bullet>
      <Bullet>연락처, 마이크</Bullet>
      <Bullet>결제 카드 정보 (결제는 Apple/Google을 통해 처리됩니다)</Bullet>
      <Bullet>광고 추적 정보 (단, Google AdMob이 자체적으로 수집하는 정보는 Google 정책을 따릅니다)</Bullet>

      <SectionTitle>3. 정보의 저장 위치</SectionTitle>
      <P>단어장과 단어 데이터는 기기 내부(SQLite)에 저장됩니다. 언어 설정은 기기 내부 저장소(AsyncStorage)에 보관됩니다.</P>
      <P>회원가입한 사용자의 경우, 클라우드 백업 및 동기화를 위해 단어장 데이터가 서버(Supabase)에 암호화 전송 후 저장됩니다.</P>
      <P>단어 검색 시 AI 처리를 위해 서버(Supabase)를 경유하며, 검색 결과는 서비스 품질 향상을 위해 익명 캐시로 저장될 수 있습니다.</P>

      <SectionTitle>4. 제3자 제공</SectionTitle>
      <P>앱은 서비스 제공을 위해 아래 외부 서비스를 이용합니다.</P>
      <Bullet>OpenAI: 검색한 단어와 언어쌍 정보가 전달됩니다. 이미지 단어 추출 기능 사용 시 이미지가 함께 전송됩니다. 사용자 식별 정보는 전송되지 않습니다.</Bullet>
      <Bullet>Supabase: 인증, 데이터베이스, 클라우드 동기화 및 API 호스팅 서비스 제공</Bullet>
      <Bullet>RevenueCat: 구독 결제 처리 및 구독 상태 관리. 익명 사용자 ID와 구독 정보만 전달됩니다.</Bullet>
      <Bullet>Free Dictionary API: 영어 단어 검색 실패 시 대체 사전 (단어만 전송)</Bullet>
      <Bullet>Google AdMob: 무료 사용자에게 앱 내 광고를 표시합니다. AdMob은 Google 개인정보처리방침에 따라 기기 식별자 및 광고 상호작용 데이터를 수집할 수 있습니다. 프리미엄 사용자에게는 광고가 표시되지 않습니다.</Bullet>
      <Bullet>Sentry: 앱 오류 모니터링 서비스. 오류 발생 시 기기 정보와 오류 로그가 전송될 수 있으며, 개인 식별 정보는 포함되지 않습니다.</Bullet>
      <P>분석 도구, 소셜 미디어 등에 데이터를 공유하지 않습니다.</P>

      <SectionTitle>5. 음성 합성(TTS)</SectionTitle>
      <P>발음 듣기 기능은 기기 내장 TTS 엔진을 사용하며, 외부 서버로 데이터가 전송되지 않습니다.</P>

      <SectionTitle>6. 데이터 보관 및 삭제</SectionTitle>
      <P>기기에 저장된 단어장 데이터는 앱 삭제 시 함께 삭제됩니다. 설정 화면의 "초기화" 기능을 통해 언제든 기기 내 모든 데이터를 삭제할 수 있습니다.</P>
      <P>계정을 등록한 사용자는 설정 화면에서 계정 삭제를 요청할 수 있으며, 삭제 시 서버에 저장된 이메일, 단어장 데이터 등 모든 정보가 영구적으로 삭제됩니다.</P>
      <P>구독 해지 후에도 서버 데이터는 계정 삭제를 요청할 때까지 보관됩니다.</P>

      <SectionTitle>7. 계정 및 인증</SectionTitle>
      <P>앱은 회원가입 없이 사용할 수 있습니다. 클라우드 백업 및 동기화를 이용하려면 이메일 또는 Google 계정으로 로그인할 수 있습니다.</P>
      <P>이메일 계정 등록 시 이메일 인증을 통해 본인 확인을 진행합니다. 비밀번호는 암호화되어 저장되며, 개발자가 비밀번호 원문을 확인할 수 없습니다.</P>
      <P>Google 로그인 시 Google 계정의 이메일 주소와 프로필 정보(이름)가 수집됩니다. Google 계정의 비밀번호는 앱에서 처리하지 않습니다.</P>

      <SectionTitle>8. 아동 개인정보 보호</SectionTitle>
      <P>본 앱은 만 14세 미만 아동의 개인정보를 의도적으로 수집하지 않습니다. 만 14세 미만 사용자는 보호자의 동의 하에 앱을 사용해야 합니다.</P>

      <SectionTitle>9. 변경 사항 고지</SectionTitle>
      <P>개인정보처리방침이 변경될 경우, 앱 내 공지를 통해 사전에 안내합니다.</P>

      <SectionTitle>10. 문의</SectionTitle>
      <P>개인정보와 관련한 문의는 아래로 연락해 주세요.</P>
      <P>이메일: support@typeword.app</P>
    </View>
  );
}

function PolicyEn() {
  return (
    <View>
      <Text className="text-2xl font-bold text-black dark:text-white">
        Privacy Policy
      </Text>
      <Text className="mt-1 text-xs text-gray-500">Effective: {EFFECTIVE_DATE}</Text>

      <SectionTitle>1. Information We Collect</SectionTitle>
      <P>TypeWord ("the App") collects the following information to provide its services.</P>
      <Bullet>Email address: collected when you register an account (optional)</Bullet>
      <Bullet>Password: collected for email account authentication and stored in encrypted form</Bullet>
      <Bullet>Google profile information: email address and name are collected when signing in with Google (optional)</Bullet>
      <Bullet>Language settings: native language, source language, target language</Bullet>
      <Bullet>Wordlist data: list names, saved words, and AI-generated definitions</Bullet>
      <Bullet>Device language: checked once for initial UI language (not sent to servers)</Bullet>
      <Bullet>Camera/Photos: When using the image word extraction feature, captured or selected images are sent to our server for AI processing. Images are deleted immediately after processing and are not stored on our servers.</Bullet>
      <Bullet>API usage logs: lookup counts, response times, and costs (for service operations)</Bullet>
      <Bullet>Subscription status: premium subscription state and related transaction information</Bullet>

      <SectionTitle>2. Information We Do Not Collect</SectionTitle>
      <Bullet>Additional personal identifiers such as phone number</Bullet>
      <Bullet>Location data</Bullet>
      <Bullet>Contacts or microphone access</Bullet>
      <Bullet>Payment card information (payments are processed through Apple/Google)</Bullet>
      <Bullet>Advertising or tracking identifiers (however, Google AdMob may collect such data per Google's own privacy policy)</Bullet>

      <SectionTitle>3. Where Data Is Stored</SectionTitle>
      <P>Wordlists and vocabulary data are stored locally on your device (SQLite). Language settings are kept in on-device storage (AsyncStorage).</P>
      <P>For registered users, wordlist data is securely transmitted and stored on our server (Supabase) for cloud backup and cross-device sync.</P>
      <P>When you look up a word, the request is processed through our server (Supabase) for AI processing. Results may be stored in an anonymous cache to improve service quality.</P>

      <SectionTitle>4. Third-Party Services</SectionTitle>
      <P>The App uses the following external services to provide its functionality.</P>
      <Bullet>OpenAI: The searched word and language pair are sent. When using image word extraction, images are also transmitted. No user identification is transmitted.</Bullet>
      <Bullet>Supabase: Provides authentication, database, cloud sync, and API hosting</Bullet>
      <Bullet>RevenueCat: Handles subscription payment processing and subscription state management. Only an anonymous user ID and subscription information are shared.</Bullet>
      <Bullet>Free Dictionary API: Fallback dictionary for English lookups (only the word is sent)</Bullet>
      <Bullet>Google AdMob: Displays advertisements to free-tier users. AdMob may collect device identifiers and ad interaction data in accordance with Google's privacy policy. Premium users do not see ads.</Bullet>
      <Bullet>Sentry: Error monitoring service. Device information and error logs may be transmitted when errors occur; no personal identifiers are included.</Bullet>
      <P>We do not share data with analytics tools or social media platforms.</P>

      <SectionTitle>5. Text-to-Speech (TTS)</SectionTitle>
      <P>The pronunciation feature uses your device's built-in TTS engine. No data is sent to external servers for this feature.</P>

      <SectionTitle>6. Data Retention and Deletion</SectionTitle>
      <P>Locally stored wordlist data is deleted when you uninstall the app. You can also delete all on-device data at any time using the "Reset" option in Settings.</P>
      <P>If you have registered an account, you can request account deletion from the Settings screen. Upon deletion, all server-stored data including your email and wordlist data will be permanently removed.</P>
      <P>Server data is retained after subscription cancellation until you request account deletion.</P>

      <SectionTitle>7. Accounts and Authentication</SectionTitle>
      <P>The App can be used without creating an account. To use cloud backup and sync, you may sign in with your email or Google account.</P>
      <P>Email verification is used to confirm your identity during email registration. Passwords are stored in encrypted form and cannot be viewed by the developer.</P>
      <P>When signing in with Google, your Google account email address and profile information (name) are collected. Your Google account password is not processed by the App.</P>

      <SectionTitle>8. Children's Privacy</SectionTitle>
      <P>This App does not knowingly collect personal information from children under the age of 14. Users under 14 should use the App only with parental consent.</P>

      <SectionTitle>9. Changes to This Policy</SectionTitle>
      <P>If this Privacy Policy is updated, we will notify you through an in-app notice prior to the changes taking effect.</P>

      <SectionTitle>10. Contact Us</SectionTitle>
      <P>For privacy-related inquiries, please contact us at:</P>
      <P>Email: support@typeword.app</P>
    </View>
  );
}
