# Prompt: Corregir la granularidad de los pasos (breves, pero uno por transformación)

**Problema:** el ajuste anterior hizo los pasos breves PERO también redujo la cantidad (de 5 a 3), fusionando transformaciones distintas. Eso quita valor educativo: p. ej., colapsa la multiplicación término a término en un solo resultado y el estudiante no ve el "cómo". La brevedad debe ser **por paso (redacción corta)**, NO menos pasos.

**Principio:** el número de pasos lo determina el ejercicio — **un paso por cada transformación matemática real** — y cada paso se redacta corto. No fusionar operaciones distintas para tener menos pasos.

**Solo BACKEND, solo instrucciones de generación en `backend/src/generation/v2/procedural.ts`.** No tocar lógica ni validación.

## Cambios pedidos

### 1. Schema (`buildProceduralSchema`): revertir el tope
- Volver a `maxItems: 5` (mantener `minItems: 2`). Idealmente permitir hasta **6** si el ejercicio lo requiere. El objetivo es que la cantidad de pasos refleje las transformaciones reales, no un tope artificial.
- Actualizar la `description` de `steps` a: `'One short step per real math transformation (max ~12 words each). Do NOT merge distinct operations to reduce the count — brevity is per step, not fewer steps.'`

### 2. Instrucción en `buildUserPrompt` (instrucción 1)
Reemplazar para que quede claro el doble criterio:
- **Un paso por cada transformación matemática distinta.** No fusiones dos operaciones en un paso para acortar la lista.
- **Cada paso corto:** máximo ~12 palabras, una idea, mostrando la operación concreta.
- Para expansiones/distributiva, la **multiplicación término a término es su propio paso**, mostrándola explícitamente. Ej.: `"Multiplica cada término: x·x + x·4 + 6·x + 6·4"` como un paso, y `"Suma: x² + 4x + 6x + 24"` como el siguiente — no colapsarlos en "Multiplica los binomios: x² + 4x + 6x + 24".
- Tono adolescente: claro y directo, sin relleno.

### 3. `SYSTEM_PROMPT`
Ajustar la línea de brevedad para que NO empuje a reducir la cantidad: los pasos son **cortos en redacción, uno por transformación real**; el estudiante debe poder seguir CADA transformación (incluida la multiplicación término a término), no solo el resultado. Mantener el resto igual (respuesta dada = correcta, prohibido LaTeX, etc.).

### 4. Ejemplos ✓/✗ (en el user prompt)
- ✓ GRANULAR Y BREVE (5 pasos, cada uno corto):
  1. "Reconoce que (x+6)(x+4) es un producto de binomios."
  2. "Multiplica cada término: x·x + x·4 + 6·x + 6·4."
  3. "Escríbelo: x² + 4x + 6x + 24."
  4. "Suma los semejantes: 4x + 6x = 10x."
  5. "Resta x²: se cancela, queda 10x + 24."
- ✗ MUY COLAPSADO (evitar): "Multiplica los binomios: x² + 4x + 6x + 24." (fusiona la multiplicación término a término con su resultado — se pierde el "cómo").
- ✗ MUY LARGO (evitar): un párrafo por paso.

## Criterios de aceptación
1. El número de pasos refleja las transformaciones reales del ejercicio (típicamente 4-6 para estos casos), no un tope de 3-4.
2. Cada paso es **corto** (≤ ~12 palabras) y muestra la operación concreta.
3. La multiplicación término a término (en expansiones) aparece como su **propio paso**, visible.
4. Sigue validando (`[Procedural] X/Y validados`); brevedad/granularidad no afectan la validación.
5. En pantalla, los pasos cortos siguen cabiendo cómodamente con el layout compacto ya hecho (idealmente sin scroll; si un ejercicio da 6 pasos y roza el scroll, es aceptable — la claridad manda).
6. `npx tsc --noEmit` del backend sin errores; tests de `procedural.test.ts` pasan.

## Verificación
Regenerar el mismo documento 2-3 veces y confirmar en el log (`[Procedural-User]`/respuesta) que hay ~5 pasos cortos y que la multiplicación término a término aparece como paso propio. Capturar log + pantalla de la misma corrida.
