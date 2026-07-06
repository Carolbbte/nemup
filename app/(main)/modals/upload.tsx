import { useOnboarding } from '@/contexts/OnboardingContext';
import { palette, paletteExtras, semantic } from '@/theme/colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Award,
  Brain,
  Camera,
  Check,
  ChevronRight,
  ClipboardCheck,
  Clock,
  FileText,
  FolderOpen,
  ImageIcon,
  Layers,
  Loader2,
  Plus,
  ShieldCheck,
  Target,
  Timer,
  Trash2,
  Trophy,
  X,
  Zap,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Alert,
  Dimensions,
  Image,
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
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const { height: SCREEN_H } = Dimensions.get('window');
const SM    = SCREEN_H < 740;
const BG    = palette.crema;
const BRAND = palette.azul;

// ── Types ─────────────────────────────────────────────────────────
type UploadedFile = {
  uri: string; name: string; mimeType: string; sizeText: string; sizeBytes: number;
};
// ── Constants ─────────────────────────────────────────────────────
const BACKEND_BASE_URL = 'https://nemup-production.up.railway.app';

const SESSION_ITEMS = [
  { Icon: Trophy,         label: 'Desafío',  desc: 'Conceptos + mini quizzes',                  bg: paletteExtras.amarilloSuaveBg, color: palette.ambar },
  { Icon: ClipboardCheck, label: 'Quiz',     desc: 'Preguntas para poner a prueba lo que sabes', bg: palette.azulClaro,             color: palette.azul },
  { Icon: Layers,         label: 'Tarjetas', desc: 'Repasa con tarjetas interactivas',           bg: paletteExtras.verdeChipBg,      color: palette.verdeXP },
];

// Real backend job status → copy shown on Screen 1. No invented percentages or fake
// stage narrative — these are the only two in-flight states GET /sessions/:jobId reports
// (see pollJobStatus). 'completed'/'failed' are handled separately (navigate away / error overlay).
const JOB_STATUS_COPY: Record<'pending' | 'processing', { title: string; desc: string }> = {
  pending:    { title: 'En cola…',              desc: 'Tu solicitud está esperando su turno para empezar a procesarse.' },
  processing: { title: 'Generando tu sesión…',  desc: 'Estamos analizando tu material y construyendo tu misión, paso a paso.' },
};


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

// Floating badge — same gentle up/down bob as BgDot, but wraps content (an icon) instead
// of rendering an empty dot, and supports a start delay so multiple badges don't move in sync.
function FloatingBadge({ style, dur, delay = 0, rotate = '0deg', children }: { style: any; dur: number; delay?: number; rotate?: string; children: ReactNode }) {
  const ty = useSharedValue(0);
  useEffect(() => {
    ty.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(-10, { duration: dur, easing: Easing.inOut(Easing.sin) }),
        withTiming(0,   { duration: dur, easing: Easing.inOut(Easing.sin) }),
      ), -1, false,
    ));
  }, []);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }, { rotate }] }));
  return <Animated.View style={[style, animStyle]}>{children}</Animated.View>;
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
    return <View style={fti.img}><ImageIcon size={17} color={paletteExtras.verdeArchivo} strokeWidth={1.8} /></View>;
  return <View style={fti.doc}><FileText size={17} color={paletteExtras.azul} strokeWidth={1.8} /></View>;
}
const fti = StyleSheet.create({
  pdf:     { width: 38, height: 38, borderRadius: 10, backgroundColor: paletteExtras.rojoBg, alignItems: 'center', justifyContent: 'center' },
  pdfText: { fontSize: 10, fontWeight: '800', color: palette.rojoError },
  img:     { width: 38, height: 38, borderRadius: 10, backgroundColor: paletteExtras.verdeBg, alignItems: 'center', justifyContent: 'center' },
  doc:     { width: 38, height: 38, borderRadius: 10, backgroundColor: paletteExtras.azulBg, alignItems: 'center', justifyContent: 'center' },
});

