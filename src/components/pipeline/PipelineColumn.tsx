import React from 'react';
import { Batch, StageId } from '../../types';
import { StatusBadge } from '../StatusBadge';
import { Layers, ArrowRight, ArrowLeft, Archive, AlertTriangle, MonitorPlay } from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';

interface PipelineColumnProps {
  id: StageId;
  name: string;
  color: string;
  batches: Batch[];
  onMoveStage: (batchId: string, nextStage: StageId) => void;
  onArchive: (batchId: string) => void;
  availableStages: { id: StageId; name: string }[];
}

export const PipelineColumn: React.FC<PipelineColumnProps> = ({
  id,
  name,
  batches,
  onMoveStage,
  onArchive,
  availableStages
}) => {
  const { currentTenant } = useDashboard();

  // Find index of current stage to calculate step moves
  const currentIdx = availableStages.findIndex(s => s.id === id);

  const handleNextStep = (batchId: string) => {
    if (currentIdx < availableStages.length - 1) {
      onMoveStage(batchId, availableStages[currentIdx + 1].id);
    }
  };

  const handlePrevStep = (batchId: string) => {
    if (currentIdx > 0) {
      onMoveStage(batchId, availableStages[currentIdx - 1].id);
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 min-w-[280px] w-80 shrink-0 flex flex-col h-[650px] shadow-sm">
      
      {/* Column Header */}
      <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 mb-3 shrink-0">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-blue-600" />
            <h5 className="text-xs font-bold font-mono tracking-wider text-slate-750 uppercase truncate max-w-[200px]">
              {name}
            </h5>
          </div>
          <span className="text-[10px] font-mono font-bold py-0.5 px-2 bg-slate-200/50 text-slate-500 rounded-full">
            {batches.length} {batches.length === 1 ? 'Lote' : 'Lotes'}
          </span>
        </div>
      </div>

      {/* Cards Scrollable Body */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 py-1 custom-scrollbar">
        {batches.length === 0 ? (
          <div className="h-28 border border-dashed border-slate-200 rounded flex items-center justify-center text-center p-4">
            <span className="text-[10px] font-mono text-slate-400 uppercase">vacío sin lotes</span>
          </div>
        ) : (
          batches.map(batch => (
            <div 
              key={batch.id}
              className={`p-3.5 rounded bg-white border border-slate-200 hover:border-slate-350 hover:shadow-md transition-all duration-255 relative group space-y-3 ${
                batch.status === 'CRITICO' ? 'border-l-4 border-l-red-500' :
                batch.status === 'ALERTA' ? 'border-l-4 border-l-amber-500' : 'border-l-4 border-l-blue-600'
              }`}
            >
              
              {/* Batch General Details */}
              <div className="flex justify-between items-start">
                <div className="space-y-0.5">
                  <span className="text-[10px] text-slate-450 font-mono font-bold tracking-tight">Folio Lote</span>
                  <p className="text-xs font-mono font-bold text-slate-800">{batch.id}</p>
                </div>
                <StatusBadge status={batch.status} />
              </div>

              {/* Specs Grid */}
              <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-slate-50 rounded text-[10px] font-mono text-slate-550 leading-normal">
                <div>
                  <span className="text-slate-400 block leading-none">Modelo:</span>
                  <span className="font-bold text-slate-700 truncate block max-w-[100px]">{batch.modelName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block leading-none">Color:</span>
                  <span className="text-slate-700 truncate block max-w-[100px]">{batch.color}</span>
                </div>
                <div>
                  <span className="text-slate-400 block leading-none">Talla:</span>
                  <span className="text-slate-700 font-bold">#{batch.size} MXN</span>
                </div>
                <div>
                  <span className="text-slate-400 block leading-none">Volumen:</span>
                  <span className="text-blue-600 font-bold">{batch.quantityShoes} Prs</span>
                </div>
              </div>

              {/* Specific details */}
              {batch.stage === 'inyeccion' && batch.machineId && (
                <div className="flex items-center gap-1.5 p-1 bg-amber-50 border border-amber-100 text-xs font-mono rounded text-amber-700">
                  <MonitorPlay className="w-3.5 h-3.5" />
                  <span>Maq: {batch.machineId.substring(4).toUpperCase()} | {batch.temperatureTarget}°C</span>
                </div>
              )}

              {batch.stage === 'estabilizacion' && (
                <div className="p-1 bg-purple-50 border border-purple-100 text-[10px] font-mono rounded text-purple-700">
                  <span>Factor encogimiento: {batch.shrinkageRatio}x</span>
                </div>
              )}

              {/* Move actions */}
              <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-1 mt-1 opacity-90 group-hover:opacity-100 transition-opacity">
                
                {/* Back button */}
                <button
                  onClick={() => handlePrevStep(batch.id)}
                  disabled={currentIdx === 0}
                  title="Retroceder una etapa"
                  className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-blue-600 disabled:opacity-20 cursor-pointer disabled:pointer-events-none"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>

                {/* Archivo / Soft delete */}
                <button
                  onClick={() => onArchive(batch.id)}
                  title="Archivar de inmediato"
                  className="px-2 py-0.5 hover:bg-slate-100 text-[10px] text-slate-500 hover:text-orange-600 rounded flex items-center gap-1 cursor-pointer font-sans"
                >
                  <Archive className="w-3 h-3" />
                  Archivar
                </button>

                {/* Forward button */}
                <button
                  onClick={() => handleNextStep(batch.id)}
                  disabled={currentIdx === availableStages.length - 1}
                  title="Avanzar etapa siguiente"
                  className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-blue-600 disabled:opacity-20 cursor-pointer disabled:pointer-events-none"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>

              </div>

            </div>
          ))
        )}
      </div>

    </div>
  );
};
