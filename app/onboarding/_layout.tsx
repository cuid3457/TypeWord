import * as Localization from 'expo-localization';
import { Stack } from 'expo-router';
import { createContext, useContext, useState, type ReactNode } from 'react';

import { guessCountryFromTimezone } from '@src/constants/countries';
import { deviceLang } from '@src/i18n';

interface OnboardingState {
  nativeLanguage: string;
  countryCode: string;
  setNativeLanguage: (code: string) => void;
  setCountryCode: (code: string) => void;
}

const OnboardingCtx = createContext<OnboardingState | null>(null);

export function useOnboarding(): OnboardingState {
  const ctx = useContext(OnboardingCtx);
  if (!ctx) throw new Error('useOnboarding must be used inside OnboardingLayout');
  return ctx;
}

export function getDeviceTimezone(): string {
  return Localization.getCalendars()[0]?.timeZone ?? 'UTC';
}

function OnboardingProvider({ children }: { children: ReactNode }) {
  const [nativeLanguage, setNativeLanguage] = useState<string>(deviceLang);
  const [countryCode, setCountryCode] = useState<string>(() => {
    const tz = getDeviceTimezone();
    return guessCountryFromTimezone(tz)?.code ?? 'US';
  });
  return (
    <OnboardingCtx.Provider
      value={{ nativeLanguage, countryCode, setNativeLanguage, setCountryCode }}
    >
      {children}
    </OnboardingCtx.Provider>
  );
}

export default function OnboardingLayout() {
  return (
    <OnboardingProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="setup" />
      </Stack>
    </OnboardingProvider>
  );
}
