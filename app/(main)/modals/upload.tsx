import { Colors } from '@/constants/Colors';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import ScreenContainer from '@/components/ScreenContainer';

type UploadedFile = {
  uri: string;
  name: string;
  mimeType: string;
  sizeText: string;
  sizeBytes: number;
};

type SessionProgress = {
  stage: 'uploading' | 'transcribing' | 'extracting' | 'generating' | 'validating_grounding' | 'done';
  status: 'processing' | 'complete' | 'error';
  progress: number;
  message: string;
};

const BACKEND_BASE_URL = Platform.select({
  android: 'http://10.0.2.2:3000',
  ios: 'http://localhost:3000',
  default: 'http://localhost:3000',
});

const METHOD_OPTIONS = [
  {
    id: 'photo',
    emoji: '📸',
    title: 'Foto rápida',
    description: 'Escanea tu material con la cámara',
  },
  {
    id: 'file',
    emoji: '📄',
    title: 'Subir archivo',
    description: 'Selecciona un PDF o imagen existente',
  },
];

const CONFIG_OPTIONS = [
  { id: 'review', label: 'Revisión', emoji: '📝' },
  { id: 'practice', label: 'Ejercicios', emoji: '⚡' },
  { id: 'exam', label: 'Simulacro', emoji: '🎯' },
];

const RECENT_FILES: UploadedFile[] = [
  {
    uri: 'file:///ResumenHistoriaXXI.pdf',
    name: 'Resumen Historia XXI.pdf',
    mimeType: 'application/pdf',
    sizeText: '1.3 MB',
    sizeBytes: 1350000,
  },
  {
    uri: 'file:///FichaQuimica.png',
    name: 'Ficha Química.png',
    mimeType: 'image/png',
    sizeText: '780 KB',
    sizeBytes: 780000,
  },
];

const STAGE_ORDER: SessionProgress['stage'][] = [
  'uploading',
  'transcribing',
  'extracting',
  'generating',
  'validating_grounding',
  'done',
];

const STAGE_LABELS: Record<SessionProgress['stage'], string> = {
  uploading: 'Procesando documento',
  transcribing: 'Extrayendo clave',
  extracting: 'Extrayendo conceptos',
  generating: 'Construyendo la sesión',
  validating_grounding: 'Validando anclaje',
  done: 'Listo',
};

const STEP_TITLES = [
  { label: 'Subir', sub: 'Selecciona tu material' },
  { label: 'Ajustar', sub: 'Prepara el análisis' },
  { label: 'Generar', sub: 'Tu sesión con IA' },
  { label: 'Listo', sub: 'Empieza a estudiar' },
];

function getBackendBaseUrl() {
  return BACKEND_BASE_URL || 'http://localhost:3000';
}

function parseSseEvents(rawChunk: string, handleEvent: (event: string, payload: any) => void) {
  const events = rawChunk.split(/\r?\n\r?\n/);
  const leftover = events.pop() ?? '';

  for (const eventText of events) {
    if (!eventText.trim()) continue;
    const lines = eventText.split(/\r?\n/);
    let eventName = 'message';
    let dataText = '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.replace('event:', '').trim();
      }
      if (line.startsWith('data:')) {
        dataText += line.replace('data:', '').trim();
      }
    }

    if (dataText) {
      try {
        const payload = JSON.parse(dataText);
        handleEvent(eventName, payload);
      } catch (error) {
        console.warn('[SSE] no se pudo parsear payload:', dataText, error);
      }
    }
  }

  return leftover;
}

function buildTaskSteps(currentStage: SessionProgress['stage']) {
  return STAGE_ORDER.map((stage) => {
    const stageIndex = STAGE_ORDER.indexOf(stage);
    const currentIndex = STAGE_ORDER.indexOf(currentStage);
    const status = stageIndex < currentIndex ? 'done' : stageIndex === currentIndex ? 'active' : 'pending';
    return {
      stage,
      label: STAGE_LABELS[stage],
      status,
    };
  });
}

