import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';

const { width: SW, height: SH } = Dimensions.get('window');
const MIN_CROP = 80;
const HIT = 44;
const CORNER_LEN = 20;
const CORNER_W = 3;
const BTN_AREA = 80;
const ACCENT = '#2EC4A5';

interface Props {
  visible: boolean;
  imageUri: string;
  imageWidth: number;
  imageHeight: number;
  onConfirm: (crop: { originX: number; originY: number; width: number; height: number }) => void;
  onCancel: () => void;
}

export function ImageCropModal({ visible, imageUri, imageWidth, imageHeight, onConfirm, onCancel }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === 'dark';

  const bgColor = dark ? '#000' : '#fff';
  const overlay = dark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.55)';

  const padTop = insets.top + 8;
  const padBot = BTN_AREA + Math.max(insets.bottom, 16);
  const areaH = SH - padTop - padBot;

  const fit = Math.min(SW / imageWidth, areaH / imageHeight);
  const dw = imageWidth * fit;
  const dh = imageHeight * fit;
  const imgL = (SW - dw) / 2;
  const imgT = padTop + (areaH - dh) / 2;

  // ── image transform ──
  const sc = useSharedValue(1);
  const scSaved = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const txS = useSharedValue(0);
  const tyS = useSharedValue(0);

  // ── crop rect (screen coords) ──
  const m = 16;
  const iCx = imgL + m;
  const iCy = imgT + m;
  const iCw = dw - m * 2;
  const iCh = dh - m * 2;

  const cx = useSharedValue(iCx);
  const cy = useSharedValue(iCy);
  const cw = useSharedValue(iCw);
  const ch = useSharedValue(iCh);
  const cxS = useSharedValue(0);
  const cyS = useSharedValue(0);
  const cwS = useSharedValue(0);
  const chS = useSharedValue(0);

  const resetAll = () => {
    sc.value = 1; scSaved.value = 1;
    tx.value = 0; ty.value = 0;
    cx.value = iCx; cy.value = iCy;
    cw.value = iCw; ch.value = iCh;
  };

  useEffect(() => {
    if (imageUri) resetAll();
  }, [imageUri]);

  // ── image gestures (pan + pinch) ──
  const imgPan = useMemo(() =>
    Gesture.Pan()
      .onStart(() => { txS.value = tx.value; tyS.value = ty.value; })
      .onUpdate((e) => { tx.value = txS.value + e.translationX; ty.value = tyS.value + e.translationY; })
      .minPointers(1).maxPointers(2),
  []);

  const imgPinch = useMemo(() =>
    Gesture.Pinch()
      .onStart(() => { scSaved.value = sc.value; })
      .onUpdate((e) => { sc.value = Math.min(5, Math.max(0.5, scSaved.value * e.scale)); }),
  []);

  const imgGesture = useMemo(() => Gesture.Simultaneous(imgPan, imgPinch), [imgPan, imgPinch]);

  // ── corner resize gestures ──
  const _pt = padTop;
  const _ah = areaH;

  const cornerGesture = (corner: 'tl' | 'tr' | 'bl' | 'br') =>
    Gesture.Pan()
      .onStart(() => { cxS.value = cx.value; cyS.value = cy.value; cwS.value = cw.value; chS.value = ch.value; })
      .onUpdate((e) => {
        const isL = corner === 'tl' || corner === 'bl';
        const isT = corner === 'tl' || corner === 'tr';
        let nx = cxS.value, ny = cyS.value, nw = cwS.value, nh = chS.value;

        if (isL) {
          const mv = Math.min(e.translationX, cwS.value - MIN_CROP);
          nx = Math.max(0, cxS.value + mv);
          nw = cwS.value - (nx - cxS.value);
        } else {
          nw = Math.max(MIN_CROP, Math.min(SW - cxS.value, cwS.value + e.translationX));
        }
        if (isT) {
          const mv = Math.min(e.translationY, chS.value - MIN_CROP);
          ny = Math.max(_pt, cyS.value + mv);
          nh = chS.value - (ny - cyS.value);
        } else {
          nh = Math.max(MIN_CROP, Math.min(_pt + _ah - cyS.value, chS.value + e.translationY));
        }
        cx.value = nx; cy.value = ny; cw.value = nw; ch.value = nh;
      });

  const tlG = useMemo(() => cornerGesture('tl'), []);
  const trG = useMemo(() => cornerGesture('tr'), []);
  const blG = useMemo(() => cornerGesture('bl'), []);
  const brG = useMemo(() => cornerGesture('br'), []);

  // ── animated styles ──
  const imgStyle = useAnimatedStyle(() => ({
    width: dw, height: dh,
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: sc.value }],
  }));

  const topOv = useAnimatedStyle(() => ({
    position: 'absolute' as const, top: 0, left: 0, right: 0,
    height: Math.max(0, cy.value), backgroundColor: overlay,
  }));
  const botOv = useAnimatedStyle(() => ({
    position: 'absolute' as const, left: 0, right: 0,
    top: cy.value + ch.value, bottom: 0, backgroundColor: overlay,
  }));
  const leftOv = useAnimatedStyle(() => ({
    position: 'absolute' as const, left: 0,
    top: cy.value, width: Math.max(0, cx.value), height: ch.value, backgroundColor: overlay,
  }));
  const rightOv = useAnimatedStyle(() => ({
    position: 'absolute' as const, right: 0,
    top: cy.value, left: cx.value + cw.value, height: ch.value, backgroundColor: overlay,
  }));

  const borderSt = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: cx.value, top: cy.value, width: cw.value, height: ch.value,
    borderWidth: 1, borderColor: ACCENT,
  }));

  const hStyle = (c: 'tl' | 'tr' | 'bl' | 'br') => {
    const half = HIT / 2;
    if (c === 'tl') return useAnimatedStyle(() => ({ position: 'absolute' as const, left: cx.value - half, top: cy.value - half, width: HIT, height: HIT }));
    if (c === 'tr') return useAnimatedStyle(() => ({ position: 'absolute' as const, left: cx.value + cw.value - half, top: cy.value - half, width: HIT, height: HIT }));
    if (c === 'bl') return useAnimatedStyle(() => ({ position: 'absolute' as const, left: cx.value - half, top: cy.value + ch.value - half, width: HIT, height: HIT }));
    return useAnimatedStyle(() => ({ position: 'absolute' as const, left: cx.value + cw.value - half, top: cy.value + ch.value - half, width: HIT, height: HIT }));
  };

  const tlS = hStyle('tl');
  const trS = hStyle('tr');
  const blS = hStyle('bl');
  const brS = hStyle('br');

  const handleConfirm = () => {
    const s = sc.value;
    const centerX = imgL + dw / 2 + tx.value;
    const centerY = imgT + dh / 2 + ty.value;
    const sW = dw * s;
    const sH = dh * s;
    const sLeft = centerX - sW / 2;
    const sTop = centerY - sH / 2;

    const ratio = imageWidth / sW;
    const oX = Math.max(0, Math.round((cx.value - sLeft) * ratio));
    const oY = Math.max(0, Math.round((cy.value - sTop) * ratio));
    const cropW = Math.max(1, Math.min(imageWidth - oX, Math.round(cw.value * ratio)));
    const cropH = Math.max(1, Math.min(imageHeight - oY, Math.round(ch.value * ratio)));

    onConfirm({ originX: oX, originY: oY, width: cropW, height: cropH });
  };

  const hasImage = !!imageUri;

  return (
    <Modal visible={visible} animationType="none" onRequestClose={onCancel} statusBarTranslucent onShow={resetAll}>
      <GestureHandlerRootView style={[s.root, { backgroundColor: bgColor }]}>
        {hasImage ? (
          <>
            {/* Image */}
            <View style={{ position: 'absolute', left: imgL, top: imgT, width: dw, height: dh }}>
              <GestureDetector gesture={imgGesture}>
                <Animated.Image source={{ uri: imageUri }} style={imgStyle} resizeMode="contain" />
              </GestureDetector>
            </View>

            {/* Overlays */}
            <Animated.View style={topOv} pointerEvents="none" />
            <Animated.View style={botOv} pointerEvents="none" />
            <Animated.View style={leftOv} pointerEvents="none" />
            <Animated.View style={rightOv} pointerEvents="none" />
            <Animated.View style={borderSt} pointerEvents="none" />

            {/* Corner handles */}
            <GestureDetector gesture={tlG}><Animated.View style={tlS}><Corner c="tl" /></Animated.View></GestureDetector>
            <GestureDetector gesture={trG}><Animated.View style={trS}><Corner c="tr" /></Animated.View></GestureDetector>
            <GestureDetector gesture={blG}><Animated.View style={blS}><Corner c="bl" /></Animated.View></GestureDetector>
            <GestureDetector gesture={brG}><Animated.View style={brS}><Corner c="br" /></Animated.View></GestureDetector>

            {/* Buttons */}
            <View style={[s.btnRow, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
              <Pressable onPress={onCancel} style={[s.btnOutline, { borderColor: dark ? '#374151' : '#d1d5db', backgroundColor: dark ? '#1f2937' : '#f9fafb' }]}>
                <Text style={s.cancelTxt}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable onPress={handleConfirm} style={s.btnFilled}>
                <Text style={s.okTxt}>OK</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

function Corner({ c }: { c: 'tl' | 'tr' | 'bl' | 'br' }) {
  const isT = c[0] === 't';
  const isL = c[1] === 'l';
  return (
    <View style={{ width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: CORNER_LEN, height: CORNER_LEN }}>
        <View style={{
          position: 'absolute',
          ...(isT ? { top: 0 } : { bottom: 0 }),
          ...(isL ? { left: 0 } : { right: 0 }),
          width: CORNER_LEN, height: CORNER_W,
          backgroundColor: ACCENT,
        }} />
        <View style={{
          position: 'absolute',
          ...(isT ? { top: 0 } : { bottom: 0 }),
          ...(isL ? { left: 0 } : { right: 0 }),
          width: CORNER_W, height: CORNER_LEN,
          backgroundColor: ACCENT,
        }} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  btnRow: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', gap: 12,
    paddingHorizontal: 24, paddingTop: 16,
  },
  btnOutline: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 12,
    borderWidth: 1,
  },
  btnFilled: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 12,
    backgroundColor: ACCENT,
  },
  cancelTxt: { color: '#9ca3af', fontSize: 15, fontWeight: '600' },
  okTxt: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
