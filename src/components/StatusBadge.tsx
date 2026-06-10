import React from 'react';

interface StatusBadgeProps {
  status: string;
  type?: 'stage' | 'status' | 'severity' | 'priority';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, type = 'status' }) => {
  const getColors = () => {
    const s = status.toUpperCase().replace(/\s/g, '_');
    
    if (type === 'stage') {
      switch (s) {
        case 'ALTA_DE_PEDIDO':
        case 'ALTA_PEDIDO': return 'bg-cyan-50 text-cyan-700 border border-cyan-200';
        case 'ALMACEN_DE_MATERIA_PRIMA':
        case 'ALMACEN': return 'bg-slate-100 text-slate-700 border border-slate-200';
        case 'INYECCION_EN_MOLDES':
        case 'INYECCION': return 'bg-amber-50 text-amber-700 border border-amber-200';
        case 'ESTABILIZACION_Y_ENFRIAMIENTO':
        case 'ESTABILIZACION': return 'bg-purple-50 text-purple-700 border border-purple-200';
        case 'ADUANA_DE_CALIDAD':
        case 'ADUANA': return 'bg-rose-50 text-rose-700 border border-rose-200';
        case 'BANDA_Y_DETALLADO':
        case 'BANDA': return 'bg-indigo-50 text-indigo-700 border border-indigo-200';
        case 'EMBARQUE_Y_LOGISTICA':
        case 'EMBARQUE': return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
        default: return 'bg-slate-100 text-slate-600 border border-slate-200';
      }
    }

    if (type === 'severity' || type === 'priority') {
      switch (s) {
        case 'ALTA':
        case 'GRAVE': return 'bg-red-50 text-red-700 border border-red-200';
        case 'MEDIA':
        case 'MODERADO': return 'bg-amber-50 text-amber-750 border border-amber-200';
        case 'BAJA':
        case 'LEVE': return 'bg-emerald-50 text-emerald-705 border border-emerald-200';
        default: return 'bg-slate-100 text-slate-600 border border-slate-200';
      }
    }

    // Default status styling (OPTIMO, ALERTA, CRITICO, DETENIDO, ARCHIVADO)
    switch (s) {
      case 'OPTIMO':
      case 'ACTIVA':
      case 'OPERANDO':
      case 'COMPLETADO':
      case 'ENTREGADO': return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      case 'ALERTA':
      case 'PROCESANDO': return 'bg-amber-50 text-amber-700 border border-amber-200';
      case 'CRITICO': return 'bg-red-50 text-red-750 border border-red-200 font-bold';
      case 'DETENIDO':
      case 'MANTENIMIENTO':
      case 'INACTIVA':
      case 'PENDIENTE': return 'bg-slate-105 text-slate-600 border border-slate-200';
      case 'ARCHIVADO':
      case 'ARCHIVED': return 'bg-orange-50 text-orange-700 border border-orange-200 border-dashed';
      default: return 'bg-slate-105 text-slate-600 border border-slate-200';
    }
  };

  const label = status.replace(/_/g, ' ').toUpperCase();

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wider uppercase font-mono shadow-sm transition-all duration-300 ${getColors()}`}>
      <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-current animate-pulse"></span>
      {label}
    </span>
  );
};
