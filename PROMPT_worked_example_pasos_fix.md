# Prompt: Arreglar el "paso a paso" (worked_example) que sale sin pasos y fragmentado

**Síntoma:** en material procedimental (matemáticas), la pantalla "Así se resuelve" (worked_example) a veces aparece (a) **fragmentada en 2 pantallas** y (b) **sin los pasos numerados**, mostrando solo "RESUELVE ESTO → RESULTADO".

**Causa raíz (verificada en el código):** en `backend/src/generation/v2/procedural.ts`, `reconcileWorkedExample` guarda los pasos solo si `resultsMatch(modelResult, example.answer)` es `true`; si no, cae a `steps: null` (pantalla degradada). Cuando la respuesta extraída viene como **frase/prosa con unidades** (ej. `answer = "Por lo tanto, la expresión ... es (10x + 24) cm²."`), `resultsMatch` la compara string-contra-string contra el resultado limpio que derivó la IA (`"10x + 24"`) y **falla → descarta pasos correctos**. Es un **falso negativo de validación**, no un error de razonamiento. Además `comprehension.ts` a veces fragmenta un ejercicio encadenado en 2 `workedExamples`.

**Solo BACKEND.** No tocar el frontend.

## Parte A — `resultsMatch` más tolerante (PRIORITARIA, determinista, bajo riesgo)

Archivo: `backend/src/generation/v2/procedural.ts` (funciones `normalizeForMathComparison`, `sortedTermsKey`, `resultsMatch`).

Objetivo: que un resultado matemático limpio (`"10x + 24"`) valide contra una respuesta envuelta en prosa/unidades (`"...es (10x + 24) cm²."`), sin volverse un CAS ni aceptar cualquier cosa.

Cambios:
1. En `normalizeForMathComparison`, además de lo actual (espacios, minúsculas, `−×·`→ASCII), **quitar paréntesis** `()` y **unidades comunes** al comparar resultados (`cm2`, `cm²`, `m2`, `m²`, `km`, `mm`, `kg`, `g`, `s`, etc. — solo como sufijos de unidad, no letras de variables). Mantener esta normalización SOLO para comparación de resultados (no alterar los textos que se muestran).
2. Añadir un helper `extractMathResult(s: string): string` que:
   - Si hay uno o más `=`, toma **lo que está después del último `=`** (el resultado final de una cadena, ej. `"...x² = 10x + 24"` → `"10x + 24"`).
   - Quita prosa envolvente: recorta frases tipo "por lo tanto", "la expresión es", "resultado:", etc., y unidades finales.
   - Devuelve la subexpresión matemática resultante (si no encuentra nada claro, devuelve el string normalizado tal cual).
3. Reescribir `resultsMatch(a, b)` para aceptar si **cualquiera** de estas es verdad (en este orden):
   - `normalize(a) === normalize(b)` (actual).
   - `sortedTermsKey(a) === sortedTermsKey(b)` (actual, reordenamiento aditivo).
   - **Nuevo — contención:** con `na = normalize(extractMathResult(a))` y `nb = normalize(extractMathResult(b))`, si `na.length >= 3` y (`nb.includes(na)` o `na.includes(nb)`), es match. Esto captura el caso "resultado limpio dentro de respuesta en prosa/con unidades".
   - El guard `length >= 3` evita falsos positivos triviales (que `"5"` aparezca dentro de `"125"`).

Actualizar/añadir tests en `backend/src/generation/v2/__tests__/procedural.test.ts` para: `resultsMatch("10x + 24", "Por lo tanto, la expresión que representa la diferencia entre las áreas es (10x + 24) cm².") === true`; y casos negativos (que NO valide resultados realmente distintos, p. ej. `"10x + 24"` vs `"10x + 25"`).

## Parte B — Extracción más limpia (`comprehension.ts`, instrucción #10 de workedExamples)

Archivo: `backend/src/generation/v2/comprehension.ts` (regla 10, ~líneas 126–147).

Ajustar el instructivo de `workedExamples` (sin romper el resto) para:
1. **Answer = resultado matemático final limpio.** Hoy dice "copia AMBOS literalmente". Cambiar SOLO para la respuesta: extraer el **resultado final en notación matemática**, sin la prosa envolvente ("por lo tanto…", "la expresión es…") ni unidades de texto redundantes. El `statement` sigue literal. (No inventar ni recalcular: el resultado debe estar en el material; solo se limpia de prosa.)
2. **Un ejercicio = un workedExample.** Si un ejercicio tiene una derivación encadenada de varias líneas (ej. expandir binomio → restar → simplificar), extraerlo como **UN** workedExample: `statement` = el problema original, `answer` = el **resultado final** de toda la cadena. NO crear un workedExample por cada línea/paso intermedio (esos pasos los genera `procedural.ts`).
3. Añadir un ejemplo ✓/✗ en el prompt que ilustre exactamente esto (cadena de varias líneas → 1 solo workedExample con el resultado final limpio).

## Parte C — Fallback de presentación (opcional, robustez)

Archivo: `backend/src/generation/v2/assemble.ts` (donde se crean los slides `worked_example` a partir de `workedExampleResults`, tanto en `buildDesafio` como en `buildSummarySlides`).

- Si tras la validación hay ejercicios con `steps === null` **y** hay al menos uno con pasos válidos, **preferir mostrar los que tienen pasos** (filtrar los degradados).
- Si NINGUNO validó pasos, mostrar **como máximo uno** (evitar 2+ pantallas seguidas "RESUELVE ESTO → RESULTADO" sin camino).
- No cambiar el frontend; solo qué slides se emiten.

## Criterios de aceptación

1. Para el caso de tus screenshots (respuesta en prosa con unidades), `resultsMatch` **valida** y la pantalla muestra los **pasos numerados** ("SE REDUCE A"/pasos), no el fallback vacío.
2. `resultsMatch` NO valida resultados genuinamente distintos (hay test negativo que lo prueba).
3. Un ejercicio con derivación encadenada tiende a extraerse como **1** worked_example (no 2+ pantallas).
4. No se muestran múltiples pantallas de worked_example sin pasos seguidas.
5. Los tests de `procedural.test.ts` (nuevos y existentes) pasan; `npx tsc --noEmit` en backend sin errores nuevos.
6. No se toca el frontend ni otros formatos de slide.

## Orden sugerido
Aplicar **Parte A primero** (es la que recupera los pasos y es determinista), verificar regenerando el mismo documento, y luego B y C. Nota honesta: A es código puro y confiable; B depende de una llamada de IA, así que reduce pero no elimina al 100% la variabilidad de fragmentación — por eso A + C la compensan.
