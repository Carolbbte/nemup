# PROMPT — Fase 3: Experience Builder (versión mínima)

> Tercera de 6 fases. Requiere Fase 1 (contratos) y Fase 2 (pantalla) hechas.
> Mapa arquitectónico en `PROMPT_motor_integracion.md`.
>
> **Plan de fases:** 1. Contratos ✅ · 2. Pantalla ✅ ·
> **3. Experience Builder ← esta** · 4. Conectar el Motor · 5. Capturar
> evidencia · 6. Celebración.

## Objetivo

> **Validar que un objetivo pedagógico puede transformarse en una experiencia
> visual sin que el Builder tome decisiones pedagógicas.**

La única pregunta que responde esta fase: *¿somos capaces de construir una
experiencia coherente a partir de un objetivo?* NO "¿podemos optimizar la
receta?" — eso viene después. Por lo tanto: **nada de confianza, nada de
variantes, nada de reglas pedagógicas.** Una receta fija por objetivo, y listo.

## El Builder es TONTO (y no decide pedagogía)

- Función pura. **No** IA, **no** perfiles, **no** confianza, **no** motor, **no**
  React.
- El Builder **no toma decisiones pedagógicas.** La decisión de qué receta/
  estrategia usar (guiado vs directo, etc.) será del **motor** en el futuro
  (devolverá una `estrategia` en el objetivo, y el Builder solo la ejecutará).
  En esta fase el Builder toma la única receta disponible del objetivo. No
  implementes la estrategia todavía.
- La receta es **dato con identidad**, no código.

## 0. Ajustes al contrato de la Fase 1 (`experience/contracts/contratos.ts`)

Tres cambios pequeños (revisan decisiones anteriores):

1. **`Receta` tiene identidad.** Pasa a:
   ```ts
   export type PasoReceta = TipoBloque; // alias: hoy un paso = un bloque.
   // Deja espacio para que mañana un paso genere >1 bloque, sin implementarlo ahora.
   export interface Receta {
     // id que describe la EXPERIENCIA (cómo se vive), no la pedagogía.
     // p.ej. 'question-first' — nunca 'verificacion-conceptual'.
     id: string;
     tipo: TipoObjetivo;
     steps: PasoReceta[];
   }
   ```

2. **La receta sale de `Experiencia` como campo de negocio → pasa a metadata de
   debug.** Reemplaza el campo `receta` por:
   ```ts
   export interface Experiencia {
     objetivo: Objetivo;
     bloques: ExperienceBlock[];
     /** Solo para debug/trazabilidad — NO es un objeto de negocio; ningún
      *  consumidor debe depender de esto. */
     metadata?: { recipe?: Receta };
   }
   ```

No toques nada más del contrato (Objetivo, ExperienceBlock, Evidencia quedan
igual).

## 1. Recetas con identidad — `experience/recipes/recetas.ts`

Un objetivo puede tener **varias** recetas (aunque hoy exista solo una): indexa
`RECETAS: Record<TipoObjetivo, Receta[]>`. Los `id` describen la **experiencia**
(cómo se vive la misión), nunca la pedagogía. Recetas fijas de arranque:

| TipoObjetivo | `id` de la receta (experiencia) | steps |
|---|---|---|
| `comprender` | `question-first` | `['pregunta','insight']` |
| `reconocer` | `context-then-question` | `['contexto','pregunta']` |
| `aplicar` | `example-then-practice` | `['ejemplo','ejercicio']` |
| `transferir` | `direct-challenge` | `['ejercicio']` |
| `repasar` | `memory-refresh` | `['memoria']` |
| `fluidez` | `rapid-practice` | `['ejercicio']` |

Helper `recetaDe(tipo): Receta` → devuelve `RECETAS[tipo][0]` (la primera; la
selección entre varias la hará el motor en el futuro). `celebracion` NO va en
recetas (beat de flujo, Fase 6). El feedback vive dentro de `pregunta`/`ejercicio`.

## 2. El Builder — `experience/builder/builder.ts`

Responsabilidades limpias, separadas:

```ts
// Compone la experiencia (sin preocuparse de IDs).
export function crearExperiencia(objetivo: Objetivo): Experiencia
// Helper de infraestructura: asigna ids únicos a los bloques.
function asignarIds(bloques: Omit<ExperienceBlock,'id'>[], objetivo: Objetivo): ExperienceBlock[]
```

- `crearExperiencia`: toma `recetaDe(objetivo.tipo)`, convierte cada `step` en un
  bloque (`{ tipo }`, `contenido` queda `undefined` — el contenido real se
  conecta en la Fase 4), llama a `asignarIds`, y devuelve
  `{ objetivo, bloques, metadata: { recipe } }`.
- `asignarIds`: única responsable de los ids (p.ej.
  `${objetivo.conceptoId}-${indice}-${tipo}`). El Builder no se preocupa de ids.
- Puro e inmutable. Sin React. Sin `any`.

## 3. Placeholder UI — representación visual (no solo arquitectura)

En `current-objective.tsx`, un objetivo de prueba **explícito**:
```ts
const OBJETIVO_FALSO: Objetivo = { /* tipo: 'aplicar', conceptoNombre de ejemplo, etc. */ };
```
Al tocar **"Comenzar"**, llama `crearExperiencia(OBJETIVO_FALSO)` y renderiza los
bloques con **representación visual tipo producto** (icono + etiqueta por tipo,
sin contenido real). Sugerencia de iconos: `contexto` 📖 · `ejemplo` 💡 ·
`pregunta` ❓ · `ejercicio` 📝 · `insight` ✨ · `memoria` 🃏. Esto ya empieza a
validar la *sensación*, no solo la arquitectura. Una sola experiencia en pantalla
(no un Dashboard). Todo detrás de `MOTOR_MODE`.

## Restricciones
- No toques el motor, el Dashboard, `session.tsx` ni `desafio.tsx`.
- Sin confianza, sin variantes, sin estrategia en esta fase.
- Builder y recetas puros (sin React); el único punto UI es el render placeholder.
- `contenido` de los bloques queda `undefined`.
- TypeScript `strict`, sin `any`.

## Criterio de "terminado"
- Con `MOTOR_MODE = true`: "Comenzar" muestra la secuencia de bloques (con su
  representación visual) que corresponde a la receta del `OBJETIVO_FALSO`;
  cambiar `OBJETIVO_FALSO.tipo` cambia los bloques de forma coherente.
- La `Experiencia` devuelta tiene `objetivo`, `bloques` con ids únicos, y
  `metadata.recipe`.
- Con `MOTOR_MODE = false`: la app queda EXACTAMENTE igual.
- `npx tsc --noEmit -p .` limpio desde la raíz.
