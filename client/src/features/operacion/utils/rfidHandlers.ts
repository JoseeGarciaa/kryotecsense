import { apiServiceClient } from '../../../api/apiClient';

export const createRfidHandlers = (
  inventarioCompleto: any[],
  actualizarColumnasDesdeBackend: () => Promise<void>
) => {

  // Función para manejar escaneo de RFID
  const manejarEscaneoRfid = async (
    rfidInput: string,
    rfidsEscaneados: string[],
    setRfidsEscaneados: (rfids: string[]) => void,
    setRfidInput: (input: string) => void
  ) => {
    if (!rfidInput.trim()) return;
    
    const rfidLimpio = rfidInput.trim();
    
    // Verificar si ya fue escaneado
  if (Array.isArray(rfidsEscaneados) && rfidsEscaneados.includes(rfidLimpio)) {
      alert('⚠️ Este RFID ya fue escaneado');
      setRfidInput('');
      return;
    }
    
    try {
      // Buscar el item en el inventario
      const itemEncontrado = inventarioCompleto.find(item => item.rfid === rfidLimpio);
      
      if (!itemEncontrado) {
        alert(`❌ RFID ${rfidLimpio} no encontrado en el inventario`);
        setRfidInput('');
        return;
      }
      
      // Verificar que sea un TIC basado en la categoría
      if (itemEncontrado.categoria !== 'TIC') {
        alert(`⚠️ El item ${rfidLimpio} no es un TIC (categoría: ${itemEncontrado.categoria}). En pre-acondicionamiento solo se permiten TICs.`);
        setRfidInput('');
        return;
      }
      
      // Verificar que esté disponible (no en otra etapa)
      const actividadesResponse = await apiServiceClient.get('/activities/actividades/');
      const actividades = actividadesResponse.data;
      
      const actividadExistente = actividades.find((act: any) => 
        act.inventario_id === itemEncontrado.id && 
        act.estado_nuevo !== 'En bodega'
      );
      
      if (actividadExistente) {
        alert(`⚠️ ${itemEncontrado.nombre_unidad} ya está en ${actividadExistente.estado_nuevo}`);
        setRfidInput('');
        return;
      }
      
      // Agregar a la lista de escaneados
      setRfidsEscaneados([...rfidsEscaneados, rfidLimpio]);
      setRfidInput('');
      
      console.log(`✅ TIC escaneado: ${itemEncontrado.nombre_unidad}`);
      
    } catch (error) {
      console.error('Error verificando RFID:', error);
      alert('❌ Error al verificar el RFID');
      setRfidInput('');
    }
  };

  // Función para confirmar pre-acondicionamiento
  const confirmarPreAcondicionamiento = async (
    rfidsEscaneados: string[],
    setMostrarModalEscaneo: (show: boolean) => void,
    setRfidsEscaneados: (rfids: string[]) => void,
    setRfidInput: (input: string) => void
  ) => {
    if (rfidsEscaneados.length === 0) {
      alert('⚠️ No hay TICs escaneados para mover');
      return;
    }
    
    try {
      console.log(`🚀 Confirmando pre-acondicionamiento para ${rfidsEscaneados.length} TICs`);
      
      // Crear actividades para cada RFID escaneado
      for (const rfid of rfidsEscaneados) {
        const item = inventarioCompleto.find(item => item.rfid === rfid);
        if (item) {
          const nuevaActividad = {
            inventario_id: item.id,
            usuario_id: 1, // Usuario actual
            descripcion: `TIC movido a pre-acondicionamiento - ${item.nombre_unidad}`,
            estado_nuevo: 'Pre-acondicionamiento',
            sub_estado_nuevo: 'Congelación'
          };
          
          await apiServiceClient.post('/activities/actividades/', nuevaActividad);
          console.log(`✅ Actividad creada para ${item.nombre_unidad}`);
        }
      }
      
      // Actualizar las columnas sin recargar la página
      await actualizarColumnasDesdeBackend();
      
      // Cerrar modal y limpiar estado
      setMostrarModalEscaneo(false);
      setRfidsEscaneados([]);
      setRfidInput('');
      
      alert(`${rfidsEscaneados.length} TICs movidos a pre-acondicionamiento exitosamente`);
      
    } catch (error) {
      console.error('Error creando actividades:', error);
      alert('Error al mover los TICs a pre-acondicionamiento');
    }
  };

  return {
    manejarEscaneoRfid,
    confirmarPreAcondicionamiento
  };
};
