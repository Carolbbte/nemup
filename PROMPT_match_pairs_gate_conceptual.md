# Prompt: Excluir el ejercicio "Relaciona" (match_pairs) del material PROCEDIMENTAL

**Objetivo:** que el ejercicio `match_pairs` ("Relaciona cada concepto con su ejemplo") se genere para material **conceptual y de memorización** (donde es un buen calce), pero NO para material **procedimental** (matemáticas, ejercicios). En contenido procedimental el par se vuelve forzado (nombre de procedimiento ↔ expresión algebraica), las etiquetas se cortan, y no ejercita la habilidad real (operar). El material procedimental debe apoyarse en las actividades de ejercicio que ya existen (ejemplo resuelto, fill_blank, quiz).

Regla resumida: **permitir** match_pairs para CONCEPTUAL, MEMORIZATION y MIXED de predominio conceptual; **excluir** solo PROCEDURAL y MIXED de predominio procedimental. (MEMORIZATION es de hecho un uso ideal de match_pairs: término↔definición, palabra↔significado.)

**Todo el cambio es de BACKEND.** No tocar el frontend.

## Contexto verificado en el código

- El clasificador pedagógico ya existe: `backend/src/services/pedagogicalClassifier.ts`, `classifyContent()` devuelve `{ type: 'CONCEPTUAL' | 'PROCEDURAL' | 'MEMORIZATION' | 'MIXED', scores: { conceptual, procedural, memorization }, ... }`.
- En `backend/src/generation/v2/orchestrator.ts`:
  - Línea ~94: `const classification = classifyContent(transcription)` — YA se calcula.
  - Hoy `classification` **solo** se guarda en `metadata.pedagogicalType` para analytics (ver comentario ~líneas 21-24: "su resultado nunca afecta la generación"). Hay que usarla para condicionar match_pairs.
  - Línea ~105: llama `buildSummarySlides(ko, distractors, workedExampleResults, exercises, appConfig.mission_arc_v2, appConfig.mission_shorten)` (flujo **Misión**).
  - Línea ~127: llama `buildDesafio(ko, distractors, workedExampleResults)` (flujo **Desafío**).
- En `backend/src/generation/v2/assemble.ts`:
  - Flujo Misión: `buildSummarySlides` (~línea 756) llama `buildMisionMatchPairs(ko.concepts)` (~línea 852); el slide se inyecta como `type: 'match_pairs'` (~línea 1005).
  - Flujo Desafío: `buildDesafio` (~línea 433) llama `buildMatchPairs(ko)` (~línea 447) e inyecta `interactionType: 'match_pairs'` (~línea 480).

## Cambios pedidos

### 1. Definir la regla de "permitir match_pairs"
En `orchestrator.ts`, después de calcular `classification` (~línea 94), derivar un booleano:

```ts
const s = classification.scores;
const allowMatchPairs =
  classification.type === 'CONCEPTUAL' ||
  classification.type === 'MEMORIZATION' ||
  (classification.type === 'MIXED' && s.conceptual >= s.procedural);
// PROCEDURAL y MIXED con predominio procedimental → NO match_pairs.
```

(El umbral es ajustable; la intención es: excluir contenido procedimental/matemático.)

Loguear la decisión para poder auditarla, p. ej.:
`console.log('[match_pairs gate] type=%s allow=%s', classification.type, allowMatchPairs);`

### 2. Pasar el flag a los dos generadores
- `buildSummarySlides(...)`: agregar un parámetro `allowMatchPairs: boolean` (al final, con default `true` para no romper llamadas/tests existentes) y pasarlo desde orchestrator (línea ~105).
- `buildDesafio(...)`: mismo parámetro `allowMatchPairs: boolean` (default `true`), pasado desde orchestrator (línea ~127).

### 3. Aplicar el gate donde se construye match_pairs
- En `buildSummarySlides` (assemble.ts ~852):
  ```ts
  const matchPairsResult = allowMatchPairs ? buildMisionMatchPairs(ko.concepts) : null;
  ```
  Al ser `null`, la inyección del slide `match_pairs` (~línea 1005, gated por `matchPairsConceptId`) se salta sola. Verificar que nada más asuma que siempre existe.
- En `buildDesafio` (assemble.ts ~447):
  ```ts
  const matchPairs = allowMatchPairs ? buildMatchPairs(ko) : null;
  ```
  Y confirmar que la inyección en ~línea 480 solo ocurre si `matchPairs` no es null (ya está gated por `if (matchPairs && ...)`).

### 4. Nada más debe cambiar
- No modificar `buildMatchPairs`/`buildMisionMatchPairs` en sí.
- No tocar el frontend (el render de match_pairs se mantiene; simplemente dejará de recibir ese slide cuando el contenido sea procedimental).
- Los demás formatos (concepto, quiz, fill_blank, ejemplo resuelto, classify) siguen igual — el material procedimental ya queda cubierto por ellos.

## Criterios de aceptación

1. Al subir material **procedimental/matemático** (clasificado PROCEDURAL, o MIXED con predominio procedimental), la sesión **no** incluye el slide "Relaciona" (match_pairs) ni en Misión ni en Desafío.
2. Al subir material **conceptual** (CONCEPTUAL/MEMORIZATION, o MIXED conceptual), match_pairs **sigue apareciendo** como hasta ahora.
3. Existe un log que muestra `type` y la decisión `allow`, para auditar clasificaciones dudosas.
4. Las llamadas/tests existentes siguen compilando (el nuevo parámetro tiene default `true`).
5. `npx tsc --noEmit` y los tests del backend (si existen para assemble/orchestrator) pasan sin errores nuevos.

## Nota / opción
- Si más adelante quieren conservar match_pairs para algún caso matemático puntual (p. ej. fórmula ↔ nombre, término ↔ símbolo), se puede afinar la regla; pero por defecto conviene excluir procedimental para evitar el desajuste actual (etiquetas largas que se cortan y emparejamiento poco pedagógico).
- El mismo criterio podría aplicarse a `classify` si también resulta forzado en matemáticas — evaluarlo por separado.
