/**
 * Business information disclosure screen.
 *
 * Required by Korean e-Commerce Act (전자상거래법 제10조) — businesses
 * selling goods/services online must publicly display registration info.
 * Values are hard-coded (constant per registration), labels are i18n'd
 * for non-Korean users.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BUSINESS_INFO = {
  name: '펀스턴',
  representative: '박준성',
  address: '서울특별시 구로구 구로중앙로 207, B1층 B36-S77호 (구로동, 오퍼스1)',
  brn: '774-17-02956',
  // Filled in once 정부24 통신판매업 신고 is processed. Empty string hides
  // the row; per current rules the row is required only after registration
  // and a brief disclosure that registration is pending is acceptable for
  // pre-launch state.
  mailOrderRegistration: '',
  phone: '010-3141-3457',
  email: 'support@typeword.app',
  businessType: '정보통신업 / 응용 소프트웨어 개발 및 공급업',
  hostingProvider: 'Supabase Inc.',
  privacyOfficer: '박준성',
} as const;

export default function BusinessInfoScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 80 }}>
        <View className="mb-2 flex-row items-center">
          <Pressable onPress={() => router.back()} className="mr-2 p-1" accessibilityLabel={t('common.back')}>
            <MaterialIcons name="arrow-back" size={24} color="#6b7280" />
          </Pressable>
          <Text className="text-3xl font-bold text-black dark:text-white">
            {t('business_info.title')}
          </Text>
        </View>
        <Text className="mb-4 text-xs text-gray-500">
          {t('business_info.intro')}
        </Text>

        <Row label={t('business_info.business_name')} value={BUSINESS_INFO.name} />
        <Row label={t('business_info.representative')} value={BUSINESS_INFO.representative} />
        <Row label={t('business_info.address')} value={BUSINESS_INFO.address} />
        <Row label={t('business_info.brn')} value={BUSINESS_INFO.brn} />
        {BUSINESS_INFO.mailOrderRegistration ? (
          <Row label={t('business_info.mail_order_registration')} value={BUSINESS_INFO.mailOrderRegistration} />
        ) : null}
        <Row label={t('business_info.business_type')} value={BUSINESS_INFO.businessType} />
        <Row
          label={t('business_info.phone')}
          value={BUSINESS_INFO.phone}
          onPress={() => Linking.openURL(`tel:${BUSINESS_INFO.phone.replace(/-/g, '')}`)}
        />
        <Row
          label={t('business_info.email')}
          value={BUSINESS_INFO.email}
          onPress={() => Linking.openURL(`mailto:${BUSINESS_INFO.email}`)}
        />
        <Row label={t('business_info.hosting_provider')} value={BUSINESS_INFO.hostingProvider} />
        <Row label={t('business_info.privacy_officer')} value={BUSINESS_INFO.privacyOfficer} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  const content = (
    <View className="border-b border-gray-200 py-3 dark:border-gray-800">
      <Text className="text-xs uppercase tracking-wider text-gray-500">{label}</Text>
      <Text
        className={`mt-1 text-base ${
          onPress ? 'text-emerald-600 underline dark:text-emerald-400' : 'text-black dark:text-white'
        }`}
      >
        {value}
      </Text>
    </View>
  );
  if (onPress) {
    return <Pressable onPress={onPress}>{content}</Pressable>;
  }
  return content;
}
