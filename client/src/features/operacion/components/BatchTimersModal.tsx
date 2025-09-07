import React, { useEffect, useState } from 'react';
import { Clock, X, Play, Loader, ClipboardList } from 'lucide-react';

interface BatchTimersModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (totalMinutos: number) => void;
  titulo: string;
  descripcion?: string;
  tipoOperacion: 'envio' | 'congelamiento' | 'atemperamiento' | 'inspeccion';
  nombres: string[]; // etiquetas que se crearán
  cargando?: boolean;
}

const colorByTipo: Record<string, { base: string; dark: string; light: string; pill: string; ring: string }> = {
  envio: { base: 'text-emerald-700', dark: 'text-emerald-800', light: 'bg-emerald-50', pill: 'bg-emerald-100 text-emerald-700', ring: 'focus:ring-emerald-500' },
  congelamiento: { base: 'text-blue-700', dark: 'text-blue-800', light: 'bg-blue-50', pill: 'bg-blue-100 text-blue-700', ring: 'focus:ring-blue-500' },
  atemperamiento: { base: 'text-orange-700', dark: 'text-orange-800', light: 'bg-orange-50', pill: 'bg-orange-100 text-orange-700', ring: 'focus:ring-orange-500' },
  inspeccion: { base: 'text-violet-700', dark: 'text-violet-800', light: 'bg-violet-50', pill: 'bg-violet-100 text-violet-700', ring: 'focus:ring-violet-500' }
};

const BatchTimersModal: React.FC<BatchTimersModalProps> = ({
  open,
  onClose,
  onConfirm,
  titulo,
  descripcion,
  tipoOperacion,
  nombres,
  cargando = false
}) => {
  const [horas, setHoras] = useState('');
  const [minutos, setMinutos] = useState('');

  useEffect(() => {
    if (open) {
      setHoras('');
      setMinutos('');
    }
  }, [open]);

  if (!open) return null;

  const hNum = parseInt(horas || '0', 10) || 0;
  const mNum = parseInt(minutos || '0', 10) || 0;
  const total = hNum * 60 + mNum;
  const disabled = total <= 0 || cargando || nombres.length === 0;
  const colors = colorByTipo[tipoOperacion] || colorByTipo.envio;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white w-full max-w-lg mx-4 rounded-xl shadow-xl border border-gray-200 overflow-hidden animate-fadeIn">
        {/* Header */}
        <div className={`px-5 py-4 flex items-center justify-between border-b ${colors.light}`}>
          <div className="flex items-center gap-2">
            <Clock className={`w-5 h-5 ${colors.base}`} />
            <h2 className={`text-lg font-semibold tracking-tight ${colors.dark}`}>{titulo}</h2>
          </div>
          <button
            onClick={() => !cargando && onClose()}
            disabled={cargando}
            className={`p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-white/70 transition ${cargando ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6 relative">
          {cargando && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center z-10">
              <div className="flex flex-col items-center gap-3">
                <Loader className={`w-8 h-8 animate-spin ${colors.base}`} />
                <span className="text-sm font-medium text-gray-700">Creando cronómetros...</span>
              </div>
            </div>
          )}
          <p className="text-gray-600 text-sm mb-5 leading-relaxed">
            {descripcion || 'Define el tiempo que se aplicará a todos los elementos seleccionados. Se crearán cronómetros independientes.'}
          </p>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Horas</label>
              <input
                type="number"
                min={0}
                max={240}
                value={horas}
                disabled={cargando}
                onChange={e => {
                  const v = e.target.value; if (v === '') return setHoras('');
                  const n = Math.max(0, Math.min(240, parseInt(v, 10) || 0));
                  setHoras(n.toString());
                }}
                placeholder="0"
                className={`w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 ${colors.ring} focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Minutos</label>
              <input
                type="number"
                min={0}
                max={59}
                value={minutos}
                disabled={cargando}
                onChange={e => {
                  const v = e.target.value; if (v === '') return setMinutos('');
                  const n = Math.max(0, Math.min(59, parseInt(v, 10) || 0));
                  setMinutos(n.toString());
                }}
                placeholder="0"
                className={`w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 ${colors.ring} focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed`}
              />
            </div>
          </div>

          <div className={`mb-6 rounded-lg px-4 py-3 flex items-center justify-between ${colors.light}`}>
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <ClipboardList className={`w-4 h-4 ${colors.base}`} />
              <span>{nombres.length} cronómetro(s)</span>
            </div>
            <span className={`text-lg font-semibold ${colors.base}`}>
              {hNum > 0 && `${hNum}h `}{mNum}min
            </span>
          </div>

          {/* Preview list */}
          <div className="border rounded-md max-h-40 overflow-auto divide-y divide-gray-100 scrollbar-thin mb-2">
            {nombres.length === 0 && (
              <div className="p-3 text-xs text-gray-500 text-center">Sin elementos elegibles</div>
            )}
            {nombres.map((n, i) => (
              <div key={i} className="px-3 py-2 text-[11px] font-medium text-gray-700 truncate">
                {n}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-400">Cada etiqueta se enviará al servidor. El servidor es la única fuente de verdad del progreso.</p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3">
          <button
            onClick={() => !cargando && onClose()}
            className="px-4 py-2 rounded-md text-sm border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={cargando}
          >Cancelar</button>
          <button
            disabled={disabled}
            onClick={() => !disabled && onConfirm(total)}
            className={`px-4 py-2 rounded-md text-sm font-semibold text-white flex items-center gap-2 shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed ${
              tipoOperacion === 'envio' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {cargando ? <Loader size={16} className="animate-spin" /> : <Play size={16} />}
            {cargando ? 'Creando...' : 'Iniciar Cronómetros'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BatchTimersModal;
