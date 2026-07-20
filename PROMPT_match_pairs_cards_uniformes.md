# Prompt: Uniformar el tamaño de las tarjetas de match_pairs (flujo Misión)

**Síntoma:** en el slide `match_pairs` de Misión, las tarjetas tienen alturas distintas (cada fila crece según su texto). En el mockup de referencia **todas las tarjetas tienen el mismo tamaño**. Objetivo: altura uniforme para todas las tarjetas (columna izquierda y derecha, todas las filas), con el texto ajustándose dentro sin desbordar ni cortarse a mitad de palabra.

Archivos: `app/(main)/modals/desafio.tsx` (componente `MatchPairsContent` / `MatchChipLeft` y stylesheet `mp`) y la llamada de Misión en `app/(main)/modals/session.tsx` (rama `slide?.type === 'match_pairs'`, ~líneas 3100–3150).

**Regla dura:** todo el cambio va **scoped a la variante de Misión** (cuando llega `rowColors`/`accentColor`). NO debe cambiar el aspecto de Desafío (que llama a `MatchPairsContent` sin `rowColors`, por la rama de defaults, y necesita conservar su `minHeight/maxHeight` actuales). Preservar la lógica de tap indulgente, evaluación por par, requeue, `shuffleSeed` y feedback.

## Causa (verificada en el código)

1. `mp.pairRow` (desafio.tsx ~705): `alignItems: 'stretch'` iguala alturas **solo dentro de una misma fila**, no entre filas distintas.
2. Los topes de altura se anularon para Misión:
   - `mp.chipStacked` (~734–736) fija `maxHeight: undefined` → el chip izquierdo crece con su texto.
   - La llamada de Misión pasa `targetMaxHeight="none"` (session.tsx ~3139) → la tarjeta derecha crece con su texto.
   Por eso una fila con texto de 4 líneas queda mucho más alta que una de 2 líneas.
3. Cortes de palabra a mitad ("sedim entarias", "Evoluci ón"): ancho ajustado + wrap agresivo.

## Cambios pedidos

### 1. Altura fija y uniforme para todas las tarjetas (solo variante Misión)
- Agregar una prop opcional al componente, p. ej. `uniformCardHeight?: number`, que **solo** se aplique cuando hay `rowColors` (variante Misión).
- Aplicarla como `height: uniformCardHeight` (altura **fija**, no `minHeight`/`maxHeight`) tanto al chip izquierdo (`mp.chip`/`mp.chipStacked`) como a la tarjeta derecha (`mp.target`/`mp.targetStacked`).
- Reemplazar los topes actuales de la variante Misión por esta altura fija:
  - En `mp.chipStacked`: quitar `maxHeight: undefined` y usar la altura fija.
  - En session.tsx: **quitar** `targetMaxHeight="none"` y en su lugar pasar `uniformCardHeight` (o pasar `targetMaxHeight={uniformCardHeight}` + `minHeight` igual). El objetivo es alto fijo, no “crece libre”.
- Valor sugerido: **`uniformCardHeight = 140`** (ajustable). Debe ser suficiente para el ejemplo más largo típico a ~4 líneas.
- Desde el call site de Misión, pasar `uniformCardHeight={140}`.

### 2. Ajuste del texto dentro de la altura fija
- Contenido **centrado verticalmente** dentro de la tarjeta (que el texto largo y el corto se vean igual de centrados).
- Texto: `fontSize: 15`, `lineHeight: 19`, `numberOfLines: 4` (derecha) y `3` (izquierda).
- Para textos que aún no quepan a 15px, activar `adjustsFontSizeToFit` con `minimumFontScale: 0.85` **solo en la variante Misión**, para que encojan en vez de desbordar o recortarse.
- **Evitar cortes a mitad de palabra**: dar ancho suficiente al `Text` (que el círculo del ícono no le robe demasiado) y no forzar wrap agresivo. Con `adjustsFontSizeToFit` + `minimumFontScale` el texto se reduce antes de partir palabras feo.

### 3. Consistencia visual izquierda/derecha
- Misma altura fija, mismo radio, misma posición del círculo (arriba) y texto (debajo/centrado) en ambas columnas, como el mockup.
- Mantener `alignItems: 'stretch'` en `pairRow` no estorba, pero con altura fija ya no es lo que iguala; lo que iguala es el `height` fijo.

