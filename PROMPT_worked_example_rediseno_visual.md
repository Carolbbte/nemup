# Prompt: Rediseño VISUAL (no interactivo) de la pantalla "Así se resuelve" (worked_example)

**Objetivo:** dejar la pantalla del paso a paso (`worked_example`) con el look del mockup adjunto — mascota + burbuja, tarjeta "TU DESAFÍO" con el ejercicio, barra de pista con "N pasos", los pasos como tarjetas con círculos numerados de colores, y una barra de ánimo verde — **manteniendo el contenido y comportamiento actuales**: sigue siendo **pasiva** (los pasos se muestran en su orden correcto, NO se arrastran ni se ordenan), el título sigue siendo **"Así se resuelve"**, y el botón sigue siendo **"Siguiente →"** (NO "Comprobar orden"). También se mantiene el recuadro del **resultado final** ("SE REDUCE A"/resultado).

**Solo FRONTEND, y SOLO la rama `slide?.type === 'worked_example'`** en `app/(main)/modals/session.tsx` (~línea 2889). ⚠️ NO tocar la rama `slide?.type === 'worked_example_intro'` (la intro, justo arriba, que ya quedó rediseñada). Identificar la rama correcta por el marcador `slide?.type === 'worked_example'` y su header actual "PASO A PASO / Así se resuelve".

## Contexto del código (verificado)
- La rama actual renderiza: header (`weIconBox` con ícono `WandSparkles` + kicker "PASO A PASO" + `weTitle` "Así se resuelve"), un `weProblemBox` oscuro con label "RESUELVE ESTO" + `slide.statement`, los pasos (`slide.steps`, cada uno en `weStepRow` con `weStepCircle` numerado + `weStepContent`), y un `weResultBox` con "SE REDUCE A"/"RESULTADO" + `slide.answer`.
- Estilos existentes a reutilizar/extender: `weHeaderRow, weIconBox, weKicker, weTitle, weProblemBox, weProblemLabel, weProblemText, weStepsContainer, weStepRow, weStepCircle, weStepCircleText, weStepContent, weResultBox, weResultLabel, weResultText` (~líneas 5729-5744).
- `slide.steps?.length` da el número de pasos para el badge "N pasos".

## Cambios de diseño (todos manteniendo el contenido actual)

1. **Envolver la rama en un `ScrollView`** (como hace la rama `match_pairs`), porque con las tarjetas nuevas el contenido puede exceder el alto. Sin cambiar el botón inferior (queda fijo como hoy).

2. **Header:** mantener kicker "PASO A PASO" + ícono `WandSparkles` + título **"Así se resuelve"**. Agregar un **subtítulo** gris debajo: "Sigue cada paso para llegar a la solución." Opcional: **mascota + burbuja** arriba a la derecha (ver punto 7).

3. **Tarjeta "TU DESAFÍO"** (reemplaza el look del `weProblemBox` oscuro por el del mockup): fondo **lila/morado muy claro**, borde morado suave, label **"TU DESAFÍO"** en morado, el `slide.statement` grande y centrado (con `MathText`), y un **badge `x²`** (cuadrito morado claro) arriba a la derecha. (Si el statement no termina en "= ?", mostrarlo tal cual; no recalcular nada.)

4. **Barra de pista** (debajo de la tarjeta del desafío): fondo azul muy claro, 💡 + texto **"Estos son los pasos para llegar a la solución."** + un badge a la derecha con **`${slide.steps?.length} pasos`**. (Omitir la barra si `slide.steps` está vacío.)

5. **Pasos como tarjetas** (reemplaza `weStepRow` simple): cada paso en su **propia tarjeta blanca** (borde suave, sombra leve), con un **círculo numerado de color que cicla por paso** + el texto del paso (`MathText`). NO agregar manijas de arrastre ni íconos de "drag" (la pantalla es pasiva; no debe insinuar interacción). Colores por paso, ciclando (usar tokens existentes), por ejemplo:
   `const STEP_COLORS = [palette.verde, palette.azul, /* morado */ paletteExtras.moradoBorde-o-similar, palette.ambar ?? palette.naranja, palette.rosaQuiz];`
   El círculo usa el color del índice `i % STEP_COLORS.length`, número en blanco.

6. **Barra de ánimo** (verde, al final, antes del botón): fondo verde muy claro, 🏆 + **"¡Tú puedes! Cada paso te acerca a la respuesta correcta."** + un ícono de estrella (`Star` de lucide, contorno verde). Es fija/genérica.

7. **Mascota + burbuja:** arriba a la derecha del header, la mascota **`assets/images/iluminado.png`** con burbuja **"¡Tú puedes! Cada paso te acerca a la solución 💪"** (`require('@/assets/images/iluminado.png')`). Reutilizar el patrón de mascota+burbuja que ya existe (estilos `mpMascot*`/`weiMascot`), compacto y sin empujar el layout (misma lógica de posición/tamaño que ya se afinó en la intro). Ajustar tamaño/posición tras ver en pantalla — es lo más probable de afinar.

8. **Mantener el recuadro del resultado** (`weResultBox` con "SE REDUCE A"/`slide.answer`) tal como está — es la solución final de la demostración.

9. **Botón inferior:** sigue siendo **"Siguiente →"** (no cambiar a "Comprobar orden").

## Reglas / no romper
- La pantalla sigue siendo **pasiva**: no hay reordenamiento, ni drag, ni validación, ni estado nuevo. Solo estilos + estructura.
- Los pasos se muestran en el **orden correcto** que ya trae `slide.steps` (no barajar).
- No tocar `worked_example_intro`, ni otros tipos de slide, ni el backend.
- Reutilizar tokens de `palette`/`paletteExtras`/`semantic` existentes; no inventar hex nuevos salvo los `rgba(...)` de fondos suaves.

## Criterios de aceptación
1. La pantalla `worked_example` se ve como el mockup (header con wand + "Así se resuelve", tarjeta "TU DESAFÍO", barra de pista con "N pasos", pasos en tarjetas con círculos de colores, barra de ánimo verde), **sin manijas de arrastre**.
2. Sigue siendo pasiva: los pasos están en orden, el botón dice "Siguiente →", y se muestra el resultado final.
3. Si un `worked_example` viene sin `steps` (fallback), la pantalla no se rompe (muestra statement + resultado, sin la lista de pasos ni la barra "N pasos").
4. No se modifica `worked_example_intro` ni el backend.
5. `npx tsc --noEmit` y `npm run lint` sin errores nuevos.

## Nota (siguiente fase, no ahora)
Cuando esta versión fija esté aprobada, se puede evaluar la variante interactiva (ordenar los pasos). Ahí conviene reutilizar el tipo `order_sequence` que ya existe (interacción por toque) antes que construir drag-and-drop desde cero. Pero eso es una fase aparte.
