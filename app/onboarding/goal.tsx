import ProgressDots from '@/components/ProgressDots';
import ScreenContainer from '@/components/ScreenContainer';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { palette, semantic } from '@/theme/colors';
import { Image as ExpoImage } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { ChevronLeft } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

// ── Tokens ────────────────────────────────────────────────────
const BG   = palette.crema;
const DARK = semantic.textPrimary;
const MED  = semantic.textSecondary;
const PRIM = palette.morado;
const GOLD = palette.ambar;

// ── NEM scale: display 5.0–7.0 ↔ stored ×100 (500–700) ──────
const NEM_MIN  = 5.0;
const NEM_MAX  = 7.0;
const NEM_STEP = 0.1;
const toStored = (v: number) => Math.round(v * 100);
const toDisplay = (v: number) => v / 100;

// ── Road waypoints — calibrate x/y to match goal-roadmap.png ─
// x=0 left, x=1 right; y=0 top, y=1 bottom; fractions of road zone
const WAYPOINTS = [
  { nem: 5.0, x: 0.50, y: 0.88 },
  { nem: 5.5, x: 0.35, y: 0.70 },
  { nem: 6.0, x: 0.54, y: 0.52 },
  { nem: 6.5, x: 0.38, y: 0.32 },
  { nem: 7.0, x: 0.50, y: 0.14 },
];

// ── Checkpoints (visual only — stored scale stays 500–700) ────
const CHECKPOINTS = [
  { nem: 5.5, emoji: '🚙', vehicle: 'Hatchback Deportivo' },
  { nem: 6.0, emoji: '🏎️', vehicle: 'Deportivo Premium'  },
  { nem: 6.5, emoji: '🚀', vehicle: 'Superdeportivo'      },
  { nem: 7.0, emoji: '🏆', vehicle: 'Hypercar Elite'      },
];

// ── Car geometry ──────────────────────────────────────────────
const CAR_W  = 80;
const CAR_H  = 70;
// ── Slider geometry ───────────────────────────────────────────
const THUMB_D = 32;
const TRACK_H = 10;
const CP_R    = 14; // checkpoint ring radius

// ── Helpers ───────────────────────────────────────────────────
function nemToPos(nem: number, rH: number, rW: number) {
  const clamped = Math.max(NEM_MIN, Math.min(NEM_MAX, nem));
  for (let i = 0; i < WAYPOINTS.length - 1; i++) {
    const a = WAYPOINTS[i], b = WAYPOINTS[i + 1];
    if (clamped >= a.nem && clamped <= b.nem) {
      const t = (clamped - a.nem) / (b.nem - a.nem);
      // Smooth easing between waypoints
      const te = t * t * (3 - 2 * t); // smoothstep
      return { x: (a.x + (b.x - a.x) * te) * rW, y: (a.y + (b.y - a.y) * te) * rH };
    }
  }
  const last = WAYPOINTS[WAYPOINTS.length - 1];
  return { x: last.x * rW, y: last.y * rH };
}

function initVehicle(nem: number) {
  for (let i = CHECKPOINTS.length - 1; i >= 0; i--) {
    if (nem >= CHECKPOINTS[i].nem - NEM_STEP / 2) return CHECKPOINTS[i];
  }
  return { emoji: '🚗', vehicle: 'City Car Sport' };
}

