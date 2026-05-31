import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { TabletContainer } from '@/components/tablet-container';
import { Toast } from '@/components/toast';
import {
  exportAccountDataJson,
  NotSignedInError,
  AnonymousExportError,
} from '@src/services/accountExportService';

const EFFECTIVE_DATE = '2026-06-01';

// Business registration info has been moved to app/business-info.tsx.
// Privacy policy text references it via Settings → 사업자 정보. Phone
// number intentionally not displayed anywhere — email-only contact.
const PROVIDER_KO = {
  name: '펀스턴',
  representative: '박준성',
  email: 'support@moavoca.com',
};

const PROVIDER_EN = {
  name: 'Funston',
  representative: 'Junsung Park',
  email: 'support@moavoca.com',
};

export default function PrivacyPolicyScreen() {
  const { t, i18n } = useTranslation();
  const isKo = i18n.language === 'ko';
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportAccountDataJson();
    } catch (err) {
      if (err instanceof NotSignedInError) {
        setToast({ message: t('auth.export_data_signin_required'), type: 'error' });
      } else if (err instanceof AnonymousExportError) {
        setToast({ message: t('auth.export_data_anonymous'), type: 'error' });
      } else {
        setToast({ message: t('auth.export_data_failed'), type: 'error' });
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas dark:bg-canvas-dark">
      <Stack.Screen options={{ headerShown: false }} />
      <TabletContainer>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 80 }}>
        <View className="h-11 flex-row items-center mb-4">
          <Pressable onPress={() => router.back()} className="mr-2 p-1">
            <MaterialIcons name="arrow-back" size={24} color="#7B7366" />
          </Pressable>
          <Text className="text-base font-semibold text-ink dark:text-ink-dark">
            {t('settings.privacy')}
          </Text>
        </View>
        {isKo
          ? <PolicyKo onExport={handleExport} exporting={exporting} exportLabel={t('auth.export_data')} />
          : <PolicyEn onExport={handleExport} exporting={exporting} exportLabel={t('auth.export_data')} />}
      </ScrollView>
      <Toast
        visible={!!toast}
        message={toast?.message ?? ''}
        type={toast?.type}
        onHide={() => setToast(null)}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      />
      </TabletContainer>
    </SafeAreaView>
  );
}

type PolicyProps = {
  onExport: () => void;
  exporting: boolean;
  exportLabel: string;
};

