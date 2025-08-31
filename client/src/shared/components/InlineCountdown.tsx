import React, { useEffect, useMemo, useRef, useState } from 'react';

type Props = {
  // Fecha objetivo (preferido). Puede ser Date o string ISO.
  endTime?: Date | string | null;
  // Segundos restantes como respaldo si no hay endTime.
  seconds?: number;
  // Formateador externo (HH:MM:SS o MM:SS)
  format: (s: number) => string;
  // Callback opcional al llegar a cero
  onZero?: () => void;
  className?: string;
};

// Countdown ligero y determinístico que recalcula desde endTime cada segundo.
// Si no hay endTime, usa "seconds" y decrementa localmente.
const InlineCountdown: React.FC<Props> = ({ endTime, seconds, format, onZero, className }) => {
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
  const [display, setDisplay] = useState<number>(() => {
    if (targetMs) {
      return Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
    }
    return Math.max(0, Math.floor(seconds ?? 0));
  });

  // Mantener "seconds" como respaldo en un ref para detectar cambios fuertes
  const secondsRef = useRef<number>(seconds ?? 0);
  useEffect(() => { secondsRef.current = seconds ?? 0; }, [seconds]);

  // Sincronizar display cuando cambien las props de manera significativa
  useEffect(() => {
    if (targetMs) {
      const calc = Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
      // Aceptar cambios cuando la diferencia sea notable o se reinicie
      if (display === 0 || Math.abs(calc - display) >= 2 || calc > display) {
        setDisplay(calc);
      }
    } else if (typeof secondsRef.current === 'number') {
      const s = Math.max(0, Math.floor(secondsRef.current));
      if (display === 0 || Math.abs(s - display) >= 2 || s > display) {
        setDisplay(s);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMs]);

  // Tick de 1s: si hay endTime, recalcular; si no, decrementar localmente
  useEffect(() => {
    const id = setInterval(() => {
      setDisplay(prev => {
        if (targetMs) {
          const calc = Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
          return calc;
        }
        return prev > 0 ? prev - 1 : 0;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [targetMs]);

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
