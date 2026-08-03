/**
 * Motor Pedagógico NEMUP — Simulación de verificación
 * =================================================================
 * Script ejecutable (no forma parte de la lógica pura del motor — el
 * motor en sí no usa Date.now(), toda función de motor/*.ts recibe
 * `ahoraMs` explícito). Este archivo es el ARNÉS que la ejercita con
 * 3 estudiantes simulados sobre el mismo concepto, y prueba:
 *
 *   (a) que el primer paso de cada estudiante es pregunta_conceptual — NO
 *       repaso_espaciado (Ajuste 1: los peldaños van antes que las
 *       cualidades de Estabilidad/Fluidez, que solo se miden sobre un
 *       concepto ya dominado).
 *   (b) que un peldaño llega a DOMINADO en ~3 aciertos buenos.
 *   (c) que un error de "distraccion" casi no mueve el perfil, y uno de
 *       procedimiento/conceptual sí (contraste visible en el log).
 *   (d) que, YA con el concepto dominado, al avanzar el reloj varias
 *       semanas sin actividad, la estabilidad efectiva cae y recién ahí
 *       aparece un repaso_espaciado.
 *
 * Ver "cómo ejecutar" en motor/README.md.
 */

import {
  crearPerfil,
  aplicarEvidencia,
  decidirProximaMision,
  estabilidadEfectiva,
  bandaDe,
} from './index';
import type { Mision, Evidencia, PerfilConcepto } from './tipos';

const CONCEPTO_ID = 'factor-comun';
const CONCEPTO_NOMBRE = 'Factor común';
const DIA_MS = 24 * 60 * 60 * 1000;
const SEMANA_MS = 7 * DIA_MS;

type Estudiante = (mision: Mision, paso: number) => Evidencia;

/** Ana domina todo: siempre correcta, sin ayuda, y rápida cada dos pasos. */
function crearAna(): Estudiante {
  return (_mision, paso) => ({
    correcto: true,
    rapida: paso % 2 === 0,
  });
}

/**
 * Beto falla al reconocer: acierta todo lo demás, pero las dos primeras
 * veces que el motor le pide una misión de rol "reconocimiento" falla con
 * tipoError:'reconocimiento' — la tercera vez, acierta y avanza. Con el eje
 * en 0, ambos fallos quedan clampeados en 0 (PESO_ERROR.reconocimiento=-20
 * contra un piso de 0 no puede bajar más) — visible en el log como "no se
 * mueve", coherente con "un error no significa nada por sí solo".
 */
function crearBeto(): Estudiante {
  let fallosReconocimiento = 0;
  return (mision) => {
    if (mision.rolObjetivo === 'reconocimiento' && fallosReconocimiento < 2) {
      fallosReconocimiento++;
      return { correcto: false, tipoError: 'reconocimiento' };
    }
    return { correcto: true };
  };
}

/**
 * Caro falla al aplicar: acierta comprensión/reconocimiento. En "aplicar"
 * primero acierta UNA vez (para tener una base > 0 desde la que se note el
 * contraste — con el eje en 0, cualquier baja queda clampeada en 0 y no se
 * ve nada), luego comete UN descuido (distraccion, -3 — debe apenas
 * moverla) y DOS errores reales de procedimiento (-12 cada uno — deben
 * notarse mucho más), antes de recuperarse y dominar el peldaño.
 */
function crearCaro(): Estudiante {
  let pasoEnAplicar = 0;
  return (mision) => {
    if (mision.rolObjetivo === 'aplicacion') {
      pasoEnAplicar++;
      if (pasoEnAplicar === 1) return { correcto: true };
      if (pasoEnAplicar === 2) return { correcto: false, tipoError: 'distraccion' };
      if (pasoEnAplicar <= 4) return { correcto: false, tipoError: 'procedimiento' };
      return { correcto: true };
    }
    return { correcto: true };
  };
}

function formatoPerfil(perfil: PerfilConcepto, ahoraMs: number): string {
  return Object.entries(perfil.ejes)
    .map(([eje, valorCrudo]) => {
      const valor = eje === 'estabilidad' ? estabilidadEfectiva(perfil, ahoraMs) : valorCrudo;
      return `${eje}=${Math.round(valor)}(${bandaDe(valor)})`;
    })
    .join(' · ');
}

