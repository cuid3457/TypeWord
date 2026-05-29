import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { BottomSheetShell } from '@/components/bottom-sheet-shell';
import {
  FriendsError,
  searchUsers,
  sendFriendRequest,
  type UserSearchResult,
} from '@src/services/friendsService';

/**
 * Replaces the friend-code input flow. User types @username, sees prefix
 * match results live, taps "친구 요청" to send. Recipient must accept.
 */
export function AddFriendByUsernameModal({
  visible,
  onClose,
  onRequestSent,
  onAutoAccepted,
  onError,
}: {
  visible: boolean;
  onClose: () => void;
  onRequestSent: (username: string) => void;
  onAutoAccepted: (username: string) => void;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [pendingByUserId, setPendingByUserId] = useState<Record<string, boolean>>({});
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ msg: string; tone: 'ok' | 'error' } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setResults([]);
      setPendingByUserId({});
      setBusyUserId(null);
      setStatusMsg(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!statusMsg) return;
    const id = setTimeout(() => setStatusMsg(null), 3000);
    return () => clearTimeout(id);
  }, [statusMsg]);

  const runSearch = useCallback(async (q: string) => {
    if (!q || q.length < 1) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = ++seqRef.current;
    try {
      const list = await searchUsers(q);
      if (seq !== seqRef.current) return;
      setResults(list);
      setPendingByUserId((prev) => {
        const next = { ...prev };
        for (const r of list) {
          if (r.hasPendingRequest) next[r.userId] = true;
        }
        return next;
      });
    } catch {
      if (seq !== seqRef.current) return;
      setResults([]);
    } finally {
      if (seq === seqRef.current) setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  const send = async (item: UserSearchResult) => {
    if (busyUserId) return;
    setBusyUserId(item.userId);
    setStatusMsg(null);
    try {
      const res = await sendFriendRequest(item.username);
      setPendingByUserId((p) => ({ ...p, [item.userId]: true }));
      if (res.autoAccepted) {
        onAutoAccepted(item.username);
      } else {
        // Inline confirmation — iOS Modal renders above the parent's Toast,
        // so the request_sent_toast in dashboard isn't visible while this
        // modal is up. Show success here AND let parent know.
        setStatusMsg({ msg: t('dashboard.request_sent_toast', { username: item.username }), tone: 'ok' });
        onRequestSent(item.username);
      }
    } catch (e) {
      let msg = t('error.title');
      if (e instanceof FriendsError) {
        if (e.code === 'self') msg = t('dashboard.error_self');
        else if (e.code === 'not_found') msg = t('dashboard.error_not_found');
        else if (e.code === 'already_friends') msg = t('dashboard.error_already_friends');
        else if (e.code === 'must_sign_up') msg = t('dashboard.signup_required');
        else msg = `[${e.code}] ${e.message}`;
      } else if (e instanceof Error) {
        msg = `[error] ${e.message}`;
      }
      setStatusMsg({ msg, tone: 'error' });
      onError(msg);
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <BottomSheetShell visible={visible} onRequestClose={onClose} animationType="fade">
      <Pressable onPress={onClose} className="flex-1 items-center justify-center bg-black/50 px-6">
        <Pressable onPress={(e) => e.stopPropagation?.()} className="w-full max-w-md rounded-2xl bg-surface p-5 dark:bg-surface-dark">
          <Text className="text-lg font-bold text-ink dark:text-ink-dark">
            {t('dashboard.add_friend_title')}
          </Text>
          <Text className="mt-1 text-sm text-muted">
            {t('dashboard.add_friend_hint_username')}
          </Text>
          <View className="mt-4 flex-row items-center rounded-xl border border-line px-3 dark:border-line-dark">
            <Text className="text-base text-faint">@</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('dashboard.search_username_placeholder')}
              placeholderTextColor="#A79E90"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
              autoFocus
              className="ml-1 flex-1 py-2.5 text-base text-ink dark:text-ink-dark"
            />
            {searching ? <ActivityIndicator size="small" color="#A79E90" /> : null}
          </View>

          <View className="mt-4" style={{ minHeight: 60, maxHeight: 320 }}>
            {results.length === 0 && !searching && query.length > 0 ? (
              <View className="items-center py-6">
                <MaterialIcons name="search-off" size={32} color="#A79E90" />
                <Text className="mt-2 text-sm text-muted">
                  {t('dashboard.no_search_results')}
                </Text>
              </View>
            ) : null}
            {results.map((item) => {
              const pending = pendingByUserId[item.userId];
              return (
                <View key={item.userId} className="flex-row items-center py-2">
                  <View className="h-9 w-9 items-center justify-center rounded-full bg-clay dark:bg-clay-dark">
                    <Text className="text-sm font-bold text-muted">
                      {(item.displayName || item.username).charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View className="ml-3 flex-1">
                    {item.displayName ? (
                      <Text className="text-sm font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
                        {item.displayName}
                      </Text>
                    ) : null}
                    <Text className="text-xs text-muted" numberOfLines={1}>
                      @{item.username}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => !pending && send(item)}
                    disabled={pending || busyUserId === item.userId}
                    className={`rounded-lg px-3 py-1.5 ${
                      pending ? 'bg-clay dark:bg-clay-dark' : 'bg-ink dark:bg-ink-dark'
                    }`}
                  >
                    {busyUserId === item.userId ? (
                      <ActivityIndicator size="small" color={pending ? '#A79E90' : '#fff'} />
                    ) : (
                      <Text className={`text-xs font-semibold ${
                        pending ? 'text-muted' : 'text-canvas dark:text-canvas-dark'
                      }`}>
                        {pending ? t('dashboard.request_sent') : t('dashboard.send_request')}
                      </Text>
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>

          {statusMsg ? (
            <View
              className={`mt-3 rounded-xl px-3 py-2 ${
                statusMsg.tone === 'ok'
                  ? 'bg-accent-soft dark:bg-accent-soft-dark'
                  : 'bg-danger-soft dark:bg-danger-soft-dark'
              }`}
            >
              <Text
                className={`text-xs ${
                  statusMsg.tone === 'ok'
                    ? 'text-accent-deep dark:text-accent'
                    : 'text-danger'
                }`}
              >
                {statusMsg.msg}
              </Text>
            </View>
          ) : null}

          <Pressable onPress={onClose} className="mt-3 items-center py-2">
            <Text className="text-sm text-muted">{t('common.close')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </BottomSheetShell>
  );
}
