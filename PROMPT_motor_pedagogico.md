# PROMPT — Construir el Motor Pedagógico de NEMUP

> Pégale este prompt a tu agente de VS Code (Copilot / Cline / Cursor).
> Es autocontenido: incluye todas las reglas y parámetros. La especificación
> completa también está en `pedagogia/Reglas_del_Motor_NEMUP.md`.

---

## Rol y objetivo

Actúa como ingeniero senior de TypeScript. Vas a implementar el **Motor
Pedagógico** de NEMUP como un **módulo aislado** en la carpeta `motor/` del
repo (Expo / React Native / TypeScript, `strict: true`, alias `@/*`).

El motor es **lógica pura**: no importa nada de React, Expo, el backend, ni la
red. Recibe un *Perfil de Dominio* + un *evento* y devuelve la *siguiente misión*
y el *perfil actualizado*. Es la "capa 3" del producto, desacoplada del
contenido y de la UI. **No toques pantallas ni contextos en esta tarea.**

### Ya existe (continúa desde aquí, no los reescribas salvo para mejorar)
- `motor/tipos.ts` — todos los tipos del dominio.
- `motor/config.ts` — parámetros calibrados y helpers (`desgasteEstabilidad`, `bandaDe`).

### Debes crear
- `motor/escaleras.ts` — la biblioteca de 5 escaleras.
- `motor/perfil.ts` — crear perfil y desgaste temporal.
- `motor/confianza.ts` — aplicar evidencia (subir / bajar por tipo de error).
- `motor/decidir.ts` — el corazón: elegir la próxima misión.
- `motor/index.ts` — API pública del módulo.
- `motor/simulacion.ts` — estudiantes simulados para verificar (ejecutable).
- `motor/README.md` — cómo usar y correr el módulo.

---

## Principio rector (no negociable)

