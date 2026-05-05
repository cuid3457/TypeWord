/**
 * Header-mounted toggle for TTS voice gender + playback rate.
 *
 * Tapping the icon opens a small modal with two rows:
 *   - Voice gender: F / M
 *   - Playback rate: ×0.8 / ×1.0 / ×1.2
 *
 * Updates persist to user settings immediately (single source of truth);
 * other voice-using screens see changes on next playback.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Modal, Pressable, Text, View } from 'react-native';
import { useState } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useUserSettings } from '@src/hooks/useUserSettings';

type Rate = 0.8 | 1.0 | 1.2;
const RATES: Rate[] = [0.8, 1.0, 1.2];

interface VoiceToggleProps {
  /** Override icon color (e.g. dark headers). Defaults to theme-aware tint. */
  iconColor?: string;
  /** Override icon size. Defaults to 22. */
  iconSize?: number;
}

export function VoiceToggle({ iconColor, iconSize = 22 }: VoiceToggleProps) {
  const colorScheme = useColorScheme();
  const { settings, save } = useUserSettings();
  const [open, setOpen] = useState(false);

  const isDark = colorScheme === 'dark';
  const fg = iconColor ?? (isDark ? '#e5e7eb' : '#374151');
  const cardBg = isDark ? '#1f2937' : '#ffffff';
  const textColor = isDark ? '#f3f4f6' : '#111827';
  const subtle = isDark ? '#9ca3af' : '#6b7280';
  const accent = '#2EC4A5';

  const gender = settings?.voiceGender ?? 'F';
  const rate = (settings?.voiceRate ?? 1.0) as Rate;

  if (!settings) {
    return null;
  }

  const update = (next: Partial<{ voiceGender: 'F' | 'M'; voiceRate: Rate }>) => {
    save({ ...settings, ...next });
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={10}
        accessibilityLabel="음성 설정"
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 4 })}
      >
        <MaterialIcons name="record-voice-over" size={iconSize} color={fg} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 360, backgroundColor: cardBg, borderRadius: 18, padding: 20 }}
          >
            <Text style={{ fontSize: 18, fontWeight: '700', color: textColor, marginBottom: 18 }}>
              음성 설정
            </Text>

            {/* Gender row */}
            <Text style={{ fontSize: 13, color: subtle, marginBottom: 8 }}>음성 성별</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
              {(['F', 'M'] as const).map((g) => {
                const active = gender === g;
                return (
                  <Pressable
                    key={g}
                    onPress={() => update({ voiceGender: g })}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 10,
                      backgroundColor: active ? accent : isDark ? '#374151' : '#f3f4f6',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: '600', color: active ? '#fff' : textColor }}>
                      {g === 'F' ? '여성' : '남성'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Rate row */}
            <Text style={{ fontSize: 13, color: subtle, marginBottom: 8 }}>재생 속도</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {RATES.map((r) => {
                const active = rate === r;
                return (
                  <Pressable
                    key={r}
                    onPress={() => update({ voiceRate: r })}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 10,
                      backgroundColor: active ? accent : isDark ? '#374151' : '#f3f4f6',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: '600', color: active ? '#fff' : textColor }}>
                      ×{r.toFixed(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={() => setOpen(false)}
              style={{ marginTop: 22, paddingVertical: 12, borderRadius: 10, backgroundColor: isDark ? '#fff' : '#000', alignItems: 'center' }}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: isDark ? '#000' : '#fff' }}>
                완료
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