// ── Indeterminate spinner — real state, no invented percentage ────
// A continuously-rotating loader icon. Used while jobStatus is 'pending'/'processing';
// deliberately has no notion of "how far along" generation is, since the backend doesn't
// report that granularity and a previous scripted/fake progress bar was discarded for
// credibility reasons.
function Spinner({ size = 22, color = BRAND }: { size?: number; color?: string }) {
  const rotation = useSharedValue(0);
  useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false);
  }, []);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  return (
    <Animated.View style={animStyle}>
      <Loader2 size={size} color={color} strokeWidth={2.5} />
    </Animated.View>
  );
}

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
  const onboardingDataRef = useRef(onboardingState.data);
  onboardingDataRef.current = onboardingState.data;

  // ── State ──────────────────────────────────────────────────────
  const [step, setStep]                       = useState(0);
  const [selectedFiles, setSelectedFiles]     = useState<UploadedFile[]>([]);
  const [uploadError, setUploadError]         = useState('');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [sessionResult, setSessionResult]     = useState<any | null>(null);
  const [recentExpanded, setRecentExpanded]   = useState(false);
  const [recentFiles, setRecentFiles]         = useState<UploadedFile[]>([]);
  // Real backend status while a v2 (async/queue) job is in flight — null while on the v1
  // (SSE) path, which has no intermediate status of its own besides "generating".
  const [jobStatus, setJobStatus]             = useState<'pending' | 'processing' | null>(null);

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
  const stepRef              = useRef(0);
  const pollIntervalRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  stepRef.current = step;

  // Stops the v2 polling loop and its 90s safety timeout — called on completion, failure,
  // retry, unmount, or when a v1 (SSE) request is detected (no polling needed there).
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    if (pollTimeoutRef.current)  { clearTimeout(pollTimeoutRef.current);   pollTimeoutRef.current = null; }
  }, []);

  // Polls GET /sessions/:jobId every 2s until 'completed' or 'failed'. Safety timeout at
  // ~90s prevents an infinite spinner if the job silently stalls.
  const pollJobStatus = useCallback((jobId: string) => {
    stopPolling();

    const poll = async () => {
      try {
        const res = await fetch(`${getBackendBaseUrl()}/sessions/${jobId}`);
        const data = await res.json();

        if (data.status === 'completed') {
          stopPolling();
          const session = data.session;
          // Normalize to the same envelope shape the v1 'complete' SSE event sends, so
          // downstream code (handleStart, the "navigate on complete" effect) doesn't need
          // to know which engine produced the session.
          setSessionResult({
            pathId: null,
            totalMissions: 1,
            missions: [{ missionIndex: 0, skillId: null, skillLabel: null, sessionId: session?.id, session }],
            sessionId: session?.id,
            session,
          });
        } else if (data.status === 'failed') {
          stopPolling();
          setGenerationError(data.error ?? 'No se pudo generar la sesión.');
        } else if (data.status === 'pending' || data.status === 'processing') {
          setJobStatus(data.status);
        }
      } catch {
        // Transient network hiccup mid-poll — keep trying; the safety timeout below
        // will eventually catch a connection that's truly dead.
      }
    };

    poll();
    pollIntervalRef.current = setInterval(poll, 2000);
    pollTimeoutRef.current = setTimeout(() => {
      stopPolling();
      setGenerationError('Esto está tardando más de lo esperado. Intenta nuevamente.');
    }, 90000);
  }, [stopPolling]);

  // Reset to fresh state whenever the screen refocuses after a non-fresh visit — this
  // modal is a one-shot flow, so re-entering it (e.g. from the dashboard's "subir nuevos
  // apuntes" button) should never resume a stuck/incomplete previous attempt (step 1 = still
  // generating, or any leftover error state), it should start over at step 0.
  useFocusEffect(
    useCallback(() => {
      if (stepRef.current !== 0) {
        xhrRef.current?.abort();
        stopPolling();
        generationStartedRef.current = false;
        setStep(0);
        setSelectedFiles([]);
        setUploadError('');
        setGenerationError(null);
        setSessionResult(null);
        setJobStatus(null);
      }
    }, [stopPolling])
  );

  // ── Shared values (ALL unconditional) ─────────────────────────
  const filesAnim       = useSharedValue(0);

  // ── Animated styles (ALL unconditional) ───────────────────────
  const filesAnimStyle = useAnimatedStyle(() => ({
    opacity:   filesAnim.value,
    transform: [{ translateY: (1 - filesAnim.value) * 8 }],
  }));

  // ── Effects ────────────────────────────────────────────────────

  // Navigate directly to session dashboard when generation completes
  useEffect(() => {
    if (sessionResult && step === 1) {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      autoNavRef.current = setTimeout(() => handleStart(), 800);
      return () => { if (autoNavRef.current) clearTimeout(autoNavRef.current); };
    }
  }, [sessionResult, step]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Uses XMLHttpRequest (not fetch) so we can inspect the response as soon as headers
  // arrive and branch accordingly — the backend can answer in two different contracts
  // depending on USE_GENERATION_V2 server-side, and the client auto-detects which one it
  // got instead of needing its own copy of that flag:
  //   - v1 (legacy, flag off): text/event-stream, incremental SSE events ending in 'complete'.
  //   - v2 (flag on): 202 + { jobId } immediately, then poll GET /sessions/:jobId.
  const startGeneration = useCallback(() => {
    if (selectedFiles.length === 0) return;
    setGenerationError(null);
    setJobStatus(null);

    const curso = onboardingDataRef.current.curso || '1º Medio';
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

    const handleSseEvent = (event: string, payload: any) => {
      if (event === 'complete') setSessionResult(payload);
      if (event === 'error') setGenerationError(payload?.message ?? 'Error inesperado.');
    };

    const xhr = new XMLHttpRequest();
    let buffer = '';
    let readOffset = 0;
    let mode: 'v1-sse' | 'v2-async' | null = null;

    xhr.open('POST', `${getBackendBaseUrl()}/sessions/generate`);

    xhr.onreadystatechange = () => {
      if (mode || xhr.readyState < xhr.HEADERS_RECEIVED) return;
      const contentType = xhr.getResponseHeader('Content-Type') ?? '';
      mode = xhr.status === 202 || contentType.includes('application/json') ? 'v2-async' : 'v1-sse';
    };

    // v1 only: fetch's response.text() only resolves once the whole stream ends, which
    // would make every SSE event arrive in one burst at the very end — onprogress reads
    // it incrementally instead. v2's body is a small one-shot JSON blob, read in onload.
    xhr.onprogress = () => {
      if (mode !== 'v1-sse') return;
      const chunk = xhr.responseText.slice(readOffset);
      readOffset = xhr.responseText.length;
      buffer = parseSseEvents(buffer + chunk, handleSseEvent);
    };

    xhr.onload = () => {
      if (mode === 'v2-async') {
        if (xhr.status !== 202) {
          try {
            const body = JSON.parse(xhr.responseText);
            setGenerationError(body?.message ?? 'No se pudo iniciar la generación.');
          } catch {
            setGenerationError('No se pudo iniciar la generación.');
          }
          return;
        }
        try {
          const { jobId } = JSON.parse(xhr.responseText);
          pollJobStatus(jobId);
        } catch {
          setGenerationError('Respuesta inválida del servidor.');
        }
        return;
      }

      // v1 (SSE) path
      if (xhr.status < 200 || xhr.status >= 300) {
        setGenerationError('No se pudo generar la sesión.');
        return;
      }
      // Flush whatever trailing event never got a closing blank line
      parseSseEvents(buffer + '\n\n', handleSseEvent);
    };

    xhr.onerror = () => setGenerationError('Error de red. Intenta nuevamente.');

    xhr.send(formData);
    xhrRef.current = { abort: () => { xhr.abort(); stopPolling(); } };
  }, [selectedFiles, pollJobStatus, stopPolling]);

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
  // SCREEN 1 — Preparando tu entrenamiento
  // ══════════════════════════════════════════════════════════════
  if (step === 1) {
    const firstName = onboardingDataRef.current.name?.split(' ')[0] || 'Estudiante';
    // jobStatus is only set on the v2 (async/queue) path; v1 (SSE) has no intermediate
    // status of its own, so 'processing' copy is the honest default while it's in flight.
    const statusCopy = JOB_STATUS_COPY[jobStatus === 'pending' ? 'pending' : 'processing'];

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BG }} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />

        <View style={sh.header}>
          <Pressable onPress={handleBack} style={sh.iconBtn} hitSlop={10}>
            <ArrowLeft size={16} color={semantic.textPrimary} strokeWidth={2.5} />
          </Pressable>
          <Text style={s0.headerTitle}>Creando tu sesión ⚡</Text>
          <Pressable onPress={handleClose} style={sh.iconBtn} hitSlop={10}>
            <X size={16} color={semantic.textPrimary} strokeWidth={2.5} />
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Greeting + mascot, side by side */}
          <View style={s1.heroRow}>
            <View style={s1.heroTextCol}>
              <Text style={s1.heroTitle}>
                {firstName}, tu sesión{'\n'}se está{'\n'}<Text style={{ color: BRAND }}>preparando...</Text>
              </Text>
              <Text style={s1.heroTagline}>Nuestra IA analiza tu material y crea actividades perfectas para que aprendas mejor.</Text>
            </View>

            <View style={s1.mascotWrap}>
              <FloatingBadge style={[s1.floatBadge, s1.floatBadge1]} dur={1600} delay={0}   rotate="-8deg">
                <FileText size={14} color="white" strokeWidth={2} />
              </FloatingBadge>
              <FloatingBadge style={[s1.floatBadge, s1.floatBadge2]} dur={1900} delay={300} rotate="6deg">
                <Brain size={14} color="white" strokeWidth={2} />
              </FloatingBadge>
              <FloatingBadge style={[s1.floatBadge, s1.floatBadge3]} dur={1400} delay={600} rotate="-6deg">
                <Check size={14} color="white" strokeWidth={2.5} />
              </FloatingBadge>
              <Image source={require('@/assets/images/enfocado.png')} style={s1.mascotImg} resizeMode="contain" />
            </View>
          </View>

          {/* Ahora estamos: estado real del backend + spinner indeterminado (sin % inventado) */}
          <View style={s1.nowCard}>
            <View style={s1.nowCardTop}>
              <View style={s1.nowIconWrap}>
                <Spinner size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s1.nowValue}>{statusCopy.title}</Text>
                <Text style={s1.nowDesc}>{statusCopy.desc}</Text>
              </View>
            </View>
          </View>

          {/* Tip banner */}
          <View style={s1.tipBanner}>
            <Text style={s1.tipEmoji}>🌱</Text>
            <View style={{ flex: 1 }}>
              <Text style={s1.tipTitle}>¡Sigue así!</Text>
              <Text style={s1.tipText}>Cada segundo que esperas, tu futuro yo te lo agradecerá.</Text>
            </View>
            <View style={s1.xpBox}>
              <Text style={s1.xpBoxLabel}>Ganas</Text>
              <Text style={s1.xpBoxValue}>⚡ +10 XP</Text>
              <Text style={s1.xpBoxSub}>por esta sesión</Text>
            </View>
          </View>

          {/* Info pill */}
          <View style={s1.infoPill}>
            <Text style={s1.infoPillEmoji}>💡</Text>
            <Text style={s1.infoPillText}>Esto puede tomar hasta un minuto.</Text>
          </View>
        </ScrollView>

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
        <Text style={s0.headerTitle}>Preparar misión</Text>
        <Pressable onPress={handleClose} style={sh.iconBtn} hitSlop={10}>
          <X size={16} color={semantic.textPrimary} strokeWidth={2.5} />
        </Pressable>
      </View>
      {!hasFiles && (
        <View style={s0.progressBarRow}>
          <ShimmerProgress step={step} />
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 0, paddingBottom: hasFiles ? insets.bottom + 90 : insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {!hasFiles ? (
          <>
            {/* Timer row */}
            <View style={s0.timerRow}>
              <Timer size={15} color={BRAND} strokeWidth={2} />
              <Text style={s0.timerText}>
                Tu misión estará lista en <Text style={s0.timerHighlight}>menos de 1 minuto</Text> ⚡
              </Text>
            </View>

            {/* Mascot chat bubble */}
            <View style={s0.chatRow}>
              <Image
                source={require('@/assets/images/tomandoApuntes.png')}
                style={s0.mascotSmall}
                resizeMode="contain"
              />
              <View style={s0.chatBubble}>
                <View style={s0.chatBubbleTail} />
                <Text style={s0.chatText}>
                  Pásame tus apuntes{'\n'}y te armo un <Text style={s0.chatHighlight}>desafío</Text> 🔥
                </Text>
              </View>
            </View>

            {/* Section label */}
            <Text style={s0.sectionLabel}>¿Cómo quieres subir tu material?</Text>

            {!!uploadError && <Text style={s0.error}>{uploadError}</Text>}

            {/* Option: Sacar foto */}
            <Pressable onPress={handleCameraPick} style={[s0.optionCard, s0.optionCardActive]}>
              <View style={s0.optionBadge}>
                <Text style={s0.optionBadgeText}>Más rápido ⚡</Text>
              </View>
              <View style={s0.optionRow}>
                <View style={[s0.optionIconWrap, { backgroundColor: palette.azulClaro }]}>
                  <Camera size={22} color={BRAND} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s0.optionTitle}>Sacar foto</Text>
                  <Text style={s0.optionDesc}>Sube tus cuadernos o guías rápido y fácil</Text>
                </View>
                <View style={[s0.optionChevronWrap, { backgroundColor: BRAND }]}>
                  <ChevronRight size={18} color="white" strokeWidth={2.5} />
                </View>
              </View>
            </Pressable>

            {/* Option: Subir archivo */}
            <Pressable onPress={handleFilePick} style={s0.optionCard}>
              <View style={s0.optionRow}>
                <View style={[s0.optionIconWrap, { backgroundColor: paletteExtras.verdeBg }]}>
                  <FolderOpen size={22} color={palette.verdeXP} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s0.optionTitle}>Subir archivo</Text>
                  <Text style={s0.optionDesc}>PDF, imágenes o documentos desde tu dispositivo</Text>
                </View>
                <View style={[s0.optionChevronWrap, { backgroundColor: palette.verdeXP }]}>
                  <ChevronRight size={18} color="white" strokeWidth={2.5} />
                </View>
              </View>
            </Pressable>

            {/* Unlocks */}
            <Text style={s0.unlocksTitle}>🎁 Lo que desbloquearás</Text>
            <View style={s0.unlocksRow}>
              <View style={[s0.unlockCard, { backgroundColor: paletteExtras.amarilloSuaveBg }]}>
                <Trophy size={18} color={palette.ambar} strokeWidth={2} />
                <Text style={s0.unlockLabel}>Misión{'\n'}personalizada</Text>
              </View>
              <View style={[s0.unlockCard, { backgroundColor: paletteExtras.moradoCardBg }]}>
                <ClipboardCheck size={18} color={BRAND} strokeWidth={2} />
                <Text style={s0.unlockLabel}>Quiz{'\n'}inteligente</Text>
              </View>
              <View style={[s0.unlockCard, { backgroundColor: paletteExtras.verdeChipBg }]}>
                <Layers size={18} color={palette.verdeXP} strokeWidth={2} />
                <Text style={s0.unlockLabel}>Tarjetas{'\n'}interactivas</Text>
              </View>
              <View style={[s0.unlockCard, { backgroundColor: paletteExtras.moradoCardBg }]}>
                <Zap size={18} color={palette.amarilloXP} fill={palette.amarilloXP} strokeWidth={1.5} />
                <Text style={s0.unlockLabel}>+20 a +60{'\n'}<Text style={{ color: BRAND }}>XP</Text></Text>
              </View>
            </View>

            {/* Bottom info row */}
            <View style={s0.infoRow}>
              <View style={s0.infoItem}>
                <Clock size={16} color={BRAND} strokeWidth={2} />
                <Text style={s0.infoTitle}>Menos de <Text style={{ color: BRAND }}>1 minuto</Text></Text>
                <Text style={s0.infoDesc}>Listo súper rápido</Text>
              </View>
              <View style={s0.infoItem}>
                <Target size={16} color={BRAND} strokeWidth={2} />
                <Text style={s0.infoTitle}>Basado en <Text style={{ color: BRAND }}>TU material</Text></Text>
                <Text style={s0.infoDesc}>100% personalizado</Text>
              </View>
              <View style={s0.infoItem}>
                <ShieldCheck size={16} color={palette.verdeXP} strokeWidth={2} />
                <Text style={s0.infoTitle}>Adaptado <Text style={{ color: palette.verdeXP }}>a tu nivel</Text></Text>
                <Text style={s0.infoDesc}>Inteligencia que entiende lo que necesitas</Text>
              </View>
            </View>
          </>
        ) : (
          <Animated.View style={filesAnimStyle}>
            {/* Status pill */}
            <View style={s0.statusPill}>
              <View style={s0.statusPillIcon}>
                <Check size={11} color="white" strokeWidth={3} />
              </View>
              <Text style={s0.statusPillText}>
                {selectedFiles.length === 1 ? '1 documento listo' : `${selectedFiles.length} documentos listos`}
              </Text>
            </View>

            {/* Title + mascot */}
            <View style={s0.readyRow}>
              <Text style={s0.readyTitle}>¡Todo listo para crear{'\n'}tu misión! 🚀</Text>
              <View style={s0.mascotWrap}>
                <View style={[s0.confetti, s0.confetti1]} />
                <View style={[s0.confetti, s0.confetti2]} />
                <View style={[s0.confetti, s0.confetti3]} />
                <Image
                  source={require('@/assets/images/tuPuedes.png')}
                  style={s0.mascotReady}
                  resizeMode="contain"
                />
              </View>
            </View>

            <Text style={s0.tagline}>NEMup creará una misión personalizada, un quiz y tarjetas interactivas para ayudarte a estudiar.</Text>

            {/* File card(s) */}
            {selectedFiles.map(file => (
              <View key={file.uri} style={s0.fileCard}>
                <FileTypeBadge mimeType={file.mimeType} />
                <View style={{ flex: 1 }}>
                  <Text style={s0.fileCardName} numberOfLines={1}>{file.name}</Text>
                  <Text style={s0.fileCardMeta}>{file.sizeText} · {file.mimeType.includes('pdf') ? 'PDF' : file.mimeType.includes('image') ? 'Imagen' : 'Documento'}</Text>
                </View>
                <Pressable onPress={() => removeFile(file.uri)} hitSlop={8} style={s0.removeBtn}>
                  <Trash2 size={16} color={palette.rojoError} strokeWidth={2} />
                </Pressable>
              </View>
            ))}

            {/* Add more */}
            <Pressable onPress={handleFilePick} style={s0.addMoreBtn}>
              <View style={s0.addMoreIconWrap}>
                <Plus size={18} color="white" strokeWidth={2.5} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s0.addMoreText}>Agregar otro documento</Text>
                <Text style={s0.addMoreSub}>Apuntes, guías, libros o ejercicios</Text>
              </View>
            </Pressable>

            {/* Session preview */}
            <Text style={s0.sessionTitle}>Tu misión incluirá:</Text>
            <View style={s0.sessionRow}>
              {SESSION_ITEMS.map(({ Icon, label, desc, bg, color }) => (
                <View key={label} style={[s0.sessionItemCard, { backgroundColor: bg }]}>
                  <Icon size={24} color={color} strokeWidth={1.8} />
                  <Text style={s0.sessionItemTitle}>{label}</Text>
                  <Text style={s0.sessionItemDesc}>{desc}</Text>
                </View>
              ))}
            </View>

            {/* XP banner */}
            <View style={s0.xpBanner}>
              <Zap size={20} color={palette.amarilloXP} fill={palette.amarilloXP} strokeWidth={1.5} />
              <View style={{ flex: 1 }}>
                <Text style={s0.xpBannerTitle}>Ganarás <Text style={{ color: palette.ambarIcon }}>XP</Text> al completar tu misión</Text>
                <Text style={s0.xpBannerSub}>¡Suma XP y sube de nivel!</Text>
              </View>
              <Award size={26} color={palette.ambar} strokeWidth={1.5} />
            </View>

            {!!uploadError && <Text style={s0.error}>{uploadError}</Text>}
          </Animated.View>
        )}
      </ScrollView>

      {hasFiles && (
        <Animated.View style={[sh.bottom, { paddingBottom: insets.bottom + 12, gap: 10 }, filesAnimStyle]}>
          <Pressable onPress={handleContinue} style={{ width: '100%' }}>
            <LinearGradient
              colors={[palette.azul, palette.cyanBrillante, palette.verdeBrillante]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={s0.finalCta}
            >
              <Text style={s0.finalCtaTitle}>🚀 Crear mi misión</Text>
              <Text style={s0.finalCtaSub}>¡Que comience el desafío!</Text>
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
  iconBtn: { width: 36, height: 36, borderRadius: 11, backgroundColor: palette.blanco, borderWidth: 1, borderColor: palette.bordeClaro, alignItems: 'center', justifyContent: 'center' },
  bottom:  { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.bordeClaro, backgroundColor: BG },
  ctaBtn:  { paddingVertical: 17, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 16, fontWeight: '800', color: palette.blanco },
});

// ── Screen 0 ──────────────────────────────────────────────────────
const s0 = StyleSheet.create({
  title:   { fontSize: SM ? 24 : 28, fontWeight: '900', color: semantic.textPrimary, letterSpacing: -0.5, marginBottom: 8, lineHeight: SM ? 30 : 34 },
  tagline: { fontSize: 14, color: semantic.textSecondary, lineHeight: 21, marginBottom: 18 },

  headerTitle:    { flex: 1, fontSize: 18, fontWeight: '800', color: semantic.textPrimary, marginLeft: 10 },
  progressBarRow: { paddingHorizontal: 16, paddingBottom: 2 },

  // Timer row
  timerRow:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  timerText:      { fontSize: 13, color: semantic.textSecondary, flex: 1 },
  timerHighlight: { color: BRAND, fontWeight: '800' },

  // Mascot chat bubble
  chatRow:       { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  chatBubble:    { alignSelf: 'center', backgroundColor: paletteExtras.moradoCardBg, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, position: 'relative' },
  chatBubbleTail:{ position: 'absolute', left: -6, top: '50%', marginTop: -6, width: 12, height: 12, backgroundColor: paletteExtras.moradoCardBg, transform: [{ rotate: '45deg' }] },
  chatText:      { fontSize: 15, fontWeight: '700', color: semantic.textPrimary, lineHeight: 21 },
  chatHighlight: { color: BRAND },
  mascotSmall:   { width: 150, height: 150 },

  sectionLabel: { fontSize: 15, fontWeight: '800', color: semantic.textPrimary, marginBottom: 10 },

  // Option cards
  optionCard:       { backgroundColor: palette.blanco, borderRadius: 18, borderWidth: 1.5, borderColor: palette.bordeClaro, padding: 14, marginBottom: 10, minHeight: 100, justifyContent: 'center' },
  optionCardActive: { borderColor: BRAND, backgroundColor: paletteExtras.moradoCardBg },
  optionBadge:      { position: 'absolute', top: -10, right: 14, backgroundColor: palette.azulClaro, borderWidth: 1, borderColor: BRAND, borderRadius: 10, paddingVertical: 2, paddingHorizontal: 8 },
  optionBadgeText:  { fontSize: 10, fontWeight: '800', color: BRAND },
  optionRow:        { flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionIconWrap:   { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  optionTitle:      { fontSize: 16, fontWeight: '800', color: semantic.textPrimary, marginBottom: 2 },
  optionDesc:       { fontSize: 12, color: semantic.textSecondary },
  optionChevronWrap:{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

  // Unlocks
  unlocksTitle: { fontSize: 15, fontWeight: '800', color: semantic.textPrimary, marginTop: 10, marginBottom: 10 },
  unlocksRow:   { flexDirection: 'row', gap: 8, marginBottom: 18 },
  unlockCard:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 4, minHeight: 100 },
  unlockLabel:  { fontSize: 10, fontWeight: '700', color: semantic.textPrimary, textAlign: 'center', lineHeight: 13 },

  // Bottom info row
  infoRow:   { flexDirection: 'row', gap: 10, marginBottom: 10 },
  infoItem:  { flex: 1, gap: 4, minHeight: 100, justifyContent: 'center' },
  infoTitle: { fontSize: 12, fontWeight: '700', color: semantic.textPrimary },
  infoDesc:  { fontSize: 10, color: semantic.textTertiary, lineHeight: 13 },

  error: { color: palette.rojoError, fontSize: 12, fontWeight: '700', marginBottom: 10 },

  // Loaded state
  statusPill:     { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, backgroundColor: paletteExtras.verdeChipBg, borderRadius: 20, paddingVertical: 5, paddingHorizontal: 10, marginBottom: 14 },
  statusPillIcon: { width: 16, height: 16, borderRadius: 8, backgroundColor: palette.verdeXP, alignItems: 'center', justifyContent: 'center' },
  statusPillText: { fontSize: 12, fontWeight: '700', color: paletteExtras.verdeTextoOscuro },

  readyRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  readyTitle:  { flex: 1, fontSize: SM ? 22 : 25, fontWeight: '900', color: semantic.textPrimary, letterSpacing: -0.5, lineHeight: SM ? 27 : 30 },
  mascotWrap:  { width: 100, height: 130, alignItems: 'center', justifyContent: 'center' },
  mascotReady: { width: 100, height: 130 },
  confetti:       { position: 'absolute', width: 8, height: 8, borderRadius: 2, transform: [{ rotate: '20deg' }] },
  confetti1:      { top: 0, left: 4, backgroundColor: BRAND },
  confetti2:      { top: 20, right: -4, backgroundColor: palette.verdeXP, width: 6, height: 6 },
  confetti3:      { bottom: 10, left: -6, backgroundColor: palette.amarilloXP, width: 7, height: 7 },

  fileCard:     { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.blanco, borderRadius: 16, borderWidth: 1, borderColor: palette.bordeClaro, paddingVertical: 10, paddingHorizontal: 14, gap: 12, marginBottom: 8 },
  fileCardName: { fontSize: 13, fontWeight: '700', color: semantic.textPrimary, marginBottom: 1 },
  fileCardMeta: { fontSize: 11, color: semantic.textTertiary },
  removeBtn:    { width: 30, height: 30, borderRadius: 10, backgroundColor: palette.crema, alignItems: 'center', justifyContent: 'center' },

  addMoreBtn:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(22,119,242,0.25)', borderStyle: 'dashed', paddingVertical: 12, paddingHorizontal: 14, marginTop: 2, marginBottom: 16, backgroundColor: 'rgba(22,119,242,0.03)' },
  addMoreIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' },
  addMoreText:     { fontSize: 14, fontWeight: '700', color: semantic.textPrimary },
  addMoreSub:      { fontSize: 11, color: semantic.textTertiary, marginTop: 1 },

  sessionTitle:     { fontSize: 15, fontWeight: '800', color: semantic.textPrimary, marginBottom: 10 },
  sessionRow:       { flexDirection: 'row', gap: 8, marginBottom: 14 },
  sessionItemCard:  { flex: 1, alignItems: 'center', gap: 6, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 6 },
  sessionItemTitle: { fontSize: 13, fontWeight: '800', color: semantic.textPrimary },
  sessionItemDesc:  { fontSize: 10, color: semantic.textSecondary, textAlign: 'center', lineHeight: 13 },

  xpBanner:      { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: paletteExtras.amarilloSuaveBg, borderRadius: 16, borderWidth: 1, borderColor: paletteExtras.amarilloBorde, padding: 14, marginBottom: 4 },
  xpBannerTitle: { fontSize: 13, fontWeight: '800', color: semantic.textPrimary },
  xpBannerSub:   { fontSize: 11, color: semantic.textSecondary, marginTop: 1 },

  finalCta:      { paddingVertical: 17, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  finalCtaTitle: { fontSize: 16, fontWeight: '800', color: 'white' },
  finalCtaSub:   { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.85)', marginTop: 2 },
});

// ── Screen 1 ──────────────────────────────────────────────────────
const s1 = StyleSheet.create({
  // Greeting + mascot — side by side to use horizontal space better
  heroRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  heroTextCol: { flex: 1, paddingRight: 8 },
  heroTitle:   { fontSize: SM ? 19 : 21, fontWeight: '900', color: semantic.textPrimary, letterSpacing: -0.4, lineHeight: SM ? 24 : 26 },
  heroTagline: { fontSize: 12, color: semantic.textSecondary, lineHeight: 17, marginTop: 8 },

  mascotWrap:  { width: 156, height: 174, alignItems: 'center', justifyContent: 'center' },
  mascotImg:   { width: 156, height: 174 },
  floatBadge:  { position: 'absolute', width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  floatBadge1: { top: 0, left: -4, backgroundColor: BRAND },
  floatBadge2: { top: 50, right: -10, backgroundColor: palette.verdeXP },
  floatBadge3: { bottom: 6, right: 4, backgroundColor: palette.ambar },

  // "Ahora estamos" card (incluye la barra de progreso)
  nowCard:      { backgroundColor: palette.blanco, borderRadius: 20, borderWidth: 1, borderColor: palette.bordeClaro, padding: 16, marginBottom: 12 },
  nowCardTop:   { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  nowIconWrap:  { width: 36, height: 36, borderRadius: 18, backgroundColor: palette.azulClaro, alignItems: 'center', justifyContent: 'center' },
  nowIconEmoji: { fontSize: 17 },
  nowValue:     { fontSize: 16, fontWeight: '800', color: BRAND, marginBottom: 4 },
  nowDesc:      { fontSize: 12, color: semantic.textSecondary, lineHeight: 17 },

  tipBanner:  { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: paletteExtras.verdeChipBg, borderRadius: 18, padding: 14, marginBottom: 12 },
  tipEmoji:   { fontSize: 22 },
  tipTitle:   { fontSize: 13, fontWeight: '800', color: semantic.textPrimary, marginBottom: 2 },
  tipText:    { fontSize: 11, color: semantic.textSecondary, lineHeight: 15 },
  xpBox:      { backgroundColor: palette.blanco, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10, alignItems: 'center' },
  xpBoxLabel: { fontSize: 10, color: semantic.textTertiary },
  xpBoxValue: { fontSize: 14, fontWeight: '800', color: palette.verdeXP },
  xpBoxSub:   { fontSize: 9, color: semantic.textTertiary },

  infoPill:     { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', backgroundColor: palette.azulClaro, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14, marginBottom: 20 },
  infoPillEmoji:{ fontSize: 14 },
  infoPillText: { fontSize: 12, fontWeight: '600', color: BRAND },

  errorBackdrop:    { backgroundColor: 'rgba(11,11,26,0.6)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, zIndex: 100 },
  errorModal:       { backgroundColor: palette.blanco, borderRadius: 28, padding: 28, alignItems: 'center', gap: 10, width: '100%' },
  errorEmoji:       { fontSize: 48, marginBottom: 2 },
  errorTitle:       { fontSize: SM ? 20 : 22, fontWeight: '900', color: semantic.textPrimary, letterSpacing: -0.3, textAlign: 'center' },
  errorMsg:         { fontSize: 14, color: semantic.textSecondary, lineHeight: 21, textAlign: 'center', marginBottom: 6 },
  errorPrimaryWrap: { width: '100%', borderRadius: 18, overflow: 'hidden' },
  errorPrimaryBtn:  { paddingVertical: 17, alignItems: 'center' as const },
  errorPrimaryText: { fontSize: 16, fontWeight: '800', color: palette.blanco },
});

