/**
 * Speech-bubble style popover for text actions (copy / search).
 * Renders as a black pill above the long-pressed point with a downward
 * triangle "tail" pointing at the touch coordinate.
 */
import { useEffect, useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export interface PopoverButton {
  label: string;
  onPress: () => void;
}

export interface PopoverPosition {
  x: number;
  y: number;
  buttons: PopoverButton[];
}

interface Props {
  state: PopoverPosition | null;
  onDismiss: () => void;
}

const PILL_HEIGHT = 40;
const TAIL_HEIGHT = 7;
const TAIL_HALF_WIDTH = 6;
const SCREEN_PAD = 12;
const GAP_FROM_TOUCH = 8;
const BG = 'rgba(28,28,30,0.96)';
const BUTTON_PADDING_H = 18;
const FONT_SIZE = 15;
// Per-glyph width @ 15pt fontSize, weight 600. Tuned generously so single
// labels render on one line in any script (Latin + CJK + Cyrillic).
const CJK_RE = /[぀-ゟ゠-ヿ一-鿿가-힯]/;
function glyphWidth(ch: string): number {
  if (CJK_RE.test(ch)) return 18;
  if (/\s/.test(ch)) return 5;
  // Generous estimate for Latin/Cyrillic to avoid wrap. Worst case the pill
  // is slightly wider than needed; that looks fine.
  return 11;
}
function estimateLabelWidth(label: string): number {
  let w = 0;
  for (const ch of label) w += glyphWidth(ch);
  return w;
}
function estimateButtonWidth(label: string): number {
  return BUTTON_PADDING_H * 2 + Math.max(estimateLabelWidth(label), 30);
}

export function TextActionPopover({ state, onDismiss }: Props) {
  const [screen, setScreen] = useState(() => Dimensions.get('window'));
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setScreen(window));
    return () => sub.remove();
  }, []);

  if (!state) return null;

  const { x, y, buttons } = state;

  const widths = buttons.map((b) => estimateButtonWidth(b.label));
  // Side padding (4px each) + button widths + (n-1) divider widths (1px each).
  const pillWidth = 8 + widths.reduce((a, b) => a + b, 0) + Math.max(0, buttons.length - 1);

  let pillLeft = Math.round(x - pillWidth / 2);
  pillLeft = Math.max(SCREEN_PAD, Math.min(pillLeft, screen.width - pillWidth - SCREEN_PAD));

  const flipBelow = y - PILL_HEIGHT - TAIL_HEIGHT - GAP_FROM_TOUCH < SCREEN_PAD;
  const pillTop = flipBelow
    ? y + GAP_FROM_TOUCH + TAIL_HEIGHT
    : y - GAP_FROM_TOUCH - TAIL_HEIGHT - PILL_HEIGHT;

  const tailLeft = Math.max(
    pillLeft + 14,
    Math.min(x - TAIL_HALF_WIDTH, pillLeft + pillWidth - 14 - TAIL_HALF_WIDTH * 2),
  );
  const tailTop = flipBelow ? y + GAP_FROM_TOUCH : y - GAP_FROM_TOUCH - TAIL_HEIGHT;

  return (
    <Modal transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss}>
        <View
          style={{
            position: 'absolute',
            left: pillLeft,
            top: pillTop,
            width: pillWidth,
            height: PILL_HEIGHT,
            borderRadius: PILL_HEIGHT / 2,
            backgroundColor: BG,
            flexDirection: 'row',
            alignItems: 'stretch',
            paddingHorizontal: 4,
            shadowColor: '#000',
            shadowOpacity: 0.3,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 3 },
            elevation: 8,
          }}
        >
          {buttons.map((b, i) => (
            <View key={i} style={{ flexDirection: 'row', flex: 1 }}>
              {i > 0 ? (
                <View
                  style={{
                    width: StyleSheet.hairlineWidth,
                    backgroundColor: 'rgba(255,255,255,0.18)',
                    marginVertical: 8,
                  }}
                />
              ) : null}
              <Pressable
                onPress={() => {
                  b.onPress();
                  onDismiss();
                }}
                style={{
                  flex: 1,
                  height: '100%',
                  justifyContent: 'center',
                  alignItems: 'center',
                  paddingHorizontal: BUTTON_PADDING_H,
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    color: '#fff',
                    fontSize: FONT_SIZE,
                    fontWeight: '600',
                    includeFontPadding: false,
                  }}
                >
                  {b.label}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>

        <View
          style={{
            position: 'absolute',
            left: tailLeft,
            top: tailTop,
            width: 0,
            height: 0,
            borderLeftWidth: TAIL_HALF_WIDTH,
            borderRightWidth: TAIL_HALF_WIDTH,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            ...(flipBelow
              ? { borderBottomWidth: TAIL_HEIGHT, borderBottomColor: BG }
              : { borderTopWidth: TAIL_HEIGHT, borderTopColor: BG }),
          }}
        />
      </Pressable>
    </Modal>
  );
}
