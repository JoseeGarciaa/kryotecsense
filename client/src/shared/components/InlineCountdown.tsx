import React, { useEffect, useMemo, useRef, useState } from 'react';

type Props = {
  // Fecha objetivo (preferido). Puede ser Date o string ISO.
  endTime?: Date | string | null;
  // Segundos restantes como respaldo si no hay endTime.
  seconds?: number;
  // Pausado: no decrementar ni recalcular; mostrar estático.
  paused?: boolean;
  // Formateador externo (HH:MM:SS o MM:SS)
  format: (s: number) => string;
  // Callback opcional al llegar a cero
  onZero?: () => void;
  className?: string;
};

// Countdown ligero y determinístico:
// - Si viene "seconds", lo usamos como fuente de verdad (suele venir ya
//   sincronizado por el contexto y evita saltos hacia arriba). No creamos
//   intervalo interno; el padre actualizará los segundos cada tick.
// - Si NO viene "seconds", recalculamos desde endTime cada segundo.
const InlineCountdown: React.FC<Props> = ({ endTime, seconds, paused = false, format, onZero, className }) => {
  const targetMs = useMemo(() => {
    if (!endTime) return null;
    try {
      const d = endTime instanceof Date ? endTime : new Date(endTime);
      const ms = d.getTime();
      return Number.isFinite(ms) ? ms : null;
    } catch {
      return null;
    }
  }, [endTime]);

  // Estado interno de segundos visibles
  const preferSeconds = seconds !== undefined && seconds !== null;
  const [display, setDisplay] = useState<number>(() => {
    if (preferSeconds) {
      return Math.max(0, Math.floor((seconds as number) || 0));
    }
    if (targetMs) {
      return Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
    }
    return 0;
  });

  // Mantener "seconds" como respaldo en un ref para detectar cambios fuertes
  const secondsRef = useRef<number>(seconds ?? 0);
  useEffect(() => { secondsRef.current = seconds ?? 0; }, [seconds]);

  // Sincronización cuando cambian props:
  // 1) Si preferimos seconds, seguir ese valor (con suavizado para evitar saltos hacia arriba pequeños)
  useEffect(() => {
    if (!preferSeconds) return;
    const next = Math.max(0, Math.floor(secondsRef.current));
    setDisplay(prev => {
  // Con seconds como fuente de verdad, reflejar exactamente el valor entrante
  // para evitar retrasos; el hook del contexto ya suaviza y corrige drift.
  return next;
    });
  }, [preferSeconds, paused, seconds]);

  // 2) Si no hay seconds, usar endTime y recalcular de ser necesario
  useEffect(() => {
    if (preferSeconds) return;
    if (paused) {
      // En pausa, mostrar el cálculo actual desde endTime (estático)
      if (targetMs) {
        const calc = Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
        setDisplay(calc);
      }
      return;
    }
    if (targetMs) {
      const calc = Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
      setDisplay(prev => {
        // Suprimir incrementos pequeños; limitar caídas a -1 por tick
        if (calc > prev && calc - prev < 5) return prev;
        if (calc < prev && prev - calc > 1) return Math.max(0, prev - 1);
        return calc;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMs, preferSeconds, paused]);

  // Tick de 1s: solo necesario cuando NO tenemos seconds (endTime fallback)
  useEffect(() => {
    if (paused || preferSeconds) {
      return; // Sin intervalo si está en pausa o si el padre provee seconds
    }
    const id = setInterval(() => {
      setDisplay(prev => {
        if (targetMs) {
          const calc = Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
          // Suprimir incrementos pequeños; limitar caídas a -1 por tick
          if (calc > prev && calc - prev < 5) return prev;
          if (calc < prev && prev - calc > 1) return Math.max(0, prev - 1);
          return calc;
        }
        return 0;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [targetMs, paused, preferSeconds]);

  // Disparar onZero una sola vez
  const firedRef = useRef(false);
  useEffect(() => {
    if (display === 0 && !firedRef.current) {
      firedRef.current = true;
      onZero?.();
    } else if (display > 0) {
      firedRef.current = false;
    }
  }, [display, onZero]);

  return <span className={className}>{format(display)}</span>;
};

export default InlineCountdown;
