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

- **(a)** Ana, Beto y Caro reciben recorridos DISTINTOS con el mismo
  material — el motor reacciona al patrón de evidencia de cada uno, no a un
  guion fijo.
- **(b)** un error de `distraccion` casi no mueve el perfil — el escenario de
  Caro deja el eje `aplicar` en un valor > 0 (no en el piso 0) antes del
  descuido, específicamente para que el contraste sea visible en el log:
  `distraccion` lo mueve −2, los dos `procedimiento` siguientes lo mueven −8
  cada uno (bastante más).
- **(c)** al adelantar el reloj varias semanas sin actividad,
  `estabilidadEfectiva` cae y `decidirProximaMision` devuelve
  `repaso_espaciado`.

## Hallazgo a tener en cuenta: el piso de Estabilidad vs. el umbral de repaso

Con los valores calibrados actuales, `ESTABILIDAD_PISO = 40` y
`UMBRAL_REPASO = 60` — **el piso queda por debajo del umbral de repaso**.

Consecuencia observada en la simulación: un `PerfilConcepto` recién creado
tiene `ejes.estabilidad = 0`, que se LEE como el piso (40) — por debajo de 60.
Como la Regla 1 (repaso) se evalúa siempre primero, en este orden exacto, el
motor devuelve `repaso_espaciado` en TODAS las misiones de un concepto hasta
que suficientes aciertos suben el valor CRUDO de estabilidad por encima de 60
(con `GANANCIA_ESTABILIDAD = +3` por acierto, son ~7 aciertos). Recién
entonces empieza a subir peldaño por peldaño.

Esto significa que, tal como está calibrado hoy, un concepto NUEVO (nunca
tocado) abre con varias vueltas de "repaso" antes de enseñar nada — lo cual
no calza con el sentido de "repaso" (revisar algo ya visto). Se ve
literalmente en la simulación: los tres estudiantes, sin excepción, arrancan
con 7 pasos idénticos de `repaso_espaciado` antes de que aparezca la primera
`pregunta_conceptual`.

No lo "arreglé" en `decidir.ts` — implementé la Regla 1 exactamente como la
especifica el prompt (repaso antes que cualquier peldaño, sin excepción para
un perfil nuevo), porque no me corresponde rediseñar la calibración
pedagógica sin que ustedes lo decidan. Opciones a considerar, sin implementar
ninguna todavía:

- Subir `ESTABILIDAD_PISO` por encima de `UMBRAL_REPASO` (o bajar
  `UMBRAL_REPASO` por debajo del piso) — así el piso nunca dispara repaso por
  sí solo.
- Que la Regla 1 solo aplique si el perfil ya tuvo AL MENOS una actividad
  real (`ultimaActividadMs !== momento de creación`, o algún peldaño con
  confianza > 0) — un concepto nunca tocado nunca puede "necesitar repaso".
- Inicializar `ejes.estabilidad` en un valor que, tras `estabilidadEfectiva`,
  ya quede por encima de `UMBRAL_REPASO` desde el arranque.

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
