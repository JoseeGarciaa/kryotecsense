import React, { useState, useEffect, useRef } from 'react';
import { Package, Plus, Loader, Scan, Trash2, CheckCircle, X, AlertTriangle } from 'lucide-react';
import { apiServiceClient } from '../../../api/apiClient';
import { ModeloCredcube } from '../../shared/types';
import { useAntiDuplicate, useDebouncedCallback } from '../../../shared/hooks/useDebounce';

interface RfidLectura {
  rfid: string;
  nombre_unidad: string;
  // Hora mostrada al usuario (local)
  timestamp: string;
  // Timestamp ISO (UTC) exacto del momento del escaneo
  isoTimestamp: string;
}

const Registro: React.FC = () => {
  const [tipoSeleccionado, setTipoSeleccionado] = useState('');
  const [litrajeSeleccionado, setLitrajeSeleccionado] = useState('');
  const [modelos, setModelos] = useState<ModeloCredcube[]>([]);
  const [cargandoModelos, setCargandoModelos] = useState(true);
  const [error, setError] = useState('');
  const [rfidInput, setRfidInput] = useState('');
  const [lecturasRfid, setLecturasRfid] = useState<RfidLectura[]>([]);
  const [duplicadosDetectados, setDuplicadosDetectados] = useState<string[]>([]);
  const [procesandoRegistro, setProcesandoRegistro] = useState(false);
  const [mostrarModalExito, setMostrarModalExito] = useState(false);
  const [itemsRegistrados, setItemsRegistrados] = useState<number>(0);
  const [conteoDetallado, setConteoDetallado] = useState<{vips: number, tics: number, cubes: number}>({vips: 0, tics: 0, cubes: 0});
  const [ultimoInputProcesado, setUltimoInputProcesado] = useState('');
  const [mostrarCodigosDuplicados, setMostrarCodigosDuplicados] = useState(false);
  const rfidInputRef = useRef<HTMLInputElement>(null);

  // Sistema anti-duplicados con delay muy corto (100ms) solo para evitar doble-procesamiento accidental
  const { isDuplicate, clearHistory } = useAntiDuplicate(100);
  
  // Ref adicional para prevenir RFID duplicados reales con delay más largo (1 segundo)
  const lastRfidProcessedRef = useRef<{ rfid: string; timestamp: number } | null>(null);

  // Función debounced para verificar RFID en base de datos
  const verificarRfidDebounced = useDebouncedCallback(async (rfid: string) => {
    try {
      const response = await apiServiceClient.get(`/inventory/verificar-rfid-sin-auth/${rfid}`);
      return response.data.existe;
    } catch (error) {
      console.error('Error al verificar RFID:', error);
      return false;
    }
  }, 300);

  // Obtener tipos únicos de los modelos
  const getTiposUnicos = () => {
    const tipos = [...new Set(modelos.map((modelo: any) => {
      const nombre = modelo.nombre_modelo.toLowerCase();
      if (typeof nombre === 'string' && (nombre.includes('credcube') || nombre.includes('credo cube'))) return 'CUBE';
      if (typeof nombre === 'string' && nombre.includes('tics')) return 'TIC';
      if (typeof nombre === 'string' && nombre.includes('vip')) return 'VIP';
      return 'Otro';
    }))].filter(tipo => tipo !== 'Otro');
    return tipos;
  };

  // Obtener litrajes para el tipo seleccionado
  const getLitrajesParaTipo = (tipo: string) => {
    const modelosFiltrados = modelos.filter((modelo: any) => {
      const nombre = modelo.nombre_modelo.toLowerCase();
      return (
        (tipo === 'CUBE' && (nombre.includes('credcube') || nombre.includes('credo cube'))) ||
        (tipo === 'TIC' && nombre.includes('tics')) ||
        (tipo === 'VIP' && nombre.includes('vip'))
       );
     });
    
    const litrajes = [...new Set(modelosFiltrados.map((modelo: any) => modelo.volumen_litros))]
      .filter(vol => vol != null)
      .sort((a: any, b: any) => (a || 0) - (b || 0));
    return litrajes;
  };

  // Encontrar modelo por tipo y litraje
  const encontrarModelo = (tipo: string, litraje: number) => {
    return modelos.find((modelo: any) => {
      // Primero verificar si el modelo tiene el campo tipo (preferido)
      if (modelo.tipo) {
        // Comparación case-insensitive para el tipo
        return modelo.tipo.toLowerCase() === tipo.toLowerCase() && modelo.volumen_litros === litraje;
      }
      
      // Fallback: usar lógica basada en nombre_modelo
      const nombre = modelo.nombre_modelo.toLowerCase();
      const esTipo = (
        (tipo === 'CUBE' && (typeof nombre === 'string' && (nombre.includes('credcube') || nombre.includes('credo cube')))) ||
        (tipo === 'TIC' && typeof nombre === 'string' && nombre.includes('tics')) ||
        (tipo === 'VIP' && typeof nombre === 'string' && nombre.includes('vip'))
      );
      return esTipo && modelo.volumen_litros === litraje;
    });
  };

  // Generar nombre de unidad basado en el modelo seleccionado
  const generarNombreUnidad = (tipo: string, rfid: string, modelo?: ModeloCredcube) => {
    // Si tenemos el modelo, usar su nombre_modelo, sino usar el formato anterior como fallback
    return modelo ? modelo.nombre_modelo : `${tipo === 'CUBE' ? 'CUBE' : tipo}${rfid}`;
  };

  // Procesar códigos RFID de 24 caracteres automáticamente
  const procesarRfidAutomatico = (input: string) => {
    const rfids = [];
    for (let i = 0; i < input.length; i += 24) {
      const rfid = input.substring(i, i + 24);
      if (rfid.length === 24) {
        rfids.push(rfid);
      }
    }
    return rfids;
  };

  // Función común para procesar un RFID - SOLO evita duplicados reales, NO bloquea escaneos rápidos
  const procesarRfid = async (rfidLimpio: string) => {
    // Verificar duplicados accidentales (doble-click en <100ms) - MUY RESTRICTIVO
    if (isDuplicate(rfidLimpio)) {
      console.log(`⚠️ Doble-procesamiento evitado: ${rfidLimpio}`);
      // NO mostrar error ni incrementar contador - es transparente al usuario
      setRfidInput('');
      return;
    }

    // Verificar RFID duplicado real con delay más largo (1 segundo)
    const now = Date.now();
    const lastRfidProcessed = lastRfidProcessedRef.current;
    
    if (lastRfidProcessed && lastRfidProcessed.rfid === rfidLimpio && (now - lastRfidProcessed.timestamp) < 1000) {
      console.log(`🚫 RFID duplicado real bloqueado: ${rfidLimpio} (${now - lastRfidProcessed.timestamp}ms después)`);
      setError(`RFID ${rfidLimpio} ya fue procesado recientemente. Espere un momento antes de volver a escanearlo.`);
      setRfidInput('');
      return;
    }

    // Registrar este RFID como procesado
    lastRfidProcessedRef.current = { rfid: rfidLimpio, timestamp: now };

    // Verificar que no esté duplicado localmente en esta sesión
    if (lecturasRfid.some((lectura: any) => lectura.rfid === rfidLimpio)) {
      setError(`RFID ${rfidLimpio} ya fue escaneado en esta sesión`);
      setRfidInput('');
      return;
    }

    // Verificar que se hayan seleccionado tipo y litraje
    if (!tipoSeleccionado || !litrajeSeleccionado) {
      setError('Debe seleccionar tipo y litraje antes de escanear');
      setRfidInput('');
      return;
    }

    try {
      // Verificar si el RFID ya está registrado en la base de datos
      const response = await apiServiceClient.get(`/inventory/verificar-rfid-sin-auth/${rfidLimpio}`);
      if (response.data.existe) {
        // Agregar a la lista de duplicados detectados
        setDuplicadosDetectados((prev: any) => [...prev.filter((d: any) => d !== rfidLimpio), rfidLimpio]);
        setError(`RFID ${rfidLimpio} ya está registrado en el sistema`);
        setRfidInput('');
        return;
      }
    } catch (error) {
      console.error('Error al verificar RFID:', error);
      setError('Error al verificar el código. Intente nuevamente.');
      setRfidInput('');
      return;
    }
    
    // Si llegamos aquí, el código es único - remover de duplicados si estaba ahí
    setDuplicadosDetectados((prev: any) => prev.filter((d: any) => d !== rfidLimpio));
    
    // Obtener el modelo seleccionado para generar el nombre correcto
    const modelo = encontrarModelo(tipoSeleccionado, parseFloat(litrajeSeleccionado));
    const nombreUnidad = generarNombreUnidad(tipoSeleccionado, rfidLimpio, modelo);
    
    const nowDate = new Date();
    const nuevaLectura: RfidLectura = {
      rfid: rfidLimpio,
      nombre_unidad: nombreUnidad,
      timestamp: nowDate.toLocaleTimeString(),
      isoTimestamp: nowDate.toISOString()
    };
    
    // Solo agregar a la lista, NO registrar automáticamente
    setLecturasRfid((prev: any) => [...prev, nuevaLectura]);
    setRfidInput('');
    setError('');
    console.log(`✅ Código procesado correctamente: ${rfidLimpio}`);
    
    // Mantener el foco en el input sin hacer scroll
    setTimeout(() => {
      rfidInputRef.current?.focus({ preventScroll: true });
    }, 100);
  };

  // Manejar cambio en el input con auto-procesamiento alfanumérico
  const handleRfidChange = async (value: string) => {
    setRfidInput(value);
    
    // Solo permitir auto-procesamiento para códigos de EXACTAMENTE 24 caracteres
    if (value.length === 24) {
      // Validar que contenga solo caracteres alfanuméricos
      const hasValidChars = /^[a-zA-Z0-9]+$/.test(value);
      if (hasValidChars) {
        console.log(`🚀 Auto-procesando código RFID de 24 caracteres:`, value);
        const rfidLimpio = value.trim();
        await procesarRfid(rfidLimpio);
      } else {
        setError('El código RFID debe contener solo caracteres alfanuméricos');
        setTimeout(() => setError(''), 3000);
      }
    } else if (value.length > 24) {
      // Si supera 24 caracteres, truncar y mostrar advertencia
      const truncated = value.substring(0, 24);
      setRfidInput(truncated);
      setError('El código RFID se ha truncado a 24 caracteres máximo');
      setTimeout(() => setError(''), 3000);
      
      // Auto-procesar si el código truncado es válido
      const hasValidChars = /^[a-zA-Z0-9]+$/.test(truncated);
      if (hasValidChars) {
        console.log(`🚀 Auto-procesando código RFID truncado a 24 caracteres:`, truncated);
        await procesarRfid(truncated);
      }
    }
  };

  // Manejar entrada de RFID (simula pistola)
  const handleRfidInput = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && rfidInput.trim()) {
      const rfidLimpio = rfidInput.trim();
      await procesarRfid(rfidLimpio);
    }
  };

  // Eliminar lectura individual
  const eliminarLectura = (rfid: string) => {
    setLecturasRfid((prev: any) => prev.filter((lectura: any) => lectura.rfid !== rfid));
  };

  // Limpiar todas las lecturas
  const limpiarLecturas = () => {
    setLecturasRfid([]);
    setError('');
    setUltimoInputProcesado('');
    setMostrarCodigosDuplicados(false);
    clearHistory(); // Limpiar historial anti-duplicados
    console.log('🧹 Todas las lecturas limpiadas');
  };

  // Cargar modelos al montar el componente
  useEffect(() => {
    const fetchModelos = async () => {
      try {
        setCargandoModelos(true);
        const response = await apiServiceClient.get('/inventory/modelos/');
        setModelos(response.data || []);
        setError('');
      } catch (err) {
        setError('No se pudieron cargar los modelos.');
        console.error(err);
      } finally {
        setCargandoModelos(false);
      }
    };

    fetchModelos();
  }, []);

  // Mantener foco en input RFID cuando esté habilitado
  useEffect(() => {
    if (tipoSeleccionado && litrajeSeleccionado && rfidInputRef.current) {
      rfidInputRef.current.focus();
    }
  }, [tipoSeleccionado, litrajeSeleccionado]);

  const handleSubmit = async () => {
    console.log('🚀 INICIANDO REGISTRO - Estado actual:', {
      tipoSeleccionado,
      litrajeSeleccionado,
      totalItems: lecturasRfid.length,
      timestamp: new Date().toISOString()
    });
    
    if (!tipoSeleccionado || !litrajeSeleccionado) {
      setError('Por favor, complete tipo y litraje.');
      return;
    }
    
    if (lecturasRfid.length === 0) {
      setError('Por favor, escanee al menos un RFID.');
      return;
    }
    
    const modelo = encontrarModelo(tipoSeleccionado, parseFloat(litrajeSeleccionado));
    if (!modelo) {
      setError('Modelo no encontrado para el tipo y litraje seleccionados.');
      return;
    }
    
    setProcesandoRegistro(true);
    setError('');
    
    try {
      // Contadores para cada tipo de item
      let contadorVips = 0;
      let contadorTics = 0;
      let contadorCubes = 0;
      
      // Registrar cada item en el inventario y crear actividades de operación
      for (const lectura of lecturasRfid) {
        // Detectar automáticamente el tipo basado en el nombre del item
        const categoriaFinal = detectarTipoAutomatico(lectura.nombre_unidad);
        
        console.log('🔍 Debug categoría:', { 
          modeloTipo: modelo.tipo, 
          tipoSeleccionado, 
          modelo: modelo.nombre_modelo,
          nombreItem: lectura.nombre_unidad,
          categoriaDetectada: categoriaFinal,
          timestamp: new Date().toISOString()
        });
        
        console.log('🎯 Categoría final determinada:', categoriaFinal);
        
        const inventarioData = {
          modelo_id: modelo.modelo_id,
          nombre_unidad: lectura.nombre_unidad,
          rfid: lectura.rfid,
          lote: null, // El lote se asignará en Pre acondicionamiento
          estado: 'En bodega',
          categoria: categoriaFinal,
          validacion_limpieza: null,
          validacion_goteo: null,
          validacion_desinfeccion: null,
          // Timestamps tomados del momento del escaneo para que coincidan con lo mostrado
          fecha_ingreso: lectura.isoTimestamp || new Date().toISOString(),
          ultima_actualizacion: lectura.isoTimestamp || new Date().toISOString()
        };
        
        // Contar por tipo basado en la categoría del item
        const categoriaItem = categoriaFinal; // No convertir a mayúsculas
        console.log('🔍 Contando item:', { categoriaFinal, categoriaItem, lectura: lectura.nombre_unidad });
        
        if (categoriaItem === 'VIP') {
          contadorVips++;
          console.log('✅ VIP contado, total VIPs:', contadorVips);
        } else if (categoriaItem === 'TIC') {
          contadorTics++;
          console.log('✅ TIC contado, total TICs:', contadorTics);
        } else if (categoriaItem === 'Cube') {
          contadorCubes++;
          console.log('✅ Cube contado, total Cubes:', contadorCubes);
        } else {
          console.warn('⚠️ Categoría no reconocida:', categoriaItem);
        }
        
        console.log('📦 Creando item en inventario:', inventarioData);
        const inventarioResponse = await apiServiceClient.post('/inventory/inventario/', inventarioData);
        const itemCreado = inventarioResponse.data;
        console.log('✅ Item creado:', itemCreado.id);
        
        // Crear actividad de operación para "En bodega"
        const actividadData = {
          inventario_id: itemCreado.id,
          usuario_id: 1, // TODO: Obtener del contexto de usuario
          descripcion: `Item registrado y almacenado en bodega - Sin lote asignado`,
          estado_nuevo: 'En bodega',
          sub_estado_nuevo: 'Disponible'
        };
        
        console.log('🎨 Creando actividad:', actividadData);
        await apiServiceClient.post('/activities/actividades/', actividadData);
        console.log('✅ Actividad creada');
      }
      
      // Log final de contadores
      console.log('📊 Conteo final:', {
        total: lecturasRfid.length,
        vips: contadorVips,
        tics: contadorTics,
        cubes: contadorCubes
      });
      
      // Mostrar modal de éxito con conteo detallado
      setItemsRegistrados(lecturasRfid.length);
      setConteoDetallado({
        vips: contadorVips,
        tics: contadorTics,
        cubes: contadorCubes
      });
      setMostrarModalExito(true);
      
      // Limpiar formulario (pero NO resetear conteoDetallado aquí)
      setTipoSeleccionado('');
      setLitrajeSeleccionado('');
      setLecturasRfid([]);
      setError('');
      setUltimoInputProcesado('');
      setMostrarCodigosDuplicados(false);
      clearHistory();
      
    } catch (err: any) {
      console.error('Error registrando items:', err);
      
      // Manejar errores específicos
      if (err.response?.status === 400) {
        const errorDetail = err.response?.data?.detail;
        if (errorDetail && typeof errorDetail === 'string' && errorDetail.includes('Ya existe un credcube con RFID')) {
          setError(`Error: ${errorDetail}. Por favor, use RFIDs diferentes.`);
        } else {
          setError(`Error de validación: ${errorDetail || 'Datos inválidos'}`);
        }
      } else if (err.response?.status === 503) {
        setError('Error: Servicio no disponible. Por favor, inténtelo más tarde.');
      } else {
        setError('Error al registrar los items. Por favor, inténtelo de nuevo.');
      }
    } finally {
      setProcesandoRegistro(false);
    }
  };

  // Función para detectar automáticamente el tipo basado en el nombre del item
  const detectarTipoAutomatico = (nombreItem: string): string => {
    const nombre = nombreItem.toLowerCase();
    
    // Detectar TIC
    if (nombre.includes('tic') || nombre.startsWith('tics')) {
      return 'TIC';
    }
    
    // Detectar VIP
    if (nombre.includes('vip')) {
      return 'VIP';
    }
    
    // Detectar Cube (puede ser "Credo Cube", "Cube", etc.)
    if (nombre.includes('cube') || nombre.includes('credo')) {
      return 'Cube';
    }
    
    // Fallback: usar el tipo seleccionado en el dropdown
    if (tipoSeleccionado === 'VIP') {
      return 'VIP';
    } else if (tipoSeleccionado === 'TIC') {
      return 'TIC';
    } else if (tipoSeleccionado === 'CUBE') {
      return 'Cube';
    }
    
    // Por defecto
    return 'Cube';
  };

  // Manejar cierre del modal de éxito
  const handleCloseModal = () => {
    setMostrarModalExito(false);
    setConteoDetallado({vips: 0, tics: 0, cubes: 0});
  };

  return (
    <div className="p-3 sm:p-6">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Registro de Items
        </h1>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
          Registre credos, VIPs o TICs especificando el tipo y litraje correspondiente.
        </p>
      </div>

      <div className="rounded-lg p-3 sm:p-6 max-w-none lg:max-w-4xl lg:mx-0">
        <div className="flex items-center mb-4 sm:mb-6">
          <Package className="w-5 h-5 sm:w-6 sm:h-6 text-primary-600 mr-3" />
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
            Registro de Items
          </h2>
        </div>

        <div className="space-y-4 sm:space-y-6">
          {cargandoModelos ? (
            <div className="flex items-center justify-center py-8">
              <Loader className="w-6 h-6 animate-spin text-primary-600 mr-2" />
              <span className="text-gray-600 dark:text-gray-400">Cargando modelos...</span>
            </div>
          ) : (
            <>
              {/* Selección de Tipo y Litraje */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label htmlFor="tipo" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Tipo de Contenedor
                  </label>
                  <select
                    id="tipo"
                    value={tipoSeleccionado}
                    onChange={(e: any) => {
                      setTipoSeleccionado(e.target.value);
                      setLitrajeSeleccionado(''); // Reset litraje cuando cambia tipo
                    }}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 dark:text-white text-sm sm:text-base"
                    required
                  >
                    <option value="">Seleccione el tipo</option>
                    {getTiposUnicos().map((tipo) => (
                      <option key={tipo} value={tipo}>
                        {tipo === 'CUBE' ? 'CUBE' : tipo}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="litraje" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Litraje
                  </label>
                  <select
                    id="litraje"
                    value={litrajeSeleccionado}
                    onChange={(e: any) => setLitrajeSeleccionado(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 dark:text-white text-sm sm:text-base"
                    required
                    disabled={!tipoSeleccionado}
                  >
                    <option value="">Seleccione el litraje</option>
                    {tipoSeleccionado && getLitrajesParaTipo(tipoSeleccionado).map((litraje) => (
                      <option key={litraje} value={litraje}>
                        {litraje}L
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Input para Pistola RFID */}
              <div>
                <label htmlFor="rfid" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <div className="flex items-center">
                    <Scan className="w-4 h-4 mr-2" />
                    🔫 Escanear RFID
                  </div>
                </label>
                <input
                  ref={rfidInputRef}
                  type="text"
                  id="rfid"
                  value={rfidInput}
                  onChange={(e: any) => handleRfidChange(e.target.value)}
                  onKeyDown={handleRfidInput}
                  maxLength={24}
                  placeholder={
                    !tipoSeleccionado || !litrajeSeleccionado 
                      ? "Complete tipo y litraje primero..." 
                      : `DataWedge: Escanee RFID de ${tipoSeleccionado} ${litrajeSeleccionado}L (exactamente 24 caracteres)...`
                  }
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 dark:text-white text-sm"
                  disabled={!tipoSeleccionado || !litrajeSeleccionado}
                  autoComplete="off"
                />
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 space-y-1">
                  <p>
                    Escaneados: <span className="font-medium text-green-600">{lecturasRfid.length}</span> elementos
                  </p>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}
            </>
          )}

          {/* Lista de RFIDs Escaneados */}
          {lecturasRfid.length > 0 && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
                <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white">
                  RFIDs Escaneados ({lecturasRfid.length})
                </h3>
                <button
                  type="button"
                  onClick={limpiarLecturas}
                  className="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 self-start sm:self-auto"
                >
                  Limpiar Todo
                </button>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-2">
                {lecturasRfid.map((lectura: any, index: any) => (
                  <div key={lectura.rfid} className="flex flex-col sm:flex-row sm:items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-md p-3 border border-gray-200 dark:border-gray-700 gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                        <span className="text-sm font-mono bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 px-2 py-1 rounded truncate">
                          {lectura.nombre_unidad}
                        </span>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs">
                          <span className="text-gray-500 dark:text-gray-400 font-mono break-all">
                            RFID: {lectura.rfid}
                          </span>
                          <span className="text-gray-400 dark:text-gray-500">
                            {lectura.timestamp}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => eliminarLectura(lectura.rfid)}
                      className="self-end sm:self-center text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 p-1 flex-shrink-0"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {duplicadosDetectados.length > 0 && (
            <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
              <div className="flex items-start">
                <AlertTriangle className="h-5 w-5 text-yellow-400 mr-2 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-yellow-800 dark:text-yellow-200 font-medium">
                      {duplicadosDetectados.length} código(s) duplicado(s)
                    </span>
                    <button
                      onClick={() => setMostrarCodigosDuplicados(!mostrarCodigosDuplicados)}
                      className="ml-2 text-yellow-600 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-200 transition-colors text-sm"
                      title={mostrarCodigosDuplicados ? "Ocultar códigos" : "Mostrar códigos"}
                    >
                      {mostrarCodigosDuplicados ? "Ocultar" : "Ver +"}
                    </button>
                  </div>
                  {mostrarCodigosDuplicados && (
                    <>
                      <div className="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
                        Los siguientes códigos ya están registrados en el sistema:
                      </div>
                    <div className="mt-2 max-h-32 overflow-y-auto bg-yellow-100/50 dark:bg-yellow-900/30 rounded-md p-2">
                      <div className="text-xs font-mono text-yellow-600 dark:text-yellow-400 space-y-1">
                        {duplicadosDetectados.map((codigo, index) => (
                          <div key={index} className="break-all bg-white dark:bg-gray-800 rounded px-2 py-1 border border-yellow-200 dark:border-yellow-700">
                            {codigo}
                          </div>
                        ))}
                      </div>
                    </div>
                    </>
                  )}
                  {!mostrarCodigosDuplicados && (
                    <div className="mt-1 text-xs text-yellow-700 dark:text-yellow-300">
                      Haz clic en "Ver +" para ver los códigos.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {lecturasRfid.length > 0 && (
                <span>Listo para registrar {lecturasRfid.length} item(s)</span>
              )}
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={lecturasRfid.length === 0 || procesandoRegistro}
              className="w-full sm:w-auto inline-flex items-center justify-center px-4 sm:px-6 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors duration-200 text-sm sm:text-base"
            >
              {procesandoRegistro ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  Registrando...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Registrar {lecturasRfid.length} Item(s)
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Información adicional */}
      <div className="mt-6 sm:mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4">
        <h3 className="text-base sm:text-lg font-medium text-blue-900 dark:text-blue-100 mb-2">
          Instrucciones de Uso
        </h3>
        <div className="text-xs sm:text-sm text-blue-800 dark:text-blue-200 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
            <div>
              <p><strong>Paso 1:</strong> Seleccione el tipo de contenedor (CUBE, TIC o VIP)</p>
              <p><strong>Paso 2:</strong> Seleccione el litraje correspondiente</p>
            </div>
            <div>
              <p><strong>Paso 3:</strong> Use la pistola RFID para escanear los códigos</p>
              <p><strong>Paso 4:</strong> Presione "Registrar" para guardar todos los items</p>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-700">
            <p><strong>Nota:</strong> El lote se asignará posteriormente en la sección de Pre acondicionamiento</p>
            <p><strong>Códigos RFID:</strong> Deben tener exactamente 24 caracteres alfanuméricos</p>
            <p><strong>Auto-procesamiento:</strong> Se procesa automáticamente al completar 24 caracteres</p>
          </div>
        </div>
      </div>

      {/* Modal de Éxito */}
      {mostrarModalExito && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-lg shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-4 sm:p-6 w-full max-w-md mx-auto">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100/80 dark:bg-green-900/50 backdrop-blur-sm mb-4">
                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                ¡Registro Exitoso!
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 sm:mb-6">
                Se registraron exitosamente <strong>{itemsRegistrados}</strong> items.
              </p>
              
              {/* Conteo detallado por tipo */}
              <div className="mb-4 p-3 bg-gray-100/70 dark:bg-gray-700/70 backdrop-blur-sm rounded-lg">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Detalle por tipo:
                </p>
                <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                  <div className="flex justify-between">
                    <span>Total de items:</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">{itemsRegistrados}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>CUBEs registrados:</span>
                    <span className="font-medium text-purple-600 dark:text-purple-400">{conteoDetallado.cubes}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>VIPs registrados:</span>
                    <span className="font-medium text-green-600 dark:text-green-400">{conteoDetallado.vips}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>TICs registrados:</span>
                    <span className="font-medium text-orange-600 dark:text-orange-400">{conteoDetallado.tics}</span>
                  </div>
                </div>
              </div>
              
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-4 sm:mb-6">
                Los items han sido agregados al inventario y están disponibles en la sección "En bodega" de operaciones.
                El lote se asignará durante el proceso de Pre acondicionamiento.
              </p>
              <button
                onClick={handleCloseModal}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200 text-sm sm:text-base"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Registro;
