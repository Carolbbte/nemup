// Esta pantalla representa el INICIO del nuevo flujo guiado por el motor.
// NO debe convertirse en un Dashboard. Siempre muestra UN único objetivo.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palette, semantic } from '@/theme/colors';
import { MOTOR_MODE } from '@/config/features';
import type { ExperienceBlock, TipoBloque } from '@/experience/contracts/contratos';
import type { PerfilConcepto } from '@/motor';
import { crearExperiencia } from '@/experience/builder/builder';
import { objetivoActual } from '@/experience/objetivoActual';
import { fraseObjetivo } from '@/experience/fraseObjetivo';
import { perfilNuevo, perfilAplicar, perfilDominado } from '@/experience/dev/perfilesFalsos';

type Phase = 'intro'; // se ampliará en fases siguientes (mission, celebrate…)

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

// TEMP — perfiles semilla para el control dev de abajo (ver su propio
// comentario). Desaparece cuando el motor decida sobre perfiles reales.
const PERFILES_DEV: { label: string; perfil: PerfilConcepto }[] = [
  { label: 'Nuevo', perfil: perfilNuevo },
  { label: 'Aplicar', perfil: perfilAplicar },
  { label: 'Dominado', perfil: perfilDominado },
];

export default function CurrentObjectiveScreen() {
  const [phase] = useState<Phase>('intro');
  // Perfil semilla activo — Fase 4 todavía no persiste perfiles reales
  // (eso es una fase futura); el control dev de abajo permite cambiarlo
  // para VER cómo reacciona el motor a distintos estados.
  const [perfil, setPerfil] = useState<PerfilConcepto>(perfilNuevo);
  // null = todavía no se tocó "Comenzar" (se muestra la jerarquía de la
  // Fase 2). No-null = la Experiencia que armó el Builder al tocarlo.
  const [bloques, setBloques] = useState<ExperienceBlock[] | null>(null);

  // El motor decide, real — ya no un OBJETIVO_FALSO (Fase 3). Se recalcula
  // en cada render a partir del perfil semilla activo: cambiar de perfil
  // (control dev) cambia el objetivo de inmediato.
  const objetivo = objetivoActual(perfil, Date.now());

  const handleComenzar = () => {
    const experiencia = crearExperiencia(objetivo);
    console.log('[current-objective] Experiencia construida:', experiencia);
    setBloques(experiencia.bloques);
  };

  if (bloques) {
    return (
      <SafeAreaView style={s.page} edges={['top', 'bottom']}>
        <View style={s.content}>
          <Text style={s.title}>🎯 {fraseObjetivo(objetivo)}</Text>
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
            Tu siguiente objetivo: {fraseObjetivo(objetivo)}.
          </Text>
        </View>

        {/* TEMP: control dev — cambia el perfil semilla activo para ver en
            vivo cómo el motor recalcula el objetivo. Desaparece cuando el
            motor decida sobre perfiles reales persistidos (fases futuras). */}
        {MOTOR_MODE && (
          <View style={s.devRow}>
            {PERFILES_DEV.map(({ label, perfil: p }) => (
              <Pressable
                key={label}
                onPress={() => setPerfil(p)}
                style={[s.devChip, perfil === p && s.devChipActive]}
              >
                <Text style={[s.devChipText, perfil === p && s.devChipTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        )}
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
  blockList:     { width: '100%', gap: 10 },
  blockRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: palette.blanco, borderRadius: 14, borderWidth: 1, borderColor: palette.bordeClaro, paddingVertical: 12, paddingHorizontal: 14 },
  blockIconBox:  { width: 36, height: 36, borderRadius: 10, backgroundColor: palette.azulClaro, alignItems: 'center', justifyContent: 'center' },
  blockIcon:     { fontSize: 18 },
  blockLabel:    { fontSize: 15, fontWeight: '700', color: semantic.textPrimary },

  // ── TEMP: control dev de perfil semilla (Fase 4) ────────────────
  devRow:            { flexDirection: 'row', gap: 8, marginTop: 20 },
  devChip:           { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: semantic.textTertiary },
  devChipActive:     { backgroundColor: palette.azulClaro, borderStyle: 'solid', borderColor: palette.azul },
  devChipText:       { fontSize: 12, fontWeight: '700', color: semantic.textTertiary },
  devChipTextActive: { color: palette.azul },
});
