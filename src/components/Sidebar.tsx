import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  GitBranch, 
  FileText, 
  Factory, 
  ShoppingBag, 
  ScanLine, 
  History, 
  FolderTree, 
  Settings,
  Tv,
  Users,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useDashboard } from '../context/DashboardContext';
import { PermissionKey } from '../types';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, setCurrentTab }) => {
  const { currentTenant, can } = useDashboard();
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard Ejecutivo', icon: LayoutDashboard, category: 'OPERACIONES', permission: 'dashboard.view' },
    { id: 'pipeline-lote', label: 'Pipeline por Lote', icon: GitBranch, category: 'PRODUCTIVIDAD', permission: 'pipeline_lote.view' },
    { id: 'pipeline-pedido', label: 'Pipeline por Pedido', icon: FileText, category: 'PRODUCTIVIDAD', permission: 'pipeline_pedido.view' },
    { id: 'produccion-area', label: 'Producción por Área', icon: Factory, category: 'SEGUIMIENTO', permission: 'produccion_area.view' },
    { id: 'modelos-productos', label: 'Modelos y Productos', icon: ShoppingBag, category: 'SEGUIMIENTO', permission: 'modelos_productos.view' },
    { id: 'ocr-validacion', label: 'OCR y Validación EVA', icon: ScanLine, category: 'ADMIN', permission: 'ocr_validacion.view' },
    { id: 'reportes-historicos', label: 'Reportes Históricos', icon: History, category: 'AUDITORIA', permission: 'reportes_historicos.view' },
    { id: 'catalogos', label: 'Catálogos Muck', icon: FolderTree, category: 'AUDITORIA', permission: 'catalogos.view' },
    { id: 'configuracion', label: 'Configuración / RBAC', icon: Settings, category: 'SISTEMA', permission: 'configuracion.view' },
  ] as const;

  const visibleMenuItems = menuItems.filter(item => can(item.permission as PermissionKey));

  // Group items by category to make it look like a highly structured industrial enterprise application
  const categories = ['OPERACIONES', 'PRODUCTIVIDAD', 'SEGUIMIENTO', 'ADMIN', 'AUDITORIA', 'SISTEMA'];

  const getTenantBadgeColor = () => {
    switch(currentTenant.id) {
      case 'plasyect_suelas': return 'border-emerald-300 bg-emerald-50 text-emerald-800';
      case 'plasyect_sandalias': return 'border-sky-300 bg-sky-50 text-sky-800';
      default: return 'border-indigo-300 bg-indigo-50 text-indigo-800';
    }
  };

  return (
    <aside className={`${isCollapsed ? 'w-20' : 'w-64'} bg-slate-950 border-r border-slate-800 flex flex-col h-screen overflow-y-auto shrink-0 z-20 shadow-sm transition-all duration-200`}>
      
      {/* Brand Box per Geometric Balance Style */}
      {!isCollapsed ? (
        <div className="p-5 bg-blue-800 shrink-0 select-none relative">
          <div className="flex items-center justify-between">
            <h1 className="text-white font-black text-xl tracking-tight uppercase leading-none">Plasyect</h1>
            <button 
              onClick={() => setIsCollapsed(true)}
              className="p-1 rounded bg-blue-900 hover:bg-blue-700 text-white cursor-pointer transition-colors outline-none"
              title="Minimizar menú"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
          <p className="text-blue-100 text-[10px] tracking-widest font-bold font-mono mt-1">INTELLIGENCE DASHBOARD</p>

          {/* Tenant Active Badge integrated cleanly */}
          <div className={`mt-3 px-2 py-1.5 rounded-sm border text-[9px] font-mono leading-tight tracking-wide ${getTenantBadgeColor()}`}>
            <div className="font-bold flex items-center gap-1 mb-0.5 uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping"></span>
              Tenancy:
            </div>
            <div className="truncate text-white font-sans font-bold">{currentTenant.name}</div>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-blue-800 shrink-0 select-none flex flex-col items-center gap-2">
          <span className="text-white font-black text-2xl tracking-normal">P</span>
          <button 
            onClick={() => setIsCollapsed(false)}
            className="p-1 rounded bg-blue-900 hover:bg-blue-700 text-white cursor-pointer transition-colors outline-none"
            title="Expandir menú"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse mt-1" title={currentTenant.name}></span>
        </div>
      )}

      {/* Nav Section Items */}
      {!isCollapsed ? (
        <nav className="p-4 flex-1 space-y-4">
          {categories.map((cat) => {
            const items = visibleMenuItems.filter(item => item.category === cat);
            if (items.length === 0) return null;

            return (
              <div key={cat} className="space-y-1">
                <span className="text-[9px] font-extrabold tracking-widest text-slate-450 px-3 font-mono block uppercase">
                  {cat}
                </span>
                
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentTab === item.id;
                    
                    return (
                      <button
                        key={item.id}
                        onClick={() => setCurrentTab(item.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 justify-start font-sans text-xs font-semibold tracking-wide transition-all outline-none text-left select-none cursor-pointer rounded-sm ${
                          isActive
                            ? 'bg-blue-600 text-white font-bold border-l-4 border-l-white'
                            : 'text-slate-350 hover:bg-slate-850 hover:text-slate-100'
                        }`}
                      >
                        <Icon className={`w-4 h-4 shrink-0 transition-transform ${isActive ? 'scale-110 text-white' : 'text-slate-400 hover:text-slate-100'}`} />
                        <span className="flex-1 truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      ) : (
        <nav className="p-2 flex-1 space-y-2 flex flex-col items-center">
          {visibleMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all outline-none select-none cursor-pointer relative ${
                  isActive
                    ? 'bg-blue-600 text-white font-bold'
                    : 'text-slate-350 hover:bg-slate-850 hover:text-slate-100'
                }`}
                title={item.label}
              >
                <Icon className={`w-5 h-5 shrink-0 transition-transform ${isActive ? 'scale-110 text-white' : 'text-slate-400 hover:text-slate-100'}`} />
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-white rounded-r-md"></span>
                )}
              </button>
            );
          })}
        </nav>
      )}

      {/* Corporate Signatures */}
      {!isCollapsed ? (
        <div className="p-4 border-t border-slate-800 shrink-0 bg-slate-905 text-[10px] font-mono text-slate-450 space-y-1.5">
          <div className="flex items-center justify-between">
            <span>SaaS Nivel Industrial</span>
            <span className="text-emerald-400 animate-pulse font-bold">● SLA OK</span>
          </div>
          <div className="text-[9px] text-slate-500">
            Enforce Tenant: true<br />
            Isolation Strict Mode
          </div>
        </div>
      ) : (
        <div className="p-3 border-t border-slate-800 shrink-0 bg-slate-905 text-center text-[10px] font-mono text-slate-400">
          <span className="text-emerald-400 animate-pulse font-bold">●</span>
        </div>
      )}
    </aside>
  );
};
