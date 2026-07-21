# Prompt: Rediseño de la pantalla intro del paso a paso (worked_example_intro) — v1 solo frontend

**Objetivo:** dejar la pantalla `worked_example_intro` de la Misión como el mockup adjunto: pill "REPASO", título "Veamos cómo se resuelve" con subrayado amarillo, subtítulo, **mascota `conLapiz.png`** arriba a la derecha, una tarjeta **"EJERCICIO A RESOLVER"** que muestra el ejercicio concreto (`(x + 6)(x + 4) = ?`), y tarjetas de **"¿Qué aprenderás?"** y **"¡Tú puedes!"**.

**Solo FRONTEND, y SOLO la rama `slide?.type === 'worked_example_intro'`** en `app/(main)/modals/session.tsx` (~líneas 2811-2827). ⚠️ NO tocar la rama `slide?.type === 'worked_example'` (la del paso a paso real, justo debajo) — en un intento anterior se editó por error esa rama y se rompió el contenido. Identificar la rama correcta por el marcador `slide?.type === 'worked_example_intro'`.

## Regla de espacio (importante)
**Preferir que TODO quepa sin scroll.** Si las tres tarjetas no caben en una pantalla, **omitir la última ("¡Tú puedes!")** en vez de introducir scroll. Implementación simple y determinista: mostrar la tarjeta "¡Tú puedes!" solo cuando hay espacio — usar el breakpoint `SM` que ya existe (`const SM = SCREEN_H < 740`): en pantallas `SM` NO renderizar la tarjeta "¡Tú puedes!"; en pantallas normales, sí. (Si se quiere más preciso, medir con `onLayout`, pero el approach por `SM` es suficiente para v1.) La pantalla debe caber **sin ScrollView** — no envolver en scroll.

Prioridad de contenido (de mayor a menor, se dropea de abajo hacia arriba si falta espacio): tarjeta del ejercicio > "¿Qué aprenderás?" > "¡Tú puedes!".

## Datos (v1 solo frontend)
- **Ejercicio a mostrar:** buscar el próximo slide `worked_example` y tomar su `statement` VERBATIM:
  ```ts
  const nextWorked = slides.slice(summaryIdx + 1).find((s) => s.type === 'worked_example') as BackendSlide | undefined;
  const stmt = nextWorked?.statement?.trim();
  const exercisePrompt = stmt ? (stmt.includes('=') ? stmt : `${stmt} = ?`) : null; // lo plantea como "= ?"
  ```
  (`slides` ya es `missionSlides`; `summaryIdx` está en scope.)
- **Textos genéricos fijos** (no hay campo backend aún; se enriquecerán después):
  - Instrucción del ejercicio: **"Resuelve la siguiente expresión:"** (genérico; NO "Expande y simplifica", que solo aplica a expansiones).
  - "¿Qué aprenderás?": **"Verás el procedimiento completo, paso a paso, para llegar al resultado."**
  - "¡Tú puedes!": **"Sigue cada paso y domina el ejercicio."**
- **Fallback:** si no hay `worked_example` después (`exercisePrompt` null), mostrar el comportamiento actual (`slide.definition` en `sum.conceptCard`) en vez de la tarjeta del ejercicio, sin romper.

## Estructura del render (reemplaza el `<View>` actual de la rama)
Renderizar (sin ScrollView), en este orden:
1. **Header row** (`position:'relative'`, `overflow:'visible'`): columna de texto a la izquierda (con `paddingRight` ~112 para no chocar con la mascota) + mascota `conLapiz.png` en `position:'absolute'` arriba a la derecha (`pointerEvents="none"`).
   - Pill "✏️  REPASO" (fondo azul marca, texto blanco).
   - Título (`slide.title`) grande, con `MathText`.
   - Subrayado amarillo (una `View` corta, ~130×6, `borderRadius` 3, color amarillo).
   - Subtítulo gris: "Aprenderás paso a paso cómo resolver este ejercicio."
2. **Tarjeta "EJERCICIO A RESOLVER"** (fondo azul muy claro, borde azul suave): fila con label azul + badge `x²` (cuadrito azul claro); instrucción genérica; caja blanca con la expresión (`MathText`, centrada, grande).
3. **Tarjeta "¿Qué aprenderás?"** (fondo azul muy claro): ícono 💡 en círculo azul + título azul + texto.
4. **Tarjeta "¡Tú puedes!"** (fondo verde muy claro): ícono 🎯 en círculo verde + título verde + texto. **Solo si `!SM`** (regla de espacio).

