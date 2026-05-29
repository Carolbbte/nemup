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

const BG         = '#F7F8FC';
const NEON       = '#7C5AFF';
const PURPLE_HDR = '#4A35CC';
const GREEN_HDR  = '#2D7D52';

type Option  = { id: string; text: string };
type Question = { id: string; text: string; options: Option[]; correctOptionId: string; explanation: string; sourceQuote: string };
type Flashcard = { id: string; front: string; back: string };
type SummarySection = { heading: string; content: string; keyPoints: string[] };
type Session = {
  subject: string; topic: string; estimatedDuration: number; difficulty: string;
  xpReward: number; gemReward: number; questions: Question[]; flashcards: Flashcard[];
  summary: { title: string; sections: SummarySection[] };
};
type Phase    = 'lobby' | 'mode-select' | 'main' | 'complete';
type Tab      = 'resumen' | 'quiz' | 'tarjetas';
type QuizStep = 'answering' | 'correct' | 'wrong';

const LETTERS     = ['A', 'B', 'C', 'D', 'E'];
const MAX_LIVES   = 3;
const XP_PER_Q    = 10;
const SUBJECT_EMOJI: Record<string, string> = {
  biología: '🧬', biologia: '🧬', matemática: '📐', matematica: '📐',
  historia: '📜', física: '⚗️', fisica: '⚗️', química: '🔬', quimica: '🔬',
  lenguaje: '📝', inglés: '🌐', ingles: '🌐',
};
function subjectEmoji(s: string) {
  const k = s?.toLowerCase() ?? '';
  return Object.entries(SUBJECT_EMOJI).find(([key]) => k.includes(key))?.[1] ?? '📘';
}

const MODES: { id: Tab; title: string; desc: string; emoji: string; colors: [string, string] }[] = [
  { id: 'resumen',  title: 'Resumen',  desc: 'Lee y comprende los puntos clave',    emoji: '📖', colors: [NEON, Colors.brand] },
  { id: 'quiz',     title: 'Quiz',     desc: 'Pon a prueba lo que aprendiste',       emoji: '🧠', colors: ['#4A3BC8', '#3025A8'] },
  { id: 'tarjetas', title: 'Tarjetas', desc: 'Repasa con tarjetas interactivas',     emoji: '🃏', colors: ['#1E9E72', '#117A55'] },
];

