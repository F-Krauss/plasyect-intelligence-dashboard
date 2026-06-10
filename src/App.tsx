/**
 * Plasyect Intelligence Dashboard - App Wrapper
 * @license Apache-2.0
 */

import { useEffect, useState } from 'react';
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

function DashboardLayout() {
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const { can } = useDashboard();

  useEffect(() => {
    const currentPermission = TAB_PERMISSIONS[currentTab];
    if (!currentPermission || can(currentPermission)) return;
    const fallback = Object.entries(TAB_PERMISSIONS).find(([, permission]) => can(permission))?.[0] || 'dashboard';
    setCurrentTab(fallback);
  }, [can, currentTab]);

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

  return (
    <div className="flex h-screen w-screen bg-slate-955 text-slate-200 overflow-hidden font-sans selection:bg-blue-500 selection:text-white">
      
      {/* Sidebar Navigation Left */}
      <Sidebar currentTab={currentTab} setCurrentTab={setCurrentTab} />

      {/* Main Core View Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        
        {/* Superior Header panel */}
        <Header />

        {/* Scrollable contents container */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-955">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="max-w-[1600px] mx-auto w-full"
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
