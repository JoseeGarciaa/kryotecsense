export const createGroupHandlers = (
  inventarioCompleto: any[],
  actualizarDespuesDeClick: any,
  handleCardClickBodega: any,
  handleCardClickPreAcondicionamiento: any,
  handleCardClickAcondicionamiento: any
) => {
  // Función para manejar clic en cards agrupadas (sistema multinivel)
  const handleCardClick = (item: any, columnId?: string) => {
    if (!item) {
      console.warn('⚠️ Card clickeada sin item');
      return;
    }
    
    // Prevenir clicks solo en los grupos hardcodeados del sistema específicos
    if (typeof item.id === 'string' && 
        (item.id === 'ensamblaje-grupo' || item.id === 'listo-despacho-grupo')) {
      console.log('⚠️ Click en grupo del sistema ignorado:', item.id);
      return;
    }
    
    // Delegar a la función especializada según la columna
    if (columnId === 'en-bodega') {
      handleCardClickBodega(item);
    } else if (columnId === 'Pre acondicionamiento') {
      handleCardClickPreAcondicionamiento(item);
    } else if (columnId === 'acondicionamiento') {
      handleCardClickAcondicionamiento(item);
    }
    
    // No actualizar inmediatamente - dejar que el auto-refresh maneje las actualizaciones
  };

  return {
    handleCardClick
  };
};
