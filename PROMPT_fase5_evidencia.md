# PROMPT — Fase 5: Capturar evidencia + runner + MotorContext

> Quinta de 6 fases. Requiere Fases 1–4 hechas.
> Mapa arquitectónico en `PROMPT_motor_integracion.md`.
>
> **Plan de fases:** 1. Contratos ✅ · 2. Pantalla ✅ · 3. Builder ✅ ·
> 4. Motor ✅ · **5. Capturar evidencia ← esta** · 6. Celebración.

## Objetivo

> **Cerrar el ciclo: mostrar los bloques de la experiencia de a UNO, capturar lo
> que hizo el estudiante como `Evidencia` en el momento, actualizar el motor, y
> persistir —de modo que el objetivo AVANCE y sobreviva a cerrar/reabrir la app.**

Es la fase más grande. Impleméntala en **dos partes, dos commits**: Parte A
(estado + persistencia + lifecycle de experiencia) y Parte B (runner + evidencia).

**Fuera de alcance:** contenido real en los bloques (es un hito de backend — la
respuesta se captura con un placeholder "Acerté"/"Me equivoqué"), y celebración +
"¿Continuamos?" (Fase 6 — al terminar una misión simplemente se vuelve al
objetivo, ya avanzado). Todo detrás de `MOTOR_MODE`.

---

## PARTE A — `MotorContext` (commit 1)

Crea **`contexts/MotorContext.tsx`**, local-first, en el estilo de
`MissionsContext.tsx` (AsyncStorage como fuente de verdad). **El contexto es el
único que conoce el motor Y el Builder; la UI solo ve `Objetivo` y `Experiencia`.**

**Estado:** un `PerfilConcepto` activo. Clave AsyncStorage `nemup_motor_perfil_v1`.
Al montar hidrata; si no hay nada, semilla por defecto `perfilNuevo` de
`experience/dev/perfilesFalsos.ts` (TEMP — se reemplazará por la init de un
concepto real en un hito futuro).

**API expuesta:**

```ts
interface MotorContextType {
  hydrated: boolean;
  objetivo: Objetivo;                          // del perfil activo — para la vista intro
  iniciarExperiencia: () => Experiencia;       // congela la decisión + arma la experiencia
  registrarEvidencia: (ev: Evidencia) => void; // aplica contra la decisión CONGELADA
  reiniciarPerfil: (semilla: PerfilConcepto) => void; // TEMP dev (chips)
}
```

- **`objetivo`**: `objetivoDeDecision(tomarDecisionPedagogica(perfil, Date.now()),
  perfil)`. Se recalcula del perfil vivo; es lo que ve la vista intro entre misiones.
- **`iniciarExperiencia()`** (clave — resuelve el drift): congela la decisión
  vigente en una ref (`decisionEnCurso`), y devuelve
  `crearExperiencia(objetivoDeDecision(decisionEnCurso, perfil))`. A partir de acá,
  la experiencia queda amarrada a ESA decisión.
- **`registrarEvidencia(ev)`**: aplica `aplicarEvidencia(perfil, decisionEnCurso,
  ev, Date.now())` **contra la decisión CONGELADA** (no una recalculada), setea el
  perfil y lo **persiste**. Puede llamarse varias veces por experiencia (un bloque
  interactivo cada vez).
  - **Guard:** si `decisionEnCurso.rolObjetivo === 'global'` (misión `simulacion`),
    NO apliques evidencia (hoy escribiría en una clave que no es un eje — ver nota
    del rename); no-op. La corrección de fondo en el motor queda para el diseño de
    la experiencia de simulación.
- **`reiniciarPerfil(semilla)`**: reemplaza el perfil activo y persiste (los chips
  dev pasan por acá; la persistencia es la única fuente de verdad).

**Por qué la decisión congelada:** si `registrarEvidencia` usara la decisión
recalculada sobre el perfil ya mutado, el objetivo podría cambiar a mitad de la
experiencia. Amarrarla a `decisionEnCurso` hace que la evidencia siempre caiga en
el eje correcto y que el objetivo recién se refresque en la próxima
`iniciarExperiencia()`.

**Provider:** envuelve **solo** el árbol de la pantalla nueva (no el layout global).

**Verificación A:** `tsc` limpio; smoke/logs que confirmen que `registrarEvidencia`
sube/baja el eje correcto y que el perfil persiste tras recargar.

---

## PARTE B — `ExperienceRunner` + captura de evidencia (commit 2)

**Extrae el runner a su propio componente** `experience/ExperienceRunner.tsx`
(la pantalla `current-objective.tsx` NO debe acumular el runner). La pantalla
queda con: vista intro (objetivo + WOW + chips dev) y, al tocar "Comenzar",
monta `<ExperienceRunner onFinish={...} />`.

`ExperienceRunner`:
1. Al montar, `const experiencia = iniciarExperiencia()` (del contexto). Índice 0.
2. Renderiza el bloque actual (representación visual placeholder: icono + etiqueta).
3. **Bloque no interactivo** (`contexto`, `ejemplo`, `insight`, `memoria`): botón
   **"Siguiente"** → avanza.
4. **Bloque interactivo** (`pregunta`, `ejercicio`): control **placeholder** (TEMP)
   "Acerté" / "Me equivoqué". Al tocar, **registra la evidencia en el momento**:
   - "Acerté" → `registrarEvidencia({ correcto: true })`.
   - "Me equivoqué" → `registrarEvidencia({ correcto: false, tipoError:
     inferirTipoError(experiencia.objetivo) })`.
   Luego avanza. (Registrar por-bloque hace que el runner escale a experiencias
   con varios bloques interactivos sin cambios.)
5. Al pasar el último bloque → `onFinish()`. La pantalla vuelve a la vista intro,
   que ya muestra el objetivo **avanzado** (Fase 6 agregará celebración + "¿Continuamos?").

**No importa el Builder** — la experiencia viene del contexto (`iniciarExperiencia`).

**Inferencia de `tipoError`** — `experience/evidencia.ts`:
`inferirTipoError(objetivo): TipoError | undefined` por el `tipo` del objetivo:
`comprender→'conceptual'`, `reconocer→'reconocimiento'`, `aplicar→'procedimiento'`,
`transferir→'transferencia'`, `repasar`/`fluidez`→`undefined`. (Sin distractores
etiquetados no se distingue un descuido — es el hito de contenido.)

**Chips dev:** llaman `reiniciarPerfil(...)` del contexto.

---

## Restricciones
- No toques `motor/` ni el Dashboard ni `session.tsx`/`desafio.tsx`.
- Sin contenido real, sin celebración, sin "¿Continuamos?".
- El Builder sigue tonto e intacto; la UI no lo importa (pasa por el contexto).
  La `DecisionPedagogica` nunca sale del contexto.
- TEMP (control dev y "Acerté/Me equivoqué") detrás de `MOTOR_MODE`.
- TypeScript `strict`, sin `any`.

## Criterio de "terminado" (valida COMPORTAMIENTO, no números de calibración)
- Partiendo de `perfilNuevo` (objetivo `comprender`): responder "Acerté" de forma
  repetida hace que, **en algún momento**, el eje se domine y el objetivo
  **avance solo al siguiente peldaño** (`reconocer`). No dependas de un número
  exacto de aciertos.
- Responder "Me equivoqué" en una misión **baja la confianza del eje
  correspondiente** (el objetivo no avanza / el estado retrocede).
- Cerrar y reabrir la pantalla **retoma el progreso** (persistencia).
- Con `MOTOR_MODE = false`: la app queda EXACTAMENTE igual.
- `npx tsc --noEmit -p .` limpio desde la raíz.
