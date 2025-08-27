import { useState } from 'react';

export const useBodega = () => {
  // Estados específicos para bodega
  const [grupoExpandido, setGrupoExpandido] = useState<string | null>(null);
  const [subgrupoExpandido, setSubgrupoExpandido] = useState<string | null>(null);

  // Función para crear grupos principales de bodega
  const crearGruposPrincipales = (items: any[]) => {
    const grupos: {[key: string]: any[]} = {};
    
    items.forEach(item => {
      // Solo procesar items con categorías válidas
      let tipoGrupo = null;
      
      // Normalizar categoría a lowercase para comparación
      const categoria = (item.categoria || '').toLowerCase();
      
      if (categoria === 'tic') {
        tipoGrupo = 'TICS';
      } else if (categoria === 'cube') {
        tipoGrupo = 'CAJAS';
      } else if (categoria === 'vip') {
        tipoGrupo = 'VIPS';
      }
      
      // Solo incluir items que tienen una categoría válida
      if (tipoGrupo) {
        if (!grupos[tipoGrupo]) {
          grupos[tipoGrupo] = [];
        }
        grupos[tipoGrupo].push(item);
      }
      // Los items sin categoría válida se ignoran completamente
    });

    return grupos;
  };

  // Función para crear subgrupos por modelo/volumen
  const crearSubgruposPorModelo = (items: any[]) => {
    const subgrupos: {[key: string]: any[]} = {};
    
    items.forEach(item => {
      const modelo = item.nombre_modelo || item.volumen || 'Sin modelo';
      const clave = `${modelo}`;
      
      if (!subgrupos[clave]) {
        subgrupos[clave] = [];
      }
      subgrupos[clave].push(item);
    });
    
    return subgrupos;
  };

  // Función para crear cards de grupos principales de bodega
  const crearCardsGruposPrincipales = (items: any[]) => {
    
    if (grupoExpandido && !subgrupoExpandido) {
      // Mostrar subgrupos del grupo expandido
      const gruposPrincipales = crearGruposPrincipales(items);
      const itemsDelGrupo = gruposPrincipales[grupoExpandido] || [];
      const subgrupos = crearSubgruposPorModelo(itemsDelGrupo);
      const cards: any[] = [];
      
      Object.entries(subgrupos).forEach(([modelo, itemsModelo]) => {
        cards.push({
          id: `${grupoExpandido.toLowerCase()}-${modelo.replace(/\s+/g, '-').toLowerCase()}`,
          category: grupoExpandido,
          title: modelo,
          description: `${(itemsModelo as any[]).length} items`,
          assignee: [{name: 'Sistema', avatar: 'sistema'}],
          date: new Date().toLocaleDateString(),
          nombre_unidad: `${grupoExpandido} ${modelo}`,
          rfid: `${grupoExpandido}-${modelo}`,
          estado: 'En bodega',
          tipo: `${grupoExpandido}_SUBGRUPO`,
          tipo_base: grupoExpandido,
          items_grupo: itemsModelo,
          es_grupo: true,
          es_subgrupo: true,
          nivel_grupo: 2,
          modelo_nombre: modelo
        });
      });
      
      console.log(`📋 Cards de subgrupos creadas para ${grupoExpandido}:`, cards.length);
      return cards;
    }
    
    if (grupoExpandido && subgrupoExpandido) {
      // Mostrar items individuales del subgrupo
      const gruposPrincipales = crearGruposPrincipales(items);
      const itemsDelGrupo = gruposPrincipales[grupoExpandido] || [];
      const subgrupos = crearSubgruposPorModelo(itemsDelGrupo);
      const itemsDelSubgrupo = subgrupos[subgrupoExpandido] || [];
      const cards: any[] = [];
      
      itemsDelSubgrupo.forEach((item: any) => {
        cards.push({
          id: item.rfid || item.id,
          category: grupoExpandido,
          title: item.nombre_unidad || 'Item',
          description: `RFID: ${item.rfid}\nModelo: ${item.nombre_modelo || 'N/A'}`,
          assignee: [{name: 'Sistema', avatar: 'sistema'}],
          date: new Date().toLocaleDateString(),
          nombre_unidad: item.nombre_unidad,
          rfid: item.rfid,
          estado: item.estado,
          tipo: 'ITEM_INDIVIDUAL',
          tipo_base: grupoExpandido,
          es_grupo: false,
          es_individual: true,
          nivel_grupo: 3,
          modelo_nombre: subgrupoExpandido,
          // Datos adicionales del item
          ...item
        });
      });
      
      console.log(`📋 Cards individuales creadas para ${subgrupoExpandido}:`, cards.length);
      return cards;
    }
    
    // Vista principal - mostrar grupos principales
    const gruposPrincipales = crearGruposPrincipales(items);
    const cards: any[] = [];
    
    Object.entries(gruposPrincipales).forEach(([tipoGrupo, itemsGrupo]) => {
      cards.push({
        id: `${tipoGrupo.toLowerCase()}-grupo-principal`,
        category: tipoGrupo,
        title: tipoGrupo,
        description: `${(itemsGrupo as any[]).length} items disponibles`,
        assignee: [{name: 'Sistema', avatar: 'sistema'}],
        date: new Date().toLocaleDateString(),
        nombre_unidad: tipoGrupo,
        rfid: `${tipoGrupo}-PRINCIPAL`,
        estado: 'En bodega',
        tipo: tipoGrupo,
        tipo_base: tipoGrupo,
        items_grupo: itemsGrupo,
        es_grupo: true,
        es_grupo_principal: true,
        nivel_grupo: 1
      });
    });
    
    return cards;
  };

  // Función para manejar clicks en cards de bodega
  const handleCardClick = (item: any) => {
    if (!item) {
      console.warn('⚠️ Card clickeada sin item');
      return;
    }

    // NIVEL 1 → NIVEL 2: Click en grupo principal (TICS, CAJAS, VIPS)
    if (item.es_grupo_principal) {
      console.log('🔄 Expandiendo grupo principal:', item.tipo);
      
      // Cambio inmediato de estado
      setGrupoExpandido(item.tipo);
      setSubgrupoExpandido(null);
      
      return;
    }

    // NIVEL 2 → NIVEL 3: Click en subgrupo (modelo/volumen)
    if (item.es_subgrupo) {
      setSubgrupoExpandido(item.modelo_nombre);
      return;
    }

    // NIVEL 3: Click en item individual - no hacer nada o mostrar detalles
    if (item.es_individual) {
      console.log('📋 Item individual clickeado:', item.rfid);
      // Aquí podrías abrir un modal con detalles del item
      return;
    }
  };

  // Función para volver al nivel anterior (optimizada para ser instantánea)
  const volverNivelAnterior = () => {
    console.log('🔙 Volviendo nivel anterior bodega:', { grupoExpandido, subgrupoExpandido });
    
    // Usar requestAnimationFrame para hacer el cambio inmediatamente
    requestAnimationFrame(() => {
      if (subgrupoExpandido) {
        // NIVEL 3 → NIVEL 2: Volver de items individuales a subgrupos
        setSubgrupoExpandido(null);
      } else if (grupoExpandido) {
        // NIVEL 2 → NIVEL 1: Volver de subgrupos a grupos principales
        setGrupoExpandido(null);
      }
    });
  };

  return {
    // Estados
    grupoExpandido,
    setGrupoExpandido,
    subgrupoExpandido,
    setSubgrupoExpandido,
    
    // Funciones
    crearGruposPrincipales,
    crearSubgruposPorModelo,
    crearCardsGruposPrincipales,
    handleCardClick,
    volverNivelAnterior
  };
};
