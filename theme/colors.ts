/**
 * theme/colors.ts — Módulo de tokens de color oficial NemUp (sistema Azul + Verde)
 *
 * REGLAS DE USO:
 *  palette.azul           → CTA primario, identidad (avatar), barras progreso, nav activa, links, títulos CTA
 *  palette.azulClaro      → soporte / hover / superficies suaves, bordes de tarjeta
 *  palette.verdeXP        → reward, racha, XP, progreso
 *  palette.verdeBrillante → punto final del gradiente del botón CTA (junto a azul)
 *  palette.amarilloXP     → rayos, rewards, micro sparkles
 *  palette.crema          → fondo de toda pantalla. Nunca blanco puro como fondo.
 *  palette.charcoal       → texto principal
 *  palette.blanco         → superficie de tarjetas, NUNCA como fondo de pantalla.
 *  palette.rosaQuiz*      → solo dentro del modo Quiz.
 *  palette.tealTarjetas*  → solo dentro del modo Tarjetas.
 *  PROHIBIDO: sombras, glow, más de 2 colores fuertes por vista (salvo el gradiente
 *  azul → cyan → verde del CTA de Upload).
 */

export const palette = {
  // ── Core — toda pantalla ─────────────────────────────────────
  azul:      '#1677F2',  // BRAND: CTA, identidad, progreso, nav, links, títulos CTA
  azulClaro: '#DCEEFF',  // soporte / hover / superficies suaves, bordes
  crema:     '#F8FAFC',  // fondo pantalla
  charcoal:  '#111827',  // texto principal
  grisMedio: '#6B7280',  // texto secundario / descripciones
  grisClaro: '#9A95A6',  // labels uppercase, unidades, íconos neutrales
  blanco:    '#FFFFFF',  // superficie de tarjetas

  // ── Reward system ─────────────────────────────────────────────
  verdeXP:        '#32D74B',  // reward, racha, XP, progreso
  verdeBrillante: '#58E000',  // punto final del gradiente CTA
  cyanBrillante:  '#12B8E8',  // punto medio del gradiente CTA
  amarilloXP:     '#FFC93C',  // rayos, rewards, micro sparkles

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
  bordeClaro: '#DCEEFF',  // azul claro de soporte (antes gris cálido)
  bordeMedio: '#D6D2C8',
} as const;

/**
 * paletteExtras — tonos puntuales detectados al centralizar colores que antes
 * estaban hardcodeados en distintos componentes. No son parte del sistema de
 * diseño curado (no seguir usándolos en trabajo nuevo, preferir `palette` /
 * `semantic`); se conservan aquí tal cual para no alterar la UI existente y
 * quedar como candidatos a consolidación futura.
 *
 * Los tonos morado/violeta de este bloque fueron migrados a su equivalente
 * azul (mismo matiz ~212°, misma luminosidad/saturación) al pasar la marca
 * de morado a azul.
 */
export const paletteExtras = {
  // ── Dashboard / Hero cards ───────────────────────────────────
  moradoCardBg:         '#EFF6FF',
  moradoBorde:          '#99C8FF',
  moradoTrackClaro:     '#DCECFF',
  moradoBordeSuave:     '#D9EBFF',
  moradoPanelBg:        '#E4F1FF',
  trackClaro:           '#F0EDE5',
  grisFondoDone:        '#F5F4F0',
  xpBadgeBg:            '#E9F3FF',
  xpBadgeBorde:         '#CEE5FF',

  // ── Home / Upload / First-session ────────────────────────────
  azul:          '#2563EB',
  verdeArchivo:  '#16A34A',
  verdeOscuro:   '#2D6A00',
  verdeMedio:    '#4C8A00',
  grisTexto:     '#6B7280',
  rojoBg:        '#FEE2E2',
  verdeBg:       '#DCFCE7',
  azulBg:        '#DBEAFE',
  cieloAzul:     '#5BC8FF',

  // ── Desafío — match pairs / feedback de juego ────────────────
  cianFuerte:            '#0891b2',
  verdeSuaveBg:          '#F0FDF7',
  verdeSuaveBg2:         '#F0FDF4',
  moradoSuaveBg3:        '#F3F9FF',
  moradoSuaveBg4:        '#F2F8FF',
  moradoChipBg:          '#E9F3FF',
  moradoTargetBorde:     '#E8F3FF',
  moradoTargetActivoBg:  '#E8F3FF',
  verdeChipBg:           '#EAFBF2',
  verdeChipBorde:        '#27C383',
  rojoChipBg:            '#FFF2F2',
  rojoChipBorde:         '#FF6B6B',
  grisHandle:            '#B8B3C7',
  verdeTextoOscuro:      '#166534',
  naranjaFuerte:         '#F97316',
  amarilloSuaveBg:       '#FEFCE8',
  amarilloBorde:         '#FCD34D',
  naranjaClaro:          '#FB923C',
  naranjaTextoOscuro:    '#9A3412',

  // ── Session — resumen Misión / Quiz ──────────────────────────
  moradoSuaveBg:     '#EDF5FF',
  moradoSuaveBg2:    '#F3F9FF',
  azulQuiz:          '#3B82F6',
  azulQuizOscuro:    '#1E40AF',
  ambarFuerte:       '#F59E0B',
  ambarTextoOscuro:  '#92400E',
  ambarSuaveBg:      '#FFF7ED',
  ambarIntermedio:   '#D97706',
  indigoOscuro:      '#1E1B4B',
  esmeralda:         '#059669',
  esmeraldaOscuro:   '#065F46',
  naranjaOscuro:     '#E07000',
  violetaPattern:    '#5CA4F6',
  moradoVioleta:     '#5AA7FF',
  rosaFuerte:        '#FF4D6D',
  rojoGradienteFin:  '#B91C1C',
  rojoMedio:         '#EF4444',
  violetaClaro:      '#4DA0FF',
  naranjaVivo:       '#FF9000',
  grisPlaceholder:   '#888888',

  // ── Onboarding — niveles de vehículo (progresión NEM) ────────
  vehiculoGris:    '#E2E8F0',
  vehiculoAzul:    '#A8C4E0',
  vehiculoVioleta: '#8B5CF6',
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
  primary:   palette.azul,
  primaryBg: palette.azulClaro,

  // ── Estados ──────────────────────────────────────────────────
  success:     palette.verde,
  warning:     palette.ambarIcon,
  error:       palette.rojoError,
  celebration: palette.amarilloXP,

  // ── Bordes ───────────────────────────────────────────────────
  borderDefault:  palette.bordeClaro,
  borderEmphasis: palette.bordeMedio,

  // ── Superficies mode-specific ─────────────────────────────────
  modeMisionBg:     palette.azulClaro,
  modeMisionIcon:   palette.azul,
  modeQuizBg:       palette.rosaQuizBg,
  modeQuizIcon:     palette.rosaQuizIcon,
  modeTarjetasBg:   palette.tealTarjetasBg,
  modeTarjetasIcon: palette.tealTarjetasIcon,

  // ── Racha / Liga ─────────────────────────────────────────────
  amberBg:   palette.ambarBg,
  amberIcon: palette.ambarIcon,
  amberText: palette.ambarText,
} as const;
