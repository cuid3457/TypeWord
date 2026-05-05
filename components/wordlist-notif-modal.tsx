import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  Modal,
  Pressable,
  Switch,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Toast } from '@/components/toast';

interface Props {
  visible: boolean;
  bookTitle: string;
  initialEnabled: boolean;
  initialHour: number | null;
  initialMinute: number;
  initialDays: number;
  defaultHour: number;
  onClose: () => void;
  onSave: (enabled: boolean, hour: number, minute: number, days: number) => Promise<void> | void;
}

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const CENTER_OFFSET = ITEM_HEIGHT * 2;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 0, 5, 10, ..., 55

export function WordlistNotifModal({
  visible,
  bookTitle,
  initialEnabled,
  initialHour,
  initialMinute,
  initialDays,
  defaultHour,
  onClose,
  onSave,
}: Props) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [hour, setHour] = useState(initialHour ?? defaultHour);
  const [minute, setMinute] = useState(initialMinute);
  const [days, setDays] = useState(initialDays);
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => {
    if (visible) {
      setEnabled(initialEnabled);
      // For a fresh book (never had alerts enabled, days still at default
      // every-day mask 127): default to "today only" + the current time
      // floored to the nearest 5-minute step. Flooring (not rounding) means
      // 23:28 → 23:25, so the notification fires today rather than rolling
      // to tomorrow. Users with custom settings keep what they had.
      if (!initialEnabled && initialDays === 127) {
        const now = new Date();
        setHour(now.getHours());
        setMinute(Math.floor(now.getMinutes() / 5) * 5);
        setDays(1 << now.getDay());
      } else {
        setHour(initialHour ?? defaultHour);
        setMinute(Math.round(initialMinute / 5) * 5);
        setDays(initialDays);
      }
    }
  }, [visible, initialEnabled, initialHour, initialMinute, initialDays, defaultHour]);

  const canSave = !enabled || days > 0;

  const handleSave = async () => {
    if (!canSave) {
      setToastMsg(t('wordlist.notif_no_days'));
      return;
    }
    setSaving(true);
    try {
      await onSave(enabled, hour, minute, days);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (dayIdx: number) => {
    setDays((prev) => prev ^ (1 << dayIdx));
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <Pressable
          onPress={onClose}
          className="absolute inset-0"
        />
        <View
          className="rounded-t-3xl bg-white pt-2 dark:bg-gray-900"
          style={{ paddingBottom: Math.max(insets.bottom, 16) + 16 }}
        >
          <View className="mx-auto mt-1 mb-3 h-1 w-12 rounded-full bg-gray-300 dark:bg-gray-600" />
          <View className="px-6">
            <Text className="text-xl font-bold text-black dark:text-white" numberOfLines={2}>
              {t('wordlist.notif_title', { title: bookTitle })}
            </Text>

            <View className="mt-4 flex-row items-center justify-between rounded-xl border border-gray-300 p-4 dark:border-gray-700">
              <Text className="text-base text-black dark:text-white">
                {t('wordlist.notif_enable')}
              </Text>
              <Switch
                value={enabled}
                onValueChange={setEnabled}
                trackColor={{ false: '#d1d5db', true: '#A7E8D8' }}
                thumbColor={enabled ? '#2EC4A5' : '#f4f4f5'}
              />
            </View>

            {enabled ? (
              <>
                <DaySelector days={days} onToggle={toggleDay} lang={i18n.language} />
                <View className="mt-3 rounded-xl border border-gray-300 px-4 pt-3 pb-4 dark:border-gray-700">
                  <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {t('wordlist.notif_hour')}
                  </Text>
                  <TimePickerWheels
                    hour={hour}
                    minute={minute}
                    onHourChange={setHour}
                    onMinuteChange={setMinute}
                  />
                </View>
              </>
            ) : null}

            <View className="mt-6 flex-row gap-3">
              <Pressable
                onPress={onClose}
                className="flex-1 items-center rounded-xl border border-gray-300 py-3 dark:border-gray-700"
              >
                <Text className="text-base font-medium text-black dark:text-white">
                  {t('common.cancel')}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                disabled={saving}
                className={`flex-1 items-center rounded-xl py-3 ${
                  saving || !canSave ? 'bg-gray-300' : 'bg-black dark:bg-white'
                }`}
              >
                <Text
                  className={`text-base font-medium ${
                    saving || !canSave ? 'text-gray-500' : 'text-white dark:text-black'
                  }`}
                >
                  {t('common.done')}
                </Text>
              </Pressable>
            </View>
          </View>
          <Toast
            visible={!!toastMsg}
            message={toastMsg}
            type="error"
            onHide={() => setToastMsg('')}
            style={{ position: 'absolute', top: -60, left: 0, right: 0 }}
          />
        </View>
      </View>
    </Modal>
  );
}

function getWeekdayLabels(lang: string): string[] {
  // Sunday-first ordering. Use a known Sunday (2026-01-04) as base date.
  // weekday: 'narrow' returns the locale's shortest form
  // (e.g., S/M/T/W/T/F/S in English, 일/월/화/수/목/금/토 in Korean).
  const labels: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(2026, 0, 4 + i);
    try {
      labels.push(d.toLocaleDateString(lang, { weekday: 'narrow' }));
    } catch {
      labels.push(['S', 'M', 'T', 'W', 'T', 'F', 'S'][i]);
    }
  }
  return labels;
}

