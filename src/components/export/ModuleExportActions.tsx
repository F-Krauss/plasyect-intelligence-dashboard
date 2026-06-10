import React, { useState } from 'react';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';
import { exportModuleAsPdf, exportModuleAsXlsx } from '../../utils/moduleExport';

interface ModuleExportActionsProps {
  moduleId: string;
  moduleName: string;
  rootId: string;
}

export const ModuleExportActions: React.FC<ModuleExportActionsProps> = ({
  moduleId,
  moduleName,
  rootId
}) => {
  const { currentTenant, addAuditLog } = useDashboard();
  const [busyFormat, setBusyFormat] = useState<'xlsx' | 'pdf' | null>(null);

  const fileBaseName = `${moduleName}_${currentTenant.id}_${new Date().toISOString().slice(0, 10)}`;

  const runExport = (format: 'xlsx' | 'pdf') => {
    try {
      setBusyFormat(format);
      const options = {
        rootId,
        moduleName,
        tenantName: currentTenant.name,
        fileBaseName
      };

      if (format === 'xlsx') {
        exportModuleAsXlsx(options);
      } else {
        exportModuleAsPdf(options);
      }

      addAuditLog(
        'EXPORT',
        `EXPORT_${format.toUpperCase()}`,
        `Modulo ${moduleId} exportado a ${format.toUpperCase()} para tenant ${currentTenant.id}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Exportacion fallida';
      alert(message);
    } finally {
      window.setTimeout(() => setBusyFormat(null), 250);
    }
  };

  return (
    <div className="mb-4 flex justify-end gap-2 print:hidden">
      <button
        type="button"
        onClick={() => runExport('xlsx')}
        disabled={busyFormat !== null}
        className="flex h-9 items-center gap-1.5 rounded-md border border-emerald-800/60 bg-emerald-950/60 px-3 text-xs font-mono font-bold text-emerald-300 transition hover:bg-emerald-900 disabled:cursor-wait disabled:opacity-60"
        title="Exportar modulo a XLSX"
      >
        <FileSpreadsheet className="h-4 w-4" />
        XLSX
      </button>
      <button
        type="button"
        onClick={() => runExport('pdf')}
        disabled={busyFormat !== null}
        className="flex h-9 items-center gap-1.5 rounded-md border border-rose-800/60 bg-rose-950/60 px-3 text-xs font-mono font-bold text-rose-300 transition hover:bg-rose-900 disabled:cursor-wait disabled:opacity-60"
        title="Exportar modulo a PDF"
      >
        <FileDown className="h-4 w-4" />
        PDF
      </button>
    </div>
  );
};