> **NEMUP nunca enseña lo que el estudiante ya demostró saber.**
> El motor puede pensar en confianza, pero **nunca** le habla al alumno en
> lenguaje de fracaso. Internamente "reabre" una habilidad; hacia afuera el
> mensaje es siempre positivo ("resolvamos este obstáculo y el resto será más
> fácil").

La etapa decide la herramienta, **no la materia**.

---

## Las tres capas
1. **Contenido** — el material que sube el estudiante (infinito).
2. **Biblioteca de escaleras** — 5 recorridos cognitivos (datos).
3. **Motor** — lógica fija que recorre cualquier escalera igual. **Nunca cambia.**

---

## Parte A — Biblioteca de escaleras (`motor/escaleras.ts`)

5 escaleras arquetipo, indexadas por **tipo de demanda cognitiva** (mapea a
`metadata.pedagogicalType` del backend), **no por asignatura**. La escalera se
asigna **por concepto**, no por documento.

Cada peldaño tiene: `id`, `label`, `rol` (`comprension` | `reconocimiento` |
`aplicacion` | `transferencia`) y `peso` (0–100; los pesos de una escalera suman
100). El `rol` permite mapear un tipo de error al eje correcto. El `peso` define
la **misión de mayor impacto**.

Exporta `ESCALERAS: Record<TipoEscalera, Escalera>` con estos datos:

### procedimental (Matemáticas, Programación)
| id | label | rol | peso |
|---|---|---|---|
| comprender | Comprender | comprension | 30 |
| reconocer | Reconocer | reconocimiento | 20 |
| aplicar | Aplicar | aplicacion | 35 |
| automatizar | Automatizar | aplicacion | 10 |
| transferir | Transferir | transferencia | 5 |

### cientifica (Física, Química)
| id | label | rol | peso |
|---|---|---|---|
| comprender | Comprender | comprension | 25 |
| identificar | Identificar | reconocimiento | 20 |
| modelar | Modelar | aplicacion | 25 |
| resolver | Resolver | aplicacion | 20 |
| interpretar | Interpretar | transferencia | 10 |

### declarativa (Historia, Biología)
| id | label | rol | peso |
|---|---|---|---|
| comprender | Comprender | comprension | 20 |
| recordar | Recordar | reconocimiento | 15 |
| relacionar | Relacionar | aplicacion | 20 |
| analizar | Analizar | aplicacion | 25 |
| argumentar | Argumentar | transferencia | 20 |

### comunicacion (Inglés, Lenguaje)
| id | label | rol | peso |
|---|---|---|---|
| comprender | Comprender | comprension | 20 |
| reconocer | Reconocer | reconocimiento | 20 |
| usar | Usar | aplicacion | 30 |
| comunicar | Comunicar | aplicacion | 20 |
| fluir | Fluir | transferencia | 10 |

### creativa (Escritura, Arte)
| id | label | rol | peso |
|---|---|---|---|
| comprender | Comprender | comprension | 20 |
| explorar | Explorar | reconocimiento | 15 |
| construir | Construir | aplicacion | 30 |
| evaluar | Evaluar | aplicacion | 15 |
| crear | Crear | transferencia | 20 |

Agrega una función `escaleraDe(tipo: TipoEscalera): Escalera`.

---

## Parte B — Perfil de Dominio (`motor/perfil.ts`)

Para cada concepto, el motor mantiene un `PerfilConcepto` con un valor de
confianza **0–100 por eje**. Los ejes son: **cada peldaño de su escalera** +
las dos cualidades cruzadas **`estabilidad`** y **`fluidez`**.

- `crearPerfil(conceptoId, conceptoNombre, tipo, ahoraMs): PerfilConcepto`
  Inicializa todos los ejes en 0 y `ultimaActividadMs = ahoraMs`.

- `estabilidadEfectiva(perfil, ahoraMs): number`
  Estabilidad NO se guarda desgastada; se calcula al leer:
  `max(ESTABILIDAD_PISO, perfil.ejes.estabilidad - desgasteEstabilidad(semanas))`
  donde `semanas = floor((ahoraMs - ultimaActividadMs) / (7*24*3600*1000))`.
  El conocimiento no desaparece, solo pierde solidez (piso 40).

**Bandas de confianza** (usa `bandaDe` de config): 0–39 no adquirido · 40–69 en
desarrollo · 70–84 casi dominado · 85–100 **dominado**.

---

## Parte C — Confianza y evidencia (`motor/confianza.ts`)

`aplicarEvidencia(perfil, mision, ev: Evidencia, ahoraMs): PerfilConcepto`
(devuelve un perfil nuevo — inmutable; no mutes el argumento).

**Un error no significa nada por sí solo; solo mueve el perfil según su tipo.**

### Si `ev.correcto`
Sube el eje objetivo de la misión según la calidad del acierto (elige UNA, la de
mayor valor aplicable):
- `conAyuda` → `+GANANCIA.conAyuda` (4)
- si no, `contextoNuevo` → `+GANANCIA.contextoNuevo` (12)
- si no, `rapida` → `+GANANCIA.rapida` (10)
- si no → `+GANANCIA.sinAyuda` (7)

Además, en un acierto:
- `estabilidad += GANANCIA_ESTABILIDAD` (3) — practicar refuerza retención.
- si `rapida` → `fluidez += 6`.
- si `contextoNuevo` → sube también el peldaño de rol `transferencia`.
- pon `ultimaActividadMs = ahoraMs` y "consolida" estabilidad (guarda su valor
  efectivo antes de sumar, para que el reloj de desgaste parta de cero).

### Si `!ev.correcto`
Baja **el eje correcto según `ev.tipoError`** (no un peldaño genérico), usando
`PESO_ERROR`:
- `conceptual` (−25) → eje de rol `comprension`
- `reconocimiento` (−15) → eje de rol `reconocimiento`
- `procedimiento` (−8) → eje de rol `aplicacion` (el de menor índice)
- `transferencia` (−12) → eje de rol `transferencia`
- `distraccion` (−2) → aplica al eje objetivo de la misión (casi no afecta)

Resuelve el eje objetivo buscando en la escalera del perfil el/los peldaño(s)
con ese `rol`; si hay varios (p.ej. dos de `aplicacion`), toma el de **menor
índice**. Errores repetidos del mismo tipo pesan más de forma natural, porque se
acumulan sobre el mismo eje.

Todos los ejes se mantienen en el rango **[0, 100]**.

---

## Parte D — Motor de decisión (`motor/decidir.ts`)

`decidirProximaMision(perfil, ahoraMs, opts?: { evaluacionCercana?: boolean }): Mision`

Algoritmo (en este orden):

1. **Repaso (Estabilidad).** Si `estabilidadEfectiva(perfil, ahoraMs) < UMBRAL_REPASO` (60)
   → `Mision { tipo: 'repaso_espaciado', ejeObjetivo: 'estabilidad', rolObjetivo: 'cualidad' }`.
   El acelerador `evaluacionCercana` permite bajar el umbral (p.ej. a 75) para
   adelantar repasos cuando el alumno tiene una prueba pronto.

2. **Peldaño objetivo.** El **más bajo (menor índice) con confianza < DOMINADO** (85).
   Es prerrequisito: no se trabaja un peldaño alto antes de dominar el anterior.
   El tipo de misión se decide por el `rol` del peldaño:
   - `comprension` → `pregunta_conceptual`
   - `reconocimiento` → `pregunta_reconocimiento`
   - `aplicacion` → confianza < 70 ? `ejercicio_guiado` : `ejercicio_dificil`
   - `transferencia` → `ejercicio_dificil`

   En `motivo`, indica el "estado" según los dos umbrales (punto 2 de la
   calibración): confianza < `UMBRAL_REFORZAR` (55) = "reforzar"; entre 55 y
   `UMBRAL_OBSERVAR` (75) = "observar/consolidar"; ≥ 75 = "avanzar". Esto no
   cambia el objetivo, pero deja trazado por qué se eligió.

3. **Todo dominado.** Si todos los peldaños ≥ 85:
   - si `fluidez < DOMINADO` → `practica_ritmo` (eje `fluidez`).
   - si no → `simulacion` (rolObjetivo `global`).

`motivo` es un string interno para debugging / Mago de Oz; **nunca** se muestra
al estudiante.

Nota de prioridad: cuando quieras extender esto para elegir entre VARIOS
conceptos, usa el `peso` del peldaño para escoger la "misión de mayor impacto"
(refuerza primero el eje que más mueve el dominio del concepto). Déjalo indicado
como TODO si no lo implementas ahora.

---

## Parte E — API pública (`motor/index.ts`)

Reexporta tipos y las funciones principales:
`crearPerfil`, `estabilidadEfectiva`, `aplicarEvidencia`, `decidirProximaMision`,
`ESCALERAS`, `escaleraDe`, `bandaDe`, y los tipos de `tipos.ts`.

---

## Parte F — Verificación (`motor/simulacion.ts`)

Escribe un script ejecutable (con un `main()` al final que imprima por consola)
que corra **3 estudiantes simulados** sobre un mismo concepto (p.ej. "Factor
común", escalera `procedimental`). Un "estudiante" es una función
`(mision) => Evidencia`:

- **Ana (domina todo):** siempre `correcto`, `sinAyuda`, a veces `rapida`.
- **Beto (falla al reconocer):** acierta comprensión; falla reconocimiento
  (`tipoError: 'reconocimiento'`) 2 veces y luego acierta; después avanza.
- **Caro (falla al aplicar + un descuido):** acierta comprensión y
  reconocimiento; en aplicación comete 1 `distraccion` (que NO debe hundir el
  perfil) y luego errores de `procedimiento`; verifica que el motor la mantiene
  en el eje de aplicación sin repetir teoría.

El loop: por N pasos → `decidirProximaMision` → el estudiante responde →
`aplicarEvidencia` → imprime la misión elegida y el perfil resultante.

Debe quedar demostrado que: (a) los tres reciben **recorridos distintos** con el
mismo material; (b) un error de `distraccion` casi no mueve el perfil; (c) al
avanzar el reloj varias semanas, `estabilidadEfectiva` cae y aparece un
`repaso_espaciado`.

### Cómo ejecutar (documenta esto en el README)
El módulo es TypeScript puro sin dependencias del proyecto, así que se puede
compilar y correr aislado:

```bash
npx tsc motor/*.ts --outDir .motor-build --module commonjs \
  --target es2019 --moduleResolution node --skipLibCheck
node .motor-build/simulacion.js
```

---

## Restricciones (importante)
- TypeScript `strict`. Sin `any`. Sin dependencias externas ni imports del
  proyecto (solo imports relativos dentro de `motor/`).
- Funciones **puras e inmutables**: no muta el perfil de entrada; devuelve uno
  nuevo.
- Todos los parámetros numéricos se leen de `motor/config.ts` (no los repitas
  en la lógica).
- Términos del dominio en español (consistente con `desafio` en el repo).
- No modifiques nada fuera de `motor/`.

## Criterio de "terminado"
- `npx tsc --noEmit` pasa sin errores de tipos sobre `motor/`.
- La simulación corre e imprime tres recorridos distintos y coherentes con las
  reglas de arriba.
