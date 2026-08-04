# PROMPT — Fase 6: Celebración + ¿Continuamos?

> Sexta y última fase del esqueleto. Requiere Fases 1–5 hechas.
> Mapa arquitectónico en `PROMPT_motor_integracion.md`.
>
> **Plan de fases:** 1. Contratos ✅ · 2. Pantalla ✅ · 3. Builder ✅ ·
> 4. Motor ✅ · 5. Evidencia ✅ · **6. Celebración ← esta**.

## Objetivo

> **Cerrar el ciclo emocional: al terminar una misión, una celebración positiva,
> y que el ESTUDIANTE decida si continúa o lo deja para después. Continuar arranca
> la siguiente misión.**

Con esto el flujo completo se *siente*: objetivo → misión → logro → el alumno
decide seguir. Un commit. Todo detrás de `MOTOR_MODE`.

## Reglas de experiencia (no negociables)
- **Lenguaje nunca de fracaso.** Aunque el alumno haya fallado, la celebración es
  alentadora y en clave de avance/ayuda —nunca "te equivocaste"—. Es donde más se
  ve la regla de oro del motor: *reforzar, nunca castigar*.
- **Siempre decide el estudiante**, nunca la app: Continuar o dejarlo.
- **Un solo objetivo a la vez.** Nada de menús.

## 1. Estado de fase — usar el `phase` que quedó preparado

En `current-objective.tsx`, expande el `Phase` (que desde la Fase 2 estaba en
`'intro'` sin usarse) a:

```ts
type Phase = 'intro' | 'running' | 'celebrate';
const [phase, setPhase] = useState<Phase>('intro');
```

- `intro`: vista actual (WOW + objetivo + "Comenzar" + chips dev).
- `running`: `<ExperienceRunner onFinish={...} />`.
- `celebrate`: `<CelebrationBeat .../>` (nuevo, abajo).

Transiciones: "Comenzar" → `running`; runner `onFinish` → `celebrate`.

## 2. Detectar si el objetivo avanzó (para el tono de la celebración)

El `ExperienceRunner` ya arranca con `iniciarExperiencia()` (Fase 5), que le da la
`Experiencia` con su `objetivo`. Al terminar, compara ese objetivo inicial con el
objetivo **actual** del contexto (recalculado tras la evidencia):

```ts
// avanzó si el motor ya apunta a otro peldaño/objetivo tras la misión
const avanzo = experienciaInicial.objetivo.tipo !== motor.objetivo.tipo;
```

Pasa ese `avanzo` a `onFinish(avanzo)` para que la celebración elija el tono.

## 3a. El copy, separado del componente — `experience/celebracionCopy.ts`

El copy de celebración se va a iterar muchísimo tras ver estudiantes reales, así
que **NO lo hardcodees dentro del componente.** Vive en UN lugar, como dato:

```ts
export interface CopyCelebracion { title: string; subtitle: string }

export function copyCelebracion(avanzo: boolean): CopyCelebracion {
  return avanzo
    ? { title: '🔥 ¡Lo dominaste!', subtitle: 'Vas avanzando.' }
    : { title: '💪 ¡Buen trabajo!', subtitle: 'Sigamos un poco más.' };
}
```

Constantes por ahora; el punto es que el texto sea fácil de cambiar sin tocar la
UI (más adelante podría variar por hito, por eje dominado, o rotar mensajes tipo
Duolingo — nada de eso ahora). **Siempre positivo, nunca de fracaso.**

## 3b. `CelebrationBeat` — componente presentacional `experience/CelebrationBeat.tsx`

Es **tonto**: recibe el texto ya resuelto y lo muestra, no conoce `avanzo` ni
ninguna lógica.

Props: `{ title: string; subtitle: string; onContinuar: () => void; onDejar: () => void }`.

- Muestra `title` + `subtitle`.
- **Elección del estudiante:**
  - 🟢 **Continuar**
  - ⚪ **Lo dejo para después**

Usa los tokens de `theme/`. Componente propio (no dentro de
`current-objective.tsx`, que ya tiene suficiente).

## 4. Cablear las decisiones

En `phase === 'celebrate'`, la pantalla resuelve el texto con
`copyCelebracion(avanzo)` y monta
`<CelebrationBeat title subtitle onContinuar onDejar />`.

- **Continuar** (`onContinuar`): vuelve a `phase = 'running'` — monta un nuevo
  `ExperienceRunner`, que llama `iniciarExperiencia()` y arma la **siguiente**
  misión (el objetivo ya avanzado). Así se cierra el loop.
- **Lo dejo para después** (`onDejar`): sale del flujo (`router.back()`), sin
  regaños ni fricción.

## Restricciones
- No toques `motor/` ni el Dashboard ni `session.tsx`/`desafio.tsx`.
- Sin contenido real, sin notificaciones (son hitos posteriores).
- La `DecisionPedagogica` sigue sin salir del contexto; la UI solo ve `Objetivo`
  y `Experiencia`.
- TEMP (chips dev, placeholder de respuesta) sigue detrás de `MOTOR_MODE`.
- TypeScript `strict`, sin `any`.

## Criterio de "terminado"
- Al terminar una misión aparece la **celebración** (mensaje positivo) con las dos
  opciones. Cuando el objetivo avanzó, el tono lo refleja ("dominaste"); cuando
  no, un mensaje de avance —**nunca** de fracaso**, aun si hubo respuestas
  falladas.
- **Continuar** arranca la siguiente misión (nueva experiencia del objetivo
  vigente); el ciclo objetivo → misión → celebración → siguiente se repite.
- **Lo dejo para después** sale del flujo limpio.
- Con `MOTOR_MODE = false`: la app queda EXACTAMENTE igual.
- `npx tsc --noEmit -p .` limpio desde la raíz.

---

## Con esto se cierra el esqueleto
Queda el flujo completo guiado por el motor, de punta a punta, con contenido
placeholder. Lo que sigue ya no son fases del esqueleto sino los **hitos de
producto**: contenido real (backend etiquetado por concepto × peldaño), perfiles
reales, multi-concepto, entrada real (Subir → Analizar → WOW), y —el norte—
validar con estudiantes.
