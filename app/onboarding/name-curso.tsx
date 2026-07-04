import ProgressDots from '@/components/ProgressDots';
import ScreenContainer from '@/components/ScreenContainer';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { palette, semantic } from '@/theme/colors';
import { Image as ExpoImage } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { ArrowRight, ChevronLeft } from 'lucide-react-native';
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
const PRIM = palette.azul;

// ── Data ──────────────────────────────────────────────────────
type Level = { level: number; course: string; fraction: number };

const LEVELS: Level[] = [
  { level: 1, course: '1º Medio', fraction: 0.77 },
  { level: 2, course: '2º Medio', fraction: 0.61 },
  { level: 3, course: '3º Medio', fraction: 0.45 },
  { level: 4, course: '4º Medio', fraction: 0.29 },
];

const VEHICLES = [
  { emoji: '🚗', name: 'City Car' },
  { emoji: '🚙', name: 'Hatchback' },
  { emoji: '🏎️', name: 'Deportivo' },
  { emoji: '🏆', name: 'Modelo Elite' },
];

// ── Geometry ──────────────────────────────────────────────────
const ROAD_CX     = 0.52;
const CAR_W       = 140;
const CAR_H       = 120;
const CP_R        = 13;
const CP_DOT      = 6;
const DASH_STEP   = 60;   // px between dash repeats
const DASH_H      = 20;
const DASH_W      = 3;
const DASH_N      = 14;   // enough to fill ~840 px

// ── Helpers ───────────────────────────────────────────────────
const cpY = (lvl: Level, h: number) => lvl.fraction * h;

function nearestIdx(centerY: number, h: number) {
  return LEVELS.reduce((best, lvl, i) => {
    return Math.abs(centerY - cpY(lvl, h)) < Math.abs(centerY - cpY(LEVELS[best], h))
      ? i : best;
  }, 0);
}

