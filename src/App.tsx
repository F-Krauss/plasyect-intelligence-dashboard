/**
 * Plasyect Intelligence Dashboard - App Wrapper
 * @license Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { DashboardProvider, useDashboard } from './context/DashboardContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ModuleExportActions } from './components/export/ModuleExportActions';
import { 
  DashboardEjecutivoView, 
  PipelineLoteView, 
  PipelinePedidoView, 
  ProduccionAreaView, 
  ModelosProductosView, 
  CalidadView, 
  InyeccionView,
  BandaView,
  AduanaLiberacionView,
  EmbarqueView,
  OCRValidacionView,
  ReportesHistoricosView,
  CatalogosView,
  ConfiguracionView 
} from './views/ViewRegistry';
import { motion, AnimatePresence } from 'motion/react';
import { PermissionKey } from './types';

const TAB_PERMISSIONS: Record<string, PermissionKey> = {
  dashboard: 'dashboard.view',
  'pipeline-lote': 'pipeline_lote.view',
  'pipeline-pedido': 'pipeline_pedido.view',
  'produccion-area': 'produccion_area.view',
  'modelos-productos': 'modelos_productos.view',
  calidad: 'calidad.view',
  inyeccion: 'inyeccion.view',
  banda: 'banda.view',
  'aduana-liberacion': 'aduana_liberacion.view',
  embarque: 'embarque.view',
  'ocr-validacion': 'ocr_validacion.view',
  'reportes-historicos': 'reportes_historicos.view',
  catalogos: 'catalogos.view',
  configuracion: 'configuracion.view'
};

const TAB_LABELS: Record<string, string> = {
  dashboard: 'Dashboard Ejecutivo',
  'pipeline-lote': 'Pipeline por Lote',
  'pipeline-pedido': 'Pipeline por Pedido',
  'produccion-area': 'Produccion por Area',
  'modelos-productos': 'Modelos y Productos',
  calidad: 'Calidad',
  inyeccion: 'Inyeccion',
  banda: 'Banda',
  'aduana-liberacion': 'Aduana Liberacion',
  embarque: 'Embarque',
  'ocr-validacion': 'OCR Validacion',
  'reportes-historicos': 'Reportes Historicos',
  catalogos: 'Catalogos',
  configuracion: 'Configuracion'
};

function LoadingScreen({ label = 'Cargando sistema', mode = 'full' }: { label?: string; mode?: 'full' | 'module' }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className={[
        'z-40 flex items-center justify-center bg-slate-955/85 text-slate-800 backdrop-blur-[1px]',
        mode === 'module'
          ? 'fixed inset-0'
          : 'absolute inset-0'
      ].join(' ')}
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-14 w-14">
          <div className="absolute inset-0 rounded-full border-2 border-blue-500/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-400 animate-spin" />
          <div className="absolute inset-3 rounded-full bg-blue-500/15" />
        </div>
        <div className="text-center">
          <div className="text-xs font-black uppercase tracking-[0.24em] text-slate-800">Plasyect</div>
          <div className="mt-1 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500">{label}</div>
        </div>
      </div>
    </motion.div>
  );
}

function DashboardLayout() {
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [moduleLoading, setModuleLoading] = useState(false);
  const [loadingModuleLabel, setLoadingModuleLabel] = useState(TAB_LABELS.dashboard);
  const mainRef = useRef<HTMLElement | null>(null);
  const tabChangeTimerRef = useRef<number | null>(null);
  const moduleLoadingTimerRef = useRef<number | null>(null);
  const { can, isDataLoading } = useDashboard();

  useEffect(() => {
    return () => {
      if (tabChangeTimerRef.current) window.clearTimeout(tabChangeTimerRef.current);
      if (moduleLoadingTimerRef.current) window.clearTimeout(moduleLoadingTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const currentPermission = TAB_PERMISSIONS[currentTab];
    if (!currentPermission || can(currentPermission)) return;
    const fallback = Object.entries(TAB_PERMISSIONS).find(([, permission]) => can(permission))?.[0] || 'dashboard';
    setCurrentTab(fallback);
  }, [can, currentTab]);

  const handleTabChange = (tab: string) => {
    if (tab === currentTab) {
      setMobileSidebarOpen(false);
      return;
    }

    setModuleLoading(true);
    setLoadingModuleLabel(TAB_LABELS[tab] || 'modulo');
    mainRef.current?.scrollTo({ top: 0, left: 0 });
    if (tabChangeTimerRef.current) window.clearTimeout(tabChangeTimerRef.current);
    if (moduleLoadingTimerRef.current) window.clearTimeout(moduleLoadingTimerRef.current);
    tabChangeTimerRef.current = window.setTimeout(() => setCurrentTab(tab), 80);
    moduleLoadingTimerRef.current = window.setTimeout(() => setModuleLoading(false), 560);
  };

  const renderActiveView = () => {
    const activePermission = TAB_PERMISSIONS[currentTab];
    if (activePermission && !can(activePermission)) {
      return (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 text-sm text-slate-400">
          Sin permiso para abrir este módulo.
        </div>
      );
    }

    switch (currentTab) {
      case 'dashboard':
        return <DashboardEjecutivoView />;
      case 'pipeline-lote':
        return <PipelineLoteView />;
      case 'pipeline-pedido':
        return <PipelinePedidoView />;
      case 'produccion-area':
        return <ProduccionAreaView />;
      case 'modelos-productos':
        return <ModelosProductosView />;
      case 'calidad':
        return <CalidadView />;
      case 'inyeccion':
        return <InyeccionView />;
      case 'banda':
        return <BandaView />;
      case 'aduana-liberacion':
        return <AduanaLiberacionView />;
      case 'embarque':
        return <EmbarqueView />;
      case 'ocr-validacion':
        return <OCRValidacionView />;
      case 'reportes-historicos':
        return <ReportesHistoricosView />;
      case 'catalogos':
        return <CatalogosView />;
      case 'configuracion':
        return <ConfiguracionView />;
      default:
        return <DashboardEjecutivoView />;
    }
  };

  if (isDataLoading) {
    return (
      <div className="relative h-screen w-screen bg-slate-955 text-slate-200 overflow-hidden font-sans">
        <LoadingScreen label="Cargando informacion" />
      </div>
    );
  }

  return (
    <div className="relative flex h-screen w-screen bg-slate-955 text-slate-200 overflow-hidden font-sans selection:bg-blue-500 selection:text-white">
      {/* Mobile sidebar backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar Navigation Left */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={handleTabChange}
        isMobileOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />

      {/* Main Core View Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">

        {/* Superior Header panel */}
        <Header onMenuClick={() => setMobileSidebarOpen(true)} />

        {/* Scrollable contents container */}
        <main ref={mainRef} className="relative flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 bg-slate-955">
          <AnimatePresence>
            {moduleLoading && <LoadingScreen mode="module" label={`Cargando ${loadingModuleLabel}`} />}
          </AnimatePresence>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="relative max-w-[1600px] mx-auto w-full"
            >
              <ModuleExportActions
                moduleId={currentTab}
                moduleName={TAB_LABELS[currentTab] || 'Dashboard Ejecutivo'}
                rootId="module-export-root"
              />
              <div id="module-export-root">
                {renderActiveView()}
              </div>
            </motion.div>
          </AnimatePresence>
        </main>

      </div>

    </div>
  );
}

export default function App() {
  return (
    <DashboardProvider>
      <DashboardLayout />
    </DashboardProvider>
  );
}
