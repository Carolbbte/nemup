import { paletteExtras } from '@/theme/colors';

export interface OnboardingData {
  name: string;
  curso: string;
  nemCurrent: number; // NEM score 0-1000
  goal: number;       // NEM objetivo 0-1000
  subjects: string[];
  goalType: string;
  dailyCommitment: string;
  completed: boolean;
}

export interface OnboardingState {
  data: OnboardingData;
  currentStep: number; // 0-6 (7 pasos totales)
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
}

export const ONBOARDING_STEPS = [
  { id: 0, name: 'Welcome' },
  { id: 1, name: 'Profile' },
  { id: 2, name: 'How It Works' },
  { id: 3, name: 'Grade Selection' },
  { id: 4, name: 'Goal' },
  { id: 5, name: 'Vehicle Assigned' },
  { id: 6, name: 'First Mission' },
];

export const CURSOS = ['1º Medio', '2º Medio', '3º Medio', '4º Medio'];

export const VEHICLES = [
  { nivel: 1, name: 'City Car Sport',      nemMin: 0,   nemMax: 499,  color: paletteExtras.vehiculoGris },
  { nivel: 2, name: 'Hatchback Deportivo', nemMin: 500, nemMax: 649,  color: paletteExtras.vehiculoAzul },
  { nivel: 3, name: 'Deportivo Premium',   nemMin: 650, nemMax: 749,  color: paletteExtras.ambarFuerte },
  { nivel: 4, name: 'Superdeportivo',      nemMin: 750, nemMax: 849,  color: paletteExtras.rojoMedio },
  { nivel: 5, name: 'Hypercar Elite',      nemMin: 850, nemMax: 1000, color: paletteExtras.vehiculoVioleta },
];

export function getVehicleForNem(nem: number) {
  return VEHICLES.find(v => nem >= v.nemMin && nem <= v.nemMax) ?? VEHICLES[0];
}

export const SUBJECTS = [
  { id: 'math',      name: 'Matemáticas', emoji: '🔢' },
  { id: 'spanish',   name: 'Lengua',      emoji: '📚' },
  { id: 'english',   name: 'Inglés',      emoji: '🌍' },
  { id: 'science',   name: 'Ciencias',    emoji: '🔬' },
  { id: 'history',   name: 'Historia',    emoji: '⏰' },
  { id: 'biology',   name: 'Biología',    emoji: '🧬' },
  { id: 'chemistry', name: 'Química',     emoji: '⚗️' },
  { id: 'physics',   name: 'Física',      emoji: '⚡' },
];

export const GOAL_TYPES = [
  { id: 'exam',     title: 'Preparar exámenes', description: 'Quiero mejorar mis notas',       emoji: '📝' },
  { id: 'improve',  title: 'Mejorar notas',      description: 'Necesito subir mi promedio',     emoji: '📈' },
  { id: 'catchup',  title: 'Recuperarme',         description: 'Tengo materias atrasadas',       emoji: '🚀' },
  { id: 'maintain', title: 'Mantener nivel',      description: 'Quiero mantener mis notas',      emoji: '⭐' },
];

export const TIME_COMMITMENTS = [
  { id: '5min',   amount: '5 min',   description: 'Pequeños descansos',   tag: 'RECOMENDADO' },
  { id: '15min',  amount: '15 min',  description: 'Sesiones cortas',       tag: 'RECOMENDADO' },
  { id: '30min',  amount: '30 min',  description: 'Sesiones moderadas',    tag: null },
  { id: '1hour',  amount: '1 hora',  description: 'Estudio intenso',       tag: null },
  { id: '2hours', amount: '2+ horas',description: 'Dedicación completa',   tag: null },
];

export const DEFAULT_ONBOARDING_DATA: OnboardingData = {
  name: '',
  curso: '',
  nemCurrent: 550,
  goal: 700,
  subjects: [],
  goalType: '',
  dailyCommitment: '',
  completed: false,
};
