/**
 * theme/colors.ts — Módulo de tokens de color oficial NemUp
 *
 * REGLAS DE USO:
 *  palette.morado      → SOLO en CTA primario, identidad (avatar), barras progreso, nav activa, links primarios
 *  palette.limaElectrica → SOLO en momentos wow (subida de nivel, racha, día completo, perfect quiz)
 *  palette.crema       → fondo de toda pantalla. Nunca blanco puro como fondo.
 *  palette.charcoal    → texto principal y fondo hero oscuro (momentos celebración).
 *  palette.blanco      → superficie de tarjetas, NUNCA como fondo de pantalla.
 *  palette.rosaQuiz*   → solo dentro del modo Quiz.
 *  palette.tealTarjetas* → solo dentro del modo Tarjetas.
 *  palette.moradoBg    → fondo soft del modo Misión y chips de identidad.
 *  PROHIBIDO: gradientes, sombras, glow, más de 2 colores fuertes por vista.
 */

export const palette = {
  // ── Core — toda pantalla ─────────────────────────────────────
  morado:    '#5B3DF5',  // BRAND: CTA, identidad, progreso, nav, links
  crema:     '#FAFAF7',  // fondo pantalla
  charcoal:  '#1A1A22',  // texto principal
  grisMedio: '#6B6779',  // texto secundario / descripciones
  grisClaro: '#9A95A6',  // labels uppercase, unidades, íconos neutrales
  blanco:    '#FFFFFF',  // superficie de tarjetas

  // ── Sagrado — solo momentos wow ──────────────────────────────
  limaElectrica: '#C4F852',

  // ── Mode-specific ────────────────────────────────────────────
  rosaQuiz:       '#FF5B9F',
  rosaQuizBg:     '#FFEBF2',
  rosaQuizIcon:   '#D4537E',

  tealTarjetas:     '#00C2A8',
  tealTarjetasBg:   '#DCF5F1',
  tealTarjetasIcon: '#0F6E56',

  // ── Liga / Racha — ámbar ─────────────────────────────────────
  ambar:     '#FFB547',
  ambarBg:   '#FFF2E0',
  ambarIcon: '#BA7517',
  ambarText: '#854F0B',

  // ── Estado positivo ──────────────────────────────────────────
  verde: '#1D9E75',  // check completado, respuesta correcta

  // ── Estado error (respuesta incorrecta en quiz) ──────────────
  rojoError:     '#DC2626',
  rojoErrorDark: '#991B1B',
  rojoErrorBg:   '#FEF2F2',

  // ── Naranja (slide "importante" en Misión) ────────────────────
  naranja: '#FF7A2B',

  // ── Bordes ───────────────────────────────────────────────────
  bordeClaro: '#E8E5DC',
  bordeMedio: '#D6D2C8',

  // ── Superficies modo Misión / chips ──────────────────────────
  moradoBg: '#ECE9FF',
} as const;

export const semantic = {
  // ── Fondos ───────────────────────────────────────────────────
  background:  palette.crema,   // fondo de pantalla
  surface:     palette.blanco,  // tarjetas, inputs

  // ── Texto ────────────────────────────────────────────────────
  textPrimary:   palette.charcoal,
  textSecondary: palette.grisMedio,
  textTertiary:  palette.grisClaro,
  textInverse:   palette.blanco,

  // ── Marca ────────────────────────────────────────────────────
  primary:   palette.morado,
  primaryBg: palette.moradoBg,

  // ── Estados ──────────────────────────────────────────────────
  success:     palette.verde,
  warning:     palette.ambarIcon,
  error:       palette.rojoError,
  celebration: palette.limaElectrica,

  // ── Bordes ───────────────────────────────────────────────────
  borderDefault:  palette.bordeClaro,
  borderEmphasis: palette.bordeMedio,

  // ── Superficies mode-specific ─────────────────────────────────
  modeMisionBg:     palette.moradoBg,
  modeMisionIcon:   palette.morado,
  modeQuizBg:       palette.rosaQuizBg,
  modeQuizIcon:     palette.rosaQuizIcon,
  modeTarjetasBg:   palette.tealTarjetasBg,
  modeTarjetasIcon: palette.tealTarjetasIcon,

  // ── Racha / Liga ─────────────────────────────────────────────
  amberBg:   palette.ambarBg,
  amberIcon: palette.ambarIcon,
  amberText: palette.ambarText,
} as const;
