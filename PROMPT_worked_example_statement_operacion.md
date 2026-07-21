# Prompt: El "paso a paso" debe partir de una OPERACIÓN concreta, no de la pregunta del enunciado

**Contexto:** el fix anterior dejó el paso a paso consistente y validando (bien, NO revertir). Pero ahora extrae como `statement` la **pregunta en lenguaje natural** del ejercicio (ej. "¿Qué expresión representa la diferencia entre las áreas…?") y `procedural.ts` genera pasos genéricos ("Identifica las expresiones…", "Calcula el área…") en vez de **álgebra concreta**. NemUp necesita: tomar una **operación/expresión matemática concreta** y mostrar cómo resolverla paso a paso (como el caso bueno: `statement = "(x + 6)(x + 4)"`, pasos de expandir/multiplicar/simplificar, `answer = "x² + 10x + 24"`).

**Causa exacta:** en `backend/src/generation/v2/comprehension.ts`, la instrucción #10 de `workedExamples` (el ejemplo de "cadena de varias líneas", ~líneas 145-172) instruye explícitamente `statement =` la **pregunta** ("el enunciado original de la pregunta, no la primera línea de la derivación"). Eso hay que invertirlo.

**Solo BACKEND, solo la regla #10 de `comprehension.ts`.** No tocar `procedural.ts`, `resultsMatch`, el fallback de `assemble.ts` ni el frontend — todo eso quedó bien.

## Cambio pedido

En la instrucción #10 de `workedExamples` (`comprehension.ts`):

1. **Definición de `statement`:** debe ser una **operación o expresión matemática CONCRETA a resolver, en notación matemática** (ej. `(x + 6)(x + 4) − x²`, `2m − 5n + 6m − m + 11n`), construida con las expresiones que da el material — **NUNCA** una pregunta en lenguaje natural ("¿Qué expresión…?", "¿Cuál es el área…?").
   - Si el ejercicio está planteado como problema con palabras pero su solución es una derivación algebraica, el `statement` es la **operación que la derivación ejecuta** (usando las expresiones concretas del material), no la pregunta.
   - `answer` sigue igual: el **resultado matemático final limpio** (sin prosa ni unidades), como ya quedó.

2. **Corregir el ejemplo de la cadena de áreas** (el que hoy dice `statement = "¿Qué expresión…?"`). Debe pasar a:
   - `statement = "(x + 6)(x + 4) − x²"` (la operación concreta: área del rectángulo menos área del cuadrado, con las expresiones del material) — o, si se prefiere la sub-operación que el material muestra explícita, `statement = "(x + 6)(x + 4)"`.
   - `answer = "10x + 24"` (respectivamente `"x² + 10x + 24"` si se usó la sub-operación).
   - Marcar explícitamente como **INVÁLIDO**: `statement =` la pregunta en lenguaje natural ("¿Qué expresión representa la diferencia entre las áreas…?"). Hoy el ejemplo dice lo contrario — invertirlo.

3. **Regla general a agregar (una frase):** "El `statement` es SIEMPRE una expresión/operación matemática para resolver, nunca una pregunta redactada en palabras. Si el ejercicio viene como pregunta, tradúcelo a la operación concreta usando las expresiones que el propio material entrega (sin inventar valores)."

4. Mantener intacto todo lo demás de la regla #10 (un ejercicio = un workedExample, no fragmentar la cadena, answer limpio, no incluir ejercicios sin respuesta escrita, etc.).

## Criterios de aceptación

1. Para el material de las áreas, el paso a paso muestra `statement` = una **operación algebraica** (ej. `(x + 6)(x + 4) − x²` o `(x + 6)(x + 4)`), NO la pregunta "¿Qué expresión…?".
2. Los pasos generados son de **álgebra concreta** (expandir binomio, multiplicar términos, agrupar semejantes, simplificar), como en la imagen de referencia — no pasos genéricos de "identifica/calcula/resta el área".
3. Sigue validando (`[Procedural] 1/1 worked examples validados`) y sigue siendo un solo worked_example (no fragmentado).
4. `npx tsc --noEmit` del backend sin errores nuevos; tests existentes pasan.

## Verificación
Regenerar el mismo documento 2-3 veces y confirmar en el log (`[Comprehension]`/`[Procedural-User]`) que el `statement` extraído es la operación matemática, no la pregunta; y capturar la pantalla del paso a paso de esa misma corrida.

## Nota honesta
Este comportamiento vino del ejemplo que se agregó en el fix anterior (instruía `statement` = la pregunta). Es un ajuste de una instrucción, de bajo riesgo. Como la extracción ahora es estable, corregir el ejemplo debería reorientarla de forma consistente hacia la operación concreta.
