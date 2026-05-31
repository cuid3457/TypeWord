/**
 * Weekly recap — Sunday wrap-up. Surfaces the week's stats and offers a
 * shareable image (1080×1080 ShareCard captured off-screen via
 * react-native-view-shot + expo-sharing). Falls back to text share when
 * capture fails or on web.
 */
import { MaterialIcons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Share, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { TabletContainer } from '@/components/tablet-container';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getWeeklyRecap, type WeeklyRecap } from '@src/services/statsService';
import { haptic } from '@src/services/hapticService';

export default function WeeklyRecapScreen() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [recap, setRecap] = useState<WeeklyRecap | null>(null);
  const cardRef = useRef<View>(null);

  useEffect(() => {
    (async () => {
      try { setRecap(await getWeeklyRecap()); } catch { /* surface empty state */ }
    })();
  }, []);

  async function shareText() {
    if (!recap) return;
    const lines: string[] = [];
    lines.push(t('weekly.share_header'));
    lines.push('');
    if (recap.reviewedCount + recap.addedCount > 0) {
      lines.push(t('weekly.share_summary', {
        reviewed: recap.reviewedCount,
        added: recap.addedCount,
      }));
    }
    if (recap.streakCurrent > 0) {
      lines.push(t('weekly.share_streak', { count: recap.streakCurrent }));
    }
    if (recap.hardestWords.length > 0) {
      lines.push(t('weekly.share_hardest', { words: recap.hardestWords.join(', ') }));
    }
    lines.push('');
    lines.push(t('weekly.share_footer'));
    try {
      await Share.share({ message: lines.join('\n') });
    } catch { /* user cancelled — silent */ }
  }

  async function onShare() {
    if (!recap) return;
    haptic.selection();

    // Web: native view-shot not supported; fall back to text share.
    if (Platform.OS === 'web') {
      await shareText();
      return;
    }

    try {
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        await shareText();
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: t('weekly.share_button'),
      });
    } catch {
      // Capture or share failed — degrade to text share so users still
      // get *something* rather than a silent dead button.
      await shareText();
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#15130E' : '#F4F1EA' }}>
      <Stack.Screen options={{ headerShown: false }} />
      <TabletContainer>
      <View style={{ flex: 1, padding: 24, justifyContent: 'space-between' }}>
        <View>
          <View className="h-11 flex-row items-center mb-4">
            <Pressable
              onPress={() => { haptic.tap(); router.back(); }}
              className="mr-2 p-1"
              accessibilityLabel={t('common.back')}
              accessibilityRole="button"
              hitSlop={8}
            >
              <MaterialIcons name="arrow-back" size={24} color="#7B7366" />
            </Pressable>
            <Text className="text-base font-semibold" style={{ color: isDark ? '#F1ECE2' : '#2A2620' }}>
              {t('weekly.title')}
            </Text>
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: isDark ? '#F1ECE2' : '#2A2620' }}>
            {t('weekly.header')}
          </Text>
          <Text style={{ marginTop: 6, fontSize: 14, color: isDark ? '#A79E90' : '#7B7366' }}>
            {t('weekly.subheader')}
          </Text>

          {/* Stats card */}
          <View style={{ marginTop: 24, padding: 20, borderRadius: 16, backgroundColor: isDark ? '#2A261E' : '#FFFFFF', borderWidth: 1, borderColor: isDark ? '#3A352B' : '#ECE6DA' }}>
            <StatRow
              icon="auto-stories"
              label={t('weekly.reviewed_label')}
              value={recap ? String(recap.reviewedCount) : '…'}
              isDark={isDark}
            />
            <Divider isDark={isDark} />
            <StatRow
              icon="add-circle-outline"
              label={t('weekly.added_label')}
              value={recap ? String(recap.addedCount) : '…'}
              isDark={isDark}
            />
            {recap && recap.streakCurrent > 0 ? (
              <>
                <Divider isDark={isDark} />
                <StatRow
                  icon="local-fire-department"
                  label={t('weekly.streak_label')}
                  value={t('weekly.streak_value', { count: recap.streakCurrent })}
                  isDark={isDark}
                />
              </>
            ) : null}
          </View>

          {/* Hardest words */}
          {recap && recap.hardestWords.length > 0 ? (
            <View style={{ marginTop: 20, padding: 20, borderRadius: 16, backgroundColor: isDark ? '#2A261E' : '#FFFFFF', borderWidth: 1, borderColor: isDark ? '#3A352B' : '#ECE6DA' }}>
              <Text style={{ fontSize: 13, color: isDark ? '#A79E90' : '#7B7366', marginBottom: 8 }}>
                {t('weekly.hardest_label')}
              </Text>
              <Text style={{ fontSize: 16, fontWeight: '600', color: isDark ? '#F1ECE2' : '#2A2620' }}>
                {recap.hardestWords.join(' · ')}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Actions */}
        <View style={{ gap: 10 }}>
          <Pressable
            onPress={onShare}
            disabled={!recap}
            style={{
              paddingVertical: 16,
              borderRadius: 14,
              backgroundColor: '#2EC4A5',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              opacity: recap ? 1 : 0.5,
            }}
          >
            <MaterialIcons name="ios-share" size={18} color="#fff" />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
              {t('weekly.share_button')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.back()}
            style={{
              paddingVertical: 16,
              borderRadius: 14,
              backgroundColor: isDark ? '#2A261E' : '#FFFFFF',
              borderWidth: 1,
              borderColor: isDark ? '#3A352B' : '#ECE6DA',
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: '600', color: isDark ? '#A79E90' : '#7B7366' }}>
              {t('weekly.close')}
            </Text>
          </Pressable>
        </View>
      </View>
      </TabletContainer>

      {/* Off-screen ShareCard — rendered at 1080×1080 outside the visible
          viewport so captureRef returns a clean, fixed-resolution PNG
          regardless of the user's actual screen size. `collapsable={false}`
          is required on Android so the view hierarchy isn't flattened
          away before the snapshot is taken. */}
      {Platform.OS !== 'web' && recap ? (
        <View
          collapsable={false}
          ref={cardRef}
          style={{
            position: 'absolute',
            left: -100000,
            top: 0,
            width: 1080,
            height: 1080,
            backgroundColor: '#F4F1EA',
          }}
        >
          <ShareCard recap={recap} t={t} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function ShareCard({
  recap,
  t,
}: {
  recap: WeeklyRecap;
  t: (k: string, opts?: Record<string, unknown>) => string;
}) {
  const headerText = t('weekly.share_header').replace(/^🌱\s*/, '');
  return (
    <View style={{ flex: 1, padding: 80, justifyContent: 'space-between' }}>
      {/* Top: brand + headline */}
      <View>
        <Text style={{ fontSize: 64 }}>🌱</Text>
        <Text style={{ marginTop: 24, fontSize: 64, fontWeight: '800', color: '#2A2620', letterSpacing: -1 }}>
          {headerText}
        </Text>
      </View>

      {/* Middle: stats */}
      <View style={{ gap: 28 }}>
        {recap.reviewedCount > 0 ? (
          <ShareStatRow
            label={t('weekly.share_card_reviewed')}
            value={String(recap.reviewedCount)}
          />
        ) : null}
        {recap.addedCount > 0 ? (
          <ShareStatRow
            label={t('weekly.share_card_added')}
            value={String(recap.addedCount)}
          />
        ) : null}
        {recap.streakCurrent > 0 ? (
          <ShareStatRow
            label={t('weekly.share_card_streak')}
            value={`${recap.streakCurrent}${t('weekly.share_card_streak_unit')}`}
            suffix=" 🔥"
          />
        ) : null}
      </View>

      {/* Hardest words (if any) */}
      {recap.hardestWords.length > 0 ? (
        <View>
          <Text style={{ fontSize: 24, color: '#7B7366' }}>
            {t('weekly.hardest_label')}
          </Text>
          <Text
            style={{ marginTop: 12, fontSize: 36, fontWeight: '700', color: '#2A2620' }}
            numberOfLines={2}
          >
            {recap.hardestWords.slice(0, 3).join(' · ')}
          </Text>
        </View>
      ) : null}

      {/* Footer: domain */}
      <Text style={{ fontSize: 32, color: '#7B7366', textAlign: 'center', letterSpacing: 0.5 }}>
        moavoca.com
      </Text>
    </View>
  );
}

function ShareStatRow({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 32, color: '#7B7366' }}>{label}</Text>
      <Text style={{ fontSize: 80, fontWeight: '900', color: '#2A2620', letterSpacing: -2 }}>
        {value}
        {suffix ? <Text style={{ fontSize: 56 }}>{suffix}</Text> : null}
      </Text>
    </View>
  );
}

function StatRow({
  icon,
  label,
  value,
  isDark,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
  isDark: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
      <MaterialIcons name={icon} size={22} color="#2EC4A5" />
      <Text style={{ flex: 1, marginLeft: 12, fontSize: 14, color: isDark ? '#C4BEB2' : '#3A352B' }}>
        {label}
      </Text>
      <Text style={{ fontSize: 18, fontWeight: '800', color: isDark ? '#F1ECE2' : '#2A2620' }}>
        {value}
      </Text>
    </View>
  );
}

function Divider({ isDark }: { isDark: boolean }) {
  return (
    <View style={{ height: 1, backgroundColor: isDark ? '#3A352B' : '#ECE6DA', marginVertical: 4 }} />
  );
}
