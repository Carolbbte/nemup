# Motor Pedagógico NEMUP

Lógica pura, aislada, que decide "qué misión mostrar a continuación" para un
concepto dado el estado del estudiante. **No importa React, Expo, el backend
ni la red** — recibe un `PerfilConcepto` + un evento (`Evidencia`) y devuelve
la próxima `Mision` y/o el perfil actualizado.

La especificación completa (el "porqué" pedagógico) vive en
[`pedagogia/Reglas_del_Motor_NEMUP.md`](../pedagogia/Reglas_del_Motor_NEMUP.md).
Este README es solo el "cómo" técnico del módulo.

## Principio rector

> NEMUP nunca enseña lo que el estudiante ya demostró saber. El motor puede
> pensar en confianza, pero nunca le habla al alumno en lenguaje de fracaso.

La etapa decide la herramienta, **no la materia**: agregar una disciplina
nueva es añadir una escalera a `escaleras.ts`, nunca tocar `decidir.ts`.

## Las tres capas

1. **Contenido** — el material que sube el estudiante (fuera de este módulo).
2. **Biblioteca de escaleras** (`escaleras.ts`) — 5 recorridos cognitivos, datos.
3. **Motor** (`decidir.ts` + `confianza.ts` + `perfil.ts`) — lógica fija,
   idéntica sin importar la escalera.

## Archivos

| Archivo | Qué hace |
|---|---|
| `tipos.ts` | Todos los tipos del dominio (ya existía). |
| `config.ts` | Parámetros calibrados + helpers puros (ya existía). |
| `escaleras.ts` | Las 5 escaleras arquetipo (`ESCALERAS`, `escaleraDe`). |
| `perfil.ts` | `crearPerfil` + `estabilidadEfectiva` (desgaste temporal). |
| `confianza.ts` | `aplicarEvidencia` — sube/baja el eje correcto según el tipo de acierto/error. |
| `decidir.ts` | `decidirProximaMision` — el corazón: elige la próxima misión. |
| `index.ts` | API pública — reexporta todo lo de arriba. |
| `simulacion.ts` | Script ejecutable con 3 estudiantes simulados (ver abajo). |

Todas las funciones de `perfil.ts`/`confianza.ts`/`decidir.ts` son **puras e
inmutables**: reciben `ahoraMs` explícito (nunca `Date.now()` internamente) y
nunca mutan el `PerfilConcepto` que reciben — siempre devuelven uno nuevo.

## Cómo usar

```ts
import { crearPerfil, decidirProximaMision, aplicarEvidencia } from './motor';

let perfil = crearPerfil('factor-comun', 'Factor común', 'procedimental', Date.now());

const mision = decidirProximaMision(perfil, Date.now());
// ... el estudiante responde la misión en la UI ...
perfil = aplicarEvidencia(perfil, mision, { correcto: true, rapida: true }, Date.now());
```

`decidirProximaMision` acepta un tercer parámetro opcional
`{ evaluacionCercana: true }` para adelantar el umbral de repaso (Regla 7)
cuando el estudiante tiene una evaluación próxima.

## Cómo ejecutar la simulación

El módulo es TypeScript puro sin dependencias del proyecto (solo imports
relativos dentro de `motor/`), así que se compila y corre aislado:

```bash
npx tsc motor/*.ts --outDir .motor-build --module commonjs \
  --target es2019 --moduleResolution node --skipLibCheck
node .motor-build/simulacion.js
```

(`.motor-build/` es un directorio de salida temporal — bórralo después,
`rm -rf .motor-build`.)

La simulación corre 3 estudiantes sobre el mismo concepto ("Factor común",
escalera `procedimental`) y demuestra:

- **(a)** el primer paso de CADA estudiante es `pregunta_conceptual` — nunca
  `repaso_espaciado`. Un concepto nuevo abre enseñando, no "repasando" algo
  que el estudiante nunca vio (ver "Estabilidad y Fluidez..." más abajo).
- **(b)** un peldaño llega a `DOMINADO` (85) en ~3 aciertos buenos
  (`0 → 30 → 65 → 95` con `GANANCIA.sinAyuda`), no ~10 — coherente con una
  micro-misión de 2-4 minutos.
- **(c)** Ana, Beto y Caro reciben recorridos DISTINTOS con el mismo
  material — el motor reacciona al patrón de evidencia de cada uno, no a un
  guion fijo.
- **(d)** un error de `distraccion` casi no mueve el perfil — el escenario de
  Caro deja el eje `aplicar` en un valor > 0 (no en el piso 0) antes del
  descuido, específicamente para que el contraste sea visible en el log:
  `distraccion` lo mueve −3, los dos `procedimiento` siguientes lo mueven −12
  cada uno (bastante más).
