import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { apiServiceClient } from '../../../api/apiClient';
import { Credocube, ModeloCredcube } from '../../shared/types';

interface EditarCredocubeModalProps {
  credocube: Credocube;
  onClose: () => void;
  onSuccess: () => void;
}

const EditarCredocubeModal: React.FC<EditarCredocubeModalProps> = ({ credocube, onClose, onSuccess }) => {
  const [nombreUnidad, setNombreUnidad] = useState(credocube.nombre_unidad);
  const [rfid, setRfid] = useState(credocube.rfid);
  const [modeloId, setModeloId] = useState<number | ''>(credocube.modelo_id);
  const [lote, setLote] = useState(credocube.lote || '');
  const [estado, setEstado] = useState(credocube.estado);
  const [subEstado, setSubEstado] = useState(credocube.sub_estado || '');
  const [categoria, setCategoria] = useState(credocube.categoria || '');
  const [validacionLimpieza, setValidacionLimpieza] = useState(credocube.validacion_limpieza || '');
  const [validacionGoteo, setValidacionGoteo] = useState(credocube.validacion_goteo || '');
  const [validacionDesinfeccion, setValidacionDesinfeccion] = useState(credocube.validacion_desinfeccion || '');
  const [modelos, setModelos] = useState<ModeloCredcube[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchModelos = async () => {
      try {
        const response = await apiServiceClient.get('/inventory/modelos/');
        setModelos(response.data || []);
      } catch (err) {
        setError('No se pudieron cargar los modelos.');
        console.error(err);
      }
    };

    fetchModelos();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modeloId) {
      setError('Por favor, seleccione un modelo.');
      return;
    }
    if (!rfid) {
      setError('Por favor, ingrese el RFID.');
      return;
    }

    const credocubeData = {
      nombre_unidad: nombreUnidad,
      rfid: rfid,
      modelo_id: Number(modeloId),
      lote: lote || null,
      estado: estado,
      sub_estado: subEstado || null,
      categoria: categoria,
      validacion_limpieza: validacionLimpieza || null,
      validacion_goteo: validacionGoteo || null,
      validacion_desinfeccion: validacionDesinfeccion || null,
    };

    console.log('Actualizando credocube:', credocubeData);

    try {
      await apiServiceClient.put(`/inventory/inventario/${credocube.id}`, credocubeData);
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error actualizando credocube:', err);
      setError('Error al actualizar el credocube. Por favor, inténtelo de nuevo.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Editar Credocube</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <X className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="nombre" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nombre del Credocube</label>
              <input type="text" id="nombre" value={nombreUnidad} onChange={(e) => setNombreUnidad(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            </div>
            <div>
              <label htmlFor="rfid" className="block text-sm font-medium text-gray-700 dark:text-gray-300">RFID</label>
              <input type="text" id="rfid" value={rfid} onChange={(e) => setRfid(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" required />
            </div>
            <div>
              <label htmlFor="modelo" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Modelo</label>
              <select id="modelo" value={modeloId} onChange={(e) => setModeloId(e.target.value ? parseInt(e.target.value) : '')} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" required>
                <option value="">Seleccione un modelo</option>
                {modelos.map((modelo) => (
                  <option key={modelo.modelo_id} value={modelo.modelo_id}>{modelo.nombre_modelo}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="lote" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Lote</label>
              <input type="text" id="lote" value={lote} onChange={(e) => setLote(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            </div>
            <div>
              <label htmlFor="estado" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Estado</label>
              <select id="estado" value={estado} onChange={(e) => setEstado(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                <option value="En bodega">En bodega</option>
                <option value="Pre-acondicionamiento">Pre-acondicionamiento</option>
                <option value="Acondicionamiento">Acondicionamiento</option>
                <option value="Operación">Operación</option>
                <option value="Devolución">Devolución</option>
                <option value="Inspección">Inspección</option>
              </select>
            </div>
            <div>
              <label htmlFor="sub_estado" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Sub-Estado</label>
              <input type="text" id="sub_estado" value={subEstado} onChange={(e) => setSubEstado(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" placeholder="Opcional" />
            </div>
            <div>
              <label htmlFor="categoria" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Categoría</label>
              <select id="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                <option value="">Seleccione categoría</option>
                <option value="Cube">Credocube</option>
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="validacion_limpieza" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Validación Limpieza</label>
              <select id="validacion_limpieza" value={validacionLimpieza} onChange={(e) => setValidacionLimpieza(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                <option value="">No aplica</option>
                <option value="realizado">Realizado</option>
              </select>
            </div>
            <div>
              <label htmlFor="validacion_goteo" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Validación Goteo</label>
              <select id="validacion_goteo" value={validacionGoteo} onChange={(e) => setValidacionGoteo(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                <option value="">No aplica</option>
                <option value="realizado">Realizado</option>
              </select>
            </div>
            <div>
              <label htmlFor="validacion_desinfeccion" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Validación Desinfección</label>
              <select id="validacion_desinfeccion" value={validacionDesinfeccion} onChange={(e) => setValidacionDesinfeccion(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                <option value="">No aplica</option>
                <option value="realizado">Realizado</option>
              </select>
            </div>
          </div>
          {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
          <div className="mt-6 flex justify-end space-x-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600">Cancelar</button>
            <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">Actualizar</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditarCredocubeModal;
