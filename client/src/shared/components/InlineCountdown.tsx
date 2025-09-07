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

// ===== Ticker global sincronizado (evita drift y desfases visuales) =====
// Un único intervalo alineado al borde de segundo notifica a todos los countdowns.
let globalSubscribers: Set<() => void> | null = null;
let globalInterval: any = null;
const ensureGlobalTicker = () => {
  if (!globalSubscribers) globalSubscribers = new Set();
  if (globalInterval || !globalSubscribers.size) return;
  const schedule = () => {
    const now = Date.now();
    const msToNext = 1000 - (now % 1000) + 5; // pequeño buffer
    setTimeout(() => {
      // primer tick alineado
      globalSubscribers?.forEach(cb => { try { cb(); } catch { /* no-op */ } });
      globalInterval = setInterval(() => {
        globalSubscribers?.forEach(cb => { try { cb(); } catch { /* no-op */ } });
      }, 1000);
    }, msToNext);
  };
  schedule();
};
const stopGlobalTickerIfIdle = () => {
  if (globalSubscribers && globalSubscribers.size === 0 && globalInterval) {
    clearInterval(globalInterval);
    globalInterval = null;
  }
};

// Countdown sincronizado:
// - Si se pasa "seconds" usamos ese valor (padre controla) y lo mostramos tal cual.
// - Si no, derivamos del endTime cada tick global (sin drift acumulado por múltiples intervalos).
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

  // Suscribirse al ticker global cuando usamos endTime (no seconds) y no está pausado
  useEffect(() => {
    if (preferSeconds) return; // controlado externamente
    if (!targetMs) return;
    if (!globalSubscribers) globalSubscribers = new Set();
    const callback = () => {
      if (paused) return; // mantener valor mientras esté pausado
      setDisplay(Math.max(0, Math.floor((targetMs - Date.now()) / 1000)));
    };
    globalSubscribers.add(callback);
    ensureGlobalTicker();
    // Ejecutar inmediatamente para alinear al primer render
    callback();
    return () => {
      globalSubscribers?.delete(callback);
      stopGlobalTickerIfIdle();
    };
  }, [targetMs, preferSeconds, paused]);

  // Si se pausa y luego reanuda, recalcular inmediatamente
  useEffect(() => {
    if (preferSeconds) return;
    if (!targetMs) return;
    if (!paused) {
      setDisplay(Math.max(0, Math.floor((targetMs - Date.now()) / 1000)));
    }
  }, [paused, targetMs, preferSeconds]);

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
