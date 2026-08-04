# PROMPT — Fase 4: Conectar el Motor

> Cuarta de 6 fases. Requiere Fases 1–3 hechas.
> Mapa arquitectónico en `PROMPT_motor_integracion.md`.
>
> **Plan de fases:** 1. Contratos ✅ · 2. Pantalla ✅ · 3. Experience Builder ✅ ·
> **4. Conectar el Motor ← esta** · 5. Capturar evidencia · 6. Celebración.

## Objetivo

> **Que el objetivo que se muestra en pantalla lo decida el MOTOR (real), no un
> placeholder — y comprobar que cambia según el estado del estudiante.**

Nada más. **Todavía NO** se captura evidencia, **NO** se persiste, y **NO** se
renderizan los bloques de a uno — todo eso es la Fase 5. Esta fase solo reemplaza
`OBJETIVO_FALSO` por el objetivo que produce el motor.

## El pipeline que se cablea

```
PerfilConcepto (semilla) → tomarDecisionPedagogica → objetivoDeDecision → Objetivo → UI
```

El motor (`motor/`) **no se toca**. El traductor `objetivoDeDecision` (Fase 1) ya
existe. Solo hay que alimentarlo con un perfil y mostrar el resultado.

## 1. Perfiles semilla (dev) — `experience/dev/perfilesFalsos.ts`

Archivo **temporal de desarrollo** (márcalo `// TEMP dev`), solo se usa detrás de
`MOTOR_MODE`. Crea 2–3 `PerfilConcepto` semilla usando `crearPerfil` del motor y
ajustando ejes a mano, para poder VER cómo cambia el objetivo:

- `perfilNuevo`: concepto recién creado (todos los ejes en 0) → el motor debe
  devolver el peldaño más bajo (`comprender`).
- `perfilAplicar`: `comprender` y `reconocer` en 90 (dominados), resto 0 → el
  motor debe devolver `aplicar`.
- (opcional) `perfilDominado`: todos los peldaños en 90 → cualidad/simulación.

Todos con escalera `procedimental`, concepto de ejemplo "Factor Común".

## 2. Puente motor → objetivo — `experience/objetivoActual.ts`

> **Aclaración de nombres:** `tomarDecisionPedagogica` devuelve una
> `DecisionPedagogica`, que es el objeto de **decisión interna del motor**
> (`{ conceptoId, ejeObjetivo, rolObjetivo, tipo, motivo }`) — NO el viejo modo
> "Misión" del Dashboard, ni contenido, ni un quiz/tarjeta. Esa
> `DecisionPedagogica` se traduce a `Objetivo` en la misma línea y **nunca llega
> a la UI ni al Builder** (solo ven `Objetivo`).

Un helper puro que encadena las dos funciones que ya existen:

```ts
import { tomarDecisionPedagogica } from '../motor';
import { objetivoDeDecision } from './contracts/objetivo';
import type { Objetivo } from './contracts/contratos';
import type { PerfilConcepto } from '../motor';

export function objetivoActual(perfil: PerfilConcepto, ahoraMs: number): Objetivo {
  return objetivoDeDecision(tomarDecisionPedagogica(perfil, ahoraMs), perfil);
}
```

## 3. Frase del objetivo (copy de UI) — `experience/fraseObjetivo.ts`

El objetivo tiene `tipo` + `conceptoNombre`; la UI necesita una frase legible.
Es **copy**, no pedagogía — un mapa determinista `TipoObjetivo → verbo`:

| tipo | frase |
|---|---|
| `comprender` | `Entender {nombre}` |
| `reconocer` | `Reconocer cuándo usar {nombre}` |
| `aplicar` | `Aplicar {nombre}` |
| `transferir` | `Llevar {nombre} a casos nuevos` |
| `repasar` | `Repasar {nombre}` |
| `fluidez` | `Ganar soltura en {nombre}` |

## 4. Cablear en `current-objective.tsx`

- **Elimina `OBJETIVO_FALSO`.**
- Mantén el perfil semilla en estado (default `perfilNuevo`):
  `const [perfil, setPerfil] = useState(perfilNuevo)`.
- `const objetivo = objetivoActual(perfil, Date.now())`.
- El texto del objetivo (la línea WOW) sale de `fraseObjetivo(objetivo)`, ya no
  hardcodeado.
- Al tocar **"Comenzar"**, `crearExperiencia(objetivo)` (igual que Fase 3) y
  muestra los bloques (misma vista de preview por ahora — el runner de a-uno es
  Fase 5). Aprovecha para quitar el lenguaje meta de debug ("así se armó, paso a
  paso") si sigue ahí.
- **Control dev temporal** (`// TEMP`, gated por `MOTOR_MODE`): unos botones para
  cambiar entre `perfilNuevo` / `perfilAplicar` / `perfilDominado`, para VER en
  vivo cómo cambian la frase del objetivo y los bloques. Este control desaparece
  cuando el motor decida de verdad (fases futuras).

## Restricciones
- No toques `motor/` ni el Dashboard ni `session.tsx`/`desafio.tsx`.
- **Sin evidencia, sin persistencia, sin runner de a-uno** — eso es Fase 5.
- El Builder sigue tonto e intacto; solo cambia de dónde viene su `Objetivo`.
- Los perfiles semilla y el control dev son temporales y viven detrás de
  `MOTOR_MODE`.
- TypeScript `strict`, sin `any`.

## Criterio de "terminado"
- Con `perfilNuevo`: el objetivo mostrado es **`comprender`** ("Entender Factor
  Común") y "Comenzar" arma la receta `question-first` (bloques `pregunta`,
  `insight`).
- Al cambiar a `perfilAplicar`: el objetivo pasa a **`aplicar`** ("Aplicar Factor
  Común") y los bloques cambian a `example-then-practice` (`ejemplo`, `ejercicio`).
  → esto demuestra que **el motor decide y el objetivo cambia con el estado.**
- Con `MOTOR_MODE = false`: la app queda EXACTAMENTE igual.
- `npx tsc --noEmit -p .` limpio desde la raíz.
