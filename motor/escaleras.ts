/**
 * Motor Pedagógico NEMUP — Biblioteca de escaleras
 * =================================================================
 * Datos, no lógica: 5 recorridos cognitivos arquetipo, indexados por
 * TIPO DE DEMANDA COGNITIVA (mapea a metadata.pedagogicalType del backend),
 * nunca por asignatura. Se asigna una escalera POR CONCEPTO, no por
 * documento — dos conceptos del mismo material pueden usar escaleras
 * distintas si su naturaleza cognitiva difiere.
 *
 * El motor (decidir.ts) nunca cambia; agregar una disciplina nueva es
 * añadir una escalera acá, no tocar la lógica.
 *
 * Ver la especificación en pedagogia/Reglas_del_Motor_NEMUP.md.
 */

import type { Escalera, TipoEscalera } from './tipos';

export const ESCALERAS: Record<TipoEscalera, Escalera> = {
  procedimental: {
    tipo: 'procedimental',
    descripcion: 'Matemáticas, Programación — Comprender → Reconocer → Aplicar → Automatizar → Transferir.',
    peldanos: [
      { id: 'comprender', label: 'Comprender', rol: 'comprension', peso: 30 },
      { id: 'reconocer', label: 'Reconocer', rol: 'reconocimiento', peso: 20 },
      { id: 'aplicar', label: 'Aplicar', rol: 'aplicacion', peso: 35 },
      { id: 'automatizar', label: 'Automatizar', rol: 'aplicacion', peso: 10 },
      { id: 'transferir', label: 'Transferir', rol: 'transferencia', peso: 5 },
    ],
  },
  cientifica: {
    tipo: 'cientifica',
    descripcion: 'Física, Química — Comprender → Identificar → Modelar → Resolver → Interpretar.',
    peldanos: [
      { id: 'comprender', label: 'Comprender', rol: 'comprension', peso: 25 },
      { id: 'identificar', label: 'Identificar', rol: 'reconocimiento', peso: 20 },
      { id: 'modelar', label: 'Modelar', rol: 'aplicacion', peso: 25 },
      { id: 'resolver', label: 'Resolver', rol: 'aplicacion', peso: 20 },
      { id: 'interpretar', label: 'Interpretar', rol: 'transferencia', peso: 10 },
    ],
  },
  declarativa: {
    tipo: 'declarativa',
    descripcion: 'Historia, Biología — Comprender → Recordar → Relacionar → Analizar → Argumentar.',
    peldanos: [
      { id: 'comprender', label: 'Comprender', rol: 'comprension', peso: 20 },
      { id: 'recordar', label: 'Recordar', rol: 'reconocimiento', peso: 15 },
      { id: 'relacionar', label: 'Relacionar', rol: 'aplicacion', peso: 20 },
      { id: 'analizar', label: 'Analizar', rol: 'aplicacion', peso: 25 },
      { id: 'argumentar', label: 'Argumentar', rol: 'transferencia', peso: 20 },
    ],
  },
  comunicacion: {
    tipo: 'comunicacion',
    descripcion: 'Inglés, Lenguaje — Comprender → Reconocer → Usar → Comunicar → Fluir.',
    peldanos: [
      { id: 'comprender', label: 'Comprender', rol: 'comprension', peso: 20 },
      { id: 'reconocer', label: 'Reconocer', rol: 'reconocimiento', peso: 20 },
      { id: 'usar', label: 'Usar', rol: 'aplicacion', peso: 30 },
      { id: 'comunicar', label: 'Comunicar', rol: 'aplicacion', peso: 20 },
      { id: 'fluir', label: 'Fluir', rol: 'transferencia', peso: 10 },
    ],
  },
  creativa: {
    tipo: 'creativa',
    descripcion: 'Escritura, Arte — Comprender → Explorar → Construir → Evaluar → Crear.',
    peldanos: [
      { id: 'comprender', label: 'Comprender', rol: 'comprension', peso: 20 },
      { id: 'explorar', label: 'Explorar', rol: 'reconocimiento', peso: 15 },
      { id: 'construir', label: 'Construir', rol: 'aplicacion', peso: 30 },
      { id: 'evaluar', label: 'Evaluar', rol: 'aplicacion', peso: 15 },
      { id: 'crear', label: 'Crear', rol: 'transferencia', peso: 20 },
    ],
  },
};

/** Devuelve la escalera de la biblioteca para un tipo de demanda cognitiva. */
export function escaleraDe(tipo: TipoEscalera): Escalera {
  return ESCALERAS[tipo];
}
