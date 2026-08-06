/**
 * Experience Layer NEMUP — Relleno de contenido
 * =================================================================
 * Paso APARTE del Builder: el Builder (experience/builder/builder.ts)
 * sigue tonto, solo compone la ESTRUCTURA de la Experiencia (qué tipos de
 * bloque, en qué orden) a partir de la receta. `rellenarContenido` toma
 * esa estructura y busca, para cada bloque, contenido real del `banco` del
 * concepto — puro respecto al perfil, no toca el motor ni conoce
 * `PerfilConcepto`/`DecisionPedagogica`.
 *
 * `banco` es un parámetro, no un import fijo: quien orquesta (MotorContext)
 * decide de dónde sale — hoy, el `motorContent` de la sesión generada (ver
 * backend/src/generation/v2/motorAdapter.ts), sembrado vía `sembrarMotor`.
 *
 * Si no hay contenido para una casilla (conceptoId × TipoObjetivo ×
 * TipoBloque), el bloque queda con `contenido` sin definir — defensivo,
 * el runner cae a su placeholder en vez de romper.
 */

import type { Banco, Experiencia, Objetivo } from '../contracts/contratos';

function elegir<T>(pool: T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

export function rellenarContenido(experiencia: Experiencia, objetivo: Objetivo, banco: Banco): Experiencia {
  const bancoDelObjetivo = banco[objetivo.conceptoId]?.[objetivo.tipo];

  const bloques = experiencia.bloques.map((bloque) => {
    const pool = bancoDelObjetivo?.[bloque.tipo];
    if (!pool || pool.length === 0) return bloque;
    return { ...bloque, contenido: elegir(pool) };
  });

  return { ...experiencia, bloques };
}
