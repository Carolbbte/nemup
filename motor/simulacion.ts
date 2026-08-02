/**
 * Motor Pedagógico NEMUP — Simulación de verificación
 * =================================================================
 * Script ejecutable (no forma parte de la lógica pura del motor — el
 * motor en sí no usa Date.now(), toda función de motor/*.ts recibe
 * `ahoraMs` explícito). Este archivo es el ARNÉS que la ejercita con
 * 3 estudiantes simulados sobre el mismo concepto, y prueba:
 *
 *   (a) que Ana / Beto / Caro reciben recorridos DISTINTOS con el mismo
 *       material — el motor reacciona al patrón de evidencia de cada uno.
 *   (b) que un error de "distraccion" casi no mueve el perfil.
 *   (c) que al avanzar el reloj varias semanas sin actividad, la
 *       estabilidad efectiva cae y aparece un repaso_espaciado.
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
 * tipoError:'reconocimiento' — la tercera vez, acierta y avanza.
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
 * primero acumula 3 aciertos (para tener una base > 0 desde la que se note
 * el contraste — con el eje en 0, tanto -2 como -8 quedan idénticamente
 * clampeados en 0 y la comparación no se vería), luego comete UN descuido
 * (distraccion — debe apenas moverla) y DOS errores reales de procedimiento
 * (deben notarse mucho más), antes de finalmente acertar y avanzar.
 */
function crearCaro(): Estudiante {
  let pasoEnAplicar = 0;
  return (mision) => {
    if (mision.rolObjetivo === 'aplicacion') {
      pasoEnAplicar++;
      if (pasoEnAplicar <= 3) return { correcto: true };
      if (pasoEnAplicar === 4) return { correcto: false, tipoError: 'distraccion' };
      if (pasoEnAplicar <= 6) return { correcto: false, tipoError: 'procedimiento' };
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
 * Demuestra (c): practica un poco, adelanta el reloj varias semanas SIN
 * actividad, y confirma que estabilidadEfectiva cayó y que la próxima
 * misión sugerida es un repaso_espaciado.
 */
function demostrarRepasoPorDesgaste(): void {
  console.log('\n=== Repaso espaciado (reloj adelantado 6 semanas sin actividad) ===');
  const inicioMs = Date.UTC(2026, 0, 1);
  let perfil = crearPerfil(CONCEPTO_ID, CONCEPTO_NOMBRE, 'procedimental', inicioMs);

  // Practica lo suficiente para levantar Estabilidad por encima del umbral
  // de repaso (60) antes de dejarla desgastarse.
  let ahoraMs = inicioMs;
  while (estabilidadEfectiva(perfil, ahoraMs) < 70) {
    const mision = decidirProximaMision(perfil, ahoraMs);
    perfil = aplicarEvidencia(perfil, mision, { correcto: true }, ahoraMs);
    ahoraMs += DIA_MS;
  }
  console.log(`  Estabilidad tras practicar: ${estabilidadEfectiva(perfil, ahoraMs)}`);

  const seisSemanasDespues = perfil.ultimaActividadMs + 6 * SEMANA_MS;
  const estabilidadDesgastada = estabilidadEfectiva(perfil, seisSemanasDespues);
  console.log(`  Estabilidad efectiva 6 semanas después: ${estabilidadDesgastada}`);

  const mision = decidirProximaMision(perfil, seisSemanasDespues);
  console.log(`  Misión sugerida: ${mision.tipo} — ${mision.motivo}`);
}

function main(): void {
  console.log('Motor Pedagógico NEMUP — Simulación');
  console.log(`Concepto: ${CONCEPTO_NOMBRE} (procedimental)`);
  console.log('NOTA: un Perfil recién creado empieza con estabilidad cruda en 0, que');
  console.log('efectiva se lee como el PISO (40) — por debajo del umbral de repaso (60).');
  console.log('Por diseño (Regla 1 corre siempre primero), el primer paso de cada');
  console.log('estudiante es un repaso_espaciado hasta que unos aciertos levanten la');
  console.log('estabilidad cruda por encima de 60 — ver motor/README.md.');

  correrEstudiante('Ana (domina todo)', crearAna(), 45);
  correrEstudiante('Beto (falla al reconocer)', crearBeto(), 45);
  correrEstudiante('Caro (falla al aplicar + un descuido)', crearCaro(), 45);
  demostrarRepasoPorDesgaste();
}

main();
