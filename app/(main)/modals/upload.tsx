import { SHOW_GEMS } from '@/config/features';
import { palette, semantic } from '@/theme/colors';
import { useOnboarding } from '@/contexts/OnboardingContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ArrowLeft,
  BookOpen,
  Bot,
  Brain,
  Check,
  ChevronDown,
  Clock,
  FileText,
  ImageIcon,
  Layers,
  Plus,
  X,
  Zap,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const { height: SCREEN_H } = Dimensions.get('window');
const SM    = SCREEN_H < 740;
const BG    = palette.crema;
const BRAND = palette.morado;
const LIME  = palette.limaElectrica;

// ── Types ─────────────────────────────────────────────────────────
type UploadedFile = {
  uri: string; name: string; mimeType: string; sizeText: string; sizeBytes: number;
};
// ── Constants ─────────────────────────────────────────────────────
const BACKEND_BASE_URL = 'https://nemup-production.up.railway.app';

const EMPTY_BENEFITS = [
  { Icon: Zap,    label: '+60 XP promedio' },
  { Icon: Brain,  label: 'Quiz personalizado' },
  { Icon: Layers, label: 'Tarjetas inteligentes' },
  { Icon: Clock,  label: 'Menos de 1 minuto' },
];

const SESSION_ITEMS = [
  { Icon: BookOpen, label: 'Misión personalizada' },
  { Icon: Brain,    label: 'Quiz personalizado' },
  { Icon: Layers,   label: 'Tarjetas interactivas' },
  { Icon: Zap,      label: 'XP por completar actividades' },
];

const GEN_STAGES = [
  { title: 'Analizando apuntes',          sub: 'Identificando temas y estructura de tu documento.' },
  { title: 'Detectando conceptos',        sub: 'Encontrando los conceptos clave para practicar.' },
  { title: 'Construyendo contenido',      sub: 'Preparando actividades personalizadas para ti.' },
  { title: 'Preparando tu entrenamiento', sub: 'Ajustando la dificultad y el tiempo de estudio.' },
] as const;

const STAGE_PROGRESS = [0.35, 0.65, 0.90, 0.99] as const;

const CONCEPT_CHIPS = [
  'Términos semejantes', 'Sinónimos', 'Antónimos',
  'Contexto', 'Idea principal', 'Semántica',
] as const;

const BUILDING_ITEMS = [
  { emoji: '📚', label: 'Misión' },
  { emoji: '🧠', label: 'Quiz' },
  { emoji: '🃏', label: 'Tarjetas' },
] as const;

const PREPARING_LINES = [
  'Generando dificultad personalizada.',
  'Estimando tiempo de estudio.',
  'Optimizando ejercicios.',
] as const;



// ── Confetti ──────────────────────────────────────────────────────
const CONFETTI = [
  { left: '10%', bg: LIME,                  size: 7,  dur: 3400, delay: 0,    zigzag:  7 },
  { left: '30%', bg: 'rgba(91,61,245,0.6)', size: 6,  dur: 3800, delay: 500,  zigzag: -9,  radius: 3 },
  { left: '52%', bg: '#F45BA5',             size: 7,  dur: 3200, delay: 200,  zigzag:  8,  radius: 4 },
  { left: '70%', bg: LIME,                  size: 5,  dur: 4000, delay: 800,  zigzag: -7,  radius: 3 },
  { left: '88%', bg: 'rgba(91,61,245,0.5)', size: 6,  dur: 3600, delay: 300,  zigzag:  6,  radius: 4 },
] as const;
type ConfettiItem = (typeof CONFETTI)[number];

function ConfettiPiece({ item }: { item: ConfettiItem }) {
  const ty  = useSharedValue(0);
  const tx  = useSharedValue(0);
  const rot = useSharedValue(0);
  useEffect(() => {
    ty.value = withDelay(item.delay, withRepeat(
      withTiming(SCREEN_H + 40, { duration: item.dur, easing: Easing.linear }), -1, false,
    ));
    tx.value = withDelay(item.delay, withRepeat(
      withSequence(
        withTiming(item.zigzag,       { duration: item.dur * 0.25, easing: Easing.inOut(Easing.sin) }),
        withTiming(-item.zigzag,      { duration: item.dur * 0.25, easing: Easing.inOut(Easing.sin) }),
        withTiming(item.zigzag * 0.6, { duration: item.dur * 0.25, easing: Easing.inOut(Easing.sin) }),
        withTiming(0,                 { duration: item.dur * 0.25, easing: Easing.inOut(Easing.sin) }),
      ), -1, false,
    ));
    rot.value = withDelay(item.delay, withRepeat(
      withTiming(720, { duration: item.dur, easing: Easing.linear }), -1, false,
    ));
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { rotateZ: rot.value + 'deg' }],
  }));
  return (
    <Animated.View style={[{
      position: 'absolute', top: -20, left: item.left as any,
      width: item.size, height: item.size, backgroundColor: item.bg,
      borderRadius: 'radius' in item ? (item as any).radius : 2,
    }, style]} />
  );
}


// ── Subtle background floating dot ────────────────────────────────
function BgDot({ style: styleProp, dur }: { style: any; dur: number }) {
  const ty = useSharedValue(0);
  const op = useSharedValue(0);
  useEffect(() => {
    op.value = withTiming(1, { duration: 1200 });
    ty.value = withRepeat(
      withSequence(
        withTiming(-14, { duration: dur, easing: Easing.inOut(Easing.sin) }),
        withTiming(0,   { duration: dur, easing: Easing.inOut(Easing.sin) }),
      ), -1, false,
    );
  }, []);
  const animStyle = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ translateY: ty.value }] }));
  return <Animated.View style={[styleProp, animStyle]} />;
}

// ── Shimmer progress bar ──────────────────────────────────────────
function ShimmerProgress({ step, progressValue }: { step: number; progressValue?: { value: number } }) {
  const fill     = useSharedValue(((step + 1) / 3) * 100);
  const shimmerX = useSharedValue(-100);
  useEffect(() => {
    if (!progressValue) {
      fill.value = withTiming(((step + 1) / 3) * 100, { duration: 420, easing: Easing.out(Easing.cubic) });
    }
  }, [step, progressValue]);
  useEffect(() => {
    shimmerX.value = withRepeat(
      withSequence(
        withTiming(400, { duration: 1400, easing: Easing.linear }),
        withTiming(-100, { duration: 0 }),
      ), -1, false,
    );
  }, []);
  const fillStyle = useAnimatedStyle(() => ({
    width: `${progressValue ? progressValue.value * 100 : fill.value}%` as any,
  }));
  const shimmerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shimmerX.value }] }));
  return (
    <View style={{ flex: 1, height: 5, backgroundColor: palette.bordeClaro, borderRadius: 99, overflow: 'hidden', marginHorizontal: 10 }}>
      <Animated.View style={[{ height: '100%', borderRadius: 99, overflow: 'hidden' }, fillStyle]}>
        <View style={{ flex: 1, backgroundColor: BRAND }} />
        <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: 60 }, shimmerStyle]}>
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.35)' }} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

