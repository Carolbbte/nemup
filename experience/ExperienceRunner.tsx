/**
 * Experience Layer NEMUP — Runner (muestra los bloques de a UNO)
 * =================================================================
 * No importa el Builder ni el motor — la Experiencia sale de
 * `iniciarExperiencia()` (MotorContext), que ya la dejó armada, RELLENADA
 * con contenido real (experience/content/rellenar.ts) y amarrada a la
 * decisión congelada. Este componente solo recorre `bloques` y, para cada
 * uno interactivo, captura la respuesta EN EL MOMENTO como `Evidencia` vía
 * `registrarEvidencia` — nunca acumula estado de respuestas para
 * aplicarlo al final, así escala a experiencias con varios bloques
 * interactivos sin cambios.
 *
 * Render real cuando el bloque trae `contenido` (narrowing por
 * `bloque.tipo`, ver `esInteractivo`: `pregunta`/`ejercicio` traen
 * `ContenidoPregunta`, el resto `ContenidoTexto`). Si una casilla todavía
 * no tiene autor en el banco, `contenido` queda `undefined` y se cae al
 * placeholder de siempre ("Acerté"/"Me equivoqué", `inferirTipoError`
 * como fallback) — nunca rompe el runner.
 */

import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { palette, semantic } from '@/theme/colors';
import { useMotor } from '@/contexts/MotorContext';
import { inferirTipoError } from './evidencia';
import type { ResultadoMision } from './celebracionCopy';
import type { ContenidoPregunta, ContenidoTexto, OpcionPregunta, TipoBloque } from './contracts/contratos';

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

// Bloques que le piden algo al estudiante (captura Evidencia) — y por lo
// tanto traen ContenidoPregunta cuando tienen contenido real. El resto
// solo se lee/mira (ContenidoTexto) — avanza con "Siguiente".
const BLOQUES_INTERACTIVOS = new Set<TipoBloque>(['pregunta', 'ejercicio']);

