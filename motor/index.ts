/**
 * Motor Pedagógico NEMUP — API pública
 * =================================================================
 * Punto de entrada del módulo. Lógica pura: no importa React, Expo, el
 * backend ni la red. Recibe un Perfil de Dominio + un evento y devuelve
 * la siguiente misión y el perfil actualizado.
 *
 * Ver la especificación en pedagogia/Reglas_del_Motor_NEMUP.md.
 */

export type {
  TipoEscalera,
  RolCognitivo,
  EjeCualidad,
  EjeId,
  Peldano,
  Escalera,
  TipoMision,
  TipoError,
  PerfilConcepto,
  DecisionPedagogica,
  Evidencia,
  Banda,
} from './tipos';

export { ESCALERAS, escaleraDe } from './escaleras';
export { crearPerfil, estabilidadEfectiva } from './perfil';
export { aplicarEvidencia } from './confianza';
export { tomarDecisionPedagogica } from './decidir';
export { bandaDe } from './config';
