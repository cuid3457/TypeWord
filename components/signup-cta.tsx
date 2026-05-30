import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, View } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';

function gotoAuth(nextPath?: string) {
  const target = nextPath
    ? `/auth?next=${encodeURIComponent(nextPath)}`
    : '/auth';
  router.push(target as any);
}

/**
 * Hard-stop modal shown when an anonymous user hits a demo limit
 * (10th word save attempt, 2nd wordlist creation, etc). Routes to
 * /auth?next=<currentPath> so the user resumes where they were after
 * signup. The migration logic in _layout.tsx preserves their local
 * SQLite work.
 */
export function SignupCTAModal({
  visible,
  title,
  message,
  ctaLabel,
  nextPath,
  onClose,
}: {
  visible: boolean;
  title: string;
  message: string;
  ctaLabel: string;
  nextPath?: string;
  onClose: () => void;
}) {
  const colorScheme = useColorScheme();
  const dark = colorScheme === 'dark';
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 24,
        }}
      >
        {/* stopPropagation: tapping inside the card shouldn't dismiss */}
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          style={{
            width: '100%',
            maxWidth: 360,
            backgroundColor: dark ? '#1E1B15' : '#FCFBF7',
            borderRadius: 20,
            padding: 24,
          }}
        >
          <Text
            style={{
              fontSize: 20,
              fontWeight: '700',
              color: dark ? '#F1ECE2' : '#2A2620',
              textAlign: 'center',
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              marginTop: 8,
              fontSize: 14,
              color: '#A79E90',
              textAlign: 'center',
            }}
          >
            {message}
          </Text>

          <Pressable
            onPress={() => {
              onClose();
              gotoAuth(nextPath);
            }}
            style={{
              marginTop: 20,
              backgroundColor: '#2EC4A5',
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#0a0a0a' }}>
              {ctaLabel}
            </Text>
          </Pressable>

          <Pressable
            onPress={onClose}
            style={{ marginTop: 8, paddingVertical: 12, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 14, color: '#A79E90' }}>
              {t('anon.maybe_later')}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Lightweight inline banner shown above the wordlist after the first
 * anonymous save. Dismissible (X button) and gated by AsyncStorage so
 * it only ever surfaces once per device. Non-blocking — does NOT route
 * to auth; tapping the body opens auth, X just hides it.
 */
export function SignupCTABanner({
  message,
  onDismiss,
  nextPath,
}: {
  message: string;
  onDismiss: () => void;
  nextPath?: string;
}) {
  const colorScheme = useColorScheme();
  const dark = colorScheme === 'dark';
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 12,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: dark ? '#2A2620' : '#FFF7DC',
        borderColor: dark ? '#3A3528' : '#F1E7B3',
        borderWidth: 1,
        borderRadius: 12,
        paddingVertical: 10,
        paddingLeft: 14,
        paddingRight: 6,
        gap: 8,
      }}
    >
      <Pressable
        onPress={() => gotoAuth(nextPath)}
        style={{ flex: 1, paddingVertical: 2 }}
      >
        <Text style={{ fontSize: 13, color: dark ? '#F1ECE2' : '#2A2620', lineHeight: 18 }}>
          {message}
        </Text>
      </Pressable>
      <Pressable
        onPress={onDismiss}
        hitSlop={12}
        accessibilityLabel="dismiss"
        style={{ padding: 6 }}
      >
        <MaterialIcons name="close" size={18} color={dark ? '#A79E90' : '#7B7366'} />
      </Pressable>
    </View>
  );
}
