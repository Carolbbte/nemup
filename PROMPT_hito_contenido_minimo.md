# PROMPT — Hito de contenido mínimo (un concepto real, a mano)

> No es una fase del esqueleto (ese está completo). Es el hito que permite
> **probar la experiencia con contenido real** ante estudiantes, sin construir
> aún el pipeline de backend. Mapa arquitectónico en `PROMPT_motor_integracion.md`.

## Objetivo

> **Llenar los bloques con contenido REAL de UN concepto (Factor Común), hecho a
> mano, y capturar evidencia REAL —el `tipoError` sale del distractor que el
> alumno eligió, no de una inferencia—. Reutilizando los renderizadores actuales
> como ladrillos.**

Con esto, el flujo que hoy corre con placeholders pasa a mostrar preguntas y
ejercicios de verdad: es la validación de la hipótesis con estudiantes.

## Alcance
- **Un solo concepto:** Factor Común (`conceptoId: 'factor-comun'`, escalera
  `procedimental`). El perfil semilla `perfilNuevo` ya apunta a él.
- **Sin backend, sin subida real.** La entrada sigue siendo el botón dev del Home
  (los chips dev sirven para reiniciar el perfil entre estudiantes). La subida
  real (Subir → Analizar) es un hito posterior.
- Todo detrás de `MOTOR_MODE`. Dos partes, dos commits.

---

## PARTE A — Contenido como dato + relleno de bloques (commit 1)

### A1. Tipos de contenido (`experience/contracts/contratos.ts`)

Tipa el `contenido` de los bloques (hoy `unknown`):

```ts
import type { TipoError } from '../../motor';

export interface OpcionPregunta {
  id: string;
  texto: string;
  correcta: boolean;
  /** Si es incorrecta: QUÉ error representa (respuesta con significado).
   *  Es la fuente REAL del tipoError de la evidencia. */
  tipoError?: TipoError;
}
export interface ContenidoPregunta { enunciado: string; opciones: OpcionPregunta[] }
export interface ContenidoTexto { titulo?: string; cuerpo: string; pasos?: string[] }

export type Contenido = ContenidoPregunta | ContenidoTexto;
```

Cambia `ExperienceBlock.contenido?: unknown` → `contenido?: Contenido`.
(`pregunta`/`ejercicio` usan `ContenidoPregunta`; `contexto`/`ejemplo`/`insight`
usan `ContenidoTexto`.)

### A2. Banco de contenido a mano (`experience/content/factorComun.ts`)

Indexado `conceptoId → TipoObjetivo → TipoBloque → Contenido[]` (un pool chico por
casilla). **Usa este contenido real tal cual** (Carol lo iterará después):

- **comprender / `pregunta`:** enunciado *"¿Qué significa factorizar una expresión?"*
  - ✔ "Escribirla como un producto de factores."
  - ✗ "Hacerla más larga sumando términos." → `tipoError: 'conceptual'`
  - ✗ "Resolver una ecuación para encontrar x." → `tipoError: 'conceptual'`
- **comprender / `insight`:** *"Factorizar es lo contrario de multiplicar: en vez
  de expandir, buscas qué se multiplicó para llegar a la expresión."*
- **reconocer / `contexto`:** *"El factor común es lo que se repite en todos los
  términos. Sacarlo es el primer método que conviene revisar."*
- **reconocer / `pregunta`:** *"¿Qué método conviene para 6x² + 12x?"*
  - ✔ "Factor común."
  - ✗ "Diferencia de cuadrados." → `tipoError: 'reconocimiento'`
  - ✗ "Trinomio cuadrado perfecto." → `tipoError: 'reconocimiento'`
- **aplicar / `ejemplo`:** título *"6x² + 12x"*, cuerpo *"El factor común es 6x."*,
  `pasos: ["6x² + 12x", "6x · x + 6x · 2", "6x (x + 2)"]`.
- **aplicar / `ejercicio`:** *"Factoriza 4x² + 8x."*
  - ✔ "4x(x + 2)"
  - ✗ "4x(x + 8)" → `tipoError: 'procedimiento'`
  - ✗ "4(x² + 2x)" → `tipoError: 'procedimiento'`
