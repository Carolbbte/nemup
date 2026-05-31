import { Colors } from '@/constants/Colors';
import { useOnboarding } from '@/contexts/OnboardingContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ArrowLeft,
  BookOpen,
  Brain,
  FileText,
  ImageIcon,
  Plus,
  Target,
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
const BG    = '#F8F9FC';
const BRAND = '#5B3DF5';
const NEON  = '#7C5AFF';
const LIME  = '#C4F852';

// ── Types ─────────────────────────────────────────────────────────
type UploadedFile = {
  uri: string; name: string; mimeType: string; sizeText: string; sizeBytes: number;
};
// ── Constants ─────────────────────────────────────────────────────
const BACKEND_BASE_URL = 'https://nemup-production.up.railway.app';
const GRAD_UPLOAD = ['#5B3DF5', '#F45BA5'] as const;

const UPLOAD_CHIPS = ['📚 Resúmenes', '🧠 Quiz', '⚡ XP'] as const;

const EMPTY_BENEFITS = [
  { Icon: BookOpen, label: 'Resumen inteligente' },
  { Icon: Brain,    label: 'Quiz personalizado' },
  { Icon: Zap,      label: 'XP por completar actividades' },
];


const GEN_STAGES = [
  { Icon: BookOpen, title: 'Analizando apuntes',  sub: 'Buscando los temas más importantes.' },
  { Icon: Brain,    title: 'Detectando conceptos', sub: 'Identificando ideas clave para practicar.' },
  { Icon: Target,   title: 'Creando desafíos',     sub: 'Generando preguntas adaptadas a ti.' },
  { Icon: Zap,      title: 'Finalizando',           sub: 'Preparando tu sesión personalizada.' },
];

const STAGE_PROGRESS = [0.25, 0.50, 0.75, 1.0] as const;

