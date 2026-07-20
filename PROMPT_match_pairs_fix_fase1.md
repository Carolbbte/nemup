# Prompt: Correcciones a la Fase 1 del rediseño match_pairs (flujo Misión)

La Fase 1 ya se implementó (variante `misionV2` con `rowColors`, íconos-círculo por fila, mascota `tuPuedes2.png`, caja de pista y copia de tap). Hay 3 bugs visuales a corregir. Todo el cambio sigue **scoped a la variante de Misión**; **no debe alterar el aspecto de Desafío** (que llama a `MatchPairsContent` sin `rowColors`/`accentColor`, es decir, por la rama de defaults). Preserva la lógica de tap indulgente, evaluación por par, requeue, `shuffleSeed` y el feedback posterior.

Archivos: `app/(main)/modals/desafio.tsx` (componente `MatchChipLeft`, `MatchPairsContent`, stylesheet `mp`) y la llamada de Misión en `app/(main)/modals/session.tsx` (rama `slide?.type === 'match_pairs'`, aprox. líneas 3100–3149).

---

## Bug 1 — Tarjeta izquierda gris con "recuadro fantasma" interior

**Causa (verificada):** en `MatchChipLeft` (`desafio.tsx`, ~líneas 393–404) el fondo se resuelve así, en orden, dentro del array de estilos:
1. `mp.chip` → tiene `shadowOpacity`/`elevation` (sombra).
2. `chipBackgroundColor` (Misión pasa `palette.azulClaro`).
3. Override de accent: `{ backgroundColor: accentColor + '15' }` (color del par al **~8% de opacidad**).

En Android, un `backgroundColor` translúcido sobre una `View` con `elevation` compone la sombra como un **gris sucio**, y el clamp `maxHeight` de `mp.chip` (96–120) + el layout apilado deja ese rectángulo interior más claro. Resultado: tarjeta gris con caja fantasma, en vez del pastel sólido de la referencia.

**Corrección:**
- Para la variante `misionV2` (cuando llega `accentColor`/`rowColors`), usar un **fondo pastel SÓLIDO** (sin alpha), no `accentColor + '15'`. Mapea cada color de fila a un token de fondo claro existente, por ejemplo:
  - `palette.verde` → `paletteExtras.verdeChipBg`
  - `paletteExtras.cianFuerte` → un cian muy claro (usa un token existente tipo `palette.cyanBrillante`/`tealTarjetasBg` claro, o define uno pastel sólido en `paletteExtras`)
  - `palette.ambarIcon` → `palette.ambarBg`
  - `palette.azul` → `palette.azulClaro`
  - `palette.rosaQuiz` → `palette.rosaQuizBg`
  - Pasa este color de fondo por una prop nueva (p. ej. `accentBgColor?: string`) desde el call site, o resuélvelo en el componente con un pequeño mapa. **No** uses concatenación `+ '15'`.
- En la variante `misionV2`, **desactiva la sombra/elevación** del chip: `shadowOpacity: 0`, `elevation: 0` (crea un estilo `mp.chipFlat` aplicado solo cuando hay `accentColor`, sin tocar `mp.chip` que usa Desafío).
- **No** pases `chipBackgroundColor={palette.azulClaro}` desde Misión para las tarjetas con accent (que el fondo lo defina solo el pastel del par). Revisa que no quede una `View` de fondo anidada extra generando el recuadro; el borde sigue siendo el color sólido del par (`accentColor`, `borderWidth: 2`).
- Elimina el clamp `maxHeight` para esta variante (ya se hace `targetMaxHeight="none"` en la derecha; haz lo análogo en el chip izquierdo) para que no recorte ni genere la caja interior.

**Esperado:** tarjeta con relleno pastel sólido del color del par (verde/cian/ámbar…), borde del mismo color, sin gris ni recuadro interior — igual que la referencia.

## Bug 2 — El texto del concepto se corta a mitad de palabra ("Evoluci / ón")

**Causa:** `leftChipAdjustsFontSizeToFit` (prop pasada en `session.tsx:3121`) con texto multilínea es un bug conocido de Android (rompe a mitad de palabra y salta el layout). Además el círculo del ícono reduce el ancho disponible del texto.

**Corrección:**
- **Quita** `leftChipAdjustsFontSizeToFit` en la llamada de Misión (o pásalo `false`).
- Usa `leftChipNumberOfLines={2}` con ajuste de fuente controlado por CSS, no por `adjustsFontSizeToFit`: fuente ~15px, `fontWeight: '800'`, `lineHeight` ~19, y deja el **wrap normal por palabra** (no romper mid-word).
- Dale más ancho al texto: reduce el círculo del ícono a ~30–32px, y/o ajusta la proporción de columnas para que la tarjeta izquierda no quede tan angosta. Si un concepto de una sola palabra muy larga (p. ej. "Embriología") no cabe en 2 líneas a 15px, permite una 3ª línea antes que cortar la palabra.
- Alinea el contenido como la referencia: círculo arriba-izquierda y etiqueta debajo, **texto alineado a la izquierda** (`textAlign: 'left'`).

## Bug 3 — El círculo de la tarjeta derecha casi no se ve

**Causa:** `mp.rightIconCircle` usa fondo `palette.azulClaro` y la letra hereda `mp.iconCircleEmoji` con `color: palette.blanco` → letra **blanca sobre azul muy claro**, sin contraste.

**Corrección:**
- Haz legible el círculo derecho: mantén el fondo claro (`palette.azulClaro`) pero pon la **letra en azul** (`palette.azul`, weight 800), o usa un fondo azul más definido con letra blanca. Debe leerse la inicial claramente, como el círculo izquierdo.
- Usa un estilo de texto propio para el círculo derecho (no reutilices `iconCircleEmoji` que es blanco) para no afectar el círculo izquierdo (que sí va con letra blanca sobre color sólido).

## Detalles menores (si es rápido)

- Igualar altura de las dos tarjetas por fila (`alignItems: 'stretch'` en `mp.pairRow`) para que la izquierda no quede más baja que la derecha (visible en "Anatomía comparada" vs "Fósiles directos e indirectos").
- El conector (punto de color · línea punteada · punto azul) está bien como afordancia; no cambiar. Recordatorio: la columna derecha está barajada, así que NO alinees ni insinúes que la fila i-izquierda ↔ fila i-derecha es la correcta.

## Criterios de aceptación

1. Tarjetas izquierdas con relleno pastel sólido del color del par + borde del par, **sin gris ni recuadro fantasma** interior.
2. Nombres de concepto **sin cortes a mitad de palabra**; wrap por palabra, legibles.
3. Círculo de la tarjeta derecha con inicial **claramente legible**.
4. Desafío (rama sin `rowColors`) queda **idéntico**, sin regresiones.
5. `npx tsc --noEmit` y `npm run lint` sin errores nuevos.
6. Verificado **en dispositivo Android** (los artefactos de elevación/`adjustsFontSizeToFit` solo se ven ahí, no en web).
