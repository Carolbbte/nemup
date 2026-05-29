import { Colors } from '@/constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const { height: SCREEN_H } = Dimensions.get('window');
const SM = SCREEN_H < 740;

const BG   = '#F7F8FC';
const NEON = '#7C5AFF';

type Option = { id: string; text: string };
type Question = { id: string; text: string; options: Option[]; correctOptionId: string; explanation: string; sourceQuote: string };
type Flashcard = { id: string; front: string; back: string };
type SummarySection = { heading: string; content: string; keyPoints: string[] };
type Session = {
  subject: string; topic: string; estimatedDuration: number; difficulty: string;
  xpReward: number; gemReward: number; questions: Question[]; flashcards: Flashcard[];
  summary: { title: string; sections: SummarySection[] };
};
type Phase = 'lobby' | 'mode-select' | 'main' | 'complete';
type Tab = 'resumen' | 'quiz' | 'tarjetas';
type QuizStep = 'answering' | 'correct' | 'wrong';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];
const MAX_LIVES = 3;
const XP_PER_CORRECT = 10;
const SUBJECT_EMOJI: Record<string, string> = {
  biología: '🧬', biologia: '🧬', matemática: '📐', matematica: '📐',
  historia: '📜', física: '⚗️', fisica: '⚗️', química: '🔬', quimica: '🔬',
  lenguaje: '📝', inglés: '🌐', ingles: '🌐',
};
function subjectEmoji(subject: string) {
  const key = subject?.toLowerCase() ?? '';
  return Object.entries(SUBJECT_EMOJI).find(([k]) => key.includes(k))?.[1] ?? '📘';
}

const MODES: { id: Tab; title: string; desc: string; emoji: string; colors: [string, string] }[] = [
  { id: 'resumen',  title: 'Resumen',  desc: 'Lee y comprende los puntos clave',      emoji: '📖', colors: [NEON, Colors.brand] },
  { id: 'quiz',     title: 'Quiz',     desc: 'Pon a prueba lo que aprendiste',         emoji: '🧠', colors: ['#4A3BC8', '#3025A8'] },
  { id: 'tarjetas', title: 'Tarjetas', desc: 'Repasa con tarjetas interactivas',       emoji: '🃏', colors: ['#1E9E72', '#117A55'] },
];

