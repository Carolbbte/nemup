import { DAILY_SESSION_LOGIC, FIXED_QUIZ_FEEDBACK, MAX_ATTEMPTS_PER_QUESTION, MODE_COMPLETION_REDESIGN, NEUTRAL_MISSION_COMPLETION, SHOW_GEMS, UNIFIED_PROGRESS_BAR, UNIFIED_QUIZ_COMPLETION } from '@/config/features';
import ModeCompletionScreen from '@/components/ModeCompletionScreen';
import UnifiedProgressBar from '@/components/UnifiedProgressBar';
import { useDailySession } from '@/contexts/DailySessionContext';
import type { DailyMode } from '@/contexts/DailySessionContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { palette, semantic } from '@/theme/colors';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Layers,
  RefreshCw,
  RotateCcw,
  X,
  Zap,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SM    = SCREEN_H < 740;
const BG    = palette.crema;
const BRAND = palette.morado;
const NEON  = palette.morado;
const LIME  = palette.limaElectrica;

// ── Types ─────────────────────────────────────────────────────────
type Option  = { id: string; text: string };
type Question = { id: string; text: string; options: Option[]; correctOptionId: string; explanation: string; sourceQuote: string };
type Flashcard = { id: string; front: string; back: string };
type SummarySlideType = 'concept' | 'key_fact' | 'important' | 'remember' | 'example' | 'curiosity' | 'wow_fact'
  | 'mission' | 'main_concept' | 'micro_challenge' | 'reinforcement_challenge' | 'comprehension' | 'key_relation' | 'mini_quiz' | 'process_flow' | 'application' | 'common_error' | 'final_challenge' | 'victory' | 'challenge' | 'decide' | 'order_sequence' | 'quiz_transition';
type IllustrationType = 'educational' | 'diagram' | 'concept' | 'timeline' | 'map' | 'process' | 'comparison';
type BackendSlide = { type: SummarySlideType; emoji: string; title: string; definition: string; example: string; visualHint?: string; illustrationType?: IllustrationType; connector?: string | null; question?: string | null; options?: string[] | null; correctAnswer?: string | null; wrongAnswerHints?: Record<string, string> | null };
type LegacySection = { heading: string; content: string; keyPoints: string[] };
type Session = {
  id?: string; userId?: string;
  subject: string; topic: string; estimatedDuration: number; difficulty: string;
  xpReward: number; baseXpReward?: number; gemReward: number; questions: Question[]; flashcards: Flashcard[];
  summary: { title: string; slides?: BackendSlide[]; sections?: LegacySection[] };
};
type Phase     = 'lobby' | 'mode-select' | 'summary' | 'quiz' | 'flashcards' | 'celebration' | 'complete';
type QuizStep  = 'answering' | 'correct' | 'wrong';

// ── Constants ─────────────────────────────────────────────────────
const LETTERS        = ['A', 'B', 'C', 'D', 'E'];
const MAX_LIVES      = 3;
const XP_PER_CORRECT = 15;
const XP_PER_SUMMARY = 20;
const XP_PER_CARD    = 5;

const SUBJECT_EMOJI: [string, string][] = [
  ['biolog', '🧬'], ['matemát', '📐'], ['matemat', '📐'],
  ['histor', '🌎'], ['físic', '⚡'],   ['fisic', '⚡'],
  ['químic', '🧪'], ['quimic', '🧪'], ['lenguaj', '📝'],
  ['inglés', '🗣️'], ['ingles', '🗣️'], ['economí', '📈'],
  ['economi', '📈'], ['psicolog', '🧠'], ['geograf', '🗺️'],
  ['filosofí', '🤔'], ['filosof', '🤔'],
];
function getSubjectEmoji(subject: string) {
  const k = (subject ?? '').toLowerCase();
  return SUBJECT_EMOJI.find(([key]) => k.includes(key))?.[1] ?? '📚';
}

// Quiz engagement constants
const COMBO_SIZE = 6;
const COMBO_MILESTONES: Record<number, { xp: number; msg: string }> = {
  2: { xp: 5,  msg: '🔥 Combo ×2  +5 XP'  },
  4: { xp: 10, msg: '⚡ Combo ×4  +10 XP' },
  6: { xp: 20, msg: '🚀 Combo ×6  +20 XP' },
};
const STREAK_MESSAGES: Record<number, string> = {
  1: '🔥 En marcha',
  2: '🔥🔥 En racha',
  3: '⚡ Excelente ritmo',
  4: '🚀 Imparable',
  5: '🏆 Dominando el tema',
};
const MICRO_REWARD_MSGS: Record<number, string> = {
  3:  '🏆 Concepto dominado',
  5:  '🎯 Dominando el tema',
  7:  '⚡ Bonus XP desbloqueado',
  10: '📚 ¡Tema completado!',
};
const SUMMARY_REWARDS = ['✨ +10 XP', '🔥 Correcto', '⚡ Muy bien', '🎯 Excelente'];

const MISSION_FB_OK: Array<{ emoji: string; text: string }> = [
  { emoji: '🎉', text: '¡Bien hecho!' },
  { emoji: '⚡', text: '¡Excelente!' },
  { emoji: '🔥', text: '¡Vas muy bien!' },
  { emoji: '🚀', text: '¡Lo dominaste!' },
  { emoji: '🏆', text: '¡Respuesta perfecta!' },
  { emoji: '⭐', text: '¡Gran trabajo!' },
  { emoji: '💎', text: '¡Nivel desbloqueado!' },
  { emoji: '🎯', text: '¡Exacto!' },
  { emoji: '🧠', text: '¡Lo entendiste!' },
  { emoji: '✨', text: '¡Brillante!' },
  { emoji: '👊', text: '¡Eso es!' },
  { emoji: '🌟', text: '¡Espectacular!' },
  { emoji: '💡', text: '¡Lo captaste!' },
  { emoji: '🎊', text: '¡Increíble!' },
  { emoji: '🦁', text: '¡Como un experto!' },
  { emoji: '🏅', text: '¡De primera!' },
  { emoji: '🌈', text: '¡Perfecto!' },
  { emoji: '🔑', text: '¡Clave encontrada!' },
  { emoji: '💥', text: '¡Boom, correcto!' },
  { emoji: '🎮', text: '¡Siguiente nivel!' },
  { emoji: '🌊', text: '¡Imparable!' },
  { emoji: '🦋', text: '¡Volando alto!' },
];

const MISSION_FB_ERR: Array<{ emoji: string; text: string }> = [
  { emoji: '💡', text: 'Casi.' },
  { emoji: '🤔', text: 'Buena prueba.' },
  { emoji: '🎯', text: 'Estuviste cerca.' },
  { emoji: '💪', text: 'Sigue intentando.' },
  { emoji: '🧩', text: 'Ya lo tendrás.' },
  { emoji: '🌱', text: 'Aprendiste algo nuevo.' },
  { emoji: '🔄', text: 'Así se aprende.' },
  { emoji: '🤗', text: 'No te preocupes.' },
  { emoji: '🎓', text: 'Buen intento.' },
  { emoji: '💫', text: 'La próxima es tuya.' },
  { emoji: '🛸', text: 'Sigue adelante.' },
];
const NEMI_MSGS = [
  'Buen comienzo.',
  'Ya entendiste este concepto.',
  'Excelente progreso.',
  'Eres constante. Eso importa.',
  'Tu ritmo es sólido.',
  'Un concepto más dominado.',
  'Vamos por la última.',
];
const MOTIV_POOLS = {
  start:  ['🚀 ¡Empezamos!', '🧠 Vamos paso a paso.', '🔥 Construyamos una racha.'],
  early:  ['🎯 Ya avanzaste.', '🔥 Mantén el ritmo.', '⚡ Lo estás haciendo bien.'],
  mid:    ['🚀 Ya pasaste la mitad.', '⚡ Estás en racha.', '🎯 Sigue así.'],
  end:    ['🔥 No rompas la racha.', '🎯 Te falta una.', '🚀 Ya casi terminas.'],
  streak: ['🚀 Imparable, sigue así.', '⚡ Mantén tu racha.', '🔥🔥 ¡En llamas!'],
};
function pickMotivMsg(quizIdx: number, total: number, streak: number, prev: string): string {
  const pool =
    streak >= 3            ? MOTIV_POOLS.streak :
    quizIdx === 0          ? MOTIV_POOLS.start  :
    quizIdx >= total - 2   ? MOTIV_POOLS.end    :
    quizIdx >= total / 2   ? MOTIV_POOLS.mid    :
    MOTIV_POOLS.early;
  const filtered = pool.filter(m => m !== prev);
  const src = filtered.length > 0 ? filtered : pool;
  return src[Math.floor(Math.random() * src.length)];
}

function formatMissionTime(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) return '< 1 min';
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// ── Confetti ──────────────────────────────────────────────────────
const CONFETTI_DATA = [
  { left: '8%',  bg: LIME,      size: 9,  dur: 2800, delay: 0,    zig: 8 },
  { left: '18%', bg: '#FF5B9F', size: 7,  dur: 3100, delay: 300,  zig: -10, r: 4 },
  { left: '30%', bg: '#5BC8FF', size: 10, dur: 2600, delay: 700,  zig: 12 },
  { left: '42%', bg: LIME,      size: 6,  dur: 3500, delay: 150,  zig: -8, r: 3 },
  { left: '55%', bg: '#FFB547', size: 9,  dur: 2900, delay: 500,  zig: 6 },
  { left: '66%', bg: NEON,      size: 7,  dur: 3200, delay: 900,  zig: -12, r: 4 },
  { left: '76%', bg: '#FF5B9F', size: 8,  dur: 2700, delay: 250,  zig: 10, r: 4 },
  { left: '86%', bg: LIME,      size: 6,  dur: 3400, delay: 600,  zig: -6, r: 3 },
  { left: '22%', bg: '#5BC8FF', size: 8,  dur: 3000, delay: 400,  zig: 8, r: 4 },
  { left: '48%', bg: '#FFB547', size: 7,  dur: 2500, delay: 800,  zig: -10 },
  { left: '90%', bg: LIME,      size: 9,  dur: 3300, delay: 100,  zig: 6 },
  { left: '60%', bg: '#5BC8FF', size: 6,  dur: 2800, delay: 1100, zig: -8, r: 3 },
] as const;
type CItem = (typeof CONFETTI_DATA)[number];

function ConfettiPiece({ item }: { item: CItem }) {
  const ty = useSharedValue(-20);
  const tx = useSharedValue(0);
  const rot = useSharedValue(0);
  useEffect(() => {
    ty.value  = withDelay(item.delay, withRepeat(withTiming(SCREEN_H + 40, { duration: item.dur, easing: Easing.linear }), -1, false));
    tx.value  = withDelay(item.delay, withRepeat(withSequence(
      withTiming(item.zig,            { duration: item.dur * 0.25, easing: Easing.inOut(Easing.sin) }),
      withTiming(-item.zig,           { duration: item.dur * 0.25, easing: Easing.inOut(Easing.sin) }),
      withTiming(item.zig * 0.6,      { duration: item.dur * 0.25, easing: Easing.inOut(Easing.sin) }),
      withTiming(0,                   { duration: item.dur * 0.25, easing: Easing.inOut(Easing.sin) }),
    ), -1, false));
    rot.value = withDelay(item.delay, withRepeat(withTiming(720, { duration: item.dur, easing: Easing.linear }), -1, false));
  }, []);
  const anim = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { rotateZ: rot.value + 'deg' }],
  }));
  return (
    <Animated.View style={[
      { position: 'absolute', top: -20, width: item.size, height: item.size,
        backgroundColor: item.bg, borderRadius: 'r' in item ? (item as any).r : 2,
        left: item.left as any },
      anim,
    ]} />
  );
}

// ── Animated counter (result screen) ─────────────────────────────
function AnimatedCounter({ to, delay = 0, style, prefix = '', suffix = '' }: {
  to: number; delay?: number; style?: any; prefix?: string; suffix?: string;
}) {
  const sv  = useSharedValue(0);
  const [val, setVal] = useState(0);
  useAnimatedReaction(
    () => Math.round(sv.value * to),
    (cur, prev) => { if (cur !== prev) runOnJS(setVal)(cur); },
  );
  useEffect(() => {
    sv.value = withDelay(delay, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [to]);
  return <Text style={style}>{prefix}{val}{suffix}</Text>;
}

// ── Pill progress bar ─────────────────────────────────────────────
function PillBar({ filled, total, color }: { filled: number; total: number; color: string }) {
  const count  = Math.min(total, 20);
  const active = Math.round((filled / Math.max(total, 1)) * count);
  return (
    <View style={{ flexDirection: 'row', flex: 1, gap: 3 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ flex: 1, height: 6, borderRadius: 3,
          backgroundColor: i < active ? color : 'rgba(0,0,0,0.08)' }} />
      ))}
    </View>
  );
}

