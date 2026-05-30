/**
 * Weekly recap — Sunday wrap-up that surfaces what the user accomplished this
 * week and offers a shareable summary. Renders text-based share for now;
 * image capture (react-native-view-shot) is deferred to the next native
 * build cycle since it needs a fresh prebuild.
 */
import { MaterialIcons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { getWeeklyRecap, type WeeklyRecap } from '@src/services/statsService';
import { haptic } from '@src/services/hapticService';

export default function WeeklyRecapScreen() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [recap, setRecap] = useState<WeeklyRecap | null>(null);

  useEffect(() => {
    (async () => {
      try { setRecap(await getWeeklyRecap()); } catch { /* surface empty state */ }
    })();
  }, []);

  async function onShare() {
    if (!recap) return;
    haptic.selection();
    const lines: string[] = [];
    lines.push(t('weekly.share_header'));
    lines.push('');
    lines.push(t('weekly.share_reviewed', { count: recap.reviewedCount }));
    lines.push(t('weekly.share_added', { count: recap.addedCount }));
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

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#15130E' : '#F4F1EA' }}>
      <Stack.Screen options={{ title: t('weekly.title'), headerShown: true }} />

      <View style={{ flex: 1, padding: 24, justifyContent: 'space-between' }}>
        <View>
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
