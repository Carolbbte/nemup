# PROMPT — Nueva experiencia guiada por el Motor (Study Journey)

> Pégale este prompt a tu agente de VS Code. Contexto pedagógico en
> `pedagogia/Reglas_del_Motor_NEMUP.md`; el motor puro ya vive en `motor/`.

## La apuesta que estamos validando (léelo primero)

Esto NO es "integrar el motor en la app actual". Es **construir una experiencia
nueva** donde el motor ya existente es **el único que decide el siguiente
objetivo**, reutilizando los componentes actuales como bloques, **sin modificar
el Dashboard existente**.

El motor ya está definido y verificado; no es lo que hay que validar. Lo que hay
que validar con estudiantes es una hipótesis de producto:

> *"¿Un adolescente prefiere que NEMUP le muestre un ÚNICO siguiente objetivo,
> en lugar de un Dashboard con Quiz, Tarjetas y Desafíos?"*

Por lo tanto, **la sensación es el producto**: un solo objetivo a la vez, sin
menú, con celebración y un "¿continuamos?" que decide el alumno. Esos beats son
parte del alcance, no adorno. Prioriza la fidelidad de la experiencia por sobre
la sofisticación técnica. Construye lo más delgado que se pueda poner frente a
~30 estudiantes.

## Alcance de este hito
- Reutilizar el pipeline de subida/generación actual **tal cual** como entrada
  (ya funciona y produce el contenido que necesitamos). No lo toques.
- Todo lo nuevo detrás del flag `MOTOR_MODE` (agrégalo a `config/features.ts`,
  default `false`). Con el flag apagado, la app se comporta EXACTAMENTE igual.
- **No tocar** `session.tsx` / `desafio.tsx` ni el Dashboard. Solo se reutilizan
  sus componentes de render, no su flujo.

---

## Las 4 capas

```
Contenido → Motor → Experience Builder → UI
```

| Capa | Responsabilidad | Dónde vive |
|---|---|---|
| **Contenido** | Describe el documento (conceptos + ítems). | La sesión ya generada (reutilizada). |
| **Motor** | Decide el siguiente objetivo (qué eje, qué tipo de misión, por qué). | `motor/` (no se toca). |
| **Experience Builder** | Convierte ese objetivo en una secuencia de bloques. **No decide.** | `experience/` (nuevo). |
| **UI** | Renderiza los bloques, captura la respuesta, genera `Evidencia`. | Pantalla nueva + componentes existentes. |

---

## 1. Experience Blocks (componentes reutilizados)

Los renderizadores actuales pasan a llamarse **Experience Blocks**. **No se
modifican; solo cambian de lugar / se exponen para reusarlos.** Como mínimo:

`MultipleChoice`, `WorkedExample`, `Flashcard`, `Boss`, `Summary/Insight`,
`Feedback`, `Celebrate`.

Si alguno está hoy embebido dentro de `session.tsx`/`desafio.tsx`, extráelo a un
componente reutilizable **sin cambiar su comportamiento** (solo mover/exportar).

## 2. Experience Builder (`experience/builder.ts`) — TONTO a propósito

- **No** usa IA. **No** consulta perfiles ni confianza. **No** conoce al
  estudiante. Es una función pura:
  `construirExperiencia(mision: Mision, contenidoDelConcepto): ExperienceBlock[]`.
- Toma el `mision.tipo`, busca una **receta** (plantilla fija) y devuelve la
  secuencia de bloques, rellenándolos con el contenido disponible del concepto.

**Recetas por tipo de misión** (bloques en orden). Si no hay contenido para un
bloque, se omite ese bloque (degradación elegante — nunca dejes la misión vacía):

| `mision.tipo` | Receta (Experience Blocks) |
|---|---|
| `pregunta_conceptual` | Question(MC) → Feedback → Insight |
| `pregunta_reconocimiento` | Reminder(Summary breve) → Question(MC "¿qué método?") → Feedback |
| `ejercicio_guiado` | Reminder → WorkedExample → Question("tu turno") → Feedback |
| `ejercicio_dificil` | Question(MC difícil / Boss item) → Feedback |
| `repaso_espaciado` | Flashcard(s) / recall corto → Feedback |
| `practica_ritmo` | Serie corta de Question con ritmo → Feedback |
| `simulacion` | Boss loop (varias mezcladas) → Diagnóstico final |

Cada misión termina con un beat de **Celebrate** a nivel de flujo (ver runner).

## 3. Store de perfiles (`contexts/MotorContext.tsx`)

Local-first, mismo estilo que `MissionsContext.tsx` (AsyncStorage fuente de
verdad). Es el ÚNICO lugar que mezcla el motor puro con React/AsyncStorage/
`Date.now()` — **`motor/` nunca importa React.**

- Persiste `Record<conceptoId, PerfilConcepto>` namespaced por `sessionId`
  (clave `nemup_motor_perfiles_v1`).
- API: `getOrCreatePerfil(concepto)` (usa `crearPerfil`),
  `decidir(conceptoId, opts?)` (usa `decidirProximaMision`),
  `registrarEvidencia(conceptoId, mision, ev)` (usa `aplicarEvidencia` y persiste).

