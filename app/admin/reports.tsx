/**
 * Admin — Phase 8 report fix review queue.
 *
 * Lists report_fixes with status='pending_review'. Each item shows:
 *  - word + lang pair + report count
 *  - judge verdict + confidence + reasoning
 *  - original entry snapshot
 *  - 1-click Approve / Reject buttons
 *
 * Access: gated by hardcoded admin email check (대표님). Anyone else gets
 * "Access denied".
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TabletContainer } from '@/components/tablet-container';
import { supabase } from '@src/api/supabase';

const ADMIN_EMAILS = new Set(['junesung07@gmail.com']);

interface ReportFix {
  id: string;
  word: string;
  source_lang: string;
  target_lang: string;
  report_count: number;
  judge_verdict: string;
  judge_confidence: number;
  judge_reasoning: string;
  original_result: Record<string, unknown> | null;
  status: string;
  created_at: string;
}

export default function AdminReportsScreen() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ReportFix[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email ?? '';
      setIsAdmin(ADMIN_EMAILS.has(email));
    })();
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('report_fixes')
      .select('id, word, source_lang, target_lang, report_count, judge_verdict, judge_confidence, judge_reasoning, original_result, status, created_at')
      .eq('status', 'pending_review')
      .order('created_at', { ascending: false })
      .limit(100);
    setItems((data ?? []) as ReportFix[]);
    setLoading(false);
  }, []);

  useEffect(() => { if (isAdmin) refresh(); }, [isAdmin, refresh]);

  const approve = async (item: ReportFix) => {
    setBusyId(item.id);
    await supabase.from('report_fixes').update({
      status: 'manually_applied',
      applied_at: new Date().toISOString(),
    }).eq('id', item.id);
    setBusyId(null);
    refresh();
  };
  const reject = async (item: ReportFix) => {
    setBusyId(item.id);
    await supabase.from('report_fixes').update({ status: 'rejected' }).eq('id', item.id);
    setBusyId(null);
    refresh();
  };

  if (isAdmin === null) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white dark:bg-black">
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color="#6b7280" />
      </SafeAreaView>
    );
  }
  if (!isAdmin) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white dark:bg-black">
        <Stack.Screen options={{ headerShown: false }} />
        <Text className="text-base text-gray-500">Access denied.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-black">
      <Stack.Screen options={{ headerShown: false }} />
      <TabletContainer>
      <View className="mb-2 h-11 flex-row items-center px-4">
        <Pressable onPress={() => router.back()} className="mr-2 p-1">
          <MaterialIcons name="arrow-back" size={24} color="#6b7280" />
        </Pressable>
        <Text className="text-base font-semibold text-black dark:text-white">Report Review ({items.length})</Text>
        <Pressable onPress={refresh} className="ml-auto p-1">
          <MaterialIcons name="refresh" size={22} color="#6b7280" />
        </Pressable>
      </View>
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#6b7280" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
          renderItem={({ item }) => (
            <View className="mb-3 rounded-xl border border-gray-200 p-3 dark:border-gray-800">
              <View className="mb-1 flex-row items-center">
                <Text className="text-base font-semibold text-black dark:text-white">{item.word}</Text>
                <Text className="ml-2 text-xs text-gray-500">{item.source_lang} → {item.target_lang}</Text>
                <View
                  className={`ml-auto rounded px-2 py-0.5 ${
                    item.judge_verdict === 'VALID' ? 'bg-emerald-100 dark:bg-emerald-900'
                      : item.judge_verdict === 'BORDERLINE' ? 'bg-amber-100 dark:bg-amber-900'
                      : 'bg-gray-100 dark:bg-gray-800'
                  }`}
                >
                  <Text className="text-xs">{item.judge_verdict} {item.judge_confidence}</Text>
                </View>
              </View>
              <Text className="mb-2 text-xs text-gray-500">{item.report_count} report(s)</Text>
              <ScrollView className="mb-2 max-h-32 rounded bg-gray-50 p-2 dark:bg-gray-900">
                <Text className="text-xs text-gray-600 dark:text-gray-400">{item.judge_reasoning}</Text>
              </ScrollView>
              <Text className="mb-2 text-xs text-gray-500" numberOfLines={4}>
                {JSON.stringify(item.original_result, null, 0).slice(0, 240)}
              </Text>
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => approve(item)}
                  disabled={busyId !== null}
                  className="flex-1 items-center rounded-lg bg-[#2EC4A5] py-2"
                >
                  {busyId === item.id ? <ActivityIndicator color="#fff" /> : <Text className="font-medium text-white">Approve & Regen</Text>}
                </Pressable>
                <Pressable
                  onPress={() => reject(item)}
                  disabled={busyId !== null}
                  className="flex-1 items-center rounded-lg bg-red-500 py-2"
                >
                  <Text className="font-medium text-white">Reject</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
      </TabletContainer>
    </SafeAreaView>
  );
}
