/**
 * Experience Layer NEMUP — Entrada al flujo guiado por el Motor
 * =================================================================
 * Punto de entrada ÚNICO a `current-objective` — se llamará a futuro desde
 * varios lugares (análisis terminado, notificaciones, repaso), así que
 * centralizarlo acá evita cambiar la ruta/navegación en muchos sitios.
 */

import { router } from 'expo-router';

export function startObjective(): void {
  router.push('/current-objective' as any);
}
