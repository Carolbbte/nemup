# Prompt: Rediseño de la pantalla "Relaciona" (match_pairs) del flujo Misión

Copia todo lo que sigue como instrucción para el agente/desarrollador que hará el cambio.

---

## Contexto del código (ya verificado, no re-descubrir)

La pantalla a rediseñar es el slide **`match_pairs`** del flujo **Misión**. Se renderiza en:

- **`app/(main)/modals/session.tsx`**, rama `slide?.type === 'match_pairs'` (aprox. líneas 3003–3130). Ahí está el envoltorio de Misión: `ScrollView` → header (`sum.formatHeaderRow` con caja de ícono teal + kicker "Relaciona") → `<MatchPairsContent .../>` → panel de feedback tras responder.
- **`app/(main)/modals/desafio.tsx`**: define y exporta el componente **presentacional** `MatchPairsContent` (líneas ~450–607), el sub-componente `MatchChipLeft` (~317–408), la stylesheet `mp` (~609–666), la constante `PAIR_COLORS` (`[palette.azul, palette.verde, paletteExtras.cianFuerte]`, línea 51) y `seededDerangement`.

**Regla dura:** `MatchPairsContent` es **compartido** entre Misión y Desafío (Desafío lo llama en `desafio.tsx:1251`). NO edites sus estilos ni su markup de forma que cambie el look de Desafío. Extiende **igual que ya hace el código**: agregando **props opcionales nuevas** que por defecto mantienen el aspecto actual, y activando el look nuevo solo desde la llamada de Misión en `session.tsx`. Preserva intactos: la lógica indulgente de tap (un tap incorrecto parpadea ✗ y se desbloquea), la evaluación por par, `pairsCleanRun`/`hadPairErrorRef`, el requeue (`insertCorrectiveSlide`), el `shuffleSeed={summaryIdx}` y el panel de feedback posterior.

## Objetivo

Dejar el slide `match_pairs` de **Misión** con el aspecto de la imagen de referencia (`ejemplo-relaciona.png` — flujo "Misión · 16/19"). Elementos objetivo, de arriba a abajo:

1. **Etiqueta de tipo "RELACIONA"**: caja redondeada teal con ícono de eslabón (🔗) + texto "RELACIONA" en teal, mayúsculas, con letter-spacing. Reutiliza el patrón `sum.formatHeaderRow` + `sum.formatIconBox`/`sum.formatKicker` que ya existe en ese bloque; usa los tokens `palette.tealTarjetas` / `palette.tealTarjetasBg`.
2. **Título grande**: "Relaciona cada concepto con su ejemplo" (o el `bSlide.definition`/prompt del backend) en Nunito ~22px, weight 800, color `palette.charcoal`, 2 líneas.
3. **Mascota + burbuja** (arriba a la derecha): imagen `assets/images/tuPuedes2.png` (mapaches con pulgar arriba + destellos) junto a una burbuja blanca con cola: «**¡Tú puedes!** Une cada concepto con su ejemplo 🚀» — "¡Tú puedes!" en `palette.tealTarjetas`/verde y weight 800; resto en `palette.charcoal`. Reutiliza el patrón de burbuja existente (`sum.feedbackRow` / `sum.feedbackBubble` / `sum.feedbackBubbleTail` y `sum.motivMascot`) como base de estilo.
4. **Columna izquierda (conceptos)**: tarjetas con **círculo de color** (ícono/emoji) arriba a la izquierda + etiqueta en negrita. Fondo tintado suave y **borde del color del par** (verde, morado, ámbar… ciclando por fila). Radio ~20px.
5. **Columna derecha (ejemplos)**: tarjetas blancas con **círculo** (imagen/emoji) arriba + etiqueta centrada en negrita.
6. **Conector entre cada par de tarjetas**: punto (puerto) de color en el borde derecho de la tarjeta izquierda, línea punteada (····) y punto azul en el borde izquierdo de la tarjeta derecha. Es una **afordancia visual de "conecta de aquí hacia allá"**, no indica la respuesta correcta (ver nota crítica abajo).
7. **Caja de pista** (abajo): recuadro azul claro con 💡 y el texto de ayuda de interacción.
8. **Botón "Siguiente →"** al pie, deshabilitado/gris hasta completar todos los pares (ya existe la barra de CTA de Misión; solo asegurar el estado deshabilitado correcto).

## Paleta / tokens a usar (no inventar hex nuevos)

- Colores de par por fila (para bordes/círculos, ciclando): `palette.verde`, `palette.morado*` (`moradoBorde`/`moradoCardBg`), `palette.ambar`/`ambarBg`/`ambarIcon`, y opcionalmente `palette.azul` y un rosa (`palette.rosaQuiz*`). Define un array tipo `ROW_COLORS` en el call site de Misión (no toques `PAIR_COLORS` de Desafío).
- Teal de la etiqueta: `palette.tealTarjetas` / `tealTarjetasBg` / `tealTarjetasIcon`.
- Neutros: `palette.charcoal`, `palette.grisMedio`, `palette.blanco`, `palette.crema`, `palette.bordeClaro`.
- Pista/burbuja: fondos `palette.azulClaro`.
- Fuente: `fontFamily: 'Nunito'` (consistente con el resto).

## Brechas de datos — DECISIONES que el prompt debe resolver

