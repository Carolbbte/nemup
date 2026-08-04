/**
 * Experience Layer NEMUP — Runner (muestra los bloques de a UNO)
 * =================================================================
 * No importa el Builder ni el motor — la Experiencia sale de
 * `iniciarExperiencia()` (MotorContext), que ya la dejó armada y amarrada
 * a la decisión congelada. Este componente solo recorre `bloques` y, para
 * cada uno interactivo, captura la respuesta EN EL MOMENTO como
 * `Evidencia` vía `registrarEvidencia` — nunca acumula estado de
 * respuestas para aplicarlo al final, así escala a experiencias con
 * varios bloques interactivos sin cambios.
 *
 * Contenido real de cada bloque es un hito de backend — placeholder por
 * ahora: icono + etiqueta por tipo, y para los interactivos, un control
 * "Acerté" / "Me equivoqué" (TEMP, gated por MOTOR_MODE en el caller).
 */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { palette, semantic } from '@/theme/colors';
import { useMotor } from '@/contexts/MotorContext';
import { inferirTipoError } from './evidencia';
import type { TipoBloque } from './contracts/contratos';

const ICONO_POR_BLOQUE: Record<TipoBloque, string> = {
  contexto: '📖',
  ejemplo: '💡',
  pregunta: '❓',
  ejercicio: '📝',
  insight: '✨',
  memoria: '🃏',
  celebracion: '🎉',
};

const ETIQUETA_POR_BLOQUE: Record<TipoBloque, string> = {
  contexto: 'Contexto',
  ejemplo: 'Ejemplo',
  pregunta: 'Pregunta',
  ejercicio: 'Ejercicio',
  insight: 'Insight',
  memoria: 'Memoria',
  celebracion: 'Celebración',
};

// Bloques que le piden algo al estudiante (captura Evidencia). El resto
// solo se lee/mira — avanza con "Siguiente".
const BLOQUES_INTERACTIVOS = new Set<TipoBloque>(['pregunta', 'ejercicio']);

export function ExperienceRunner({ onFinish }: { onFinish: () => void }) {
  const { iniciarExperiencia, registrarEvidencia } = useMotor();
  // Inicializador perezoso — iniciarExperiencia() (congela la decisión)
  // corre UNA sola vez, al montar, no en cada re-render.
  const [experiencia] = useState(() => {
    const exp = iniciarExperiencia();
    console.log('[ExperienceRunner] Experiencia iniciada:', exp);
    return exp;
  });
  const [indice, setIndice] = useState(0);

  const bloque = experiencia.bloques[indice];
  const esUltimo = indice + 1 >= experiencia.bloques.length;
  const esInteractivo = BLOQUES_INTERACTIVOS.has(bloque.tipo);

  const avanzar = () => {
    if (esUltimo) onFinish();
    else setIndice(indice + 1);
  };

  const responder = (correcto: boolean) => {
    registrarEvidencia(
      correcto
        ? { correcto: true }
        : { correcto: false, tipoError: inferirTipoError(experiencia.objetivo) },
    );
    avanzar();
  };

  return (
    <View style={s.content}>
      <Text style={s.progress}>{indice + 1} / {experiencia.bloques.length}</Text>
      <View style={s.iconBox}>
        <Text style={s.icon}>{ICONO_POR_BLOQUE[bloque.tipo]}</Text>
      </View>
      <Text style={s.label}>{ETIQUETA_POR_BLOQUE[bloque.tipo]}</Text>

      {esInteractivo ? (
        <View style={s.answerRow}>
          <Pressable style={[s.answerBtn, s.answerCorrect]} onPress={() => responder(true)}>
            <Text style={s.answerBtnText}>Acerté</Text>
          </Pressable>
          <Pressable style={[s.answerBtn, s.answerWrong]} onPress={() => responder(false)}>
            <Text style={s.answerBtnText}>Me equivoqué</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={s.nextBtn} onPress={avanzar}>
          <Text style={s.nextBtnText}>Siguiente</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  content:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  progress:     { fontSize: 13, fontWeight: '700', color: semantic.textTertiary, marginBottom: 20 },
  iconBox:      { width: 88, height: 88, borderRadius: 44, backgroundColor: palette.azulClaro, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  icon:         { fontSize: 40 },
  label:        { fontSize: 20, fontWeight: '800', color: semantic.textPrimary, marginBottom: 32 },
  answerRow:    { flexDirection: 'row', gap: 12, width: '100%' },
  answerBtn:    { flex: 1, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  answerCorrect:{ backgroundColor: palette.verdeXP },
  answerWrong:  { backgroundColor: palette.rojoErrorDark },
  answerBtnText:{ fontSize: 15, fontWeight: '800', color: palette.blanco },
  nextBtn:      { height: 54, borderRadius: 16, paddingHorizontal: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.azul },
  nextBtnText:  { fontSize: 16, fontWeight: '800', color: palette.blanco },
});
