import { useState } from 'react';
import { apiServiceClient } from '../../../api/apiClient';
import { createUtcTimestamp } from '../../../shared/utils/dateUtils';

/**
 * Hook para gestionar el proceso de ACONDICIONAMIENTO (Armado de cajas completas)
 * 
 * PROCESO DE ARMADO:
 * - Una caja completa = 1 caja + 1 VIP + 6 TICs atemperadas
 * - Condiciones para armar:
 *   * Cajas y VIPs: Disponibles en bodega
 *   * TICs: Deben estar atemperadas Y haber completado su cronómetro
 * 
 * SUB-ESTADOS:
 * - Ensamblaje: Componentes escaneados y listos para armar cajas completas
 * - Listo para despacho: Cajas ya armadas y completas (1 caja + 1 VIP + 6 TICs)
 */
export const useAcondicionamiento = () => {
  // Estados específicos para acondicionamiento
  const [navegacionAcondicionamiento, setNavegacionAcondicionamiento] = useState<string | null>(null);
  const [subgrupoAcondicionamiento, setSubgrupoAcondicionamiento] = useState<string | null>(null);
  
  // Estados para el proceso de armado
  const [componentesEscaneados, setComponentesEscaneados] = useState<{
    cajas: any[];
    vips: any[];
    tics: any[];
  }>({ cajas: [], vips: [], tics: [] });
  
  const [procesandoArmado, setProcesandoArmado] = useState(false);

  // Función para crear grupos principales de acondicionamiento
  const crearGruposPrincipales = (items: any[]) => {
    const grupos: {[key: string]: any[]} = {};
    
    items.forEach(item => {
      const nombre = item.nombre_unidad?.toUpperCase() || '';
      let tipoGrupo = 'OTROS';
      
      if (nombre.includes('TIC')) {
        tipoGrupo = 'TICS';
      } else if (nombre.includes('CAJA')) {
        tipoGrupo = 'CAJAS';
      } else if (nombre.includes('VIP')) {
        tipoGrupo = 'VIPS';
      }
      
      if (!grupos[tipoGrupo]) {
        grupos[tipoGrupo] = [];
      }
      grupos[tipoGrupo].push(item);
    });

    return grupos;
  };

  // Función para crear subgrupos por sub-estado
  const crearSubgruposPorSubEstado = (items: any[]) => {
    const subgrupos: {[key: string]: any[]} = {};
    
    items.forEach(item => {
      const subEstado = item.sub_estado || 'Sin sub-estado';
      
      if (!subgrupos[subEstado]) {
        subgrupos[subEstado] = [];
      }
      subgrupos[subEstado].push(item);
    });
    
    return subgrupos;
  };

  // Función para crear cards de grupos principales de acondicionamiento
  const crearCardsGruposAcondicionamiento = (items: any[]) => {
    
    if (navegacionAcondicionamiento && !subgrupoAcondicionamiento) {
      // Mostrar subgrupos del grupo expandido (sub-estados)
      let itemsFiltrados: any[] = [];
      
      if (navegacionAcondicionamiento === 'Ensamblaje') {
        // Filtrar items que están en ensamblaje (armado de cajas completas)
        itemsFiltrados = items.filter(item => 
          item.sub_estado === 'Ensamblaje' ||
          (item.estado === 'Acondicionamiento' && item.sub_estado === 'Ensamblaje')
        );
      } else if (navegacionAcondicionamiento === 'Listo para despacho') {
        // Filtrar items que están listos para despacho (cajas ya armadas)
        itemsFiltrados = items.filter(item => 
          item.sub_estado === 'Listo para despacho' ||
          (item.estado === 'Acondicionamiento' && item.sub_estado === 'Listo para despacho')
        );
      }
      
      const subgrupos = crearSubgruposPorSubEstado(itemsFiltrados);
      const cards: any[] = [];
      
      Object.entries(subgrupos).forEach(([subEstado, itemsSubEstado]) => {
        cards.push({
          id: `${navegacionAcondicionamiento.toLowerCase().replace(/\s+/g, '-')}-${subEstado.replace(/\s+/g, '-').toLowerCase()}`,
          category: navegacionAcondicionamiento,
          title: subEstado,
          description: `${(itemsSubEstado as any[]).length} items`,
          assignee: [{name: 'Sistema', avatar: 'sistema'}],
          date: new Date().toLocaleDateString(),
          nombre_unidad: `${navegacionAcondicionamiento} ${subEstado}`,
          rfid: `${navegacionAcondicionamiento}-${subEstado}`,
          estado: 'Acondicionamiento',
          sub_estado: subEstado,
          tipo: `${navegacionAcondicionamiento}_SUBGRUPO`,
          tipo_base: navegacionAcondicionamiento,
          items_grupo: itemsSubEstado,
          es_grupo: true,
          es_subgrupo: true,
          nivel_grupo: 2,
          sub_estado_nombre: subEstado
        });
      });
      
      console.log(`📋 Cards de subgrupos creadas para ${navegacionAcondicionamiento}:`, cards.length);
      return cards;
    }
    
    if (navegacionAcondicionamiento && subgrupoAcondicionamiento) {
      // Mostrar items individuales del subgrupo
      let itemsFiltrados: any[] = [];
      
      if (navegacionAcondicionamiento === 'Ensamblaje') {
        itemsFiltrados = items.filter(item => 
          item.sub_estado === 'Ensamblaje' ||
          (item.estado === 'Acondicionamiento' && item.sub_estado === 'Ensamblaje')
        );
      } else if (navegacionAcondicionamiento === 'Listo para despacho') {
        itemsFiltrados = items.filter(item => 
          item.sub_estado === 'Listo para despacho' ||
          (item.estado === 'Acondicionamiento' && item.sub_estado === 'Listo para despacho')
        );
      }
      
      const subgrupos = crearSubgruposPorSubEstado(itemsFiltrados);
      const itemsDelSubgrupo = subgrupos[subgrupoAcondicionamiento] || [];
      const cards: any[] = [];
      
      itemsDelSubgrupo.forEach((item: any) => {
        cards.push({
          id: item.rfid || item.id,
          category: navegacionAcondicionamiento,
          title: item.nombre_unidad || 'Item',
          description: `RFID: ${item.rfid}\nSub-estado: ${item.sub_estado || 'N/A'}`,
          assignee: [{name: 'Sistema', avatar: 'sistema'}],
          date: new Date().toLocaleDateString(),
          nombre_unidad: item.nombre_unidad,
          rfid: item.rfid,
          estado: item.estado,
          sub_estado: item.sub_estado,
          tipo: 'ITEM_INDIVIDUAL',
          tipo_base: navegacionAcondicionamiento,
          es_grupo: false,
          es_individual: true,
          nivel_grupo: 3,
          sub_estado_nombre: subgrupoAcondicionamiento,
          // Datos adicionales del item
          ...item
        });
      });
      
      console.log(`📋 Cards individuales creadas para ${subgrupoAcondicionamiento}:`, cards.length);
      return cards;
    }
    
    // Vista principal - mostrar las dos secciones específicas
    const cards: any[] = [];
    
    // Filtrar items para Ensamblaje (donde se arman las cajas completas)
    const itemsEnsamblaje = items.filter(item => 
      item.sub_estado === 'Ensamblaje' || 
      (item.estado === 'Acondicionamiento' && item.sub_estado === 'Ensamblaje')
    );
    
    // Filtrar items Listos para despacho (cajas ya armadas completamente)
    const itemsListoDespacho = items.filter(item => 
      item.sub_estado === 'Listo para despacho' || 
      (item.estado === 'Acondicionamiento' && item.sub_estado === 'Listo para despacho')
    );
    
    // Card para Ensamblaje (armado de cajas completas)
    cards.push({
      id: 'ensamblaje-grupo',
      category: 'ACONDICIONAMIENTO',
      title: 'Ensamblaje',
      description: `Componentes para armar: ${itemsEnsamblaje.length} items`,
      assignee: [{name: 'Sistema', avatar: 'sistema'}],
      date: new Date().toLocaleDateString(),
      nombre_unidad: 'Ensamblaje',
      rfid: 'ENSAMBLAJE-GRUPO',
      estado: 'Acondicionamiento',
      sub_estado: 'Ensamblaje',
      tipo: 'ENSAMBLAJE',
      tipo_base: 'Ensamblaje',
      items_grupo: itemsEnsamblaje,
      es_grupo: true,
      es_grupo_principal: true,
      nivel_grupo: 1,
      color_clase: 'bg-blue-50 border-blue-200',
  descripcion_armado: 'Cajas y VIPs (de bodega) + TICs atemperadas (cronómetro completado)'
    });
    
    // Card para Listo para despacho (cajas armadas: 1 caja + 1 vip + 6 tics)
    cards.push({
      id: 'listo-despacho-grupo',
      category: 'ACONDICIONAMIENTO',
      title: 'Listo para despacho',
      description: `Cajas completas armadas: ${itemsListoDespacho.length} cajas`,
      assignee: [{name: 'Sistema', avatar: 'sistema'}],
      date: new Date().toLocaleDateString(),
      nombre_unidad: 'Listo para despacho',
      rfid: 'LISTO-DESPACHO-GRUPO',
      estado: 'Acondicionamiento',
      sub_estado: 'Listo para despacho',
      tipo: 'LISTO_DESPACHO',
      tipo_base: 'Listo para despacho',
      items_grupo: itemsListoDespacho,
      es_grupo: true,
      es_grupo_principal: true,
      nivel_grupo: 1,
      color_clase: 'bg-orange-50 border-orange-200',
      descripcion_armado: 'Cada caja contiene: 1 caja + 1 VIP + 6 TICs atemperadas'
    });
    
    return cards;
  };

  // Función para manejar clicks en cards de acondicionamiento
  const handleCardClickAcondicionamiento = (item: any) => {
    if (!item) {
      console.warn('⚠️ Card clickeada sin item');
      return;
    }

    // NIVEL 1 → NIVEL 2: Click en grupo principal (TICs para Congelamiento/Atemperamiento)
    if (item.es_grupo_principal) {
      console.log('🔄 Expandiendo grupo principal acondicionamiento:', item.tipo_base);
      
      setNavegacionAcondicionamiento(item.tipo_base);
      setSubgrupoAcondicionamiento(null);
      return;
    }

    // NIVEL 2 → NIVEL 3: Click en subgrupo
    if (item.es_subgrupo) {
      setSubgrupoAcondicionamiento(item.sub_estado_nombre);
      return;
    }

    // NIVEL 3: Click en item individual
    if (item.es_individual) {
      console.log('📋 Item individual acondicionamiento clickeado:', item.rfid);
      return;
    }
  };

  // Función para volver al nivel anterior
  const volverNivelAnteriorAcondicionamiento = () => {
    console.log('🔙 Volviendo nivel anterior acondicionamiento:', { navegacionAcondicionamiento, subgrupoAcondicionamiento });
    
    requestAnimationFrame(() => {
      if (subgrupoAcondicionamiento) {
        // NIVEL 3 → NIVEL 2: Volver de items individuales a subgrupos
        setSubgrupoAcondicionamiento(null);
      } else if (navegacionAcondicionamiento) {
        // NIVEL 2 → NIVEL 1: Volver de subgrupos a grupos principales
        setNavegacionAcondicionamiento(null);
      }
    });
  };

  // ============ FUNCIONES ESPECÍFICAS DE ACONDICIONAMIENTO ============

  /**
   * Valida si una TIC está lista para acondicionamiento
  * Debe estar atemperada Y haber completado su cronómetro
   */
  const validarTicParaAcondicionamiento = (tic: any, timersGlobales?: any[]) => {
    // Debe estar en estado atemperado
    if (tic.estado !== 'Atemperamiento' && tic.sub_estado !== 'Atemperado') {
      return { valida: false, razon: 'TIC no está atemperada' };
    }

  // Verificar que no tenga cronómetros activos
    if (timersGlobales) {
      const tieneTimerActivo = timersGlobales.some(timer => 
        timer.nombre === tic.nombre_unidad || 
        timer.nombre === tic.id?.toString() ||
        timer.nombre.includes(tic.nombre_unidad?.replace('TIC', '') || '')
      );
      
      if (tieneTimerActivo) {
        return { valida: false, razon: 'TIC tiene cronómetro activo' };
      }
    }

    return { valida: true, razon: 'TIC lista para acondicionamiento' };
  };

  /**
   * Obtiene componentes disponibles desde bodega (cajas y VIPs)
   */
  const obtenerComponentesDesdeBodega = async () => {
    try {
      console.log('📦 Obteniendo componentes desde bodega...');
      
      const response = await apiServiceClient.get('/inventory/inventario/');
      const inventario = Array.isArray(response.data) ? response.data : [];
      
      // Filtrar cajas y VIPs que estén en bodega y disponibles
      const cajas = inventario.filter((item: any) => 
        item.estado === 'En bodega' && 
        item.sub_estado === 'Disponible' &&
        item.categoria?.toUpperCase().includes('CAJA')
      );
      
      const vips = inventario.filter((item: any) => 
        item.estado === 'En bodega' && 
        item.sub_estado === 'Disponible' &&
        item.categoria?.toUpperCase().includes('VIP')
      );
      
      console.log(`📦 Componentes encontrados: ${cajas.length} cajas, ${vips.length} VIPs`);
      
      return { cajas, vips };
      
    } catch (error: any) {
      console.error('❌ Error obteniendo componentes de bodega:', error);
      throw new Error(`Error obteniendo componentes: ${error.response?.data?.detail || error.message}`);
    }
  };

  /**
   * Procesa el escaneo de componentes para ensamblaje
   */
  const procesarEscaneoComponentes = async (codigoEscaneado: string) => {
    try {
      console.log(`🔍 Procesando escaneo: ${codigoEscaneado}`);
      
      // Buscar el item en el inventario
      const response = await apiServiceClient.get('/inventory/inventario/');
      const inventario = Array.isArray(response.data) ? response.data : [];
      
      const itemEncontrado = inventario.find((item: any) => 
        item.rfid === codigoEscaneado || 
        item.nombre_unidad === codigoEscaneado ||
        item.id?.toString() === codigoEscaneado
      );
      
      if (!itemEncontrado) {
        throw new Error(`Item no encontrado: ${codigoEscaneado}`);
      }
      
      // Determinar tipo de componente
      const categoria = itemEncontrado.categoria?.toUpperCase() || '';
      const nombre = itemEncontrado.nombre_unidad?.toUpperCase() || '';
      
      if (categoria.includes('CAJA') || nombre.includes('CAJA')) {
        // Es una caja
        if (itemEncontrado.estado !== 'En bodega' || itemEncontrado.sub_estado !== 'Disponible') {
          throw new Error(`La caja ${codigoEscaneado} no está disponible en bodega`);
        }
        
        setComponentesEscaneados(prev => ({
          ...prev,
          cajas: [...prev.cajas, itemEncontrado]
        }));
        
        return { tipo: 'CAJA', item: itemEncontrado, mensaje: 'Caja escaneada correctamente' };
        
      } else if (categoria.includes('VIP') || nombre.includes('VIP')) {
        // Es un VIP
        if (itemEncontrado.estado !== 'En bodega' || itemEncontrado.sub_estado !== 'Disponible') {
          throw new Error(`El VIP ${codigoEscaneado} no está disponible en bodega`);
        }
        
        setComponentesEscaneados(prev => ({
          ...prev,
          vips: [...prev.vips, itemEncontrado]
        }));
        
        return { tipo: 'VIP', item: itemEncontrado, mensaje: 'VIP escaneado correctamente' };
        
      } else if (categoria.includes('TIC') || nombre.includes('TIC')) {
        // Es una TIC - validar que esté atemperada
        const validacion = validarTicParaAcondicionamiento(itemEncontrado);
        
        if (!validacion.valida) {
          throw new Error(`TIC ${codigoEscaneado}: ${validacion.razon}`);
        }
        
        setComponentesEscaneados(prev => ({
          ...prev,
          tics: [...prev.tics, itemEncontrado]
        }));
        
        return { tipo: 'TIC', item: itemEncontrado, mensaje: 'TIC atemperada escaneada correctamente' };
        
      } else {
        throw new Error(`Tipo de componente no reconocido: ${codigoEscaneado}`);
      }
      
    } catch (error: any) {
      console.error('❌ Error procesando escaneo:', error);
      throw error;
    }
  };

  /**
   * Arma una caja completa (1 caja + 1 VIP + 6 TICs)
   */
  const armarCajaCompleta = async () => {
    try {
      setProcesandoArmado(true);
      console.log('🔧 Iniciando armado de caja completa...');
      
      const { cajas, vips, tics } = componentesEscaneados;
      
      // Validar que tenemos los componentes necesarios
      if (cajas.length === 0) {
        throw new Error('No hay cajas escaneadas');
      }
      if (vips.length === 0) {
        throw new Error('No hay VIPs escaneados');
      }
      if (tics.length < 6) {
        throw new Error(`Se necesitan 6 TICs, solo hay ${tics.length} escaneadas`);
      }
      
      // Tomar los primeros componentes
      const caja = cajas[0];
      const vip = vips[0];
      const ticsParaCaja = tics.slice(0, 6);
      
      console.log(`🔧 Armando caja: ${caja.nombre_unidad} + ${vip.nombre_unidad} + ${ticsParaCaja.length} TICs`);
      
      // Crear las operaciones para cada componente
      const operaciones = [];
      
      // Actualizar la caja a "Listo para despacho"
      operaciones.push(
        apiServiceClient.put(`/inventory/inventario/${caja.id}`, {
          ...caja,
          estado: 'Acondicionamiento',
          sub_estado: 'Listo para despacho',
          ultima_actualizacion: createUtcTimestamp()
        })
      );
      
      // Actualizar el VIP a "Listo para despacho"
      operaciones.push(
        apiServiceClient.put(`/inventory/inventario/${vip.id}`, {
          ...vip,
          estado: 'Acondicionamiento',
          sub_estado: 'Listo para despacho',
          ultima_actualizacion: createUtcTimestamp()
        })
      );
      
      // Actualizar las TICs a "Listo para despacho"
      ticsParaCaja.forEach(tic => {
        operaciones.push(
          apiServiceClient.put(`/inventory/inventario/${tic.id}`, {
            ...tic,
            estado: 'Acondicionamiento',
            sub_estado: 'Listo para despacho',
            ultima_actualizacion: createUtcTimestamp()
          })
        );
      });
      
      // Crear actividades de armado
      operaciones.push(
        apiServiceClient.post('/activities/actividades/', {
          inventario_id: caja.id,
          usuario_id: 1,
          descripcion: `Caja armada: ${caja.nombre_unidad} + ${vip.nombre_unidad} + 6 TICs`,
          estado_nuevo: 'Acondicionamiento',
          sub_estado_nuevo: 'Listo para despacho'
        })
      );
      
      // Ejecutar todas las operaciones en paralelo
      await Promise.allSettled(operaciones);
      
      // Actualizar el estado local - remover componentes usados
      setComponentesEscaneados(prev => ({
        cajas: prev.cajas.slice(1),
        vips: prev.vips.slice(1),
        tics: prev.tics.slice(6)
      }));
      
      console.log('✅ Caja armada exitosamente');
      
      return {
        success: true,
        mensaje: `✅ Caja armada: ${caja.nombre_unidad} + ${vip.nombre_unidad} + 6 TICs`,
        componentes: { caja, vip, tics: ticsParaCaja }
      };
      
    } catch (error: any) {
      console.error('❌ Error armando caja:', error);
      throw error;
    } finally {
      setProcesandoArmado(false);
    }
  };

  /**
   * Mueve TICs atemperadas a ensamblaje
   */
  const moverTicsAEnsamblaje = async (ticsSeleccionadas: any[], timersGlobales: any[] = []) => {
    try {
      console.log('🔧 Moviendo TICs atemperadas a ensamblaje...');
      
      // Validar cada TIC
      for (const tic of ticsSeleccionadas) {
        const validacion = validarTicParaAcondicionamiento(tic, timersGlobales);
        if (!validacion.valida) {
          throw new Error(`${tic.nombre_unidad}: ${validacion.razon}`);
        }
      }
      
      // Mover todas las TICs a ensamblaje en paralelo
      const operaciones = ticsSeleccionadas.map(tic => 
        apiServiceClient.put(`/inventory/inventario/${tic.id}`, {
          ...tic,
          estado: 'Acondicionamiento',
          sub_estado: 'Ensamblaje',
          ultima_actualizacion: createUtcTimestamp()
        })
      );
      
      // Crear actividades
      const actividades = ticsSeleccionadas.map(tic =>
        apiServiceClient.post('/activities/actividades/', {
          inventario_id: tic.id,
          usuario_id: 1,
          descripcion: `${tic.nombre_unidad} movido a ensamblaje (atemperamiento completado)`,
          estado_nuevo: 'Acondicionamiento',
          sub_estado_nuevo: 'Ensamblaje'
        })
      );
      
      await Promise.allSettled([...operaciones, ...actividades]);
      
      console.log(`✅ ${ticsSeleccionadas.length} TICs movidas a ensamblaje`);
      
      return true;
      
    } catch (error: any) {
      console.error('❌ Error moviendo TICs a ensamblaje:', error);
      throw error;
    }
  };

  /**
   * Limpia los componentes escaneados
   */
  const limpiarComponentesEscaneados = () => {
    setComponentesEscaneados({ cajas: [], vips: [], tics: [] });
  };

  return {
    // Estados
    navegacionAcondicionamiento,
    setNavegacionAcondicionamiento,
    subgrupoAcondicionamiento,
    setSubgrupoAcondicionamiento,
    componentesEscaneados,
    procesandoArmado,
    
    // Funciones existentes
    crearGruposPrincipales,
    crearSubgruposPorSubEstado,
    crearCardsGruposAcondicionamiento,
    handleCardClickAcondicionamiento,
    volverNivelAnteriorAcondicionamiento,
    
    // Nuevas funciones de acondicionamiento
    validarTicParaAcondicionamiento,
    obtenerComponentesDesdeBodega,
    procesarEscaneoComponentes,
    armarCajaCompleta,
    moverTicsAEnsamblaje,
    limpiarComponentesEscaneados
  };
};
