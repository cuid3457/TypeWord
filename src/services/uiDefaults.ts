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
import { ScrollView, FlatList, SectionList } from 'react-native';

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
