import { useTimerContext } from '../../../contexts/TimerContext';

// Re-export subset for TimerDisplayGlobal (simplified after removing per-timer controls)
export const useTimer = () => {
	const { timers, formatearTiempo } = useTimerContext();
	return { timers, formatearTiempo };
};