export default function SessionPlayerScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { data } = useLocalSearchParams<{ data: string }>();
  const session: Session | null = data ? JSON.parse(data as string) : null;

  const [phase, setPhase]           = useState<Phase>('lobby');
  const [activeTab, setActiveTab]   = useState<Tab>('resumen');

  // Quiz state
  const [quizIndex, setQuizIndex]         = useState(0);
  const [quizStep, setQuizStep]           = useState<QuizStep>('answering');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [lives, setLives]                 = useState(MAX_LIVES);
  const [xpEarned, setXpEarned]           = useState(0);
  const [correctCount, setCorrectCount]   = useState(0);
  const [quizDone, setQuizDone]           = useState(false);

  // Flashcard state
  const [cardIndex, setCardIndex]   = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);

  const feedbackScale = useRef(new Animated.Value(0)).current;
  const confetti = useRef(
    Array.from({ length: 6 }, () => ({ y: new Animated.Value(0), op: new Animated.Value(0) }))
  ).current;

  const questions  = session?.questions  ?? [];
  const flashcards = session?.flashcards ?? [];
  const question   = questions[quizIndex];
  const card       = flashcards[cardIndex];

  useEffect(() => {
    if (quizStep === 'correct' || quizStep === 'wrong') {
      Animated.spring(feedbackScale, { toValue: 1, tension: 220, friction: 9, useNativeDriver: true }).start();
      if (quizStep === 'correct') {
        confetti.forEach((c, i) => {
          c.y.setValue(0); c.op.setValue(1);
          Animated.parallel([
            Animated.timing(c.y, { toValue: -90, duration: 700 + i * 60, delay: i * 60, useNativeDriver: true }),
            Animated.timing(c.op, { toValue: 0, duration: 800, delay: i * 60 + 250, useNativeDriver: true }),
          ]).start();
        });
      }
    } else {
      feedbackScale.setValue(0);
    }
  }, [quizStep]);

  if (!session) {
    return <View style={styles.page}><Text style={{ padding: 40, color: Colors.muted }}>Sin datos de sesión.</Text></View>;
  }

  const handleAnswer = () => {
    if (!selectedOption || !question) return;
    const isCorrect = selectedOption === question.correctOptionId;
    if (isCorrect) {
      setCorrectCount(c => c + 1);
      setXpEarned(xp => xp + XP_PER_CORRECT);
      setQuizStep('correct');
    } else {
      setLives(l => Math.max(0, l - 1));
      setQuizStep('wrong');
    }
  };

  const handleNext = () => {
    const next = quizIndex + 1;
    if (next >= questions.length) {
      setQuizDone(true);
    } else {
      setQuizIndex(next);
      setSelectedOption(null);
      setQuizStep('answering');
    }
  };

  const handleRestartQuiz = () => {
    setQuizIndex(0);
    setSelectedOption(null);
    setQuizStep('answering');
    setCorrectCount(0);
    setLives(MAX_LIVES);
    setXpEarned(0);
    setQuizDone(false);
  };

  const handleCardRate = () => {
    const next = cardIndex + 1;
    if (next >= flashcards.length) {
      setCardIndex(0);
      setCardFlipped(false);
    } else {
      setCardIndex(next);
      setCardFlipped(false);
    }
  };

  const progressPct = questions.length > 0 ? Math.round((quizIndex / questions.length) * 100) : 0;

  /* ──────────────── LOBBY ──────────────── */
  if (phase === 'lobby') {
    const learnItems = session.summary?.sections?.slice(0, 3).map(s => s.heading).filter(Boolean) ?? [];
    return (
      <SafeAreaView style={lob.page} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />

        {/* Header */}
        <View style={lob.header}>
          <Pressable onPress={() => router.back()} style={lob.iconBtn} hitSlop={10}>
            <Text style={lob.iconBtnText}>←</Text>
          </Pressable>
          <Text style={lob.headerTitle}>Sesión de estudio</Text>
          <View style={lob.xpPill}>
            <Text style={lob.xpPillText}>⚡ {session.xpReward}</Text>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[lob.scroll, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero card */}
          <LinearGradient
            colors={[Colors.brand, NEON]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={lob.heroCard}
          >
            <View style={lob.heroGlow1} />
            <View style={lob.heroGlow2} />
            <View style={lob.heroRow}>
              <View style={{ flex: 1 }}>
                <Text style={lob.heroSubjectLabel}>{session.subject?.toUpperCase()}</Text>
                <Text style={lob.heroTitle}>{session.topic}</Text>
                <View style={lob.heroChipsRow}>
                  <View style={lob.heroChip}><Text style={lob.heroChipText}>⏱ {session.estimatedDuration} min</Text></View>
                  <View style={lob.heroChip}><Text style={lob.heroChipText}>🎯 {session.difficulty}</Text></View>
                  <View style={lob.heroChip}><Text style={lob.heroChipText}>{questions.length} preguntas</Text></View>
                </View>
              </View>
              <Text style={lob.heroEmoji}>{subjectEmoji(session.subject)}</Text>
            </View>
          </LinearGradient>

          {/* Rewards */}
          <View style={lob.rewardsRow}>
            <View style={lob.rewardCard}>
              <Text style={lob.rewardEmoji}>⚡</Text>
              <Text style={lob.rewardVal}>+{session.xpReward}</Text>
              <Text style={lob.rewardLbl}>XP</Text>
            </View>
            <View style={lob.rewardCard}>
              <Text style={lob.rewardEmoji}>💎</Text>
              <Text style={lob.rewardVal}>+{session.gemReward ?? 10}</Text>
              <Text style={lob.rewardLbl}>GEMAS</Text>
            </View>
          </View>

          {/* Lo que vas a aprender */}
          {learnItems.length > 0 && (
            <View style={lob.learnBox}>
              <Text style={lob.learnLabel}>📚  LO QUE VAS A APRENDER</Text>
              {learnItems.map((item, i) => (
                <View key={i} style={lob.learnRow}>
                  <View style={lob.learnDot} />
                  <Text style={lob.learnText}>{item}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Fixed bottom CTA */}
        <View style={[lob.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable onPress={() => setPhase('mode-select')} style={{ width: '100%' }}>
            <LinearGradient colors={[Colors.brand, NEON]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={lob.ctaBtn}>
              <Text style={lob.ctaText}>¡Comenzar sesión! ⚡</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  /* ──────────────── MODE SELECT ──────────────── */
  if (phase === 'mode-select') {
    return (
      <SafeAreaView style={ms.page} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />

        {/* Header */}
        <View style={ms.header}>
          <Pressable onPress={() => setPhase('lobby')} style={ms.closeBtn} hitSlop={10}>
            <Text style={ms.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[ms.scroll, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={ms.title}>¿Qué quieres hacer?</Text>
          <Text style={ms.subtitle}>Elige tu modo de estudio</Text>

          {MODES.map(mode => (
            <Pressable
              key={mode.id}
              onPress={() => { setActiveTab(mode.id); setPhase('main'); }}
              style={{ marginBottom: 14 }}
            >
              <LinearGradient
                colors={mode.colors}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={ms.modeCard}
              >
                <View style={{ flex: 1 }}>
                  <Text style={ms.modeTitle}>{mode.title}</Text>
                  <Text style={ms.modeDesc}>{mode.desc}</Text>
                </View>
                <Text style={ms.modeEmoji}>{mode.emoji}</Text>
              </LinearGradient>
            </Pressable>
          ))}

          {/* Study tip */}
          <View style={ms.tipCard}>
            <Text style={ms.tipIcon}>💡</Text>
            <Text style={ms.tipText}>
              Alterna entre los 3 modos para aprender mejor y no aburrirte.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  /* ──────────────── COMPLETE ──────────────── */
  if (phase === 'complete') {
    const accuracy = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 100;
    return (
      <View style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.brand} />
        <LinearGradient colors={[Colors.brand, Colors.accent]} style={{ flex: 1 }}>
          {CONFETTI_COMPLETE.map((s, i) => <View key={i} style={[styles.confettiComplete, s]} />)}
          <SafeAreaView style={styles.completeSafe}>
            <View style={styles.trophyCircle}>
              <Text style={styles.trophyEmoji}>🏆</Text>
            </View>
            <Text style={styles.completeTitle}>¡Sesión{'\n'}<Text style={{ color: Colors.lime }}>completada!</Text></Text>
            <Text style={styles.completeSub}>Acabas de reforzar tu conocimiento real.</Text>

            <View style={styles.statsGrid}>
              {[
                { emoji: '⚡', val: `+${xpEarned}`, lbl: 'XP' },
                { emoji: '💎', val: `+${session.gemReward ?? Math.round(xpEarned / 5)}`, lbl: 'GEMAS' },
                { emoji: '🎯', val: `${accuracy}%`, lbl: 'ACIERTOS' },
              ].map(({ emoji, val, lbl }) => (
                <View key={lbl} style={styles.statCell}>
                  <Text style={styles.statEmoji}>{emoji}</Text>
                  <Text style={styles.statVal}>{val}</Text>
                  <Text style={styles.statLbl}>{lbl}</Text>
                </View>
              ))}
            </View>

            <View style={styles.nemBox}>
              <View style={styles.nemIcon}><Text>📈</Text></View>
              <View>
                <Text style={styles.nemLabel}>NEM PROYECTADO</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.nemVal}>6.2</Text>
                  <View style={styles.nemDelta}><Text style={styles.nemDeltaText}>↑ +0.03</Text></View>
                </View>
              </View>
            </View>

            <View style={{ gap: 10, marginTop: 'auto', width: '100%' }}>
              <Pressable onPress={() => router.push('/home' as any)}>
                <View style={styles.completePrimaryBtn}>
                  <Text style={styles.completePrimaryText}>Volver al inicio →</Text>
                </View>
              </Pressable>
              <Pressable style={styles.completeShareBtn}>
                <Text style={styles.completeShareText}>★  Compartir mi logro</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </LinearGradient>
      </View>
    );
  }

  /* ──────────────── MAIN (TABS) ──────────────── */
  const tabs: { id: Tab; label: string; emoji: string }[] = [
    { id: 'resumen', label: 'Resumen', emoji: '📖' },
    { id: 'quiz', label: 'Quiz', emoji: '🧠' },
    { id: 'tarjetas', label: 'Tarjetas', emoji: '🃏' },
  ];

  return (
    <View style={styles.page}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.paper} />
      <SafeAreaView style={{ flex: 1 }}>

        {/* Header */}
        <View style={styles.mainHeader}>
          <Pressable onPress={() => setPhase('mode-select')} style={styles.exitBtn}>
            <Text style={styles.exitText}>✕</Text>
          </Pressable>
          <View style={styles.mainHeaderCenter}>
            <Text style={styles.mainHeaderSubject} numberOfLines={1}>{session.subject}</Text>
            <Text style={styles.mainHeaderTopic} numberOfLines={1}>{session.topic}</Text>
          </View>
          <View style={styles.xpBadge}>
            <Text style={styles.xpText}>⚡ +{session.xpReward}</Text>
          </View>
        </View>

        {/* Tab bar */}
        <View style={styles.tabBar}>
          {tabs.map((tab) => (
            <Pressable
              key={tab.id}
              style={[styles.tab, activeTab === tab.id && styles.tabActive]}
              onPress={() => setActiveTab(tab.id)}
            >
              <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
                {tab.emoji} {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── RESUMEN TAB ── */}
        {activeTab === 'resumen' && (
          <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionTitle}>{session.summary?.title ?? 'Resumen'}</Text>
            {(session.summary?.sections ?? []).map((section, i) => (
              <View key={i} style={styles.summaryCard}>
                <Text style={styles.summaryHeading}>{section.heading}</Text>
                <Text style={styles.summaryContent}>{section.content}</Text>
                {section.keyPoints?.length > 0 && (
                  <View style={styles.keyPoints}>
                    {section.keyPoints.map((point, j) => (
                      <View key={j} style={styles.keyPoint}>
                        <View style={styles.keyPointDot} />
                        <Text style={styles.keyPointText}>{point}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
            {(!session.summary?.sections || session.summary.sections.length === 0) && (
              <Text style={styles.emptyText}>No hay resumen disponible para esta sesión.</Text>
            )}
          </ScrollView>
        )}

        {/* ── QUIZ TAB ── */}
        {activeTab === 'quiz' && (
          <>
            {questions.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No hay preguntas disponibles.</Text>
              </View>
            ) : quizDone ? (
              <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
                <View style={styles.quizResult}>
                  <Text style={styles.quizResultEmoji}>
                    {correctCount >= questions.length * 0.8 ? '🏆' : correctCount >= questions.length * 0.5 ? '👍' : '📚'}
                  </Text>
                  <Text style={styles.quizResultTitle}>Quiz completado</Text>
                  <Text style={styles.quizResultScore}>{correctCount} / {questions.length}</Text>
                  <Text style={styles.quizResultMsg}>
                    {correctCount >= questions.length * 0.8
                      ? '¡Excelente dominio del tema!'
                      : correctCount >= questions.length * 0.5
                      ? 'Buen trabajo, sigue practicando.'
                      : 'Repasa el resumen y vuelve a intentarlo.'}
                  </Text>
                  <View style={styles.quizResultStats}>
                    <View style={styles.qrStat}>
                      <Text style={styles.qrStatVal}>⚡ +{xpEarned}</Text>
                      <Text style={styles.qrStatLbl}>XP ganados</Text>
                    </View>
                    <View style={styles.qrStat}>
                      <Text style={styles.qrStatVal}>❤️ {lives}/{MAX_LIVES}</Text>
                      <Text style={styles.qrStatLbl}>Vidas restantes</Text>
                    </View>
                  </View>
                  <Pressable onPress={handleRestartQuiz} style={styles.retryBtn}>
                    <Text style={styles.retryBtnText}>Intentar nuevamente</Text>
                  </Pressable>
                  <Pressable onPress={() => setPhase('complete')} style={{ width: '100%' }}>
                    <LinearGradient colors={[Colors.brand, '#7C5AFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.bigCtaGrad}>
                      <Text style={styles.bigCtaText}>Finalizar sesión 🎉</Text>
                    </LinearGradient>
                  </Pressable>
                </View>
              </ScrollView>
            ) : (
              <>
                <View style={styles.quizTopBar}>
                  <View style={styles.progressTrack}>
                    <LinearGradient
                      colors={[Colors.brand, Colors.accent]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={[styles.progressFill, { width: `${progressPct}%` }]}
                    />
                  </View>
                  <View style={styles.livesRow}>
                    {Array.from({ length: MAX_LIVES }).map((_, i) => (
                      <Text key={i} style={styles.heart}>{i < lives ? '❤️' : '🤍'}</Text>
                    ))}
                  </View>
                </View>

                {quizStep === 'correct' && confetti.map((c, i) => (
                  <Animated.View key={i} style={[styles.confetti, CONFETTI_POS[i], { transform: [{ translateY: c.y }], opacity: c.op }]} />
                ))}

                <ScrollView contentContainerStyle={styles.quizScroll} showsVerticalScrollIndicator={false}>
                  <Text style={[styles.qInstruction, quizStep === 'wrong' && { color: Colors.rose }]}>
                    {quizStep === 'answering' ? 'SELECCIONA LA RESPUESTA CORRECTA' : quizStep === 'correct' ? '¡PROSIGUE!' : 'REVISEMOS ESO'}
                  </Text>
                  <Text style={styles.qCounter}>{quizIndex + 1} / {questions.length}</Text>
                  <Text style={styles.qText}>{question.text}</Text>

                  {question.sourceQuote ? (
                    <View style={styles.sourceChip}>
                      <Text style={styles.sourceChipText}>📖 De tu material</Text>
                    </View>
                  ) : null}

                  <View style={styles.optionsWrap}>
                    {question.options.map((opt, i) => {
                      const letter = LETTERS[i] ?? String(i + 1);
                      const isSelected = selectedOption === opt.id;
                      const isCorrectOpt = opt.id === question.correctOptionId;
                      const answered = quizStep !== 'answering';
                      const isWrongSelected = answered && isSelected && !isCorrectOpt;

                      const optBorder = answered
                        ? isCorrectOpt ? Colors.teal : isWrongSelected ? Colors.rose : Colors.line
                        : isSelected ? Colors.brand : Colors.line;
                      const optBg = answered
                        ? isCorrectOpt ? 'rgba(0,194,168,0.08)' : isWrongSelected ? 'rgba(255,77,109,0.08)' : Colors.paper
                        : isSelected ? Colors.brandSoft : Colors.paper;
                      const letterBg = answered
                        ? isCorrectOpt ? Colors.teal : isWrongSelected ? Colors.rose : Colors.bgSoft
                        : isSelected ? Colors.brand : Colors.bgSoft;
                      const letterColor = (answered && (isCorrectOpt || isWrongSelected)) || (!answered && isSelected) ? Colors.paper : Colors.ink;

                      return (
                        <Pressable
                          key={opt.id}
                          style={[styles.option, { borderColor: optBorder, backgroundColor: optBg, opacity: answered && !isCorrectOpt && !isWrongSelected ? 0.4 : 1 }]}
                          onPress={() => quizStep === 'answering' && setSelectedOption(opt.id)}
                          disabled={quizStep !== 'answering'}
                        >
                          <View style={[styles.optLetter, { backgroundColor: letterBg }]}>
                            <Text style={[styles.optLetterText, { color: letterColor }]}>{letter}</Text>
                          </View>
                          <Text style={[styles.optText, answered && isCorrectOpt && { color: '#006B5F', fontWeight: '700' }, answered && isWrongSelected && { color: '#B91C30', fontWeight: '700' }]}>
                            {opt.text}
                          </Text>
                          {answered && isCorrectOpt && <Text style={styles.optIcon}>✓</Text>}
                          {answered && isWrongSelected && <Text style={styles.optIcon}>✕</Text>}
                        </Pressable>
                      );
                    })}
                  </View>

                  {quizStep !== 'answering' && (
                    <View style={[styles.feedbackBanner, quizStep === 'correct' ? styles.feedbackCorrect : styles.feedbackWrong]}>
                      <View style={styles.feedbackTop}>
                        <Animated.View style={[styles.feedbackIcon, quizStep === 'correct' ? styles.feedbackIconOk : styles.feedbackIconErr, { transform: [{ scale: feedbackScale }] }]}>
                          <Text style={styles.feedbackIconTxt}>{quizStep === 'correct' ? '✓' : '✕'}</Text>
                        </Animated.View>
                        <View>
                          <Text style={[styles.feedbackTitle, { color: quizStep === 'correct' ? '#006B5F' : '#B91C30' }]}>
                            {quizStep === 'correct' ? '¡Excelente!' : 'Casi 🤍'}
                          </Text>
                          <View style={[styles.xpPill, quizStep === 'wrong' && styles.xpPillWrong]}>
                            <Text style={styles.xpPillText}>{quizStep === 'correct' ? `⚡ +${XP_PER_CORRECT} XP` : '💔 −1 vida'}</Text>
                          </View>
                        </View>
                      </View>
                      <Text style={styles.feedbackExpl}>{question.explanation}</Text>
                      {question.sourceQuote ? (
                        <View style={styles.feedbackSource}>
                          <Text style={styles.feedbackSourceLabel}>📖 EN TUS APUNTES</Text>
                          <Text style={styles.feedbackSourceText}>"{question.sourceQuote}"</Text>
                        </View>
                      ) : null}
                    </View>
                  )}
                </ScrollView>

                <View style={styles.bottomBar}>
                  {quizStep === 'answering' ? (
                    <Pressable onPress={handleAnswer} disabled={!selectedOption} style={{ width: '100%' }}>
                      <LinearGradient
                        colors={selectedOption ? [Colors.brand, '#7C5AFF'] : [Colors.line, Colors.line2]}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={styles.bigCtaGrad}
                      >
                        <Text style={[styles.bigCtaText, !selectedOption && { color: Colors.muted }]}>Comprobar</Text>
                      </LinearGradient>
                    </Pressable>
                  ) : (
                    <Pressable onPress={handleNext} style={{ width: '100%' }}>
                      <LinearGradient
                        colors={quizStep === 'correct' ? ['#C4F852', '#A8E020'] : [Colors.rose, '#E63950']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={styles.bigCtaGrad}
                      >
                        <Text style={[styles.bigCtaText, quizStep === 'correct' && { color: Colors.ink }]}>
                          {quizStep === 'correct' ? 'Continuar →' : 'Lo entiendo, sigamos →'}
                        </Text>
                      </LinearGradient>
                    </Pressable>
                  )}
                </View>
              </>
            )}
          </>
        )}

        {/* ── TARJETAS TAB ── */}
        {activeTab === 'tarjetas' && (
          <>
            {flashcards.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No hay tarjetas disponibles.</Text>
              </View>
            ) : (
              <>
                <View style={styles.fcWrap}>
                  <View style={styles.fcHeader}>
                    <View style={styles.fcNumPill}>
                      <Text style={styles.fcNumText}>TARJETA {cardIndex + 1} / {flashcards.length}</Text>
                    </View>
                    <View style={styles.masteryBar}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <View key={i} style={[styles.masteryDot, i < Math.min(cardIndex, 5) && styles.masteryDotOn]} />
                      ))}
                    </View>
                  </View>

                  <Text style={styles.fcInstruction}>RECUERDA EL CONCEPTO</Text>

                  <Pressable onPress={() => setCardFlipped(f => !f)} style={{ flex: 1 }}>
                    <LinearGradient colors={[Colors.brand, Colors.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.flashcard}>
                      <View style={styles.fcGlow1} /><View style={styles.fcGlow2} />
                      <Text style={styles.fcSideLabel}>{cardFlipped ? 'RESPUESTA' : 'PREGUNTA'}</Text>
                      <Text style={styles.fcQuestion}>{cardFlipped ? card.back : card.front}</Text>
                      {!cardFlipped && <Text style={styles.fcHint}>👆  Toca para ver respuesta</Text>}
                    </LinearGradient>
                  </Pressable>
                </View>

                {cardFlipped ? (
                  <View style={styles.srsRow}>
                    {[
                      { label: 'Otra vez', emoji: '😵', colors: [Colors.rose, '#E63950'] as [string, string] },
                      { label: 'Difícil', emoji: '🤔', colors: [Colors.amber, '#E8890A'] as [string, string] },
                      { label: 'Bien', emoji: '😊', colors: [Colors.teal, '#00A08A'] as [string, string] },
                      { label: 'Fácil', emoji: '⚡', colors: [Colors.brand, '#7C5AFF'] as [string, string] },
                    ].map(({ label, emoji, colors }) => (
                      <Pressable key={label} style={styles.srsBtn} onPress={handleCardRate}>
                        <LinearGradient colors={colors} style={styles.srsBtnGrad}>
                          <Text style={styles.srsBtnEmoji}>{emoji}</Text>
                          <Text style={styles.srsBtnLabel}>{label}</Text>
                        </LinearGradient>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <View style={styles.bottomBar}>
                    <Pressable onPress={() => setCardFlipped(true)} style={{ width: '100%' }}>
                      <LinearGradient colors={[Colors.accent, '#FF3D8A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.bigCtaGrad}>
                        <Text style={styles.bigCtaText}>Revelar respuesta</Text>
                      </LinearGradient>
                    </Pressable>
                  </View>
                )}
              </>
            )}
          </>
        )}
      </SafeAreaView>
    </View>
  );
}

const CONFETTI_POS = [
  { position: 'absolute' as const, top: 160, left: '18%', width: 9, height: 9, backgroundColor: Colors.lime, borderRadius: 2 },
  { position: 'absolute' as const, top: 152, right: '22%', width: 8, height: 8, backgroundColor: Colors.accent, borderRadius: 4 },
  { position: 'absolute' as const, top: 170, left: '40%', width: 10, height: 10, backgroundColor: '#FFD93D', transform: [{ rotate: '45deg' }] },
  { position: 'absolute' as const, top: 148, right: '12%', width: 8, height: 8, backgroundColor: Colors.teal, borderRadius: 4 },
  { position: 'absolute' as const, top: 176, left: '62%', width: 9, height: 9, backgroundColor: '#5BC8FF' },
  { position: 'absolute' as const, top: 156, left: '52%', width: 7, height: 7, backgroundColor: Colors.amber, borderRadius: 3 },
];

const CONFETTI_COMPLETE = [
  { top: '5%', left: '8%', backgroundColor: Colors.lime } as any,
  { top: '8%', right: '12%', backgroundColor: '#FFD93D', borderRadius: 5 } as any,
  { top: '14%', left: '28%', backgroundColor: '#5BC8FF' } as any,
  { top: '18%', right: '22%', backgroundColor: Colors.lime, borderRadius: 5 } as any,
  { top: '22%', left: '55%', backgroundColor: '#FFD93D' } as any,
  { top: '25%', right: '6%', backgroundColor: '#5BC8FF', borderRadius: 5 } as any,
];

// ── Lobby styles ──────────────────────────────────────────────────
const lob = StyleSheet.create({
  page:       { flex: 1, backgroundColor: BG },
  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  iconBtn:    { width: 36, height: 36, borderRadius: 11, backgroundColor: 'white', borderWidth: 1, borderColor: Colors.line, alignItems: 'center', justifyContent: 'center', shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 5, elevation: 2 },
  iconBtnText:{ fontSize: 17, color: Colors.ink, fontWeight: '700' },
  headerTitle:{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '800', color: Colors.ink, letterSpacing: -0.2 },
  xpPill:     { backgroundColor: Colors.ink, borderRadius: 100, paddingVertical: 5, paddingHorizontal: 10 },
  xpPillText: { color: Colors.lime, fontWeight: '800', fontSize: 12 },

  scroll:     { paddingHorizontal: 20, paddingTop: 8 },

  heroCard:   { borderRadius: 24, padding: 22, marginBottom: 14, overflow: 'hidden' },
  heroGlow1:  { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,91,159,0.25)', top: -60, right: -60 },
  heroGlow2:  { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(196,248,82,0.2)', bottom: -50, left: -30 },
  heroRow:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroSubjectLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.65)', letterSpacing: 1, marginBottom: 4 },
  heroTitle:  { fontSize: SM ? 20 : 24, fontWeight: '900', color: 'white', letterSpacing: -0.5, lineHeight: SM ? 26 : 30, marginBottom: 12 },
  heroChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heroChip:   { backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderRadius: 100, paddingVertical: 3, paddingHorizontal: 9 },
  heroChipText: { color: 'white', fontSize: 11, fontWeight: '600' },
  heroEmoji:  { fontSize: 56 },

  rewardsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  rewardCard: { flex: 1, backgroundColor: 'white', borderRadius: 18, borderWidth: 1, borderColor: Colors.line, padding: 16, alignItems: 'center', shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  rewardEmoji:{ fontSize: 26, marginBottom: 4 },
  rewardVal:  { fontSize: 22, fontWeight: '900', color: Colors.brand, letterSpacing: -0.5 },
  rewardLbl:  { fontSize: 9, fontWeight: '700', color: Colors.muted, letterSpacing: 1, marginTop: 2 },

  learnBox:   { backgroundColor: 'white', borderRadius: 18, borderWidth: 1, borderColor: Colors.line, padding: 16, marginBottom: 16, shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  learnLabel: { fontSize: 9, fontWeight: '700', color: Colors.muted, letterSpacing: 1, marginBottom: 12 },
  learnRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  learnDot:   { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.brand, marginTop: 5, flexShrink: 0 },
  learnText:  { fontSize: 14, color: Colors.ink2, lineHeight: 21, flex: 1 },

  bottomBar:  { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.line, backgroundColor: BG },
  ctaBtn:     { paddingVertical: 16, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  ctaText:    { fontSize: 16, fontWeight: '800', color: 'white' },
});

// ── Mode-select styles ────────────────────────────────────────────
const ms = StyleSheet.create({
  page:      { flex: 1, backgroundColor: BG },
  header:    { paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center' },
  closeBtn:  { width: 36, height: 36, borderRadius: 11, backgroundColor: 'white', borderWidth: 1, borderColor: Colors.line, alignItems: 'center', justifyContent: 'center', shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 5, elevation: 2 },
  closeBtnText: { fontSize: 14, color: Colors.ink, fontWeight: '700' },

  scroll:    { paddingHorizontal: 20, paddingTop: 8 },
  title:     { fontSize: SM ? 24 : 28, fontWeight: '900', color: Colors.ink, letterSpacing: -0.5, textAlign: 'center', marginBottom: 6 },
  subtitle:  { fontSize: 14, color: Colors.muted, textAlign: 'center', marginBottom: 28 },

  modeCard:  { borderRadius: 22, padding: 22, flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 96 },
  modeTitle: { fontSize: 18, fontWeight: '900', color: 'white', marginBottom: 4 },
  modeDesc:  { fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 18 },
  modeEmoji: { fontSize: 46 },

  tipCard:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: 'rgba(196,248,82,0.12)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(196,248,82,0.3)', padding: 14, marginTop: 4 },
  tipIcon:   { fontSize: 18, marginTop: 1 },
  tipText:   { flex: 1, fontSize: 13, color: Colors.ink2, lineHeight: 19 },
});

// ── Existing styles (main + complete — unchanged) ─────────────────
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.paper },

  // MAIN header
  mainHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: Colors.line },
  mainHeaderCenter: { flex: 1 },
  mainHeaderSubject: { fontSize: 13, fontWeight: '800', color: Colors.ink },
  mainHeaderTopic: { fontSize: 11, color: Colors.ink3 },
  exitBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.bgSoft, alignItems: 'center', justifyContent: 'center' },
  exitText: { fontSize: 14, color: Colors.ink3, fontWeight: '700' },
  xpBadge: { backgroundColor: Colors.ink, borderRadius: 100, paddingVertical: 5, paddingHorizontal: 10 },
  xpText: { color: Colors.lime, fontWeight: '800', fontSize: 12 },

  bigCtaGrad: { borderRadius: 18, paddingVertical: 17, alignItems: 'center', justifyContent: 'center' },
  bigCtaText: { color: Colors.paper, fontWeight: '800', fontSize: 16, letterSpacing: -0.2 },

  tabBar: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.line },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: Colors.line, alignItems: 'center', backgroundColor: Colors.paper },
  tabActive: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  tabText: { fontSize: 11, fontWeight: '700', color: Colors.ink2 },
  tabTextActive: { color: Colors.paper },

  tabContent: { padding: 16, paddingBottom: 40 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { textAlign: 'center', color: Colors.muted, marginTop: 40 },

  sectionTitle: { fontSize: 18, fontWeight: '800', color: Colors.ink, marginBottom: 14 },
  summaryCard: { backgroundColor: Colors.paper, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.line },
  summaryHeading: { fontSize: 14, fontWeight: '700', color: Colors.brand, marginBottom: 6 },
  summaryContent: { fontSize: 14, color: Colors.ink2, lineHeight: 21, marginBottom: 8 },
  keyPoints: { gap: 5 },
  keyPoint: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  keyPointDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.brand, marginTop: 6, flexShrink: 0 },
  keyPointText: { fontSize: 13, color: Colors.ink3, flex: 1, lineHeight: 19 },

  quizTopBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  progressTrack: { flex: 1, height: 10, backgroundColor: Colors.bgSoft, borderRadius: 100, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 100 },
  livesRow: { flexDirection: 'row', gap: 2 },
  heart: { fontSize: 15 },
  confetti: { position: 'absolute', width: 9, height: 9 },

  quizScroll: { padding: 16, paddingBottom: 8 },
  qInstruction: { fontSize: 10, fontWeight: '800', color: Colors.brand, letterSpacing: 1.5, marginBottom: 4 },
  qCounter: { fontSize: 12, color: Colors.muted, fontWeight: '600', marginBottom: 10 },
  qText: { fontSize: SM ? 15 : 18, fontWeight: '800', color: Colors.ink, lineHeight: SM ? 21 : 24, letterSpacing: -0.3, marginBottom: 10 },
  sourceChip: { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: Colors.bgSoft, borderWidth: 1, borderColor: Colors.line, borderRadius: 100, paddingVertical: 4, paddingHorizontal: 10, marginBottom: 12 },
  sourceChipText: { fontSize: 11, fontWeight: '600', color: Colors.ink3 },
  optionsWrap: { gap: 9, marginBottom: 12 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 2, shadowColor: Colors.line2, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 0, elevation: 0 },
  optLetter: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  optLetterText: { fontSize: 11, fontWeight: '800' },
  optText: { flex: 1, fontSize: 14, color: Colors.ink, fontWeight: '600', lineHeight: 20 },
  optIcon: { fontSize: 15, fontWeight: '800' },

  feedbackBanner: { borderRadius: 16, padding: 12, borderWidth: 2, marginBottom: 8 },
  feedbackCorrect: { borderColor: Colors.teal, backgroundColor: 'rgba(0,194,168,0.08)' },
  feedbackWrong: { borderColor: Colors.rose, backgroundColor: 'rgba(255,77,109,0.08)' },
  feedbackTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  feedbackIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  feedbackIconOk: { backgroundColor: Colors.teal },
  feedbackIconErr: { backgroundColor: Colors.rose },
  feedbackIconTxt: { color: Colors.paper, fontSize: 16, fontWeight: '900' },
  feedbackTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  xpPill: { backgroundColor: Colors.teal, borderRadius: 100, paddingVertical: 2, paddingHorizontal: 8, alignSelf: 'flex-start', marginTop: 3 },
  xpPillWrong: { backgroundColor: Colors.rose },
  xpPillText: { color: Colors.paper, fontSize: 10, fontWeight: '700' },
  feedbackExpl: { fontSize: 13, color: Colors.ink2, lineHeight: 19, marginBottom: 6 },
  feedbackSource: { backgroundColor: 'rgba(255,255,255,0.6)', borderLeftWidth: 3, borderLeftColor: Colors.brand, paddingLeft: 10, paddingVertical: 5 },
  feedbackSourceLabel: { fontSize: 9, fontWeight: '800', color: Colors.brand, letterSpacing: 1, marginBottom: 2 },
  feedbackSourceText: { fontSize: 12, color: Colors.ink3, fontStyle: 'italic', lineHeight: 17 },

  bottomBar: { padding: 14, paddingBottom: 20, backgroundColor: Colors.paper, borderTopWidth: 1, borderTopColor: Colors.line },

  quizResult: { alignItems: 'center', paddingVertical: 24, gap: 10 },
  quizResultEmoji: { fontSize: 60 },
  quizResultTitle: { fontSize: 20, fontWeight: '800', color: Colors.ink },
  quizResultScore: { fontSize: 40, fontWeight: '900', color: Colors.brand, letterSpacing: -1 },
  quizResultMsg: { fontSize: 14, color: Colors.ink3, textAlign: 'center', lineHeight: 21 },
  quizResultStats: { flexDirection: 'row', gap: 12, marginVertical: 6, width: '100%' },
  qrStat: { flex: 1, backgroundColor: Colors.bgSoft, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.line },
  qrStatVal: { fontSize: 15, fontWeight: '800', color: Colors.ink, marginBottom: 2 },
  qrStatLbl: { fontSize: 10, color: Colors.muted, fontWeight: '600' },
  retryBtn: { backgroundColor: Colors.ink, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 28, marginBottom: 4 },
  retryBtnText: { color: Colors.paper, fontWeight: '800', fontSize: 14 },

  fcWrap: { flex: 1, padding: 14, paddingTop: 8 },
  fcHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  fcNumPill: { backgroundColor: Colors.bgSoft, borderRadius: 100, paddingVertical: 4, paddingHorizontal: 10 },
  fcNumText: { fontSize: 10, fontWeight: '700', color: Colors.ink2, letterSpacing: 0.5 },
  masteryBar: { flexDirection: 'row', gap: 4 },
  masteryDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.line },
  masteryDotOn: { backgroundColor: Colors.lime },
  fcInstruction: { fontSize: 10, fontWeight: '800', color: Colors.accent, letterSpacing: 1.5, marginBottom: 10 },
  flashcard: { flex: 1, borderRadius: 22, padding: 24, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  fcGlow1: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.15)', top: -50, right: -50 },
  fcGlow2: { position: 'absolute', width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.1)', bottom: -40, left: -30 },
  fcSideLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 2, marginBottom: 14, textTransform: 'uppercase' },
  fcQuestion: { fontSize: SM ? 15 : 18, fontWeight: '800', color: Colors.paper, textAlign: 'center', lineHeight: SM ? 22 : 26, letterSpacing: -0.3 },
  fcHint: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 20 },
  srsRow: { flexDirection: 'row', gap: 8, padding: 14, paddingBottom: 20 },
  srsBtn: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  srsBtnGrad: { paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center', gap: 2 },
  srsBtnEmoji: { fontSize: 18 },
  srsBtnLabel: { fontSize: 10, fontWeight: '800', color: Colors.paper },

  completeSafe: { flex: 1, padding: 24, alignItems: 'center' },
  trophyCircle: { width: 90, height: 90, borderRadius: 45, backgroundColor: Colors.lime, alignItems: 'center', justifyContent: 'center', marginBottom: 16, shadowColor: Colors.lime, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 8 },
  trophyEmoji: { fontSize: SM ? 38 : 48 },
  completeTitle: { fontSize: SM ? 26 : 34, fontWeight: '900', color: Colors.paper, textAlign: 'center', letterSpacing: -1, lineHeight: SM ? 32 : 38, marginBottom: 8 },
  completeSub: { fontSize: 14, color: 'rgba(255,255,255,0.85)', textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 14, width: '100%' },
  statCell: { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 16, padding: 12, alignItems: 'center' },
  statEmoji: { fontSize: 22, marginBottom: 4 },
  statVal: { fontSize: 18, fontWeight: '900', color: Colors.paper, letterSpacing: -0.5 },
  statLbl: { fontSize: 9, color: 'rgba(255,255,255,0.7)', fontWeight: '700', letterSpacing: 0.8, marginTop: 2 },
  nemBox: { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%', marginBottom: 16 },
  nemIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(196,248,82,0.2)', borderWidth: 1, borderColor: 'rgba(196,248,82,0.4)', alignItems: 'center', justifyContent: 'center' },
  nemLabel: { fontSize: 9, color: 'rgba(255,255,255,0.65)', fontWeight: '700', letterSpacing: 0.8, marginBottom: 2 },
  nemVal: { fontSize: 18, fontWeight: '900', color: Colors.paper, letterSpacing: -0.5 },
  nemDelta: { backgroundColor: Colors.lime, borderRadius: 100, paddingVertical: 2, paddingHorizontal: 8 },
  nemDeltaText: { fontSize: 11, fontWeight: '800', color: Colors.ink },
  completePrimaryBtn: { backgroundColor: Colors.paper, borderRadius: 16, paddingVertical: 16, alignItems: 'center', width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 0, elevation: 4 },
  completePrimaryText: { color: Colors.ink, fontWeight: '800', fontSize: 16 },
  completeShareBtn: { backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 14, paddingVertical: 12, alignItems: 'center', width: '100%' },
  completeShareText: { color: Colors.paper, fontWeight: '700', fontSize: 14 },
  confettiComplete: { position: 'absolute', width: 10, height: 10, opacity: 0.7 },
});