function PillProgress({ filled, total, activeColor, inactiveColor }: {
  filled: number; total: number; activeColor: string; inactiveColor: string;
}) {
  const count = Math.min(total, 15);
  const activePills = Math.round((filled / Math.max(total, 1)) * count);
  return (
    <View style={{ flexDirection: 'row', flex: 1, gap: 3, alignItems: 'center' }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ flex: 1, height: 6, borderRadius: 3,
          backgroundColor: i < activePills ? activeColor : inactiveColor }} />
      ))}
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════
export default function SessionPlayerScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { data } = useLocalSearchParams<{ data: string }>();
  const session: Session | null = data ? JSON.parse(data as string) : null;

  const [phase, setPhase]       = useState<Phase>('lobby');
  const [activeTab, setActiveTab] = useState<Tab>('resumen');

  // Resumen
  const [resumenIndex, setResumenIndex] = useState(0);

  // Quiz
  const [quizIndex, setQuizIndex]           = useState(0);
  const [quizStep, setQuizStep]             = useState<QuizStep>('answering');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [lives, setLives]                   = useState(MAX_LIVES);
  const [xpEarned, setXpEarned]             = useState(0);
  const [correctCount, setCorrectCount]     = useState(0);
  const [streak, setStreak]                 = useState(0);
  const [quizDone, setQuizDone]             = useState(false);

  // Flashcard
  const [cardIndex, setCardIndex]     = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);

  const feedbackScale = useRef(new Animated.Value(0)).current;
  const confetti      = useRef(
    Array.from({ length: 6 }, () => ({ y: new Animated.Value(0), op: new Animated.Value(0) }))
  ).current;

  const questions  = session?.questions  ?? [];
  const flashcards = session?.flashcards ?? [];
  const question   = questions[quizIndex];
  const card       = flashcards[cardIndex];

  useEffect(() => {
    if (quizStep === 'correct' || quizStep === 'wrong') {
      Animated.spring(feedbackScale, { toValue: 1, tension: 220, friction: 9, useNativeDriver: true }).start();
    } else {
      feedbackScale.setValue(0);
    }
  }, [quizStep]);

  if (!session) {
    return <View style={{ flex: 1 }}><Text style={{ padding: 40, color: Colors.muted }}>Sin datos de sesión.</Text></View>;
  }

  // ── Handlers ──────────────────────────────────────────────────
  const handleOptionSelect = (optId: string) => {
    if (quizStep !== 'answering') return;
    setSelectedOption(optId);
    const correct = optId === question.correctOptionId;
    if (correct) {
      setCorrectCount(c => c + 1);
      setXpEarned(xp => xp + XP_PER_Q);
      setStreak(s => s + 1);
      setQuizStep('correct');
    } else {
      setLives(l => Math.max(0, l - 1));
      setStreak(0);
      setQuizStep('wrong');
    }
  };

  const handleNext = () => {
    const next = quizIndex + 1;
    if (next >= questions.length) { setQuizDone(true); }
    else { setQuizIndex(next); setSelectedOption(null); setQuizStep('answering'); }
  };

  const handleRestartQuiz = () => {
    setQuizIndex(0); setSelectedOption(null); setQuizStep('answering');
    setCorrectCount(0); setLives(MAX_LIVES); setXpEarned(0); setStreak(0); setQuizDone(false);
  };

  const handleCardRate = () => {
    const next = cardIndex + 1;
    if (next >= flashcards.length) { setCardIndex(0); } else { setCardIndex(next); }
    setCardFlipped(false);
  };

  // ══════════════════════════════════════════════════════════════
  // LOBBY
  // ══════════════════════════════════════════════════════════════
  if (phase === 'lobby') {
    const learnItems = session.summary?.sections?.slice(0, 3).map(s => s.heading).filter(Boolean) ?? [];
    return (
      <SafeAreaView style={lob.page} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />
        <View style={lob.header}>
          <Pressable onPress={() => router.back()} style={lob.iconBtn} hitSlop={10}>
            <Text style={lob.iconBtnText}>←</Text>
          </Pressable>
          <Text style={lob.headerTitle}>Sesión de estudio</Text>
          <View style={lob.xpPill}><Text style={lob.xpPillText}>⚡ {session.xpReward}</Text></View>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={[lob.scroll, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
          <LinearGradient colors={[Colors.brand, NEON]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={lob.heroCard}>
            <View style={lob.heroGlow1} /><View style={lob.heroGlow2} />
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

  // ══════════════════════════════════════════════════════════════
  // MODE SELECT
  // ══════════════════════════════════════════════════════════════
  if (phase === 'mode-select') {
    return (
      <SafeAreaView style={ms.page} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={BG} />
        <View style={ms.header}>
          <Pressable onPress={() => setPhase('lobby')} style={ms.closeBtn} hitSlop={10}>
            <Text style={ms.closeBtnText}>✕</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={[ms.scroll, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
          <Text style={ms.title}>¿Qué quieres hacer?</Text>
          <Text style={ms.subtitle}>Elige tu modo de estudio</Text>
          {MODES.map(mode => (
            <Pressable key={mode.id} onPress={() => { setActiveTab(mode.id); setPhase('main'); }} style={{ marginBottom: 14 }}>
              <LinearGradient colors={mode.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={ms.modeCard}>
                <View style={{ flex: 1 }}>
                  <Text style={ms.modeTitle}>{mode.title}</Text>
                  <Text style={ms.modeDesc}>{mode.desc}</Text>
                </View>
                <Text style={ms.modeEmoji}>{mode.emoji}</Text>
              </LinearGradient>
            </Pressable>
          ))}
          <View style={ms.tipCard}>
            <Text style={ms.tipIcon}>💡</Text>
            <Text style={ms.tipText}>Alterna entre los 3 modos para aprender mejor y no aburrirte.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // COMPLETE
  // ══════════════════════════════════════════════════════════════
  if (phase === 'complete') {
    const accuracy = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 100;
    return (
      <View style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.brand} />
        <LinearGradient colors={[Colors.brand, Colors.accent]} style={{ flex: 1 }}>
          {CONFETTI_COMPLETE.map((s, i) => <View key={i} style={[sx.confettiComplete, s]} />)}
          <SafeAreaView style={sx.completeSafe}>
            <View style={sx.trophyCircle}><Text style={sx.trophyEmoji}>🏆</Text></View>
            <Text style={sx.completeTitle}>¡Sesión{'\n'}<Text style={{ color: Colors.lime }}>completada!</Text></Text>
            <Text style={sx.completeSub}>Acabas de reforzar tu conocimiento real.</Text>
            <View style={sx.statsGrid}>
              {[
                { emoji: '⚡', val: `+${xpEarned}`, lbl: 'XP' },
                { emoji: '💎', val: `+${session.gemReward ?? Math.round(xpEarned / 5)}`, lbl: 'GEMAS' },
                { emoji: '🎯', val: `${accuracy}%`, lbl: 'ACIERTOS' },
              ].map(({ emoji, val, lbl }) => (
                <View key={lbl} style={sx.statCell}>
                  <Text style={sx.statEmoji}>{emoji}</Text>
                  <Text style={sx.statVal}>{val}</Text>
                  <Text style={sx.statLbl}>{lbl}</Text>
                </View>
              ))}
            </View>
            <View style={{ gap: 10, marginTop: 'auto', width: '100%' }}>
              <Pressable onPress={() => router.push('/home' as any)}>
                <View style={sx.completePrimaryBtn}><Text style={sx.completePrimaryText}>Volver al inicio →</Text></View>
              </Pressable>
              <Pressable style={sx.completeShareBtn}>
                <Text style={sx.completeShareText}>★  Compartir mi logro</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </LinearGradient>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // MAIN — shared header + tab content
  // ══════════════════════════════════════════════════════════════
  const sections       = session.summary?.sections ?? [];
  const currentSection = sections[resumenIndex];
  const isLastSection  = resumenIndex >= sections.length - 1;
  const headerColor    = activeTab === 'tarjetas' ? GREEN_HDR : PURPLE_HDR;
  const pillActive     = activeTab === 'tarjetas' ? '#C4F852' : 'rgba(255,255,255,0.88)';
  const pillTotal      = activeTab === 'resumen' ? Math.max(sections.length, 1)
                       : activeTab === 'quiz'    ? Math.max(questions.length, 1)
                       : Math.max(flashcards.length, 1);
  const pillFilled     = activeTab === 'resumen' ? resumenIndex + 1
                       : activeTab === 'quiz'    ? (quizDone ? questions.length : quizIndex + 1)
                       : cardIndex + 1;
  const tabTitle       = activeTab === 'resumen' ? 'Resumen' : activeTab === 'quiz' ? 'Quiz' : 'Tarjetas';
  const displayPoints  = correctCount * 100;

  return (
    <View style={{ flex: 1, backgroundColor: headerColor }}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* ── Shared colored header ── */}
        <View style={{ backgroundColor: headerColor, paddingHorizontal: 16, paddingBottom: 14 }}>
          <View style={tabH.row}>
            <Pressable onPress={() => setPhase('mode-select')} style={tabH.closeBtn} hitSlop={10}>
              <Text style={tabH.closeBtnTxt}>✕</Text>
            </Pressable>
            <Text style={tabH.title}>{tabTitle}</Text>
            <View style={{ width: 32 }} />
          </View>
          <View style={tabH.progressRow}>
            <PillProgress filled={pillFilled} total={pillTotal} activeColor={pillActive} inactiveColor="rgba(255,255,255,0.22)" />
            <Text style={tabH.counter}>{pillFilled}/{pillTotal}</Text>
          </View>
        </View>

        {/* ── White content area ── */}
        <View style={{ flex: 1, backgroundColor: BG }}>

          {/* ════ RESUMEN ════ */}
          {activeTab === 'resumen' && (
            sections.length === 0 ? (
              <View style={tabC.emptyWrap}><Text style={tabC.emptyText}>No hay resumen disponible.</Text></View>
            ) : (
              <View style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={[tabC.scroll, { paddingBottom: insets.bottom + 90 }]} showsVerticalScrollIndicator={false}>
                  <Text style={tabC.resHeading}>{currentSection?.heading}</Text>
                  <Text style={tabC.resContent}>{currentSection?.content}</Text>
                  {(currentSection?.keyPoints?.slice(1) ?? []).map((kp, i) => (
                    <View key={i} style={tabC.bulletRow}>
                      <View style={tabC.bulletDot} />
                      <Text style={tabC.bulletText}>{kp}</Text>
                    </View>
                  ))}
                  {currentSection?.keyPoints?.[0] ? (
                    <View style={tabC.datoClave}>
                      <Text style={tabC.datoClaveTitle}>¡Dato clave!</Text>
                      <Text style={tabC.datoClaveText}>{currentSection.keyPoints[0]}</Text>
                    </View>
                  ) : null}
                </ScrollView>
                <View style={[tabC.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
                  <Pressable style={tabC.sideBtn}><Text style={{ fontSize: 22 }}>👎</Text></Pressable>
                  <Pressable onPress={() => isLastSection ? setPhase('mode-select') : setResumenIndex(i => i + 1)} style={{ flex: 1 }}>
                    <LinearGradient colors={[Colors.brand, NEON]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={tabC.nextBtn}>
                      <Text style={tabC.nextBtnText}>{isLastSection ? '¡Listo!' : 'Siguiente'}</Text>
                    </LinearGradient>
                  </Pressable>
                  <Pressable style={tabC.sideBtn}><Text style={{ fontSize: 22 }}>👍</Text></Pressable>
                </View>
              </View>
            )
          )}

          {/* ════ QUIZ ════ */}
          {activeTab === 'quiz' && (
            questions.length === 0 ? (
              <View style={tabC.emptyWrap}><Text style={tabC.emptyText}>No hay preguntas disponibles.</Text></View>
            ) : quizDone ? (
              /* Quiz result */
              <ScrollView contentContainerStyle={[tabC.scroll, { paddingBottom: insets.bottom + 24, alignItems: 'center' }]}>
                <Text style={{ fontSize: 64, marginBottom: 12 }}>
                  {correctCount >= questions.length * 0.8 ? '🏆' : correctCount >= questions.length * 0.5 ? '👍' : '📚'}
                </Text>
                <Text style={tabC.resultTitle}>Quiz completado</Text>
                <Text style={tabC.resultScore}>{correctCount} / {questions.length}</Text>
                <Text style={tabC.resultMsg}>
                  {correctCount >= questions.length * 0.8 ? '¡Excelente dominio del tema!'
                    : correctCount >= questions.length * 0.5 ? 'Buen trabajo, sigue practicando.'
                    : 'Repasa el resumen y vuelve a intentarlo.'}
                </Text>
                <View style={tabC.resultStatsRow}>
                  <View style={tabC.resultStat}><Text style={tabC.resultStatVal}>⚡ +{xpEarned}</Text><Text style={tabC.resultStatLbl}>XP ganados</Text></View>
                  <View style={tabC.resultStat}><Text style={tabC.resultStatVal}>🔥 {streak}</Text><Text style={tabC.resultStatLbl}>Racha final</Text></View>
                </View>
                <Pressable onPress={handleRestartQuiz} style={tabC.retryBtn}>
                  <Text style={tabC.retryBtnText}>Intentar nuevamente</Text>
                </Pressable>
                <Pressable onPress={() => setPhase('complete')} style={{ width: '100%' }}>
                  <LinearGradient colors={[Colors.brand, NEON]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={tabC.nextBtn}>
                    <Text style={tabC.nextBtnText}>Finalizar sesión 🎉</Text>
                  </LinearGradient>
                </Pressable>
              </ScrollView>
            ) : (
              <View style={{ flex: 1 }}>
                {/* Stats row */}
                <View style={tabC.quizStats}>
                  <View style={tabC.quizStatBox}>
                    <Text style={tabC.quizStatEmoji}>🔥</Text>
                    <View>
                      <Text style={tabC.quizStatVal}>{streak}</Text>
                      <Text style={tabC.quizStatLbl}>Racha</Text>
                    </View>
                  </View>
                  <View style={tabC.quizStatBox}>
                    <Text style={tabC.quizStatEmoji}>💜</Text>
                    <View>
                      <Text style={tabC.quizStatVal}>{displayPoints}</Text>
                      <Text style={tabC.quizStatLbl}>Puntos</Text>
                    </View>
                  </View>
                </View>

                <ScrollView contentContainerStyle={[tabC.quizScroll, { paddingBottom: 8 }]} showsVerticalScrollIndicator={false}>
                  <Text style={tabC.questionText}>{question?.text}</Text>

                  <View style={{ gap: 10, marginBottom: 12 }}>
                    {question?.options.map((opt, i) => {
                      const letter       = LETTERS[i] ?? String(i + 1);
                      const isSelected   = selectedOption === opt.id;
                      const isCorrectOpt = opt.id === question.correctOptionId;
                      const answered     = quizStep !== 'answering';
                      const isWrong      = answered && isSelected && !isCorrectOpt;
                      const dimmed       = answered && !isCorrectOpt && !isWrong;

                      const borderColor  = answered ? (isCorrectOpt ? '#2D7D52' : isWrong ? Colors.rose : Colors.line) : (isSelected ? Colors.brand : Colors.line);
                      const bgColor      = answered ? (isCorrectOpt ? 'rgba(45,125,82,0.08)' : isWrong ? 'rgba(255,77,109,0.08)' : Colors.paper) : (isSelected ? Colors.brandSoft : Colors.paper);
                      const letterBg     = answered ? (isCorrectOpt ? '#2D7D52' : isWrong ? Colors.rose : Colors.bgSoft) : (isSelected ? Colors.brand : Colors.bgSoft);
                      const letterColor  = ((answered && (isCorrectOpt || isWrong)) || (!answered && isSelected)) ? 'white' : Colors.ink;

                      return (
                        <Pressable
                          key={opt.id}
                          onPress={() => handleOptionSelect(opt.id)}
                          disabled={quizStep !== 'answering'}
                          style={[tabC.option, { borderColor, backgroundColor: bgColor, opacity: dimmed ? 0.4 : 1 }]}
                        >
                          <View style={[tabC.optLetter, { backgroundColor: letterBg }]}>
                            <Text style={[tabC.optLetterText, { color: letterColor }]}>{letter}</Text>
                          </View>
                          <Text style={[tabC.optText, answered && isCorrectOpt && { color: '#1A5C3A', fontWeight: '700' }, answered && isWrong && { color: '#B91C30', fontWeight: '700' }]}>
                            {opt.text}
                          </Text>
                          {answered && isCorrectOpt && <Text style={{ fontSize: 16 }}>✓</Text>}
                          {answered && isWrong      && <Text style={{ fontSize: 16 }}>✕</Text>}
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Explanation */}
                  {quizStep !== 'answering' && question?.explanation ? (
                    <View style={[tabC.datoClave, { borderLeftColor: quizStep === 'correct' ? '#2D7D52' : Colors.rose }]}>
                      <Text style={[tabC.datoClaveTitle, { color: quizStep === 'correct' ? '#2D7D52' : Colors.rose }]}>
                        {quizStep === 'correct' ? '¡Excelente! +10 XP' : 'Casi'}
                      </Text>
                      <Text style={tabC.datoClaveText}>{question.explanation}</Text>
                    </View>
                  ) : null}
                </ScrollView>

                {/* Bottom bar */}
                <View style={[tabC.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
                  <Pressable style={tabC.sideBtn}><Text style={{ fontSize: 20 }}>💡</Text></Pressable>
                  {quizStep !== 'answering' ? (
                    <Pressable onPress={handleNext} style={{ flex: 1 }}>
                      <LinearGradient
                        colors={quizStep === 'correct' ? ['#2D7D52', '#1A5C3A'] : [Colors.rose, '#C0132A']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={tabC.nextBtn}
                      >
                        <Text style={tabC.nextBtnText}>Siguiente</Text>
                      </LinearGradient>
                    </Pressable>
                  ) : (
                    <View style={{ flex: 1, borderRadius: 18, paddingVertical: 17, backgroundColor: Colors.line, alignItems: 'center' }}>
                      <Text style={{ color: Colors.muted, fontWeight: '700', fontSize: 15 }}>Selecciona</Text>
                    </View>
                  )}
                  <Pressable style={tabC.sideBtn}><Text style={{ fontSize: 20 }}>🚩</Text></Pressable>
                </View>
              </View>
            )
          )}

          {/* ════ TARJETAS ════ */}
          {activeTab === 'tarjetas' && (
            flashcards.length === 0 ? (
              <View style={tabC.emptyWrap}><Text style={tabC.emptyText}>No hay tarjetas disponibles.</Text></View>
            ) : (
              <View style={{ flex: 1 }}>
                <Pressable onPress={() => setCardFlipped(f => !f)} style={{ flex: 1, padding: 16, paddingBottom: 8 }}>
                  <View style={tabC.fcCard}>
                    {/* Visual */}
                    <View style={[tabC.fcVisual, { backgroundColor: activeTab === 'tarjetas' ? 'rgba(45,125,82,0.08)' : 'rgba(91,61,245,0.06)' }]}>
                      <Text style={{ fontSize: SM ? 52 : 64 }}>{subjectEmoji(session.subject)}</Text>
                    </View>

                    {/* Term */}
                    <Text style={tabC.fcTerm}>{card?.front}</Text>

                    {/* Definition or hint */}
                    {cardFlipped
                      ? <Text style={tabC.fcDef}>{card?.back}</Text>
                      : (
                        <View style={tabC.fcHintRow}>
                          <Text style={tabC.fcHintText}>👆  Toca para ver más</Text>
                        </View>
                      )
                    }
                  </View>
                </Pressable>

                {/* SRS buttons */}
                {cardFlipped ? (
                  <View style={[tabC.srsRow, { paddingBottom: insets.bottom + 12 }]}>
                    {[
                      { label: 'No lo sabía', colors: ['#E63950', Colors.rose] as [string,string] },
                      { label: 'Lo dudé',     colors: [Colors.amber, '#E8890A'] as [string,string] },
                      { label: 'Lo sabía',    colors: ['#2D7D52', '#1A5C3A'] as [string,string] },
                    ].map(({ label, colors }) => (
                      <Pressable key={label} onPress={handleCardRate} style={{ flex: 1 }}>
                        <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={tabC.srsBtn}>
                          <Text style={tabC.srsBtnText}>{label}</Text>
                        </LinearGradient>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <View style={{ paddingBottom: insets.bottom + 12, height: 70 + insets.bottom }} />
                )}
              </View>
            )
          )}

        </View>
      </SafeAreaView>
    </View>
  );
}

// ── Data ─────────────────────────────────────────────────────────
const CONFETTI_COMPLETE = [
  { top: '5%',  left: '8%',   backgroundColor: Colors.lime } as any,
  { top: '8%',  right: '12%', backgroundColor: '#FFD93D', borderRadius: 5 } as any,
  { top: '14%', left: '28%',  backgroundColor: '#5BC8FF' } as any,
  { top: '18%', right: '22%', backgroundColor: Colors.lime, borderRadius: 5 } as any,
  { top: '22%', left: '55%',  backgroundColor: '#FFD93D' } as any,
  { top: '25%', right: '6%',  backgroundColor: '#5BC8FF', borderRadius: 5 } as any,
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

// ── Tab header styles ─────────────────────────────────────────────
const tabH = StyleSheet.create({
  row:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  closeBtn:    { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  closeBtnTxt: { fontSize: 14, color: 'white', fontWeight: '700' },
  title:       { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '800', color: 'white', letterSpacing: -0.2 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  counter:     { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.85)', minWidth: 36, textAlign: 'right' },
});

// ── Tab content styles ────────────────────────────────────────────
const tabC = StyleSheet.create({
  scroll:    { paddingHorizontal: 20, paddingTop: 20 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { textAlign: 'center', color: Colors.muted, marginTop: 40 },

  // Resumen
  resHeading: { fontSize: SM ? 22 : 26, fontWeight: '900', color: Colors.ink, letterSpacing: -0.5, lineHeight: SM ? 28 : 32, marginBottom: 16 },
  resContent: { fontSize: 15, color: Colors.ink2, lineHeight: 24, marginBottom: 16 },
  bulletRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  bulletDot:  { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.brand, marginTop: 7, flexShrink: 0 },
  bulletText: { flex: 1, fontSize: 14, color: Colors.ink2, lineHeight: 21 },
  datoClave:  { backgroundColor: 'rgba(91,61,245,0.06)', borderRadius: 14, borderLeftWidth: 3, borderLeftColor: Colors.brand, padding: 14, marginTop: 8, marginBottom: 4 },
  datoClaveTitle: { fontSize: 12, fontWeight: '800', color: Colors.brand, marginBottom: 4, letterSpacing: 0.2 },
  datoClaveText:  { fontSize: 14, color: Colors.ink2, lineHeight: 21 },

  // Shared bottom bar
  bottomBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.line, backgroundColor: BG },
  sideBtn:   { width: 44, height: 44, borderRadius: 22, backgroundColor: 'white', borderWidth: 1, borderColor: Colors.line, alignItems: 'center', justifyContent: 'center' },
  nextBtn:   { borderRadius: 18, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  nextBtnText: { color: 'white', fontWeight: '800', fontSize: 15 },

  // Quiz
  quizStats:   { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  quizStatBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: Colors.line, paddingHorizontal: 14, paddingVertical: 10 },
  quizStatEmoji: { fontSize: 22 },
  quizStatVal: { fontSize: 18, fontWeight: '900', color: Colors.ink, letterSpacing: -0.5 },
  quizStatLbl: { fontSize: 10, color: Colors.muted, fontWeight: '600' },
  quizScroll:  { paddingHorizontal: 16, paddingTop: 4 },
  questionText:{ fontSize: SM ? 16 : 19, fontWeight: '800', color: Colors.ink, lineHeight: SM ? 22 : 26, letterSpacing: -0.3, marginBottom: 18 },
  option:      { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, borderWidth: 2, backgroundColor: 'white' },
  optLetter:   { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  optLetterText: { fontSize: 12, fontWeight: '800' },
  optText:     { flex: 1, fontSize: 14, color: Colors.ink, fontWeight: '600', lineHeight: 20 },

  // Quiz result
  resultTitle:    { fontSize: 22, fontWeight: '900', color: Colors.ink, marginBottom: 6, letterSpacing: -0.3 },
  resultScore:    { fontSize: 44, fontWeight: '900', color: Colors.brand, letterSpacing: -1, marginBottom: 8 },
  resultMsg:      { fontSize: 14, color: Colors.ink3, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  resultStatsRow: { flexDirection: 'row', gap: 12, marginBottom: 20, width: '100%' },
  resultStat:     { flex: 1, backgroundColor: Colors.bgSoft, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.line },
  resultStatVal:  { fontSize: 16, fontWeight: '800', color: Colors.ink, marginBottom: 2 },
  resultStatLbl:  { fontSize: 10, color: Colors.muted, fontWeight: '600' },
  retryBtn:       { backgroundColor: Colors.ink, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 28, marginBottom: 12 },
  retryBtnText:   { color: 'white', fontWeight: '800', fontSize: 14 },

  // Tarjetas
  fcCard:    { flex: 1, backgroundColor: 'white', borderRadius: 28, borderWidth: 1, borderColor: Colors.line, padding: 24, alignItems: 'center', justifyContent: 'center', shadowColor: '#0B0B1A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  fcVisual:  { width: '100%', height: SM ? 130 : 160, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  fcTerm:    { fontSize: SM ? 22 : 26, fontWeight: '900', color: Colors.ink, textAlign: 'center', letterSpacing: -0.4, marginBottom: 12 },
  fcDef:     { fontSize: 15, color: Colors.ink2, textAlign: 'center', lineHeight: 23 },
  fcHintRow: { marginTop: 12 },
  fcHintText:{ fontSize: 13, color: Colors.muted, fontStyle: 'italic' },
  srsRow:    { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  srsBtn:    { paddingVertical: 13, borderRadius: 16, alignItems: 'center' },
  srsBtnText:{ fontSize: 12, fontWeight: '800', color: 'white' },
});

// ── Complete styles ───────────────────────────────────────────────
const sx = StyleSheet.create({
  completeSafe:       { flex: 1, padding: 24, alignItems: 'center' },
  trophyCircle:       { width: 90, height: 90, borderRadius: 45, backgroundColor: Colors.lime, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  trophyEmoji:        { fontSize: SM ? 38 : 48 },
  completeTitle:      { fontSize: SM ? 26 : 34, fontWeight: '900', color: Colors.paper, textAlign: 'center', letterSpacing: -1, lineHeight: SM ? 32 : 38, marginBottom: 8 },
  completeSub:        { fontSize: 14, color: 'rgba(255,255,255,0.85)', textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  statsGrid:          { flexDirection: 'row', gap: 10, marginBottom: 20, width: '100%' },
  statCell:           { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 16, padding: 12, alignItems: 'center' },
  statEmoji:          { fontSize: 22, marginBottom: 4 },
  statVal:            { fontSize: 18, fontWeight: '900', color: Colors.paper, letterSpacing: -0.5 },
  statLbl:            { fontSize: 9, color: 'rgba(255,255,255,0.7)', fontWeight: '700', letterSpacing: 0.8, marginTop: 2 },
  completePrimaryBtn: { backgroundColor: Colors.paper, borderRadius: 16, paddingVertical: 16, alignItems: 'center', width: '100%' },
  completePrimaryText:{ color: Colors.ink, fontWeight: '800', fontSize: 16 },
  completeShareBtn:   { backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 14, paddingVertical: 12, alignItems: 'center', width: '100%' },
  completeShareText:  { color: Colors.paper, fontWeight: '700', fontSize: 14 },
  confettiComplete:   { position: 'absolute', width: 10, height: 10, opacity: 0.7 },
});