function DaySelector({
  days,
  onToggle,
  lang,
}: {
  days: number;
  onToggle: (dayIdx: number) => void;
  lang: string;
}) {
  const labels = getWeekdayLabels(lang);
  return (
    <View className="mt-3 flex-row items-center justify-between rounded-xl border border-gray-300 px-3 py-3 dark:border-gray-700">
      {labels.map((label, idx) => {
        const selected = (days & (1 << idx)) !== 0;
        return (
          <Pressable
            key={idx}
            onPress={() => onToggle(idx)}
            className={`h-9 w-9 items-center justify-center rounded-full ${
              selected ? '' : 'bg-gray-100 dark:bg-gray-800'
            }`}
            style={selected ? { backgroundColor: '#2EC4A5' } : undefined}
          >
            <Text
              className={`text-sm font-semibold ${
                selected ? 'text-white' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TimePickerWheels({
  hour,
  minute,
  onHourChange,
  onMinuteChange,
}: {
  hour: number;
  minute: number;
  onHourChange: (h: number) => void;
  onMinuteChange: (m: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="mt-3 flex-row items-center justify-center">
      <Wheel
        items={HOURS}
        value={hour}
        onChange={onHourChange}
        format={(h) => h.toString().padStart(2, '0')}
        label={t('wordlist.notif_hour_label')}
      />
      <Text className="mx-2 text-3xl font-bold text-black dark:text-white" style={{ marginTop: -16 }}>
        :
      </Text>
      <Wheel
        items={MINUTES}
        value={minute}
        onChange={onMinuteChange}
        format={(m) => m.toString().padStart(2, '0')}
        label={t('wordlist.notif_minute_label')}
      />
    </View>
  );
}

function Wheel({
  items,
  value,
  onChange,
  format,
  label,
}: {
  items: number[];
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  label: string;
}) {
  const listRef = useRef<FlatList<number>>(null);

  useEffect(() => {
    // Sync wheel position when external value changes (initial mount, modal reopen).
    const idx = items.indexOf(value);
    if (idx >= 0) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({ offset: idx * ITEM_HEIGHT, animated: false });
      });
    }
  }, [value, items]);

  const handleMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = e.nativeEvent.contentOffset.y;
    const idx = Math.round(offset / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    const next = items[clamped];
    if (next !== value) onChange(next);
    // Snap precisely to integer offset
    listRef.current?.scrollToOffset({ offset: clamped * ITEM_HEIGHT, animated: true });
  };

  return (
    <View className="items-center">
      <View style={{ height: WHEEL_HEIGHT, width: 80, position: 'relative' }}>
        {/* Center selection band */}
        <View
          pointerEvents="none"
          className="bg-gray-100 dark:bg-gray-800"
          style={{
            position: 'absolute',
            top: CENTER_OFFSET,
            left: 0,
            right: 0,
            height: ITEM_HEIGHT,
            borderRadius: 8,
          }}
        />
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(item) => String(item)}
          style={{ flex: 1 }}
          renderItem={({ item }) => (
            <View
              style={{ height: ITEM_HEIGHT }}
              className="items-center justify-center"
            >
              <Text
                className={`text-2xl ${
                  item === value
                    ? 'font-bold text-black dark:text-white'
                    : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                {format(item)}
              </Text>
            </View>
          )}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          snapToAlignment="start"
          decelerationRate="fast"
          contentContainerStyle={{ paddingVertical: CENTER_OFFSET }}
          getItemLayout={(_, index) => ({
            length: ITEM_HEIGHT,
            offset: ITEM_HEIGHT * index,
            index,
          })}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          nestedScrollEnabled
        />
      </View>
      <Text className="mt-1 text-xs text-gray-500">{label}</Text>
    </View>
  );
}
