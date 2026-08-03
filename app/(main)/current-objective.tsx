// Esta pantalla representa el INICIO del nuevo flujo guiado por el motor.
// NO debe convertirse en un Dashboard. Siempre muestra UN único objetivo.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palette, semantic } from '@/theme/colors';

type Phase = 'intro'; // se ampliará en fases siguientes (mission, celebrate…)

export default function CurrentObjectiveScreen() {
  const [phase] = useState<Phase>('intro');

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
          onPress={() => console.log('comenzar')}
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
});
