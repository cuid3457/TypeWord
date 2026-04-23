import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Linking,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { AppModal } from '@/components/app-modal';
import { Paywall } from '@/components/paywall';
import { ensureLanguageLoaded } from '@src/i18n';
import { LANGUAGES, findLanguage, type Language } from '@src/constants/languages';
import { useUserSettings } from '@src/hooks/useUserSettings';
import { usePremium } from '@src/hooks/usePremium';
import { showAdsPrivacyOptions } from '@src/services/adsConsent';
import { clearUserSettings } from '@src/storage/userSettings';
import { getEmail, signOut } from '@src/services/authService';
import { clearLocalData } from '@src/db';
import { consumePaywallPending } from '@src/services/paywallPending';
import {
  isNotificationAvailable,
  requestNotificationPermission,
  rescheduleNotifications,
  getNotificationTranslations,
  cancelAllNotifications,
} from '@src/services/notificationService';

type EditingField = 'native' | null;

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { settings, save } = useUserSettings();
  const premium = usePremium();
  const [editing, setEditing] = useState<EditingField>(null);
  const [adModal, setAdModal] = useState(false);
  const [resetModal, setResetModal] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const notifAvailable = isNotificationAvailable();
  const [notifUnavailableModal, setNotifUnavailableModal] = useState(false);
  const [notifDeniedModal, setNotifDeniedModal] = useState(false);
  const [rateModal, setRateModal] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (consumePaywallPending()) setPaywallVisible(true);
      getEmail().then(setUserEmail);
    }, []),
  );

  if (!settings) return null;

  const native = findLanguage(settings.nativeLanguage);

  const handleSelect = async (field: EditingField, code: string) => {
    if (!field) return;
    const next = { ...settings };

    if (field === 'native') {
      next.nativeLanguage = code;
      next.primaryTargetLang = code;
      ensureLanguageLoaded(code);
      i18n.changeLanguage(code);
    }

    await save(next);
    setEditing(null);
  };

  const handleReset = async () => {
    setResetModal(false);
    await clearLocalData();
    await clearUserSettings();
    await signOut().catch(() => {});
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.clear();
    router.replace('/onboarding');
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-white dark:bg-black">
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <Text className="text-3xl font-bold text-black dark:text-white">
          {t('settings.title')}
        </Text>

        {/* Premium card */}
        <Pressable
          onPress={() => !premium && setPaywallVisible(true)}
          className="mt-6 rounded-2xl p-4"
          style={{ backgroundColor: premium ? '#2EC4A520' : '#2EC4A510', borderWidth: 1, borderColor: '#2EC4A5' }}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <MaterialIcons name={premium ? 'verified' : 'workspace-premium'} size={24} color="#2EC4A5" />
              <View className="ml-3">
                <View className="flex-row items-center">
                  <Text className="text-base font-semibold text-black dark:text-white">
                    {premium ? t('premium.premium_plan') : t('premium.free_plan')}
                  </Text>
                  {premium ? (
                    <View className="ml-2 rounded-full bg-[#2EC4A5] px-2 py-0.5">
                      <Text className="text-xs font-bold text-white">{t('premium.badge')}</Text>
                    </View>
                  ) : null}
                </View>
                <Text className="mt-0.5 text-xs text-gray-500">
                  {premium ? t('premium.active') : t('premium.subscribe')}
                </Text>
              </View>
            </View>
            {!premium ? (
              <MaterialIcons name="chevron-right" size={24} color="#9ca3af" />
            ) : null}
          </View>
        </Pressable>

        {/* Account section */}
        {userEmail ? (
          <Pressable
            onPress={() => router.push('/profile')}
            className="mt-6 flex-row items-center justify-between rounded-2xl border border-gray-300 p-4 dark:border-gray-700"
          >
            <Text className="flex-1 text-base text-black dark:text-white">{userEmail}</Text>
            <MaterialIcons name="chevron-right" size={24} color="#9ca3af" />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => router.push('/auth')}
            className="mt-6 flex-row items-center justify-center rounded-2xl border border-gray-300 py-4 dark:border-gray-700"
          >
            <MaterialIcons name="login" size={18} color="#2EC4A5" />
            <Text className="ml-2 text-base font-medium text-[#2EC4A5]">
              {t('auth.login')} / {t('auth.signup')}
            </Text>
          </Pressable>
        )}

        <View className="mt-6 rounded-2xl border border-gray-300 dark:border-gray-700">
          {/* Native language */}
          <SettingRow
            label={t('settings.native_language')}
            value={native ? `${native.flag} ${native.nativeName}` : '—'}
            isOpen={editing === 'native'}
            onPress={() => setEditing(editing === 'native' ? null : 'native')}
          />
        </View>

        {editing === 'native' ? (
          <View className="mt-2 rounded-2xl border border-gray-300 dark:border-gray-700" style={{ height: 320 }}>
            <LanguageList
              excludeCode={null}
              selectedCode={settings.nativeLanguage}
              onSelect={(code) => handleSelect(editing, code)}
              t={t}
            />
          </View>
        ) : null}

        {/* Theme selector */}
        <View className="mt-6 rounded-2xl border border-gray-300 dark:border-gray-700">
          <View className="p-4">
            <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              {t('settings.theme')}
            </Text>
            <View className="mt-2 flex-row gap-2">
              {(['system', 'light', 'dark'] as const).map((mode) => {
                const selected = (settings.theme ?? 'system') === mode;
                return (
                  <Pressable
                    key={mode}
                    onPress={() => save({ ...settings, theme: mode })}
                    className={`flex-1 items-center justify-center rounded-xl border ${
                      selected
                        ? 'border-black bg-black dark:border-white dark:bg-white'
                        : 'border-gray-300 dark:border-gray-700'
                    }`}
                    style={{ height: 44 }}
                  >
                    <Text
                      className={`text-sm font-medium ${
                        selected
                          ? 'text-white dark:text-black'
                          : 'text-black dark:text-white'
                      }`}
                    >
                      {t(`settings.theme_${mode}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View className="mx-4 h-px bg-gray-200 dark:bg-gray-800" />

          {/* Font size */}
          <View className="p-4">
            <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              {t('settings.font_size')}
            </Text>
            <View className="mt-2 flex-row gap-2">
              {(['small', 'medium', 'large'] as const).map((size) => {
                const selected = (settings.fontSize ?? 'medium') === size;
                return (
                  <Pressable
                    key={size}
                    onPress={() => save({ ...settings, fontSize: size })}
                    className={`flex-1 items-center justify-center rounded-xl border ${
                      selected
                        ? 'border-black bg-black dark:border-white dark:bg-white'
                        : 'border-gray-300 dark:border-gray-700'
                    }`}
                    style={{ height: 44 }}
                  >
                    <Text
                      className={`font-medium ${
                        selected
                          ? 'text-white dark:text-black'
                          : 'text-black dark:text-white'
                      } ${size === 'small' ? 'text-xs' : size === 'large' ? 'text-base' : 'text-sm'}`}
                    >
                      {t(`settings.font_${size}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* Notifications */}
        <View className="mt-6 rounded-2xl border border-gray-300 dark:border-gray-700">
          <View className="flex-row items-center justify-between p-4">
            <View className="flex-1">
              <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                {t('settings.notifications')}
              </Text>
              <Text className="mt-1 text-xs text-gray-400">
                {t('settings.notifications_hint')}
              </Text>
            </View>
            <Switch
              trackColor={{ false: '#d1d5db', true: '#A7E8D8' }}
              thumbColor={settings.notificationsEnabled ? '#2EC4A5' : '#f4f4f5'}
              value={settings.notificationsEnabled ?? false}
              accessibilityLabel={t('settings.notifications')}
              onValueChange={async (enabled) => {
                if (!notifAvailable) {
                  setNotifUnavailableModal(true);
                  return;
                }
                if (enabled) {
                  const granted = await requestNotificationPermission();
                  if (!granted) {
                    setNotifDeniedModal(true);
                    return;
                  }
                  await save({ ...settings, notificationsEnabled: true });
                  await rescheduleNotifications(getNotificationTranslations(t));
                } else {
                  await save({ ...settings, notificationsEnabled: false });
                  await cancelAllNotifications();
                }
              }}
            />
          </View>
        </View>

        <Pressable
          onPress={() => router.push('/terms')}
          className="mt-6 rounded-xl border border-gray-300 py-4 dark:border-gray-700"
        >
          <Text className="text-center text-sm font-medium text-black dark:text-white">
            {t('settings.terms')}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/privacy')}
          className="mt-3 rounded-xl border border-gray-300 py-4 dark:border-gray-700"
        >
          <Text className="text-center text-sm font-medium text-black dark:text-white">
            {t('settings.privacy')}
          </Text>
        </Pressable>

        <Pressable
          onPress={async () => {
            const shown = await showAdsPrivacyOptions();
            if (!shown) setAdModal(true);
          }}
          className="mt-3 rounded-xl border border-gray-300 py-4 dark:border-gray-700"
        >
          <Text className="text-center text-sm font-medium text-black dark:text-white">
            {t('settings.ad_privacy')}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/inquiry')}
          className="mt-3 rounded-xl border border-gray-300 py-4 dark:border-gray-700"
        >
          <Text className="text-center text-sm font-medium text-black dark:text-white">
            {t('settings.contact')}
          </Text>
        </Pressable>

        <Pressable
          onPress={async () => {
            try {
              const StoreReview = require('expo-store-review');
              const available = await StoreReview.isAvailableAsync();
              if (available) {
                await StoreReview.requestReview();
              } else {
                setRateModal(true);
              }
            } catch {
              setRateModal(true);
            }
          }}
          className="mt-3 rounded-xl border border-gray-300 py-4 dark:border-gray-700"
        >
          <Text className="text-center text-sm font-medium text-black dark:text-white">
            {t('settings.rate_app')}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/licenses')}
          className="mt-3 rounded-xl border border-gray-300 py-4 dark:border-gray-700"
        >
          <Text className="text-center text-sm font-medium text-black dark:text-white">
            {t('settings.licenses')}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setResetModal(true)}
          className="mt-6 rounded-xl border border-gray-300 py-4 dark:border-gray-700"
        >
          <Text className="text-center text-sm font-medium text-black dark:text-white">
            {t('settings.reset')}
          </Text>
        </Pressable>
      </ScrollView>

      <AppModal
        visible={adModal}
        title={t('settings.ad_privacy')}
        message={t('settings.ad_privacy_unavailable')}
        buttonText={t('review.check')}
        onClose={() => setAdModal(false)}
      />

      <AppModal
        visible={notifUnavailableModal}
        title={t('settings.notifications')}
        message={t('settings.notifications_unavailable')}
        buttonText={t('review.check')}
        onClose={() => setNotifUnavailableModal(false)}
      />

      <AppModal
        visible={notifDeniedModal}
        title={t('settings.notifications')}
        message={t('settings.notifications_denied')}
        buttonText={t('common.close')}
        confirmText={t('settings.open_settings')}
        onConfirm={() => {
          setNotifDeniedModal(false);
          Linking.openSettings();
        }}
        onClose={() => setNotifDeniedModal(false)}
      />

      <AppModal
        visible={rateModal}
        title={t('settings.rate_app')}
        message={t('settings.rate_unavailable')}
        buttonText={t('review.check')}
        onClose={() => setRateModal(false)}
      />

      <Paywall visible={paywallVisible} onClose={() => setPaywallVisible(false)} />

      <AppModal
        visible={resetModal}
        title={t('settings.reset_title')}
        message={t('settings.reset_message')}
        buttonText={t('settings.cancel')}
        confirmText={t('settings.confirm_reset')}
        onConfirm={handleReset}
        onClose={() => setResetModal(false)}
        destructive
      />
    </SafeAreaView>
  );
}

function SettingRow({
  label,
  value,
  isOpen,
  onPress,
}: {
  label: string;
  value: string;
  isOpen: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center justify-between p-4">
      <View className="flex-1">
        <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          {label}
        </Text>
        <Text className="mt-1 text-base text-black dark:text-white">{value}</Text>
      </View>
      <Text className="text-base text-gray-400">{isOpen ? '▲' : '▼'}</Text>
    </Pressable>
  );
}

function LanguageList({
  excludeCode,
  selectedCode,
  onSelect,
  t,
}: {
  excludeCode: string | null;
  selectedCode: string;
  onSelect: (code: string) => void;
  t: (key: string) => string;
}) {
  const list = LANGUAGES.filter((l) => {
    if (excludeCode && l.code === excludeCode) return false;
    return true;
  });

  return (
    <ScrollView nestedScrollEnabled={true}>
      {list.map((item) => {
        const selected = item.code === selectedCode;
        const translatedName = t(`languages.${item.code}`);
        return (
          <Pressable
            key={item.code}
            onPress={() => onSelect(item.code)}
            className={`flex-row items-center px-4 py-3 ${
              selected ? 'bg-black/5 dark:bg-white/10' : ''
            }`}
          >
            <Text className="mr-3 text-xl">{item.flag}</Text>
            <View className="flex-1">
              <Text className="text-base text-black dark:text-white">
                {translatedName}
              </Text>
              {translatedName !== item.nativeName ? (
                <Text className="text-xs text-gray-400">{item.nativeName}</Text>
              ) : null}
            </View>
            {selected ? (
              <Text className="text-base text-black dark:text-white">✓</Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
