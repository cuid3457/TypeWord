import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Share,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Toast } from '@/components/toast';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getStreak, getStudiedDates, getTodayStreakDate, type StreakInfo } from '@src/services/streakService';
import { getLevel, getTotalXP, subscribeXP } from '@src/services/xpService';
import {
  addFriendByCode,
  blockUser,
  ensureFriendCode,
  FriendsError,
  getMyProfile,
  listFriends,
  removeFriend,
  reportUser,
  setDisplayName,
  type FriendRow,
  type MyProfile,
} from '@src/services/friendsService';

export default function DashboardScreen() {
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const dark = colorScheme === 'dark';

  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [streak, setStreak] = useState<StreakInfo | null>(null);
  const [studiedDates, setStudiedDates] = useState<Set<string>>(new Set());
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [totalXP, setTotalXP] = useState<number>(getTotalXP());

  useEffect(() => {
    const unsub = subscribeXP(setTotalXP);
    return unsub;
  }, []);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState<FriendRow | null>(null);
  const [showNameModal, setShowNameModal] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const p = await getMyProfile();
      setProfile(p);
      const s = await getStreak().catch(() => null);
      setStreak(s);
      // Fetch ~2 years so the user can scroll back through old months in the
      // dashboard calendar without going past the available data window.
      const days = await getStudiedDates(730).catch(() => new Set<string>());
      setStudiedDates(days);
      if (p && !p.isAnonymous) {
        const f = await listFriends().catch(() => []);
        setFriends(f);
      } else {
        setFriends([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    refresh();
  }, [refresh]));

  const copyCode = useCallback(async () => {
    if (!profile?.friendCode) return;
    await Clipboard.setStringAsync(profile.friendCode);
    setToast(t('dashboard.code_copied'));
  }, [profile?.friendCode, t]);

  const inviteFriends = useCallback(async () => {
    if (!profile?.friendCode) return;
    const name = profile.displayName || t('dashboard.unnamed');
    const message = t('dashboard.invite_message', {
      name,
      code: profile.friendCode,
      link: `typeword://invite/${profile.friendCode}`,
    });
    try {
      await Share.share({ message });
    } catch {
      // user cancelled / share unavailable — silent
    }
  }, [profile?.friendCode, profile?.displayName, t]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white dark:bg-black">
        <ActivityIndicator color="#6b7280" />
      </SafeAreaView>
    );
  }

  const isAnon = profile?.isAnonymous ?? true;
  const hasFriendCode = !!profile?.friendCode;
  // Nickname concept is only surfaced once the user has opted into the friend
  // system (= generated a code). Before that, the profile card shows stats
  // only; the "친구 코드 받기" button leads to a combined nickname + code
  // generation flow. Anonymous users see a "Guest" placeholder + signup CTA.
  const displayName = profile?.displayName || t('dashboard.unnamed');
  const avatarLetter = hasFriendCode
    ? displayName.charAt(0).toUpperCase()
    : isAnon
      ? t('dashboard.guest').charAt(0).toUpperCase()
      : '?';

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black" edges={['top', 'left', 'right']}>
      <FlatList
        data={isAnon ? [] : friends}
        keyExtractor={(f) => f.friendId}
        contentContainerStyle={{ padding: 24, paddingBottom: 80 + insets.bottom }}
        ListHeaderComponent={
          <View>
            <Text className="text-3xl font-bold text-black dark:text-white">
              {t('dashboard.title')}
            </Text>

            {/* My Profile Card */}
            <View className="mt-6 rounded-2xl border border-gray-300 p-4 dark:border-gray-700">
              <View className="flex-row items-center">
                <View className="h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: hasFriendCode ? '#2EC4A5' : '#9ca3af' }}>
                  <Text className="text-2xl font-bold text-white">
                    {avatarLetter}
                  </Text>
                </View>
                <View className="ml-3 flex-1">
                  {isAnon ? (
                    <Text className="text-lg font-bold text-black dark:text-white">
                      {t('dashboard.guest')}
                    </Text>
                  ) : hasFriendCode ? (
                    <>
                      <Pressable onPress={() => setShowNameModal(true)} className="flex-row items-center">
                        <Text className="text-lg font-bold text-black dark:text-white">
                          {displayName}
                        </Text>
                        <MaterialIcons name="edit" size={14} color="#9ca3af" style={{ marginLeft: 6 }} />
                      </Pressable>
                      <Text className="mt-0.5 text-xs text-gray-500">
                        {t('dashboard.my_code', { code: profile?.friendCode })}
                      </Text>
                    </>
                  ) : (
                    <Text className="text-sm text-gray-500">
                      {t('dashboard.tap_to_get_code')}
                    </Text>
                  )}
                </View>
                {!isAnon && hasFriendCode ? (
                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={inviteFriends}
                      className="flex-row items-center rounded-lg bg-black px-3 py-2 dark:bg-white"
                      accessibilityLabel={t('dashboard.invite_cta')}
                      accessibilityRole="button"
                    >
                      <MaterialIcons name="person-add" size={16} color={dark ? '#000' : '#fff'} />
                      <Text className="ml-1 text-xs font-semibold text-white dark:text-black">
                        {t('dashboard.invite_cta')}
                      </Text>
                    </Pressable>
                    <Pressable onPress={copyCode} className="rounded-lg bg-gray-100 p-2 dark:bg-gray-800">
                      <MaterialIcons name="content-copy" size={18} color="#6b7280" />
                    </Pressable>
                  </View>
                ) : null}
                {!isAnon && !hasFriendCode ? (
                  <Pressable onPress={() => setShowSetupModal(true)} className="rounded-lg bg-black px-3 py-2 dark:bg-white">
                    <Text className="text-xs font-semibold text-white dark:text-black">
                      {t('dashboard.generate_code')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {/* Stats row */}
              <View className="mt-4 flex-row flex-wrap gap-2">
                <StatChip icon="🔥" value={streak?.current ?? 0} label={t('dashboard.stat_streak_short')} />
                <StatChip icon="⭐" value={getLevel(totalXP).level} label="Lv" />
              </View>
              {/* Level progress bar */}
              {(() => {
                const info = getLevel(totalXP);
                return (
                  <View className="mt-3">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs text-gray-500">
                        {totalXP.toLocaleString()} XP
                      </Text>
                      <Text className="text-xs text-gray-400">
                        {info.currentLevelXP} / {info.nextLevelXP}
                      </Text>
                    </View>
                    <View className="mt-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-800">
                      <View
                        className="h-1.5 rounded-full bg-emerald-500"
                        style={{ width: `${Math.round(info.progress * 100)}%` }}
                      />
                    </View>
                  </View>
                );
              })()}
            </View>

            {/* Monthly study calendar. Studied days are mint-filled; today
                gets a mint ring. Tap < > to scroll through past/future
                months — past data covers ~2 years (see getStudiedDates). */}
            <View className="mt-6 rounded-2xl border border-gray-300 p-4 dark:border-gray-700">
              <Text className="text-sm font-semibold text-black dark:text-white">
                {t('dashboard.activity_title')}
              </Text>
              <ActivityCalendar studiedDates={studiedDates} dark={dark} />
            </View>

            {/* Friends section — gated for anonymous users */}
            {isAnon ? (
              <View className="mt-6 items-center rounded-2xl border border-dashed border-gray-300 p-6 dark:border-gray-700">
                <MaterialIcons name="people-outline" size={40} color="#9ca3af" />
                <Text className="mt-3 text-center text-base font-semibold text-black dark:text-white">
                  {t('dashboard.signup_title')}
                </Text>
                <Text className="mt-1 text-center text-sm text-gray-500">
                  {t('dashboard.signup_message')}
                </Text>
                <Pressable
                  onPress={() => router.push('/auth')}
                  className="mt-4 rounded-xl bg-black px-6 py-3 dark:bg-white"
                >
                  <Text className="text-sm font-semibold text-white dark:text-black">
                    {t('dashboard.signup_cta')}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View className="mt-6 flex-row items-center justify-between">
                <Text className="text-base font-semibold text-black dark:text-white">
                  {t('dashboard.friends_count', { count: friends.length })}
                </Text>
                <Pressable
                  onPress={() => setShowAddModal(true)}
                  className="flex-row items-center rounded-lg bg-black px-3 py-1.5 dark:bg-white"
                >
                  <MaterialIcons name="person-add" size={16} color={dark ? '#000' : '#fff'} />
                  <Text className="ml-1 text-xs font-semibold text-white dark:text-black">
                    {t('dashboard.add_friend')}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onLongPress={() => setShowActionMenu(item)}
            className="mt-3 rounded-2xl border border-gray-300 p-4 dark:border-gray-700"
          >
            <View className="flex-row items-center">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-800">
                <Text className="text-base font-bold text-gray-600 dark:text-gray-300">
                  {item.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text className="ml-3 flex-1 text-base font-semibold text-black dark:text-white">
                {item.displayName}
              </Text>
            </View>
            {item.statsPublic ? (
              <View className="mt-3 flex-row gap-2">
                <StatChip icon="📚" label={t('dashboard.stat_words_short')} value={item.totalWords} />
                <StatChip icon="✨" label={t('dashboard.stat_mastered_short')} value={item.masteredWords} />
                <StatChip icon="🌍" label={t('dashboard.stat_langs_short')} value={item.languageCount} />
              </View>
            ) : (
              <Text className="mt-2 text-xs text-gray-400">{t('dashboard.stats_hidden')}</Text>
            )}
          </Pressable>
        )}
        ListEmptyComponent={
          !isAnon && friends.length === 0 ? (
            <View className="mt-8 items-center px-8">
              <MaterialIcons name="people-outline" size={48} color="#9ca3af" />
              <Text className="mt-3 text-center text-sm text-gray-500">
                {t('dashboard.empty')}
              </Text>
            </View>
          ) : null
        }
      />

      <Toast visible={!!toast} message={toast} onHide={() => setToast('')} />

      <AddFriendModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={(name) => {
          setShowAddModal(false);
          setToast(t('dashboard.added', { name: name || t('dashboard.unnamed') }));
          refresh();
        }}
        onError={(message) => setToast(message)}
      />

      <NameModal
        visible={showNameModal}
        currentName={profile?.displayName ?? ''}
        onClose={() => setShowNameModal(false)}
        onSaved={() => {
          setShowNameModal(false);
          refresh();
        }}
      />

      <SetupFriendModal
        visible={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        onSuccess={() => {
          setShowSetupModal(false);
          setToast(t('dashboard.code_ready'));
          refresh();
        }}
        onError={() => setToast(t('error.title'))}
      />

      <ActionMenu
        friend={showActionMenu}
        onClose={() => setShowActionMenu(null)}
        onUnfriend={async (id) => {
          await removeFriend(id);
          setShowActionMenu(null);
          setToast(t('dashboard.unfriended'));
          refresh();
        }}
        onBlock={async (id) => {
          await blockUser(id);
          setShowActionMenu(null);
          setToast(t('dashboard.blocked'));
          refresh();
        }}
        onReport={async (id) => {
          await reportUser(id, 'inappropriate');
          setShowActionMenu(null);
          setToast(t('dashboard.reported'));
        }}
      />
    </SafeAreaView>
  );
}

/**
 * Monthly calendar showing which days the user studied. Standard
 * weekday-grid layout (Sun-first) with prev/next month navigation. Studied
 * days are filled mint; today has a mint ring; days outside the displayed
 * month are dimmed.
 */
function ActivityCalendar({ studiedDates, dark }: { studiedDates: Set<string>; dark: boolean }) {
  const { i18n } = useTranslation();
  const today = getTodayStreakDate();
  const todayDate = new Date(`${today}T00:00:00`);

  const [cursor, setCursor] = useState(() => ({
    year: todayDate.getFullYear(),
    month: todayDate.getMonth(), // 0-indexed
  }));

  const lang = i18n.language || 'en';
  const monthLabel = useMemo(() => {
    const d = new Date(cursor.year, cursor.month, 1);
    return d.toLocaleDateString(lang, { year: 'numeric', month: 'long' });
  }, [cursor, lang]);

  const weekdayLabels = useMemo(() => {
    // Sunday-first; render localized narrow weekday names.
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(2024, 0, 7 + i); // Jan 7 2024 = Sunday
      return d.toLocaleDateString(lang, { weekday: 'narrow' });
    });
  }, [lang]);

  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const startOffset = first.getDay(); // 0 = Sunday, 6 = Saturday
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
    return Array.from({ length: totalCells }, (_, idx) => {
      const dayNum = idx - startOffset + 1;
      const d = new Date(cursor.year, cursor.month, dayNum);
      const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${dd}`;
      return {
        dateStr,
        dayNum: d.getDate(),
        inMonth,
        studied: inMonth && studiedDates.has(dateStr),
        isToday: dateStr === today,
        isFuture: d.getTime() > todayDate.getTime(),
      };
    });
  }, [cursor, studiedDates, today, todayDate]);

  const goPrev = () => setCursor((c) => {
    const m = c.month - 1;
    return m < 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: m };
  });
  const goNext = () => setCursor((c) => {
    const m = c.month + 1;
    return m > 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: m };
  });

  const studiedBg = '#2EC4A5';
  const cellBg = dark ? '#1f2937' : '#f3f4f6';

  return (
    <View className="mt-3">
      <View className="flex-row items-center justify-between">
        <Pressable onPress={goPrev} hitSlop={10} className="p-1">
          <MaterialIcons name="chevron-left" size={22} color="#6b7280" />
        </Pressable>
        <Text className="text-sm font-semibold text-black dark:text-white">
          {monthLabel}
        </Text>
        <Pressable onPress={goNext} hitSlop={10} className="p-1">
          <MaterialIcons name="chevron-right" size={22} color="#6b7280" />
        </Pressable>
      </View>

      <View className="mt-2 flex-row">
        {weekdayLabels.map((w, i) => (
          <View key={i} className="flex-1 items-center py-1">
            <Text className="text-xs font-medium text-gray-400">{w}</Text>
          </View>
        ))}
      </View>

      <View className="flex-row flex-wrap">
        {cells.map((cell, idx) => {
          if (!cell.inMonth) {
            return <View key={idx} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
          }
          const filled = cell.studied;
          return (
            <View key={idx} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
              <View
                className="flex-1 items-center justify-center rounded-full"
                style={{
                  backgroundColor: filled ? studiedBg : cell.isFuture ? 'transparent' : cellBg,
                  borderWidth: cell.isToday ? 2 : 0,
                  borderColor: cell.isToday ? studiedBg : 'transparent',
                  opacity: cell.isFuture ? 0.4 : 1,
                }}
              >
                <Text
                  className="text-xs font-medium"
                  style={{ color: filled ? '#ffffff' : dark ? '#e5e7eb' : '#374151' }}
                >
                  {cell.dayNum}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function StatChip({ icon, label, value, dimmed }: {
  icon: string;
  label?: string;
  value: number | null;
  dimmed?: boolean;
}) {
  return (
    <View className={`flex-row items-center rounded-lg bg-gray-100 px-3 py-1.5 dark:bg-gray-800 ${dimmed ? 'opacity-50' : ''}`}>
      <Text className="text-base">{icon}</Text>
      <Text className="ml-1 text-sm font-semibold text-black dark:text-white">
        {value ?? '—'}
      </Text>
      {label ? (
        <Text className="ml-1 text-xs text-gray-500">{label}</Text>
      ) : null}
    </View>
  );
}

function AddFriendModal({ visible, onClose, onSuccess, onError }: {
  visible: boolean;
  onClose: () => void;
  onSuccess: (name: string | null) => void;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) setCode('');
  }, [visible]);

  const submit = async () => {
    if (!code.trim() || submitting) return;
    setSubmitting(true);
    try {
      await addFriendByCode(code);
      onSuccess(null);
    } catch (e) {
      if (e instanceof FriendsError) {
        if (e.code === 'self') onError(t('dashboard.error_self'));
        else if (e.code === 'not_found') onError(t('dashboard.error_not_found'));
        else if (e.code === 'must_sign_up') onError(t('dashboard.signup_required'));
        else onError(t('error.title'));
      } else {
        onError(t('error.title'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 items-center justify-center bg-black/50 px-6">
        <Pressable onPress={(e) => e.stopPropagation?.()} className="w-full max-w-sm rounded-2xl bg-white p-6 dark:bg-gray-900">
          <Text className="text-lg font-bold text-black dark:text-white">
            {t('dashboard.add_friend_title')}
          </Text>
          <Text className="mt-1 text-sm text-gray-500">
            {t('dashboard.add_friend_hint')}
          </Text>
          <TextInput
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase().slice(0, 6))}
            placeholder="ABC123"
            placeholderTextColor="#9ca3af"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            className="mt-4 rounded-xl border border-gray-300 px-4 py-3 text-center text-xl font-semibold tracking-widest text-black dark:border-gray-700 dark:text-white"
          />
          <Pressable
            onPress={submit}
            disabled={code.length < 4 || submitting}
            className={`mt-4 items-center rounded-xl py-4 ${
              code.length < 4 || submitting ? 'bg-gray-300 dark:bg-gray-700' : 'bg-black dark:bg-white'
            }`}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className={`text-base font-semibold ${
                code.length < 4 ? 'text-gray-400' : 'text-white dark:text-black'
              }`}>
                {t('dashboard.add')}
              </Text>
            )}
          </Pressable>
          <Pressable onPress={onClose} className="mt-2 items-center py-2">
            <Text className="text-sm text-gray-500">{t('common.cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function NameModal({ visible, currentName, onClose, onSaved }: {
  visible: boolean;
  currentName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) setName(currentName);
  }, [visible, currentName]);

  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await setDisplayName(name);
      onSaved();
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 items-center justify-center bg-black/50 px-6">
        <Pressable onPress={(e) => e.stopPropagation?.()} className="w-full max-w-sm rounded-2xl bg-white p-6 dark:bg-gray-900">
          <Text className="text-lg font-bold text-black dark:text-white">
            {t('dashboard.name_title')}
          </Text>
          <Text className="mt-1 text-sm text-gray-500">
            {t('dashboard.name_hint')}
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('dashboard.name_placeholder')}
            placeholderTextColor="#9ca3af"
            maxLength={20}
            className="mt-4 rounded-xl border border-gray-300 px-4 py-3 text-base text-black dark:border-gray-700 dark:text-white"
          />
          <Pressable
            onPress={submit}
            disabled={!name.trim() || saving}
            className={`mt-4 items-center rounded-xl py-4 ${
              !name.trim() || saving ? 'bg-gray-300 dark:bg-gray-700' : 'bg-black dark:bg-white'
            }`}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className={`text-base font-semibold ${
                !name.trim() ? 'text-gray-400' : 'text-white dark:text-black'
              }`}>
                {t('common.save')}
              </Text>
            )}
          </Pressable>
          <Pressable onPress={onClose} className="mt-2 items-center py-2">
            <Text className="text-sm text-gray-500">{t('common.cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SetupFriendModal({ visible, onClose, onSuccess, onError }: {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onError: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) setName('');
  }, [visible]);

  const submit = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      // Save nickname first so the friend code, once generated, is already
      // attached to a non-empty display name visible to friends.
      await setDisplayName(name);
      const code = await ensureFriendCode();
      if (!code) throw new Error('no code');
      onSuccess();
    } catch {
      onError();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 items-center justify-center bg-black/50 px-6">
        <Pressable onPress={(e) => e.stopPropagation?.()} className="w-full max-w-sm rounded-2xl bg-white p-6 dark:bg-gray-900">
          <Text className="text-lg font-bold text-black dark:text-white">
            {t('dashboard.setup_title')}
          </Text>
          <Text className="mt-1 text-sm text-gray-500">
            {t('dashboard.setup_hint')}
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('dashboard.name_placeholder')}
            placeholderTextColor="#9ca3af"
            maxLength={20}
            autoFocus
            className="mt-4 rounded-xl border border-gray-300 px-4 py-3 text-base text-black dark:border-gray-700 dark:text-white"
          />
          <Pressable
            onPress={submit}
            disabled={!name.trim() || submitting}
            className={`mt-4 items-center rounded-xl py-4 ${
              !name.trim() || submitting ? 'bg-gray-300 dark:bg-gray-700' : 'bg-black dark:bg-white'
            }`}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className={`text-base font-semibold ${
                !name.trim() ? 'text-gray-400' : 'text-white dark:text-black'
              }`}>
                {t('dashboard.setup_cta')}
              </Text>
            )}
          </Pressable>
          <Pressable onPress={onClose} className="mt-2 items-center py-2">
            <Text className="text-sm text-gray-500">{t('common.cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ActionMenu({ friend, onClose, onUnfriend, onBlock, onReport }: {
  friend: FriendRow | null;
  onClose: () => void;
  onUnfriend: (id: string) => void;
  onBlock: (id: string) => void;
  onReport: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (!friend) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 items-end justify-end bg-black/50">
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          className="w-full rounded-t-3xl bg-white p-6 dark:bg-gray-900"
          style={{ paddingBottom: 32 }}
        >
          <View className="mb-3 items-center">
            <View className="h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />
          </View>
          <Text className="text-lg font-bold text-black dark:text-white">
            {friend.displayName}
          </Text>
          <Pressable onPress={() => onUnfriend(friend.friendId)} className="mt-4 flex-row items-center py-3">
            <MaterialIcons name="person-remove" size={22} color="#6b7280" />
            <Text className="ml-3 text-base text-black dark:text-white">{t('dashboard.unfriend')}</Text>
          </Pressable>
          <Pressable onPress={() => onBlock(friend.friendId)} className="flex-row items-center py-3">
            <MaterialIcons name="block" size={22} color="#ef4444" />
            <Text className="ml-3 text-base text-red-500">{t('dashboard.block')}</Text>
          </Pressable>
          <Pressable onPress={() => onReport(friend.friendId)} className="flex-row items-center py-3">
            <MaterialIcons name="flag" size={22} color="#ef4444" />
            <Text className="ml-3 text-base text-red-500">{t('dashboard.report')}</Text>
          </Pressable>
          <Pressable onPress={onClose} className="mt-3 items-center py-3">
            <Text className="text-sm text-gray-500">{t('common.cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
