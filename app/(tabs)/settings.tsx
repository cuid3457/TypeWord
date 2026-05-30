import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SmoothSwitch } from '@/components/common/SmoothSwitch';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TabletContainer } from '@/components/tablet-container';
import { useTablet } from '@src/hooks/useTablet';

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { AppModal } from '@/components/app-modal';
import { ensureLanguageLoaded } from '@src/i18n';
import { NATIVE_LANGUAGES, findLanguage } from '@src/constants/languages';
import { findCountry, getSortedCountries, localizedCountryName } from '@src/constants/countries';
import { useUserSettings } from '@src/hooks/useUserSettings';
import { usePremium } from '@src/hooks/usePremium';
import { haptic } from '@src/services/hapticService';
import { showAdsPrivacyOptions } from '@src/services/adsConsent';
import { clearUserSettings } from '@src/storage/userSettings';
import { getEmail, isApplePrivateRelay, signOut } from '@src/services/authService';
import { consumePaywallPending } from '@src/services/paywallPending';
import {
  isNotificationAvailable,
  requestNotificationPermission,
  rescheduleNotifications,
  getNotificationTranslations,
  cancelAllNotifications,
} from '@src/services/notificationService';

type EditingField = 'native' | 'region' | null;

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { settings, save } = useUserSettings();
  const premium = usePremium();
  const { isTablet } = useTablet();
  const { height: windowHeight } = useWindowDimensions();
  const [editing, setEditing] = useState<EditingField>(null);
  const [adModal, setAdModal] = useState(false);
  const [resetModal, setResetModal] = useState(false);
  const notifAvailable = isNotificationAvailable();
  const [notifUnavailableModal, setNotifUnavailableModal] = useState(false);
  const [notifDeniedModal, setNotifDeniedModal] = useState(false);
  const [rateModal, setRateModal] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [regionSearch, setRegionSearch] = useState('');
  const [pendingRegionCode, setPendingRegionCode] = useState<string | null>(null);
  // Local toggle states — Switch value reads from these, not from settings.X,
  // so the animation fires immediately on tap regardless of AsyncStorage
  // write latency or cascading settings-driven re-renders. settings is still
  // the source of truth; the useEffect below mirrors it into the locals.
  const [sfxToggle, setSfxToggle] = useState(true);
  const [notifToggle, setNotifToggle] = useState(false);
  useEffect(() => {
    if (!settings) return;
    setSfxToggle(settings.sfxEnabled !== false);
    setNotifToggle(settings.notificationsEnabled ?? false);
  }, [settings]);

  useFocusEffect(
    useCallback(() => {
      if (consumePaywallPending()) router.push('/subscription');
      getEmail().then(setUserEmail);
    }, []),
  );

  // Prewarm the country list cache so the picker opens instantly when tapped.
  useEffect(() => {
    getSortedCountries(t, i18n.language);
  }, [t, i18n.language]);

  if (!settings) return null;

  const native = findLanguage(settings.nativeLanguage);
  const country = findCountry(settings.countryCode);
  const pendingCountry = pendingRegionCode ? findCountry(pendingRegionCode) : null;

  const handleSelect = async (field: EditingField, code: string) => {
    if (!field) return;

    if (field === 'native') {
      const next = { ...settings };
      next.nativeLanguage = code;
      next.primaryTargetLang = code;
      ensureLanguageLoaded(code);
      i18n.changeLanguage(code);
      await save(next);
      setEditing(null);
      return;
    }

    if (field === 'region') {
      const picked = findCountry(code);
      if (!picked) {
        setEditing(null);
        return;
      }
      if (picked.code === settings.countryCode) {
        // No change — just close.
        setEditing(null);
        setRegionSearch('');
        return;
      }
      // Defer the actual save until the user confirms in the modal.
      setPendingRegionCode(code);
      setEditing(null);
      setRegionSearch('');
    }
  };

  const handleConfirmRegionChange = async () => {
    if (!pendingRegionCode) return;
    const picked = findCountry(pendingRegionCode);
    if (!picked) {
      setPendingRegionCode(null);
      return;
    }
    const next = {
      ...settings,
      countryCode: picked.code,
      timezone: picked.timezone,
    };
    await save(next);
    setPendingRegionCode(null);
  };

  const onRegionPress = () => {
    setEditing(editing === 'region' ? null : 'region');
    if (editing !== 'region') setRegionSearch('');
  };

  const handleReset = async () => {
    setResetModal(false);
    // signOut() clears local SQLite + TTS files internally.
    await clearUserSettings();
    await signOut().catch(() => {});
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.clear();
    router.replace('/onboarding');
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-canvas dark:bg-canvas-dark">
      <TabletContainer>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}>
        <View className="pt-6">
          <View className="h-11 justify-center">
            <Text className="text-3xl font-extrabold tracking-tight text-ink dark:text-ink-dark">
              {t('settings.title')}
            </Text>
          </View>
        </View>

        {/* Premium card */}
        <Pressable
          onPress={() => { if (!premium) { haptic.tap(); router.push('/subscription'); } }}
          className="mt-6 rounded-2xl border border-accent bg-accent-soft p-4 dark:bg-accent-soft-dark"
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <MaterialIcons name={premium ? 'verified' : 'workspace-premium'} size={24} color="#2EC4A5" />
              <View className="ml-3">
                <View className="flex-row items-center">
                  <Text className="text-base font-semibold text-ink dark:text-ink-dark">
                    {premium ? t('premium.premium_plan') : t('premium.subscribe')}
                  </Text>
                  {premium ? (
                    <View className="ml-2 rounded-full bg-[#2EC4A5] px-2 py-0.5">
                      <Text className="text-xs font-bold text-white">{t('premium.badge')}</Text>
                    </View>
                  ) : null}
                </View>
                <Text className="mt-0.5 text-xs text-muted">
                  {premium ? t('premium.active') : t('premium.current_free')}
                </Text>
              </View>
            </View>
            {!premium ? (
              <MaterialIcons name="chevron-right" size={24} color="#A79E90" />
            ) : null}
          </View>
        </Pressable>

        {/* Account section */}
        {userEmail ? (
          <Pressable
            onPress={() => { haptic.tap(); router.push('/profile'); }}
            className="mt-6 flex-row items-center justify-between rounded-2xl border border-line p-4 dark:border-line-dark"
          >
            <Text className="flex-1 text-base text-ink dark:text-ink-dark">
              {isApplePrivateRelay(userEmail) ? t('auth.apple_signed_in') : userEmail}
            </Text>
            <MaterialIcons name="chevron-right" size={24} color="#A79E90" />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => router.push('/auth')}
            className="mt-6 flex-row items-center justify-center rounded-2xl border border-line py-4 dark:border-line-dark"
          >
            <MaterialIcons name="login" size={18} color="#2EC4A5" />
            <Text className="ml-2 text-base font-medium text-[#2EC4A5]">
              {t('auth.login')} / {t('auth.signup')}
            </Text>
          </Pressable>
        )}

        <View className="mt-6 rounded-2xl border border-line dark:border-line-dark">
          {/* Native language */}
          <SettingRow
            label={t('settings.native_language')}
            value={native ? native.nativeName : '—'}
            isOpen={editing === 'native'}
            onPress={() => setEditing(editing === 'native' ? null : 'native')}
          />

          {/* Inline list under the active row so the option list is visually
              attached to the row that opened it. The other row is hidden
              while editing — same pattern as the new-wordlist screen. */}
          {editing === 'native' ? (
            <View className="border-t border-line dark:border-line-dark" style={{ height: 320 }}>
              <LanguageList
                excludeCode={null}
                selectedCode={settings.nativeLanguage}
                onSelect={(code) => handleSelect(editing, code)}
                t={t}
              />
            </View>
          ) : null}

          {editing !== 'native' ? (
            <>
              <View className="mx-4 h-px bg-line dark:bg-line-dark" />

              {/* Region */}
              <SettingRow
                label={t('settings.region')}
                value={
                  country
                    ? `${country.flag} ${localizedCountryName(t, country.code, i18n.language, country.name)}`
                    : '—'
                }
                isOpen={editing === 'region'}
                onPress={onRegionPress}
              />

              {editing === 'region' ? (
                <View
                  className="border-t border-line dark:border-line-dark"
                  // Cap at half the viewport so the picker stays bounded with
                  // the keyboard open or on short screens; never shrinks below
                  // 240 so a single result is still scannable.
                  style={{ height: Math.max(240, Math.min(360, windowHeight * 0.5)) }}
                >
                  <CountryList
                    selectedCode={settings.countryCode ?? ''}
                    query={regionSearch}
                    onQueryChange={setRegionSearch}
                    onSelect={(code) => handleSelect('region', code)}
                    lang={i18n.language}
                    t={t}
                  />
                </View>
              ) : null}
            </>
          ) : null}
        </View>

        {/* Theme selector */}
        <View className="mt-6 rounded-2xl border border-line dark:border-line-dark">
          <View className="p-4">
            <Text className="text-xs font-semibold uppercase tracking-wider text-muted">
              {t('settings.theme')}
            </Text>
            <View className="mt-2 flex-row gap-2">
              {(['system', 'light', 'dark'] as const).map((mode) => {
                const selected = (settings.theme ?? 'system') === mode;
                return (
                  <Pressable
                    key={mode}
                    onPress={() => { haptic.selection(); save({ ...settings, theme: mode }); }}
                    className={`flex-1 items-center justify-center rounded-xl border ${
                      selected
                        ? 'border-ink bg-ink dark:border-ink-dark dark:bg-ink-dark'
                        : 'border-line dark:border-line-dark'
                    }`}
                    style={{ height: 44 }}
                  >
                    <Text
                      className={`text-sm font-medium ${
                        selected
                          ? 'text-canvas dark:text-canvas-dark'
                          : 'text-ink dark:text-ink-dark'
                      }`}
                    >
                      {t(`settings.theme_${mode}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View className="mx-4 h-px bg-line dark:bg-line-dark" />

          {/* Font size */}
          <View className="p-4">
            <Text className="text-xs font-semibold uppercase tracking-wider text-muted">
              {t('settings.font_size')}
            </Text>
            <View className="mt-2 flex-row gap-2">
              {(['small', 'medium', 'large'] as const).map((size) => {
                const selected = (settings.fontSize ?? 'medium') === size;
                return (
                  <Pressable
                    key={size}
                    onPress={() => { haptic.selection(); save({ ...settings, fontSize: size }); }}
                    className={`flex-1 items-center justify-center rounded-xl border ${
                      selected
                        ? 'border-ink bg-ink dark:border-ink-dark dark:bg-ink-dark'
                        : 'border-line dark:border-line-dark'
                    }`}
                    style={{ height: 44 }}
                  >
                    <Text
                      className={`font-medium ${
                        selected
                          ? 'text-canvas dark:text-canvas-dark'
                          : 'text-ink dark:text-ink-dark'
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

        {/* Notifications — hidden on web. expo-notifications is a no-op
            in the browser (no service-worker push setup in v1) so the
            toggle wouldn't actually schedule anything. Native only. */}
        {Platform.OS !== 'web' ? (
        <View className="mt-6 rounded-2xl border border-line dark:border-line-dark">
          <View className="flex-row items-center justify-between p-4">
            <View className="flex-1">
              <Text className="text-xs font-semibold uppercase tracking-wider text-muted">
                {t('settings.notifications')}
              </Text>
              <Text className="mt-1 text-xs text-faint">
                {t('settings.notifications_hint')}
              </Text>
            </View>
            <SmoothSwitch
              value={notifToggle}
              accessibilityLabel={t('settings.notifications')}
              onValueChange={async (enabled) => {
                if (!notifAvailable) {
                  setNotifUnavailableModal(true);
                  return;
                }
                if (enabled) {
                  setNotifToggle(true);
                  const granted = await requestNotificationPermission();
                  if (!granted) {
                    setNotifToggle(false);
                    setNotifDeniedModal(true);
                    return;
                  }
                  await save({ ...settings, notificationsEnabled: true });
                  await rescheduleNotifications(getNotificationTranslations(t));
                } else {
                  setNotifToggle(false);
                  await save({ ...settings, notificationsEnabled: false });
                  await cancelAllNotifications();
                }
              }}
            />
          </View>
        </View>
        ) : null}

        <View className="mt-3 rounded-2xl border border-line dark:border-line-dark">
          <View className="flex-row items-center justify-between p-4">
            <View className="flex-1">
              <Text className="text-xs font-semibold uppercase tracking-wider text-muted">
                {t('settings.sound_effects')}
              </Text>
              <Text className="mt-1 text-xs text-faint">
                {t('settings.sound_effects_hint')}
              </Text>
            </View>
            <SmoothSwitch
              value={sfxToggle}
              accessibilityLabel={t('settings.sound_effects')}
              onValueChange={async (enabled) => {
                setSfxToggle(enabled);
                await save({ ...settings, sfxEnabled: enabled });
              }}
            />
          </View>
        </View>

        {/* Secondary action buttons. On tablets, lay out as a 2-column
            grid via flex-wrap + 48% basis; phones stay as a vertical
            stack with the original mt-3 spacing. */}
        <View
          className={isTablet ? 'mt-6 flex-row flex-wrap' : 'mt-6'}
          style={isTablet ? { gap: 12 } : undefined}
        >
          {([
            // rate_app + ad_privacy hidden on web: expo-store-review +
            // AdMob consent are both no-ops in the browser, so the
            // entries would just open "unavailable" placeholders.
            Platform.OS !== 'web' ? {
              key: 'rate_app',
              onPress: async () => {
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
              },
            } : null,
            { key: 'contact', onPress: () => router.push('/inquiry') },
            { key: 'terms', onPress: () => router.push('/terms') },
            { key: 'privacy', onPress: () => router.push('/privacy') },
            { key: 'business_info', onPress: () => router.push('/business-info') },
            Platform.OS !== 'web' ? {
              key: 'ad_privacy',
              onPress: async () => {
                const shown = await showAdsPrivacyOptions();
                if (!shown) setAdModal(true);
              },
            } : null,
            { key: 'licenses', onPress: () => router.push('/licenses') },
          ].filter(Boolean) as { key: string; onPress: () => void }[]).map((b, i) => (
            <Pressable
              key={b.key}
              onPress={b.onPress}
              className={`rounded-xl border border-line py-4 dark:border-line-dark ${
                isTablet ? '' : i === 0 ? '' : 'mt-3'
              }`}
              style={isTablet ? { width: '48.5%' } : undefined}
            >
              <Text className="text-center text-sm font-medium text-ink dark:text-ink-dark">
                {t(`settings.${b.key}`)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={() => setResetModal(true)}
          className="mt-6 rounded-xl border border-line py-4 dark:border-line-dark"
        >
          <Text className="text-center text-sm font-medium text-ink dark:text-ink-dark">
            {t('settings.reset')}
          </Text>
        </Pressable>
      </ScrollView>
      </TabletContainer>

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

      <AppModal
        visible={!!pendingCountry}
        title={t('settings.region_change_title')}
        message={
          pendingCountry
            ? t('settings.region_change_message', {
                country: `${pendingCountry.flag} ${localizedCountryName(t, pendingCountry.code, i18n.language, pendingCountry.name)}`,
              })
            : ''
        }
        buttonText={t('settings.cancel')}
        confirmText={t('settings.region_change_confirm')}
        onConfirm={handleConfirmRegionChange}
        onClose={() => setPendingRegionCode(null)}
      />

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
        <Text className="text-xs font-semibold uppercase tracking-wider text-muted">
          {label}
        </Text>
        <Text className="mt-1 text-base text-ink dark:text-ink-dark">{value}</Text>
      </View>
      <Text className="text-base text-faint">{isOpen ? '▲' : '▼'}</Text>
    </Pressable>
  );
}

function CountryList({
  selectedCode,
  query,
  onQueryChange,
  onSelect,
  lang,
  t,
}: {
  selectedCode: string;
  query: string;
  onQueryChange: (q: string) => void;
  onSelect: (code: string) => void;
  lang: string;
  t: (key: string, opts?: { defaultValue?: string }) => string;
}) {
  // Cached across remounts per locale — avoids re-translating + re-sorting
  // 170+ countries every time the picker opens.
  const sortedCountries = useMemo(() => getSortedCountries(t, lang), [lang, t]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedCountries;
    return sortedCountries.filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q),
    );
  }, [query, sortedCountries]);

  return (
    <View className="flex-1">
      <View className="mx-3 mt-3 flex-row items-center rounded-xl border border-line px-3 dark:border-line-dark">
        <MaterialIcons name="search" size={18} color="#A79E90" />
        <TextInput
          value={query}
          onChangeText={onQueryChange}
          placeholder={t('settings.region_search_placeholder')}
          placeholderTextColor="#A79E90"
          className="ml-2 flex-1 py-2 text-sm text-ink dark:text-ink-dark"
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.code}
        className="mt-2"
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        initialNumToRender={20}
        windowSize={5}
        removeClippedSubviews
        renderItem={({ item: c }) => {
          const selected = c.code === selectedCode;
          return (
            <Pressable
              onPress={() => { haptic.selection(); onSelect(c.code); }}
              className={`flex-row items-center px-4 py-3 ${
                selected ? 'bg-accent-soft dark:bg-accent-soft-dark' : ''
              }`}
            >
              <Text className="mr-3 text-xl">{c.flag}</Text>
              <Text className="flex-1 text-base text-ink dark:text-ink-dark">
                {c.displayName}
              </Text>
              {selected ? (
                <MaterialIcons name="check-circle" size={22} color="#2EC4A5" />
              ) : null}
            </Pressable>
          );
        }}
      />
    </View>
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
  const list = NATIVE_LANGUAGES.filter((l) => {
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
            onPress={() => { haptic.selection(); onSelect(item.code); }}
            className={`flex-row items-center px-4 py-3 ${
              selected ? 'bg-accent-soft dark:bg-accent-soft-dark' : ''
            }`}
          >
            <View className="flex-1">
              <Text className="text-base text-ink dark:text-ink-dark">
                {translatedName}
              </Text>
              {translatedName !== item.nativeName ? (
                <Text className="text-xs text-faint">{item.nativeName}</Text>
              ) : null}
            </View>
            {selected ? (
              <MaterialIcons name="check-circle" size={22} color="#2EC4A5" />
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
