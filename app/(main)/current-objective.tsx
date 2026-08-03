// Esta pantalla representa el INICIO del nuevo flujo guiado por el motor.
// NO debe convertirse en un Dashboard. Siempre muestra UN único objetivo.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palette, semantic } from '@/theme/colors';
import type { ExperienceBlock, Objetivo, TipoBloque } from '@/experience/contracts/contratos';
import { crearExperiencia } from '@/experience/builder/builder';

type Phase = 'intro'; // se ampliará en fases siguientes (mission, celebrate…)

// Fase 3 — objetivo de prueba EXPLÍCITO, para validar que el Builder arma
// una experiencia coherente sin que el motor esté conectado todavía (eso
// es la Fase 4). Cambiar `tipo` acá debe cambiar la receta y los bloques.
const OBJETIVO_FALSO: Objetivo = {
  conceptoId: 'factor-comun',
  conceptoNombre: 'Factor Común',
  tipo: 'aplicar',
  confianza: 40,
  minutosEstimados: 3,
};

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

export default function CurrentObjectiveScreen() {
  const [phase] = useState<Phase>('intro');
  // null = todavía no se tocó "Comenzar" (se muestra la jerarquía de la
  // Fase 2). No-null = la Experiencia que armó el Builder al tocarlo.
  const [bloques, setBloques] = useState<ExperienceBlock[] | null>(null);

  const handleComenzar = () => {
    console.log('comenzar');
    const experiencia = crearExperiencia(OBJETIVO_FALSO);
    console.log('[current-objective] Experiencia construida:', experiencia);
    setBloques(experiencia.bloques);
  };

  if (bloques) {
    return (
      <SafeAreaView style={s.page} edges={['top', 'bottom']}>
        <View style={s.content}>
          <Text style={s.title}>🎯 Tu experiencia</Text>
          <Text style={s.blocksHeading}>Así se armó, paso a paso:</Text>
          <View style={s.blockList}>
            {bloques.map((bloque) => (
              <View key={bloque.id} style={s.blockRow}>
                <View style={s.blockIconBox}>
                  <Text style={s.blockIcon}>{ICONO_POR_BLOQUE[bloque.tipo]}</Text>
                </View>
                <Text style={s.blockLabel}>{ETIQUETA_POR_BLOQUE[bloque.tipo]}</Text>
              </View>
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.page} edges={['top', 'bottom']}>
      <View style={s.content}>
        <Text style={s.title}>🎯 Preparando tu prueba</Text>
        <Text style={s.message}>
          Ya sabemos cómo ayudarte. Analizamos tu material y encontramos el
          primer paso que tendrá mayor impacto para preparar esta evaluación.
        </Text>
        <View style={s.objectiveBox}>
          <Text style={s.objectiveText}>
            Tu siguiente objetivo: aprender a reconocer cuándo usar Factor Común.
          </Text>
        </View>
      </View>
      <View style={s.bottom}>
        <Pressable
          onPress={handleComenzar}
          style={({ pressed }) => [s.cta, pressed && { opacity: 0.88 }]}
        >
          <Text style={s.ctaTxt}>Comenzar</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page:          { flex: 1, backgroundColor: palette.crema },
  content:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  title:         { fontSize: 26, fontWeight: '900', color: semantic.textPrimary, textAlign: 'center', marginBottom: 16 },
  message:       { fontSize: 15, color: semantic.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  objectiveBox:  { backgroundColor: palette.blanco, borderRadius: 16, borderWidth: 1, borderColor: palette.bordeClaro, padding: 18 },
  objectiveText: { fontSize: 16, fontWeight: '700', color: semantic.textPrimary, textAlign: 'center', lineHeight: 23 },
  bottom:        { paddingHorizontal: 20, paddingBottom: 24 },
  cta:           { height: 54, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.azul },
  ctaTxt:        { fontSize: 16, fontWeight: '800', color: palette.blanco },

  // ── Fase 3: lista de bloques armada por el Builder ──────────────
  blocksHeading: { fontSize: 14, color: semantic.textSecondary, marginBottom: 16 },
  blockList:     { width: '100%', gap: 10 },
  blockRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: palette.blanco, borderRadius: 14, borderWidth: 1, borderColor: palette.bordeClaro, paddingVertical: 12, paddingHorizontal: 14 },
  blockIconBox:  { width: 36, height: 36, borderRadius: 10, backgroundColor: palette.azulClaro, alignItems: 'center', justifyContent: 'center' },
  blockIcon:     { fontSize: 18 },
  blockLabel:    { fontSize: 15, fontWeight: '700', color: semantic.textPrimary },
});