- **transferir / `ejercicio`:** *"Factoriza 15a³ − 10a²."*
  - ✔ "5a²(3a − 2)"
  - ✗ "5a(3a² − 2a)" → `tipoError: 'transferencia'`
  - ✗ "5a²(3a − 2a)" → `tipoError: 'procedimiento'`

**No inventes contenido.** Transcribe EXACTAMENTE el contenido de arriba a
`factorComun.ts` —no agregues, cambies ni "mejores" preguntas, opciones ni
distractores—. Es contenido pedagógico que un humano (Carol / un profesor) debe
revisar antes de usarlo con estudiantes. Marca el archivo con un encabezado:
`// BORRADOR de contenido — redactado por IA, PENDIENTE de revisión pedagógica humana.`
Si quieres más variedad, eso lo decide Carol después, a mano.

### A3. Relleno (`experience/content/rellenar.ts`)

`rellenarContenido(experiencia, objetivo): Experiencia` — por cada bloque, busca
`BANCO[objetivo.conceptoId]?.[objetivo.tipo]?.[bloque.tipo]`, elige uno del pool
(aleatorio está bien acá) y lo asigna a `bloque.contenido`. Si no hay contenido
para esa casilla, deja `contenido` sin definir (el runner cae al placeholder —
defensivo). Puro respecto al perfil; no toca el motor.

Cablea en `MotorContext.iniciarExperiencia`:
`rellenarContenido(crearExperiencia(objetivo), objetivo)`. El Builder sigue
componiendo la estructura; el relleno es un paso aparte.

**Verificación A:** `tsc` limpio; log que muestre que los bloques ya traen
`contenido` real según el objetivo.

---

## PARTE B — Render real + evidencia real (commit 2)

En `ExperienceRunner`, reemplaza el placeholder por render real según el tipo:

- **`contexto` / `ejemplo` / `insight`** (`ContenidoTexto`): muestra `titulo` +
  `cuerpo` (+ `pasos` como lista si existen — reutiliza el componente de worked
  example si calza para `ejemplo`). Botón **"Siguiente"**.
- **`pregunta` / `ejercicio`** (`ContenidoPregunta`): muestra `enunciado` y las
  `opciones` como botones tocables (reutiliza el componente MultipleChoice
  existente si encaja; si no, una lista mínima de opciones). Al tocar una opción:
  - `correcto = opcion.correcta`
  - si es incorrecta, `tipoError = opcion.tipoError` (el REAL, del distractor).
  - `registrarEvidencia({ correcto, tipoError })` — **evidencia real**, en el
    momento (Fase 5). Da un feedback breve (✓/✗) y avanza.

**Quita los botones "Acerté / Me equivoqué".** `inferirTipoError` (Fase 5) queda
solo como **fallback defensivo** si una opción no trae `tipoError`.

Si un bloque no tiene `contenido` (casilla sin autor), mantén el placeholder
actual para ese bloque —no rompas el runner.

---

## Restricciones
- No toques `motor/` ni el Dashboard ni `session.tsx`/`desafio.tsx`.
- Un solo concepto; sin backend; sin subida real; entrada por el botón dev.
- El Builder sigue tonto (estructura); el relleno de contenido es un paso aparte.
  La `DecisionPedagogica` no sale del contexto.
- TypeScript `strict`, sin `any` (usa el union `Contenido` + narrowing por
  `bloque.tipo`).

## Criterio de "terminado" (comportamiento)
- Al correr una misión aparecen **preguntas y ejercicios reales** de Factor
  Común (no tarjetas placeholder), y se responde tocando una opción.
- Responder correctamente hace avanzar el objetivo (comprender → reconocer →
  aplicar → …). Elegir un distractor etiquetado `'conceptual'` baja Comprensión;
  uno `'reconocimiento'` baja Reconocimiento; etc. —**el eje que baja depende del
  distractor elegido**, no del tipo de misión.
- El progreso persiste; los chips dev reinician el perfil entre estudiantes.
- Con `MOTOR_MODE = false`: la app queda EXACTAMENTE igual.
- `npx tsc --noEmit -p .` limpio desde la raíz.

---

## Después de este hito (no ahora)
Con esto ya puedes probar con estudiantes. Lo que sigue: la **entrada real**
(Subir → Analizar → WOW), el **pipeline de backend** que genera este mismo tipo
de contenido etiquetado para cualquier material, y el **multi-concepto**.