export default function UploadFlowScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selectedMethod, setSelectedMethod] = useState('file');
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [sessionType, setSessionType] = useState('practice');
  const [duration, setDuration] = useState(18);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [progressEvents, setProgressEvents] = useState<SessionProgress[]>([]);
  const [sessionResult, setSessionResult] = useState<any | null>(null);
  const sseBufferRef = useRef('');
  const lastResponseLengthRef = useRef(0);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const pushProgressEvent = useCallback((event: SessionProgress) => {
    setProgressEvents((previous) => [...previous, event]);
  }, []);

  const handleDocumentPick = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (result.type === 'success') {
        setSelectedFile({
          uri: result.uri,
          name: result.name,
          mimeType: result.mimeType ?? 'application/octet-stream',
          sizeText: result.size ? `${(result.size / 1024).toFixed(1)} KB` : 'N/A',
          sizeBytes: result.size ?? 0,
        });
        setUploadError('');
      }
    } catch (error) {
      setUploadError('No se pudo seleccionar el archivo. Intenta nuevamente.');
    }
  };

  const handleCameraPick = async () => {
    try {
      if (Platform.OS === 'web') {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
        });

        if (!result.canceled && result.assets.length > 0) {
          const asset = result.assets[0];
          setSelectedFile({
            uri: asset.uri,
            name: asset.fileName ?? `Foto-${Date.now()}.jpg`,
            mimeType: asset.type ?? 'image/jpeg',
            sizeText: asset.fileSize ? `${Math.round(asset.fileSize / 1024)} KB` : 'N/A',
            sizeBytes: asset.fileSize ?? 0,
          });
          setUploadError('');
        }
        return;
      }

      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permiso denegado', 'Necesitamos acceso a la cámara para tomar una foto.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });

      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        setSelectedFile({
          uri: asset.uri,
          name: asset.fileName ?? `Foto-${Date.now()}.jpg`,
          mimeType: asset.type ?? 'image/jpeg',
          sizeText: asset.fileSize ? `${Math.round(asset.fileSize / 1024)} KB` : 'N/A',
          sizeBytes: asset.fileSize ?? 0,
        });
        setUploadError('');
      }
    } catch (error) {
      setUploadError('No se pudo usar la cámara. Intenta nuevamente.');
    }
  };

  const handleUseRecent = (file: UploadedFile) => {
    setSelectedFile(file);
    setUploadError('');
  };

  const startSseGeneration = useCallback(async () => {
    if (!selectedFile) return;

    setIsGenerating(true);
    setGenerationError(null);
    setProgressEvents([]);
    sseBufferRef.current = '';
    lastResponseLengthRef.current = 0;

    const formData = new FormData();
    formData.append('config', JSON.stringify({
      documentId: selectedFile.name,
      format:
        sessionType === 'practice'
          ? ['quizzes', 'flashcards']
          : sessionType === 'exam'
          ? ['quizzes', 'summary']
          : ['summary', 'flashcards'],
      difficulty:
        sessionType === 'review'
          ? 'easy'
          : sessionType === 'exam'
          ? 'hard'
          : 'adaptive',
      estimatedDuration: duration,
      subject: 'Biología',
      topic: 'Mitosis y meiosis',
    }));
    formData.append('userId', 'demo-user');
    formData.append('document', {
      uri: selectedFile.uri,
      name: selectedFile.name,
      type: selectedFile.mimeType,
    } as any);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open('POST', `${getBackendBaseUrl()}/sessions/generate`, true);
    xhr.setRequestHeader('Accept', 'text/event-stream');

    xhr.onprogress = () => {
      const incoming = xhr.responseText.substring(lastResponseLengthRef.current);
      lastResponseLengthRef.current = xhr.responseText.length;
      const unprocessed = `${sseBufferRef.current}${incoming}`;
      sseBufferRef.current = parseSseEvents(unprocessed, (event, payload) => {
        if (event === 'progress') {
          pushProgressEvent(payload as SessionProgress);
        }
        if (event === 'complete') {
          setSessionResult(payload);
        }
        if (event === 'error') {
          setGenerationError(payload?.message ?? 'Error inesperado.');
          setIsGenerating(false);
        }
      });
    };

    xhr.onload = () => {
      if (xhr.status >= 400) {
        setGenerationError('No se pudo generar la sesión. Verifica tu conexión.');
        setIsGenerating(false);
      }
    };

    xhr.onerror = () => {
      setGenerationError('Error de red durante la generación. Intenta nuevamente.');
      setIsGenerating(false);
    };

    xhr.send(formData);
  }, [duration, pushProgressEvent, selectedFile, sessionType]);

  const handleOpenPicker = () => {
    if (selectedMethod === 'photo') {
      handleCameraPick();
    } else {
      handleDocumentPick();
    }
  };

  useEffect(() => {
    if (step !== 2 || isGenerating || !selectedFile) return;
    startSseGeneration();
    return () => {
      xhrRef.current?.abort();
    };
  }, [isGenerating, selectedFile, startSseGeneration, step]);

  useEffect(() => {
    if (sessionResult && step === 2) {
      setStep(3);
      setIsGenerating(false);
    }
  }, [sessionResult, step]);

  const activeMethod = METHOD_OPTIONS.find(option => option.id === selectedMethod);

  const lastProgress = progressEvents[progressEvents.length - 1];
  const completedSession = sessionResult?.session;
  const progressWidth = useMemo(() => {
    if (lastProgress) {
      return `${Math.min(lastProgress.progress, 100)}%`;
    }
    if (step === 1) return '24%';
    if (step === 3) return '100%';
    return '10%';
  }, [lastProgress, step]);

  const handleContinue = () => {
    if (step === 0 && !selectedFile) {
      setUploadError('Selecciona un archivo o toma una foto para continuar.');
      return;
    }

    if (step < 3) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleStartSession = () => {
    router.push('/home');
  };

  return (
    <ScreenContainer style={styles.page}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.badge}>Generación IA</View>
          <Text style={styles.title}>Convierte tu material en una sesión de estudio.</Text>
          <Text style={styles.subtitle}>Sube una foto o PDF y deja que NemUp prepare preguntas, resúmenes y ejercicios.</Text>
        </View>

        <View style={styles.timeline}>
          {STEP_TITLES.map((item, index) => {
            const active = index === step;
            const done = index < step;
            return (
              <View key={item.label} style={styles.timelineItem}>
                <View style={[styles.timelineDot, active && styles.timelineDotActive, done && styles.timelineDotDone]}>
                  <Text style={[styles.timelineDotText, (active || done) && styles.timelineDotTextActive]}>{index + 1}</Text>
                </View>
                <Text style={[styles.timelineLabel, active && styles.timelineLabelActive]}>{item.label}</Text>
                <Text style={styles.timelineSub}>{item.sub}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.phoneFrame}>
          <View style={styles.statusBar}>
            <Text style={styles.statusText}>10:34</Text>
            <View style={styles.statusRight}>
              <View style={styles.signal} />
              <View style={styles.battery}>
                <View style={styles.batteryFill} />
              </View>
            </View>
          </View>

          <View style={styles.screen}> 
            {step === 0 && (
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Sube tu material</Text>
                <Text style={styles.stepDescription}>Elige cómo quieres entregar tu nota y deja que NemUp haga el resto.</Text>

                <View style={styles.methodGrid}>
                  {METHOD_OPTIONS.map(method => (
                    <Pressable
                      key={method.id}
                      style={({ pressed }) => [
                        styles.methodCard,
                        selectedMethod === method.id && styles.methodCardActive,
                        pressed && styles.methodCardPressed,
                      ]}
                      onPress={() => setSelectedMethod(method.id)}
                    >
                      <Text style={styles.methodEmoji}>{method.emoji}</Text>
                      <Text style={styles.methodTitle}>{method.title}</Text>
                      <Text style={styles.methodDescription}>{method.description}</Text>
                    </Pressable>
                  ))}
                </View>

                <Pressable style={[styles.dropArea, selectedFile && styles.dropAreaSelected]} onPress={handleOpenPicker}>
                  <View style={styles.dropIcon}>
                    <Text style={styles.dropIconEmoji}>📤</Text>
                  </View>
                  {!selectedFile ? (
                    <>
                      <Text style={styles.dropTitle}>Arrastra tu archivo o toca para seleccionar</Text>
                      <Text style={styles.dropSubtitle}>PDF, imagen o captura rápida</Text>
                      <View style={styles.formatList}>
                        <Text style={styles.formatPill}>PDF</Text>
                        <Text style={styles.formatPill}>IMG</Text>
                        <Text style={styles.formatPill}>JPG</Text>
                      </View>
                    </>
                  ) : (
                    <View style={styles.filePreview}>
                      <Text style={styles.fileName}>{selectedFile.name}</Text>
                      <Text style={styles.fileMeta}>{selectedFile.mimeType.toUpperCase()} • {selectedFile.sizeText}</Text>
                      <Text style={styles.fileHint}>Toca para reemplazar</Text>
                    </View>
                  )}
                </Pressable>
                {uploadError ? <Text style={styles.uploadError}>{uploadError}</Text> : null}

                <View style={styles.recentSection}>
                  <Text style={styles.recentTitle}>Archivos recientes</Text>
                  {RECENT_FILES.map((file, index) => (
                    <View key={file.name} style={styles.recentItem}>
                      <View style={[styles.recentIcon, index === 0 ? styles.recentIconPdf : styles.recentIconImg]}>
                        <Text style={styles.recentIconText}>{file.mimeType.includes('pdf') ? 'PDF' : 'IMG'}</Text>
                      </View>
                      <View style={styles.recentInfo}>
                        <Text style={styles.recentName}>{file.name}</Text>
                        <Text style={styles.recentMeta}>{file.mimeType.includes('pdf') ? '2 páginas •' : '1 página •'} {file.sizeText}</Text>
                      </View>
                      <Pressable onPress={() => handleUseRecent(file)}>
                        <Text style={styles.recentAction}>Usar</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {step === 1 && (
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Ajusta tu extracción</Text>
                <Text style={styles.stepDescription}>Revisa el contenido detectado y elige el formato de tu sesión.</Text>

                <View style={styles.scanPreview}>
                  <View style={styles.scanPage}>
                    <View style={[styles.scanLine, styles.scanLineTitle]} />
                    <View style={[styles.scanLine, styles.scanLineShort]} />
                    <View style={[styles.scanLine, styles.scanLineMed]} />
                    <View style={[styles.scanLine, styles.scanLineShorter]} />
                    <View style={[styles.scanLine, styles.scanLine, { width: '90%' }]} />
                    <View style={[styles.scanLine, styles.scanLineShort]} />
                    <View style={[styles.scanLine, styles.scanLine, { width: '95%' }]} />
                  </View>
                  <View style={styles.scanOverlay} />
                  <View style={[styles.scanCorner, styles.scanCornerTl]} />
                  <View style={[styles.scanCorner, styles.scanCornerTr]} />
                  <View style={[styles.scanCorner, styles.scanCornerBl]} />
                  <View style={[styles.scanCorner, styles.scanCornerBr]} />
                  <View style={styles.scanLaser} />
                  <View style={styles.scanStatus}>
                    <View style={styles.scanDot} />
                    <Text style={styles.scanStatusText}>Escaneando contenido</Text>
                  </View>
                </View>

                <View style={styles.detectedInfo}>
                  <View style={styles.detectedRow}>
                    <Text style={styles.detectedKey}>Asignatura</Text>
                    <Text style={styles.detectedVal}>Biología</Text>
                  </View>
                  <View style={styles.detectedRow}>
                    <Text style={styles.detectedKey}>Páginas</Text>
                    <Text style={styles.detectedVal}>5 páginas</Text>
                  </View>
                  <View style={styles.detectedRow}>
                    <Text style={styles.detectedKey}>Calidad</Text>
                    <Text style={styles.detectedVal}>Muy buena</Text>
                  </View>
                </View>

                <View style={styles.configSection}>
                  <Text style={styles.configTitle}>Tipo de sesión</Text>
                  <View style={styles.configRow}>
                    {CONFIG_OPTIONS.map(option => (
                      <Pressable
                        key={option.id}
                        style={({ pressed }) => [
                          styles.configPill,
                          sessionType === option.id && styles.configPillActive,
                          pressed && styles.configPillPressed,
                        ]}
                        onPress={() => setSessionType(option.id)}
                      >
                        <Text style={styles.pillEmoji}>{option.emoji}</Text>
                        <Text style={styles.pillLabel}>{option.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.durationSlider}>
                  <View style={styles.durationTop}>
                    <Text style={styles.durationLabel}>Duración estimada</Text>
                    <Text style={styles.durationValue}>{duration} min</Text>
                  </View>
                  <View style={styles.sliderTrack}>
                    <View style={[styles.sliderFill, { width: `${Math.min(duration / 40, 1) * 100}%` }]} />
                    <View style={[styles.sliderThumb, { left: `${Math.min(duration / 40, 1) * 100}%` }]} />
                  </View>
                </View>
              </View>
            )}

            {step === 2 && (
              <View style={styles.genContent}>
                <Text style={styles.genTitle}>Generando tu sesión</Text>
                <Text style={styles.genSubtitle}>Estamos transformando tu material en una experiencia de estudio personalizada.</Text>
                {generationError ? (
                  <View style={styles.errorBanner}>
                    <Text style={styles.errorTitle}>Error al generar</Text>
                    <Text style={styles.errorMessage}>{generationError}</Text>
                  </View>
                ) : null}
                <View style={styles.genVisual}>
                  <View style={styles.genBrain}>🧠</View>
                  <View style={[styles.genRing, styles.genRing1]} />
                  <View style={[styles.genRing, styles.genRing2]} />
                  <View style={[styles.genRing, styles.genRing3]} />
                  <Text style={[styles.genSparkle, styles.sparkle1]}>✨</Text>
                  <Text style={[styles.genSparkle, styles.sparkle2]}>⚡</Text>
                  <Text style={[styles.genSparkle, styles.sparkle3]}>💡</Text>
                </View>

                <View style={styles.genProgressWrap}>
                  <View style={styles.genProgressBar}>
                    <View style={[styles.genProgressFill, { width: progressWidth }]} />
                  </View>
                  <View style={styles.genProgressMeta}>
                    <Text style={styles.genProgressPct}>{progressWidth}</Text>
                    <Text style={styles.genProgressTime}>{lastProgress?.message ?? 'Conectando con el servidor...'}</Text>
                  </View>
                </View>

                <View style={styles.genTasks}>
                  {buildTaskSteps(lastProgress?.stage ?? 'uploading').map((task) => (
                    <View
                      key={task.stage}
                      style={[
                        styles.genTask,
                        task.status === 'done' && styles.genTaskDone,
                        task.status === 'active' && styles.genTaskActive,
                        task.status === 'pending' && styles.genTaskPending,
                      ]}
                    >
                      <View
                        style={[
                          styles.taskIcon,
                          task.status === 'done'
                            ? styles.taskIconDone
                            : task.status === 'active'
                            ? styles.taskIconActive
                            : styles.taskIconPending,
                        ]}
                      >
                        <Text>{task.status === 'done' ? '✓' : task.status === 'active' ? '…' : '⏳'}</Text>
                      </View>
                      <View style={styles.taskDetails}>
                        <Text
                          style={[
                            styles.taskText,
                            task.status === 'done' && styles.taskTextDone,
                            task.status === 'active' && styles.taskTextActive,
                          ]}
                        >
                          {task.label}
                        </Text>
                        <Text style={styles.taskMeta}>
                          {task.status === 'done' ? 'Hecho' : task.status === 'active' ? 'En curso' : 'Pendiente'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {step === 3 && (
              <View style={styles.stepContent}>
                <View style={styles.readyHero}>
                  <View style={styles.readyCheck}>✓</View>
                  <Text style={styles.readyTitle}>¡Todo listo!</Text>
                  <Text style={styles.readySubtitle}>Tu sesión se creó en base al material subido. Ya puedes comenzar a estudiar.</Text>
                </View>

                <View style={styles.sessionPreview}>
                  <View style={styles.sessionTop}>
                    <View style={styles.sessionIcon}><Text style={styles.sessionIconText}>📘</Text></View>
                    <View style={styles.sessionInfo}>
                      <Text style={styles.sessionName}>{completedSession?.subject ?? 'Sesión generada'}</Text>
                      <Text style={styles.sessionTopic}>{completedSession?.topic ?? 'Tu material convertido en sesión'} • {completedSession?.estimatedDuration ?? duration} min</Text>
                    </View>
                  </View>
                  <View style={styles.sessionComponents}>
                    <View style={styles.sessionComp}><Text style={styles.sessionCompIcon}>💡</Text><Text style={styles.sessionCompLabel}>Resumen rápido</Text></View>
                    <View style={styles.sessionComp}><Text style={styles.sessionCompIcon}>🧠</Text><Text style={styles.sessionCompLabel}>Preguntas guía</Text></View>
                    <View style={styles.sessionComp}><Text style={styles.sessionCompIcon}>⏱️</Text><Text style={styles.sessionCompLabel}>{completedSession?.estimatedDuration ?? duration} min</Text></View>
                  </View>
                  <View style={styles.sessionMetaRow}>
                    <View><Text style={styles.sessionMetaValue}>+{completedSession?.xpReward ?? 0} XP</Text><Text style={styles.sessionMetaLabel}>Recompensa</Text></View>
                    <View><Text style={styles.sessionMetaValue}>{completedSession?.difficulty ? completedSession.difficulty.charAt(0).toUpperCase() + completedSession.difficulty.slice(1) : 'Adaptive'}</Text><Text style={styles.sessionMetaLabel}>Dificultad</Text></View>
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>

        <View style={styles.actionRow}>
          {step > 0 ? (
            <Pressable style={styles.secondaryButton} onPress={handleBack}>
              <Text style={styles.secondaryButtonText}>Volver</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.primaryButton, step === 2 && styles.primaryButtonDisabled]}
            onPress={step === 3 ? handleStartSession : handleContinue}
            disabled={step === 2}
          >
            <Text style={styles.primaryButtonText}>{step === 3 ? 'Comenzar sesión' : step === 2 ? 'Generando...' : 'Continuar'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 22,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.brandSoft,
    color: Colors.brand,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 100,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '800',
    color: Colors.ink,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.ink3,
    lineHeight: 22,
  },
  timeline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  timelineItem: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  timelineDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: Colors.brand,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  timelineDotActive: {
    backgroundColor: Colors.brand,
  },
  timelineDotDone: {
    backgroundColor: Colors.accent,
    borderColor: 'transparent',
  },
  timelineDotText: {
    color: Colors.brand,
    fontWeight: '800',
  },
  timelineDotTextActive: {
    color: Colors.paper,
  },
  timelineLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.ink2,
    marginBottom: 2,
  },
  timelineLabelActive: {
    color: Colors.brand,
  },
  timelineSub: {
    fontSize: 10,
    color: Colors.muted,
    textAlign: 'center',
  },
  phoneFrame: {
    backgroundColor: Colors.paper,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.line,
    marginBottom: 24,
    shadowColor: Colors.ink,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 30,
    elevation: 6,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: Colors.bgSoft,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.ink3,
  },
  statusRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  signal: {
    width: 18,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.ink,
  },
  battery: {
    width: 28,
    height: 12,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Colors.ink,
    padding: 2,
  },
  batteryFill: {
    width: '75%',
    height: '100%',
    backgroundColor: Colors.ink,
    borderRadius: 2,
  },
  screen: {
    padding: 18,
    minHeight: 560,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.ink,
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 13,
    color: Colors.ink3,
    lineHeight: 20,
    marginBottom: 20,
  },
  methodGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  methodCard: {
    flex: 1,
    backgroundColor: Colors.paper,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.line,
    padding: 14,
    marginRight: 10,
  },
  methodCardActive: {
    backgroundColor: Colors.brandSoft,
    borderColor: Colors.brand,
  },
  methodCardPressed: {
    opacity: 0.8,
  },
  methodEmoji: {
    fontSize: 24,
    marginBottom: 10,
  },
  methodTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
    color: Colors.ink,
  },
  methodDescription: {
    fontSize: 11,
    color: Colors.ink3,
    lineHeight: 16,
  },
  dropArea: {
    backgroundColor: Colors.bgSoft,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.line2,
    padding: 18,
    alignItems: 'center',
    marginBottom: 14,
  },
  dropIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: Colors.brand,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    fontSize: 28,
    color: Colors.paper,
  },
  dropTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.ink,
    marginBottom: 6,
  },
  dropSubtitle: {
    fontSize: 11,
    color: Colors.ink3,
    textAlign: 'center',
    marginBottom: 12,
  },
  formatList: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  formatPill: {
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: 100,
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 11,
    color: Colors.ink3,
  },
  dropAreaSelected: {
    borderColor: Colors.brand,
    backgroundColor: Colors.brandSoft,
  },
  filePreview: {
    alignItems: 'flex-start',
    width: '100%',
    marginTop: 6,
  },
  dropIconEmoji: {
    fontSize: 26,
  },
  fileName: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.ink,
    marginBottom: 4,
  },
  fileMeta: {
    fontSize: 11,
    color: Colors.ink3,
    marginBottom: 8,
  },
  fileHint: {
    fontSize: 11,
    color: Colors.brand,
    fontWeight: '700',
  },
  uploadError: {
    marginTop: 10,
    color: '#D92D20',
    fontSize: 12,
    fontWeight: '700',
  },
  recentSection: {
    marginTop: 6,
  },
  recentTitle: {
    fontSize: 10,
    color: Colors.muted,
    fontWeight: '700',
    marginBottom: 10,
    letterSpacing: 0.08,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.line,
    padding: 12,
    backgroundColor: Colors.paper,
    marginBottom: 10,
  },
  recentIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  recentIconPdf: {
    backgroundColor: '#FEE2E2',
  },
  recentIconImg: {
    backgroundColor: '#DBEAFE',
  },
  recentIconText: {
    fontSize: 12,
    fontWeight: '700',
  },
  recentInfo: {
    flex: 1,
  },
  recentName: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.ink,
  },
  recentMeta: {
    fontSize: 10,
    color: Colors.muted,
    marginTop: 2,
  },
  recentAction: {
    fontSize: 12,
    color: Colors.brand,
    fontWeight: '700',
  },
  scanPreview: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#1A1A2E',
    marginBottom: 14,
    minHeight: 210,
  },
  scanPage: {
    position: 'absolute',
    inset: 10,
    backgroundColor: '#FAFAF5',
    borderRadius: 16,
    padding: 16,
  },
  scanLine: {
    height: 6,
    backgroundColor: 'rgba(11,11,26,0.15)',
    borderRadius: 4,
    marginBottom: 8,
  },
  scanLineTitle: {
    width: '60%',
    backgroundColor: 'rgba(91,61,245,0.4)',
  },
  scanLineShort: {
    width: '70%',
  },
  scanLineShorter: {
    width: '40%',
  },
  scanLineMed: {
    width: '85%',
  },
  scanOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(91,61,245,0.08)',
  },
  scanCorner: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 3,
    borderColor: Colors.lime,
  },
  scanCornerTl: {
    top: 8,
    left: 8,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  scanCornerTr: {
    top: 8,
    right: 8,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  scanCornerBl: {
    bottom: 8,
    left: 8,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  scanCornerBr: {
    bottom: 8,
    right: 8,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  scanLaser: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: '45%',
    height: 2,
    backgroundColor: Colors.lime,
  },
  scanStatus: {
    position: 'absolute',
    top: 12,
    left: '50%',
    transform: [{ translateX: -50 }],
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 100,
    flexDirection: 'row',
    alignItems: 'center',
  },
  scanDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.lime,
    marginRight: 6,
  },
  scanStatusText: {
    color: Colors.paper,
    fontSize: 10,
    fontWeight: '700',
  },
  detectedInfo: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.line,
    padding: 14,
    backgroundColor: Colors.brandSoft,
    marginBottom: 16,
  },
  detectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detectedKey: {
    color: Colors.ink3,
    fontSize: 11,
    fontWeight: '700',
  },
  detectedVal: {
    color: Colors.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  configSection: {
    marginBottom: 18,
  },
  configTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.muted,
    marginBottom: 10,
    letterSpacing: 0.08,
  },
  configRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  configPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 100,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.paper,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginRight: 8,
  },
  configPillActive: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  configPillPressed: {
    opacity: 0.8,
  },
  pillEmoji: {
    marginRight: 6,
    fontSize: 14,
  },
  pillLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.ink,
  },
  durationSlider: {
    backgroundColor: Colors.paper,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.line,
    padding: 14,
  },
  durationTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  durationLabel: {
    fontSize: 12,
    color: Colors.ink3,
    fontWeight: '700',
  },
  durationValue: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.brand,
  },
  sliderTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: Colors.bgSoft,
    overflow: 'hidden',
  },
  sliderFill: {
    height: '100%',
    backgroundColor: Colors.brand,
  },
  sliderThumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: Colors.brand,
    backgroundColor: Colors.paper,
    top: -5,
  },
  genContent: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 520,
  },
  genTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.ink,
    textAlign: 'center',
    marginBottom: 10,
  },
  genSubtitle: {
    fontSize: 13,
    color: Colors.ink3,
    textAlign: 'center',
    marginBottom: 22,
    lineHeight: 20,
  },
  genVisual: {
    width: 170,
    height: 170,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  genBrain: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    color: Colors.paper,
    fontSize: 42,
    shadowColor: Colors.brand,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 10,
  },
  genRing: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    borderColor: Colors.brand,
    borderWidth: 2,
  },
  genRing1: {
    opacity: 0.35,
  },
  genRing2: {
    opacity: 0.25,
  },
  genRing3: {
    opacity: 0.16,
  },
  genSparkle: {
    position: 'absolute',
    fontSize: 18,
  },
  sparkle1: {
    top: 10,
    left: 14,
  },
  sparkle2: {
    top: 12,
    right: 18,
  },
  sparkle3: {
    bottom: 16,
    left: 22,
  },
  genProgressWrap: {
    width: '100%',
    marginBottom: 18,
  },
  genProgressBar: {
    height: 8,
    borderRadius: 999,
    backgroundColor: Colors.bgSoft,
    overflow: 'hidden',
    marginBottom: 8,
  },
  genProgressFill: {
    height: '100%',
    backgroundColor: Colors.brand,
  },
  genProgressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  genProgressPct: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.brand,
  },
  genProgressTime: {
    fontSize: 11,
    color: Colors.muted,
  },
  genTasks: {
    width: '100%',
  },
  genTask: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.paper,
    marginBottom: 10,
  },
  taskDetails: {
    flex: 1,
  },
  errorBanner: {
    width: '100%',
    backgroundColor: 'rgba(255,77,109,0.12)',
    borderColor: 'rgba(255,77,109,0.22)',
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginTop: 12,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.rose,
    marginBottom: 6,
  },
  errorMessage: {
    fontSize: 13,
    color: Colors.ink3,
    lineHeight: 18,
  },
  genTaskDone: {
    backgroundColor: 'rgba(0,194,168,0.08)',
    borderColor: 'rgba(0,194,168,0.2)',
  },
  genTaskActive: {
    backgroundColor: Colors.brandSoft,
    borderColor: 'rgba(91,61,245,0.25)',
  },
  genTaskPending: {
    backgroundColor: Colors.bgSoft,
  },
  taskIcon: {
    width: 30,
    height: 30,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  taskIconDone: {
    backgroundColor: Colors.teal,
  },
  taskIconActive: {
    backgroundColor: Colors.brand,
  },
  taskIconPending: {
    backgroundColor: Colors.bgSoft,
  },
  taskText: {
    flex: 1,
    fontSize: 12,
    color: Colors.ink2,
  },
  taskTextDone: {
    color: Colors.ink3,
  },
  taskTextActive: {
    color: Colors.ink,
    fontWeight: '700',
  },
  taskMeta: {
    fontSize: 10,
    color: Colors.muted,
    marginLeft: 10,
  },
  readyHero: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: '#0B0B1A',
    marginBottom: 18,
  },
  readyCheck: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  readyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.paper,
    marginBottom: 8,
  },
  readySubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 18,
  },
  sessionPreview: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.paper,
    padding: 16,
  },
  sessionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  sessionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#DBFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sessionIconText: {
    fontSize: 18,
  },
  sessionInfo: {
    flex: 1,
  },
  sessionName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.ink,
    marginBottom: 4,
  },
  sessionTopic: {
    fontSize: 11,
    color: Colors.muted,
    lineHeight: 16,
  },
  sessionComponents: {
    marginBottom: 14,
  },
  sessionComp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sessionCompIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: Colors.brandSoft,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 12,
  },
  sessionCompLabel: {
    fontSize: 12,
    color: Colors.ink2,
  },
  sessionMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sessionMetaValue: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.ink,
  },
  sessionMetaLabel: {
    fontSize: 10,
    color: Colors.muted,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: Colors.brand,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: Colors.line,
  },
  primaryButtonText: {
    color: Colors.paper,
    fontWeight: '800',
    fontSize: 15,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.paper,
  },
  secondaryButtonText: {
    color: Colors.ink,
    fontWeight: '700',
    fontSize: 14,
  },
});
