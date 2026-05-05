import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NATIVE_LANGUAGES, findLanguage } from '@src/constants/languages';
import { findCountry, getSortedCountries, localizedCountryName } from '@src/constants/countries';
import { ensureLanguageLoaded } from '@src/i18n';
import { saveUserSettings } from '@src/storage/userSettings';
import { getMinimumAge } from '@src/utils/minimumAge';

import { getDeviceTimezone, useOnboarding } from './_layout';

type TFn = (key: string, opts?: { defaultValue?: string }) => string;

export default function OnboardingSetup() {
  const { t, i18n } = useTranslation();
  const { nativeLanguage, countryCode, setNativeLanguage, setCountryCode } = useOnboarding();
  const [saving, setSaving] = useState(false);
  const [langModalOpen, setLangModalOpen] = useState(false);
  const [countryModalOpen, setCountryModalOpen] = useState(false);

  const lang = findLanguage(nativeLanguage);
  const country = findCountry(countryCode);
  const countryDisplayName = country
    ? localizedCountryName(t, country.code, i18n.language, country.name)
    : '—';
  const minimumAge = getMinimumAge(countryCode);

  const handleSelectLanguage = (code: string) => {
    setNativeLanguage(code);
    ensureLanguageLoaded(code);
    i18n.changeLanguage(code);
    setLangModalOpen(false);
  };

  const handleSelectCountry = (code: string) => {
    setCountryCode(code);
    setCountryModalOpen(false);
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      const picked = findCountry(countryCode);
      const tz = picked?.timezone ?? getDeviceTimezone();
      await saveUserSettings({
        nativeLanguage,
        primarySourceLang: nativeLanguage === 'en' ? 'es' : 'en',
        primaryTargetLang: nativeLanguage,
        onboardedAt: new Date().toISOString(),
        countryCode,
        timezone: tz,
      });
      router.replace('/(tabs)');
    } catch {
      router.replace('/(tabs)');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <View className="flex-1 justify-between px-6 pb-8 pt-6">
        <View>
          <Pressable
            onPress={() => router.back()}
            className="mb-4 h-10 w-10 items-center justify-center"
          >
            <MaterialIcons name="arrow-back" size={24} color="#6b7280" />
          </Pressable>
          <Text className="text-3xl font-bold text-black dark:text-white">
            {t('onboarding.setup.title')}
          </Text>
          <Text className="mt-2 text-base text-gray-600 dark:text-gray-300">
            {t('onboarding.setup.hint')}
          </Text>

          <View className="mt-8">
            <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              {t('settings.native_language')}
            </Text>
            <Pressable
              onPress={() => setLangModalOpen(true)}
              className="mt-2 flex-row items-center justify-between rounded-xl border border-gray-300 p-4 dark:border-gray-700"
            >
              {lang ? (
                <View className="flex-row items-center">
                  <Text className="mr-3 text-2xl">{lang.flag}</Text>
                  <Text className="text-base text-black dark:text-white">
                    {lang.nativeName}
                  </Text>
                </View>
              ) : (
                <Text className="text-base text-gray-400">—</Text>
              )}
              <MaterialIcons name="expand-more" size={24} color="#9ca3af" />
            </Pressable>
          </View>

          <View className="mt-6">
            <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              {t('settings.region')}
            </Text>
            <Pressable
              onPress={() => setCountryModalOpen(true)}
              className="mt-2 flex-row items-center justify-between rounded-xl border border-gray-300 p-4 dark:border-gray-700"
            >
              {country ? (
                <View className="flex-row items-center">
                  <Text className="mr-3 text-2xl">{country.flag}</Text>
                  <Text className="text-base text-black dark:text-white">
                    {countryDisplayName}
                  </Text>
                </View>
              ) : (
                <Text className="text-base text-gray-400">—</Text>
              )}
              <MaterialIcons name="expand-more" size={24} color="#9ca3af" />
            </Pressable>
          </View>
        </View>

        <View>
          <Pressable
            onPress={handleFinish}
            disabled={saving}
            className={`items-center rounded-xl py-4 ${
              saving ? 'bg-gray-300' : 'bg-black dark:bg-white'
            }`}
          >
            {saving ? (
              <ActivityIndicator color="#6b7280" />
            ) : (
              <Text className="text-base font-semibold text-white dark:text-black">
                {t('onboarding.start')}
              </Text>
            )}
          </Pressable>

          <Text className="mt-4 text-center text-xs leading-5 text-gray-500 dark:text-gray-400">
            {t('onboarding.legal_prefix', { age: minimumAge })}
            <Text
              className="text-gray-700 dark:text-gray-200 underline"
              onPress={() => router.push('/terms')}
            >
              {t('onboarding.legal_terms')}
            </Text>
            {t('onboarding.legal_and')}
            <Text
              className="text-gray-700 dark:text-gray-200 underline"
              onPress={() => router.push('/privacy')}
            >
              {t('onboarding.legal_privacy')}
            </Text>
            {t('onboarding.legal_suffix')}
          </Text>
        </View>
      </View>

      {langModalOpen ? (
        <LanguagePickerModal
          selected={nativeLanguage}
          onSelect={handleSelectLanguage}
          onClose={() => setLangModalOpen(false)}
          t={t}
        />
      ) : null}

      {countryModalOpen ? (
        <CountryPickerModal
          selected={countryCode}
          lang={i18n.language}
          onSelect={handleSelectCountry}
          onClose={() => setCountryModalOpen(false)}
          t={t}
        />
      ) : null}
    </SafeAreaView>
  );
}