- **(e)** una vez el concepto está COMPLETAMENTE dominado (los 5 peldaños),
  al adelantar el reloj varias semanas sin actividad, `estabilidadEfectiva`
  cae y recién ahí `decidirProximaMision` devuelve `repaso_espaciado` — sobre
  algo ya aprendido, no sobre un concepto nuevo.

## Estabilidad y Fluidez son cualidades de lo YA aprendido (resuelto)

Versión anterior de este módulo evaluaba Estabilidad (Regla de repaso) ANTES
de mirar los peldaños — con `ESTABILIDAD_PISO = 40` por debajo de
`UMBRAL_REPASO = 60`, un `PerfilConcepto` recién creado (`ejes.estabilidad =
0`, que se lee como el piso) disparaba `repaso_espaciado` en TODAS las
misiones de un concepto nunca visto, hasta que suficientes aciertos subieran
el valor crudo por encima del umbral. No tenía sentido "repasar" algo que el
estudiante nunca vio.

**Corrección conceptual, no un parche de números**: Estabilidad y Fluidez son
cualidades de un concepto YA dominado (qué tan durable/fluido es lo
aprendido) — `decidirProximaMision` (`decidir.ts`) ahora las evalúa DESPUÉS
del bucle de peldaños, nunca antes:

1. El peldaño más bajo no dominado (si existe, gana siempre — prerrequisito).
2. Solo si los 5 peldaños están dominados: repaso (Estabilidad) → práctica de
   ritmo (Fluidez) → simulación final.

Los umbrales (`UMBRAL_REPASO`, `ESTABILIDAD_PISO`, etc.) no cambiaron — el
arranque en falso era de ORDEN, no de calibración. Confirmado en la
simulación: los tres estudiantes abren con `pregunta_conceptual`, y
`repaso_espaciado` solo aparece en la demostración final, sobre un concepto
ya completamente dominado.

## Ritmo de progreso (2ª calibración)

Con las ganancias/pesos originales (`GANANCIA.sinAyuda = 7`, errores
`-2..-25`), un peldaño tardaba ~10 aciertos en llegar a `DOMINADO` (85) — un
concepto de 5 peldaños tomaba ~50 misiones, demasiado para el ritmo de
micro-misión de 2-4 minutos. Recalibrado en `config.ts` (única fuente de
verdad, sin tocar lógica) para que:

- Un peldaño llegue a `DOMINADO` en ~3 aciertos sin ayuda (`85 / 30 ≈ 3`).
- Con ayuda cueste más (`GANANCIA.conAyuda = 18` < `sinAyuda = 30` —
  autonomía = más crédito).
- Un error conceptual deshaga aproximadamente UN acierto bueno
  (`PESO_ERROR.conceptual = -30` vs `GANANCIA.sinAyuda = +30`).
- `distraccion` (`-3`) siga siendo despreciable frente a cualquier ganancia.

`GANANCIA_ESTABILIDAD` (3 → 12) y el efecto secundario de un acierto rápido
sobre Fluidez (+6 → +20) subieron en la misma proporción. Ese último valor
vivía como un número mágico dentro de `confianza.ts` en vez de en
`config.ts` — se agregó `GANANCIA_FLUIDEZ_RAPIDA` ahí y se cambió la línea en
`confianza.ts` que lo usa (import + una palabra), la única razón por la que
este ajuste tocó un archivo fuera de la lista pedida — es un cambio de
valor/parametrización, no de lógica: `confianza.ts` ya importaba las demás
constantes de `config.ts` de la misma forma.

## TODO (fuera de alcance de esta tarea)

`decidirProximaMision` decide para UN concepto a la vez. Cuando el motor se
extienda para elegir entre VARIOS conceptos, usar el `peso` de cada peldaño
(`escaleras.ts`) para priorizar la "misión de mayor impacto" — está indicado
como TODO en `decidir.ts` mismo.

## Otra elección de diseño documentada en el código

En `confianza.ts`, `ultimaActividadMs` (y por lo tanto el reloj de desgaste
de Estabilidad) solo se reinicia con un acierto CONFIRMADO, nunca con un
intento fallido — la Estabilidad mide qué tan durable es lo aprendido, y eso
se refuerza con recuperación EXITOSA, no con el mero hecho de intentar. El
prompt original solo especifica esta actualización dentro de la rama "si
correcto"; se implementó literal, sin inventar un comportamiento adicional
para la rama de error.