## Estilos sugeridos (agregar al StyleSheet `sum`, prefijo `wei`)
Usar tokens existentes: `palette.azul` (BRAND), `palette.azulClaro`, `palette.blanco`, `palette.bordeClaro`, `palette.verdeXP`, `palette.verde`, `palette.amarilloXP`, `semantic.textPrimary`, `semantic.textSecondary`, `SM`.

```ts
weiHeaderRow:   { position: 'relative', overflow: 'visible', marginBottom: 16, minHeight: 118 },
weiPill:        { alignSelf: 'flex-start', backgroundColor: palette.azul, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12, marginBottom: 10 },
weiPillText:    { fontSize: 12, fontWeight: '800', color: palette.blanco, letterSpacing: 0.5 },
weiTitle:       { fontSize: SM ? 26 : 30, fontWeight: '800', color: semantic.textPrimary, lineHeight: SM ? 30 : 34 },
weiUnderline:   { width: 130, height: 6, borderRadius: 3, backgroundColor: palette.amarilloXP, marginTop: 4, marginBottom: 10 },
weiSubtitle:    { fontSize: 14, color: semantic.textSecondary, lineHeight: 20 },
weiMascot:      { position: 'absolute', right: -10, top: -6, width: 140, height: 140 },

weiExerciseCard:  { backgroundColor: 'rgba(22,119,242,0.06)', borderWidth: 1, borderColor: 'rgba(22,119,242,0.20)', borderRadius: 18, padding: SM ? 14 : 18, marginBottom: 12 },
weiExerciseTop:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
weiExerciseLabel: { fontSize: 12, fontWeight: '800', color: palette.azul, letterSpacing: 0.8 },
weiBadge:         { width: 34, height: 34, borderRadius: 10, backgroundColor: palette.azulClaro, alignItems: 'center', justifyContent: 'center' },
weiBadgeText:     { fontSize: 15, fontWeight: '800', color: palette.azul },
weiInstruction:   { fontSize: 14, color: semantic.textPrimary, marginBottom: 12 },
weiExprBox:       { backgroundColor: palette.blanco, borderRadius: 14, borderWidth: 1, borderColor: palette.bordeClaro, paddingVertical: SM ? 16 : 22, paddingHorizontal: 12, alignItems: 'center' },
weiExpr:          { fontSize: SM ? 22 : 26, fontWeight: '700', color: semantic.textPrimary, textAlign: 'center' },

weiLearnCard:   { flexDirection: 'row', gap: 12, backgroundColor: 'rgba(22,119,242,0.06)', borderRadius: 16, padding: 14, marginBottom: 12 },
weiLearnIcon:   { width: 40, height: 40, borderRadius: 12, backgroundColor: palette.azul, alignItems: 'center', justifyContent: 'center' },
weiLearnTitle:  { fontSize: 14, fontWeight: '800', color: palette.azul, marginBottom: 3 },
weiLearnText:   { fontSize: 13, color: semantic.textPrimary, lineHeight: 19 },

weiCheerCard:   { flexDirection: 'row', gap: 12, backgroundColor: 'rgba(50,215,75,0.10)', borderRadius: 16, padding: 14 },
weiCheerIcon:   { width: 40, height: 40, borderRadius: 12, backgroundColor: palette.verdeXP, alignItems: 'center', justifyContent: 'center' },
weiCheerTitle:  { fontSize: 14, fontWeight: '800', color: palette.verde, marginBottom: 3 },
weiCheerText:   { fontSize: 13, color: semantic.textPrimary, lineHeight: 19 },

weiIconEmoji:   { fontSize: 18 },
```
(Ajustar tamaños/posición de la mascota tras ver en pantalla — es lo más probable de afinar.)

## Criterios de aceptación
1. La pantalla `worked_example_intro` se ve como el mockup: pill, título con subrayado, subtítulo, mascota `conLapiz.png`, tarjeta del ejercicio con el `statement` real (`(x + 6)(x + 4) = ?`), y las tarjetas de aprendizaje/ánimo.
2. **Sin scroll.** Si no cabe todo, se omite la tarjeta "¡Tú puedes!" (regla `!SM`), nunca se hace scroll.
3. Si no hay `worked_example` después, cae al fallback actual sin romperse.
4. NO se modifica la rama `worked_example` (el paso a paso real) ni ningún otro tipo de slide ni el backend.
5. `npx tsc --noEmit` y `npm run lint` sin errores nuevos.

## Assets
- Mascota: `assets/images/conLapiz.png` → `require('@/assets/images/conLapiz.png')`.

## Nota (siguiente iteración, no ahora)
"Resuelve la siguiente expresión:" y "¿Qué aprenderás?" son genéricos en v1. Después se pueden hacer específicos del ejercicio agregando campos al backend (`instruction`, `learningGoal`) por worked_example.