El backend entrega cada par solo como `{ id, left, right }` (texto). **No hay emojis ni imágenes por par.** La imagen muestra íconos/imágenes específicos del contenido (hoja, fósil, mano, murciélago…). Por lo tanto:

- **Íconos de la columna izquierda y "imágenes" de la derecha:** decidir entre
  - (A) **Recomendado**: extender el backend/tipo `pairs` con `leftIcon?: string` y `rightIcon?: string` (emoji) por par, y que la IA los genere. Entonces el frontend los pinta dentro del círculo.
  - (B) **Fallback interim (sin tocar backend)**: pintar el círculo de color con un emoji genérico por tipo/materia, o con la **inicial** del concepto. Se ve como la imagen en estructura, aunque sin el emoji contextual exacto.
  - No inventar una librería de imágenes reales por concepto en el cliente.
- Implementar **(B) como fallback** aunque se elija (A), para pares sin ícono.

## Interacción: tocar vs arrastrar — DECISIÓN

La pista de la imagen dice "Arrastra…". La implementación actual es **por tap** (tocar concepto → tocar ejemplo), indulgente y ya probada.

- **Recomendado (Fase 1):** conservar la interacción por **tap** (menor riesgo, no rompe la lógica indulgente ni el requeue) y ajustar la copia de la pista a algo honesto como «Toca un concepto y luego su ejemplo». Mantener los puertos/línea punteada como afordancia estática.
- **Opcional (Fase 3):** implementar **arrastrar** real con `react-native-gesture-handler` + `react-native-reanimated` (ya son dependencias): gesto desde el puerto izquierdo, línea que sigue el dedo, soltar sobre un puerto derecho válido. Es bastante más trabajo (tracking del gesto, hit-testing de destinos, línea animada, accesibilidad) y debe ir en su propia fase.

## Nota CRÍTICA sobre el conector

La columna derecha se **baraja** (`seededDerangement` vía `shuffleSeed`), así que el ejemplo correcto **no** está enfrente del concepto de la misma fila. Por eso:

- La línea punteada + puertos son **decorativos/afordancia** ("desde aquí conecta"), **no** deben dibujar una línea recta fila-i ↔ fila-i que insinúe que ese es el par correcto.
- El **conector real de un match** (cuando el usuario une A con su ejemplo, que puede estar en otra fila) requiere una **capa de dibujo absoluta** (p. ej. SVG con `react-native-svg` o una `View` posicionada) que trace la línea entre las dos tarjetas realmente emparejadas. Trátalo como **Fase 2**; si es demasiado, en Fase 1 basta con: puertos estáticos + cambiar el color del borde/puerto de ambas tarjetas al color del par cuando se emparejan (comportamiento que ya existe parcialmente con `mp.connector`).

## Plan por fases (entregar así)

- **Fase 1 (núcleo visual, doable y de bajo riesgo):** etiqueta RELACIONA, título, mascota `tuPuedes2.png` + burbuja, tarjetas rediseñadas (círculo de color + borde de color por fila, con fallback de ícono B), caja de pista, estado deshabilitado del botón "Siguiente". Interacción por tap. Puertos estáticos + cambio de color al emparejar.
- **Fase 2 (opcional):** conector real (línea) entre tarjetas emparejadas mediante capa absoluta/SVG.
- **Fase 3 (opcional):** arrastrar real con gesture-handler.

## Cómo implementar sin romper Desafío

En `MatchPairsContent` (desafio.tsx) agrega **props opcionales nuevas** con defaults = look actual, por ejemplo: `variant?: 'default' | 'misionV2'`, o props granulares (`leftIconResolver?`, `rightIconResolver?`, `rowColors?: string[]`, `showPorts?: boolean`, `cardRadius?`, etc.). Actívalas solo desde la llamada de Misión en `session.tsx`. No modifiques la stylesheet `mp` de forma que cambie Desafío; si hace falta, crea estilos nuevos o pásalos por props (como ya se hace con `chipBackgroundColor`, `targetBorderColor`, `targetMaxHeight`, `showHeader`, etc.).

## Assets

- Mascota: `assets/images/tuPuedes2.png` (ya presente en la carpeta). Import: `require('@/assets/images/tuPuedes2.png')`.

## Criterios de aceptación

1. El slide `match_pairs` en **Misión** se ve como la imagen: etiqueta teal, título, mascota `tuPuedes2.png` con burbuja, tarjetas con círculo + borde de color por fila, puertos/pista, y "Siguiente" deshabilitado hasta completar.
2. El slide `match_pairs` en **Desafío** queda **idéntico** a como está hoy (sin regresiones visuales ni de lógica).
3. Se preservan: lógica indulgente de tap, evaluación por par, `pairsCleanRun`/`hadPairErrorRef`, requeue `insertCorrectiveSlide`, `shuffleSeed`, panel de feedback posterior.
4. Los pares sin ícono usan el fallback (inicial o emoji genérico) sin romper el layout.
5. `npx tsc --noEmit` y `npm run lint` sin errores nuevos en los archivos tocados.
6. Probado en dispositivo con conceptos largos (varias líneas) sin que el texto se corte mal ni desborde.

## Fuera de alcance (a menos que se pida)

- Generación de imágenes reales por concepto en la columna derecha.
- Arrastrar real (Fase 3) salvo que se apruebe explícitamente.
