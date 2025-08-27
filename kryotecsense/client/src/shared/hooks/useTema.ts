import { useState, useEffect } from 'react';
import { Tema } from '../types';

export const useTema = () => {
  const [tema, setTema] = useState<Tema>(() => {
    const temaGuardado = localStorage.getItem('tema') as Tema;
    return temaGuardado || 'claro';
  });

  useEffect(() => {
    localStorage.setItem('tema', tema);
    if (tema === 'oscuro') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [tema]);

  const alternarTema = () => {
    setTema(prev => prev === 'claro' ? 'oscuro' : 'claro');
  };

  return { tema, alternarTema };
};