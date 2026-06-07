import React from 'react';
import { useDashboard } from '../context/DashboardContext';
import { AlertTriangle, ShieldCheck, Flame, Zap } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

export const AlertPanel: React.FC = () => {
  const { batches, defects, currentTenant } = useDashboard();

  // Filter items matching the active tenant
  const tenantBatches = batches.filter(b => b.tenantId === currentTenant.id);
  const criticalBatches = tenantBatches.filter(b => b.status === 'CRITICO' || b.status === 'ALERTA');
  
  // Active unresolved defects
  const activeDefects = defects.filter(d => !d.resolved);

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm text-slate-800">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
        <h4 className="text-xs font-bold font-mono text-amber-600 uppercase tracking-widest flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 animate-pulse" />
          Alertas Activas Planta Plasyect
        </h4>
        <span className="text-[10px] font-mono text-slate-400 font-bold uppercase">
          En Tiempo Real (2026)
        </span>
      </div>

      {criticalBatches.length === 0 && activeDefects.length === 0 ? (
        <div className="py-8 text-center flex flex-col items-center justify-center">
          <ShieldCheck className="w-10 h-10 text-emerald-500 mb-2 opacity-80" />
          <p className="text-xs text-slate-500 font-bold font-sans">OPERACIONES EN PARÁMETROS ÓPTIMOS</p>
          <p className="text-[10px] text-slate-400">Sin desviaciones detectadas en inyección, estabilizado ni entrega.</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {/* Critical Batches */}
          {criticalBatches.map(b => (
            <div 
              key={b.id} 
              className={`p-3 rounded border text-xs flex justify-between items-center gap-3 transition-colors ${
                b.status === 'CRITICO' 
                  ? 'bg-rose-50 border-rose-200 hover:bg-rose-100/70' 
                  : 'bg-amber-50 border-amber-200 hover:bg-amber-100/70'
              }`}
            >
              <div className="space-y-1 truncate">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-black text-slate-800">{b.id}</span>
                  <StatusBadge status={b.status} />
                </div>
                <p className="text-[11px] text-slate-600 truncate font-sans">
                  Modelo: <strong className="text-slate-800">{b.modelName}</strong> ({b.color}) en etapa <span className="font-mono underline decoration-blue-500">{b.stage}</span>.
                </p>
                {b.status === 'CRITICO' && (
                  <p className="text-[10px] text-red-600 font-mono font-semibold">
                    ⚠️ Merma detectada: {b.defectRate}% (Rebasó límite del 3%). Ajuste inmediate t° ({b.temperatureTarget}°C).
                  </p>
                )}
                {b.status === 'ALERTA' && (
                  <p className="text-[10px] text-amber-700 font-mono font-semibold">
                    ⚠️ Riesgo contracción EVA: Encogimiento medido de {b.shrinkageRatio}x vs objetivo.
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <span className="text-[10px] font-mono text-slate-400 font-bold">
                  {new Date(b.lastUpdate).toLocaleTimeString()}
                </span>
                <div className="text-[10px] font-mono font-bold text-slate-700 mt-1">{b.quantityShoes} Pares</div>
              </div>
            </div>
          ))}

          {/* Active Defects */}
          {activeDefects.map(d => (
            <div 
              key={d.id} 
              className="p-3 bg-red-50/50 border border-red-200 rounded text-xs flex justify-between items-center gap-3"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="bg-red-200 text-red-800 px-1.5 py-0.5 rounded-[3px] text-[9px] font-mono tracking-wider font-bold">DEFECTO</span>
                  <span className="font-mono font-semibold text-slate-800">{d.defectType}</span>
                  <StatusBadge status={d.severity} type="severity" />
                </div>
                <p className="text-[11px] text-slate-600">{d.notes}</p>
                <p className="text-[10px] text-slate-400 font-mono">Lote afectado: {d.batchId} | Reporta: {d.inspectorName}</p>
              </div>
              <span className="text-[10px] font-mono text-slate-400 shrink-0 self-start">
                {new Date(d.detectedAt).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
