// BORRADOR de contenido — redactado por IA, PENDIENTE de revisión pedagógica humana.
//
// Banco de contenido a mano para UN concepto (Factor Común), indexado
// conceptoId → TipoObjetivo → TipoBloque → Contenido[]. Transcrito TAL
// CUAL del prompt que lo especificó — no se agregó, cambió ni "mejoró"
// ninguna pregunta, opción ni distractor. Carol/un profesor debe revisarlo
// antes de usarlo con estudiantes reales.

import type { TipoObjetivo, TipoBloque, Contenido } from '../contracts/contratos';

type BancoPorTipoBloque = Partial<Record<TipoBloque, Contenido[]>>;
type BancoPorObjetivo = Partial<Record<TipoObjetivo, BancoPorTipoBloque>>;

export const BANCO: Record<string, BancoPorObjetivo> = {
  'factor-comun': {
    comprender: {
      pregunta: [
        {
          enunciado: '¿Qué significa factorizar una expresión?',
          opciones: [
            { id: 'a', texto: 'Escribirla como un producto de factores.', correcta: true },
            { id: 'b', texto: 'Hacerla más larga sumando términos.', correcta: false, tipoError: 'conceptual' },
            { id: 'c', texto: 'Resolver una ecuación para encontrar x.', correcta: false, tipoError: 'conceptual' },
          ],
        },
      ],
      insight: [
        {
          cuerpo: 'Factorizar es lo contrario de multiplicar: en vez de expandir, buscas qué se multiplicó para llegar a la expresión.',
        },
      ],
    },
    reconocer: {
      contexto: [
        {
          cuerpo: 'El factor común es lo que se repite en todos los términos. Sacarlo es el primer método que conviene revisar.',
        },
      ],
      pregunta: [
        {
          enunciado: '¿Qué método conviene para 6x² + 12x?',
          opciones: [
            { id: 'a', texto: 'Factor común.', correcta: true },
            { id: 'b', texto: 'Diferencia de cuadrados.', correcta: false, tipoError: 'reconocimiento' },
            { id: 'c', texto: 'Trinomio cuadrado perfecto.', correcta: false, tipoError: 'reconocimiento' },
          ],
        },
      ],
    },
    aplicar: {
      ejemplo: [
        {
          titulo: '6x² + 12x',
          cuerpo: 'El factor común es 6x.',
          pasos: ['6x² + 12x', '6x · x + 6x · 2', '6x (x + 2)'],
        },
      ],
      ejercicio: [
        {
          enunciado: 'Factoriza 4x² + 8x.',
          opciones: [
            { id: 'a', texto: '4x(x + 2)', correcta: true },
            { id: 'b', texto: '4x(x + 8)', correcta: false, tipoError: 'procedimiento' },
            { id: 'c', texto: '4(x² + 2x)', correcta: false, tipoError: 'procedimiento' },
          ],
        },
      ],
    },
    transferir: {
      ejercicio: [
        {
          enunciado: 'Factoriza 15a³ − 10a².',
          opciones: [
            { id: 'a', texto: '5a²(3a − 2)', correcta: true },
            { id: 'b', texto: '5a(3a − 2)', correcta: false, tipoError: 'transferencia' },
            { id: 'c', texto: '5a²(3a − 2a)', correcta: false, tipoError: 'procedimiento' },
          ],
        },
      ],
    },
  },
};
