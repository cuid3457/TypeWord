/**
 * App-wide UI default overrides. Import once at the app entry (_layout) so
 * the side effects run before any screen renders.
 *
 * Currently: hides the scroll indicator on every ScrollView/FlatList by
 * default. Per-instance overrides still work — set
 * showsVerticalScrollIndicator={true} on a specific list to bring it back.
 *
 * Built-in RN ScrollView/FlatList are class components, so defaultProps
 * still applies even on the New Architecture. SectionList shares the
 * same VirtualizedList base so the prop propagates there too.
 */
import { ScrollView, FlatList, SectionList, StyleSheet, Text } from 'react-native';

const targets = [ScrollView, FlatList, SectionList];
for (const C of targets) {
  // @ts-expect-error defaultProps is loosely typed on RN core components
  C.defaultProps = {
    // @ts-expect-error
    ...(C.defaultProps ?? {}),
    showsVerticalScrollIndicator: false,
    showsHorizontalScrollIndicator: false,
  };
}

/**
 * Global default font = Pretendard (loaded in _layout via Font.loadAsync).
 * RN has no font inheritance and React 19 dropped function-component
 * defaultProps, so we patch Text's forwardRef render to inject the right
 * Pretendard *weight face* based on the element's resolved fontWeight, then
 * clear fontWeight so the OS doesn't synth faux-bold on an already-bold face.
 * Elements with their own non-Pretendard family (icon glyphs, monospace
 * readings) are left untouched.
 */
// Emoji (incl. regional-indicator flag pairs 🇰🇷, pictographs 🔥⭐👉, symbols
// ⭐, variation selectors). Forcing a text fontFamily that lacks these glyphs
// suppresses them on Android (flags render blank) — so for any text that
// contains emoji we leave the font untouched and let the OS emoji fallback
// run. The plain text-arrow "→" (U+2192) is deliberately NOT in these ranges.
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
function containsEmoji(node: unknown): boolean {
  if (typeof node === 'string') return EMOJI_RE.test(node);
  if (Array.isArray(node)) return node.some(containsEmoji);
  return false;
}

const PRETENDARD_BY_WEIGHT: Record<string, string> = {
  '100': 'Pretendard-Regular',
  '200': 'Pretendard-Regular',
  '300': 'Pretendard-Regular',
  '400': 'Pretendard-Regular',
  normal: 'Pretendard-Regular',
  '500': 'Pretendard-Medium',
  '600': 'Pretendard-SemiBold',
  '700': 'Pretendard-Bold',
  bold: 'Pretendard-Bold',
  '800': 'Pretendard-ExtraBold',
  '900': 'Pretendard-ExtraBold',
};

const TextAny = Text as unknown as {
  render?: (props: Record<string, unknown>, ref: unknown) => unknown;
  __pretendardPatched?: boolean;
};
if (!TextAny.__pretendardPatched && typeof TextAny.render === 'function') {
  const baseRender = TextAny.render.bind(TextAny);
  TextAny.render = function patchedRender(props: Record<string, unknown>, ref: unknown) {
    const flat = (StyleSheet.flatten((props as { style?: unknown }).style) ?? {}) as {
      fontFamily?: string;
      fontWeight?: string | number;
    };
    if (flat.fontFamily && !flat.fontFamily.startsWith('Pretendard')) {
      return baseRender(props, ref);
    }
    // Leave emoji-bearing text to the OS so flag/pictograph glyphs render
    // (a forced fontFamily without those glyphs blanks them on Android).
    if (containsEmoji((props as { children?: unknown }).children)) {
      return baseRender(props, ref);
    }
    const family = PRETENDARD_BY_WEIGHT[String(flat.fontWeight ?? '400')] ?? 'Pretendard-Regular';
    const style = [{ fontFamily: family }, (props as { style?: unknown }).style, { fontWeight: undefined }];
    return baseRender({ ...props, style }, ref);
  };
  TextAny.__pretendardPatched = true;
}
