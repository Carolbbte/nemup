import { Colors } from '@/constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Option = { id: string; text: string };
type Question = { id: string; text: string; options: Option[]; correctOptionId: string; explanation: string; sourceQuote: string };
type Flashcard = { id: string; front: string; back: string };
type Session = {
  subject: string; topic: string; estimatedDuration: number; difficulty: string;
  xpReward: number; gemReward: number; questions: Question[]; flashcards: Flashcard[];
  summary: { title: string; sections: { heading: string; content: string; keyPoints: string[] }[] };
};
type Phase = 'lobby' | 'quiz' | 'checkpoint' | 'flashcards' | 'complete';
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

export default function SessionPlayerScreen() {
  const router = useRouter();
  const { data } = useLocalSearchParams<{ data: string }>();
  const session: Session | null = data ? JSON.parse(data as string) : null;

  const [phase, setPhase] = useState<Phase>('lobby');
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizStep, setQuizStep] = useState<QuizStep>('answering');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [lives, setLives] = useState(MAX_LIVES);
  const [xpEarned, setXpEarned] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [consecutiveCorrect, setConsecutiveCorrect] = useState(0);
  const [checkpointShown, setCheckpointShown] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);

  const feedbackScale = useRef(new Animated.Value(0)).current;
  const confetti = useRef(
    Array.from({ length: 6 }, () => ({ y: new Animated.Value(0), op: new Animated.Value(0) }))
  ).current;

  const questions = session?.questions ?? [];
  const flashcards = session?.flashcards ?? [];
  const totalQ = questions.length;
  const midPoint = Math.max(1, Math.floor(totalQ / 2));
  const question = questions[quizIndex];
  const card = flashcards[cardIndex];

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
      setConsecutiveCorrect(c => c + 1);
      setXpEarned(xp => xp + XP_PER_CORRECT);
      setQuizStep('correct');
    } else {
      setLives(l => Math.max(0, l - 1));
      setConsecutiveCorrect(0);
      setQuizStep('wrong');
    }
  };

  const handleNext = () => {
    const next = quizIndex + 1;
    if (!checkpointShown && quizIndex === midPoint - 1 && next < totalQ) {
      setCheckpointShown(true);
      setQuizIndex(next);
      setSelectedOption(null);
      setQuizStep('answering');
      setPhase('checkpoint');
      return;
    }
    if (next >= totalQ) {
      setPhase(flashcards.length > 0 ? 'flashcards' : 'complete');
    } else {
      setQuizIndex(next);
      setSelectedOption(null);
      setQuizStep('answering');
    }
  };

  const handleCardRate = () => {
    const next = cardIndex + 1;
    if (next >= flashcards.length) { setPhase('complete'); }
    else { setCardIndex(next); setCardFlipped(false); }
  };

  const progressPct = totalQ > 0 ? Math.round((quizIndex / totalQ) * 100) : 0;

  /* ──────────────── LOBBY ──────────────── */
  if (phase === 'lobby') {
    const learnItems = session.summary?.sections?.slice(0, 3).map(s => s.heading).filter(Boolean) ?? [];
    return (
      <View style={{ flex: 1, backgroundColor: '#0B0B1A' }}>
        <StatusBar barStyle="light-content" backgroundColor="#0B0B1A" />
        <SafeAreaView style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.lobbyScroll} showsVerticalScrollIndicator={false}>
            <Pressable onPress={() => router.back()} style={styles.lobbyBack}>
              <Text style={styles.lobbyBackText}>←</Text>
            </Pressable>

            {/* Hero card */}
            <LinearGradient colors={['#0B0B1A', '#2D2D5A', Colors.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
              <View style={styles.heroGlow1} /><View style={styles.heroGlow2} />
              <Text style={styles.heroEmoji}>{subjectEmoji(session.subject)}</Text>
              <Text style={styles.heroSubject}>{session.subject?.toUpperCase()}</Text>
              <Text style={styles.heroTitle}>{session.topic}</Text>
              <View style={styles.heroMetaRow}>
                <View style={styles.heroChip}><Text style={styles.heroChipText}>⏱ {session.estimatedDuration} min</Text></View>
                <View style={styles.heroChip}><Text style={styles.heroChipText}>🎯 {session.difficulty}</Text></View>
                <View style={styles.heroChip}><Text style={styles.heroChipText}>{totalQ} preguntas</Text></View>
              </View>
            </LinearGradient>

            {/* Rewards */}
            <View style={styles.rewardsRow}>
              <View style={styles.rewardCard}>
                <Text style={styles.rewardEmoji}>⚡</Text>
                <Text style={styles.rewardVal}>+{session.xpReward}</Text>
                <Text style={styles.rewardLbl}>XP</Text>
              </View>
              <View style={styles.rewardCard}>
                <Text style={styles.rewardEmoji}>💎</Text>
                <Text style={styles.rewardVal}>+{session.gemReward ?? 10}</Text>
                <Text style={styles.rewardLbl}>GEMAS</Text>
              </View>
            </View>

            {/* Learn */}
            {learnItems.length > 0 && (
              <View style={styles.learnBox}>
                <Text style={styles.learnLabel}>📚  LO QUE VAS A APRENDER</Text>
                {learnItems.map((item, i) => (
                  <View key={i} style={styles.learnRow}>
                    <View style={styles.learnDot} />
                    <Text style={styles.learnText}>{item}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.lobbyCta}>
              <Pressable onPress={() => setPhase(totalQ > 0 ? 'quiz' : (flashcards.length > 0 ? 'flashcards' : 'complete'))}>
                <LinearGradient colors={[Colors.brand, '#7C5AFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.bigCtaGrad}>
                  <Text style={styles.bigCtaText}>Empezar sesión →</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  /* ──────────────── QUIZ ──────────────── */
  if (phase === 'quiz' && question) {
    const answered = quizStep !== 'answering';
    return (
      <View style={styles.page}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.paper} />
        <SafeAreaView style={{ flex: 1 }}>

          {/* Top bar */}
          <View style={styles.topBar}>
            <Pressable onPress={() => router.back()} style={styles.exitBtn}>
              <Text style={styles.exitText}>✕</Text>
            </Pressable>
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

          {/* Confetti */}
          {quizStep === 'correct' && confetti.map((c, i) => (
            <Animated.View key={i} style={[styles.confetti, CONFETTI_POS[i], { transform: [{ translateY: c.y }], opacity: c.op }]} />
          ))}

          <ScrollView contentContainerStyle={styles.quizScroll} showsVerticalScrollIndicator={false}>
            <Text style={[styles.qInstruction, quizStep === 'wrong' && { color: Colors.rose }]}>
              {quizStep === 'answering' ? 'SELECCIONA LA RESPUESTA CORRECTA' : quizStep === 'correct' ? '¡PROSIGUE!' : 'REVISEMOS ESO'}
            </Text>

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
                    onPress={() => !answered && setSelectedOption(opt.id)}
                    disabled={answered}
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

            {/* Feedback banner */}
            {answered && (
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

          {/* Bottom CTA */}
          <View style={styles.bottomBar}>
            {!answered ? (
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
        </SafeAreaView>
      </View>
    );
  }

  /* ──────────────── CHECKPOINT ──────────────── */
  if (phase === 'checkpoint') {
    return (
      <View style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" backgroundColor="#0B0B1A" />
        <LinearGradient colors={['#0B0B1A', '#2D2D5A', Colors.brand]} style={{ flex: 1 }}>
          <SafeAreaView style={styles.cpSafe}>
            <View style={styles.cpIconWrap}>
              <LinearGradient colors={['#FFB547', '#FF7A2B']} style={styles.cpIconCircle}>
                <Text style={styles.cpIconEmoji}>🔥</Text>
              </LinearGradient>
            </View>
            <Text style={styles.cpTitle}>¡Vas{'\n'}<Text style={{ color: Colors.lime }}>en racha!</Text></Text>
            <Text style={styles.cpSub}>{consecutiveCorrect > 0 ? `${consecutiveCorrect} respuestas correctas seguidas. ¡Sigue así!` : 'Ya completaste la mitad. ¡No te rajes!'}</Text>

            <View style={styles.streakBox}>
              {[
                { label: '⚡ XP acumulado', val: `+${xpEarned}`, color: Colors.lime },
                { label: '🎯 Aciertos', val: `${correctCount} / ${quizIndex}`, color: Colors.amber },
                { label: '❤️ Vidas restantes', val: `${lives} / ${MAX_LIVES}`, color: Colors.paper },
              ].map((row, i) => (
                <View key={i} style={[styles.streakRow, i === 2 && { borderBottomWidth: 0 }]}>
                  <Text style={styles.srLabel}>{row.label}</Text>
                  <Text style={[styles.srVal, { color: row.color }]}>{row.val}</Text>
                </View>
              ))}
            </View>

            <Pressable onPress={() => setPhase('quiz')} style={styles.cpBtn}>
              <Text style={styles.cpBtnText}>Seguir conquistando →</Text>
            </Pressable>
          </SafeAreaView>
        </LinearGradient>
      </View>
    );
  }

  /* ──────────────── FLASHCARDS ──────────────── */
  if (phase === 'flashcards' && card) {
    const masteryCount = Math.min(cardIndex, 5);
    return (
      <View style={styles.page}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.paper} />
        <SafeAreaView style={{ flex: 1 }}>
          <View style={styles.topBar}>
            <Pressable onPress={() => router.back()} style={styles.exitBtn}>
              <Text style={styles.exitText}>✕</Text>
            </Pressable>
            <View style={styles.progressTrack}>
              <LinearGradient
                colors={[Colors.brand, Colors.accent]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[styles.progressFill, { width: `${Math.round((cardIndex / flashcards.length) * 100)}%` }]}
              />
            </View>
            <View style={styles.streakMini}>
              <Text style={styles.streakMiniText}>🔥 {consecutiveCorrect}</Text>
            </View>
          </View>

          <View style={styles.fcWrap}>
            <View style={styles.fcHeader}>
              <View style={styles.fcNumPill}>
                <Text style={styles.fcNumText}>TARJETA {cardIndex + 1} / {flashcards.length}</Text>
              </View>
              <View style={styles.masteryBar}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <View key={i} style={[styles.masteryDot, i < masteryCount && styles.masteryDotOn]} />
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
        </SafeAreaView>
      </View>
    );
  }

  /* ──────────────── COMPLETE ──────────────── */
  if (phase === 'complete') {
    const accuracy = totalQ > 0 ? Math.round((correctCount / totalQ) * 100) : 100;
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

            <View style={{ gap: 10, marginTop: 'auto' }}>
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

  return null;
}

// Confetti positions (quiz correct)
const CONFETTI_POS = [
  { position: 'absolute' as const, top: 80, left: '18%', width: 9, height: 9, backgroundColor: Colors.lime, borderRadius: 2 },
  { position: 'absolute' as const, top: 72, right: '22%', width: 8, height: 8, backgroundColor: Colors.accent, borderRadius: 4 },
  { position: 'absolute' as const, top: 90, left: '40%', width: 10, height: 10, backgroundColor: '#FFD93D', transform: [{ rotate: '45deg' }] },
  { position: 'absolute' as const, top: 68, right: '12%', width: 8, height: 8, backgroundColor: Colors.teal, borderRadius: 4 },
  { position: 'absolute' as const, top: 96, left: '62%', width: 9, height: 9, backgroundColor: '#5BC8FF' },
  { position: 'absolute' as const, top: 76, left: '52%', width: 7, height: 7, backgroundColor: Colors.amber, borderRadius: 3 },
];

// Confetti for complete screen (static decorative)
const CONFETTI_COMPLETE = [
  { top: '5%', left: '8%', backgroundColor: Colors.lime } as any,
  { top: '8%', right: '12%', backgroundColor: '#FFD93D', borderRadius: 5 } as any,
  { top: '14%', left: '28%', backgroundColor: '#5BC8FF' } as any,
  { top: '18%', right: '22%', backgroundColor: Colors.lime, borderRadius: 5 } as any,
  { top: '22%', left: '55%', backgroundColor: '#FFD93D' } as any,
  { top: '25%', right: '6%', backgroundColor: '#5BC8FF', borderRadius: 5 } as any,
];

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Colors.paper },

  // LOBBY
  lobbyScroll: { padding: 20, paddingBottom: 40 },
  lobbyBack: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  lobbyBackText: { color: Colors.paper, fontSize: 18, fontWeight: '700' },
  heroCard: { borderRadius: 24, padding: 20, marginBottom: 14, overflow: 'hidden' },
  heroGlow1: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,91,159,0.3)', top: -60, right: -60 },
  heroGlow2: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(196,248,82,0.25)', bottom: -50, left: -30 },
  heroEmoji: { fontSize: 40, marginBottom: 8 },
  heroSubject: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 1, marginBottom: 4 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: Colors.paper, letterSpacing: -0.5, lineHeight: 28, marginBottom: 10 },
  heroMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heroChip: { backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 100, paddingVertical: 3, paddingHorizontal: 9 },
  heroChipText: { color: Colors.paper, fontSize: 11, fontWeight: '600' },
  rewardsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  rewardCard: { flex: 1, backgroundColor: Colors.paper, borderRadius: 16, borderWidth: 1.5, borderColor: Colors.line, padding: 14, alignItems: 'center' },
  rewardEmoji: { fontSize: 24, marginBottom: 4 },
  rewardVal: { fontSize: 20, fontWeight: '900', color: Colors.brand, letterSpacing: -0.5 },
  rewardLbl: { fontSize: 9, fontWeight: '700', color: Colors.muted, letterSpacing: 1, marginTop: 2 },
  learnBox: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  learnLabel: { fontSize: 9, fontWeight: '700', color: Colors.muted, letterSpacing: 1, marginBottom: 10 },
  learnRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  learnDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.brand, marginTop: 5, flexShrink: 0 },
  learnText: { fontSize: 13, color: Colors.ink2, lineHeight: 20, flex: 1 },
  lobbyCta: { marginTop: 4 },

  // Shared big CTA
  bigCtaGrad: { borderRadius: 18, paddingVertical: 17, alignItems: 'center', justifyContent: 'center' },
  bigCtaText: { color: Colors.paper, fontWeight: '800', fontSize: 16, letterSpacing: -0.2 },

  // QUIZ top bar
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  exitBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: Colors.bgSoft, alignItems: 'center', justifyContent: 'center' },
  exitText: { fontSize: 14, color: Colors.ink3, fontWeight: '700' },
  progressTrack: { flex: 1, height: 12, backgroundColor: Colors.bgSoft, borderRadius: 100, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 100 },
  livesRow: { flexDirection: 'row', gap: 2 },
  heart: { fontSize: 16 },

  // Confetti
  confetti: { position: 'absolute', width: 9, height: 9 },

  // Quiz content
  quizScroll: { padding: 20, paddingBottom: 16 },
  qInstruction: { fontSize: 11, fontWeight: '800', color: Colors.brand, letterSpacing: 1.5, marginBottom: 12 },
  qText: { fontSize: 20, fontWeight: '800', color: Colors.ink, lineHeight: 26, letterSpacing: -0.4, marginBottom: 12 },
  sourceChip: { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: Colors.bgSoft, borderWidth: 1, borderColor: Colors.line, borderRadius: 100, paddingVertical: 5, paddingHorizontal: 12, marginBottom: 16 },
  sourceChipText: { fontSize: 11, fontWeight: '600', color: Colors.ink3 },
  optionsWrap: { gap: 10, marginBottom: 14 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, borderWidth: 2, shadowColor: Colors.line2, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 0, elevation: 0 },
  optLetter: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  optLetterText: { fontSize: 12, fontWeight: '800' },
  optText: { flex: 1, fontSize: 15, color: Colors.ink, fontWeight: '600', lineHeight: 21 },
  optIcon: { fontSize: 16, fontWeight: '800' },

  // Feedback
  feedbackBanner: { borderRadius: 18, padding: 14, borderWidth: 2, marginBottom: 8 },
  feedbackCorrect: { borderColor: Colors.teal, backgroundColor: 'rgba(0,194,168,0.08)' },
  feedbackWrong: { borderColor: Colors.rose, backgroundColor: 'rgba(255,77,109,0.08)' },
  feedbackTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  feedbackIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  feedbackIconOk: { backgroundColor: Colors.teal },
  feedbackIconErr: { backgroundColor: Colors.rose },
  feedbackIconTxt: { color: Colors.paper, fontSize: 18, fontWeight: '900' },
  feedbackTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  xpPill: { backgroundColor: Colors.teal, borderRadius: 100, paddingVertical: 3, paddingHorizontal: 10, alignSelf: 'flex-start', marginTop: 4 },
  xpPillWrong: { backgroundColor: Colors.rose },
  xpPillText: { color: Colors.paper, fontSize: 11, fontWeight: '700' },
  feedbackExpl: { fontSize: 13, color: Colors.ink2, lineHeight: 20, marginBottom: 8 },
  feedbackSource: { backgroundColor: 'rgba(255,255,255,0.6)', borderLeftWidth: 3, borderLeftColor: Colors.brand, borderRadius: 0, paddingLeft: 10, paddingVertical: 6 },
  feedbackSourceLabel: { fontSize: 9, fontWeight: '800', color: Colors.brand, letterSpacing: 1, marginBottom: 2 },
  feedbackSourceText: { fontSize: 12, color: Colors.ink3, fontStyle: 'italic', lineHeight: 18 },

  // Bottom bar
  bottomBar: { padding: 16, paddingBottom: 24, backgroundColor: Colors.paper, borderTopWidth: 1, borderTopColor: Colors.line },

  // CHECKPOINT
  cpSafe: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  cpIconWrap: { marginBottom: 20 },
  cpIconCircle: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  cpIconEmoji: { fontSize: 40 },
  cpTitle: { fontSize: 32, fontWeight: '900', color: Colors.paper, textAlign: 'center', letterSpacing: -1, lineHeight: 36, marginBottom: 10 },
  cpSub: { fontSize: 14, color: 'rgba(255,255,255,0.75)', textAlign: 'center', lineHeight: 22, marginBottom: 24, maxWidth: 260 },
  streakBox: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 18, padding: 16, width: '100%', marginBottom: 20 },
  streakRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  srLabel: { fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  srVal: { fontSize: 15, fontWeight: '800', color: Colors.paper },
  cpBtn: { backgroundColor: Colors.paper, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 32, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 0, elevation: 4 },
  cpBtnText: { color: Colors.ink, fontWeight: '800', fontSize: 16 },

  // FLASHCARDS
  streakMini: { backgroundColor: Colors.orange, borderRadius: 100, paddingVertical: 4, paddingHorizontal: 10 },
  streakMiniText: { color: Colors.paper, fontSize: 12, fontWeight: '800' },
  fcWrap: { flex: 1, padding: 16, paddingTop: 8 },
  fcHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  fcNumPill: { backgroundColor: Colors.bgSoft, borderRadius: 100, paddingVertical: 5, paddingHorizontal: 12 },
  fcNumText: { fontSize: 10, fontWeight: '700', color: Colors.ink2, letterSpacing: 0.5 },
  masteryBar: { flexDirection: 'row', gap: 4 },
  masteryDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.line },
  masteryDotOn: { backgroundColor: Colors.lime },
  fcInstruction: { fontSize: 11, fontWeight: '800', color: Colors.accent, letterSpacing: 1.5, marginBottom: 12 },
  flashcard: { flex: 1, borderRadius: 24, padding: 28, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  fcGlow1: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.15)', top: -60, right: -60 },
  fcGlow2: { position: 'absolute', width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.1)', bottom: -50, left: -40 },
  fcSideLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 2, marginBottom: 16, textTransform: 'uppercase' },
  fcQuestion: { fontSize: 20, fontWeight: '800', color: Colors.paper, textAlign: 'center', lineHeight: 28, letterSpacing: -0.3 },
  fcHint: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 24 },
  srsRow: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 24 },
  srsBtn: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  srsBtnGrad: { paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center', gap: 2 },
  srsBtnEmoji: { fontSize: 20 },
  srsBtnLabel: { fontSize: 11, fontWeight: '800', color: Colors.paper },

  // COMPLETE
  completeSafe: { flex: 1, padding: 24, alignItems: 'center' },
  trophyCircle: { width: 90, height: 90, borderRadius: 45, backgroundColor: Colors.lime, alignItems: 'center', justifyContent: 'center', marginBottom: 16, shadowColor: Colors.lime, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 8 },
  trophyEmoji: { fontSize: 48 },
  completeTitle: { fontSize: 34, fontWeight: '900', color: Colors.paper, textAlign: 'center', letterSpacing: -1, lineHeight: 38, marginBottom: 8 },
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
