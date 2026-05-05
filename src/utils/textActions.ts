/**
 * Long-press text action sheet: copy and (optionally) search-this-word.
 * Used on headword, example sentences, synonyms, antonyms.
 */
import * as Clipboard from 'expo-clipboard';
import { Alert } from 'react-native';
import i18n from '@src/i18n';

interface TextActionOptions {
  /** The text being acted on. Shown as the dialog title (truncated). */
  text: string;
  /** When provided, a "Search" button is added that calls this. */
  onSearch?: () => void;
  /** Optional toast callback after copy completes. */
  onCopied?: () => void;
}

const TITLE_MAX = 60;

function truncateForTitle(s: string): string {
  const trimmed = s.trim();
  if (trimmed.length <= TITLE_MAX) return trimmed;
  return trimmed.slice(0, TITLE_MAX - 1) + '…';
}

export function showTextActions({ text, onSearch, onCopied }: TextActionOptions): void {
  if (!text?.trim()) return;
  const t = i18n.t.bind(i18n);
  type Button = { text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' };
  const buttons: Button[] = [];
  if (onSearch) {
    buttons.push({ text: t('common.search'), onPress: onSearch });
  }
  buttons.push({
    text: t('common.copy'),
    onPress: async () => {
      try {
        await Clipboard.setStringAsync(text);
        onCopied?.();
      } catch {
        /* clipboard failures are silent — most platforms shouldn't reach here */
      }
    },
  });
  buttons.push({ text: t('common.cancel'), style: 'cancel' });
  Alert.alert(truncateForTitle(text), undefined, buttons, { cancelable: true });
}
