// Esta pantalla representa el INICIO del nuevo flujo guiado por el motor.
// NO debe convertirse en un Dashboard. Siempre muestra UN único objetivo.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { palette, semantic } from '@/theme/colors';
import { MOTOR_MODE } from '@/config/features';
import { MotorProvider, useMotor } from '@/contexts/MotorContext';
import { ExperienceRunner } from '@/experience/ExperienceRunner';
import { CelebrationBeat } from '@/experience/CelebrationBeat';
import { copyCelebracion } from '@/experience/celebracionCopy';
import { fraseObjetivo } from '@/experience/fraseObjetivo';
import { perfilNuevo, perfilAplicar, perfilDominado } from '@/experience/dev/perfilesFalsos';
import type { PerfilConcepto } from '@/motor';

type Phase = 'intro' | 'running' | 'celebrate';

// TEMP — perfiles semilla para el control dev de abajo (ver su propio
// comentario). Desaparece cuando el motor decida sobre perfiles reales.
const PERFILES_DEV: { label: string; perfil: PerfilConcepto }[] = [
  { label: 'Nuevo', perfil: perfilNuevo },
  { label: 'Aplicar', perfil: perfilAplicar },
  { label: 'Dominado', perfil: perfilDominado },
];

export default function CurrentObjectiveScreen() {
  // El Provider envuelve SOLO este árbol — no el layout global — mismo
  // criterio que el resto de MOTOR_MODE: todo lo nuevo queda contenido acá.
  return (
    <MotorProvider>
      <CurrentObjectiveInner />
    </MotorProvider>
  );
}

function CurrentObjectiveInner() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('intro');
  // Si el objetivo avanzó tras la última misión — decide el tono de la
  // celebración (ver ExperienceRunner.onFinish). Solo tiene sentido
  // mientras phase === 'celebrate'.
  const [avanzo, setAvanzo] = useState(false);
  const { objetivo, reiniciarPerfil } = useMotor();

  if (phase === 'running') {
    return (
      <SafeAreaView style={s.page} edges={['top', 'bottom']}>
        <ExperienceRunner
          onFinish={(avanzoAhora) => {
            setAvanzo(avanzoAhora);
            setPhase('celebrate');
          }}
        />
      </SafeAreaView>
    );
  }

  if (phase === 'celebrate') {
    const copy = copyCelebracion(avanzo);
    return (
      <SafeAreaView style={s.page} edges={['top', 'bottom']}>
        <CelebrationBeat
          title={copy.title}
          subtitle={copy.subtitle}
          // Vuelve a 'running': monta un ExperienceRunner NUEVO, que llama
          // iniciarExperiencia() y arma la siguiente misión sobre el
          // objetivo ya avanzado — así se cierra el loop.
          onContinuar={() => setPhase('running')}
          // Siempre decide el estudiante — sale del flujo sin fricción,
          // nunca un regaño por no seguir.
          onDejar={() => router.back()}
        />
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
                onPress={() => reiniciarPerfil(p)}
                style={s.devChip}
              >
                <Text style={s.devChipText}>{label}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
      <View style={s.bottom}>
        <Pressable
          onPress={() => setPhase('running')}
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

  // ── TEMP: control dev de perfil semilla (Fase 4/5) ──────────────
  devRow:       { flexDirection: 'row', gap: 8, marginTop: 20 },
  devChip:      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: semantic.textTertiary },
  devChipText:  { fontSize: 12, fontWeight: '700', color: semantic.textTertiary },
});
