import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Download, Eye, RotateCcw, Archive } from 'lucide-react';

interface Column<T> {
  header: string;
  accessorKey: keyof T | string;
  cell?: (item: T) => React.ReactNode;
  sortable?: boolean;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  searchPlaceholder?: string;
  onViewDetails?: (item: T) => void;
  onArchive?: (item: T) => void;
  onRestore?: (item: T) => void;
  idField: keyof T;
}

export function DataTable<T>({
  data,
  columns,
  onViewDetails,
  onArchive,
  onRestore,
  idField
}: DataTableProps<T>) {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(8);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Sorting
  const sortedData = React.useMemo(() => {
    if (!sortKey) return data;
    
    return [...data].sort((a: any, b: any) => {
      let valA = a[sortKey];
      let valB = b[sortKey];

      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortKey, sortOrder]);

  // Pagination
  const totalPages = Math.ceil(sortedData.length / itemsPerPage) || 1;
  const paginatedData = sortedData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  const handleExportCSV = () => {
    const headers = columns.map(c => c.header).join(',');
    const rows = sortedData.map(item => {
      return columns.map(c => {
        const key = c.accessorKey as string;
        // Basic resolution
        const val = (item as any)[key];
        return typeof val === 'object' ? JSON.stringify(val) : `"${val}"`;
      }).join(',');
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `reporte_plasyect_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col justify-between shadow-sm">
      
      {/* Table Operations */}
      <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center flex-wrap gap-2">
        <span className="text-xs font-mono font-bold text-slate-500">
          Mostrando {paginatedData.length} de {data.length} registros totales
        </span>
        
        <button 
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 hover:border-slate-300 text-xs font-mono font-bold text-blue-600 border border-slate-200 rounded cursor-pointer transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Exportar CSV (Informes)
        </button>
      </div>

      {/* Grid Table Container */}
      <div className="overflow-x-auto w-full">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  onClick={() => col.sortable && handleSort(col.accessorKey as string)}
                  scope="col"
                  className={`px-4 py-3 text-left text-xs font-bold font-sans tracking-wider text-slate-500 uppercase select-none ${
                    col.sortable ? 'cursor-pointer hover:text-blue-600 transition-colors' : ''
                  }`}
                >
                  <div className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && sortKey === col.accessorKey && (
                      sortOrder === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </div>
                </th>
              ))}
              {(onViewDetails || onArchive || onRestore) && (
                <th scope="col" className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase">
                  Acciones
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-12 text-center text-xs text-slate-400 font-medium">
                  No se encontraron registros coincidentes con los filtros aplicados.
                </td>
              </tr>
            ) : (
              paginatedData.map((item: any, rowIdx) => (
                <tr key={(item[idField] as any) || rowIdx} className="hover:bg-slate-50/70 transition-colors">
                  {columns.map((col, colIdx) => {
                    const cellVal = col.cell ? col.cell(item) : (item as any)[col.accessorKey];
                    return (
                      <td key={colIdx} className="px-4 py-3 text-xs font-medium text-slate-700 whitespace-nowrap">
                        {cellVal !== undefined && cellVal !== null ? cellVal : <span className="text-slate-300">—</span>}
                      </td>
                    );
                  })}
                  
                  {/* Action Columns */}
                  {(onViewDetails || onArchive || onRestore) && (
                    <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                      {onViewDetails && (
                        <button
                          onClick={() => onViewDetails(item)}
                          title="Ver Ficha Detallada"
                          className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      {onArchive && item.status !== 'ARCHIVED' && item.status !== 'ARCHIVADO' && (
                        <button
                          onClick={() => onArchive(item)}
                          title="Archivar Lote (Soft-Delete)"
                          className="p-1 text-slate-400 hover:text-orange-600 hover:bg-slate-100 rounded transition-colors"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      )}
                      {onRestore && (item.status === 'ARCHIVED' || item.status === 'ARCHIVADO') && (
                        <button
                          onClick={() => onRestore(item)}
                          title="Restaurar de Archivo"
                          className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-slate-100 rounded transition-colors"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
        <button
          onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
          disabled={currentPage === 1}
          className="px-3 py-1 bg-white border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-600 rounded disabled:opacity-40 disabled:pointer-events-none transition-opacity cursor-pointer"
        >
          Anterior
        </button>
        <div className="text-xs font-mono font-bold text-slate-500">
          Página <span className="text-blue-600">{currentPage}</span> de {totalPages}
        </div>
        <button
          onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
          disabled={currentPage === totalPages}
          className="px-3 py-1 bg-white border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-600 rounded disabled:opacity-40 disabled:pointer-events-none transition-opacity cursor-pointer"
        >
          Siguiente
        </button>
      </div>

    </div>
  );
}
