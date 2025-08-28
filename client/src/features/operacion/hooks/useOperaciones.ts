import { useState, useEffect, useCallback } from 'react';
import { apiServiceClient } from '../../../api/apiClient';
import { usePreAcondicionamiento } from './usePreAcondicionamiento';
import { useBodega } from './useBodega';
import { useAcondicionamiento } from './useAcondicionamiento';
import { useEnvio } from './useEnvio';
import { useDevolucion } from '../../devolucion/hooks/useDevolucion';
import { useWebSocket } from './useWebSocket';
import { useTimerContext } from '../../../contexts/TimerContext';
import { Item } from '../types';
import { createUtcTimestamp, formatDateForDisplay } from '../../../shared/utils/dateUtils';

export interface Column {
  name: string;
  items: Item[];
}

export const useOperaciones = () => {
  const [actualizandoDatos, setActualizandoDatos] = useState(false);
  const [columns, setColumns] = useState<{ [key: string]: Column }>({
    'en-bodega': {
      name: 'En bodega',
      items: []
    },
    'pre-acondicionamiento': {
      name: 'Registrar pre acondicionamiento',
      items: []
    },
    'acondicionamiento': {
      name: 'Acondicionamiento',
      items: []
    },
    'operacion': {
      name: 'Operación',
      items: []
    },
    'devolucion': {
      name: 'Devolución',
      items: []
    },
    'inspeccion': {
      name: 'Inspección',
      items: []
    }
  });

  const [inventarioCompleto, setInventarioCompleto] = useState<any[]>([]);
  const [cargandoDatos, setCargandoDatos] = useState(true);
  const [pausarAutoRefresh, setPausarAutoRefresh] = useState(false);
  
  // Hooks especializados por columna (algunos se declaran después)
  const bodegaHook = useBodega();
  const preAcondicionamientoHook = usePreAcondicionamiento();
  const acondicionamientoHook = useAcondicionamiento();
  const devolucionHook = useDevolucion();
  const { timers: timersGlobales, eliminarTimer, formatearTiempo } = useTimerContext();
  
  // Hook de WebSocket para actualizaciones en tiempo real
  const { isConnected: wsConnected, connectionError: wsError } = useWebSocket((message) => {
    // Solo mostrar logs de cambios importantes
    if (message.type === 'activity_created' || message.type === 'inventory_updated') {
      console.log('🔄 Actualizando por WebSocket:', message.type);
      actualizarColumnasDesdeBackend();
    }
    
    // Manejar completación de timer sin log (ya maneja el hook de timer)
    if (message.type === 'timer_completed') {
      // El hook de pre-acondicionamiento ya maneja esto
    }
  });

  // Estados para cronómetro de pre-acondicionamiento
  const [tiempoPreAcondicionamiento, setTiempoPreAcondicionamiento] = useState<{ [key: string]: number }>({});
  const [timersActivos, setTimersActivos] = useState<{ [key: string]: number }>({});
  const [mostrarModalTiempo, setMostrarModalTiempo] = useState(false);
  const [itemSeleccionadoTiempo, setItemSeleccionadoTiempo] = useState<any>(null);
  
  // Estados de navegación manejados por hooks especializados

  // Estados para modal RFID
  const [mostrarModalEscaneo, setMostrarModalEscaneo] = useState(false);
  const [rfidsEscaneados, setRfidsEscaneados] = useState<string[]>([]);
  const [rfidInput, setRfidInput] = useState('');

  // Función para procesar un RFID individual
  const procesarRfidIndividual = (rfid: string, soloTics: boolean = false) => {
    if (!rfid.trim()) return;
    
    // Validar que el RFID sea válido (solo dígitos)
    if (!/^\d+$/.test(rfid.trim())) {
      console.warn(`⚠️ RFID inválido: ${rfid}. Solo se permiten dígitos.`);
      return;
    }
    
    // Verificar si el RFID existe en el inventario completo
    const itemEncontrado = inventarioCompleto.find(item => 
      item.rfid === rfid.trim() || item.nombre_unidad === rfid.trim()
    );

    if (!itemEncontrado) {
      console.log(`❌ RFID ${rfid.trim()} no encontrado en el inventario`);
      return;
    }
    
    // Validar que el item sea específicamente un TIC si se requiere
    if (soloTics && itemEncontrado.categoria !== 'TIC') {
      console.warn(`⚠️ RFID ${rfid.trim()} no es un TIC (categoría: ${itemEncontrado.categoria}). Solo se permiten TICs en pre-acondicionamiento.`);
      return;
    }
    
    // Verificar si ya está en la lista
    if (!rfidsEscaneados.includes(rfid.trim())) {
      setRfidsEscaneados(prev => [...prev, rfid.trim()]);
      console.log(`✅ RFID ${rfid.trim()} auto-procesado`);
    } else {
      console.log(`ℹ️ RFID ${rfid.trim()} ya está en la lista`);
    }
  };

  // Función para manejar cambios en el input de RFID con auto-procesamiento
  const handleRfidChange = (value: string) => {
    setRfidInput(value);
    
    // Auto-procesar cada 24 caracteres
    if (value.length > 0 && value.length % 24 === 0) {
      // Extraer códigos de 24 caracteres
      const codigosCompletos = [];
      for (let i = 0; i < value.length; i += 24) {
        const codigo = value.substring(i, i + 24);
        if (codigo.length === 24) {
          codigosCompletos.push(codigo);
        }
      }
      
      // Procesar cada código
      codigosCompletos.forEach(codigo => {
        procesarRfidIndividual(codigo);
      });
      
      // Limpiar el input después de procesar
      setRfidInput('');
      
      if (codigosCompletos.length > 0) {
        console.log(`🔄 Auto-procesados ${codigosCompletos.length} códigos de 24 caracteres`);
      }
    }
  };

  // Función específica para pre-acondicionamiento que solo acepta TICs
  const handleRfidChangePreAcondicionamiento = (value: string) => {
    setRfidInput(value);
    
    // Auto-procesar cada 24 caracteres
    if (value.length > 0 && value.length % 24 === 0) {
      // Extraer códigos de 24 caracteres
      const codigosCompletos = [];
      for (let i = 0; i < value.length; i += 24) {
        const codigo = value.substring(i, i + 24);
        if (codigo.length === 24) {
          codigosCompletos.push(codigo);
        }
      }
      
      // Procesar cada código con validación de TICs únicamente
      codigosCompletos.forEach(codigo => {
        procesarRfidIndividual(codigo, true); // true = solo TICs
      });
      
      // Limpiar el input después de procesar
      setRfidInput('');
      
      if (codigosCompletos.length > 0) {
        console.log(`🔄 Auto-procesados ${codigosCompletos.length} códigos TIC de 24 caracteres para pre-acondicionamiento`);
      }
    }
  };

  // Sistema de rate limiting para actualizaciones
  const [ultimaActualizacion, setUltimaActualizacion] = useState(0);
  const [actualizacionPendiente, setActualizacionPendiente] = useState<NodeJS.Timeout | null>(null);

  // Función debounced para actualizaciones inteligentes
  const actualizarColumnasDebounced = useCallback(() => {
    // Cancelar actualización pendiente si existe
    if (actualizacionPendiente) {
      clearTimeout(actualizacionPendiente);
    }

    // Programar nueva actualización con debounce
    const timeoutId = setTimeout(() => {
      console.log('🔄 Ejecutando actualización debounced...');
      actualizarColumnasDesdeBackend();
      setActualizacionPendiente(null);
    }, 1200); // Aumentar debounce a 1.2 segundos

    setActualizacionPendiente(timeoutId);
  }, [actualizacionPendiente]);

  // Función para actualización inmediata (solo para operaciones críticas)
  const actualizarColumnasInmediata = useCallback(async () => {
    // Cancelar cualquier actualización pendiente
    if (actualizacionPendiente) {
      clearTimeout(actualizacionPendiente);
      setActualizacionPendiente(null);
    }
    
    console.log('⚡ Ejecutando actualización inmediata...');
    await actualizarColumnasDesdeBackend();
  }, [actualizacionPendiente]);

  // Función para limpieza al desmontar
  useEffect(() => {
    return () => {
      if (actualizacionPendiente) {
        clearTimeout(actualizacionPendiente);
      }
    };
  }, [actualizacionPendiente]);

  // Funciones de agrupación manejadas por hooks especializados

  // Función para actualizar columnas desde el backend (SÚPER OPTIMIZADA)
  const actualizarColumnasDesdeBackend = async () => {
    // Evitar ejecuciones múltiples simultáneas
    if (actualizandoDatos) {
      console.log('⚠️ Ya hay una actualización en progreso, omitiendo...');
      return;
    }

    // Rate limiting: no más de una actualización cada 1 segundo
    const ahora = Date.now();
    if (ahora - ultimaActualizacion < 1000) {
      console.log('⚠️ Rate limit activo, omitiendo actualización...');
      return;
    }
    
    setActualizandoDatos(true);
    setUltimaActualizacion(ahora);
    
    try {
      // Obtener inventario
      const inventarioResponse = await apiServiceClient.get('/inventory/inventario/');
      const inventario = Array.isArray(inventarioResponse.data) ? inventarioResponse.data : [];
      
      // Validar que inventario sea un array
      if (!Array.isArray(inventario)) {
        console.error('❌ Inventario no es un array:', inventario);
        throw new Error('Datos de inventario inválidos');
      }
      
      // Actualizar inventario completo
      setInventarioCompleto(inventario);
      
      // Clasificar items por su estado directamente desde la tabla inventario_credocubes
      // Filtrar items por estado Y categoría válida (case-insensitive)
      console.log('🔍 DEBUG: Total items recibidos del API:', inventario.length);
      
      // Mostrar algunos items de ejemplo para debug
      inventario.slice(0, 5).forEach((item: any, index: number) => {
        console.log(`🔍 Item ${index + 1}:`, {
          id: item.id,
          nombre: item.nombre_unidad,
          estado: item.estado,
          categoria: item.categoria,
          categoria_lower: (item.categoria || '').toLowerCase()
        });
      });
      
      const itemsEnBodega = inventario.filter((item: any) => {
        const categoria = (item.categoria || '').toLowerCase();
        const esEnBodega = item.estado === 'En bodega';
        const categoriaValida = categoria === 'tic' || categoria === 'vip' || categoria === 'cube';
        
        if (esEnBodega) {
          console.log('🔍 Item EN BODEGA encontrado:', {
            id: item.id,
            nombre: item.nombre_unidad,
            estado: item.estado,
            categoria: item.categoria,
            categoria_lower: categoria,
            categoriaValida: categoriaValida
          });
        }
        
        return item && item.estado && item.categoria &&
               esEnBodega && categoriaValida;
      });
      const itemsPreAcondicionamiento = inventario.filter((item: any) => {
        const categoria = (item.categoria || '').toLowerCase();
        return item && item.estado && item.categoria &&
               item.estado === 'Pre-acondicionamiento' && 
               (categoria === 'tic' || categoria === 'vip' || categoria === 'cube');
      });
      const itemsAcondicionamiento = inventario.filter((item: any) => {
        const categoria = (item.categoria || '').toLowerCase();
        return item && item.estado && item.categoria &&
               item.estado === 'Acondicionamiento' && 
               (categoria === 'tic' || categoria === 'vip' || categoria === 'cube');
      });
      const itemsOperacion = inventario.filter((item: any) => {
        const categoria = (item.categoria || '').toLowerCase();
        return item && item.estado && item.categoria &&
               (item.estado === 'operación' || item.estado === 'Operación') && 
               (categoria === 'tic' || categoria === 'vip' || categoria === 'cube');
      });
      const itemsDevolucion = inventario.filter((item: any) => {
        const categoria = (item.categoria || '').toLowerCase();
        return item && item.estado && item.categoria &&
               (
                 // Items ya en devolución
                 item.estado === 'Devolución' ||
                 // Items completados en operación (listos para devolver)
                 (item.estado === 'operación' && item.sub_estado === 'entregado')
               ) &&
               (categoria === 'tic' || categoria === 'vip' || categoria === 'cube');
      });
      const itemsInspeccion = inventario.filter((item: any) => {
        const categoria = (item.categoria || '').toLowerCase();
        return item && item.estado && item.categoria &&
               item.estado === 'Inspección' && 
               (categoria === 'tic' || categoria === 'vip' || categoria === 'cube');
      });
      
      // Solo mostrar log si hay cambios significativos
      console.log(`📈 Items por estado: Bodega(${itemsEnBodega.length}) Pre-acond(${itemsPreAcondicionamiento.length}) Acond(${itemsAcondicionamiento.length}) Op(${itemsOperacion.length}) Dev(${itemsDevolucion.length}) Insp(${itemsInspeccion.length})`);
      
      if (itemsEnBodega.length > 0) {
        console.log('✅ Items en bodega encontrados:', itemsEnBodega.map(item => ({
          id: item.id,
          nombre: item.nombre_unidad,
          categoria: item.categoria
        })));
      } else {
        console.log('❌ NO se encontraron items en bodega');
      }
      
      // Crear cards para En bodega usando el hook especializado
      const cardsGruposPrincipales = bodegaHook.crearCardsGruposPrincipales(itemsEnBodega);
      
      // Actualizar columnas
      setColumns(prevColumns => ({
        ...prevColumns,
        'en-bodega': {
          ...prevColumns['en-bodega'],
          items: cardsGruposPrincipales
        },
        'pre-acondicionamiento': {
          ...prevColumns['pre-acondicionamiento'],
          items: (() => {
            // Crear cards de pre-acondicionamiento usando el hook especializado
            console.log('🔧 Creando cards para pre-acondicionamiento. Items:', itemsPreAcondicionamiento.length);
            const cardsPreAcondicionamiento = preAcondicionamientoHook.crearCardsPreAcondicionamiento(itemsPreAcondicionamiento);
            console.log('📋 Cards de pre-acondicionamiento creadas:', cardsPreAcondicionamiento.length);
            return cardsPreAcondicionamiento;
          })()
        },
      'acondicionamiento': {
        ...prevColumns['acondicionamiento'],
        items: (() => {
          // Crear cards para items en acondicionamiento usando el hook especializado
          console.log('🔧 Creando cards para acondicionamiento. Items:', itemsAcondicionamiento.length);
          const cardsAcondicionamiento = acondicionamientoHook.crearCardsGruposAcondicionamiento(itemsAcondicionamiento);
          console.log('✅ Cards de acondicionamiento creadas:', cardsAcondicionamiento.length);
          
          return cardsAcondicionamiento;
        })()
      },
      'operacion': {
        ...prevColumns['operacion'],
        items: (() => {
          // Agrupar items de operación solo por categoría
          console.log('🔧 Creando cards agrupadas para operación. Items:', itemsOperacion.length);
          
          if (itemsOperacion.length === 0) {
            return [];
          }
          
          // Agrupar solo por categoría
          const itemsPorCategoria = itemsOperacion.reduce((grupos: any, item: any) => {
            const categoria = item.categoria || 'TIC';
            if (!grupos[categoria]) {
              grupos[categoria] = [];
            }
            grupos[categoria].push(item);
            return grupos;
          }, {});
          
          const cardsOperacion: any[] = [];
          
          Object.entries(itemsPorCategoria).forEach(([categoria, itemsCategoria]: [string, any]) => {
            const itemsArray = itemsCategoria as any[];
            
            // Crear card de grupo para la categoría
            const cardGrupo = {
              id: `operacion-${categoria}-grupo`,
              category: categoria,
              title: `${categoria} en tránsito`,
              description: `${itemsArray.length} items en operación`,
              assignee: [{name: 'Sistema', avatar: 'sistema'}],
              date: formatDateForDisplay(itemsArray[0]?.ultima_actualizacion),
              estado: 'operación',
              sub_estado: 'En transito',
              es_grupo: true,
              nivel_grupo: 1,
              items_count: itemsArray.length,
              items_ids: itemsArray.map(item => item.id),
              // Agregar los items individuales para manejo correcto
              items_data: itemsArray.map(item => ({
                id: item.id,
                nombre_unidad: item.nombre_unidad,
                rfid: item.rfid,
                lote: item.lote,
                categoria: item.categoria,
                estado: item.estado,
                sub_estado: item.sub_estado
              }))
            };
            
            cardsOperacion.push(cardGrupo);
          });
          
          console.log('✅ Cards agrupadas de operación creadas:', cardsOperacion.length);
          return cardsOperacion;
        })()
      },
      'devolucion': {
        ...prevColumns['devolucion'],
        items: (() => {
          // Agrupar items de devolución por categoría (igual que operación)
          console.log('🔧 Creando cards agrupadas para devolución. Items:', itemsDevolucion.length);
          
          if (itemsDevolucion.length === 0) {
            return [];
          }
          
          // Agrupar solo por categoría
          const itemsPorCategoria = itemsDevolucion.reduce((grupos: any, item: any) => {
            const categoria = item.categoria || 'TIC';
            if (!grupos[categoria]) {
              grupos[categoria] = [];
            }
            grupos[categoria].push(item);
            return grupos;
          }, {});
          
          const cardsDevolucion: any[] = [];
          
          Object.entries(itemsPorCategoria).forEach(([categoria, itemsCategoria]: [string, any]) => {
            const itemsArray = itemsCategoria as any[];
            
            // Crear card de grupo para la categoría
            const cardGrupo = {
              id: `devolucion-${categoria}-grupo`,
              category: categoria,
              title: `${categoria} pendientes de devolución`,
              description: `${itemsArray.length} items listos para devolver`,
              assignee: [{name: 'Sistema', avatar: 'sistema'}],
              date: formatDateForDisplay(itemsArray[0]?.ultima_actualizacion),
              estado: 'Devolución',
              sub_estado: 'Pendiente',
              es_grupo: true,
              nivel_grupo: 1,
              items_count: itemsArray.length,
              items_ids: itemsArray.map(item => item.id),
              // Agregar los items individuales para manejo correcto
              items_data: itemsArray.map(item => ({
                id: item.id,
                nombre_unidad: item.nombre_unidad,
                rfid: item.rfid,
                lote: item.lote,
                categoria: item.categoria,
                estado: item.estado,
                sub_estado: item.sub_estado
              }))
            };
            
            cardsDevolucion.push(cardGrupo);
          });
          
          console.log('✅ Cards agrupadas de devolución creadas:', cardsDevolucion.length);
          return cardsDevolucion;
        })()
      },
      'inspeccion': {
        ...prevColumns['inspeccion'],
        items: (() => {
          // Agrupar items de inspección por categoría (igual que operación y devolución)
          console.log('🔧 Creando cards agrupadas para inspección. Items:', itemsInspeccion.length);
          
          if (itemsInspeccion.length === 0) {
            return [];
          }
          
          // Agrupar solo por categoría
          const itemsPorCategoria = itemsInspeccion.reduce((grupos: any, item: any) => {
            const categoria = item.categoria || 'TIC';
            if (!grupos[categoria]) {
              grupos[categoria] = [];
            }
            grupos[categoria].push(item);
            return grupos;
          }, {});
          
          const cardsInspeccion: any[] = [];
          
          Object.entries(itemsPorCategoria).forEach(([categoria, itemsCategoria]: [string, any]) => {
            const itemsArray = itemsCategoria as any[];
            
            // Crear card de grupo para la categoría
            const cardGrupo = {
              id: `inspeccion-${categoria}-grupo`,
              category: categoria,
              title: `${categoria}s Inspeccionados`,
              description: `${itemsArray.length} items inspeccionados`,
              assignee: [{name: 'Sistema', avatar: 'sistema'}],
              date: formatDateForDisplay(new Date().toISOString()),
              es_grupo: true,
              nivel_grupo: 1,
              items_count: itemsArray.length,
              items_ids: itemsArray.map(item => item.id),
              // Agregar los items individuales para manejo correcto
              items_data: itemsArray.map(item => ({
                id: item.id,
                nombre_unidad: item.nombre_unidad,
                rfid: item.rfid,
                lote: item.lote,
                categoria: item.categoria,
                estado: item.estado,
                sub_estado: item.sub_estado
              }))
            };
            
            cardsInspeccion.push(cardGrupo);
          });
          
          console.log('✅ Cards agrupadas de inspección creadas:', cardsInspeccion.length);
          return cardsInspeccion;
        })()
      }
    }));
      
      console.log('✅ Columnas actualizadas exitosamente');
    } catch (error) {
      console.error('❌ Error actualizando columnas desde el backend:', error);
      console.error('❌ Tipo de error:', typeof error);
      console.error('❌ Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
      
      // Si hay un error, asegurar que las columnas tengan una estructura válida
      setColumns(prevColumns => ({
        ...prevColumns,
        'bodega': { ...prevColumns['bodega'], items: [] },
        'pre-acondicionamiento': { ...prevColumns['pre-acondicionamiento'], items: [] },
        'acondicionamiento': { ...prevColumns['acondicionamiento'], items: [] },
        'operacion': { ...prevColumns['operacion'], items: [] },
        'devolucion': { ...prevColumns['devolucion'], items: [] },
        'inspeccion': { ...prevColumns['inspeccion'], items: [] }
      }));
    } finally {
      setActualizandoDatos(false);
    }
  };

  // Función para actualizar solo el inventario completo sin afectar navegación
  const actualizarInventarioEnSegundoPlano = async () => {
    try {
      const inventarioResponse = await apiServiceClient.get('/inventory/inventario/');
      const inventario = inventarioResponse.data;
      setInventarioCompleto(inventario);
    } catch (error) {
      console.error('Error actualizando inventario en segundo plano:', error);
    }
  };
  
  // Hook de envío (declarado después de actualizarColumnasDesdeBackend)
  const envioHook = useEnvio(actualizarColumnasDesdeBackend);

  // Función simplificada para actualizar después de un clic
  const actualizarDespuesDeClick = useCallback(() => {
    // No hacer nada - dejar que el auto-refresh maneje las actualizaciones
    // Esto evita interferencias con la navegación
  }, []);

  // Función especial para manejar el botón "Volver" sin interferencias
  const manejarVolverNivel = (funcionVolver: () => void) => {
    // Ejecutar la función de volver
    funcionVolver();
    
    // Actualizar columnas de forma optimizada (no bloqueante)
    actualizarColumnasDebounced();
  };

  // Cargar datos iniciales
  useEffect(() => {
    const cargarDatos = async () => {
      setCargandoDatos(true);
      // Cargar datos de devolución
      await devolucionHook.cargarItemsDevolucion();
      await actualizarColumnasInmediata(); // Usar inmediata solo para carga inicial
      setCargandoDatos(false);
    };
    
    cargarDatos();
  }, []);

  // Auto-refresh híbrido: actualiza completamente cuando no hay navegación, solo inventario cuando sí hay
  useEffect(() => {
    const interval = setInterval(() => {
      // No actualizar si está pausado (después de volver)
      if (pausarAutoRefresh) {
        console.log('🚫 Auto-refresh pausado, omitiendo actualización...');
        return;
      }
      
      const hayNavegacionActiva = bodegaHook.grupoExpandido || bodegaHook.subgrupoExpandido || preAcondicionamientoHook.navegacionPreAcondicionamiento || preAcondicionamientoHook.subgrupoPreAcondicionamiento;
      
      if (hayNavegacionActiva) {
        // Si hay navegación activa, solo actualizar inventario en segundo plano
        actualizarInventarioEnSegundoPlano();
      } else {
        // Si no hay navegación, usar actualización debounced
        console.log('🔄 Auto-refresh: usando actualización debounced...');
        actualizarColumnasDebounced();
      }
    }, 60000); // Cambiar a 1 minuto para reducir aún más la carga

    return () => {
      clearInterval(interval);
      console.log('🚫 Auto-refresh detenido');
    };
  }, [bodegaHook.grupoExpandido, bodegaHook.subgrupoExpandido, preAcondicionamientoHook.navegacionPreAcondicionamiento, preAcondicionamientoHook.subgrupoPreAcondicionamiento, pausarAutoRefresh]);

  // Función para manejar escaneo RFID
  const manejarEscaneoRfid = () => {
    const rfid = rfidInput.trim();
    if (!rfid) return;
    
    // Validar que el RFID sea válido (solo dígitos)
    if (!/^\d+$/.test(rfid)) {
      console.warn(`⚠️ RFID inválido: ${rfid}. Solo se permiten dígitos.`);
      alert(`⚠️ RFID inválido: ${rfid}. Solo se permiten dígitos.`);
      return;
    }
    
    // Verificar si ya está en la lista
    if (!rfidsEscaneados.includes(rfid)) {
      setRfidsEscaneados([...rfidsEscaneados, rfid]);
    } else {
      console.warn(`⚠️ RFID ${rfid} ya está en la lista de escaneados.`);
      alert(`⚠️ RFID ${rfid} ya está en la lista de escaneados.`);
    }
    
    setRfidInput('');
  };

  // Función específica para manejar escaneo RFID en pre-acondicionamiento (solo TICs)
  const manejarEscaneoRfidPreAcondicionamiento = () => {
    const rfid = rfidInput.trim();
    if (!rfid) return;
    
    // Validar que el RFID sea válido (solo dígitos)
    if (!/^\d+$/.test(rfid)) {
      console.warn(`⚠️ RFID inválido: ${rfid}. Solo se permiten dígitos.`);
      alert(`⚠️ RFID inválido: ${rfid}. Solo se permiten dígitos.`);
      return;
    }
    
    // Verificar si el RFID existe en el inventario completo
    const itemEncontrado = inventarioCompleto.find(item => 
      item.rfid === rfid || item.nombre_unidad === rfid
    );

    if (!itemEncontrado) {
      console.log(`❌ RFID ${rfid} no encontrado en el inventario`);
      alert(`RFID ${rfid} no encontrado en el inventario`);
      return;
    }
    
    // Validar que el item sea específicamente un TIC
    if (itemEncontrado.categoria !== 'TIC') {
      console.warn(`⚠️ RFID ${rfid} no es un TIC (categoría: ${itemEncontrado.categoria}). Solo se permiten TICs en pre-acondicionamiento.`);
      alert(`El item ${rfid} no es un TIC (categoría: ${itemEncontrado.categoria}). Solo se permiten TICs en pre-acondicionamiento.`);
      setRfidInput('');
      return;
    }
    
    // Verificar si ya está en la lista
    if (!rfidsEscaneados.includes(rfid)) {
      setRfidsEscaneados([...rfidsEscaneados, rfid]);
      console.log(`✅ TIC ${rfid} agregado manualmente`);
    } else {
      console.warn(`⚠️ TIC ${rfid} ya está en la lista de escaneados.`);
      alert(`⚠️ TIC ${rfid} ya está en la lista de escaneados.`);
    }
    
    setRfidInput('');
  };
  
  // Función para verificar RFID
  const verificarRfid = async (rfid: string) => {
    try {
      // Validar formato del RFID (solo dígitos)
      if (!rfid || !/^\d+$/.test(rfid)) {
        console.error(`❌ RFID inválido: ${rfid}. Solo se permiten dígitos.`);
        alert(`❌ RFID inválido: ${rfid}. Solo se permiten dígitos.`);
        return false;
      }
      
      // Asegurar que tenemos datos actualizados
      await actualizarColumnasDesdeBackend();
      
      const itemEncontrado = inventarioCompleto.find((item: any) => item.rfid === rfid);
      
      if (!itemEncontrado) {
        console.error(`❌ RFID ${rfid} no encontrado en el inventario`);
        alert(`❌ RFID ${rfid} no encontrado en el inventario`);
        return false;
      }
      
      if (itemEncontrado.categoria !== 'TIC') {
        console.warn(`⚠️ ${itemEncontrado.nombre_unidad} no es un TIC. Solo los TICs pueden ir a pre-acondicionamiento.`);
        alert(`⚠️ ${itemEncontrado.nombre_unidad} no es un TIC. Solo los TICs pueden ir a pre-acondicionamiento.`);
        return false;
      }
      
      // Verificar si ya está en pre-acondicionamiento consultando las actividades
      const actividadesResponse = await apiServiceClient.get('/activities/actividades/');
      const actividades = actividadesResponse.data;
      
      // Buscar la última actividad para este inventario
      const ultimasActividades = actividades
        .filter((act: any) => act.inventario_id === itemEncontrado.id)
        .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      if (ultimasActividades.length > 0) {
        const ultimaActividad = ultimasActividades[0];
        if (ultimaActividad.estado_nuevo === 'Pre-acondicionamiento') {
          console.warn(`⚠️ ${itemEncontrado.nombre_unidad} ya está en pre-acondicionamiento.`);
          alert(`⚠️ ${itemEncontrado.nombre_unidad} ya está en pre-acondicionamiento.`);
          return false;
        }
      }
      
      // Si la TIC ya tiene otro estado asignado que no sea 'disponible' o 'En bodega', no permitir el movimiento
      if (itemEncontrado.estado && itemEncontrado.estado !== 'disponible' && itemEncontrado.estado !== 'En bodega') {
        console.warn(`⚠️ ${itemEncontrado.nombre_unidad} ya tiene un estado asignado: ${itemEncontrado.estado}.`);
        alert(`⚠️ ${itemEncontrado.nombre_unidad} ya tiene un estado asignado: ${itemEncontrado.estado}.`);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error verificando RFID:', error);
      alert('❌ Error al verificar el RFID');
      return false;
    }
  };

  // Función para confirmar pre-acondicionamiento
  const confirmarPreAcondicionamiento = async (rfids: string[], subEstado: string = 'Congelación') => {
    try {
      console.log(`🔄 Confirmando pre-acondicionamiento para ${rfids.length} TICs con sub-estado: ${subEstado}`);
      
      // Primero, actualizar el inventario para asegurarnos de tener datos frescos
      await actualizarInventarioEnSegundoPlano();
      
      // Obtener actividades actuales para verificar duplicados
      const actividadesResponse = await apiServiceClient.get('/activities/actividades/');
      const actividades = actividadesResponse.data;
      
      // Validar que las TICs no estén ya en pre-acondicionamiento
      const ticsInvalidas: string[] = [];
      const ticsValidas: any[] = [];
      
      for (const rfid of rfids) {
        // Verificar si el RFID es válido (no vacío y solo contiene dígitos)
        if (!rfid || !/^\d+$/.test(rfid)) {
          console.error(`❌ RFID inválido: ${rfid}. Solo se permiten dígitos.`);
          ticsInvalidas.push(rfid);
          continue;
        }
        
        // Buscar el item en el inventario actualizado
        const item = inventarioCompleto.find((invItem: any) => invItem.rfid === rfid);
        if (!item) {
          console.error(`❌ RFID ${rfid} no encontrado en el inventario`);
          ticsInvalidas.push(rfid);
          continue;
        }
        
        // Validar que sea un TIC
        if (item.categoria !== 'TIC') {
          console.warn(`⚠️ ${item.nombre_unidad} no es un TIC. Solo los TICs pueden ir a pre-acondicionamiento.`);
          ticsInvalidas.push(rfid);
          continue;
        }
        
        // Validar que el estado sea 'disponible', 'En bodega' o ya esté en 'Pre-acondicionamiento'
        // Si ya está en Pre-acondicionamiento, permitir cambio de sub_estado
        if (item.estado && item.estado !== 'disponible' && item.estado !== 'Pre-acondicionamiento' && item.estado !== 'En bodega') {
          console.warn(`⚠️ ${item.nombre_unidad} ya tiene un estado asignado: ${item.estado}. Solo se pueden mover TICs disponibles, en bodega o en pre-acondicionamiento.`);
          ticsInvalidas.push(rfid);
          continue;
        }
        
        // Si ya está en Pre-acondicionamiento, verificar si es un cambio de sub_estado
        if (item.estado === 'Pre-acondicionamiento') {
          if (item.sub_estado === subEstado) {
            console.warn(`⚠️ ${item.nombre_unidad} ya está en ${subEstado}.`);
            ticsInvalidas.push(rfid);
            continue;
          } else {
            console.log(`🔄 Cambiando sub_estado de ${item.nombre_unidad} de '${item.sub_estado}' a '${subEstado}'`);
          }
        }
        
        if (!item.id || typeof item.id !== 'number') {
          console.error(`❌ ${item.nombre_unidad} tiene un ID inválido: ${item.id}`);
          ticsInvalidas.push(rfid);
          continue;
        }
        
        // Si pasa todas las validaciones, agregar a la lista de TICs válidas
        // Incluir todos los campos del item original para poder hacer PUT completo
        ticsValidas.push(item);
      }
      
      // Mostrar advertencias si hay TICs inválidas
      if (ticsInvalidas.length > 0) {
        alert(`⚠️ Algunas TICs no pueden ser movidas a pre-acondicionamiento:\n\n${ticsInvalidas.join('\n')}`);
        
        // Si todas las TICs son inválidas, no continuar
        if (ticsValidas.length === 0) {
          return false;
        }
      }
      
      // Actualizar directamente el estado de cada TIC válida en la tabla inventario_credocubes
      const ticsActualizados: any[] = [];
      for (const item of ticsValidas) {
        try {
          console.log(`📦 Moviendo TIC: ${item.nombre_unidad} (ID: ${item.id})`);
          
          // Crear el objeto con los campos que espera el esquema InventarioCreate
          const actualizacionTIC = {
            modelo_id: item.modelo_id,
            nombre_unidad: item.nombre_unidad,
            rfid: item.rfid,
            lote: item.lote || null,
            estado: 'Pre-acondicionamiento',
            sub_estado: subEstado,
            validacion_limpieza: item.validacion_limpieza || null,
            validacion_goteo: item.validacion_goteo || null,
            validacion_desinfeccion: item.validacion_desinfeccion || null,
            categoria: item.categoria || null,
            ultima_actualizacion: createUtcTimestamp() // Actualizar timestamp en UTC
          };
          
          console.log('Actualizando TIC en inventario:', actualizacionTIC);
          // Usar la ruta correcta para actualizar el inventario
          const response = await apiServiceClient.put(`/inventory/inventario/${item.id}`, actualizacionTIC);
          console.log(`✅ TIC actualizado:`, response.data);
          ticsActualizados.push(response.data);
        } catch (itemError: any) {
          console.error(`Error al actualizar TIC ${item.nombre_unidad}:`, itemError);
          if (itemError.response) {
            console.error('Detalles del error:', itemError.response.data);
            alert(`Error al actualizar TIC ${item.nombre_unidad}: ${itemError.response.data.detail || 'Error desconocido'}`);
          } else {
            alert(`Error al actualizar TIC ${item.nombre_unidad}: ${itemError.message}`);
          }
        }
      }
      
      console.log(`✅ ${ticsActualizados.length} TICs actualizados exitosamente`);
      
      // Limpiar la lista de RFIDs escaneados
      setRfidsEscaneados([]);
      
      // Solo actualizar UNA VEZ al final de todas las operaciones
      if (ticsActualizados.length > 0) {
        const ticsMovidos = ticsActualizados.length === 1 ? 'TIC' : 'TICs';
        
        // Mostrar mensaje de éxito ANTES de actualizar (más rápido)
        alert(`✅ ${ticsActualizados.length} ${ticsMovidos} ${ticsActualizados.length === 1 ? 'movido' : 'movidos'} a ${subEstado} exitosamente`);
        
        // Actualizar estado local inmediatamente para mejor UX
        setInventarioCompleto(prevInventario => 
          prevInventario.map(item => {
            const actualizado = ticsActualizados.find(tic => tic.id === item.id);
            return actualizado ? { ...item, ...actualizado } : item;
          })
        );
        
        // Usar actualización debounced optimizada
        actualizarColumnasDebounced();
        
        console.log('✅ Interfaz actualizada automáticamente después de mover TICs');
      } else {
        // Usar actualización debounced también aquí
        actualizarColumnasDebounced();
      }
      
      return true;
    } catch (error: any) {
      console.error('❌ Error creando actividades:', error);
      
      // Proporcionar información más detallada sobre el error
      if (error.response) {
        // El servidor respondió con un código de estado fuera del rango 2xx
        console.error('Datos del error:', error.response.data);
        console.error('Estado del error:', error.response.status);
        console.error('Cabeceras del error:', error.response.headers);
        
        let mensajeError = 'Error al mover los TICs a pre-acondicionamiento';
        if (error.response.data && error.response.data.detail) {
          mensajeError += ': ' + error.response.data.detail;
        }
        
        alert('❌ ' + mensajeError);
      } else if (error.request) {
        // La solicitud fue hecha pero no se recibió respuesta
        console.error('No se recibió respuesta del servidor:', error.request);
        alert('❌ Error de conexión: No se recibió respuesta del servidor');
      } else {
        // Algo sucedió en la configuración de la solicitud que desencadenó un error
        console.error('Error de configuración de la solicitud:', error.message);
        alert('❌ Error al configurar la solicitud: ' + error.message);
      }
      
      return false;
    }
  };

  // Función para mover TIC de congelación a atemperamiento
  const moverTicAAtempermiento = async (itemId: string) => {
    try {
      console.log(`🔄 Moviendo TIC ${itemId} de congelación a atemperamiento (OPTIMIZADO)`);
      
      // Buscar el item en el inventario
      const item = inventarioCompleto.find(i => i.rfid === itemId || i.nombre_unidad === itemId);
      
      if (!item) {
        console.error(`❌ No se encontró TIC con ID: ${itemId}`);
        return;
      }
      
      // Crear el objeto con los campos que espera el esquema InventarioCreate
      const actualizacionTIC = {
        modelo_id: item.modelo_id,
        nombre_unidad: item.nombre_unidad,
        rfid: item.rfid,
        lote: item.lote || null,
        estado: 'Pre-acondicionamiento',
        sub_estado: 'Atemperamiento',
        validacion_limpieza: item.validacion_limpieza || null,
        validacion_goteo: item.validacion_goteo || null,
        validacion_desinfeccion: item.validacion_desinfeccion || null,
        categoria: item.categoria || null,
        ultima_actualizacion: createUtcTimestamp()
      };
      
      try {
        // Actualizar directamente el inventario
        await apiServiceClient.put(`/inventory/inventario/${item.id}`, actualizacionTIC);
        console.log(`✅ TIC ${itemId} movido a atemperamiento exitosamente`);
        
        // Limpiar tiempo de pre-acondicionamiento
        setTiempoPreAcondicionamiento(prev => {
          const newTiempos = { ...prev };
          delete newTiempos[itemId];
          return newTiempos;
        });
        
        // Actualización rápida optimizada (no bloqueante)
        actualizarColumnasDebounced();
        
      } catch (error: any) {
        console.error(`❌ Error en backend:`, error);
        alert(`❌ Error al mover TIC a atemperamiento: ${error.response?.data?.detail || error.message}`);
        return;
      }
      
    } catch (error: any) {
      console.error(`❌ Error moviendo TIC ${itemId} a atemperamiento:`, error);
      alert(`❌ Error al mover TIC a atemperamiento: ${error.response?.data?.detail || error.message}`);
    }
  };

  // Función para mover TIC de atemperamiento a acondicionamiento
  const moverTicAAcondicionamiento = async (itemId: string) => {
    try {
      console.log(`🔄 Moviendo TIC ${itemId} de atemperamiento a acondicionamiento (OPTIMIZADO)`);
      
      // Buscar el item en el inventario
      const item = inventarioCompleto.find(i => i.rfid === itemId || i.nombre_unidad === itemId);
      
      if (!item) {
        console.error(`❌ No se encontró TIC con ID: ${itemId}`);
        return false;
      }
      
      // Crear el objeto con los campos que espera el esquema InventarioCreate
      const actualizacionTIC = {
        modelo_id: item.modelo_id,
        nombre_unidad: item.nombre_unidad,
        rfid: item.rfid,
        lote: item.lote || null,
        estado: 'Acondicionamiento',
        sub_estado: 'En proceso',
        validacion_limpieza: item.validacion_limpieza || null,
        validacion_goteo: item.validacion_goteo || null,
        validacion_desinfeccion: item.validacion_desinfeccion || null,
        categoria: item.categoria || null,
        ultima_actualizacion: createUtcTimestamp()
      };
      
      try {
        // Actualizar directamente el inventario
        await apiServiceClient.put(`/inventory/inventario/${item.id}`, actualizacionTIC);
        console.log(`✅ TIC ${itemId} movido a acondicionamiento exitosamente`);
        
        // Actualización rápida optimizada (no bloqueante)
        actualizarColumnasDebounced();
        
        return true;
        
      } catch (error: any) {
        console.error(`❌ Error en backend:`, error);
        alert(`❌ Error al mover TIC a acondicionamiento: ${error.response?.data?.detail || error.message}`);
        return false;
      }
      
    } catch (error: any) {
      console.error(`❌ Error moviendo TIC ${itemId} a acondicionamiento:`, error);
      alert(`❌ Error al mover TIC a acondicionamiento: ${error.response?.data?.detail || error.message}`);
      return false;
    }
  };
  
  // Funciones para cronómetro de pre-acondicionamiento
  const iniciarCronometro = (itemId: string, horas: number, minutos: number) => {
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
        moverTicAAtempermiento(itemId);
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
    // Detener timer local
    const timerId = timersActivos[itemId];
    if (timerId) {
      clearTimeout(timerId);
      setTimersActivos(prev => {
        const newTimers = { ...prev };
        delete newTimers[itemId];
        return newTimers;
      });
    }
    
    setTiempoPreAcondicionamiento(prev => {
      const newTiempos = { ...prev };
      delete newTiempos[itemId];
      return newTiempos;
    });

    // Buscar y cancelar timers globales de manera más robusta
    // Buscar por múltiples variaciones del nombre/ID del item
    const variacionesNombre = [
      itemId,
      itemId.toString(),
      `TIC${itemId}`,
      itemId.replace('TIC', ''),
      itemId.replace(/^TIC/, '').replace(/^0+/, '') // Remover TIC y ceros iniciales
    ].filter((variacion, index, array) => 
      variacion && variacion.trim() !== '' && array.indexOf(variacion) === index
    );
    
    const timersACancelar = timersGlobales.filter(timer => 
      variacionesNombre.some(variacion => 
        timer.nombre === variacion || 
        timer.nombre === variacion.toString() ||
        timer.nombre.includes(variacion) ||
        variacion.includes(timer.nombre)
      )
    );
    
    timersACancelar.forEach(timer => {
      console.log(`⏰ Cancelando timer global: ${timer.id} para ${timer.nombre}`);
      eliminarTimer(timer.id);
    });
    
    console.log(`⏰ Cronómetro detenido para ${itemId}${timersACancelar.length > 0 ? ` (${timersACancelar.length} timers globales cancelados)` : ''}`);
  };
  
  const obtenerTiempoRestante = (itemId: string): string => {
    const tiempoFin = tiempoPreAcondicionamiento[itemId];
    if (!tiempoFin) return '';
    
    const ahora = Date.now();
    const restante = tiempoFin - ahora;
    
    if (restante <= 0) {
      return '¡Listo!';
    }
    
    const horas = Math.floor(restante / (1000 * 60 * 60));
    const minutos = Math.floor((restante % (1000 * 60 * 60)) / (1000 * 60));
    const segundos = Math.floor((restante % (1000 * 60)) / 1000);
    
    if (horas > 0) {
      return `${horas}:${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`;
    } else {
      return `${minutos}:${segundos.toString().padStart(2, '0')}`;
    }
  };
  
  const agregarNuevoItemABodega = async (itemsSeleccionados: any[]) => {
    try {
      console.log('🔄 ===== INICIO MOVER ITEMS A BODEGA =====');
      console.log('📦 Items seleccionados:', itemsSeleccionados);
      
      // Verificar si hay items con timers activos
      const itemsConTimers: {item: any, timerInfo: any}[] = [];
      
      for (const item of itemsSeleccionados) {
        const posiblesIds = [
          item.id?.toString(),
          item.inventario_id?.toString(),
          item.nombre_unidad,
          item.rfid,
          item.title,
          `TIC${item.id}`,
          `TIC${item.inventario_id}`,
          `TIC${item.nombre_unidad}`,
          item.nombre_unidad?.replace('TIC', ''),
          item.id?.toString().replace(/^0+/, ''), // Remover ceros iniciales
          item.inventario_id?.toString().replace(/^0+/, '')
        ].filter(Boolean).filter((id, index, array) => 
          id && id.trim() !== '' && array.indexOf(id) === index
        );
        
        // Verificar timers locales
        const timerLocalActivo = posiblesIds.some(id => timersActivos[id]);
        
        // Verificar timers globales de manera más robusta
        const timerGlobalActivo = timersGlobales.find(timer => 
          posiblesIds.some(id => 
            timer.nombre === id || 
            timer.nombre === id.toString() ||
            timer.nombre.includes(id) ||
            id.includes(timer.nombre)
          )
        );
        
        if (timerLocalActivo || timerGlobalActivo) {
          const tipoTimer = timerGlobalActivo ? 
            (timerGlobalActivo.tipoOperacion === 'congelamiento' ? 'congelación' : 'atemperamiento') : 
            'proceso';
            
          itemsConTimers.push({
            item,
            timerInfo: {
              tipo: tipoTimer,
              timer: timerGlobalActivo,
              tiempoRestante: timerGlobalActivo ? formatearTiempo(timerGlobalActivo.tiempoRestanteSegundos) : 'activo'
            }
          });
        }
      }
      
      // Si hay items con timers activos, mostrar confirmación
      if (itemsConTimers.length > 0) {
        const nombresTics = itemsConTimers.map(({item, timerInfo}) => 
          `• ${item.nombre_unidad} (${timerInfo.tipo}: ${timerInfo.tiempoRestante})`
        ).join('\n');
        
        const mensaje = itemsConTimers.length === 1 
          ? `⚠️ La siguiente TIC está en proceso:\n\n${nombresTics}\n\n¿Estás seguro que deseas moverla a bodega?\n\nEsto cancelará el temporizador activo.`
          : `⚠️ Las siguientes TICs están en proceso:\n\n${nombresTics}\n\n¿Estás seguro que deseas moverlas a bodega?\n\nEsto cancelará los temporizadores activos.`;
        
        const confirmar = window.confirm(mensaje);
        
        if (!confirmar) {
          console.log('❌ Usuario canceló el movimiento de TICs con timers activos');
          return false;
        }
        
        console.log('✅ Usuario confirmó el movimiento de TICs con timers activos');
      }
      
      let itemsMovidosExitosamente = 0;
      let errores: string[] = [];
      
      // OPTIMIZACIÓN: Procesar todos los items en PARALELO sin logs innecesarios
      const resultados = await Promise.allSettled(
        itemsSeleccionados.map(async (item) => {
          try {
            // 1. Preparar datos para inventario
            const inventarioUpdate = {
              modelo_id: item.modelo_id || 1,
              nombre_unidad: item.nombre_unidad,
              rfid: item.rfid,
              lote: item.lote || null,
              estado: 'En bodega',
              sub_estado: null,
              validacion_limpieza: item.validacion_limpieza || null,
              validacion_goteo: item.validacion_goteo || null,
              validacion_desinfeccion: item.validacion_desinfeccion || null,
              categoria: item.categoria || 'TIC',
              ultima_actualizacion: createUtcTimestamp()
            };

            // 2. Preparar datos para actividad
            const nuevaActividad = {
              inventario_id: item.id,
              usuario_id: 1,
              descripcion: `${item.nombre_unidad} movido a bodega desde ${item.estado}`,
              estado_nuevo: 'En bodega',
              sub_estado_nuevo: null
            };

            // 3. Ejecutar operaciones de inventario y actividad EN PARALELO
            const [inventarioResponse, actividadResponse] = await Promise.allSettled([
              apiServiceClient.put(`/inventory/inventario/${item.id}`, inventarioUpdate),
              apiServiceClient.post('/activities/actividades/', nuevaActividad)
            ]);

            // Verificar resultados
            if (inventarioResponse.status === 'rejected') {
              throw new Error(`Error actualizando inventario: ${inventarioResponse.reason}`);
            }

            if (actividadResponse.status === 'rejected') {
              console.error(`❌ Error creando actividad para ${item.nombre_unidad}:`, actividadResponse.reason);
            }

            // 4. Detener cronómetros de manera más robusta (sin await, es local y rápido)
            const posiblesIds = [
              item.id?.toString(),
              item.inventario_id?.toString(),
              item.nombre_unidad,
              item.rfid,
              item.title,
              `TIC${item.id}`,
              `TIC${item.inventario_id}`,
              `TIC${item.nombre_unidad}`,
              item.nombre_unidad?.replace('TIC', ''),
              item.id?.toString().replace(/^0+/, ''), // Remover ceros iniciales
              item.inventario_id?.toString().replace(/^0+/, '')
            ].filter(Boolean).filter((id, index, array) => 
              id && id.trim() !== '' && array.indexOf(id) === index
            );
            
            posiblesIds.forEach(posibleId => detenerCronometro(posibleId));

            return { success: true, item: item.nombre_unidad };
            
          } catch (itemError: any) {
            return { 
              success: false, 
              item: item.nombre_unidad, 
              error: itemError.response?.data?.detail || itemError.message 
            };
          }
        })
      );
      
      // Procesar resultados
      resultados.forEach((resultado) => {
        if (resultado.status === 'fulfilled') {
          const { success, item, error } = resultado.value;
          if (success) {
            itemsMovidosExitosamente++;
          } else {
            errores.push(`${item}: ${error}`);
          }
        } else {
          errores.push(`Error inesperado: ${resultado.reason}`);
        }
      });
      
      // 3. Volver a vista agrupada en bodega
      bodegaHook.setGrupoExpandido(null);
      bodegaHook.setSubgrupoExpandido(null);
      
      // 4. Actualizar columnas optimizado (no bloqueante)
      actualizarColumnasDebounced();
      
      // 5. Mostrar resultados
      if (itemsMovidosExitosamente > 0) {
        const mensaje = itemsMovidosExitosamente === 1 
          ? `✅ ${itemsMovidosExitosamente} item movido a bodega exitosamente`
          : `✅ ${itemsMovidosExitosamente} items movidos a bodega exitosamente`;
          
        if (errores.length > 0) {
          alert(`${mensaje}\n\n⚠️ Algunos items tuvieron errores:\n${errores.join('\n')}`);
        } else {
          alert(mensaje);
        }
      } else {
        alert(`❌ No se pudo mover ningún item a bodega:\n${errores.join('\n')}`);
      }
      
      console.log('✅ ===== MOVIMIENTO A BODEGA COMPLETADO =====');
      
      return itemsMovidosExitosamente > 0;
      
    } catch (error: any) {
      console.error('❌ ===== ERROR MOVIENDO ITEMS =====');
      console.error('❌ Error moviendo items a bodega:', error);
      console.error('❌ Detalles del error:', error.response?.data || error.message);
      console.error('❌ Stack trace:', error.stack);
      alert(`❌ Error al mover los items a bodega: ${error.response?.data?.detail || error.message || 'Error desconocido'}`);
      return false;
    }
  };

  const moverABodega = async (item: any) => {
    try {
      console.log(`🔄 Devolviendo ${item.nombre_unidad || item.title} a bodega`);
      
      // Prevenir mover solo los grupos hardcodeados del sistema específicos
      if (typeof item.id === 'string' && 
          (item.id === 'ensamblaje-grupo' || item.id === 'listo-despacho-grupo')) {
        console.warn('⚠️ Intento de mover grupo del sistema a bodega bloqueado:', item.id);
        alert('⚠️ Este elemento no se puede mover a bodega. Es un grupo del sistema.');
        return;
      }
      
      // Si es un grupo, procesar cada item individual
      if (item.es_grupo && item.items_data) {
        console.log(`📁 Procesando grupo con ${item.items_data.length} items`);
        
        for (const itemIndividual of item.items_data) {
          console.log(`🔄 Procesando item individual: ${itemIndividual.nombre_unidad}`);
          await moverABodega(itemIndividual);
        }
        
        console.log(`✅ Grupo ${item.title} procesado exitosamente`);
        return;
      }
      
      // Verificar timers de manera eficiente
      const posiblesIdsTimer = [
        item.inventario_id?.toString(),
        item.id?.toString(),
        item.nombre_unidad,
        item.rfid,
        item.title,
        `TIC${item.inventario_id}`,
        `TIC${item.id}`,
        `TIC${item.nombre_unidad}`,
        item.nombre_unidad?.replace('TIC', ''),
        item.inventario_id?.toString().replace(/^0+/, ''),
        item.id?.toString().replace(/^0+/, '')
      ].filter(Boolean).filter((id, index, array) => 
        id && id.trim() !== '' && array.indexOf(id) === index
      );
      
      // Verificar timers locales
      const timerLocalActivo = posiblesIdsTimer.some(id => timersActivos[id]);
      
      // Verificar timers globales solo si no hay local
      let timerGlobalActivo = null;
      if (!timerLocalActivo) {
        timerGlobalActivo = timersGlobales.find(timer => 
          posiblesIdsTimer.some(id => 
            timer.nombre === id || 
            timer.nombre === id.toString() ||
            timer.nombre.includes(id) ||
            id.includes(timer.nombre)
          )
        );
      }
      
      // Confirmación de timer si existe
      if (timerLocalActivo || timerGlobalActivo) {
        const nombreItem = item.nombre_unidad || item.title;
        const tipoTimer = timerGlobalActivo ? 
          (timerGlobalActivo.tipoOperacion === 'congelamiento' ? 'congelación' : 'atemperamiento') : 
          'proceso';
          
        const tiempoRestante = timerGlobalActivo ? 
          formatearTiempo(timerGlobalActivo.tiempoRestanteSegundos) : 'activo';
        
        const mensaje = `⚠️ La TIC "${nombreItem}" está en proceso de ${tipoTimer} (${tiempoRestante}).\n\n¿Estás seguro que deseas moverla a bodega?\n\nEsto cancelará el temporizador activo.`;
        
        if (!confirm(mensaje)) {
          console.log('❌ Usuario canceló el movimiento de TIC con timer activo');
          return;
        }
        
        console.log('✅ Usuario confirmó el movimiento de TIC con timer activo');
      }
      
      // Obtener inventarioId y nombre del item
      const inventarioId = item.inventario_id || item.id;
      const nombreItem = item.nombre_unidad || item.title;
      
      if (!inventarioId) {
        console.error('❌ No se pudo determinar el inventario_id del item');
        alert('❌ Error: No se pudo identificar el item en el inventario');
        return;
      }
      
      // Validación final: verificar que inventarioId no sea un grupo hardcodeado del sistema específico
      if (typeof inventarioId === 'string' && 
          (inventarioId === 'ensamblaje-grupo' || inventarioId === 'listo-despacho-grupo')) {
        console.error('❌ Intento de procesar grupo del sistema como item individual:', inventarioId);
        alert('❌ Error: No se puede procesar este elemento. Es un grupo del sistema.');
        return;
      }

      console.log('📝 Procesando devolución para inventario ID:', inventarioId);
      
      // Detener cronómetros de manera eficiente
      posiblesIdsTimer.forEach(id => detenerCronometro(id));
      
      // Preparar datos para operaciones backend - solo cambio de estado
      const estadoUpdate = {
        estado: 'En bodega',
        sub_estado: 'Disponible'
      };

      const nuevaActividad = {
        inventario_id: inventarioId,
        usuario_id: 1,
        descripcion: `${nombreItem} devuelto a bodega`,
        estado_nuevo: 'En bodega',
        sub_estado_nuevo: 'Disponible'
      };
      
      // Ejecutar operaciones backend en paralelo usando endpoint de estado
      try {
        await Promise.all([
          apiServiceClient.patch(`/inventory/inventario/${inventarioId}/estado`, estadoUpdate),
          apiServiceClient.post('/activities/actividades/', nuevaActividad)
        ]);
        console.log('✅ Operaciones backend completadas exitosamente');
      } catch (error: any) {
        console.error('❌ Error en operaciones backend:', error);
        alert(`❌ Error al devolver el item a bodega: ${error.response?.data?.detail || error.message || 'Error desconocido'}`);
        return;
      }
      
      // Resetear navegación de bodega
      bodegaHook.setGrupoExpandido(null);
      bodegaHook.setSubgrupoExpandido(null);
      
      // Feedback final y actualización optimizada (no bloqueante)
      alert(`✅ ${nombreItem} devuelto a bodega exitosamente`);
      actualizarColumnasDebounced();
      
    } catch (error: any) {
      console.error('❌ Error devolviendo a bodega:', error);
      alert(`❌ Error al devolver el item a bodega: ${error.response?.data?.detail || error.message || 'Error desconocido'}`);
    }
  };
  
  // Función especial para manejar drag & drop hacia bodega con reagrupación
  const moverItemABodegaConReagrupacion = async (item: any) => {
    try {
      console.log(`🔄 Moviendo ${item.nombre_unidad || item.title} a bodega con reagrupación`);
      
      // Crear actividad de movimiento a bodega
      await moverABodega(item);
      
      // La función moverABodega ya maneja la reagrupación y actualización
      console.log('✅ Item movido a bodega y reagrupado exitosamente');
      
    } catch (error: any) {
      console.error('❌ Error en movimiento con reagrupación:', error);
      throw error; // Re-lanzar para que el drag & drop lo maneje
    }
  };

  // Función genérica para cambiar estado de items
  const cambiarEstadoItem = async (itemId: string, nuevoEstado: string, nuevoSubEstado?: string) => {
    try {
      console.log(`🔄 Cambiando estado del item ${itemId} a ${nuevoEstado}${nuevoSubEstado ? ` - ${nuevoSubEstado}` : ''}`);
      
      // Prevenir cambio de estado solo de los grupos hardcodeados del sistema específicos
      if (typeof itemId === 'string' && 
          (itemId === 'ensamblaje-grupo' || itemId === 'listo-despacho-grupo')) {
        console.error('❌ Intento de cambiar estado de grupo del sistema bloqueado:', itemId);
        throw new Error('No se puede cambiar el estado de un grupo del sistema.');
      }
      
      // Buscar el item en el inventario
      const item = inventarioCompleto.find(item => item.id.toString() === itemId.toString());
      if (!item) {
        throw new Error(`Item no encontrado con ID: ${itemId}`);
      }

      // Preparar la actualización solo con estado y sub_estado
      const actualizacionItem = {
        estado: nuevoEstado,
        sub_estado: nuevoSubEstado || item.sub_estado
      };

      // Actualizar en el backend usando el nuevo endpoint específico
      const response = await apiServiceClient.patch(`/inventory/inventario/${itemId}/estado`, actualizacionItem);
      
      if (!response.data) {
        throw new Error('No se recibió respuesta del servidor');
      }

      console.log('✅ Estado del item actualizado exitosamente');
      
      // Actualización optimista: actualizar estado local inmediatamente
      setInventarioCompleto(prevInventario => 
        prevInventario.map(inventarioItem => 
          inventarioItem.id.toString() === itemId.toString()
            ? { ...inventarioItem, ...response.data }
            : inventarioItem
        )
      );
      
      // Recargar datos en segundo plano (no bloquea la UI)
      actualizarColumnasDesdeBackend(); // Sin await para que no bloquee
      
      return true;
    } catch (error: any) {
      console.error('❌ Error al cambiar estado del item:', error);
      console.error('❌ Detalles:', error.response?.data || error.message);
      throw error;
    }
  };

  // ============ FUNCIONES DE ACONDICIONAMIENTO ============

  /**
   * Mueve TICs atemperadas (con cronómetro finalizado) a la fase de acondicionamiento-ensamblaje
   */
  const moverTicsAtemperadasAEnsamblaje = async (ticsSeleccionadas: any[]) => {
    try {
      console.log('🔧 ===== MOVER TICS ATEMPERADAS A ENSAMBLAJE =====');
      console.log('📦 TICs seleccionadas:', ticsSeleccionadas.length);

      // Usar la función del hook de acondicionamiento
      await acondicionamientoHook.moverTicsAEnsamblaje(ticsSeleccionadas, timersGlobales);

      // Actualizar columnas
      actualizarColumnasDebounced();
      
      alert(`✅ ${ticsSeleccionadas.length} TICs movidas a ensamblaje exitosamente`);
      console.log('✅ ===== MOVIMIENTO A ENSAMBLAJE COMPLETADO =====');
      
      return true;
      
    } catch (error: any) {
      console.error('❌ ===== ERROR MOVIENDO A ENSAMBLAJE =====');
      console.error('❌ Error:', error);
      alert(`❌ Error moviendo TICs a ensamblaje: ${error.message}`);
      return false;
    }
  };

  /**
   * Procesa el escaneo de componentes (cajas, VIPs, TICs) para ensamblaje
   */
  const procesarEscaneoAcondicionamiento = async (codigoEscaneado: string) => {
    try {
      console.log(`🔍 Procesando escaneo para acondicionamiento: ${codigoEscaneado}`);
      
      const resultado = await acondicionamientoHook.procesarEscaneoComponentes(codigoEscaneado);
      
      console.log('✅ Componente escaneado:', resultado);
      return resultado;
      
    } catch (error: any) {
      console.error('❌ Error procesando escaneo:', error);
      throw error;
    }
  };

  /**
   * Arma una caja completa (1 caja + 1 VIP + 6 TICs atemperadas)
   */
  const armarCajaCompletaAcondicionamiento = async () => {
    try {
      console.log('🔧 ===== ARMAR CAJA COMPLETA =====');
      
      const resultado = await acondicionamientoHook.armarCajaCompleta();
      
      // Actualizar columnas después del armado
      actualizarColumnasDebounced();
      
      alert(resultado.mensaje);
      console.log('✅ ===== CAJA ARMADA EXITOSAMENTE =====');
      
      return resultado;
      
    } catch (error: any) {
      console.error('❌ ===== ERROR ARMANDO CAJA =====');
      console.error('❌ Error:', error);
      alert(`❌ Error armando caja: ${error.message}`);
      throw error;
    }
  };

  /**
   * Obtiene el estado actual de componentes escaneados para acondicionamiento
   */
  const obtenerEstadoComponentesEscaneados = () => {
    return acondicionamientoHook.componentesEscaneados;
  };

  /**
   * Limpia todos los componentes escaneados
   */
  const limpiarComponentesEscaneados = () => {
    acondicionamientoHook.limpiarComponentesEscaneados();
  };

  return {
    // Estados
    columns,
    setColumns,
    inventarioCompleto,
    cargandoDatos,
    grupoExpandido: bodegaHook.grupoExpandido,
    setGrupoExpandido: bodegaHook.setGrupoExpandido,
    subgrupoExpandido: bodegaHook.subgrupoExpandido,
    setSubgrupoExpandido: bodegaHook.setSubgrupoExpandido,
    navegacionPreAcondicionamiento: preAcondicionamientoHook.navegacionPreAcondicionamiento,
    setNavegacionPreAcondicionamiento: preAcondicionamientoHook.setNavegacionPreAcondicionamiento,
    subgrupoPreAcondicionamiento: preAcondicionamientoHook.subgrupoPreAcondicionamiento,
    setSubgrupoPreAcondicionamiento: preAcondicionamientoHook.setSubgrupoPreAcondicionamiento,
    navegacionAcondicionamiento: acondicionamientoHook.navegacionAcondicionamiento,
    setNavegacionAcondicionamiento: acondicionamientoHook.setNavegacionAcondicionamiento,
    subgrupoAcondicionamiento: acondicionamientoHook.subgrupoAcondicionamiento,
    setSubgrupoAcondicionamiento: acondicionamientoHook.setSubgrupoAcondicionamiento,
    mostrarModalEscaneo,
    setMostrarModalEscaneo,
    rfidsEscaneados,
    setRfidsEscaneados,
    rfidInput,
    setRfidInput,
    handleRfidChange,
    handleRfidChangePreAcondicionamiento,
    tiempoPreAcondicionamiento,
    setTiempoPreAcondicionamiento,
    timersActivos,
    setTimersActivos,
    
    // Funciones
    actualizarColumnasDesdeBackend,
    actualizarDespuesDeClick,
    manejarVolverNivel,
    manejarEscaneoRfid,
    manejarEscaneoRfidPreAcondicionamiento,
    confirmarPreAcondicionamiento,
    verificarRfid,
    cambiarEstadoItem,
    
    // Funciones de cronómetro
    iniciarCronometro,
    detenerCronometro,
    obtenerTiempoRestante,
    moverABodega,
    agregarNuevoItemABodega,
    moverItemABodegaConReagrupacion,
    moverTicAAcondicionamiento,
    
    // Funciones de acondicionamiento (armado de cajas completas)
    moverTicsAtemperadasAEnsamblaje,
    procesarEscaneoAcondicionamiento,
    armarCajaCompletaAcondicionamiento,
    obtenerEstadoComponentesEscaneados,
    limpiarComponentesEscaneados,
    
    // Funciones de envío/operación
    iniciarEnvio: envioHook.iniciarEnvio,
    completarEnvio: envioHook.completarEnvio,
    cancelarEnvio: envioHook.cancelarEnvio,
    obtenerTiempoRestanteEnvio: envioHook.obtenerTiempoRestanteEnvio,
    obtenerEstadisticasEnvio: envioHook.obtenerEstadisticasEnvio,
    itemsEnEnvio: envioHook.itemsEnEnvio,
    cargandoEnvio: envioHook.cargandoEnvio,
    
    // Funciones de navegación por columna
    handleCardClickBodega: bodegaHook.handleCardClick,
    handleCardClickPreAcondicionamiento: preAcondicionamientoHook.handleCardClick,
    handleCardClickAcondicionamiento: acondicionamientoHook.handleCardClickAcondicionamiento,
    volverNivelAnteriorBodega: bodegaHook.volverNivelAnterior,
    volverNivelAnteriorPreAcondicionamiento: preAcondicionamientoHook.volverNivelAnterior,
    volverNivelAnteriorAcondicionamiento: acondicionamientoHook.volverNivelAnteriorAcondicionamiento,
    
    // Estados de WebSocket
    wsConnected,
    wsError
  };
};
