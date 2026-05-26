import { useEffect } from 'react';
import { Modal, Platform, View } from 'react-native';
// Web-only — guarded so native bundlers never resolve it.
const ReactDOM = Platform.OS === 'web' ? require('react-dom') : null;

interface Props {
  visible: boolean;
  /** Fires when the OS back gesture or web Esc key requests dismissal. */
  onRequestClose: () => void;
  /** Forwarded to RN's <Modal> on native. Ignored on web. */
  statusBarTranslucent?: boolean;
  /** Forwarded to RN's <Modal> on native. Ignored on web (callers usually
   *  bring their own Reanimated transition). Defaults to "none". */
  animationType?: 'none' | 'slide' | 'fade';
  children: React.ReactNode;
}

/**
 * Cross-platform full-viewport shell for overlay modals (bottom sheets +
 * centered cards).
 *
 * Native: delegates to RN's <Modal>, which presents in its own window
 * above everything (including the bottom tab bar).
 *
 * Web: react-native-web's <Modal> mounts inside the parent React tree
 * (the active tab screen), so it can't visually cover the bottom tab bar
 * or anything else rendered outside that screen. We replace it with a
 * View pinned to the viewport via `position: fixed` with a high z-index.
 * Esc key triggers dismissal to match the native back-gesture behavior.
 * The children are passed through unchanged — callers keep their existing
 * backdrop / Animated.View / gesture-handler layout.
 */
export function BottomSheetShell({
  visible,
  onRequestClose,
  statusBarTranslucent,
  animationType = 'none',
  children,
}: Props) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onRequestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onRequestClose]);

  if (Platform.OS === 'web') {
    if (!visible) return null;
    // Portal the overlay to <body> so it can't be containing-block-trapped
    // by any ancestor with `transform` / `filter` / `will-change` set
    // (react-navigation tabs, reanimated wrappers, etc. routinely do this,
    // which turns a `position: fixed` child into one positioned relative
    // to the ancestor instead of the viewport).
    const overlay = (
      <View
        style={{
          position: 'fixed' as any,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
        }}
      >
        {children}
      </View>
    );
    if (ReactDOM && typeof document !== 'undefined') {
      return ReactDOM.createPortal(overlay, document.body);
    }
    return overlay;
  }
  return (
    <Modal
      visible={visible}
      transparent
      animationType={animationType}
      onRequestClose={onRequestClose}
      statusBarTranslucent={statusBarTranslucent}
    >
      {children}
    </Modal>
  );
}