function correrEstudiante(nombre: string, estudiante: Estudiante, pasos: number): PerfilConcepto {
  console.log(`\n=== ${nombre} ===`);
  let ahoraMs = Date.UTC(2026, 0, 1);
  let perfil = crearPerfil(CONCEPTO_ID, CONCEPTO_NOMBRE, 'procedimental', ahoraMs);

  for (let paso = 1; paso <= pasos; paso++) {
    const mision = decidirProximaMision(perfil, ahoraMs);
    const antes = perfil.ejes[mision.ejeObjetivo] ?? 0;
    const evidencia = estudiante(mision, paso);
    perfil = aplicarEvidencia(perfil, mision, evidencia, ahoraMs);
    const despues = perfil.ejes[mision.ejeObjetivo] ?? 0;
    const resultado = evidencia.correcto ? 'OK' : `ERROR(${evidencia.tipoError ?? 'sin tipo'})`;
    console.log(
      `  [${String(paso).padStart(2, ' ')}] ${mision.tipo.padEnd(22, ' ')} `
      + `eje=${mision.ejeObjetivo}(${mision.rolObjetivo}) → ${resultado}  `
      + `${mision.ejeObjetivo}: ${antes} → ${despues}  — ${mision.motivo}`,
    );
    ahoraMs += DIA_MS;
  }

  console.log(`  Perfil final: ${formatoPerfil(perfil, ahoraMs)}`);
  return perfil;
}

/**
 * Demuestra (d): domina TODA la escalera a fuerza de aciertos (con
 * Ajuste 1, repaso_espaciado solo puede aparecer una vez que ningún
 * peldaño queda por debajo de DOMINADO — ya no alcanza con levantar
 * Estabilidad sola), adelanta el reloj varias semanas SIN actividad, y
 * confirma que estabilidadEfectiva cayó y que la próxima misión sugerida
 * es un repaso_espaciado — ahora sí, sobre un concepto ya aprendido.
 */
function demostrarRepasoPorDesgaste(): void {
  console.log('\n=== Repaso espaciado (concepto YA dominado, reloj +10 semanas sin actividad) ===');
  const inicioMs = Date.UTC(2026, 0, 1);
  let perfil = crearPerfil(CONCEPTO_ID, CONCEPTO_NOMBRE, 'procedimental', inicioMs);
  let ahoraMs = inicioMs;

  // Tope generoso (5 peldaños × ~3 aciertos c/u): se corta apenas
  // decidirProximaMision deja de pedir un peldaño, es decir, apenas los 5
  // están dominados (la próxima misión pasa a ser sobre una cualidad).
  for (let i = 0; i < 20; i++) {
    const mision = decidirProximaMision(perfil, ahoraMs);
    if (mision.rolObjetivo === 'cualidad' || mision.rolObjetivo === 'global') break;
    perfil = aplicarEvidencia(perfil, mision, { correcto: true }, ahoraMs);
    ahoraMs += DIA_MS;
  }
  console.log(`  Perfil tras dominar todos los peldaños: ${formatoPerfil(perfil, ahoraMs)}`);

  // Practicar dejó estabilidad cruda en 100 (tope) — desgasteEstabilidad
  // necesita 9+ semanas completas para bajarla por debajo de
  // UMBRAL_REPASO (60): a la semana 8 el desgaste acumulado es exactamente
  // 40 (100-40=60, todavía NO queda por debajo), recién en la semana 9
  // acumula 45 (100-45=55, ahí sí). 10 semanas deja margen cómodo.
  const diezSemanasDespues = perfil.ultimaActividadMs + 10 * SEMANA_MS;
  const estabilidadDesgastada = estabilidadEfectiva(perfil, diezSemanasDespues);
  console.log(`  Estabilidad efectiva 10 semanas después: ${estabilidadDesgastada}`);

  const mision = decidirProximaMision(perfil, diezSemanasDespues);
  console.log(`  Misión sugerida: ${mision.tipo} — ${mision.motivo}`);
}

function main(): void {
  console.log('Motor Pedagógico NEMUP — Simulación');
  console.log(`Concepto: ${CONCEPTO_NOMBRE} (procedimental)`);
  console.log('Con Ajuste 1, un concepto nuevo abre SIEMPRE con el peldaño más bajo');
  console.log('(pregunta_conceptual) — Estabilidad/Fluidez solo se miran una vez que');
  console.log('toda la escalera está dominada. Con Ajuste 2, cada peldaño domina en');
  console.log('~3 aciertos buenos.');

  correrEstudiante('Ana (domina todo)', crearAna(), 22);
  correrEstudiante('Beto (falla al reconocer)', crearBeto(), 22);
  correrEstudiante('Caro (falla al aplicar + un descuido)', crearCaro(), 22);
  demostrarRepasoPorDesgaste();
}

main();