### 4. Íconos representativos por tarjeta (EMOJI, no imágenes)
Los "íconos" del mockup son **emojis** (🌱 hoja, 🐚 fósil, 🖐 mano; 🦇🦴, 🦎→🐒, etc.), NO imágenes/fotos. Es barato: solo hay que generar un emoji por concepto y otro por su ejemplo. Actualmente el círculo muestra la **inicial** del texto (fallback). Objetivo: mostrar un emoji representativo, con fallback a la inicial cuando falte.

**Diseño (evitar dar la respuesta):** cada par necesita DOS emojis distintos —uno para el concepto (izquierda) y otro para su ejemplo (derecha)— temáticamente independientes, igual que el mockup (Evolución=🌱 vs su ejemplo con fósil). Como la columna derecha se baraja, usar el MISMO emoji en ambos lados delataría el match; por eso van dos emojis diferentes.

**Backend (recomendado):**
- En `backend/src/generation/v2/comprehension.ts` (donde se generan los conceptos y su `exampleShort`), añadir dos campos por concepto: `conceptEmoji` (representa el concepto) y `exampleEmoji` (representa el `exampleShort`). Actualizar el schema en `backend/src/generation/v2/schemas.ts` y el tipo `KnowledgeConcept` en `types.ts` (ambos opcionales). Instrucción al modelo: "un emoji único y representativo para el concepto, y otro distinto para su ejemplo; si no hay uno claro, omitir".
- En `backend/src/generation/v2/assemble.ts`, dentro de `buildMisionMatchPairs` (~línea 740), mapear `leftIcon: c.conceptEmoji` y `rightIcon: c.exampleEmoji`; y en el punto donde se arman las `pairs` del slide (`{ id, left, right }`, ~línea 478) propagar también `leftIcon`/`rightIcon`. NO tocar `buildMatchPairs` (Desafío) ni su forma.
- Tipos: extender la forma del par (`DesafioPair`/el par de misión y `BackendSlide.pairs` en `session.tsx`) con `leftIcon?: string` y `rightIcon?: string`.

**Frontend (`MatchPairsContent` en desafio.tsx):**
- En `resolveIcon`/el render del círculo, **preferir el emoji del par** cuando exista: círculo izquierdo → `leftPair.leftIcon`; círculo derecho → `rightPair.rightIcon`. Si falta, mantener el fallback actual (inicial en mayúscula).
- El emoji va como texto dentro del círculo; ajusta `fontSize` del emoji (~18) para que se vea bien y NO uses `color: blanco` para emojis (los emojis se pintan solos; el color blanco solo aplica a la inicial de fallback).

**Fallback si NO se quiere tocar backend ahora:** dejar la inicial como está (ya funciona) y aplicar solo los cambios 1–3 (tamaño uniforme). Un mapa keyword→emoji en el cliente NO se recomienda: es frágil y no generaliza a cualquier materia. La vía correcta y barata es el emoji desde el backend.

## Criterios de aceptación

1. Todas las tarjetas del `match_pairs` de Misión tienen **la misma altura**, filas parejas como la imagen de referencia.
2. Los ejemplos largos (p. ej. "Brazo humano y ala de murciélago", "Cambio en rasgos poblacionales") **caben** dentro de la tarjeta, sin desbordar y **sin cortes a mitad de palabra**.
3. Cada tarjeta muestra un **emoji representativo** (izquierda = concepto, derecha = ejemplo, distintos entre sí); si un par no trae emoji, cae al fallback de inicial sin romperse.
4. Desafío (rama sin `rowColors`) queda **idéntico**, sin regresiones (incluye no mostrar emojis ahí salvo que ya los tuviera).
5. `npx tsc --noEmit` y `npm run lint` (front y backend) sin errores nuevos.
6. Verificado en dispositivo Android.

## Nota
Si con altura 140 algunos ejemplos muy largos quedan muy apretados, subir a 148–152 antes que recortar texto. La meta es uniformidad + legibilidad, no rellenar exactamente el mockup pixel a pixel.
