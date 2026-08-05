import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { tomarDecisionPedagogica, aplicarEvidencia } from '@/motor';
import type { PerfilConcepto, DecisionPedagogica, Evidencia } from '@/motor';
import { objetivoDeDecision } from '@/experience/contracts/objetivo';
import { crearExperiencia } from '@/experience/builder/builder';
import { rellenarContenido } from '@/experience/content/rellenar';
import type { Objetivo, Experiencia } from '@/experience/contracts/contratos';
import { perfilNuevo } from '@/experience/dev/perfilesFalsos';

/**
 * MotorContext — local-first (AsyncStorage como fuente de verdad), mismo
 * estilo que MissionsContext.tsx. Es el ÚNICO lugar que mezcla el motor
 * puro con React/AsyncStorage/Date.now() — `motor/` nunca importa React,
 * y la UI (current-objective.tsx, ExperienceRunner) nunca ve una
 * `DecisionPedagogica` ni llama al motor directamente, solo `Objetivo` y
 * `Experiencia`.
 *
 * TEMP: hoy hay UN solo `PerfilConcepto` activo, sembrado con
 * `perfilNuevo` de experience/dev/perfilesFalsos.ts si no hay nada
 * persistido — se reemplaza por la inicialización de un concepto real en
 * un hito futuro (no hoy).
 */

const PERFIL_KEY = 'nemup_motor_perfil_v1';

interface MotorContextType {
  hydrated: boolean;
  /** Del perfil activo — para la vista intro, entre misiones. Se
   *  recalcula en cada render a partir del perfil vivo. */
  objetivo: Objetivo;
  /** Congela la decisión vigente y arma la Experiencia sobre ella — ver
   *  el comentario grande más abajo sobre por qué se congela. */
  iniciarExperiencia: () => Experiencia;
  /** Aplica evidencia contra la decisión CONGELADA de iniciarExperiencia
   *  (nunca una recalculada), actualiza el perfil y persiste. Puede
   *  llamarse varias veces por experiencia (un bloque interactivo cada
   *  vez). No-op si no hay una experiencia en curso, o si la decisión
   *  congelada es la misión 'simulacion' (rolObjetivo 'global' — ver su
   *  propio comentario). */
  registrarEvidencia: (ev: Evidencia) => void;
  /** TEMP dev (chips) — reemplaza el perfil activo y persiste. */
  reiniciarPerfil: (semilla: PerfilConcepto) => void;
}

const MotorContext = createContext<MotorContextType | undefined>(undefined);

export const MotorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [perfil, setPerfil] = useState<PerfilConcepto>(perfilNuevo);
  const [hydrated, setHydrated] = useState(false);
  // Ref mirror — mismo motivo que MissionsContext.tsx: iniciarExperiencia/
  // registrarEvidencia son callbacks estables (deps mínimas) y necesitan
  // el perfil más fresco, no uno de un closure viejo.
  const perfilRef = useRef<PerfilConcepto>(perfilNuevo);
  // La decisión CONGELADA al llamar iniciarExperiencia — ver el
  // comentario de esa función sobre por qué no se recalcula.
  const decisionEnCursoRef = useRef<DecisionPedagogica | null>(null);

  const persist = useCallback((next: PerfilConcepto) => {
    perfilRef.current = next;
    setPerfil(next);
    AsyncStorage.setItem(PERFIL_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PERFIL_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            perfilRef.current = parsed;
            setPerfil(parsed);
          }
        }
      } catch {}
      setHydrated(true);
    })();
  }, []);

  const objetivo = objetivoDeDecision(tomarDecisionPedagogica(perfil, Date.now()), perfil);

  /**
   * Congela la decisión vigente en `decisionEnCursoRef` y arma la
   * Experiencia sobre ella — a partir de acá, la experiencia queda
   * amarrada a ESA decisión, no a una que se recalcule mientras el
   * estudiante todavía la está resolviendo.
   *
   * Por qué importa: si `registrarEvidencia` usara una decisión
   * recalculada sobre el perfil ya mutado (por una evidencia anterior
   * DENTRO de la misma experiencia), el objetivo podría cambiar a mitad
   * de camino y la evidencia caería en el eje equivocado. Amarrarla acá
   * garantiza que TODA la evidencia de esta experiencia caiga en el eje
   * correcto; el objetivo recién se refresca en la próxima llamada a
   * iniciarExperiencia().
   */
  const iniciarExperiencia = useCallback((): Experiencia => {
    const decision = tomarDecisionPedagogica(perfilRef.current, Date.now());
    decisionEnCursoRef.current = decision;
    const objetivoDeEstaExperiencia = objetivoDeDecision(decision, perfilRef.current);
    // El Builder arma la ESTRUCTURA (tonto, sin contenido); rellenarContenido
    // es un paso APARTE que la completa con contenido real del banco del
    // concepto — ver el comentario de esa función sobre por qué está
    // separado del Builder.
    return rellenarContenido(crearExperiencia(objetivoDeEstaExperiencia), objetivoDeEstaExperiencia);
  }, []);

  const registrarEvidencia = useCallback((ev: Evidencia) => {
    const decision = decisionEnCursoRef.current;
    if (!decision) return; // no hay experiencia en curso — no-op defensivo.
    // Guard: 'simulacion' (rolObjetivo 'global') escribiría confianza en
    // ejes[conceptoId], que no es un eje real (ver el comentario del
    // rename Mision->DecisionPedagogica) — no-op hasta que la experiencia
    // de simulación tenga su propio diseño.
    if (decision.rolObjetivo === 'global') return;
    persist(aplicarEvidencia(perfilRef.current, decision, ev, Date.now()));
  }, [persist]);

  const reiniciarPerfil = useCallback((semilla: PerfilConcepto) => {
    decisionEnCursoRef.current = null;
    persist(semilla);
  }, [persist]);

  return (
    <MotorContext.Provider value={{
      hydrated,
      objetivo,
      iniciarExperiencia,
      registrarEvidencia,
      reiniciarPerfil,
    }}>
      {children}
    </MotorContext.Provider>
  );
};

export const useMotor = () => {
  const ctx = useContext(MotorContext);
  if (!ctx) throw new Error('useMotor must be used within MotorProvider');
  return ctx;
};