// ── Screen ────────────────────────────────────────────────────
export default function GoalScreen() {
  const { state, setGoal, nextStep, prevStep } = useOnboarding();

  const initNem = () => {
    const s = state.data.goal;
    return s >= 500 && s <= 700 ? toDisplay(s) : 6.0;
  };

  const [nemGoal,    setNemGoal]    = useState(initNem);
  const [trackW,     setTrackW]     = useState(0);
  const [roadH,      setRoadH]      = useState(0);
  const [roadW,      setRoadW]      = useState(0);
  const [ready,      setReady]      = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [displayVeh, setDisplayVeh] = useState(() => initVehicle(initNem()));

  // ── Mutable refs ──────────────────────────────────────────────
  const roadHRef      = useRef(0);
  const roadWRef      = useRef(0);
  const trackWRef     = useRef(0);
  const nemRef        = useRef(initNem());
  const readyRef      = useRef(false);
  const sliderStartF  = useRef(0);
  const idleRef       = useRef<Animated.CompositeAnimation | null>(null);
  const movingRef     = useRef(false);
  const draggingRef   = useRef(false);
  const cpReached     = useRef(CHECKPOINTS.map(() => false));

  // ── Animated values ───────────────────────────────────────────
  const carBaseX  = useRef(new Animated.Value(0)).current;
  const carBaseY  = useRef(new Animated.Value(0)).current;
  const carScale  = useRef(new Animated.Value(0)).current;
  const carOp     = useRef(new Animated.Value(0)).current;
  const idleDelta = useRef(new Animated.Value(0)).current;
  const carY      = useRef(Animated.add(carBaseY, idleDelta)).current;

  const titleOp   = useRef(new Animated.Value(0)).current;
  const subOp     = useRef(new Animated.Value(0)).current;

  const cpOp      = useRef(CHECKPOINTS.map(() => new Animated.Value(0.25))).current;
  const cpPop     = useRef(CHECKPOINTS.map(() => new Animated.Value(1))).current;

  const flagScale = useRef(new Animated.Value(1)).current;
  const flagGlow  = useRef(new Animated.Value(0)).current;

  const cardOp    = useRef(new Animated.Value(0)).current;
  const cardSlide = useRef(new Animated.Value(20)).current;

  const confirmOp = useRef(new Animated.Value(0)).current;

  // ── Flag: wave + gold glow every 4 s ─────────────────────────
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(flagScale, { toValue: 1.07, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(flagScale, { toValue: 1.0,  duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();

    const glowCycle = () =>
      Animated.sequence([
        Animated.delay(3600),
        Animated.timing(flagGlow, { toValue: 0.6,  duration: 350, useNativeDriver: true }),
        Animated.timing(flagGlow, { toValue: 0,    duration: 650, useNativeDriver: true }),
      ]).start(() => glowCycle());
    glowCycle();
  }, []);

  // ── Entry animation ───────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    const rH = roadHRef.current, rW = roadWRef.current;
    const target = nemRef.current;

    // Park car at NEM 5.0 start
    const start = nemToPos(NEM_MIN, rH, rW);
    carBaseX.setValue(start.x - CAR_W / 2);
    carBaseY.setValue(start.y - CAR_H / 2);

    // 1 – Titles
    Animated.timing(titleOp, { toValue: 1, duration: 240, delay: 80, useNativeDriver: true }).start();
    Animated.timing(subOp,   { toValue: 1, duration: 240, delay: 220, useNativeDriver: true }).start();

    // 2 – Car appears with bounce
    Animated.sequence([
      Animated.delay(400),
      Animated.parallel([
        Animated.timing(carOp,    { toValue: 1,    duration: 220, useNativeDriver: true }),
        Animated.timing(carScale, { toValue: 1.18, duration: 200, useNativeDriver: true }),
      ]),
      Animated.timing(carScale, { toValue: 1.0, duration: 160, useNativeDriver: true }),
    ]).start(() => {
      // 3 – Drive to saved NEM
      if (Math.abs(target - NEM_MIN) > NEM_STEP / 2) {
        movingRef.current = true;
        const dest = nemToPos(target, rH, rW);
        Animated.parallel([
          Animated.timing(carBaseX, { toValue: dest.x - CAR_W / 2, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(carBaseY, { toValue: dest.y - CAR_H / 2, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start(() => {
          movingRef.current = false;
          // Mark reached checkpoints silently
          CHECKPOINTS.forEach((cp, i) => {
            if (target >= cp.nem - NEM_STEP / 2) {
              cpReached.current[i] = true;
              cpOp[i].setValue(1);
            }
          });
          startIdle();
        });
      } else {
        startIdle();
      }
    });

    // 4 – Vehicle card slides in
    Animated.parallel([
      Animated.timing(cardOp,    { toValue: 1, duration: 280, delay: 620, useNativeDriver: true }),
      Animated.timing(cardSlide, { toValue: 0, duration: 280, delay: 620, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [ready]);

  // ── Cleanup ───────────────────────────────────────────────────
  useEffect(() => () => { if (idleRef.current) idleRef.current.stop(); }, []);

  // ── Idle ──────────────────────────────────────────────────────
  const startIdle = () => {
    if (movingRef.current || draggingRef.current) return;
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(idleDelta, { toValue: -3, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(idleDelta, { toValue:  3, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    idleRef.current = a;
    a.start();
  };

  const stopIdle = () => {
    if (idleRef.current) { idleRef.current.stop(); idleRef.current = null; }
    idleDelta.setValue(0);
  };

  // ── NEM change (from slider) ──────────────────────────────────
  const handleNemChange = (raw: number) => {
    const nem = Math.max(NEM_MIN, Math.min(NEM_MAX, Math.round(raw * 10) / 10));
    nemRef.current = nem;
    setNemGoal(nem);

    const rH = roadHRef.current, rW = roadWRef.current;
    if (!rH || !rW) return;

    const pos = nemToPos(nem, rH, rW);
    carBaseX.setValue(pos.x - CAR_W / 2);
    carBaseY.setValue(pos.y - CAR_H / 2);

    // Check checkpoint arrivals and departures
    CHECKPOINTS.forEach((cp, i) => {
      const reached = nem >= cp.nem - NEM_STEP / 2;

      if (!cpReached.current[i] && reached) {
        // ── New checkpoint reached ──
        cpReached.current[i] = true;

        Animated.parallel([
          Animated.timing(cpOp[i],  { toValue: 1,   duration: 250, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(cpPop[i], { toValue: 1.6, duration: 180, useNativeDriver: true }),
            Animated.timing(cpPop[i], { toValue: 1.0, duration: 180, useNativeDriver: true }),
          ]),
        ]).start();

        Animated.sequence([
          Animated.timing(carScale, { toValue: 1.12, duration: 100, useNativeDriver: true }),
          Animated.timing(carScale, { toValue: 1.0,  duration: 100, useNativeDriver: true }),
        ]).start();

        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (_) {}

        // Swap vehicle card
        swapCard({ emoji: cp.emoji, vehicle: cp.vehicle });

      } else if (cpReached.current[i] && !reached) {
        // ── Checkpoint un-reached (slider moved back) ──
        cpReached.current[i] = false;
        Animated.timing(cpOp[i], { toValue: 0.25, duration: 250, useNativeDriver: true }).start();

        // Find the highest still-reached checkpoint (or default)
        const prev = [...CHECKPOINTS].reverse().find((_, j) => cpReached.current[CHECKPOINTS.length - 1 - j]);
        const vehicle = prev
          ? { emoji: prev.emoji, vehicle: prev.vehicle }
          : { emoji: '🚗', vehicle: 'City Car Sport' };
        swapCard(vehicle);
      }
    });
  };

  // ── Swap vehicle card with animation ─────────────────────────
  const swapCard = (veh: { emoji: string; vehicle: string }) => {
    Animated.parallel([
      Animated.timing(cardOp,    { toValue: 0,  duration: 120, useNativeDriver: true }),
      Animated.timing(cardSlide, { toValue: 10, duration: 120, useNativeDriver: true }),
    ]).start(() => {
      setDisplayVeh(veh);
      Animated.parallel([
        Animated.timing(cardOp,    { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(cardSlide, { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    });
  };

  // ── Slider PanResponder ───────────────────────────────────────
  const sliderPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,

      onPanResponderGrant: (evt) => {
        draggingRef.current = true;
        carBaseX.stopAnimation();
        carBaseY.stopAnimation();
        if (idleRef.current) { idleRef.current.stop(); idleRef.current = null; }
        idleDelta.setValue(0);
        const f = Math.max(0, Math.min(1, evt.nativeEvent.locationX / trackWRef.current));
        sliderStartF.current = f;
        handleNemChange(NEM_MIN + f * (NEM_MAX - NEM_MIN));
      },

      onPanResponderMove: (_, gs) => {
        const w = trackWRef.current;
        if (!w) return;
        const f = Math.max(0, Math.min(1, sliderStartF.current + gs.dx / w));
        handleNemChange(NEM_MIN + f * (NEM_MAX - NEM_MIN));
      },

      onPanResponderRelease: () => {
        draggingRef.current = false;
        startIdle();
      },
    })
  ).current;

  // ── Confirm handler ───────────────────────────────────────────
  const handleConfirm = () => {
    if (confirming) return;
    setConfirming(true);
    setGoal(toStored(nemRef.current));
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (_) {}

    Animated.sequence([
      Animated.timing(carScale, { toValue: 0.88, duration: 80,  useNativeDriver: true }),
      Animated.timing(carScale, { toValue: 1.2,  duration: 200, useNativeDriver: true }),
      Animated.timing(carScale, { toValue: 1.0,  duration: 160, useNativeDriver: true }),
    ]).start();

    Animated.sequence([
      Animated.timing(confirmOp, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.delay(800),
      Animated.timing(confirmOp, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => nextStep());
  };

  // ── Derived slider progress ───────────────────────────────────
  const sliderFraction = (nemGoal - NEM_MIN) / (NEM_MAX - NEM_MIN);
  const thumbLeft = trackW > 0 ? trackW * sliderFraction - THUMB_D / 2 : 0;
  const fillWidth = trackW > 0 ? trackW * sliderFraction : 0;

  // ── Render ────────────────────────────────────────────────────
  return (
    <ScreenContainer style={s.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* Full-screen road-map background */}
      <ExpoImage
        source={require('@/assets/images/goal-roadmap.png')}
        contentFit="fill"
        style={StyleSheet.absoluteFill}
      />

      {/* Back button */}
      <View style={s.topBar}>
        <Pressable onPress={prevStep} style={s.backBtn}>
          <ChevronLeft size={22} color={DARK} strokeWidth={2.2} />
        </Pressable>
      </View>

      {/* Road area */}
      <View
        style={s.roadArea}
        onLayout={({ nativeEvent: { layout } }) => {
          roadHRef.current = layout.height;
          roadWRef.current = layout.width;
          setRoadH(layout.height);
          setRoadW(layout.width);
          if (!readyRef.current) { readyRef.current = true; setReady(true); }
        }}
      >
        {ready && roadW > 0 && (
          <>
            {/* Title overlay */}
            <Animated.View pointerEvents="none" style={[s.titleBar, { opacity: titleOp }]}>
              <Text style={s.title}>¿Hasta dónde quieres llegar?</Text>
              <Animated.View style={{ opacity: subOp }}>
                <Text style={s.subtitle}>Desliza para fijar tu NEM objetivo.</Text>
              </Animated.View>
            </Animated.View>

            {/* Checkpoint rings */}
            {CHECKPOINTS.map((cp, i) => {
              const pos = nemToPos(cp.nem, roadH, roadW);
              return (
                <Animated.View
                  key={`cp-${i}`}
                  pointerEvents="none"
                  style={[
                    s.cpRing,
                    {
                      left: pos.x - CP_R,
                      top:  pos.y - CP_R,
                      opacity: cpOp[i],
                      transform: [{ scale: cpPop[i] }],
                    },
                  ]}
                />
              );
            })}

            {/* Flag at NEM 7.0 */}
            {(() => {
              const fp = nemToPos(NEM_MAX, roadH, roadW);
              return (
                <Animated.View
                  pointerEvents="none"
                  style={[s.flagWrap, { left: fp.x - 20, top: fp.y - 48 }]}
                >
                  <Animated.View style={[s.flagGlowCircle, { opacity: flagGlow }]} />
                  <Animated.View style={{ transform: [{ scale: flagScale }] }}>
                    <Text style={s.flagEmoji}>🏁</Text>
                  </Animated.View>
                </Animated.View>
              );
            })()}

            {/* Draggable car (idle-only, slider controls position) */}
            <Animated.View
              pointerEvents="none"
              style={[
                s.car,
                {
                  opacity: carOp,
                  transform: [
                    { translateX: carBaseX },
                    { translateY: carY },
                    { scale: carScale },
                  ],
                },
              ]}
            >
              <ExpoImage
                source={require('@/assets/images/city-car-detras.png')}
                contentFit="contain"
                style={{ width: CAR_W, height: CAR_H }}
              />
            </Animated.View>

            {/* "Objetivo configurado" overlay */}
            <Animated.View pointerEvents="none" style={[s.confirmOverlay, { opacity: confirmOp }]}>
              <View style={s.confirmBadge}>
                <Text style={s.confirmBadgeText}>✅  Objetivo configurado</Text>
              </View>
            </Animated.View>
          </>
        )}
      </View>

      {/* NEM panel */}
      <View style={s.nemPanel}>

        {/* Vehicle card */}
        <Animated.View style={[s.vehicleCard, { opacity: cardOp, transform: [{ translateY: cardSlide }] }]}>
          <Text style={s.vehicleEmoji}>{displayVeh.emoji}</Text>
          <View style={s.vehicleInfo}>
            <Text style={s.vehicleName}>{displayVeh.vehicle}</Text>
            <Text style={s.vehicleHint}>Vehículo desbloqueado</Text>
          </View>
        </Animated.View>

        {/* NEM value row */}
        <View style={s.nemRow}>
          <Text style={s.nemLabel}>NEM objetivo</Text>
          <Text style={s.nemValue}>{nemGoal.toFixed(1)}</Text>
        </View>

        {/* Custom slider */}
        <View
          style={s.sliderHit}
          onLayout={({ nativeEvent: { layout } }) => {
            trackWRef.current = layout.width;
            setTrackW(layout.width);
          }}
          {...sliderPan.panHandlers}
        >
          {/* Track */}
          <View style={s.trackBg} />
          <View style={[s.trackFill, { width: fillWidth }]} />

          {/* Checkpoint ticks */}
          {CHECKPOINTS.map((cp, i) => {
            const f = (cp.nem - NEM_MIN) / (NEM_MAX - NEM_MIN);
            return (
              <View
                key={i}
                style={[s.trackTick, { left: trackW * f - 1.5 }]}
              />
            );
          })}

          {/* Thumb */}
          <View style={[s.trackThumb, { left: thumbLeft }]} />
        </View>

        {/* Min / max labels */}
        <View style={s.sliderLabels}>
          <Text style={s.sliderLabel}>5.0</Text>
          <Text style={s.sliderLabel}>7.0</Text>
        </View>

        {/* Confirm row */}
        <View style={s.confirmRow}>
          <ProgressDots current={4} />
          <Pressable
            onPress={handleConfirm}
            disabled={confirming}
            style={[s.confirmBtn, confirming && s.confirmBtnDim]}
          >
            <Text style={s.confirmBtnText}>🚀  Comenzar mi viaje</Text>
          </Pressable>
        </View>
      </View>
    </ScreenContainer>
  );
}

// ── Styles ────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: BG },
  topBar:  { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: palette.blanco, borderWidth: 1, borderColor: palette.bordeClaro,
    alignItems: 'center', justifyContent: 'center',
  },

  roadArea: { flex: 1 },

  // Title overlay
  titleBar: {
    position: 'absolute', top: 14, left: 0, right: 0,
    alignItems: 'center', zIndex: 20,
  },
  title:    { fontSize: 16, fontWeight: '800', color: DARK, textAlign: 'center' },
  subtitle: { fontSize: 11, color: MED, marginTop: 3, textAlign: 'center' },

  // Checkpoint ring
  cpRing: {
    position: 'absolute',
    width: CP_R * 2, height: CP_R * 2, borderRadius: CP_R,
    borderWidth: 2.5, borderColor: PRIM,
    backgroundColor: 'rgba(91,61,245,0.18)',
    zIndex: 8,
  },

  // Flag
  flagWrap:       { position: 'absolute', alignItems: 'center', zIndex: 18 },
  flagGlowCircle: {
    position: 'absolute', width: 52, height: 52, borderRadius: 26,
    backgroundColor: GOLD, top: -6,
  },
  flagEmoji: { fontSize: 30, zIndex: 1 },

  // Car
  car: { position: 'absolute', top: 0, left: 0, zIndex: 15 },

  // "Objetivo configurado" overlay
  confirmOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', zIndex: 30,
  },
  confirmBadge: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 22, paddingHorizontal: 28, paddingVertical: 16,
  },
  confirmBadgeText: { fontSize: 16, fontWeight: '800', color: DARK },

  // NEM Panel
  nemPanel: {
    backgroundColor: BG,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 14, paddingHorizontal: 20, paddingBottom: 12,
  },

  vehicleCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: palette.blanco, borderRadius: 16,
    paddingVertical: 10, paddingHorizontal: 16, marginBottom: 12,
  },
  vehicleEmoji: { fontSize: 26, marginRight: 12 },
  vehicleInfo:  { flex: 1 },
  vehicleName:  { fontSize: 14, fontWeight: '800', color: DARK },
  vehicleHint:  { fontSize: 10, color: MED, marginTop: 1 },

  nemRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 8,
  },
  nemLabel: { fontSize: 11, fontWeight: '700', color: MED, letterSpacing: 0.5 },
  nemValue: { fontSize: 30, fontWeight: '900', color: PRIM },

  // Slider
  sliderHit: { height: 44, justifyContent: 'center', marginBottom: 4 },
  trackBg:   {
    position: 'absolute', left: 0, right: 0,
    height: TRACK_H, borderRadius: TRACK_H / 2, backgroundColor: palette.bordeClaro,
  },
  trackFill: {
    position: 'absolute', left: 0,
    height: TRACK_H, borderRadius: TRACK_H / 2, backgroundColor: PRIM,
  },
  trackTick: {
    position: 'absolute', top: (44 - 18) / 2,
    width: 3, height: 18, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  trackThumb: {
    position: 'absolute', top: (44 - THUMB_D) / 2,
    width: THUMB_D, height: THUMB_D, borderRadius: THUMB_D / 2,
    backgroundColor: PRIM, borderWidth: 3, borderColor: palette.blanco,
  },

  sliderLabels: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12,
  },
  sliderLabel: { fontSize: 10, color: MED, fontWeight: '600' },

  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  confirmBtn: {
    flex: 1, backgroundColor: PRIM, borderRadius: 28,
    paddingVertical: 14, alignItems: 'center',
  },
  confirmBtnDim:  { opacity: 0.65 },
  confirmBtnText: { fontSize: 15, fontWeight: '800', color: palette.blanco },
});
