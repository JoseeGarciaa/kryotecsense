import { useState, useEffect, useCallback } from 'react';

export interface NotificationSoundSettings {
  enabled: boolean;
  volume: number;
}

export const useNotificationSound = () => {
  const [settings, setSettings] = useState<NotificationSoundSettings>({
    enabled: true,
    volume: 0.5
  });

  // Cargar configuración desde localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem('notificationSoundSettings');
    if (savedSettings) {
      try {
        setSettings(JSON.parse(savedSettings));
      } catch (error) {
        console.error('Error parsing notification sound settings:', error);
      }
    }
  }, []);

  // Guardar configuración en localStorage
  const updateSettings = useCallback((newSettings: Partial<NotificationSoundSettings>) => {
    const updatedSettings = { ...settings, ...newSettings };
    setSettings(updatedSettings);
    localStorage.setItem('notificationSoundSettings', JSON.stringify(updatedSettings));
  }, [settings]);

  // Función para reproducir sonido de notificación
  const playNotificationSound = useCallback(() => {
    if (!settings.enabled) return;

    try {
      // Crear un tono de notificación usando AudioContext
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Configurar el tono
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime); // Frecuencia de 800Hz
      oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1); // Cambiar a 600Hz
      oscillator.type = 'sine';

      // Configurar el volumen
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(settings.volume, audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      // Reproducir el sonido
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);

      // Limpiar después de reproducir
      setTimeout(() => {
        audioContext.close();
      }, 400);

    } catch (error) {
      console.error('Error playing notification sound:', error);
    }
  }, [settings]);

  return {
    settings,
    updateSettings,
    playNotificationSound,
    toggleSound: () => updateSettings({ enabled: !settings.enabled }),
    setVolume: (volume: number) => updateSettings({ volume: Math.max(0, Math.min(1, volume)) })
  };
};
