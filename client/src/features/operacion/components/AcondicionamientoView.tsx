import React, { useState, useEffect } from 'react';
import { X, Package, Settings, Scan, Plus, CheckCircle, AlertCircle } from 'lucide-react';
import { useAcondicionamiento } from '../hooks/useAcondicionamiento';
import { useOperaciones } from '../hooks/useOperaciones';
import TraerDeBodegaModal from './TraerDeBodegaModal';

interface AcondicionamientoViewProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ComponenteEscaneado {
  codigo: string;
  tipo: 'CAJA' | 'VIP' | 'TIC';
  estadoActual?: string;
  fechaEscaneo: string;
}

interface CajaArmada {
  id: string;
  caja: ComponenteEscaneado;
  vip: ComponenteEscaneado;
  tics: ComponenteEscaneado[];
  fechaCreacion: string;
  estado: 'ENSAMBLAJE' | 'LISTA_PARA_DESPACHO';
}

interface TicSimple {
  id: string;
  codigoTic: string;
  estado: string;
  timerCompleto: boolean;
  nombre: string;
}

const AcondicionamientoView: React.FC<AcondicionamientoViewProps> = ({ isOpen, onClose }) => {
  const { 
    componentesEscaneados, 
    validarTicParaAcondicionamiento,
    procesarEscaneoComponentes,
    armarCajaCompleta
  } = useAcondicionamiento();
  
  const { inventarioCompleto, cambiarEstadoItem } = useOperaciones();
  
  const [subEstado, setSubEstado] = useState<'ENSAMBLAJE' | 'LISTA_PARA_DESPACHO'>('ENSAMBLAJE');
  const [codigoEscaneado, setCodigoEscaneado] = useState('');
  const [cajasArmadas, setCajasArmadas] = useState<CajaArmada[]>([]);
  const [mostrarModalTics, setMostrarModalTics] = useState(false);
  const [mostrarModalVips, setMostrarModalVips] = useState(false);
  const [mostrarModalCajas, setMostrarModalCajas] = useState(false);
  const [ticsDisponibles, setTicsDisponibles] = useState<TicSimple[]>([]);
  const [vipsDisponibles, setVipsDisponibles] = useState<any[]>([]);
  const [cajasDisponibles, setCajasDisponibles] = useState<any[]>([]);
  const [mensaje, setMensaje] = useState<{ tipo: 'success' | 'error' | 'warning'; texto: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      cargarTicsAtemperados();
      cargarVipsDeBodega();
      cargarCajasDeBodega();
    }
  }, [isOpen, inventarioCompleto]);

  const cargarTicsAtemperados = async () => {
    try {
      // Obtener TICs reales del inventario que estén en estado atemperado
      const ticsAtemperados = inventarioCompleto.filter((item: any) => 
        item.categoria === 'TIC' && 
        item.estado === 'Atemperamiento' && 
        item.sub_estado === 'Atemperado'
      );
      
      const ticsFormateados = ticsAtemperados.map((item: any) => ({
        id: item.id,
        codigoTic: item.rfid || item.codigo,
        estado: item.sub_estado,
        timerCompleto: true,
        nombre: item.nombre_unidad || 'TIC sin nombre'
      }));
      
      setTicsDisponibles(ticsFormateados);
      console.log('📋 TICs atemperados cargados:', ticsFormateados.length);
    } catch (error) {
      console.error('Error al cargar TICs atemperados:', error);
      mostrarMensaje('error', 'Error al cargar TICs disponibles');
    }
  };

  const cargarVipsDeBodega = async () => {
    try {
      const vips = inventarioCompleto.filter((item: any) => 
        item.categoria === 'VIP' && 
        item.estado === 'En bodega'
      );
      setVipsDisponibles(vips);
      console.log('📋 VIPs en bodega cargados:', vips.length);
    } catch (error) {
      console.error('Error al cargar VIPs:', error);
      mostrarMensaje('error', 'Error al cargar VIPs de bodega');
    }
  };

  const cargarCajasDeBodega = async () => {
    try {
      const cajas = inventarioCompleto.filter((item: any) => 
        item.categoria === 'Cube' && 
        item.estado === 'En bodega'
      );
      setCajasDisponibles(cajas);
      console.log('📋 Cajas en bodega cargadas:', cajas.length);
    } catch (error) {
      console.error('Error al cargar cajas:', error);
      mostrarMensaje('error', 'Error al cargar cajas de bodega');
    }
  };

  const mostrarMensaje = (tipo: 'success' | 'error' | 'warning', texto: string) => {
    setMensaje({ tipo, texto });
    setTimeout(() => setMensaje(null), 5000);
  };

  const manejarEscaneo = async () => {
    if (!codigoEscaneado.trim()) {
      mostrarMensaje('warning', 'Por favor ingresa un código para escanear');
      return;
    }

    try {
      await procesarEscaneoComponentes(codigoEscaneado);
      setCodigoEscaneado('');
      mostrarMensaje('success', 'Componente escaneado exitosamente');
      verificarCajaCompleta();
    } catch (error) {
      console.error('Error al procesar escaneo:', error);
      mostrarMensaje('error', 'Error al procesar el escaneo del componente');
    }
  };

  const verificarCajaCompleta = () => {
    const cajas = componentesEscaneados.cajas || [];
    const vips = componentesEscaneados.vips || [];
    const ticsArray = componentesEscaneados.tics || [];

    if (cajas.length > 0 && vips.length > 0 && ticsArray.length >= 6) {
      const nuevaCaja: CajaArmada = {
        id: `CAJA_${Date.now()}`,
        caja: { codigo: cajas[0], tipo: 'CAJA', fechaEscaneo: new Date().toISOString() },
        vip: { codigo: vips[0], tipo: 'VIP', fechaEscaneo: new Date().toISOString() },
        tics: ticsArray.slice(0, 6).map((tic: any) => ({ 
          codigo: tic, 
          tipo: 'TIC' as const, 
          fechaEscaneo: new Date().toISOString() 
        })),
        fechaCreacion: new Date().toISOString(),
        estado: 'ENSAMBLAJE'
      };
      
      setCajasArmadas(prev => [...prev, nuevaCaja]);
      mostrarMensaje('success', '¡Caja completa armada exitosamente!');
    }
  };

  const manejarSeleccionTic = async (tic: TicSimple) => {
    try {
      console.log('🔄 Moviendo TIC a acondicionamiento:', tic);
      
      // Cambiar estado a "Acondicionamiento" y sub-estado a "Ensamblaje"
      await cambiarEstadoItem(tic.id, 'Acondicionamiento', 'Ensamblaje');
      
      setMostrarModalTics(false);
      mostrarMensaje('success', `TIC ${tic.codigoTic} movido a acondicionamiento`);
      
      // Recargar la lista de TICs disponibles
      cargarTicsAtemperados();
    } catch (error) {
      console.error('❌ Error al seleccionar TIC:', error);
      mostrarMensaje('error', 'Error al mover TIC a acondicionamiento');
    }
  };

  const manejarSeleccionVip = async (vip: any) => {
    try {
      console.log('🔄 Moviendo VIP a acondicionamiento:', vip);
      
      // Cambiar estado a "Acondicionamiento" y sub-estado a "Ensamblaje"
      await cambiarEstadoItem(vip.id, 'Acondicionamiento', 'Ensamblaje');
      
      setMostrarModalVips(false);
      mostrarMensaje('success', `VIP ${vip.nombre_unidad} movido a acondicionamiento`);
      
      // Recargar la lista de VIPs disponibles
      cargarVipsDeBodega();
    } catch (error) {
      console.error('❌ Error al seleccionar VIP:', error);
      mostrarMensaje('error', 'Error al mover VIP a acondicionamiento');
    }
  };

  const manejarSeleccionCaja = async (caja: any) => {
    try {
      console.log('🔄 Moviendo Caja a acondicionamiento:', caja);
      
      // Cambiar estado a "Acondicionamiento" y sub-estado a "Ensamblaje"
      await cambiarEstadoItem(caja.id, 'Acondicionamiento', 'Ensamblaje');
      
      setMostrarModalCajas(false);
      mostrarMensaje('success', `Caja ${caja.nombre_unidad} movida a acondicionamiento`);
      
      // Recargar la lista de cajas disponibles
      cargarCajasDeBodega();
    } catch (error) {
      console.error('❌ Error al seleccionar caja:', error);
      mostrarMensaje('error', 'Error al mover caja a acondicionamiento');
    }
  };

  const moverCajaADespacho = async (cajaId: string) => {
    try {
      setCajasArmadas(prev => 
        prev.map(caja => 
          caja.id === cajaId 
            ? { ...caja, estado: 'LISTA_PARA_DESPACHO' }
            : caja
        )
      );
      mostrarMensaje('success', 'Caja movida a Lista para Despacho');
    } catch (error) {
      console.error('Error al mover caja:', error);
      mostrarMensaje('error', 'Error al mover caja a despacho');
    }
  };

  const obtenerConteoComponentes = () => {
    const cajas = (componentesEscaneados.cajas || []).length;
    const vips = (componentesEscaneados.vips || []).length;
    const ticsCount = (componentesEscaneados.tics || []).length;
    
    return { cajas, vips, tics: ticsCount };
  };

  const conteo = obtenerConteoComponentes();

  if (!isOpen) return null;

  return (
  <div className="fixed top-0 right-0 bottom-0 left-0 md:left-64 z-40">
  <div className="w-full h-full flex flex-col">
        {/* Header */}
  <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-3">
            <Settings className="h-6 w-6 text-blue-600" />
            <h2 className="text-xl font-semibold">Acondicionamiento</h2>
          </div>
        </div>

        {/* Sub-estado selector */}
  <div className="p-4 border-b">
          <div className="flex space-x-4">
            <button
              onClick={() => setSubEstado('ENSAMBLAJE')}
              className={`px-4 py-2 rounded-lg font-medium ${
                subEstado === 'ENSAMBLAJE'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border'
              }`}
            >
              Ensamblaje
            </button>
            <button
              onClick={() => setSubEstado('LISTA_PARA_DESPACHO')}
              className={`px-4 py-2 rounded-lg font-medium ${
                subEstado === 'LISTA_PARA_DESPACHO'
                  ? 'bg-green-600 text-white'
                  : 'bg-white text-gray-700 border'
              }`}
            >
              Lista para Despacho
            </button>
          </div>
        </div>

        {/* Mensaje */}
        {mensaje && (
          <div className={`p-4 m-4 rounded-lg flex items-center space-x-2 ${
            mensaje.tipo === 'success' ? 'bg-green-100 text-green-800' :
            mensaje.tipo === 'error' ? 'bg-red-100 text-red-800' :
            'bg-yellow-100 text-yellow-800'
          }`}>
            {mensaje.tipo === 'success' && <CheckCircle className="h-5 w-5" />}
            {mensaje.tipo === 'error' && <X className="h-5 w-5" />}
            {mensaje.tipo === 'warning' && <AlertCircle className="h-5 w-5" />}
            <span>{mensaje.texto}</span>
          </div>
        )}

  <div className="flex-1 overflow-hidden">
          {subEstado === 'ENSAMBLAJE' ? (
            <div className="h-full flex">
              {/* Panel de escaneo */}
              <div className="w-1/3 p-6 border-r">
                <h3 className="text-lg font-semibold mb-4">Escanear Componentes</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Código de Componente
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={codigoEscaneado}
                        onChange={(e) => setCodigoEscaneado(e.target.value)}
                        className="flex-1 border rounded-lg px-3 py-2"
                        placeholder="Escanear o escribir código"
                        onKeyPress={(e) => e.key === 'Enter' && manejarEscaneo()}
                      />
                      <button
                        onClick={manejarEscaneo}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                      >
                        <Scan className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => setMostrarModalTics(true)}
                    className="w-full bg-blue-100 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-200 flex items-center justify-center space-x-2 mb-2"
                  >
                    <Plus className="h-5 w-5" />
                    <span>Añadir TIC Atemperado</span>
                  </button>

                  <button
                    onClick={() => setMostrarModalVips(true)}
                    className="w-full bg-green-100 text-green-700 px-4 py-2 rounded-lg hover:bg-green-200 flex items-center justify-center space-x-2 mb-2"
                  >
                    <Package className="h-5 w-5" />
                    <span>Añadir VIP de Bodega</span>
                  </button>

                  <button
                    onClick={() => setMostrarModalCajas(true)}
                    className="w-full bg-purple-100 text-purple-700 px-4 py-2 rounded-lg hover:bg-purple-200 flex items-center justify-center space-x-2"
                  >
                    <Package className="h-5 w-5" />
                    <span>Añadir Caja de Bodega</span>
                  </button>
                </div>

                {/* Conteo de componentes */}
                <div className="mt-6 p-4 rounded-lg">
                  <h4 className="font-medium mb-2">Componentes Escaneados</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Cajas:</span>
                      <span className={conteo.cajas >= 1 ? 'text-green-600 font-medium' : ''}>
                        {conteo.cajas}/1
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>VIPs:</span>
                      <span className={conteo.vips >= 1 ? 'text-green-600 font-medium' : ''}>
                        {conteo.vips}/1
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>TICs:</span>
                      <span className={conteo.tics >= 6 ? 'text-green-600 font-medium' : ''}>
                        {conteo.tics}/6
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Lista de cajas armadas */}
              <div className="flex-1 p-6">
                <h3 className="text-lg font-semibold mb-4">Cajas en Ensamblaje</h3>
                <div className="space-y-4 overflow-y-auto">
                  {cajasArmadas.filter(caja => caja.estado === 'ENSAMBLAJE').map(caja => (
                    <div key={caja.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <Package className="h-5 w-5 text-blue-600" />
                          <span className="font-medium">{caja.id}</span>
                        </div>
                        <button
                          onClick={() => moverCajaADespacho(caja.id)}
                          className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                        >
                          Mover a Despacho
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="font-medium">Caja:</span>
                          <div>{caja.caja.codigo}</div>
                        </div>
                        <div>
                          <span className="font-medium">VIP:</span>
                          <div>{caja.vip.codigo}</div>
                        </div>
                        <div>
                          <span className="font-medium">TICs:</span>
                          <div>
                            {caja.tics.map(tic => tic.codigo).join(', ')}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Vista de Lista para Despacho */
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4">Cajas Listas para Despacho</h3>
              <div className="space-y-4 overflow-y-auto">
                {cajasArmadas.filter(caja => caja.estado === 'LISTA_PARA_DESPACHO').map(caja => (
                  <div key={caja.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <Package className="h-5 w-5 text-green-600" />
                        <span className="font-medium">{caja.id}</span>
                        <span className="text-sm bg-green-200 px-2 py-1 rounded">
                          Lista para Despacho
                        </span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="font-medium">Caja:</span>
                        <div>{caja.caja.codigo}</div>
                      </div>
                      <div>
                        <span className="font-medium">VIP:</span>
                        <div>{caja.vip.codigo}</div>
                      </div>
                      <div>
                        <span className="font-medium">TICs:</span>
                        <div>
                          {caja.tics.map(tic => tic.codigo).join(', ')}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de selección de TICs */}
      {mostrarModalTics && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Seleccionar TICs Atemperados</h3>
              <button 
                onClick={() => setMostrarModalTics(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {ticsDisponibles.length === 0 ? (
                <div className="text-center py-8">
                  No hay TICs atemperados disponibles
                </div>
              ) : (
                <div className="space-y-2">
                  {ticsDisponibles.map(tic => (
                    <div 
                      key={tic.id}
                      onClick={() => manejarSeleccionTic(tic)}
                      className="border rounded-lg p-3 cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{tic.codigoTic}</div>
                          <div className="text-sm">
                            {tic.nombre} | Estado: {tic.estado}
                          </div>
                        </div>
                        <Plus className="h-5 w-5 text-blue-600" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de selección de VIPs */}
      {mostrarModalVips && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Seleccionar VIPs de Bodega</h3>
              <button 
                onClick={() => setMostrarModalVips(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {vipsDisponibles.length === 0 ? (
                <div className="text-center py-8">
                  No hay VIPs disponibles en bodega
                </div>
              ) : (
                <div className="space-y-2">
                  {vipsDisponibles.map(vip => (
                    <div 
                      key={vip.id}
                      onClick={() => manejarSeleccionVip(vip)}
                      className="border rounded-lg p-3 cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{vip.rfid || vip.codigo}</div>
                          <div className="text-sm">
                            {vip.nombre_unidad || 'VIP'} | Modelo: {vip.nombre_modelo || 'N/A'}
                          </div>
                        </div>
                        <Package className="h-5 w-5 text-green-600" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de selección de Cajas */}
      {mostrarModalCajas && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Seleccionar Cajas de Bodega</h3>
              <button 
                onClick={() => setMostrarModalCajas(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {cajasDisponibles.length === 0 ? (
                <div className="text-center py-8">
                  No hay cajas disponibles en bodega
                </div>
              ) : (
                <div className="space-y-2">
                  {cajasDisponibles.map(caja => (
                    <div 
                      key={caja.id}
                      onClick={() => manejarSeleccionCaja(caja)}
                      className="border rounded-lg p-3 cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{caja.rfid || caja.codigo}</div>
                          <div className="text-sm">
                            {caja.nombre_unidad || 'Caja'} | Volumen: {caja.volumen || 'N/A'}
                          </div>
                        </div>
                        <Package className="h-5 w-5 text-purple-600" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AcondicionamientoView;
