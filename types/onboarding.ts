export interface OnboardingData {
  name: string;
  curso: string; // Ej: "1º Medio", "2º Medio", etc.
  goal: number; // Meta de nota (0-7)
  subjects: string[]; // Array de ramos seleccionados
  goalType: string; // Razón para estudiar
  dailyCommitment: string; // Tiempo diario comprometido
  completed: boolean;
}

export interface OnboardingState {
  data: OnboardingData;
  currentStep: number; // 0-4 (5 pasos totales)
  isLoading: boolean;
  isInitialized: boolean; // true once AsyncStorage has been read
  error: string | null;
}

export const ONBOARDING_STEPS = [
  { id: 0, name: 'Welcome' },
  { id: 1, name: 'Name & Curso' },
  { id: 2, name: 'Goal' },
  { id: 3, name: 'Commitment' },
  { id: 4, name: 'Complete' },
];

export const CURSOS = ['1º Medio', '2º Medio', '3º Medio', '4º Medio'];

export const SUBJECTS = [
  { id: 'math', name: 'Matemáticas', emoji: '🔢' },
  { id: 'spanish', name: 'Lengua', emoji: '📚' },
  { id: 'english', name: 'Inglés', emoji: '🌍' },
  { id: 'science', name: 'Ciencias', emoji: '🔬' },
  { id: 'history', name: 'Historia', emoji: '⏰' },
  { id: 'biology', name: 'Biología', emoji: '🧬' },
  { id: 'chemistry', name: 'Química', emoji: '⚗️' },
  { id: 'physics', name: 'Física', emoji: '⚡' },
];

export const GOAL_TYPES = [
  { id: 'exam', title: 'Preparar exámenes', description: 'Quiero mejorar mis notas', emoji: '📝' },
  { id: 'improve', title: 'Mejorar notas', description: 'Necesito subir mi promedio', emoji: '📈' },
  { id: 'catchup', title: 'Recuperarme', description: 'Tengo materias atrasadas', emoji: '🚀' },
  { id: 'maintain', title: 'Mantener nivel', description: 'Quiero mantener mis notas', emoji: '⭐' },
];

export const TIME_COMMITMENTS = [
  { id: '5min', amount: '5 min', description: 'Pequeños descansos', tag: 'RECOMENDADO' },
  { id: '15min', amount: '15 min', description: 'Sesiones cortas', tag: 'RECOMENDADO' },
  { id: '30min', amount: '30 min', description: 'Sesiones moderadas', tag: null },
  { id: '1hour', amount: '1 hora', description: 'Estudio intenso', tag: null },
  { id: '2hours', amount: '2+ horas', description: 'Dedicación completa', tag: null },
];

export const DEFAULT_ONBOARDING_DATA: OnboardingData = {
  name: '',
  curso: '',
  goal: 5,
  subjects: [],
  goalType: '',
  dailyCommitment: '',
  completed: false,
};
