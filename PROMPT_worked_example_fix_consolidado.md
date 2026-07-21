# Prompt: Que el "paso a paso" (worked_example) salga bien de forma CONSISTENTE

**Contexto probado (no re-diagnosticar):** con el MISMO documento, la sesión a veces muestra el paso a paso con pasos numerados y a veces no. Es **no-determinación de la extracción** de la IA, amplificada por **dos fragilidades independientes** en el código, ambas confirmadas con logs:

1. **Validación estricta (backend):** `[Procedural] 0/1 worked examples validados` — cuando la IA extrae la respuesta como **prosa/unidades** (ej. `answer = "Por lo tanto… es (10x + 24) cm²."`), `resultsMatch` la compara contra el resultado limpio que deriva la IA (`"10x + 24"`) y **falla → `steps: null`** (pantalla sin pasos). Es un **falso negativo**, no un error de razonamiento.
2. **Filtro de redundancia (frontend):** `[Summary] Redundant slide skipped: worked_example — Así se resuelve` — el slide se **descarta entero** cuando su vocabulario se solapa >65% con conceptos previos.

Objetivo: que el paso a paso se muestre bien sin importar cómo la IA extraiga en cada corrida. **Tres partes**, dos backend + una frontend. Aplicar sobre el commit actual (`be55ca9`).

---

## PARTE A — `resultsMatch` tolerante a prosa/unidades (backend, PRIORITARIA, determinista)

Archivo: `backend/src/generation/v2/procedural.ts` (`normalizeForMathComparison`, `sortedTermsKey`, `resultsMatch` ~línea 128).

Estado actual (estricto):
```ts
export function resultsMatch(a, b): boolean {
  if (normalizeForMathComparison(a) === normalizeForMathComparison(b)) return true;
  return sortedTermsKey(a) === sortedTermsKey(b);
}
```

Cambios:
1. Añadir helper `extractMathResult(s: string): string`:
   - Si hay `=`, toma lo que está **después del último `=`** (el resultado final de una cadena; ej. `"…= 10x + 24"` → `"10x + 24"`).
   - Quita prosa envolvente frecuente ("por lo tanto", "la expresión es", "resultado:", "resp:", etc.) y **unidades** al final (`cm²`, `cm2`, `m²`, `m2`, `km`, `mm`, `kg`, `g`, etc.).
   - Si no encuentra nada claro, devuelve el string tal cual.
2. `resultsMatch(a, b)` acepta si CUALQUIERA es verdad (en orden):
   - `normalizeForMathComparison(a) === normalizeForMathComparison(b)` (actual).
   - `sortedTermsKey(a) === sortedTermsKey(b)` (actual).
   - **Nuevo — contención:** con `na = normalize(extractMathResult(a))` y `nb = normalize(extractMathResult(b))` (además quitando paréntesis en la normalización de resultados), si `na.length >= 3` y (`nb.includes(na)` || `na.includes(nb)`), es match. El guard `>= 3` evita falsos positivos triviales (que `"5"` matchee dentro de `"125"`).
3. Tests en `__tests__/procedural.test.ts`:
   - POSITIVO: `resultsMatch("10x + 24", "Por lo tanto, la expresión que representa la diferencia entre las áreas es (10x + 24) cm².") === true`.
   - NEGATIVO (crítico — no aflojar de más): `resultsMatch("10x + 24", "10x + 25") === false`.

## PARTE B — Extracción más limpia (backend, `comprehension.ts`, regla #10 de workedExamples ~líneas 126-147)

Ajustar SOLO el instructivo de `workedExamples` (sin tocar el resto):
1. **`answer` = resultado matemático final limpio.** Hoy dice "copia AMBOS literalmente"; cambiar solo para la respuesta: extraer el **resultado final en notación matemática**, sin la prosa envolvente ("por lo tanto…", "la expresión es…") ni unidades de texto. El `statement` sigue literal. (No inventar: el resultado debe estar en el material; solo se limpia.)
2. **Un ejercicio = un workedExample.** Si un ejercicio tiene derivación encadenada de varias líneas (expandir → restar → simplificar), extraerlo como **UN** workedExample (`statement` = el problema, `answer` = el **resultado final** de la cadena). NO crear un workedExample por cada línea intermedia — esos pasos los genera `procedural.ts`.
3. Añadir un ejemplo ✓/✗ que ilustre exactamente esto.

