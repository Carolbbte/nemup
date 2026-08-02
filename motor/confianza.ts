/**
 * Motor Pedagógico NEMUP — Confianza y evidencia
 * =================================================================
 * Un error no significa nada por sí solo; solo mueve el perfil según
 * su tipo. `aplicarEvidencia` es la única función que actualiza un
 * Perfil de Dominio — pura e inmutable: nunca muta `perfil`, siempre
 * devuelve uno nuevo.
 *
 * Ver la especificación en pedagogia/Reglas_del_Motor_NEMUP.md.
 */

import type { PerfilConcepto, Mision, Evidencia, RolCognitivo } from './tipos';
import { escaleraDe } from './escaleras';
import { estabilidadEfectiva } from './perfil';
import { GANANCIA, GANANCIA_ESTABILIDAD, PESO_ERROR } from './config';

function clamp(valor: number): number {
  return Math.max(0, Math.min(100, valor));
}

/**
 * Busca, dentro de la escalera del perfil, el peldaño de un `rol` dado.
 * Si hay varios (p.ej. dos de "aplicacion"), `Array#find` ya devuelve el
 * de MENOR ÍNDICE porque los peldaños están declarados en orden ascendente
 * en escaleras.ts. `null` si la escalera no tiene ningún peldaño de ese rol
 * (no debería pasar con las 5 escaleras de la biblioteca, pero el llamador
 * decide el fallback en vez de asumir que siempre existe).
 */
function ejeDeRol(perfil: PerfilConcepto, rol: RolCognitivo): string | null {
  const peldano = escaleraDe(perfil.escalera).peldanos.find((p) => p.rol === rol);
  return peldano ? peldano.id : null;
}

export function aplicarEvidencia(
  perfil: PerfilConcepto,
  mision: Mision,
  ev: Evidencia,
  ahoraMs: number,
): PerfilConcepto {
  const ejes = { ...perfil.ejes };

  if (ev.correcto) {
    // Elige UNA ganancia, en este orden de precedencia — no la de mayor
    // valor numérico sin más: si necesitó ayuda, la ganancia queda topada
    // en GANANCIA.conAyuda aunque el acierto TAMBIÉN haya sido rápido o en
    // contexto nuevo (necesitar ayuda limita el crédito, sin importar qué
    // más pasó). Sin ayuda, ahí sí se premia lo más valioso que aplique.
    let ganancia: number;
    if (ev.conAyuda) ganancia = GANANCIA.conAyuda;
    else if (ev.contextoNuevo) ganancia = GANANCIA.contextoNuevo;
    else if (ev.rapida) ganancia = GANANCIA.rapida;
    else ganancia = GANANCIA.sinAyuda;

    ejes[mision.ejeObjetivo] = clamp((ejes[mision.ejeObjetivo] ?? 0) + ganancia);

    // Practicar refuerza retención. "Consolida": guarda el valor EFECTIVO
    // (ya con el desgaste de las semanas transcurridas aplicado) como el
    // nuevo punto de partida, así el reloj de desgaste arranca de cero
    // desde esta actividad en vez de seguir descontando sobre el valor
    // crudo viejo.
    const estabilidadActual = estabilidadEfectiva(perfil, ahoraMs);
    ejes.estabilidad = clamp(estabilidadActual + GANANCIA_ESTABILIDAD);

    // Efectos independientes de la ganancia principal — pueden darse a la
    // vez que un conAyuda topó la ganancia del eje objetivo.
    if (ev.rapida) {
      ejes.fluidez = clamp((ejes.fluidez ?? 0) + 6);
    }
    if (ev.contextoNuevo) {
      const ejeTransferencia = ejeDeRol(perfil, 'transferencia');
      if (ejeTransferencia) {
        ejes[ejeTransferencia] = clamp((ejes[ejeTransferencia] ?? 0) + GANANCIA.contextoNuevo);
      }
    }

    // ultimaActividadMs (y por lo tanto el reloj de desgaste) solo se
    // reinicia con un acierto CONFIRMADO — la Estabilidad mide qué tan
    // durable es lo aprendido, y eso se refuerza con recuperación exitosa,
    // no con el mero intento. Ver README para el efecto de esta elección.
    return { ...perfil, ejes, ultimaActividadMs: ahoraMs };
  }

  // !ev.correcto — baja el eje CORRECTO según tipoError, nunca un peldaño
  // genérico. "distraccion" (o ausencia de tipoError, defensivo) afecta al
  // eje OBJETIVO de la misión — es casi nada de todos modos.
  const tipoError = ev.tipoError ?? 'distraccion';
  const peso = PESO_ERROR[tipoError];

  let ejeAfectado: string;
  switch (tipoError) {
    case 'conceptual':
      ejeAfectado = ejeDeRol(perfil, 'comprension') ?? mision.ejeObjetivo;
      break;
    case 'reconocimiento':
      ejeAfectado = ejeDeRol(perfil, 'reconocimiento') ?? mision.ejeObjetivo;
      break;
    case 'procedimiento':
      ejeAfectado = ejeDeRol(perfil, 'aplicacion') ?? mision.ejeObjetivo;
      break;
    case 'transferencia':
      ejeAfectado = ejeDeRol(perfil, 'transferencia') ?? mision.ejeObjetivo;
      break;
    case 'distraccion':
    default:
      ejeAfectado = mision.ejeObjetivo;
      break;
  }

  ejes[ejeAfectado] = clamp((ejes[ejeAfectado] ?? 0) + peso);

  return { ...perfil, ejes };
}