const MOTIV_PILLS = [
  '📚 Estamos encontrando los temas más importantes para tu prueba.',
  '🧠 Identificando conceptos que podrían aparecer en la evaluación.',
  '🎯 Personalizando ejercicios para reforzar tus puntos débiles.',
  '⚡ Tu entrenamiento personalizado está casi listo.',
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
    <View style={{ flex: 1, height: 5, backgroundColor: Colors.line, borderRadius: 99, overflow: 'hidden', marginHorizontal: 10 }}>
      <Animated.View style={[{ height: '100%', borderRadius: 99, overflow: 'hidden' }, fillStyle]}>
        <LinearGradient colors={[BRAND, NEON]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
        <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: 60 }, shimmerStyle]}>
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.55)', 'transparent']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
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
  const [motivIdx, setMotivIdx]               = useState(0);
  const [displayPct, setDisplayPct]           = useState(0);
  const [recentExpanded, setRecentExpanded]   = useState(false);
  const [recentFiles, setRecentFiles]         = useState<UploadedFile[]>([]);

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
  const stageOpacity  = useSharedValue(1);
  const stageScale    = useSharedValue(1);
  const progressFill  = useSharedValue(0);
  const motivOpacity  = useSharedValue(1);
  const celebScale    = useSharedValue(0);
  const celebPulse    = useSharedValue(1);
  const ctaPulse      = useSharedValue(0);
  const s2Entry1      = useSharedValue(0);
  const s2Entry2      = useSharedValue(0);
  const s2Entry3      = useSharedValue(0);
  const s2Entry4         = useSharedValue(0);
  const iconPulse        = useSharedValue(1);
  const iconRotate       = useSharedValue(0);
  const iconGlow         = useSharedValue(0);
  const confettiOpacity  = useSharedValue(1);
  const filesAnim        = useSharedValue(0);

  // ── Animated styles (ALL unconditional) ───────────────────────
  const stageAnimStyle  = useAnimatedStyle(() => ({
    opacity: stageOpacity.value,
    transform: [{ scale: stageScale.value }],
  }));
  const progressFillStyle = useAnimatedStyle(() => ({ width: `${progressFill.value * 100}%` as any }));
  const motivAnimStyle  = useAnimatedStyle(() => ({ opacity: motivOpacity.value }));
  const celebScaleAnim  = useAnimatedStyle(() => ({ transform: [{ scale: celebScale.value }] }));
  const celebPulseAnim  = useAnimatedStyle(() => ({ transform: [{ scale: celebPulse.value }] }));
  const ctaPulseAnim    = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + ctaPulse.value * 0.013 }],
    shadowOpacity: 0.22 + ctaPulse.value * 0.14,
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
  const iconPulseStyle  = useAnimatedStyle(() => ({ transform: [{ scale: iconPulse.value }] }));
  const iconRotateStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${iconRotate.value}deg` }] }));
  const iconGlowStyle   = useAnimatedStyle(() => ({
    shadowOpacity: iconGlow.value * 0.45,
    shadowRadius:  8 + iconGlow.value * 10,
    shadowColor:   BRAND,
    shadowOffset:  { width: 0, height: 0 },
    elevation:     iconGlow.value * 10,
  }));
  const confettiStyle   = useAnimatedStyle(() => ({ opacity: confettiOpacity.value }));
  const filesAnimStyle    = useAnimatedStyle(() => ({
    opacity:   filesAnim.value,
    transform: [{ translateY: (1 - filesAnim.value) * 8 }],
  }));

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
    setMotivIdx(0);
    motivOpacity.value = 1;

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
          runOnJS(setMotivIdx)(next % MOTIV_PILLS.length);
          stageOpacity.value = withTiming(1, { duration: 280 });
          stageScale.value   = withSpring(1, { damping: 14, stiffness: 200 });
          motivOpacity.value = withTiming(1, { duration: 350 });
          const target = STAGE_PROGRESS[Math.min(next, STAGE_PROGRESS.length - 1)];
          if (target > progressTargetRef.current) {
            progressTargetRef.current = target;
            progressFill.value = withTiming(target, { duration: 500, easing: Easing.out(Easing.cubic) });
          }
        }
      });
      stageScale.value  = withTiming(0.82, { duration: 220 });
      motivOpacity.value = withTiming(0, { duration: 220 });
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

  // Per-stage icon microanimation
  useEffect(() => {
    if (step !== 1) return;
    iconPulse.value  = 1;
    iconRotate.value = 0;
    iconGlow.value   = 0;
    if (stageIdx === 0) {
      iconPulse.value = withRepeat(
        withSequence(
          withTiming(1.07, { duration: 900, easing: Easing.inOut(Easing.sin) }),
          withTiming(1.00, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        ), -1, false,
      );
    } else if (stageIdx === 1) {
      iconPulse.value = withRepeat(
        withSequence(
          withTiming(1.04, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
          withTiming(1.00, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
        ), -1, false,
      );
      iconGlow.value = withRepeat(
        withSequence(
          withTiming(1,   { duration: 1000 }),
          withTiming(0.3, { duration: 1000 }),
        ), -1, false,
      );
    } else if (stageIdx === 2) {
      iconPulse.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 700, easing: Easing.out(Easing.cubic) }),
          withTiming(1.00, { duration: 700, easing: Easing.in(Easing.cubic) }),
        ), -1, false,
      );
      iconRotate.value = withRepeat(
        withSequence(
          withTiming(10,  { duration: 600, easing: Easing.inOut(Easing.sin) }),
          withTiming(-10, { duration: 600, easing: Easing.inOut(Easing.sin) }),
          withTiming(0,   { duration: 300, easing: Easing.inOut(Easing.sin) }),
        ), -1, false,
      );
    } else {
      iconPulse.value = withRepeat(
        withSequence(
          withTiming(1.10, { duration: 350, easing: Easing.out(Easing.cubic) }),
          withTiming(1.00, { duration: 350, easing: Easing.in(Easing.cubic) }),
        ), -1, false,
      );
      iconGlow.value = withRepeat(
        withSequence(
          withTiming(1,   { duration: 350 }),
          withTiming(0.2, { duration: 350 }),
        ), -1, false,
      );
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
    await AsyncStorage.setItem('nemup_last_session', JSON.stringify(completedSession));
    router.push('/modals/session' as any);
  };

  // ══════════════════════════════════════════════════════════════
  // SCREEN 2 — Tu entrenamiento está listo
  // ══════════════════════════════════════════════════════════════
  if (step === 2) {
    const s = completedSession;
    const allTopics: string[] = s?.summary?.slides?.map((sl: any) => sl.title) ?? [
      'Conceptos del tema',
      'Ideas principales',
      'Material estudiado',
    ];
    const visibleTopics = allTopics.slice(0, 3);
    const extraCount    = Math.max(0, allTopics.length - 3);
    const xp   = s?.xpReward  ?? 45;
    const gems = s?.gemReward ?? 10;

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
            <ArrowLeft size={16} color={Colors.ink} strokeWidth={2.5} />
          </Pressable>
          <ShimmerProgress step={step} />
          <Pressable onPress={handleClose} style={sh.iconBtn} hitSlop={10}>
            <X size={16} color={Colors.ink} strokeWidth={2.5} />
          </Pressable>
        </View>

        {/* Content */}
        <View style={[s2.content, { paddingBottom: insets.bottom + 24 }]}>

          {/* 1. Hero */}
          <Animated.View style={[s2.heroBlock, s2Entry1Style]}>
            <Animated.View style={celebScaleAnim}>
              <Animated.View style={celebPulseAnim}>
                <Text style={s2.heroEmoji}>🎉</Text>
              </Animated.View>
            </Animated.View>
            <Text style={s2.title}>¡Tu entrenamiento está listo!</Text>
          </Animated.View>

          {/* 2. Compact success badge */}
          <Animated.View style={[s2.successBadge, s2Entry2Style]}>
            <Text style={s2.successText}>✅ Entrenamiento listo</Text>
          </Animated.View>

          {/* 3. Rewards row */}
          <Animated.View style={[s2.rewardsRow, s2Entry2Style]}>
            <View style={s2.rewardCard}>
              <Text style={s2.rewardEmoji}>⚡</Text>
              <Text style={s2.rewardVal}>+{xp}</Text>
              <Text style={s2.rewardLbl}>XP</Text>
            </View>
            <View style={s2.rewardCard}>
              <Text style={s2.rewardEmoji}>💎</Text>
              <Text style={s2.rewardVal}>+{gems}</Text>
              <Text style={s2.rewardLbl}>Gemas</Text>
            </View>
            <View style={s2.rewardCard}>
              <Text style={s2.rewardEmoji}>🔥</Text>
              <Text style={s2.rewardVal}>Racha</Text>
              <Text style={s2.rewardLbl}>activa</Text>
            </View>
          </Animated.View>

          {/* 4. Topics */}
          <Animated.View style={s2Entry3Style}>
            <Text style={s2.sectionLabel}>📚 Temas que aprenderás</Text>
            <View style={s2.chipsWrap}>
              {visibleTopics.map((topic, i) => (
                <View key={i} style={s2.topicChip}>
                  <Text style={s2.topicChipText} numberOfLines={1}>{topic}</Text>
                </View>
              ))}
              {extraCount > 0 && (
                <View style={s2.topicChipMore}>
                  <Text style={s2.topicChipMoreText}>+{extraCount} más</Text>
                </View>
              )}
            </View>
          </Animated.View>

          {/* 5. Session preview */}
          <Animated.View style={s2Entry4Style}>
            <Text style={s2.sectionLabel}>📦 Esta sesión incluye</Text>
            <View style={s2.previewRow}>
              {(['📚 Resumen', '🧠 Quiz', '🃏 Tarjetas', '⚡ XP'] as const).map(chip => (
                <View key={chip} style={s2.previewChip}>
                  <Text style={s2.previewChipText}>{chip}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        </View>

        {/* CTA */}
        <View style={[sh.bottom, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable onPress={handleStart} style={{ width: '100%' }}>
            <Animated.View style={ctaPulseAnim}>
              <LinearGradient colors={[...GRAD_UPLOAD]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={sh.ctaBtn}>
                <Text style={sh.ctaText}>⚡ Practicar ahora</Text>
              </LinearGradient>
            </Animated.View>
          </Pressable>
          <Pressable hitSlop={12} style={{ marginTop: 10 }}>
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
    const { Icon } = stage;

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />

        <View style={sh.header}>
          <Pressable onPress={handleBack} style={sh.iconBtn} hitSlop={10}>
            <ArrowLeft size={16} color={Colors.ink} strokeWidth={2.5} />
          </Pressable>
          <ShimmerProgress step={step} progressValue={progressFill} />
          <Pressable onPress={handleClose} style={sh.iconBtn} hitSlop={10}>
            <X size={16} color={Colors.ink} strokeWidth={2.5} />
          </Pressable>
        </View>

        {/* Main content — single unified block */}
        <View style={[s1.centerWrap, { paddingBottom: insets.bottom + 100 }]}>

          {/* Icon + title + sub — animated between stages */}
          <Animated.View style={[s1.stageBlock, stageAnimStyle]}>
            <Animated.View style={[s1.iconWrap, iconGlowStyle]}>
              <Animated.View style={iconPulseStyle}>
                <Animated.View style={iconRotateStyle}>
                  <Icon size={56} color={BRAND} strokeWidth={1.5} />
                </Animated.View>
              </Animated.View>
            </Animated.View>
            <Text style={s1.stageTitle}>{stage.title}</Text>
            <Text style={s1.stageSub}>{stage.sub}</Text>
          </Animated.View>

          {/* Progress bar + percentage */}
          <View style={s1.progressGroup}>
            <View style={s1.progressTrack}>
              <Animated.View style={[s1.progressFillWrap, progressFillStyle]}>
                <LinearGradient colors={[BRAND, NEON]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1, borderRadius: 99 }} />
              </Animated.View>
            </View>
            <Text style={s1.progressPct}>{displayPct}%</Text>
          </View>

          {/* Reward pill — synced with stage */}
          <Animated.View style={[s1.motivPill, motivAnimStyle]}>
            <Text style={s1.motivPillText}>{MOTIV_PILLS[motivIdx]}</Text>
          </Animated.View>
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
                <LinearGradient colors={[...GRAD_UPLOAD]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s1.errorPrimaryBtn}>
                  <Text style={s1.errorPrimaryText}>Elegir otro archivo</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // SCREEN 0 — Sube tus documentos
  // ══════════════════════════════════════════════════════════════
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <View style={sh.header}>
        <Pressable onPress={handleClose} style={sh.iconBtn} hitSlop={10}>
          <ArrowLeft size={16} color={Colors.ink} strokeWidth={2.5} />
        </Pressable>
        <ShimmerProgress step={step} />
        <Pressable onPress={handleClose} style={sh.iconBtn} hitSlop={10}>
          <X size={16} color={Colors.ink} strokeWidth={2.5} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: hasFiles ? insets.bottom + 90 : insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <Text style={s0.title}>Sube tus apuntes</Text>
        <Text style={s0.tagline}>Convierte tus apuntes en una sesión interactiva de estudio.</Text>

        {/* Benefits label + chips */}
        <Text style={s0.benefitsLabel}>✨ Tu sesión incluirá</Text>
        <View style={s0.chipsRow}>
          {UPLOAD_CHIPS.map(chip => (
            <View key={chip} style={s0.chip}>
              <Text style={s0.chipText}>{chip}</Text>
            </View>
          ))}
        </View>

        {!hasFiles ? (
          <>
            {/* Empty state with benefits */}
            <View style={s0.emptyBlock}>
              <Text style={s0.emptyIcon}>📚</Text>
              <Text style={s0.emptyTitle}>Sube un documento para comenzar</Text>
              <Text style={s0.emptySub}>NEMup creará una sesión personalizada en menos de un minuto.</Text>
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
              <Text style={s0.trustLine}>Más de 1.200 sesiones creadas por estudiantes</Text>
            </View>

            {!!uploadError && <Text style={s0.error}>{uploadError}</Text>}

            {/* Primary CTA */}
            <Pressable onPress={handleFilePick} style={s0.primaryBtnWrap}>
              <LinearGradient colors={[...GRAD_UPLOAD]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s0.primaryBtn}>
                <Text style={s0.primaryBtnText}>🚀 Subir apuntes</Text>
              </LinearGradient>
            </Pressable>

            {/* Secondary CTA */}
            <Pressable style={s0.cameraBtn} onPress={handleCameraPick}>
              <Text style={s0.cameraBtnText}>📷 Tomar foto</Text>
            </Pressable>
          </>
        ) : (
          <Animated.View style={filesAnimStyle}>
            {/* Selection summary */}
            <View style={s0.summaryBlock}>
              <Text style={s0.summaryCheck}>✅ Todo listo para practicar</Text>
              <Text style={s0.summarySub}>
                {selectedFiles.length} {selectedFiles.length === 1 ? 'documento cargado' : 'documentos cargados'}
              </Text>
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
                  <X size={13} color={Colors.muted} strokeWidth={2.5} />
                </Pressable>
              </View>
            ))}

            {/* Add more */}
            <Pressable onPress={handleFilePick} style={s0.addMoreBtn}>
              <Plus size={15} color={BRAND} strokeWidth={2.5} />
              <Text style={s0.addMoreText}>Agregar otro documento</Text>
            </Pressable>

            {/* Session preview card */}
            <View style={s0.sessionCard}>
              <Text style={s0.sessionCardTitle}>🎯 Tu sesión tendrá</Text>
              {EMPTY_BENEFITS.map(({ Icon, label }) => (
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
          <View style={s0.xpRewardPill}>
            <Text style={s0.xpRewardText}>⚡ Completa esta práctica para ganar XP</Text>
          </View>
          <Pressable onPress={handleContinue} style={{ width: '100%' }}>
            <LinearGradient colors={[...GRAD_UPLOAD]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={sh.ctaBtn}>
              <Text style={sh.ctaText}>🚀 Crear sesión</Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

// ── Shared ────────────────────────────────────────────────────────
const sh = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  iconBtn: { width: 36, height: 36, borderRadius: 11, backgroundColor: 'white', borderWidth: 1, borderColor: Colors.line, alignItems: 'center', justifyContent: 'center', shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 5, elevation: 2 },
  bottom:  { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.line, backgroundColor: BG },
  ctaBtn:  { paddingVertical: 17, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 16, fontWeight: '800', color: 'white' },
});

// ── Screen 0 ──────────────────────────────────────────────────────
const s0 = StyleSheet.create({
  title:   { fontSize: SM ? 24 : 28, fontWeight: '900', color: Colors.ink, letterSpacing: -0.5, marginBottom: 6 },
  tagline: { fontSize: 14, color: Colors.ink3, lineHeight: 21, marginBottom: 14 },

  benefitsLabel: { fontSize: 12, fontWeight: '700', color: Colors.ink3, letterSpacing: 0.3, marginBottom: 8 },
  chipsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  chip:     { backgroundColor: 'rgba(91,61,245,0.07)', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 13, borderWidth: 1, borderColor: 'rgba(91,61,245,0.14)' },
  chipText: { fontSize: 13, fontWeight: '700', color: BRAND },

  emptyBlock: { borderRadius: 24, backgroundColor: '#F8F6FF', borderWidth: 1, borderColor: 'rgba(91,61,245,0.1)', paddingVertical: 20, paddingHorizontal: 22, alignItems: 'center', marginBottom: 20, justifyContent: 'center' },
  emptyIcon:  { fontSize: 44, marginBottom: 10 },
  emptyTitle: { fontSize: SM ? 15 : 17, fontWeight: '800', color: Colors.ink, letterSpacing: -0.3, textAlign: 'center', marginBottom: 6 },
  emptySub:   { fontSize: 13, color: Colors.ink3, lineHeight: 19, textAlign: 'center' },

  benefitsList:   { width: '100%', marginTop: 14, gap: 8 },
  benefitRow:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitIconWrap:{ width: 24, height: 24, borderRadius: 8, backgroundColor: 'rgba(91,61,245,0.10)', alignItems: 'center', justifyContent: 'center' },
  benefitText:    { fontSize: 13, color: Colors.ink, fontWeight: '700', flex: 1 },
  trustLine:      { fontSize: 11, color: Colors.muted, textAlign: 'center', marginTop: 14, fontWeight: '500' },

  primaryBtnWrap:  { width: '100%', marginBottom: 12 },
  primaryBtn:      { paddingVertical: 19, borderRadius: 18, alignItems: 'center', justifyContent: 'center', shadowColor: '#5B3DF5', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 20, elevation: 10 },
  primaryBtnText:  { fontSize: 17, fontWeight: '900', color: 'white', letterSpacing: 0.2 },

  cameraBtn:     { backgroundColor: 'white', borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(91,61,245,0.2)', paddingVertical: 15, alignItems: 'center', marginBottom: 14 },
  cameraBtnText: { fontSize: 14, fontWeight: '700', color: BRAND },

  error: { color: Colors.rose, fontSize: 12, fontWeight: '700', marginBottom: 10 },

  summaryBlock: { backgroundColor: '#F0EDFF', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(91,61,245,0.15)', paddingVertical: 12, paddingHorizontal: 16, marginBottom: 12 },
  summaryCheck: { fontSize: 14, fontWeight: '800', color: Colors.ink, marginBottom: 2 },
  summarySub:   { fontSize: 12, color: Colors.ink3, fontWeight: '600' },

  fileCard:     { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: Colors.line, paddingVertical: 10, paddingHorizontal: 14, gap: 12, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, marginBottom: 8 },
  fileCardName: { fontSize: 13, fontWeight: '700', color: Colors.ink, marginBottom: 1 },
  fileCardMeta: { fontSize: 11, color: Colors.muted },
  removeBtn:    { width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.bgSoft, alignItems: 'center', justifyContent: 'center' },

  addMoreBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(91,61,245,0.25)', borderStyle: 'dashed', paddingVertical: 13, marginTop: 2, marginBottom: 12, backgroundColor: 'rgba(91,61,245,0.03)' },
  addMoreText: { fontSize: 14, fontWeight: '700', color: BRAND },

  sessionCard:      { backgroundColor: '#F3EEFF', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(91,61,245,0.13)', padding: 14, marginBottom: 4, gap: 8 },
  sessionCardTitle: { fontSize: 13, fontWeight: '800', color: Colors.ink, marginBottom: 2 },
  sessionCardRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sessionCardText:  { fontSize: 13, color: Colors.ink2, fontWeight: '600', flex: 1 },

  xpRewardPill: { backgroundColor: 'rgba(196,248,82,0.15)', borderRadius: 99, borderWidth: 1, borderColor: 'rgba(196,248,82,0.4)', paddingVertical: 8, paddingHorizontal: 16, alignItems: 'center' },
  xpRewardText: { fontSize: 13, fontWeight: '700', color: '#2D6A00' },
});

// ── Screen 1 ──────────────────────────────────────────────────────
const s1 = StyleSheet.create({
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 20 },

  stageBlock: { alignItems: 'center', gap: 10, width: '100%' },
  iconWrap:   { width: 88, height: 88, borderRadius: 24, backgroundColor: 'rgba(91,61,245,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  stageTitle: { fontSize: SM ? 20 : 23, fontWeight: '900', color: Colors.ink, textAlign: 'center', letterSpacing: -0.4 },
  stageSub:   { fontSize: SM ? 13 : 14, color: Colors.ink3, textAlign: 'center', lineHeight: 20 },

  progressGroup:    { width: '100%', alignItems: 'flex-end', gap: 6 },
  progressTrack:    { width: '100%', height: 8, backgroundColor: Colors.line, borderRadius: 99, overflow: 'hidden' },
  progressFillWrap: { height: '100%', borderRadius: 99, overflow: 'hidden', minWidth: 8 },
  progressPct:      { fontSize: 12, fontWeight: '800', color: BRAND },

  motivPill:     { backgroundColor: 'rgba(196,248,82,0.12)', borderRadius: 99, borderWidth: 1, borderColor: 'rgba(196,248,82,0.35)', paddingVertical: 10, paddingHorizontal: 18, width: '100%' },
  motivPillText: { fontSize: 13, fontWeight: '700', color: '#2D6A00', textAlign: 'center' },

  errorBackdrop:    { backgroundColor: 'rgba(11,11,26,0.6)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, zIndex: 100 },
  errorModal:       { backgroundColor: 'white', borderRadius: 28, padding: 28, alignItems: 'center', gap: 10, width: '100%', shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.2, shadowRadius: 32, elevation: 16 },
  errorEmoji:       { fontSize: 48, marginBottom: 2 },
  errorTitle:       { fontSize: SM ? 20 : 22, fontWeight: '900', color: Colors.ink, letterSpacing: -0.3, textAlign: 'center' },
  errorMsg:         { fontSize: 14, color: Colors.ink3, lineHeight: 21, textAlign: 'center', marginBottom: 6 },
  errorPrimaryWrap: { width: '100%', borderRadius: 18, overflow: 'hidden' },
  errorPrimaryBtn:  { paddingVertical: 17, alignItems: 'center' as const },
  errorPrimaryText: { fontSize: 16, fontWeight: '800', color: 'white' },
});

// ── Screen 2 ──────────────────────────────────────────────────────
const s2 = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 8, gap: 12, justifyContent: 'center' },

  heroBlock: { alignItems: 'center', gap: 6 },
  heroEmoji: { fontSize: SM ? 48 : 60, marginBottom: 2 },
  title:     { fontSize: SM ? 20 : 24, fontWeight: '900', color: Colors.ink, letterSpacing: -0.5, textAlign: 'center' },

  successBadge: { alignItems: 'center', backgroundColor: 'rgba(22,163,74,0.08)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(22,163,74,0.2)', paddingVertical: 10, paddingHorizontal: 16 },
  successText:  { fontSize: 14, fontWeight: '800', color: '#15803D' },

  rewardsRow:  { flexDirection: 'row', gap: 8 },
  rewardCard:  { flex: 1, backgroundColor: 'white', borderRadius: 14, borderWidth: 1, borderColor: Colors.line, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', gap: 2, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  rewardEmoji: { fontSize: 20, marginBottom: 2 },
  rewardVal:   { fontSize: SM ? 13 : 15, fontWeight: '900', color: Colors.ink, letterSpacing: -0.3 },
  rewardLbl:   { fontSize: 10, fontWeight: '600', color: Colors.muted },

  sectionLabel:     { fontSize: 13, fontWeight: '800', color: Colors.ink, marginBottom: 8 },
  chipsWrap:        { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  topicChip:        { backgroundColor: 'rgba(91,61,245,0.08)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  topicChipText:    { fontSize: 12, fontWeight: '700', color: BRAND },
  topicChipMore:    { backgroundColor: 'rgba(91,61,245,0.04)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(91,61,245,0.15)' },
  topicChipMoreText:{ fontSize: 12, fontWeight: '700', color: Colors.muted },

  previewRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  previewChip:     { backgroundColor: 'rgba(91,61,245,0.06)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(91,61,245,0.12)' },
  previewChipText: { fontSize: 12, fontWeight: '700', color: Colors.ink2 },

  saveLink: { fontSize: 13, fontWeight: '500', color: Colors.muted, textAlign: 'center' },
});
