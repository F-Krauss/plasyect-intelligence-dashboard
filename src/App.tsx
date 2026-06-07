/**
 * Plasyect Intelligence Dashboard - App Wrapper
 * @license Apache-2.0
 */

import { useState } from 'react';
import { DashboardProvider } from './context/DashboardContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
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

function DashboardLayout() {
  const [currentTab, setCurrentTab] = useState<string>('dashboard');

  const renderActiveView = () => {
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
              {renderActiveView()}
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