// ── File type badge ───────────────────────────────────────────────
function FileTypeBadge({ mimeType }: { mimeType: string }) {
  if (mimeType.includes('pdf'))
    return <View style={fti.pdf}><Text style={fti.pdfText}>PDF</Text></View>;
  if (mimeType.includes('image'))
    return <View style={fti.img}><ImageIcon size={17} color="#16A34A" strokeWidth={1.8} /></View>;
  return <View style={fti.doc}><FileText size={17} color="#2563EB" strokeWidth={1.8} /></View>;
}
const fti = StyleSheet.create({
  pdf:     { width: 38, height: 38, borderRadius: 10, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  pdfText: { fontSize: 10, fontWeight: '800', color: '#DC2626' },
  img:     { width: 38, height: 38, borderRadius: 10, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
  doc:     { width: 38, height: 38, borderRadius: 10, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' },
});

// ── Utilities ─────────────────────────────────────────────────────
function getBackendBaseUrl() { return BACKEND_BASE_URL || 'http://localhost:3000'; }

function normalizeMime(name: string, mime: string) {
  if (!mime || mime === 'application/octet-stream') {
    if (name.toLowerCase().endsWith('.pdf')) return 'application/pdf';
    if (name.toLowerCase().match(/\.(jpg|jpeg|png|gif|heic|webp)$/i)) return 'image/jpeg';
  }
  return mime;
}

function parseSseEvents(raw: string, handle: (event: string, payload: any) => void) {
  const events   = raw.split(/\r?\n\r?\n/);
  const leftover = events.pop() ?? '';
  for (const block of events) {
    if (!block.trim()) continue;
    let name = 'message', data = '';
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) name = line.replace('event:', '').trim();
      if (line.startsWith('data:'))  data += line.replace('data:', '').trim();
    }
    if (data) { try { handle(name, JSON.parse(data)); } catch (e) { console.warn('[SSE]', e); } }
  }
  return leftover;
}

// ══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════
export default function UploadFlowScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state: onboardingState } = useOnboarding();
  const curso = onboardingState.data.curso || '1º Medio';

  // ── State ──────────────────────────────────────────────────────
  const [step, setStep]                       = useState(0);
  const [selectedFiles, setSelectedFiles]     = useState<UploadedFile[]>([]);
  const [uploadError, setUploadError]         = useState('');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [sessionResult, setSessionResult]     = useState<any | null>(null);
  const [stageIdx, setStageIdx]               = useState(0);
  const [displayPct, setDisplayPct]           = useState(0);
  const [recentExpanded, setRecentExpanded]   = useState(false);
  const [recentFiles, setRecentFiles]         = useState<UploadedFile[]>([]);
  const [completedMissions, setCompletedMissions] = useState<any[]>([]);
  const [activeMissionLabel, setActiveMissionLabel] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('nemup_recent_files').then(raw => {
      if (!raw) return;
      try { setRecentFiles(JSON.parse(raw)); } catch {}
    });
  }, []);

  // ── Refs ───────────────────────────────────────────────────────
  const xhrRef               = useRef<{ abort: () => void } | null>(null);
  const generationStartedRef = useRef(false);
  const autoNavRef           = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentStageRef      = useRef(0);
  const progressTargetRef    = useRef(0);
  const stepRef              = useRef(0);
  stepRef.current = step;

  // Reset to fresh state whenever the screen refocuses after a completed session
  useFocusEffect(
    useCallback(() => {
      if (stepRef.current === 2) {
        xhrRef.current?.abort();
        generationStartedRef.current = false;
        setStep(0);
        setSelectedFiles([]);
        setUploadError('');
        setGenerationError(null);
        setSessionResult(null);
      }
    }, [])
  );

  // ── Shared values (ALL unconditional) ─────────────────────────
  const stageOpacity    = useSharedValue(1);
  const stageScale      = useSharedValue(1);
  const progressFill    = useSharedValue(0);
  const celebScale      = useSharedValue(0);
  const celebPulse      = useSharedValue(1);
  const ctaPulse        = useSharedValue(0);
  const s2Entry1        = useSharedValue(0);
  const s2Entry2        = useSharedValue(0);
  const s2Entry3        = useSharedValue(0);
  const s2Entry4        = useSharedValue(0);
  const confettiOpacity = useSharedValue(1);
  const filesAnim       = useSharedValue(0);
  // Stage-specific animation SVs
  const docScanPhase    = useSharedValue(0);
  const chip1sv         = useSharedValue(0);
  const chip2sv         = useSharedValue(0);
  const chip3sv         = useSharedValue(0);
  const chip4sv         = useSharedValue(0);
  const chip5sv         = useSharedValue(0);
  const chip6sv         = useSharedValue(0);
  const check1sv        = useSharedValue(0);
  const check2sv        = useSharedValue(0);
  const check3sv        = useSharedValue(0);

  // ── Animated styles (ALL unconditional) ───────────────────────
  const stageAnimStyle    = useAnimatedStyle(() => ({
    opacity: stageOpacity.value,
    transform: [{ scale: stageScale.value }],
  }));
  const progressFillStyle = useAnimatedStyle(() => ({ width: `${progressFill.value * 100}%` as any }));
  const celebScaleAnim    = useAnimatedStyle(() => ({ transform: [{ scale: celebScale.value }] }));
  const celebPulseAnim    = useAnimatedStyle(() => ({ transform: [{ scale: celebPulse.value }] }));
  const ctaPulseAnim      = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + ctaPulse.value * 0.013 }],
  }));
  const s2Entry1Style = useAnimatedStyle(() => ({
    opacity: s2Entry1.value,
    transform: [{ translateY: (1 - s2Entry1.value) * 18 }],
  }));
  const s2Entry2Style = useAnimatedStyle(() => ({
    opacity: s2Entry2.value,
    transform: [{ translateY: (1 - s2Entry2.value) * 18 }],
  }));
  const s2Entry3Style = useAnimatedStyle(() => ({
    opacity: s2Entry3.value,
    transform: [{ translateY: (1 - s2Entry3.value) * 18 }],
  }));
  const s2Entry4Style = useAnimatedStyle(() => ({
    opacity: s2Entry4.value,
    transform: [{ translateY: (1 - s2Entry4.value) * 18 }],
  }));
  const confettiStyle  = useAnimatedStyle(() => ({ opacity: confettiOpacity.value }));
  const filesAnimStyle = useAnimatedStyle(() => ({
    opacity:   filesAnim.value,
    transform: [{ translateY: (1 - filesAnim.value) * 8 }],
  }));
  // Doc scan — 3 lines cycle through highlight
  const docLine1Style = useAnimatedStyle(() => ({
    backgroundColor: docScanPhase.value < 0.34 ? BRAND : 'rgba(155,149,166,0.22)',
  }));
  const docLine2Style = useAnimatedStyle(() => ({
    backgroundColor: docScanPhase.value >= 0.34 && docScanPhase.value < 0.67 ? BRAND : 'rgba(155,149,166,0.22)',
  }));
  const docLine3Style = useAnimatedStyle(() => ({
    backgroundColor: docScanPhase.value >= 0.67 ? BRAND : 'rgba(155,149,166,0.22)',
  }));
  // Concept chips — fade + slide in
  const chip1Style = useAnimatedStyle(() => ({ opacity: chip1sv.value, transform: [{ translateY: (1 - chip1sv.value) * 12 }] }));
  const chip2Style = useAnimatedStyle(() => ({ opacity: chip2sv.value, transform: [{ translateY: (1 - chip2sv.value) * 12 }] }));
  const chip3Style = useAnimatedStyle(() => ({ opacity: chip3sv.value, transform: [{ translateY: (1 - chip3sv.value) * 12 }] }));
  const chip4Style = useAnimatedStyle(() => ({ opacity: chip4sv.value, transform: [{ translateY: (1 - chip4sv.value) * 12 }] }));
  const chip5Style = useAnimatedStyle(() => ({ opacity: chip5sv.value, transform: [{ translateY: (1 - chip5sv.value) * 12 }] }));
  const chip6Style = useAnimatedStyle(() => ({ opacity: chip6sv.value, transform: [{ translateY: (1 - chip6sv.value) * 12 }] }));
  // Checklist + preparing lines — scale + fade in
  const check1Style = useAnimatedStyle(() => ({ opacity: check1sv.value, transform: [{ scale: 0.85 + check1sv.value * 0.15 }] }));
  const check2Style = useAnimatedStyle(() => ({ opacity: check2sv.value, transform: [{ scale: 0.85 + check2sv.value * 0.15 }] }));
  const check3Style = useAnimatedStyle(() => ({ opacity: check3sv.value, transform: [{ scale: 0.85 + check3sv.value * 0.15 }] }));

  // ── Effects ────────────────────────────────────────────────────

  // Screen 2: entrance animations + confetti auto-hide
  useEffect(() => {
    if (step !== 2) {
      confettiOpacity.value = 1;
      return;
    }
    confettiOpacity.value = 1;
    const fadeTimer = setTimeout(() => {
      confettiOpacity.value = withTiming(0, { duration: 600 });
    }, 2000);
    celebScale.value = withSpring(1, { damping: 11, stiffness: 180 });
    celebPulse.value = withDelay(700, withRepeat(
      withSequence(
        withTiming(1.08, { duration: 380 }),
        withTiming(1.00, { duration: 380 }),
        withDelay(3200, withTiming(1.00, { duration: 0 })),
      ), -1, false,
    ));
    ctaPulse.value = withRepeat(
      withSequence(withTiming(1, { duration: 1800 }), withTiming(0, { duration: 1800 })), -1, false,
    );
    s2Entry1.value = withSpring(1, { damping: 16, stiffness: 170 });
    s2Entry2.value = withDelay(150, withSpring(1, { damping: 16, stiffness: 170 }));
    s2Entry3.value = withDelay(300, withSpring(1, { damping: 16, stiffness: 170 }));
    s2Entry4.value = withDelay(450, withSpring(1, { damping: 16, stiffness: 170 }));
    return () => clearTimeout(fadeTimer);
  }, [step]);

  // Screen 1: stage cycling + motiv rotation + stage-stepped progress
  useEffect(() => {
    if (step !== 1) return;

    // Reset
    currentStageRef.current   = 0;
    progressTargetRef.current = 0;
    setStageIdx(0);

    // Progress: jump to stage-0 target immediately, then advance per stage
    progressFill.value = 0;
    progressTargetRef.current = STAGE_PROGRESS[0];
    progressFill.value = withTiming(STAGE_PROGRESS[0], { duration: 500, easing: Easing.out(Easing.cubic) });

    // Stage cycles every 2.5s — progress advances with each stage, never retreats
    const stageInterval = setInterval(() => {
      stageOpacity.value = withTiming(0, { duration: 220 }, (done) => {
        if (done) {
          const next = (currentStageRef.current + 1) % GEN_STAGES.length;
          currentStageRef.current = next;
          runOnJS(setStageIdx)(next);
          stageOpacity.value = withTiming(1, { duration: 280 });
          stageScale.value   = withSpring(1, { damping: 14, stiffness: 200 });
          const target = STAGE_PROGRESS[Math.min(next, STAGE_PROGRESS.length - 1)];
          if (target > progressTargetRef.current) {
            progressTargetRef.current = target;
            progressFill.value = withTiming(target, { duration: 500, easing: Easing.out(Easing.cubic) });
          }
        }
      });
      stageScale.value = withTiming(0.82, { duration: 220 });
    }, 2500);

    return () => { clearInterval(stageInterval); };
  }, [step]);


  // Auto-navigate to step 2 when session result arrives
  useEffect(() => {
    if (sessionResult && step === 1) {
      progressFill.value = withTiming(1, { duration: 400 });
      autoNavRef.current = setTimeout(() => setStep(2), 800);
      return () => { if (autoNavRef.current) clearTimeout(autoNavRef.current); };
    }
  }, [sessionResult, step]);

  // ── File helpers ───────────────────────────────────────────────
  const addFiles = (incoming: UploadedFile[]) => {
    setSelectedFiles(prev => {
      const existing = new Set(prev.map(f => f.uri));
      return [...prev, ...incoming.filter(f => !existing.has(f.uri))];
    });
    setUploadError('');
  };
  const removeFile = (uri: string) => setSelectedFiles(prev => prev.filter(f => f.uri !== uri));

  // ── Handlers ──────────────────────────────────────────────────

  const handleFilePick = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'], copyToCacheDirectory: true, multiple: true,
      });
      if (result.canceled || !result.assets?.length) return;
      addFiles(result.assets.map(a => ({
        uri: a.uri, name: a.name ?? 'archivo',
        mimeType: normalizeMime(a.name ?? '', a.mimeType ?? ''),
        sizeText: a.size ? `${(a.size / 1024).toFixed(1)} KB` : 'N/A',
        sizeBytes: a.size ?? 0,
      })));
    } catch (e) {
      setUploadError(`No se pudo seleccionar: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleCameraPick = async () => {
    try {
      if (Platform.OS === 'web') {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsMultipleSelection: true,
        });
        if (!result.canceled && result.assets?.length) {
          addFiles(result.assets.map(a => ({
            uri: a.uri, name: a.fileName ?? `Foto-${Date.now()}.jpg`,
            mimeType: a.type ?? 'image/jpeg',
            sizeText: a.fileSize ? `${Math.round(a.fileSize / 1024)} KB` : 'N/A',
            sizeBytes: a.fileSize ?? 0,
          })));
        }
        return;
      }
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') { Alert.alert('Permiso denegado', 'Necesitamos acceso a la cámara.'); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      if (!result.canceled && result.assets?.length) {
        const a = result.assets[0];
        addFiles([{
          uri: a.uri, name: a.fileName ?? `Foto-${Date.now()}.jpg`,
          mimeType: a.type ?? 'image/jpeg',
          sizeText: a.fileSize ? `${Math.round(a.fileSize / 1024)} KB` : 'N/A',
          sizeBytes: a.fileSize ?? 0,
        }]);
      }
    } catch (e) {
      setUploadError(`Error cámara: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const startGeneration = useCallback(async () => {
    if (selectedFiles.length === 0) return;
    setGenerationError(null);

    const controller = new AbortController();
    xhrRef.current = { abort: () => controller.abort() };

    try {
      const primary = selectedFiles[0];
      console.log('[NEMup] Curso detectado:', curso);
      console.log('[NEMup] Curso enviado al backend:', curso);
      const formData = new FormData();
      formData.append('config', JSON.stringify({
        documentId: primary.name, format: ['quizzes', 'flashcards'],
        difficulty: 'adaptive', estimatedDuration: 18, curso,
      }));
      formData.append('userId', 'demo-user');
      selectedFiles.forEach(f =>
        formData.append('documents', { uri: f.uri, type: f.mimeType, name: f.name } as any)
      );

      const response = await fetch(`${getBackendBaseUrl()}/sessions/generate`, {
        method: 'POST',
        headers: { Accept: 'text/event-stream' },
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        setGenerationError('No se pudo generar la sesión.');
        return;
      }

      const text = await response.text();

      const handleSseEvent = (event: string, payload: any) => {
        if (event === 'mission_generating') {
          setActiveMissionLabel(`${payload.missionIndex + 1}/${payload.total}: ${payload.skillLabel}`);
        }
        if (event === 'mission_complete') {
          setCompletedMissions(prev => [...prev, payload]);
        }
        if (event === 'complete') {
          setSessionResult(payload);
        }
        if (event === 'error') setGenerationError(payload?.message ?? 'Error inesperado.');
      };

      // Append separator so the last SSE event is always flushed by parseSseEvents
      parseSseEvents(text + '\n\n', handleSseEvent);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setGenerationError(`Error de red. Intenta nuevamente.`);
    }
  }, [selectedFiles, curso]);

  useEffect(() => {
    if (step !== 1) { generationStartedRef.current = false; return; }
    if (generationStartedRef.current || selectedFiles.length === 0) return;
    generationStartedRef.current = true;
    startGeneration();
    return () => { xhrRef.current?.abort(); };
  }, [selectedFiles, startGeneration, step]);

  const hasFiles         = selectedFiles.length > 0;
  const completedSession = sessionResult?.session;

  useEffect(() => {
    filesAnim.value = hasFiles ? withTiming(1, { duration: 260 }) : 0;
  }, [hasFiles]);

  // Per-stage content animations
  useEffect(() => {
    if (step !== 1) return;
    docScanPhase.value = 0;
    chip1sv.value = 0; chip2sv.value = 0; chip3sv.value = 0;
    chip4sv.value = 0; chip5sv.value = 0; chip6sv.value = 0;
    check1sv.value = 0; check2sv.value = 0; check3sv.value = 0;

    if (stageIdx === 0) {
      docScanPhase.value = withRepeat(
        withTiming(1, { duration: 1800, easing: Easing.linear }), -1, false,
      );
    } else if (stageIdx === 1) {
      const sp = { damping: 16, stiffness: 190 };
      chip1sv.value = withSpring(1, sp);
      chip2sv.value = withDelay(140, withSpring(1, sp));
      chip3sv.value = withDelay(280, withSpring(1, sp));
      chip4sv.value = withDelay(420, withSpring(1, sp));
      chip5sv.value = withDelay(560, withSpring(1, sp));
      chip6sv.value = withDelay(700, withSpring(1, sp));
    } else if (stageIdx === 2) {
      const sp = { damping: 18, stiffness: 210 };
      check1sv.value = withDelay(200,  withSpring(1, sp));
      check2sv.value = withDelay(680,  withSpring(1, sp));
      check3sv.value = withDelay(1160, withSpring(1, sp));
    } else {
      const sp = { damping: 18, stiffness: 210 };
      check1sv.value = withDelay(150,  withSpring(1, sp));
      check2sv.value = withDelay(650,  withSpring(1, sp));
      check3sv.value = withDelay(1150, withSpring(1, sp));
    }
  }, [stageIdx, step]);

  // Smooth percentage counter — reads shared value every 80ms
  useEffect(() => {
    if (step !== 1) return;
    setDisplayPct(0);
    const interval = setInterval(() => {
      setDisplayPct(Math.round(progressFill.value * 100));
    }, 80);
    return () => clearInterval(interval);
  }, [step]);

  const handleContinue = async () => {
    if (!hasFiles) { setUploadError('Selecciona al menos un archivo para continuar.'); return; }
    try {
      const raw = await AsyncStorage.getItem('nemup_recent_files');
      const existing: UploadedFile[] = raw ? JSON.parse(raw) : [];
      const existingUris = new Set(existing.map(f => f.uri));
      const merged = [...selectedFiles.filter(f => !existingUris.has(f.uri)), ...existing].slice(0, 5);
      await AsyncStorage.setItem('nemup_recent_files', JSON.stringify(merged));
    } catch {}
    setStep(1);
  };
  const handleClose = () => router.back();
  const handleBack  = () => { if (step > 0) setStep(step - 1); else router.back(); };
  const handleStart = async () => {
    if (!completedSession) return;
    const sessionKey = Date.now().toString();
    const payload = sessionResult;
    const writes: [string, string][] = [
      ['nemup_last_session', JSON.stringify(completedSession)],
      ['nemup_session_key', sessionKey],
      ['nemup_last_session_id', payload?.sessionId ?? ''],
    ];
    // Store the full skill path (all missions) so session.tsx can navigate between them
    if (payload?.pathId && Array.isArray(payload?.missions) && payload.missions.length > 0) {
      writes.push(['nemup_skill_path', JSON.stringify({
        pathId: payload.pathId,
        totalMissions: payload.totalMissions,
        missions: payload.missions,
      })]);
    }
    // Store desafio session independently for the Desafío mode (clear if not present)
    if (completedSession?.desafio) {
      writes.push(['nemup_desafio_session', JSON.stringify(completedSession.desafio)]);
      await AsyncStorage.multiSet(writes);
    } else {
      await AsyncStorage.multiSet(writes);
      await AsyncStorage.removeItem('nemup_desafio_session');
    }
    router.push('/modals/session' as any);
  };

  // ══════════════════════════════════════════════════════════════
  // SCREEN 2 — Tu misión está lista
  // ══════════════════════════════════════════════════════════════
  if (step === 2) {
    const s = completedSession;
    const allTopics: string[] = s?.summary?.slides?.map((sl: any) => sl.title) ?? [];
    const conceptCount = allTopics.length || 8;
    const xp     = s?.xpReward         ?? 60;
    const estMin = s?.estimatedDuration ?? 25;

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />

        {/* Confetti — fades out after 2s */}
        <Animated.View style={[StyleSheet.absoluteFill, confettiStyle]} pointerEvents="none">
          {CONFETTI.map((item, i) => <ConfettiPiece key={i} item={item} />)}
        </Animated.View>

        {/* Header */}
        <View style={sh.header}>
          <Pressable onPress={handleBack} style={sh.iconBtn} hitSlop={10}>
            <ArrowLeft size={16} color={semantic.textPrimary} strokeWidth={2.5} />
          </Pressable>
          <ShimmerProgress step={step} />
          <Pressable onPress={handleClose} style={sh.iconBtn} hitSlop={10}>
            <X size={16} color={semantic.textPrimary} strokeWidth={2.5} />
          </Pressable>
        </View>

        {/* Scrollable content */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s2.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <Animated.View style={[s2.heroBlock, s2Entry1Style]}>
            <Animated.View style={celebScaleAnim}>
              <Animated.View style={celebPulseAnim}>
                <Text style={s2.heroEmoji}>🚀</Text>
              </Animated.View>
            </Animated.View>
            <Text style={s2.title}>Tu misión está lista</Text>
            <Text style={s2.titleSub}>Generada a partir de tus apuntes</Text>
          </Animated.View>

          {/* Stats hero card */}
          <Animated.View style={[s2.statsCard, s2Entry2Style]}>
            <View style={s2.statItem}>
              <Text style={s2.statEmoji}>⏱</Text>
              <Text style={s2.statValue}>{estMin} min</Text>
              <Text style={s2.statLabel}>estimados</Text>
            </View>
            <View style={s2.statDivider} />
            <View style={s2.statItem}>
              <Text style={s2.statEmoji}>⚡</Text>
              <Text style={s2.statValue}>+{xp}</Text>
              <Text style={s2.statLabel}>XP</Text>
            </View>
            <View style={s2.statDivider} />
            <View style={s2.statItem}>
              <Text style={s2.statEmoji}>🎯</Text>
              <Text style={s2.statValue}>3</Text>
              <Text style={s2.statLabel}>modos</Text>
            </View>
          </Animated.View>

          {/* Concepts detected */}
          <Animated.View style={[s2.conceptsRow, s2Entry3Style]}>
            <View style={s2.conceptsBadge}>
              <Text style={s2.conceptsBadgeText}>🔍 {conceptCount} conceptos clave detectados</Text>
            </View>
          </Animated.View>

          {/* Study modes */}
          <Animated.View style={s2Entry4Style}>
            <Text style={s2.modesLabel}>Modos de estudio</Text>
            <View style={s2.modesRow}>
              {([
                { emoji: '📚', label: 'Misión' },
                { emoji: '🧠', label: 'Quiz' },
                { emoji: '🃏', label: 'Tarjetas' },
              ] as const).map(({ emoji, label }) => (
                <View key={label} style={s2.modeCard}>
                  <Text style={s2.modeEmoji}>{emoji}</Text>
                  <Text style={s2.modeLabel}>{label}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        </ScrollView>

        {/* CTA — sticky bottom */}
        <View style={[sh.bottom, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable onPress={handleStart} style={{ width: '100%' }}>
            <Animated.View style={ctaPulseAnim}>
              <View style={[sh.ctaBtn, { backgroundColor: LIME }]}>
                <Text style={[sh.ctaText, { color: palette.charcoal }]}>⚡ Comenzar misión</Text>
              </View>
            </Animated.View>
          </Pressable>
          <Pressable hitSlop={12} style={{ marginTop: 10, alignItems: 'center' }}>
            <Text style={s2.saveLink}>Guardar para después</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // SCREEN 1 — Preparando tu entrenamiento
  // ══════════════════════════════════════════════════════════════
  if (step === 1) {
    const stage = GEN_STAGES[stageIdx];
    const chipStyles = [chip1Style, chip2Style, chip3Style, chip4Style, chip5Style, chip6Style];
    const checkStyles = [check1Style, check2Style, check3Style];

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />

        <View style={sh.header}>
          <Pressable onPress={handleBack} style={sh.iconBtn} hitSlop={10}>
            <ArrowLeft size={16} color={semantic.textPrimary} strokeWidth={2.5} />
          </Pressable>
          <ShimmerProgress step={step} progressValue={progressFill} />
          <Pressable onPress={handleClose} style={sh.iconBtn} hitSlop={10}>
            <X size={16} color={semantic.textPrimary} strokeWidth={2.5} />
          </Pressable>
        </View>

        <View style={[s1.centerWrap, { paddingBottom: insets.bottom + 100 }]}>

          {/* Stage block — fades between stages */}
          <Animated.View style={[s1.stageBlock, stageAnimStyle]}>
            <Text style={s1.stageTitle}>{stage.title}</Text>

            {/* Stage 0: document scan */}
            {stageIdx === 0 && (
              <View style={s1.docCard}>
                <View style={s1.docCardHeader}>
                  <FileText size={13} color={BRAND} strokeWidth={2} />
                  <Text style={s1.docCardName} numberOfLines={1}>
                    {selectedFiles[0]?.name ?? 'apuntes.pdf'}
                  </Text>
                </View>
                <View style={s1.docLines}>
                  <Animated.View style={[s1.docLine, s1.docLineLong, docLine1Style]} />
                  <Animated.View style={[s1.docLine, s1.docLineMed,  docLine2Style]} />
                  <Animated.View style={[s1.docLine, s1.docLineLong, docLine3Style]} />
                  <View style={[s1.docLine, s1.docLineMed,  { backgroundColor: 'rgba(155,149,166,0.18)' }]} />
                  <View style={[s1.docLine, s1.docLineShort, { backgroundColor: 'rgba(155,149,166,0.18)' }]} />
                </View>
              </View>
            )}

            {/* Stage 1: concept chips */}
            {stageIdx === 1 && (
              <View style={s1.chipsGrid}>
                {CONCEPT_CHIPS.map((chip, i) => (
                  <Animated.View key={chip} style={[s1.conceptChip, chipStyles[i]]}>
                    <Text style={s1.conceptChipText}>{chip}</Text>
                  </Animated.View>
                ))}
              </View>
            )}

            {/* Stage 2: content checklist */}
            {stageIdx === 2 && (
              <View style={s1.checkList}>
                {BUILDING_ITEMS.map(({ emoji, label }, i) => (
                  <Animated.View key={label} style={[s1.checkItem, checkStyles[i]]}>
                    <View style={s1.checkCircle}>
                      <Check size={11} color={palette.blanco} strokeWidth={3} />
                    </View>
                    <Text style={s1.checkItemText}>{emoji} {label}</Text>
                  </Animated.View>
                ))}
              </View>
            )}

            {/* Stage 3: preparing — items appear one by one */}
            {stageIdx === 3 && (
              <View style={s1.checkList}>
                {PREPARING_LINES.map((line, i) => (
                  <Animated.View key={line} style={[s1.checkItem, checkStyles[i]]}>
                    <View style={s1.preparingDot} />
                    <Text style={s1.preparingItemText}>{line}</Text>
                  </Animated.View>
                ))}
              </View>
            )}

            {/* Sub-text */}
            <Text style={s1.stageSub}>{stage.sub}</Text>
          </Animated.View>

          {/* Progress bar + percentage */}
          <View style={s1.progressGroup}>
            <View style={s1.progressTrack}>
              <Animated.View style={[s1.progressFillWrap, progressFillStyle]}>
                <View style={{ flex: 1, borderRadius: 99, backgroundColor: BRAND }} />
              </Animated.View>
            </View>
            <Text style={s1.progressPct}>{displayPct}%</Text>
          </View>
        </View>

        {/* Error overlay */}
        {generationError && (
          <View style={[StyleSheet.absoluteFill, s1.errorBackdrop]}>
            <View style={s1.errorModal}>
              <Text style={s1.errorEmoji}>⚠️</Text>
              <Text style={s1.errorTitle}>No pudimos crear la sesión</Text>
              <Text style={s1.errorMsg}>{generationError ?? 'El archivo tiene muy poco contenido o no pudo procesarse.'}</Text>
              <Pressable
                onPress={() => { setStep(0); setGenerationError(null); }}
                style={s1.errorPrimaryWrap}
              >
                <View style={[s1.errorPrimaryBtn, { backgroundColor: BRAND }]}>
                  <Text style={s1.errorPrimaryText}>Elegir otro archivo</Text>
                </View>
              </Pressable>
            </View>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // SCREEN 0 — Crea tu misión
  // ══════════════════════════════════════════════════════════════
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <View style={sh.header}>
        <Pressable onPress={handleClose} style={sh.iconBtn} hitSlop={10}>
          <ArrowLeft size={16} color={semantic.textPrimary} strokeWidth={2.5} />
        </Pressable>
        <ShimmerProgress step={step} />
        <Pressable onPress={handleClose} style={sh.iconBtn} hitSlop={10}>
          <X size={16} color={semantic.textPrimary} strokeWidth={2.5} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: hasFiles ? insets.bottom + 90 : insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <Text style={s0.title}>Convierte tus apuntes{'\n'}en una misión</Text>
        <Text style={s0.tagline}>NEMup creará una misión personalizada, un quiz y tarjetas interactivas para ayudarte a estudiar.</Text>

        {!hasFiles ? (
          <>
            {/* Central flow visual */}
            <View style={s0.flowCard}>
              {/* Node: document */}
              <View style={s0.flowNodeRow}>
                <View style={s0.flowNodeIcon}>
                  <FileText size={20} color={BRAND} strokeWidth={1.8} />
                </View>
                <Text style={s0.flowNodeLabel}>Tus apuntes</Text>
              </View>

              <View style={s0.flowConnector}>
                <View style={s0.flowConnectorLine} />
                <ChevronDown size={14} color={palette.grisClaro} strokeWidth={2} style={{ marginTop: -6 }} />
              </View>

              {/* Node: AI */}
              <View style={s0.flowNodeRow}>
                <View style={[s0.flowNodeIcon, s0.flowNodeIconAi]}>
                  <Bot size={20} color={palette.blanco} strokeWidth={1.8} />
                </View>
                <View>
                  <Text style={s0.flowAiLabel}>NEMup IA</Text>
                  <Text style={s0.flowAiSub}>Analiza y crea contenido</Text>
                </View>
              </View>

              <View style={s0.flowConnector}>
                <View style={s0.flowConnectorLine} />
                <ChevronDown size={14} color={palette.grisClaro} strokeWidth={2} style={{ marginTop: -6 }} />
              </View>

              {/* Output trio */}
              <View style={s0.flowOutputRow}>
                {([
                  { Icon: BookOpen, label: 'Misión' },
                  { Icon: Brain,    label: 'Quiz' },
                  { Icon: Layers,   label: 'Tarjetas' },
                ] as const).map(({ Icon, label }) => (
                  <View key={label} style={s0.flowOutput}>
                    <View style={s0.flowOutputIcon}>
                      <Icon size={16} color={BRAND} strokeWidth={2} />
                    </View>
                    <Text style={s0.flowOutputLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Benefits */}
            <View style={s0.benefitsList}>
              {EMPTY_BENEFITS.map(({ Icon, label }) => (
                <View key={label} style={s0.benefitRow}>
                  <View style={s0.benefitIconWrap}>
                    <Icon size={13} color={BRAND} strokeWidth={2.2} />
                  </View>
                  <Text style={s0.benefitText}>{label}</Text>
                </View>
              ))}
            </View>

            {!!uploadError && <Text style={s0.error}>{uploadError}</Text>}

            {/* Primary CTA */}
            <Pressable onPress={handleFilePick} style={s0.primaryBtnWrap}>
              <View style={[s0.primaryBtn, { backgroundColor: BRAND }]}>
                <FileText size={16} color={palette.blanco} strokeWidth={2.2} style={{ marginRight: 6 }} />
                <Text style={s0.primaryBtnText}>Subir apuntes</Text>
              </View>
            </Pressable>

            {/* Secondary CTA */}
            <Pressable style={s0.cameraBtn} onPress={handleCameraPick}>
              <Text style={s0.cameraBtnText}>Tomar foto</Text>
            </Pressable>
          </>
        ) : (
          <Animated.View style={filesAnimStyle}>
            {/* Compact success state */}
            <View style={s0.compactSuccess}>
              <View style={s0.compactSuccessCheck}>
                <Check size={14} color={palette.blanco} strokeWidth={3} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s0.compactSuccessTitle}>
                  {selectedFiles.length === 1 ? 'Documento cargado' : `${selectedFiles.length} documentos cargados`}
                </Text>
                <Text style={s0.compactSuccessSub}>Todo listo para crear tu misión.</Text>
              </View>
            </View>

            {/* File card(s) */}
            {selectedFiles.map(file => (
              <View key={file.uri} style={s0.fileCard}>
                <FileTypeBadge mimeType={file.mimeType} />
                <View style={{ flex: 1 }}>
                  <Text style={s0.fileCardName} numberOfLines={1}>{file.name}</Text>
                  <Text style={s0.fileCardMeta}>{file.sizeText}</Text>
                </View>
                <Pressable onPress={() => removeFile(file.uri)} hitSlop={8} style={s0.removeBtn}>
                  <X size={13} color={semantic.textTertiary} strokeWidth={2.5} />
                </Pressable>
              </View>
            ))}

            {/* Add more */}
            <Pressable onPress={handleFilePick} style={s0.addMoreBtn}>
              <Plus size={15} color={BRAND} strokeWidth={2.5} />
              <Text style={s0.addMoreText}>Agregar otro documento</Text>
            </Pressable>

            {/* Session preview */}
            <View style={s0.sessionCard}>
              <Text style={s0.sessionCardTitle}>Tu misión incluirá</Text>
              {SESSION_ITEMS.map(({ Icon, label }) => (
                <View key={label} style={s0.sessionCardRow}>
                  <View style={s0.benefitIconWrap}>
                    <Icon size={13} color={BRAND} strokeWidth={2.2} />
                  </View>
                  <Text style={s0.sessionCardText}>{label}</Text>
                </View>
              ))}
            </View>

            {!!uploadError && <Text style={s0.error}>{uploadError}</Text>}
          </Animated.View>
        )}
      </ScrollView>

      {hasFiles && (
        <Animated.View style={[sh.bottom, { paddingBottom: insets.bottom + 12, gap: 10 }, filesAnimStyle]}>
          <Pressable onPress={handleContinue} style={{ width: '100%' }}>
            <View style={[sh.ctaBtn, { backgroundColor: BRAND }]}>
              <Text style={sh.ctaText}>🚀 Crear misión</Text>
            </View>
          </Pressable>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

// ── Shared ────────────────────────────────────────────────────────
const sh = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  iconBtn: { width: 36, height: 36, borderRadius: 11, backgroundColor: palette.blanco, borderWidth: 1, borderColor: palette.bordeClaro, alignItems: 'center', justifyContent: 'center' },
  bottom:  { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.bordeClaro, backgroundColor: BG },
  ctaBtn:  { paddingVertical: 17, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 16, fontWeight: '800', color: palette.blanco },
});

// ── Screen 0 ──────────────────────────────────────────────────────
const s0 = StyleSheet.create({
  title:   { fontSize: SM ? 24 : 28, fontWeight: '900', color: semantic.textPrimary, letterSpacing: -0.5, marginBottom: 8, lineHeight: SM ? 30 : 34 },
  tagline: { fontSize: 14, color: semantic.textSecondary, lineHeight: 21, marginBottom: 18 },

  // Flow visual card
  flowCard:          { backgroundColor: palette.blanco, borderRadius: 20, borderWidth: 1, borderColor: palette.bordeClaro, padding: 18, marginBottom: 16, alignItems: 'flex-start' },
  flowNodeRow:       { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flowNodeIcon:      { width: 40, height: 40, borderRadius: 12, backgroundColor: palette.moradoBg, alignItems: 'center', justifyContent: 'center' },
  flowNodeIconAi:    { backgroundColor: BRAND },
  flowNodeLabel:     { fontSize: 14, fontWeight: '700', color: semantic.textPrimary },
  flowAiLabel:       { fontSize: 14, fontWeight: '700', color: semantic.textPrimary },
  flowAiSub:         { fontSize: 12, color: semantic.textTertiary, marginTop: 1 },
  flowConnector:     { alignItems: 'center', paddingLeft: 19, paddingVertical: 2 },
  flowConnectorLine: { width: 1, height: 10, backgroundColor: palette.bordeMedio },
  flowOutputRow:     { flexDirection: 'row', gap: 8, marginTop: 2, width: '100%' },
  flowOutput:        { flex: 1, alignItems: 'center', gap: 5, backgroundColor: palette.moradoBg, borderRadius: 12, paddingVertical: 10 },
  flowOutputIcon:    { width: 30, height: 30, borderRadius: 9, backgroundColor: 'rgba(91,61,245,0.12)', alignItems: 'center', justifyContent: 'center' },
  flowOutputLabel:   { fontSize: 12, fontWeight: '700', color: BRAND },

  // Benefits list
  benefitsList:    { gap: 8, marginBottom: 18 },
  benefitRow:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitIconWrap: { width: 28, height: 28, borderRadius: 9, backgroundColor: 'rgba(91,61,245,0.08)', alignItems: 'center', justifyContent: 'center' },
  benefitText:     { fontSize: 14, color: semantic.textPrimary, fontWeight: '600', flex: 1 },

  error: { color: palette.rojoError, fontSize: 12, fontWeight: '700', marginBottom: 10 },

  primaryBtnWrap: { width: '100%', marginBottom: 10 },
  primaryBtn:     { paddingVertical: 17, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  primaryBtnText: { fontSize: 16, fontWeight: '800', color: palette.blanco },

  cameraBtn:     { borderRadius: 14, borderWidth: 1, borderColor: palette.bordeMedio, paddingVertical: 15, alignItems: 'center', marginBottom: 14, backgroundColor: palette.crema },
  cameraBtnText: { fontSize: 14, fontWeight: '600', color: semantic.textSecondary },

  // Loaded state
  compactSuccess:      { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(29,158,117,0.07)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(29,158,117,0.2)', paddingVertical: 11, paddingHorizontal: 14, marginBottom: 12 },
  compactSuccessCheck: { width: 26, height: 26, borderRadius: 13, backgroundColor: palette.verde, alignItems: 'center', justifyContent: 'center' },
  compactSuccessTitle: { fontSize: 14, fontWeight: '800', color: semantic.textPrimary },
  compactSuccessSub:   { fontSize: 12, color: semantic.textSecondary, marginTop: 1 },

  fileCard:     { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.blanco, borderRadius: 16, borderWidth: 1, borderColor: palette.bordeClaro, paddingVertical: 10, paddingHorizontal: 14, gap: 12, marginBottom: 8 },
  fileCardName: { fontSize: 13, fontWeight: '700', color: semantic.textPrimary, marginBottom: 1 },
  fileCardMeta: { fontSize: 11, color: semantic.textTertiary },
  removeBtn:    { width: 26, height: 26, borderRadius: 8, backgroundColor: palette.crema, alignItems: 'center', justifyContent: 'center' },

  addMoreBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(91,61,245,0.25)', borderStyle: 'dashed', paddingVertical: 13, marginTop: 2, marginBottom: 12, backgroundColor: 'rgba(91,61,245,0.03)' },
  addMoreText: { fontSize: 14, fontWeight: '700', color: BRAND },

  sessionCard:      { backgroundColor: palette.moradoBg, borderRadius: 16, borderWidth: 1, borderColor: palette.moradoBg, padding: 14, marginBottom: 4, gap: 8 },
  sessionCardTitle: { fontSize: 13, fontWeight: '800', color: semantic.textPrimary, marginBottom: 2 },
  sessionCardRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sessionCardText:  { fontSize: 13, color: semantic.textPrimary, fontWeight: '600', flex: 1 },
});

// ── Screen 1 ──────────────────────────────────────────────────────
const s1 = StyleSheet.create({
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 20 },

  stageBlock: { alignItems: 'center', gap: 10, width: '100%' },
  stageTitle: { fontSize: SM ? 20 : 23, fontWeight: '900', color: semantic.textPrimary, textAlign: 'center', letterSpacing: -0.4 },
  stageSub:   { fontSize: SM ? 13 : 14, color: semantic.textSecondary, textAlign: 'center', lineHeight: 20, marginTop: 4 },

  // Stage 0 — document scan
  docCard:       { width: '100%', backgroundColor: palette.blanco, borderRadius: 16, borderWidth: 1, borderColor: palette.bordeClaro, padding: 14, gap: 8, marginTop: 10 },
  docCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 2 },
  docCardName:   { fontSize: 12, fontWeight: '700', color: semantic.textSecondary, flex: 1 },
  docLines:      { gap: 9 },
  docLine:       { height: 10, borderRadius: 6 },
  docLineLong:   { width: '100%' },
  docLineMed:    { width: '72%' },
  docLineShort:  { width: '50%' },

  // Stage 1 — concept chips
  chipsGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 12, width: '100%' },
  conceptChip:     { backgroundColor: palette.moradoBg, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(91,61,245,0.18)' },
  conceptChipText: { fontSize: 13, fontWeight: '700', color: BRAND },

  // Stages 2 & 3 — checklist / preparing list
  checkList:        { width: '100%', gap: 10, marginTop: 12 },
  checkItem:        { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkCircle:      { width: 22, height: 22, borderRadius: 11, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' },
  checkItemText:    { fontSize: 15, fontWeight: '700', color: semantic.textPrimary },
  preparingDot:     { width: 8, height: 8, borderRadius: 4, backgroundColor: BRAND, marginLeft: 7 },
  preparingItemText:{ fontSize: 14, color: semantic.textSecondary, fontWeight: '600', flex: 1 },

  progressGroup:    { width: '100%', alignItems: 'flex-end', gap: 6 },
  progressTrack:    { width: '100%', height: 8, backgroundColor: palette.bordeClaro, borderRadius: 99, overflow: 'hidden' },
  progressFillWrap: { height: '100%', borderRadius: 99, overflow: 'hidden', minWidth: 8 },
  progressPct:      { fontSize: 12, fontWeight: '800', color: BRAND },

  errorBackdrop:    { backgroundColor: 'rgba(11,11,26,0.6)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, zIndex: 100 },
  errorModal:       { backgroundColor: palette.blanco, borderRadius: 28, padding: 28, alignItems: 'center', gap: 10, width: '100%' },
  errorEmoji:       { fontSize: 48, marginBottom: 2 },
  errorTitle:       { fontSize: SM ? 20 : 22, fontWeight: '900', color: semantic.textPrimary, letterSpacing: -0.3, textAlign: 'center' },
  errorMsg:         { fontSize: 14, color: semantic.textSecondary, lineHeight: 21, textAlign: 'center', marginBottom: 6 },
  errorPrimaryWrap: { width: '100%', borderRadius: 18, overflow: 'hidden' },
  errorPrimaryBtn:  { paddingVertical: 17, alignItems: 'center' as const },
  errorPrimaryText: { fontSize: 16, fontWeight: '800', color: palette.blanco },
});

// ── Screen 2 ──────────────────────────────────────────────────────
const s2 = StyleSheet.create({
  scrollContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, gap: 14 },

  heroBlock: { alignItems: 'center', gap: 6, paddingTop: SM ? 8 : 16 },
  heroEmoji: { fontSize: SM ? 52 : 64, marginBottom: 2 },
  title:     { fontSize: SM ? 22 : 26, fontWeight: '900', color: semantic.textPrimary, letterSpacing: -0.5, textAlign: 'center' },
  titleSub:  { fontSize: 14, color: semantic.textSecondary, textAlign: 'center' },

  statsCard:   { backgroundColor: palette.blanco, borderRadius: 20, borderWidth: 1, borderColor: palette.bordeClaro, flexDirection: 'row', paddingVertical: 14 },
  statItem:    { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 4 },
  statEmoji:   { fontSize: 22, marginBottom: 2 },
  statValue:   { fontSize: SM ? 17 : 20, fontWeight: '900', color: semantic.textPrimary, letterSpacing: -0.4 },
  statLabel:   { fontSize: 11, fontWeight: '600', color: semantic.textTertiary },
  statDivider: { width: 1, backgroundColor: palette.bordeClaro, marginVertical: 8 },

  conceptsRow:       { alignItems: 'center' },
  conceptsBadge:     { backgroundColor: 'rgba(91,61,245,0.07)', borderRadius: 999, paddingVertical: 9, paddingHorizontal: 18, borderWidth: 1, borderColor: 'rgba(91,61,245,0.15)' },
  conceptsBadgeText: { fontSize: 14, fontWeight: '700', color: BRAND },

  modesLabel: { fontSize: 13, fontWeight: '800', color: semantic.textPrimary, marginBottom: 10 },
  modesRow:   { flexDirection: 'row', gap: 10 },
  modeCard:   { flex: 1, backgroundColor: palette.blanco, borderRadius: 16, borderWidth: 1, borderColor: palette.bordeClaro, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', gap: 6 },
  modeEmoji:  { fontSize: 22 },
  modeLabel:  { fontSize: 13, fontWeight: '700', color: semantic.textPrimary },

  saveLink: { fontSize: 13, fontWeight: '500', color: semantic.textTertiary, textAlign: 'center' },
});
