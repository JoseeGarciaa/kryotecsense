import { useState } from 'react';
import { apiServiceClient } from '../../../api/apiClient';
import { createUtcTimestamp, formatDateForDisplay } from '../../../shared/utils/dateUtils';

export const usePreAcondicionamiento = () => {
  // Estados específicos para Pre acondicionamiento
  const [navegacionPreAcondicionamiento, setNavegacionPreAcondicionamiento] = useState<string | null>(null);
  const [subgrupoPreAcondicionamiento, setSubgrupoPreAcondicionamiento] = useState<string | null>(null);
  const [tiempoPreAcondicionamiento, setTiempoPreAcondicionamiento] = useState<{[key: string]: number}>({});
  const [timersActivos, setTimersActivos] = useState<{[key: string]: number}>({});

  // Función para crear grupos de Pre acondicionamiento
  const crearGruposPreAcondicionamiento = (items: any[]) => {
    console.log('🔧 Creando grupos de Pre acondicionamiento:', items.length);
    
    const grupos = {
      congelacion: [] as any[],
      atemperamiento: [] as any[]
    };

    const norm = (txt?: string) => (txt || '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/-/g, ' ');

    items.forEach(item => {
      const subEstadoNorm = norm(item.sub_estado);
      if (subEstadoNorm.includes('congel')) {
        grupos.congelacion.push(item);
      } else if (subEstadoNorm.includes('atemper')) {
        grupos.atemperamiento.push(item);
      } else {
        // Default: cae en congelación hasta que reciba sub_estado válido
        grupos.congelacion.push(item);
      }
    });

    console.log('📊 Grupos creados:', {
      congelacion: grupos.congelacion.length,
      atemperamiento: grupos.atemperamiento.length
    });

    return grupos;
  };

  // Función para crear subgrupos por lote
  const crearSubgruposPorLote = (items: any[]) => {
    const subgrupos: {[key: string]: any[]} = {};
    
    items.forEach(item => {
      const lote = item.lote || item.numero_lote || 'Sin lote';
      const clave = `Lote ${lote}`;
      
      if (!subgrupos[clave]) {
        subgrupos[clave] = [];
      }
      subgrupos[clave].push(item);
    });
    
    return subgrupos;
  };

  // Función para crear cards de Pre acondicionamiento con navegación de 3 niveles
  const crearCardsPreAcondicionamiento = (items: any[]) => {
    console.log('🔧 Creando cards de Pre acondicionamiento:', { 
      items: items.length, 
      navegacionPreAcondicionamiento,
      subgrupoPreAcondicionamiento,
      itemsDetalle: items.map(i => ({ rfid: i.rfid, nombre: i.nombre_unidad, estado: i.estado, sub_estado: i.sub_estado }))
    });
    
    // NIVEL 1: Vista principal - mostrar CONGELACIÓN y ATEMPERAMIENTO
    if (!navegacionPreAcondicionamiento) {
      const grupos = crearGruposPreAcondicionamiento(items);
      const cards: any[] = [];
      
      // Card para Congelación (siempre visible)
      cards.push({
        id: 'congelacion-grupo-principal',
        category: 'TIC',
        title: 'CONGELACIÓN',
        description: `${grupos.congelacion.length} items en congelación`,
        assignee: [{name: 'Sistema', avatar: 'sistema'}],
        date: formatDateForDisplay(new Date().toISOString()),
        nombre_unidad: 'Congelación',
        rfid: 'CONGELACION-PRINCIPAL',
        estado: 'Pre acondicionamiento',
        sub_estado: 'Congelación',
        tipo: 'CONGELACION',
        tipo_base: 'CONGELACION',
        items_grupo: grupos.congelacion,
        es_grupo: true,
        es_proceso_principal: true,
        proceso_tipo: 'congelacion',
        nivel_grupo: 1
      });
      
      // Card para Atemperamiento (siempre visible)
      cards.push({
        id: 'atemperamiento-grupo-principal',
        category: 'TIC',
        title: 'ATEMPERAMIENTO',
        description: `${grupos.atemperamiento.length} items en atemperamiento`,
        assignee: [{name: 'Sistema', avatar: 'sistema'}],
        date: formatDateForDisplay(new Date().toISOString()),
        nombre_unidad: 'Atemperamiento',
        rfid: 'ATEMPERAMIENTO-PRINCIPAL',
        estado: 'Pre acondicionamiento',
        sub_estado: 'Atemperamiento',
        tipo: 'ATEMPERAMIENTO',
        tipo_base: 'ATEMPERAMIENTO',
        items_grupo: grupos.atemperamiento,
        es_grupo: true,
        es_proceso_principal: true,
        proceso_tipo: 'atemperamiento',
        nivel_grupo: 1
      });
      
      console.log('📋 Cards principales creadas:', cards.length);
      return cards;
    }
    
    // NIVEL 2: Mostrar lotes dentro del proceso seleccionado
    if (navegacionPreAcondicionamiento && !subgrupoPreAcondicionamiento) {
      const grupos = crearGruposPreAcondicionamiento(items);
      const cards: any[] = [];
      
      if (navegacionPreAcondicionamiento === 'CONGELACION') {
        const subgruposCongelacion = crearSubgruposPorLote(grupos.congelacion);
        
        Object.entries(subgruposCongelacion).forEach(([lote, itemsLote]) => {
          cards.push({
            id: `congelacion-lote-${lote.replace(/\s+/g, '-').toLowerCase()}`,
            category: 'TIC',
            title: lote,
            description: `${(itemsLote as any[]).length} TICs en congelación`,
            assignee: [{name: 'Sistema', avatar: 'sistema'}],
            date: formatDateForDisplay(new Date().toISOString()),
            nombre_unidad: `Congelación ${lote}`,
            rfid: `CONGELACION-${lote}`,
            estado: 'Pre acondicionamiento',
            sub_estado: 'Congelación',
            tipo: 'CONGELACION_LOTE',
            tipo_base: 'CONGELACION',
            items_grupo: itemsLote,
            es_grupo: true,
            es_lote: true,
            proceso_tipo: 'congelacion',
            nivel_grupo: 2,
            lote_nombre: lote
          });
        });
      } else if (navegacionPreAcondicionamiento === 'ATEMPERAMIENTO') {
        const subgruposAtemperamiento = crearSubgruposPorLote(grupos.atemperamiento);
        
        Object.entries(subgruposAtemperamiento).forEach(([lote, itemsLote]) => {
          cards.push({
            id: `atemperamiento-lote-${lote.replace(/\s+/g, '-').toLowerCase()}`,
            category: 'TIC',
            title: lote,
            description: `${(itemsLote as any[]).length} TICs en atemperamiento`,
            assignee: [{name: 'Sistema', avatar: 'sistema'}],
            date: formatDateForDisplay(new Date().toISOString()),
            nombre_unidad: `Atemperamiento ${lote}`,
            rfid: `ATEMPERAMIENTO-${lote}`,
            estado: 'Pre acondicionamiento',
            sub_estado: 'Atemperamiento',
            tipo: 'ATEMPERAMIENTO_LOTE',
            tipo_base: 'ATEMPERAMIENTO',
            items_grupo: itemsLote,
            es_grupo: true,
            es_lote: true,
            proceso_tipo: 'atemperamiento',
            nivel_grupo: 2,
            lote_nombre: lote
          });
        });
      }
      
      console.log(`📋 Cards de lotes creadas para ${navegacionPreAcondicionamiento}:`, cards.length);
      return cards;
    }
    
    // NIVEL 3: Mostrar TICs individuales dentro del lote seleccionado
    if (navegacionPreAcondicionamiento && subgrupoPreAcondicionamiento) {
      const grupos = crearGruposPreAcondicionamiento(items);
      const cards: any[] = [];
      
      const itemsDelProceso = navegacionPreAcondicionamiento === 'CONGELACION' 
        ? grupos.congelacion 
        : grupos.atemperamiento;
      
      const subgrupos = crearSubgruposPorLote(itemsDelProceso);
      const itemsDelLote = subgrupos[subgrupoPreAcondicionamiento] || [];
      
      itemsDelLote.forEach((item: any) => {
        cards.push({
          id: item.rfid || item.id,
          category: 'TIC',
          title: 'TIC',
          description: `TIC: ${item.rfid || item.nombre_unidad}\nTIEMPO EN CURSO`,
          assignee: [{name: 'Sistema', avatar: 'sistema'}],
          date: formatDateForDisplay(new Date().toISOString()),
          nombre_unidad: item.nombre_unidad,
          rfid: item.rfid,
          estado: item.estado,
          sub_estado: item.sub_estado,
          tipo: 'TIC_INDIVIDUAL',
          tipo_base: navegacionPreAcondicionamiento,
          es_grupo: false,
          es_individual: true,
          proceso_tipo: navegacionPreAcondicionamiento.toLowerCase(),
          nivel_grupo: 3,
          lote_nombre: subgrupoPreAcondicionamiento,
          // Datos adicionales del item
          ...item
        });
      });
      
      console.log(`📋 Cards individuales creadas para ${subgrupoPreAcondicionamiento}:`, cards.length);
      return cards;
    }
    
    return [];
  };

  // Función para mover TIC de congelación a atemperamiento
  const moverTicAAtempermiento = async (itemId: string, inventarioCompleto: any[], actualizarColumnas: () => Promise<void>) => {
    try {
      console.log(`🔄 Moviendo TIC ${itemId} de congelación a atemperamiento`);
      
      // Buscar el item en el inventario
      const item = inventarioCompleto.find(i => i.rfid === itemId || i.nombre_unidad === itemId);
      
      if (!item) {
        console.error(`❌ No se encontró TIC con ID: ${itemId}`);
        return;
      }

      // Regla: Solo mover a ATEMPERAMIENTO si viene de CONGELACIÓN
      const subAnterior = (item.sub_estado || '').toString().toUpperCase();
      if (!(subAnterior.includes('CONGELACION') || subAnterior.includes('CONGELACIÓN'))) {
        alert('⚠️ Solo pueden llegar a ATEMPERAMIENTO las TICs cuyo estado anterior fue CONGELACIÓN.');
        return;
      }
      
      // Crear actividad para cambiar sub-estado a atemperamiento
      const nuevaActividad = {
        rfid: item.rfid,
        actividad: 'Cambio de sub-estado',
        descripcion: `Movido de congelación a atemperamiento - cronómetro completado`,
        estado_anterior: item.estado || 'Pre acondicionamiento',
        sub_estado_anterior: 'Congelación',
        estado_nuevo: 'Pre acondicionamiento',
        sub_estado_nuevo: 'Atemperamiento'
      };
      
      const response = await apiServiceClient.post('/activities/actividades/', nuevaActividad);
      console.log(`✅ TIC ${itemId} movido a atemperamiento:`, response.data);
      
      // Actualizar columnas desde backend
      await actualizarColumnas();
      
      // Limpiar tiempo de Pre acondicionamiento
      setTiempoPreAcondicionamiento(prev => {
        const newTiempos = { ...prev };
        delete newTiempos[itemId];
        return newTiempos;
      });
      
    } catch (error: any) {
      console.error(`❌ Error moviendo TIC ${itemId} a atemperamiento:`, error);
      alert(`❌ Error al mover TIC a atemperamiento: ${error.response?.data?.detail || error.message}`);
    }
  };

  // Funciones para cronómetro
  const iniciarCronometro = (itemId: string, horas: number, minutos: number, inventarioCompleto: any[], actualizarColumnas: () => Promise<void>) => {
    const tiempoTotalMinutos = (horas * 60) + minutos;
    const tiempoMs = tiempoTotalMinutos * 60 * 1000;
    const tiempoFin = Date.now() + tiempoMs;
    
    // Guardar tiempo de finalización
    setTiempoPreAcondicionamiento(prev => ({
      ...prev,
      [itemId]: tiempoFin
    }));
    
    // Crear timer para notificación
    const timerId = window.setTimeout(() => {
      const confirmar = window.confirm(
        `⏰ ¡TIC ${itemId} ha completado la congelación!\n\n¿Desea mover este TIC a ATEMPERAMIENTO ahora?`
      );
      
      if (confirmar) {
        // Mover TIC de congelación a atemperamiento
        moverTicAAtempermiento(itemId, inventarioCompleto, actualizarColumnas);
      }
      
      // Limpiar el timer
      setTimersActivos(prev => {
        const newTimers = { ...prev };
        delete newTimers[itemId];
        return newTimers;
      });
    }, tiempoMs);
    
    // Guardar referencia del timer
    setTimersActivos(prev => ({
      ...prev,
      [itemId]: timerId
    }));
    
    console.log(`⏰ Cronómetro iniciado para ${itemId}: ${horas}h ${minutos}m`);
  };

  const detenerCronometro = (itemId: string) => {
    // Limpiar timer si existe
    if (timersActivos[itemId]) {
      clearTimeout(timersActivos[itemId]);
      setTimersActivos(prev => {
        const newTimers = { ...prev };
        delete newTimers[itemId];
        return newTimers;
      });
    }
    
    // Limpiar tiempo
    setTiempoPreAcondicionamiento(prev => {
      const newTiempos = { ...prev };
      delete newTiempos[itemId];
      return newTiempos;
    });
    
    console.log(`⏹️ Cronómetro detenido para ${itemId}`);
  };

  const obtenerTiempoRestante = (itemId: string): string => {
    const tiempoFin = tiempoPreAcondicionamiento[itemId];
    if (!tiempoFin) return '';
    
    const ahora = Date.now();
    const tiempoRestante = tiempoFin - ahora;
    
    if (tiempoRestante <= 0) {
      return 'Tiempo completado';
    }
    
    const horas = Math.floor(tiempoRestante / (1000 * 60 * 60));
    const minutos = Math.floor((tiempoRestante % (1000 * 60 * 60)) / (1000 * 60));
    const segundos = Math.floor((tiempoRestante % (1000 * 60)) / 1000);
    
    return `${horas.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`;
  };

  // Función para manejar clicks en cards
  const handleCardClick = (item: any) => {
    console.log('💆 Card Pre acondicionamiento clickeada:', {
      item,
      es_proceso_principal: item?.es_proceso_principal,
      es_lote: item?.es_lote,
      tipo: item?.tipo,
      navegacionPreAcondicionamiento,
      subgrupoPreAcondicionamiento
    });
    
    if (!item) {
      console.warn('⚠️ Card clickeada sin item');
      return;
    }

    // NIVEL 1 → NIVEL 2: Click en proceso principal (CONGELACIÓN/ATEMPERAMIENTO)
    if (item.es_proceso_principal) {
      console.log('🔄 Expandiendo proceso principal:', item.tipo);
      setNavegacionPreAcondicionamiento(item.tipo);
      return;
    }

    // NIVEL 2 → NIVEL 3: Click en lote
    if (item.es_lote) {
      console.log('🔄 Expandiendo lote:', item.lote_nombre);
      setSubgrupoPreAcondicionamiento(item.lote_nombre);
      return;
    }

    // NIVEL 3: Click en TIC individual - no hacer nada o mostrar detalles
    if (item.es_individual) {
      console.log('📋 TIC individual clickeado:', item.rfid);
      // Aquí podrías abrir un modal con detalles del TIC
      return;
    }
  };

  // Función para volver al nivel anterior (optimizada para ser instantánea)
  const volverNivelAnterior = () => {
    console.log('🔙 Volviendo nivel anterior:', { navegacionPreAcondicionamiento, subgrupoPreAcondicionamiento });
    
    if (subgrupoPreAcondicionamiento) {
      // NIVEL 3 → NIVEL 2: Volver de TICs individuales a lotes
      console.log('📤 Volviendo de TICs individuales a lotes');
      setSubgrupoPreAcondicionamiento(null);
    } else if (navegacionPreAcondicionamiento) {
      // NIVEL 2 → NIVEL 1: Volver de lotes a procesos principales
      console.log('📤 Volviendo de lotes a vista principal');
      setNavegacionPreAcondicionamiento(null);
    }
    
    // Forzar actualización después del cambio de estado
    setTimeout(() => {
      console.log('✅ Estado actualizado después de volver');
    }, 50);
  };

  return {
    // Estados
    navegacionPreAcondicionamiento,
    setNavegacionPreAcondicionamiento,
    subgrupoPreAcondicionamiento,
    setSubgrupoPreAcondicionamiento,
    tiempoPreAcondicionamiento,
    setTiempoPreAcondicionamiento,
    timersActivos,
    setTimersActivos,
    
    // Funciones
    crearGruposPreAcondicionamiento,
    crearSubgruposPorLote,
    crearCardsPreAcondicionamiento,
    moverTicAAtempermiento,
    iniciarCronometro,
    detenerCronometro,
    obtenerTiempoRestante,
    handleCardClick,
    volverNivelAnterior
  };
};
