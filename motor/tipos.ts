/**
 * Motor Pedagógico NEMUP — Tipos
 * =================================================================
 * La "capa 3" del producto: lógica pura que decide qué misión mostrar.
 * No depende del contenido subido ni de las pantallas. Recibe un
 * Perfil de Dominio + un evento, y devuelve la siguiente misión y el
 * perfil actualizado.
 *
 * Ver la especificación en pedagogia/Reglas_del_Motor_NEMUP.md.
 */

/** Las 5 escaleras arquetipo. Se elige por el TIPO DE DEMANDA del material,
 *  no por la asignatura. Mapea a `metadata.pedagogicalType` del backend. */
export type TipoEscalera =
  | 'procedimental' // Matemáticas, Programación
  | 'cientifica'    // Física, Química
  | 'declarativa'   // Historia, Biología
  | 'comunicacion'  // Inglés, Lenguaje
  | 'creativa';     // Escritura, Arte

/** Rol cognitivo canónico de cada peldaño. Sirve para mapear un tipo de
 *  error al eje correcto sin importar el nombre visible del peldaño. */
export type RolCognitivo =
  | 'comprension'
  | 'reconocimiento'
  | 'aplicacion'
  | 'transferencia';

/** Cualidades que cruzan todo el concepto (no son peldaños). */
export type EjeCualidad = 'estabilidad' | 'fluidez';

/** Identificador de un eje del perfil: id de un peldaño o una cualidad. */
export type EjeId = string;

/** Un peldaño de una escalera. */
export interface Peldano {
  /** id estable, p.ej. 'aplicar' (se usa como EjeId en el perfil). */
  id: string;
  /** Nombre visible internamente. El estudiante NUNCA lo ve. */
  label: string;
  /** Rol canónico, para resolver a qué eje afecta cada error. */
  rol: RolCognitivo;
  /** Peso 0–100: cuánto impacta este peldaño en el dominio del concepto.
   *  Define cuál es la "misión de mayor impacto". */
  peso: number;
}

/** Una escalera de la biblioteca. */
export interface Escalera {
  tipo: TipoEscalera;
  descripcion: string;
  /** Peldaños en orden ascendente (se sube uno por uno). */
  peldanos: Peldano[];
}

/** Tipos de misión que el motor puede pedir. */
export type TipoMision =
  | 'pregunta_conceptual'      // diagnóstico de comprensión (1 pregunta rápida)
  | 'pregunta_reconocimiento'  // ¿cuándo se usa? (sin resolver)
  | 'ejercicio_guiado'         // resolver con pistas
  | 'ejercicio_dificil'        // resolver sin apoyo / transferir
  | 'repaso_espaciado'         // reforzar Estabilidad
  | 'practica_ritmo'           // reforzar Fluidez
  | 'simulacion';              // diagnóstico final cuando el perfil es sólido

/** Categorías de error. Un error NO significa nada por sí solo;
 *  solo mueve el perfil según su tipo. */
export type TipoError =
  | 'distraccion'    // signo, cálculo, lectura — casi no afecta
  | 'procedimiento'  // baja Aplicación
  | 'reconocimiento' // baja Reconocimiento
  | 'conceptual'     // baja Comprensión (el más fuerte)
  | 'transferencia'; // baja Transferencia

/** El estado del estudiante para UN concepto. */
export interface PerfilConcepto {
  conceptoId: string;
  conceptoNombre: string;
  escalera: TipoEscalera;
  /** Confianza 0–100 por eje: cada peldaño + estabilidad + fluidez.
   *  El valor de 'estabilidad' es el registrado en la última actividad;
   *  el desgaste temporal se calcula al leer (ver perfil.ts). */
  ejes: Record<EjeId, number>;
  /** Timestamp (ms) del último evento, para el desgaste de Estabilidad. */
  ultimaActividadMs: number;
}

/** La decisión del motor: qué hacer a continuación. */
export interface Mision {
  conceptoId: string;
  /** Eje que la misión intenta mejorar. */
  ejeObjetivo: EjeId;
  rolObjetivo: RolCognitivo | 'cualidad' | 'global';
  tipo: TipoMision;
  /** Explicación interna de por qué se eligió (para debugging / Mago de Oz).
   *  Nunca se muestra al estudiante. */
  motivo: string;
}

/** El resultado de una misión (lo que el estudiante hizo). */
export interface Evidencia {
  correcto: boolean;
  /** ¿necesitó pistas? (baja la ganancia) */
  conAyuda?: boolean;
  /** ¿respondió rápido? (sube Fluidez) */
  rapida?: boolean;
  /** ¿lo hizo en un contexto nuevo? (premia Transferencia) */
  contextoNuevo?: boolean;
  /** Si falló: qué tipo de error fue. Requiere respuestas "con significado". */
  tipoError?: TipoError;
}

/** Banda de dominio de un eje, para lógica y reportes. */
export type Banda = 'no_adquirido' | 'en_desarrollo' | 'casi_dominado' | 'dominado';
