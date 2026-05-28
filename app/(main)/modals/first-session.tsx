import ScreenContainer from '@/components/ScreenContainer';
import { getDemoSession, type DemoQuestion, type DemoSession } from '@/constants/demoSessions';
import { useOnboarding } from '@/contexts/OnboardingContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions, Pressable, StyleSheet, StatusBar, Text, View,
} from 'react-native';
import Animated, {
  Easing, runOnJS,
  useAnimatedReaction, useAnimatedStyle, useSharedValue,
  withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');
const SM = SCREEN_H < 740;

const BG1   = '#09051A';
const BG2   = '#0D0825';
const BRAND = '#7C5AFF';
const LIME  = '#C4F852';
const TEAL  = '#00C2A8';
const ROSE  = '#FF4D6D';
const FLOOR = '#3D1F8A';
const GOLD  = '#FFB547';

const COMPLETED_KEY = 'nemup_first_session_completed';
const PROGRESS_KEY  = 'nemup_first_session_progress';

type Phase = 'loading' | 'intro' | 'answering' | 'answered' | 'result';
interface SavedProgress { qIndex: number; correctCount: number; xpEarned: number; lives: number; streak: number }

// ─── Animated count-up ────────────────────────────────────────────────────────
function AnimatedNumber({ to, delay = 0, style }: { to: number; delay?: number; style?: any }) {
  const progress = useSharedValue(0);
  const [displayed, setDisplayed] = useState(0);
  useAnimatedReaction(
    () => Math.round(progress.value * to),
    (cur, prev) => { if (cur !== prev) runOnJS(setDisplayed)(cur); }
  );
  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) }));
  }, []);
  return <Text style={style}>{displayed}</Text>;
}

// ─── Floating reward toast ────────────────────────────────────────────────────
function FloatingToast({ message }: { message: string }) {
  const opacity = useSharedValue(0);
  const y       = useSharedValue(0);
  useEffect(() => {
    opacity.value = withSequence(
      withTiming(1, { duration: 140 }),
      withDelay(620, withTiming(0, { duration: 360 }))
    );
    y.value = withTiming(-68, { duration: 1120, easing: Easing.out(Easing.cubic) });
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: y.value }] }));
  return (
    <Animated.View style={[styles.toast, style]} pointerEvents="none">
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

// ─── Animated heart ───────────────────────────────────────────────────────────
function HeartIcon({ alive, justLost, pulseRed }: { alive: boolean; justLost: boolean; pulseRed: boolean }) {
  const scale   = useSharedValue(1);
  const opacity = useSharedValue(alive ? 1 : 0.32);

  useEffect(() => {
    if (justLost) {
      scale.value = withSequence(
        withSpring(1.5, { mass: 0.25, stiffness: 600, damping: 8 }),
        withTiming(0.85, { duration: 260 })
      );
      opacity.value = withDelay(180, withTiming(0.32, { duration: 280 }));
    }
  }, [justLost]);

  useEffect(() => {
    if (pulseRed && alive) {
      scale.value = withRepeat(
        withSequence(withTiming(1.22, { duration: 350 }), withTiming(1, { duration: 350 })),
        -1, false
      );
    } else if (!justLost) {
      scale.value = withTiming(1, { duration: 200 });
    }
  }, [pulseRed]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));
  return <Animated.Text style={[styles.heart, style]}>{alive ? '❤️' : '🤍'}</Animated.Text>;
}

// ─── Progress header ──────────────────────────────────────────────────────────
function ProgressHeader({ qIndex, lives, xpEarned, lostHeartIndex }: {
  qIndex: number; lives: number; xpEarned: number; lostHeartIndex: number | null;
}) {
  const barPct  = useSharedValue(0);
  const glowOp  = useSharedValue(0);
  const xpScale = useSharedValue(1);

  useEffect(() => {
    barPct.value  = withTiming((qIndex / 3) * 100, { duration: 480, easing: Easing.out(Easing.cubic) });
    glowOp.value  = withSequence(withTiming(1, { duration: 120 }), withDelay(300, withTiming(0, { duration: 400 })));
  }, [qIndex]);

  useEffect(() => {
    xpScale.value = withSequence(
      withSpring(1.35, { mass: 0.3, stiffness: 500, damping: 10 }),
      withSpring(1,    { mass: 0.3, stiffness: 300, damping: 18 })
    );
  }, [xpEarned]);

  const barStyle  = useAnimatedStyle(() => ({ width: (barPct.value + '%') as any }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOp.value }));
  const xpStyle   = useAnimatedStyle(() => ({ transform: [{ scale: xpScale.value }] }));

  return (
    <View style={styles.header}>
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, barStyle]}>
          <Animated.View style={[styles.progressGlow, glowStyle]} />
          <View style={styles.progressLead} />
        </Animated.View>
      </View>
      <View style={styles.headerRow}>
        <Text style={styles.headerQ}>Pregunta {qIndex + 1} de 3</Text>
        <View style={styles.headerRight}>
          <View style={styles.livesRow}>
            {[0,1,2].map(i => (
              <HeartIcon
                key={i}
                alive={i < lives}
                justLost={i === lostHeartIndex}
                pulseRed={lives === 1 && i < lives}
              />
            ))}
          </View>
          <Animated.View style={[styles.xpBadge, xpStyle]}>
            <Text style={styles.xpBadgeText}>⚡ {xpEarned} XP</Text>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

