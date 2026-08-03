# PROMPT — Fase 1: Contratos (Objetivo → Experiencia → Evidencia)

> Primera de 6 fases. Mapa arquitectónico completo en
> `PROMPT_motor_integracion.md`. El motor puro ya vive en `motor/`.
>
> **Plan de fases (contexto, NO lo implementes ahora):**
> 1. **Contratos** ← esta tarea.
> 2. Pantalla nueva vacía (título, objetivo, botón continuar).
> 3. Experience Builder (Objetivo → Receta → Bloques).
> 4. Conectar el Motor (mostrar el objetivo, ver que cambia).
> 5. Capturar evidencia → actualizar Motor → volver.
> 6. Celebración → ¿Continuamos? → nueva misión.

## Objetivo de esta fase

Definir **solo los contratos** entre capas. Nada de UI, nada de lógica, nada de
recetas rellenas. Cero comportamiento nuevo. Toda la arquitectura de la
integración se resume en tres objetos que fluyen en ciclo:

```
Objetivo → Experiencia → Evidencia → (Motor) → Objetivo → …
```

## Estructura de carpetas

Crea el andamiaje completo, aunque casi todo quede vacío por ahora —deja la
arquitectura visible desde el inicio:

```
experience/
  contracts/     ← se llena en esta fase
  recipes/       ← vacía por ahora (.gitkeep)
  builder/       ← vacía por ahora (.gitkeep)
```

Los contratos van en **`experience/contracts/contratos.ts`** y el traductor en
**`experience/contracts/objetivo.ts`**. `recipes/` y `builder/` quedan como
carpetas vacías (con un `.gitkeep`) para las fases siguientes.

En `experience/contracts/contratos.ts`, define exactamente lo siguiente.

## 1. `Evidencia` — NO la redefinas

Ya existe en `motor/` (`correcto`, `conAyuda`, `rapida`, `contextoNuevo`,
`tipoError`). Reutilízala:

```ts
import type { Evidencia } from '../motor';
export type { Evidencia };
```

## 2. `Objetivo` (el "Goal") — contrato que consumen Builder y UI

```ts
export type TipoObjetivo =
  | 'comprender'   // understand
  | 'reconocer'    // recognize
  | 'aplicar'      // apply
  | 'transferir'   // transfer
  | 'repasar'      // review  (cualidad estabilidad)
  | 'fluidez';     // fluency (cualidad fluidez)

export interface Objetivo {
  conceptoId: string;
  conceptoNombre: string;
  tipo: TipoObjetivo;
  confianza: number;        // 0–100 del eje objetivo (permite variantes de receta)
  minutosEstimados: number; // p.ej. 2–4
}
```

## 3. `ExperienceBlock` + `Experiencia` — lo que el Builder devuelve

```ts
export type TipoBloque =
  | 'contexto'
  | 'ejemplo'
  | 'pregunta'
  | 'ejercicio'
  | 'insight'
  | 'memoria'
  | 'celebracion';

export interface ExperienceBlock {
  /** Identificador único del bloque dentro de la experiencia. Necesario
   *  porque los bloques tendrán estado (respondido, en progreso…) y hay que
   *  poder referenciarlos. */
  id: string;
  tipo: TipoBloque;
  /** Contenido a renderizar, rellenado por el Builder desde el contenido del
   *  concepto. Se tipará por bloque en la Fase 3; contrato mínimo por ahora. */
  contenido?: unknown;
}

export interface Experiencia {
  objetivo: Objetivo;
  /** La receta que generó estos bloques. NO cambia el comportamiento; mejora
   *  la trazabilidad: al depurar una experiencia se puede ver POR QUÉ se
   *  construyó así (qué receta la originó). */
  receta: Receta;
  bloques: ExperienceBlock[];
}
```

## 4. `Receta` — DATA, no código

La receta es un objeto (una secuencia de tipos de bloque), NO una función. Esto
permite cambiar la experiencia sin tocar el Builder (mismo principio que la
biblioteca de escaleras del motor: datos, no lógica).

```ts
export interface Receta {
  tipo: TipoObjetivo;
  /** Los PASOS del plan (tipos de bloque en orden). Los bloques concretos
   *  (ExperienceBlock, con id y contenido) recién aparecen cuando el Builder
   *  rellena estos pasos. La receta es el plan; los bloques, el resultado. */
  steps: TipoBloque[];
}
```

## 5. Traducción `Mision → Objetivo` — en el BORDE, sin tocar el motor

El motor devuelve un `Mision` (ver `motor/tipos.ts`). El `Objetivo` es su
proyección limpia para la UI. Define un traductor puro en
**`experience/contracts/objetivo.ts`**:

```ts
import type { Mision, PerfilConcepto } from '../../motor';
import type { Objetivo, TipoObjetivo } from './contratos';

// mapea rol/eje del motor → TipoObjetivo:
//   comprension→'comprender', reconocimiento→'reconocer',
//   aplicacion→'aplicar', transferencia→'transferir',
//   eje 'estabilidad'→'repasar', eje 'fluidez'→'fluidez'
export function objetivoDeMision(mision: Mision, perfil: PerfilConcepto): Objetivo { … }
```

- `conceptoId`/`conceptoNombre` desde el perfil/misión.
- `confianza` = `perfil.ejes[mision.ejeObjetivo]`.
- `minutosEstimados` desde un lookup pequeño por `TipoObjetivo` (2–4).

No modifiques `motor/`. Este traductor es el único puente Mision↔Objetivo.

## Restricciones
- Solo creas la estructura `experience/` (con `recipes/` y `builder/` vacías) y
  los archivos `experience/contracts/contratos.ts` y
  `experience/contracts/objetivo.ts`. Nada más.
- Sin dependencias de React. TypeScript `strict`, sin `any` (el `unknown` de
  `contenido` es intencional y temporal).
- No implementes recetas rellenas, Builder, pantalla ni captura. Solo contratos
  + el traductor.

## Criterio de "terminado"
`npx tsc --noEmit -p .` limpio desde la raíz. Los tipos compilan y
`objetivoDeMision` convierte un `Mision` real en un `Objetivo` válido (puedes
verificarlo con un pequeño assert temporal que luego borres). Cero cambios de
comportamiento en la app.