## 4. Adaptadores de contenido y evidencia (`experience/`)

**Conceptos + escalera** (`experience/conceptos.ts`): de la sesión generada,
lista de conceptos = `conceptIndex`/`conceptName` únicos de `desafio.slides`
(o `metadata.learningPath`). `conceptoId = String(conceptIndex)`. Escalera:
mapea `metadata.pedagogicalType → TipoEscalera`, fallback `'procedimental'`.

**Selección de contenido para un bloque**: como el contenido aún no está
etiquetado por peldaño, usa heurística por dificultad
(`easy → comprensión/reconocimiento`, `medium → aplicación`,
`hard → difícil/transferencia`) dentro del concepto.

**Resultado → `Evidencia`** (`experience/evidencia.ts`):
- `correcto`, `conAyuda` (usó pistas/reintento — hay `MAX_ATTEMPTS_PER_QUESTION`),
  `rapida` (opcional, si mides tiempo).
- `tipoError` en un fallo, **inferido por el ROL de la misión** (la misión ya
  dice qué peldaño se prueba): falló `pregunta_conceptual` → `'conceptual'`;
  `pregunta_reconocimiento` → `'reconocimiento'`; `ejercicio_*` → `'procedimiento'`;
  misión de transferencia → `'transferencia'`.
  *Limitación aceptada:* no se distingue un descuido dentro de un ejercicio
  (eso requiere distractores etiquetados — hito 2).

## 5. La pantalla nueva (`app/(main)/study-journey.tsx`, nombre provisional)

Montada solo bajo `MOTOR_MODE`. Entrada: desde una sesión ya generada por el
pipeline actual. Flujo:

```
Análisis terminado (reutiliza el pipeline)
      ▼
WOW breve — "🎯 Ya sabemos por dónde empezar."
      ▼   ┌─────────────── ciclo ───────────────┐
      ▼   ▼                                      │
  mision = MotorContext.decidir(concepto)        │
      ▼                                          │
  bloques = construirExperiencia(mision, ...)    │
      ▼                                          │
  render bloques con Experience Blocks EXISTENTES│
      ▼                                          │
  ev = resultadoAEvidencia(mision, respuesta)    │
      ▼                                          │
  MotorContext.registrarEvidencia(...)           │
      ▼                                          │
  Celebrate                                      │
      ▼                                          │
  ¿Continuamos? [Continuar] [Lo dejo para después]
      └──────────── Continuar vuelve al ciclo ───┘
```

Reglas de la experiencia:
- **Siempre una sola misión / un solo objetivo visible.** Nunca un menú ni el
  plan completo.
- El `motivo` de la misión se puede loguear en consola; **jamás** se muestra al
  alumno, ni ninguna métrica de confianza.
- El alumno siempre decide continuar o parar (nunca la app).
- Selección de concepto (por ahora): el de menor `conceptIndex` no dominado.

**Entrada al flujo:** detrás del flag, un botón discreto ("Probar" / "Preparar
prueba") en `home.tsx` que navega a la pantalla nueva. No reemplaces nada del
Dashboard.

---

## Verificación

Con `MOTOR_MODE = true`, sobre una sesión ya generada:
- **(a) Experiencia:** el usuario ve un único objetivo a la vez, una micro-misión
  compuesta por el Builder, una celebración, y decide si continúa. Sin menú.
- **(b) Ciclo:** decide → construye → renderiza → captura → actualiza perfil →
  siguiente, sin intervención manual.
- **(c) Persistencia:** cerrar y reabrir retoma el estado (AsyncStorage).
- **(d) Adaptación:** quien falla `pregunta_reconocimiento` recibe otro camino
  que quien la acierta (heurística de `tipoError` por rol).
- **(e) Flag apagado:** con `MOTOR_MODE = false`, la app es EXACTAMENTE la de hoy.
- `npx tsc --noEmit -p .` limpio desde la raíz.

## Restricciones
- No modifiques `motor/` (lógica pura; solo se importa).
- No modifiques el Dashboard ni el flujo de `session.tsx`/`desafio.tsx`. Reutiliza
  sus componentes de render; si hay que extraer alguno, muévelo sin cambiar su
  comportamiento.
- Todo lo nuevo detrás de `MOTOR_MODE`. TypeScript `strict`, sin `any`.
- El Experience Builder no decide nada: solo receta → bloques.

## Criterio de "terminado"
`tsc --noEmit` limpio + el ciclo (a–e) demostrado con una sesión real, y —lo más
importante— un flujo que se pueda poner frente a un adolescente para sentir si
"no tener que elegir cómo estudiar" funciona.

---

## Fuera de alcance (hito 2, para el radar)
Etiquetar en el backend cada distractor con su tipo de error y cada ítem con su
concepto y peldaño → habilita el diagnóstico fino (descuido vs. procedimiento,
error conceptual dentro de un ejercicio). También: WOW inteligente, bloques y
renderizadores nuevos, e IA en el Experience Builder. Nada de eso ahora.
