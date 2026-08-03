# PROMPT — Fase 2: La pantalla del objetivo (estática)

> Segunda de 6 fases. Requiere la Fase 1 (contratos) ya hecha.
> Mapa arquitectónico en `PROMPT_motor_integracion.md`.
>
> **Plan de fases:** 1. Contratos ✅ · **2. Pantalla del objetivo ← esta** ·
> 3. Experience Builder · 4. Conectar el Motor · 5. Capturar evidencia ·
> 6. Celebración.

## Qué estamos validando (léelo, define todo lo demás)

La hipótesis NO es "¿les gusta el Study Journey?". Es **"¿le gusta al estudiante
que NEMUP le diga cuál es el siguiente paso?"**. Por eso esta pantalla, aunque
sea estática, ya debe *representar el producto*: el momento WOW en que la app
dice "ya sé cómo ayudarte, este es tu primer paso". El **mensaje es producto, no
decoración.**

## Objetivo de esta fase

Crear la pantalla y su navegación, **estática** (contenido fijo, sin motor, sin
IA, sin backend). Solo debe existir, verse con su jerarquía definitiva, y poder
navegarse. Todo detrás de un feature flag; con el flag apagado, la app queda
EXACTAMENTE como hoy.

## 1. Feature flag

En `config/features.ts`: `export const MOTOR_MODE = false;`

## 2. La pantalla — `app/(main)/current-objective.tsx`

Nombre **`current-objective.tsx`** (coincide con el corazón del motor: el
objetivo actual). Ruta expo-router `/current-objective`.

Arriba del componente, este comentario (importa a futuro):

```tsx
// Esta pantalla representa el INICIO del nuevo flujo guiado por el motor.
// NO debe convertirse en un Dashboard. Siempre muestra UN único objetivo.
```

Deja preparado un estado de fase, aunque hoy no se use:

```tsx
type Phase = 'intro'; // se ampliará en fases siguientes (mission, celebrate…)
const [phase] = useState<Phase>('intro');
```

**Jerarquía visual definitiva** (aunque el contenido sea estático). Esta es la
crítica más importante: la pantalla es una *pantalla de experiencia*, no un
formulario. Cuatro secciones, en este orden:

1. **Título** — "Preparando tu prueba" (con 🎯).
2. **Mensaje (WOW)** — texto fijo:
   *"Ya sabemos cómo ayudarte. Analizamos tu material y encontramos el primer
   paso que tendrá mayor impacto para preparar esta evaluación."*
3. **Objetivo** (placeholder estático) —
   *"Tu siguiente objetivo: aprender a reconocer cuándo usar Factor Común."*
4. **CTA** — botón **"Comenzar"** (NO "Continuar": todavía no ha comenzado; el
   primer botón siempre es *Comenzar*). Por ahora un no-op
   (`console.log('comenzar')`).

Usa los tokens de `theme/` y las fuentes actuales para que se vea consistente.

## 3. Navegación — función nombrada, no `router.push` suelto

Crea **`experience/startObjective.ts`** que exporte `startObjective()` y que
internamente haga el `router.push('/current-objective')`. Este método será
llamado a futuro desde varios lugares (análisis terminado, notificaciones,
repaso), así que centralizarlo evita cambiarlo en muchos sitios.

## 4. Acceso temporal desde Home (solo para probar)

En `home.tsx`, un acceso **temporal de desarrollo**, gated por `MOTOR_MODE`, que
llame a `startObjective()`. Márcalo claramente como acceso de prueba
(`// TEMP: acceso de prueba al nuevo flujo`), **no** como un botón de producto
tipo "Preparar prueba": en el producto real el estudiante llegará a esta pantalla
por el flujo Subir → Analizar → WOW, no por un botón del Dashboard. Con
`MOTOR_MODE = false`, `home.tsx` queda idéntico a hoy.

## Restricciones
- No toques el motor, el Dashboard, `session.tsx` ni `desafio.tsx`.
- Todo lo nuevo detrás de `MOTOR_MODE`.
- Contenido 100% estático: no importes aún los contratos ni el motor.
- TypeScript `strict`, sin `any`.

## Criterio de "terminado"
- Con `MOTOR_MODE = true`: el acceso de prueba en `home` llama a
  `startObjective()` y navega a `current-objective`, que muestra la jerarquía
  **Título → Mensaje → Objetivo → CTA ("Comenzar")**.
- Con `MOTOR_MODE = false`: `home` y toda la app quedan EXACTAMENTE igual.
- `npx tsc --noEmit -p .` limpio desde la raíz.
