# Prompt: Darle vida a la pantalla intro del ejemplo resuelto (worked_example_intro)

**Síntoma:** el slide `worked_example_intro` de la Misión ("Veamos cómo se resuelve") se ve muy vacío: solo muestra un ícono, el kicker "REPASO", el título y una frase genérica ("Estos son ejercicios resueltos paso a paso del material."). El ejercicio concreto está recién en el slide siguiente.

**Objetivo:** que la pantalla intro (a) muestre un **preview del ejercicio** que se resolverá (el `statement` del `worked_example` que viene después), y (b) incorpore la **mascota con una burbuja** para darle calidez, sin quedar plana.

**Solo frontend.** Todo el cambio va en `app/(main)/modals/session.tsx`, dentro de la rama `slide?.type === 'worked_example_intro'` (aprox. líneas 2805–2821). No tocar el backend ni otros tipos de slide.

## Contexto verificado en el código

- Render actual del intro (`session.tsx` ~2805–2821): `<View sum.conceptTarjeta>` con `conceptIconBox` (emoji), kicker "REPASO", `conceptTitle` (slide.title) y, si existe, `conceptCard` con `slide.definition` (la frase genérica).
- El ejercicio real está en el slide siguiente de tipo `worked_example` (~2822+): tiene `slide.statement` (el enunciado), `slide.steps` y `slide.answer`.
- El array de slides construidos es `missionSlides` y el índice actual es `summaryIdx` (ver `const [missionSlides, setMissionSlides]` y su uso en el map de render). Así que se puede mirar hacia adelante: `missionSlides[summaryIdx + 1]`, etc.
- Para renderizar fórmulas ya se usa `MathText` (importado). El intro debe usar `MathText` para el statement (puede traer notación matemática).
- La app ya tiene patrón de mascota + burbuja (ver estilos `sum.mpMascotRow` / `sum.mpMascotBubble` / `sum.mpMascotBubbleTail` / `sum.mpMascotImg` usados en el slide `match_pairs`, y `sum.feedbackRow`/`sum.motivMascot`). Reutilizar ese lenguaje visual, no inventar uno nuevo.
- Assets de mascota disponibles en `assets/images/`: `enfocado.png` (pose concentrada, ideal para "resolver"), `tuPuedes.png`, `tip.png`, `lupa.png`, `pensativo.png`.

## Cambios pedidos (dentro de la rama worked_example_intro)

### 1. Preview del ejercicio que viene
- Buscar hacia adelante el próximo slide `worked_example` y tomar su `statement`:
  ```ts
  const nextWorked = missionSlides.slice(summaryIdx + 1).find(s => s.type === 'worked_example');
  const previewStatement = nextWorked?.statement;
  ```
- Si `previewStatement` existe, mostrar una **tarjeta destacada** con una etiqueta tipo "EL EJERCICIO QUE RESOLVERÁS" y el statement renderizado con `<MathText>`. Estilo: caja con fondo suave y borde (puede reutilizar/derivar de `sum.conceptCard` o de `sum.weProblemBox` del worked_example para consistencia visual con la pantalla siguiente).
- Si NO se encuentra un `worked_example` siguiente (caso borde), mantener el comportamiento actual (mostrar `slide.definition` como hoy) para no romper nada.

### 2. Mascota + burbuja
- Agregar la mascota `enfocado.png` con una burbuja corta y motivadora, guiando la atención hacia el ejercicio, p. ej.: «**Míralo primero.** En la próxima lo resolvemos juntos, paso a paso 👇».
- Reutilizar el patrón/estilos de mascota+burbuja ya existentes (los `sum.mpMascot*`), ajustando tamaño/posición para que quede compacto y no empuje el layout (misma lógica de mascota que ya se afinó en match_pairs: imagen compacta, burbuja con `maxWidth`, sin dejar franja vacía).

### 3. (Opcional, barato) Chip de contexto
- Un pequeño badge tipo "🪜 Paso a paso" o el conteo de ejercicios (cuántos `worked_example` vienen) para que se sienta estructurado. Solo si es rápido.

### 4. (Opcional) Micro-animación de entrada
- Una entrada suave (fade/slide) del preview + mascota, consistente con el resto de la Misión (reanimated ya está en uso). Solo si es rápido.

## Criterios de aceptación

1. La pantalla `worked_example_intro` muestra el **enunciado del ejercicio siguiente** (con `MathText`), no solo la frase genérica.
2. Aparece la **mascota `enfocado.png` con burbuja**, compacta, sin dejar la pantalla vacía ni empujar el layout.
3. Si por algún motivo no hay un `worked_example` después, la pantalla cae al comportamiento actual sin romperse.
4. No cambia ningún otro tipo de slide ni el backend.
5. `npx tsc --noEmit` y `npm run lint` sin errores nuevos.
6. Verificado en dispositivo Android: la pantalla ya no se ve vacía y el preview coincide con el ejercicio de la pantalla siguiente.

## Nota
El statement se toma tal cual del slide siguiente (no recalcular ni resumir). Es un preview de solo lectura; la resolución paso a paso sigue ocurriendo en el slide `worked_example` como hasta ahora.