export function ExperienceRunner({ onFinish }: { onFinish: (resultado: ResultadoMision) => void }) {
  const { objetivo, iniciarExperiencia, registrarEvidencia } = useMotor();
  // Inicializador perezoso — iniciarExperiencia() (congela la decisión,
  // rellena contenido) corre UNA sola vez, al montar, no en cada re-render.
  const [experiencia] = useState(() => {
    const exp = iniciarExperiencia();
    console.log('[ExperienceRunner] Experiencia iniciada:', exp);
    return exp;
  });
  const [indice, setIndice] = useState(0);
  // Opción elegida en el bloque interactivo ACTUAL — null hasta que el
  // estudiante toca una. Se resetea al pasar de bloque (avanzar()).
  const [seleccionId, setSeleccionId] = useState<string | null>(null);
  // ¿Hubo algún error en la misión? (ref, no state: se lee sincrónicamente al
  // finalizar y se reinicia solo al remontar el runner en la próxima misión).
  const huboErrorRef = useRef(false);

  const bloque = experiencia.bloques[indice];
  const esUltimo = indice + 1 >= experiencia.bloques.length;
  const esInteractivo = BLOQUES_INTERACTIVOS.has(bloque.tipo);
  // Narrowing por bloque.tipo (no por la forma del objeto): esta casilla
  // SIEMPRE recibe ContenidoPregunta si es interactiva, ContenidoTexto si
  // no — así lo garantiza experience/content/factorComun.ts.
  const contenidoPregunta = esInteractivo ? (bloque.contenido as ContenidoPregunta | undefined) : undefined;
  const contenidoTexto = !esInteractivo ? (bloque.contenido as ContenidoTexto | undefined) : undefined;

  const avanzar = () => {
    setSeleccionId(null);
    if (esUltimo) {
      // `objetivo` viene del contexto y ya refleja TODA la evidencia
      // registrada durante esta experiencia — comparar contra el objetivo
      // con el que arrancó (`experiencia.objetivo`, congelado al montar)
      // dice si el motor avanzó a otro peldaño/cualidad.
      const avanzo = experiencia.objetivo.tipo !== objetivo.tipo;
      // Tono de la celebración: dominó (avanzó) / le costó (hubo errores) /
      // bien pero falta práctica.
      const resultado: ResultadoMision = avanzo
        ? 'dominado'
        : huboErrorRef.current
          ? 'refuerzo'
          : 'avance';
      onFinish(resultado);
    } else {
      setIndice(indice + 1);
    }
  };

  // Placeholder — casilla sin contenido todavía en el banco.
  const responderPlaceholder = (correcto: boolean) => {
    if (!correcto) huboErrorRef.current = true;
    registrarEvidencia(
      correcto ? { correcto: true } : { correcto: false, tipoError: inferirTipoError(experiencia.objetivo) },
    );
    avanzar();
  };

  // Contenido real: la evidencia sale del DISTRACTOR que el estudiante
  // eligió (opcion.tipoError), no de una inferencia por tipo de misión —
  // inferirTipoError queda solo de fallback si una opción no lo trae.
  const responderOpcion = (opcion: OpcionPregunta) => {
    if (seleccionId !== null) return; // ya respondida — ignora taps repetidos.
    if (!opcion.correcta) huboErrorRef.current = true;
    setSeleccionId(opcion.id);
    registrarEvidencia({
      correcto: opcion.correcta,
      tipoError: opcion.correcta ? undefined : (opcion.tipoError ?? inferirTipoError(experiencia.objetivo)),
    });
  };

  return (
    <View style={s.content}>
      <Text style={s.progress}>{indice + 1} / {experiencia.bloques.length}</Text>

      {contenidoPregunta ? (
        <>
          <Text style={s.enunciado}>{contenidoPregunta.enunciado}</Text>
          <View style={s.opcionesList}>
            {contenidoPregunta.opciones.map((opcion) => {
              const respondida = seleccionId !== null;
              const esSeleccionada = seleccionId === opcion.id;
              return (
                <Pressable
                  key={opcion.id}
                  disabled={respondida}
                  onPress={() => responderOpcion(opcion)}
                  style={[
                    s.opcionBtn,
                    respondida && opcion.correcta && s.opcionCorrecta,
                    respondida && esSeleccionada && !opcion.correcta && s.opcionIncorrecta,
                  ]}
                >
                  <Text style={s.opcionTexto}>{opcion.texto}</Text>
                  {respondida && opcion.correcta && <Text style={s.opcionMarca}>✓</Text>}
                  {respondida && esSeleccionada && !opcion.correcta && <Text style={s.opcionMarca}>✗</Text>}
                </Pressable>
              );
            })}
          </View>
          {seleccionId !== null && (
            <Pressable style={s.nextBtn} onPress={avanzar}>
              <Text style={s.nextBtnText}>Siguiente</Text>
            </Pressable>
          )}
        </>
      ) : contenidoTexto ? (
        <>
          {!!contenidoTexto.titulo && <Text style={s.tituloTexto}>{contenidoTexto.titulo}</Text>}
          <Text style={s.cuerpoTexto}>{contenidoTexto.cuerpo}</Text>
          {!!contenidoTexto.pasos?.length && (
            <View style={s.pasosList}>
              {contenidoTexto.pasos.map((paso, i) => (
                <Text key={i} style={s.pasoTexto}>{paso}</Text>
              ))}
            </View>
          )}
          <Pressable style={s.nextBtn} onPress={avanzar}>
            <Text style={s.nextBtnText}>Siguiente</Text>
          </Pressable>
        </>
      ) : (
        // Placeholder — mismo control de siempre, para una casilla sin
        // autor en el banco todavía.
        <>
          <View style={s.iconBox}>
            <Text style={s.icon}>{ICONO_POR_BLOQUE[bloque.tipo]}</Text>
          </View>
          <Text style={s.label}>{ETIQUETA_POR_BLOQUE[bloque.tipo]}</Text>
          {esInteractivo ? (
            <View style={s.answerRow}>
              <Pressable style={[s.answerBtn, s.answerCorrect]} onPress={() => responderPlaceholder(true)}>
                <Text style={s.answerBtnText}>Acerté</Text>
              </Pressable>
              <Pressable style={[s.answerBtn, s.answerWrong]} onPress={() => responderPlaceholder(false)}>
                <Text style={s.answerBtnText}>Me equivoqué</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable style={s.nextBtn} onPress={avanzar}>
              <Text style={s.nextBtnText}>Siguiente</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  content:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  progress:     { fontSize: 13, fontWeight: '700', color: semantic.textTertiary, marginBottom: 20 },

  // ── Placeholder (sin contenido real todavía) ────────────────────
  iconBox:      { width: 88, height: 88, borderRadius: 44, backgroundColor: palette.azulClaro, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  icon:         { fontSize: 40 },
  label:        { fontSize: 20, fontWeight: '800', color: semantic.textPrimary, marginBottom: 32 },
  answerRow:    { flexDirection: 'row', gap: 12, width: '100%' },
  answerBtn:    { flex: 1, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  answerCorrect:{ backgroundColor: palette.verdeXP },
  answerWrong:  { backgroundColor: palette.rojoErrorDark },
  answerBtnText:{ fontSize: 15, fontWeight: '800', color: palette.blanco },

  // ── Contenido real: pregunta/ejercicio ───────────────────────────
  enunciado:      { fontSize: 19, fontWeight: '800', color: semantic.textPrimary, textAlign: 'center', marginBottom: 24, lineHeight: 26 },
  opcionesList:   { width: '100%', gap: 10 },
  opcionBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: palette.blanco, borderRadius: 14, borderWidth: 1.5, borderColor: palette.bordeClaro, paddingVertical: 14, paddingHorizontal: 16 },
  opcionCorrecta: { borderColor: palette.verdeXP, backgroundColor: 'rgba(50,215,75,0.08)' },
  opcionIncorrecta:{ borderColor: palette.rojoErrorDark, backgroundColor: palette.rojoErrorBg },
  opcionTexto:    { flex: 1, fontSize: 15, fontWeight: '600', color: semantic.textPrimary },
  opcionMarca:    { fontSize: 16, fontWeight: '800', color: semantic.textPrimary, marginLeft: 8 },

  // ── Contenido real: contexto/ejemplo/insight ─────────────────────
  tituloTexto: { fontSize: 20, fontWeight: '800', color: semantic.textPrimary, textAlign: 'center', marginBottom: 8 },
  cuerpoTexto: { fontSize: 16, color: semantic.textPrimary, textAlign: 'center', lineHeight: 24, marginBottom: 16 },
  pasosList:   { width: '100%', gap: 8, marginBottom: 24 },
  pasoTexto:   { fontSize: 15, fontWeight: '600', color: semantic.textPrimary, textAlign: 'center', backgroundColor: palette.azulClaro, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },

  // ── Compartido ────────────────────────────────────────────────
  nextBtn:      { height: 54, borderRadius: 16, paddingHorizontal: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.azul, marginTop: 24 },
  nextBtnText:  { fontSize: 16, fontWeight: '800', color: palette.blanco },
});
