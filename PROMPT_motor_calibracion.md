# PROMPT — Calibración del Motor Pedagógico (2 ajustes)

> Pégale este prompt a tu agente de VS Code. Es una tarea **quirúrgica** sobre
> el módulo `motor/` que ya existe. NO rediseñes nada más; solo estos 2 ajustes
> y vuelve a verificar. Contexto pedagógico en `pedagogia/Reglas_del_Motor_NEMUP.md`.

## Contexto

El módulo `motor/` funciona y compila limpio. Al correr la simulación
aparecieron **dos problemas de calibración** (no de lógica). Arréglalos.

---

## Ajuste 1 — Estabilidad y Fluidez son cualidades de lo YA aprendido

**Problema:** un `PerfilConcepto` recién creado abre con ~7 vueltas de
`repaso_espaciado` antes de enseñar nada, porque la Regla 1 evalúa Estabilidad
*antes* de mirar los peldaños, y un perfil nuevo lee estabilidad efectiva = piso
(40) < umbral (60). No tiene sentido "repasar" algo nunca visto.

**Corrección conceptual (no es un parche de números):** Estabilidad y Fluidez
son cualidades de un concepto **ya dominado**; no deben evaluarse hasta que se
haya subido la escalera. Reordena `decidirProximaMision` en `motor/decidir.ts`
para que el orden sea:

1. **Peldaño objetivo primero:** el más bajo (menor índice) con confianza
   < `DOMINADO`. Si existe, esa es la misión (igual que hoy: tipo según el
   `rol`, y `motivo` con reforzar/observar/avanzar).
2. **Solo si TODOS los peldaños están dominados**, entonces evalúa las
   cualidades, en este orden:
   a. `estabilidadEfectiva(perfil, ahoraMs) < umbralRepaso` → `repaso_espaciado`
      (mantén el acelerador `evaluacionCercana` que baja el umbral a 75).
   b. si no, `fluidez < DOMINADO` → `practica_ritmo`.
   c. si no → `simulacion`.

Es decir: mueve el bloque de repaso (hoy es el paso 1) para DESPUÉS del bucle de
peldaños. No cambies los umbrales ni `estabilidadEfectiva`. Con esto, un
concepto nuevo abre con `pregunta_conceptual`, y el `repaso_espaciado` solo
aparece cuando el concepto —ya dominado— pierde solidez con el tiempo.

Actualiza el comentario del algoritmo en `decidir.ts` y la sección "Hallazgo…"
del `README.md` para reflejar que el arranque en falso quedó resuelto por el
reordenamiento (ya no es un tema pendiente de calibración).

---

## Ajuste 2 — La escalera sube demasiado lento

**Problema:** cada peldaño necesita ~10 aciertos para llegar a `DOMINADO` (85),
así que un concepto de 5 peldaños toma ~50 misiones. Choca con la experiencia de
micro-misiones de 2–4 minutos y con la idea original de "≈2 aciertos = logrado".

**Corrección:** recalibra las ganancias y los pesos de error en
`motor/config.ts` (única fuente de verdad; no toques la lógica) para que:

- Un peldaño pase de 0 a `DOMINADO` (85) en **~3 aciertos buenos** (sin ayuda).
- Con ayuda, tome más (autonomía = más crédito).
- Un error `conceptual` deshaga aproximadamente **un** acierto bueno (fuerte).
- Un error de `distraccion` siga siendo **despreciable** frente a las ganancias.

Valores de arranque sugeridos (déjalos claramente comentados como calibrables):

```ts
export const GANANCIA = {
  conAyuda: 18,
  sinAyuda: 30,
  rapida: 35,
  contextoNuevo: 40,
};
export const GANANCIA_ESTABILIDAD = 12; // sube estabilidad al practicar

export const PESO_ERROR: Record<TipoError, number> = {
  distraccion: -3,
  procedimiento: -12,
  transferencia: -18,
  reconocimiento: -20,
  conceptual: -30,
};
```

(El efecto secundario de `fluidez` en un acierto rápido —hoy `+6`— súbelo de
forma proporcional, p.ej. a `+20`, para que Fluidez llegue a sólida en una
cantidad razonable de prácticas rápidas.)

No cambies `DOMINADO` (85) ni los umbrales `UMBRAL_OBSERVAR` (75) /
`UMBRAL_REFORZAR` (55) / `UMBRAL_REPASO` (60).

---

## Verificación (obligatoria)

Ajusta `motor/simulacion.ts` si hace falta (menos pasos por peldaño ahora) y
vuelve a correr con el comando del README. Debe quedar demostrado:

- **(a)** El primer paso de cada estudiante es una `pregunta_conceptual`
  (NO `repaso_espaciado`). Ningún concepto nuevo abre con repaso.
- **(b)** Un peldaño llega a `DOMINADO` en ~3 aciertos buenos (no ~10).
- **(c)** Un error de `distraccion` casi no mueve el perfil, y uno de
  `procedimiento`/`conceptual` sí (contraste visible en el log).
- **(d)** Tras dominar el concepto y adelantar el reloj varias semanas,
  `estabilidadEfectiva` cae y aparece `repaso_espaciado` — ahora sí, sobre
  algo ya aprendido.
- `npx tsc --noEmit -p .` limpio (desde la raíz del repo, no desde `backend/`).

## Restricciones

- Solo tocas `motor/config.ts`, `motor/decidir.ts`, `motor/simulacion.ts` y
  `motor/README.md`. Nada fuera de `motor/`.
- Funciones puras e inmutables, TypeScript `strict`, sin `any`.
- No cambies la firma pública de `decidirProximaMision` ni de `aplicarEvidencia`.

## Criterio de "terminado"

`tsc --noEmit` limpio + la simulación imprime los 4 comportamientos (a–d) de
arriba, con recorridos distintos por estudiante.
