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

// Countdown simplificado para suavidad visual.
// - Si viene "seconds" se usa directamente y se actualiza cuando cambia.
// - Si no, se deriva de endTime con un intervalo fijo de 1s sin heurísticas que congelen.
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

  const preferSeconds = seconds !== undefined && seconds !== null;
  const [display, setDisplay] = useState<number>(() => {
    if (preferSeconds) return Math.max(0, Math.floor(Number(seconds) || 0));
    if (targetMs) return Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
    return 0;
  });

  // Actualizar cuando cambian los seconds externos
  useEffect(() => {
    if (!preferSeconds) return;
    setDisplay(Math.max(0, Math.floor(Number(seconds) || 0)));
  }, [seconds, preferSeconds]);

  // Intervalo simple basado en endTime
  useEffect(() => {
    if (preferSeconds) return; // sin intervalo, lo maneja el padre
    if (!targetMs) return;
    if (paused) return; // no avanzar en pausa
    const id = setInterval(() => {
      setDisplay(prev => {
        const calc = Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
        return calc;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [targetMs, preferSeconds, paused]);

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
