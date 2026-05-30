import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { TabletContainer } from '@/components/tablet-container';

const EFFECTIVE_DATE = '2026-05-30';

export default function ProbabilityPolicyScreen() {
  const { t, i18n } = useTranslation();
  const isKo = i18n.language === 'ko';

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
            {t('settings.probability_policy')}
          </Text>
        </View>
        {isKo ? <PolicyKo /> : <PolicyEn />}
      </ScrollView>
      </TabletContainer>
    </SafeAreaView>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="mb-2 mt-6 text-lg font-bold text-ink dark:text-ink-dark">
      {children}
    </Text>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <Text className="mb-3 text-sm leading-5 text-ink dark:text-muted-dark">
      {children}
    </Text>
  );
}

function Row({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <View className="mb-1.5 flex-row items-center justify-between border-b border-line py-1.5 dark:border-line-dark">
      <Text className="text-sm text-ink dark:text-muted-dark">{label}</Text>
      <Text className="text-sm font-bold" style={{ color: tint ?? '#2A2620' }}>{value}</Text>
    </View>
  );
}

function PolicyKo() {
  return (
    <View>
      <Text className="text-2xl font-bold text-ink dark:text-ink-dark">
        미스터리 박스 확률 정책
      </Text>
      <Text className="mt-1 text-xs text-muted">시행일: {EFFECTIVE_DATE}</Text>

      <SectionTitle>1. 미스터리 박스란?</SectionTitle>
      <P>미스터리 박스는 포인트로 구매할 수 있는 랜덤 프로필 캐릭터 아이템입니다. 등급별 확률에 따라 지급되며, 학습 진행이나 능력치에 영향을 주지 않는 순수 코스메틱 요소입니다.</P>
      <P>프로필 배경 색상은 미스터리 박스와 별개로 누구나 무료로 자유롭게 선택할 수 있습니다.</P>

      <SectionTitle>2. 가격</SectionTitle>
      <Row label="미스터리 박스 1회 (랜덤)" value="50 포인트" />
      <Row label="특정 아이템 직접 구매" value="100 포인트" />
      <Row label="중복 시 환급" value="25 포인트" tint="#2EC4A5" />

      <SectionTitle>3. 등급별 확률</SectionTitle>
      <Row label="커먼 (Common)" value="70.0%" />
      <Row label="레어 (Rare)" value="25.0%" />
      <Row label="에픽 (Epic)" value="5.0%" tint="#D9A441" />
      <P>확률은 매 회 독립적으로 적용되며, 직전 결과에 영향을 받지 않습니다(천장 시스템 제외).</P>

      <SectionTitle>4. 천장 시스템</SectionTitle>
      <P>에픽 등급이 50회 연속으로 뽑히지 않은 경우, 51회째 미스터리 박스는 에픽 등급이 확정 지급됩니다. 에픽이 지급되면 카운터는 0으로 초기화됩니다.</P>

      <SectionTitle>5. 중복 환급 정책</SectionTitle>
      <P>미스터리 박스에서 이미 보유 중인 아이템이 뽑힌 경우, 박스 가격의 50%인 25 포인트가 자동으로 환급됩니다.</P>
      <P>직접 구매(100 포인트)로는 보유하지 않은 아이템만 구매할 수 있으며, 보유 중인 아이템 구매 시 결제가 이루어지지 않습니다.</P>

      <SectionTitle>6. 등급별 아이템 개별 확률</SectionTitle>
      <P>각 등급 내부에서는 활성화된 아이템이 동일한 가중치로 추첨됩니다. 카탈로그 변경 시 본 페이지의 시행일도 함께 갱신됩니다. 현재 활성 카탈로그는 앱 내 미스터리 박스 화면에서 확인할 수 있습니다.</P>

      <SectionTitle>7. 미사용 포인트 환불</SectionTitle>
      <P>포인트는 학습·커뮤니티 활동으로 적립되는 무상 인앱 화폐이며, 현금으로 환불되지 않습니다. 본 항목은 한국 콘텐츠산업진흥법 제28조 및 게임산업법상 환불 규정과 무관하게, 무상 포인트의 법적 성격에 따라 적용됩니다.</P>

      <SectionTitle>8. 변경 이력</SectionTitle>
      <P>본 정책의 변경 사항은 시행일과 함께 본 페이지에 게시됩니다. 중요한 변경 시 앱 내 공지가 별도로 안내됩니다.</P>

      <SectionTitle>9. 문의</SectionTitle>
      <P>확률 정책 관련 문의는 support@moavoca.com 으로 보내주시면 답변드리겠습니다.</P>
    </View>
  );
}

function PolicyEn() {
  return (
    <View>
      <Text className="text-2xl font-bold text-ink dark:text-ink-dark">
        Mystery Box Probability Policy
      </Text>
      <Text className="mt-1 text-xs text-muted">Effective: {EFFECTIVE_DATE}</Text>

      <SectionTitle>1. What is a Mystery Box?</SectionTitle>
      <P>A Mystery Box is a random profile-character item purchasable with in-app points. Characters are awarded according to per-tier probabilities. Items are purely cosmetic and do not affect learning progress or gameplay performance.</P>
      <P>Profile background colors are unrelated to the Mystery Box — every active background is free and freely selectable.</P>

      <SectionTitle>2. Pricing</SectionTitle>
      <Row label="1 Mystery Box (random)" value="50 points" />
      <Row label="Direct purchase of a specific item" value="100 points" />
      <Row label="Duplicate refund" value="25 points" tint="#2EC4A5" />

      <SectionTitle>3. Tier probabilities</SectionTitle>
      <Row label="Common" value="70.0%" />
      <Row label="Rare" value="25.0%" />
      <Row label="Epic" value="5.0%" tint="#D9A441" />
      <P>Each pull is independent and is not affected by previous outcomes (except for the pity system below).</P>

      <SectionTitle>4. Pity system</SectionTitle>
      <P>If you do not pull an Epic-tier item across 50 consecutive Mystery Boxes, the 51st pull is guaranteed to be Epic. The counter resets to 0 after every Epic pull.</P>

      <SectionTitle>5. Duplicate refund</SectionTitle>
      <P>If a Mystery Box pull results in an item you already own, 25 points (50% of the box price) are automatically refunded to your balance.</P>
      <P>Direct purchase (100 points) is restricted to items you do not yet own — attempting to buy an owned item will not charge points.</P>

      <SectionTitle>6. Per-item probabilities</SectionTitle>
      <P>Within each tier, all active items are drawn with equal weight. The current active catalog is visible on the in-app Mystery Box screen, and changes to the catalog are reflected by updating the effective date above.</P>

      <SectionTitle>7. Refunds of unused points</SectionTitle>
      <P>Points are an in-app virtual currency earned exclusively through learning and community engagement; they have no cash value and are not redeemable for money.</P>

      <SectionTitle>8. Change log</SectionTitle>
      <P>Changes to this policy are reflected by updating the effective date at the top of this page. Material changes will be additionally announced through in-app notice.</P>

      <SectionTitle>9. Contact</SectionTitle>
      <P>Questions about this policy: support@moavoca.com</P>
    </View>
  );
}
