import React from 'react';
import { CLIENTS, MODELS, COLORS } from '../data/mockData';
import { Search, SlidersHorizontal, RefreshCw } from 'lucide-react';

interface FilterBarProps {
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  selectedClient: string;
  setSelectedClient: (val: string) => void;
  selectedModel: string;
  setSelectedModel: (val: string) => void;
  selectedColor: string;
  setSelectedColor: (val: string) => void;
  resetFilters: () => void;
  title?: string;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchTerm,
  setSearchTerm,
  selectedClient,
  setSelectedClient,
  selectedModel,
  setSelectedModel,
  selectedColor,
  setSelectedColor,
  resetFilters,
  title
}) => {
  return (
    <div className="bg-white border border-slate-200 p-4 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
      
      {/* Search Input */}
      <div className="relative flex-1 max-w-sm">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="w-4 h-4 text-slate-400" />
        </div>
        <input 
          type="text" 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={title ? `Buscar en ${title}...` : 'Buscar folio, lote, máquina u operador...'}
          className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-blue-500 rounded px-3 py-1.5 pl-9 text-xs text-slate-800 placeholder:text-slate-400 font-sans focus:outline-none transition-colors"
        />
      </div>

      {/* Select Filter Group */}
      <div className="flex flex-wrap items-center gap-2.5">
        
        {/* Client */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-400 font-sans hidden lg:inline">Cliente:</span>
          <select 
            value={selectedClient} 
            onChange={(e) => setSelectedClient(e.target.value)}
            className="bg-slate-50 border border-slate-200 hover:border-slate-300 px-2.5 py-1.5 rounded text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500"
          >
            <option value="">[ TODOS LOS CLIENTES ]</option>
            {CLIENTS.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Model */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-400 font-sans hidden lg:inline">Corte/Modelo:</span>
          <select 
            value={selectedModel} 
            onChange={(e) => setSelectedModel(e.target.value)}
            className="bg-slate-50 border border-slate-200 hover:border-slate-300 px-2.5 py-1.5 rounded text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500"
          >
            <option value="">[ TODOS LOS MODELOS ]</option>
            {MODELS.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* Color */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-400 font-sans hidden lg:inline">Pigmento/Color:</span>
          <select 
            value={selectedColor} 
            onChange={(e) => setSelectedColor(e.target.value)}
            className="bg-slate-50 border border-slate-200 hover:border-slate-300 px-2.5 py-1.5 rounded text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500"
          >
            <option value="">[ TODOS LOS COLORES ]</option>
            {COLORS.map(col => (
              <option key={col} value={col}>{col}</option>
            ))}
          </select>
        </div>

        {/* Reset */}
        <button 
          onClick={resetFilters}
          title="Restablecer Filtros"
          className="p-1.5 bg-slate-105 border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-blue-600 rounded cursor-pointer transition-colors shrink-0"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

      </div>

    </div>
  );
};
