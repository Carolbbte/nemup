# Prompt: Compactar el header del slide match_pairs (Misión) para que quepan las 3 filas

**Síntoma:** en el slide `match_pairs` del flujo Misión, el header (barra de progreso + botones + etiqueta RELACIONA + título + mascota) ocupa ~1/3 de la pantalla y solo se ven ~1.5 filas de tarjetas. Objetivo: dejarlo compacto como el mockup de referencia (las 3 filas + caja de pista + botón "Siguiente/Completa los pares" caben en pantalla, con la mascota solapando la esquina superior derecha en vez de ocupar su propia franja).

**Aclaración:** NO hay ninguna banda de color distinta en el header; el fondo es `palette.crema` uniforme. La "diferencia de color" que se percibe es simplemente esa región vacía grande. Al compactar el header desaparece.

Archivo: `app/(main)/modals/session.tsx`. Todo el cambio va **scoped a la rama `slide?.type === 'match_pairs'`** (aprox. líneas 3012–3160) y a estilos usados solo ahí (`sum.mp*`). No cambies el comportamiento de otros slides de la fase `summary`.

## Causas (verificadas en el código)

1. `sum.slideArea` (línea ~5239): `paddingTop: SM ? 24 : 36`. En teléfonos normales son **36px** de aire arriba. `slideArea` es compartido con otros slides → **no lo cambies globalmente**; overridéalo solo para match_pairs.
2. `sum.mpMascotImg` (línea ~5586): `{ width: 92, height: 135 }`. La mascota de **135px de alto** dentro de `mpMascotRow` (row, `alignItems: 'center'`) fuerza esa fila a ~135px → franja vacía enorme entre título y tarjetas.
3. Márgenes acumulados: `sum.formatHeaderRow marginBottom: 16` + `sum.mpTitle marginBottom: 10` + `sum.mpMascotRow marginBottom: 4`.

## Cambios pedidos

### 1. Reducir el aire superior solo en match_pairs
En el contenedor `ScrollView` de la rama match_pairs (el que envuelve header + `MatchPairsContent`), neutraliza el `paddingTop: 36` de `slideArea`. Opciones (elige una):
- Añadir `contentContainerStyle={{ paddingTop: 0 }}` / un `marginTop` negativo en ese ScrollView, o
- Envolver el contenido en una `View` con `marginTop: -20` (aprox.), o
- Mejor: extraer el `paddingTop` de `slideArea` a una prop/variante y pasar un valor menor (~12) solo aquí.
Meta: ~12–16px de aire arriba, no 36.

### 2. Mascota compacta y solapada (el mayor ahorro de espacio)
- Reduce `sum.mpMascotImg` a algo como `{ width: 76, height: 112 }` (mantén el aspecto ~0.68 de `tuPuedes2.png`).
- Haz que **no aporte altura a la fila**: posiciónala solapando la esquina superior derecha en lugar de empujar el layout. Recomendado: en `sum.mpMascotRow` deja que la altura la marque la burbuja, y coloca la imagen con `position: 'absolute'` (`right: 0`, `top: -10` aprox.) o con `marginTop`/`marginBottom` negativos, de modo que el mapache "bleed" sobre el espacio y, si hace falta, sobre la esquina de la primera tarjeta (como el mockup). Asegura que la burbuja no quede tapada (dale `paddingRight` para no chocar con la imagen).
- Verifica que la imagen no quede recortada por `overflow: 'hidden'` de algún contenedor padre (si lo hay, permite `overflow: 'visible'` en el row).

### 3. Apretar márgenes del header
- `sum.formatHeaderRow.marginBottom`: 16 → **10**.
- `sum.mpTitle.marginBottom`: 10 → **6**. (Opcional: `fontSize` 22 → 20 y `lineHeight` 28 → 25 si aún queda justo.)
- `sum.mpMascotRow.marginBottom`: 4 → mantener o 8, pero que la fila sea baja (que la marque la burbuja, no la imagen).
- Revisa el gap entre la mascota y la primera fila de tarjetas; que sea ~12–16px, no mayor.

### 4. (Opcional) Barra de progreso
El mockup usa una barra continua; la app usa `UnifiedProgressBar` (3 segmentos). No es parte de este fix salvo que se pida. Si se quiere igualar, es un cambio aparte en `UnifiedProgressBar`/su uso.

## Criterios de aceptación

1. En el slide `match_pairs` de Misión caben en pantalla (sin scroll, o con scroll mínimo) las **3 filas** de tarjetas + la caja de pista + el botón inferior, como el mockup.
2. La mascota `tuPuedes2.png` aparece compacta y solapando la esquina superior derecha, sin dejar una franja vacía ni tapar la burbuja.
3. El resto de slides de la fase `summary` (concept, quiz intercalado, etc.) **no cambian** su espaciado.
4. Sin regresiones en Desafío.
5. `npx tsc --noEmit` y `npm run lint` sin errores nuevos.
6. Verificado en dispositivo Android (Samsung), pantalla normal (no SM).
