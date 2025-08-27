import React, { useState, useEffect, useRef } from 'react';
import { Package, Plus, Loader, Scan, Trash2, CheckCircle, X } from 'lucide-react';
import { apiServiceClient } from '../../../api/apiClient';
import { ModeloCredcube } from '../../shared/types';

interface RfidLectura {
  rfid: string;
  nombre_unidad: string;
  timestamp: string;
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
  const [ultimoInputProcesado, setUltimoInputProcesado] = useState('');
  const rfidInputRef = useRef<HTMLInputElement>(null);

  // Obtener tipos únicos de los modelos
  const getTiposUnicos = () => {
    const tipos = [...new Set(modelos.map(modelo => {
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
    const modelosFiltrados = modelos.filter(modelo => {
      const nombre = modelo.nombre_modelo.toLowerCase();
      return (
        (tipo === 'CUBE' && (nombre.includes('credcube') || nombre.includes('credo cube'))) ||
        (tipo === 'TIC' && nombre.includes('tics')) ||
        (tipo === 'VIP' && nombre.includes('vip'))
       );
     });
    
    const litrajes = [...new Set(modelosFiltrados.map(modelo => modelo.volumen_litros))]
      .filter(vol => vol != null)
      .sort((a, b) => (a || 0) - (b || 0));
    return litrajes;
  };

  // Encontrar modelo por tipo y litraje
  const encontrarModelo = (tipo: string, litraje: number) => {
    return modelos.find(modelo => {
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

  // Función común para procesar un RFID
  const procesarRfid = async (rfidLimpio: string) => {
    // Verificar que no esté duplicado localmente
    if (lecturasRfid.some(lectura => lectura.rfid === rfidLimpio)) {
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
        setDuplicadosDetectados(prev => [...prev.filter(d => d !== rfidLimpio), rfidLimpio]);
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
    setDuplicadosDetectados(prev => prev.filter(d => d !== rfidLimpio));
    
    // Obtener el modelo seleccionado para generar el nombre correcto
    const modelo = encontrarModelo(tipoSeleccionado, parseFloat(litrajeSeleccionado));
    const nombreUnidad = generarNombreUnidad(tipoSeleccionado, rfidLimpio, modelo);
    
    const nuevaLectura: RfidLectura = {
      rfid: rfidLimpio,
      nombre_unidad: nombreUnidad,
      timestamp: new Date().toLocaleTimeString()
    };
    
    // Solo agregar a la lista, NO registrar automáticamente
    setLecturasRfid(prev => [...prev, nuevaLectura]);
    setRfidInput('');
    setError('');
    
    // Mantener el foco en el input sin hacer scroll
    setTimeout(() => {
      rfidInputRef.current?.focus({ preventScroll: true });
    }, 100);
  };

  // Manejar cambio en el input con auto-procesamiento a 24 caracteres
  const handleRfidChange = async (value: string) => {
    setRfidInput(value);
    
    // Si llegamos exactamente a 24 caracteres, procesar automáticamente
    if (value.length === 24) {
      console.log('🚀 Auto-procesando código de 24 caracteres:', value);
      const rfidLimpio = value.trim();
      await procesarRfid(rfidLimpio);
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
    setLecturasRfid(prev => prev.filter(lectura => lectura.rfid !== rfid));
  };

  // Limpiar todas las lecturas
  const limpiarLecturas = () => {
    setLecturasRfid([]);
    setError('');
    setUltimoInputProcesado('');
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
      // Registrar cada item en el inventario y crear actividades de operación
      for (const lectura of lecturasRfid) {
        const inventarioData = {
          modelo_id: modelo.modelo_id,
          nombre_unidad: lectura.nombre_unidad,
          rfid: lectura.rfid,
          lote: null, // El lote se asignará en pre-acondicionamiento
          estado: 'En bodega',
          categoria: modelo.tipo || tipoSeleccionado, // Usar el tipo del modelo en lugar de 'A'
          validacion_limpieza: null,
          validacion_goteo: null,
          validacion_desinfeccion: null
        };
        
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
      
      // Mostrar modal de éxito
      setItemsRegistrados(lecturasRfid.length);
      setMostrarModalExito(true);
      
      // Limpiar formulario
      setTipoSeleccionado('');
      setLitrajeSeleccionado('');
      setLecturasRfid([]);
      setError('');
      setUltimoInputProcesado('');
      
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

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Registro de Items
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Registre credos, VIPs o TICs especificando el tipo y litraje correspondiente.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 max-w-2xl">
        <div className="flex items-center mb-6">
          <Package className="w-6 h-6 text-primary-600 mr-3" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Registro de Items
          </h2>
        </div>

        <div className="space-y-6">
          {cargandoModelos ? (
            <div className="flex items-center justify-center py-8">
              <Loader className="w-6 h-6 animate-spin text-primary-600 mr-2" />
              <span className="text-gray-600 dark:text-gray-400">Cargando modelos...</span>
            </div>
          ) : (
            <>
              {/* Selección de Tipo y Litraje */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="tipo" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Tipo de Contenedor
                  </label>
                  <select
                    id="tipo"
                    value={tipoSeleccionado}
                    onChange={(e) => {
                      setTipoSeleccionado(e.target.value);
                      setLitrajeSeleccionado(''); // Reset litraje cuando cambia tipo
                    }}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 dark:text-white"
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
                    onChange={(e) => setLitrajeSeleccionado(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 dark:text-white"
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
                    🔫 Escanear RFID (DataWedge)
                  </div>
                </label>
                <input
                  ref={rfidInputRef}
                  type="text"
                  id="rfid"
                  value={rfidInput}
                  onChange={(e) => handleRfidChange(e.target.value)}
                  onKeyDown={handleRfidInput}
                  maxLength={24}
                  placeholder={
                    !tipoSeleccionado || !litrajeSeleccionado 
                      ? "Complete tipo y litraje primero..." 
                      : `DataWedge: Escanee RFID de ${tipoSeleccionado} ${litrajeSeleccionado}L (auto-procesa a 24 chars)...`
                  }
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-gray-900 dark:text-white"
                  disabled={!tipoSeleccionado || !litrajeSeleccionado}
                  autoComplete="off"
                />
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 space-y-1">
                  <p>
                    Escaneados: {lecturasRfid.length} elementos. Los elementos se registrarán cuando presione "Registrar"
                  </p>
                  <p className="text-blue-600">
                    🚀 Auto-procesamiento: Se procesa automáticamente al llegar a 24 caracteres
                  </p>
                  <p className="text-green-600">
                    ✅ Se verifican automáticamente los códigos duplicados en el sistema
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
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  RFIDs Escaneados ({lecturasRfid.length})
                </h3>
                <button
                  type="button"
                  onClick={limpiarLecturas}
                  className="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                >
                  Limpiar Todo
                </button>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-2">
                {lecturasRfid.map((lectura, index) => (
                  <div key={lectura.rfid} className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-md p-3 border border-gray-200 dark:border-gray-700">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <span className="text-sm font-mono bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                          {lectura.nombre_unidad}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          RFID: {lectura.rfid}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {lectura.timestamp}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => eliminarLectura(lectura.rfid)}
                      className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 p-1"
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
            <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md dark:bg-yellow-900/20 dark:border-yellow-800">
              <div className="flex items-center">
                <svg className="h-5 w-5 text-yellow-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span className="text-yellow-800 dark:text-yellow-200 font-medium">
                  {duplicadosDetectados.length} código(s) duplicado(s) detectado(s)
                </span>
              </div>
              <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                Los siguientes códigos ya están registrados en el sistema: {duplicadosDetectados.join(', ')}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {lecturasRfid.length > 0 && (
                <span>Listo para registrar {lecturasRfid.length} item(s)</span>
              )}
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={lecturasRfid.length === 0 || procesandoRegistro}
              className="inline-flex items-center px-6 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors duration-200"
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
      <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="text-lg font-medium text-blue-900 dark:text-blue-100 mb-2">
          Instrucciones de Uso
        </h3>
        <div className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
          <div>
            <p><strong>Paso 1:</strong> Seleccione el tipo de contenedor (CUBE, TIC o VIP)</p>
            <p><strong>Paso 2:</strong> Seleccione el litraje correspondiente</p>
            <p><strong>Paso 3:</strong> Use la pistola RFID para escanear los códigos</p>
            <p><strong>Paso 4:</strong> Presione "Registrar" para guardar todos los items</p>
            <p><strong>Nota:</strong> El lote se asignará posteriormente en la sección de Pre-acondicionamiento</p>
          </div>
        </div>
      </div>

      {/* Modal de Éxito */}
      {mostrarModalExito && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                ¡Registro Exitoso!
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Se registraron exitosamente <strong>{itemsRegistrados}</strong> items de tipo{' '}
                <strong>{tipoSeleccionado === 'CUBE' ? 'CUBE' : tipoSeleccionado}</strong> de{' '}
                <strong>{litrajeSeleccionado}L</strong>.
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">
                Los items han sido agregados al inventario y están disponibles en la sección "En bodega" de operaciones.
                El lote se asignará durante el proceso de pre-acondicionamiento.
              </p>
              <button
                onClick={() => setMostrarModalExito(false)}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200"
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