// ── Flip card ─────────────────────────────────────────────────────
function FlipCard({ front, back, onFlip }: { front: string; back: string; onFlip?: (f: boolean) => void }) {
  const flip    = useSharedValue(0);
  const flipped = useRef(false);

  const frontStyle = useAnimatedStyle(() => ({
    opacity: interpolate(flip.value, [0, 0.45, 0.55, 1], [1, 0, 0, 0]),
    transform: [{ perspective: 1200 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: interpolate(flip.value, [0, 0.45, 0.55, 1], [0, 0, 1, 1]),
    transform: [{ perspective: 1200 }, { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` }],
  }));

  const handlePress = () => {
    const target = flipped.current ? 0 : 1;
    flipped.current = !flipped.current;
    flip.value = withSpring(target, { damping: 16, stiffness: 130 });
    onFlip?.(flipped.current);
  };

  return (
    <Pressable onPress={handlePress} style={fcd.container}>
      <Animated.View style={[fcd.face, fcd.front, frontStyle]}>
        <Text style={fcd.label}>CONCEPTO</Text>
        <Text style={fcd.frontText}>{front}</Text>
        <View style={fcd.hint}>
          <RotateCcw size={14} color={semantic.textTertiary} strokeWidth={2} />
          <Text style={fcd.hintText}>Toca para voltear</Text>
        </View>
      </Animated.View>
      <Animated.View style={[fcd.face, fcd.back, backStyle]}>
        <Text style={[fcd.label, { color: BRAND }]}>EXPLICACIÓN</Text>
        <Text style={fcd.backText}>{back}</Text>
      </Animated.View>
    </Pressable>
  );
}
const fcd = StyleSheet.create({
  container: { flex: 1, marginHorizontal: 20, marginVertical: 12 },
  face: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 28, alignItems: 'center', justifyContent: 'center', padding: 28,
    borderWidth: 1, borderColor: palette.bordeClaro,
  },
  front:     { backgroundColor: palette.blanco },
  back:      { backgroundColor: '#F0EDFF' },
  label:     { fontSize: 10, fontWeight: '800', color: semantic.textTertiary, letterSpacing: 1.5, marginBottom: 24 },
  frontText: { fontSize: SM ? 26 : 32, fontWeight: '900', color: semantic.textPrimary, textAlign: 'center', letterSpacing: -0.5, lineHeight: SM ? 34 : 42 },
  backText:  { fontSize: SM ? 15 : 17, color: semantic.textPrimary, textAlign: 'center', lineHeight: SM ? 24 : 28, fontWeight: '500' },
  hint:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 28 },
  hintText:  { fontSize: 12, color: semantic.textTertiary, fontStyle: 'italic' },
});

// ── Summary slide style config (for kp-type cards) ───────────────
const SLIDE_STYLE: Record<string, { accent: string; bg: string; label: string }> = {
  key_fact:  { accent: '#5B3DF5', bg: 'rgba(91,61,245,0.08)',  label: '💡 Dato clave' },
  important: { accent: '#FF7A2B', bg: 'rgba(255,122,43,0.08)', label: '🔥 Importante' },
  remember:  { accent: '#00C2A8', bg: 'rgba(0,194,168,0.08)',  label: '🎯 Recuerda' },
  curiosity: { accent: '#FFB547', bg: 'rgba(255,181,71,0.08)', label: '✨ Curiosidad' },
};

// ── Summary slide builder ─────────────────────────────────────────
type SummarySlide =
  | BackendSlide
  | { type: 'quiz';       question: string; options: Option[]; correctId: string; explanation: string }
  | { type: 'prediction'; prompt: string; hint: string }
  | { type: 'motivation'; emoji: string; message: string; sub: string };

function buildSummarySlides(backendSlides: BackendSlide[], questions: Question[]): SummarySlide[] {
  if (!backendSlides.length) {
    return [{ type: 'concept', emoji: '📚', title: 'Resumen', definition: '', example: '' }];
  }

  // Mission model: quality pass before rendering
  if (backendSlides[0].type === 'mission') {
    const INTER = ['micro_challenge', 'reinforcement_challenge', 'comprehension', 'mini_quiz', 'final_challenge', 'decide', 'order_sequence'];
    const isInteractive = (s: BackendSlide) =>
      INTER.includes(s.type) || (s.type === 'wow_fact' && !!s.question?.trim());

    // Helper: content words for redundancy check (Spanish stopwords removed, ≥3 chars)
    const STOPS = new Set(['que', 'de', 'la', 'el', 'en', 'es', 'un', 'una', 'los', 'las', 'del',
      'al', 'y', 'o', 'a', 'se', 'su', 'por', 'con', 'para', 'mas', 'pero', 'como', 'si',
      'no', 'le', 'lo', 'hay', 'cada', 'vez', 'cuando', 'esto', 'este', 'eso', 'esa', 'son']);
    const keyWords = (text: string): Set<string> =>
      new Set(text.toLowerCase().replace(/[^a-záéíóúüñ\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !STOPS.has(w)));

    // Step 1: sanitise — never drop, always convert/fallback
    const SLIDE_CONTENT_FALLBACKS: Record<string, { title: string; definition: string }> = {
      mission: { title: '¡Comienza la misión!', definition: 'Al terminar, podrás aplicar lo aprendido con confianza.' },
      main_concept: { title: 'Concepto principal', definition: 'Este es el concepto central que debes comprender bien.' },
      micro_challenge: { title: 'Checkpoint', definition: 'Responde antes de continuar.' },
      reinforcement_challenge: { title: 'Refuerzo', definition: 'Aplica lo que acabas de aprender.' },
      comprehension: { title: '¿Comprendiste?', definition: '🎯 Reflexiona sobre lo que acabas de ver.' },
      mini_quiz: { title: 'Quiz rápido', definition: '⚡ Aplica lo que aprendiste.' },
      process_flow: { title: 'El método', definition: 'Paso 1: Analiza → Paso 2: Aplica → Paso 3: Verifica' },
      application: { title: '¿Dónde se aplica?', definition: 'Este concepto tiene aplicaciones concretas en la vida real.' },
      common_error: { title: 'Error frecuente', definition: '❌ Muchos cometen este error. ✅ La forma correcta es aplicar el método.' },
      decide: { title: '¿Cuál es correcto?', definition: '🔥 Analiza las opciones y decide cuál es la correcta.' },
      final_challenge: { title: 'Desafío final', definition: '🏆 Demuestra tu dominio aplicando todo lo aprendido.' },
      challenge: { title: 'Reflexiona', definition: 'Piensa en cómo aplicarías este concepto en una situación real.' },
      victory: { title: '¡Misión completada!', definition: 'Aprendiste los conceptos clave de esta sesión.' },
    };
    const applyFallback = (s: BackendSlide): BackendSlide => {
      const fb = SLIDE_CONTENT_FALLBACKS[s.type] ?? { title: 'Contenido', definition: 'Revisa este concepto con tu material.' };
      return {
        ...s,
        title: s.title?.trim() ? s.title : fb.title,
        definition: s.definition?.trim() ? s.definition : fb.definition,
      };
    };

    let valid = backendSlides.map(s => {
      // Convert interactive slides with missing question/options to non-interactive
      if (INTER.includes(s.type) && s.type !== 'order_sequence' && s.type !== 'wow_fact') {
        if (!s.question?.trim() || !s.options?.length) {
          console.warn(`[Summary] Interactive slide ${s.type} missing question/options — converting to challenge`);
          return applyFallback({ ...s, type: 'challenge' as SummarySlideType, question: null, options: null, correctAnswer: null });
        }
      }
      return applyFallback(s);
    }).map(s => {
      if (!s.definition) return s;
      const words = s.definition.trim().split(/\s+/);
      return words.length > 45 ? { ...s, definition: words.slice(0, 45).join(' ') + '…' } : s;
    });

    // Step 2: redundancy — skip non-interactive slides whose content is >65% covered
    // by any prior non-interactive slide (cumulative pool, not just the previous one).
    const noRedundant: BackendSlide[] = [];
    const allSeenWords = new Set<string>();
    for (const s of valid) {
      if (!isInteractive(s) && s.type !== 'mission' && s.type !== 'victory') {
        const words = keyWords(`${s.title ?? ''} ${s.definition ?? ''} ${s.example ?? ''}`);
        if (allSeenWords.size > 0 && words.size > 0) {
          let hits = 0;
          for (const w of words) if (allSeenWords.has(w)) hits++;
          if (hits / words.size > 0.65) {
            console.warn(`[Summary] Redundant slide skipped: ${s.type} — ${s.title}`);
            continue;
          }
        }
        for (const w of words) allSeenWords.add(w);
      }
      noRedundant.push(s);
    }

    // Step 3: convert first process_flow with 3–5 arrow-separated steps → order_sequence
    let converted = false;
    const withOrder: BackendSlide[] = noRedundant.map(s => {
      if (!converted && s.type === 'process_flow' && s.definition?.includes('→')) {
        const steps = s.definition.split('→').map(t => t.trim()).filter(Boolean);
        if (steps.length >= 3 && steps.length <= 5) {
          converted = true;
          return { ...s, type: 'order_sequence' as SummarySlideType, options: steps };
        }
      }
      return s;
    });

    // Step 4: filter out passive challenge/reflexión slides (no question+options).
    const enforced = withOrder.filter(s =>
      s.type !== 'challenge' || !!(s.question?.trim() && s.options?.length)
    );

    // Step 5: reorder + inject synthetic slides to match the official pedagogical flow.
    const reordered = [...enforced];
    const moveToIdx = (fromIdx: number, toIdx: number) => {
      const [item] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, item);
    };

    // 5a. Challenge First: ensure the first main_concept is immediately preceded by a challenge slide.
    // (Discovery model: student encounters concept via challenge before seeing the explanation/insight)
    const firstMcIdx = reordered.findIndex(s => s.type === 'main_concept');
    if (firstMcIdx !== -1) {
      const CHALLENGE_TYPES = ['micro_challenge', 'comprehension', 'mini_quiz'];
      const prevType = reordered[firstMcIdx - 1]?.type;
      if (!CHALLENGE_TYPES.includes(prevType)) {
        const cIdx = reordered.findIndex((s, i) => i !== firstMcIdx - 1 && CHALLENGE_TYPES.includes(s.type));
        if (cIdx !== -1) {
          // If challenge is after main_concept: moveToIdx puts it at firstMcIdx (before main_concept)
          // If challenge is before but not adjacent: adjust for the removal shift
          const targetPos = cIdx < firstMcIdx ? firstMcIdx - 1 : firstMcIdx;
          moveToIdx(cIdx, targetPos);
        }
      }
    }

    // 5b. "Mini Reto Final" — ensure a final_challenge exists.
    // If the backend didn't send one, promote the last remaining interactive slide
    // (not the early-check one right after main_concept).
    let fcIdx = reordered.findIndex(s => s.type === 'final_challenge');
    if (fcIdx === -1) {
      const earlyCheckPos = reordered.findIndex(s => s.type === 'main_concept') + 1;
      const promotable = reordered
        .map((s, i) => ({ s, i }))
        .filter(({ s, i }) =>
          i !== earlyCheckPos &&
          (s.type === 'comprehension' || s.type === 'mini_quiz' || s.type === 'decide') &&
          !!(s as BackendSlide).question?.trim() && !!(s as BackendSlide).options?.length
        );
      const lastPromotable = promotable[promotable.length - 1];
      if (lastPromotable) {
        reordered[lastPromotable.i] = { ...reordered[lastPromotable.i], type: 'final_challenge' as SummarySlideType };
        fcIdx = lastPromotable.i;
      }
    }

    // Move final_challenge right before victory
    fcIdx = reordered.findIndex(s => s.type === 'final_challenge');
    if (fcIdx !== -1) {
      const vcIdx = reordered.findIndex(s => s.type === 'victory');
      if (vcIdx !== -1 && fcIdx !== vcIdx - 1) {
        moveToIdx(fcIdx, reordered.findIndex(s => s.type === 'victory'));
      }
    }

    // 5c. "Preparado para el Quiz" — inject quiz_transition right before victory
    const vcIdx2 = reordered.findIndex(s => s.type === 'victory');
    if (vcIdx2 !== -1 && reordered[vcIdx2 - 1]?.type !== 'quiz_transition') {
      reordered.splice(vcIdx2, 0, {
        type: 'quiz_transition' as SummarySlideType,
        emoji: '🚀', title: 'Preparado para el Quiz',
        definition: 'Ya dominaste los conceptos principales. Ahora podrás ponerlos a prueba en el Quiz.',
        example: '', connector: null, question: null, options: null, correctAnswer: null, wrongAnswerHints: null,
      } as BackendSlide);
    }

    // 5d. Challenge First: preserve backend-generated order for the middle section.
    // Pairs are generated as [micro_challenge → main_concept] by the backend; sorting would break them.
    // Only purpose here is to detect the tail boundary (handled already in 5b/5c).
    // Head: mission → first [micro_challenge → main_concept] pair
    const TAIL_ANCHOR = new Set(['final_challenge', 'quiz_transition', 'victory']);

    let middleStart = 0;
    if (reordered[middleStart]?.type === 'mission') middleStart++;
    // Duolingo Loop head: skip the opening discovery–insight–reinforcement triple
    if (['micro_challenge', 'comprehension', 'mini_quiz'].includes(reordered[middleStart]?.type)) middleStart++;
    if (reordered[middleStart]?.type === 'main_concept') middleStart++;
    if (reordered[middleStart]?.type === 'reinforcement_challenge') middleStart++;

    // Do NOT reorder the middle — Challenge First pairs must stay as generated by the backend.

    return reordered as SummarySlide[];
  }

  const out: SummarySlide[] = [];
  const quizPool            = questions.slice(0, 3);
  let quizUsed              = 0;
  const total               = backendSlides.length;

  const popQuiz = (): SummarySlide | null => {
    if (quizUsed >= quizPool.length) return null;
    const q = quizPool[quizUsed++];
    return { type: 'quiz', question: q.text, options: q.options.slice(0, 3), correctId: q.correctOptionId, explanation: q.explanation };
  };

  const makeMotivation = (done: number): SummarySlide => {
    const pct = Math.round((done / total) * 100);
    const rem = total - done;
    if (pct >= 70) return { type: 'motivation', emoji: '🏆', message: `¡${pct}% completado!`,   sub: rem > 0 ? `Solo ${rem} conceptos más.` : '¡Lo lograste!' };
    if (pct >= 50) return { type: 'motivation', emoji: '🔥', message: 'Vas por la mitad.',       sub: `Ya dominaste ${done} conceptos.` };
    return              { type: 'motivation', emoji: '🚀', message: '¡Vas muy bien!',            sub: `${done} de ${total} conceptos.` };
  };

  const makePrediction = (slide: BackendSlide): SummarySlide => ({
    type: 'prediction',
    prompt: `¿Qué crees que es "${slide.title}"?`,
    hint: slide.definition,
  });

  // Content types that count toward the TikTok rhythm check
  const CONTENT_TYPES: string[] = ['concept', 'key_fact', 'important', 'remember', 'curiosity', 'example', 'wow_fact'];

  for (let i = 0; i < backendSlides.length; i++) {
    const slide = backendSlides[i];

    // TikTok rhythm: prevent 3+ consecutive same content type
    const prev2 = out.slice(-2);
    if (
      prev2.length === 2 &&
      CONTENT_TYPES.includes(prev2[0].type) &&
      prev2[0].type === prev2[1].type &&
      prev2[1].type === slide.type
    ) {
      out.push(popQuiz() ?? makeMotivation(i));
    }

    // Prediction before a key concept at the 1/3 mark (once quiz pool is used)
    if (i === Math.floor(total / 3) && quizUsed >= quizPool.length && (slide.type === 'concept' || slide.type === 'key_fact')) {
      out.push(makePrediction(slide));
    }

    out.push(slide);

    // After every 4th content slide inject quiz → prediction → motivation
    if ((i + 1) % 4 === 0 && i < backendSlides.length - 1) {
      const quiz = popQuiz();
      if (quiz) {
        out.push(quiz);
      } else {
        const next = backendSlides[i + 1];
        if (next && (next.type === 'concept' || next.type === 'key_fact')) {
          out.push(makePrediction(next));
        } else {
          out.push(makeMotivation(i + 1));
        }
      }
    }
  }

  // Contextual final motivation
  out.push({ type: 'motivation', emoji: '🎉', message: '¡Resumen completado!', sub: `Aprendiste ${total} conceptos clave.` });
  return out;
}

// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════
const DAILY_MODE_ORDER: DailyMode[] = ['mision', 'quiz', 'tarjetas'];
const DAILY_MODE_TO_PHASE: Record<DailyMode, 'summary' | 'quiz' | 'flashcards'> = {
  mision: 'summary', quiz: 'quiz', tarjetas: 'flashcards',
};

// Local session mode order (independent of DailySessionContext daily tracking)
type LocalMode = 'summary' | 'quiz' | 'flashcards';
const LOCAL_MODE_ORDER: LocalMode[]                     = ['summary', 'quiz', 'flashcards'];
const LOCAL_MODE_LABEL: Record<LocalMode, string>       = { summary: 'Misión', quiz: 'Quiz', flashcards: 'Tarjetas' };
const LOCAL_MODE_TO_DAILY: Record<LocalMode, DailyMode> = { summary: 'mision', quiz: 'quiz', flashcards: 'tarjetas' };
const LOCAL_MODE_TO_PHASE: Record<LocalMode, Phase>     = { summary: 'summary', quiz: 'quiz', flashcards: 'flashcards' };

const SESSION_PROGRESS_KEY = 'nemup_session_progress';

export default function SessionPlayerScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { dailySession, markModeComplete, getModeLabel } = useDailySession();

  const [session, setSession] = useState<Session | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [skillPath, setSkillPath] = useState<{ pathId: string; totalMissions: number; missions: Array<{ missionIndex: number; skillId: string | null; skillLabel: string | null; sessionId: string; session: Session }> } | null>(null);
  const [masteryLevel, setMasteryLevel] = useState<'needs_practice' | 'in_progress' | 'good_mastery' | 'mastered' | null>(null);
  const [masteryPct, setMasteryPct] = useState<number | null>(null);
  const [earnedXp, setEarnedXp] = useState<number | null>(null);
  const loadedSessionKeyRef = useRef<string | null>(null);

  // Tab screens are never unmounted by React Navigation, so useEffect([], [])
  // only fires on the very first mount and misses subsequent sessions.
  // useFocusEffect fires every time the screen gains focus; we guard with a
  // per-session key written by upload.tsx so we only reset state when the
  // user actually starts a NEW session, not when they navigate back mid-session.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function loadIfNew() {
        const [[, rawKey], [, rawSession], [, rawSessionId], [, rawPath]] = await AsyncStorage.multiGet([
          'nemup_session_key',
          'nemup_last_session',
          'nemup_last_session_id',
          'nemup_skill_path',
        ]);
        if (!active) return;
        const isNewSession = rawKey !== loadedSessionKeyRef.current;
        if (!isNewSession) return;
        loadedSessionKeyRef.current = rawKey;
        if (!rawSession) return;
        try {
          const parsed: Session = JSON.parse(rawSession);
          setSession(parsed);
          setCurrentSessionId(rawSessionId ?? null);
          setMasteryLevel(null);
          try { setSkillPath(rawPath ? JSON.parse(rawPath) : null); } catch { setSkillPath(null); }
          // Reset ALL game state
          setPhase('lobby');
          setCompleted(new Set());
          setSummaryIdx(0);
          setQuizAnswers({});
          setQuizIdx(0);
          setSelected(null);
          setQuizStep('answering');
          setLives(MAX_LIVES);
          setXpEarned(0);
          setCorrectCount(0);
          setStreak(0);
          setMaxStreak(0);
          setQuizDone(false);
          setComboCount(0);
          setStreakMsg('');
          setMicroMsg('');
          setSummaryRewardText(null);
          setOrderTaps([]);
          setNemiMsg('');
          setMotivText(MOTIV_POOLS.start[0]);
          setCardIdx(0);
          setCardFlipped(false);
          setCardsDone(false);
          setCelebSrc('quiz');
          missionStartRef.current    = null;
          quizStartRef.current       = null;
          flashcardsStartRef.current = null;
          setCardsKnew(0);
          setCardsDubious(0);
          setCardsUnknown(0);
        } catch {}
      }
      loadIfNew();
      return () => { active = false; };
    }, []),
  );

  // Derived from session — declared early so useEffect dependency arrays can reference them
  const questions     = session?.questions  ?? [];
  const flashcards    = session?.flashcards ?? [];
  const summarySlides: BackendSlide[] = session?.summary?.slides?.length
    ? session.summary.slides
    : (session?.summary?.sections ?? []).flatMap((sec) => {
        const out: BackendSlide[] = [];
        if (sec.content) out.push({ type: 'concept', emoji: '📚', title: sec.heading, definition: sec.content, example: '' });
        for (const kp of (sec.keyPoints ?? [])) {
          out.push({ type: 'key_fact', emoji: '💡', title: sec.heading, definition: kp, example: '' });
        }
        return out;
      });

  // Pre-built slides — useState so adaptive correction can inject remedial slides
  const [missionSlides, setMissionSlides] = useState<SummarySlide[]>([]);
  useEffect(() => {
    // FASE 6 — slides recibidos del backend (antes de buildSummarySlides)
    if (summarySlides.length > 0 && summarySlides[0].type === 'mission') {
      console.log('\n[Frontend Audit] ════════════════════════════════════════════');
      console.log('[Frontend Audit] FASE 6 — Slides recibidos (antes de buildSummarySlides)');
      console.log(`[Frontend Audit] Total: ${summarySlides.length}`);
      summarySlides.forEach((s, i) => console.log(`  [${i}] ${s.type} — "${((s as any).title ?? '').slice(0, 60)}"`));
      console.log('[Frontend Audit] ════════════════════════════════════════════\n');
    }

    const built = buildSummarySlides(summarySlides, questions);

    // FASE 7 — slides renderizados (después de buildSummarySlides)
    if (summarySlides.length > 0 && summarySlides[0].type === 'mission') {
      console.log('\n[Frontend Audit] ════════════════════════════════════════════');
      console.log('[Frontend Audit] FASE 7 — Slides renderizados (después de buildSummarySlides)');
      console.log(`[Frontend Audit] Total: ${built.length}`);
      built.forEach((s, i) => console.log(`  [${i}] ${s.type} — "${((s as any).title ?? '').slice(0, 60)}"`));
      console.log('[Frontend Audit] ════════════════════════════════════════════\n');
    }

    setMissionSlides(built);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const [phase, setPhase]           = useState<Phase>('lobby');
  const [completedModes, setCompleted] = useState<Set<string>>(new Set());
  const [celebSrc, setCelebSrc]     = useState<'summary' | 'quiz' | 'flashcards'>('quiz');

  // Summary
  const [summaryIdx, setSummaryIdx] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});

  // Quiz
  const [quizIdx, setQuizIdx]             = useState(0);
  const [quizStep, setQuizStep]           = useState<QuizStep>('answering');
  const [currentAttempt, setCurrentAttempt] = useState(1);
  const [selected, setSelected]           = useState<string | null>(null);
  const [lives, setLives]                 = useState(MAX_LIVES);
  const [xpEarned, setXpEarned]           = useState(0);
  const [correctCount, setCorrectCount]   = useState(0);
  const [streak, setStreak]               = useState(0);
  const [maxStreak, setMaxStreak]         = useState(0);
  const missionStreakRef  = useRef(0);
  const [quizDone, setQuizDone]           = useState(false);
  const [comboCount, setComboCount]       = useState(0);
  const [streakMsg, setStreakMsg]         = useState('');
  const [microMsg, setMicroMsg]           = useState('');
  const [summaryRewardText, setSummaryRewardText] = useState<string | null>(null);
  const [orderTaps, setOrderTaps]     = useState<number[]>([]); // original indices tapped in sequence
  const [nemiMsg, setNemiMsg]             = useState('');
  const [motivText, setMotivText]         = useState(MOTIV_POOLS.start[0]);

  const nemiLastIdxRef       = useRef(-3);
  const prevMotivRef         = useRef(MOTIV_POOLS.start[0]);
  const nextIdxRef           = useRef(0);
  const missionStartRef      = useRef<number | null>(null);
  const quizStartRef         = useRef<number | null>(null);
  const flashcardsStartRef   = useRef<number | null>(null);

  // Flashcards
  const [cardIdx, setCardIdx]           = useState(0);
  const [cardFlipped, setCardFlipped]   = useState(false);
  const [cardsDone, setCardsDone]       = useState(false);
  const [cardsKnew, setCardsKnew]       = useState(0);
  const [cardsDubious, setCardsDubious] = useState(0);
  const [cardsUnknown, setCardsUnknown] = useState(0);

  // Summary slide animation (hooks must be unconditional)
  const touchStartX  = useRef(0);
  const slideX       = useSharedValue(0);
  const slideOpacity = useSharedValue(1);
  const slideStyle   = useAnimatedStyle(() => ({
    transform: [{ translateX: slideX.value }],
    opacity: slideOpacity.value,
  }));

  // Quiz animation shared values (ALL unconditional)
  const xpFloatY      = useSharedValue(0);
  const xpFloatOp     = useSharedValue(0);
  const streakBadgeSV = useSharedValue(0);
  const microSV       = useSharedValue(0);
  const heartShakeSV  = useSharedValue(0);
  const feedbackY     = useSharedValue(14);
  const feedbackOp    = useSharedValue(0);
  const optScale0     = useSharedValue(1);
  const optScale1     = useSharedValue(1);
  const optScale2     = useSharedValue(1);
  const optScale3     = useSharedValue(1);
  const optScale4     = useSharedValue(1);

  const xpFloatStyle     = useAnimatedStyle(() => ({ opacity: xpFloatOp.value, transform: [{ translateY: xpFloatY.value }] }));
  const streakBadgeStyle = useAnimatedStyle(() => ({ opacity: streakBadgeSV.value, transform: [{ scale: 0.82 + streakBadgeSV.value * 0.18 }] }));
  const microRewardStyle = useAnimatedStyle(() => ({ opacity: microSV.value, transform: [{ scale: 0.82 + microSV.value * 0.18 }] }));
  const heartShakeStyle  = useAnimatedStyle(() => ({ transform: [{ translateX: heartShakeSV.value }] }));
  const feedbackStyle    = useAnimatedStyle(() => ({ opacity: feedbackOp.value, transform: [{ translateY: feedbackY.value }] }));
  const optAnimStyle0    = useAnimatedStyle(() => ({ transform: [{ scale: optScale0.value }] }));
  const optAnimStyle1    = useAnimatedStyle(() => ({ transform: [{ scale: optScale1.value }] }));
  const optAnimStyle2    = useAnimatedStyle(() => ({ transform: [{ scale: optScale2.value }] }));
  const optAnimStyle3    = useAnimatedStyle(() => ({ transform: [{ scale: optScale3.value }] }));
  const optAnimStyle4    = useAnimatedStyle(() => ({ transform: [{ scale: optScale4.value }] }));
  const optAnimStyles    = [optAnimStyle0, optAnimStyle1, optAnimStyle2, optAnimStyle3, optAnimStyle4];
  const optScaleArr      = [optScale0, optScale1, optScale2, optScale3, optScale4];

  // Summary mode micro-reward animation
  const summaryRewardOpSV = useSharedValue(0);
  const summaryRewardYSV  = useSharedValue(8);
  const summaryRewardStyle2 = useAnimatedStyle(() => ({
    opacity: summaryRewardOpSV.value,
    transform: [{ translateY: summaryRewardYSV.value }],
  }));

  // New: TikTok question transition
  const questionX    = useSharedValue(0);
  const questionOp   = useSharedValue(1);
  // New: correct option glow
  const correctGlowSV = useSharedValue(0);
  // New: combo bar pulse
  const comboPulseSV  = useSharedValue(1);
  // New: Nemi overlay
  const nemiOp        = useSharedValue(0);
  // New: motiv message fade
  const motivFadeOp   = useSharedValue(1);
  // New: result screen entrance
  const resultEntryY  = useSharedValue(36);
  const resultEntryOp = useSharedValue(0);
  // Progress bar fill (animated)
  const progressSV    = useSharedValue(0);

  const questionTransStyle = useAnimatedStyle(() => ({
    opacity:   questionOp.value,
    transform: [{ translateX: questionX.value }],
  }));
  const correctGlowStyle = useAnimatedStyle(() => ({}));
  const comboPulseStyle  = useAnimatedStyle(() => ({ transform: [{ scale: comboPulseSV.value }] }));
  const nemiStyle        = useAnimatedStyle(() => ({ opacity: nemiOp.value }));
  const motivFadeStyle   = useAnimatedStyle(() => ({ opacity: motivFadeOp.value }));
  const resultEntryStyle = useAnimatedStyle(() => ({
    opacity:   resultEntryOp.value,
    transform: [{ translateY: resultEntryY.value }],
  }));
  const progressFillStyle = useAnimatedStyle(() => ({ width: `${progressSV.value * 100}%` as any }));

  useEffect(() => {
    if (phase !== 'summary') return;
    slideX.value = SCREEN_W * 0.12;
    slideOpacity.value = 0;
    slideX.value = withSpring(0, { damping: 22, stiffness: 220 });
    slideOpacity.value = withTiming(1, { duration: 240 });
  }, [summaryIdx, phase]);


  // Capture mission start time on first entry to summary phase
  useEffect(() => {
    if (phase === 'summary' && missionStartRef.current === null) {
      missionStartRef.current = Date.now();
    }
  }, [phase]);

  // Capture quiz start time on every entry to quiz phase (reset on retry via resetQuiz)
  useEffect(() => {
    if (phase === 'quiz') {
      quizStartRef.current = Date.now();
    }
  }, [phase]);

  // Capture flashcards start time on first entry (not reset on re-entry)
  useEffect(() => {
    if (phase === 'flashcards' && flashcardsStartRef.current === null) {
      flashcardsStartRef.current = Date.now();
    }
  }, [phase]);

  // Animate progress bar fill — used by both quiz and flashcards phases
  useEffect(() => {
    if (phase === 'quiz') {
      const filled = quizIdx + (quizStep !== 'answering' ? 1 : 0);
      progressSV.value = withTiming(filled / Math.max(questions.length, 1), { duration: 380, easing: Easing.out(Easing.quad) });
    } else if (phase === 'flashcards') {
      progressSV.value = withTiming((cardIdx + 1) / Math.max(flashcards.length, 1), { duration: 380, easing: Easing.out(Easing.quad) });
    }
  }, [quizIdx, quizStep, phase, questions.length, cardIdx, flashcards.length]);

  // Reset order taps when slide changes
  useEffect(() => { setOrderTaps([]); }, [summaryIdx]);

  // Compute mastery when the victory slide is shown (mission model only)
  useEffect(() => {
    if (phase !== 'summary') return;
    const slide = missionSlides[summaryIdx] as BackendSlide | undefined;
    if (slide?.type !== 'victory') return;
    if (masteryLevel !== null) return; // already computed

    const V_INTER = ['micro_challenge', 'comprehension', 'mini_quiz', 'final_challenge', 'decide', 'order_sequence', 'common_error', 'application', 'challenge', 'wow_fact'];
    const interSlides = missionSlides.map((s, i) => ({ s, i }))
      .filter(({ s }) => V_INTER.includes(s.type) && !!(s as BackendSlide).correctAnswer);
    const interTotal = interSlides.length;
    const interCorrect = interSlides.filter(({ s, i }) =>
      quizAnswers[i] === (s as BackendSlide).correctAnswer
    ).length;
    const pct = interTotal > 0 ? Math.round((interCorrect / interTotal) * 100) : 100;

    const level: 'needs_practice' | 'in_progress' | 'good_mastery' | 'mastered' =
      pct >= 90 ? 'mastered' :
      pct >= 70 ? 'good_mastery' :
      pct >= 40 ? 'in_progress' : 'needs_practice';

    const maxXp = session?.xpReward ?? 100;
    const computed = Math.round(maxXp * pct / 100);
    const computedGems = pct >= 70 ? Math.round((session?.gemReward ?? 10) * pct / 100) : 0;

    setMasteryLevel(level);
    setMasteryPct(pct);
    setEarnedXp(computed);

    // Persist mastery for next-mission flow
    if (currentSessionId) {
      AsyncStorage.setItem(`nemup_mastery_${currentSessionId}`, JSON.stringify({ level, pct })).catch(() => {});
    }

    // Apply performance-based rewards to backend
    const uid = session?.userId;
    if (uid && computed > 0) {
      fetch('https://nemup-production.up.railway.app/sessions/rewards/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, xp: computed, gems: computedGems }),
      }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryIdx, phase]);

  // Evaluate order_sequence when all items are tapped
  useEffect(() => {
    if (phase !== 'summary' || orderTaps.length === 0) return;
    const slide = missionSlides[summaryIdx] as BackendSlide | undefined;
    if (slide?.type !== 'order_sequence') return;
    const opts = slide.options ?? [];
    if (orderTaps.length < opts.length) return;

    const isCorrect = orderTaps.every((origIdx, pos) => origIdx === pos);
    if (isCorrect) {
      setQuizAnswers(prev => ({ ...prev, [summaryIdx]: 'correct' }));
      // Inline reward animation (showSummaryReward defined after if(!session) return)
      const txt = SUMMARY_REWARDS[Math.floor(Math.random() * SUMMARY_REWARDS.length)];
      setSummaryRewardText(txt);
      summaryRewardOpSV.value = withSequence(
        withSpring(1, { damping: 10, stiffness: 180 }),
        withDelay(700, withTiming(0, { duration: 280 })),
      );
      summaryRewardYSV.value = withSequence(
        withTiming(0, { duration: 200 }),
        withDelay(700, withTiming(8, { duration: 280 })),
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setTimeout(() => setOrderTaps([]), 370);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderTaps]);

  // Motiv message cycling every 4 seconds while answering (FASE 1 / 12)
  useEffect(() => {
    if (phase !== 'quiz' || quizStep !== 'answering') return;
    const t = setInterval(() => {
      motivFadeOp.value = withSequence(
        withTiming(0, { duration: 200 }),
        withTiming(1, { duration: 350 }),
      );
      const msg = pickMotivMsg(quizIdx, questions.length, streak, prevMotivRef.current);
      prevMotivRef.current = msg;
      setTimeout(() => setMotivText(msg), 200);
    }, 4000);
    return () => clearInterval(t);
  }, [phase, quizStep, streak, quizIdx, questions.length]);

  // Result screen entrance animation (FASE 11)
  useEffect(() => {
    if (!quizDone) return;
    resultEntryY.value  = 36;
    resultEntryOp.value = 0;
    resultEntryY.value  = withSpring(0, { damping: 22, stiffness: 180 });
    resultEntryOp.value = withTiming(1, { duration: 420 });
  }, [quizDone]);

  const question      = questions[quizIdx];
  const card          = flashcards[cardIdx];

  if (!session) {
    return <View style={{ flex: 1, backgroundColor: BG }} />;
  }

  const emoji = getSubjectEmoji(session.subject);

  // ── Helpers ────────────────────────────────────────────────────
  const completeMode = (mode: 'summary' | 'quiz' | 'flashcards') => {
    const newCompleted = new Set([...completedModes, mode]);
    setCompleted(newCompleted);
    setCelebSrc(mode);
    setPhase(newCompleted.size >= 3 ? 'complete' : 'mode-select');
  };

  const saveSessionProgress = (completed: Set<string>) => {
    const data = {
      sessionId:           currentSessionId,
      title:               session?.summary?.title ?? session?.topic ?? '',
      createdAt:           Date.now(),
      missionCompleted:    completed.has('summary'),
      quizCompleted:       completed.has('quiz'),
      flashcardsCompleted: completed.has('flashcards'),
      sessionCompleted:    completed.size >= 3,
    };
    AsyncStorage.setItem(SESSION_PROGRESS_KEY, JSON.stringify(data)).catch(() => {});
  };

  const resetQuiz = () => {
    setQuizIdx(0); setSelected(null); setQuizStep('answering');
    setCorrectCount(0); setLives(MAX_LIVES); setXpEarned(0);
    setStreak(0); setMaxStreak(0); setQuizDone(false); setComboCount(0);
    setCurrentAttempt(1);
    quizStartRef.current = Date.now();
  };

  const handleOption = (optId: string) => {
    if (quizStep !== 'answering') return;
    setSelected(optId);

    // Feedback card slide-in (both cases)
    feedbackY.value = 14;
    feedbackOp.value = 0;
    feedbackY.value = withSpring(0, { damping: 18, stiffness: 200 });
    feedbackOp.value = withTiming(1, { duration: 200 });

    if (optId === question.correctOptionId) {
      const nextCorrect = correctCount + 1;
      const nextStreak  = streak + 1;
      const nextCombo   = comboCount + 1;

      setCorrectCount(nextCorrect);
      setXpEarned(x => x + XP_PER_CORRECT);
      setStreak(nextStreak);
      setMaxStreak(m => Math.max(m, nextStreak));

      // Combo milestone system (FASE 4)
      const milestone = COMBO_MILESTONES[nextCombo];
      if (milestone) {
        setXpEarned(x => x + milestone.xp);
        setMicroMsg(milestone.msg);
        microSV.value = withSequence(
          withSpring(1, { damping: 10, stiffness: 180 }),
          withDelay(1600, withTiming(0, { duration: 300 })),
        );
        comboPulseSV.value = withSequence(
          withSpring(1.1, { damping: 10, stiffness: 380 }),
          withSpring(1,   { damping: 18, stiffness: 280 }),
        );
        setComboCount(nextCombo >= COMBO_SIZE ? 0 : nextCombo);
      } else if (MICRO_REWARD_MSGS[nextCorrect]) {
        setComboCount(nextCombo);
        setMicroMsg(MICRO_REWARD_MSGS[nextCorrect]);
        microSV.value = withSequence(
          withSpring(1, { damping: 10, stiffness: 180 }),
          withDelay(1600, withTiming(0, { duration: 300 })),
        );
      } else {
        setComboCount(nextCombo);
      }

      // Streak badge — fires at every 1–5 (FASE 3)
      const label = STREAK_MESSAGES[Math.min(nextStreak, 5)];
      if (label) {
        setStreakMsg(label);
        streakBadgeSV.value = withSequence(
          withSpring(1, { damping: 12, stiffness: 200 }),
          withDelay(1400, withTiming(0, { duration: 300 })),
        );
      }

      // Floating XP badge (FASE 2)
      xpFloatY.value  = 0;
      xpFloatOp.value = 0;
      xpFloatY.value  = withTiming(-70, { duration: 650, easing: Easing.out(Easing.quad) });
      xpFloatOp.value = withSequence(
        withTiming(1, { duration: 70 }),
        withDelay(300, withTiming(0, { duration: 260 })),
      );

      // Correct option glow (FASE 2)
      correctGlowSV.value = withSequence(
        withTiming(1, { duration: 140 }),
        withDelay(700, withTiming(0, { duration: 400 })),
      );

      setQuizStep('correct');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } else {
      setLives(l => Math.max(0, l - 1));
      setComboCount(0);
      setStreak(0);

      // Heart shake
      heartShakeSV.value = withSequence(
        withTiming(-8, { duration: 55 }),
        withTiming(8,  { duration: 55 }),
        withTiming(-5, { duration: 55 }),
        withTiming(5,  { duration: 55 }),
        withTiming(0,  { duration: 55 }),
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setQuizStep('wrong');
    }
  };

  const handleQuizNext = () => {
    const next = quizIdx + 1;
    if (next >= questions.length) { setQuizDone(true); return; }

    // Pick new motiv message
    const newMotiv = pickMotivMsg(next, questions.length, streak, prevMotivRef.current);
    prevMotivRef.current = newMotiv;

    // Nemi character — max once per 3 questions (FASE 9)
    nextIdxRef.current = next;
    if (next - nemiLastIdxRef.current >= 3 && Math.random() > 0.4) {
      nemiLastIdxRef.current = next;
      setNemiMsg(NEMI_MSGS[next % NEMI_MSGS.length]);
      nemiOp.value = withSequence(
        withDelay(500, withTiming(1, { duration: 320 })),
        withDelay(1900, withTiming(0, { duration: 380 })),
      );
    }

    // TikTok slide-out (FASE 8)
    questionOp.value = withTiming(0, { duration: 160, easing: Easing.in(Easing.quad) });
    questionX.value  = withTiming(-SCREEN_W * 0.28, { duration: 180, easing: Easing.in(Easing.quad) });

    // After exit: update state, then slide in from right
    setTimeout(() => {
      setQuizIdx(next);
      setSelected(null);
      setQuizStep('answering');
      setCurrentAttempt(1);
      setMotivText(newMotiv);
      correctGlowSV.value = 0;
      questionX.value  = SCREEN_W * 0.28;
      questionOp.value = 0;
      questionX.value  = withSpring(0, { damping: 22, stiffness: 220 });
      questionOp.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
    }, 190);
  };

  const handleRetry = () => {
    setCurrentAttempt(a => a + 1);
    setSelected(null);
    setQuizStep('answering');
    correctGlowSV.value = 0;
    feedbackY.value  = 14;
    feedbackOp.value = 0;
  };

  const handleCardNext = (response?: 'knew' | 'doubt' | 'unknown') => {
    if (response === 'knew')    setCardsKnew(n => n + 1);
    if (response === 'doubt')   setCardsDubious(n => n + 1);
    if (response === 'unknown') setCardsUnknown(n => n + 1);
    const next = cardIdx + 1;
    if (next >= flashcards.length) setCardsDone(true);
    else { setCardIdx(next); setCardFlipped(false); }
  };

  const showSummaryReward = (customText?: string) => {
    const text = customText ?? SUMMARY_REWARDS[Math.floor(Math.random() * SUMMARY_REWARDS.length)];
    setSummaryRewardText(text);
    summaryRewardOpSV.value = withSequence(
      withSpring(1, { damping: 10, stiffness: 180 }),
      withDelay(700, withTiming(0, { duration: 280 })),
    );
    summaryRewardYSV.value = withSequence(
      withTiming(0, { duration: 200 }),
      withDelay(700, withTiming(8, { duration: 280 })),
    );
  };

  const finalAccuracy = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 100;

  // ── Unified progress bar — derived from existing state, no new useState ──────
  const _misionTotal    = missionSlides.length;
  const _misionDone     = completedModes.has('summary')    ? _misionTotal    : summaryIdx;
  const _quizTotal      = questions.length;
  const _quizDone       = completedModes.has('quiz')       ? _quizTotal      : quizIdx + (quizStep !== 'answering' ? 1 : 0);
  const _tarjetasTotal  = flashcards.length;
  const _tarjetasDone   = completedModes.has('flashcards') ? _tarjetasTotal  : cardsDone ? _tarjetasTotal : cardIdx;
  const globalPct =
    (_misionTotal   > 0 ? _misionDone   / _misionTotal   : 0) / 3 +
    (_quizTotal     > 0 ? _quizDone     / _quizTotal     : 0) / 3 +
    (_tarjetasTotal > 0 ? _tarjetasDone / _tarjetasTotal : 0) / 3;
  const unifiedModeLabel =
    phase === 'summary'    ? `Misión · ${summaryIdx + 1}/${missionSlides.length}` :
    phase === 'quiz'       ? `Quiz · ${quizIdx + 1}/${questions.length}` :
    phase === 'flashcards' ? `Tarjetas · ${cardIdx + 1}/${flashcards.length}` :
    undefined;

  // ══════════════════════════════════════════════════════════════
  // LOBBY — Screen 1
  // ══════════════════════════════════════════════════════════════
  if (phase === 'lobby') {
    const missionItems = [
      { key: 'summary',    emoji: '📚', label: 'Comprender conceptos clave' },
      { key: 'quiz',       emoji: '🧠', label: 'Resolver desafíos' },
      { key: 'flashcards', emoji: '🃏', label: 'Reforzar memoria' },
    ];
    const done = missionItems.filter(m => completedModes.has(m.key)).length;

    return (
      <SafeAreaView style={g.page} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />
        <View style={g.topBar}>
          <Pressable onPress={() => router.back()} style={g.iconBtn} hitSlop={10}>
            <ArrowLeft size={16} color={semantic.textPrimary} strokeWidth={2.5} />
          </Pressable>
          <View style={{ flex: 1 }} />
          {done > 0 && (
            <View style={lob.progressPill}>
              <Text style={lob.progressPillText}>{done}/3 listos</Text>
            </View>
          )}
        </View>
        {UNIFIED_PROGRESS_BAR && (
          <UnifiedProgressBar progress={globalPct} showCurrentMode={false} />
        )}

        <ScrollView contentContainerStyle={[g.scroll, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
          {/* Title */}
          <View style={lob.titleBlock}>
            <Text style={lob.titleLabel}>🎯 Tu misión está lista</Text>
            <Text style={lob.titleTopic} numberOfLines={2}>{session.topic}</Text>
          </View>

          {/* Metrics hero card */}
          <View style={lob.metricsCard}>
            <View style={lob.metricsRow}>
              <View style={lob.metricItem}>
                <Text style={lob.metricEmoji}>⏱</Text>
                <Text style={lob.metricVal}>{session.estimatedDuration} min</Text>
                <Text style={lob.metricLbl}>estimados</Text>
              </View>
              <View style={lob.metricDiv} />
              <View style={lob.metricItem}>
                <Text style={lob.metricEmoji}>🧠</Text>
                <Text style={lob.metricVal}>{summarySlides.length}</Text>
                <Text style={lob.metricLbl}>conceptos</Text>
              </View>
              <View style={lob.metricDiv} />
              <View style={lob.metricItem}>
                <Text style={lob.metricEmoji}>❓</Text>
                <Text style={lob.metricVal}>{questions.length}</Text>
                <Text style={lob.metricLbl}>preguntas</Text>
              </View>
            </View>
            <View style={lob.metricDivH} />
            <View style={[lob.metricsRow, { paddingHorizontal: 30 }]}>
              <View style={lob.metricItem}>
                <Text style={lob.metricEmoji}>🃏</Text>
                <Text style={lob.metricVal}>{flashcards.length}</Text>
                <Text style={lob.metricLbl}>tarjetas</Text>
              </View>
              <View style={lob.metricDiv} />
              <View style={lob.metricItem}>
                <Text style={lob.metricEmoji}>⚡</Text>
                <Text style={[lob.metricVal, { color: BRAND }]}>+{session.xpReward}</Text>
                <Text style={lob.metricLbl}>XP</Text>
              </View>
            </View>
          </View>

          {/* Lo que harás hoy */}
          <View style={lob.missionCard}>
            <View style={lob.missionHead}>
              <Text style={lob.missionTitle}>Lo que harás hoy</Text>
              {done > 0 && <Text style={lob.missionCounter}>{done}/3 listos</Text>}
            </View>
            {missionItems.map(m => {
              const isDone = completedModes.has(m.key);
              return (
                <View key={m.key} style={lob.missionRow}>
                  <View style={[lob.missionCheck, isDone && lob.missionCheckDone]}>
                    {isDone && <Check size={9} color={palette.blanco} strokeWidth={3} />}
                  </View>
                  <Text style={[lob.missionLabel, isDone && lob.missionLabelDone]}>
                    {m.emoji} {m.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </ScrollView>

        <View style={[g.bottom, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable onPress={() => setPhase('mode-select')} style={{ width: '100%' }}>
            <View style={[g.ctaBtn, { backgroundColor: BRAND }]}>
              <Text style={g.ctaText}>⚡ Comenzar misión</Text>
            </View>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // MODE SELECT — Screen 2
  // ══════════════════════════════════════════════════════════════
  if (phase === 'mode-select') {
    const QUIZ_COLOR = '#3B82F6';
    const QUIZ_BG    = 'rgba(59,130,246,0.08)';
    const TEAL_COLOR = palette.tealTarjetas;
    const TEAL_BG    = 'rgba(0,194,168,0.08)';
    const missionXp  = XP_PER_SUMMARY * Math.max(summarySlides.length, 1);
    const quizXp     = XP_PER_CORRECT * Math.max(questions.length, 1);
    const cardsXp    = XP_PER_CARD * Math.max(flashcards.length, 1);
    const goMode = (key: 'summary' | 'quiz' | 'flashcards') => {
      if (key === 'summary')    { setSummaryIdx(0); setQuizAnswers({}); setPhase('summary'); }
      if (key === 'quiz')       { resetQuiz(); setPhase('quiz'); }
      if (key === 'flashcards') { setCardIdx(0); setCardFlipped(false); setCardsDone(false); setPhase('flashcards'); }
    };
    return (
      <SafeAreaView style={g.page} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />
        <View style={g.topBar}>
          <Pressable onPress={() => setPhase('lobby')} style={g.iconBtn} hitSlop={10}>
            <ChevronLeft size={18} color={semantic.textPrimary} strokeWidth={2.5} />
          </Pressable>
          <View style={{ flex: 1 }} />
          <View style={{ width: 36 }} />
        </View>
        {UNIFIED_PROGRESS_BAR && (
          <UnifiedProgressBar progress={globalPct} showCurrentMode={false} />
        )}
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 10 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={mds.hero}>
            <Text style={mds.heroTitle}>🚀 Tu misión está lista</Text>
            <Text style={mds.heroSub}>{session.estimatedDuration} min para completarla</Text>
          </View>

          {/* Primary mode — Misión */}
          <Pressable onPress={() => goMode('summary')} android_ripple={{ color: 'rgba(0,0,0,0.08)' }}>
            {({ pressed }) => (
              <View style={[mds.missionCard, pressed && { opacity: 0.93 }]}>
                {completedModes.has('summary') && (
                  <View style={mds.doneBadge}>
                    <Check size={10} color={BRAND} strokeWidth={3} />
                    <Text style={[mds.doneBadgeText, { color: BRAND }]}>Completado</Text>
                  </View>
                )}
                <View style={mds.cardTop}>
                  <Text style={mds.missionEmoji}>🎯</Text>
                  <View style={mds.missionXpBadge}>
                    <Text style={mds.missionXpText}>+{missionXp} XP</Text>
                  </View>
                </View>
                <Text style={mds.missionTitle}>Misión</Text>
                <Text style={mds.missionDesc}>Lee y comprende los conceptos clave</Text>
                <View style={mds.cardFoot}>
                  <Text style={mds.missionDetail}>{summarySlides.length} conceptos</Text>
                  <View style={mds.arrowLight}>
                    <ChevronRight size={16} color={palette.blanco} strokeWidth={2.5} />
                  </View>
                </View>
              </View>
            )}
          </Pressable>

          {/* Secondary modes — side by side */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {/* Quiz */}
            <Pressable onPress={() => goMode('quiz')} style={{ flex: 1 }} android_ripple={{ color: 'rgba(0,0,0,0.05)' }}>
              {({ pressed }) => (
                <View style={[mds.secondaryCard, pressed && { opacity: 0.9 }]}>
                  {completedModes.has('quiz') && (
                    <View style={[mds.doneBadge, { backgroundColor: QUIZ_BG }]}>
                      <Check size={10} color={QUIZ_COLOR} strokeWidth={3} />
                      <Text style={[mds.doneBadgeText, { color: QUIZ_COLOR }]}>Listo</Text>
                    </View>
                  )}
                  <Text style={mds.secondaryEmoji}>🧠</Text>
                  <View style={[mds.secondaryXpBadge, { backgroundColor: QUIZ_BG }]}>
                    <Text style={[mds.secondaryXpText, { color: QUIZ_COLOR }]}>+{quizXp} XP</Text>
                  </View>
                  <Text style={[mds.secondaryTitle, { color: QUIZ_COLOR }]}>Quiz</Text>
                  <Text style={mds.secondaryDesc}>Pon a prueba lo que aprendiste</Text>
                  <Text style={mds.secondaryDetail}>{questions.length} preguntas</Text>
                  <View style={[mds.arrowAccent, { backgroundColor: QUIZ_BG }]}>
                    <ChevronRight size={14} color={QUIZ_COLOR} strokeWidth={2.5} />
                  </View>
                </View>
              )}
            </Pressable>

            {/* Tarjetas */}
            <Pressable onPress={() => goMode('flashcards')} style={{ flex: 1 }} android_ripple={{ color: 'rgba(0,0,0,0.05)' }}>
              {({ pressed }) => (
                <View style={[mds.secondaryCard, pressed && { opacity: 0.9 }]}>
                  {completedModes.has('flashcards') && (
                    <View style={[mds.doneBadge, { backgroundColor: TEAL_BG }]}>
                      <Check size={10} color={TEAL_COLOR} strokeWidth={3} />
                      <Text style={[mds.doneBadgeText, { color: TEAL_COLOR }]}>Listo</Text>
                    </View>
                  )}
                  <Text style={mds.secondaryEmoji}>🃏</Text>
                  <View style={[mds.secondaryXpBadge, { backgroundColor: TEAL_BG }]}>
                    <Text style={[mds.secondaryXpText, { color: TEAL_COLOR }]}>+{cardsXp} XP</Text>
                  </View>
                  <Text style={[mds.secondaryTitle, { color: TEAL_COLOR }]}>Tarjetas</Text>
                  <Text style={mds.secondaryDesc}>Memoriza con tarjetas interactivas</Text>
                  <Text style={mds.secondaryDetail}>{flashcards.length} tarjetas</Text>
                  <View style={[mds.arrowAccent, { backgroundColor: TEAL_BG }]}>
                    <ChevronRight size={14} color={TEAL_COLOR} strokeWidth={2.5} />
                  </View>
                </View>
              )}
            </Pressable>
          </View>

          {/* Completion reward */}
          <View style={mds.rewardCard}>
            <Text style={mds.rewardStar}>⭐</Text>
            <View style={{ flex: 1 }}>
              <Text style={mds.rewardTitle}>Completa los 3 modos</Text>
              <Text style={mds.rewardSub}>Gana +{session.xpReward} XP · Aumenta tu progreso más rápido</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // SUMMARY — Screen 3 (story slides, NO SCROLL)
  // ══════════════════════════════════════════════════════════════
  if (phase === 'summary') {
    const slides            = missionSlides;
    const slide             = slides[summaryIdx];
    const isLast            = summaryIdx >= slides.length - 1;
    const slideQuizAnswered = slide?.type === 'quiz' ? quizAnswers[summaryIdx] : undefined;
    // Stats for victory screen — computed once, used in victory card renderer and CTA button
    const V_CONCEPT          = ['main_concept', 'key_relation', 'process_flow', 'application', 'common_error', 'challenge'];
    const V_INTER            = ['micro_challenge', 'reinforcement_challenge', 'comprehension', 'mini_quiz', 'final_challenge', 'decide', 'order_sequence', 'common_error', 'application', 'challenge', 'wow_fact'];
    const vConcepts          = slides.filter(s => V_CONCEPT.includes(s.type)).length;
    const vInterTotal        = slides.filter((s, i) => V_INTER.includes(s.type) && !!(s as BackendSlide).correctAnswer).length;
    const vCorrect           = slides.filter((s, i) => V_INTER.includes(s.type) && !!(s as BackendSlide).correctAnswer && quizAnswers[i] === (s as BackendSlide).correctAnswer).length;
    const answeredInteractive = slides.filter((s, i) => V_INTER.includes(s.type) && !!(s as BackendSlide).correctAnswer && !!quizAnswers[i]).length;
    const noInteractionsAttempted = vInterTotal > 0 && answeredInteractive === 0;

    const goNext = () => {
      Vibration.vibrate(18);
      slideX.value       = withTiming(-SCREEN_W * 0.15, { duration: 180 }, (done) => {
        if (done) runOnJS(setSummaryIdx)(summaryIdx + 1);
      });
      slideOpacity.value = withTiming(0, { duration: 180 });
    };
    const goPrev = () => {
      Vibration.vibrate(10);
      slideX.value       = withTiming(SCREEN_W * 0.15, { duration: 180 }, (done) => {
        if (done) runOnJS(setSummaryIdx)(summaryIdx - 1);
      });
      slideOpacity.value = withTiming(0, { duration: 180 });
    };

    // MODE_COMPLETION_REDESIGN: replace victory slide with full-screen ModeCompletionScreen
    if (MODE_COMPLETION_REDESIGN && isLast && slide?.type === 'victory') {
      const tiempoMs    = missionStartRef.current ? Date.now() - missionStartRef.current : 0;
      const tiempoStr   = formatMissionTime(tiempoMs);
      const V_CONCEPT_LOCAL = ['main_concept', 'key_relation', 'process_flow', 'application', 'common_error', 'challenge'];
      const vConceptsLocal  = missionSlides.filter(s => V_CONCEPT_LOCAL.includes(s.type)).length;
      const V_INTER_LOCAL   = ['micro_challenge', 'comprehension', 'mini_quiz', 'final_challenge', 'decide', 'order_sequence', 'common_error', 'application', 'challenge', 'wow_fact'];
      const vInterLocal     = missionSlides.filter(s => V_INTER_LOCAL.includes(s.type) && !!(s as BackendSlide).correctAnswer).length;
      const vCorrectLocal   = missionSlides.filter((s, i) => V_INTER_LOCAL.includes(s.type) && !!(s as BackendSlide).correctAnswer && quizAnswers[i] === (s as BackendSlide).correctAnswer).length;

      const newSetAfterMision    = new Set([...completedModes, 'summary']);
      const remainingAfterMision = LOCAL_MODE_ORDER.filter(m => !newSetAfterMision.has(m));
      const nextLocalMision      = remainingAfterMision[0] ?? null;
      const continueLabelMision  = newSetAfterMision.size >= 3
        ? '¡Ver sesión completa! →'
        : nextLocalMision
          ? `Continuar con ${LOCAL_MODE_LABEL[nextLocalMision]} →`
          : 'Continuar →';

      const onContinueMision = () => {
        const newSet = new Set([...completedModes, 'summary']);
        setCompleted(newSet);
        setCelebSrc('summary');
        if (DAILY_SESSION_LOGIC) markModeComplete(LOCAL_MODE_TO_DAILY['summary']);
        saveSessionProgress(newSet);
        if (newSet.size >= 3) {
          router.push('/session-complete' as any);
        } else {
          setPhase(nextLocalMision ? LOCAL_MODE_TO_PHASE[nextLocalMision] : 'mode-select');
        }
      };

      return (
        <ModeCompletionScreen
          mode="mision"
          iconNode={<CheckCircle size={44} color={BRAND} strokeWidth={1.5} />}
          screenTitle="🎯 Misión"
          title="Misión completa"
          tiles={[
            { label: 'enfocado',   value: tiempoStr },
            { label: 'conceptos',  value: String(vConceptsLocal) },
            { label: 'XP',         value: `+${earnedXp ?? 0}`, valueColor: BRAND },
          ]}
          contextualLine={vInterLocal > 0 ? `Mini-quizzes: ${vCorrectLocal}/${vInterLocal} — los repasarás en el Quiz` : ''}
          continueLabel={continueLabelMision}
          onContinue={onContinueMision}
          onBack={() => setPhase('mode-select')}
          sessionCompletedCount={newSetAfterMision.size}
        />
      );
    }

    // Adaptive correction: insert a conceptual-confusion slide after a wrong answer.
    // Uses the backend-generated wrongAnswerHints — specific explanation for each wrong option.
    // Per REGLA FINAL: skips entirely if no domain-specific hint is available.
    const insertCorrectiveSlide = (_wrongSlide: BackendSlide, _selectedKey: string) => {
      return; // reflexion slides after wrong answers are disabled

      const corrective: BackendSlide = {
        type: 'challenge' as SummarySlideType,
        emoji: '🧠',
        title: `err:${_selectedKey}`,
        definition: _wrongSlide.wrongAnswerHints?.[_selectedKey] ?? '',
        example: '',
        question: null, options: null, correctAnswer: null,
      };
      setMissionSlides(prev => {
        const insertAt = summaryIdx + 1;
        if (prev[insertAt]?.type === 'challenge' && (prev[insertAt] as BackendSlide)?.title?.startsWith('err:')) return prev;
        return [...prev.slice(0, insertAt), corrective as SummarySlide, ...prev.slice(insertAt)];
      });
    };

    return (
      <View style={{ flex: 1, backgroundColor: BG }}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          {/* Story bar / unified bar */}
          {UNIFIED_PROGRESS_BAR ? (
            <UnifiedProgressBar
              progress={globalPct}
              currentMode="mision"
              modeLabel={unifiedModeLabel}
            />
          ) : (
            <View style={sum.storyBar}>
              <View style={sum.progressTrack}>
                <View style={[sum.progressFill, { width: `${Math.round((summaryIdx / Math.max(slides.length - 1, 1)) * 100)}%` }]} />
              </View>
              <Text style={sum.slideCounter}>{summaryIdx + 1}/{slides.length}</Text>
            </View>
          )}

          {/* Header */}
          <View style={g.topBar}>
            <Pressable
              onPress={() => summaryIdx > 0 ? goPrev() : setPhase('mode-select')}
              style={g.iconBtn} hitSlop={10}
            >
              <ChevronLeft size={18} color={semantic.textPrimary} strokeWidth={2.5} />
            </Pressable>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={g.screenTitle}>🎯 Misión</Text>
              {!UNIFIED_PROGRESS_BAR && (
                <Text style={[sum.slideCounter, { minWidth: 0, textAlign: 'center', fontSize: 11 }]}>Paso {summaryIdx + 1} de {slides.length}</Text>
              )}
            </View>
            <Pressable onPress={() => setPhase('mode-select')} style={g.iconBtn} hitSlop={10}>
              <X size={16} color={semantic.textPrimary} strokeWidth={2.5} />
            </Pressable>
          </View>

          {/* Slide — no scroll, swipe gesture */}
          <Animated.View
            style={[sum.slideArea, slideStyle]}
            onTouchStart={(e) => { touchStartX.current = e.nativeEvent.pageX; }}
            onTouchEnd={(e) => {
              const dx = e.nativeEvent.pageX - touchStartX.current;
              if (dx < -40 && !isLast) goNext();
              if (dx > 40 && summaryIdx > 0) goPrev();
            }}
          >
            {slide?.type === 'quiz' ? (
              <View style={sum.quizCard}>
                <Text style={sum.quizLabel}>🧠 MINI QUIZ</Text>
                <Text style={sum.quizQuestion}>{slide.question}</Text>
                <View style={{ gap: 8, marginTop: 14 }}>
                  {slide.options.map((opt, i) => {
                    const isCorrect = opt.id === slide.correctId;
                    const showGreen = !!slideQuizAnswered && isCorrect;
                    const showRed   = slideQuizAnswered === opt.id && !isCorrect;
                    const dimmed    = !!slideQuizAnswered && !isCorrect && slideQuizAnswered !== opt.id;
                    return (
                      <Pressable key={opt.id}
                        onPress={() => !slideQuizAnswered && setQuizAnswers(prev => ({ ...prev, [summaryIdx]: opt.id }))}
                        style={[sum.quizOption, showGreen && sum.quizOptCorrect, showRed && sum.quizOptWrong, { opacity: dimmed ? 0.35 : 1 }]}
                      >
                        <View style={[sum.quizLetter, showGreen && sum.quizLetterGreen, showRed && sum.quizLetterRed]}>
                          {showGreen ? <Check size={12} color={palette.blanco} strokeWidth={3} /> :
                           showRed   ? <X    size={12} color={palette.blanco} strokeWidth={3} /> :
                           <Text style={sum.quizLetterText}>{LETTERS[i]}</Text>}
                        </View>
                        <Text style={[sum.quizOptText, showGreen && { color: BRAND, fontWeight: '700' }, showRed && { color: '#991B1B', fontWeight: '700' }]}>
                          {opt.text}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {!!slideQuizAnswered && (
                  <View style={[sum.quizFeedback, slideQuizAnswered === slide.correctId ? sum.quizFeedbackOk : sum.quizFeedbackErr]}>
                    {slideQuizAnswered === slide.correctId ? (
                      <View style={sum.quizFeedbackHeader}>
                        <Text style={sum.quizFeedbackTitle}>✓ Correcto</Text>
                        {!!summaryRewardText && <View style={sum.quizFeedbackXpChip}><Text style={sum.quizFeedbackXpText}>{summaryRewardText}</Text></View>}
                      </View>
                    ) : (
                      <Text style={sum.quizFeedbackTitle}>💡 Incorrecto</Text>
                    )}
                    {!!slide.explanation && <Text style={sum.quizFeedbackText}>{slide.explanation}</Text>}
                  </View>
                )}
              </View>
            ) : slide?.type === 'prediction' ? (
              <View style={sum.predCard}>
                <Text style={sum.predIcon}>🧠</Text>
                <Text style={sum.predLabel}>PIENSA UN MOMENTO</Text>
                <Text style={sum.predPrompt}>{slide.prompt}</Text>
                <View style={sum.predHintBox}>
                  <Text style={sum.predHintLabel}>Respuesta</Text>
                  <Text style={sum.predHint}>{slide.hint}</Text>
                </View>
              </View>
            ) : slide?.type === 'motivation' ? (
              <View style={sum.motivCard}>
                <Text style={sum.motivEmoji}>{slide.emoji}</Text>
                <Text style={sum.motivMsg}>{slide.message}</Text>
                <Text style={sum.motivSub}>{slide.sub}</Text>
              </View>

            // ── Mission model screens ──────────────────────────────
            ) : slide?.type === 'mission' ? (
              (() => {
                const coverConcepts = summarySlides
                  .filter(s => ['main_concept', 'key_relation', 'application'].includes(s.type))
                  .slice(0, 3)
                  .map(s => s.title)
                  .filter((t): t is string => !!t);
                const coverXp = XP_PER_SUMMARY * Math.max(summarySlides.length, 1);
                return (
                  <View style={sum.missionCard}>
                    <View style={[sum.missionGrad, { backgroundColor: BRAND }]}>
                      <View style={sum.missionBadge}><Text style={sum.missionBadgeText}>🎯 MISIÓN</Text></View>
                      <Text style={sum.missionEmoji}>{slide.emoji}</Text>
                      <Text style={sum.missionTitle}>{slide.title}</Text>
                      {coverConcepts.length > 0 && (
                        <View style={sum.missionLearnBlock}>
                          <Text style={sum.missionLearnLabel}>Qué aprenderás</Text>
                          {coverConcepts.map((t, i) => (
                            <View key={i} style={sum.missionLearnRow}>
                              <Text style={sum.missionLearnBullet}>✓</Text>
                              <Text style={sum.missionLearnText} numberOfLines={1}>{t}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                      <View style={sum.missionMetaRow}>
                        <View style={sum.missionMetaChip}>
                          <Text style={sum.missionMetaChipText}>⏱ {session.estimatedDuration} min</Text>
                        </View>
                        <View style={[sum.missionMetaChip, sum.missionMetaChipXp]}>
                          <Text style={[sum.missionMetaChipText, { color: palette.charcoal }]}>⚡ +{coverXp} XP</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })()
            ) : slide?.type === 'main_concept' ? (
              (() => {
              const STEP_RE = /^(Problema|Paso\s*\d+|Resultado)\s*:/i;
              const defLines = (slide.definition ?? '').split(/\\n|\n/).map(l => l.trim()).filter(Boolean);
              const isProcedural = defLines.length >= 3 && defLines.some(l => STEP_RE.test(l));
              const hasConnector = !!slide.connector?.includes('↓');
              return (
                <View style={sum.mainCard}>
                  <View style={sum.mainCardHeader}>
                    <Text style={sum.mainCardLabel}>{isProcedural ? '📐 PASO A PASO' : '⚡ INSIGHT'}</Text>
                  </View>
                  <View style={sum.mainCardBody}>
                    <Text style={sum.mainCardEmoji}>{slide.emoji}</Text>
                    <Text style={sum.mainCardTitle}>{slide.title}</Text>
                    {hasConnector ? (
                      <>
                        <View style={sum.chainContainer}>
                          {slide.connector!.split('↓').map((part, i) => {
                            const text = part.trim();
                            if (!text) return null;
                            return i % 2 === 0 ? (
                              <View key={i} style={sum.chainNode}>
                                <Text style={sum.chainNodeText}>{text}</Text>
                              </View>
                            ) : (
                              <View key={i} style={sum.chainLink}>
                                <Text style={sum.chainLinkArrow}>↓</Text>
                                <Text style={sum.chainLinkText}>{text}</Text>
                              </View>
                            );
                          })}
                        </View>
                        {!!slide.definition && (
                          <View style={sum.conceptCard}>
                            <Text style={sum.conceptCardLabel}>💡 CONCEPTO</Text>
                            <Text style={sum.conceptCardText}>{slide.definition}</Text>
                          </View>
                        )}
                        {!!slide.example && (
                          <View style={sum.exampleBox}>
                            <Text style={sum.exampleLabel}>📌 Ejemplo</Text>
                            <Text style={sum.exampleText}>{slide.example}</Text>
                          </View>
                        )}
                      </>
                    ) : isProcedural ? (
                      <>
                        <View style={sum.stepsContainer}>
                          {defLines.map((line, i) => {
                            const isResult = /^Resultado\s*:/i.test(line);
                            const isProblem = /^Problema\s*:/i.test(line);
                            const label = line.split(':')[0].trim();
                            const content = line.slice(line.indexOf(':') + 1).trim();
                            return (
                              <View key={i} style={[sum.stepRow, isResult && sum.stepRowResult, isProblem && sum.stepRowProblem]}>
                                <View style={[sum.stepBadge, isResult && sum.stepBadgeResult, isProblem && sum.stepBadgeProblem]}>
                                  <Text style={sum.stepBadgeText}>{label}</Text>
                                </View>
                                <Text style={[sum.stepContent, isResult && sum.stepContentResult]}>{content}</Text>
                              </View>
                            );
                          })}
                        </View>
                        {!!slide.example && (
                          <View style={sum.exampleBox}>
                            <Text style={sum.exampleLabel}>📌 Ejemplo</Text>
                            <Text style={sum.exampleText}>{slide.example}</Text>
                          </View>
                        )}
                      </>
                    ) : (
                      // Default: Duolingo-style insight — parse "* bullet" lines
                      <>
                        {defLines.length > 0 ? (
                          <View style={sum.insightList}>
                            {defLines.map((line, i) => {
                              const isBullet = line.startsWith('*');
                              const text = isBullet ? line.slice(1).trim() : line;
                              return (
                                <View key={i} style={[sum.insightRow, i === 0 && sum.insightRowMain]}>
                                  {isBullet && <View style={[sum.insightDot, i === 0 && sum.insightDotMain]} />}
                                  <Text style={[sum.insightLine, i === 0 && sum.insightLineMain]}>{text}</Text>
                                </View>
                              );
                            })}
                          </View>
                        ) : (
                          !!slide.definition && <Text style={sum.insightFallback}>{slide.definition}</Text>
                        )}
                        {!!slide.example && (
                          <View style={sum.exampleBox}>
                            <Text style={sum.exampleLabel}>📌 Ejemplo</Text>
                            <Text style={sum.exampleText}>{slide.example}</Text>
                          </View>
                        )}
                      </>
                    )}
                  </View>
                </View>
              );
              })()
            ) : slide?.type === 'comprehension' ? (
              (() => {
                const prevSlide = missionSlides[summaryIdx - 1] as BackendSlide | undefined;
                const isEarlyCheck = prevSlide?.type === 'main_concept';
                return (
                  <View style={isEarlyCheck ? sum.checkCard : sum.quizCard}>
                    {isEarlyCheck ? (
                      <View style={sum.checkHeader}>
                        <Text style={sum.checkLabel}>🧠 COMPRUEBA SI ENTENDISTE</Text>
                        <Text style={sum.checkSubtitle}>Una pregunta rápida antes de continuar.</Text>
                      </View>
                    ) : (
                      <Text style={[sum.quizLabel, { color: BRAND }]}>✅ COMPROBACIÓN</Text>
                    )}
                    {!!slide.example && (
                      <View style={[sum.comprehensionCtx, isEarlyCheck && { marginHorizontal: SM ? 14 : 18, marginTop: SM ? 10 : 14 }]}>
                        <Text style={sum.comprehensionCtxText}>{slide.example}</Text>
                      </View>
                    )}
                    <View style={isEarlyCheck ? { paddingHorizontal: SM ? 14 : 18, paddingBottom: SM ? 14 : 18 } : {}}>
                      <Text style={[sum.quizQuestion, isEarlyCheck && { marginTop: 12 }]}>{slide.question ?? slide.title}</Text>
                      <View style={{ gap: 8, marginTop: 14 }}>
                        {slide.options?.map((opt, i) => {
                          const letter    = LETTERS[i];
                          const answered  = quizAnswers[summaryIdx];
                          const isCorrect = slide.correctAnswer === letter;
                          const showGreen = !!answered && isCorrect;
                          const showRed   = answered === letter && !isCorrect;
                          const dimmed    = !!answered && !isCorrect && answered !== letter;
                          return (
                            // OptionCard: static outer, receives all React state mutations
                            <Pressable
                              key={i}
                              onPress={() => {
                                if (!answered) {
                                  missionStreakRef.current = isCorrect ? missionStreakRef.current + 1 : 0;
                                  setQuizAnswers(prev => ({ ...prev, [summaryIdx]: letter }));
                                }
                              }}
                              style={[sum.quizOption, showGreen && sum.quizOptCorrect, showRed && sum.quizOptWrong, { opacity: dimmed ? 0.35 : 1 }]}
                            >
                              <View>
                                <View style={[sum.quizLetter, showGreen && sum.quizLetterGreen, showRed && sum.quizLetterRed]}>
                                  {showGreen ? <Check size={12} color={palette.blanco} strokeWidth={3} /> :
                                   showRed   ? <X    size={12} color={palette.blanco} strokeWidth={3} /> :
                                   <Text style={sum.quizLetterText}>{letter}</Text>}
                                </View>
                                <Text style={[sum.quizOptText, showGreen && { color: BRAND, fontWeight: '700' }, showRed && { color: '#991B1B', fontWeight: '700' }]}>{opt}</Text>
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                );
              })()
            ) : slide?.type === 'micro_challenge' ? (
              (() => {
                const answered = quizAnswers[summaryIdx];
                return (
                  <View style={sum.microCard}>
                    <View style={sum.microHeader}>
                      <Text style={sum.microLabel}>🏁 CHECKPOINT</Text>
                      <Text style={sum.microSubtitle}>Responde antes de continuar</Text>
                    </View>
                    <View style={{ paddingHorizontal: SM ? 14 : 18, paddingBottom: SM ? 14 : 18 }}>
                      <Text style={[sum.quizQuestion, { marginTop: 12 }]}>{slide.question ?? slide.title}</Text>
                      <View style={{ gap: 8, marginTop: 14 }}>
                        {slide.options?.slice(0, 3).map((opt, i) => {
                          const letter    = LETTERS[i];
                          const isOpt     = slide.correctAnswer === letter;
                          const showGreen = !!answered && isOpt;
                          const showRed   = answered === letter && !isOpt;
                          const dimmed    = !!answered && !isOpt && answered !== letter;
                          return (
                            <Pressable
                              key={i}
                              onPress={() => {
                                if (!answered) {
                                  missionStreakRef.current = isOpt ? missionStreakRef.current + 1 : 0;
                                  setQuizAnswers(prev => ({ ...prev, [summaryIdx]: letter }));
                                }
                              }}
                              style={[sum.quizOption, showGreen && sum.quizOptCorrect, showRed && sum.quizOptWrong, { opacity: dimmed ? 0.35 : 1 }]}
                            >
                              <View style={[sum.quizLetter, showGreen && sum.quizLetterGreen, showRed && sum.quizLetterRed]}>
                                {showGreen ? <Check size={12} color={palette.blanco} strokeWidth={3} /> :
                                 showRed   ? <X    size={12} color={palette.blanco} strokeWidth={3} /> :
                                 <Text style={sum.quizLetterText}>{letter}</Text>}
                              </View>
                              <Text style={[sum.quizOptText, showGreen && { color: BRAND, fontWeight: '700' }, showRed && { color: '#991B1B', fontWeight: '700' }]}>{opt}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                );
              })()
            ) : slide?.type === 'reinforcement_challenge' ? (
              (() => {
                const answered = quizAnswers[summaryIdx];
                return (
                  <View style={sum.microCard}>
                    <View style={[sum.microHeader, { backgroundColor: '#1E1B4B' }]}>
                      <Text style={sum.microLabel}>🔁 REFUERZO</Text>
                      <Text style={sum.microSubtitle}>Aplica lo que aprendiste</Text>
                    </View>
                    <View style={{ paddingHorizontal: SM ? 14 : 18, paddingBottom: SM ? 14 : 18 }}>
                      <Text style={[sum.quizQuestion, { marginTop: 12 }]}>{slide.question ?? slide.title}</Text>
                      <View style={{ gap: 8, marginTop: 14 }}>
                        {slide.options?.slice(0, 3).map((opt, i) => {
                          const letter    = LETTERS[i];
                          const isOpt     = slide.correctAnswer === letter;
                          const showGreen = !!answered && isOpt;
                          const showRed   = answered === letter && !isOpt;
                          const dimmed    = !!answered && !isOpt && answered !== letter;
                          return (
                            // OptionCard: static outer, receives all React state mutations
                            <Pressable
                              key={i}
                              onPress={() => {
                                if (!answered) {
                                  missionStreakRef.current = isOpt ? missionStreakRef.current + 1 : 0;
                                  setQuizAnswers(prev => ({ ...prev, [summaryIdx]: letter }));
                                }
                              }}
                              style={[sum.quizOption, showGreen && sum.quizOptCorrect, showRed && sum.quizOptWrong, { opacity: dimmed ? 0.35 : 1 }]}
                            >
                              <View>
                                <View style={[sum.quizLetter, showGreen && sum.quizLetterGreen, showRed && sum.quizLetterRed]}>
                                  {showGreen ? <Check size={12} color={palette.blanco} strokeWidth={3} /> :
                                   showRed   ? <X    size={12} color={palette.blanco} strokeWidth={3} /> :
                                   <Text style={sum.quizLetterText}>{letter}</Text>}
                                </View>
                                <Text style={[sum.quizOptText, showGreen && { color: BRAND, fontWeight: '700' }, showRed && { color: '#991B1B', fontWeight: '700' }]}>{opt}</Text>
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                );
              })()
            ) : slide?.type === 'key_relation' ? (
              (() => {
                // Build chain from connector (↓-separated) or example (→/↓-separated), else title+definition
                const raw = slide.connector?.includes('↓') ? slide.connector
                  : slide.example?.includes('↓') ? slide.example
                  : slide.example?.includes('→') ? slide.example.replace(/→/g, '↓')
                  : null;
                const chain: Array<{ text: string; isArrow: boolean }> = raw
                  ? raw.split('↓').map((p, i) => ({ text: p.trim(), isArrow: i % 2 === 1 })).filter(x => x.text)
                  : [
                      { text: slide.title, isArrow: false },
                      ...(slide.definition ? [{ text: slide.definition, isArrow: true }, { text: slide.example || '', isArrow: false }] : []),
                    ].filter(x => x.text);
                return (
                  <View style={sum.patternCard}>
                    <View style={sum.patternHeader}>
                      <Text style={sum.patternLabel}>🔍 DETECTA EL PATRÓN</Text>
                    </View>
                    <View style={sum.patternBody}>
                      {chain.map((item, i) =>
                        item.isArrow ? (
                          <View key={i} style={sum.patternArrowRow}>
                            <Text style={sum.patternArrowGlyph}>↓</Text>
                            {item.text !== '↓' && <Text style={sum.patternArrowLabel}>{item.text}</Text>}
                          </View>
                        ) : (
                          <View key={i} style={[sum.patternNode, i === chain.length - 1 && sum.patternNodeFinal]}>
                            <Text style={[sum.patternNodeText, i === chain.length - 1 && sum.patternNodeTextFinal]}>{item.text}</Text>
                          </View>
                        )
                      )}
                    </View>
                  </View>
                );
              })()
            ) : slide?.type === 'mini_quiz' ? (
              <View style={sum.quizCard}>
                <Text style={sum.quizLabel}>⚡ MINI QUIZ</Text>
                <Text style={sum.quizQuestion}>{slide.question ?? slide.title}</Text>
                <View style={{ gap: 8, marginTop: 14 }}>
                  {slide.options?.map((opt, i) => {
                    const letter    = LETTERS[i];
                    const answered  = quizAnswers[summaryIdx];
                    const isCorrect = slide.correctAnswer === letter;
                    const showGreen = !!answered && isCorrect;
                    const showRed   = answered === letter && !isCorrect;
                    const dimmed    = !!answered && !isCorrect && answered !== letter;
                    return (
                      <Pressable
                        key={i}
                        onPress={() => {
                          if (!answered) {
                            missionStreakRef.current = isCorrect ? missionStreakRef.current + 1 : 0;
                            setQuizAnswers(prev => ({ ...prev, [summaryIdx]: letter }));
                          }
                        }}
                        style={[sum.quizOption, showGreen && sum.quizOptCorrect, showRed && sum.quizOptWrong, { opacity: dimmed ? 0.35 : 1 }]}
                      >
                        <View>
                          <View style={[sum.quizLetter, showGreen && sum.quizLetterGreen, showRed && sum.quizLetterRed]}>
                            {showGreen ? <Check size={12} color={palette.blanco} strokeWidth={3} /> :
                             showRed   ? <X    size={12} color={palette.blanco} strokeWidth={3} /> :
                             <Text style={sum.quizLetterText}>{letter}</Text>}
                          </View>
                          <Text style={[sum.quizOptText, showGreen && { color: BRAND, fontWeight: '700' }, showRed && { color: '#991B1B', fontWeight: '700' }]}>{opt}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : slide?.type === 'process_flow' ? (
              <View style={sum.processCard}>
                <Text style={sum.processLabel}>⚙️ PROCESO</Text>
                <Text style={sum.processTitle}>{slide.title}</Text>
                {!!slide.definition && (
                  <View style={sum.processSteps}>
                    {slide.definition.split('→').map((step, i) => (
                      <View key={i} style={sum.processStep}>
                        <View style={sum.processNum}>
                          <Text style={sum.processNumText}>{i + 1}</Text>
                        </View>
                        <Text style={sum.processStepText}>{step.replace(/^\d+\.\s*/, '').trim()}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {!!slide.example && (
                  <View style={sum.exampleBox}>
                    <Text style={sum.exampleLabel}>📌 Ejemplo</Text>
                    <Text style={sum.exampleText}>{slide.example}</Text>
                  </View>
                )}
              </View>
            ) : slide?.type === 'application' ? (
              <View style={sum.appCard}>
                <View style={sum.appBand}>
                  <Text style={sum.appEmoji}>{slide.emoji}</Text>
                  <Text style={sum.appLabel}>🌍 APLICACIÓN REAL</Text>
                </View>
                <View style={sum.appBody}>
                  <Text style={sum.appTitle}>{slide.title}</Text>
                  {/* Concrete example front-and-center — this is the specific real case */}
                  {!!slide.example && (
                    <View style={sum.appScenarioBox}>
                      <Text style={sum.appScenarioLabel}>CASO REAL</Text>
                      <Text style={sum.appScenarioText}>{slide.example}</Text>
                    </View>
                  )}
                  {/* Definition as secondary context — only shown if adds new info */}
                  {!!slide.definition && <Text style={sum.appSit}>{slide.definition}</Text>}
                  {/* Interactive question */}
                  {slide.question && slide.options?.length ? (
                    <View style={{ marginTop: 10, gap: 8 }}>
                      <Text style={sum.quizQuestion}>{slide.question}</Text>
                      {slide.options.map((opt, i) => {
                        const letter = LETTERS[i];
                        const answered = quizAnswers[summaryIdx];
                        const isCorrect = (slide as BackendSlide).correctAnswer === letter;
                        const showGreen = !!answered && isCorrect;
                        const showRed = answered === letter && !isCorrect;
                        const dimmed = !!answered && !isCorrect && answered !== letter;
                        return (
                          <Pressable key={i}
                            onPress={() => { if (!answered) { setQuizAnswers(prev => ({ ...prev, [summaryIdx]: letter })); if (isCorrect) showSummaryReward(); else insertCorrectiveSlide(slide as BackendSlide, letter); } }}
                            style={[sum.quizOption, showGreen && sum.quizOptCorrect, showRed && sum.quizOptWrong, { opacity: dimmed ? 0.35 : 1 }]}
                          >
                            <View style={[sum.quizLetter, showGreen && sum.quizLetterGreen, showRed && sum.quizLetterRed]}>
                              {showGreen ? <Check size={12} color={palette.blanco} strokeWidth={3} /> :
                               showRed   ? <X    size={12} color={palette.blanco} strokeWidth={3} /> :
                               <Text style={sum.quizLetterText}>{letter}</Text>}
                            </View>
                            <Text style={[sum.quizOptText, showGreen && { color: BRAND, fontWeight: '700' }, showRed && { color: '#991B1B', fontWeight: '700' }]}>{opt}</Text>
                          </Pressable>
                        );
                      })}
                      {!!quizAnswers[summaryIdx] && (
                        <View style={[sum.quizFeedback, quizAnswers[summaryIdx] === (slide as BackendSlide).correctAnswer ? sum.quizFeedbackOk : sum.quizFeedbackErr]}>
                          {quizAnswers[summaryIdx] === (slide as BackendSlide).correctAnswer ? (
                            <View style={sum.quizFeedbackHeader}>
                              <Text style={sum.quizFeedbackTitle}>✓ Correcto</Text>
                              {!!summaryRewardText && <View style={sum.quizFeedbackXpChip}><Text style={sum.quizFeedbackXpText}>{summaryRewardText}</Text></View>}
                            </View>
                          ) : (
                            <>
                              <Text style={sum.quizFeedbackTitle}>💡 Incorrecto</Text>
                              <Text style={sum.quizFeedbackText}>{slide.definition || `La respuesta correcta era la ${(slide as BackendSlide).correctAnswer}.`}</Text>
                            </>
                          )}
                        </View>
                      )}
                    </View>
                  ) : null}
                </View>
              </View>
            ) : slide?.type === 'common_error' ? (
              // Interactive "find the error" when question + options present
              slide.question && slide.options?.length ? (
                <View style={sum.errorCard}>
                  <View style={sum.errorHeader}>
                    <Text style={sum.errorIcon}>⚠️</Text>
                    <Text style={sum.errorHeaderLabel}>Encuentra el Error</Text>
                  </View>
                  <View style={sum.errorBody}>
                    {!!slide.definition && (
                      <View style={sum.errorWrongBox}>
                        <Text style={sum.errorWrongLabel}>Analiza esta solución</Text>
                        <Text style={sum.errorWrongText}>{slide.definition}</Text>
                      </View>
                    )}
                    <Text style={[sum.quizQuestion, { marginTop: 10 }]}>{slide.question}</Text>
                    <View style={{ gap: 8, marginTop: 8 }}>
                      {slide.options.map((opt, i) => {
                        const letter = LETTERS[i];
                        const answered = quizAnswers[summaryIdx];
                        const isCorrect = slide.correctAnswer === letter;
                        const showGreen = !!answered && isCorrect;
                        const showRed = answered === letter && !isCorrect;
                        const dimmed = !!answered && !isCorrect && answered !== letter;
                        return (
                          <Pressable key={i}
                            onPress={() => { if (!answered) { setQuizAnswers(prev => ({ ...prev, [summaryIdx]: letter })); if (isCorrect) showSummaryReward(); else insertCorrectiveSlide(slide as BackendSlide, letter); } }}
                            style={[sum.quizOption, showGreen && sum.quizOptCorrect, showRed && sum.quizOptWrong, { opacity: dimmed ? 0.35 : 1 }]}
                          >
                            <View style={[sum.quizLetter, showGreen && sum.quizLetterGreen, showRed && sum.quizLetterRed]}>
                              {showGreen ? <Check size={12} color={palette.blanco} strokeWidth={3} /> :
                               showRed   ? <X    size={12} color={palette.blanco} strokeWidth={3} /> :
                               <Text style={sum.quizLetterText}>{letter}</Text>}
                            </View>
                            <Text style={[sum.quizOptText, showGreen && { color: BRAND, fontWeight: '700' }, showRed && { color: '#991B1B', fontWeight: '700' }]}>{opt}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {!!quizAnswers[summaryIdx] && !!slide.example && (
                      <View style={[sum.errorRightBox, { marginTop: 10 }]}>
                        <Text style={sum.errorRightLabel}>💡 Lo correcto es</Text>
                        <Text style={sum.errorRightText}>{slide.example}</Text>
                      </View>
                    )}
                  </View>
                </View>
              ) : !slide.definition || !slide.example ? (
                <View style={sum.introCard}>
                  <Text style={sum.slideEmoji}>{slide.emoji}</Text>
                  <Text style={sum.introHeading}>{slide.title}</Text>
                  {!!(slide.definition || slide.example) && (
                    <Text style={sum.introDef}>{slide.definition || slide.example}</Text>
                  )}
                </View>
              ) : (
                <View style={sum.errorCard}>
                  <View style={sum.errorHeader}>
                    <Text style={sum.errorIcon}>⚠️</Text>
                    <Text style={sum.errorHeaderLabel}>Error Común</Text>
                  </View>
                  <View style={sum.errorBody}>
                    <View style={sum.errorWrongBox}>
                      <Text style={sum.errorWrongLabel}>⚠️ Error detectado</Text>
                      <Text style={sum.errorWrongText}>{slide.definition}</Text>
                    </View>
                    <View style={sum.errorRightBox}>
                      <Text style={sum.errorRightLabel}>💡 Lo correcto es</Text>
                      <Text style={sum.errorRightText}>{slide.example}</Text>
                    </View>
                  </View>
                </View>
              )
            ) : slide?.type === 'final_challenge' ? (
              <View style={sum.retoCard}>
                <View style={sum.retoHeader}>
                  <Text style={sum.retoTrophy}>🏆</Text>
                  <Text style={sum.retoHeaderLabel}>MINI RETO FINAL</Text>
                  <Text style={sum.retoHeaderSub}>Última prueba antes de completar la misión.</Text>
                </View>
                <View style={sum.retoBody}>
                  <Text style={sum.challengeQuestion}>{slide.question ?? slide.title}</Text>
                  <View style={{ gap: 8 }}>
                    {slide.options?.map((opt, i) => {
                      const letter    = LETTERS[i];
                      const answered  = quizAnswers[summaryIdx];
                      const isCorrect = slide.correctAnswer === letter;
                      const showGreen = !!answered && isCorrect;
                      const showRed   = answered === letter && !isCorrect;
                      const dimmed    = !!answered && !isCorrect && answered !== letter;
                      return (
                        <Pressable
                          key={i}
                          onPress={() => {
                            if (!answered) {
                              missionStreakRef.current = isCorrect ? missionStreakRef.current + 1 : 0;
                              setQuizAnswers(prev => ({ ...prev, [summaryIdx]: letter }));
                            }
                          }}
                          style={[sum.quizOption, showGreen && sum.quizOptCorrect, showRed && sum.quizOptWrong, { opacity: dimmed ? 0.35 : 1 }]}
                        >
                          <View>
                            <View style={[sum.quizLetter, showGreen && sum.quizLetterGreen, showRed && sum.quizLetterRed]}>
                              {showGreen ? <Check size={12} color={palette.blanco} strokeWidth={3} /> :
                               showRed   ? <X    size={12} color={palette.blanco} strokeWidth={3} /> :
                               <Text style={sum.quizLetterText}>{letter}</Text>}
                            </View>
                            <Text style={[sum.quizOptText, showGreen && { color: BRAND, fontWeight: '700' }, showRed && { color: '#991B1B', fontWeight: '700' }]}>{opt}</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </View>
            ) : slide?.type === 'decide' ? (
              <View style={sum.quizCard}>
                <Text style={[sum.quizLabel, { color: '#FF7A2B' }]}>🤔 DECIDE</Text>
                <Text style={sum.quizQuestion}>{slide.question ?? slide.title}</Text>
                <View style={{ gap: 8, marginTop: 14 }}>
                  {slide.options?.map((opt, i) => {
                    const letter    = LETTERS[i];
                    const answered  = quizAnswers[summaryIdx];
                    const isCorrect = slide.correctAnswer === letter;
                    const showGreen = !!answered && isCorrect;
                    const showRed   = answered === letter && !isCorrect;
                    const dimmed    = !!answered && !isCorrect && answered !== letter;
                    return (
                      <Pressable
                        key={i}
                        onPress={() => {
                          if (!answered) {
                            missionStreakRef.current = isCorrect ? missionStreakRef.current + 1 : 0;
                            setQuizAnswers(prev => ({ ...prev, [summaryIdx]: letter }));
                          }
                        }}
                        style={[sum.quizOption, showGreen && sum.quizOptCorrect, showRed && sum.quizOptWrong, { opacity: dimmed ? 0.35 : 1 }]}
                      >
                        <View>
                          <View style={[sum.quizLetter, showGreen && sum.quizLetterGreen, showRed && sum.quizLetterRed]}>
                            {showGreen ? <Check size={12} color={palette.blanco} strokeWidth={3} /> :
                             showRed   ? <X    size={12} color={palette.blanco} strokeWidth={3} /> :
                             <Text style={sum.quizLetterText}>{letter}</Text>}
                          </View>
                          <Text style={[sum.quizOptText, showGreen && { color: BRAND, fontWeight: '700' }, showRed && { color: '#991B1B', fontWeight: '700' }]}>{opt}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : slide?.type === 'order_sequence' ? (
              // IIFE to define local shuffle vars inline
              (() => {
                const opts = (slide as BackendSlide).options ?? [];
                // Deterministic shuffle seeded on summaryIdx so it's stable across re-renders
                const shuffled: number[] = opts.map((_, i) => i);
                let seed = ((summaryIdx + 1) * 137 + 7) >>> 0;
                for (let k = shuffled.length - 1; k > 0; k--) {
                  seed = (seed * 1664525 + 1013904223) >>> 0;
                  const j = seed % (k + 1);
                  [shuffled[k], shuffled[j]] = [shuffled[j], shuffled[k]];
                }
                const answered = quizAnswers[summaryIdx];
                return (
                  <View style={sum.orderCard}>
                    <Text style={sum.orderLabel}>🔀 ORDENA LA SECUENCIA</Text>
                    <Text style={sum.orderTitle}>{(slide as BackendSlide).title}</Text>
                    <Text style={sum.orderHint}>
                      {answered === 'correct'
                        ? '✅ ¡Secuencia correcta!'
                        : orderTaps.length === 0
                          ? 'Toca los pasos en el orden correcto.'
                          : `${orderTaps.length} / ${opts.length} seleccionados`}
                    </Text>
                    <View style={sum.orderItems}>
                      {shuffled.map((origIdx, displayPos) => {
                        const tapPos = orderTaps.indexOf(origIdx);
                        const isSelected = tapPos !== -1;
                        const isDone = answered === 'correct';
                        return (
                          <Pressable
                            key={displayPos}
                            onPress={() => {
                              if (isDone) return;
                              if (isSelected) {
                                // Deselect this and all after it
                                setOrderTaps(prev => prev.slice(0, tapPos));
                              } else {
                                setOrderTaps(prev => [...prev, origIdx]);
                              }
                            }}
                            style={[
                              sum.orderItem,
                              isSelected && (isDone ? sum.orderItemCorrect : sum.orderItemSelected),
                            ]}
                          >
                            <View style={[sum.orderNum, isSelected && (isDone ? sum.orderNumCorrect : sum.orderNumSelected)]}>
                              {isSelected
                                ? <Text style={sum.orderNumTxt}>{tapPos + 1}</Text>
                                : <Text style={sum.orderNumTxtMuted}>?</Text>}
                            </View>
                            <Text style={[sum.orderItemTxt, isSelected && sum.orderItemTxtSelected]}>
                              {opts[origIdx]}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {answered === 'correct' && (
                      <View style={sum.orderSuccessRow}>
                        <Text style={sum.orderSuccessTxt}>¡Aprendiste el orden! 🎉</Text>
                      </View>
                    )}
                  </View>
                );
              })()
            ) : slide?.type === 'challenge' ? (
              // Only interactive challenges reach here (passive ones filtered in buildSummarySlides)
              <View style={sum.challengeRefCard}>
                <Text style={sum.challengeRefEmoji}>🤔</Text>
                <Text style={sum.challengeRefLabel}>DESAFÍO</Text>
                {!!slide.definition && <Text style={sum.challengeRefQ}>{slide.definition}</Text>}
                <View style={{ gap: 8, marginTop: 10, width: '100%' }}>
                  <Text style={sum.quizQuestion}>{slide.question}</Text>
                  {slide.options?.map((opt, i) => {
                    const letter = LETTERS[i];
                    const answered = quizAnswers[summaryIdx];
                    const isCorrect = (slide as BackendSlide).correctAnswer === letter;
                    const showGreen = !!answered && isCorrect;
                    const showRed = answered === letter && !isCorrect;
                    const dimmed = !!answered && !isCorrect && answered !== letter;
                    return (
                      <Pressable key={i}
                        onPress={() => { if (!answered) { setQuizAnswers(prev => ({ ...prev, [summaryIdx]: letter })); if (isCorrect) showSummaryReward(); else insertCorrectiveSlide(slide as BackendSlide, letter); } }}
                        style={[sum.quizOption, showGreen && sum.quizOptCorrect, showRed && sum.quizOptWrong, { opacity: dimmed ? 0.35 : 1 }]}
                      >
                        <View style={[sum.quizLetter, showGreen && sum.quizLetterGreen, showRed && sum.quizLetterRed]}>
                          {showGreen ? <Check size={12} color={palette.blanco} strokeWidth={3} /> :
                           showRed   ? <X    size={12} color={palette.blanco} strokeWidth={3} /> :
                           <Text style={sum.quizLetterText}>{letter}</Text>}
                        </View>
                        <Text style={[sum.quizOptText, showGreen && { color: BRAND, fontWeight: '700' }, showRed && { color: '#991B1B', fontWeight: '700' }]}>{opt}</Text>
                      </Pressable>
                    );
                  })}
                  {!!quizAnswers[summaryIdx] && !!slide.example && (
                    <View style={sum.challengeRefHintBox}>
                      <Text style={sum.challengeRefHintLbl}>Explicación</Text>
                      <Text style={sum.challengeRefHintTxt}>{slide.example}</Text>
                    </View>
                  )}
                </View>
              </View>
            ) : slide?.type === 'quiz_transition' ? ((() => {
              const hasFinalChallenge = missionSlides.some(s => s.type === 'final_challenge');
              const hasApplication    = missionSlides.some(s => s.type === 'application');
              const hasCommonError    = missionSlides.some(s => s.type === 'common_error');
              const checkItems = [
                'Conceptos aprendidos',
                hasCommonError ? 'Errores comunes identificados' : 'Patrones identificados',
                hasApplication ? 'Aplicaciones vistas' : 'Ejemplos practicados',
                ...(hasFinalChallenge ? ['Mini reto completado'] : []),
              ];
              return (
                <View style={sum.qtCard}>
                  <Text style={sum.qtEmoji}>🚀</Text>
                  <Text style={sum.qtTitle}>{(slide as BackendSlide).title || 'Preparado para el Quiz'}</Text>
                  <Text style={sum.qtSub}>{(slide as BackendSlide).definition || 'Ya dominaste los conceptos principales. Ahora ponlos a prueba.'}</Text>
                  <View style={sum.qtChecklist}>
                    {checkItems.map((item, i) => (
                      <View key={i} style={sum.qtCheckRow}>
                        <Text style={sum.qtCheckIcon}>✓</Text>
                        <Text style={sum.qtCheckText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })()
            ) : slide?.type === 'victory' ? ((() => {
              // Labels per spec: Dominado / Buen dominio / Vas avanzando / Necesita más práctica
              const masteryConfig = masteryLevel === 'mastered'
                ? { bg: 'rgba(5,150,105,0.12)', border: 'rgba(5,150,105,0.3)', color: '#065F46', label: '🏆 Dominado', sub: `${masteryPct ?? 100}% correcto` }
                : masteryLevel === 'good_mastery'
                ? { bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.3)', color: '#1E40AF', label: '📈 Buen dominio', sub: `${masteryPct ?? 0}% correcto` }
                : masteryLevel === 'in_progress'
                ? { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.3)', color: '#92400E', label: '🔄 Vas avanzando', sub: `${masteryPct ?? 0}% correcto` }
                : masteryLevel === 'needs_practice'
                ? { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', color: '#991B1B', label: '💪 Necesita más práctica', sub: `${masteryPct ?? 0}% correcto` }
                : null;

              // Reflection — based on slides actually ANSWERED wrong (not unanswered)
              const V_INTER_LOCAL = ['micro_challenge', 'comprehension', 'mini_quiz', 'final_challenge', 'decide', 'order_sequence', 'common_error', 'application', 'challenge', 'wow_fact'];
              const wrongSlides = missionSlides
                .map((s, i) => ({ s: s as BackendSlide, i }))
                .filter(({ s, i }) =>
                  V_INTER_LOCAL.includes(s.type) &&
                  !!s.correctAnswer &&
                  !!quizAnswers[i] &&
                  quizAnswers[i] !== s.correctAnswer
                );
              const reflectionMsg: string | null = noInteractionsAttempted || wrongSlides.length === 0
                ? null
                : wrongSlides.length === 1
                ? `La pregunta "${(wrongSlides[0].s.question ?? '').slice(0, 50)}..." fue la más difícil. Repásala antes de seguir.`
                : `Repasa especialmente: "${(wrongSlides[0].s.question ?? '').slice(0, 40)}..."${wrongSlides.length > 1 ? ` y "${(wrongSlides[1].s.question ?? '').slice(0, 40)}..."` : ''}.`;

              // "Aprendiste" → "Conceptos trabajados" when performance is insufficient
              const victoryDefinition = (() => {
                if (!slide.definition) return null;
                if (noInteractionsAttempted) return null;
                const pct = masteryPct ?? 100;
                if (pct >= 70) return slide.definition;
                return slide.definition.replace(/^(✓\s*)?Aprendiste:?\s*/i, 'Conceptos trabajados: ');
              })();

              // Victory note: only first part of example (no cross-mission "Próximo desafío")
              const victoryNote = (() => {
                if (!slide.example) return null;
                if (noInteractionsAttempted) return null;
                return slide.example.split(' | ')[0].trim();
              })();
              // Skill path context
              const currentMissionIdx = skillPath?.missions?.findIndex(m => m.sessionId === currentSessionId) ?? -1;
              const currentSkillLabel = skillPath && currentMissionIdx >= 0
                ? (skillPath.missions[currentMissionIdx]?.skillLabel ?? null)
                : null;
              const nextMission = skillPath && currentMissionIdx >= 0 && currentMissionIdx < skillPath.missions.length - 1
                ? skillPath.missions[currentMissionIdx + 1]
                : null;
              const missionProgress = skillPath && skillPath.totalMissions > 1 && currentMissionIdx >= 0
                ? `Misión ${currentMissionIdx + 1} de ${skillPath.totalMissions}`
                : null;
              const loadNextMission = async () => {
                if (!nextMission) return;
                const nextSession = nextMission.session as Session | undefined;
                if (!nextSession) return;
                const newKey = Date.now().toString();
                await AsyncStorage.multiSet([
                  ['nemup_last_session', JSON.stringify(nextSession)],
                  ['nemup_session_key', newKey],
                  ['nemup_last_session_id', nextMission.sessionId],
                ]);
                // Keep skill path as-is (same path, next mission)
                // Reset game state and reload
                loadedSessionKeyRef.current = null; // force reload on next focus
                setSession(nextSession);
                setCurrentSessionId(nextMission.sessionId);
                setMasteryLevel(null);
                setMasteryPct(null);
                setEarnedXp(null);
                setPhase('lobby');
                setCompleted(new Set());
                setSummaryIdx(0);
                setQuizAnswers({});
                setQuizIdx(0);
                setSelected(null);
                setQuizStep('answering');
                setLives(MAX_LIVES);
                setXpEarned(0);
                setCorrectCount(0);
                setStreak(0);
                setMaxStreak(0);
                setQuizDone(false);
                setComboCount(0);
                setStreakMsg('');
                setMicroMsg('');
                setSummaryRewardText(null);
                setOrderTaps([]);
                setNemiMsg('');
                setMotivText(MOTIV_POOLS.start[0]);
                setCardIdx(0);
                setCardFlipped(false);
                setCardsDone(false);
                setCardsKnew(0);
                setCardsDubious(0);
                setCardsUnknown(0);
                missionStartRef.current    = null;
                quizStartRef.current       = null;
                flashcardsStartRef.current = null;
                loadedSessionKeyRef.current = newKey;
              };
              // Override victory title to be consistent with actual performance
              const effectiveVictoryTitle = (() => {
                if (noInteractionsAttempted) return '¡Intento registrado!';
                if (vInterTotal === 0) return slide.title;
                const pct = masteryPct ?? 100;
                if (pct < 30) return '¡Misión completada!';
                return slide.title;
              })();

              // ── Neutral-positive render (NEUTRAL_MISSION_COMPLETION = true) ──
              if (NEUTRAL_MISSION_COMPLETION) {
                const tiempoMs    = missionStartRef.current ? Date.now() - missionStartRef.current : 0;
                const tiempoStr   = formatMissionTime(tiempoMs);
                const conceptTitles = missionSlides
                  .filter(s => V_CONCEPT.includes(s.type))
                  .map(s => (s as BackendSlide).title)
                  .filter((t): t is string => !!t);
                return (
                  <View style={sum.victoryCard}>
                    <CheckCircle size={44} color={BRAND} strokeWidth={1.5} />
                    <Text style={[sum.victoryTitle, { marginTop: 10 }]}>Misión completa</Text>
                    {!!missionProgress && <Text style={sum.missionProgress}>{missionProgress}</Text>}

                    {/* Three stat tiles */}
                    <View style={sum.victoryStats}>
                      <View style={sum.victoryStatRow}>
                        <View style={sum.victoryStat}>
                          <Text style={sum.victoryStatVal}>{tiempoStr}</Text>
                          <Text style={sum.victoryStatLbl}>enfocado</Text>
                        </View>
                        <View style={sum.victoryStat}>
                          <Text style={sum.victoryStatVal}>{vConcepts}</Text>
                          <Text style={sum.victoryStatLbl}>conceptos</Text>
                        </View>
                        <View style={sum.victoryStat}>
                          <Text style={[sum.victoryStatVal, { color: BRAND }]}>+{earnedXp ?? 0}</Text>
                          <Text style={sum.victoryStatLbl}>XP</Text>
                        </View>
                      </View>
                    </View>

                    {/* Mini-quiz secondary line — framing futuro-positivo */}
                    {vInterTotal > 0 && (
                      <Text style={[sum.victorySub, { textAlign: 'center', marginTop: 2 }]}>
                        {`Mini-quizzes: ${vCorrect}/${vInterTotal} — los repasarás en el Quiz`}
                      </Text>
                    )}

                    {/* Conceptos que viste — neutral bullets, no checkmarks */}
                    {conceptTitles.length > 0 && (
                      <View style={{ marginTop: 14, alignSelf: 'stretch', gap: 4 }}>
                        <Text style={[sum.victoryStatLbl, { fontWeight: '700', marginBottom: 4 }]}>Conceptos que viste</Text>
                        {conceptTitles.map((t, i) => (
                          <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                            <Text style={{ color: semantic.textTertiary, fontSize: 16, lineHeight: 20 }}>·</Text>
                            <Text style={[sum.kpDef, { flex: 1, fontSize: 13 }]} numberOfLines={2}>{t}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Repasa: concept titles from wrong slides — no truncated question text */}
                    {wrongSlides.length > 0 && (
                      <View style={[sum.reflectionBlock, { backgroundColor: 'rgba(108,77,255,0.06)', borderColor: 'rgba(108,77,255,0.18)' }]}>
                        <Text style={[sum.reflectionText, { color: semantic.textTertiary }]}>
                          {'Repasa: '}
                          {wrongSlides.map(w => w.s.title).filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                    )}

                    {/* Next mission — skill transition path (kept) */}
                    {!!nextMission && (
                      <View style={sum.nextMissionWrapper}>
                        <Text style={sum.nextMissionLabel}>Siguiente habilidad</Text>
                        <Pressable onPress={loadNextMission} style={sum.nextMissionBtn}>
                          <View style={[sum.nextMissionGrad, { backgroundColor: BRAND }]}>
                            <Text style={sum.nextMissionText}>⚡ {nextMission.skillLabel ?? 'Próxima misión'}</Text>
                            <Text style={sum.nextMissionArrow}>Continuar →</Text>
                          </View>
                        </Pressable>
                      </View>
                    )}
                    {skillPath && skillPath.totalMissions > 1 && currentMissionIdx >= 0 && (
                      <View style={sum.upcomingBlock}>
                        {skillPath.missions.map((m, i) => {
                          const isCurrent = m.sessionId === currentSessionId;
                          const isPast    = i < currentMissionIdx;
                          return (
                            <View key={i} style={[sum.upcomingRow, isCurrent && sum.upcomingRowCurrent]}>
                              <Text style={sum.upcomingDot}>{isPast ? '✓' : isCurrent ? '▶' : `${i + 1}`}</Text>
                              <Text style={[sum.upcomingLabel, isPast && sum.upcomingLabelDone, isCurrent && sum.upcomingLabelCurrent]} numberOfLines={1}>
                                {m.skillLabel ?? `Misión ${i + 1}`}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              }

              return (
              <View style={sum.victoryCard}>
                <Text style={sum.victoryEmoji}>{slide.emoji}</Text>
                <Text style={sum.victoryTitle}>{effectiveVictoryTitle}</Text>
                {/* Mission progress indicator */}
                {!!missionProgress && (
                  <Text style={sum.missionProgress}>{missionProgress}</Text>
                )}
                {/* Skill dominance chip — only when evidence of learning exists */}
                {!!currentSkillLabel && !noInteractionsAttempted && (masteryPct ?? 0) >= 70 && (
                  <View style={sum.skillDominatedChip}>
                    <Text style={sum.skillDominatedText}>✓ Dominaste: {currentSkillLabel}</Text>
                  </View>
                )}
                {/* "Conceptos trabajados" / "Aprendiste" — suppressed when no interactions */}
                {!!victoryDefinition && <Text style={sum.victorySub}>{victoryDefinition}</Text>}

                {noInteractionsAttempted ? (
                  /* CASO 1: Sin respuestas — no hay evidencia de aprendizaje */
                  <View style={sum.noInteractionBlock}>
                    <Text style={sum.noInteractionText}>
                      Recorriste el contenido, pero no respondiste actividades suficientes para evaluar tu comprensión.
                    </Text>
                    <View style={sum.noInteractionStats}>
                      <View style={sum.victoryStat}>
                        <Text style={sum.victoryStatVal}>{slides.length}</Text>
                        <Text style={sum.victoryStatLbl}>pantallas</Text>
                      </View>
                      <View style={sum.victoryStat}>
                        <Text style={[sum.victoryStatVal, { color: semantic.textTertiary }]}>0/{vInterTotal}</Text>
                        <Text style={sum.victoryStatLbl}>respondidas</Text>
                      </View>
                      <View style={sum.victoryStat}>
                        <Text style={[sum.victoryStatVal, { color: semantic.textTertiary }]}>+0</Text>
                        <Text style={sum.victoryStatLbl}>XP</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  /* CASO 2-4: Hay respuestas — mostrar desempeño real */
                  <>
                    {/* Mastery badge */}
                    {!!masteryConfig && (
                      <View style={[sum.masteryBadge, { backgroundColor: masteryConfig.bg, borderColor: masteryConfig.border }]}>
                        <Text style={[sum.masteryBadgeText, { color: masteryConfig.color }]}>{masteryConfig.label}</Text>
                        <Text style={[sum.masteryBadgeSub, { color: masteryConfig.color }]}>{masteryConfig.sub}</Text>
                      </View>
                    )}
                    {/* Performance stats */}
                    <View style={sum.victoryStats}>
                      <View style={sum.victoryStatRow}>
                        <View style={sum.victoryStat}>
                          <Text style={sum.victoryStatVal}>{vConcepts}</Text>
                          <Text style={sum.victoryStatLbl}>conceptos</Text>
                        </View>
                        <View style={sum.victoryStat}>
                          <Text style={[sum.victoryStatVal, { color: '#059669' }]}>{vCorrect}/{vInterTotal}</Text>
                          <Text style={sum.victoryStatLbl}>correctas</Text>
                        </View>
                        <View style={sum.victoryStat}>
                          <Text style={[sum.victoryStatVal, { color: BRAND }]}>+{earnedXp ?? 0}</Text>
                          <Text style={sum.victoryStatLbl}>XP</Text>
                        </View>
                        {SHOW_GEMS && (
                          <View style={sum.victoryStat}>
                            <Text style={[sum.victoryStatVal, { color: '#FF7A2B' }]}>+{(masteryPct ?? 0) >= 70 ? Math.round((session.gemReward ?? 10) * (masteryPct ?? 0) / 100) : 0}</Text>
                            <Text style={sum.victoryStatLbl}>💎</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    {/* "Lo usarás..." note — first part only, no cross-mission recommendations */}
                    {!!victoryNote && <Text style={sum.victoryNote}>{victoryNote}</Text>}
                    {/* Intelligent reflection — only for answered-wrong slides */}
                    {!!reflectionMsg && (
                      <View style={sum.reflectionBlock}>
                        <Text style={sum.reflectionText}>{reflectionMsg}</Text>
                      </View>
                    )}
                  </>
                )}
                {/* Next mission button — skill transition */}
                {!!nextMission && (
                  <View style={sum.nextMissionWrapper}>
                    <Text style={sum.nextMissionLabel}>Siguiente habilidad</Text>
                    <Pressable onPress={loadNextMission} style={sum.nextMissionBtn}>
                      <View style={[sum.nextMissionGrad, { backgroundColor: BRAND }]}>
                        <Text style={sum.nextMissionText}>
                          ⚡ {nextMission.skillLabel ?? 'Próxima misión'}
                        </Text>
                        <Text style={sum.nextMissionArrow}>Continuar →</Text>
                      </View>
                    </Pressable>
                  </View>
                )}
                {/* Upcoming missions from path — only when this session belongs to the path */}
                {skillPath && skillPath.totalMissions > 1 && currentMissionIdx >= 0 && (
                  <View style={sum.upcomingBlock}>
                    {skillPath.missions.map((m, i) => {
                      const isCurrent = m.sessionId === currentSessionId;
                      const isPast = i < currentMissionIdx;
                      return (
                        <View key={i} style={[sum.upcomingRow, isCurrent && sum.upcomingRowCurrent]}>
                          <Text style={sum.upcomingDot}>{isPast ? '✓' : isCurrent ? '▶' : `${i + 1}`}</Text>
                          <Text style={[sum.upcomingLabel, isPast && sum.upcomingLabelDone, isCurrent && sum.upcomingLabelCurrent]} numberOfLines={1}>
                            {m.skillLabel ?? `Misión ${i + 1}`}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
              );
            })()

            // ── Legacy screens ────────────────────────────────────
            ) : slide?.type === 'concept' ? (
              <View style={sum.introCard}>
                <Text style={sum.slideEmoji}>{slide.emoji}</Text>
                <Text style={sum.introHeading}>{slide.title}</Text>
                {!!slide.definition && <Text style={sum.introDef}>{slide.definition}</Text>}
                {!!slide.example && (
                  <View style={sum.exampleBox}>
                    <Text style={sum.exampleLabel}>📌 Ejemplo</Text>
                    <Text style={sum.exampleText}>{slide.example}</Text>
                  </View>
                )}
              </View>
            ) : slide?.type === 'wow_fact' ? (
              <View style={sum.wowCard}>
                <Text style={sum.wowEmoji}>{(slide as BackendSlide).emoji || '🤯'}</Text>
                <Text style={sum.wowLabel}>🧠 ¿SABÍAS QUE?</Text>
                {/* Title is the surprise hook — the memorable claim */}
                {!!slide.title && <Text style={sum.wowHook}>{slide.title}</Text>}
                {/* Definition expands the surprising fact */}
                <View style={sum.wowDataBox}>
                  <Text style={sum.wowText}>{slide.definition}</Text>
                </View>
                {/* Example as "¿por qué importa?" — only when no question */}
                {!!slide.example && !slide.question && (
                  <Text style={sum.wowContext}>{slide.example}</Text>
                )}
                {slide.question && slide.options && (
                  <View style={{ gap: 8, marginTop: 16, alignSelf: 'stretch' }}>
                    <Text style={[sum.quizQuestion, { fontSize: SM ? 13 : 14 }]}>{slide.question}</Text>
                    {slide.options.map((opt, i) => {
                      const letter    = LETTERS[i];
                      const answered  = quizAnswers[summaryIdx];
                      const isCorrect = slide.correctAnswer === letter;
                      const showGreen = !!answered && isCorrect;
                      const showRed   = answered === letter && !isCorrect;
                      const dimmed    = !!answered && !isCorrect && answered !== letter;
                      return (
                        <Pressable key={i}
                          onPress={() => { if (!answered) { setQuizAnswers(prev => ({ ...prev, [summaryIdx]: letter })); if (isCorrect) showSummaryReward(); else insertCorrectiveSlide(slide as BackendSlide, letter); } }}
                          style={[sum.quizOption, showGreen && sum.quizOptCorrect, showRed && sum.quizOptWrong, { opacity: dimmed ? 0.35 : 1 }]}
                        >
                          <View style={[sum.quizLetter, showGreen && sum.quizLetterGreen, showRed && sum.quizLetterRed]}>
                            {showGreen ? <Check size={12} color={palette.blanco} strokeWidth={3} /> :
                             showRed   ? <X    size={12} color={palette.blanco} strokeWidth={3} /> :
                             <Text style={sum.quizLetterText}>{letter}</Text>}
                          </View>
                          <Text style={[sum.quizOptText, showGreen && { color: BRAND, fontWeight: '700' }, showRed && { color: '#991B1B', fontWeight: '700' }]}>{opt}</Text>
                        </Pressable>
                      );
                    })}
                    {!!quizAnswers[summaryIdx] && (
                      <View style={[sum.quizFeedback, quizAnswers[summaryIdx] === slide.correctAnswer ? sum.quizFeedbackOk : sum.quizFeedbackErr]}>
                        {quizAnswers[summaryIdx] === slide.correctAnswer ? (
                          <View style={sum.quizFeedbackHeader}>
                            <Text style={sum.quizFeedbackTitle}>✓ ¡Exacto!</Text>
                            {!!summaryRewardText && <View style={sum.quizFeedbackXpChip}><Text style={sum.quizFeedbackXpText}>{summaryRewardText}</Text></View>}
                          </View>
                        ) : (
                          <>
                            <Text style={sum.quizFeedbackTitle}>💡 Incorrecto</Text>
                            {!!slide.example && <Text style={sum.quizFeedbackText}>{slide.example}</Text>}
                          </>
                        )}
                      </View>
                    )}
                  </View>
                )}
              </View>
            ) : slide?.type === 'example' ? (
              <View style={sum.scenarioCard}>
                <View style={sum.scenarioBand}>
                  <Text style={sum.scenarioEmoji}>{slide.emoji}</Text>
                  <Text style={sum.scenarioLabel}>📌 EJEMPLO PRÁCTICO</Text>
                </View>
                <View style={sum.scenarioBody}>
                  <Text style={sum.scenarioTitle}>{slide.title}</Text>
                  {!!slide.definition && <Text style={sum.scenarioDef}>{slide.definition}</Text>}
                  {!!slide.example && <Text style={sum.scenarioEx}>{slide.example}</Text>}
                </View>
              </View>
            ) : !slide?.title?.trim() && !slide?.definition?.trim() ? (
              <View style={sum.kpCard}>
                {(() => { console.warn(`[Session] Empty slide at index ${summaryIdx}: type=${slide?.type ?? 'unknown'}`); return null; })()}
                <Text style={sum.kpEmoji}>⚠️</Text>
                <Text style={sum.kpTitle}>Contenido no disponible</Text>
              </View>
            ) : (
              <View style={[sum.kpCard, { backgroundColor: SLIDE_STYLE[slide?.type ?? '']?.bg ?? 'rgba(91,61,245,0.08)', borderLeftColor: SLIDE_STYLE[slide?.type ?? '']?.accent ?? BRAND }]}>
                <Text style={sum.kpEmoji}>{slide?.emoji}</Text>
                <Text style={[sum.kpLabel, { color: SLIDE_STYLE[slide?.type ?? '']?.accent ?? BRAND }]}>{SLIDE_STYLE[slide?.type ?? '']?.label}</Text>
                <Text style={sum.kpTitle}>{slide?.title}</Text>
                {!!slide?.definition && <Text style={sum.kpDef}>{slide.definition}</Text>}
                {!!slide?.example && (
                  <View style={sum.exampleBox}>
                    <Text style={sum.exampleLabel}>📌 Ejemplo</Text>
                    <Text style={sum.exampleText}>{slide.example}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Summary micro-reward — integrated into feedback boxes (no floating overlay) */}
          </Animated.View>

          {/* CTA — three always-present nodes; display prop toggles which is visible.
              Never unmounts/remounts anything → eliminates all Fabric shadow-tree
              reconciliation crashes on RN 0.81 New Architecture. */}
          {(() => {
            const bs = slide as BackendSlide | undefined;
            const MISSION_QUIZ_TYPES = new Set(['micro_challenge', 'reinforcement_challenge', 'comprehension', 'mini_quiz', 'final_challenge', 'decide']);
            const isMissionInteractive = MISSION_QUIZ_TYPES.has(slide?.type ?? '') ||
              (['common_error', 'wow_fact', 'application', 'challenge'].includes(slide?.type ?? '') && !!bs?.question);
            const missionAnswered = isMissionInteractive ? quizAnswers[summaryIdx] : undefined;
            const missionCorrect  = !!missionAnswered && missionAnswered === bs?.correctAnswer;
            const _seed = (summaryIdx * 2654435761) >>> 0;
            const celebMsg = MISSION_FB_OK[_seed % MISSION_FB_OK.length];
            const errMsg   = MISSION_FB_ERR[(_seed ^ 0xDEAD) % MISSION_FB_ERR.length];
            const streakLabel = missionStreakRef.current >= 5 ? `⚡ ¡${missionStreakRef.current} en racha!` :
                                missionStreakRef.current === 4 ? '⚡ ¡Racha de 4!' :
                                missionStreakRef.current === 3 ? '🔥 ¡3 seguidas!' :
                                missionStreakRef.current === 2 ? '🔥 ¡Racha de 2!' : null;
            const xpLabel     = slide?.type === 'final_challenge' ? '+10 XP' : '+5 XP';
            const fbActive    = isMissionInteractive && !!missionAnswered;
            const needsChoose = !fbActive && ((slide?.type === 'quiz' && !slideQuizAnswered) || (isMissionInteractive && !missionAnswered));
            const showNav     = !fbActive && !needsChoose;
            const navLabel    = isLast && slide?.type === 'victory'
              ? (NEUTRAL_MISSION_COMPLETION ? 'Continuar al Quiz →' : noInteractionsAttempted ? 'Cerrar misión' : '🏆 ¡Misión completada!')
              : isLast                                   ? '✅ Completar resumen'
              : slide?.type === 'mission'                ? '¡Comenzar! →'
              : (slide?.type === 'challenge' && !bs?.correctAnswer) ? '🤔 Lo pensé →'
              : slide?.type === 'motivation'             ? '¡Seguimos! →'
              : slide?.type === 'prediction'             ? '🧠 Entendido →'
              : 'Siguiente →';

            return (
              <>
                {/* 1 — Feedback bar: absolute, always in the tree */}
                <View style={[sum.mFeedbackBar, missionCorrect ? sum.mFeedbackBarOk : sum.mFeedbackBarErr,
                  { paddingBottom: insets.bottom + 12, position: 'absolute', bottom: 0, left: 0, right: 0,
                    display: fbActive ? 'flex' : 'none' }]}>
                  <View style={sum.mFbContent}>
                    <Text style={sum.mFbEmoji}>{missionCorrect ? celebMsg.emoji : errMsg.emoji}</Text>
                    <Text style={sum.mFbTitle}>{missionCorrect ? celebMsg.text : errMsg.text}</Text>
                    <Text style={[sum.mFbExpl, { display: (!missionCorrect && !!bs?.definition) ? 'flex' : 'none' }]} numberOfLines={3}>
                      {bs?.definition ?? ''}
                    </Text>
                    <Text style={[sum.mFbCorrect, { display: (!missionCorrect && !!bs?.correctAnswer) ? 'flex' : 'none' }]}>
                      {bs?.correctAnswer ? `Respuesta: ${bs.correctAnswer}` : ''}
                    </Text>
                    <View style={[sum.mStreakBadge, { display: (missionCorrect && !!streakLabel) ? 'flex' : 'none' }]}>
                      <Text style={sum.mStreakText}>{streakLabel ?? ''}</Text>
                    </View>
                    <View style={[sum.mXpChip, { display: missionCorrect ? 'flex' : 'none' }]}>
                      <Text style={sum.mXpText}>{xpLabel}</Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => isLast ? completeMode('summary') : goNext()}
                    style={[sum.mContinueBtn, !missionCorrect ? sum.mContinueBtnErr : null]}
                  >
                    <Text style={sum.mContinueBtnText}>{isLast ? '¡Misión completada! →' : 'Continuar'}</Text>
                  </Pressable>
                </View>

                {/* 2 — Choose CTA: in-flow, always in the tree */}
                <View style={[g.bottom, { paddingBottom: insets.bottom + 12, display: needsChoose ? 'flex' : 'none' }]}>
                  <View style={g.ctaBtnOff}>
                    <Text style={g.ctaTextOff}>Elige una opción</Text>
                  </View>
                </View>

                {/* 3 — Nav CTA: in-flow, always in the tree */}
                <View style={[g.bottom, { paddingBottom: insets.bottom + 12, display: showNav ? 'flex' : 'none' }]}>
                  <Pressable onPress={() => isLast ? completeMode('summary') : goNext()} style={{ width: '100%' }}>
                    <View style={[g.ctaBtn, { backgroundColor: BRAND }]}>
                      <Text style={g.ctaText}>{navLabel}</Text>
                    </View>
                  </Pressable>
                </View>
              </>
            );
          })()}
        </SafeAreaView>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // QUIZ — Screen 4
  // ══════════════════════════════════════════════════════════════
  if (phase === 'quiz') {
    if (quizDone) {
      const acc = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;

      if (MODE_COMPLETION_REDESIGN) {
        const tiempoMs  = quizStartRef.current ? Date.now() - quizStartRef.current : 0;
        const tiempoStr = formatMissionTime(tiempoMs);

        const newSetAfterQuiz    = new Set([...completedModes, 'quiz']);
        const remainingAfterQuiz = LOCAL_MODE_ORDER.filter(m => !newSetAfterQuiz.has(m));
        const nextLocalQuiz      = remainingAfterQuiz[0] ?? null;
        const continueLabelQuiz  = newSetAfterQuiz.size >= 3
          ? '¡Ver sesión completa! →'
          : nextLocalQuiz
            ? `Continuar con ${LOCAL_MODE_LABEL[nextLocalQuiz]} →`
            : 'Continuar →';

        const onContinueQuiz = () => {
          const newSet = new Set([...completedModes, 'quiz']);
          setCompleted(newSet);
          setCelebSrc('quiz');
          if (DAILY_SESSION_LOGIC) markModeComplete(LOCAL_MODE_TO_DAILY['quiz']);
          saveSessionProgress(newSet);
          if (newSet.size >= 3) {
            router.push('/session-complete' as any);
          } else {
            setPhase(nextLocalQuiz ? LOCAL_MODE_TO_PHASE[nextLocalQuiz] : 'mode-select');
          }
        };

        return (
          <ModeCompletionScreen
            mode="quiz"
            iconNode={<Zap size={44} color={BRAND} strokeWidth={1.5} />}
            screenTitle="🧠 Quiz"
            title="Quiz completo"
            tiles={[
              { label: 'enfocado',  value: tiempoStr },
              { label: 'aciertos',  value: `${correctCount}/${questions.length}` },
              { label: 'XP',        value: `+${xpEarned}`, valueColor: BRAND },
            ]}
            contextualLine={`Precisión: ${acc}% · Mejor racha: ${maxStreak}`}
            continueLabel={continueLabelQuiz}
            onContinue={onContinueQuiz}
            onBack={() => setPhase('mode-select')}
            sessionCompletedCount={newSetAfterQuiz.size}
          />
        );
      }

      if (UNIFIED_QUIZ_COMPLETION) {
        const tiempoMs  = quizStartRef.current ? Date.now() - quizStartRef.current : 0;
        const tiempoStr = formatMissionTime(tiempoMs);
        return (
          <SafeAreaView style={g.page} edges={['top']}>
            <StatusBar barStyle="dark-content" backgroundColor={BG} />
            <View style={g.topBar}>
              <Pressable onPress={() => setPhase('mode-select')} style={g.iconBtn} hitSlop={10}>
                <ChevronLeft size={18} color={semantic.textPrimary} strokeWidth={2.5} />
              </Pressable>
              <Text style={g.screenTitle}>🧠 Quiz</Text>
              <Pressable onPress={() => setPhase('mode-select')} style={g.iconBtn} hitSlop={10}>
                <X size={16} color={semantic.textPrimary} strokeWidth={2.5} />
              </Pressable>
            </View>
            {UNIFIED_PROGRESS_BAR && (
              <UnifiedProgressBar progress={globalPct} currentMode="quiz" />
            )}
            <Animated.View style={[{ flex: 1 }, resultEntryStyle]}>
              <ScrollView contentContainerStyle={[qz.resultScroll, { paddingBottom: insets.bottom + 24 }]}>
                <Zap size={44} color={BRAND} strokeWidth={1.5} />
                <Text style={[qz.resultTitle, { marginTop: 10 }]}>Quiz completo</Text>

                {/* Three neutral tiles */}
                <View style={qz.resultGrid}>
                  <View style={qz.resultCell}>
                    <Text style={{ fontSize: 22 }}>⏱</Text>
                    <Text style={[qz.resultCellVal, { color: semantic.textPrimary }]}>{tiempoStr}</Text>
                    <Text style={qz.resultCellLbl}>enfocado</Text>
                  </View>
                  <View style={qz.resultCell}>
                    <Text style={{ fontSize: 22 }}>🎯</Text>
                    <Text style={[qz.resultCellVal, { color: palette.tealTarjetas }]}>{correctCount}/{questions.length}</Text>
                    <Text style={qz.resultCellLbl}>aciertos</Text>
                  </View>
                  <View style={qz.resultCell}>
                    <Text style={{ fontSize: 22 }}>⚡</Text>
                    <Text style={[qz.resultCellVal, { color: BRAND }]}>+{xpEarned}</Text>
                    <Text style={qz.resultCellLbl}>XP</Text>
                  </View>
                </View>

                {/* Secondary contextual line */}
                <Text style={[qz.resultCellLbl, { textAlign: 'center', marginTop: 6, lineHeight: 18 }]}>
                  {`Precisión: ${acc}% · Mejor racha de aciertos: ${maxStreak}`}
                </Text>
              </ScrollView>
            </Animated.View>

            <View style={[g.bottom, { paddingBottom: insets.bottom + 12 }]}>
              <Pressable onPress={() => completeMode('quiz')} style={{ width: '100%' }}>
                <View style={[g.ctaBtn, { backgroundColor: BRAND }]}>
                  <Text style={g.ctaText}>Continuar a Tarjetas →</Text>
                </View>
              </Pressable>
            </View>
          </SafeAreaView>
        );
      }

      /* Original result screen — active when UNIFIED_QUIZ_COMPLETION = false */
      return (
        <SafeAreaView style={g.page} edges={['top']}>
          <StatusBar barStyle="dark-content" backgroundColor={BG} />
          <View style={g.topBar}>
            <Pressable onPress={() => setPhase('mode-select')} style={g.iconBtn} hitSlop={10}>
              <ChevronLeft size={18} color={semantic.textPrimary} strokeWidth={2.5} />
            </Pressable>
            <Text style={g.screenTitle}>🧠 Resultado</Text>
            <Pressable onPress={() => setPhase('mode-select')} style={g.iconBtn} hitSlop={10}>
              <X size={16} color={semantic.textPrimary} strokeWidth={2.5} />
            </Pressable>
          </View>
          {UNIFIED_PROGRESS_BAR && (
            <UnifiedProgressBar progress={globalPct} currentMode="quiz" />
          )}
          <Animated.View style={[{ flex: 1 }, resultEntryStyle]}>
            <ScrollView contentContainerStyle={[qz.resultScroll, { paddingBottom: insets.bottom + 24 }]}>
              <Text style={qz.resultEmoji}>{acc >= 80 ? '🏆' : acc >= 50 ? '🎯' : '💪'}</Text>
              <Text style={qz.resultTitle}>{acc >= 80 ? '¡Increíble!' : acc >= 50 ? '¡Buen trabajo!' : 'Sigue practicando'}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginBottom: 20 }}>
                <AnimatedCounter to={correctCount} delay={0} style={qz.resultScore} />
                <Text style={[qz.resultScore, { color: semantic.textTertiary, fontSize: 32, fontWeight: '600' }]}>/{questions.length}</Text>
              </View>
              <View style={qz.resultGrid}>
                {([
                  { e: '⚡', to: xpEarned, prefix: '+', suffix: '',  l: 'XP ganados', color: BRAND,        delay: 80  },
                  { e: '🔥', to: maxStreak, prefix: '',  suffix: '×', l: 'Racha máx.', color: palette.rojoError,  delay: 240 },
                  { e: '🎯', to: acc,       prefix: '',  suffix: '%', l: 'Precisión',  color: palette.tealTarjetas,  delay: 400 },
                ] as const).map(({ e, to, prefix, suffix, l, color, delay }) => (
                  <View key={l} style={qz.resultCell}>
                    <Text style={{ fontSize: 24 }}>{e}</Text>
                    <AnimatedCounter to={to} delay={delay} prefix={prefix} suffix={suffix} style={[qz.resultCellVal, { color }]} />
                    <Text style={qz.resultCellLbl}>{l}</Text>
                  </View>
                ))}
              </View>
              <Pressable onPress={resetQuiz} style={qz.retryBtn}>
                <RefreshCw size={16} color={BRAND} strokeWidth={2.5} />
                <Text style={qz.retryText}>Intentar de nuevo</Text>
              </Pressable>
              <Pressable onPress={() => completeMode('quiz')} style={{ width: '100%' }}>
                <View style={[g.ctaBtn, { backgroundColor: BRAND }]}>
                  <Text style={g.ctaText}>🎉 Continuar</Text>
                </View>
              </Pressable>
            </ScrollView>
          </Animated.View>
        </SafeAreaView>
      );
    }

    const isLastQuestion = quizIdx >= questions.length - 1;
    const stateB = FIXED_QUIZ_FEEDBACK && quizStep === 'wrong' && currentAttempt < MAX_ATTEMPTS_PER_QUESTION;
    const stateC = FIXED_QUIZ_FEEDBACK && quizStep === 'wrong' && !stateB;

    return (
      <View style={{ flex: 1, backgroundColor: BG }}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />

        {/* Floating XP badge (FASE 2) */}
        <Animated.View style={[{ position: 'absolute', zIndex: 100, alignSelf: 'center', top: SCREEN_H * 0.38 }, xpFloatStyle]} pointerEvents="none">
          <View style={qz.xpFloat}><Text style={qz.xpFloatText}>⚡ +{XP_PER_CORRECT} XP</Text></View>
        </Animated.View>

        {/* Streak badge (FASE 3) */}
        <Animated.View style={[{ position: 'absolute', zIndex: 100, alignSelf: 'center', top: SCREEN_H * 0.22 }, streakBadgeStyle]} pointerEvents="none">
          <View style={qz.streakBadge}><Text style={qz.streakBadgeText}>{streakMsg}</Text></View>
        </Animated.View>

        {/* Combo / micro reward badge (FASE 4) */}
        <Animated.View style={[{ position: 'absolute', zIndex: 100, alignSelf: 'center', top: SCREEN_H * 0.44 }, microRewardStyle]} pointerEvents="none">
          <View style={qz.microBadge}><Text style={qz.microBadgeText}>{microMsg}</Text></View>
        </Animated.View>

        {/* Nemi character (FASE 9) */}
        <Animated.View style={[{ position: 'absolute', zIndex: 99, right: 16, bottom: insets.bottom + 130 }, nemiStyle]} pointerEvents="none">
          <View style={qz.nemiWidget}>
            <Text style={qz.nemiLabel}>🧠 Nemi</Text>
            <Text style={qz.nemiText}>{nemiMsg}</Text>
          </View>
        </Animated.View>

        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          {/* Header — matches mission / flashcards pattern */}
          <View style={g.topBar}>
            <Pressable onPress={() => setPhase('mode-select')} style={g.iconBtn} hitSlop={10}>
              <ChevronLeft size={18} color={semantic.textPrimary} strokeWidth={2.5} />
            </Pressable>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={g.screenTitle}>🧠 Quiz</Text>
              {!UNIFIED_PROGRESS_BAR && (
                <Text style={sum.slideCounter}>{quizIdx + 1} / {questions.length}</Text>
              )}
            </View>
            <Pressable onPress={() => setPhase('mode-select')} style={g.iconBtn} hitSlop={10}>
              <X size={16} color={semantic.textPrimary} strokeWidth={2.5} />
            </Pressable>
          </View>

          {/* Progress bar — unified or per-mode */}
          {UNIFIED_PROGRESS_BAR ? (
            <UnifiedProgressBar
              progress={globalPct}
              currentMode="quiz"
              modeLabel={unifiedModeLabel}
            />
          ) : (
            <View style={{ paddingHorizontal: 14, marginBottom: 4 }}>
              <View style={qz.progressTrack}>
                <Animated.View style={[qz.progressFill, progressFillStyle]} />
              </View>
            </View>
          )}

          <ScrollView contentContainerStyle={[qz.scroll, { paddingBottom: 8 }]} showsVerticalScrollIndicator={false}>
            {/* Question card + options wrapped in TikTok transition (FASE 8) */}
            <Animated.View style={questionTransStyle}>
              <View style={qz.questionCard}>
                <View style={qz.questionMeta}>
                  <Text style={qz.questionChip}>🧠 Pregunta {quizIdx + 1}</Text>
                  {isLastQuestion && <Text style={qz.lastQChip}>🏁 Última</Text>}
                </View>
                <Text style={qz.questionText}>{question?.text}</Text>
              </View>

              {/* Options (FASE 5) */}
              <View style={{ gap: 8, marginBottom: 10 }}>
                {question?.options.map((opt, i) => {
                  const letter    = LETTERS[i] ?? String(i + 1);
                  const isCorrect = opt.id === question.correctOptionId;
                  const isWrong   = quizStep !== 'answering' && selected === opt.id && !isCorrect;
                  const showBrand = FIXED_QUIZ_FEEDBACK
                    ? quizStep === 'correct' || (stateC && isCorrect)
                    : quizStep !== 'answering' && isCorrect;
                  const dimmed = FIXED_QUIZ_FEEDBACK
                    ? !stateB && quizStep !== 'answering' && !isCorrect && !isWrong
                    : quizStep !== 'answering' && !isCorrect && !isWrong;
                  const baseAnim  = i < optAnimStyles.length ? optAnimStyles[i] : undefined;
                  return (
                    <Animated.View
                      key={opt.id}
                      style={
                        showBrand ? [baseAnim, correctGlowStyle] :
                        baseAnim
                      }
                    >
                      <Pressable
                        onPress={() => {
                          if (quizStep !== 'answering') return;
                          const sv = optScaleArr[i];
                          if (sv) {
                            sv.value = withSequence(
                              withTiming(0.97, { duration: 75 }),
                              withSpring(1.02, { damping: 12, stiffness: 420 }),
                              withSpring(1,    { damping: 18, stiffness: 300 }),
                            );
                          }
                          handleOption(opt.id);
                        }}
                        disabled={quizStep !== 'answering'}
                        style={[
                          qz.option,
                          showBrand && qz.optCorrect,
                          isWrong   && qz.optWrong,
                          { opacity: dimmed ? 0.32 : 1 },
                        ]}
                      >
                        <View style={[qz.optLetter, showBrand && qz.optLetterCorrect, isWrong && qz.optLetterRed]}>
                          {showBrand ? <Check size={13} color={palette.blanco} strokeWidth={3} /> :
                           isWrong   ? <X    size={13} color={palette.blanco} strokeWidth={3} /> :
                           <Text style={[qz.optLetterText, selected === opt.id && quizStep === 'answering' && { color: BRAND, fontWeight: '900' }]}>{letter}</Text>}
                        </View>
                        <Text style={[
                          qz.optText,
                          showBrand && { color: BRAND, fontWeight: '700' },
                          isWrong   && { color: semantic.textTertiary },
                        ]}>
                          {opt.text}
                        </Text>
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </View>
            </Animated.View>

            {/* Feedback strip (original — active when FIXED_QUIZ_FEEDBACK = false) */}
            {!FIXED_QUIZ_FEEDBACK && quizStep !== 'answering' && question?.explanation ? (
              <Animated.View style={[qz.feedback, quizStep === 'correct' ? qz.feedbackOk : qz.feedbackFail, feedbackStyle]}>
                <View style={qz.feedbackHeader}>
                  <Text style={qz.feedbackTitle}>
                    {quizStep === 'correct' ? '🎯 Correcto' : '💪 Casi'}
                  </Text>
                  {quizStep === 'correct' && (
                    <View style={qz.feedbackXP}>
                      <Text style={qz.feedbackXPText}>+{XP_PER_CORRECT} XP</Text>
                    </View>
                  )}
                </View>
                <Text style={qz.feedbackText}>{question.explanation}</Text>
              </Animated.View>
            ) : null}

            {/* Feedback strip — fixed 3-state (A=correct, B=retry, C=wrong final) */}
            {FIXED_QUIZ_FEEDBACK && quizStep !== 'answering' ? (
              <Animated.View style={[qz.feedback, quizStep === 'correct' ? qz.feedbackOk : qz.feedbackFail, feedbackStyle]}>
                <View style={qz.feedbackHeader}>
                  <Text style={qz.feedbackTitle}>
                    {quizStep === 'correct' ? '🎯 ¡Correcto!' : '💪 Casi'}
                  </Text>
                  {quizStep === 'correct' && (
                    <View style={qz.feedbackXP}>
                      <Text style={qz.feedbackXPText}>+{XP_PER_CORRECT} XP</Text>
                    </View>
                  )}
                </View>
                {/* State B: retry nudge — no explanation */}
                {stateB && <Text style={qz.feedbackText}>Vuelve a intentarlo.</Text>}
                {/* State A/C: show explanation */}
                {!stateB && !!question?.explanation && (
                  <Text style={qz.feedbackText}>{question.explanation}</Text>
                )}
                {/* State C: reveal correct answer */}
                {stateC && (
                  <Text style={[qz.feedbackText, { fontWeight: '700', marginTop: 2 }]}>
                    {'La respuesta correcta era: '}
                    {question.options.find(o => o.id === question.correctOptionId)?.text ?? ''}
                  </Text>
                )}
              </Animated.View>
            ) : null}
          </ScrollView>

          {/* CTA — always BRAND/NEON, dynamic text (FASE 10) */}
          <View style={[g.bottom, { paddingBottom: insets.bottom + 12 }]}>
            {quizStep !== 'answering' ? (
              !FIXED_QUIZ_FEEDBACK ? (
                /* Original behavior — kept while FIXED_QUIZ_FEEDBACK = false */
                <Pressable onPress={handleQuizNext} style={{ width: '100%' }}>
                  <View style={[g.ctaBtn, { backgroundColor: BRAND }]}>
                    <Text style={g.ctaText}>
                      {isLastQuestion
                        ? '🏆 Ver resultados'
                        : quizStep === 'correct'
                          ? '🚀 Continuar'
                          : '🔁 Intentar otra vez'}
                    </Text>
                  </View>
                </Pressable>
              ) : stateB ? (
                /* State B — retry same question */
                <Pressable onPress={handleRetry} style={{ width: '100%' }}>
                  <View style={[g.ctaBtn, { backgroundColor: BRAND }]}>
                    <Text style={g.ctaText}>🔁 Intentar otra vez</Text>
                  </View>
                </Pressable>
              ) : (
                /* State A (correct) or C (wrong final) — advance */
                <Pressable onPress={handleQuizNext} style={{ width: '100%' }}>
                  <View style={[g.ctaBtn, { backgroundColor: BRAND }]}>
                    <Text style={g.ctaText}>
                      {isLastQuestion
                        ? '🏆 Ver resultados'
                        : quizStep === 'correct' ? '🚀 Continuar' : '➡️ Continuar'}
                    </Text>
                  </View>
                </Pressable>
              )
            ) : (
              <View style={g.ctaBtnOff}>
                <Text style={g.ctaTextOff}>Selecciona una respuesta</Text>
              </View>
            )}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // FLASHCARDS — Screen 5
  // ══════════════════════════════════════════════════════════════
  if (phase === 'flashcards') {
    if (cardsDone) {
      if (MODE_COMPLETION_REDESIGN) {
        const tiempoMs    = flashcardsStartRef.current ? Date.now() - flashcardsStartRef.current : 0;
        const tiempoStr   = formatMissionTime(tiempoMs);
        const totalCards  = flashcards.length;
        const dominaste   = cardsKnew;
        const dudaste     = cardsDubious;
        const noSabias    = cardsUnknown;

        const newSetAfterTarjetas    = new Set([...completedModes, 'flashcards']);
        const remainingAfterTarjetas = LOCAL_MODE_ORDER.filter(m => !newSetAfterTarjetas.has(m));
        const nextLocalTarjetas      = remainingAfterTarjetas[0] ?? null;
        const continueLabelTarjetas  = newSetAfterTarjetas.size >= 3
          ? '¡Ver sesión completa! →'
          : nextLocalTarjetas
            ? `Continuar con ${LOCAL_MODE_LABEL[nextLocalTarjetas]} →`
            : 'Continuar →';

        const onContinueTarjetas = () => {
          const newSet = new Set([...completedModes, 'flashcards']);
          setCompleted(newSet);
          setCelebSrc('flashcards');
          if (DAILY_SESSION_LOGIC) markModeComplete(LOCAL_MODE_TO_DAILY['flashcards']);
          saveSessionProgress(newSet);
          if (newSet.size >= 3) {
            router.push('/session-complete' as any);
          } else {
            setPhase(nextLocalTarjetas ? LOCAL_MODE_TO_PHASE[nextLocalTarjetas] : 'mode-select');
          }
        };

        return (
          <ModeCompletionScreen
            mode="tarjetas"
            iconNode={<Layers size={44} color="#059669" strokeWidth={1.5} />}
            screenTitle="🗂️ Tarjetas"
            title="Tarjetas completas"
            tiles={[
              { label: 'enfocado',  value: tiempoStr },
              { label: 'tarjetas',  value: String(totalCards) },
              { label: 'XP',        value: `+${xpEarned}`, valueColor: BRAND },
            ]}
            contextualLine={totalCards > 0 ? `${dominaste} dominaste · ${dudaste} dudaste · ${noSabias} no sabías` : ''}
            continueLabel={continueLabelTarjetas}
            onContinue={onContinueTarjetas}
            onBack={() => setPhase('mode-select')}
            sessionCompletedCount={newSetAfterTarjetas.size}
          />
        );
      }

      /* Original tarjetas done screen — active when MODE_COMPLETION_REDESIGN = false */
      return (
        <SafeAreaView style={g.page} edges={['top']}>
          <StatusBar barStyle="dark-content" backgroundColor={BG} />
          <View style={g.topBar}>
            <Pressable onPress={() => setPhase('mode-select')} style={g.iconBtn} hitSlop={10}>
              <X size={16} color={semantic.textPrimary} strokeWidth={2.5} />
            </Pressable>
            <Text style={g.screenTitle}>Tarjetas completadas</Text>
            <View style={{ width: 36 }} />
          </View>
          {UNIFIED_PROGRESS_BAR && (
            <UnifiedProgressBar progress={globalPct} currentMode="tarjetas" />
          )}
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
            <Text style={{ fontSize: 72, marginBottom: 16 }}>🃏</Text>
            <Text style={{ fontSize: 24, fontWeight: '900', color: semantic.textPrimary, textAlign: 'center', marginBottom: 8 }}>¡Tarjetas completadas!</Text>
            <Text style={{ fontSize: 14, color: semantic.textTertiary, textAlign: 'center', marginBottom: 32 }}>{flashcards.length} tarjetas repasadas</Text>
            <Pressable onPress={() => completeMode('flashcards')} style={{ width: '100%' }}>
              <View style={[g.ctaBtn, { backgroundColor: BRAND }]}>
                <Text style={g.ctaText}>🎉 Continuar</Text>
              </View>
            </Pressable>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <View style={{ flex: 1, backgroundColor: BG }}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={g.topBar}>
            <Pressable onPress={() => setPhase('mode-select')} style={g.iconBtn} hitSlop={10}>
              <ChevronLeft size={18} color={semantic.textPrimary} strokeWidth={2.5} />
            </Pressable>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={g.screenTitle}>🗂️ Tarjetas</Text>
              {!UNIFIED_PROGRESS_BAR && (
                <Text style={sum.slideCounter}>{cardIdx + 1} / {flashcards.length}</Text>
              )}
            </View>
            <Pressable onPress={() => setPhase('mode-select')} style={g.iconBtn} hitSlop={10}>
              <X size={16} color={semantic.textPrimary} strokeWidth={2.5} />
            </Pressable>
          </View>

          {/* Progress bar — unified or per-mode */}
          {UNIFIED_PROGRESS_BAR ? (
            <UnifiedProgressBar
              progress={globalPct}
              currentMode="tarjetas"
              modeLabel={unifiedModeLabel}
            />
          ) : (
            <View style={{ paddingHorizontal: 14, marginBottom: 4 }}>
              <View style={qz.progressTrack}>
                <Animated.View style={[qz.progressFill, progressFillStyle]} />
              </View>
            </View>
          )}

          {/* Card takes all remaining space */}
          <FlipCard
            key={cardIdx}
            front={card?.front ?? ''}
            back={card?.back ?? ''}
            onFlip={(f) => setCardFlipped(f)}
          />

          {cardFlipped ? (
            <View style={[fcs.srsRow, { paddingBottom: insets.bottom + 12 }]}>
              {[
                { label: '❌\nNo lo sabía', response: 'unknown' as const, colors: ['#DC2626', '#B91C1C'] as [string,string] },
                { label: '🤔\nLo dudé',     response: 'doubt'   as const, colors: [palette.ambar, '#D97706'] as [string,string] },
                { label: '✅\nLo sabía',    response: 'knew'    as const, colors: [BRAND, NEON] as [string,string] },
              ].map(({ label, response, colors }) => (
                <Pressable key={label} onPress={() => handleCardNext(response)} style={{ flex: 1 }}>
                  <View style={[fcs.srsBtn, { backgroundColor: colors[0] }]}>
                    <Text style={fcs.srsBtnText}>{label}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={{ height: 72 + insets.bottom }} />
          )}
        </SafeAreaView>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // CELEBRATION — Screen 6
  // ══════════════════════════════════════════════════════════════
  if (phase === 'celebration') {
    const modeLabel = { summary: 'Misión', quiz: 'Quiz', flashcards: 'Tarjetas' }[celebSrc];
    const allDone   = completedModes.size >= 3;
    return (
      <View style={{ flex: 1, backgroundColor: BG }}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {CONFETTI_DATA.map((item, i) => <ConfettiPiece key={i} item={item} />)}
        </View>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
            <Text style={{ fontSize: SM ? 72 : 88, marginBottom: 8 }}>🎉</Text>
            <Text style={{ fontSize: SM ? 24 : 28, fontWeight: '900', color: semantic.textPrimary, textAlign: 'center', marginBottom: 8 }}>
              ¡{modeLabel} completado!
            </Text>
            <Text style={{ fontSize: 14, color: semantic.textTertiary, textAlign: 'center', marginBottom: 32, lineHeight: 22 }}>
              Sigue así, lo estás haciendo increíble 🔥
            </Text>
            <View style={cel.row}>
              {[
                { e: '⚡', v: `+${xpEarned}`, l: 'XP' },
                { e: '🔥', v: `${streak}`, l: 'Racha' },
                { e: '🏅', v: `${completedModes.size}/3`, l: 'Modos' },
              ].map(({ e, v, l }) => (
                <View key={l} style={cel.cell}>
                  <Text style={{ fontSize: 24 }}>{e}</Text>
                  <Text style={cel.val}>{v}</Text>
                  <Text style={cel.lbl}>{l}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={[g.bottom, { paddingBottom: insets.bottom + 12, gap: 10 }]}>
            <Pressable onPress={() => allDone ? setPhase('complete') : setPhase('mode-select')} style={{ width: '100%' }}>
              <View style={[g.ctaBtn, { backgroundColor: BRAND }]}>
                <Text style={g.ctaText}>{allDone ? '🏆 Ver resultados finales' : 'Continuar aprendiendo →'}</Text>
              </View>
            </Pressable>
            {!allDone && (
              <Pressable onPress={() => setPhase('complete')} style={g.secBtn}>
                <Text style={g.secText}>Finalizar sesión</Text>
              </Pressable>
            )}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // COMPLETE — Screen 7 (Session end)
  // ══════════════════════════════════════════════════════════════
  if (phase === 'complete') {
    const totalXp  = xpEarned + (completedModes.has('summary') ? XP_PER_SUMMARY * summarySlides.length : 0)
                               + (completedModes.has('flashcards') ? XP_PER_CARD * flashcards.length : 0);
    const achievements = [
      completedModes.has('summary')    && { e: '📚', title: 'Maestro del resumen',   desc: `Leíste ${summarySlides.length} conceptos` },
      maxStreak >= 3                   && { e: '🔥', title: `Racha de ${maxStreak}`, desc: 'Respondiste en cadena' },
      completedModes.size >= 3         && { e: '🎖️', title: 'Aprendiz constante',    desc: 'Completaste los 3 modos' },
      finalAccuracy >= 80              && { e: '🎯', title: 'Precisión élite',        desc: `${finalAccuracy}% de aciertos` },
    ].filter(Boolean).slice(0, 3) as { e: string; title: string; desc: string }[];

    return (
      <View style={{ flex: 1, backgroundColor: BG }}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {CONFETTI_DATA.map((item, i) => <ConfettiPiece key={i} item={item} />)}
        </View>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <ScrollView contentContainerStyle={[comp.scroll, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
            <Text style={comp.trophy}>🏆</Text>
            <Text style={comp.title}>¡Sesión completada!</Text>
            <Text style={comp.subtitle}>{session.topic}</Text>

            <View style={comp.grid}>
              {[
                { e: '⚡', v: `+${totalXp}`, l: 'XP Ganados' },
                { e: '🔥', v: `${maxStreak}`, l: 'Racha máx.' },
                { e: '🎯', v: `${finalAccuracy}%`, l: 'Precisión' },
                { e: '⏱️', v: `${session.estimatedDuration}m`, l: 'Duración' },
              ].map(({ e, v, l }) => (
                <View key={l} style={comp.cell}>
                  <Text style={{ fontSize: 28 }}>{e}</Text>
                  <Text style={comp.cellVal}>{v}</Text>
                  <Text style={comp.cellLbl}>{l}</Text>
                </View>
              ))}
            </View>

            {/* Level bar */}
            <View style={comp.levelCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: semantic.textPrimary }}>Nivel 4</Text>
                <Text style={{ fontSize: 12, color: semantic.textTertiary }}>68% al siguiente</Text>
              </View>
              <View style={{ height: 10, borderRadius: 99, backgroundColor: palette.crema, overflow: 'hidden' }}>
                <View style={{ width: '68%', height: '100%', borderRadius: 99, backgroundColor: BRAND }} />
              </View>
            </View>

            {achievements.length > 0 && (
              <View style={comp.achCard}>
                <Text style={comp.achTitle}>🎖️ Logros desbloqueados</Text>
                {achievements.map((a, i) => (
                  <View key={i} style={comp.achRow}>
                    <Text style={{ fontSize: 32 }}>{a.e}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={comp.achName}>{a.title}</Text>
                      <Text style={comp.achDesc}>{a.desc}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          <View style={[g.bottom, { paddingBottom: insets.bottom + 12, gap: 10 }]}>
            <Pressable onPress={() => router.push('/home' as any)} style={{ width: '100%' }}>
              <View style={[g.ctaBtn, { backgroundColor: BRAND }]}>
                <Text style={g.ctaText}>🚀 Seguir aprendiendo</Text>
              </View>
            </Pressable>
            <Pressable onPress={() => router.back()} style={g.secBtn}>
              <Text style={g.secText}>Volver al inicio</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return null;
}

// ── Shared styles ──────────────────────────────────────────────────
const g = StyleSheet.create({
  page:    { flex: 1, backgroundColor: BG },
  scroll:  { paddingHorizontal: 20, paddingTop: 8 },
  topBar:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  iconBtn: { width: 36, height: 36, borderRadius: 11, backgroundColor: palette.blanco, borderWidth: 1, borderColor: palette.bordeClaro, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '800', color: semantic.textPrimary, letterSpacing: -0.2 },
  xpPill:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: semantic.textPrimary, borderRadius: 100, paddingVertical: 5, paddingHorizontal: 10 },
  xpText:  { color: LIME, fontWeight: '800', fontSize: 12 },
  counterPill: { backgroundColor: palette.crema, borderRadius: 100, paddingVertical: 4, paddingHorizontal: 10 },
  counterText: { fontSize: 12, fontWeight: '800', color: semantic.textPrimary },
  bottom:  { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.bordeClaro, backgroundColor: BG },
  ctaBtn:  { paddingVertical: 20, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 16, fontWeight: '800', color: palette.blanco },
  ctaBtnOff:  { paddingVertical: 17, borderRadius: 18, alignItems: 'center', backgroundColor: palette.crema },
  ctaTextOff: { fontSize: 16, fontWeight: '700', color: semantic.textTertiary },
  secBtn:  { paddingVertical: 13, borderRadius: 18, alignItems: 'center', backgroundColor: palette.crema },
  secText: { fontSize: 14, fontWeight: '700', color: semantic.textPrimary },
});

// ── Lobby ──────────────────────────────────────────────────────────
const lob = StyleSheet.create({
  progressPill:     { backgroundColor: palette.moradoBg, borderRadius: 100, paddingVertical: 5, paddingHorizontal: 12 },
  progressPillText: { fontSize: SM ? 11 : 12, fontWeight: '700', color: BRAND },

  titleBlock: { marginBottom: 16 },
  titleLabel: { fontSize: SM ? 22 : 26, fontWeight: '900', color: semantic.textPrimary, letterSpacing: -0.5, marginBottom: 4 },
  titleTopic: { fontSize: SM ? 13 : 14, color: semantic.textSecondary, lineHeight: 21 },

  metricsCard: { backgroundColor: palette.blanco, borderRadius: 20, borderWidth: 1, borderColor: palette.bordeClaro, paddingVertical: 14, marginBottom: 14 },
  metricsRow:  { flexDirection: 'row', alignItems: 'center' },
  metricItem:  { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 6 },
  metricEmoji: { fontSize: 20, marginBottom: 2 },
  metricVal:   { fontSize: SM ? 16 : 18, fontWeight: '900', color: semantic.textPrimary, letterSpacing: -0.4 },
  metricLbl:   { fontSize: 10, fontWeight: '600', color: semantic.textTertiary, textTransform: 'uppercase', letterSpacing: 0.3 },
  metricDiv:   { width: 1, height: 44, backgroundColor: palette.bordeClaro },
  metricDivH:  { height: 1, backgroundColor: palette.bordeClaro, marginVertical: 4 },

  missionCard:     { backgroundColor: palette.blanco, borderRadius: 20, borderWidth: 1, borderColor: palette.bordeClaro, padding: 16 },
  missionHead:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  missionTitle:    { fontSize: 14, fontWeight: '800', color: semantic.textPrimary },
  missionCounter:  { fontSize: 12, fontWeight: '700', color: semantic.textTertiary },
  missionRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
  missionCheck:    { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: palette.bordeMedio, alignItems: 'center', justifyContent: 'center' },
  missionCheckDone:{ backgroundColor: BRAND, borderColor: BRAND },
  missionLabel:    { fontSize: 14, color: semantic.textPrimary, fontWeight: '600', flex: 1 },
  missionLabelDone:{ color: semantic.textTertiary, textDecorationLine: 'line-through' },
});

// ── Mode select ────────────────────────────────────────────────────
const mds = StyleSheet.create({
  hero:      { marginTop: 4, marginBottom: 8 },
  heroTitle: { fontSize: SM ? 22 : 26, fontWeight: '900', color: semantic.textPrimary, letterSpacing: -0.5, marginBottom: 3 },
  heroSub:   { fontSize: 14, color: semantic.textSecondary, fontWeight: '500' },

  missionCard:    { backgroundColor: BRAND, borderRadius: 20, padding: SM ? 16 : 20 },
  missionEmoji:   { fontSize: SM ? 34 : 40, marginBottom: 4 },
  missionXpBadge: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 100, paddingVertical: 3, paddingHorizontal: 10 },
  missionXpText:  { color: palette.blanco, fontSize: 12, fontWeight: '800' },
  missionTitle:   { fontSize: SM ? 20 : 24, fontWeight: '900', color: palette.blanco, marginBottom: 3, marginTop: 4 },
  missionDesc:    { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 12 },
  missionDetail:  { fontSize: 12, color: 'rgba(255,255,255,0.65)' },

  secondaryCard:    { backgroundColor: palette.blanco, borderRadius: 18, borderWidth: 1, borderColor: palette.bordeClaro, padding: SM ? 12 : 14, minHeight: SM ? 160 : 180 },
  secondaryEmoji:   { fontSize: SM ? 26 : 30, marginBottom: 6 },
  secondaryXpBadge: { borderRadius: 100, paddingVertical: 3, paddingHorizontal: 8, alignSelf: 'flex-start', marginBottom: 6 },
  secondaryXpText:  { fontSize: 11, fontWeight: '800' },
  secondaryTitle:   { fontSize: SM ? 16 : 18, fontWeight: '900', marginBottom: 3 },
  secondaryDesc:    { fontSize: 11, color: semantic.textSecondary, lineHeight: 16, marginBottom: 4 },
  secondaryDetail:  { fontSize: 11, color: semantic.textTertiary, marginBottom: 8 },

  cardTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  doneBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 100, paddingVertical: 2, paddingHorizontal: 8, marginBottom: 8 },
  doneBadgeText:{ fontSize: 10, fontWeight: '800' },
  arrowLight:  { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  arrowAccent: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' },

  rewardCard:  { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(196,248,82,0.12)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(196,248,82,0.35)', paddingVertical: 12, paddingHorizontal: 14 },
  rewardStar:  { fontSize: 22 },
  rewardTitle: { fontSize: 14, fontWeight: '800', color: semantic.textPrimary, marginBottom: 2 },
  rewardSub:   { fontSize: 12, color: semantic.textSecondary, lineHeight: 17 },
});

// ── Summary ────────────────────────────────────────────────────────
const sum = StyleSheet.create({
  // Story progress bar — thick single bar
  storyBar:     { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 8, alignItems: 'center', gap: 10 },
  progressTrack:{ flex: 1, height: 8, borderRadius: 4, backgroundColor: palette.bordeClaro, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: BRAND },
  slideCounter: { fontSize: 12, color: semantic.textSecondary, fontWeight: '700', minWidth: 40, textAlign: 'right' },
  progressBarOuter: { width: 72, height: 3, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.07)', overflow: 'hidden', marginTop: 3 },
  progressBarFill:  { height: '100%', borderRadius: 2, backgroundColor: BRAND },
  slideArea:    { flex: 1, paddingHorizontal: 20, justifyContent: 'center' },

  // Summary micro-reward overlay
  summaryRewardOverlay: { position: 'absolute', alignSelf: 'center', top: '30%', zIndex: 50 },
  summaryRewardBadge:   { backgroundColor: BRAND, borderRadius: 100, paddingVertical: 9, paddingHorizontal: 20 },
  summaryRewardBadgeTxt:{ fontSize: 15, fontWeight: '800', color: palette.blanco },

  // Concept card
  introCard:    { backgroundColor: palette.blanco, borderRadius: 28, padding: SM ? 18 : 22 },
  slideEmoji:   { fontSize: SM ? 38 : 44, marginBottom: 10 },
  introHeading: { fontSize: SM ? 20 : 23, fontWeight: '900', color: semantic.textPrimary, letterSpacing: -0.4, lineHeight: SM ? 26 : 30, marginBottom: 8 },
  introDef:     { fontSize: SM ? 14 : 15, color: semantic.textPrimary, lineHeight: SM ? 21 : 23, fontWeight: '500', marginBottom: 2 },

  // Accent card (key_fact, important, remember, curiosity)
  kpCard:       { borderRadius: 28, borderLeftWidth: 4, padding: SM ? 16 : 20 },
  kpEmoji:      { fontSize: SM ? 32 : 36, marginBottom: 6 },
  kpLabel:      { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 6, textTransform: 'uppercase' },
  kpTitle:      { fontSize: SM ? 16 : 18, fontWeight: '900', color: semantic.textPrimary, marginBottom: 6, letterSpacing: -0.3 },
  kpDef:        { fontSize: SM ? 13 : 14, color: semantic.textPrimary, lineHeight: SM ? 20 : 22, fontWeight: '500' },

  // Shared example block
  exampleBox:   { marginTop: SM ? 10 : 14, paddingTop: SM ? 10 : 12, borderTopWidth: 1, borderTopColor: palette.bordeClaro },
  exampleLabel: { fontSize: 10, fontWeight: '800', color: semantic.textTertiary, letterSpacing: 0.6, marginBottom: 4, textTransform: 'uppercase' },
  exampleText:  { fontSize: SM ? 13 : 14, color: semantic.textPrimary, lineHeight: SM ? 20 : 22, fontWeight: '600' },

  // Wow fact card — lavender WOW moment
  wowCard:      { backgroundColor: 'rgba(91,61,245,0.07)', borderRadius: 28, padding: SM ? 24 : 30, alignItems: 'center' },
  wowEmoji:     { fontSize: SM ? 56 : 68, marginBottom: 12 },
  wowLabel:     { fontSize: 11, fontWeight: '900', color: BRAND, letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase' },
  wowHook:      { fontSize: SM ? 17 : 20, fontWeight: '900', color: semantic.textPrimary, textAlign: 'center', letterSpacing: -0.4, lineHeight: SM ? 24 : 28, marginBottom: 12 },
  wowText:      { fontSize: SM ? 15 : 17, fontWeight: '600', color: semantic.textPrimary, textAlign: 'center', lineHeight: SM ? 23 : 26, letterSpacing: -0.2 },
  wowDataBox:   { backgroundColor: palette.blanco, borderRadius: 16, padding: SM ? 14 : 16, marginTop: 4, alignSelf: 'stretch' },
  wowContext:   { fontSize: SM ? 11 : 12, color: semantic.textSecondary, textAlign: 'center', fontWeight: '600', marginTop: 12, lineHeight: SM ? 17 : 19 },

  // Quiz card
  quizCard:          { backgroundColor: palette.blanco, borderRadius: 28, padding: SM ? 16 : 20 },
  quizLabel:         { fontSize: 10, fontWeight: '900', color: BRAND, letterSpacing: 1.5, marginBottom: 10, textTransform: 'uppercase' },
  quizQuestion:      { fontSize: SM ? 16 : 18, fontWeight: '800', color: semantic.textPrimary, lineHeight: SM ? 24 : 27, letterSpacing: -0.2 },
  quizOption:        { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 2, borderColor: palette.bordeClaro, backgroundColor: palette.blanco },
  quizOptCorrect:    { borderColor: BRAND, borderWidth: 2, backgroundColor: 'rgba(91,61,245,0.05)' },
  quizOptWrong:      { borderColor: palette.bordeMedio, backgroundColor: 'rgba(0,0,0,0.02)' },
  quizLetter:        { width: 28, height: 28, borderRadius: 8, backgroundColor: palette.crema, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  quizLetterGreen:   { backgroundColor: BRAND },
  quizLetterRed:     { backgroundColor: palette.bordeMedio },
  quizLetterText:    { fontSize: 12, fontWeight: '800', color: semantic.textPrimary },
  quizOptText:       { flex: 1, fontSize: SM ? 13 : 14, color: semantic.textPrimary, fontWeight: '600', lineHeight: 20 },
  quizFeedback:      { marginTop: 12, borderRadius: 14, padding: 12 },
  quizFeedbackOk:    { backgroundColor: 'rgba(91,61,245,0.07)', borderWidth: 1.5, borderColor: 'rgba(91,61,245,0.2)' },
  quizFeedbackErr:   { backgroundColor: 'rgba(0,0,0,0.03)', borderWidth: 1, borderColor: palette.bordeClaro },
  quizFeedbackHeader:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  quizFeedbackTitle: { fontSize: 13, fontWeight: '800', color: semantic.textPrimary },
  quizFeedbackXpChip:{ backgroundColor: BRAND, borderRadius: 100, paddingVertical: 2, paddingHorizontal: 8 },
  quizFeedbackXpText:{ fontSize: 11, fontWeight: '900', color: LIME },
  quizFeedbackText:  { fontSize: 12, color: semantic.textSecondary, lineHeight: 19 },

  // Prediction card
  predCard:     { backgroundColor: '#F0EDFF', borderRadius: 28, padding: SM ? 22 : 28, alignItems: 'center' },
  predIcon:     { fontSize: SM ? 52 : 64, marginBottom: 12 },
  predLabel:    { fontSize: 10, fontWeight: '900', color: BRAND, letterSpacing: 1.5, marginBottom: 14, textTransform: 'uppercase' },
  predPrompt:   { fontSize: SM ? 18 : 21, fontWeight: '900', color: semantic.textPrimary, textAlign: 'center', lineHeight: SM ? 26 : 30, letterSpacing: -0.4, marginBottom: 20 },
  predHintBox:  { backgroundColor: palette.blanco, borderRadius: 14, padding: SM ? 12 : 14, width: '100%' },
  predHintLabel:{ fontSize: 9, fontWeight: '800', color: semantic.textTertiary, letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' },
  predHint:     { fontSize: SM ? 13 : 14, color: semantic.textPrimary, lineHeight: SM ? 20 : 22, fontWeight: '500' },

  // Motivation card
  motivCard:    { backgroundColor: palette.blanco, borderRadius: 28, padding: SM ? 32 : 40, alignItems: 'center' },
  motivEmoji:   { fontSize: SM ? 64 : 80, marginBottom: 16 },
  motivMsg:     { fontSize: SM ? 22 : 26, fontWeight: '900', color: semantic.textPrimary, textAlign: 'center', letterSpacing: -0.5, marginBottom: 8 },
  motivSub:     { fontSize: SM ? 13 : 15, color: semantic.textTertiary, textAlign: 'center', lineHeight: SM ? 20 : 23, fontWeight: '500' },

  // Example / Scenario card
  scenarioCard:  { backgroundColor: palette.blanco, borderRadius: 28, overflow: 'hidden' },
  scenarioBand:  { backgroundColor: '#FFF7ED', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: SM ? 16 : 20, paddingVertical: SM ? 12 : 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,122,43,0.12)' },
  scenarioEmoji: { fontSize: SM ? 26 : 30 },
  scenarioLabel: { fontSize: 10, fontWeight: '900', color: '#FF7A2B', letterSpacing: 1.2, textTransform: 'uppercase' },
  scenarioBody:  { padding: SM ? 16 : 20 },
  scenarioTitle: { fontSize: SM ? 16 : 18, fontWeight: '900', color: semantic.textPrimary, marginBottom: 8, letterSpacing: -0.3 },
  scenarioDef:   { fontSize: SM ? 13 : 14, color: semantic.textPrimary, lineHeight: SM ? 20 : 22, fontWeight: '500', marginBottom: 10 },
  scenarioEx:    { fontSize: SM ? 13 : 14, color: semantic.textPrimary, lineHeight: SM ? 20 : 22, fontWeight: '700' },

  // Mission hero card — challenge screen format
  missionCard:      { borderRadius: 28, overflow: 'hidden' },
  missionGrad:      { borderRadius: 28, paddingVertical: SM ? 20 : 26, paddingHorizontal: 22, alignItems: 'center' },
  missionBadge:     { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 100, paddingVertical: 5, paddingHorizontal: 16, marginBottom: 14 },
  missionBadgeText: { color: palette.blanco, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  missionEmoji:     { fontSize: SM ? 44 : 54, marginBottom: 10 },
  missionTitle:     { fontSize: SM ? 20 : 24, fontWeight: '900', color: palette.blanco, textAlign: 'center', letterSpacing: -0.5, lineHeight: SM ? 26 : 32, marginBottom: 14 },
  missionSub:       { fontSize: SM ? 13 : 15, color: 'rgba(255,255,255,0.75)', textAlign: 'center', lineHeight: SM ? 20 : 24, fontWeight: '500' },
  // Mission cover — "Qué aprenderás" block
  missionLearnBlock:{ alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: 12, marginBottom: 14, gap: 6 },
  missionLearnLabel:{ fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.65)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  missionLearnRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  missionLearnBullet:{ fontSize: 13, color: LIME, fontWeight: '900', lineHeight: 20 },
  missionLearnText: { flex: 1, fontSize: SM ? 12 : 13, color: 'rgba(255,255,255,0.9)', fontWeight: '600', lineHeight: 20 },
  missionMetaRow:   { flexDirection: 'row', gap: 8 },
  missionMetaChip:  { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 100, paddingVertical: 5, paddingHorizontal: 12 },
  missionMetaChipText:{ fontSize: 12, color: palette.blanco, fontWeight: '700' },
  missionMetaChipXp:{ backgroundColor: LIME },

  // Main concept card
  mainCard:         { backgroundColor: palette.blanco, borderRadius: 28, overflow: 'hidden' },
  mainCardHeader:   { backgroundColor: 'rgba(91,61,245,0.07)', paddingHorizontal: SM ? 18 : 22, paddingVertical: SM ? 10 : 12 },
  mainCardLabel:    { fontSize: 10, fontWeight: '900', color: BRAND, letterSpacing: 1.5, textTransform: 'uppercase' },
  mainCardBody:     { paddingHorizontal: SM ? 18 : 22, paddingVertical: SM ? 14 : 18 },
  mainCardEmoji:    { fontSize: SM ? 36 : 44, marginBottom: 10 },
  mainCardTitle:    { fontSize: SM ? 20 : 24, fontWeight: '900', color: semantic.textPrimary, letterSpacing: -0.4, lineHeight: SM ? 26 : 30, marginBottom: 8 },
  mainCardDef:      { fontSize: SM ? 14 : 15, color: semantic.textPrimary, lineHeight: SM ? 21 : 24, fontWeight: '500' },
  workedExBox:      { backgroundColor: 'rgba(91,61,245,0.05)', borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(91,61,245,0.15)', padding: SM ? 14 : 16, marginBottom: SM ? 10 : 12 },
  workedExText:     { fontSize: SM ? 18 : 22, fontWeight: '800', color: BRAND, textAlign: 'center', letterSpacing: -0.3, lineHeight: SM ? 26 : 30 },
  mainCardExplain:  { fontSize: SM ? 13 : 14, color: semantic.textSecondary, lineHeight: SM ? 20 : 22, fontWeight: '500', fontStyle: 'italic' },
  conceptCard:      { marginTop: SM ? 14 : 16, backgroundColor: 'rgba(91,61,245,0.07)', borderRadius: 14, padding: SM ? 12 : 14, borderWidth: 1, borderColor: 'rgba(91,61,245,0.22)' },
  conceptCardLabel: { fontSize: 10, fontWeight: '800', color: BRAND, letterSpacing: 0.8, marginBottom: 6, textTransform: 'uppercase' },
  conceptCardText:  { fontSize: SM ? 16 : 18, fontWeight: '600', color: semantic.textPrimary, lineHeight: SM ? 24 : 28 },
  insightList:      { gap: SM ? 10 : 12, marginTop: 4 },
  insightRow:       { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 10 },
  insightRowMain:   { marginBottom: 4 },
  insightDot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(108,77,255,0.35)', marginTop: 9 },
  insightDotMain:   { width: 8, height: 8, borderRadius: 4, backgroundColor: BRAND, marginTop: 8 },
  insightLine:      { flex: 1, fontSize: SM ? 15 : 17, fontWeight: '500' as const, color: semantic.textSecondary, lineHeight: SM ? 22 : 26 },
  insightLineMain:  { fontSize: SM ? 20 : 23, fontWeight: '800' as const, color: semantic.textPrimary, lineHeight: SM ? 28 : 34, letterSpacing: -0.3 },
  insightFallback:  { fontSize: SM ? 18 : 20, fontWeight: '700' as const, color: semantic.textPrimary, lineHeight: SM ? 26 : 32 },
  comprehensionCtx: { backgroundColor: 'rgba(91,61,245,0.05)', borderRadius: 12, padding: SM ? 10 : 12, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(91,61,245,0.1)' },
  comprehensionCtxText: { fontSize: SM ? 16 : 18, fontWeight: '800', color: BRAND, textAlign: 'center', letterSpacing: -0.2 },

  // Step-by-step renderer (main_concept procedural)
  stepsContainer: { gap: 8, marginTop: 4 },
  stepRow:        { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: 'rgba(91,61,245,0.05)', borderRadius: 12, padding: 10, borderLeftWidth: 3, borderLeftColor: BRAND },
  stepRowProblem: { backgroundColor: 'rgba(0,0,0,0.04)', borderLeftColor: '#888' },
  stepRowResult:  { backgroundColor: 'rgba(5,150,105,0.08)', borderLeftColor: '#059669' },
  stepBadge:      { backgroundColor: BRAND, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, minWidth: 54, alignItems: 'center' },
  stepBadgeProblem: { backgroundColor: '#888' },
  stepBadgeResult:{ backgroundColor: '#059669' },
  stepBadgeText:  { fontSize: 10, fontWeight: '900', color: palette.blanco, letterSpacing: 0.5 },
  stepContent:    { flex: 1, fontSize: SM ? 13 : 14, color: semantic.textPrimary, lineHeight: 20, fontWeight: '500' },
  stepContentResult: { color: '#065F46', fontWeight: '700' },

  // Key relation card (now "Regla fácil")
  relationCard:       { backgroundColor: palette.blanco, borderRadius: 28, padding: SM ? 20 : 24 },
  ruleLabel:          { fontSize: 10, fontWeight: '900', color: BRAND, letterSpacing: 1.5, marginBottom: 14, textTransform: 'uppercase' },
  ruleBox:            { backgroundColor: 'rgba(91,61,245,0.06)', borderRadius: 16, borderLeftWidth: 4, borderLeftColor: BRAND, padding: SM ? 14 : 16, marginBottom: SM ? 10 : 12 },
  ruleText:           { fontSize: SM ? 16 : 18, fontWeight: '800', color: semantic.textPrimary, lineHeight: SM ? 24 : 27, letterSpacing: -0.3 },
  // legacy — kept to avoid crashes if referenced elsewhere
  relationLabel:      { fontSize: 10, fontWeight: '900', color: '#00C2A8', letterSpacing: 1.5, marginBottom: 16, textTransform: 'uppercase' },
  relationRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  relationChipA:      { flex: 1, backgroundColor: 'rgba(91,61,245,0.08)', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(91,61,245,0.15)' },
  relationChipB:      { flex: 1, backgroundColor: 'rgba(124,90,255,0.08)', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(124,90,255,0.15)' },
  relationChipText:   { fontSize: SM ? 13 : 14, fontWeight: '800', color: BRAND, letterSpacing: -0.2, textAlign: 'center' },
  relationArrow:      { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,194,168,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#00C2A8', flexShrink: 0 },
  relationArrowText:  { fontSize: 14, color: '#00C2A8', fontWeight: '900' },
  relationConnector:  { fontSize: SM ? 11 : 12, fontWeight: '700', color: '#00C2A8', textAlign: 'center', marginBottom: 10, fontStyle: 'italic' },
  relationDef:        { fontSize: SM ? 13 : 14, color: semantic.textPrimary, lineHeight: SM ? 20 : 22, fontWeight: '500', paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.bordeClaro },

  // Process flow card
  processCard:      { backgroundColor: palette.blanco, borderRadius: 28, padding: SM ? 18 : 22 },
  processLabel:     { fontSize: 10, fontWeight: '900', color: NEON, letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase' },
  processTitle:     { fontSize: SM ? 16 : 18, fontWeight: '900', color: semantic.textPrimary, marginBottom: 4, letterSpacing: -0.3 },
  processDef:       { fontSize: SM ? 13 : 14, color: semantic.textPrimary, lineHeight: SM ? 20 : 22, fontWeight: '500', marginBottom: 14 },
  processSteps:     { gap: 10 },
  processStep:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  processNum:       { width: 26, height: 26, borderRadius: 13, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  processNumText:   { fontSize: 12, fontWeight: '900', color: palette.blanco },
  processStepText:  { flex: 1, fontSize: SM ? 13 : 14, color: semantic.textPrimary, lineHeight: SM ? 20 : 22, fontWeight: '600', paddingTop: 3 },

  // Application card — storytelling format, morado themed
  appCard:        { backgroundColor: palette.blanco, borderRadius: 28, overflow: 'hidden' },
  appBand:        { backgroundColor: 'rgba(91,61,245,0.05)', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: SM ? 16 : 20, paddingVertical: SM ? 10 : 12, borderBottomWidth: 1, borderBottomColor: 'rgba(91,61,245,0.08)' },
  appEmoji:       { fontSize: SM ? 24 : 28 },
  appLabel:       { fontSize: 10, fontWeight: '900', color: BRAND, letterSpacing: 1.2, textTransform: 'uppercase' },
  appBody:        { padding: SM ? 14 : 18 },
  appTitle:       { fontSize: SM ? 15 : 17, fontWeight: '900', color: semantic.textPrimary, marginBottom: 6, letterSpacing: -0.3 },
  appSit:          { fontSize: SM ? 12 : 13, color: semantic.textSecondary, lineHeight: SM ? 19 : 21, fontWeight: '500', marginBottom: 6, marginTop: 4 },
  appScenarioBox:  { backgroundColor: 'rgba(91,61,245,0.06)', borderRadius: 14, borderLeftWidth: 3, borderLeftColor: BRAND, padding: SM ? 12 : 14, marginBottom: 8 },
  appScenarioLabel:{ fontSize: 9, fontWeight: '900', color: BRAND, letterSpacing: 1.2, marginBottom: 5, textTransform: 'uppercase' },
  appScenarioText: { fontSize: SM ? 14 : 16, color: semantic.textPrimary, lineHeight: SM ? 22 : 25, fontWeight: '700' },
  appAnswerBox:    { backgroundColor: 'rgba(91,61,245,0.06)', borderRadius: 12, padding: SM ? 10 : 12, borderLeftWidth: 3, borderLeftColor: BRAND },
  appAnswerLabel:  { fontSize: 9, fontWeight: '800', color: BRAND, letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' },
  appAnswerText:   { fontSize: SM ? 13 : 14, color: semantic.textPrimary, lineHeight: SM ? 20 : 22, fontWeight: '600' },

  // Common error card — morado dominant, subtle amber for wrong
  errorCard:        { backgroundColor: palette.blanco, borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(91,61,245,0.12)' },
  errorHeader:      { backgroundColor: 'rgba(91,61,245,0.05)', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: SM ? 16 : 20, paddingVertical: SM ? 12 : 14, borderBottomWidth: 1, borderBottomColor: 'rgba(91,61,245,0.08)' },
  errorIcon:        { fontSize: SM ? 22 : 26 },
  errorHeaderLabel: { fontSize: 11, fontWeight: '900', color: BRAND, letterSpacing: 1.5, textTransform: 'uppercase' },
  errorBody:        { padding: SM ? 14 : 18, gap: 10 },
  errorWrongBox:    { backgroundColor: 'rgba(245,158,11,0.07)', borderRadius: 12, padding: SM ? 10 : 12, borderLeftWidth: 3, borderLeftColor: '#F59E0B' },
  errorWrongLabel:  { fontSize: 10, fontWeight: '900', color: '#92400E', letterSpacing: 0.5, marginBottom: 5, textTransform: 'uppercase' },
  errorWrongText:   { fontSize: SM ? 13 : 14, color: semantic.textPrimary, lineHeight: SM ? 20 : 22, fontWeight: '500' },
  errorRightBox:    { backgroundColor: 'rgba(91,61,245,0.06)', borderRadius: 12, padding: SM ? 10 : 12, borderLeftWidth: 3, borderLeftColor: BRAND },
  errorRightLabel:  { fontSize: 10, fontWeight: '900', color: BRAND, letterSpacing: 0.5, marginBottom: 5, textTransform: 'uppercase' },
  errorRightText:   { fontSize: SM ? 13 : 14, color: semantic.textPrimary, lineHeight: SM ? 20 : 22, fontWeight: '600' },

  // Final challenge card
  // Comprueba si entendiste card
  checkCard:     { backgroundColor: palette.blanco, borderRadius: 28, overflow: 'hidden' },
  checkHeader:   { backgroundColor: BRAND, paddingVertical: SM ? 14 : 18, paddingHorizontal: SM ? 14 : 18, alignItems: 'center' },
  checkLabel:    { fontSize: 11, fontWeight: '900', color: palette.blanco, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 },
  checkSubtitle: { fontSize: SM ? 11 : 12, color: 'rgba(255,255,255,0.8)', fontWeight: '500', textAlign: 'center' },

  // Micro challenge card — compact action card after main_concept
  microCard:     { backgroundColor: palette.blanco, borderRadius: 28, overflow: 'hidden' },
  microHeader:   { backgroundColor: 'rgba(91,61,245,0.1)', paddingVertical: SM ? 12 : 14, paddingHorizontal: SM ? 14 : 18, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(91,61,245,0.15)' },
  microLabel:    { fontSize: 11, fontWeight: '900', color: BRAND, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2 },
  microSubtitle: { fontSize: SM ? 11 : 12, color: semantic.textSecondary, fontWeight: '500' },

  // Mission feedback bar (Duolingo-style bottom panel)
  mFeedbackBar:  { paddingHorizontal: 20, paddingTop: SM ? 16 : 20, gap: 12 },
  mFeedbackBarOk:{ backgroundColor: 'rgba(91,61,245,0.08)', borderTopWidth: 2, borderTopColor: 'rgba(91,61,245,0.2)' },
  mFeedbackBarErr:{ backgroundColor: 'rgba(239,68,68,0.05)', borderTopWidth: 2, borderTopColor: 'rgba(239,68,68,0.18)' },
  mFbContent:    { gap: 4 },
  mFbRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  mFbEmoji:      { fontSize: SM ? 28 : 34 },
  mFbTitle:      { fontSize: SM ? 20 : 23, fontWeight: '900', color: semantic.textPrimary, letterSpacing: -0.4, lineHeight: SM ? 26 : 30 },
  mFbExpl:       { fontSize: SM ? 13 : 14, color: semantic.textSecondary, lineHeight: SM ? 19 : 22, fontWeight: '500', marginTop: 2 },
  mFbCorrect:    { fontSize: SM ? 13 : 14, fontWeight: '700', color: BRAND, marginTop: 4 },
  mStreakBadge:  { backgroundColor: 'rgba(255,144,0,0.12)', borderRadius: 100, paddingVertical: 3, paddingHorizontal: 10, borderWidth: 1, borderColor: 'rgba(255,144,0,0.3)' },
  mStreakText:   { fontSize: 12, fontWeight: '800', color: '#E07000' },
  mXpChip:       { alignSelf: 'flex-start', backgroundColor: BRAND, borderRadius: 100, paddingVertical: 4, paddingHorizontal: 14, marginTop: 6 },
  mXpText:       { fontSize: 13, fontWeight: '900', color: LIME, letterSpacing: 0.3 },
  mContinueBtn:  { height: 52, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND },
  mContinueBtnErr:{ backgroundColor: '#991B1B' },
  mContinueBtnText:{ fontSize: 16, fontWeight: '800', color: palette.blanco, letterSpacing: 0.2 },

  // Mini Reto Final card
  retoCard:        { backgroundColor: palette.blanco, borderRadius: 28, overflow: 'hidden' },
  retoHeader:      { backgroundColor: BRAND, paddingVertical: SM ? 16 : 20, paddingHorizontal: SM ? 18 : 22, alignItems: 'center' },
  retoTrophy:      { fontSize: SM ? 36 : 44, marginBottom: 6 },
  retoHeaderLabel: { fontSize: 11, fontWeight: '900', color: palette.blanco, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 3 },
  retoHeaderSub:   { fontSize: SM ? 11 : 12, color: 'rgba(255,255,255,0.8)', fontWeight: '500', textAlign: 'center' },
  retoBody:        { padding: SM ? 14 : 18, gap: 12 },
  retoFeedbackOk:  { backgroundColor: BRAND, borderWidth: 0, borderRadius: 14, padding: SM ? 10 : 12 },

  challengeCard:        { backgroundColor: palette.blanco, borderRadius: 28, overflow: 'hidden' },
  challengeHeader:      { paddingVertical: SM ? 14 : 18, paddingHorizontal: SM ? 18 : 22, alignItems: 'center' },
  challengeTrophy:      { fontSize: SM ? 36 : 44, marginBottom: 4 },
  challengeHeaderLabel: { fontSize: 11, fontWeight: '900', color: palette.blanco, letterSpacing: 2, textTransform: 'uppercase' },
  challengeBody:        { padding: SM ? 14 : 18, gap: 12 },
  challengeQuestion:    { fontSize: SM ? 15 : 17, fontWeight: '800', color: semantic.textPrimary, lineHeight: SM ? 22 : 26, letterSpacing: -0.2 },

  // Detecta el Patrón card (key_relation)
  patternCard:         { backgroundColor: palette.blanco, borderRadius: 28, overflow: 'hidden' },
  patternHeader:       { backgroundColor: BRAND, paddingVertical: SM ? 10 : 12, paddingHorizontal: SM ? 16 : 18, alignItems: 'center' },
  patternLabel:        { fontSize: 11, fontWeight: '900', color: palette.blanco, letterSpacing: 1.5, textTransform: 'uppercase' },
  patternBody:         { padding: SM ? 16 : 20, gap: 0, alignItems: 'stretch' },
  patternNode:         { backgroundColor: 'rgba(91,61,245,0.06)', borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(91,61,245,0.25)', paddingVertical: SM ? 10 : 12, paddingHorizontal: SM ? 14 : 16 },
  patternNodeFinal:    { backgroundColor: BRAND, borderColor: BRAND },
  patternNodeText:     { fontSize: SM ? 15 : 17, fontWeight: '800', color: BRAND, textAlign: 'center', lineHeight: SM ? 22 : 25, letterSpacing: -0.2 },
  patternNodeTextFinal:{ color: palette.blanco },
  patternArrowRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: SM ? 6 : 8, gap: 8 },
  patternArrowGlyph:   { fontSize: SM ? 18 : 22, color: '#7C5CF6', fontWeight: '900' },
  patternArrowLabel:   { fontSize: SM ? 11 : 12, fontWeight: '700', color: '#7C5CF6', fontStyle: 'italic' },

  // Quiz Transition card
  qtCard:      { backgroundColor: palette.blanco, borderRadius: 28, padding: SM ? 22 : 28, alignItems: 'center' },
  qtEmoji:     { fontSize: SM ? 48 : 60, marginBottom: 10 },
  qtTitle:     { fontSize: SM ? 20 : 24, fontWeight: '900', color: semantic.textPrimary, textAlign: 'center', letterSpacing: -0.5, marginBottom: 8 },
  qtSub:       { fontSize: SM ? 13 : 15, color: semantic.textSecondary, textAlign: 'center', lineHeight: SM ? 20 : 22, fontWeight: '500', marginBottom: 20 },
  qtChecklist: { alignSelf: 'stretch', backgroundColor: palette.crema, borderRadius: 16, padding: SM ? 14 : 18, gap: 10, borderWidth: 1, borderColor: palette.bordeClaro },
  qtCheckRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtCheckIcon: { fontSize: SM ? 15 : 17, color: '#059669', fontWeight: '900', width: 22, textAlign: 'center' },
  qtCheckText: { fontSize: SM ? 13 : 15, fontWeight: '600', color: semantic.textPrimary, flex: 1 },

  // Victory card
  victoryCard:      { backgroundColor: palette.blanco, borderRadius: 28, padding: SM ? 22 : 28, alignItems: 'center' },
  victoryEmoji:     { fontSize: SM ? 54 : 68, marginBottom: 10 },
  victoryTitle:     { fontSize: SM ? 20 : 24, fontWeight: '900', color: semantic.textPrimary, textAlign: 'center', letterSpacing: -0.5, lineHeight: SM ? 26 : 32, marginBottom: 6 },
  victorySub:       { fontSize: SM ? 12 : 14, color: semantic.textPrimary, textAlign: 'center', lineHeight: SM ? 18 : 22, fontWeight: '500', marginBottom: 14 },
  victoryStats:     { width: '100%', backgroundColor: palette.crema, borderRadius: 16, paddingVertical: SM ? 12 : 14, paddingHorizontal: 8, marginBottom: 10, borderWidth: 1, borderColor: palette.bordeClaro },
  victoryStatRow:   { flexDirection: 'row', justifyContent: 'space-around' },
  victoryStat:      { alignItems: 'center', gap: 2 },
  victoryStatVal:   { fontSize: SM ? 18 : 22, fontWeight: '900', color: semantic.textPrimary, letterSpacing: -0.5 },
  victoryStatLbl:   { fontSize: 9, fontWeight: '700', color: semantic.textTertiary, letterSpacing: 0.3, textTransform: 'uppercase' },
  victoryNote:      { fontSize: SM ? 11 : 12, color: semantic.textTertiary, textAlign: 'center', fontWeight: '600', marginTop: 2 },

  // Mastery badge
  masteryBadge:     { borderRadius: 100, borderWidth: 1.5, paddingVertical: 6, paddingHorizontal: 18, marginBottom: 10, alignItems: 'center' },
  masteryBadgeText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  masteryBadgeSub:  { fontSize: 11, fontWeight: '600', marginTop: 2, opacity: 0.8 },
  reflectionBlock:  { backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', paddingVertical: 10, paddingHorizontal: 14, marginTop: 8, marginBottom: 4, alignSelf: 'stretch' },
  reflectionText:   { fontSize: 12, color: '#92400E', fontWeight: '600', lineHeight: 18 },
  noInteractionBlock: { width: '100%', backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: palette.bordeClaro, alignItems: 'center', gap: 12 },
  noInteractionText:  { fontSize: 13, color: semantic.textTertiary, fontWeight: '500', textAlign: 'center', lineHeight: 19 },
  noInteractionStats: { flexDirection: 'row', gap: 16, justifyContent: 'center' },

  // Skill dominance chip + mission progress
  missionProgress:    { fontSize: 11, fontWeight: '700', color: semantic.textTertiary, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 },
  skillDominatedChip: { backgroundColor: 'rgba(5,150,105,0.10)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, borderWidth: 1.5, borderColor: 'rgba(5,150,105,0.3)', marginBottom: 10 },
  skillDominatedText: { fontSize: 12, fontWeight: '800', color: '#065F46', letterSpacing: 0.2 },

  // Next mission button — skill transition
  nextMissionWrapper: { width: '100%', marginBottom: 12 },
  nextMissionLabel:   { fontSize: 10, fontWeight: '700', color: semantic.textTertiary, letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center', marginBottom: 6 },
  nextMissionBtn:     { width: '100%', borderRadius: 16, overflow: 'hidden' },
  nextMissionGrad:    { paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', gap: 2 },
  nextMissionText:    { fontSize: 16, fontWeight: '900', color: palette.blanco, letterSpacing: -0.3 },
  nextMissionArrow:   { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.75)', letterSpacing: 0.5 },

  // Upcoming missions list
  upcomingBlock:        { width: '100%', backgroundColor: palette.crema, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: palette.bordeClaro, gap: 8 },
  upcomingRow:          { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2 },
  upcomingRowCurrent:   { opacity: 1 },
  upcomingDot:          { fontSize: 13, fontWeight: '800', color: semantic.textTertiary, width: 20, textAlign: 'center' },
  upcomingLabel:        { flex: 1, fontSize: 13, fontWeight: '600', color: semantic.textTertiary },
  upcomingLabelDone:    { color: '#059669', fontWeight: '700' },
  upcomingLabelCurrent: { color: semantic.textPrimary, fontWeight: '800' },

  // Chain diagram (key_relation)
  chainContainer:   { gap: 0, alignItems: 'stretch', marginVertical: 10 },
  chainNode:        { backgroundColor: '#F5F3FF', borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(91,61,245,0.28)', paddingVertical: SM ? 9 : 11, paddingHorizontal: 16 },
  chainNodeText:    { fontSize: SM ? 14 : 16, fontWeight: '800', color: BRAND, textAlign: 'center' },
  chainLink:        { alignItems: 'center', paddingVertical: 2 },
  chainLinkArrow:   { fontSize: SM ? 16 : 18, color: '#00C2A8', fontWeight: '900', lineHeight: SM ? 18 : 20 },
  chainLinkText:    { fontSize: SM ? 11 : 12, fontWeight: '700', color: '#00C2A8', fontStyle: 'italic', lineHeight: SM ? 14 : 16 },

  // Challenge reflection card
  challengeRefCard:    { backgroundColor: '#F5F3FF', borderRadius: 28, padding: SM ? 26 : 32, alignItems: 'center' },
  challengeRefEmoji:   { fontSize: SM ? 52 : 64, marginBottom: 14 },
  challengeRefLabel:   { fontSize: 10, fontWeight: '900', color: NEON, letterSpacing: 1.5, marginBottom: 14, textTransform: 'uppercase' },
  challengeRefQ:       { fontSize: SM ? 17 : 21, fontWeight: '800', color: semantic.textPrimary, textAlign: 'center', lineHeight: SM ? 25 : 30, letterSpacing: -0.3, marginBottom: 16 },
  challengeRefHintBox: { backgroundColor: palette.blanco, borderRadius: 14, padding: SM ? 10 : 12, width: '100%' },
  challengeRefHintLbl: { fontSize: 9, fontWeight: '800', color: semantic.textTertiary, letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' },
  challengeRefHintTxt: { fontSize: SM ? 13 : 14, color: semantic.textPrimary, lineHeight: SM ? 20 : 22, fontWeight: '500' },

  // Order sequence card
  orderCard:        { backgroundColor: palette.blanco, borderRadius: 28, padding: SM ? 16 : 20 },
  orderLabel:       { fontSize: 10, fontWeight: '900', color: '#7C5AFF', letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase' },
  orderTitle:       { fontSize: SM ? 15 : 17, fontWeight: '800', color: semantic.textPrimary, lineHeight: SM ? 22 : 25, letterSpacing: -0.2, marginBottom: 6 },
  orderHint:        { fontSize: SM ? 12 : 13, color: semantic.textTertiary, fontWeight: '600', marginBottom: 14 },
  orderItems:       { gap: 8, alignSelf: 'stretch' },
  orderItem:        { flexDirection: 'row', alignItems: 'center', gap: 10, padding: SM ? 10 : 12, borderRadius: 14, borderWidth: 2, borderColor: palette.bordeClaro, backgroundColor: palette.crema },
  orderItemSelected:{ borderColor: BRAND, backgroundColor: 'rgba(91,61,245,0.06)' },
  orderItemCorrect: { borderColor: '#059669', backgroundColor: 'rgba(5,150,105,0.07)' },
  orderNum:         { width: 28, height: 28, borderRadius: 8, backgroundColor: palette.bordeMedio, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  orderNumSelected: { backgroundColor: BRAND },
  orderNumCorrect:  { backgroundColor: '#059669' },
  orderNumTxt:      { fontSize: 13, fontWeight: '900', color: palette.blanco },
  orderNumTxtMuted: { fontSize: 13, fontWeight: '700', color: semantic.textTertiary },
  orderItemTxt:     { flex: 1, fontSize: SM ? 13 : 14, color: semantic.textPrimary, fontWeight: '600', lineHeight: 19 },
  orderItemTxtSelected: { color: semantic.textPrimary, fontWeight: '700' },
  orderSuccessRow:  { marginTop: 12, backgroundColor: 'rgba(5,150,105,0.08)', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(5,150,105,0.2)', alignSelf: 'stretch', alignItems: 'center' },
  orderSuccessTxt:  { fontSize: 13, fontWeight: '800', color: '#065F46' },
});

// ── Quiz ───────────────────────────────────────────────────────────
const qz = StyleSheet.create({
  statsBar: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 6, gap: 7, alignItems: 'center' },
  chip:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: palette.blanco, borderRadius: 14, borderWidth: 1, borderColor: palette.bordeClaro, paddingHorizontal: 10, paddingVertical: 7 },
  chipVal:  { fontSize: 15, fontWeight: '900', color: semantic.textPrimary },
  chipLbl:  { fontSize: 10, color: semantic.textTertiary, fontWeight: '600' },
  counter:  { fontSize: 11, fontWeight: '700', color: semantic.textTertiary, flexShrink: 0 },

  // Lives dots — displayed inside streak chip
  heartDot:       { width: 7, height: 7, borderRadius: 3.5, backgroundColor: 'rgba(0,0,0,0.12)' },
  heartDotActive: { backgroundColor: '#FF4D6D' },

  // Animated progress bar (replaces PillBar)
  progressTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.09)', overflow: 'hidden' },
  progressFill:  { height: '100%', borderRadius: 4, backgroundColor: BRAND },

  // Kept for style compatibility (no longer rendered)
  livesRow:  { flexDirection: 'row', gap: 4, paddingHorizontal: 16, marginBottom: 2 },
  comboRow:         { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 4 },
  comboLabel:       { fontSize: 11, fontWeight: '800', color: semantic.textPrimary },
  comboBlocks:      { flexDirection: 'row', gap: 4 },
  comboBlock:       { width: 24, height: 8, borderRadius: 4, backgroundColor: palette.bordeMedio },
  comboBlockFilled: { backgroundColor: '#FF7A2B' },

  motivMsg: { fontSize: 11, fontWeight: '700', color: semantic.textTertiary, paddingHorizontal: 16, paddingBottom: 6, textAlign: 'center' },

  scroll:   { paddingHorizontal: 14, paddingTop: 4 },

  // Question card — reduced padding ~22% vs original
  questionCard: { backgroundColor: palette.blanco, borderRadius: 20, paddingHorizontal: SM ? 13 : 15, paddingVertical: SM ? 11 : 12, marginBottom: 8 },
  questionMeta: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  questionChip: { fontSize: 10, fontWeight: '800', color: BRAND, letterSpacing: 0.4, backgroundColor: 'rgba(91,61,245,0.08)', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 100 },
  questionText: { fontSize: SM ? 15 : 17, fontWeight: '800', color: semantic.textPrimary, lineHeight: SM ? 22 : 25, letterSpacing: -0.2 },

  option:           { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, borderWidth: 2, borderColor: palette.bordeClaro, backgroundColor: palette.blanco },
  optCorrect:       { borderColor: BRAND, borderWidth: 2.5, backgroundColor: 'rgba(91,61,245,0.05)' },
  optWrong:         { borderColor: '#DC2626', borderWidth: 2, backgroundColor: 'rgba(220,38,38,0.04)' },
  optLetter:        { width: 30, height: 30, borderRadius: 9, backgroundColor: palette.crema, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  optLetterCorrect: { backgroundColor: BRAND },
  optLetterRed:     { backgroundColor: '#DC2626' },
  optLetterText:    { fontSize: 13, fontWeight: '800', color: semantic.textPrimary },
  optText:          { flex: 1, fontSize: 14, color: semantic.textPrimary, fontWeight: '600', lineHeight: 20 },

  // Feedback — compact (max 2 visible lines)
  feedback:      { borderRadius: 14, paddingVertical: 8, paddingHorizontal: 13, marginBottom: 8 },
  feedbackOk:    { borderLeftWidth: 3, borderLeftColor: BRAND, backgroundColor: 'rgba(91,61,245,0.05)' },
  feedbackFail:  { borderLeftWidth: 3, borderLeftColor: '#DC2626', backgroundColor: 'rgba(220,38,38,0.04)' },
  feedbackHeader:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  feedbackTitle: { fontSize: 13, fontWeight: '900', color: semantic.textPrimary },
  feedbackXP:    { backgroundColor: BRAND, borderRadius: 100, paddingVertical: 2, paddingHorizontal: 9 },
  feedbackXPText:{ fontSize: 11, fontWeight: '900', color: palette.blanco },
  feedbackText:  { fontSize: 12, color: semantic.textPrimary, lineHeight: 18 },

  // XP float — slightly larger for reward feel
  xpFloat:     { backgroundColor: BRAND, borderRadius: 100, paddingVertical: 10, paddingHorizontal: 22 },
  xpFloatText: { color: LIME, fontWeight: '900', fontSize: 18, letterSpacing: 0.3 },

  streakBadge:    { backgroundColor: palette.blanco, borderRadius: 100, paddingVertical: 10, paddingHorizontal: 22, borderWidth: 1, borderColor: palette.bordeClaro },
  streakBadgeText:{ fontSize: 15, fontWeight: '900', color: semantic.textPrimary },

  // Combo / micro reward — enlarged for more prominence
  microBadge:    { backgroundColor: semantic.textPrimary, borderRadius: 100, paddingVertical: 11, paddingHorizontal: 24 },
  microBadgeText:{ fontSize: 16, fontWeight: '900', color: LIME },

  resultScroll:  { paddingHorizontal: 24, paddingTop: 24, alignItems: 'center' },
  resultEmoji:   { fontSize: 72, marginBottom: 12 },
  resultTitle:   { fontSize: 26, fontWeight: '900', color: semantic.textPrimary, marginBottom: 6, textAlign: 'center' },
  resultScore:   { fontSize: 48, fontWeight: '900', color: BRAND, letterSpacing: -1, marginBottom: 20 },
  resultGrid:    { flexDirection: 'row', gap: 10, marginBottom: 24, width: '100%' },
  resultCell:    { flex: 1, backgroundColor: palette.blanco, borderRadius: 16, borderWidth: 1, borderColor: palette.bordeClaro, padding: 14, alignItems: 'center', gap: 4 },
  resultCellVal: { fontSize: 16, fontWeight: '900', color: semantic.textPrimary },
  resultCellLbl: { fontSize: 10, color: semantic.textTertiary, fontWeight: '600' },
  retryBtn:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: palette.crema, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 20, marginBottom: 12 },
  retryText:     { fontSize: 14, fontWeight: '700', color: BRAND },

  // Nemi character widget
  nemiWidget: { backgroundColor: palette.blanco, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: palette.bordeClaro, maxWidth: 180 },
  nemiLabel:  { fontSize: 10, fontWeight: '800', color: BRAND, marginBottom: 3, letterSpacing: 0.5 },
  nemiText:   { fontSize: 12, color: semantic.textPrimary, fontWeight: '600', lineHeight: 17 },

  // Last-question glow state
  chipLastQ: { borderColor: BRAND },
  lastQChip: { fontSize: 10, fontWeight: '800', color: palette.rojoError, backgroundColor: 'rgba(255,77,109,0.1)', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 100, marginLeft: 6 },
});

// ── Flashcard SRS buttons ──────────────────────────────────────────
const fcs = StyleSheet.create({
  srsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  srsBtn: { paddingVertical: 13, borderRadius: 16, alignItems: 'center' },
  srsBtnText: { fontSize: SM ? 10 : 11, fontWeight: '800', color: palette.blanco, textAlign: 'center', lineHeight: 16 },
});

// ── Celebration ────────────────────────────────────────────────────
const cel = StyleSheet.create({
  row:  { flexDirection: 'row', gap: 12, width: '100%', marginBottom: 16 },
  cell: { flex: 1, backgroundColor: palette.blanco, borderRadius: 18, borderWidth: 1, borderColor: palette.bordeClaro, padding: 16, alignItems: 'center', gap: 4 },
  val:  { fontSize: 20, fontWeight: '900', color: semantic.textPrimary, letterSpacing: -0.5 },
  lbl:  { fontSize: 10, fontWeight: '700', color: semantic.textTertiary, letterSpacing: 0.5 },
});

// ── Complete ───────────────────────────────────────────────────────
const comp = StyleSheet.create({
  scroll:   { paddingHorizontal: 20, paddingTop: 20, alignItems: 'center' },
  trophy:   { fontSize: SM ? 80 : 96, textAlign: 'center', marginBottom: 8 },
  title:    { fontSize: SM ? 26 : 32, fontWeight: '900', color: semantic.textPrimary, textAlign: 'center', letterSpacing: -0.5, marginBottom: 6 },
  subtitle: { fontSize: 13, color: semantic.textTertiary, textAlign: 'center', marginBottom: 24, paddingHorizontal: 16 },
  grid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, width: '100%', marginBottom: 16 },
  cell:     { width: '47%', backgroundColor: palette.blanco, borderRadius: 18, borderWidth: 1, borderColor: palette.bordeClaro, padding: 16, alignItems: 'center', gap: 4 },
  cellVal:  { fontSize: 22, fontWeight: '900', color: semantic.textPrimary, letterSpacing: -0.5 },
  cellLbl:  { fontSize: 10, fontWeight: '700', color: semantic.textTertiary, letterSpacing: 0.5 },
  levelCard:{ backgroundColor: palette.blanco, borderRadius: 18, borderWidth: 1, borderColor: palette.bordeClaro, padding: 18, width: '100%', marginBottom: 16 },
  achCard:  { backgroundColor: palette.blanco, borderRadius: 18, borderWidth: 1, borderColor: palette.bordeClaro, padding: 18, width: '100%', marginBottom: 16 },
  achTitle: { fontSize: 14, fontWeight: '800', color: semantic.textPrimary, marginBottom: 14 },
  achRow:   { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  achName:  { fontSize: 14, fontWeight: '700', color: semantic.textPrimary, marginBottom: 2 },
  achDesc:  { fontSize: 12, color: semantic.textTertiary },
});