// ─── Tooltip bubble ───────────────────────────────────────────────────────────
function TooltipBubble({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const opacity = useSharedValue(0);
  const scale   = useSharedValue(0.88);
  useEffect(() => {
    if (visible) {
      opacity.value = withDelay(700, withTiming(1, { duration: 260 }));
      scale.value   = withDelay(700, withSpring(1, { mass: 0.4, stiffness: 280, damping: 16 }));
      const t = setTimeout(onDismiss, 4700);
      return () => clearTimeout(t);
    } else {
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[styles.tooltip, style]} pointerEvents={visible ? 'auto' : 'none'}>
      <View style={styles.tooltipArrow} />
      <View style={styles.tooltipBody}>
        <Text style={styles.tooltipText}>
          Cada pregunta viene de material verificado. Cuando subas tus apuntes, verás exactamente de dónde sale cada pregunta.
        </Text>
        <Pressable onPress={onDismiss} style={styles.tooltipBtn}>
          <Text style={styles.tooltipBtnText}>Entendido ✓</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ─── Falling confetti (result screen) ────────────────────────────────────────
const FALL_CONF = [
  { left: '4%',  color: LIME,  size: 9,  dur: 1800, delay: 0   },
  { left: '16%', color: ROSE,  size: 7,  dur: 2200, delay: 180 },
  { left: '28%', color: '#5BC8FF', size: 10, dur: 2000, delay: 80  },
  { left: '42%', color: LIME,  size: 6,  dur: 2400, delay: 320 },
  { left: '55%', color: BRAND, size: 8,  dur: 1900, delay: 120 },
  { left: '67%', color: GOLD,  size: 7,  dur: 2300, delay: 260 },
  { left: '79%', color: ROSE,  size: 9,  dur: 2100, delay: 400 },
  { left: '91%', color: '#5BC8FF', size: 6, dur: 2500, delay: 50  },
] as const;

function FallingPiece({ c }: { c: typeof FALL_CONF[number] }) {
  const y = useSharedValue(-20);
  const op = useSharedValue(0);
  useEffect(() => {
    op.value = withDelay(c.delay, withTiming(1, { duration: 80 }));
    y.value  = withDelay(c.delay, withTiming(SCREEN_H * 0.5, { duration: c.dur, easing: Easing.in(Easing.quad) }));
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], opacity: op.value }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', top: 0, left: c.left as any, width: c.size, height: c.size, borderRadius: c.size / 2, backgroundColor: c.color, zIndex: 10 }, style]}
    />
  );
}

// ─── Burst confetti (correct answer) ─────────────────────────────────────────
const BURST_COLORS = [LIME, BRAND, ROSE, '#5BC8FF', GOLD, TEAL];
const BURST_A = [0, 55, 110, 165, 220, 275, 30, 85, 140, 195, 250, 305];

function BurstParticle({ i, count }: { i: number; count: number }) {
  const a   = (BURST_A[i % 12] * Math.PI) / 180;
  const r   = 52 + (i * 11) % 36;
  const tx  = Math.cos(a) * r;
  const ty  = Math.sin(a) * r - 16;
  const sz  = 5 + (i % 4) * 2;
  const op  = useSharedValue(0);
  const trX = useSharedValue(0);
  const trY = useSharedValue(0);
  useEffect(() => {
    const d = i * 32;
    op.value  = withDelay(d, withSequence(withTiming(1, { duration: 70 }), withDelay(480, withTiming(0, { duration: 320 }))));
    trX.value = withDelay(d, withTiming(tx, { duration: 860, easing: Easing.out(Easing.cubic) }));
    trY.value = withDelay(d, withTiming(ty, { duration: 860, easing: Easing.out(Easing.cubic) }));
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ translateX: trX.value }, { translateY: trY.value }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', top: '50%', left: '50%', width: sz, height: sz, borderRadius: sz / 2, backgroundColor: BURST_COLORS[i % 6], marginLeft: -sz / 2, marginTop: -sz / 2 }, style]}
    />
  );
}
function ConfettiBurst({ count = 6 }: { count?: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: count }, (_, i) => <BurstParticle key={i} i={i} count={count} />)}
    </View>
  );
}