function LanguagePickerModal({
  selected,
  onSelect,
  onClose,
  t,
}: {
  selected: string;
  onSelect: (code: string) => void;
  onClose: () => void;
  t: TFn;
}) {
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-white dark:bg-black">
        <View className="flex-1 px-6 pb-8 pt-6">
          <View className="flex-row items-center">
            <Pressable onPress={onClose} className="h-10 w-10 items-center justify-center">
              <MaterialIcons name="close" size={24} color="#6b7280" />
            </Pressable>
            <Text className="ml-2 text-xl font-bold text-black dark:text-white">
              {t('settings.native_language')}
            </Text>
          </View>

          <FlatList
            data={NATIVE_LANGUAGES}
            keyExtractor={(item) => item.code}
            className="mt-4 flex-1"
            renderItem={({ item }) => {
              const isSelected = item.code === selected;
              return (
                <Pressable
                  onPress={() => onSelect(item.code)}
                  className={`flex-row items-center rounded-xl px-3 py-3 ${
                    isSelected ? 'bg-black/5 dark:bg-white/10' : ''
                  }`}
                >
                  <Text className="mr-3 text-2xl">{item.flag}</Text>
                  <View className="flex-1">
                    <Text className="text-base text-black dark:text-white">
                      {t(`languages.${item.code}`)}
                    </Text>
                    {t(`languages.${item.code}`) !== item.nativeName ? (
                      <Text className="text-xs text-gray-400">{item.nativeName}</Text>
                    ) : null}
                  </View>
                  {isSelected ? (
                    <MaterialIcons name="check-circle" size={22} color="#2EC4A5" />
                  ) : null}
                </Pressable>
              );
            }}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function CountryPickerModal({
  selected,
  lang,
  onSelect,
  onClose,
  t,
}: {
  selected: string;
  lang: string;
  onSelect: (code: string) => void;
  onClose: () => void;
  t: TFn;
}) {
  const [query, setQuery] = useState('');

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
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-white dark:bg-black">
        <View className="flex-1 px-6 pb-8 pt-6">
          <View className="flex-row items-center">
            <Pressable onPress={onClose} className="h-10 w-10 items-center justify-center">
              <MaterialIcons name="close" size={24} color="#6b7280" />
            </Pressable>
            <Text className="ml-2 text-xl font-bold text-black dark:text-white">
              {t('settings.region')}
            </Text>
          </View>

          <View className="mt-4 flex-row items-center rounded-xl border border-gray-300 px-3 dark:border-gray-700">
            <MaterialIcons name="search" size={20} color="#9ca3af" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('settings.region_search_placeholder')}
              placeholderTextColor="#9ca3af"
              className="ml-2 flex-1 py-3 text-base text-black dark:text-white"
            />
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.code}
            className="mt-3 flex-1"
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const isSelected = item.code === selected;
              return (
                <Pressable
                  onPress={() => onSelect(item.code)}
                  className={`flex-row items-center px-2 py-3 ${
                    isSelected ? 'bg-black/5 dark:bg-white/10' : ''
                  }`}
                >
                  <Text className="mr-3 text-2xl">{item.flag}</Text>
                  <Text className="flex-1 text-base text-black dark:text-white">
                    {item.displayName}
                  </Text>
                  {isSelected ? (
                    <MaterialIcons name="check-circle" size={22} color="#2EC4A5" />
                  ) : null}
                </Pressable>
              );
            }}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
