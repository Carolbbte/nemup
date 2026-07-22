# Prompt: Pasos del "paso a paso" más breves (procedural.ts)

**Objetivo:** que cada paso del worked_example sea **corto y directo** — pensado para un adolescente (14-18) que no quiere leer textos largos — pero **suficientemente claro**. Breve ≠ críptico: una idea por paso, en lenguaje simple, mostrando la operación concreta cuando aplica.

**Solo BACKEND, solo las instrucciones de generación en `backend/src/generation/v2/procedural.ts`.** No tocar la lógica (`reconcileWorkedExample`, `resultsMatch`, `buildWorkedExampleSteps`), ni el frontend. Es un ajuste de prompt: afecta las próximas generaciones.

## Contexto (verificado)
- `SYSTEM_PROMPT` (~línea 23): describe el rol del tutor y pide "pasos cortos que un estudiante de enseñanza media pueda seguir".
- `buildUserPrompt` (~línea 33), INSTRUCCIÓN 1 (~línea 40): "escribe entre 2 y 5 pasos explicativos cortos...".
- `buildProceduralSchema` (~línea 60): el campo `steps` tiene `minItems: 2, maxItems: 5` y `description: 'Short explanatory steps connecting the statement to the answer.'`.

## Cambios pedidos

### 1. Instrucción de longitud y estilo (en `buildUserPrompt`, instrucción 1)
Reemplazar/ampliar la instrucción 1 para que cada paso cumpla:
- **Máximo ~12 palabras por paso** (idealmente cabe en 1 línea, nunca más de 2).
- **Una sola idea por paso.** Si un paso tiene dos ideas, sepáralo o recórtalo.
- **Muestra la operación concreta**, no la describas en prosa larga. Ej.: preferir `"Multiplica: x·x + x·4 + 6·x + 6·4"` en vez de `"Aplica la propiedad distributiva multiplicando x por x, x por 4, 6 por x y 6 por 4"`.
- **Tono para adolescente:** claro, simple y directo. Sin relleno ("como podemos ver", "es importante notar que…"), sin jerga innecesaria, pero sin ser infantil.
- Mantener entre **2 y 4 pasos** (bajar el máximo de 5 a 4 — pocos y potentes; ver punto 3).

### 2. Ajustar el `SYSTEM_PROMPT`
Añadir una línea al `SYSTEM_PROMPT` reforzando la brevedad: los pasos son **telegráficos pero claros**, una idea cada uno, mostrando la operación; el estudiante debe poder leerlos de un vistazo. No cambiar el resto (sigue tomando la respuesta dada como correcta, sigue prohibido LaTeX, etc.).

### 3. Schema: bajar el máximo de pasos
En `buildProceduralSchema`, cambiar `steps` a `maxItems: 4` (mantener `minItems: 2`) y actualizar su `description` a algo como: `'Very short steps (max ~12 words each, one idea per step) showing the concrete operation from statement to answer.'`

### 4. Añadir ejemplos ✓/✗ en el user prompt
Incluir un ejemplo para anclar el estilo, p. ej.:
- ✓ BREVE: "Multiplica los binomios: x² + 4x + 6x + 24." / "Suma los semejantes: 4x + 6x = 10x." / "Resta x²: se cancelan, queda 10x + 24."
- ✗ LARGO (evitar): "Aplica la propiedad distributiva para multiplicar (x + 6)(x + 4): multiplica x por x, x por 4, 6 por x y 6 por 4, obteniendo así la suma de los productos."

## Reglas / no romper
- No cambiar la validación: el `resultShown` sigue siendo el resultado que la IA deriva, y `resultsMatch` sigue igual (la brevedad de los pasos no afecta la validación).
- No inventar ni alterar el resultado final (`answer`) — solo cambia cómo se REDACTAN los pasos intermedios.
- Notación en texto plano, nunca LaTeX (ya está en el SYSTEM_PROMPT).

## Criterios de aceptación
1. Los pasos generados son **cortos** (≤ ~12 palabras, 1-2 líneas máx) y **claros**, con la operación concreta visible.
2. Hay entre 2 y 4 pasos por ejercicio.
3. En la pantalla "Así se resuelve", los pasos caben cómodamente (se refuerza el objetivo de no-scroll que ya trabajamos en el frontend).
4. Sigue validando (`[Procedural] X/Y worked examples validados`) — la brevedad no rompe la validación.
5. `npx tsc --noEmit` del backend sin errores; tests existentes de `procedural.test.ts` pasan.

## Verificación
Regenerar el mismo documento 2-3 veces y confirmar en el log (`[Procedural-User]`/respuesta) que los pasos son breves, y en pantalla que caben sin scroll. Capturar log + pantalla de la misma corrida.