// ─── Quiz option ──────────────────────────────────────────────────────────────
function QuizOption({ opt, selected, revealed, isCorrectOpt, onPress }: {
  opt: { id: string; text: string };
  selected: boolean; revealed: boolean; isCorrectOpt: boolean; onPress: () => void;
}) {
  const scale      = useSharedValue(1);
  const shakeX     = useSharedValue(0);
  const checkScale = useSharedValue(0);

  useEffect(() => {
    if (revealed && selected && !isCorrectOpt) {
      shakeX.value = withSequence(
        withTiming(-10, { duration: 55 }),
        withTiming(10,  { duration: 55 }),
        withTiming(-6,  { duration: 55 }),
        withTiming(6,   { duration: 55 }),
        withTiming(0,   { duration: 55 })
      );
    }
    if (revealed && isCorrectOpt) {
      checkScale.value = withSequence(
        withSpring(1.4, { mass: 0.3, stiffness: 550, damping: 9 }),
        withSpring(1,   { mass: 0.3, stiffness: 300, damping: 18 })
      );
    }
  }, [revealed]);

  const handlePress = () => {
    if (revealed) return;
    scale.value = withSequence(
      withTiming(0.95, { duration: 75 }),
      withSpring(1.03, { mass: 0.3, stiffness: 480, damping: 13 }),
      withSpring(1,    { mass: 0.3, stiffness: 300, damping: 20 })
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };

  const borderColor =
    revealed && isCorrectOpt ? TEAL :
    revealed && selected    ? ROSE :
    selected                ? BRAND :
    'rgba(255,255,255,0.10)';

  const bgColor =
    revealed && isCorrectOpt ? 'rgba(0,194,168,0.14)' :
    revealed && selected    ? 'rgba(255,77,109,0.12)' :
    selected                ? 'rgba(124,90,255,0.16)' :
    'rgba(255,255,255,0.04)';

  const dimmed = revealed && !selected && !isCorrectOpt;
  const optStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateX: shakeX.value }],
    opacity: dimmed ? 0.28 : 1,
  }));
  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: checkScale.value }] }));

  return (
    <Animated.View style={optStyle}>
      <Pressable onPress={handlePress} style={{ borderRadius: 14 }}>
        <View style={[styles.option, { borderColor, backgroundColor: bgColor }]}>
          <View style={[styles.optionBadge, { borderColor, backgroundColor: borderColor + '33' }]}>
            <Text style={[styles.optionLetter, { color: borderColor }]}>{opt.id}</Text>
          </View>
          <Text style={styles.optionText}>{opt.text}</Text>
          {revealed && isCorrectOpt && (
            <Animated.Text style={[styles.optionIcon, { color: TEAL }, checkStyle]}>✓</Animated.Text>
          )}
          {revealed && selected && !isCorrectOpt && (
            <Text style={[styles.optionIcon, { color: ROSE }]}>✗</Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Feedback bottom sheet ────────────────────────────────────────────────────
function FeedbackSheet({ isCorrect, question, qIndex, streak, lives, xpGained, onContinue }: {
  isCorrect: boolean; question: DemoQuestion; qIndex: number;
  streak: number; lives: number; xpGained: number; onContinue: () => void;
}) {
  const { bottom } = useSafeAreaInsets();
  const sheetY  = useSharedValue(320);
  const opacity = useSharedValue(0);
  const countdownW = useSharedValue(1);

  useEffect(() => {
    sheetY.value  = withSpring(0, { mass: 0.55, stiffness: 230, damping: 26 });
    opacity.value = withTiming(1, { duration: 180 });
    if (isCorrect) {
      countdownW.value = withDelay(120, withTiming(0, { duration: 1500, easing: Easing.linear }));
    }
  }, []);

  const sheetStyle    = useAnimatedStyle(() => ({ transform: [{ translateY: sheetY.value }], opacity: opacity.value }));
  const countdownStyle = useAnimatedStyle(() => ({ width: (countdownW.value * 100 + '%') as any }));

  const borderColor   = isCorrect ? TEAL : ROSE;
  const bgColor       = isCorrect ? 'rgba(0,194,168,0.08)' : 'rgba(255,77,109,0.08)';

  const shortExplanation = question.explanation.length > 80
    ? question.explanation.slice(0, 78) + '…'
    : question.explanation;

  const continueLabel =
    qIndex === 2 ? 'Ver mis resultados →' :
    isCorrect    ? 'Continuar ahora →' :
    'Lo entiendo, sigamos →';

  return (
    <Animated.View style={[styles.sheet, { backgroundColor: '#100730', paddingBottom: bottom + 14 }, sheetStyle]}>
      {/* countdown bar (correct only) */}
      {isCorrect && (
        <View style={styles.countdownTrack}>
          <Animated.View style={[styles.countdownFill, countdownStyle]} />
        </View>
      )}

      <View style={[styles.sheetInner, { borderColor: borderColor + '55', backgroundColor: bgColor }]}>
        {/* title row */}
        <View style={styles.sheetTitleRow}>
          <Text style={styles.sheetEmoji}>{isCorrect ? '✅' : '❌'}</Text>
          <Text style={[styles.sheetTitle, { color: borderColor }]}>
            {isCorrect ? '¡Excelente!' : 'Casi 🤍'}
          </Text>
          {isCorrect && (
            <View style={styles.sheetXpPill}>
              <Text style={styles.sheetXpText}>+{xpGained} XP</Text>
            </View>
          )}
          {!isCorrect && (
            <View style={styles.sheetLives}>
              {[0,1,2].map(i => <Text key={i} style={{ fontSize: 13 }}>{i < lives ? '❤️' : '🤍'}</Text>)}
            </View>
          )}
        </View>

        {/* bonus badge (Q0 correct) */}
        {isCorrect && qIndex === 0 && (
          <View style={styles.bonusBadge}>
            <Text style={styles.bonusText}>💎 +10 XP bonus de bienvenida</Text>
          </View>
        )}

        {/* streak message (Q1+ correct) */}
        {isCorrect && qIndex === 1 && streak >= 2 && (
          <View style={styles.streakBadge}>
            <Text style={styles.streakText}>🔥 ¡{streak} seguidas! Las rachas multiplican tu XP.</Text>
          </View>
        )}

        {/* wrong Q1: lives tutorial */}
        {!isCorrect && qIndex === 1 && (
          <Text style={styles.sheetTutorial}>
            En NemUp los errores no bajan tu NEM — solo te enseñan. 3 vidas por sesión; se recargan en 4h o con 💎 gemas.
          </Text>
        )}

        {/* explanation */}
        <Text style={styles.sheetExplanation}>{shortExplanation}</Text>

        {/* source */}
        <Text style={styles.sheetQuote} numberOfLines={1}>
          📖 "{question.sourceQuote.slice(0, 55)}{question.sourceQuote.length > 55 ? '…' : ''}"
        </Text>
      </View>

      {/* burst confetti behind sheet for correct Q0 */}
      {isCorrect && qIndex === 0 && <View style={{ height: 0 }}><ConfettiBurst count={12} /></View>}
      {isCorrect && qIndex > 0   && <View style={{ height: 0 }}><ConfettiBurst count={6} /></View>}

      {/* continue row */}
      <View style={styles.sheetActions}>
        {isCorrect ? (
          <Pressable onPress={onContinue} style={styles.sheetSkipBtn}>
            <Text style={styles.sheetSkipText}>{continueLabel}</Text>
          </Pressable>
        ) : (
          <DuoButton label={continueLabel} onPress={onContinue} />
        )}
      </View>
    </Animated.View>
  );
}

// ─── 3D button ────────────────────────────────────────────────────────────────
function DuoButton({ label, sub, onPress, disabled }: {
  label: string; sub?: string; onPress: () => void; disabled?: boolean;
}) {
  const sink = useSharedValue(0);
  const face = useAnimatedStyle(() => ({ transform: [{ translateY: sink.value * 4 }] }));
  return (
    <View style={[styles.duoWrap, disabled && { opacity: 0.38 }]}>
      <View style={styles.duoFloor} />
      <Pressable
        onPressIn={() => { sink.value = withTiming(1, { duration: 75 }); }}
        onPressOut={() => { sink.value = withTiming(0, { duration: 110 }); }}
        onPress={onPress}
        disabled={disabled}
      >
        <Animated.View style={[styles.duoFace, face]}>
          <LinearGradient colors={[BRAND, '#B44EFF', '#FF5B9F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.duoGrad}>
            <Text style={styles.duoLabel}>{label}</Text>
            {sub ? <Text style={styles.duoSub}>{sub}</Text> : null}
          </LinearGradient>
        </Animated.View>
      </Pressable>
    </View>
  );
}

// ─── Quiz view ────────────────────────────────────────────────────────────────
function QuizView({ question, qIndex, phase, selected, isCorrect, streak, lives, xpGained, lostHeartIndex, xpEarned,
  onSelect, onComprobar, onContinue,
  activeToast,
}: {
  question: DemoQuestion; qIndex: number; phase: Phase; selected: string | null;
  isCorrect: boolean; streak: number; lives: number; xpGained: number;
  lostHeartIndex: number | null; xpEarned: number;
  onSelect: (id: string) => void; onComprobar: () => void; onContinue: () => void;
  activeToast: { msg: string; key: number } | null;
}) {
  const [showTooltip, setShowTooltip] = useState(qIndex === 0);
  const revealed = phase === 'answered';

  // question slide-in
  const qX  = useSharedValue(28);
  const qOp = useSharedValue(0);
  useEffect(() => {
    qX.value  = withSpring(0, { mass: 0.4, stiffness: 300, damping: 22 });
    qOp.value = withTiming(1, { duration: 240 });
  }, []);
  const qStyle = useAnimatedStyle(() => ({ opacity: qOp.value, transform: [{ translateX: qX.value }] }));

  return (
    <View style={{ flex: 1 }}>
      <ProgressHeader qIndex={qIndex} lives={lives} xpEarned={xpEarned} lostHeartIndex={lostHeartIndex} />

      <View style={styles.quizContent}>
        {/* source chip + tooltip */}
        <View style={styles.sourceArea}>
          <View style={styles.sourceChip}>
            <Text style={styles.sourceChipText}>📖 Apunte demo · Pág. {question.sourcePage}</Text>
          </View>
          {qIndex === 0 && (
            <TooltipBubble visible={showTooltip} onDismiss={() => setShowTooltip(false)} />
          )}
        </View>

        {/* question text */}
        <Animated.Text style={[styles.questionText, qStyle]}>
          {question.text}
        </Animated.Text>

        {/* options */}
        <View style={styles.optionsList}>
          {question.options.map(opt => (
            <QuizOption
              key={opt.id}
              opt={opt}
              selected={selected === opt.id}
              revealed={revealed}
              isCorrectOpt={opt.id === question.correctOptionId}
              onPress={() => !revealed && onSelect(opt.id)}
            />
          ))}
        </View>
      </View>

      {/* Sticky comprobar button */}
      {!revealed && (
        <View style={styles.stickyBtn}>
          <DuoButton label="Comprobar" onPress={onComprobar} disabled={!selected} />
        </View>
      )}

      {/* Floating toast */}
      {activeToast && <FloatingToast key={activeToast.key} message={activeToast.msg} />}

      {/* Feedback bottom sheet */}
      {revealed && (
        <FeedbackSheet
          isCorrect={isCorrect}
          question={question}
          qIndex={qIndex}
          streak={streak}
          lives={lives}
          xpGained={xpGained}
          onContinue={onContinue}
        />
      )}
    </View>
  );
}

// ─── Intro panel ──────────────────────────────────────────────────────────────
function IntroPanel({ session, onStart }: { session: DemoSession; onStart: () => void }) {
  const bounceScale = useSharedValue(0);
  useEffect(() => {
    bounceScale.value = withDelay(200, withSequence(
      withSpring(1.18, { mass: 0.4, stiffness: 280, damping: 10 }),
      withSpring(1,    { mass: 0.4, stiffness: 220, damping: 14 })
    ));
  }, []);
  const emojiStyle = useAnimatedStyle(() => ({ transform: [{ scale: bounceScale.value }] }));

  return (
    <View style={styles.introPad}>
      <View style={styles.introEmojiWrap}>
        <Animated.Text style={[styles.introEmoji, emojiStyle]}>{session.subjectEmoji}</Animated.Text>
      </View>
      <View style={{ gap: 14 }}>
        <Text style={styles.introTitle}>
          Entrena con{' '}
          <Text style={{ color: LIME }}>{session.subjectName}</Text>
          {' '}— siente cómo funciona NemUp.
        </Text>
        <View style={styles.introTopicCard}>
          <Text style={styles.introTopicLabel}>TEMA DE HOY</Text>
          <Text style={styles.introTopic}>{session.topic}</Text>
        </View>
        <Text style={styles.introSub}>
          3 preguntas · ~2 min · Después podrás subir tus propios apuntes 📚
        </Text>
      </View>
      <DuoButton label="¡Vamos! →" sub="Empezar entrenamiento" onPress={onStart} />
    </View>
  );
}

// ─── Result panel ─────────────────────────────────────────────────────────────
function ResultPanel({ session, correctCount, xpEarned, onUpload, onExplore }: {
  session: DemoSession; correctCount: number; xpEarned: number;
  onUpload: () => void; onExplore: () => void;
}) {
  const { bottom } = useSafeAreaInsets();
  const gems     = Math.round(xpEarned / 5);
  const accuracy = Math.round((correctCount / 3) * 100);

  const trophyScale = useSharedValue(0);
  const glow        = useSharedValue(0);
  useEffect(() => {
    trophyScale.value = withDelay(160, withSequence(
      withSpring(1.28, { mass: 0.4, stiffness: 280, damping: 10 }),
      withSpring(1,    { mass: 0.4, stiffness: 220, damping: 14 })
    ));
    glow.value = withDelay(500, withRepeat(
      withSequence(withTiming(1, { duration: 800 }), withTiming(0.4, { duration: 800 })),
      -1, false
    ));
  }, []);
  const trophyStyle = useAnimatedStyle(() => ({ transform: [{ scale: trophyScale.value }] }));
  const glowStyle   = useAnimatedStyle(() => ({
    shadowOpacity: glow.value * 0.7,
    shadowRadius: glow.value * 22 + 6,
  }));

  const anim = (opacity: any, y: any, d: number) => useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: y.value }] }));

  const s1op = useSharedValue(0); const s1y = useSharedValue(20);
  const s2op = useSharedValue(0); const s2y = useSharedValue(20);
  const s3op = useSharedValue(0); const s3y = useSharedValue(20);
  const s4op = useSharedValue(0); const s4y = useSharedValue(20);
  useEffect(() => {
    [[s1op,s1y,0],[s2op,s2y,180],[s3op,s3y,340],[s4op,s4y,500]].forEach(([op, y, d]: any) => {
      op.value = withDelay(d, withTiming(1, { duration: 380 }));
      y.value  = withDelay(d, withSpring(0, { mass: 0.5, stiffness: 200, damping: 18 }));
    });
  }, []);

  return (
    <View style={[styles.resultRoot, { paddingBottom: bottom + 20 }]}>
      {/* falling confetti */}
      {FALL_CONF.map((c, i) => <FallingPiece key={i} c={c} />)}

      {/* trophy */}
      <Animated.View style={[styles.trophyGlow, glowStyle, { shadowColor: LIME }]}>
        <Animated.Text style={[styles.trophyEmoji, trophyStyle]}>🏆</Animated.Text>
      </Animated.View>

      <Animated.View style={useAnimatedStyle(() => ({ opacity: s1op.value, transform: [{ translateY: s1y.value }] }))}>
        <Text style={styles.resultTitle}>¡Sesión <Text style={{ color: LIME }}>completada!</Text></Text>
        <Text style={styles.resultSub}>Terminaste el entrenamiento demo de {session.subjectName}</Text>
      </Animated.View>

      {/* stats */}
      <Animated.View style={useAnimatedStyle(() => ({ opacity: s2op.value, transform: [{ translateY: s2y.value }] }))}>
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>
              <AnimatedNumber to={xpEarned} delay={280} style={styles.statValue} />
            </Text>
            <Text style={styles.statLabel}>XP ganados</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>
              <AnimatedNumber to={gems} delay={380} style={styles.statValue} />
            </Text>
            <Text style={styles.statLabel}>💎 Gemas</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>
              <AnimatedNumber to={accuracy} delay={480} style={styles.statValue} />%
            </Text>
            <Text style={styles.statLabel}>Aciertos</Text>
          </View>
        </View>
      </Animated.View>

      {/* next step card */}
      <Animated.View style={useAnimatedStyle(() => ({ opacity: s3op.value, transform: [{ translateY: s3y.value }] }))}>
        <View style={styles.nextCard}>
          <LinearGradient colors={[LIME + '1A', LIME + '06']} style={StyleSheet.absoluteFill} />
          <Text style={styles.nextCardTitle}>🎯 Próximo paso</Text>
          <Text style={styles.nextCardBody}>
            Sube tus apuntes de{' '}
            <Text style={{ color: LIME, fontWeight: '800' }}>{session.subjectName}</Text>
            {' '}y NemUp generará sesiones igual de buenas, pero con tu material.
          </Text>
          <Text style={styles.nextCardSub}>⚡ Las sesiones con tus apuntes valen el doble de XP</Text>
        </View>
      </Animated.View>

      {/* buttons */}
      <Animated.View style={[useAnimatedStyle(() => ({ opacity: s4op.value, transform: [{ translateY: s4y.value }] })), { gap: 4 }]}>
        <DuoButton label="📸 Subir mis apuntes" onPress={onUpload} />
        <Pressable onPress={onExplore} style={styles.ghostBtn}>
          <Text style={styles.ghostBtnText}>Explorar la app</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function FirstSessionScreen() {
  const { state }  = useOnboarding();
  const router     = useRouter();

  const session = useMemo<DemoSession>(() => {
    const subjectId = state.data.subjects[0] ?? 'general';
    return getDemoSession(subjectId);
  }, []);

  const [phase,         setPhase]         = useState<Phase>('loading');
  const [qIndex,        setQIndex]        = useState(0);
  const [selected,      setSelected]      = useState<string | null>(null);
  const [isCorrect,     setIsCorrect]     = useState(false);
  const [correctCount,  setCorrectCount]  = useState(0);
  const [xpEarned,      setXpEarned]      = useState(0);
  const [lives,         setLives]         = useState(3);
  const [streak,        setStreak]        = useState(0);
  const [xpGained,      setXpGained]      = useState(0);
  const [lostHeart,     setLostHeart]     = useState<number | null>(null);
  const [activeToast,   setActiveToast]   = useState<{ msg: string; key: number } | null>(null);

  const autoTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastKeyRef   = useRef(0);

  const showToast = (msg: string) => {
    if (toastKeyRef.current > 0) return; // throttle
    toastKeyRef.current++;
    setActiveToast({ msg, key: toastKeyRef.current });
    setTimeout(() => { setActiveToast(null); toastKeyRef.current = 0; }, 1300);
  };

  const cancelAutoAdvance = () => {
    if (autoTimerRef.current) { clearTimeout(autoTimerRef.current); autoTimerRef.current = null; }
  };

  // On mount: check completed / resume
  useEffect(() => {
    AsyncStorage.getItem(COMPLETED_KEY).then(done => {
      if (done === 'true') { router.replace('/home'); return; }
      AsyncStorage.getItem(PROGRESS_KEY).then(raw => {
        if (raw) {
          const p: SavedProgress = JSON.parse(raw);
          setQIndex(p.qIndex); setCorrectCount(p.correctCount);
          setXpEarned(p.xpEarned); setLives(p.lives); setStreak(p.streak);
          setPhase('answering');
        } else {
          setPhase('intro');
        }
      });
    });
  }, []);

  useEffect(() => {
    if (phase === 'answering') {
      AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify({ qIndex, correctCount, xpEarned, lives, streak }));
    }
  }, [phase, qIndex]);

  const handleComprobar = () => {
    if (!selected) return;
    const q       = session.questions[qIndex];
    const correct = selected === q.correctOptionId;
    const gained  = correct ? (qIndex === 0 ? 30 : 10) : 0;
    const newStreak = correct ? streak + 1 : 0;
    const newLives  = correct ? lives : Math.max(0, lives - 1);

    setIsCorrect(correct);
    setStreak(newStreak);
    setXpGained(gained);
    setXpEarned(prev => prev + gained);
    if (correct) setCorrectCount(prev => prev + 1);

    if (!correct) {
      setLostHeart(newLives);
      setLives(newLives);
      setTimeout(() => setLostHeart(null), 700);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (qIndex === 0)         showToast('💎 Bonus XP desbloqueado!');
      else if (newStreak >= 3)  showToast('⚡ ¡Perfecto! 3 seguidas');
      else if (newStreak >= 2)  showToast(`🔥 ¡Racha x${newStreak}!`);
      else                      showToast('🚀 ¡Excelente!');

      // auto-advance after 1.5s
      autoTimerRef.current = setTimeout(() => {
        autoTimerRef.current = null;
        handleContinue();
      }, 1600);
    }

    setPhase('answered');
  };

  const handleContinue = () => {
    cancelAutoAdvance();
    if (qIndex < 2) {
      setQIndex(prev => prev + 1);
      setSelected(null);
      setPhase('answering');
    } else {
      AsyncStorage.setItem(COMPLETED_KEY, 'true');
      AsyncStorage.removeItem(PROGRESS_KEY);
      setPhase('result');
    }
  };

  const inQuiz = phase === 'answering' || phase === 'answered';

  return (
    <ScreenContainer style={styles.root} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={BG1} />
      <LinearGradient colors={[BG1, BG2, '#180F38']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />

      {phase === 'loading' && (
        <View style={styles.loadingCenter}><Text style={{ fontSize: 32 }}>⏳</Text></View>
      )}

      {phase === 'intro' && (
        <IntroPanel session={session} onStart={() => setPhase('answering')} />
      )}

      {inQuiz && (
        <QuizView
          key={qIndex}
          question={session.questions[qIndex]}
          qIndex={qIndex}
          phase={phase}
          selected={selected}
          isCorrect={isCorrect}
          streak={streak}
          lives={lives}
          xpGained={xpGained}
          lostHeartIndex={lostHeart}
          xpEarned={xpEarned}
          onSelect={setSelected}
          onComprobar={handleComprobar}
          onContinue={handleContinue}
          activeToast={activeToast}
        />
      )}

      {phase === 'result' && (
        <ResultPanel
          session={session}
          correctCount={correctCount}
          xpEarned={xpEarned}
          onUpload={() => router.replace('/modals/upload' as any)}
          onExplore={() => router.replace('/home')}
        />
      )}
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:         { flex: 1, backgroundColor: BG1 },
  loadingCenter:{ flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header:        { paddingHorizontal: 20, paddingTop: SM ? 6 : 10, paddingBottom: 8 },
  progressTrack: { height: 7, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 4, overflow: 'hidden', marginBottom: 10 },
  progressFill:  {
    height: '100%', borderRadius: 4, backgroundColor: LIME,
    shadowColor: LIME, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.85, shadowRadius: 7, elevation: 5,
    overflow: 'hidden',
  },
  progressGlow:  { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.50)' },
  progressLead:  { position: 'absolute', right: 0, top: -1, bottom: -1, width: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.90)' },
  headerRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerQ:       { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.45)', letterSpacing: 0.5 },
  headerRight:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  livesRow:      { flexDirection: 'row', gap: 3 },
  heart:         { fontSize: 14 },
  xpBadge:       { backgroundColor: 'rgba(196,248,82,0.16)', borderRadius: 9, paddingVertical: 3, paddingHorizontal: 8 },
  xpBadgeText:   { fontSize: 11, fontWeight: '800', color: LIME },

  // Quiz layout
  quizContent:  { flex: 1, paddingHorizontal: 20, paddingTop: SM ? 8 : 12 },
  sourceArea:   { marginBottom: 10 },
  sourceChip:   {
    alignSelf: 'flex-start', backgroundColor: 'rgba(196,248,82,0.10)',
    borderRadius: 8, borderWidth: 1, borderColor: 'rgba(196,248,82,0.25)',
    paddingVertical: 4, paddingHorizontal: 10,
  },
  sourceChipText: { fontSize: 11, fontWeight: '700', color: LIME },
  questionText: {
    fontSize: SM ? 19 : 22, fontWeight: '800', color: '#FFF',
    lineHeight: SM ? 27 : 31, marginBottom: SM ? 18 : 22,
  },
  optionsList:  { gap: SM ? 7 : 9 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderRadius: 14, padding: SM ? 11 : 13,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 3,
  },
  optionBadge:  { width: 30, height: 30, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  optionLetter: { fontSize: 12, fontWeight: '900' },
  optionText:   { flex: 1, fontSize: SM ? 13 : 14, color: 'rgba(255,255,255,0.92)', fontWeight: '500', lineHeight: SM ? 18 : 20 },
  optionIcon:   { fontSize: 18, fontWeight: '900' },

  // Sticky button
  stickyBtn: { paddingHorizontal: 20, paddingBottom: SM ? 18 : 24, paddingTop: 8 },

  // Tooltip
  tooltip:       { marginTop: 6, marginBottom: 4, zIndex: 20 },
  tooltipArrow:  {
    width: 0, height: 0,
    borderLeftWidth: 7, borderRightWidth: 7, borderBottomWidth: 7,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    borderBottomColor: 'rgba(28,12,66,0.97)',
    marginLeft: 14,
  },
  tooltipBody:   { backgroundColor: 'rgba(28,12,66,0.97)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(124,90,255,0.38)' },
  tooltipText:   { fontSize: 12, color: 'rgba(255,255,255,0.78)', lineHeight: 17 },
  tooltipBtn:    { marginTop: 8, alignSelf: 'flex-end' },
  tooltipBtnText:{ fontSize: 11, fontWeight: '800', color: LIME },

  // Feedback sheet
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 0,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 16,
  },
  countdownTrack:{ height: 3, backgroundColor: 'rgba(196,248,82,0.18)', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', marginBottom: 0 },
  countdownFill: { height: '100%', backgroundColor: LIME, borderTopLeftRadius: 24 },
  sheetInner:    { margin: 14, marginTop: 12, borderRadius: 16, borderWidth: 1, padding: SM ? 12 : 14 },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sheetEmoji:    { fontSize: 18 },
  sheetTitle:    { fontSize: SM ? 16 : 18, fontWeight: '900', flex: 1 },
  sheetXpPill:   { backgroundColor: 'rgba(0,194,168,0.18)', borderRadius: 8, borderWidth: 1, borderColor: TEAL + '55', paddingVertical: 2, paddingHorizontal: 8 },
  sheetXpText:   { fontSize: 11, fontWeight: '800', color: TEAL },
  sheetLives:    { flexDirection: 'row', gap: 2 },
  bonusBadge:    { backgroundColor: 'rgba(196,248,82,0.12)', borderRadius: 8, borderWidth: 1, borderColor: LIME + '40', paddingVertical: 4, paddingHorizontal: 10, marginBottom: 8, alignSelf: 'flex-start' },
  bonusText:     { fontSize: 11, fontWeight: '800', color: LIME },
  streakBadge:   { backgroundColor: 'rgba(255,181,71,0.10)', borderRadius: 8, borderWidth: 1, borderColor: GOLD + '44', paddingVertical: 4, paddingHorizontal: 10, marginBottom: 8, alignSelf: 'flex-start' },
  streakText:    { fontSize: 11, fontWeight: '700', color: GOLD },
  sheetTutorial: { fontSize: 11, color: 'rgba(255,255,255,0.62)', lineHeight: 16, marginBottom: 8 },
  sheetExplanation: { fontSize: SM ? 12 : 13, color: 'rgba(255,255,255,0.72)', lineHeight: SM ? 17 : 19, marginBottom: 6 },
  sheetQuote:    { fontSize: 10, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' },
  sheetActions:  { paddingHorizontal: 14, paddingBottom: 2 },
  sheetSkipBtn:  { alignItems: 'center', paddingVertical: 12 },
  sheetSkipText: { fontSize: 14, fontWeight: '800', color: 'rgba(255,255,255,0.55)' },

  // Floating toast
  toast: {
    position: 'absolute', alignSelf: 'center', top: '30%',
    backgroundColor: 'rgba(196,248,82,0.15)', borderRadius: 20, borderWidth: 1, borderColor: LIME + '55',
    paddingVertical: 7, paddingHorizontal: 16, zIndex: 50,
  },
  toastText: { fontSize: 14, fontWeight: '900', color: LIME },

  // 3D button
  duoWrap:  { },
  duoFloor: { position: 'absolute', top: 6, left: 0, right: 0, bottom: 0, borderRadius: 14, backgroundColor: FLOOR },
  duoFace:  { borderRadius: 14, overflow: 'hidden', marginBottom: 6 },
  duoGrad:  { paddingVertical: SM ? 13 : 15, alignItems: 'center', gap: 3 },
  duoLabel: { fontSize: SM ? 15 : 16, fontWeight: '900', color: '#FFF' },
  duoSub:   { fontSize: SM ? 9 : 10, fontWeight: '600', color: 'rgba(255,255,255,0.60)' },

  // Intro
  introPad:       { flex: 1, padding: 24, paddingTop: SM ? 20 : 32, justifyContent: 'space-between' },
  introEmojiWrap: { alignItems: 'center' },
  introEmoji:     { fontSize: SM ? 68 : 84 },
  introTitle:     { fontSize: SM ? 20 : 23, fontWeight: '800', color: '#FFF', textAlign: 'center', lineHeight: SM ? 28 : 32 },
  introTopicCard: { backgroundColor: 'rgba(124,90,255,0.14)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(124,90,255,0.32)', padding: 14 },
  introTopicLabel:{ fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.38)', letterSpacing: 1.6, marginBottom: 5 },
  introTopic:     { fontSize: SM ? 14 : 15, fontWeight: '700', color: '#FFF' },
  introSub:       { fontSize: SM ? 12 : 13, color: 'rgba(255,255,255,0.50)', textAlign: 'center', lineHeight: 19 },

  // Result
  resultRoot:   { flex: 1, paddingHorizontal: 24, paddingTop: SM ? 16 : 24, gap: SM ? 16 : 20, justifyContent: 'center' },
  trophyGlow:   { alignItems: 'center', shadowOffset: { width: 0, height: 0 } },
  trophyEmoji:  { fontSize: SM ? 68 : 80 },
  resultTitle:  { fontSize: SM ? 24 : 28, fontWeight: '900', color: '#FFF', textAlign: 'center' },
  resultSub:    { fontSize: SM ? 12 : 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center', marginTop: 4 },
  statsRow:     { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: SM ? 14 : 16 },
  statBox:      { flex: 1, alignItems: 'center', gap: 4 },
  statValue:    { fontSize: SM ? 22 : 26, fontWeight: '900', color: LIME },
  statLabel:    { fontSize: 10, color: 'rgba(255,255,255,0.42)', fontWeight: '600' },
  statDivider:  { width: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  nextCard:     { borderRadius: 16, borderWidth: 1.5, borderColor: LIME + '50', padding: 14, overflow: 'hidden', gap: 6 },
  nextCardTitle:{ fontSize: SM ? 13 : 14, fontWeight: '900', color: LIME },
  nextCardBody: { fontSize: SM ? 12 : 13, color: 'rgba(255,255,255,0.78)', lineHeight: SM ? 18 : 20 },
  nextCardSub:  { fontSize: 11, color: 'rgba(255,255,255,0.42)' },
  ghostBtn:     { alignItems: 'center', paddingVertical: 14 },
  ghostBtnText: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.42)' },
});