// ── Screen ────────────────────────────────────────────────────
export default function NameCursoScreen() {
  const { state, setCurso, nextStep, prevStep } = useOnboarding();

  const initIdx = () => {
    const i = LEVELS.findIndex(l => l.course === state.data.curso);
    return i >= 0 ? i : 0;
  };

  const [selIdx,     setSelIdx]     = useState(initIdx);
  const [displayIdx, setDisplayIdx] = useState(initIdx);
  const [roadH,      setRoadH]      = useState(0);
  const [roadW,      setRoadW]      = useState(0);
  const [ready,      setReady]      = useState(false);

  // ── Mutable refs (PanResponder safe) ──────────────────────────
  const roadHRef    = useRef(0);
  const roadWRef    = useRef(0);
  const carYRef     = useRef(0);
  const dragStartY  = useRef(0);
  const selIdxRef   = useRef(selIdx);
  const movingRef   = useRef(false);
  const draggingRef = useRef(false);
  const readyRef    = useRef(false);
  const idleRef     = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => { selIdxRef.current = selIdx; }, [selIdx]);

  // ── Animated values ───────────────────────────────────────────
  const carBase    = useRef(new Animated.Value(0)).current;
  const carScale   = useRef(new Animated.Value(1)).current;
  const carOp      = useRef(new Animated.Value(0)).current;
  const idleDelta  = useRef(new Animated.Value(0)).current;
  // Combined Y shown on screen (base position + idle bob)
  const carY       = useRef(Animated.add(carBase, idleDelta)).current;

  const cpOp       = useRef(LEVELS.map(() => new Animated.Value(0))).current;
  const progressOp = useRef(new Animated.Value(0)).current;
  const cardOp     = useRef(new Animated.Value(0)).current;
  const cardSlide  = useRef(new Animated.Value(24)).current;
  const dashOffset = useRef(new Animated.Value(0)).current;

  // ── Road dash loop ────────────────────────────────────────────
  useEffect(() => {
    const a = Animated.loop(
      Animated.timing(dashOffset, {
        toValue: DASH_STEP,
        duration: 2400,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    a.start();
    return () => a.stop();
  }, []);

  // ── Idle helpers (defined outside PanResponder for reuse) ─────
  const startIdle = () => {
    if (movingRef.current || draggingRef.current) return;
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(idleDelta, {
          toValue: -3,
          duration: 1000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(idleDelta, {
          toValue: 3,
          duration: 1000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    idleRef.current = a;
    a.start();
  };

  const stopIdle = () => {
    if (idleRef.current) { idleRef.current.stop(); idleRef.current = null; }
    idleDelta.setValue(0);
  };

  // ── Bounce helper ─────────────────────────────────────────────
  const bounce = (cb?: () => void) =>
    Animated.sequence([
      Animated.timing(carScale, { toValue: 1.12, duration: 100, useNativeDriver: true }),
      Animated.timing(carScale, { toValue: 1.0,  duration: 100, useNativeDriver: true }),
    ]).start(cb);

  // ── Entry animation (fires once after first layout) ───────────
  useEffect(() => {
    if (!ready) return;
    const rh = roadHRef.current;
    const target = selIdxRef.current;

    // Park car at level-1 (bottom) as animation start point
    const bottomY = cpY(LEVELS[0], rh) - CAR_H / 2;
    carBase.setValue(bottomY);
    carYRef.current = bottomY;

    // 1 — "Camino al NEM" indicator
    Animated.timing(progressOp, {
      toValue: 1, duration: 220, delay: 80, useNativeDriver: true,
    }).start();

    // 2 — Checkpoints staggered bottom → top
    LEVELS.forEach((_, i) => {
      Animated.timing(cpOp[i], {
        toValue: i === target ? 1.0 : 0.65,
        duration: 220,
        delay: 300 + i * 90,
        useNativeDriver: true,
      }).start();
    });

    // 3 — Car fades in then drives to saved level
    const carDelay = 300 + LEVELS.length * 90 + 60;
    Animated.timing(carOp, {
      toValue: 1, duration: 200, delay: carDelay, useNativeDriver: true,
    }).start(() => {
      if (target === 0) { startIdle(); return; }
      movingRef.current = true;
      const destY = cpY(LEVELS[target], rh) - CAR_H / 2;
      Animated.timing(carBase, {
        toValue: destY,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        carYRef.current = destY;
        bounce(() => { movingRef.current = false; startIdle(); });
      });
    });

    // 4 — Vehicle card slides up
    Animated.parallel([
      Animated.timing(cardOp, {
        toValue: 1, duration: 280, delay: carDelay + 180, useNativeDriver: true,
      }),
      Animated.timing(cardSlide, {
        toValue: 0, duration: 280, delay: carDelay + 180,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
    ]).start();
  }, [ready]);

  // ── Cleanup on unmount ────────────────────────────────────────
  useEffect(() => () => { if (idleRef.current) idleRef.current.stop(); }, []);

  // ── Navigate to level (from checkpoint tap) ───────────────────
  const navTo = (idx: number) => {
    const rh = roadHRef.current;
    if (!rh || idx === selIdxRef.current) return;

    stopIdle();
    movingRef.current = true;
    selIdxRef.current = idx;

    const destY = cpY(LEVELS[idx], rh) - CAR_H / 2;
    carYRef.current = destY;

    // Dim old, brighten new checkpoint
    LEVELS.forEach((_, i) => {
      Animated.timing(cpOp[i], {
        toValue: i === idx ? 1.0 : 0.65, duration: 300, useNativeDriver: true,
      }).start();
    });

    // Move car
    Animated.timing(carBase, {
      toValue: destY, duration: 700,
      easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start(() => {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (_) {}
      bounce(() => { movingRef.current = false; startIdle(); });
    });

    // Card: fade out → swap content → fade in
    Animated.parallel([
      Animated.timing(cardOp,    { toValue: 0,  duration: 140, useNativeDriver: true }),
      Animated.timing(cardSlide, { toValue: 12, duration: 140, useNativeDriver: true }),
    ]).start(() => {
      setDisplayIdx(idx);
      Animated.parallel([
        Animated.timing(cardOp,    { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(cardSlide, {
          toValue: 0, duration: 200,
          easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }),
      ]).start();
    });

    setSelIdx(idx);
    setCurso(LEVELS[idx].course);
  };

  // ── PanResponder ──────────────────────────────────────────────
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,

      onPanResponderGrant: () => {
        draggingRef.current = true;
        // inline stopIdle (avoids closure over helpers)
        if (idleRef.current) { idleRef.current.stop(); idleRef.current = null; }
        idleDelta.setValue(0);
        dragStartY.current = carYRef.current;
        Animated.spring(carScale, {
          toValue: 1.08, useNativeDriver: true, friction: 6, tension: 100,
        }).start();
      },

      onPanResponderMove: (_, gs) => {
        const rh = roadHRef.current;
        if (!rh) return;
        const min = cpY(LEVELS[LEVELS.length - 1], rh) - CAR_H / 2;
        const max = cpY(LEVELS[0],                  rh) - CAR_H / 2;
        const y   = Math.max(min, Math.min(max, dragStartY.current + gs.dy));
        carYRef.current = y;
        carBase.setValue(y);
      },

      onPanResponderRelease: () => {
        const rh = roadHRef.current;
        draggingRef.current = false;
        if (!rh) return;

        movingRef.current = true;
        const idx   = nearestIdx(carYRef.current + CAR_H / 2, rh);
        const destY = cpY(LEVELS[idx], rh) - CAR_H / 2;
        carYRef.current   = destY;
        selIdxRef.current = idx;

        Animated.spring(carScale, {
          toValue: 1, useNativeDriver: true, friction: 6, tension: 100,
        }).start();

        LEVELS.forEach((_, i) => {
          Animated.timing(cpOp[i], {
            toValue: i === idx ? 1.0 : 0.65, duration: 300, useNativeDriver: true,
          }).start();
        });

        Animated.timing(carBase, {
          toValue: destY, duration: 700,
          easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }).start(() => {
          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (_) {}
          // inline bounce
          Animated.sequence([
            Animated.timing(carScale, { toValue: 1.12, duration: 100, useNativeDriver: true }),
            Animated.timing(carScale, { toValue: 1.0,  duration: 100, useNativeDriver: true }),
          ]).start(() => {
            movingRef.current = false;
            if (!draggingRef.current) {
              const a = Animated.loop(
                Animated.sequence([
                  Animated.timing(idleDelta, {
                    toValue: -3, duration: 1000,
                    easing: Easing.inOut(Easing.sin), useNativeDriver: true,
                  }),
                  Animated.timing(idleDelta, {
                    toValue: 3, duration: 1000,
                    easing: Easing.inOut(Easing.sin), useNativeDriver: true,
                  }),
                ])
              );
              idleRef.current = a;
              a.start();
            }
          });
        });

        // Card swap
        Animated.parallel([
          Animated.timing(cardOp,    { toValue: 0,  duration: 140, useNativeDriver: true }),
          Animated.timing(cardSlide, { toValue: 12, duration: 140, useNativeDriver: true }),
        ]).start(() => {
          setDisplayIdx(idx);
          Animated.parallel([
            Animated.timing(cardOp,    { toValue: 1, duration: 200, useNativeDriver: true }),
            Animated.timing(cardSlide, {
              toValue: 0, duration: 200,
              easing: Easing.out(Easing.cubic), useNativeDriver: true,
            }),
          ]).start();
        });

        setSelIdx(idx);
        setCurso(LEVELS[idx].course);
      },
    })
  ).current;

  // ── Render ────────────────────────────────────────────────────
  return (
    <ScreenContainer style={s.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* Full-screen road background */}
      <ExpoImage
        source={require('@/assets/images/grade-road.png')}
        contentFit="fill"
        style={StyleSheet.absoluteFill}
      />

      {/* Back button */}
      <View style={s.topBar}>
        <Pressable onPress={prevStep} style={s.backBtn}>
          <ChevronLeft size={22} color={DARK} strokeWidth={2.2} />
        </Pressable>
      </View>

      {/* Interactive road zone */}
      <View
        style={s.road}
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
            {/* ── Scrolling road dashes ── */}
            <Animated.View
              pointerEvents="none"
              style={[
                s.dashCol,
                { left: roadW * ROAD_CX - DASH_W / 2 },
                { transform: [{ translateY: dashOffset }] },
              ]}
            >
              {Array.from({ length: DASH_N }).map((_, i) => (
                <View
                  key={i}
                  style={[s.dash, { top: -DASH_STEP + i * DASH_STEP }]}
                />
              ))}
            </Animated.View>

            {/* ── Checkpoints ── */}
            {LEVELS.map((lvl, idx) => {
              const cy = cpY(lvl, roadH);
              const cx = roadW * ROAD_CX;
              const active = idx === selIdx;
              return (
                <Animated.View
                  key={`cp-${lvl.level}`}
                  style={[
                    s.cpWrap,
                    { top: cy - CP_R, left: cx - CP_R },
                    { opacity: cpOp[idx] },
                  ]}
                >
                  <Pressable
                    onPress={() => navTo(idx)}
                    hitSlop={14}
                    style={[s.cpOuter, active && s.cpOuterActive]}
                  >
                    <View style={[s.cpDot, active && s.cpDotActive]} />
                  </Pressable>
                </Animated.View>
              );
            })}

            {/* ── "Camino al NEM" progress indicator ── */}
            <Animated.View
              pointerEvents="none"
              style={[s.progressBar, { opacity: progressOp }]}
            >
              <Text style={s.progressTitle}>Camino al NEM</Text>
              <View style={s.progressRow}>
                {LEVELS.map((lvl, idx) => (
                  <View key={lvl.level} style={s.progressItem}>
                    <Text style={[s.progressLvl, idx === selIdx && s.progressLvlOn]}>
                      {lvl.level}°
                    </Text>
                    {idx < LEVELS.length - 1 && (
                      <Text style={s.progressArrow}>›</Text>
                    )}
                  </View>
                ))}
              </View>
            </Animated.View>

            {/* ── Vehicle preview card ── */}
            <Animated.View
              pointerEvents="none"
              style={[
                s.vehicleCard,
                { opacity: cardOp, transform: [{ translateY: cardSlide }] },
              ]}
            >
              <Text style={s.vehicleEmoji}>{VEHICLES[displayIdx].emoji}</Text>
              <View style={s.vehicleInfo}>
                <Text style={s.vehicleName}>{VEHICLES[displayIdx].name}</Text>
                <Text style={s.vehicleLabel}>Vehículo desbloqueado</Text>
              </View>
            </Animated.View>

            {/* ── Draggable car ── */}
            <Animated.View
              style={[
                s.car,
                { left: roadW * ROAD_CX - CAR_W / 2 },
                {
                  opacity: carOp,
                  transform: [{ translateY: carY }, { scale: carScale }],
                },
              ]}
              {...pan.panHandlers}
            >
              <ExpoImage
                source={require('@/assets/images/city-car-detras.png')}
                contentFit="contain"
                style={{ width: CAR_W, height: CAR_H }}
              />
            </Animated.View>
          </>
        )}
      </View>

      {/* Bottom bar */}
      <View style={s.bottomBar}>
        <ProgressDots current={3} />
        <Pressable onPress={() => { setCurso(LEVELS[selIdx].course); nextStep(); }} style={s.arrowBtn}>
          <ArrowRight size={22} color={palette.blanco} strokeWidth={2.5} />
        </Pressable>
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

  road: { flex: 1 },

  // Scrolling dashes
  dashCol: {
    position: 'absolute',
    top: 0, bottom: 0,
    width: DASH_W,
    overflow: 'hidden',
    zIndex: 1,
  },
  dash: {
    position: 'absolute',
    width: DASH_W, height: DASH_H,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.42)',
  },

  // Checkpoints
  cpWrap:  { position: 'absolute', zIndex: 5 },
  cpOuter: {
    width: CP_R * 2, height: CP_R * 2, borderRadius: CP_R,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 2, borderColor: palette.bordeClaro,
    alignItems: 'center', justifyContent: 'center',
  },
  cpOuterActive: {
    borderColor: PRIM,
    backgroundColor: 'rgba(22,119,242,0.14)',
  },
  cpDot:       { width: CP_DOT * 2, height: CP_DOT * 2, borderRadius: CP_DOT, backgroundColor: palette.bordeClaro },
  cpDotActive: { backgroundColor: PRIM },

  // Progress indicator
  progressBar: {
    position: 'absolute', top: 14, left: 0, right: 0,
    alignItems: 'center', zIndex: 20,
  },
  progressTitle: {
    fontSize: 10, fontWeight: '700', color: MED,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 5,
  },
  progressRow: { flexDirection: 'row', alignItems: 'center' },
  progressItem: { flexDirection: 'row', alignItems: 'center' },
  progressLvl: { fontSize: 13, fontWeight: '600', color: 'rgba(100,116,139,0.45)' },
  progressLvlOn: { fontSize: 14, fontWeight: '800', color: PRIM },
  progressArrow: { fontSize: 13, color: 'rgba(100,116,139,0.35)', marginHorizontal: 4 },

  // Vehicle card
  vehicleCard: {
    position: 'absolute', bottom: 16, left: 20, right: 20,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 18, paddingVertical: 11, paddingHorizontal: 18,
    zIndex: 12,
  },
  vehicleEmoji: { fontSize: 30, marginRight: 12 },
  vehicleInfo:  { flex: 1 },
  vehicleName:  { fontSize: 15, fontWeight: '800', color: DARK },
  vehicleLabel: { fontSize: 10, color: MED, marginTop: 1 },

  // Car
  car: { position: 'absolute', top: 0, zIndex: 15 },

  // Bottom bar
  bottomBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12,
    backgroundColor: BG,
  },
  arrowBtn: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: PRIM, alignItems: 'center', justifyContent: 'center',
  },
});