function ExportButton({ onExport, exporting, exportLabel }: PolicyProps) {
  return (
    <Pressable
      onPress={onExport}
      disabled={exporting}
      className="mb-3 mt-1 flex-row items-center justify-center gap-1.5 rounded-[14px] border border-line bg-surface py-3.5 dark:border-line-dark dark:bg-surface-dark"
      accessibilityRole="button"
      accessibilityLabel={exportLabel}
    >
      {exporting ? (
        <ActivityIndicator color="#7B7366" />
      ) : (
        <>
          <MaterialIcons name="download" size={18} color="#5C5448" />
          <Text className="text-sm font-medium text-ink dark:text-ink-dark">
            {exportLabel}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="mb-2 mt-6 text-lg font-bold text-ink dark:text-ink-dark">
      {children}
    </Text>
  );
}

function P({ children }: { children: string }) {
  return (
    <Text className="mb-3 text-sm leading-5 text-ink dark:text-muted-dark">
      {children}
    </Text>
  );
}

function Bullet({ children }: { children: string }) {
  return (
    <Text className="mb-1 ml-4 text-sm leading-5 text-ink dark:text-muted-dark">
      • {children}
    </Text>
  );
}

function PolicyKo({ onExport, exporting, exportLabel }: PolicyProps) {
  return (
    <View>
      <Text className="text-2xl font-bold text-ink dark:text-ink-dark">
        개인정보처리방침
      </Text>
      <Text className="mt-1 text-xs text-muted">시행일: {EFFECTIVE_DATE}</Text>

      <SectionTitle>개인정보처리자</SectionTitle>
      <P>{`본 서비스의 개인정보처리자는 ${PROVIDER_KO.name} (${PROVIDER_KO.representative})이며, 개인정보 보호책임자도 동일합니다. 사업자등록번호·주소 등 상세 사업자 정보는 설정 → 사업자 정보에서 확인하실 수 있습니다.`}</P>
      <P>{`개인정보 관련 문의: ${PROVIDER_KO.email}`}</P>

      <SectionTitle>1. 수집하는 정보</SectionTitle>
      <P>MoaVoca(이하 "앱")는 서비스 제공을 위해 아래 정보를 수집합니다.</P>
      <Bullet>이메일 주소: 계정 등록 및 로그인 시 수집 (선택 사항)</Bullet>
      <Bullet>비밀번호: 이메일 계정 인증 목적으로 수집되며, Supabase Auth에 단방향 솔티드 해시(salted hash) 형태로만 저장되어 운영자도 원문을 확인할 수 없습니다</Bullet>
      <Bullet>Google 프로필 정보: Google 로그인 시 이메일 주소와 이름이 수집됩니다 (선택 사항)</Bullet>
      <Bullet>Apple 계정 정보: Apple 로그인 시 Apple ID에 연결된 이메일 주소와 이름이 수집됩니다 (선택 사항). "Hide My Email" 사용 시 Apple이 생성한 익명 릴레이 주소만 전달받으며, 사용자의 실제 이메일 주소는 알 수 없습니다.</Bullet>
      <Bullet>표시 이름(닉네임): 친구·공유 기능에서 다른 사용자에게 노출되는 이름. 사용자가 직접 설정합니다.</Bullet>
      <Bullet>아바타 선택: 운영자가 제공하는 미리 만들어진 아바타 세트 또는 자동 생성된 이니셜 중에서 선택한 정보. 임의 사진 업로드 기능은 제공하지 않습니다.</Bullet>
      <Bullet>언어 설정: 모국어, 원서 언어, 번역 언어</Bullet>
      <Bullet>단어장 정보: 단어장 이름, 저장한 단어 및 AI 생성 정의</Bullet>
      <Bullet>공유 단어장: 사용자가 다른 이용자가 볼 수 있도록 공유한 단어장 (이름, 설명, 단어 구성)</Bullet>
      <Bullet>친구 관계: 사용자가 추가/수락/차단한 다른 이용자 목록</Bullet>
      <Bullet>기기 언어: 앱 초기 언어 설정을 위해 1회 확인 (서버 전송 없음)</Bullet>
      <Bullet>카메라/사진: 이미지 단어 추출 기능 사용 시 촬영하거나 선택한 이미지가 AI 처리를 위해 서버로 전송됩니다. 이미지는 처리 후 즉시 삭제되며 서버에 저장되지 않습니다.</Bullet>
      <Bullet>마이크/음성: 음성 검색 기능 사용 시 마이크 입력이 기기 운영체제(Apple/Google)의 음성 인식 서비스로 전달되어 텍스트로 변환됩니다. 변환된 텍스트만 단어 검색에 사용되며, 음성 데이터 자체는 앱 서버로 전송·저장되지 않습니다.</Bullet>
      <Bullet>알림: 학습 리마인더(전체 일일 알림, 주간 요약, 단어장별 요일/시각 알림)를 발송하기 위해 알림 권한이 사용됩니다. 모든 알림은 기기에 로컬로 예약되며 외부 서버로 데이터가 전송되지 않습니다. 단어장별 알림 설정(요일/시각)은 클라우드 동기화를 위해 서버에도 저장됩니다.</Bullet>
      <Bullet>거주 국가/시간대: 온보딩 시 선택한 거주 국가와 그에 대응하는 시간대가 저장됩니다. 월간 사용량 한도 산정 및 알림 시각 등에 사용됩니다. 설정에서 월 1회 변경 가능합니다.</Bullet>
      <Bullet>학습 진도: 단어장별 복습 횟수, 다음 복습 예정일, 연속 학습 일수(스트릭) 등 학습 데이터가 기기와 서버에 저장됩니다.</Bullet>
      <Bullet>API 사용 기록: 단어 검색 횟수, 응답 시간, 비용 (서비스 운영 목적)</Bullet>
      <Bullet>구독 상태: 프리미엄 구독 여부 및 관련 거래 정보</Bullet>

      <SectionTitle>2. 수집하지 않는 정보</SectionTitle>
      <Bullet>전화번호 등 추가 개인 식별 정보</Bullet>
      <Bullet>위치 정보(GPS) 및 정밀 위치</Bullet>
      <Bullet>연락처, 캘린더, 건강 데이터</Bullet>
      <Bullet>결제 카드 정보 (결제는 Apple/Google을 통해 처리됩니다)</Bullet>
      <Bullet>광고 추적 정보 (단, Google AdMob이 자체적으로 수집하는 정보는 Google 정책을 따릅니다)</Bullet>

      <SectionTitle>3. 정보의 저장 위치</SectionTitle>
      <P>단어장과 단어 데이터는 기기 내부(SQLite)에 저장됩니다. 언어 설정은 기기 내부 저장소(AsyncStorage)에 보관됩니다.</P>
      <P>회원가입한 사용자의 경우, 클라우드 백업 및 동기화를 위해 단어장 데이터가 서버(Supabase)에 암호화 전송 후 저장됩니다.</P>
      <P>단어 검색 시 AI 처리를 위해 서버(Supabase)를 경유하며, 검색 결과는 서비스 품질 향상을 위해 익명 캐시로 저장될 수 있습니다.</P>

      <SectionTitle>4. 제3자 제공</SectionTitle>
      <P>앱은 서비스 제공을 위해 아래 외부 서비스를 이용합니다.</P>
      <Bullet>OpenAI: 검색한 단어와 언어쌍 정보가 전달됩니다. 이미지 단어 추출 기능 사용 시 이미지가 함께 전송됩니다. 사용자 식별 정보는 전송되지 않습니다.</Bullet>
      <Bullet>Microsoft Azure (Cognitive Services - Speech): 발음 듣기(TTS) 기능 사용 시 단어 또는 예문 텍스트가 Azure Neural TTS 서비스로 전달되어 음성으로 합성됩니다. 사용자 식별 정보는 전송되지 않으며, 생성된 음성은 익명 캐시로 저장됩니다.</Bullet>
      <Bullet>Supabase: 인증, 데이터베이스, 클라우드 동기화, TTS 음성 캐시 및 API 호스팅 서비스 제공</Bullet>
      <Bullet>RevenueCat: 구독 결제 처리 및 구독 상태 관리. 익명 사용자 ID와 구독 정보만 전달됩니다.</Bullet>
      <Bullet>Free Dictionary API: 영어 단어 검색 실패 시 대체 사전 (단어만 전송)</Bullet>
      <Bullet>Google AdMob: 무료 사용자에게 앱 내 광고를 표시합니다. AdMob은 Google 개인정보처리방침에 따라 기기 식별자 및 광고 상호작용 데이터를 수집할 수 있습니다. 프리미엄 사용자에게는 광고가 표시되지 않습니다.</Bullet>
      <Bullet>Apple (Sign in with Apple): Apple 로그인 시 Apple이 인증을 처리하고, 사용자가 동의한 정보(이메일, 이름)만 앱으로 전달됩니다. "Hide My Email" 선택 시 Apple이 익명 릴레이 주소를 생성하여 전달합니다.</Bullet>
      <Bullet>Google (Google Sign-In): Google 로그인 시 Google이 인증을 처리하고, 이메일과 프로필 정보가 전달됩니다.</Bullet>
      <Bullet>Sentry: 앱 오류 모니터링 서비스. 오류 발생 시 기기 정보와 오류 로그가 전송될 수 있으며, 개인 식별 정보는 포함되지 않습니다.</Bullet>
      <P>분석 도구, 소셜 미디어 등에 데이터를 공유하지 않습니다.</P>

      <SectionTitle>5. 음성 합성(TTS)</SectionTitle>
      <P>발음 듣기 기능은 Microsoft Azure Neural TTS 서비스를 사용하여 음성을 합성합니다. 단어 또는 예문 텍스트가 Supabase 서버를 경유하여 Azure로 전달되며, 합성된 음성 파일은 Supabase 저장소에 익명 캐시로 보관되어 동일한 단어를 다시 요청할 때 재사용됩니다. 사용자 식별 정보는 음성 합성 요청에 포함되지 않습니다.</P>

      <SectionTitle>6. 음성 인식</SectionTitle>
      <P>단어 검색 화면에서 마이크 버튼으로 음성 입력을 사용할 수 있습니다. 음성은 운영체제가 제공하는 음성 인식 서비스(iOS Speech, Google Speech)에서 처리되며, Apple/Google의 개인정보처리방침이 적용될 수 있습니다. 앱은 인식 결과 텍스트만 받아 검색에 사용하고, 음성 데이터를 별도로 저장하거나 외부로 전송하지 않습니다.</P>

      <SectionTitle>7. 푸시 알림</SectionTitle>
      <P>일일 학습 리마인더, 주간 학습 요약, 단어장별 알림 등은 모두 기기에 로컬로 예약되어 표시되는 알림이며, 외부 서버에서 발송되거나 사용자 행동을 추적하지 않습니다. 단어장별 알림은 사용자가 직접 요일과 시각을 선택할 수 있고, 알림은 설정에서 언제든 비활성화할 수 있습니다.</P>

      <SectionTitle>8. 단어장 내보내기</SectionTitle>
      <P>프리미엄 사용자는 단어장을 CSV 파일로 내보낼 수 있습니다. 파일은 기기 내에서 생성되어 운영체제의 공유 시트(이메일, 메시지, 클라우드 드라이브 등)를 통해 사용자가 직접 선택한 곳으로 전달됩니다. 내보내기 과정에서 앱 서버로 추가 데이터가 전송되지 않습니다.</P>

      <SectionTitle>9. 공개 콘텐츠 및 단어장 공유</SectionTitle>
      <P>이용자가 단어장을 공유 기능을 통해 공개하면, 해당 단어장의 이름·설명·단어 구성과 게시한 사용자의 표시 이름·아바타가 다른 모든 이용자에게 표시됩니다. 공유 단어장은 *공개 정보*로 취급되며, 검색·열람·다운로드의 대상이 됩니다.</P>
      <P>사용자는 언제든 공유를 해제하거나 콘텐츠를 삭제할 수 있습니다. 다만 다른 이용자가 이미 다운로드하거나 자신의 단어장에 복사한 콘텐츠는 *그 이용자의 사본*에서 자동 삭제되지 않을 수 있습니다.</P>
      <P>운영자는 부적절한 공개 콘텐츠를 사전 통지 없이 비공개·삭제할 수 있으며, 신고 시스템을 통해 사용자가 부적절한 콘텐츠를 알릴 수 있습니다. 자세한 콘텐츠 정책은 이용약관을 참고하세요.</P>

      <SectionTitle>10. 친구 시스템</SectionTitle>
      <P>친구로 등록된 다른 이용자에게는 사용자의 표시 이름, 아바타, 학습 통계(학습 일수, 누적 단어 수 등), 공유 단어장이 표시될 수 있습니다. 구체적 공개 범위는 앱 내 설정에서 확인하고 조정할 수 있습니다.</P>
      <P>친구 추가는 양방향 동의로 성립하며, 친구 관계는 언제든 해제하거나 차단할 수 있습니다. 차단한 사용자에게는 사용자의 콘텐츠가 더 이상 표시되지 않습니다.</P>
      <P>친구 관계 정보는 서버에 암호화 저장되며, 친구 본인이 아닌 제3자에게는 공개되지 않습니다.</P>

      <SectionTitle>11. 프로필 및 아바타</SectionTitle>
      <P>이용자의 프로필 아바타는 운영자가 제공하는 미리 만들어진 세트 또는 자동 생성된 이니셜로만 설정할 수 있습니다. 사용자가 임의로 사진·이미지를 업로드하는 기능은 제공하지 않습니다(부적절한 콘텐츠 위험 방지 목적).</P>
      <P>표시 이름과 아바타는 다른 사용자가 볼 수 있는 *공개 정보*입니다. 친구·공유·게시판 등 사회적 기능 영역에서 노출됩니다.</P>

      <SectionTitle>12. 광고 식별자 (iOS ATT / Android GAID)</SectionTitle>
      <P>iOS에서는 처음 앱 실행 시 광고 식별자(IDFA) 사용 동의를 묻는 시스템 팝업이 표시될 수 있습니다. Android에서는 Google 광고 ID(GAID)가 사용되며, 기기 설정에서 광고 개인화를 제한하거나 광고 ID를 재설정할 수 있습니다. 동의/허용 여부는 광고 개인화 정도에만 영향을 미치며, 거부하더라도 앱의 기본 기능 사용에는 제한이 없습니다. 유럽(GDPR) 및 캘리포니아(CCPA) 지역 사용자에게는 별도의 광고 개인정보 동의 화면이 표시됩니다.</P>

      <SectionTitle>13. 처리 목적별 보관 기간</SectionTitle>
      <P>운영자는 개인정보보호법 제15조에 따라 수집한 개인정보를 아래 목적·기간 내에서만 처리합니다.</P>
      <Bullet>학습 기능 제공(단어장·진도·언어 설정 등): 회원 탈퇴 시까지</Bullet>
      <Bullet>계정 인증(이메일, 비밀번호 해시, OAuth 식별자): 회원 탈퇴 시까지</Bullet>
      <Bullet>친구·커뮤니티 기능(표시 이름, 친구 관계, 공유 단어장): 사용자가 삭제하거나 탈퇴 시까지</Bullet>
      <Bullet>부정 이용 방지·API 사용 기록: 90일</Bullet>
      <Bullet>결제·정산 거래 기록: 부가가치세법·소득세법·전자상거래법 등에 따라 5년 보관 후 파기. 보관 기간 중 개인 식별 정보는 가명·비식별화 처리</Bullet>
      <Bullet>개인 맞춤형 광고 식별자(IDFA/GAID): 동의 시점부터 광고 네트워크 정책상 최대 2년</Bullet>
      <Bullet>오류·진단 로그(Sentry): 90일</Bullet>

      <SectionTitle>14. 데이터 보관 및 삭제</SectionTitle>
      <P>기기에 저장된 단어장 데이터는 앱 삭제 시 함께 삭제됩니다. 설정 화면의 "초기화" 기능을 통해 언제든 기기 내 모든 데이터를 삭제할 수 있습니다.</P>
      <P>계정을 등록한 사용자는 설정 화면에서 계정 삭제를 요청할 수 있으며, 운영자는 본인 확인 후 30일 이내에 서버에 저장된 이메일, OAuth 식별자, 단어장 데이터, 학습 진도, 표시 이름, 친구 관계, 공유 단어장, 푸시 토큰, 알림 설정 등 모든 정보를 영구 삭제합니다. 통상 즉시 또는 수 분 내 처리되나 백업·복구 사이클 등 기술적 사유로 최대 30일이 소요될 수 있습니다.</P>
      <P>구독 해지 후에도 서버 데이터는 계정 삭제를 요청할 때까지 보관됩니다. 결제·정산 관련 거래 기록은 위 §13에 따라 별도 보관됩니다.</P>

      <SectionTitle>15. 개인정보의 국외이전</SectionTitle>
      <P>본 서비스는 §4에 열거된 외부 서비스를 이용하는 과정에서 사용자의 개인정보를 대한민국 외 국가로 이전합니다(개인정보보호법 제28조의8 고지 사항).</P>
      <Bullet>이전받는 자: §4에 명시된 처리 위탁업체(Supabase, OpenAI, Microsoft Azure, Apple, Google, RevenueCat, Sentry, AWS, freedictionaryapi.com 등)</Bullet>
      <Bullet>이전되는 국가: 주로 미국. Azure는 East US 또는 가장 가까운 Azure 리전</Bullet>
      <Bullet>이전 시점·방법: 사용자가 해당 기능을 이용하는 시점에 HTTPS/TLS 암호화 통신을 통해 지속적으로 이전</Bullet>
      <Bullet>이전 항목: 위탁업체별로 §4에 기재된 항목 범위 내</Bullet>
      <Bullet>이전 목적: §4의 각 위탁업체 목적란에 기재</Bullet>
      <Bullet>이전받는 자의 보관 기간: 각 위탁업체의 자체 보관 정책에 따르며, 운영자는 삭제 요청을 위탁업체에 전달합니다</Bullet>
      <P>이용자는 회원가입을 하지 않음으로써 국외이전을 거부할 수 있으며, 이 경우에도 앱의 오프라인 학습 기능은 이용 가능합니다. 이미 가입한 사용자는 §16의 절차에 따라 계정 삭제 또는 동의 철회를 요청할 수 있습니다.</P>

      <SectionTitle>16. 정보주체의 권리</SectionTitle>
      <P>거주 지역에 관계없이 사용자는 자신의 개인정보에 대해 아래 권리를 행사할 수 있습니다(개인정보보호법 제35조 이하, GDPR 제15-22조, CCPA §1798.100 이하).</P>
      <Bullet>열람권 — 운영자가 보유한 본인의 개인정보 사본 요청</Bullet>
      <Bullet>정정·삭제권 — 부정확한 정보의 정정 또는 삭제 요청. 계정 삭제는 설정 → 계정 → 계정 삭제 메뉴 또는 이메일 요청</Bullet>
      <Bullet>처리정지권 — 처리에 대한 일시적 또는 영구적 정지 요청</Bullet>
      <Bullet>이동권 — 본인이 제공한 데이터를 기계 판독 가능한 형식으로 받을 권리. 프리미엄 사용자는 앱 내에서 단어장을 CSV로 내보낼 수 있으며, 전체 계정 데이터의 JSON 내보내기는 아래 버튼으로 즉시 받거나 이메일 요청 시 30일 이내에 제공합니다</Bullet>
      <ExportButton onExport={onExport} exporting={exporting} exportLabel={exportLabel} />
      <Bullet>동의 철회권 — 이미 처리된 부분에 영향을 주지 않는 범위에서 언제든 동의 철회</Bullet>
      <Bullet>자동화된 결정 거부권 — 운영자는 사용자에 대해 자동화된 의사결정만으로 법적 효과를 야기하는 처리는 하지 않습니다</Bullet>
      <P>{`권리 행사 방법: 앱 내 설정에서 가능한 경우 직접 처리하거나, ${PROVIDER_KO.email}로 본인 확인이 가능한 정보와 함께 이메일을 보내주시면 통상 30일 이내에 답변드립니다. 행사 거부 시 그 사유와 이의 제기 방법을 함께 통지합니다.`}</P>
      <P>개인정보 처리에 관한 불만은 개인정보보호위원회(privacy.go.kr) 및 한국인터넷진흥원(KISA) 개인정보침해신고센터(privacy.kisa.or.kr · ☎ 118)에 신고할 수 있습니다. EU 거주자는 거주국 감독기관에, 영국 거주자는 ICO에, 캘리포니아 거주자는 CCPA 권리를 행사할 수 있습니다.</P>

      <SectionTitle>17. 보안 조치 및 침해 통지</SectionTitle>
      <P>운영자는 개인정보 보호를 위해 다음과 같은 기술적·관리적 보호 조치를 시행합니다.</P>
      <Bullet>모든 서버 통신은 TLS 1.2 이상으로 암호화</Bullet>
      <Bullet>인증 토큰은 iOS Keychain 또는 Android EncryptedSharedPreferences에 저장. 평문 AsyncStorage 저장 금지</Bullet>
      <Bullet>서비스 권한 키는 서버 외부로 반출 금지</Bullet>
      <Bullet>정기적인 보안 감사 및 보안 패치 적용(최근 감사: 2026년 5월)</Bullet>
      <P>중대한 개인정보 침해 사고가 발생한 경우, 운영자는 관련 법령(개인정보보호법 제34조, GDPR 제33-34조, CCPA §1798.82)에 따라 인지 후 부당한 지체 없이 사용자 및 감독기관에 통지하며, 법령상 요구되는 경우 72시간 이내에 통지합니다.</P>

      <SectionTitle>18. 계정 및 인증</SectionTitle>
      <P>앱은 회원가입 없이 제한된 익명 모드로 사용할 수 있습니다. 클라우드 동기화, 친구·커뮤니티, 프리미엄 기능 이용을 위해서는 이메일·Google·Apple 계정으로 로그인이 필요합니다.</P>
      <P>이메일 계정 등록 시 이메일 인증을 통해 본인 확인을 진행합니다. 비밀번호는 Supabase Auth에 단방향 솔티드 해시(salted hash)로만 저장되며, 운영자가 원문을 확인할 수 없습니다.</P>
      <P>Google 로그인 시 Google 계정의 이메일 주소와 프로필 정보(이름)가 수집됩니다. Google 계정의 비밀번호는 앱에서 처리하지 않습니다.</P>
      <P>Apple 로그인 시 Apple ID에 연결된 이메일 주소와 이름이 수집됩니다. "Hide My Email"을 선택하면 Apple이 익명 릴레이 주소를 생성하여 전달하며, 운영자는 사용자의 실제 이메일을 알 수 없습니다. Apple 계정의 비밀번호 및 인증 절차는 Apple이 처리하며 앱에서 직접 다루지 않습니다.</P>

      <SectionTitle>19. EU/UK 대리인</SectionTitle>
      <P>현재까지 운영자는 GDPR 제27조 EU/UK 대리인을 별도 지정하고 있지 않습니다. EU·영국 거주 정보주체는 운영자에게 직접 연락할 수 있으며, 별도 대리인 지정을 요청하시면 합리적인 기간 내에 지정하여 안내드립니다.</P>

      <SectionTitle>20. 아동 개인정보 보호</SectionTitle>
      <P>본 앱은 App Store 12+, Google Play Teen 등급으로 만 14세 미만 아동을 대상으로 하지 않습니다. 운영자는 만 14세 미만(개인정보보호법·정보통신망법 기준) 및 만 13세 미만(미국 COPPA 기준)의 가입·이용을 허용하지 않으며, 해당 사실이 확인되는 경우 관련 개인정보를 즉시 삭제합니다. 아동의 개인정보가 수집된 사실을 알게 된 경우 즉시 {PROVIDER_KO.email}로 연락해 주시기 바랍니다.</P>

      <SectionTitle>21. 변경 사항 고지</SectionTitle>
      <P>개인정보처리방침이 변경될 경우, 앱 내 공지를 통해 사전에 안내합니다.</P>

      <SectionTitle>22. 문의</SectionTitle>
      <P>개인정보와 관련한 문의는 이메일로 보내주시면 답변드리겠습니다.</P>
      <P>{`이메일: ${PROVIDER_KO.email}`}</P>
    </View>
  );
}

function PolicyEn({ onExport, exporting, exportLabel }: PolicyProps) {
  return (
    <View>
      <Text className="text-2xl font-bold text-ink dark:text-ink-dark">
        Privacy Policy
      </Text>
      <Text className="mt-1 text-xs text-muted">Effective: {EFFECTIVE_DATE}</Text>

      <SectionTitle>Data Controller</SectionTitle>
      <P>{`The data controller for this service is ${PROVIDER_EN.name} (${PROVIDER_EN.representative}), who also serves as the Privacy Officer. Full business registration details (registration number, address, mail-order registration) are available under Settings → Business Information.`}</P>
      <P>{`Privacy inquiries: ${PROVIDER_EN.email}`}</P>

      <SectionTitle>1. Information We Collect</SectionTitle>
      <P>MoaVoca ("the App") collects the following information to provide its services.</P>
      <Bullet>Email address: collected when you register an account (optional)</Bullet>
      <Bullet>Password: collected for email account authentication and stored only as a one-way salted hash on Supabase Auth — we cannot view the plaintext password</Bullet>
      <Bullet>Google profile information: email address and name are collected when signing in with Google (optional)</Bullet>
      <Bullet>Apple account information: email address and name linked to your Apple ID are collected when signing in with Apple (optional). If you choose "Hide My Email", only an Apple-generated anonymous relay address is passed to us — we cannot see your real email address.</Bullet>
      <Bullet>Display name (nickname): the name shown to other users in friend and sharing features. Set by you.</Bullet>
      <Bullet>Avatar selection: an avatar chosen from a Provider-supplied predefined set or auto-generated initials. Custom photo upload is not supported.</Bullet>
      <Bullet>Language settings: native language, source language, target language</Bullet>
      <Bullet>Wordlist data: list names, saved words, and AI-generated definitions</Bullet>
      <Bullet>Shared wordlists: wordlists you share so other users can view them (name, description, word selection)</Bullet>
      <Bullet>Friend relationships: list of other users you have added, accepted, or blocked</Bullet>
      <Bullet>Device language: checked once for initial UI language (not sent to servers)</Bullet>
      <Bullet>Camera/Photos: When using the image word extraction feature, captured or selected images are sent to our server for AI processing. Images are deleted immediately after processing and are not stored on our servers.</Bullet>
      <Bullet>Microphone/Voice: When using voice search, microphone input is forwarded to your operating system's speech recognition service (Apple/Google) for conversion to text. Only the transcribed text is used for word lookup; the audio itself is not transmitted to or stored on our servers.</Bullet>
      <Bullet>Notifications: Notification permission is used for learning reminders (daily reminders, weekly recap, and per-wordlist reminders with day-of-week and time selection). All notifications are scheduled locally on your device — no notification data is sent to external servers. Per-wordlist notification settings are also stored on the server for cloud sync.</Bullet>
      <Bullet>Country/Timezone: The country and matching timezone you select during onboarding are stored. They are used for monthly usage limit calculations, notification timing, and similar features. You can change your region once per month from Settings.</Bullet>
      <Bullet>Learning progress: Per-wordlist review counts, next-review dates, and consecutive learning days (streak) are stored on your device and on the server.</Bullet>
      <Bullet>API usage logs: lookup counts, response times, and costs (for service operations)</Bullet>
      <Bullet>Subscription status: premium subscription state and related transaction information</Bullet>

      <SectionTitle>2. Information We Do Not Collect</SectionTitle>
      <Bullet>Additional personal identifiers such as phone number</Bullet>
      <Bullet>GPS or precise location data</Bullet>
      <Bullet>Contacts, calendar, or health data</Bullet>
      <Bullet>Payment card information (payments are processed through Apple/Google)</Bullet>
      <Bullet>Advertising or tracking identifiers (however, Google AdMob may collect such data per Google's own privacy policy)</Bullet>

      <SectionTitle>3. Where Data Is Stored</SectionTitle>
      <P>Wordlists and vocabulary data are stored locally on your device (SQLite). Language settings are kept in on-device storage (AsyncStorage).</P>
      <P>For registered users, wordlist data is securely transmitted and stored on our server (Supabase) for cloud backup and cross-device sync.</P>
      <P>When you look up a word, the request is processed through our server (Supabase) for AI processing. Results may be stored in an anonymous cache to improve service quality.</P>

      <SectionTitle>4. Third-Party Services</SectionTitle>
      <P>The App uses the following external services to provide its functionality.</P>
      <Bullet>OpenAI: The searched word and language pair are sent. When using image word extraction, images are also transmitted. No user identification is transmitted.</Bullet>
      <Bullet>Microsoft Azure (Cognitive Services - Speech): When you use the pronunciation (TTS) feature, the word or example sentence text is sent to Azure Neural TTS for speech synthesis. No user identification is transmitted; the synthesized audio is stored in an anonymous cache.</Bullet>
      <Bullet>Supabase: Provides authentication, database, cloud sync, TTS audio caching, and API hosting</Bullet>
      <Bullet>RevenueCat: Handles subscription payment processing and subscription state management. Only an anonymous user ID and subscription information are shared.</Bullet>
      <Bullet>Free Dictionary API: Fallback dictionary for English lookups (only the word is sent)</Bullet>
      <Bullet>Google AdMob: Displays advertisements to free-tier users. AdMob may collect device identifiers and ad interaction data in accordance with Google's privacy policy. Premium users do not see ads.</Bullet>
      <Bullet>Apple (Sign in with Apple): When you sign in with Apple, Apple handles authentication and only the information you consent to share (email, name) is passed to the App. If you select "Hide My Email", Apple generates an anonymous relay address that is shared with us instead of your real email.</Bullet>
      <Bullet>Google (Google Sign-In): When you sign in with Google, Google handles authentication and your email and profile information are passed to the App.</Bullet>
      <Bullet>Sentry: Error monitoring service. Device information and error logs may be transmitted when errors occur; no personal identifiers are included.</Bullet>
      <P>We do not share data with analytics tools or social media platforms.</P>

      <SectionTitle>5. Text-to-Speech (TTS)</SectionTitle>
      <P>The pronunciation feature uses Microsoft Azure Neural TTS for speech synthesis. The word or example sentence text is routed through our Supabase server to Azure, and the synthesized audio file is stored in an anonymous cache on Supabase storage so that subsequent requests for the same text reuse the cached audio. No user identification is included in TTS synthesis requests.</P>

      <SectionTitle>6. Speech Recognition</SectionTitle>
      <P>The microphone button on the word lookup screen lets you dictate a word instead of typing. Audio is processed by your operating system's speech recognition service (iOS Speech, Google Speech) and the corresponding privacy policies of Apple/Google may apply. Our app receives only the transcribed text and uses it for lookup; raw audio is not stored or transmitted by us.</P>

      <SectionTitle>7. Push Notifications</SectionTitle>
      <P>Daily learning reminders, weekly recaps, and per-wordlist notifications are all scheduled locally on your device. They are not sent from our servers and do not track user behavior. For per-wordlist notifications, you can pick the days of the week and time. Notifications can be disabled at any time from Settings.</P>

      <SectionTitle>8. Wordlist Export</SectionTitle>
      <P>Premium users can export wordlists as CSV files. Files are generated on-device and shared via your operating system's share sheet (email, messaging, cloud drives, etc.) to a destination you choose. No additional data is sent to our servers during export.</P>

      <SectionTitle>9. Public Content and Wordlist Sharing</SectionTitle>
      <P>When you share a wordlist publicly, the wordlist's name, description, word selection, and the posting user's display name and avatar become visible to all other users. Shared wordlists are treated as public information and are subject to discovery, viewing, and download by other users.</P>
      <P>You may unshare or delete content at any time. However, copies that other users have already downloaded or copied into their own wordlists may not be automatically deleted from those copies.</P>
      <P>The Provider may, without prior notice, hide or remove inappropriate public content. Users can flag inappropriate content through the in-app reporting system. See the Terms of Service for the full content policy.</P>

      <SectionTitle>10. Friend System</SectionTitle>
      <P>Users you have added as friends may see your display name, avatar, learning statistics (study days, total words, etc.), and shared wordlists. The exact scope of visibility is shown and adjustable in the in-app settings.</P>
      <P>Friend relationships are formed by mutual consent and may be removed or blocked at any time. After blocking, the blocked user can no longer see your content.</P>
      <P>Friend relationship data is stored encrypted on the server and is not disclosed to third parties other than the friends themselves.</P>

      <SectionTitle>11. Profile and Avatar</SectionTitle>
      <P>Profile avatars may only be set from a Provider-supplied predefined set or as auto-generated initials. Custom photo or image upload is not supported (to prevent the risk of inappropriate content).</P>
      <P>Display names and avatars are public information visible to other users in friend, sharing, and community feature areas.</P>

      <SectionTitle>12. Advertising Identifiers (iOS ATT / Android GAID)</SectionTitle>
      <P>On iOS, the system may show a tracking permission prompt (IDFA) the first time you launch the App. On Android, the Google Advertising ID (GAID) is used; you can limit ad personalization or reset the GAID in your device settings. Your decision affects only ad personalization — declining does not restrict the app's core functionality. Users in the EU (GDPR) and California (CCPA) will see a separate ad consent screen.</P>

      <SectionTitle>13. Retention by Processing Purpose</SectionTitle>
      <P>We process personal data only for the purposes and retention periods set out below (Korean PIPA Article 15; GDPR Article 13(2)(a)).</P>
      <Bullet>Provide learning features (wordlists, study progress, language settings): until account deletion</Bullet>
      <Bullet>Account authentication (email, password hash, OAuth identifiers): until account deletion</Bullet>
      <Bullet>Friend & community features (display name, friend graph, public wordlists): until you remove the content or delete the account</Bullet>
      <Bullet>Abuse prevention and API usage logs: 90 days</Bullet>
      <Bullet>Subscription billing records: 5 years, per Korean VAT, income-tax, and e-commerce-consumer-protection law; personal identifiers in those records are pseudonymized or de-identified</Bullet>
      <Bullet>Personalized advertising identifiers (IDFA/GAID): per the ad network's policy, up to 2 years from consent</Bullet>
      <Bullet>Crash and diagnostic logs (Sentry): 90 days</Bullet>

      <SectionTitle>14. Data Storage and Deletion</SectionTitle>
      <P>Locally stored wordlist data is deleted when you uninstall the app. You can also delete all on-device data at any time using the "Reset" option in Settings.</P>
      <P>If you have registered an account, you can request account deletion from the Settings screen or by email. After verifying your identity, we will permanently delete all server-stored data (email, OAuth identifiers, wordlist data, learning progress, display name, friend graph, shared wordlists, push tokens, notification settings) within 30 days. In most cases the deletion completes immediately or within minutes; technical reasons such as backup-rotation cycles may take up to 30 days.</P>
      <P>Server data is retained after subscription cancellation until you request account deletion. Payment- and settlement-related transaction records are retained separately under §13.</P>

      <SectionTitle>15. International Data Transfers</SectionTitle>
      <P>Some processors listed in §4 process personal data outside the Republic of Korea (Korean PIPA Article 28-8 disclosure).</P>
      <Bullet>Recipients: the processors listed in §4 (Supabase, OpenAI, Microsoft Azure, Apple, Google, RevenueCat, Sentry, AWS, freedictionaryapi.com, etc.)</Bullet>
      <Bullet>Recipient country: primarily the United States; Azure may use East US or the nearest Azure region</Bullet>
      <Bullet>Time and method of transfer: continuously, via encrypted HTTPS/TLS, at the time the relevant feature is used</Bullet>
      <Bullet>Categories of data: as detailed per processor in §4</Bullet>
      <Bullet>Purpose: as detailed per processor in §4</Bullet>
      <Bullet>Retention by recipients: per each processor's own policy; we instruct them to delete on request</Bullet>
      <P>You may decline the overseas transfer of your personal data by not creating an account — the App's offline learning features remain usable without sign-up. If you have already created an account and wish to withdraw consent, use the account-deletion process described in §16.</P>

      <SectionTitle>16. Your Rights</SectionTitle>
      <P>Regardless of where you live, you have the following rights over your personal data (Korean PIPA Articles 35–37; GDPR Articles 15–22; CCPA §§1798.100 et seq.).</P>
      <Bullet>Right of access — request a copy of the personal data we hold about you</Bullet>
      <Bullet>Right to correction / deletion — correct inaccurate data or request erasure. In-app: Settings → Account → Delete Account. By email: a request from your registered address</Bullet>
      <Bullet>Right to restriction of processing</Bullet>
      <Bullet>Right to data portability — receive your data in a machine-readable format. Premium users can export wordlists as CSV in-app; a full JSON export of all account data is available instantly via the button below, or by email request within 30 days</Bullet>
      <ExportButton onExport={onExport} exporting={exporting} exportLabel={exportLabel} />
      <Bullet>Right to withdraw consent at any time, without affecting prior processing</Bullet>
      <Bullet>No solely automated decision-making — we do not make decisions producing legal effects on you based solely on automated processing</Bullet>
      <P>{`How to exercise: where available, use the in-app controls; otherwise email ${PROVIDER_EN.email} with sufficient information to verify your identity. We respond within 30 days. If we decline, we will explain why and how to appeal.`}</P>
      <P>You may also lodge a complaint with your data-protection authority: the Personal Information Protection Commission of Korea (privacy.go.kr) and KISA (privacy.kisa.or.kr, ☎ 118) for Korea; your national supervisory authority for the EU; the ICO for the UK; or exercise CCPA rights as a California resident.</P>

      <SectionTitle>17. Security Measures and Breach Notification</SectionTitle>
      <P>We implement the following technical and organizational safeguards.</P>
      <Bullet>All server connections use TLS 1.2 or higher</Bullet>
      <Bullet>Authentication tokens are stored in iOS Keychain or Android EncryptedSharedPreferences — never plaintext AsyncStorage</Bullet>
      <Bullet>Service-role keys never leave the server</Bullet>
      <Bullet>Periodic security audits and prompt hardening updates (latest audit: May 2026)</Bullet>
      <P>In the event of a personal-data breach, we will notify affected users and the relevant supervisory authority without undue delay, and within 72 hours where required by applicable law (Korean PIPA Article 34; GDPR Articles 33–34; CCPA §1798.82).</P>

      <SectionTitle>18. Accounts and Authentication</SectionTitle>
      <P>The App can be used without an account in a limited anonymous mode. For cloud sync, friends/community, and premium features, you sign in with email + password, Apple Sign In, or Google Sign-In.</P>
      <P>Email verification is required during email registration. Passwords are stored only as one-way salted hashes on Supabase Auth and cannot be viewed by the Provider.</P>
      <P>When signing in with Google, your Google account email address and profile information (name) are collected. Your Google password is not processed by the App.</P>
      <P>When signing in with Apple, the email address and name linked to your Apple ID are collected. If you choose "Hide My Email", Apple generates an anonymous relay address that is provided to us instead of your real email — we cannot see your real email address. Apple handles password and authentication.</P>

      <SectionTitle>19. EU / UK Representative</SectionTitle>
      <P>The Provider has not currently designated a GDPR Article 27 representative in the EU or UK. EU and UK data subjects may contact us directly at the email below; on reasonable request we will appoint a representative within a reasonable period for your jurisdiction.</P>

      <SectionTitle>20. Children's Privacy</SectionTitle>
      <P>The App is rated 12+ on the App Store and Teen on Google Play and is not directed at children. The Service is not available to children under 14 (per Korean PIPA / 정보통신망법) or under 13 (per US COPPA). If we become aware of personal information collected from a child below the applicable age, we will delete it promptly. Please contact us at {PROVIDER_EN.email} if you believe a child has provided personal data.</P>

      <SectionTitle>21. Changes to This Policy</SectionTitle>
      <P>If this Privacy Policy is updated, we will notify you through an in-app notice prior to the changes taking effect.</P>

      <SectionTitle>22. Contact Us</SectionTitle>
      <P>For privacy-related inquiries, please reach out by email.</P>
      <P>{`Email: ${PROVIDER_EN.email}`}</P>
    </View>
  );
}