## PARTE C — Fallback de presentación (backend, `assemble.ts`)

Donde se emiten los slides `worked_example` a partir de `workedExampleResults`:
- **Misión** (`buildSummarySlides`, ~líneas 1108-1125): hoy empuja `worked_example_intro` + un `buildWorkedExampleSummarySlide(result)` por cada resultado.
- **Desafío** (`buildDesafio`, ~línea 476): `workedExampleResults.forEach(... buildWorkedExampleSlide ...)`.

Reglas nuevas (ambos sitios):
1. Si hay ejercicios con `steps` válidos **y** otros con `steps === null`, **preferir los válidos** (filtrar los degradados).
2. Si NINGUNO validó pasos, emitir **como máximo uno** (evitar varias pantallas seguidas "RESUELVE ESTO → RESULTADO" sin camino).
3. En Misión, emitir el `worked_example_intro` **solo si** va a quedar al menos un `worked_example` después de filtrar (no dejar el intro huérfano).

## PARTE D — Excluir worked_example del filtro de redundancia (frontend, `session.tsx`)

Archivo: `app/(main)/modals/session.tsx`, filtro de redundancia (~línea 632).

Actual:
```ts
if (!isInteractive(s) && s.type !== 'mission' && s.type !== 'victory' && s.type !== 'motivation') {
```
Cambiar a (agregar los dos tipos):
```ts
if (!isInteractive(s) && s.type !== 'mission' && s.type !== 'victory' && s.type !== 'motivation'
    && s.type !== 'worked_example' && s.type !== 'worked_example_intro') {
```
Motivo: un ejercicio resuelto es contenido pedagógico propio (un caso concreto), nunca "lo mismo dicho dos veces" aunque comparta vocabulario de álgebra con un concepto previo. Es un cambio de una línea; no toca ninguna otra rama ni estilo.

## Criterios de aceptación

1. Para una respuesta en prosa con unidades (como en el log: `answer = "Por lo tanto… (10x + 24) cm²."`), `resultsMatch` **valida** → la pantalla muestra los **pasos numerados** ("SE REDUCE A"/pasos), no el fallback vacío.
2. `resultsMatch` NO valida resultados genuinamente distintos (test negativo pasa).
3. El slide `worked_example` **ya no se descarta** por redundancia — la advertencia `[Summary] Redundant slide skipped: worked_example…` deja de aparecer al generar esa sesión.
4. No se muestran múltiples pantallas de worked_example sin pasos seguidas; el intro no queda huérfano.
5. Un ejercicio encadenado tiende a extraerse como 1 worked_example.
6. Tests de `procedural.test.ts` (nuevos y existentes) pasan; `npx tsc --noEmit` (backend y app) sin errores nuevos.

## Verificación (importante, dado el historial)
Antes de dar por cerrado, regenerar el MISMO documento 3-4 veces y confirmar en el log de CADA corrida:
- `[Procedural] X/Y worked examples validados` → ahora debe validar (ej. `1/1`) incluso cuando el `answer` extraído sea prosa.
- Que NO aparezca `[Summary] Redundant slide skipped: worked_example…`.
Y capturar log + pantalla de la MISMA generación (no cruzar corridas).

## Orden sugerido
A (recupera los pasos, determinista) → D (evita que el slide se caiga) → C (ordena presentación) → B (mejora la extracción, es prompt de IA, ayuda pero no es determinista). A + D son las que resuelven el 90% del problema.

## Alcance / no romper
- No tocar otros tipos de slide ni el frontend fuera de la línea del filtro.
- Desafío y Misión: aplicar C en ambos sitios de emisión.
- No revertir nada: son fixes hacia adelante sobre `be55ca9`.
