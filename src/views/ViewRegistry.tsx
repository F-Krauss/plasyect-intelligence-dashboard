import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { ALL_PERMISSION_KEYS, PERMISSION_LABELS, ROLE_PERMISSION_DEFAULTS, useDashboard } from '../context/DashboardContext';
import * as d3 from 'd3';
import { 
  BarChart as RechartsBarChart, 
  Bar as RechartsBar, 
  XAxis as RechartsXAxis, 
  YAxis as RechartsYAxis, 
  CartesianGrid as RechartsCartesianGrid, 
  Tooltip as RechartsTooltip, 
  Legend as RechartsLegend, 
  LineChart as RechartsLineChart,
  Line as RechartsLine
} from 'recharts';
import { KPICard } from '../components/KPICard';
import { ChartCard } from '../components/ChartCard';
import { AlertPanel } from '../components/AlertPanel';
import { StatusBadge } from '../components/StatusBadge';
import { DataTable } from '../components/DataTable';
import { PipelineColumn } from '../components/pipeline/PipelineColumn';
import { OCRValidation } from '../components/ocr/OCRValidation';
import { STAGES } from '../data/appConfig';
import { backendEnabled, dashboardApi, type DailyProductionRow, type EjecutivoData, type ErpOperationalResponse, type ModelPerformanceRow, type MovimientoRow } from '../api/dashboardApi';
import { AppUser, Batch, PermissionKey, ProductionAreaId, Role, StageId } from '../types';
import { 
  DollarSign, 
  Layers, 
  Flame, 
  BarChart, 
  Users, 
  Briefcase, 
  Percent, 
  ShieldAlert, 
  PlusCircle, 
  Settings, 
  FolderLock, 
  Cpu, 
  Database, 
  ShieldCheck, 
  Printer, 
  Activity, 
  AlertTriangle,
  FileCheck,
  CheckSquare,
  FileText,
  Clock,
  Send,
  Upload,
  Repeat,
  Filter,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Edit,
  Eye,
  Search,
  AlertCircle,
  Building
} from 'lucide-react';

interface StableResponsiveContainerProps {
  width?: string | number;
  height?: string | number;
  minWidth?: number;
  minHeight?: number;
  children: React.ReactElement<{ width?: number; height?: number }>;
}

const RechartsResponsiveContainer: React.FC<StableResponsiveContainerProps> = ({
  minWidth = 1,
  minHeight = 1,
  children
}) => {
  const frameRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;

    const updateSize = () => {
      const rect = frame.getBoundingClientRect();
      setSize({
        width: Math.max(minWidth, Math.floor(rect.width)),
        height: Math.max(minHeight, Math.floor(rect.height))
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(frame);
    window.addEventListener('resize', updateSize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, [minHeight, minWidth]);

  return (
    <div ref={frameRef} className="h-full w-full min-h-0 min-w-0">
      {size.width > 0 && size.height > 0
        ? React.cloneElement(children, { width: size.width, height: size.height })
        : null}
    </div>
  );
};

const getBatchStageId = (batch: Pick<Batch, 'etapaActual' | 'stage'>): StageId =>
  (batch.etapaActual || batch.stage || 'alta_pedido') as StageId;

const getBatchPairs = (batch: Pick<Batch, 'totalPares' | 'quantityShoes'>): number =>
  batch.totalPares ?? batch.quantityShoes ?? 0;

const isArchivedBatch = (batch: Pick<Batch, 'status' | 'estatus'>): boolean => {
  const status = String(batch.status || '');
  const estatus = String(batch.estatus || '');
  return status === 'ARCHIVADO' || status === 'ARCHIVED' || estatus === 'ARCHIVADO' || estatus === 'ARCHIVED';
};

const isDeliveredBatch = (batch: Pick<Batch, 'etapaActual' | 'stage' | 'status' | 'estatus'>): boolean =>
  getBatchStageId(batch) === 'embarque' || batch.status === 'ENTREGADO' || batch.estatus === 'ENTREGADO';

const dateOnlyTime = (value?: string | null): number | null => {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

const isPastDueDateOnly = (value?: string | null, anchor = dateOnlyTime(new Date().toISOString()) ?? Date.now()): boolean => {
  const due = dateOnlyTime(value);
  return due !== null && due < anchor;
};

type ProductionTargetRow = {
  fecha: string;
  hora: string;
  area: string;
  metaHora: number;
};

const productionTargetKey = (row: ProductionTargetRow): string =>
  `${row.fecha}|${row.hora}|${row.area}`;

const sumUniqueProductionTarget = (rows: ProductionTargetRow[]): number => {
  const targets = new Map<string, number>();
  rows.forEach(row => {
    const key = productionTargetKey(row);
    if (!targets.has(key)) targets.set(key, row.metaHora || 0);
  });
  return Array.from(targets.values()).reduce((sum, value) => sum + value, 0);
};

export const DashboardEjecutivoView: React.FC = () => {
  const { orders, batches, defects, audits, exchangeRate, currentTenant } = useDashboard();
  
  // Base date anchor representing the current local time for days-left calculations
  const BASE_DATE = new Date();
  const DEFAULT_FECHA_FIN = new Date().toISOString().slice(0, 10);
  const DEFAULT_FECHA_INICIO = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const SEMAPHORE = {
    ok: {
      fill: '#16a34a',
      text: 'text-emerald-400',
      border: 'border-emerald-900/70',
      bg: 'bg-emerald-950/15',
      label: 'Dentro de meta'
    },
    warning: {
      fill: '#d97706',
      text: 'text-amber-500',
      border: 'border-amber-900/70',
      bg: 'bg-amber-950/15',
      label: 'Por debajo'
    },
    danger: {
      fill: '#dc2626',
      text: 'text-rose-500',
      border: 'border-rose-900/70',
      bg: 'bg-rose-950/15',
      label: 'Muy por debajo'
    },
    neutral: {
      fill: '#2563eb',
      text: 'text-cyan-400',
      border: 'border-slate-800',
      bg: 'bg-slate-900',
      label: 'Referencia'
    }
  } as const;
  type SemaphoreKey = keyof typeof SEMAPHORE;
  const getStdDev = (values: number[]) => {
    if (values.length <= 1) return 0;
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / values.length;
    return Math.sqrt(variance);
  };
  const classifyAgainstTarget = (actual: number, target: number, stdDev: number): SemaphoreKey => {
    if (target <= 0) return 'neutral';
    const tolerance = Math.max(stdDev, target * 0.05, 1);
    if (actual >= target) return 'ok';
    if (actual >= target - tolerance) return 'warning';
    return 'danger';
  };
  const classifyLowerIsBetter = (actual: number, target: number, stdDev: number): SemaphoreKey => {
    const tolerance = Math.max(stdDev, target * 0.2, 1);
    if (actual <= target) return 'ok';
    if (actual <= target + tolerance) return 'warning';
    return 'danger';
  };

  // 1. Interactive filter states
  const [fechaInicio, setFechaInicio] = useState<string>(DEFAULT_FECHA_INICIO);
  const [fechaFin, setFechaFin] = useState<string>(DEFAULT_FECHA_FIN);
  const [selectedClient, setSelectedClient] = useState<string>('TODOS');
  const [selectedModel, setSelectedModel] = useState<string>('TODOS');
  const [selectedStage, setSelectedStage] = useState<string>('TODOS');
  const [selectedStatus, setSelectedStatus] = useState<string>('TODOS');
  const [selectedTurno, setSelectedTurno] = useState<string>('TODOS');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [riskOrderLimit, setRiskOrderLimit] = useState<10 | 20 | 'ALL'>(10);

  // Real ERP data from BixApp (FDB → Supabase → backend)
  const [erpData, setErpData] = useState<ErpOperationalResponse | null>(null);
  const [erpLoading, setErpLoading] = useState(false);

  useEffect(() => {
    if (!backendEnabled) return;
    let cancelled = false;
    setErpLoading(true);
    dashboardApi.erpOperativo(fechaInicio, fechaFin)
      .then(data => { if (!cancelled) setErpData(data); })
      .catch(err => { if (!cancelled) console.warn('ERP ejecutivo fetch failed', err); })
      .finally(() => { if (!cancelled) setErpLoading(false); });
    return () => { cancelled = true; };
  }, [fechaInicio, fechaFin]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    if (backendEnabled) {
      dashboardApi.erpOperativo(fechaInicio, fechaFin)
        .then(data => setErpData(data))
        .catch(err => console.warn('ERP refresh failed', err))
        .finally(() => setIsRefreshing(false));
    } else {
      setTimeout(() => setIsRefreshing(false), 600);
    }
  };

  const handleClearFilters = () => {
    setFechaInicio(DEFAULT_FECHA_INICIO);
    setFechaFin(DEFAULT_FECHA_FIN);
    setSelectedClient('TODOS');
    setSelectedModel('TODOS');
    setSelectedStage('TODOS');
    setSelectedStatus('TODOS');
    setSelectedTurno('TODOS');
  };

  useEffect(() => {
    setRiskOrderLimit(10);
  }, [fechaInicio, fechaFin, selectedClient, selectedModel, selectedStatus]);

  // Base datasets derived from SaaS tenant configuration
  const tenantOrders = orders.filter(o => o.tenantId === currentTenant.id);
  const tenantBatches = batches.filter(b => b.tenantId === currentTenant.id && !isArchivedBatch(b));

  // Filter application - Orders
  const filteredOrders = tenantOrders.filter(o => {
    const oDate = o.fechaAlta || o.createdAt || '';
    if (fechaInicio && oDate && new Date(oDate) < new Date(fechaInicio)) return false;
    if (fechaFin && oDate && new Date(oDate) > new Date(fechaFin)) return false;
    if (selectedClient !== 'TODOS' && o.clientName !== selectedClient) return false;
    if (selectedModel !== 'TODOS' && o.modelName !== selectedModel) return false;
    if (selectedStatus !== 'TODOS' && o.status !== selectedStatus) return false;
    return true;
  });

  // Filter application - Batches
  const filteredBatches = tenantBatches.filter(b => {
    const bDate = b.fechaAlta || b.createdAt || '';
    if (fechaInicio && bDate && new Date(bDate) < new Date(fechaInicio)) return false;
    if (fechaFin && bDate && new Date(bDate) > new Date(fechaFin)) return false;
    if (selectedClient !== 'TODOS' && b.cliente !== selectedClient) return false;
    if (selectedModel !== 'TODOS' && b.modelo !== selectedModel) return false;
    if (selectedStage !== 'TODOS' && getBatchStageId(b) !== selectedStage) return false;
    if (selectedStatus !== 'TODOS' && b.status !== selectedStatus) return false;
    return true;
  });

  const dashboardWipBatches = (erpData?.lotePipeline ?? filteredBatches).filter(b => {
    const clientVal = b.cliente || b.clientName || '';
    const modelVal = b.modelo || b.modelName || '';
    if (selectedClient !== 'TODOS' && clientVal !== selectedClient) return false;
    if (selectedModel !== 'TODOS' && modelVal !== selectedModel) return false;
    if (selectedStage !== 'TODOS' && getBatchStageId(b) !== selectedStage) return false;
    if (selectedStatus !== 'TODOS' && b.status !== selectedStatus) return false;
    return true;
  });

  const dashboardActiveOrders = erpData
    ? erpData.orderPipeline.filter(o => {
      if (o.progress >= 100) return false;
      if (selectedClient !== 'TODOS' && o.cliente !== selectedClient) return false;
      if (selectedModel !== 'TODOS' && o.modelo !== selectedModel) return false;
      if (selectedStatus !== 'TODOS' && selectedStatus !== 'PROCESANDO' && selectedStatus !== 'PENDIENTE') return false;
      return true;
    })
    : filteredOrders.filter(o => o.status === 'PROCESANDO' || o.status === 'PENDIENTE');

  const dashboardClientOptions = Array.from(new Set([
    ...tenantOrders.map(o => o.clientName || o.cliente || '').filter(Boolean),
    ...(erpData?.catalogs.clients.map(c => String(c.name || c.nombre || '')).filter(Boolean) ?? [])
  ]));
  const dashboardModelOptions = Array.from(new Set([
    ...tenantBatches.map(b => b.modelo || b.modelName || '').filter(Boolean),
    ...(erpData?.catalogs.models.map(m => String(m.name || m.nombre || '')).filter(Boolean) ?? []),
    ...(erpData?.models.map(m => m.modeloName).filter(Boolean) ?? [])
  ]));

  const hasPeriodData = erpData?.meta.hasPeriodData ?? true;
  const activeMetric = (value: number | null | undefined) => hasPeriodData ? (value ?? 0).toLocaleString() : '--';
  const pctMetric = (value: number | null | undefined) => hasPeriodData ? `${value ?? 0}%` : '--';
  const calidadSource = erpData?.quality ?? [];
  const prodSource = erpData?.productionHourly ?? [];

  // Filter application - Quality records (date already filtered by API; apply remaining filters)
  const filteredQuality = calidadSource.filter(q => {
    if (!backendEnabled) {
      if (fechaInicio && new Date(q.fecha) < new Date(fechaInicio)) return false;
      if (fechaFin && new Date(q.fecha) > new Date(fechaFin)) return false;
    }
    if (selectedModel !== 'TODOS' && q.modelo !== selectedModel) return false;
    if (selectedTurno !== 'TODOS' && q.turno !== selectedTurno) return false;
    return true;
  });

  // Filter application - Hourly production (date already filtered by API; apply remaining filters)
  const filteredProdHora = prodSource.filter(p => {
    if (!backendEnabled) {
      if (fechaInicio && new Date(p.fecha) < new Date(fechaInicio)) return false;
      if (fechaFin && new Date(p.fecha) > new Date(fechaFin)) return false;
    }
    if (selectedModel !== 'TODOS' && p.modelo !== selectedModel) return false;
    if (selectedTurno !== 'TODOS' && p.turno !== selectedTurno) return false;
    return true;
  });

  // Most recent date in filtered production (for hourly chart and "del día" KPI)
  const mostRecentProdDate = filteredProdHora.reduce((max, p) => p.fecha > max ? p.fecha : max, '');
  const todayProdHora = mostRecentProdDate
    ? filteredProdHora.filter(p => p.fecha === mostRecentProdDate)
    : filteredProdHora;

  // 2. 第一 KPI Ratios (8 indicators)
  // - Pedidos activos: Status PENDIENTE or PROCESANDO
  const kpiActiveOrdersCount = erpData
    ? erpData.active.orders
    : filteredOrders.filter(o => o.status === 'PROCESANDO' || o.status === 'PENDIENTE').length;

  // - Lotes activos: etapa Actual !== 'embarque'
  const kpiActiveBatchesCount = erpData
    ? erpData.active.batches
    : filteredBatches.filter(b => !isDeliveredBatch(b)).length;

  // - Pares activos en planta: Suma totalPares de lotes activos
  const kpiActiveParesCount = erpData
    ? erpData.active.pairs
    : filteredBatches
      .filter(b => !isDeliveredBatch(b))
      .reduce((sum, b) => sum + getBatchPairs(b), 0);

  // - Producción del día: Suma producciónReal del día más reciente en el rango
  const kpiDailyProdCount = todayProdHora.reduce((sum, p) => sum + p.produccionReal, 0);

  // - Porcentaje de avance global (weighted avg by pairs)
  const activeBatchesForProgress = filteredBatches.filter(b => !isDeliveredBatch(b));
  const totalParesForProgress = activeBatchesForProgress.reduce((sum, b) => sum + getBatchPairs(b), 0);
  const sumAvancePares = activeBatchesForProgress.reduce((sum, b) => sum + ((b.porcentajeAvance || 0) * getBatchPairs(b)), 0);
  const kpiGlobalProgress = erpData
    ? erpData.wipSummary.globalProgress
    : totalParesForProgress > 0 ? Math.round(sumAvancePares / totalParesForProgress) : 0;

  // - Pedidos vencidos abiertos: fechaCompromiso < hoy AND no entregado
  const kpiOrdersInRiskCount = erpData
    ? erpData.orderRisk.vencido
    : filteredOrders.filter(o => o.riesgoEntrega === 'VENCIDO').length;

  // - Porcentaje defectivo global: (merma + segundos) / totalInspeccionado
  const totalInspected = filteredQuality.reduce((sum, q) => sum + q.totalInspeccionado, 0);
  const totalDefectives = filteredQuality.reduce((sum, q) => sum + (q.merma + q.segundas), 0);
  const kpiDefectivePct = totalInspected > 0 ? Number(((totalDefectives / totalInspected) * 100).toFixed(2)) : 0;

  // - Cumplimiento contra meta: real / meta
  const totalRealPrs = filteredProdHora.reduce((sum, p) => sum + p.produccionReal, 0);
  const totalMetaPrs = sumUniqueProductionTarget(filteredProdHora);
  const kpiMetaCompliance = totalMetaPrs > 0 ? Number(((totalRealPrs / totalMetaPrs) * 100).toFixed(1)) : 0;
  const productionStdDev = getStdDev(filteredProdHora.map(p => p.produccionReal - p.metaHora));
  const complianceStdDev = getStdDev(filteredProdHora.map(p => p.eficiencia));
  const defectStdDev = getStdDev(filteredQuality.map(q => q.porcentajeDefectivo));
  const progressStdDev = erpData ? 0 : getStdDev(activeBatchesForProgress.map(b => b.porcentajeAvance || 0));
  const riskStdDev = erpData ? 0 : getStdDev(filteredOrders.map(o => (o.riesgoEntrega === 'ALTO' || o.riesgoEntrega === 'VENCIDO') ? 1 : 0));
  const todayMetaPrs = sumUniqueProductionTarget(todayProdHora);
  const kpiDailyStatus = classifyAgainstTarget(kpiDailyProdCount, todayMetaPrs, productionStdDev);
  const kpiProgressStatus = hasPeriodData ? classifyAgainstTarget(kpiGlobalProgress, 70, progressStdDev) : 'neutral';
  const kpiRiskStatus = hasPeriodData ? classifyLowerIsBetter(kpiOrdersInRiskCount, 0, riskStdDev) : 'neutral';
  const kpiDefectStatus = classifyLowerIsBetter(kpiDefectivePct, 3, defectStdDev);
  const kpiComplianceStatus = classifyAgainstTarget(kpiMetaCompliance, 100, complianceStdDev);

  // Active WIP denominator
  const totalWIPPares = erpData ? erpData.wipSummary.activePairs : filteredBatches.reduce((sum, b) => sum + getBatchPairs(b), 0);

  // 3. Pipeline Stages mapping & stats
  const fallbackPipelineStages = STAGES.map(st => {
    const stageBatches = filteredBatches.filter(b => getBatchStageId(b) === st.id);
    const stageLotesCount = stageBatches.length;
    const stageParesCount = stageBatches.reduce((sum, b) => sum + getBatchPairs(b), 0);
    const avgMinutes = stageLotesCount > 0 
      ? Math.round(stageBatches.reduce((sum, b) => sum + (b.tiempoEnEtapaMinutos || 0), 0) / stageLotesCount)
      : 0;

    // Saturation logic
    let saturation: 'OPTIMO' | 'SATURADO' | 'CRITICO' = 'OPTIMO';
    if (stageLotesCount >= 8 || avgMinutes > 2500) {
      saturation = 'CRITICO';
    } else if (stageLotesCount >= 4 || avgMinutes > 1000) {
      saturation = 'SATURADO';
    }

    const wipPct = totalWIPPares > 0 ? Number(((stageParesCount / totalWIPPares) * 100).toFixed(1)) : 0;

    return {
      ...st,
      lotCount: stageLotesCount,
      paresCount: stageParesCount,
      avgMins: avgMinutes,
      saturation,
      wipPct
    };
  });
  const pipelineStages = erpData?.stagePipeline.length
    ? erpData.stagePipeline
      .filter(row => selectedStage === 'TODOS' || row.stageId === selectedStage)
      .map(row => ({
        ...(STAGES.find(st => st.id === row.stageId) ?? {
          id: row.stageId,
          name: row.stageName,
          order: 99,
          color: '#64748b',
          description: ''
        }),
        lotCount: row.batches,
        paresCount: row.pairs,
        avgMins: row.avgMinutes ?? 0,
        saturation: row.saturation,
        wipPct: row.wipPct
      }))
    : fallbackPipelineStages;

  // 4. Panel derecho de alertas dinámicas (Critical Alerts)
  const generatedAlerts: { id: string; level: 'crítico' | 'advertencia' | 'informativo'; title: string; desc: string; target: string; time: string }[] = [];

  // Alert: Lotes sin movimiento > 8 horas
  filteredBatches
    .filter(b => !isDeliveredBatch(b) && b.tiempoEnEtapaMinutos && b.tiempoEnEtapaMinutos > 480)
    .slice(0, 3)
    .forEach(b => {
      generatedAlerts.push({
        id: `alt-mov-${b.id}`,
        level: b.tiempoEnEtapaMinutos! > 3000 ? 'crítico' : 'advertencia',
        title: 'Lote Retenido sin Movimiento',
        desc: `Tarv. ${b.tarjetaViajera} detenido en ${STAGES.find(s => s.id === getBatchStageId(b))?.name || getBatchStageId(b)} por soplado residual.`,
        target: b.id,
        time: `${Math.round(b.tiempoEnEtapaMinutos! / 60)} horas`
      });
    });

  // Alert: Pedidos vencidos o próximos a vencer
  (erpData?.orderRisk.rows ?? filteredOrders)
    .filter(o => 'risk' in o
      ? o.risk === 'VENCIDO' || o.risk === 'ALTO'
      : o.riesgoEntrega === 'VENCIDO' || o.riesgoEntrega === 'ALTO')
    .slice(0, 3)
    .forEach(o => {
      const risk = 'risk' in o ? o.risk : o.riesgoEntrega;
      generatedAlerts.push({
        id: `alt-ord-${o.id}`,
        level: risk === 'VENCIDO' ? 'crítico' : 'advertencia',
        title: risk === 'VENCIDO' ? 'Pedido Vencido Demorado' : 'Contrato por Vencer',
        desc: `Cliente ${'cliente' in o ? o.cliente : o.clientName} con riesgo FDB. OC: ${o.oc ?? 'N/D'}`,
        target: o.id,
        time: risk === 'VENCIDO' ? 'Plazo Vencido' : 'Próximos 3 días'
      });
    });

  // Alert: Modelos con alto defecto (Ruby)
  filteredQuality
    .filter(q => q.porcentajeDefectivo > 4.5)
    .slice(0, 2)
    .forEach(q => {
      generatedAlerts.push({
        id: `alt-qual-${q.lote}`,
        level: 'crítico',
        title: 'Mermas Fuera de Tolerancia',
        desc: `Modelo ${q.modelo} (${q.color}) reporta un ${q.porcentajeDefectivo}% defectivo.`,
        target: `Lote ${q.lote}`,
        time: `Turno ${q.turno}`
      });
    });

  // Failsafe alerts if none generated
  if (generatedAlerts.length === 0) {
    generatedAlerts.push({
      id: 'alt-info-ok',
      level: 'informativo',
      title: 'Sin alertas FDB',
      desc: 'Sin alertas generadas con datos FDB en el periodo.',
      target: 'División Matriz',
      time: 'Periodo'
    });
  }

  // Torre de Alertas Críticas desactivada (pendiente de afinar la lógica de
  // desviación con datos reales). Poner en true para reactivar el panel.
  const SHOW_ALERTS_TOWER = false;

  // 5. Gráficas inferiores computations
  // - Producción real vs meta por hora del día, agregada sobre TODO el rango
  //   seleccionado. Antes se usaba solo el día más reciente, por lo que al
  //   cambiar las fechas la gráfica no se movía (los escaneos reales de
  //   inyección/banda terminan el 2026-04-20). Agregando el rango completo la
  //   gráfica responde a cualquier cambio de fecha inicio/fin.
  const hourlyChartData: Record<string, { value: number; target: number }> = {};
  const hourlyTargetSlots = new Set<string>();
  for (const p of filteredProdHora) {
    if (!hourlyChartData[p.hora]) hourlyChartData[p.hora] = { value: 0, target: 0 };
    hourlyChartData[p.hora].value += p.produccionReal;
    const targetKey = productionTargetKey(p);
    if (!hourlyTargetSlots.has(targetKey)) {
      hourlyChartData[p.hora].target += p.metaHora;
      hourlyTargetSlots.add(targetKey);
    }
  }
  const hasHourlyData = filteredProdHora.length > 0;
  // Días reales con escaneos de producción dentro del rango (para el subtítulo).
  const prodDatesInRange = Array.from(new Set(filteredProdHora.map(p => p.fecha))).sort();
  const hourlyStdDev = getStdDev(Object.values(hourlyChartData).map(d => d.value - d.target));
  const finalHourlyData = Array.from({ length: 24 }, (_, hour) => {
    const label = `${String(hour).padStart(2, '0')}:00`;
    const data = hourlyChartData[label] || { value: 0, target: 0 };
      const status = classifyAgainstTarget(data.value, data.target, hourlyStdDev);
      return { label, value: data.value, target: data.target, color: SEMAPHORE[status].fill, status };
  });

  // - Pares por etapa
  const stageParesChartData = pipelineStages.map(st => ({
    label: st.name.split(' ')[0], // short name
    value: st.paresCount,
    color: st.saturation === 'CRITICO' ? SEMAPHORE.danger.fill : st.saturation === 'SATURADO' ? SEMAPHORE.warning.fill : SEMAPHORE.ok.fill
  }));

  // - Top 5 modelos producidos
  const modelCount: Record<string, number> = {};
  dashboardWipBatches.forEach(b => {
    const modelKey = b.modelo || b.modelName || 'Otro';
    modelCount[modelKey] = (modelCount[modelKey] || 0) + getBatchPairs(b);
  });
  const top5ModelsData = Object.entries(modelCount)
    .map(([label, value]) => ({ label, value }))
    .sort((a,b) => b.value - a.value)
    .slice(0, 5);

  // - Pareto de defectos
  const defectFreqs: Record<string, number> = {};
  filteredQuality.forEach(q => {
    if (q.defecto && q.cantidadDefecto) {
      defectFreqs[q.defecto] = (defectFreqs[q.defecto] || 0) + q.cantidadDefecto;
    }
  });
  const paretoDefectData = Object.entries(defectFreqs)
    .map(([label, value]) => ({ label, value }))
    .sort((a,b) => b.value - a.value)
    .slice(0, 5);

  // - Pedidos por estatus
  const statusCounts = filteredOrders.reduce((acc: Record<string, number>, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});
  const fallbackOrderStatusData = Object.entries(statusCounts).map(([label, value]) => ({
    label: label === 'COMPLETADO' ? 'Terminados' : label === 'PROCESANDO' ? 'En Proceso' : 'Pendientes',
    value: value as number,
    color: label === 'COMPLETADO' ? '#10b981' : label === 'PROCESANDO' ? '#3b82f6' : '#f59e0b'
  }));
  const orderStatusData = erpData
    ? [
      { label: 'En Proceso', value: dashboardActiveOrders.length, color: '#3b82f6' },
      { label: 'Pendientes', value: 0, color: '#f59e0b' }
    ]
    : fallbackOrderStatusData;
  const productionStatusData = [
    { label: 'Óptimo', value: dashboardWipBatches.filter(b => b.status === 'OPTIMO').length, color: SEMAPHORE.ok.fill },
    { label: 'Alerta', value: dashboardWipBatches.filter(b => b.status === 'ALERTA').length, color: SEMAPHORE.warning.fill },
    { label: 'Crítico', value: dashboardWipBatches.filter(b => b.status === 'CRITICO').length, color: SEMAPHORE.danger.fill },
    { label: 'Detenido', value: dashboardWipBatches.filter(b => b.status === 'DETENIDO').length, color: '#475569' }
  ];
  const shiftComplianceData = ['1', '2', '3'].map(turno => {
    const rows = filteredProdHora.filter(p => p.turno === turno);
    const real = rows.reduce((sum, p) => sum + p.produccionReal, 0);
    const target = sumUniqueProductionTarget(rows);
    const pct = target > 0 ? Number(((real / target) * 100).toFixed(1)) : 0;
    const std = getStdDev(rows.map(p => p.eficiencia));
    const status = classifyAgainstTarget(pct, 100, std);
    return { label: `Turno ${turno}`, value: pct, real, target, color: SEMAPHORE[status].fill, status };
  });
  const qualityAreaData = ['INYECCION', 'BANDA'].map(area => {
    const rows = filteredQuality.filter(q => q.area === area);
    const inspected = rows.reduce((sum, q) => sum + q.totalInspeccionado, 0);
    const defectsCount = rows.reduce((sum, q) => sum + q.merma + q.segundas, 0);
    const pct = inspected > 0 ? Number(((defectsCount / inspected) * 100).toFixed(2)) : 0;
    const std = getStdDev(rows.map(q => q.porcentajeDefectivo));
    const status = classifyLowerIsBetter(pct, 3, std);
    return { label: area === 'INYECCION' ? 'Inyección' : 'Banda', value: pct, defectsCount, inspected, color: SEMAPHORE[status].fill, status };
  });

  // 6. Pedidos en riesgo: por default solo abiertos; con fechas modificadas incluye cerrados.
  const temporalFiltersApplied = fechaInicio !== DEFAULT_FECHA_INICIO || fechaFin !== DEFAULT_FECHA_FIN;
  const riskReferenceDate = temporalFiltersApplied && fechaFin
    ? new Date(`${fechaFin}T12:00:00`)
    : BASE_DATE;
  const closedOrderStatuses = ['COMPLETADO', 'CANCELADO', 'ENTREGADO'];
  const riskRank = { VENCIDO: 4, ALTO: 3, MEDIO: 2, BAJO: 1 } as const;
  const isClosedOrder = (status?: string) => closedOrderStatuses.includes(status || '');
  const getRiskFromDays = (daysLeft: number): keyof typeof riskRank => {
    if (daysLeft < 0) return 'VENCIDO';
    if (daysLeft <= 3) return 'ALTO';
    if (daysLeft <= 7) return 'MEDIO';
    return 'BAJO';
  };
  const handleShowMoreRiskOrders = () => {
    setRiskOrderLimit(current => current === 10 ? 20 : current === 20 ? 'ALL' : 10);
  };
  const fallbackRiskOrdersSource = filteredOrders.filter(o => {
    const openedAt = new Date(o.fechaAlta || o.createdAt || '');
    const openedByQueryDate = Number.isNaN(openedAt.getTime()) || openedAt <= riskReferenceDate;
    if (!openedByQueryDate) return false;
    return temporalFiltersApplied || !isClosedOrder(o.status || o.estatus);
  });
  const fallbackRiskOrders = fallbackRiskOrdersSource
    .map(o => {
      // Days remaining
      const commitment = new Date(o.fechaCompromiso || o.deliveryDate || '');
      const daysLeft = Number.isNaN(commitment.getTime())
        ? 999
        : Math.ceil((commitment.getTime() - riskReferenceDate.getTime()) / (1000 * 60 * 60 * 24));
      const computedRisk = getRiskFromDays(daysLeft);
      const savedCloseRisk = (o.riesgoEntrega || computedRisk) as keyof typeof riskRank;
      const displayRisk = isClosedOrder(o.status || o.estatus)
        ? savedCloseRisk
        : computedRisk;

      // Dominant stage (stage with most lots of this order)
      const orderBatches = filteredBatches.filter(b => b.orderId === o.id);
      const stageTallies: Record<string, number> = {};
      orderBatches.forEach(b => {
        stageTallies[b.etapaActual || ''] = (stageTallies[b.etapaActual || ''] || 0) + 1;
      });
      const dominantStageKey = Object.entries(stageTallies).sort((a,b) => b[1] - a[1])[0]?.[0] || 'alta_pedido';
      const dominantStageName = STAGES.find(s => s.id === dominantStageKey)?.name || 'Alta';

      return {
        ...o,
        daysLeft,
        dominantStage: dominantStageName,
        displayRisk,
        savedCloseRisk,
        isClosed: isClosedOrder(o.status || o.estatus)
      };
    })
    .sort((a,b) => {
      const riskDiff = riskRank[b.displayRisk] - riskRank[a.displayRisk];
      if (riskDiff !== 0) return riskDiff;
      return a.daysLeft - b.daysLeft;
    });
  const erpRiskOrders = (erpData?.orderRisk.rows ?? [])
    .filter(o => temporalFiltersApplied || o.progress < 100)
    .map(o => ({
      ...o,
      clientName: o.cliente,
      quantity: o.totalPares,
      modelName: o.modelo || 'Varios modelos',
      porcentajeAvance: o.progress,
      deliveryDate: o.fechaCompromiso || '',
      status: o.progress >= 100 ? 'COMPLETADO' : 'PROCESANDO',
      estatus: o.progress >= 100 ? 'COMPLETADO' : 'PROCESANDO',
      daysLeft: o.daysLeft ?? 999,
      dominantStage: STAGES.find(s => s.id === o.dominantStage)?.name || o.dominantStage,
      displayRisk: o.risk,
      savedCloseRisk: o.risk,
      isClosed: o.progress >= 100
    }))
    .sort((a, b) => {
      const riskDiff = riskRank[b.displayRisk] - riskRank[a.displayRisk];
      if (riskDiff !== 0) return riskDiff;
      return a.daysLeft - b.daysLeft;
    });
  // Fuente unica: riesgo de pedidos siempre desde el ERP server-side (universo
  // completo del FDB). Sin fallback al bootstrap limitado para que los campos
  // compartidos coincidan con Pipeline por Pedido.
  const riskOrders = erpData ? erpRiskOrders : [];
  void fallbackRiskOrders;
  const displayedRiskOrders = riskOrders.slice(0, riskOrderLimit === 'ALL' ? riskOrders.length : riskOrderLimit);
  const canExpandRiskOrders = riskOrders.length > 10;
  const riskOrderLimitLabel = riskOrderLimit === 'ALL' ? 'TODOS' : riskOrderLimit;

  return (
    <div className="flex flex-col gap-6">
      
      {/* 1. Header & Quick Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-900 border border-slate-800 p-5 rounded-lg shadow-xl gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping inline-block" />
            <h1 className="text-xl font-black font-mono text-cyan-400 uppercase tracking-widest leading-none">
              Plasyect Torre de Control
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1 font-sans">
            Módulo Directivo para Dirección General. Integración completa de inyección de EVA, mermas y cuellos de botella.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right mr-3 hidden lg:block border-r border-slate-850 pr-4">
            <span className="text-[9px] font-mono font-black text-slate-500 uppercase tracking-wider block">MXN/USD MANUAL RATE</span>
            <span className="text-xs font-bold font-mono text-emerald-400">$1 USD = {exchangeRate} MXN</span>
          </div>
          <button 
            id="btn-exec-refresh"
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-805 hover:bg-slate-800 border border-slate-700 rounded text-xs text-slate-300 font-mono font-bold transition-all"
          >
            <Repeat className={`w-3.5 h-3.5 ${(isRefreshing || erpLoading) ? 'animate-spin text-cyan-400' : ''}`} />
            {isRefreshing || erpLoading ? 'CARGANDO...' : 'ACTUALIZAR'}
          </button>
        </div>
      </div>

      {/* 2. Filtros Superiores Superior Filters */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg shadow-lg space-y-3">
        <div className="flex items-center justify-between border-b border-slate-850 pb-2">
          <span className="text-xs font-mono font-bold tracking-widest text-slate-400 uppercase flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5 text-cyan-400" />
            Parámetros de Filtración Operativa
          </span>
          <button 
            id="btn-exec-clear"
            onClick={handleClearFilters}
            className="text-[10px] text-slate-500 hover:text-red-400 font-mono underline transition"
          >
            LIMPIAR FILTROS
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {/* Fecha Inicio */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-500 uppercase block font-bold">FECHA INICIO</label>
            <input 
              id="f-inicio"
              type="date" 
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              onBlur={(e) => setFechaInicio(e.target.value)}
              className="w-full text-xs font-mono bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-300 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          {/* Fecha Fin */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-500 uppercase block font-bold">FECHA TÉRMINO</label>
            <input 
              id="f-fin"
              type="date" 
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              onBlur={(e) => setFechaFin(e.target.value)}
              className="w-full text-xs font-mono bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-300 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          {/* Cliente */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-500 uppercase block font-bold">CLIENTE</label>
            <select 
              id="f-client"
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="w-full text-xs font-sans bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-300 focus:border-cyan-500 focus:outline-none"
            >
              <option value="TODOS">-- TODOS --</option>
              {dashboardClientOptions.map(client => (
                <option key={client} value={client}>{client}</option>
              ))}
            </select>
          </div>

          {/* Modelo */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-500 uppercase block font-bold">MODELO</label>
            <select 
              id="f-model"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full text-xs font-sans bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-300 focus:border-cyan-500 focus:outline-none"
            >
              <option value="TODOS">-- TODOS --</option>
              {dashboardModelOptions.map(model => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          </div>

          {/* Etapa */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-500 uppercase block font-bold">ETAPA</label>
            <select 
              id="f-stage"
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              className="w-full text-xs font-sans bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-300 focus:border-cyan-500 focus:outline-none"
            >
              <option value="TODOS">-- TODAS --</option>
              {STAGES.map(st => (
                <option key={st.id} value={st.id}>{st.name}</option>
              ))}
            </select>
          </div>

          {/* Estatus */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-500 uppercase block font-bold">ESTATUS</label>
            <select 
              id="f-status"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full text-xs font-sans bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-300 focus:border-cyan-500 focus:outline-none"
            >
              <option value="TODOS">-- TODOS --</option>
              <option value="OPTIMO">ÓPTIMO</option>
              <option value="ALERTA">ALERTA</option>
              <option value="CRITICO">CRÍTICO</option>
              <option value="DETENIDO">DETENIDO</option>
              <option value="PENDIENTE">PENDIENTE / PEND.</option>
              <option value="PROCESANDO">PROCESANDO</option>
              <option value="COMPLETADO">COMPLETADO</option>
            </select>
          </div>

          {/* Turno */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-500 uppercase block font-bold">TURNO</label>
            <select 
              id="f-turno"
              value={selectedTurno}
              onChange={(e) => setSelectedTurno(e.target.value)}
              className="w-full text-xs font-sans bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-300 focus:border-cyan-500 focus:outline-none"
            >
              <option value="TODOS">-- TODOS --</option>
              <option value="1">TURNO 1</option>
              <option value="2">TURNO 2</option>
              <option value="3">TURNO 3</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Primera Fila de KPIs (8 clean, executive cards) */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Card 1: Pedidos Activos */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg flex flex-col justify-between shadow-md">
          <span className="text-[9px] font-bold font-mono text-slate-500 uppercase tracking-widest block">PEDIDOS ACTIVOS</span>
          <div className="mt-2 text-2xl font-black font-mono text-cyan-400">
            {activeMetric(kpiActiveOrdersCount)}
          </div>
          <span className="text-[10px] text-slate-550 block mt-1 font-mono">Sin archivadas/term.</span>
        </div>

        {/* Card 2: Lotes Activos */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg flex flex-col justify-between shadow-md">
          <span className="text-[9px] font-bold font-mono text-slate-500 uppercase tracking-widest block">LOTES ACTIVOS</span>
          <div className="mt-2 text-2xl font-black font-mono text-blue-400">
            {activeMetric(kpiActiveBatchesCount)}
          </div>
          <span className="text-[10px] text-slate-550 block mt-1 font-mono">En líneas operativas</span>
        </div>

        {/* Card 3: Pares Activos */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg flex flex-col justify-between shadow-md">
          <span className="text-[9px] font-bold font-mono text-slate-500 uppercase tracking-widest block">PARES EN PLANTA</span>
          <div className="mt-2 text-xl font-black font-mono text-indigo-400">
            {activeMetric(kpiActiveParesCount)}
          </div>
          <span className="text-[10px] text-slate-550 block mt-1 font-mono">Tránsito WIP Total</span>
        </div>

        {/* Card 4: Producción del Día */}
        <div className={`bg-slate-900 border p-4 rounded-lg flex flex-col justify-between shadow-md border-l-4 ${SEMAPHORE[kpiDailyStatus].border} ${SEMAPHORE[kpiDailyStatus].bg}`}>
          <span className="text-[9px] font-bold font-mono text-slate-500 uppercase tracking-widest block">PROD. DEL DÍA</span>
          <div className={`mt-2 text-xl font-black font-mono ${SEMAPHORE[kpiDailyStatus].text}`}>
            {kpiDailyProdCount.toLocaleString()}
          </div>
          <span className={`text-[10px] block mt-1 font-mono ${SEMAPHORE[kpiDailyStatus].text}`}>
            Meta {todayMetaPrs.toLocaleString()} / σ {Math.round(productionStdDev)}
          </span>
        </div>

        {/* Card 5: Avance Global */}
        <div className={`bg-slate-900 border p-4 rounded-lg flex flex-col justify-between shadow-md ${SEMAPHORE[kpiProgressStatus].border} ${SEMAPHORE[kpiProgressStatus].bg}`}>
          <span className="text-[9px] font-bold font-mono text-slate-500 uppercase tracking-widest block">AVANCE WIP REAL</span>
          <div className="mt-2 flex items-baseline gap-1">
            <span className={`text-2xl font-black font-mono ${SEMAPHORE[kpiProgressStatus].text}`}>{pctMetric(kpiGlobalProgress)}</span>
          </div>
          <div className="w-full bg-slate-950 rounded-full h-1 mt-1.5 overflow-hidden">
            <div className="h-full transition-all duration-300" style={{ width: `${hasPeriodData ? Math.min(kpiGlobalProgress, 100) : 0}%`, backgroundColor: SEMAPHORE[kpiProgressStatus].fill }} />
          </div>
          <span className={`text-[10px] block mt-1 font-mono ${SEMAPHORE[kpiProgressStatus].text}`}>Embarcado/total activos</span>
        </div>

        {/* Card 6: Pedidos vencidos abiertos */}
        <div className={`bg-slate-900 border p-4 rounded-lg flex flex-col justify-between shadow-md transition-colors ${SEMAPHORE[kpiRiskStatus].border} ${SEMAPHORE[kpiRiskStatus].bg}`}>
          <span className="text-[9px] font-bold font-mono text-slate-500 uppercase tracking-widest block">PEDIDOS VENCIDOS ABIERTOS</span>
          <div className={`mt-2 text-2xl font-black font-mono ${SEMAPHORE[kpiRiskStatus].text}`}>
            {activeMetric(kpiOrdersInRiskCount)}
          </div>
          <span className={`text-[10px] block mt-1 font-mono ${SEMAPHORE[kpiRiskStatus].text}`}>
            Abiertos fuera compromiso
          </span>
        </div>

        {/* Card 7: Porcentaje Defectivo */}
        <div className={`bg-slate-900 border p-4 rounded-lg flex flex-col justify-between shadow-md ${SEMAPHORE[kpiDefectStatus].border} ${SEMAPHORE[kpiDefectStatus].bg}`}>
          <span className="text-[9px] font-bold font-mono text-slate-500 uppercase tracking-widest block">Defectos Globales</span>
          <div className={`mt-2 text-xl font-black font-mono ${SEMAPHORE[kpiDefectStatus].text}`}>
            {kpiDefectivePct}%
          </div>
          <span className={`text-[10px] block mt-1 font-mono ${SEMAPHORE[kpiDefectStatus].text}`}>Meta máx 3% / σ {defectStdDev.toFixed(1)}</span>
        </div>

        {/* Card 8: Cumplimiento Meta */}
        <div className={`bg-slate-900 border p-4 rounded-lg flex flex-col justify-between shadow-md ${SEMAPHORE[kpiComplianceStatus].border} ${SEMAPHORE[kpiComplianceStatus].bg}`}>
          <span className="text-[9px] font-bold font-mono text-slate-500 uppercase tracking-widest block">EFICIENCIA META</span>
          <div className={`mt-2 text-xl font-black font-mono ${SEMAPHORE[kpiComplianceStatus].text}`}>
            {kpiMetaCompliance}%
          </div>
          <span className={`text-[10px] block mt-1 font-mono ${SEMAPHORE[kpiComplianceStatus].text}`}>Meta 100% / σ {complianceStdDev.toFixed(1)}</span>
        </div>
      </div>

      {/* 5. Second Section: Pipeline horizontal por etapa + Panel derecho de alertas */}
      <div className="order-1 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Pipeline Horizontal (WIP Flow) */}
        <div className={`${SHOW_ALERTS_TOWER ? 'lg:col-span-8' : 'lg:col-span-12'} flex flex-col justify-between bg-slate-900 border border-slate-800 p-5 rounded-lg shadow-xl`}>
          <div>
            <div className="flex justify-between items-center border-b border-slate-850 pb-2 mb-4">
              <h2 className="text-xs font-black font-mono tracking-widest text-slate-300 uppercase flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-cyan-400 animate-pulse" />
                Flujo del Pipeline de Producción (WIP Activo)
              </h2>
              <span className="text-[10px] font-mono text-slate-500 bg-slate-950 px-2.5 py-1 rounded">
                TOTAL WIP: {totalWIPPares.toLocaleString()} PARES
              </span>
            </div>

            {/* Stage Cards Layout */}
            <div className="flex gap-3 overflow-x-auto pb-2">
              {pipelineStages.map((st, sidx) => {
                const isCritical = st.saturation === 'CRITICO';
                const isSaturated = st.saturation === 'SATURADO';
                return (
                  <div 
                    key={st.id} 
                    className={`relative p-3 rounded-lg border flex flex-col justify-between bg-slate-950/60 min-w-[150px] ${
                      isCritical ? 'border-red-900/80 bg-red-950/10' :
                      isSaturated ? 'border-amber-900/60 bg-amber-955/10' :
                      'border-slate-850'
                    }`}
                  >
                    {/* Directional arrow between stages (except last) */}
                    {/* Stage Name */}
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-mono font-black text-slate-300 truncate tracking-tight">{st.name}</span>
                        {/* Semaphore light indicator */}
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          isCritical ? 'bg-red-500 animate-pulse shadow-glow shadow-red-500' :
                          isSaturated ? 'bg-amber-400' : 'bg-emerald-500'
                        }`} title={st.saturation} />
                      </div>
                      <span className="text-[8px] font-mono text-slate-550 block uppercase mt-0.5">Etapa {sidx + 1}</span>
                    </div>

                    {/* Metrics in stage */}
                    <div className="mt-3 space-y-1 bg-slate-900/50 p-1.5 rounded">
                      <div className="flex justify-between text-[11px] font-mono">
                        <span className="text-slate-500">Lotes:</span>
                        <span className="font-bold text-slate-200">{st.lotCount}</span>
                      </div>
                      <div className="flex justify-between text-[11px] font-mono">
                        <span className="text-slate-500">Pares:</span>
                        <span className="font-bold text-slate-200">{st.paresCount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-[11px] font-mono">
                        <span className="text-slate-500">Prom:</span>
                        <span className="font-bold text-indigo-400">{st.avgMins} min</span>
                      </div>
                    </div>

                    {/* Percentage WIP */}
                    <div className="mt-3 pt-1 border-t border-slate-900 text-[10px] font-mono font-black flex justify-between text-slate-500">
                      <span>WIP %</span>
                      <span className="text-pink-400">{st.wipPct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 p-2 bg-slate-950 border border-slate-850 rounded text-[10px] text-slate-400 font-mono leading-relaxed">
            <span className="font-bold text-cyan-400">INFO DE CUELLOS DE BOTELLA:</span> Los procesos con demora acumulada de más de 1,500 minutos, representados en color <span className="text-red-400 font-bold">Rojo</span>, corresponden principalmente a las fases de <strong className="text-purple-400">Banda (Trimado/Detallado)</strong> y <strong className="text-purple-400">Estabilización</strong> por enfriamiento molecular natural de la resina EVA inyectada.
          </div>
        </div>

        {/* Panel derecho de alertas operativas (desactivado via SHOW_ALERTS_TOWER) */}
        {SHOW_ALERTS_TOWER && (
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 p-5 rounded-lg shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center border-b border-slate-850 pb-2 mb-3">
              <h2 className="text-xs font-black font-mono tracking-widest text-pink-400 uppercase flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-pink-400" />
                Torre de Alertas Críticas (Control de Desviación)
              </h2>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 bg-red-950/40 text-red-400 border border-red-900/50 rounded">
                {generatedAlerts.length} ACTIVAS
              </span>
            </div>

            <div className="space-y-2 mt-1 max-h-80 overflow-y-auto pr-1">
              {generatedAlerts.map((alt) => {
                const isCrit = alt.level === 'crítico';
                return (
                  <div 
                    key={alt.id} 
                    className={`p-2.5 rounded border text-xs flex flex-col justify-between space-y-1 transition duration-150 bg-slate-950/40 ${
                      isCrit ? 'border-l-4 border-l-red-500 border-slate-800/80 bg-red-950/10' : 'border-l-4 border-l-amber-500 border-slate-800/80'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <span className={`text-[10px] font-black font-mono uppercase ${isCrit ? 'text-red-400' : 'text-amber-400'}`}>
                        {alt.title}
                      </span>
                      <span className="text-[9px] font-mono text-slate-500 bg-slate-900 px-1 py-0.5 rounded">
                        {alt.time}
                      </span>
                    </div>
                    <p className="text-slate-300 text-[11px] leading-tight leading-normal">
                      {alt.desc}
                    </p>
                    <div className="flex justify-between items-center text-[10px] font-mono text-slate-450 mt-1 border-t border-slate-950 pt-1">
                      <span>Ref:</span>
                      <span className="text-cyan-400 font-bold">{alt.target}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-slate-850 flex items-center justify-between text-[11px] text-slate-500">
            <span className="font-mono">Log de Auditoría de Sistemas</span>
            <span className="text-slate-400 font-bold underline cursor-pointer">Revisar Log Completo &rarr;</span>
          </div>
        </div>
        )}

      </div>

      {/* 4. Gráficas */}
      <div className="order-0 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        
        {/* Chart 1: Producción por hora */}
        <div className="md:col-span-2 xl:col-span-3 bg-slate-900 border border-slate-800 p-4 rounded-lg flex flex-col justify-between shadow-lg min-h-[390px]">
          <div>
            <h4 className="text-[10px] font-black font-mono text-cyan-400 uppercase tracking-widest border-b border-slate-850 pb-1.5 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5" />
              PRODUCCIÓN HORARIA
            </h4>
            <p className="text-[9px] text-slate-500 font-sans mt-1">
              Real vs meta por hora del día, agregado en el rango {fechaInicio} → {fechaFin}
              {prodDatesInRange.length > 0 && (
                <span className="text-slate-600"> · {prodDatesInRange.length} día{prodDatesInRange.length > 1 ? 's' : ''} con escaneos ({prodDatesInRange[0]}{prodDatesInRange.length > 1 ? ` … ${prodDatesInRange[prodDatesInRange.length - 1]}` : ''})</span>
              )}
              . Verde meta, amarillo bajo 1σ, rojo bajo 1σ+
            </p>
          </div>
          {!hasHourlyData ? (
            <div className="h-[270px] mt-4 flex flex-col items-center justify-center text-center gap-1">
              <Activity className="w-6 h-6 text-slate-700" />
              <p className="text-[11px] font-mono text-slate-500">Sin escaneos de producción en el rango seleccionado.</p>
              <p className="text-[9px] font-sans text-slate-600">Ajusta las fechas: ultimo escaneo FDB {erpData?.meta.dataMaxDate ?? '--'}.</p>
            </div>
          ) : (
          <div className="overflow-x-auto mt-4">
          <div className="h-[270px] min-w-[480px] flex items-end justify-between gap-1 pt-5">
            {finalHourlyData.map((d, i) => {
              const maxVal = Math.max(...finalHourlyData.map(item => Math.max(item.value, item.target)), 1);
              const pct = (d.value / maxVal) * 100;
              const targetPct = d.target > 0 ? (d.target / maxVal) * 100 : 0;
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative" title={`${d.value} pares / meta ${d.target}`}>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 bg-slate-950 border border-slate-800 text-[8px] font-mono p-1 rounded opacity-0 group-hover:opacity-100 transition duration-150 z-20 pointer-events-none text-cyan-400 whitespace-nowrap">
                    {d.value.toLocaleString()} / {d.target.toLocaleString()} prs
                  </div>
                  <div className="w-full h-full flex items-end relative">
                    {d.target > 0 && (
                      <span
                        className="absolute left-0 right-0 border-t border-dashed border-slate-500/80"
                        style={{ bottom: `${targetPct}%` }}
                      />
                    )}
                    <div
                      className="w-full rounded-t-sm hover:shadow-md transition-all duration-300"
                      style={{ height: `${Math.max(pct, d.value > 0 ? 3 : 1)}%`, backgroundColor: d.target > 0 ? d.color : '#cbd5e1' }}
                    />
                  </div>
                  <span className="text-[8px] font-mono text-slate-550 mt-1">{d.label.split(':')[0]}h</span>
                </div>
              );
            })}
          </div>
          </div>
          )}
        </div>

        {/* Chart 2: Pares por etapa */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg flex flex-col justify-between shadow-lg min-h-[338px]">
          <div>
            <h4 className="text-[10px] font-black font-mono text-cyan-400 uppercase tracking-widest border-b border-slate-850 pb-1.5 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" />
              PARES POR ETAPA
            </h4>
            <p className="text-[9px] text-slate-500 font-sans mt-1">Color por saturación de WIP y tiempo en etapa</p>
          </div>
          <div className="h-[208px] mt-4 flex items-end justify-between gap-1.5 pt-5">
            {stageParesChartData.map((d, i) => {
              const maxVal = Math.max(...stageParesChartData.map(item => item.value), 1);
              const pct = (d.value / maxVal) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative" title={`${d.value} pares`}>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 bg-slate-950 border border-slate-800 text-[8px] font-mono p-1 rounded opacity-0 group-hover:opacity-100 transition duration-150 z-20 pointer-events-none text-indigo-400 whitespace-nowrap">
                    {d.value.toLocaleString()} prs
                  </div>
                  <div 
                    className="w-full rounded-t-sm transition-all duration-300" 
                    style={{ height: `${pct}%`, backgroundColor: d.color }} 
                  />
                  <span className="text-[8px] font-mono text-slate-550 mt-1 truncate w-full text-center">{d.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart 3: Top 5 modelos */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg flex flex-col justify-between shadow-lg min-h-[338px]">
          <div>
            <h4 className="text-[10px] font-black font-mono text-cyan-400 uppercase tracking-widest border-b border-slate-850 pb-1.5 flex items-center gap-1">
              <Briefcase className="w-3.5 h-3.5" />
              TOP 5 MODELOS
            </h4>
            <p className="text-[9px] text-slate-500 font-sans mt-1">Volumen total de pares solicitados</p>
          </div>
          <div className="space-y-3 mt-3 grow flex flex-col justify-center">
            {top5ModelsData.map((item, id) => {
              const totalSum = top5ModelsData.reduce((acc, current) => acc + current.value, 0);
              const pct = totalSum > 0 ? (item.value / totalSum) * 100 : 0;
              return (
                <div key={id} className="text-[10px] font-mono space-y-0.5">
                  <div className="flex justify-between text-slate-350">
                    <span className="truncate pr-1 block max-w-[170px]">{item.label}</span>
                    <span className="font-bold">{item.value.toLocaleString()} prs</span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart 4: Defectos (Pareto) */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg flex flex-col justify-between shadow-lg min-h-[338px]">
          <div>
            <h4 className="text-[10px] font-black font-mono text-pink-400 uppercase tracking-widest border-b border-slate-850 pb-1.5 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              PARETO DEFECTOS (TOP 5)
            </h4>
            <p className="text-[9px] text-slate-500 font-sans mt-1">Defectos de soplado e inyección</p>
          </div>
          <div className="space-y-3 mt-3 grow flex flex-col justify-center">
            {paretoDefectData.length > 0 ? (
              paretoDefectData.map((item, id) => {
                const totalSum = paretoDefectData.reduce((acc, current) => acc + current.value, 0);
                const pct = totalSum > 0 ? (item.value / totalSum) * 100 : 0;
                return (
                  <div key={id} className="text-[10px] font-mono space-y-0.5">
                    <div className="flex justify-between text-slate-350">
                      <span className="truncate pr-1 block max-w-[170px] text-red-400">{item.label}</span>
                      <span className="font-bold">{item.value.toLocaleString()} fll</span>
                    </div>
                    <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-pink-500 h-full rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-[10px] font-mono text-slate-550 text-center">Cero fallas detectadas</p>
            )}
          </div>
        </div>

        {/* Chart 5: Pedidos por estatus */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg flex flex-col justify-between shadow-lg min-h-[338px]">
          <div>
            <h4 className="text-[10px] font-black font-mono text-cyan-400 uppercase tracking-widest border-b border-slate-850 pb-1.5 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5" />
              STATUS PEDIDOS
            </h4>
            <p className="text-[9px] text-slate-500 font-sans mt-1">Distribución de pedidos activos</p>
          </div>
          <div className="space-y-3 mt-3 grow flex flex-col justify-center">
            {orderStatusData.map((os, i) => {
              const totalSum = orderStatusData.reduce((acc, cur) => acc + cur.value, 0);
              const pct = totalSum > 0 ? (os.value / totalSum) * 100 : 0;
              return (
                <div key={i} className="flex items-center justify-between text-[11px] font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: os.color }} />
                    <span className="text-slate-400">{os.label}</span>
                  </div>
                  <span className="font-bold text-slate-200">{os.value} ped ({Math.round(pct)}%)</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart 6: Estados de producción */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg flex flex-col justify-between shadow-lg min-h-[338px]">
          <div>
            <h4 className="text-[10px] font-black font-mono text-cyan-400 uppercase tracking-widest border-b border-slate-850 pb-1.5 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              STATUS LOTES
            </h4>
            <p className="text-[9px] text-slate-500 font-sans mt-1">Lotes activos por status operativo</p>
          </div>
          <div className="space-y-3 mt-4 grow flex flex-col justify-center">
            {productionStatusData.map((item) => {
              const total = productionStatusData.reduce((sum, current) => sum + current.value, 0);
              const pct = total > 0 ? (item.value / total) * 100 : 0;
              return (
                <div key={item.label} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="flex items-center gap-2 text-slate-400">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      {item.label}
                    </span>
                    <span className="font-bold text-slate-200">{item.value} lotes</span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: item.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart 7: Cumplimiento por turno */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg flex flex-col justify-between shadow-lg min-h-[338px]">
          <div>
            <h4 className="text-[10px] font-black font-mono text-cyan-400 uppercase tracking-widest border-b border-slate-850 pb-1.5 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              CUMPLIMIENTO POR TURNO
            </h4>
            <p className="text-[9px] text-slate-500 font-sans mt-1">Real contra meta, clasificado con desviación estándar</p>
          </div>
          <div className="h-[208px] mt-4 flex items-end justify-between gap-4 pt-5">
            {shiftComplianceData.map((d) => {
              const pct = Math.min(d.value, 120);
              return (
                <div key={d.label} className="flex-1 h-full flex flex-col justify-end items-center group relative">
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 bg-slate-950 border border-slate-800 text-[8px] font-mono p-1 rounded opacity-0 group-hover:opacity-100 transition z-20 pointer-events-none text-cyan-400 whitespace-nowrap">
                    {d.real.toLocaleString()} / {d.target.toLocaleString()} prs
                  </div>
                  <div className="w-full rounded-t-sm transition" style={{ height: `${pct / 1.2}%`, backgroundColor: d.color }} />
                  <span className="text-[9px] font-mono text-slate-550 mt-2">{d.label}</span>
                  <span className="text-[10px] font-mono font-bold" style={{ color: d.color }}>{d.value}%</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart 8: Calidad por área */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg flex flex-col justify-between shadow-lg min-h-[338px]">
          <div>
            <h4 className="text-[10px] font-black font-mono text-cyan-400 uppercase tracking-widest border-b border-slate-850 pb-1.5 flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              DEFECTIVO POR ÁREA
            </h4>
            <p className="text-[9px] text-slate-500 font-sans mt-1">Meta máxima 3%, amarillo hasta 1σ, rojo arriba</p>
          </div>
          <div className="space-y-5 mt-4 grow flex flex-col justify-center">
            {qualityAreaData.map((d) => (
              <div key={d.label} className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-400">{d.label}</span>
                  <span className="font-bold" style={{ color: d.color }}>{d.value}%</span>
                </div>
                <div className="w-full bg-slate-950 rounded-full h-3 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(d.value * 18, 100)}%`, backgroundColor: d.color }} />
                </div>
                <div className="text-[9px] font-mono text-slate-550 flex justify-between">
                  <span>{d.defectsCount.toLocaleString()} defectivos</span>
                  <span>{d.inspected.toLocaleString()} inspeccionados</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* 6. Tabla Inferior: Pedidos en Riesgo */}
      <div className="order-2 bg-slate-900 border border-slate-800 rounded-lg p-5 shadow-xl space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-center border-b border-slate-850 pb-2">
          <div>
            <h3 className="text-xs font-black tracking-widest font-mono text-cyan-400 uppercase flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-cyan-400" />
              TOP PEDIDOS ACTIVOS CON MAYOR RIESGO
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {temporalFiltersApplied
                ? 'Rango histórico: incluye pedidos cerrados y muestra el riesgo guardado al cierre.'
                : 'Consulta diaria: solo pedidos abiertos al día actual.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-mono text-slate-400 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded">
              {displayedRiskOrders.length}/{riskOrders.length} · VISTA {riskOrderLimitLabel}
            </span>
            {canExpandRiskOrders && (
              <button
                onClick={handleShowMoreRiskOrders}
                className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded text-[10px] font-mono font-black uppercase tracking-wider transition-colors"
              >
                {riskOrderLimit === 'ALL' ? 'Ver menos' : 'Ver más'}
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-950 rounded">
          <table className="w-full text-left text-xs text-slate-400 border-collapse">
            <thead className="bg-slate-950 text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="p-3 border-b border-slate-900">IDENTIFICADOR</th>
                <th className="p-3 border-b border-slate-900">CLIENTE / OC</th>
                <th className="p-3 border-b border-slate-900">MODELO / COLOR</th>
                <th className="p-3 border-b border-slate-900 text-right">TOTAL PARES</th>
                <th className="p-3 border-b border-slate-900 text-center">AVANCE</th>
                <th className="p-3 border-b border-slate-900">COMPROMISO</th>
                <th className="p-3 border-b border-slate-900 text-right">DÍAS RESTANTES</th>
                <th className="p-3 border-b border-slate-900">ETAPA DOMINANTE</th>
                <th className="p-3 border-b border-slate-900 text-right">SEMAFORIZACIÓN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-950">
              {displayedRiskOrders.map((o) => {
                const isPassed = o.daysLeft <= 0;
                const isUrgent = o.daysLeft > 0 && o.daysLeft <= 5;

                return (
                  <tr key={o.id} className="hover:bg-slate-850/40 transition-colors">
                    <td className="p-3">
                      <span className="text-cyan-400 font-mono font-black">{o.id}</span>
                      <span className="block text-[9px] text-slate-550 font-mono">
                        {o.isClosed ? `CERRADO · ${o.status || o.estatus}` : 'ABIERTO'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="text-slate-200 block text-[12px] font-bold">{o.clientName || o.cliente}</span>
                      <span className="text-[10px] text-slate-500 font-mono">OC: {o.oc}</span>
                    </td>
                    <td className="p-3">
                      <span className="text-slate-350 block capitalize font-medium">{o.modelName}</span>
                      <span className="text-[10px] text-slate-650 font-mono">{o.color}</span>
                    </td>
                    <td className="p-3 text-right font-mono text-slate-200">
                      {o.quantity.toLocaleString()}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col items-center justify-center max-w-[100px] mx-auto">
                        <span className="text-[10px] font-mono font-bold text-slate-300">{o.porcentajeAvance}%</span>
                        <div className="w-full bg-slate-950 rounded-full h-1 mt-1 overflow-hidden">
                          <div className="bg-cyan-400 h-full" style={{ width: `${o.porcentajeAvance}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="p-3 font-mono text-[11px] text-slate-400">
                      {new Date(o.fechaCompromiso || '').toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="p-3 text-right font-mono font-black">
                      {isPassed ? (
                        <span className="text-red-400">DEMORADO ({-o.daysLeft} d)</span>
                      ) : isUrgent ? (
                        <span className="text-amber-400">CRÍTICO ({o.daysLeft} d)</span>
                      ) : (
                        <span className="text-slate-450">{o.daysLeft} días</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="text-[11px] font-mono text-indigo-400 font-medium">{o.dominantStage}</span>
                    </td>
                    <td className="p-3 text-right">
                      {o.displayRisk === 'VENCIDO' ? (
                        <span className="text-[10px] px-2 py-0.5 bg-red-950/60 text-red-400 border border-red-900 rounded inline-block font-mono font-bold uppercase">
                          VENCIDO
                        </span>
                      ) : o.displayRisk === 'ALTO' ? (
                        <span className="text-[10px] px-2 py-0.5 bg-amber-950/60 text-amber-400 border border-amber-900 rounded inline-block font-mono font-bold uppercase">
                          ALTO RIESGO
                        </span>
                      ) : o.displayRisk === 'MEDIO' ? (
                        <span className="text-[10px] px-2 py-0.5 bg-indigo-950/60 text-indigo-400 border border-indigo-900 rounded inline-block font-mono font-bold uppercase">
                          MEDIO
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 bg-green-950/60 text-green-400 border border-green-900 rounded inline-block font-mono font-bold uppercase">
                          BAJO RIESGO
                        </span>
                      )}
                      {o.isClosed && (
                        <span className="block mt-1 text-[9px] text-slate-500 font-mono uppercase">
                          cierre: {o.savedCloseRisk}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {displayedRiskOrders.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-[11px] text-slate-500 font-mono uppercase">
                    Sin pedidos con esos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

/* 2. Pipeline por Lote View */
export const PipelineLoteView: React.FC = () => {
  const { 
    batches, 
    orders,
    defects,
    addDefect,
    currentTenant, 
    currentUser,
    moveBatchStage, 
    updateBatchStatus,
    softDeleteBatch,
    addBatch,
    addAuditLog
  } = useDashboard();

  // Lotes desde el universo completo del FDB (endpoint operativo server-side),
  // no del bootstrap limitado. Fuente unica que coincide con Pipeline por Pedido.
  const [operationalData, setOperationalData] = useState<ErpOperationalResponse | null>(null);
  useEffect(() => {
    if (!backendEnabled) return;
    let cancelled = false;
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    dashboardApi.erpOperativo(start, end)
      .then(data => { if (!cancelled) setOperationalData(data); })
      .catch(err => console.warn('Pipeline por lote: ERP operativo fetch failed', err));
    return () => { cancelled = true; };
  }, []);
  const loteBatches = operationalData?.lotePipeline ?? [];

  // Selected batch for details panel
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTvModalOpen, setIsTvModalOpen] = useState(false);
  const [isEditFechaOpen, setIsEditFechaOpen] = useState(false);
  const [isReportDefectOpen, setIsReportDefectOpen] = useState(false);

  // Filter states
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroOC, setFiltroOC] = useState('');
  const [filtroLote, setFiltroLote] = useState('');
  const [filtroModelo, setFiltroModelo] = useState('');
  const [filtroColor, setFiltroColor] = useState('');
  const [filtroEtapa, setFiltroEtapa] = useState('');
  const [filtroEstatus, setFiltroEstatus] = useState('');
  const [filtroFechaCompromiso, setFiltroFechaCompromiso] = useState('');
  const [filtroResponsable, setFiltroResponsable] = useState('');
  const [filtroCodigoBarras, setFiltroCodigoBarras] = useState('');
  const [scannedLots, setScannedLots] = useState<Record<string, boolean>>({});

  // Local override states
  const [rescheduledDates, setRescheduledDates] = useState<Record<string, string>>({});
  const [batchObservations, setBatchObservations] = useState<Record<string, string>>({});
  const [editFechaTemp, setEditFechaTemp] = useState('');
  const [obsTemp, setObsTemp] = useState('');

  // Defect form state
  const [defectType, setDefectType] = useState<'BURBUJA' | 'RECHUPE' | 'DEFORMACION' | 'MANCHA' | 'POROSIDAD' | 'FALTA_LLENADO'>('BURBUJA');
  const [defectSeverity, setDefectSeverity] = useState<'LEVE' | 'MODERADO' | 'GRAVE'>('LEVE');
  const [defectNotes, setDefectNotes] = useState('');
  const [defectInspector, setDefectInspector] = useState('Insp. Guardia Matutina');

  // Form states to create new Batch
  const [newBatchId, setNewBatchId] = useState('');
  const [newModelId, setNewModelId] = useState('');
  const [newColor, setNewColor] = useState('');
  const [newSize, setNewSize] = useState(0);
  const [newQuantity, setNewQuantity] = useState(0);
  const [newOperator, setNewOperator] = useState('');
  const [newOrderId, setNewOrderId] = useState('');

  const tenantBatches = loteBatches.filter(
    b => b.tenantId === currentTenant.id && !isArchivedBatch(b)
  );
  const loteStages = STAGES.filter(stage => stage.id !== 'estabilizacion');
  const normalizeLoteStage = (stage: StageId) => stage === 'estabilizacion' ? 'aduana' : stage;
  const getLoteStageName = (stage: StageId) => loteStages.find(s => s.id === normalizeLoteStage(stage))?.name || stage.replace('_', ' ');
  const getPreviousLoteStageName = (stage: StageId) => {
    const currentIdx = loteStages.findIndex(s => s.id === normalizeLoteStage(stage));
    return currentIdx > 0 ? loteStages[currentIdx - 1].name : 'Sin zona previa';
  };

  // Clear filters handler
  const handleLimpiarFiltros = () => {
    setFiltroCliente('');
    setFiltroOC('');
    setFiltroLote('');
    setFiltroModelo('');
    setFiltroColor('');
    setFiltroEtapa('');
    setFiltroEstatus('');
    setFiltroFechaCompromiso('');
    setFiltroResponsable('');
    setFiltroCodigoBarras('');
  };

  // Safe progress percentage per stage helper
  const getStageProgress = (stage: string) => {
    switch (stage) {
      case 'alta_pedido': return 5;
      case 'almacen': return 10;
      case 'inyeccion': return 30;
      case 'aduana': return 60;
      case 'banda': return 80;
      case 'embarque': return 100;
      default: return 0;
    }
  };

  // Safe stage time format helper
  const formatEtapaTime = (min: number | undefined) => {
    const totalMin = min || 0;
    if (!totalMin) {
      return "00:00";
    }
    const hours = Math.floor(totalMin / 60);
    const minutes = Math.floor(totalMin % 60);
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  };

  // Handle register a batch from ERP/OCR data
  const handleCreateBatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBatchId) return;

    const linkedOrder = orders.find(o => o.id === newOrderId);
    const modelName = newModelId || 'Pendiente OCR';

    addBatch({
      id: newBatchId,
      idLote: newBatchId,
      tarjetaViajera: `TV-${newBatchId}`,
      codigoBarras: newBatchId,
      modelId: newModelId,
      modelName,
      modelo: modelName,
      color: newColor || 'Pendiente OCR',
      size: newSize,
      quantityShoes: newQuantity,
      totalPares: newQuantity,
      paresEnEtapa: newQuantity,
      stage: 'alta_pedido',
      etapaActual: 'alta_pedido',
      operatorId: newOperator || 'S/Responsable',
      responsableActual: newOperator || 'S/Responsable',
      status: 'OPTIMO',
      fechaAlta: new Date().toISOString(),
      fechaCompromiso: linkedOrder?.deliveryDate || linkedOrder?.fechaCompromiso,
      orderId: linkedOrder?.id || ''
    });

    setIsModalOpen(false);
    setNewBatchId('');
    setNewOperator('');
  };

  const handleScannerInput = (value: string) => {
    setFiltroCodigoBarras(value);
    const scannedValue = value.trim();
    if (!scannedValue) return;

    const matchedBatch = tenantBatches.find(b =>
      b.codigoBarras === scannedValue ||
      b.tarjetaViajera === scannedValue ||
      b.id === scannedValue
    );
    if (!matchedBatch || scannedLots[matchedBatch.id]) return;

    const currentIdx = loteStages.findIndex(s => s.id === normalizeLoteStage(getBatchStageId(matchedBatch)));
    const nextStage = loteStages[currentIdx + 1]?.id;
    setSelectedBatchId(matchedBatch.id);
    setScannedLots(prev => ({ ...prev, [matchedBatch.id]: true }));
    if (nextStage) {
      moveBatchStage(matchedBatch.id, nextStage);
      addAuditLog('PRODUCCION', 'SCAN_AUTO_ADVANCE', `Escaneo ${scannedValue} avanzó lote ${matchedBatch.id} a ${nextStage}`);
    }
  };

  // Unique lists from data for filter dropdowns
  const uniqueClientes = Array.from(new Set(tenantBatches.map(b => b.cliente || ''))).filter(Boolean);
  const uniqueModels = Array.from(new Set(tenantBatches.map(b => b.modelo || b.modelName || ''))).filter(Boolean);
  const uniqueColors = Array.from(new Set(tenantBatches.map(b => b.color || ''))).filter(Boolean);

  // Filtering Logic
  const filteredBatches = tenantBatches.filter(b => {
    const relOrder = orders.find(o => o.id === b.orderId);
    const ocVal = b.oc || relOrder?.oc || '';
    const clientVal = b.cliente || relOrder?.clientName || '';
    const modelVal = b.modelo || b.modelName || '';
    const opVal = b.responsableActual || b.operatorId || '';
    const barcodeVal = b.codigoBarras || '';
    const currentStatus = b.status || 'OPTIMO';

    // Apply Overrides 
    const currentFechaCompromiso = rescheduledDates[b.id] || b.fechaCompromiso || relOrder?.deliveryDate || '';

    if (filtroCliente && !clientVal.toLowerCase().includes(filtroCliente.toLowerCase())) return false;
    if (filtroOC && !ocVal.toLowerCase().includes(filtroOC.toLowerCase())) return false;
    if (filtroLote && !b.id.toLowerCase().includes(filtroLote.toLowerCase())) return false;
    if (filtroModelo && modelVal !== filtroModelo) return false;
    if (filtroColor && b.color !== filtroColor) return false;
    if (filtroEtapa && normalizeLoteStage(getBatchStageId(b)) !== filtroEtapa) return false;

    // Estatus filter: En tiempo, Alerta, Crítico, Detenido, Embarcado
    if (filtroEstatus) {
      if (filtroEstatus === 'En tiempo' && (currentStatus !== 'OPTIMO' || isDeliveredBatch(b))) return false;
      if (filtroEstatus === 'Alerta' && currentStatus !== 'ALERTA') return false;
      if (filtroEstatus === 'Crítico' && currentStatus !== 'CRITICO') return false;
      if (filtroEstatus === 'Detenido' && currentStatus !== 'DETENIDO') return false;
      if (filtroEstatus === 'Entregado' && !isDeliveredBatch(b)) return false;
    }

    if (filtroFechaCompromiso && !currentFechaCompromiso.includes(filtroFechaCompromiso)) return false;
    if (filtroResponsable && !opVal.toLowerCase().includes(filtroResponsable.toLowerCase())) return false;
    if (filtroCodigoBarras && !barcodeVal.includes(filtroCodigoBarras)) return false;

    return true;
  });

  // KPI Calculations responsive to filters
  const lotesActivos = filteredBatches.filter(b => !isDeliveredBatch(b)).length;
  const paresActivos = filteredBatches.filter(b => !isDeliveredBatch(b)).reduce((acc, b) => acc + getBatchPairs(b), 0);
  const baseDateAnchor = dateOnlyTime(new Date().toISOString()) ?? Date.now();
  const lotesVencidos = filteredBatches.filter(b => {
    return isPastDueDateOnly(b.fechaCompromiso, baseDateAnchor) && !isDeliveredBatch(b);
  }).length;
  const paresVencidos = filteredBatches
    .filter(b => {
      return isPastDueDateOnly(b.fechaCompromiso, baseDateAnchor) && !isDeliveredBatch(b);
    })
    .reduce((acc, b) => acc + (b.totalPares || b.quantityShoes || 0), 0);
  const todayIso = new Date().toISOString().slice(0, 10);
  const lotesEmbarcadosHoy = filteredBatches.filter(b => isDeliveredBatch(b) && (b.lastUpdate || b.ultimoEscaneo || '').startsWith(todayIso)).length;

  // Bottleneck Stage calculation
  const stageStatsMap = loteStages.filter(s => s.id !== 'embarque').map(st => {
    const stBatches = filteredBatches.filter(b => normalizeLoteStage(getBatchStageId(b)) === st.id);
    const avgDuration = stBatches.length > 0
      ? stBatches.reduce((acc, b) => acc + (b.tiempoEnEtapaMinutos || 0), 0) / stBatches.length
      : 0;
    return { id: st.id, name: st.name, avgDuration, count: stBatches.length, score: avgDuration + (stBatches.length * 180) };
  });
  const maxStageDuration = stageStatsMap.reduce((max, cur) => cur.score > max.score ? cur : max, { id: '', name: 'Ninguno', avgDuration: 0, count: 0, score: 0 });
  const bottleneckActual = maxStageDuration.score > 0 ? maxStageDuration.name : 'Ninguno';

  // Automatically select first filtered batch as default
  const defaultSelectedBatch = filteredBatches[0] || null;
  const selectedBatch = filteredBatches.find(b => b.id === selectedBatchId) || defaultSelectedBatch;

  // Set initial dates/observations when selected batch shifts
  useEffect(() => {
    if (selectedBatch) {
      setEditFechaTemp(rescheduledDates[selectedBatch.id] || selectedBatch.fechaCompromiso?.split('T')[0] || '');
      setObsTemp(batchObservations[selectedBatch.id] || selectedBatch.observaciones || 'No hay notas del operador.');
    }
  }, [selectedBatch]);

  // Handle commitment date edit
  const handleUpdateFechaCompromiso = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatch) return;

    setRescheduledDates(prev => ({
      ...prev,
      [selectedBatch.id]: editFechaTemp
    }));

    addAuditLog(
      'PRODUCCION',
      'BATCH_RESCHEDULED',
      `Fecha de compromiso para Lote ${selectedBatch.id} reprogramada a ${editFechaTemp}`
    );

    setIsEditFechaOpen(false);
  };

  // Handle observations saving
  const handleSaveObservations = () => {
    if (!selectedBatch) return;

    setBatchObservations(prev => ({
      ...prev,
      [selectedBatch.id]: obsTemp
    }));

    addAuditLog(
      'PRODUCCION',
      'BATCH_OBSERVATIONS_UPDATED',
      `Observaciones actualizadas para Lote ${selectedBatch.id}: ${obsTemp.substring(0, 30)}...`
    );
  };

  // Handle stage move buttons directly from the cards
  const handleMoveStageStep = (batchId: string, direction: 'PREV' | 'NEXT') => {
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return;

    const currentIdx = loteStages.findIndex(s => s.id === normalizeLoteStage(batch.stage));
    let targetStageIdx = currentIdx;

    if (direction === 'NEXT' && currentIdx < loteStages.length - 1) {
      targetStageIdx += 1;
    } else if (direction === 'PREV' && currentIdx > 0) {
      targetStageIdx -= 1;
    }

    if (targetStageIdx !== currentIdx) {
      const nextStageId = loteStages[targetStageIdx].id;
      moveBatchStage(batchId, nextStageId);
    }
  };

  // Defect register action under context
  const handleRegisterDefect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatch) return;

    addDefect({
      batchId: selectedBatch.id,
      defectType: defectType,
      severity: defectSeverity,
      inspectorName: defectInspector,
      notes: defectNotes || 'Reporte manual desde panel ejecutivo Pipeline.',
      resolved: false
    });

    setIsReportDefectOpen(false);
    setDefectNotes('');
  };

  const selectedBatchModelDetails = selectedBatch as (Batch & {
    expansionFactor?: number;
    recommendedPrep?: string;
    paintType?: string;
  }) | null;

  // TV label print trigger
  const handlePrintLabelTV = () => {
    addAuditLog(
      'PRODUCCION',
      'PRINT_BATCH_TRAVEL_CARD',
      `Generado e impreso de Tarjeta Viajera PDF para Lote ${selectedBatch?.id} con código QR integrado.`
    );
    alert(`🖨️ Señal de Impresión Enviada: Generando documento de control industrial de alta densidad con QR e ID folio: ${selectedBatch?.tarjetaViajera || 'N/A'}`);
  };

  // Saturation indicator calculator helper
  const getStageSaturation = (pairs: number, count: number) => {
    if (pairs > 12000 || count >= 5) return { text: 'Crítico', bg: 'bg-red-900/60 border-red-800 text-red-400' };
    if (pairs > 6500 || count >= 3) return { text: 'Saturado', bg: 'bg-amber-900/60 border-amber-800 text-amber-500' };
    return { text: 'Óptimo', bg: 'bg-emerald-900/60 border-emerald-800 text-emerald-400' };
  };

  return (
    <div className="space-y-6">

      {/* HEADER SECTION */}
      <div className="flex justify-between items-center bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-xl flex-wrap gap-4">
        <div>
          <span className="text-[10px] font-mono text-cyan-500 uppercase tracking-widest font-black block mb-1">
            MÓDULO DE SEGUIMIENTO INDUSTRIAL
          </span>
          <h2 className="text-xl font-bold font-sans text-slate-100 uppercase tracking-tight leading-none mb-1.5 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 animate-pulse inline-block"></span>
            Pipeline de Lotes en Tiempo Real
          </h2>
          <p className="text-xs text-slate-400">
            Localización de lotes de inyección de EVA, tiempos de permanencia, saturación de estaciones de trabajo y embarque.
          </p>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-lg text-xs text-slate-950 font-bold shadow-lg shadow-cyan-900/35 cursor-pointer transform active:scale-95 transition"
          >
            <PlusCircle className="w-4 h-4" />
            Lanzar Nuevo Lote EVA
          </button>
        </div>
      </div>

      {/* FILTROS SUPERIORES BANNER */}
      <div className="bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center gap-1.5 border-b border-slate-900 pb-3">
          <Filter className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider">
            Consola de Filtrado Avanzado y Código de Barras
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {/* Barcode Search */}
          <div className="space-y-1 col-span-1 sm:col-span-2">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-400 block">
              Escanear / Buscar Código de Barras
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <Search className="w-4 h-4 text-slate-500" />
              </span>
              <input 
                type="text"
                placeholder="Escribe o escanea código (Ej: 7500123...)"
                value={filtroCodigoBarras}
                onChange={(e) => handleScannerInput(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Cliente */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-400 block">
              Cliente
            </label>
            <select
              value={filtroCliente}
              onChange={(e) => setFiltroCliente(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="">-- Todos --</option>
              {uniqueClientes.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* OC */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-400 block">
              Orden de Compra (OC)
            </label>
            <input 
              type="text"
              placeholder="Ej: OC-9031"
              value={filtroOC}
              onChange={(e) => setFiltroOC(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          {/* Lote */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-400 block">
              Lote Folio
            </label>
            <input 
              type="text"
              placeholder="Ej: LOTE-26-401"
              value={filtroLote}
              onChange={(e) => setFiltroLote(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          {/* Modelo */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-400 block">
              Modelo
            </label>
            <select
              value={filtroModelo}
              onChange={(e) => setFiltroModelo(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 shadow-inner"
            >
              <option value="">-- Todos --</option>
              {uniqueModels.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Color */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-400 block">
              Color
            </label>
            <select
              value={filtroColor}
              onChange={(e) => setFiltroColor(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="">-- Todos --</option>
              {uniqueColors.map(col => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
          </div>

          {/* Etapa actual */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-400 block">
              Etapa Actual
            </label>
            <select
              value={filtroEtapa}
              onChange={(e) => setFiltroEtapa(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todas --</option>
              {loteStages.map(st => (
                <option key={st.id} value={st.id}>{st.name}</option>
              ))}
            </select>
          </div>

          {/* Estatus */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-400 block">
              Estatus Semáforo
            </label>
            <select
              value={filtroEstatus}
              onChange={(e) => setFiltroEstatus(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todos --</option>
              <option value="En tiempo">🟢 En tiempo</option>
              <option value="Alerta">🟡 Alerta</option>
              <option value="Crítico">🔴 Crítico</option>
              <option value="Detenido">⚪ Detenido</option>
              <option value="Entregado">🟢 Entregado</option>
            </select>
          </div>

          {/* Fecha compromiso */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-400 block">
              Fecha Compromiso
            </label>
            <input 
              type="date"
              value={filtroFechaCompromiso}
              onChange={(e) => setFiltroFechaCompromiso(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1 text-xs text-slate-200 focus:outline-none font-mono"
            />
          </div>

          {/* Responsable */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-400 block">
              Operador Responsable
            </label>
            <input 
              type="text"
              placeholder="Buscar responsable..."
              value={filtroResponsable}
              onChange={(e) => setFiltroResponsable(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={handleLimpiarFiltros}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-white rounded-lg text-xs font-mono transition border border-slate-800 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Limpiar Filtros
          </button>
        </div>
      </div>

      {/* KPI CARDS SUPERIORES */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
        <div className="p-4 bg-slate-950/80 border border-slate-900/60 rounded-xl space-y-1.5 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest block">
            Lotes Activos
          </span>
          <div className="text-2xl font-black font-mono text-cyan-400">
            {lotesActivos.toLocaleString('es-MX')}
          </div>
          <span className="text-[9px] font-mono text-slate-450 block">En piso operativo</span>
        </div>

        <div className="p-4 bg-slate-950/80 border border-slate-900/60 rounded-xl space-y-1.5 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest block">
            Pares Activos
          </span>
          <div className="text-2xl font-black font-mono text-cyan-400">
            {paresActivos.toLocaleString('es-MX')}
          </div>
          <span className="text-[9px] font-mono text-slate-450 block">Suelas cargadas</span>
        </div>

        <div className="p-4 bg-rose-950/10 border border-rose-950/40 rounded-xl space-y-1.5 shadow-md">
          <span className="text-[10px] font-mono font-bold text-rose-400 uppercase tracking-widest block">
            Lotes Vencidos Abiertos
          </span>
          <div className="text-2xl font-black font-mono text-rose-400">
            {lotesVencidos.toLocaleString('es-MX')}
          </div>
          <span className="text-[9px] font-mono text-rose-500 block">Abiertos fuera compromiso</span>
        </div>

        <div className="p-4 bg-rose-950/10 border border-rose-950/40 rounded-xl space-y-1.5 shadow-md">
          <span className="text-[10px] font-mono font-bold text-rose-400 uppercase tracking-widest block">
            Pares Vencidos Abiertos
          </span>
          <div className="text-2xl font-black font-mono text-rose-400">
            {paresVencidos.toLocaleString('es-MX')}
          </div>
          <span className="text-[9px] font-mono text-rose-500 block">Pendientes abiertos</span>
        </div>

        <div className="p-4 bg-slate-950/80 border border-slate-900/60 rounded-xl space-y-1.5 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest block">
            Entregados Hoy
          </span>
          <div className="text-2xl font-black font-mono text-emerald-400">
            {lotesEmbarcadosHoy}
          </div>
          <span className="text-[9px] font-mono text-slate-450 block">Llegaron a embarque hoy</span>
        </div>

        <div className="p-4 bg-amber-950/15 border border-amber-950/40 rounded-xl space-y-1.5 shadow-md col-span-2 sm:col-span-1">
          <span className="text-[10px] font-mono font-bold text-amber-500 uppercase tracking-widest block">
            Cuello de Botella
          </span>
          <div className="text-sm font-black text-amber-400 truncate tracking-tight pt-1">
            {bottleneckActual}
          </div>
          <span className="text-[9px] font-mono text-amber-550 block">Estación más lenta</span>
        </div>
      </div>

      {/* SECCIÓN PRINCIPAL: KANBAN BOARD + DETALLE LATERAL */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        
        {/* KANBAN BOARD (COLUMNS 1 TO 7) */}
        <div className="xl:col-span-3 space-y-3">
          
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin snap-x">
            {loteStages.map(stage => {
              const colBatches = filteredBatches.filter(b => normalizeLoteStage(getBatchStageId(b)) === stage.id);
              const colParesCount = colBatches.reduce((acc, b) => acc + getBatchPairs(b), 0);
              const totalStageTime = colBatches.reduce((acc, b) => acc + (b.tiempoEnEtapaMinutos || 0), 0);
              const avgStageTime = colBatches.length > 0 ? Math.round(totalStageTime / colBatches.length) : 0;
              
              // Saturation Semaphore calculation
              const saturation = getStageSaturation(colParesCount, colBatches.length);

              return (
                <div 
                  key={stage.id} 
                  className="bg-slate-950 border border-slate-900/80 p-3 rounded-xl min-w-[285px] w-80 shrink-0 flex flex-col h-[700px] shadow-lg snap-start"
                >
                  
                  {/* Stage Columns Header */}
                  <div className="pb-3 border-b border-slate-900 mb-3 space-y-2 select-none">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${
                          stage.id === 'alta_pedido' ? 'bg-blue-500' :
                          stage.id === 'almacen' ? 'bg-slate-400' :
                          stage.id === 'inyeccion' ? 'bg-amber-500' :
                          stage.id === 'aduana' ? 'bg-rose-500' :
                          stage.id === 'banda' ? 'bg-indigo-500' : 'bg-emerald-500'
                        }`}></span>
                        <h4 className="text-xs font-bold font-mono text-slate-200 uppercase tracking-wider truncate max-w-[170px]">
                          {stage.name}
                        </h4>
                      </div>
                      <span className={`text-[9px] px-1.5 py-0.5 border rounded-full font-mono font-bold ${saturation.bg}`}>
                        {saturation.text}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1 bg-slate-900/60 p-1.5 rounded-lg text-center font-mono text-[9px] text-slate-400">
                      <div>
                        <span className="block text-slate-500 font-bold">LOTES</span>
                        <span className="font-bold text-slate-200 text-xs">{colBatches.length}</span>
                      </div>
                      <div>
                        <span className="block text-slate-500 font-bold">PARES</span>
                        <span className="font-bold text-cyan-400 text-[10px]">{colParesCount.toLocaleString('es-MX')}</span>
                      </div>
                      <div>
                        <span className="block text-slate-500 font-bold">PROMEDIO</span>
                        <span className="font-bold text-yellow-500 text-[9px] truncate block">{colBatches.length > 0 ? formatEtapaTime(avgStageTime) : 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  {/* List of Batch Cards inside stage */}
                  <div className="flex-1 overflow-y-auto space-y-3 pr-1 py-1 scrollbar-thin">
                    {colBatches.length === 0 ? (
                      <div className="h-32 border border-dashed border-slate-900 rounded-xl flex flex-col items-center justify-center text-center p-4 bg-slate-900/10">
                        <Layers className="w-5 h-5 text-slate-755 mb-1" />
                        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">Sin lotes activos</span>
                      </div>
                    ) : (
                      colBatches.map(b => {
                        const isSelected = selectedBatch?.id === b.id;
                        const timeInEstacion = formatEtapaTime(b.tiempoEnEtapaMinutos);

                        // Overrides lookup
                        const computedFechaCompromiso = rescheduledDates[b.id] || b.fechaCompromiso?.split('T')[0] || '—';

                        // Estatus colors mapping
                        let statusColorClasses = "border-emerald-700/60 bg-emerald-950/20 text-emerald-400";
                        let statusText = "En tiempo";

                        if (isDeliveredBatch(b)) {
                          statusColorClasses = "border-emerald-700/60 bg-emerald-950/20 text-emerald-400";
                          statusText = "Entregado";
                        } else if (b.status === 'DETENIDO') {
                          statusColorClasses = "border-slate-700 bg-slate-900/40 text-slate-400";
                          statusText = "Detenido";
                        } else if (b.status === 'CRITICO') {
                          statusColorClasses = "border-rose-700/60 bg-rose-950/20 text-rose-400";
                          statusText = "Crítico";
                        } else if (b.status === 'ALERTA') {
                          statusColorClasses = "border-amber-700/60 bg-amber-950/20 text-amber-500";
                          statusText = "Alerta";
                        }

                        return (
                          <div
                            key={b.id}
                            onClick={() => setSelectedBatchId(b.id)}
                            className={`p-3 rounded-xl border transition-all duration-200 relative cursor-pointer select-none space-y-2.5 ${
                              isSelected 
                                ? 'bg-slate-900 border-cyan-500/80 shadow-md shadow-cyan-950/40 ring-1 ring-cyan-500/40' 
                                : 'bg-slate-900/50 border-slate-900 hover:border-slate-800 hover:bg-slate-900/70'
                            }`}
                          >
                            {/* Card Header ID & Estatus */}
                            <div className="flex justify-between items-start">
                              <div className="space-y-0.5">
                                <span className="text-[9px] text-slate-500 font-mono block leading-none">ID LOTE</span>
                                <h5 className="text-xs font-mono font-bold text-slate-200">{b.id}</h5>
                              </div>
                              <span className={`text-[9px] px-1.5 py-0.5 border rounded-md font-mono font-bold uppercase ${statusColorClasses}`}>
                                {statusText}
                              </span>
                            </div>

                            {/* Card Specifications Block */}
                            <div className="space-y-1">
                              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                                <span className="truncate max-w-[120px]">{b.cliente || 'S/Cliente'}</span>
                                <span className="text-slate-500 font-bold">{b.oc || 'S/OC'}</span>
                              </div>
                              <div className="grid grid-cols-2 gap-1 bg-slate-950/50 p-1.5 rounded-lg text-[10px] font-mono leading-none text-slate-300">
                                <div>
                                  <span className="text-slate-500 block text-[8px] uppercase">Modelo</span>
                                  <span className="font-bold text-slate-200 truncate block max-w-[100px]">{b.modelo || b.modelName}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 block text-[8px] uppercase">Color / Talla</span>
                                  <span className="truncate block max-w-[100px] text-slate-200">{b.color} #{b.size}</span>
                                </div>
                              </div>
                            </div>

                            {/* Time/Pares and Commitment date block */}
                            <div className="flex justify-between items-center text-[10px] font-mono border-t border-slate-900/85 pt-2 text-slate-400">
                              <div className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-slate-500" />
                                <span>{timeInEstacion}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-slate-500 font-bold block text-[8px] uppercase leading-none mb-0.5">COMPROMISO</span>
                                <span className="text-slate-300 text-[9px] font-semibold">{computedFechaCompromiso}</span>
                              </div>
                            </div>

                          </div>
                        );
                      })
                    )}
                  </div>

                </div>
              );
            })}
          </div>

        </div>

        {/* DETALLE LATERAL DERECHO (CLIENT SIDE SELECTED PANEL) */}
        <div className="xl:col-span-1">
          {selectedBatch ? (
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-2xl space-y-5 sticky top-6">
              
              {/* Header Title Panel */}
              <div className="border-b border-slate-900 pb-3">
                <span className="text-[9px] font-mono text-cyan-400 font-bold uppercase tracking-wider block">
                  Panel de Diagnóstico Lote
                </span>
                <div className="flex justify-between items-center mt-0.5">
                  <h3 className="text-base font-bold font-mono text-slate-100 uppercase">
                    {selectedBatch.id}
                  </h3>
                  <span className={`text-[10px] px-2 py-0.5 border rounded-full font-mono font-bold ${
                    selectedBatch.status === 'OPTIMO' ? 'border-emerald-700 bg-emerald-950/20 text-emerald-400' :
                    selectedBatch.status === 'ALERTA' ? 'border-amber-700 bg-amber-950/20 text-amber-500' :
                    selectedBatch.status === 'CRITICO' ? 'border-rose-700 bg-rose-950/20 text-rose-400' : 'border-slate-700 bg-slate-900/40 text-slate-400'
                  }`}>
                    {selectedBatch.status}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 font-mono mt-1">
                  Código Barras: {selectedBatch.codigoBarras || '750012300401'}
                </p>
              </div>

              {/* Info general del lote */}
              <div className="space-y-4">
                
                {/* 1. Datos del Pedido Relacionado */}
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest leading-none">
                    Pedido Relacionado
                  </h4>
                  <div className="bg-slate-900/40 p-3 border border-slate-900 rounded-xl space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Comprador Cliente:</span>
                      <span className="font-bold text-slate-200">{selectedBatch.cliente || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Orden de Compra:</span>
                      <span className="font-bold text-slate-300 font-mono">{selectedBatch.oc || 'S/OC'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Pares Totales Programados:</span>
                      <span className="font-bold text-cyan-400">{(selectedBatch.totalPares || selectedBatch.quantityShoes || 0).toLocaleString('es-MX')} pares</span>
                    </div>
                  </div>
                </div>

                {/* 2. Modelo, Color y Tallas */}
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest leading-none">
                    Modelo / Color / Fórmulas
                  </h4>
                  <div className="bg-slate-900/40 p-3 border border-slate-900 rounded-xl space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-500 block leading-none">Modelo EVA:</span>
                        <span className="font-bold text-slate-200">{selectedBatch.modelo || selectedBatch.modelName}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block leading-none">Color Pigmento:</span>
                        <span className="font-bold text-slate-200">{selectedBatch.color}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block leading-none">Talla Punto Calzado:</span>
                        <span className="font-mono text-cyan-400 font-bold">#{selectedBatch.size} MX</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block leading-none">Rel. Expansión Soplado:</span>
                        <span className="font-mono text-slate-300 font-bold">{selectedBatchModelDetails?.expansionFactor ? `x${selectedBatchModelDetails.expansionFactor}` : 'Pendiente OCR'}</span>
                      </div>
                    </div>

                    {/* Technical guidance for inyeccion & surface prep based on catalogue */}
                    <div className="border-t border-slate-905 pt-2 text-[10px] text-slate-400 leading-normal space-y-1">
                      <span className="text-slate-500 uppercase font-bold text-[8px] tracking-wider block">Sugeria Preparación de Superficie:</span>
                      <p className="bg-slate-950/40 p-1.5 border border-slate-900 rounded text-slate-300 italic">
                        "{selectedBatchModelDetails?.recommendedPrep || 'Pendiente OCR'}"
                      </p>
                      <span className="text-slate-500 uppercase font-bold text-[8px] tracking-wider block mt-1.5">Acabados y Pinturas:</span>
                      <p className="bg-slate-950/40 p-1.5 border border-slate-900 rounded text-slate-300 italic">
                        "{selectedBatchModelDetails?.paintType || 'Pendiente OCR'}"
                      </p>
                    </div>
                  </div>
                </div>

                {/* 3. Tiempos de permanencia en cada etapa */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest leading-none flex justify-between">
                    <span>Permanencia Real</span>
                    <span className="text-cyan-400 text-[10px]">{formatEtapaTime(selectedBatch.tiempoEnEtapaMinutos)}</span>
                  </h4>
                  <div className="p-3 bg-slate-900/40 border border-slate-900 rounded-xl space-y-2 text-[10px] font-mono">
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Estación Actual:</span>
                        <span className="text-slate-300 capitalize">{getLoteStageName(getBatchStageId(selectedBatch))}</span>
                      </div>
                      <div className="w-full h-1 bg-slate-950 rounded overflow-hidden">
                        <div className="h-full bg-cyan-500" style={{ width: `${getStageProgress(getBatchStageId(selectedBatch))}%` }}></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. Línea de Tiempo de Movimientos por Etapa (Interactive UI) */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest leading-none">
                    Línea de Tiempo de Movimientos
                  </h4>
                  <div className="p-3 bg-slate-900/30 border border-slate-900 rounded-xl space-y-3 relative overflow-hidden pl-5">
                    {/* Vertical line indicator */}
                    <div className="absolute top-4 bottom-4 left-3 border-l border-slate-800 border-dashed"></div>

                    {loteStages.map((st, sIdx) => {
                      const currentIdx = loteStages.findIndex(s => s.id === normalizeLoteStage(getBatchStageId(selectedBatch)));
                      const isPast = sIdx < currentIdx;
                      const isCurrent = sIdx === currentIdx;

                      return (
                        <div key={st.id} className="relative flex items-center justify-between text-[11px]">
                          {/* Dot marker */}
                          <div className={`absolute -left-3.5 w-2 h-2 rounded-full -translate-x-[1px] ${
                            isCurrent ? 'bg-cyan-500 ring-2 ring-cyan-950 animate-pulse' :
                            isPast ? 'bg-emerald-500' : 'bg-slate-800'
                          }`}></div>
                          
                          <div className="pl-2">
                            <span className={`font-medium block leading-none ${isCurrent ? 'text-slate-200' : isPast ? 'text-slate-400' : 'text-slate-600'}`}>
                              {st.name}
                            </span>
                          </div>

                          <div className="text-right text-[9px] text-slate-500 font-mono">
                            {isCurrent ? (
                              <span className="text-cyan-400 uppercase font-black tracking-widest animate-pulse">ACTIVO</span>
                            ) : isPast ? (
                              <span>Completado</span>
                            ) : (
                              <span className="text-slate-700">Pendiente</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 5. Defectos asociados */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <h4 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest leading-none">
                      Mermas e Inspecciones
                    </h4>
                    <button 
                      onClick={() => setIsReportDefectOpen(true)}
                      className="text-[9px] font-mono bg-rose-950 text-rose-400 hover:bg-rose-900 border border-rose-900 rounded px-1.5 py-0.5 font-bold transition cursor-pointer"
                    >
                      + Reportar Defecto
                    </button>
                  </div>

                  <div className="bg-slate-900/40 p-3 border border-slate-900 rounded-xl space-y-2 text-xs">
                    {defects.filter(d => d.batchId === selectedBatch.id).length === 0 ? (
                      <span className="text-slate-500 font-mono text-[10px] block text-center py-1 bg-slate-950/20 rounded font-bold">
                        🌱 Cero mermas reportadas. Lote operando de forma estable.
                      </span>
                    ) : (
                      <div className="space-y-1.5">
                        {defects.filter(d => d.batchId === selectedBatch.id).map(def => (
                          <div key={def.id} className="flex justify-between text-[10px] font-mono border-b border-slate-900 pb-1.5 last:border-0 last:pb-0">
                            <div>
                              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 bg-rose-500`}></span>
                              <span className="font-bold text-slate-300">{def.defectType}</span>
                              <span className="text-slate-500 block text-[9px]">{def.notes}</span>
                            </div>
                            <span className={`text-[8px] font-bold px-1.5 rounded uppercase self-start ${
                              def.severity === 'GRAVE' ? 'bg-rose-950/60 text-rose-400' : 'bg-amber-950/60 text-amber-550'
                            }`}>
                              {def.severity}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 6. Observaciones de Operador */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest leading-none">
                    Observaciones Técnicas / Bitácora
                  </h4>
                  <div className="space-y-2">
                    <textarea
                      value={obsTemp}
                      onChange={(e) => setObsTemp(e.target.value)}
                      placeholder="Agrega comentarios técnicos para este lote (Ej: soplado controlado, contracción registrada, etc.)"
                      className="w-full h-16 bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                    ></textarea>
                    <button
                      onClick={handleSaveObservations}
                      className="w-full bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 text-xs font-mono font-bold py-1 px-2 rounded-lg transition cursor-pointer"
                    >
                      Guardar Observaciones
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={() => setIsTvModalOpen(true)}
                    className="flex justify-center items-center gap-1 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-[11px] font-mono font-bold text-cyan-400 py-2.5 rounded-lg shadow-sm transition cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Ver Tarjeta Viajera
                  </button>

                  <button
                    onClick={() => setIsEditFechaOpen(true)}
                    className="flex justify-center items-center gap-1 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-[11px] font-mono font-bold text-yellow-500 py-2.5 rounded-lg shadow-sm transition cursor-pointer"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    Editar Compromiso
                  </button>
                </div>

              </div>

            </div>
          ) : (
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-6 text-center text-slate-500">
              <Layers className="w-8 h-8 mx-auto text-slate-700 mb-2" />
              <p className="text-xs font-mono">Selecciona un lote del Kanban para visualizar su desglose operativo.</p>
            </div>
          )}
        </div>

      </div>

      {/* COMPREHENSIVE LIST VIEW TABLE AT BOTTOM */}
      <div className="bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-2xl space-y-4">
        <div className="flex justify-between items-center border-b border-slate-900 pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <Building className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold font-mono text-slate-300 uppercase tracking-widest">
              Reporte de Inventario de Lotes en Planta ({filteredBatches.length} lotes)
            </h3>
          </div>
          <span className="text-[9px] font-mono text-slate-500 bg-slate-900/60 border border-slate-800 px-2 py-1 rounded">
            Planta: {currentTenant.name}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-900 text-[10px] text-slate-505 uppercase font-mono tracking-wider font-extrabold bg-slate-900/40">
                <th className="p-3">Cliente</th>
                <th className="p-3">OC</th>
                <th className="p-3">Lote ID</th>
                <th className="p-3">Tarjeta Viajera</th>
                <th className="p-3">Modelo</th>
                <th className="p-3">Color</th>
                <th className="p-3 text-right">Total Pares</th>
                <th className="p-3">Zona Previa</th>
                <th className="p-3 bg-slate-900/20">Zona Actual</th>
                <th className="p-3 text-right">Pares en Etapa</th>
                <th className="p-3">Tiempo Etapa</th>
                <th className="p-3">Fecha Compromiso</th>
                <th className="p-3 text-center">Estatus</th>
                <th className="p-3">Responsable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900 font-mono text-[11px] text-slate-300">
              {filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={14} className="p-8 text-center text-slate-600 bg-slate-950/50">
                    Ningún registro coincide con los filtros especificados en la barra superior.
                  </td>
                </tr>
              ) : (
                filteredBatches.map(b => {
                  const relOrder = orders.find(o => o.id === b.orderId);
                  const displayOC = b.oc || relOrder?.oc || 'S/O';
                  const displayClient = b.cliente || relOrder?.clientName || 'S/C';
                  const displayModel = b.modelo || b.modelName || 'S/Modelo';
                  const displayFecha = rescheduledDates[b.id] || b.fechaCompromiso?.split('T')[0] || '—';
                  const currentStatus = b.status || 'OPTIMO';

                  let statusText = "En tiempo";
                  let statClass = "bg-emerald-950/50 text-emerald-400 border border-emerald-900";
                  const batchStage = getBatchStageId(b);
                  if (isDeliveredBatch(b)) {
                    statusText = "Entregado";
                    statClass = "bg-emerald-950/50 text-emerald-400 border border-emerald-900";
                  } else if (currentStatus === 'DETENIDO') {
                    statusText = "Detenido";
                    statClass = "bg-slate-900/50 text-slate-400 border border-slate-850";
                  } else if (currentStatus === 'CRITICO') {
                    statusText = "Crítico";
                    statClass = "bg-rose-950/50 text-rose-400 border border-rose-900";
                  } else if (currentStatus === 'ALERTA') {
                    statusText = "Alerta";
                    statClass = "bg-amber-950/50 text-amber-550 border border-amber-900";
                  }

                  return (
                    <tr 
                      key={b.id} 
                      onClick={() => setSelectedBatchId(b.id)}
                      className={`hover:bg-slate-900/40 transition cursor-pointer ${
                        selectedBatch?.id === b.id ? 'bg-slate-900/20' : ''
                      }`}
                    >
                      <td className="p-3 truncate max-w-[120px] font-sans font-medium text-slate-200">{displayClient}</td>
                      <td className="p-3 text-slate-300 font-bold">{displayOC}</td>
                      <td className="p-3 text-cyan-400 font-bold">{b.id}</td>
                      <td className="p-3 text-slate-500">{b.tarjetaViajera || `TV-${b.id}`}</td>
                      <td className="p-3 text-slate-200">{displayModel}</td>
                      <td className="p-3 text-slate-300">{b.color}</td>
                      <td className="p-3 text-right font-bold">{getBatchPairs(b).toLocaleString('es-MX')}</td>
                      <td className="p-3 text-slate-500 uppercase font-bold text-[9px]">{getPreviousLoteStageName(batchStage)}</td>
                      <td className="p-3 bg-slate-900/20 text-slate-300 uppercase font-bold text-[9px]">{getLoteStageName(batchStage)}</td>
                      <td className="p-3 text-right font-medium">{(b.paresEnEtapa || getBatchPairs(b)).toLocaleString('es-MX')}</td>
                      <td className="p-3 text-slate-400">{formatEtapaTime(b.tiempoEnEtapaMinutos)}</td>
                      <td className="p-3 text-slate-400">{displayFecha}</td>
                      <td className="p-3 text-center">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase inline-block ${statClass}`}>
                          {statusText}
                        </span>
                      </td>
                      <td className="p-3 truncate max-w-[110px] text-slate-500">{b.responsableActual || b.operatorId}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* NEW BATCH MODAL (LAUNCH EVA) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 backdrop-blur-md">
          <div className="bg-slate-950 border border-slate-900 rounded-xl p-6 w-full max-w-md space-y-4">
            <div className="flex justify-between items-center border-b border-slate-900 pb-3">
              <h3 className="text-xs font-black tracking-widest font-mono text-cyan-400 uppercase">
                Apertura y Programación de Lote EVA
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-slate-200 text-lg">✕</button>
            </div>

            <form onSubmit={handleCreateBatch} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-400 block font-mono">Lote / Tarjeta Viajera:</label>
                <input 
                  type="text" 
                  value={newBatchId}
                  onChange={(e) => setNewBatchId(e.target.value)}
                  placeholder="Ej: LOTE-26-440"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-100 uppercase font-mono focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 block font-mono">Modelo EVA:</label>
                  <select 
                    value={newModelId} 
                    onChange={(e) => setNewModelId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">Pendiente OCR</option>
                    {uniqueModels.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 block font-mono">Pigmento/Color:</label>
                  <select 
                    value={newColor} 
                    onChange={(e) => setNewColor(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">Pendiente OCR</option>
                    {uniqueColors.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 block font-mono">Talla Punto Calzado:</label>
                  <input 
                    type="number" 
                    step="0.5"
                    value={newSize}
                    onChange={(e) => setNewSize(parseFloat(e.target.value))}
                    min={21}
                    max={32}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-100 font-mono focus:outline-none"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 block font-mono">Cantidad (Pares):</label>
                  <input 
                    type="number" 
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(parseInt(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-100 font-mono focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 block font-mono">Líder Operador / Inyección:</label>
                <input 
                  type="text" 
                  value={newOperator}
                  onChange={(e) => setNewOperator(e.target.value)}
                  placeholder="Ej: Ing. Pedro Ortiz"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 block font-mono font-bold">Asociar con Pedido OC:</label>
                <select
                  value={newOrderId}
                  onChange={(e) => setNewOrderId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none"
                  required
                >
                  <option value="">-- Seleccionar OC --</option>
                  {orders.map(o => (
                    <option key={o.id} value={o.id}>{o.oc} ({o.clientName})</option>
                  ))}
                </select>
              </div>

              <div className="pt-3 flex justify-end gap-3 border-t border-slate-900">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 hover:bg-slate-900 text-slate-400 hover:text-slate-200 rounded-lg font-mono transition"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 font-sans font-bold text-slate-950 rounded-lg shadow-lg cursor-pointer"
                >
                  Arrancar Lote
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAILED TV (TRAVEL CARD RECEIPT MODAL) */}
      {isTvModalOpen && selectedBatch && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 backdrop-blur-md">
          <div className="bg-slate-950 border-2 border-slate-800 rounded-xl p-6 w-full max-w-md relative font-mono text-slate-300">
            
            {/* Travel Tag Visual Frame */}
            <div className="border border-dashed border-slate-800 p-4 space-y-4">
              
              {/* Receipt Header */}
              <div className="text-center border-b border-dashed border-slate-900 pb-3">
                <span className="text-[12px] font-black tracking-widest text-cyan-500 block">PLASYECT INDUSTRIAL DE MEXICO S.A.</span>
                <span className="text-[9px] text-slate-500 block uppercase mt-0.5">Control de Piso & Registro de Trazabilidad</span>
                <span className="text-xs font-bold text-yellow-500 block uppercase tracking-wide mt-2">
                  *** TARJETA VIAJERA ***
                </span>
              </div>

              {/* Barcode representation */}
              <div className="flex flex-col items-center justify-center space-y-1 bg-white p-3.5 rounded-lg select-all">
                {/* Visual barcode glyph blocks */}
                <div className="flex space-x-[2px] h-12 items-center">
                  {[3,1,4,1,5,9,2,6,5,3,5,8,9,7,9,3,2,3,8,4,6,2,6,4,3,3,8,3,2,7,9,5].map((w, idx) => (
                    <div 
                      key={idx} 
                      className="bg-black h-full" 
                      style={{ width: `${(w % 3) + 1}px` }}
                    ></div>
                  ))}
                </div>
                <span className="text-[10px] text-slate-900 font-bold tracking-widest">
                  *{selectedBatch.codigoBarras || '750012300401'}*
                </span>
                <span className="text-[8px] text-slate-400 uppercase tracking-tighter">ID: {selectedBatch.id} - FOLIO RECEPTOR INFRA</span>
              </div>

              {/* Specs Grid */}
              <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px] border-b border-dashed border-slate-900 pb-3">
                <div>
                  <span className="text-slate-500 block">LOTE ID:</span>
                  <span className="font-bold text-slate-200">{selectedBatch.id}</span>
                </div>
                <div>
                  <span className="text-slate-500 block font-sans">TARJETA VIAJERA:</span>
                  <span className="font-bold text-slate-200">{selectedBatch.tarjetaViajera || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">CLIENTE:</span>
                  <span className="font-bold text-slate-200 truncate block max-w-[170px]">{selectedBatch.cliente || 'Pendiente OCR'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">OC RELACIONADO:</span>
                  <span className="font-bold text-slate-200">{selectedBatch.oc || 'Pendiente OCR'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">MODELO INYECCION:</span>
                  <span className="font-bold text-slate-200">{selectedBatch.modelo || selectedBatch.modelName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">COLOR / PIGMENTO:</span>
                  <span className="font-bold text-slate-200">{selectedBatch.color}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">PUNTO CALZADO:</span>
                  <span className="font-bold text-cyan-400">#{selectedBatch.size} MX</span>
                </div>
                <div>
                  <span className="text-slate-500 block">CANTIDAD TOTAL:</span>
                  <span className="font-bold text-cyan-400">{(selectedBatch.totalPares || selectedBatch.quantityShoes || 0).toLocaleString('es-MX')} PARES</span>
                </div>
                <div>
                  <span className="text-slate-500 block">ESTACION ACTUAL:</span>
                  <span className="font-bold text-yellow-500 uppercase">{getBatchStageId(selectedBatch).replace('_', ' ')}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">RESPONSABLE ACTUAL:</span>
                  <span className="font-bold text-slate-200 truncate block max-w-[170px]">{selectedBatch.responsableActual || selectedBatch.operatorId}</span>
                </div>
              </div>

              {/* Bottom deep link QR code */}
              <div className="flex items-center gap-3 bg-slate-900/60 p-2.5 rounded-lg">
                <div className="w-12 h-12 bg-slate-100 p-1 rounded shrink-0 flex flex-wrap content-start">
                  {/* QR decorativo (placeholder visual, no codifica datos reales) */}
                  {[1,0,1,1,0,0,1,1,1,0,1,0,0,1,1,0,1,0,1,0,0,1,1,1,0,0,1,1,0,1,1,0,0,1,0,1].map((p, pIdx) => (
                    <div 
                      key={pIdx} 
                      className={`w-2 h-2 ${p === 1 ? 'bg-black' : 'bg-transparent'}`}
                    ></div>
                  ))}
                </div>
                <div className="text-[8px] text-slate-450 leading-normal">
                  <span className="font-bold block text-cyan-400">SISTEMA INTEGRAL DE AUDITORÍA</span>
                  Escanear código QR para consultar certificado calidad, historial de mermas y pruebas de densidad Shore A del compuesto EVA.
                </div>
              </div>

              {/* Disclaimer */}
              <p className="text-[8px] text-slate-600 text-center leading-tight">
                PRODUCIDO BAJO CÓDIGO SEGURO PLASYECT DASHBOARD OS 2026. PROHIBIDA SU REPRODUCCIÓN SIN AUTORIZACIÓN.
              </p>

            </div>

            {/* Modal actions */}
            <div className="pt-4 flex justify-between gap-3 text-xs">
              <button 
                onClick={() => setIsTvModalOpen(false)}
                className="px-4 py-2 hover:bg-slate-900 border border-slate-800 text-slate-400 hover:text-white rounded-lg transition"
              >
                Cerrar Tarjeta
              </button>
              
              <button 
                onClick={handlePrintLabelTV}
                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-slate-950 font-bold rounded-lg shadow-lg active:scale-95 transition cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Imprimir Tarjeta PDF
              </button>
            </div>

          </div>
        </div>
      )}

      {/* COMMITMENT RESCHEDULE MODAL */}
      {isEditFechaOpen && selectedBatch && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 backdrop-blur-md">
          <div className="bg-slate-950 border border-slate-900 rounded-xl p-5 w-full max-w-sm space-y-4">
            <div className="flex justify-between items-center border-b border-slate-900 pb-2.5">
              <h3 className="text-xs font-black tracking-widest font-mono text-yellow-500 uppercase">
                ⚙️ Reprogramar Fecha de Entrega
              </h3>
              <button onClick={() => setIsEditFechaOpen(false)} className="text-slate-500 hover:text-slate-300">✕</button>
            </div>

            <form onSubmit={handleUpdateFechaCompromiso} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <span className="text-slate-500 block font-mono">Lote: {selectedBatch.id}</span>
                <span className="text-slate-500 block font-mono">Cliente: {selectedBatch.cliente || 'S/Cliente'}</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-400 block font-mono font-bold">Nueva Fecha de Compromiso:</label>
                <input 
                  type="date"
                  value={editFechaTemp}
                  onChange={(e) => setEditFechaTemp(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-yellow-500 font-mono"
                  required
                />
              </div>

              <div className="bg-slate-900/40 p-2.5 border border-slate-900 rounded-lg text-[10px] text-slate-405">
                ⚠️ <span className="text-slate-300 font-bold">Registro de Auditoría:</span> Esta acción dejará grabado una bitácora irrevocable con el rol de {currentUser?.role || '—'} para efectos contractuales.
              </div>

              <div className="pt-2 flex justify-end gap-2.5 border-t border-slate-900">
                <button 
                  type="button" 
                  onClick={() => setIsEditFechaOpen(false)}
                  className="px-3.5 py-2 hover:bg-slate-900 text-slate-400 hover:text-white rounded-lg transition"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-bold rounded-lg shadow font-sans cursor-pointer"
                >
                  Confirmar Reprogramación
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REPORT DEFECT INTEGRATED MODAL */}
      {isReportDefectOpen && selectedBatch && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 backdrop-blur-md">
          <div className="bg-slate-950 border border-slate-900 rounded-xl p-5 w-full max-w-sm space-y-4">
            <div className="flex justify-between items-center border-b border-slate-900 pb-2.5">
              <h3 className="text-xs font-black tracking-widest font-mono text-rose-500 uppercase">
                🚨 Reportar Merma / Defecto de Inyección
              </h3>
              <button onClick={() => setIsReportDefectOpen(false)} className="text-slate-500 hover:text-slate-300">✕</button>
            </div>

            <form onSubmit={handleRegisterDefect} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <span className="text-slate-500 block font-mono">Lote Folio: {selectedBatch.id}</span>
                <span className="text-slate-500 block font-mono">Modelo: {selectedBatch.modelo || selectedBatch.modelName}</span>
              </div>

              {/* Defect Type Dropdown */}
              <div className="space-y-1">
                <label className="text-slate-400 block font-mono">Tipo de Defecto Físico:</label>
                <select 
                  value={defectType}
                  onChange={(e) => setDefectType(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none"
                >
                  <option value="BURBUJA">Burbuja por Soplado Excedido</option>
                  <option value="RECHUPE">Contracción / Rechupe EVA</option>
                  <option value="DEFORMACION">Deformación por Enfriamiento Corto</option>
                  <option value="MANCHA">Contaminación de Pigmento / Mancha</option>
                  <option value="POROSIDAD">Porosidad Residual</option>
                  <option value="FALTA_LLENADO">Plastisol Despegado / Falto Llenado</option>
                </select>
              </div>

              {/* Severity Select */}
              <div className="space-y-1">
                <label className="text-slate-400 block font-mono">Severidad / Alarma de Línea:</label>
                <select 
                  value={defectSeverity}
                  onChange={(e) => setDefectSeverity(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none"
                >
                  <option value="LEVE">LEVE (Solo registro informativo)</option>
                  <option value="MODERADO">MODERADO (Declara Alarma Amarilla en Kanban)</option>
                  <option value="GRAVE">GRAVE (Detiene / Pone en Crítico el lote de inmediato)</option>
                </select>
              </div>

              {/* Inspector Name */}
              <div className="space-y-1">
                <label className="text-slate-400 block font-mono">Inspector de Calidad Escaneando:</label>
                <input 
                  type="text"
                  value={defectInspector}
                  onChange={(e) => setDefectInspector(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200"
                  required
                />
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="text-slate-400 block font-mono font-bold">Notas de Inspector / Causa Raíz:</label>
                <textarea 
                  value={defectNotes}
                  onChange={(e) => setDefectNotes(e.target.value)}
                  placeholder="Ej: Soplante residual no disipó adecuadamente en molde #4"
                  className="w-full h-16 bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none"
                  required
                ></textarea>
              </div>

              <div className="pt-2 flex justify-end gap-2.5 border-t border-slate-900">
                <button 
                  type="button" 
                  onClick={() => setIsReportDefectOpen(false)}
                  className="px-3.5 py-2 hover:bg-slate-900 text-slate-400 hover:text-white rounded-lg transition"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-slate-950 font-bold rounded-lg shadow font-sans cursor-pointer"
                >
                  Registrar Defecto Grave
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

/* 3. Pipeline por Pedido (Comercial) View */

// Arc progress D3 gauge
const D3OrderGauge: React.FC<{ progress: number }> = ({ progress }) => {
  const svgRef = React.useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    
    // Clear previous
    d3.select(svgRef.current).selectAll('*').remove();

    const width = 130;
    const height = 85;
    const radius = Math.min(width, height) - 15;

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${width / 2}, ${height - 10})`);

    const arc = d3.arc<any>()
      .innerRadius(radius - 10)
      .outerRadius(radius)
      .startAngle(-Math.PI / 2)
      .endAngle(Math.PI / 2);

    const progressAngle = -Math.PI / 2 + (progress / 100) * Math.PI;
    const foregroundArc = d3.arc<any>()
      .innerRadius(radius - 10)
      .outerRadius(radius)
      .startAngle(-Math.PI / 2)
      .endAngle(progressAngle);

    // Background arc
    svg.append('path')
      .datum({ endAngle: Math.PI / 2 })
      .style('fill', '#1e293b') // slate-800
      .attr('d', arc as any);

    // Foreground arc with dynamic color
    const color = progress >= 100 ? '#10b981' : progress >= 60 ? '#3b82f6' : progress >= 30 ? '#f59e0b' : '#ef4444';
    svg.append('path')
      .datum({ endAngle: progressAngle })
      .style('fill', color)
      .attr('d', foregroundArc as any);

    // Percent text
    svg.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-12px')
      .style('fill', '#f1f5f9') // slate-100
      .style('font-size', '16px')
      .style('font-weight', '900')
      .style('font-family', 'monospace')
      .text(`${progress}%`);

    svg.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '4px')
      .style('fill', '#64748b') // slate-500
      .style('font-size', '7px')
      .style('font-weight', '700')
      .style('font-family', 'sans-serif')
      .text('PONDERADO');

  }, [progress]);

  return (
    <div className="flex justify-center items-center py-1">
      <svg ref={svgRef}></svg>
    </div>
  );
};

// Horizontal stage D3 bar chart
const D3OrderTimeline: React.FC<{ stagesData: { name: string; value: number; color: string }[] }> = ({ stagesData }) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    // Clear previous
    containerRef.current.innerHTML = '';

    const margin = { top: 5, right: 35, bottom: 5, left: 65 };
    const width = containerRef.current.clientWidth || 240;
    const height = 110;

    const svg = d3.select(containerRef.current)
      .append('svg')
      .attr('width', '100%')
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);

    const maxValue = Math.max(...stagesData.map(d => d.value), 100);
    const x = d3.scaleLinear()
      .domain([0, maxValue])
      .range([0, width - margin.left - margin.right]);

    const y = d3.scaleBand<string>()
      .domain(stagesData.map(d => d.name))
      .range([0, height - margin.top - margin.bottom])
      .padding(0.2);

    // Draw bars
    svg.selectAll('.bar')
      .data(stagesData)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', 0)
      .attr('y', (d: any) => y(d.name) || 0)
      .attr('width', (d: any) => x(d.value))
      .attr('height', y.bandwidth())
      .attr('fill', (d: any) => d.color)
      .attr('rx', 3);

    // Draw labels inside/around
    svg.selectAll('.val')
      .data(stagesData)
      .enter()
      .append('text')
      .attr('class', 'val')
      .attr('x', (d: any) => x(d.value) + 4)
      .attr('y', (d: any) => (y(d.name) || 0) + y.bandwidth() / 2 + 3)
      .text((d: any) => d.value > 0 ? `${d.value.toLocaleString()}` : '')
      .style('font-family', 'monospace')
      .style('font-size', '8px')
      .style('fill', '#94a3b8');

    // Drawer Y axis labels
    const yAxisGroup = svg.append('g')
      .call(d3.axisLeft<string>(y).tickSize(0))
      .select('.domain').remove();

    svg.selectAll('.tick text')
      .style('font-family', 'sans-serif')
      .style('font-size', '8px')
      .style('fill', '#64748b');

  }, [stagesData]);

  return (
    <div ref={containerRef} className="w-full bg-slate-900/40 p-1.5 border border-slate-900 rounded-lg">
    </div>
  );
};

export const PipelinePedidoView: React.FC = () => {
  const { orders, batches, defects, currentTenant, exchangeRate, addAuditLog } = useDashboard();

  // Selected Order State (Default to the very first matching)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Top Filter States
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroOC, setFiltroOC] = useState('');
  const [filtroPedido, setFiltroPedido] = useState('');
  const [filtroModelo, setFiltroModelo] = useState('');
  const [filtroColor, setFiltroColor] = useState('');
  const [filtroFechaAlta, setFiltroFechaAlta] = useState('');
  const [filtroFechaCompromiso, setFiltroFechaCompromiso] = useState('');
  const [filtroEstatus, setFiltroEstatus] = useState('');
  const [filtroRiesgo, setFiltroRiesgo] = useState('');
  const [filtroEtapaDominante, setFiltroEtapaDominante] = useState('');
  const [operationalData, setOperationalData] = useState<ErpOperationalResponse | null>(null);

  useEffect(() => {
    if (!backendEnabled) return;
    let cancelled = false;
    const end = new Date();
    const start = new Date(end.getTime() - 365 * 24 * 3600 * 1000);
    dashboardApi.erpOperativo(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10))
      .then(data => { if (!cancelled) setOperationalData(data); })
      .catch(err => console.warn('Pipeline pedido: ERP operativo fetch failed', err));
    return () => { cancelled = true; };
  }, []);

  // Strict stage weights
  const STAGE_WEIGHTS: Record<string, number> = {
    'alta_pedido': 14,
    'almacen': 29,
    'inyeccion': 43,
    'estabilizacion': 57,
    'aduana': 71,
    'banda': 86,
    'embarque': 100
  };

  const STAGE_NAMES: Record<string, string> = {
    'alta_pedido': 'Alta Pedido',
    'almacen': 'Almacén',
    'inyeccion': 'Inyección',
    'estabilizacion': 'Estabilización',
    'aduana': 'Aduana',
    'banda': 'Banda',
    'embarque': 'Embarque'
  };
  const mapDeliveryRiskToSignal = (risk: string): 'VERDE' | 'AMARILLO' | 'ROJO' | 'GRIS' => {
    if (risk === 'VENCIDO' || risk === 'ALTO') return 'ROJO';
    if (risk === 'MEDIO') return 'AMARILLO';
    if (risk === 'BAJO') return 'VERDE';
    return 'GRIS';
  };

  // 1. Core calculation per order (taking isolated Tenant data)
  const tenantOrders = orders.filter(o => o.tenantId === currentTenant.id);
  const tenantBatches = batches.filter(b => b.tenantId === currentTenant.id && !isArchivedBatch(b));

  const fallbackOrdersWithMetrics = tenantOrders.map(o => {
    const orderBatches = tenantBatches.filter(b => b.orderId === o.id);
    const committedBatchPairs = orderBatches.reduce((sum, b) => sum + getBatchPairs(b), 0);
    const totalPares = committedBatchPairs || o.totalPares || o.quantity || 0;

    // Pairs per stage list initialization
    const pairsByStage: Record<string, number> = {
      'alta_pedido': 0,
      'almacen': 0,
      'inyeccion': 0,
      'estabilizacion': 0,
      'aduana': 0,
      'banda': 0,
      'embarque': 0
    };

    let weightedSum = 0;
    let totalTimeMin = 0;
    let countWithTime = 0;

    orderBatches.forEach(b => {
      const stage = getBatchStageId(b);
      const qty = getBatchPairs(b);
      if (pairsByStage[stage] !== undefined) {
        pairsByStage[stage] += qty;
      } else {
        pairsByStage['alta_pedido'] += qty;
      }

      const weight = STAGE_WEIGHTS[stage] || 0;
      weightedSum += qty * weight;

      if (b.tiempoEnEtapaMinutos !== undefined && b.tiempoEnEtapaMinutos > 0) {
        totalTimeMin += b.tiempoEnEtapaMinutos;
        countWithTime++;
      }
    });

    const progress = totalPares > 0 ? Math.min(100, Math.round(weightedSum / totalPares)) : 0;
    const avgTimeMin = countWithTime > 0 ? Math.round(totalTimeMin / countWithTime) : 180; // default to 3 hours if none

    // Dominant stage calculation
    let dominantStage = 'alta_pedido';
    let maxPares = -1;
    Object.entries(pairsByStage).forEach(([st, qty]) => {
      if (qty > maxPares) {
        maxPares = qty;
        dominantStage = st;
      }
    });
    if (orderBatches.length === 0) {
      dominantStage = 'alta_pedido';
    }

    // Delivery Risk assessment
    let risk: 'VERDE' | 'AMARILLO' | 'ROJO' | 'GRIS' = 'GRIS';
    const compStr = o.fechaCompromiso || o.deliveryDate;
    if (!compStr) {
      risk = 'GRIS';
    } else {
      const commitmentDate = new Date(compStr);
      const now = new Date();
      const timeDiff = commitmentDate.getTime() - now.getTime();
      const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

      if (o.status === 'COMPLETADO' || o.estatus === 'COMPLETADO' || progress >= 100) {
        risk = 'VERDE';
      } else if (daysDiff < 0) {
        risk = 'ROJO'; // Past commitment deadline is a critical Rojo
      } else if (daysDiff <= 2 && progress < 30) {
        risk = 'ROJO'; // high risk of missing upcoming date
      } else if (daysDiff <= 5 && progress < 60) {
        risk = 'AMARILLO'; // medium alerting gap
      } else {
        risk = 'VERDE'; // Safe delivery probability
      }
    }

    return {
      ...o,
      totalPares,
      progress,
      avgTimeMin,
      dominantStage,
      risk,
      pairsByStage,
      batchesCount: orderBatches.length,
      shippedPairs: pairsByStage['embarque'] || 0,
      inProcessPairs: orderBatches
        .filter(b => !isDeliveredBatch(b))
        .reduce((sum, b) => sum + getBatchPairs(b), 0)
    };
  });
  const erpOrdersWithMetrics = (operationalData?.orderPipeline ?? []).map(o => ({
    id: o.id,
    tenantId: currentTenant.id,
    clientId: o.cliente,
    clientName: o.cliente,
    modelId: o.modelo || 'varios',
    modelName: o.modelo || 'Varios modelos',
    modelo: o.modelo || 'Varios modelos',
    color: o.color || 'N/D',
    quantity: o.totalPares,
    exchangeRate,
    totalUSD: 0,
    totalMXN: 0,
    createdAt: o.fechaAlta || '',
    deliveryDate: o.fechaCompromiso || '',
    status: o.progress >= 100 ? 'COMPLETADO' : 'PROCESANDO',
    discountAuthorized: false,
    discountPercentage: 0,
    cliente: o.cliente,
    oc: o.oc || undefined,
    fechaAlta: o.fechaAlta || undefined,
    fechaCompromiso: o.fechaCompromiso || undefined,
    totalPares: o.totalPares,
    estatus: o.progress >= 100 ? 'COMPLETADO' : 'PROCESANDO',
    porcentajeAvance: o.progress,
    riesgoEntrega: o.risk,
    progress: o.progress,
    avgTimeMin: o.avgTimeMin ?? 0,
    dominantStage: o.dominantStage,
    risk: mapDeliveryRiskToSignal(o.risk),
    pairsByStage: o.pairsByStage,
    batchesCount: o.batchesCount,
    shippedPairs: o.shippedPairs,
    inProcessPairs: o.inProcessPairs
  }));
  // Fuente unica: pedidos siempre desde el ERP server-side (universo completo del
  // FDB). Sin fallback al bootstrap limitado.
  const allOrders = operationalData ? erpOrdersWithMetrics : [];
  void fallbackOrdersWithMetrics;
  const isOpenOrder = (o: { progress: number; status?: string; estatus?: string }) =>
    o.progress < 100 && o.status !== 'CANCELADO' && o.estatus !== 'CANCELADO';

  // Unique attribute pools for Filter dropdowns
  const clientOptions = Array.from(new Set(allOrders.map(o => o.cliente || o.clientName || ''))).filter(Boolean);
  const modelOptions = Array.from(new Set(allOrders.map(o => o.modelo || o.modelName || ''))).filter(Boolean);
  const colorOptions = Array.from(new Set(allOrders.map(o => o.color || ''))).filter(Boolean);

  // Apply filters
  const filteredAllOrders = allOrders.filter(o => {
    const clientVal = o.cliente || o.clientName || '';
    const ocVal = o.oc || '';
    const pedVal = o.id || '';
    const modelVal = o.modelo || o.modelName || '';
    const colorVal = o.color || '';
    const altaVal = o.fechaAlta || o.createdAt || '';
    const compVal = o.fechaCompromiso || o.deliveryDate || '';
    const estVal = o.estatus || o.status || '';
    const dominantName = STAGE_NAMES[o.dominantStage] || o.dominantStage;

    if (filtroCliente && !clientVal.toLowerCase().includes(filtroCliente.toLowerCase())) return false;
    if (filtroOC && !ocVal.toLowerCase().includes(filtroOC.toLowerCase())) return false;
    if (filtroPedido && !pedVal.toLowerCase().includes(filtroPedido.toLowerCase())) return false;
    if (filtroModelo && modelVal !== filtroModelo) return false;
    if (filtroColor && colorVal !== filtroColor) return false;
    if (filtroFechaAlta && !altaVal.includes(filtroFechaAlta)) return false;
    if (filtroFechaCompromiso && !compVal.includes(filtroFechaCompromiso)) return false;
    if (filtroEstatus && estVal !== filtroEstatus) return false;
    if (filtroRiesgo && o.risk !== filtroRiesgo) return false;
    if (filtroEtapaDominante && o.dominantStage !== filtroEtapaDominante) return false;

    return true;
  });
  const activeOrders = filteredAllOrders.filter(isOpenOrder);
  const filteredOrders = filtroEstatus ? filteredAllOrders : activeOrders;

  // KPI calculations responsive to dynamic filtered list
  const totalCommittedPairs = activeOrders.reduce((sum, o) => sum + o.totalPares, 0);
  const totalShippedPairs = activeOrders.reduce((sum, o) => sum + o.shippedPairs, 0);
  const totalInProcessPairs = activeOrders.reduce((sum, o) => sum + o.inProcessPairs, 0);
  
  // Pending Backlog
  const pendingBacklog = Math.max(0, totalCommittedPairs - totalShippedPairs);

  // Weighted Average Progress across active/filtered orders
  const avgProgress = totalCommittedPairs > 0
    ? Math.round(activeOrders.reduce((sum, o) => sum + o.progress * o.totalPares, 0) / totalCommittedPairs)
    : 0;

  // Overdue count: past commitment date & not fully shipped/completed
  const baseDateAnchor = dateOnlyTime(new Date().toISOString()) ?? Date.now();
  const overdueOpenOrders = activeOrders.filter(o => {
    const compStr = o.fechaCompromiso || o.deliveryDate;
    return isPastDueDateOnly(compStr, baseDateAnchor);
  });
  const overdueOrdersCount = overdueOpenOrders.length;
  const overdueOpenPairs = overdueOpenOrders.reduce((sum, o) => sum + o.inProcessPairs, 0);

  // Selected Order
  const activeSelectedOrder = filteredOrders.find(o => o.id === selectedOrderId) || filteredOrders[0] || null;

  // Safe time duration display formatter
  const formatTimeMinutes = (min: number) => {
    if (!min) return "00h 00m";
    const h = Math.floor(min / 60);
    const m = Math.floor(min % 60);
    return `${h}h ${String(m).padStart(2, '0')}m`;
  };

  const handleClearFilters = () => {
    setFiltroCliente('');
    setFiltroOC('');
    setFiltroPedido('');
    setFiltroModelo('');
    setFiltroColor('');
    setFiltroFechaAlta('');
    setFiltroFechaCompromiso('');
    setFiltroEstatus('');
    setFiltroRiesgo('');
    setFiltroEtapaDominante('');
  };

  // Stacked Bar Chart data: Top 5 orders by Volume
  const stackedChartData = activeOrders.slice(0, 5).map(o => ({
    name: o.id,
    'Alta Pedido': o.pairsByStage['alta_pedido'] || 0,
    'Almacén': o.pairsByStage['almacen'] || 0,
    'Inyección': o.pairsByStage['inyeccion'] || 0,
    'Estabilización': o.pairsByStage['estabilizacion'] || 0,
    'Aduana': o.pairsByStage['aduana'] || 0,
    'Banda': o.pairsByStage['banda'] || 0,
    'Entrega': o.pairsByStage['embarque'] || 0,
  }));

  const lineChartData = (operationalData?.dailyProduction ?? []).slice(-15).map(row => ({
    day: row.fecha.slice(5),
    'Pares Producidos': row.pares
  }));

  // Ranking data: Backlog
  const backlogRanking = [...activeOrders]
    .map(o => ({ name: o.id, value: o.inProcessPairs }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 4);

  // Ranking data: Risk Index score (100 - progress), weighted by overdue status
  const riskIndexRanking = [...activeOrders]
    .map(o => {
      let score = 100 - o.progress;
      if (o.risk === 'ROJO') score += 100;
      if (o.risk === 'AMARILLO') score += 50;
      return { name: o.id, value: score, label: o.risk };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 4);

  // Generate dynamic array data of pairs per stage for selected order for D3 rendering
  const selectedStagesArray = activeSelectedOrder ? [
    { name: 'Entrega', value: activeSelectedOrder.pairsByStage['embarque'] || 0, color: '#10b981' },
    { name: 'Banda', value: activeSelectedOrder.pairsByStage['banda'] || 0, color: '#6366f1' },
    { name: 'Aduana', value: activeSelectedOrder.pairsByStage['aduana'] || 0, color: '#f43f5e' },
    { name: 'Estabilización', value: activeSelectedOrder.pairsByStage['estabilizacion'] || 0, color: '#a855f7' },
    { name: 'Inyección', value: activeSelectedOrder.pairsByStage['inyeccion'] || 0, color: '#f59e0b' },
    { name: 'Almacén', value: activeSelectedOrder.pairsByStage['almacen'] || 0, color: '#64748b' },
    { name: 'Alta Pedido', value: activeSelectedOrder.pairsByStage['alta_pedido'] || 0, color: '#3b82f6' }
  ] : [];

  // Lookup defects of the batches mapped to selected order
  const orderBatchesIds = activeSelectedOrder 
    ? tenantBatches.filter(b => b.orderId === activeSelectedOrder.id).map(b => b.id)
    : [];
  const associatedDefects = defects.filter(d => orderBatchesIds.includes(d.batchId));

  return (
    <div className="space-y-6">

      {/* RETAIN TENANT-AWARE HEADER BLOCK */}
      <div className="flex justify-between items-center bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-xl flex-wrap gap-4">
        <div>
          <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest font-bold block mb-1">
            CONSOLA COMERCIAL Y TRAZABILIDAD INDUSTRIAL
          </span>
          <h2 className="text-xl font-black font-sans text-slate-100 uppercase tracking-tight leading-none mb-1 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
            Pipeline de Pedidos Consolidado
          </h2>
          <p className="text-xs text-slate-400 font-sans">
            Visibilidad de entrega comercial, lotes por etapa, riesgos e inventarios.
          </p>
        </div>
      </div>

      {/* 1. FILTROS SUPERIORES */}
      <div className="bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center gap-1.5 border-b border-slate-900 pb-3">
          <Filter className="w-4 h-4 text-cyan-500" />
          <h3 className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider">
            Consola Inteligente de Filtrado de Pedidos
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          
          {/* Cliente */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-450 block">
              Comprador Cliente
            </label>
            <select
              value={filtroCliente}
              onChange={(e) => setFiltroCliente(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todos --</option>
              {clientOptions.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* OC */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-450 block">
              Orden de Compra (OC)
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-2.5">
                <Search className="w-3.5 h-3.5 text-slate-500" />
              </span>
              <input 
                type="text"
                placeholder="Ej: OC-902..."
                value={filtroOC}
                onChange={(e) => setFiltroOC(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 p-1.5 text-xs text-slate-250 font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Folio Pedido */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-450 block">
              Folio Pedido (ID)
            </label>
            <input 
              type="text"
              placeholder="Ej: PED-2026-200"
              value={filtroPedido}
              onChange={(e) => setFiltroPedido(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Modelo */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-450 block">
              Modelo EVA
            </label>
            <select
              value={filtroModelo}
              onChange={(e) => setFiltroModelo(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todos --</option>
              {modelOptions.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Color */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-450 block">
              Color Pigmento
            </label>
            <select
              value={filtroColor}
              onChange={(e) => setFiltroColor(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todos --</option>
              {colorOptions.map(col => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
          </div>

          {/* Fecha Alta */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-450 block">
              Fecha de Registro
            </label>
            <input 
              type="date"
              value={filtroFechaAlta}
              onChange={(e) => setFiltroFechaAlta(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1 text-xs text-slate-200 font-mono focus:outline-none"
            />
          </div>

          {/* Fecha Compromiso */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-450 block">
              Fecha Compromiso (SLA)
            </label>
            <input 
              type="date"
              value={filtroFechaCompromiso}
              onChange={(e) => setFiltroFechaCompromiso(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1 text-xs text-slate-200 font-mono focus:outline-none"
            />
          </div>

          {/* Estatus */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-450 block">
              Estado Comercial
            </label>
            <select
              value={filtroEstatus}
              onChange={(e) => setFiltroEstatus(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todos --</option>
              <option value="PENDIENTE">PENDIENTE</option>
              <option value="PROCESANDO">PROCESANDO</option>
              <option value="COMPLETADO">COMPLETADO</option>
              <option value="CANCELADO">CANCELADO</option>
            </select>
          </div>

          {/* Riesgo */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-450 block">
              Riesgo Estimado SLA
            </label>
            <select
              value={filtroRiesgo}
              onChange={(e) => setFiltroRiesgo(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todos --</option>
              <option value="VERDE">🟢 Bajo / En tiempo</option>
              <option value="AMARILLO">🟡 Medio (Riesgo)</option>
              <option value="ROJO">🔴 Alto / Vencido</option>
              <option value="GRIS">⚪ Sin fecha</option>
            </select>
          </div>

        </div>

        <div className="flex justify-end pt-2 border-t border-slate-900">
          <button
            onClick={handleClearFilters}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-white rounded-lg text-xs font-mono transition border border-slate-850 cursor-pointer text-right"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Limpiar Filtros
          </button>
        </div>
      </div>

      {/* 2. KPIS SUPERIORES */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-4">
        
        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1.5 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest block leading-tight">
            Pedidos Activos
          </span>
          <div className="text-2xl font-black font-mono text-cyan-400 leading-none">
            {activeOrders.length}
          </div>
          <span className="text-[9px] font-mono text-slate-550 block">En planta productiva</span>
        </div>

        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1.5 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest block leading-tight">
            Total Comprometido
          </span>
          <div className="text-2xl font-black font-mono text-slate-200 leading-none">
            {totalCommittedPairs.toLocaleString()}
          </div>
          <span className="text-[9px] font-mono text-slate-400 block pb-0">Pares activos</span>
        </div>

        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1.5 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest block leading-tight">
            Pares en Proceso
          </span>
          <div className="text-2xl font-black font-mono text-amber-500 leading-none">
            {totalInProcessPairs.toLocaleString()}
          </div>
          <span className="text-[9px] font-mono text-amber-550 block">WIP en manufactura</span>
        </div>

        <div className="p-4 bg-slate-905 border border-slate-900 rounded-xl space-y-1.5 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest block leading-tight">
            Pares Embarcados
          </span>
          <div className="text-2xl font-black font-mono text-emerald-400 leading-none">
            {totalShippedPairs.toLocaleString()}
          </div>
          <span className="text-[9px] font-mono text-slate-500 block">Completados liberados</span>
        </div>

        <div className="p-4 bg-slate-955 border border-slate-909 rounded-xl space-y-1.5 shadow-md">
          <span className="text-[10px] font-mono font-bold text-indigo-450 uppercase tracking-widest block leading-tight">
            Backlog Pendiente
          </span>
          <div className="text-2xl font-black font-mono text-indigo-400 leading-none">
            {pendingBacklog.toLocaleString()}
          </div>
          <span className="text-[9px] font-mono text-slate-500 block">En proceso - entregados</span>
        </div>

        <div className="p-4 bg-rose-950/10 border border-rose-950/40 rounded-xl space-y-1.5 shadow-md">
          <span className="text-[10px] font-mono font-bold text-rose-450 uppercase tracking-widest block leading-tight">
            Pedidos Vencidos Abiertos
          </span>
          <div className="text-2xl font-black font-mono text-red-500 leading-none animate-pulse">
            {overdueOrdersCount}
          </div>
          <span className="text-[9px] font-mono text-red-400 block">
            {overdueOpenPairs.toLocaleString()} pares pendientes
          </span>
        </div>

      </div>

      {/* 4. GRÁFICAS RECHARTS SECTION */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        
        {/* Grafica Stacked Bars */}
        <div className="xl:col-span-2 bg-slate-950 border border-slate-900 rounded-xl p-4 shadow-xl">
          <h3 className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider mb-2">
            Distribución de Pares por Etapa (Top 5 Pedidos Activos)
          </h3>
          <p className="text-[10px] text-slate-500 mb-4 font-sans leading-tight">
            Desglosado de calzado cargado actualmente por cada subestación de control industrial.
          </p>
          <div className="h-60 overflow-x-auto">
            {stackedChartData.length === 0 ? (
              <div className="h-full flex flex-col justify-center items-center text-slate-550">
                <span>Sin datos de pedidos</span>
              </div>
            ) : (
              <div className="w-full min-w-[340px] h-full">
              <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <RechartsBarChart
                  data={stackedChartData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                >
                  <RechartsCartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <RechartsXAxis dataKey="name" stroke="#64748b" style={{ fontSize: '9px', fontFamily: 'monospace' }} />
                  <RechartsYAxis stroke="#64748b" style={{ fontSize: '9px', fontFamily: 'monospace' }} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '8px' }}
                    labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 'bold' }}
                    itemStyle={{ fontSize: '10px' }}
                  />
                  <RechartsLegend wrapperStyle={{ fontSize: '8px', paddingTop: '10px' }} />
                  <RechartsBar dataKey="Alta Pedido" stackId="a" fill="#3b82f6" />
                  <RechartsBar dataKey="Almacén" stackId="a" fill="#64748b" />
                  <RechartsBar dataKey="Inyección" stackId="a" fill="#f59e0b" />
                  <RechartsBar dataKey="Estabilización" stackId="a" fill="#a855f7" />
                  <RechartsBar dataKey="Aduana" stackId="a" fill="#f43f5e" />
                  <RechartsBar dataKey="Banda" stackId="a" fill="#6366f1" />
                  <RechartsBar dataKey="Entrega" stackId="a" fill="#10b981" />
                </RechartsBarChart>
              </RechartsResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Grafica Avance Histórico Simulado */}
        <div className="xl:col-span-1 bg-slate-950 border border-slate-900 rounded-xl p-4 shadow-xl">
          <h3 className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider mb-2">
            Cantidad de pares producida por día
          </h3>
          <p className="text-[10px] text-slate-500 mb-4 font-sans leading-tight">
            Histórico FDB de pares producidos por día.
          </p>
          <div className="h-60 overflow-x-auto">
            {lineChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[10px] text-slate-600 font-mono">SIN DATOS FDB EN PERIODO</div>
            ) : (
            <div className="w-full min-w-[300px] h-full">
            <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <RechartsLineChart
                data={lineChartData}
                margin={{ top: 10, right: 15, left: -25, bottom: 5 }}
                >
                <RechartsCartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <RechartsXAxis dataKey="day" stroke="#64748b" style={{ fontSize: '9px' }} />
                <RechartsYAxis stroke="#64748b" style={{ fontSize: '9px' }} />
                <RechartsTooltip
                  contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '8px' }}
                  labelStyle={{ color: '#94a3b8', fontSize: '10px' }}
                  itemStyle={{ fontSize: '10px', color: '#22d3ee' }}
                />
                <RechartsLine type="monotone" dataKey="Pares Producidos" stroke="#06b6d4" strokeWidth={3} dot={{ r: 4 }} />
              </RechartsLineChart>
            </RechartsResponsiveContainer>
            </div>
            )}
          </div>
        </div>

        {/* Rankings Bar Charts */}
        <div className="xl:col-span-1 bg-slate-950 border border-slate-900 rounded-xl p-4 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider mb-3">
              Rankings Críticos de Carga
            </h3>
            
            {/* 1. Mayor Backlog */}
            <div className="space-y-2 mb-4">
              <span className="text-[10px] font-mono text-indigo-400 font-bold uppercase tracking-wider block">
                🚨 Mayor Backlog de Pares Pendientes
              </span>
              <div className="space-y-1.5">
                {backlogRanking.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-slate-900/50 px-2 py-1 rounded border border-slate-900 text-xs">
                    <span className="font-mono text-slate-300 font-bold">{item.name}</span>
                    <span className="font-mono text-indigo-300 font-bold">{(item.value).toLocaleString()} pares</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* 3. TABLA PRINCIPAL POR PEDIDO + PANEL DERECHO DE DETALLE */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        
        {/* Table Spreadsheet container (takes column spanning 3) */}
        <div className="xl:col-span-3 bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-2xl flex flex-col justify-between overflow-hidden">
          
          <div className="space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Building className="w-4 h-4 text-cyan-500" />
                <h3 className="text-sm font-black text-slate-200 uppercase font-mono tracking-tight">
                  Sábanas de Datos: Consolidación SLA de Pedidos
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">
                Mostrando {filteredOrders.length} registros activos
              </span>
            </div>

            {/* Core Table View Scroll */}
            <div className="overflow-x-auto border border-slate-900 rounded-lg scrollbar-thin">
              <table className="w-full text-left border-collapse select-none">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-800 text-[10px] font-mono text-slate-400 uppercase tracking-wider leading-none">
                    <th className="py-3 px-3 min-w-[130px] font-bold">Cliente</th>
                    <th className="py-3 px-3 min-w-[90px] font-bold">Compra OC</th>
                    <th className="py-3 px-3 min-w-[110px] font-bold">Folio Pedido</th>
                    <th className="py-3 px-3 min-w-[90px] font-bold">Fecha Alta</th>
                    <th className="py-3 px-3 min-w-[100px] font-bold">Fecha Comp.</th>
                    <th className="py-3 px-3 min-w-[90px] font-bold text-right">Total Pares</th>
                    <th className="py-3 px-2 min-w-[65px] text-center text-blue-400 font-extrabold bg-blue-950/10">Alta</th>
                    <th className="py-3 px-2 min-w-[65px] text-center text-slate-350 font-extrabold bg-slate-900/10">Alm.</th>
                    <th className="py-3 px-2 min-w-[65px] text-center text-amber-500 font-extrabold bg-amber-950/10">Inye.</th>
                    <th className="py-3 px-2 min-w-[65px] text-center text-purple-400 font-extrabold bg-purple-950/10">Est.</th>
                    <th className="py-3 px-2 min-w-[65px] text-center text-rose-450 font-extrabold bg-rose-950/10">Adu.</th>
                    <th className="py-3 px-2 min-w-[65px] text-center text-indigo-400 font-extrabold bg-indigo-950/10">Bnd.</th>
                    <th className="py-3 px-2 min-w-[65px] text-center text-emerald-400 font-extrabold bg-emerald-950/10">Emb.</th>
                    <th className="py-3 px-3 min-w-[95px] font-bold">Estatus</th>
                    <th className="py-3 px-3 min-w-[105px] font-bold">Riesgo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900 text-[11px] font-mono">
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="py-12 text-center text-slate-500 text-xs">
                        ⚠️ No se encontraron pedidos con los criterios ingresados.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map(o => {
                      const isSelected = activeSelectedOrder?.id === o.id;
                      const dateAlta = o.fechaAlta?.split('T')[0] || o.createdAt?.split('T')[0] || 'N/A';
                      const dateComp = o.fechaCompromiso?.split('T')[0] || o.deliveryDate?.split('T')[0] || 'N/A';
                      
                      // Risk Badge Styling
                      let riskStyle = "bg-emerald-950/40 text-emerald-400 border border-emerald-800/40";
                      let riskText = "🟢 Bajo";
                      if (o.risk === 'ROJO') {
                        riskStyle = "bg-rose-950/40 text-rose-400 border border-rose-800/40";
                        riskText = "🔴 Alto / Venc.";
                      } else if (o.risk === 'AMARILLO') {
                        riskStyle = "bg-amber-950/40 text-amber-500 border border-amber-850/40";
                        riskText = "🟡 Medio";
                      } else if (o.risk === 'GRIS') {
                        riskStyle = "bg-slate-900/60 text-slate-400 border border-slate-800";
                        riskText = "⚪ Sin sLA";
                      }

                      return (
                        <tr 
                          key={o.id}
                          onClick={() => setSelectedOrderId(o.id)}
                          className={`hover:bg-slate-900/60 transition cursor-pointer ${isSelected ? 'bg-slate-900 border-l-4 border-l-cyan-500' : ''}`}
                        >
                          <td className="py-3 px-3 font-sans font-medium text-slate-350 truncate max-w-[150px]" title={o.cliente || o.clientName}>{o.cliente || o.clientName}</td>
                          <td className="py-3 px-3 text-slate-400">{o.oc || 'N/A'}</td>
                          <td className="py-3 px-3 font-bold text-cyan-400 font-mono">{o.id}</td>
                          <td className="py-3 px-3 text-slate-450">{dateAlta}</td>
                          <td className="py-3 px-3 text-slate-300 font-semibold">{dateComp}</td>
                          <td className="py-3 px-3 text-right font-black text-slate-100">{o.totalPares.toLocaleString()}</td>
                          
                          {/* 7 Stage details mapped individually with custom background densities */}
                          <td className="py-3 px-2 text-center text-blue-300 bg-blue-950/5">{(o.pairsByStage['alta_pedido'] || 0).toLocaleString()}</td>
                          <td className="py-3 px-2 text-center text-slate-300 bg-slate-900/5">{(o.pairsByStage['almacen'] || 0).toLocaleString()}</td>
                          <td className="py-3 px-2 text-center text-amber-400 bg-amber-950/5">{(o.pairsByStage['inyeccion'] || 0).toLocaleString()}</td>
                          <td className="py-3 px-2 text-center text-purple-300 bg-purple-950/5">{(o.pairsByStage['estabilizacion'] || 0).toLocaleString()}</td>
                          <td className="py-3 px-2 text-center text-rose-300 bg-rose-950/5">{(o.pairsByStage['aduana'] || 0).toLocaleString()}</td>
                          <td className="py-3 px-2 text-center text-indigo-300 bg-indigo-950/5">{(o.pairsByStage['banda'] || 0).toLocaleString()}</td>
                          <td className="py-3 px-2 text-center text-emerald-400 bg-emerald-950/5">{(o.pairsByStage['embarque'] || 0).toLocaleString()}</td>
                          
                          <td className="py-3 px-3">
                            <span className="px-1.5 py-0.5 rounded-md uppercase font-black text-[9px] bg-slate-900 text-slate-300 border border-slate-800">
                              {o.status}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${riskStyle}`}>
                              {riskText}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

          </div>

          <div className="pt-4 flex justify-between items-center text-xs text-slate-500 font-mono border-t border-slate-900 mt-4">
            <span>Vista conserva riesgo por pedido y pares por etapa.</span>
          </div>

        </div>

        {/* 5. PANEL DE DETALLE LATERAL (Based on Selected Row / Default first) */}
        <div className="xl:col-span-1">
          {activeSelectedOrder ? (
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-2xl space-y-5 sticky top-6">
              
              {/* Detail Header */}
              <div className="border-b border-slate-900 pb-3">
                <span className="text-[9px] font-mono text-cyan-400 font-bold uppercase tracking-widest block">
                  Panel Diagnosticador de Pedido
                </span>
                <div className="flex justify-between items-center mt-0.5">
                  <h3 className="text-base font-bold font-mono text-slate-100 uppercase">
                    {activeSelectedOrder.id}
                  </h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                    activeSelectedOrder.status === 'COMPLETADO' ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800' :
                    activeSelectedOrder.status === 'PROCESANDO' ? 'bg-cyan-950/40 text-cyan-400 border border-cyan-800' : 'bg-slate-900/40 text-slate-400'
                  }`}>
                    {activeSelectedOrder.status}
                  </span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                  <span>OC: {activeSelectedOrder.oc || 'Sin registro'}</span>
                  <span>Lotes: {activeSelectedOrder.batchesCount} activos</span>
                </div>
              </div>

              {/* General details data list */}
              <div className="space-y-4">
                
                {/* 1. Datos Generales */}
                <div className="space-y-1">
                  <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest block leading-tight">
                    Datos del Cliente
                  </span>
                  <div className="bg-slate-900/40 border border-slate-900 rounded-lg p-2.5 text-xs space-y-1">
                    <div className="flex justify-between select-text text-slate-350">
                      <span>Razón Social:</span>
                      <strong className="text-slate-100 truncate max-w-[130px] font-sans" title={activeSelectedOrder.cliente || activeSelectedOrder.clientName}>{activeSelectedOrder.cliente || activeSelectedOrder.clientName}</strong>
                    </div>
                    <div className="flex justify-between text-slate-350">
                      <span>Pares Entregados:</span>
                      <strong className="text-emerald-400 font-mono font-black">{activeSelectedOrder.shippedPairs.toLocaleString()}</strong>
                    </div>
                    <div className="flex justify-between text-slate-350">
                      <span>Alta del Folio:</span>
                      <span className="font-mono text-slate-300">{activeSelectedOrder.fechaAlta?.split('T')[0] || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between text-slate-350">
                      <span>Límite Compromiso:</span>
                      <span className="font-mono text-slate-100 font-bold">{activeSelectedOrder.fechaCompromiso?.split('T')[0] || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                {/* 2. D3 Stage distribution visualization */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest block leading-tight">
                    Inventario de Calzado por Etapa
                  </span>
                  <D3OrderTimeline stagesData={selectedStagesArray} />
                </div>

                {/* 3. Entrega y WIP */}
                <div className="bg-slate-900/40 border border-slate-900 rounded-lg p-3 text-xs space-y-1">
                  <div className="flex justify-between text-slate-350">
                    <span>Pares Embarcados (Prs):</span>
                    <strong className="text-emerald-400 font-mono">{activeSelectedOrder.shippedPairs.toLocaleString()}</strong>
                  </div>
                  <div className="flex justify-between text-slate-350">
                    <span>Pares Resto WIP (Prs):</span>
                    <strong className="text-indigo-400 font-mono">{activeSelectedOrder.inProcessPairs.toLocaleString()}</strong>
                  </div>
                </div>

                {/* 5. Defectos reportados en lotes asociados */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest block leading-tight">
                      Alertas de Calidad (Merma)
                    </span>
                    <span className="text-[9px] font-mono text-slate-500">
                      Total: {associatedDefects.length}
                    </span>
                  </div>
                  
                  {associatedDefects.length === 0 ? (
                    <div className="bg-slate-950/20 border border-slate-900/60 rounded p-2 text-center text-[10px] text-emerald-500 font-mono">
                      ✓ Cero defectos reportados en lotes asociados
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                      {associatedDefects.map(d => (
                        <div key={d.id} className="flex justify-between items-center bg-rose-950/15 border border-rose-955/20 px-2 py-1 rounded text-[10px] font-mono">
                          <span className="text-rose-400 truncate max-w-[120px]">{d.batchId}: {d.defectType}</span>
                          <span className={`text-[8px] font-bold px-1 rounded uppercase ${
                            d.severity === 'GRAVE' ? 'bg-red-800 text-white' : 'bg-amber-600 text-slate-950'
                          }`}>{d.severity}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 6. Riesgo estimado de entrega */}
                <div className="pt-2 border-t border-slate-900">
                  <div className={`p-3 rounded-lg border flex items-start gap-2 text-xs ${
                    activeSelectedOrder.risk === 'ROJO' ? 'bg-rose-950/20 border-rose-800/50 text-rose-300' :
                    activeSelectedOrder.risk === 'AMARILLO' ? 'bg-amber-950/20 border-amber-800/50 text-amber-300' : 'bg-emerald-950/20 border-emerald-800/50 text-emerald-300'
                  }`}>
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <strong className="font-black uppercase tracking-wider block font-sans">
                        Rango de Riesgo: {
                          activeSelectedOrder.risk === 'ROJO' ? 'Fuerte Demora / Expirado' :
                          activeSelectedOrder.risk === 'AMARILLO' ? 'Mediana Desviación' : 'Rango Óptimo de Entrega'
                        }
                      </strong>
                      <p className="text-[10px] font-sans leading-normal text-slate-400">
                        {activeSelectedOrder.risk === 'ROJO' ? 'Se requiere re-planificación urgente, desvío de máquina inyectora EVA o incremento manual de volumen de operarios.' :
                         activeSelectedOrder.risk === 'AMARILLO' ? 'Existen pocas mermas pero la velocidad actual de la banda es reducida. Continuar monitorizando amortiguador.' : 'El pedido fluye en tiempo adecuado bajo las políticas de SLA pactadas con el distribuidor comercial.'}
                      </p>
                    </div>
                  </div>
                </div>

              </div>

            </div>
          ) : (
            <div className="bg-slate-950 border border-slate-900 rounded-xl p-8 shadow-2xl space-y-3 text-center text-slate-500">
              <Layers className="w-8 h-8 mx-auto text-slate-700 animate-pulse" />
              <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest block">Consola Vacía</span>
              <p className="text-xs">Selecciona un folio del listado principal para auditar sus lotes y curvas dD3.</p>
            </div>
          )}
        </div>

      </div>

    </div>
  );
};

/* 4. Producción por Área View */

interface HourlyProductionLog {
  id: string;
  tenantId: string;
  fecha: string;        // YYYY-MM-DD
  hora: string;         // HH:00
  turno: 'MAÑANA' | 'TARDE' | 'NOCHE';
  area: 'almacen' | 'inyeccion' | 'aduana' | 'banda' | 'embarque' | 'entregas' | 'salidas_tercera';
  tarjetaViajera: string;
  responsable: string;
  modeloName: string;
  color: string;
  metaHora: number;
  produccionReal: number;
  reprocesos: number;
  segundas: number;
  maquinaId?: string;
  bandaId?: string;
}

// Helper to seed realistic records for any given tenant
export const ProduccionAreaView: React.FC = () => {
  const { currentTenant, addAuditLog, machines, bands, users, can, getGoalForAreaTurn } = useDashboard();

  const [logs, setLogs] = useState<HourlyProductionLog[]>([]);

  useEffect(() => {
    setLogs([]);
  }, [currentTenant.id]);

  const updateLogsState = (newLlogs: HourlyProductionLog[]) => {
    setLogs(newLlogs);
  };

  // 1. Selector de Área (Horizontal tabs)
  const [activeArea, setActiveArea] = useState<'TODAS' | HourlyProductionLog['area']>('TODAS');

  // 2. Vista histórica timescale selector
  // 'tiempo_real' | 'dia' | 'semana' | 'mes' | 'rango'
  const [timeframe, setTimeframe] = useState<'tiempo_real' | 'dia' | 'semana' | 'mes' | 'rango'>('rango');

  // 3. Filters States
  const [filtroTurno, setFiltroTurno] = useState<string>('');
  const [filtroResponsable, setFiltroResponsable] = useState<string>('');
  const [filtroModelo, setFiltroModelo] = useState<string>('');
  const [filtroColor, setFiltroColor] = useState<string>('');
  const [filtroMaquina, setFiltroMaquina] = useState<string>('');
  const [filtroBanda, setFiltroBanda] = useState<string>('');
  
  const [selectedFecha, setSelectedFecha] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [rangoInicio, setRangoInicio] = useState<string>(() => new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10));
  const [rangoFin, setRangoFin] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [operationalData, setOperationalData] = useState<ErpOperationalResponse | null>(null);

  const getProductionQueryRange = (): [string, string] => {
    if (timeframe === 'rango') return [rangoInicio, rangoFin];
    if (timeframe === 'semana' || timeframe === 'mes') {
      const start = new Date(`${selectedFecha}T00:00:00`);
      start.setDate(start.getDate() - (timeframe === 'semana' ? 7 : 30));
      return [start.toISOString().slice(0, 10), selectedFecha];
    }
    return [selectedFecha, selectedFecha];
  };

  useEffect(() => {
    if (!backendEnabled) return;
    const [start, end] = getProductionQueryRange();
    let cancelled = false;
    dashboardApi.erpOperativo(start, end)
      .then(data => { if (!cancelled) setOperationalData(data); })
      .catch(err => console.warn('Produccion por area: ERP operativo fetch failed', err));
    return () => { cancelled = true; };
  }, [timeframe, selectedFecha, rangoInicio, rangoFin]);

  // 4. Modal de nuevo registro state
  const [showAddLogModal, setShowAddLogModal] = useState(false);
  const [formArea, setFormArea] = useState<HourlyProductionLog['area']>('inyeccion');
  const [formTarjetaViajera, setFormTarjetaViajera] = useState('');
  const [formFecha, setFormFecha] = useState('');
  const [formHora, setFormHora] = useState('');
  const [formTurno, setFormTurno] = useState<HourlyProductionLog['turno']>('MAÑANA');
  const [formResponsable, setFormResponsable] = useState('');
  const [formModelo, setFormModelo] = useState('');
  const [formColor, setFormColor] = useState('');
  const [formMeta, setFormMeta] = useState(0);
  const [formReal, setFormReal] = useState(0);
  const [formReprocesos, setFormReprocesos] = useState(0);
  const [formSegundas, setFormSegundas] = useState(0);
  const [formMaquina, setFormMaquina] = useState('');
  const [formBanda, setFormBanda] = useState('');

  // Area mapped label names
  const AREA_NAMES: Record<string, string> = {
    'almacen': 'Almacén',
    'inyeccion': 'Inyección',
    'aduana': 'Aduana',
    'banda': 'Banda',
    'embarque': 'Embarque',
    'entregas': 'Entregas',
    'salidas_tercera': 'Salidas de tercera'
  };

  const AREA_COLORS: Record<string, string> = {
    'almacen': '#64748b',
    'inyeccion': '#f59e0b',
    'aduana': '#f43f5e',
    'banda': '#6366f1',
    'embarque': '#10b981',
    'entregas': '#14b8a6',
    'salidas_tercera': '#f97316'
  };

  const areaKeyFromErp = (area: string): HourlyProductionLog['area'] => {
    const upper = area.toUpperCase();
    if (upper.includes('ALMAC')) return 'almacen';
    if (upper.includes('INYE')) return 'inyeccion';
    if (upper.includes('ADUANA') || upper.includes('CALIDAD')) return 'aduana';
    if (upper.includes('BANDA')) return 'banda';
    if (upper.includes('EMBAR')) return 'embarque';
    if (upper.includes('FACT') || upper.includes('ENTREGA')) return 'entregas';
    if (upper.includes('TERCERA')) return 'salidas_tercera';
    return 'inyeccion';
  };

  const turnoFromErp = (turno: string): HourlyProductionLog['turno'] => {
    if (turno === '1') return 'MAÑANA';
    if (turno === '2') return 'TARDE';
    return 'NOCHE';
  };

  const qualityByProductionKey = new Map<string, { reprocesos: number; segundas: number }>();
  for (const q of operationalData?.quality ?? []) {
    const key = `${q.fecha}|${q.modelo}|${areaKeyFromErp(q.area)}`;
    const current = qualityByProductionKey.get(key) ?? { reprocesos: 0, segundas: 0 };
    current.reprocesos += q.reproceso;
    current.segundas += q.segundas;
    qualityByProductionKey.set(key, current);
  }

  const fdbProductionLogs: HourlyProductionLog[] = (operationalData?.productionHourly ?? []).map((row, index) => {
    const area = areaKeyFromErp(row.area);
    const q = qualityByProductionKey.get(`${row.fecha}|${row.modelo}|${area}`) ?? { reprocesos: 0, segundas: 0 };
    return {
      id: row.id || `fdb_${row.fecha}_${row.hora}_${area}_${index}`,
      tenantId: currentTenant.id,
      fecha: row.fecha,
      hora: row.hora,
      turno: turnoFromErp(row.turno),
      area,
      tarjetaViajera: row.tarjetaViajera || 'FDB-AGG',
      responsable: row.responsable || 'FDB',
      modeloName: row.modelo,
      color: row.color,
      metaHora: row.metaHora,
      produccionReal: row.produccionReal,
      reprocesos: q.reprocesos,
      segundas: q.segundas
    };
  });
  const allProductionLogs = fdbProductionLogs;
  void logs;

  // Distinct values for filter options
  const activeResponsables = users.filter(user => user.active).map(user => user.username);
  const uniqueResponsables = activeResponsables.length > 0 ? activeResponsables : Array.from(new Set(allProductionLogs.map(l => l.responsable))).filter(Boolean);
  const uniqueModels = Array.from(new Set(allProductionLogs.map(l => l.modeloName))).filter(Boolean);
  const uniqueColors = Array.from(new Set(allProductionLogs.map(l => l.color))).filter(Boolean);

  // Time-aware filtering based on historical view selector
  const getFilteredLogsByTime = () => {
    return allProductionLogs.filter(log => {
      // Strict isolation: only this tenant
      if (log.tenantId !== currentTenant.id) return false;

      const dateStr = log.fecha;
      if (timeframe === 'tiempo_real') {
        return dateStr === new Date().toISOString().slice(0, 10);
      } else if (timeframe === 'dia') {
        return dateStr === selectedFecha;
      } else if (timeframe === 'semana') {
        // Past 7 days from selectedFecha
        const currentSelected = new Date(selectedFecha);
        const limit = new Date(selectedFecha);
        limit.setDate(limit.getDate() - 7);
        const logDate = new Date(dateStr);
        return logDate >= limit && logDate <= currentSelected;
      } else if (timeframe === 'mes') {
        // Past 30 days from selectedFecha
        const currentSelected = new Date(selectedFecha);
        const limit = new Date(selectedFecha);
        limit.setDate(limit.getDate() - 30);
        const logDate = new Date(dateStr);
        return logDate >= limit && logDate <= currentSelected;
      } else if (timeframe === 'rango') {
        return dateStr >= rangoInicio && dateStr <= rangoFin;
      }
      return true;
    });
  };

  // Filter logs step 2 (Area selector + Filter dropdown inputs)
  const timeFilteredLogs = getFilteredLogsByTime();

  const finalFilteredLogs = timeFilteredLogs.filter(log => {
    // Area Tab Filter
    if (!AREA_NAMES[log.area]) return false;
    if (activeArea !== 'TODAS' && log.area !== activeArea) return false;

    // Filter properties
    if (filtroTurno && log.turno !== filtroTurno) return false;
    if (filtroResponsable && !log.responsable.toLowerCase().includes(filtroResponsable.toLowerCase())) return false;
    if (filtroModelo && log.modeloName !== filtroModelo) return false;
    if (filtroColor && log.color !== filtroColor) return false;
    
    // Machine/Band filters
    if (activeArea === 'inyeccion' || log.area === 'inyeccion') {
      if (filtroMaquina && log.maquinaId !== filtroMaquina) return false;
    }
    if (activeArea === 'banda' || log.area === 'banda') {
      if (filtroBanda && log.bandaId !== filtroBanda) return false;
    }

    return true;
  });
  const configuredFilteredLogs = finalFilteredLogs.map(log => ({
    ...log,
    metaHora: getGoalForAreaTurn(log.area, log.turno)?.metaHora || log.metaHora
  }));

  const controlLogsMap = new Map<string, HourlyProductionLog>();
  configuredFilteredLogs.forEach(log => {
    const key = `${log.fecha}|${log.hora}|${log.turno}|${log.area}`;
    const current = controlLogsMap.get(key);
    if (current) {
      current.produccionReal += log.produccionReal;
      current.reprocesos += log.reprocesos;
      current.segundas += log.segundas;
      return;
    }
    controlLogsMap.set(key, {
      ...log,
      id: `fdb_hour_${key}`,
      tarjetaViajera: 'FDB-HORA',
      responsable: 'FDB',
      modeloName: 'Consolidado',
      color: 'Todos'
    });
  });
  const groupedHourlyLogs = Array.from(controlLogsMap.values()).sort((a, b) =>
    a.fecha.localeCompare(b.fecha) ||
    a.hora.localeCompare(b.hora) ||
    a.area.localeCompare(b.area)
  );

  // Calculate top KPIs
  const totalRealProduction = configuredFilteredLogs.reduce((sum, l) => sum + l.produccionReal, 0);
  const totalTargetProduction = groupedHourlyLogs.reduce((sum, l) => sum + l.metaHora, 0);
  const metaCompliance = totalTargetProduction > 0 ? Math.round((totalRealProduction / totalTargetProduction) * 100) : 0;
  
  // Production average per hour
  const distinctLoggedCount = groupedHourlyLogs.length || 1;
  const avgProductionPerHour = Math.round(totalRealProduction / distinctLoggedCount);

  // Best / Worst productive hour segments
  // Group by hour
  const hourVolumes: Record<string, number> = {};
  groupedHourlyLogs.forEach(l => {
    hourVolumes[l.hora] = (hourVolumes[l.hora] || 0) + l.produccionReal;
  });
  
  let bestHour = 'N/A';
  let bestVal = -1;
  let worstHour = 'N/A';
  let worstVal = Infinity;

  Object.entries(hourVolumes).forEach(([h, val]) => {
    if (val > bestVal) {
      bestVal = val;
      bestHour = h;
    }
    if (val < worstVal) {
      worstVal = val;
      worstHour = h;
    }
  });

  if (bestVal === -1) bestHour = 'N/A';
  if (worstVal === Infinity) worstHour = 'N/A';

  // Unrecorded timeline calculation (Tiempo sin registro)
  // Check unique hours of selectedDate (defaults to '2026-05-25')
  const loggedHoursOfSelectedDay = Array.from(new Set(
    allProductionLogs.filter(l => l.tenantId === currentTenant.id && l.fecha === selectedFecha && (activeArea === 'TODAS' || l.area === activeArea))
        .map(l => l.hora.split(':')[0])
  ));
  const unloggedHoursCount = Math.max(0, 24 - loggedHoursOfSelectedDay.length);
  const tiempoSinRegistroMinutos = unloggedHoursCount * 60;

  // Average Efficiency across matching records
  const avgEfficiency = totalTargetProduction > 0 ? Math.round((totalRealProduction / totalTargetProduction) * 100) : 0;

  // Waste indicators
  const totalReprocesos = configuredFilteredLogs.reduce((sum, l) => sum + l.reprocesos, 0);
  const totalSegundas = configuredFilteredLogs.reduce((sum, l) => sum + l.segundas, 0);

  // Submission handler for new Hourly Production log
  const handleAddHourlyLogSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newEntryId = `log_${currentTenant.id}_${formFecha}_${formArea}_${formHora.replace(':', '')}_${Date.now()}`;
    const entry: HourlyProductionLog = {
      id: newEntryId,
      tenantId: currentTenant.id,
      fecha: formFecha,
      hora: formHora,
      turno: formTurno,
      area: formArea,
      tarjetaViajera: formTarjetaViajera,
      responsable: formResponsable,
      modeloName: formModelo,
      color: formColor,
      metaHora: Number(formMeta),
      produccionReal: Number(formReal),
      reprocesos: Number(formReprocesos),
      segundas: Number(formSegundas),
      maquinaId: formArea === 'inyeccion' ? formMaquina : undefined,
      bandaId: formArea === 'banda' ? formBanda : undefined
    };

    const updated = [entry, ...logs];
    updateLogsState(updated);
    
    addAuditLog(
      'PRODUCCION',
      'ADD_HOURLY_REPORT',
      `Registrado log horario operativo en planta para área [${AREA_NAMES[formArea]}] - ${formReal} pars.`
    );

    setShowAddLogModal(false);
    alert(`⚡ Reporte horario grabado con éxito. Los KPIs y curvas se han actualizado con aislamiento riguroso.`);
  };

  const handleClearAllFilters = () => {
    setActiveArea('TODAS');
    setFiltroTurno('');
    setFiltroResponsable('');
    setFiltroModelo('');
    setFiltroColor('');
    setFiltroMaquina('');
    setFiltroBanda('');
    setSelectedFecha(new Date().toISOString().slice(0, 10));
    setRangoInicio(new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10));
    setRangoFin(new Date().toISOString().slice(0, 10));
  };

  // --- RECHARTS DATA WRAPPERS ---
  
  // 1. Producción por Hora
  // Map hours chronologically
  const hoursSorted = Array.from(new Set(groupedHourlyLogs.map(l => l.hora))).sort();
  const prodHourChartData = hoursSorted.map(h => {
    const filteredByHour = groupedHourlyLogs.filter(l => l.hora === h);
    const real = filteredByHour.reduce((sum, l) => sum + l.produccionReal, 0);
    const meta = filteredByHour.reduce((sum, l) => sum + l.metaHora, 0);
    return { hour: h, 'Producción': real, 'Meta': meta };
  });

  // 2. Meta vs Real Acumulado
  let accumulatedReal = 0;
  let accumulatedMeta = 0;
  const prodAccumulatedChartData = hoursSorted.map(h => {
    const filteredByHour = groupedHourlyLogs.filter(l => l.hora === h);
    const real = filteredByHour.reduce((sum, l) => sum + l.produccionReal, 0);
    const meta = filteredByHour.reduce((sum, l) => sum + l.metaHora, 0);
    accumulatedReal += real;
    accumulatedMeta += meta;
    return { hour: h, 'Real Acumulado': accumulatedReal, 'Meta Acumulada': accumulatedMeta };
  });

  // 3. Producción por Área
  const prodByAreaChartData = Object.entries(AREA_NAMES).map(([key, value]) => {
    const areaLogs = groupedHourlyLogs.filter(l => l.area === key);
    const realSum = areaLogs.reduce((sum, l) => sum + l.produccionReal, 0);
    return { name: value, 'Pares': realSum };
  });

  // 4. Producción por Responsable
  const repsMap: Record<string, number> = {};
  groupedHourlyLogs.forEach(l => {
    repsMap[l.responsable] = (repsMap[l.responsable] || 0) + l.produccionReal;
  });
  const prodByRepChartData = Object.entries(repsMap).map(([name, val]) => ({
    name: name.split(' ')[0], // short name
    'Pares': val
  })).sort((a, b) => b['Pares'] - a['Pares']).slice(0, 5);

  // 5. Producción por Modelo
  const modelsMap: Record<string, number> = {};
  configuredFilteredLogs.forEach(l => {
    modelsMap[l.modeloName] = (modelsMap[l.modeloName] || 0) + l.produccionReal;
  });
  const prodByModelChartData = Object.entries(modelsMap).map(([name, val]) => ({
    name,
    'Pares': val
  })).sort((a, b) => b['Pares'] - a['Pares']).slice(0, 5);

  // 6. Eficiencia por Turno
  const shiftEffMap: Record<string, { real: number; target: number }> = {
    'MAÑANA': { real: 0, target: 0 },
    'TARDE': { real: 0, target: 0 },
    'NOCHE': { real: 0, target: 0 }
  };
  groupedHourlyLogs.forEach(l => {
    if (!shiftEffMap[l.turno]) return;
    shiftEffMap[l.turno].real += l.produccionReal;
    shiftEffMap[l.turno].target += l.metaHora;
  });
  const efficiencyByShiftChartData = Object.entries(shiftEffMap).map(([shiftName, data]) => ({
    shift: shiftName,
    'Eficiencia %': data.target > 0 ? Math.round((data.real / data.target) * 100) : 0
  }));

  return (
    <div className="space-y-6">

      {/* HEADER SECTION WITH DETAILED METADATA */}
      <div className="flex justify-between items-center bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-xl flex-wrap gap-4">
        <div>
          <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-widest font-bold block mb-1">
            CONTROL DE EFICIENCIA OPERACIONAL POR TURNO Y SUBESTACIÓN
          </span>
          <h2 className="text-xl font-black font-sans text-slate-100 uppercase tracking-tight leading-none mb-1 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-505 bg-indigo-500 animate-pulse"></span>
            Monitoreo de Producción y Eficiencia
          </h2>
          <p className="text-xs text-slate-400 font-sans">
            Métricas reales de inyección y terminado, velocidad de m/s en bandas y mermas locales del tenant: <strong className="text-slate-350">{currentTenant.name}</strong>.
          </p>
        </div>

        <div className="flex gap-2">
          {!backendEnabled && can('produccion_area.create_log') && (
            <button
              onClick={() => setShowAddLogModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-650 hover:bg-indigo-600 text-slate-950 font-sans font-extrabold rounded-lg text-xs tracking-wide transition cursor-pointer"
            >
              <PlusCircle className="w-4 h-4 text-slate-950" />
              Registrar Log Horario
            </button>
          )}
          {backendEnabled && (
            <span className="px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-[10px] text-slate-400 font-mono font-bold uppercase">
              FDB automático
            </span>
          )}
        </div>
      </div>

      {/* 7. VISTA HISTÓRICA TIMELINE SELECTOR CONTROLS */}
      <div className="flex bg-slate-950 border border-slate-900 p-2 rounded-xl justify-between items-center flex-wrap gap-3">
        <div className="flex bg-slate-900 p-1 rounded-lg gap-1 border border-slate-850">
          {(['tiempo_real', 'dia', 'semana', 'mes', 'rango'] as const).map(option => (
            <button
              key={option}
              onClick={() => {
                setTimeframe(option);
                addAuditLog('PRODUCCION', 'TIMEFRAME_SWAP', `Cambio de intervalo histórico a default: ${option}`);
              }}
              className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition font-mono tracking-wider cursor-pointer select-none ${
                timeframe === option 
                  ? 'bg-indigo-600 text-white font-black' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-850'
              }`}
            >
              {option === 'tiempo_real' ? '⚡ Tiempo Real' : option === 'dia' ? '📅 Día' : option === 'semana' ? '🗓️ Semana' : option === 'mes' ? '📊 Mes' : '📏 Rango'}
            </button>
          ))}
        </div>

        {/* Dynamic Context Settings for Time Selectors based on picked choice */}
        <div className="flex items-center gap-2 flex-wrap">
          {timeframe === 'dia' && (
            <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
              <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">FECHA:</span>
              <input 
                type="date"
                value={selectedFecha}
                onChange={(e) => setSelectedFecha(e.target.value)}
                className="bg-transparent border-none text-xs text-slate-200 font-mono focus:outline-none"
              />
            </div>
          )}

          {timeframe === 'tiempo_real' && (
            <div className="flex items-center gap-2 text-xs text-indigo-400 font-bold bg-indigo-950/20 px-3 py-1.5 rounded-lg border border-indigo-900/40 font-mono animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
              LIVE FEED • MONITOREO EN CURSO (HOY: {new Date().toISOString().slice(0, 10)})
            </div>
          )}

          {timeframe === 'rango' && (
            <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800 flex-wrap">
              <span className="text-[10px] font-mono text-slate-500 font-bold">DESDE:</span>
              <input 
                type="date"
                value={rangoInicio}
                onChange={(e) => setRangoInicio(e.target.value)}
                className="bg-transparent border-none text-xs text-slate-200 font-mono focus:outline-none"
              />
              <span className="text-[10px] font-mono text-slate-500 font-bold text-center">HASTA:</span>
              <input 
                type="date"
                value={rangoFin}
                onChange={(e) => setRangoFin(e.target.value)}
                className="bg-transparent border-none text-xs text-slate-200 font-mono focus:outline-none"
              />
            </div>
          )}

          {(timeframe === 'semana' || timeframe === 'mes') && (
            <div className="text-[10px] font-mono text-slate-500 italic">
              * Calculado a partir de la fecha de anclaje: {selectedFecha}
            </div>
          )}
        </div>
      </div>

      {/* 3. SELECTOR DE ÁREA (GOLD STANDARD HORIZONTAL TABS) */}
      <div className="space-y-1">
        <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest pl-2">Estación de Manufactura Activa</span>
        <div className="flex flex-wrap bg-slate-950/40 p-1 border border-slate-900 rounded-xl gap-1">
          <button
            onClick={() => setActiveArea('TODAS')}
            className={`flex-1 min-w-[100px] text-center py-2.5 px-3 rounded-lg text-xs font-bold font-sans uppercase tracking-tight transition cursor-pointer ${
              activeArea === 'TODAS'
                ? 'bg-slate-850 text-white ring-1 ring-slate-700 shadow-md font-extrabold'
                : 'text-slate-450 hover:bg-slate-900/60 hover:text-slate-200'
            }`}
          >
            🏢 Todas las Áreas
          </button>
          {Object.entries(AREA_NAMES).map(([key, value]) => {
            const isSelected = activeArea === key;
            const markerColor = AREA_COLORS[key] || '#cccccc';
            return (
              <button
                key={key}
                onClick={() => setActiveArea(key as any)}
                className={`flex-1 min-w-[110px] text-center py-2.5 px-3 rounded-lg text-xs font-bold font-sans uppercase tracking-tight transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-slate-800 text-white ring-1 ring-slate-700 shadow-md font-black'
                    : 'text-slate-450 hover:bg-slate-900/60 hover:text-slate-200'
                }`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: markerColor }}></span>
                {value}
              </button>
            );
          })}
        </div>
      </div>

      {/* 1. FILTROS SUPERIORES COMPLETO */}
      <div className="bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-900 pb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-indigo-500" />
            <h3 className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider">
              Consola Operativa de Filtrado Avanzado
            </h3>
          </div>
          <button
            onClick={handleClearAllFilters}
            className="text-[10px] bg-slate-905 bg-slate-900 hover:bg-slate-850 px-2 py-1 text-slate-400 hover:text-white border border-slate-850 rounded font-mono transition inline-flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            Limpiar Filtros
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          
          {/* Turno */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Turno Trabajo</label>
            <select
              value={filtroTurno}
              onChange={(e) => setFiltroTurno(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todos --</option>
              <option value="MAÑANA">🌅 Mañana</option>
              <option value="TARDE">🌇 Tarde</option>
              <option value="NOCHE">🌃 Noche</option>
            </select>
          </div>

          {/* Responsable */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Supervisor/Responsable</label>
            <select
              value={filtroResponsable}
              onChange={(e) => setFiltroResponsable(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="">-- Todos --</option>
              {uniqueResponsables.map((r, i) => (
                <option key={i} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {/* Modelo */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Modelo EVA</label>
            <select
              value={filtroModelo}
              onChange={(e) => setFiltroModelo(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todos --</option>
              {uniqueModels.map((m, i) => (
                <option key={i} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Color */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Color Pigmento</label>
            <select
              value={filtroColor}
              onChange={(e) => setFiltroColor(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none hover:border-slate-700"
            >
              <option value="">-- Todos --</option>
              {uniqueColors.map((c, i) => (
                <option key={i} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Máquina Inyectora (Filtered Context) */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Inyectora Activa</label>
            <select
              value={filtroMaquina}
              onChange={(e) => setFiltroMaquina(e.target.value)}
              disabled={activeArea !== 'TODAS' && activeArea !== 'inyeccion'}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none disabled:bg-slate-950 disabled:cursor-not-allowed disabled:text-slate-600"
            >
              <option value="">{activeArea !== 'TODAS' && activeArea !== 'inyeccion' ? '-- Solo Inyección --' : '-- Todas --'}</option>
              {machines.map(m => (
                <option key={m.id} value={m.id}>{m.name} ({m.id.toUpperCase()})</option>
              ))}
            </select>
          </div>

          {/* Banda / Recorte (Filtered Context) */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Banda / Acabado</label>
            <select
              value={filtroBanda}
              onChange={(e) => setFiltroBanda(e.target.value)}
              disabled={activeArea !== 'TODAS' && activeArea !== 'banda'}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none disabled:bg-slate-950 disabled:cursor-not-allowed disabled:text-slate-600"
            >
              <option value="">{activeArea !== 'TODAS' && activeArea !== 'banda' ? '-- Solo Banda --' : '-- Todas --'}</option>
              {bands.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

        </div>
      </div>

      {/* 2. KPIS OPERATIVOS SUPERIORES */}
      <div className="w-full grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-3">
        
        <div className="p-3 bg-slate-950 border border-slate-905 border-slate-900 rounded-lg space-y-1 shadow-lg">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Producción Total
          </span>
          <div className="text-lg font-bold font-mono text-cyan-400">
            {totalRealProduction.toLocaleString()}
          </div>
          <span className="text-[9px] font-mono text-slate-550 block">Pares fabricados</span>
        </div>

        <div className="p-3 bg-slate-950 border border-slate-900 rounded-lg space-y-1 shadow-lg">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Meta Acumulada
          </span>
          <div className="text-lg font-bold font-mono text-slate-350">
            {totalTargetProduction.toLocaleString()}
          </div>
          <span className="text-[9px] font-mono text-slate-550 block">Meta esperada</span>
        </div>

        <div className="p-3 bg-slate-950 border border-slate-900 rounded-lg space-y-1 shadow-lg">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            % Cumplimiento
          </span>
          <div className={`text-lg font-bold font-mono ${metaCompliance >= 95 ? 'text-green-400' : 'text-amber-500'}`}>
            {metaCompliance}%
          </div>
          <span className="text-[9px] font-mono text-slate-550 block">Alcance de meta</span>
        </div>

        <div className="p-3 bg-slate-950 border border-slate-900 rounded-lg space-y-1 shadow-lg">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Pares / Hora
          </span>
          <div className="text-lg font-bold font-mono text-slate-200">
            {avgProductionPerHour.toLocaleString()}
          </div>
          <span className="text-[9px] font-mono text-slate-550 block">Pares de ritmo</span>
        </div>

        <div className="p-3 bg-slate-950 border border-slate-900 rounded-lg space-y-1 shadow-lg">
          <span className="text-[10px] font-mono font-bold text-slate-505 text-slate-500 uppercase block tracking-wider leading-none">
            Mejor Hora
          </span>
          <div className="text-lg font-bold font-mono text-emerald-400">
            {bestHour}
          </div>
          <span className="text-[9px] font-mono text-slate-550 block">Max rendimiento</span>
        </div>

        <div className="p-3 bg-slate-950 border border-slate-900 rounded-lg space-y-1 shadow-lg">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Peor Hora
          </span>
          <div className="text-lg font-bold font-mono text-rose-500">
            {worstHour}
          </div>
          <span className="text-[9px] font-mono text-slate-550 block">Garganta de botella</span>
        </div>

        <div className="p-3 bg-slate-950 border border-slate-900 rounded-lg space-y-1 shadow-lg">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            OEE Promedio
          </span>
          <div className={`text-lg font-bold font-mono ${avgEfficiency >= 95 ? 'text-green-400' : avgEfficiency >= 80 ? 'text-amber-500' : 'text-rose-450'}`}>
            {avgEfficiency}%
          </div>
          <span className="text-[9px] font-mono text-slate-550 block">Promedio de OEE</span>
        </div>

        <div className="p-3 bg-red-950/10 border border-red-950/30 rounded-lg space-y-1 shadow-lg">
          <span className="text-[10px] font-mono font-bold text-red-400 uppercase block tracking-wider leading-none">
            Reprocesos
          </span>
          <div className="text-lg font-bold font-mono text-rose-400">
            {totalReprocesos.toLocaleString()}
          </div>
          <span className="text-[9px] font-mono text-red-500 block">Pares a repasar</span>
        </div>

        <div className="p-3 bg-amber-950/10 border border-amber-950/30 rounded-lg space-y-1 shadow-lg">
          <span className="text-[10px] font-mono font-bold text-amber-500 uppercase block tracking-wider leading-none">
            Salidas / 2das
          </span>
          <div className="text-lg font-bold font-mono text-amber-400">
            {totalSegundas.toLocaleString()}
          </div>
          <span className="text-[9px] font-mono text-amber-550 block">Menor especificación</span>
        </div>

      </div>

      {/* 4. GRAFICAS RECHARTS COMPLETO (6 GRÁFICAS REQUERIDAS) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

        {/* Gráfica 1: Producción por Hora */}
        <div className="bg-slate-950 border border-slate-900 rounded-lg p-3 shadow-xl">
          <h3 className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider mb-2">
            📊 Producción Real vs Meta por Hora
          </h3>
          <p className="text-[10px] text-slate-500 mb-4 font-sans leading-none">
            Eficiencia instantánea del calzado comparada con la capacidad nominal.
          </p>
          <div className="h-56 overflow-x-auto">
            {prodHourChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[10px] text-slate-600 font-mono">SIN DATOS OPERATIVOS</div>
            ) : (
              <div className="w-full min-w-[420px] h-full">
              <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <RechartsBarChart data={prodHourChartData} margin={{ top: 5, right: 5, left: -30, bottom: 5 }}>
                  <RechartsCartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <RechartsXAxis dataKey="hour" stroke="#64748b" style={{ fontSize: '8px' }} />
                  <RechartsYAxis stroke="#64748b" style={{ fontSize: '8px' }} />
                  <RechartsTooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '4px', fontSize: '10px' }} />
                  <RechartsLegend wrapperStyle={{ fontSize: '8px', paddingTop: '5px' }} />
                  <RechartsBar dataKey="Producción" fill="#a855f7" name="Real" />
                  <RechartsBar dataKey="Meta" fill="#3b82f6" name="Meta Target" />
                </RechartsBarChart>
              </RechartsResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Gráfica 2: Meta vs Real Acumulado */}
        <div className="bg-slate-950 border border-slate-900 rounded-lg p-3 shadow-xl">
          <h3 className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider mb-2">
            📈 Tendencia Acumulada vs Meta
          </h3>
          <p className="text-[10px] text-slate-500 mb-4 font-sans leading-none">
            Análisis de las pendientes de manufactura y desfases en volumen.
          </p>
          <div className="h-56 overflow-x-auto">
            {prodAccumulatedChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[10px] text-slate-600 font-mono">SIN DATOS OPERATIVOS</div>
            ) : (
              <div className="w-full min-w-[420px] h-full">
              <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <RechartsLineChart data={prodAccumulatedChartData} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                  <RechartsCartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <RechartsXAxis dataKey="hour" stroke="#64748b" style={{ fontSize: '8px' }} />
                  <RechartsYAxis stroke="#64748b" style={{ fontSize: '8px' }} />
                  <RechartsTooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '4px', fontSize: '10px' }} />
                  <RechartsLegend wrapperStyle={{ fontSize: '8px', paddingTop: '5px' }} />
                  <RechartsLine type="monotone" dataKey="Real Acumulado" stroke="#10b981" strokeWidth={3} dot={{ r: 2 }} />
                  <RechartsLine type="monotone" dataKey="Meta Acumulada" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 1 }} />
                </RechartsLineChart>
              </RechartsResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Gráfica 3: Producción por Área */}
        <div className="bg-slate-950 border border-slate-900 rounded-lg p-3 shadow-xl">
          <h3 className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider mb-2">
            🏭 Volumen de Producción por Área
          </h3>
          <p className="text-[10px] text-slate-500 mb-4 font-sans leading-none">
            Carga de manufactura real consolidada por subestación técnica.
          </p>
          <div className="h-56 overflow-x-auto">
            <div className="w-full min-w-[420px] h-full">
            <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <RechartsBarChart data={prodByAreaChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                <RechartsCartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <RechartsXAxis dataKey="name" stroke="#64748b" style={{ fontSize: '8px' }} />
                <RechartsYAxis stroke="#64748b" style={{ fontSize: '8px' }} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '4px', fontSize: '10px' }} />
                <RechartsBar dataKey="Pares" fill="#e11d48">
                  {prodByAreaChartData.map((entry, index) => {
                    // Match area keys
                    const keys = Object.keys(AREA_NAMES);
                    const specificKey = keys[index] || 'almacen';
                    const color = AREA_COLORS[specificKey] || '#e11d48';
                    return <RechartsBar key={`cell-${index}`} fill={color} />;
                  })}
                </RechartsBar>
              </RechartsBarChart>
            </RechartsResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Gráfica 5: Producción por Modelo */}
        <div className="bg-slate-950 border border-slate-900 rounded-lg p-3 shadow-xl">
          <h3 className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider mb-2">
            🏷️ Volumen por Modelo de Calzado EVA
          </h3>
          <p className="text-[10px] text-slate-500 mb-4 font-sans leading-none">
            Distribución por molde registrada en FDB/OCR.
          </p>
          <div className="h-56 overflow-x-auto">
            {prodByModelChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[10px] text-slate-600 font-mono">SIN REGISTROS</div>
            ) : (
              <div className="w-full min-w-[420px] h-full">
              <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <RechartsBarChart data={prodByModelChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                  <RechartsCartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <RechartsXAxis dataKey="name" stroke="#64748b" style={{ fontSize: '8px' }} />
                  <RechartsYAxis stroke="#64748b" style={{ fontSize: '8px' }} />
                  <RechartsTooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '4px', fontSize: '10px' }} />
                  <RechartsBar dataKey="Pares" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </RechartsBarChart>
              </RechartsResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Gráfica 6: Eficiencia por Turno */}
        <div className="bg-slate-950 border border-slate-900 rounded-lg p-3 shadow-xl">
          <h3 className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider mb-2">
            🔄 Eficiencia OEE Promedio por Turno
          </h3>
          <p className="text-[10px] text-slate-500 mb-4 font-sans leading-none">
            Análisis de rendimiento entre Mañana, Tarde y Noche.
          </p>
          <div className="h-56 overflow-x-auto">
            <div className="w-full min-w-[360px] h-full">
            <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <RechartsBarChart data={efficiencyByShiftChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                <RechartsCartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <RechartsXAxis dataKey="shift" stroke="#64748b" style={{ fontSize: '8px' }} />
                <RechartsYAxis domain={[0, 100]} stroke="#64748b" style={{ fontSize: '8px' }} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '4px', fontSize: '10px' }} />
                <RechartsBar dataKey="Eficiencia %" fill="#06b6d4" radius={[4, 4, 0, 0]}>
                  {efficiencyByShiftChartData.map((entry, index) => {
                    const colorsList = ['#38bdf8', '#818cf8', '#c084fc'];
                    return <RechartsBar key={`cell-${index}`} fill={colorsList[index % colorsList.length]} />;
                  })}
                </RechartsBar>
              </RechartsBarChart>
            </RechartsResponsiveContainer>
            </div>
          </div>
        </div>

      </div>

      {/* 5. TABLA OPERATIVA */}
      <div className="bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-2xl space-y-4">
        
        <div className="flex justify-between items-center flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-505 text-indigo-500 animate-pulse" />
            <h3 className="text-sm font-black text-slate-200 uppercase font-mono tracking-tight">
              Bitácora de Control por Hora (WIP Industrial)
            </h3>
          </div>
          <span className="text-[10px] font-mono text-slate-500 uppercase font-bold">
            Mostrando {groupedHourlyLogs.length} cortes consolidados por área/hora
          </span>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto border border-slate-900 rounded-lg scrollbar-thin">
          <table className="w-full text-left border-collapse select-none">
            <thead>
              <tr className="bg-slate-900 border-b border-slate-800 text-[10px] font-mono text-slate-400 uppercase tracking-wider leading-none">
                <th className="py-3 px-3 font-bold">Fecha</th>
                <th className="py-3 px-3 font-bold">Origen</th>
                <th className="py-3 px-3 font-bold">Hora segment</th>
                <th className="py-3 px-3 font-bold">Turno</th>
                <th className="py-3 px-3 font-bold">Estación/Área</th>
                <th className="py-3 px-3 font-bold">Responsable Técnico</th>
                <th className="py-3 px-3 font-bold">Modelo EVA</th>
                <th className="py-3 px-3 font-bold">Pigm. Color</th>
                <th className="py-3 px-3 text-right font-bold">Meta hora</th>
                <th className="py-3 px-3 text-right font-bold">Real OEE</th>
                <th className="py-3 px-3 text-right font-bold">Diferencia</th>
                <th className="py-3 px-3 text-center font-bold">Efictividad %</th>
                <th className="py-3 px-3 font-bold">Estatus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900 text-[11px] font-mono">
              {groupedHourlyLogs.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-slate-500 text-xs">
                    ⚠️ No se encontraron registros de producción para esta área en los plazos indicados.
                  </td>
                </tr>
              ) : (
                groupedHourlyLogs.map((log) => {
                  const diff = log.produccionReal - log.metaHora;
                  const eff = log.metaHora > 0 ? Math.round((log.produccionReal / log.metaHora) * 100) : 0;
                  
                  // Estatus styling based on strict rule
                  let statusColor = "bg-emerald-950/40 text-emerald-400 border border-emerald-800/40";
                  let statusTitle = "🟢 Óptimo (>=95%)";
                  if (eff < 80) {
                    statusColor = "bg-rose-950/40 text-rose-400 border border-rose-800/40";
                    statusTitle = "🔴 Crítico (<80%)";
                  } else if (eff <= 94) {
                    statusColor = "bg-amber-950/40 text-amber-500 border border-amber-800/40";
                    statusTitle = "🟡 Alerta (80-94%)";
                  }

                  return (
                    <tr key={log.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-3 px-3 text-slate-450">{log.fecha}</td>
                      <td className="py-3 px-3 text-cyan-400 font-bold">{log.tarjetaViajera || 'TV-S/R'}</td>
                      <td className="py-3 px-3 font-bold text-cyan-400">{log.hora}</td>
                      <td className="py-3 px-3 text-slate-300 font-semibold">{log.turno}</td>
                      <td className="py-3 px-3 font-bold">
                        <span className="flex items-center gap-1.5 uppercase text-slate-205">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: AREA_COLORS[log.area] }}></span>
                          {AREA_NAMES[log.area] || log.area}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-350 font-sans">{log.responsable}</td>
                      <td className="py-3 px-3 font-semibold text-slate-100 uppercase">{log.modeloName}</td>
                      <td className="py-3 px-3 text-slate-400 font-sans">{log.color}</td>
                      <td className="py-3 px-3 text-right font-medium text-slate-400">{log.metaHora.toLocaleString()}</td>
                      <td className="py-3 px-3 text-right font-bold text-slate-100">{log.produccionReal.toLocaleString()}</td>
                      <td className={`py-3 px-3 text-right font-bold ${diff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {diff >= 0 ? `+${diff}` : diff}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span className="font-bold">{eff}%</span>
                          <div className="w-10 bg-slate-900 h-1.5 rounded overflow-hidden">
                            <div 
                              className={`h-full rounded ${eff >= 95 ? 'bg-green-500' : eff >= 80 ? 'bg-amber-500' : 'bg-rose-500'}`}
                              style={{ width: `${Math.min(100, eff)}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold ${statusColor}`}>
                          {statusTitle}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* REGISTRY SLIDE OUT / MODAL FORM */}
      {showAddLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            
            <div className="p-4 bg-slate-950 border-b border-slate-850 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-cyan-400 animate-pulse" />
                <h4 className="text-xs font-bold font-mono text-slate-205 uppercase">
                  Registrar Reporte Horario de Planta
                </h4>
              </div>
              <button 
                onClick={() => setShowAddLogModal(false)}
                className="text-slate-500 hover:text-white font-black text-xs font-mono select-none cursor-pointer"
              >
                ✕ ESC
              </button>
            </div>

            <form onSubmit={handleAddHourlyLogSubmit} className="p-5 space-y-4 overflow-y-auto font-sans text-xs">
              
              <div className="grid grid-cols-2 gap-4">
                
                {/* Area */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase font-bold text-slate-400 block">Estación / Área</label>
                  <select
                    value={formArea}
                    onChange={(e) => {
                      const val = e.target.value as any;
                      setFormArea(val);
                      // El responsable es captura operativa real: no se autocompleta
                      // con nombres inventados; lo escribe el usuario.
                      setFormResponsable('');
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  >
                    {Object.entries(AREA_NAMES).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>

                {/* Turno */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase font-bold text-slate-400 block">Turno</label>
                  <select
                    value={formTurno}
                    onChange={(e) => setFormTurno(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 font-mono focus:outline-none"
                  >
                    <option value="MAÑANA">🌅 MAÑANA</option>
                    <option value="TARDE">🌇 TARDE</option>
                    <option value="NOCHE">🌃 NOCHE</option>
                  </select>
                </div>

                {/* Fecha */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase font-bold text-slate-400 block">Fecha</label>
                  <input
                    type="date"
                    required
                    value={formFecha}
                    onChange={(e) => setFormFecha(e.target.value)}
                    className="w-full bg-slate-955 bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>

                {/* Hora segment */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase font-bold text-slate-400 block">Hora Segmento (Inicio)</label>
                  <select
                    value={formHora}
                    onChange={(e) => setFormHora(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 font-mono focus:outline-none"
                  >
                    {['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:05', '23:00'].map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                {/* Responsable */}
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-mono uppercase font-bold text-slate-400 block">Tarjeta Viajera</label>
                  <input
                    type="text"
                    required
                    value={formTarjetaViajera}
                    onChange={(e) => setFormTarjetaViajera(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-205 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                  />
                </div>

                {/* Responsable */}
                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-mono uppercase font-bold text-slate-400 block">Ingeniero / Técnico Responsable</label>
                  <select
                    required
                    value={formResponsable}
                    onChange={(e) => setFormResponsable(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-105 text-slate-205 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  >
                    {!uniqueResponsables.includes(formResponsable) && (
                      <option value={formResponsable}>{formResponsable}</option>
                    )}
                    {uniqueResponsables.map(responsable => (
                      <option key={responsable} value={responsable}>{responsable}</option>
                    ))}
                  </select>
                </div>

                {/* Modelo */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase font-bold text-slate-400 block">Modelo</label>
                  <select
                    value={formModelo}
                    onChange={(e) => setFormModelo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 focus:outline-none"
                  >
                    {uniqueModels.map((m, i) => (
                      <option key={i} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                {/* Color */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase font-bold text-slate-400 block">Color de Pigmento</label>
                  <select
                    value={formColor}
                    onChange={(e) => setFormColor(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 focus:outline-none"
                  >
                    {uniqueColors.map((c, i) => (
                      <option key={i} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Meta hora */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase font-bold text-slate-400 block">Meta Programada (Pares)</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={formMeta}
                    onChange={(e) => setFormMeta(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>

                {/* Produccion Real */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase font-bold text-slate-400 block">Producción Real (Pares)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={formReal}
                    onChange={(e) => setFormReal(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>

                {/* Reprocesos */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase font-bold text-slate-400 block">Reprocesos (Curva defectuosa)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={formReprocesos}
                    onChange={(e) => setFormReprocesos(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 font-mono focus:outline-none"
                  />
                </div>

                {/* Segundas */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase font-bold text-slate-400 block">Segunda Selección (Mermas)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={formSegundas}
                    onChange={(e) => setFormSegundas(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 font-mono focus:outline-none"
                  />
                </div>

                {/* Sub-Devices if area is Inyección */}
                {formArea === 'inyeccion' && (
                  <div className="col-span-2 space-y-1">
                    <label className="text-[10px] font-mono uppercase font-bold text-slate-405 text-slate-400 block">Inyectora Asignada</label>
                    <select
                      value={formMaquina}
                      onChange={(e) => setFormMaquina(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-120 text-slate-205 focus:outline-none font-mono"
                    >
                      {machines.map(m => (
                        <option key={m.id} value={m.id}>{m.name} ({m.id.toUpperCase()})</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Sub-Devices if area is Banda */}
                {formArea === 'banda' && (
                  <div className="col-span-2 space-y-1">
                    <label className="text-[10px] font-mono uppercase font-bold text-slate-400 block">Línea de Banda Transportadora</label>
                    <select
                      value={formBanda}
                      onChange={(e) => setFormBanda(e.target.value)}
                      className="w-full bg-slate-955 bg-slate-900 bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-205 focus:outline-none font-mono"
                    >
                      {bands.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                )}

              </div>

              {/* Strict isolation and audit information note */}
              <div className="p-3 bg-indigo-950/20 text-slate-400 text-[10px] font-medium leading-relaxed rounded-lg border border-indigo-950 flex gap-2">
                <span>🔒</span>
                <span><strong>Registro de Seguridad:</strong> Este log horario quedará irrevocablemente anclado a la bitácora de la planta <strong>{currentTenant.name}</strong> para fines de trazabilidad y auditoría.</span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddLogModal(false)}
                  className="px-4 py-2 bg-slate-950 text-slate-350 border border-slate-800 hover:border-slate-700 hover:text-white rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-650 hover:bg-indigo-600 text-slate-950 font-bold rounded-lg shadow-md cursor-pointer"
                >
                  Grabar Reporte
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};

/* 5. Modelos y Productos View */

type ModelPerformanceLog = ModelPerformanceRow;

export const ModelosProductosView: React.FC = () => {
  const { currentTenant, addAuditLog } = useDashboard();

  const [performanceLogs, setPerformanceLogs] = useState<ModelPerformanceLog[]>([]);

  // Track selected model for detail view (Master-Detail)
  const [selectedProductModel, setSelectedProductModel] = useState<string>('');
  const [aiInsightsGenerated, setAiInsightsGenerated] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiInsights, setAiInsights] = useState<{ tag: string; tone: 'rose' | 'amber' | 'indigo'; text: string }[] | null>(null);
  const [aiSummary, setAiSummary] = useState<string>('');

  // Interactive filters
  const [filtroModelo, setFiltroModelo] = useState<string>('');
  const [filtroColor, setFiltroColor] = useState<string>('');
  const [filtroCliente, setFiltroCliente] = useState<string>('');
  const [filtroFecha, setFiltroFecha] = useState<string>('');
  const [filtroRangoInicio, setFiltroRangoInicio] = useState<string>(() => new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10));
  const [filtroRangoFin, setFiltroRangoFin] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [filtroEtapa, setFiltroEtapa] = useState<string>('');
  const [filtroArea, setFiltroArea] = useState<string>('');
  const [filtroEstatus, setFiltroEstatus] = useState<string>('');

  useEffect(() => {
    setPerformanceLogs([]);
  }, [currentTenant.id]);

  useEffect(() => {
    if (!backendEnabled) return;
    let cancelled = false;
    const start = filtroFecha || filtroRangoInicio;
    const end = filtroFecha || filtroRangoFin;
    dashboardApi.erpOperativo(start, end)
      .then(data => { if (!cancelled) setPerformanceLogs(data.models); })
      .catch(err => console.warn('Modelos: ERP operativo fetch failed', err));
    return () => { cancelled = true; };
  }, [currentTenant.id, filtroFecha, filtroRangoInicio, filtroRangoFin]);

  const uniqueModels = Array.from(new Set(performanceLogs.map(l => l.modeloName))).filter(Boolean) as string[];
  const uniqueColors = Array.from(new Set(performanceLogs.map(l => l.color))).filter(Boolean) as string[];
  const uniqueClients = Array.from(new Set(performanceLogs.map(l => l.cliente))).filter(Boolean) as string[];

  // Apply sequential multi-tenant filters
  const filteredRecords = performanceLogs.filter(log => {
    if (log.tenantId !== currentTenant.id) return false;

    if (filtroModelo && log.modeloName !== filtroModelo) return false;
    if (filtroColor && log.color !== filtroColor) return false;
    if (filtroCliente && log.cliente !== filtroCliente) return false;
    if (filtroFecha && log.fecha !== filtroFecha) return false;
    if (filtroRangoInicio && log.fecha < filtroRangoInicio) return false;
    if (filtroRangoFin && log.fecha > filtroRangoFin) return false;
    if (filtroEtapa && log.etapaActiva !== filtroEtapa) return false;
    if (filtroArea && log.etapaActiva !== filtroArea) return false; // Area maps directly to active stage
    if (filtroEstatus && log.estatus !== filtroEstatus) return false;

    return true;
  });

  // Calculate dynamic OEE and compliance KPIs based on filters
  const totalPares = filteredRecords.reduce((sum, l) => sum + l.paresProducidos, 0);
  const totalDefectos = filteredRecords.reduce((sum, l) => sum + l.paresDefectuosos, 0);
  const totalSegundas = filteredRecords.reduce((sum, l) => sum + l.paresSegundas, 0);
  const totalReprocesos = filteredRecords.reduce((sum, l) => sum + l.paresReprocesos, 0);

  // Group stats by model to resolve rank and rates
  const modelSummaries: Record<string, {
    name: string;
    lotes: number;
    producido: number;
    defectuosos: number;
    segundas: number;
    reprocesos: number;
    leadTimeSum: number;
    leadTimeWeight: number;
    timeInySum: number;
    timeInyWeight: number;
    timeEstSum: number;
    timeEstWeight: number;
    timeBndSum: number;
    timeBndWeight: number;
    count: number;
    entregasCumplidas: number;
    entregasTotal: number;
  }> = {};

  filteredRecords.forEach(l => {
    if (!modelSummaries[l.modeloName]) {
      modelSummaries[l.modeloName] = {
        name: l.modeloName,
        lotes: 0,
        producido: 0,
        defectuosos: 0,
        segundas: 0,
        reprocesos: 0,
        leadTimeSum: 0,
        leadTimeWeight: 0,
        timeInySum: 0,
        timeInyWeight: 0,
        timeEstSum: 0,
        timeEstWeight: 0,
        timeBndSum: 0,
        timeBndWeight: 0,
        count: 0,
        entregasCumplidas: 0,
        entregasTotal: 0
      };
    }
    const ms = modelSummaries[l.modeloName];
    const weight = Math.max(1, l.lotes || 0);
    ms.lotes += l.lotes || 0;
    ms.producido += l.paresProducidos;
    ms.defectuosos += l.paresDefectuosos;
    ms.segundas += l.paresSegundas;
    ms.reprocesos += l.paresReprocesos;
    if (l.leadTimeHours > 0) {
      ms.leadTimeSum += l.leadTimeHours * weight;
      ms.leadTimeWeight += weight;
    }
    if (l.tiempoInyeccionMins > 0) {
      ms.timeInySum += l.tiempoInyeccionMins * weight;
      ms.timeInyWeight += weight;
    }
    if (l.tiempoEstabilizacionMins > 0) {
      ms.timeEstSum += l.tiempoEstabilizacionMins * weight;
      ms.timeEstWeight += weight;
    }
    if (l.tiempoBandaMins > 0) {
      ms.timeBndSum += l.tiempoBandaMins * weight;
      ms.timeBndWeight += weight;
    }
    ms.count += 1;
    ms.entregasCumplidas += l.entregasCumplidas || 0;
    ms.entregasTotal += l.entregasTotal || 0;
  });

  const summariesList = Object.values(modelSummaries);
  const avgLeadTime = (m: typeof summariesList[number]) => m.leadTimeWeight > 0 ? m.leadTimeSum / m.leadTimeWeight : 0;
  const avgInyTime = (m: typeof summariesList[number]) => m.timeInyWeight > 0 ? m.timeInySum / m.timeInyWeight : 0;
  const avgEstTime = (m: typeof summariesList[number]) => m.timeEstWeight > 0 ? m.timeEstSum / m.timeEstWeight : 0;
  const avgBndTime = (m: typeof summariesList[number]) => m.timeBndWeight > 0 ? m.timeBndSum / m.timeBndWeight : 0;
  const modelCompliance = (m: typeof summariesList[number]) =>
    m.entregasTotal > 0 ? Math.round((m.entregasCumplidas / m.entregasTotal) * 100) : 0;

  // KPI calculations
  const totalModelosActivos = summariesList.length;

  // 1. Modelo Más Producido
  const sortedByVol = [...summariesList].sort((a, b) => b.producido - a.producido);
  const modeloMasProducido = sortedByVol[0]?.name || 'Ninguno';

  // 2. Modelo con Mayor Eficiencia (OEE based on lowest defect rate + compliance)
  const sortedByEff = [...summariesList].sort((a, b) => {
    const aRate = a.producido > 0 ? (a.defectuosos / a.producido) : 1;
    const bRate = b.producido > 0 ? (b.defectuosos / b.producido) : 1;
    return aRate - bRate; // lower defect is better
  });
  const modeloMayorEficiencia = sortedByEff[0]?.name || 'Ninguno';

  // 3. Modelo con Mayor Defectivo Rate
  const sortedByDefRate = [...summariesList].sort((a, b) => {
    const aRate = a.producido > 0 ? (a.defectuosos / a.producido) : 0;
    const bRate = b.producido > 0 ? (b.defectuosos / b.producido) : 0;
    return bRate - aRate;
  });
  const modeloMayorDefectivo = sortedByDefRate[0]?.name || 'Ninguno';

  // 4. Modelo con Mayor Lead Time Promedio
  const sortedByLeadTime = [...summariesList].sort((a, b) => {
    return avgLeadTime(b) - avgLeadTime(a);
  });
  const modeloMayorLeadTime = sortedByLeadTime[0]?.name || 'Ninguno';

  // 5. Modelo con Mejor Cumplimiento de Entrega
  const sortedByCompliance = [...summariesList].sort((a, b) => {
    return modelCompliance(b) - modelCompliance(a);
  });
  const modeloMejorCumplimiento = sortedByCompliance[0]?.name || 'Ninguno';
  const totalEntregasCumplidas = summariesList.reduce((sum, m) => sum + m.entregasCumplidas, 0);
  const totalEntregas = summariesList.reduce((sum, m) => sum + m.entregasTotal, 0);
  const cumplimientoPromedioPedido = summariesList.length > 0
    ? (totalEntregas > 0 ? Math.round((totalEntregasCumplidas / totalEntregas) * 100) : 0)
    : 0;

  // 6. Porcentaje participación del modelo principal
  const maxVolume = sortedByVol[0]?.producido || 0;
  const pctParticipationPrincipal = totalPares > 0 ? Math.round((maxVolume / totalPares) * 100) : 0;

  // --- Insights AI: diagnóstico operativo derivado de los datos filtrados ---
  // Genera 3 hallazgos (calidad, lead times, volumen/cumplimiento) calculados
  // sobre los registros actualmente filtrados, en lugar de texto estático.
  const buildAiInsights = (): { insights: { tag: string; tone: 'rose' | 'amber' | 'indigo'; text: string }[]; summary: string } => {
    if (summariesList.length === 0) {
      return {
        insights: [
          { tag: 'Calidad & Terminado', tone: 'rose', text: 'No hay registros en el rango/filtros seleccionados para analizar.' },
          { tag: 'Lead Timings Planta', tone: 'amber', text: 'Ajusta los filtros para generar un diagnóstico de tiempos de planta.' },
          { tag: 'Volumen & Cumplimiento', tone: 'indigo', text: 'Sin datos de volumen para el corte actual.' }
        ],
        summary: 'Sin registros para diagnosticar con los filtros actuales.'
      };
    }
    const withVol = summariesList.filter(m => m.producido > 0);
    // 1. Calidad: modelo con mayor tasa de defecto
    const defectLeader = (withVol.length ? withVol : summariesList)
      .slice()
      .sort((a, b) => {
        const bRate = b.producido > 0 ? b.defectuosos / b.producido : 0;
        const aRate = a.producido > 0 ? a.defectuosos / a.producido : 0;
        return bRate - aRate;
      })[0];
    const dlRate = defectLeader.producido > 0 ? (defectLeader.defectuosos / defectLeader.producido) * 100 : 0;
    const dlShare = totalDefectos > 0 ? Math.round((defectLeader.defectuosos / totalDefectos) * 100) : 0;
    const calidadText = dlRate > 0
      ? `${defectLeader.name} presenta la mayor tasa de defecto (${dlRate.toFixed(1)}%) con ${defectLeader.defectuosos.toLocaleString()} pares afectados — ${dlShare}% de la merma total (${totalDefectos.toLocaleString()} pares). Priorizar inspección en banda/terminado.`
      : `Sin defectos registrados en el corte filtrado: ${totalPares.toLocaleString()} pares producidos limpios en ${summariesList.length} modelo(s).`;

    // 2. Lead times: modelo con mayor tiempo de estabilización promedio
    const stbLeader = summariesList.slice().sort((a, b) => avgEstTime(b) - avgEstTime(a))[0];
    const stbAvg = Math.round(avgEstTime(stbLeader));
    const ltAvg = avgLeadTime(stbLeader).toFixed(1);
    const compStb = modelCompliance(stbLeader);
    const leadText = `${stbLeader.name} acumula el mayor tiempo de estabilización promedio (${stbAvg} min) y un lead time de ${ltAvg} h por corrida` +
      (compStb >= 80 ? `, aunque mantiene buen cumplimiento (${compStb}%). Revisar capacidad del túnel de estabilización.` : ` con cumplimiento de ${compStb}%. Cuello de botella probable en estabilización.`);

    // 3. Volumen y cumplimiento: líder de volumen + rezagado en entregas
    const top = sortedByVol[0];
    const topShare = totalPares > 0 ? Math.round((top.producido / totalPares) * 100) : 0;
    const worstComp = summariesList.slice().sort((a, b) => modelCompliance(a) - modelCompliance(b))[0];
    const worstCompPct = modelCompliance(worstComp);
    const volText = `${top.name} lidera el volumen con ${topShare}% del total (${top.producido.toLocaleString()} pares). Cumplimiento promedio ${cumplimientoPromedioPedido}%` +
      (worstComp.name !== top.name ? `; ${worstComp.name} es el más rezagado en entregas (${worstCompPct}%).` : '.');

    return {
      insights: [
        { tag: 'Calidad & Terminado', tone: 'rose', text: calidadText },
        { tag: 'Lead Timings Planta', tone: 'amber', text: leadText },
        { tag: 'Volumen & Cumplimiento', tone: 'indigo', text: volText }
      ],
      summary: `Diagnóstico sobre ${filteredRecords.length} registros / ${summariesList.length} modelos: ${modeloMasProducido} lidera volumen, ${modeloMayorDefectivo} concentra defecto y el cumplimiento promedio por pedido es ${cumplimientoPromedioPedido}%.`
    };
  };

  const handleGenerateInsights = () => {
    setAiGenerating(true);
    setAiInsightsGenerated(false);
    // Pequeño retardo para reflejar el procesamiento del diagnóstico.
    setTimeout(() => {
      const { insights, summary } = buildAiInsights();
      setAiInsights(insights);
      setAiSummary(summary);
      setAiInsightsGenerated(true);
      setAiGenerating(false);
      addAuditLog('MODELOS', 'AI_INSIGHTS_GENERATED', `Insights AI generados con ${filteredRecords.length} registros filtrados`);
    }, 650);
  };

  const AI_TONE_CLASSES: Record<'rose' | 'amber' | 'indigo', { wrap: string; tag: string }> = {
    rose: { wrap: 'bg-rose-950/15 border-rose-900/30', tag: 'text-rose-450' },
    amber: { wrap: 'bg-amber-950/15 border-amber-900/30', tag: 'text-amber-500' },
    indigo: { wrap: 'bg-indigo-950/15 border-indigo-900/30', tag: 'text-indigo-400' }
  };
  // Tarjetas a mostrar: las generadas dinámicamente o las plantillas por defecto.
  const aiCards = aiInsights ?? [
    { tag: 'Calidad & Terminado', tone: 'rose' as const, text: 'Pulsa «Generar insights AI» para analizar la calidad de los modelos filtrados.' },
    { tag: 'Lead Timings Planta', tone: 'amber' as const, text: 'El diagnóstico de tiempos de planta se calcula con los registros del corte actual.' },
    { tag: 'Variabilidad / Volumen', tone: 'indigo' as const, text: 'Se identificará el líder de volumen y el rezago en cumplimiento.' }
  ];

  // RECHARTS CHART MAPPINGS (7 GRAPHICS CONFIGURED BEUTIFULLY)
  
  // Chart 1: Ranking de Modelos por Pares Producidos
  const rankingModelosData = sortedByVol.map(m => ({
    name: m.name,
    'Pares': m.producido
  }));

  // Chart 2: Tendencia de Producción por Modelo (Past 10 date checkpoints)
  const daysSorted = Array.from(new Set(filteredRecords.map(l => l.fecha))).sort().slice(-10) as string[];
  const tendenciaModelosData = daysSorted.map(dateStr => {
    const dayRecords = filteredRecords.filter(l => l.fecha === dateStr);
    const result: Record<string, any> = { date: dateStr.split('-').slice(1).join('/') };
    dayRecords.forEach(l => {
      result[l.modeloName] = (result[l.modeloName] || 0) + l.paresProducidos;
    });
    return result;
  });

  // Chart 3: Pareto de Defectos por Modelo (Volumes and Percentage yield)
  let accumulatedDefectPct = 0;
  const paradosDataSorted = [...summariesList].sort((a, b) => b.defectuosos - a.defectuosos);
  const totalDefectsSum = paradosDataSorted.reduce((sum, m) => sum + m.defectuosos, 0) || 1;
  const paretoDefectosData = paradosDataSorted.map((m, idx) => {
    const currentPct = Math.round((m.defectuosos / totalDefectsSum) * 100);
    accumulatedDefectPct += currentPct;
    return {
      name: m.name,
      'Defectos': m.defectuosos,
      'Pareto %': Math.min(100, accumulatedDefectPct)
    };
  });

  // Chart 4: Lead time promedio por modelo
  const leadTimeChartData = summariesList.map(m => ({
    name: m.name,
    'Lead Time Hrs': Number(avgLeadTime(m).toFixed(1))
  })).sort((a, b) => b['Lead Time Hrs'] - a['Lead Time Hrs']);

  // Chart 5: Productividad por modelo (Average volume produced per run)
  const productividadModelData = summariesList.map(m => ({
    name: m.name,
    'Prod. Promedio Batch': m.lotes > 0 ? Math.round(m.producido / m.lotes) : 0
  })).sort((a, b) => b['Prod. Promedio Batch'] - a['Prod. Promedio Batch']);

  // Chart 6: Cumplimiento de entrega por modelo (%)
  const cumplimientoModelData = summariesList.map(m => ({
    name: m.name,
    'Cumplimiento %': modelCompliance(m)
  })).sort((a, b) => b['Cumplimiento %'] - a['Cumplimiento %']);

  // Chart 7: Producción por Color
  const colorMap: Record<string, number> = {};
  filteredRecords.forEach(l => {
    colorMap[l.color] = (colorMap[l.color] || 0) + l.paresProducidos;
  });
  const produccionColorData = Object.entries(colorMap).map(([col, val]) => ({
    name: col,
    'Pares': val
  })).sort((a, b) => b['Pares'] - a['Pares']);

  // Dynamic context matching based on active selection (selectedProductModel)
  const selectedModelLogs = filteredRecords.filter(l => l.modeloName === selectedProductModel);
  const selectedModelStats = summariesList.find(s => s.name === selectedProductModel) || {
    name: selectedProductModel,
    lotes: 0,
    producido: 0,
    defectuosos: 0,
    segundas: 0,
    reprocesos: 0,
    leadTimeSum: 0,
    leadTimeWeight: 0,
    timeInySum: 0,
    timeInyWeight: 0,
    timeEstSum: 0,
    timeEstWeight: 0,
    timeBndSum: 0,
    timeBndWeight: 0,
    count: 0,
    entregasCumplidas: 0,
    entregasTotal: 0
  };

  const selectedModelDefectPct = selectedModelStats.producido > 0 ? Number(((selectedModelStats.defectuosos / selectedModelStats.producido) * 100).toFixed(2)) : 0;
  const selectedModelCompliance = modelCompliance(selectedModelStats);

  // Colors & Clientes & Tallas used by selection
  const selectedModelColors = Array.from(new Set(selectedModelLogs.map(l => l.color)));
  const selectedModelClientes = Array.from(new Set(selectedModelLogs.map(l => l.cliente)));
  
  // Tallas distribution based on selected model
  const tallasDistribution = selectedModelStats.producido > 0 ? [
    { tallas: '22-23 (Damas)', pares: Math.round(selectedModelStats.producido * 0.15) },
    { tallas: '24-25 (Mediano)', pares: Math.round(selectedModelStats.producido * 0.40) },
    { tallas: '26-27 (Grande)', pares: Math.round(selectedModelStats.producido * 0.35) },
    { tallas: '28-29 (Familiar)', pares: Math.round(selectedModelStats.producido * 0.10) }
  ] : [];

  const handleClearFiltersAll = () => {
    setFiltroModelo('');
    setFiltroColor('');
    setFiltroCliente('');
    setFiltroFecha('');
    setFiltroRangoInicio(new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10));
    setFiltroRangoFin(new Date().toISOString().slice(0, 10));
    setFiltroEtapa('');
    setFiltroArea('');
    setFiltroEstatus('');
  };

  return (
    <div className="space-y-6">

      {/* HEADER CAPTION */}
      <div className="flex justify-between items-center bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-xl flex-wrap gap-4">
        <div>
          <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest font-bold block mb-1">
            MÓDULO DE DESEMPEÑO E INGENIERÍA DE PRODUCTO
          </span>
          <h2 className="text-xl font-black font-sans text-slate-100 uppercase tracking-tight leading-none mb-1 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 animate-pulse"></span>
            Performance Analítico de Modelos y Productos
          </h2>
          <p className="text-xs text-slate-400 font-sans">
            Rendimiento histórico de moldes EVA, porcentaje de rechazo / mermas y tiempos de ciclo técnico para el Tenant: <strong className="text-slate-300">{currentTenant.name}</strong>.
          </p>
        </div>
      </div>

      {/* 1. FILTROS SUPERIORES COMPLETO */}
      <div className="bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-900 pb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-cyan-500" />
            <span className="text-xs font-mono text-slate-300 uppercase tracking-wider font-bold">Consola de Ingeniería y Productos</span>
          </div>
          <button
            onClick={handleClearFiltersAll}
            className="text-[10px] bg-slate-900 hover:bg-slate-850 px-2 py-1 text-slate-400 hover:text-white border border-slate-800 rounded font-mono transition flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            Limpiar Filtros
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
          
          {/* Modelo */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Modelo</label>
            <select
              value={filtroModelo}
              onChange={(e) => setFiltroModelo(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todos --</option>
              {uniqueModels.map((m, i) => (
                <option key={i} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Color */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Color</label>
            <select
              value={filtroColor}
              onChange={(e) => setFiltroColor(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todos --</option>
              {uniqueColors.map((c, i) => (
                <option key={i} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Cliente */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Cliente Comprador</label>
            <select
              value={filtroCliente}
              onChange={(e) => setFiltroCliente(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todos --</option>
              {uniqueClients.map((cl, i) => (
                <option key={i} value={cl}>{cl}</option>
              ))}
            </select>
          </div>

          {/* Fecha */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Fecha Ejecución</label>
            <input
              type="date"
              value={filtroFecha}
              onChange={(e) => setFiltroFecha(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Rango Inicio */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Rango Desde</label>
            <input
              type="date"
              value={filtroRangoInicio}
              onChange={(e) => setFiltroRangoInicio(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1 text-xs text-slate-200 focus:outline-none"
            />
          </div>

          {/* Rango Fin */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Rango Hasta</label>
            <input
              type="date"
              value={filtroRangoFin}
              onChange={(e) => setFiltroRangoFin(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1 text-xs text-slate-200 focus:outline-none"
            />
          </div>

          {/* Etapa / Área */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Área de Trabajo</label>
            <select
              value={filtroArea}
              onChange={(e) => {
                setFiltroArea(e.target.value);
                setFiltroEtapa(e.target.value);
              }}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todas --</option>
              <option value="Almacén">🏢 Almacén</option>
              <option value="Inyección">🔩 Inyección</option>
              <option value="Estabilización">🧪 Estabilización</option>
              <option value="Aduana">🛂 Aduana</option>
              <option value="Banda">〰️ Banda</option>
              <option value="Embarque">📦 Embarque</option>
            </select>
          </div>

          {/* Estatus */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Estatus Operación</label>
            <select
              value={filtroEstatus}
              onChange={(e) => setFiltroEstatus(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none focus:border-slate-700"
            >
              <option value="">-- Todos --</option>
              <option value="Active">🟢 Activo Estable</option>
              <option value="Warning">🟡 En Alerta / Retraso</option>
              <option value="Critical">🔴 Crítico Tolerancia</option>
            </select>
          </div>

        </div>
      </div>

      {/* 2. KPIS SUPERIORES COMPLETO */}
      <div className="w-full grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
        
        <div className="p-3 bg-slate-950 border border-slate-900 rounded-lg space-y-1 shadow-lg">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Pares Producidos
          </span>
          <div className="text-lg font-bold font-mono text-cyan-400">
            {totalPares.toLocaleString()}
          </div>
          <span className="text-[9px] font-mono text-slate-550 block">Muestra consolidada</span>
        </div>

        <div className="p-3 bg-slate-950 border border-slate-900 rounded-lg space-y-1 shadow-lg">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Modelo Líder Vol.
          </span>
          <div className="text-base font-bold font-sans text-slate-100 truncate">
            {modeloMasProducido}
          </div>
          <span className="text-[9px] font-mono text-slate-550 block">Mayor volumen</span>
        </div>

        <div className="p-3 bg-slate-950 border border-slate-900 rounded-lg space-y-1 shadow-lg">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Mayor Eficiencia
          </span>
          <div className="text-base font-bold font-sans text-green-400 truncate">
            {modeloMayorEficiencia}
          </div>
          <span className="text-[9px] font-mono text-slate-550 block">Menor mermas de lote</span>
        </div>

        <div className="p-3 bg-slate-950 border border-slate-900 rounded-lg space-y-1 shadow-lg">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Mayor Defectivo
          </span>
          <div className="text-base font-bold font-sans text-red-400 truncate">
            {modeloMayorDefectivo}
          </div>
          <span className="text-[9px] font-mono text-slate-550 block">Tasa de rechazo crítica</span>
        </div>

        <div className="p-3 bg-slate-950 border border-slate-900 rounded-lg space-y-1 shadow-lg">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Mejor Cumplimiento
          </span>
          <div className="text-base font-bold font-sans text-indigo-400 truncate">
            {modeloMejorCumplimiento}
          </div>
          <span className="text-[9px] font-mono text-slate-550 block">Entregas a tiempo</span>
        </div>

        <div className="p-3 bg-slate-950 border border-slate-900 rounded-lg space-y-1 shadow-lg">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Cumplimiento Prom.
          </span>
          <div className="text-lg font-bold font-mono text-indigo-400">
            {cumplimientoPromedioPedido}%
          </div>
          <span className="text-[9px] font-mono text-slate-550 block">Por pedido</span>
        </div>

        <div className="p-3 bg-slate-950 border border-slate-900 rounded-lg space-y-1 shadow-lg">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Modelos Activos
          </span>
          <div className="text-lg font-bold font-mono text-slate-205 text-slate-200">
            {totalModelosActivos}
          </div>
          <span className="text-[9px] font-mono text-slate-550 block">Moldes en corrida</span>
        </div>

      </div>

      {/* 6. AUTOMATED INSIGHTS / RECOMENDACIONES SIMULADAS */}
      <div className="bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-2xl space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            <h3 className="text-xs font-bold font-mono text-slate-200 uppercase tracking-widest">
              💡 Insights Automáticos y Diagnóstico Operativo Simulador
            </h3>
          </div>
          <button
            onClick={handleGenerateInsights}
            disabled={aiGenerating}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-wait text-slate-950 text-[10px] font-mono font-black uppercase transition flex items-center gap-1.5"
          >
            {aiGenerating ? (
              <>
                <Activity className="w-3 h-3 animate-pulse" />
                Analizando {filteredRecords.length} registros…
              </>
            ) : aiInsightsGenerated ? 'Regenerar insights AI' : 'Generar insights AI'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {aiCards.map((card, i) => {
            const tone = AI_TONE_CLASSES[card.tone];
            return (
              <div key={i} className={`p-3.5 border rounded-lg space-y-1 ${tone.wrap} ${aiGenerating ? 'animate-pulse' : ''}`}>
                <span className={`text-[9px] font-mono font-bold uppercase tracking-wider block ${tone.tag}`}>{card.tag}</span>
                <p className={`text-[11px] leading-relaxed font-sans font-medium ${aiInsights ? 'text-slate-200' : 'text-slate-400 italic'}`}>
                  {card.text}
                </p>
              </div>
            );
          })}
        </div>
        {aiInsightsGenerated && aiSummary && (
          <div className="p-3 bg-indigo-950/25 border border-indigo-900/40 rounded-lg text-[11px] text-indigo-200 font-mono flex items-start gap-2">
            <span className="text-indigo-400">▮</span>
            <span>{aiSummary}</span>
          </div>
        )}
      </div>

      {/* 3. GRÁFIQUES DE RENDIMIENTO (7 TOTAL PANELS) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

        {/* Gráfica 1: Ranking por Pares */}
        <div className="bg-slate-950 border border-slate-900 rounded-lg p-3 shadow-xl overflow-hidden">
          <h3 className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider mb-2">
            🥇 Ranking de Modelos por Pares
          </h3>
          <p className="text-[10px] text-slate-500 mb-4 leading-none">
            Volumen consolidado de inyecciones exitosas.
          </p>
          <div className="h-56 overflow-x-auto">
            <div className="w-full min-w-[420px] h-full">
            <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <RechartsBarChart data={rankingModelosData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                <RechartsCartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <RechartsXAxis dataKey="name" stroke="#64748b" style={{ fontSize: '8px' }} />
                <RechartsYAxis stroke="#64748b" style={{ fontSize: '8px' }} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', fontSize: '10px' }} />
                <RechartsBar dataKey="Pares" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </RechartsBarChart>
            </RechartsResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Gráfica 2: Tendencia de Producción */}
        <div className="bg-slate-950 border border-slate-900 rounded-lg p-3 shadow-xl overflow-hidden">
          <h3 className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider mb-2">
            📈 Tendencia por Modelo (Pares/Día)
          </h3>
          <p className="text-[10px] text-slate-500 mb-4 leading-none">
            Análisis de las ultimas corridas diarias.
          </p>
          <div className="h-56 overflow-x-auto">
            <div className="w-full min-w-[420px] h-full">
            <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <RechartsLineChart data={tendenciaModelosData} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                <RechartsCartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <RechartsXAxis dataKey="date" stroke="#64748b" style={{ fontSize: '8px' }} />
                <RechartsYAxis stroke="#64748b" style={{ fontSize: '8px' }} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', fontSize: '10px' }} />
                {uniqueModels.map((model, idx) => (
                  <RechartsLine key={model} type="monotone" dataKey={model} stroke={['#10b981', '#3b82f6', '#f59e0b', '#a855f7'][idx % 4]} strokeWidth={2} dot={{ r: 1 }} />
                ))}
              </RechartsLineChart>
            </RechartsResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Gráfica 3: Pareto de Defectos por Modelo */}
        <div className="bg-slate-950 border border-slate-900 rounded-lg p-3 shadow-xl overflow-hidden">
          <h3 className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider mb-2">
            ⚠️ Pareto de Defectos por Modelo
          </h3>
          <p className="text-[10px] text-slate-500 mb-4 leading-none">
            Volumen absoluto de merma y % acumulado.
          </p>
          <div className="h-56 overflow-x-auto">
            <div className="w-full min-w-[420px] h-full">
            <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <RechartsBarChart data={paretoDefectosData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                <RechartsCartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <RechartsXAxis dataKey="name" stroke="#64748b" style={{ fontSize: '8px' }} />
                <RechartsYAxis stroke="#64748b" style={{ fontSize: '8px' }} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', fontSize: '10px' }} />
                <RechartsBar dataKey="Defectos" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </RechartsBarChart>
            </RechartsResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Gráfica 4: Lead Time promedio */}
        <div className="bg-slate-950 border border-slate-900 rounded-lg p-3 shadow-xl overflow-hidden">
          <h3 className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider mb-2">
            ⏳ Lead Time Promedio (Horas)
          </h3>
          <p className="text-[10px] text-slate-500 mb-4 leading-none">
            Tiempo de ciclo desde almacén hasta embarque.
          </p>
          <div className="h-56 overflow-x-auto">
            <div className="w-full min-w-[420px] h-full">
            <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <RechartsBarChart data={leadTimeChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                <RechartsCartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <RechartsXAxis dataKey="name" stroke="#64748b" style={{ fontSize: '7px' }} />
                <RechartsYAxis stroke="#64748b" style={{ fontSize: '8px' }} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', fontSize: '10px' }} />
                <RechartsBar dataKey="Lead Time Hrs" fill="#a855f7" radius={[4, 4, 0, 0]} />
              </RechartsBarChart>
            </RechartsResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Gráfica 6: Cumplimiento de Entrega */}
        <div className="bg-slate-950 border border-slate-900 rounded-lg p-3 shadow-xl overflow-hidden">
          <h3 className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider mb-2">
            📦 Cumplimiento de entrega (%)
          </h3>
          <p className="text-[10px] text-slate-500 mb-4 leading-none">
            Porcentaje de pedidos cerrados a tiempo real.
          </p>
          <div className="h-56 overflow-x-auto">
            <div className="w-full min-w-[420px] h-full">
            <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <RechartsBarChart data={cumplimientoModelData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                <RechartsCartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <RechartsXAxis dataKey="name" stroke="#64748b" style={{ fontSize: '7px' }} />
                <RechartsYAxis stroke="#64748b" style={{ fontSize: '8px' }} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', fontSize: '10px' }} />
                <RechartsBar dataKey="Cumplimiento %" fill="#06b6d4" />
              </RechartsBarChart>
            </RechartsResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Gráfica 7: Producción por Color */}
        <div className="bg-slate-950 border border-slate-900 rounded-lg p-3 shadow-xl xl:col-span-2 overflow-hidden">
          <h3 className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider mb-2">
            🎨 Volumen de Producción por Color Pigmento
          </h3>
          <p className="text-[10px] text-slate-500 mb-4 leading-none">
            Análisis de distribución de tintas y materias primas EVA.
          </p>
          <div className="h-56 overflow-x-auto">
            <div className="w-full min-w-[560px] h-full">
            <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <RechartsBarChart data={produccionColorData} layout="vertical" margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                <RechartsCartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <RechartsXAxis type="number" stroke="#64748b" style={{ fontSize: '8px' }} />
                <RechartsYAxis dataKey="name" type="category" stroke="#64748b" style={{ fontSize: '8px' }} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', fontSize: '10px' }} />
                <RechartsBar dataKey="Pares" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </RechartsBarChart>
            </RechartsResponsiveContainer>
            </div>
          </div>
        </div>

      </div>

      {/* MASTER-DETAIL WORKSPACE PANELS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left: 4. MAIN INTERACTIVE TABLE */}
        <div className="lg:col-span-8 bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-2xl space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xs font-black font-mono text-slate-300 uppercase tracking-widest">
                📊 TABLA OPERATIVA DE INGENIERÍA POR MODELO
              </h3>
              <p className="text-[10px] text-slate-500 font-sans">
                Haga clic sobre un modelo para abrir el monitor de detalle técnico de moldura.
              </p>
            </div>
            <span className="text-[10px] font-mono text-slate-400 font-bold bg-slate-900 px-2 py-1 rounded">
              {summariesList.length} Modelos Listados
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-900">
            <table className="w-full text-left font-sans text-xs">
              <thead className="bg-slate-900 font-mono text-slate-450 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-3 font-bold text-slate-300">Modelo</th>
                  <th className="py-3 px-3 text-right font-bold">Total Pares</th>
                  <th className="py-3 px-3 text-right font-bold">% Partic.</th>
                  <th className="py-3 px-3 text-right font-bold">LeadTime Prom.</th>
                  <th className="py-3 px-3 text-right font-bold">Iny. Prom</th>
                  <th className="py-3 px-3 text-right font-bold">Aduana Prom</th>
                  <th className="py-3 px-3 text-right font-bold">Banda Prom</th>
                  <th className="py-3 px-3 text-right font-bold text-red-400">% Defect.</th>
                  <th className="py-3 px-3 text-right font-bold">Segundas</th>
                  <th className="py-3 px-3 text-right font-bold">Cumplimiento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/40 bg-slate-950">
                {summariesList.map((m) => {
                  const part = totalPares > 0 ? ((m.producido / totalPares) * 100).toFixed(1) : '0';
                  const defRate = m.producido > 0 ? ((m.defectuosos / m.producido) * 100).toFixed(1) : '0';
                  const compliance = modelCompliance(m);
                  const isSelected = selectedProductModel === m.name;

                  return (
                    <tr 
                      key={m.name}
                      onClick={() => setSelectedProductModel(m.name)}
                      className={`hover:bg-slate-900/60 cursor-pointer transition-colors ${
                        isSelected ? 'bg-indigo-950/25 border-l-4 border-l-cyan-500' : ''
                      }`}
                    >
                      <td className="py-3.5 px-3 font-bold text-slate-200 uppercase flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                        {m.name}
                      </td>
                      <td className="py-3.5 px-3 text-right text-slate-300 font-mono font-semibold">{m.producido.toLocaleString()}</td>
                      <td className="py-3.5 px-3 text-right text-slate-400 font-mono">{part}%</td>
                      <td className="py-3.5 px-3 text-right text-slate-300 font-mono">{avgLeadTime(m).toFixed(1)} hrs</td>
                      <td className="py-3.5 px-3 text-right text-slate-450 font-mono">{Math.round(avgInyTime(m)).toLocaleString()}m</td>
                      <td className="py-3.5 px-3 text-right text-slate-450 font-mono">{Math.round(avgEstTime(m)).toLocaleString()}m</td>
                      <td className="py-3.5 px-3 text-right text-slate-450 font-mono">{Math.round(avgBndTime(m)).toLocaleString()}m</td>
                      <td className="py-3.5 px-3 text-right text-red-400 font-mono font-bold">{defRate}%</td>
                      <td className="py-3.5 px-3 text-right text-slate-400 font-mono">{m.segundas.toLocaleString()}</td>
                      <td className="py-3.5 px-3 text-right font-mono font-bold text-cyan-400">{compliance}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: 5. DETALLE COMPLETO DE MODELO */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl space-y-5">
          <div className="flex justify-between items-start border-b border-slate-800 pb-3">
            <div>
              <span className="text-[9px] font-mono text-cyan-400 font-bold block uppercase tracking-widest">
                FICHA TÉCNICA Y MONITOREO
              </span>
              <h3 className="text-lg font-black font-sans text-slate-100 uppercase tracking-tight">
                Modelo {selectedProductModel}
              </h3>
            </div>
            <span className="px-2 py-0.5 rounded bg-cyan-900/30 text-cyan-400 border border-cyan-800 text-[10px] font-mono font-bold">
              OEE ACTIVO
            </span>
          </div>

          <div className="space-y-4">
            
            {/* Quick Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-850">
                <span className="text-[10px] font-mono text-slate-500 uppercase block">Total Producido</span>
                <span className="text-sm font-bold font-mono text-slate-200">
                  {selectedModelStats.producido.toLocaleString()} pares
                </span>
              </div>
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-850">
                <span className="text-[10px] font-mono text-slate-500 uppercase block">Cumplimiento</span>
                <span className={`text-sm font-bold font-mono ${selectedModelCompliance >= 90 ? 'text-green-400' : 'text-amber-500'}`}>
                  {selectedModelCompliance}%
                </span>
              </div>
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-850">
                <span className="text-[10px] font-mono text-red-500 uppercase block">Porcentaje Defecto</span>
                <span className="text-sm font-bold font-mono text-red-400">
                  {selectedModelDefectPct}%
                </span>
              </div>
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-850">
                <span className="text-[10px] font-mono text-indigo-400 uppercase block">Lead Time Promedio</span>
                <span className="text-sm font-bold font-mono text-slate-200">
                  {avgLeadTime(selectedModelStats).toFixed(1)} hrs
                </span>
              </div>
            </div>

            {/* Timings per Station Progress Bars */}
            <div className="space-y-2.5 bg-slate-950 p-3.5 rounded-lg border border-slate-850">
              <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider block">
                ⏱️ Tiempos Promediados por Etapa:
              </span>
              
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Inyección de Compuesto</span>
                  <strong className="text-slate-300 font-mono">
                    {Math.round(avgInyTime(selectedModelStats))} mins
                  </strong>
                </div>
                <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500" style={{ width: `${Math.min(100, avgInyTime(selectedModelStats) * 1.5)}%` }}></div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Túnel de Estabilización</span>
                  <strong className="text-slate-300 font-mono">
                    {Math.round(avgEstTime(selectedModelStats))} mins
                  </strong>
                </div>
                <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, avgEstTime(selectedModelStats) * 0.8)}%` }}></div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-400">Banda de Recorte / Acabado</span>
                  <strong className="text-slate-300 font-mono">
                    {Math.round(avgBndTime(selectedModelStats))} mins
                  </strong>
                </div>
                <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-400" style={{ width: `${Math.min(100, avgBndTime(selectedModelStats) * 2)}%` }}></div>
                </div>
              </div>
            </div>

            {/* Clientes Adquirientes */}
            <div className="space-y-1">
              <span className="text-[10px] font-mono text-slate-500 uppercase block font-bold">Clientes Distribución</span>
              <div className="flex flex-wrap gap-1.5">
                {selectedModelClientes.slice(0, 3).map((cl, i) => (
                  <span key={i} className="px-2 py-0.5 bg-slate-950 text-slate-300 border border-slate-800 rounded text-[10px]">
                    {cl}
                  </span>
                ))}
              </div>
            </div>

            {/* Colores Usados */}
            <div className="space-y-1">
              <span className="text-[10px] font-mono text-slate-500 uppercase block font-bold">Colores en Producción</span>
              <div className="flex flex-wrap gap-1.5">
                {selectedModelColors.slice(0, 4).map((col, i) => (
                  <span key={i} className="px-2 py-0.5 bg-slate-950 text-indigo-300 border border-indigo-950/40 rounded text-[10px]">
                    {col}
                  </span>
                ))}
              </div>
            </div>

            {/* Tallas Más Producidas Distribution */}
            <div className="space-y-2 bg-slate-950 p-3.5 rounded-lg border border-slate-850">
              <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider block">
                📐 Distribución Estimada por Tallas:
              </span>
              <div className="space-y-1">
                {tallasDistribution.map((t, idx) => (
                  <div key={idx} className="flex justify-between items-center text-[10.5px]">
                    <span className="text-slate-450">{t.tallas}</span>
                    <span className="text-slate-200 font-mono font-bold">{t.pares.toLocaleString()} pars</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Operational recommendation block */}
            <div className="p-4 bg-slate-950 rounded-lg border border-slate-850 space-y-2">
              <span className="text-[10px] font-mono text-cyan-400 font-bold block uppercase tracking-wider">
                💡 RECOMENDACIÓN OPERATIVA SISMULADA CHAT G:
              </span>
              <p className="text-[11.5px] italic text-slate-300 leading-relaxed font-sans font-medium">
                {selectedProductModel && (
                  <span>Modelo <strong>{selectedProductModel}</strong>: defectivo <strong>{selectedModelDefectPct}%</strong>, cumplimiento <strong>{selectedModelCompliance}%</strong>. Recomendación pendiente de análisis AI real.</span>
                )}
              </p>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
};

/* 6. Calidad View */
export interface RichQualityRecord {
  fecha: string;
  turno: '1' | '2' | '3';
  area: 'INYECCION' | 'BANDA' | 'ESTABILIZACION';
  maquinaOBanda: string;
  inspector: string;
  lider: string;
  lote: string;
  modelo: string;
  color: string;
  talla: number;
  totalInspeccionado: number;
  primeras: number;
  segundas: number;
  reproceso: number;
  merma: number;
  defecto: string;
  cantidadDefecto: number;
  porcentajeDefectivo: number;
  cliente: string;
}

export const CalidadView: React.FC = () => {
  const { currentTenant, addAuditLog } = useDashboard();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [chartTab, setChartTab] = useState<'pareto-areas' | 'device-specs' | 'trends-rates'>('pareto-areas');

  const [inspectionRecords, setInspectionRecords] = useState<RichQualityRecord[]>([]);

  useEffect(() => {
    setInspectionRecords([]);
  }, [currentTenant.id]);

  // Form registration states
  const [newFecha, setNewFecha] = useState('');
  const [newTurno, setNewTurno] = useState<'1' | '2' | '3'>('1');
  const [newArea, setNewArea] = useState<'INYECCION' | 'BANDA' | 'ESTABILIZACION'>('INYECCION');
  const [newMaquinaOBanda, setNewMaquinaOBanda] = useState('');
  const [newInspector, setNewInspector] = useState('');
  const [newLider, setNewLider] = useState('');
  const [newLote, setNewLote] = useState('');
  const [newModelo, setNewModelo] = useState('');
  const [newColor, setNewColor] = useState('');
  const [newTalla, setNewTalla] = useState(0);
  const [newTotal, setNewTotal] = useState(0);
  const [newSegundas, setNewSegundas] = useState(0);
  const [newReproceso, setNewReproceso] = useState(0);
  const [newMerma, setNewMerma] = useState(0);
  const [newDefecto, setNewDefecto] = useState('');

  // Distinct filter states
  const [filtroFecha, setFiltroFecha] = useState('');
  const [filtroRangoInicio, setFiltroRangoInicio] = useState('2026-05-10');
  const [filtroRangoFin, setFiltroRangoFin] = useState('2026-05-25');
  const [filtroArea, setFiltroArea] = useState('');
  const [filtroTurno, setFiltroTurno] = useState('');
  const [filtroInspector, setFiltroInspector] = useState('');
  const [filtroLider, setFiltroLider] = useState('');
  const [filtroMaquina, setFiltroMaquina] = useState('');
  const [filtroBanda, setFiltroBanda] = useState('');
  const [filtroModelo, setFiltroModelo] = useState('');
  const [filtroColor, setFiltroColor] = useState('');
  const [filtroDefecto, setFiltroDefecto] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');

  // Extract master list of metrics dynamically
  const uniqueInspectors = Array.from(new Set(inspectionRecords.map(r => r.inspector))).filter(Boolean);
  const uniqueLiders = Array.from(new Set(inspectionRecords.map(r => r.lider))).filter(Boolean);
  const uniqueModelsList = Array.from(new Set(inspectionRecords.map(r => r.modelo))).filter(Boolean);
  const uniqueColorsList = Array.from(new Set(inspectionRecords.map(r => r.color))).filter(Boolean);
  const uniqueDefectsList = Array.from(new Set(inspectionRecords.map(r => r.defecto))).filter(f => f && f !== 'Ninguno');
  const uniqueClientsList = Array.from(new Set(inspectionRecords.map(r => r.cliente))).filter(Boolean);

  const uniqueMachines = Array.from(new Set(inspectionRecords.filter(r => r.area === 'INYECCION').map(r => r.maquinaOBanda))).filter(Boolean);
  const uniqueBands = Array.from(new Set(inspectionRecords.filter(r => r.area === 'BANDA').map(r => r.maquinaOBanda))).filter(Boolean);

  // Apply multi-tenant Isolated Filtering
  const filteredRecords = inspectionRecords.filter(log => {
    // 1. Single day exact
    if (filtroFecha && log.fecha !== filtroFecha) return false;
    // 2. Rango de fechas
    if (filtroRangoInicio && log.fecha < filtroRangoInicio) return false;
    if (filtroRangoFin && log.fecha > filtroRangoFin) return false;
    // 3. Area
    if (filtroArea && log.area !== filtroArea) return false;
    // 4. Turno
    if (filtroTurno && log.turno !== filtroTurno) return false;
    // 5. Inspector
    if (filtroInspector && log.inspector !== filtroInspector) return false;
    // 6. Lider
    if (filtroLider && log.lider !== filtroLider) return false;
    // 7. Maquina
    if (filtroMaquina && log.maquinaOBanda !== filtroMaquina) return false;
    // 8. Banda
    if (filtroBanda && log.maquinaOBanda !== filtroBanda) return false;
    // 9. Modelo
    if (filtroModelo && log.modelo !== filtroModelo) return false;
    // 10. Color
    if (filtroColor && log.color !== filtroColor) return false;
    // 11. Defecto
    if (filtroDefecto && log.defecto !== filtroDefecto) return false;
    // 12. Cliente
    if (filtroCliente && log.cliente !== filtroCliente) return false;

    return true;
  });

  // Calculate 12 KPIs metrics dynamically
  const totalInspeccionado = filteredRecords.reduce((sum, r) => sum + r.totalInspeccionado, 0);
  const totalPrimeras = filteredRecords.reduce((sum, r) => sum + r.primeras, 0);
  const totalSegundas = filteredRecords.reduce((sum, r) => sum + r.segundas, 0);
  const totalReproceso = filteredRecords.reduce((sum, r) => sum + r.reproceso, 0);
  const totalMerma = filteredRecords.reduce((sum, r) => sum + r.merma, 0);
  
  // Total Defectos representing non-primeras anomalies (all recorded faults)
  const totalDefectos = filteredRecords.reduce((sum, r) => sum + r.cantidadDefecto, 0);

  const pctDefectivo = totalInspeccionado > 0 ? Number(((totalDefectos / totalInspeccionado) * 100).toFixed(2)) : 0;
  const pctSegundas = totalInspeccionado > 0 ? Number(((totalSegundas / totalInspeccionado) * 100).toFixed(2)) : 0;

  // Defecto principal
  const defectCounts: Record<string, number> = {};
  filteredRecords.forEach(r => {
    if (r.defecto && r.defecto !== 'Ninguno') {
      defectCounts[r.defecto] = (defectCounts[r.defecto] || 0) + r.cantidadDefecto;
    }
  });
  const sortedDefects = Object.entries(defectCounts).sort((a, b) => b[1] - a[1]);
  const defectoPrincipal = sortedDefects[0]?.[0] || 'Ninguno';

  // Area con mayor defecto
  const areaDefects: Record<string, number> = {};
  filteredRecords.forEach(r => {
    areaDefects[r.area] = (areaDefects[r.area] || 0) + r.cantidadDefecto;
  });
  const sortedAreas = Object.entries(areaDefects).sort((a, b) => b[1] - a[1]);
  const areaMayorDefecto = sortedAreas[0]?.[0] || 'Ninguna';

  // Maquina/Banda crítica
  const deviceDefects: Record<string, number> = {};
  filteredRecords.forEach(r => {
    deviceDefects[r.maquinaOBanda] = (deviceDefects[r.maquinaOBanda] || 0) + r.cantidadDefecto;
  });
  const sortedDevices = Object.entries(deviceDefects).sort((a, b) => b[1] - a[1]);
  const maquinaBandaCritica = sortedDevices[0]?.[0] || 'Ninguna';

  // Modelo crítico (the shoe model with the highest defect count)
  const modelDefects: Record<string, number> = {};
  filteredRecords.forEach(r => {
    modelDefects[r.modelo] = (modelDefects[r.modelo] || 0) + r.cantidadDefecto;
  });
  const sortedModels = Object.entries(modelDefects).sort((a, b) => b[1] - a[1]);
  const modeloCritico = sortedModels[0]?.[0] || 'Ninguno';

  // CLEAR ALL FILTER HANDLER
  const handleClearFilters = () => {
    setFiltroFecha('');
    setFiltroRangoInicio('2026-05-10');
    setFiltroRangoFin('2026-05-25');
    setFiltroArea('');
    setFiltroTurno('');
    setFiltroInspector('');
    setFiltroLider('');
    setFiltroMaquina('');
    setFiltroBanda('');
    setFiltroModelo('');
    setFiltroColor('');
    setFiltroDefecto('');
    setFiltroCliente('');
  };

  // NEW PHYSICAL FAILURE REGISTRATION
  const handleRegisterQualityLog = (e: React.FormEvent) => {
    e.preventDefault();

    const actualDefectQty = newSegundas + newReproceso + newMerma;
    const computedPrimeras = Math.max(0, newTotal - actualDefectQty);
    const computedPct = Number(((actualDefectQty / newTotal) * 100).toFixed(2));

    const newLog: RichQualityRecord = {
      fecha: newFecha,
      turno: newTurno,
      area: newArea,
      maquinaOBanda: newMaquinaOBanda,
      inspector: newInspector,
      lider: newLider,
      lote: newLote,
      modelo: newModelo,
      color: newColor,
      talla: newTalla,
      totalInspeccionado: newTotal,
      primeras: computedPrimeras,
      segundas: newSegundas,
      reproceso: newReproceso,
      merma: newMerma,
      defecto: actualDefectQty > 0 ? newDefecto : 'Ninguno',
      cantidadDefecto: actualDefectQty,
      porcentajeDefectivo: computedPct,
      cliente: 'Cliente General PQA'
    };

    const nextLogs = [newLog, ...inspectionRecords];
    setInspectionRecords(nextLogs);

    addAuditLog('QUALITY', 'REGISTER_FAILURE_RECORD', `Falla física registrada para Lote: ${newLote}, Modelo: ${newModelo}, Defectivo: ${computedPct}%`);
    setIsFormOpen(false);
  };

  // GRAPHICS DATA PROCESSINGS (10 DELIBERATED INTENTIONAL PAIRINGS)

  // 1. Pareto de defectos (sorted types and accumulated %)
  let cumulativeValueSum = 0;
  const paretoDefectTotal = sortedDefects.reduce((sum, curr) => sum + curr[1], 0) || 1;
  const paretoChartData = sortedDefects.map((item, idx) => {
    cumulativeValueSum += item[1];
    const itemPct = Math.round((cumulativeValueSum / paretoDefectTotal) * 100);
    return {
      name: item[0],
      'Fallas': item[1],
      'Pareto %': Math.min(100, itemPct)
    };
  });

  // 2. Defectos por área
  const areaChartData = Object.entries(areaDefects).map(([name, val]) => ({
    name,
    'Defectivos': val
  }));

  // 3. Defectos por máquina (INYECCION area specifically)
  const machineChartData = Object.entries(deviceDefects)
    .filter(([name]) => name.includes('Inyectora') || name.includes('I-'))
    .map(([name, val]) => ({
      name,
      'Defectivos': val
    })).sort((a, b) => b['Defectivos'] - a['Defectivos']);

  // 4. Defectos por banda (BANDA area specifically)
  const bandChartData = Object.entries(deviceDefects)
    .filter(([name]) => name.includes('Banda') || name.includes('Detalle'))
    .map(([name, val]) => ({
      name,
      'Defectivos': val
    })).sort((a, b) => b['Defectivos'] - a['Defectivos']);

  // 5. Defectos por modelo
  const modelChartData = Object.entries(modelDefects).map(([name, val]) => ({
    name,
    'Defectivos': val
  })).sort((a, b) => b['Defectivos'] - a['Defectivos']);

  // 6. Defectos por color
  const colorDefectsMap: Record<string, number> = {};
  filteredRecords.forEach(r => {
    colorDefectsMap[r.color] = (colorDefectsMap[r.color] || 0) + r.cantidadDefecto;
  });
  const colorChartData = Object.entries(colorDefectsMap).map(([name, val]) => ({
    name,
    'Defectivos': val
  })).sort((a, b) => b['Defectivos'] - a['Defectivos']);

  // 7. Defectos por talla
  const sizeDefectsMap: Record<number, number> = {};
  filteredRecords.forEach(r => {
    sizeDefectsMap[r.talla] = (sizeDefectsMap[r.talla] || 0) + r.cantidadDefecto;
  });
  const tallaChartData = Object.entries(sizeDefectsMap).map(([name, val]) => ({
    name: `T${name}`,
    'Defectivos': val
  })).sort((a, b) => {
    const na = parseInt(a.name.replace('T', ''));
    const nb = parseInt(b.name.replace('T', ''));
    return na - nb;
  });

  // 8. Primeras vs segundas (Prime vs Secondary)
  const primeVsSecMap: Record<string, { primeras: number; segundas: number }> = {};
  filteredRecords.forEach(r => {
    if (!primeVsSecMap[r.modelo]) {
      primeVsSecMap[r.modelo] = { primeras: 0, segundas: 0 };
    }
    primeVsSecMap[r.modelo].primeras += r.primeras;
    primeVsSecMap[r.modelo].segundas += r.segundas;
  });
  const primeVsSecChartData = Object.entries(primeVsSecMap).map(([name, stats]) => ({
    name,
    'Primeras': stats.primeras,
    'Segundas': stats.segundas
  })).slice(0, 7); // select top 7 to prevent overflow

  // 9. Tendencia de % defectivo por día
  const dailyStatsMap: Record<string, { total: number; def: number }> = {};
  filteredRecords.forEach(r => {
    if (!dailyStatsMap[r.fecha]) {
      dailyStatsMap[r.fecha] = { total: 0, def: 0 };
    }
    dailyStatsMap[r.fecha].total += r.totalInspeccionado;
    dailyStatsMap[r.fecha].def += r.cantidadDefecto;
  });
  const dailyTrendChartData = Object.entries(dailyStatsMap).map(([date, stats]) => ({
    date: date.split('-').slice(1).join('/'),
    '% Defectivo': stats.total > 0 ? Number(((stats.def / stats.total) * 100).toFixed(1)) : 0
  })).sort((a, b) => a.date.localeCompare(b.date)).slice(-10); // past 10 entries

  // 10. Reprocesos y merma por semana (Timeline of past 10 active slots)
  const weeklyStatsMap: Record<string, { reproceso: number; merma: number }> = {};
  filteredRecords.forEach(r => {
    if (!weeklyStatsMap[r.fecha]) {
      weeklyStatsMap[r.fecha] = { reproceso: 0, merma: 0 };
    }
    weeklyStatsMap[r.fecha].reproceso += r.reproceso;
    weeklyStatsMap[r.fecha].merma += r.merma;
  });
  const weeklyRepMermChartData = Object.entries(weeklyStatsMap).map(([date, stats]) => ({
    date: date.split('-').slice(1).join('/'),
    'Reproceso': stats.reproceso,
    'Merma': stats.merma
  })).sort((a, b) => a.date.localeCompare(b.date)).slice(-8);

  return (
    <div className="space-y-6">

      {/* TOP HEADER */}
      <div className="flex justify-between items-center bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-xl flex-wrap gap-4">
        <div>
          <span className="text-[10px] font-mono text-pink-500 uppercase tracking-widest font-bold block mb-1">
            MÓDULO DE ADUANA DE CALIDAD INDUSTRIAL
          </span>
          <h2 className="text-xl font-black font-sans text-slate-100 uppercase tracking-tight leading-none mb-1 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-pink-600 animate-pulse"></span>
            Aduana de Control de Calidad EVA y Mermas
          </h2>
          <p className="text-xs text-slate-400 font-sans">
            Mapeo integral de primeras, segundas, reproceso y merma por inyectoras y bandas. Tenant: <strong className="text-slate-300">{currentTenant.name}</strong>.
          </p>
        </div>
      </div>

      {/* 1. FILTROS SUPERIORES COMPLETO (12 FILTERS) */}
      <div className="bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-900 pb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-pink-500" />
            <span className="text-xs font-mono text-slate-300 uppercase tracking-wider font-bold">Consola Integradora de Calidad PLASYECT</span>
          </div>
          <button 
            onClick={handleClearFilters}
            className="text-[10px] bg-slate-900 hover:bg-slate-850 px-2 py-1 text-slate-400 hover:text-white border border-slate-800 rounded font-mono transition flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            Restablecer Rango Estándar
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
          
          {/* 1. Fecha */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Fecha Única</label>
            <input 
              type="date"
              value={filtroFecha}
              onChange={(e) => setFiltroFecha(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            />
          </div>

          {/* 2. Rango Inicio */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Rango Desde</label>
            <input 
              type="date"
              value={filtroRangoInicio}
              onChange={(e) => setFiltroRangoInicio(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            />
          </div>

          {/* 3. Rango Fin */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Rango Hasta</label>
            <input 
              type="date"
              value={filtroRangoFin}
              onChange={(e) => setFiltroRangoFin(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            />
          </div>

          {/* 4. Area */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Área Trabajo</label>
            <select
              value={filtroArea}
              onChange={(e) => setFiltroArea(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todas --</option>
              <option value="INYECCION">🔩 INYECCIÓN</option>
              <option value="BANDA">〰️ BANDA / LIJADO</option>
              <option value="ESTABILIZACION">🧪 ESTABILIZACIÓN</option>
            </select>
          </div>

          {/* 5. Turno */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Turno</label>
            <select
              value={filtroTurno}
              onChange={(e) => setFiltroTurno(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todos --</option>
              <option value="1">Turno 1 (Matutino)</option>
              <option value="2">Turno 2 (Vespertino)</option>
              <option value="3">Turno 3 (Nocturno)</option>
            </select>
          </div>

          {/* 6. Inspector */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Inspector</label>
            <select
              value={filtroInspector}
              onChange={(e) => setFiltroInspector(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todos --</option>
              {uniqueInspectors.map((ins, i) => (
                <option key={i} value={ins}>{ins}</option>
              ))}
            </select>
          </div>

          {/* 7. Líder */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Líder Turno</label>
            <select
              value={filtroLider}
              onChange={(e) => setFiltroLider(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todos --</option>
              {uniqueLiders.map((lid, i) => (
                <option key={i} value={lid}>{lid}</option>
              ))}
            </select>
          </div>

          {/* 8. Máquina */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Inyectora / Máquina</label>
            <select
              value={filtroMaquina}
              onChange={(e) => setFiltroMaquina(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todas --</option>
              {uniqueMachines.map((m, i) => (
                <option key={i} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* 9. Banda */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Banda / Acabado</label>
            <select
              value={filtroBanda}
              onChange={(e) => setFiltroBanda(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todas --</option>
              {uniqueBands.map((b, i) => (
                <option key={i} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* 10. Modelo */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Suela / Código Modelo</label>
            <select
              value={filtroModelo}
              onChange={(e) => setFiltroModelo(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todos --</option>
              {uniqueModelsList.map((m, i) => (
                <option key={i} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* 11. Color */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Color Pigmento</label>
            <select
              value={filtroColor}
              onChange={(e) => setFiltroColor(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none font-sans"
            >
              <option value="">-- Todos --</option>
              {uniqueColorsList.map((c, i) => (
                <option key={i} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* 11.5 Defecto */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Tipo Defecto</label>
            <select
              value={filtroDefecto}
              onChange={(e) => setFiltroDefecto(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todos --</option>
              {uniqueDefectsList.map((d, i) => (
                <option key={i} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* 12. Cliente */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Cliente Comprador</label>
            <select
              value={filtroCliente}
              onChange={(e) => setFiltroCliente(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todos --</option>
              {uniqueClientsList.map((cl, i) => (
                <option key={i} value={cl}>{cl}</option>
              ))}
            </select>
          </div>

        </div>
      </div>

      {/* 2. KPIS SUPERIORES COMPLETO (12 DIRECT METRICS) */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
        
        {/* KPI 1 */}
        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-lg">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Muestra Inspeccionada
          </span>
          <div className="text-xl font-bold font-mono text-cyan-400">
            {totalInspeccionado.toLocaleString()}
          </div>
          <span className="text-[9px] font-mono text-slate-600 block">Pares totales</span>
        </div>

        {/* KPI 2 */}
        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-lg">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Total Primeras
          </span>
          <div className="text-xl font-bold font-mono text-green-400">
            {totalPrimeras.toLocaleString()}
          </div>
          <span className="text-[9px] font-mono text-slate-600 block">Cumplen grado A</span>
        </div>

        {/* KPI 3 */}
        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-lg">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Total Segundas
          </span>
          <div className="text-xl font-bold font-mono text-amber-500">
            {totalSegundas.toLocaleString()}
          </div>
          <span className="text-[9px] font-mono text-slate-600 block">Detalles cosméticos</span>
        </div>

        {/* KPI 4 */}
        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-lg">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Total Reproceso
          </span>
          <div className="text-xl font-bold font-mono text-indigo-400">
            {totalReproceso.toLocaleString()}
          </div>
          <span className="text-[9px] font-mono text-slate-600 block">Flasheados / Lijables</span>
        </div>

        {/* KPI 5 */}
        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-lg">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Total Merma (Scrap)
          </span>
          <div className="text-xl font-bold font-mono text-red-550 text-red-500">
            {totalMerma.toLocaleString()}
          </div>
          <span className="text-[9px] font-mono text-slate-600 block">No recuperables</span>
        </div>

        {/* KPI 6 */}
        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-lg">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Total Defectivos
          </span>
          <div className="text-xl font-bold font-mono text-red-400">
            {totalDefectos.toLocaleString()}
          </div>
          <span className="text-[9px] font-mono text-slate-600 block">Mermas+Reprocesos+Segundas</span>
        </div>

        {/* KPI 7 */}
        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-lg">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none font-bold">
            % Defectivo
          </span>
          <div className={`text-xl font-bold font-mono ${pctDefectivo > 5 ? 'text-red-400' : pctDefectivo > 2 ? 'text-amber-500' : 'text-green-400'}`}>
            {pctDefectivo}%
          </div>
          <span className="text-[9px] font-mono text-slate-600 block">Tasa de merma total</span>
        </div>

        {/* KPI 8 */}
        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-lg">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            % Segundas
          </span>
          <div className="text-xl font-bold font-mono text-indigo-300">
            {pctSegundas}%
          </div>
          <span className="text-[9px] font-mono text-slate-600 block">Porcentaje segundas</span>
        </div>

        {/* KPI 9 */}
        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-lg">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Defecto Principal
          </span>
          <div className="text-sm font-bold font-sans text-slate-200 truncate" title={defectoPrincipal}>
            {defectoPrincipal}
          </div>
          <span className="text-[9px] font-mono text-slate-600 block">Mayor recurrencia</span>
        </div>

        {/* KPI 10 */}
        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-lg">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Mayor Defecto Área
          </span>
          <div className="text-sm font-bold font-sans text-indigo-400 truncate">
            {areaMayorDefecto}
          </div>
          <span className="text-[9px] font-mono text-slate-600 block">Proceso embudo</span>
        </div>

        {/* KPI 11 */}
        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-lg">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Máquina / Banda Crítica
          </span>
          <div className="text-sm font-bold font-sans text-pink-400 truncate" title={maquinaBandaCritica}>
            {maquinaBandaCritica}
          </div>
          <span className="text-[9px] font-mono text-slate-600 block">Falla repetitiva</span>
        </div>

        {/* KPI 12 */}
        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-lg">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Modelo Crítico
          </span>
          <div className="text-sm font-bold font-sans text-rose-400 truncate">
            {modeloCritico}
          </div>
          <span className="text-[9px] font-mono text-slate-600 block">Molde con más rechazo</span>
        </div>

      </div>

      {/* 6. PANEL DE INSIGHTS AUTOMÁTICOS */}
      <div className="bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-2xl space-y-3">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-pink-500" />
          <h3 className="text-xs font-bold font-mono text-slate-200 uppercase tracking-widest">
            💡 Diagnóstico de Gestión de Calidad (Insights Inteligentes Simulados)
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          
          <div className="p-3.5 bg-rose-950/15 border border-rose-900/30 rounded-lg space-y-1">
            <span className="text-[9px] font-mono text-rose-400 font-extrabold uppercase tracking-wider block">Defecto Recurrente</span>
            <p className="text-[11px] text-slate-350 leading-relaxed font-sans">
              La anomalía principal detectada en planta es <strong className="text-white">{defectoPrincipal}</strong>, concentrada en el área de <strong className="text-white">{areaMayorDefecto}</strong>.
            </p>
          </div>

          <div className="p-3.5 bg-pink-950/15 border border-pink-900/30 rounded-lg space-y-1">
            <span className="text-[9px] font-mono text-pink-400 font-extrabold uppercase tracking-wider block">Molde Bajo Lupa</span>
            <p className="text-[11px] text-slate-350 leading-relaxed font-sans">
              El modelo <strong className="text-white">{modeloCritico}</strong> registra la mayor desviación técnica de inyección EVA, provocando rebaba/porosidades.
            </p>
          </div>

          <div className="p-3.5 bg-amber-950/15 border border-amber-900/30 rounded-lg space-y-1">
            <span className="text-[9px] font-mono text-amber-500 font-extrabold uppercase tracking-wider block">Máquina Crítica</span>
            <p className="text-[11px] text-slate-350 leading-relaxed font-sans">
              La máquina <strong className="text-white">{maquinaBandaCritica}</strong> concentra el mayor defecto registrado en FDB/OCR.
            </p>
          </div>

          <div className="p-3.5 bg-indigo-950/15 border border-indigo-900/40 rounded-lg space-y-1">
            <span className="text-[9px] font-mono text-indigo-400 font-extrabold uppercase tracking-wider block">Banda & Detallado</span>
            <p className="text-[11px] text-slate-350 leading-relaxed font-sans">
              La estación <strong className="text-white">Banda Detalle-A</strong> presenta variabilidad en lijado, ocasionando retrabajo/segundas cosméticas.
            </p>
          </div>

          <div className="p-3.5 bg-cyan-950/15 border border-cyan-900/30 rounded-lg space-y-1">
            <span className="text-[9px] font-mono text-cyan-400 font-extrabold uppercase tracking-wider block">Auditoría / Turno</span>
            <p className="text-[11px] text-slate-350 leading-relaxed font-sans">
              La inspector <strong className="text-white">Ins. Patricia Ruiz</strong> en <strong className="text-white">Turno 3 (Nocturno)</strong> reporta mayor precisión en mermas críticas.
            </p>
          </div>

        </div>
      </div>

      {/* 3. CONSOLA DE COMPONENTES RECHARTS CON TAB SWITCHER (10 TOTAL GRAPHICS) */}
      <div className="bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-2xl space-y-5">
        <div className="flex justify-between items-center border-b border-slate-900 pb-3 flex-wrap gap-2">
          <div>
            <h3 className="text-xs font-black font-mono text-slate-200 uppercase tracking-widest">
              📈 Analítica de Mermas, Defectos e Indicadores de Primeras vs Segundas
            </h3>
            <p className="text-[10px] text-slate-550">Seleccione una consola técnica para ver los desgloses correspondientes.</p>
          </div>

          <div className="bg-slate-900 p-1 rounded-lg border border-slate-800 flex gap-1">
            <button
              onClick={() => setChartTab('pareto-areas')}
              className={`px-3 py-1 text-[10px] font-mono font-bold uppercase rounded transition-colors ${
                chartTab === 'pareto-areas' ? 'bg-pink-900 text-white font-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              Pareto & Áreas
            </button>
            <button
              onClick={() => setChartTab('device-specs')}
              className={`px-3 py-1 text-[10px] font-mono font-bold uppercase rounded transition-colors ${
                chartTab === 'device-specs' ? 'bg-pink-900 text-white font-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              Dispositivos & Tallas
            </button>
            <button
              onClick={() => setChartTab('trends-rates')}
              className={`px-3 py-1 text-[10px] font-mono font-bold uppercase rounded transition-colors ${
                chartTab === 'trends-rates' ? 'bg-pink-900 text-white font-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              Calidad & Tendencias
            </button>
          </div>
        </div>

        {/* Tab 1: Pareto & Áreas */}
        {chartTab === 'pareto-areas' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Pareto de Defectos */}
            <div className="p-4 bg-slate-900 border border-slate-850 rounded-xl shadow-md">
              <h4 className="text-xs font-extrabold font-mono text-slate-350 uppercase mb-1 flex items-center justify-between">
                <span>📊 Pareto de Defectos</span>
                <span className="text-[9px] bg-slate-950 text-pink-400 px-1 py-0.5 rounded leading-none">Voz General</span>
              </h4>
              <p className="text-[9px] text-slate-550 mb-3 leading-tight">Representación ordenada de incidencias y % acumulado.</p>
              <div className="h-44 overflow-x-auto">
                <div className="w-full min-w-[300px] h-full">
                <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <RechartsBarChart data={paretoChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                    <RechartsCartesianGrid strokeDasharray="3 3" stroke="#101a2b" />
                    <RechartsXAxis dataKey="name" stroke="#5b6c80" style={{ fontSize: '7px' }} />
                    <RechartsYAxis stroke="#5b6c80" style={{ fontSize: '7px' }} />
                    <RechartsTooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', fontSize: '9px' }} />
                    <RechartsBar dataKey="Fallas" fill="#ec4899" radius={[3, 3, 0, 0]} />
                  </RechartsBarChart>
                </RechartsResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Defectos por área */}
            <div className="p-4 bg-slate-900 border border-slate-850 rounded-xl shadow-md">
              <h4 className="text-xs font-extrabold font-mono text-slate-350 uppercase mb-1">📐 Defectos por Área</h4>
              <p className="text-[9px] text-slate-550 mb-3 leading-tight">Distribución de mermas e incidencias por zona operativa.</p>
              <div className="h-44 overflow-x-auto">
                <div className="w-full min-w-[300px] h-full">
                <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <RechartsBarChart data={areaChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                    <RechartsCartesianGrid strokeDasharray="3 3" stroke="#101a2b" />
                    <RechartsXAxis dataKey="name" stroke="#5b6c80" style={{ fontSize: '8px' }} />
                    <RechartsYAxis stroke="#5b6c80" style={{ fontSize: '7px' }} />
                    <RechartsTooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', fontSize: '9px' }} />
                    <RechartsBar dataKey="Defectivos" fill="#ef4444" radius={[3, 3, 0, 0]} />
                  </RechartsBarChart>
                </RechartsResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Defectos por modelo */}
            <div className="p-4 bg-slate-900 border border-slate-850 rounded-xl shadow-md">
              <h4 className="text-xs font-extrabold font-mono text-slate-350 uppercase mb-1">👟 Defectos por Modelo</h4>
              <p className="text-[9px] text-slate-550 mb-3 leading-tight">Volumen absoluto de calzado defectuoso por molde.</p>
              <div className="h-44 overflow-x-auto">
                <div className="w-full min-w-[300px] h-full">
                <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <RechartsBarChart data={modelChartData.slice(0, 6)} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                    <RechartsCartesianGrid strokeDasharray="3 3" stroke="#101a2b" />
                    <RechartsXAxis dataKey="name" stroke="#5b6c80" style={{ fontSize: '7px' }} />
                    <RechartsYAxis stroke="#5b6c80" style={{ fontSize: '7px' }} />
                    <RechartsTooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', fontSize: '9px' }} />
                    <RechartsBar dataKey="Defectivos" fill="#06b6d4" radius={[3, 3, 0, 0]} />
                  </RechartsBarChart>
                </RechartsResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Defectos por color */}
            <div className="p-4 bg-slate-900 border border-slate-850 rounded-xl shadow-md">
              <h4 className="text-xs font-extrabold font-mono text-slate-350 uppercase mb-1">🎨 Defectos por Color</h4>
              <p className="text-[9px] text-slate-550 mb-3 leading-tight">Anomalías presentadas por pigmentación pigmentación.</p>
              <div className="h-44 overflow-x-auto">
                <div className="w-full min-w-[300px] h-full">
                <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <RechartsBarChart data={colorChartData.slice(0, 6)} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                    <RechartsCartesianGrid strokeDasharray="3 3" stroke="#101a2b" />
                    <RechartsXAxis dataKey="name" stroke="#5b6c80" style={{ fontSize: '8px' }} />
                    <RechartsYAxis stroke="#5b6c80" style={{ fontSize: '7px' }} />
                    <RechartsTooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', fontSize: '9px' }} />
                    <RechartsBar dataKey="Defectivos" fill="#a855f7" radius={[3, 3, 0, 0]} />
                  </RechartsBarChart>
                </RechartsResponsiveContainer>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Tab 2: Dispositivos & Tallas */}
        {chartTab === 'device-specs' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Defectos por máquina */}
            <div className="p-4 bg-slate-900 border border-slate-850 rounded-xl shadow-md">
              <h4 className="text-xs font-extrabold font-mono text-slate-350 uppercase mb-1">⚙️ Defectos por Máquina Inyectora</h4>
              <p className="text-[9px] text-slate-550 mb-3 leading-tight">Registro de desviaciones mecánicas en platos enfriadores.</p>
              <div className="h-44 overflow-x-auto">
                <div className="w-full min-w-[300px] h-full">
                <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <RechartsBarChart data={machineChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                    <RechartsCartesianGrid strokeDasharray="3 3" stroke="#101a2b" />
                    <RechartsXAxis dataKey="name" stroke="#5b6c80" style={{ fontSize: '8px' }} />
                    <RechartsYAxis stroke="#5b6c80" style={{ fontSize: '7px' }} />
                    <RechartsTooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', fontSize: '9px' }} />
                    <RechartsBar dataKey="Defectivos" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                  </RechartsBarChart>
                </RechartsResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Defectos por banda */}
            <div className="p-4 bg-slate-900 border border-slate-850 rounded-xl shadow-md">
              <h4 className="text-xs font-extrabold font-mono text-slate-350 uppercase mb-1">〰️ Defectos por Banda de Detalle</h4>
              <p className="text-[9px] text-slate-550 mb-3 leading-tight">Mermas de rebabas y deslices de lijas por estación.</p>
              <div className="h-44 overflow-x-auto">
                <div className="w-full min-w-[300px] h-full">
                <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <RechartsBarChart data={bandChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                    <RechartsCartesianGrid strokeDasharray="3 3" stroke="#101a2b" />
                    <RechartsXAxis dataKey="name" stroke="#5b6c80" style={{ fontSize: '8px' }} />
                    <RechartsYAxis stroke="#5b6c80" style={{ fontSize: '7px' }} />
                    <RechartsTooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', fontSize: '9px' }} />
                    <RechartsBar dataKey="Defectivos" fill="#ec4899" radius={[3, 3, 0, 0]} />
                  </RechartsBarChart>
                </RechartsResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Defectos por talla */}
            <div className="p-4 bg-slate-900 border border-slate-850 rounded-xl shadow-md">
              <h4 className="text-xs font-extrabold font-mono text-slate-350 uppercase mb-1">📏 Defectos por Talla Comercial</h4>
              <p className="text-[9px] text-slate-550 mb-3 leading-tight">Comportamiento contractivo de EVA según el tamaño de horma.</p>
              <div className="h-44 overflow-x-auto">
                <div className="w-full min-w-[300px] h-full">
                <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <RechartsBarChart data={tallaChartData.slice(0, 10)} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                    <RechartsCartesianGrid strokeDasharray="3 3" stroke="#101a2b" />
                    <RechartsXAxis dataKey="name" stroke="#5b6c80" style={{ fontSize: '8px' }} />
                    <RechartsYAxis stroke="#5b6c80" style={{ fontSize: '7px' }} />
                    <RechartsTooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', fontSize: '9px' }} />
                    <RechartsBar dataKey="Defectivos" fill="#14b8a6" radius={[3, 3, 0, 0]} />
                  </RechartsBarChart>
                </RechartsResponsiveContainer>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Tab 3: Calidad & Tendencias */}
        {chartTab === 'trends-rates' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Primeras vs segundas */}
            <div className="p-4 bg-slate-900 border border-slate-850 rounded-xl shadow-md">
              <h4 className="text-xs font-extrabold font-mono text-slate-350 uppercase mb-1">⚖️ Primeras vs Segundas por Modelo</h4>
              <p className="text-[9px] text-slate-550 mb-3 leading-tight">Contraste directo de volumen comercial de Primer Grado vs Cosméticas.</p>
              <div className="h-44 overflow-x-auto">
                <div className="w-full min-w-[300px] h-full">
                <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <RechartsBarChart data={primeVsSecChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                    <RechartsCartesianGrid strokeDasharray="3 3" stroke="#101a2b" />
                    <RechartsXAxis dataKey="name" stroke="#5b6c80" style={{ fontSize: '7px' }} />
                    <RechartsYAxis stroke="#5b6c80" style={{ fontSize: '7px' }} />
                    <RechartsTooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', fontSize: '9px' }} />
                    <RechartsBar dataKey="Primeras" fill="#10b981" />
                    <RechartsBar dataKey="Segundas" fill="#f59e0b" />
                  </RechartsBarChart>
                </RechartsResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Tendencia de % defectivo por día */}
            <div className="p-4 bg-slate-900 border border-slate-850 rounded-xl shadow-md font-sans">
              <h4 className="text-xs font-extrabold font-mono text-slate-350 uppercase mb-1">📈 Tendencia de % Defectivo Diario</h4>
              <p className="text-[9px] text-slate-550 mb-3 leading-tight font-sans">Comportamiento diario de tasa de rechazo general.</p>
              <div className="h-44 overflow-x-auto">
                <div className="w-full min-w-[300px] h-full">
                <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <RechartsLineChart data={dailyTrendChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                    <RechartsCartesianGrid strokeDasharray="3 3" stroke="#101a2b" />
                    <RechartsXAxis dataKey="date" stroke="#5b6c80" style={{ fontSize: '8px' }} />
                    <RechartsYAxis stroke="#5b6c80" style={{ fontSize: '7px' }} />
                    <RechartsTooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', fontSize: '9px' }} />
                    <RechartsLine type="monotone" dataKey="% Defectivo" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 2.5 }} />
                  </RechartsLineChart>
                </RechartsResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Reprocesos y merma por semana (Timeline de mermas) */}
            <div className="p-4 bg-slate-900 border border-slate-850 rounded-xl shadow-md">
              <h4 className="text-xs font-extrabold font-mono text-slate-350 uppercase mb-1">🧪 Reprocesos y Mermas</h4>
              <p className="text-[9px] text-slate-550 mb-3 leading-tight">Análisis de scrap definitivo (Merma) vs calzado recuperable.</p>
              <div className="h-44 overflow-x-auto">
                <div className="w-full min-w-[300px] h-full">
                <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <RechartsBarChart data={weeklyRepMermChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                    <RechartsCartesianGrid strokeDasharray="3 3" stroke="#101a2b" />
                    <RechartsXAxis dataKey="date" stroke="#5b6c80" style={{ fontSize: '8px' }} />
                    <RechartsYAxis stroke="#5b6c80" style={{ fontSize: '7px' }} />
                    <RechartsTooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', fontSize: '9px' }} />
                    <RechartsBar dataKey="Reproceso" fill="#6366f1" stackId="stack" />
                    <RechartsBar dataKey="Merma" fill="#f43f5e" stackId="stack" />
                  </RechartsBarChart>
                </RechartsResponsiveContainer>
                </div>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* 4. TABLA PRINCIPAL DE INSPECCIONES (19 COLUMNS SPEC) */}
      <div className="bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-2xl space-y-4">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <div>
            <h3 className="text-xs font-black font-mono text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-pink-500"></span>
              📋 REGISTRO GENERAL DE AUDITORÍAS DE CALIDAD EVA (19 COLUMNAS)
            </h3>
            <p className="font-sans text-[11px] text-slate-550">
              Mapeo de vulcanizados inspeccionados por turno, lote de inyección y estaciones de lijado de banda.
            </p>
          </div>

          <span className="text-[10px] font-mono bg-slate-900 text-slate-400 border border-slate-800 px-2.5 py-1 rounded">
            {filteredRecords.length} Registros Encontrados
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-900">
          <table className="w-full text-left font-sans text-xs">
            <thead className="bg-slate-900 font-mono text-slate-450 uppercase text-[9px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-3 font-bold text-slate-300">Fecha</th>
                <th className="py-3 px-3 text-center font-bold">Turno</th>
                <th className="py-3 px-3 font-bold">Área</th>
                <th className="py-3 px-3 font-bold">Máquina / Banda</th>
                <th className="py-3 px-3 font-bold">Inspector</th>
                <th className="py-3 px-3 font-bold">Líder Turno</th>
                <th className="py-3 px-3 font-bold">Lote</th>
                <th className="py-3 px-3 font-bold">Modelo</th>
                <th className="py-3 px-3 font-bold">Color</th>
                <th className="py-3 px-3 text-right font-bold">Talla</th>
                <th className="py-3 px-3 text-right font-bold text-slate-200">Inspeccionado</th>
                <th className="py-3 px-3 text-right font-bold text-green-400">1as</th>
                <th className="py-3 px-3 text-right font-bold text-amber-500">2as</th>
                <th className="py-3 px-3 text-right font-bold text-indigo-400">Reproceso</th>
                <th className="py-3 px-3 text-right font-bold text-red-400">Merma</th>
                <th className="py-3 px-3 font-bold">Defecto</th>
                <th className="py-3 px-3 text-right font-bold">Cant. Defecto</th>
                <th className="py-3 px-3 text-right font-bold text-pink-400">% Defectivo</th>
                <th className="py-3 px-3 text-center font-bold">Estatus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/40 bg-slate-950 font-mono">
              {filteredRecords.map((rec, i) => {
                
                // Color status badge rules
                // Verde: % defectivo <= 2%
                // Amarillo: % defectivo > 2% y <= 5%
                // Rojo: % defectivo > 5%
                const pct = rec.porcentajeDefectivo;
                let statusColor = 'text-green-400 bg-green-950/20 border-green-900/40';
                let statusLabel = 'VERDE';
                
                if (pct > 5) {
                  statusColor = 'text-red-400 bg-red-950/20 border-red-900/40 font-bold';
                  statusLabel = 'ROJO';
                } else if (pct > 2) {
                  statusColor = 'text-amber-500 bg-amber-950/20 border-amber-900/40';
                  statusLabel = 'AMARILLO';
                }

                return (
                  <tr key={i} className="hover:bg-slate-900/50 transition-colors text-[11px]">
                    <td className="py-2.5 px-3 text-slate-300 font-bold whitespace-nowrap">{rec.fecha}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-1.5 py-0.5 bg-slate-900 rounded-[3px] text-slate-400 font-extrabold">T-{rec.turno}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="text-[10px] font-sans font-bold text-slate-400">{rec.area}</span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap">{rec.maquinaOBanda}</td>
                    <td className="py-2.5 px-3 text-slate-400 font-sans whitespace-nowrap">{rec.inspector}</td>
                    <td className="py-2.5 px-3 text-slate-500 font-sans whitespace-nowrap">{rec.lider}</td>
                    <td className="py-2.5 px-3 text-cyan-400 font-bold">{rec.lote}</td>
                    <td className="py-2.5 px-3 text-white font-sans font-medium uppercase whitespace-nowrap">{rec.modelo}</td>
                    <td className="py-2.5 px-3 text-slate-400 font-sans whitespace-nowrap">{rec.color}</td>
                    <td className="py-2.5 px-3 text-right text-slate-350">T{rec.talla}</td>
                    <td className="py-2.5 px-3 text-right text-white font-semibold">{rec.totalInspeccionado.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right text-green-400 font-semibold">{rec.primeras.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right text-amber-500">{rec.segundas.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right text-indigo-450 text-indigo-400">{rec.reproceso.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right text-red-500 font-bold">{rec.merma.toLocaleString()}</td>
                    <td className="py-2.5 px-3">
                      <span className="text-[10px] text-slate-350 bg-slate-900 px-1 py-0.5 rounded border border-slate-800 leading-normal max-w-[130px] block truncate" title={rec.defecto}>
                        {rec.defecto}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-405 text-slate-300">{rec.cantidadDefecto.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right text-pink-400 font-bold">{pct}%</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-black border tracking-wide uppercase ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* FORM MODAL FOR MANUALLY REGISTERING PHYSICAL FAILURES */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-slate-950 border border-slate-850 rounded-xl p-6 w-full max-w-lg space-y-4">
            
            <div className="flex justify-between items-center border-b border-slate-900 pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-pink-500 animate-pulse" />
                <h3 className="text-xs font-black tracking-widest font-mono text-pink-400 uppercase">
                  Registrar Falla Física en Aduana Calidad
                </h3>
              </div>
              <button onClick={() => setIsFormOpen(false)} className="text-slate-500 hover:text-white cursor-pointer text-sm">✕</button>
            </div>

            <form onSubmit={handleRegisterQualityLog} className="space-y-3 px-1 text-xs">
              
              <div className="grid grid-cols-2 gap-3 pb-1">
                <div className="space-y-1">
                  <label className="text-slate-400 block font-mono text-[10px] uppercase">Fecha Inspección:</label>
                  <input 
                    type="date" 
                    value={newFecha}
                    onChange={(e) => setNewFecha(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-slate-300 focus:outline-none"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 block font-mono text-[10px] uppercase">Turno Operativo:</label>
                  <select 
                    value={newTurno}
                    onChange={(e: any) => setNewTurno(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-slate-300 focus:outline-none"
                  >
                    <option value="1">Turno 1 - Matutino</option>
                    <option value="2">Turno 2 - Vespertino</option>
                    <option value="3">Turno 3 - Nocturno</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 block font-mono text-[10px] uppercase">Área Operativa:</label>
                  <select 
                    value={newArea}
                    onChange={(e: any) => {
                      setNewArea(e.target.value);
                      setNewMaquinaOBanda('');
                    }}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-slate-300 focus:outline-none"
                  >
                    <option value="INYECCION">INYECCIÓN</option>
                    <option value="BANDA">BANDA / DETALLADO</option>
                    <option value="ESTABILIZACION">ESTABILIZACIÓN</option>
                  </select>
                </div>
                
                <div className="space-y-1">
                  <label className="text-slate-400 block font-mono text-[10px] uppercase">Máquina / Banda / Estabilizadora:</label>
                  <input 
                    type="text" 
                    value={newMaquinaOBanda}
                    onChange={(e) => setNewMaquinaOBanda(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-slate-200"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 block font-mono text-[10px] uppercase">Lote Identificador:</label>
                  <input 
                    type="text" 
                    value={newLote}
                    onChange={(e) => setNewLote(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-pink-400 font-mono font-bold"
                    required
                  />
                </div>
                
                <div className="space-y-1">
                  <label className="text-slate-400 block font-mono text-[10px] uppercase">Modelo:</label>
                  <select 
                    value={newModelo}
                    onChange={(e) => setNewModelo(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-slate-300 focus:outline-none"
                  >
                    <option value="">Pendiente OCR</option>
                    {uniqueModelsList.map((m, idx) => (
                      <option key={idx} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1 font-sans">
                  <label className="text-slate-400 block font-mono text-[10px] uppercase">Color:</label>
                  <select 
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-slate-300 font-sans focus:outline-none"
                  >
                    <option value="Negro">Negro</option>
                    <option value="Blanco">Blanco</option>
                    <option value="Arena">Arena</option>
                    <option value="Azul Marino">Azul Marino</option>
                    <option value="Rojo">Rojo</option>
                    <option value="Gris">Gris</option>
                  </select>
                </div>
                
                <div className="space-y-1">
                  <label className="text-slate-400 block font-mono text-[10px] uppercase">Talla Horma:</label>
                  <input 
                    type="number" 
                    value={newTalla}
                    onChange={(e) => setNewTalla(parseInt(e.target.value) || 25)}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-slate-200"
                    min="15"
                    max="30"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 block font-mono text-[10px] uppercase">Muestra Total:</label>
                  <input 
                    type="number" 
                    value={newTotal}
                    onChange={(e) => setNewTotal(parseInt(e.target.value) || 400)}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-slate-200 font-mono font-bold"
                    min="1"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2.5 bg-slate-900 p-2.5 rounded border border-slate-850">
                <div className="space-y-1">
                  <label className="text-slate-500 block font-mono text-[9px] uppercase font-bold text-center">Segundas:</label>
                  <input 
                    type="number" 
                    value={newSegundas}
                    onChange={(e) => setNewSegundas(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-1 text-center font-mono text-amber-500"
                    min="0"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500 block font-mono text-[9px] uppercase font-bold text-center">Reproceso:</label>
                  <input 
                    type="number" 
                    value={newReproceso}
                    onChange={(e) => setNewReproceso(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-1 text-center font-mono text-indigo-400"
                    min="0"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500 block font-mono text-[9px] uppercase font-bold text-center">Merma (Scrap):</label>
                  <input 
                    type="number" 
                    value={newMerma}
                    onChange={(e) => setNewMerma(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-1 text-center font-mono text-red-500 font-bold"
                    min="0"
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-slate-550 block font-mono text-[9px] uppercase font-extrabold text-center">Defectos:</div>
                  <div className="text-center font-mono font-black text-rose-450 p-1 text-xs text-pink-500">
                    {newSegundas + newReproceso + newMerma}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 block font-mono text-[10px] uppercase">Inspector Auditante:</label>
                  <input 
                    type="text" 
                    value={newInspector}
                    onChange={(e) => setNewInspector(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-slate-350"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 block font-mono text-[10px] uppercase">Líder Responsable:</label>
                  <input 
                    type="text" 
                    value={newLider}
                    onChange={(e) => setNewLider(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-slate-350"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 block font-mono text-[10px] uppercase">Defectología Principal:</label>
                <select 
                  value={newDefecto} 
                  onChange={(e) => setNewDefecto(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-slate-300 focus:outline-none"
                >
                  <option value="Burbuja Interna">Burbuja Interna (Venteo)</option>
                  <option value="Rechupe Talón">Rechupe Talón (Vacío)</option>
                  <option value="Deformación Moldura">Deformación de Moldura</option>
                  <option value="Mancha de Pigmento">Mancha de Pigmento (Incompatibilidad)</option>
                  <option value="Porosidad Compuesto">Porosidad Compuesto EVA</option>
                  <option value="Falta de Llenado">Falta de Llenado (Presión)</option>
                  <option value="Rebaba Excesiva">Rebaba Excesiva (Cierre plato)</option>
                </select>
              </div>

              <div className="pt-3.5 flex justify-end gap-2.5 border-t border-slate-900">
                <button 
                  type="button" 
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 hover:bg-slate-900 text-slate-450 hover:text-white transition cursor-pointer font-bold duration-150"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2 bg-pink-900 hover:bg-pink-850 text-white font-mono font-black rounded border border-pink-750 transition cursor-pointer"
                >
                  Insertar Auditoría Calidad
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};

/* 7. Inyección View */
export interface InjectionProductionRecord {
  fecha: string;
  turno: '1' | '2' | '3';
  maquina: string;
  molde: string;
  inspector: string;
  lider: string;
  lote: string;
  modelo: string;
  color: string;
  talla: number;
  totalInspeccionado: number;
  primeras: number;
  segundas: number;
  reproceso: number;
  merma: number;
  defecto: string;
  cantidad: number;
  observaciones: string;
}

export const InyeccionView: React.FC = () => {
  const { currentTenant, addAuditLog, users, can, getGoalForAreaTurn } = useDashboard();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [chartTab, setChartTab] = useState<'prod' | 'def' | 'eff'>('prod');

  const [injectionRecords, setInjectionRecords] = useState<InjectionProductionRecord[]>([]);

  useEffect(() => {
    setInjectionRecords([]);
  }, [currentTenant.id]);

  // Form registration states
  const [newFecha, setNewFecha] = useState('');
  const [newTurno, setNewTurno] = useState<'1' | '2' | '3'>('1');
  const [newMaquina, setNewMaquina] = useState('');
  const [newMolde, setNewMolde] = useState('');
  const [newInspector, setNewInspector] = useState('');
  const [newLider, setNewLider] = useState('');
  const [newLote, setNewLote] = useState('');
  const [newModelo, setNewModelo] = useState('');
  const [newColor, setNewColor] = useState('');
  const [newTalla, setNewTalla] = useState(0);
  const [newTotal, setNewTotal] = useState(0);
  const [newSegundas, setNewSegundas] = useState(0);
  const [newReproceso, setNewReproceso] = useState(0);
  const [newMerma, setNewMerma] = useState(0);
  const [newDefecto, setNewDefecto] = useState('');
  const [newObservaciones, setNewObservaciones] = useState('');
  const activeResponsables = users.filter(user => user.active).map(user => user.username);
  const responsibleOptions = activeResponsables;
  const leaderOptions = activeResponsables;

  // Distinct filter states
  const [filtroFecha, setFiltroFecha] = useState('');
  const [filtroTurno, setFiltroTurno] = useState('');
  const [filtroMaquina, setFiltroMaquina] = useState('');
  const [filtroMolde, setFiltroMolde] = useState('');
  const [filtroInspector, setFiltroInspector] = useState('');
  const [filtroLider, setFiltroLider] = useState('');
  const [filtroModelo, setFiltroModelo] = useState('');
  const [filtroColor, setFiltroColor] = useState('');
  const [filtroTalla, setFiltroTalla] = useState('');
  const [filtroLote, setFiltroLote] = useState('');
  const [filtroDefecto, setFiltroDefecto] = useState('');

  // Extract master lists dynamically
  const uniqueInspectors = Array.from(new Set(injectionRecords.map(r => r.inspector))).filter(Boolean);
  const uniqueLiders = Array.from(new Set(injectionRecords.map(r => r.lider))).filter(Boolean);
  const uniqueModelsList = Array.from(new Set(injectionRecords.map(r => r.modelo))).filter(Boolean);
  const uniqueColorsList = Array.from(new Set(injectionRecords.map(r => r.color))).filter(Boolean);
  const uniqueDefectsList = Array.from(new Set(injectionRecords.map(r => r.defecto))).filter(f => f && f !== 'Ninguno');
  const uniqueMoldesList = Array.from(new Set(injectionRecords.map(r => r.molde))).filter(Boolean);
  const uniqueMachinesList = Array.from(new Set(injectionRecords.map(r => r.maquina))).filter(Boolean);
  const uniqueSizesList = Array.from(new Set(injectionRecords.map(r => r.talla))).sort((a,b) => Number(a) - Number(b));

  // Filter application
  const filteredRecords = injectionRecords.filter(log => {
    if (filtroFecha && log.fecha !== filtroFecha) return false;
    if (filtroTurno && log.turno !== filtroTurno) return false;
    if (filtroMaquina && log.maquina !== filtroMaquina) return false;
    if (filtroMolde && log.molde !== filtroMolde) return false;
    if (filtroInspector && log.inspector !== filtroInspector) return false;
    if (filtroLider && log.lider !== filtroLider) return false;
    if (filtroModelo && log.modelo !== filtroModelo) return false;
    if (filtroColor && log.color !== filtroColor) return false;
    if (filtroTalla && String(log.talla) !== filtroTalla) return false;
    if (filtroLote && !log.lote.toLowerCase().includes(filtroLote.toLowerCase())) return false;
    if (filtroDefecto && log.defecto !== filtroDefecto) return false;
    return true;
  });

  const handleClearFilters = () => {
    setFiltroFecha('');
    setFiltroTurno('');
    setFiltroMaquina('');
    setFiltroMolde('');
    setFiltroInspector('');
    setFiltroLider('');
    setFiltroModelo('');
    setFiltroColor('');
    setFiltroTalla('');
    setFiltroLote('');
    setFiltroDefecto('');
  };

  // NEW INJECTION REPORT REGISTRATION (SIMULATED IN LOCALSTATE)
  const handleRegisterInjectionLog = (e: React.FormEvent) => {
    e.preventDefault();

    const actualDefectQty = newSegundas + newReproceso + newMerma;
    const computedPrimeras = Math.max(0, newTotal - actualDefectQty);

    const newLog: InjectionProductionRecord = {
      fecha: newFecha,
      turno: newTurno,
      maquina: newMaquina,
      molde: newMolde,
      inspector: newInspector,
      lider: newLider,
      lote: newLote,
      modelo: newModelo,
      color: newColor,
      talla: Number(newTalla),
      totalInspeccionado: newTotal,
      primeras: computedPrimeras,
      segundas: newSegundas,
      reproceso: newReproceso,
      merma: newMerma,
      defecto: actualDefectQty > 0 ? newDefecto : 'Ninguno',
      cantidad: actualDefectQty,
      observaciones: newObservaciones
    };

    const nextLogs = [newLog, ...injectionRecords];
    setInjectionRecords(nextLogs);

    addAuditLog('PRODUCTION', 'REGISTER_INJECTION_LOG', `Registro manual inyectora para Máquina: ${newMaquina}, Lote: ${newLote}, Producción: ${newTotal}`);
    setIsFormOpen(false);
  };

  // KPI Calculations
  const baseGoal = 15000;
  const hoyDate = '2026-05-25';
  const selectedTurnCode = filtroTurno === '2' ? 'TARDE' : filtroTurno === '3' ? 'NOCHE' : 'MAÑANA';
  
  // 1. Pares inyectados hoy matching standard 2026-05-25 or latest date
  const recordsHoy = filteredRecords.filter(r => r.fecha === (filtroFecha || hoyDate));
  const paresInyectadosHoy = recordsHoy.reduce((sum, r) => sum + r.totalInspeccionado, 0);

  // 2. Meta diaria
  const metaDiariaInyeccion = getGoalForAreaTurn('inyeccion', selectedTurnCode)?.metaTurno || baseGoal;

  // 3. Cumplimiento meta
  const cumplimientoMeta = metaDiariaInyeccion > 0 ? Number(((paresInyectadosHoy / metaDiariaInyeccion) * 100).toFixed(1)) : 0;

  // 4. Producción general total in scope
  const totalInspeccionadoScope = filteredRecords.reduce((sum, r) => sum + r.totalInspeccionado, 0);

  // 5. Total defects in scope
  const totalDefectosScope = filteredRecords.reduce((sum, r) => sum + r.cantidad, 0);

  // 6. Proporción mermas, reprocesos, segundas
  const totalSegundasScope = filteredRecords.reduce((sum, r) => sum + r.segundas, 0);
  const totalReprocesosScope = filteredRecords.reduce((sum, r) => sum + r.reproceso, 0);
  const totalMermaScope = filteredRecords.reduce((sum, r) => sum + r.merma, 0);

  const pctDefectivoScope = totalInspeccionadoScope > 0 ? Number(((totalDefectosScope / totalInspeccionadoScope) * 100).toFixed(2)) : 0;

  // 7. Producción por hora (pares/hr)
  const promedioParesPorHora = paresInyectadosHoy > 0 ? Math.round(paresInyectadosHoy / 8) : 0; // Promedio de 1 turno activo hoy

  // 8. Máquina con mayor producción
  const machineProdMap: Record<string, number> = {};
  filteredRecords.forEach(r => {
    machineProdMap[r.maquina] = (machineProdMap[r.maquina] || 0) + r.totalInspeccionado;
  });
  const maxProdEntry = Object.entries(machineProdMap).sort((a,b)=>b[1]-a[1])[0];
  const maquinaMayorProduccion = maxProdEntry ? `${maxProdEntry[0]} (${maxProdEntry[1].toLocaleString()})` : 'Ninguna';

  // 9. Máquina con mayor defecto
  const machineDefectMap: Record<string, number> = {};
  filteredRecords.forEach(r => {
    machineDefectMap[r.maquina] = (machineDefectMap[r.maquina] || 0) + r.cantidad;
  });
  const maxDefectEntry = Object.entries(machineDefectMap).sort((a,b)=>b[1]-a[1])[0];
  const maquinaMayorDefecto = maxDefectEntry ? `${maxDefectEntry[0]}` : 'Ninguna';

  // 10. Tiempo promedio por lote (Simulado basado en volumen y fallas - más defectos agregan tiempo de purga/ajuste)
  const tiempoPromedioLote = totalInspeccionadoScope > 0 
    ? Math.round(180 + (totalDefectosScope / Math.max(1, filteredRecords.length)) * 1.5)
    : 180;

  const machineNames = Array.from(new Set(filteredRecords.map(r => r.maquina))).filter(Boolean) as string[];
  const machineCards = machineNames.map(mName => {

    // Read metrics from filtered list
    const macRecords = filteredRecords.filter(r => r.maquina === mName);
    const totalProd = macRecords.reduce((sum, r) => sum + r.totalInspeccionado, 0);
    const totalDef = macRecords.reduce((sum, r) => sum + r.cantidad, 0);
    const latestRec = macRecords[0];

    const actualState = totalProd > 0 ? 'activa' : 'sin datos';
    const computedDefectPct = totalProd > 0 ? Number(((totalDef / totalProd) * 100).toFixed(1)) : 0;
    const computedEff = actualState === 'activa' 
      ? Math.max(68, Math.round(98 - (computedDefectPct * 1.6)))
      : 0;

    return {
      name: mName,
      estado: actualState,
      modelo: latestRec?.modelo || '',
      color: latestRec?.color || '',
      lote: latestRec?.lote || '',
      produccion: totalProd,
      defectos: totalDef,
      pctDefectivo: computedDefectPct,
      eficiencia: computedEff,
      ultimoRegistro: latestRec ? latestRec.fecha.split('-').slice(1).join('/') : '--'
    };
  });

  const hActiveCount = machineCards.filter(m => m.estado === 'activa').length;

  // GRAPHICS DATA PROCESSINGS (HEAT / AMBER ORANGE INYECTION PALETTE)

  // 1. Producción por hora en inyección (represented symmetrically as 10 proportional points)
  const baseHourlyFactor = totalInspeccionadoScope / 16400;
  const prodHourlyData = [
    { hour: '06:00', 'Pares': Math.round(520 * baseHourlyFactor) },
    { hour: '08:00', 'Pares': Math.round(780 * baseHourlyFactor) },
    { hour: '10:00', 'Pares': Math.round(890 * baseHourlyFactor) },
    { hour: '12:00', 'Pares': Math.round(810 * baseHourlyFactor) },
    { hour: '14:00', 'Pares': Math.round(750 * baseHourlyFactor) },
    { hour: '16:00', 'Pares': Math.round(790 * baseHourlyFactor) },
    { hour: '18:00', 'Pares': Math.round(910 * baseHourlyFactor) },
    { hour: '20:00', 'Pares': Math.round(850 * baseHourlyFactor) },
    { hour: '22:00', 'Pares': Math.round(620 * baseHourlyFactor) },
    { hour: '00:00', 'Pares': Math.round(480 * baseHourlyFactor) }
  ];

  // 2. Producción por máquina
  const machineProdChartData = machineCards.map(m => ({
    name: m.name.replace('Máquina ', 'M'),
    'Pares': m.produccion
  }));

  // 3. Defectos por máquina
  const machineDefChartData = machineCards.map(m => ({
    name: m.name.replace('Máquina ', 'M'),
    'Defectos': m.defectos
  }));

  // 4. Pareto de defectos de inyección
  const defectCountMap: Record<string, number> = {};
  filteredRecords.forEach(r => {
    if (r.defecto && r.defecto !== 'Ninguno') {
      defectCountMap[r.defecto] = (defectCountMap[r.defecto] || 0) + r.cantidad;
    }
  });
  const sortedDefects = Object.entries(defectCountMap).sort((a,b)=>b[1]-a[1]);
  const paretoSum = sortedDefects.reduce((s, curr)=>s + curr[1], 0) || 1;
  let cumulativePareto = 0;
  const paretoDefectChartData = sortedDefects.map(([name, count]) => {
    cumulativePareto += count;
    return {
      name: name.substring(0, 15) + '...',
      'Pares': count,
      'Pareto %': Math.min(100, Math.round((cumulativePareto / paretoSum) * 100))
    };
  });

  // 5. Primeras vs segundas (Top Models Comparison)
  const primeVsSecMap: Record<string, { primeras: number; segundas: number }> = {};
  filteredRecords.forEach(r => {
    if (!primeVsSecMap[r.modelo]) {
      primeVsSecMap[r.modelo] = { primeras: 0, segundas: 0 };
    }
    primeVsSecMap[r.modelo].primeras += r.primeras;
    primeVsSecMap[r.modelo].segundas += r.segundas;
  });
  const modelComparisonsChartData = Object.entries(primeVsSecMap).map(([name, stats]) => ({
    name,
    'Primeras': stats.primeras,
    'Segundas': stats.segundas
  })).slice(0, 6);

  // 6. Eficiencia por turno
  const shiftProdMap: Record<string, { firsts: number; total: number }> = {
    '1': { firsts: 0, total: 0 },
    '2': { firsts: 0, total: 0 },
    '3': { firsts: 0, total: 0 }
  };
  filteredRecords.forEach(r => {
    if (shiftProdMap[r.turno]) {
      shiftProdMap[r.turno].firsts += r.primeras;
      shiftProdMap[r.turno].total += r.totalInspeccionado;
    }
  });
  const shiftEffChartData = Object.entries(shiftProdMap).map(([shift, stats]) => ({
    name: `Turno ${shift}`,
    'Eficiencia': stats.total > 0 ? Number(((stats.firsts / stats.total) * 100).toFixed(1)) : 88.5
  }));

  // 7. Defectos por talla
  const sizeDefectMap: Record<number, number> = {};
  filteredRecords.forEach(r => {
    sizeDefectMap[r.talla] = (sizeDefectMap[r.talla] || 0) + r.cantidad;
  });
  const tallaDefChartData = Object.entries(sizeDefectMap).map(([sz, val]) => ({
    name: `T${sz}`,
    'Hundimientos': val
  })).sort((a,b)=> {
    const na = parseInt(a.name.replace('T',''));
    const nb = parseInt(b.name.replace('T',''));
    return na-nb;
  });

  return (
    <div className="space-y-6">

      {/* HEADER CONTROL */}
      <div id="inj_header_control" className="flex justify-between items-center bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-xl flex-wrap gap-4">
        <div>
          <span className="text-[10px] font-mono text-amber-500 uppercase tracking-widest font-bold block mb-1">
            CONTROL INDUSTRIAL EVA INYECCIÓN
          </span>
          <h2 className="text-xl font-black font-sans text-slate-100 uppercase tracking-tight leading-none mb-1 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
            Aduana de Inyección y Eficiencia de Prensas
          </h2>
          <p className="text-xs text-slate-400 font-sans">
            Optimización termodinámica, volumen de mermas, moldes EVA y control físico de prensado. Tenant actual: <strong className="text-slate-300">{currentTenant.name}</strong>.
          </p>
        </div>

        <div className="flex gap-2">
          {can('inyeccion.create_log') && (
            <button 
              id="register_inj_report_btn"
              onClick={() => setIsFormOpen(true)}
              className="flex items-center gap-1.5 px-4.5 py-2 bg-amber-600 hover:bg-amber-550 text-slate-950 text-xs font-mono font-black rounded-lg transition border border-amber-500 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4 text-slate-950" />
              + Nuevo reporte de inyección
            </button>
          )}
        </div>
      </div>

      {/* 1. FILTROS CONSOLIDADORES (11 PARAMS) */}
      <div id="inj_filters_panel" className="bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-900 pb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-mono text-slate-300 uppercase tracking-wider font-bold">Consola Integradora de Monitoreo Técnico</span>
          </div>
          <button 
            onClick={handleClearFilters}
            className="text-[10px] bg-slate-900 hover:bg-slate-850 px-2 py-1 text-slate-400 hover:text-white border border-slate-800 rounded font-mono transition flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3 text-amber-500" />
            Limpiar Filtros
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
          
          {/* 1. Fecha */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Fecha</label>
            <input 
              type="date"
              value={filtroFecha}
              onChange={(e) => setFiltroFecha(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            />
          </div>

          {/* 2. Turno */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Turno</label>
            <select
              value={filtroTurno}
              onChange={(e) => setFiltroTurno(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todos --</option>
              <option value="1">Turno 1 - Matutino</option>
              <option value="2">Turno 2 - Vespertino</option>
              <option value="3">Turno 3 - Nocturno</option>
            </select>
          </div>

          {/* 3. Máquina */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Máquina prensa</label>
            <select
              value={filtroMaquina}
              onChange={(e) => setFiltroMaquina(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todas (1-10) --</option>
              {Array.from({ length: 10 }, (_, i) => `Máquina ${i + 1}`).map((m, idx) => (
                <option key={idx} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* 4. Molde */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Molde EVA</label>
            <select
              value={filtroMolde}
              onChange={(e) => setFiltroMolde(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todos --</option>
              {uniqueMoldesList.map((m, idx) => (
                <option key={idx} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* 5. Inspector */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Inspector Calidad</label>
            <select
              value={filtroInspector}
              onChange={(e) => setFiltroInspector(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todos --</option>
              {uniqueInspectors.map((ins, idx) => (
                <option key={idx} value={ins}>{ins}</option>
              ))}
            </select>
          </div>

          {/* 6. Líder */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Líder Turno</label>
            <select
              value={filtroLider}
              onChange={(e) => setFiltroLider(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todos --</option>
              {uniqueLiders.map((lid, idx) => (
                <option key={idx} value={lid}>{lid}</option>
              ))}
            </select>
          </div>

          {/* 7. Modelo */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Modelo Suela</label>
            <select
              value={filtroModelo}
              onChange={(e) => setFiltroModelo(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todos --</option>
              {uniqueModelsList.map((m, idx) => (
                <option key={idx} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* 8. Color */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Color pigmento</label>
            <select
              value={filtroColor}
              onChange={(e) => setFiltroColor(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todos --</option>
              {uniqueColorsList.map((c, idx) => (
                <option key={idx} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* 9. Talla */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Talla Calzado</label>
            <select
              value={filtroTalla}
              onChange={(e) => setFiltroTalla(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todas --</option>
              {uniqueSizesList.map((sz, idx) => (
                <option key={idx} value={String(sz)}>{sz}</option>
              ))}
            </select>
          </div>

          {/* 10. Lote */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Filtro Lote</label>
            <div className="relative">
              <input 
                type="text"
                placeholder="Ej. LOT-INJ..."
                value={filtroLote}
                onChange={(e) => setFiltroLote(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 pl-7 text-xs text-slate-200 focus:outline-none"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-2.5" />
            </div>
          </div>

          {/* 11. Defecto */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-500 block">Falla reportada</label>
            <select
              value={filtroDefecto}
              onChange={(e) => setFiltroDefecto(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none"
            >
              <option value="">-- Todos --</option>
              {uniqueDefectsList.map((def, idx) => (
                <option key={idx} value={def}>{def}</option>
              ))}
            </select>
          </div>

        </div>
      </div>

      {/* 2. KPIs SUPERIORES (12 REQUERIDOS DIRECTOS) */}
      <div id="inj_kpis_panel" className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
        
        {/* KPI 1: Pares inyectados hoy */}
        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Pares Inyectados Hoy
          </span>
          <div className="text-xl font-bold font-mono text-amber-500">
            {paresInyectadosHoy.toLocaleString()}
          </div>
          <span className="text-[9px] font-mono text-slate-600 block">Talla mixta EVA</span>
        </div>

        {/* KPI 2: Meta diaria */}
        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Meta Diaria
          </span>
          <div className="text-xl font-bold font-mono text-slate-300">
            {metaDiariaInyeccion.toLocaleString()}
          </div>
          <span className="text-[9px] font-mono text-slate-600 block">Capacidad nominal</span>
        </div>

        {/* KPI 3: Cumplimiento de meta */}
        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Cumplimiento Meta
          </span>
          <div className={`text-xl font-bold font-mono ${cumplimientoMeta >= 90 ? 'text-green-400' : cumplimientoMeta >= 60 ? 'text-amber-500' : 'text-red-400'}`}>
            {cumplimientoMeta}%
          </div>
          <span className="text-[9px] font-mono text-slate-600 block">Progreso diario activo</span>
        </div>

        {/* KPI 4: Producción por hora */}
        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none font-bold">
            Producción por Hora
          </span>
          <div className="text-xl font-bold font-mono text-amber-400">
            {promedioParesPorHora.toLocaleString()} <span className="text-xs text-slate-400 font-sans">p/h</span>
          </div>
          <span className="text-[9px] font-mono text-slate-600 block">Promedio turno actual</span>
        </div>

        {/* KPI 5: Máquinas activas */}
        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Máquinas Activas
          </span>
          <div className="text-xl font-bold font-mono text-cyan-400">
            {hActiveCount} / 10
          </div>
          <span className="text-[9px] font-mono text-slate-600 block">Prensas en compresión</span>
        </div>

        {/* KPI 6: Máquina con mayor producción */}
        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Máx. Productiva
          </span>
          <div className="text-sm font-bold font-mono text-slate-350 truncate" title={maquinaMayorProduccion}>
            {maquinaMayorProduccion}
          </div>
          <span className="text-[9px] font-mono text-slate-600 block">Rendimiento prensa</span>
        </div>

        {/* KPI 7: Máquina con mayor defecto */}
        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Mayor Defecto Prensa
          </span>
          <div className="text-sm font-bold font-mono text-red-540 text-red-400 truncate">
            {maquinaMayorDefecto}
          </div>
          <span className="text-[9px] font-mono text-slate-600 block">Fuga/Desgaste moldes</span>
        </div>

        {/* KPI 8: % defectivo inyección */}
        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            % Defectivo Inyección
          </span>
          <div className={`text-xl font-bold font-mono ${pctDefectivoScope > 5 ? 'text-red-400' : pctDefectivoScope > 2 ? 'text-amber-500' : 'text-green-400'}`}>
            {pctDefectivoScope}%
          </div>
          <span className="text-[9px] font-mono text-slate-600 block">Tasa acumulada scope</span>
        </div>

        {/* KPI 9: Segundas en inyección */}
        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Segundas EVA
          </span>
          <div className="text-xl font-bold font-mono text-indigo-400">
            {totalSegundasScope.toLocaleString()}
          </div>
          <span className="text-[9px] font-mono text-slate-600 block">Detalles superficiales</span>
        </div>

        {/* KPI 10: Reprocesos */}
        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none font-bold">
            Reprocesos
          </span>
          <div className="text-xl font-bold font-mono text-amber-300">
            {totalReprocesosScope.toLocaleString()}
          </div>
          <span className="text-[9px] font-mono text-slate-600 block">Vulnerabilidad de rebabas</span>
        </div>

        {/* KPI 11: Merma */}
        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Merma
          </span>
          <div className="text-xl font-bold font-mono text-red-500">
            {totalMermaScope.toLocaleString()}
          </div>
          <span className="text-[9px] font-mono text-slate-600 block">Eva mermada/Scrap</span>
        </div>

        {/* KPI 12: Tiempo promedio por lote */}
        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">
            Tiempo Prom. Lote
          </span>
          <div className="text-xl font-bold font-mono text-teal-400">
            {tiempoPromedioLote} <span className="text-xs text-slate-400 font-sans">min</span>
          </div>
          <span className="text-[9px] font-mono text-slate-600 block">Termo-estabilización</span>
        </div>

      </div>

      {/* 4. SECCIÓN INTERACTIVA DE GRÁFICAS DE PORTAFOLIO EN TABS */}
      <div id="inj_charts_console" className="bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-2xl space-y-4">
        <div className="flex justify-between items-center border-b border-slate-900 pb-3 flex-wrap gap-2">
          <div>
            <h3 className="text-xs font-black font-mono text-slate-200 uppercase tracking-widest flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-amber-500 animate-pulse" />
              Consola Analítica Inteligente de Inyección EVA
            </h3>
            <p className="text-[10px] text-slate-500 font-sans">Análisis paramétrico de velocidad, rendimiento, mermas y primeras vs segundas.</p>
          </div>

          <div className="bg-slate-900 p-1 rounded-lg border border-slate-800 flex gap-1">
            <button
              onClick={() => setChartTab('prod')}
              className={`px-3 py-1 text-[10px] font-mono font-bold uppercase rounded transition-colors ${
                chartTab === 'prod' ? 'bg-amber-600 text-slate-950 font-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              Velocidad & Prensas
            </button>
            <button
              onClick={() => setChartTab('def')}
              className={`px-3 py-1 text-[10px] font-mono font-bold uppercase rounded transition-colors ${
                chartTab === 'def' ? 'bg-amber-600 text-slate-950 font-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              Pareto & Defectos
            </button>
            <button
              onClick={() => setChartTab('eff')}
              className={`px-3 py-1 text-[10px] font-mono font-bold uppercase rounded transition-colors ${
                chartTab === 'eff' ? 'bg-amber-600 text-slate-950 font-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              Eficiencias & Tallas
            </button>
          </div>
        </div>

        {/* Tab content 1: Prod & Machines */}
        {chartTab === 'prod' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Chart 1: Producción por hora */}
            <div className="p-4 bg-slate-900/60 border border-slate-850 rounded-xl">
              <h4 className="text-xs font-black font-mono text-slate-350 uppercase mb-1">
                ⏱️ Producción por Hora en Inyección
              </h4>
              <p className="text-[9px] text-slate-550 mb-3">Distribución proporcional de vulcanizado EVA en 24 horas.</p>
              <div className="h-56 overflow-x-auto">
                <div className="w-full min-w-[300px] h-full">
                <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <RechartsLineChart data={prodHourlyData} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                    <RechartsCartesianGrid strokeDasharray="3 3" stroke="#1c2436" />
                    <RechartsXAxis dataKey="hour" stroke="#5b6c80" style={{ fontSize: '8px' }} />
                    <RechartsYAxis stroke="#5b6c80" style={{ fontSize: '8px' }} />
                    <RechartsTooltip contentStyle={{ backgroundColor: 'rgba(2, 6, 23, 0.9)', borderColor: '#1e293b' }} />
                    <RechartsLine type="monotone" dataKey="Pares" stroke="#e11d48" strokeWidth={2.5} dot={{ fill: '#f59e0b' }} />
                  </RechartsLineChart>
                </RechartsResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Chart 2: Producción por máquina */}
            <div className="p-4 bg-slate-900/60 border border-slate-850 rounded-xl">
              <h4 className="text-xs font-black font-mono text-slate-350 uppercase mb-1">
                ⚙️ Producción por Máquina Prensa
              </h4>
              <p className="text-[9px] text-slate-550 mb-3">Volumen inspeccionado por celda termoplástica en el periodo.</p>
              <div className="h-56 overflow-x-auto">
                <div className="w-full min-w-[300px] h-full">
                <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <RechartsBarChart data={machineProdChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                    <RechartsCartesianGrid strokeDasharray="3 3" stroke="#1c2436" />
                    <RechartsXAxis dataKey="name" stroke="#5b6c80" style={{ fontSize: '8px' }} />
                    <RechartsYAxis stroke="#5b6c80" style={{ fontSize: '8px' }} />
                    <RechartsTooltip contentStyle={{ backgroundColor: 'rgba(2, 6, 23, 0.9)', borderColor: '#1e293b' }} />
                    <RechartsBar dataKey="Pares" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </RechartsBarChart>
                </RechartsResponsiveContainer>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Tab content 2: Defects & Pareto */}
        {chartTab === 'def' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Chart 3: Defectos por máquina */}
            <div className="p-4 bg-slate-900/60 border border-slate-850 rounded-xl">
              <h4 className="text-xs font-black font-mono text-slate-350 uppercase mb-1">
                ⚠️ Defectos por Máquina Prensa
              </h4>
              <p className="text-[9px] text-slate-550 mb-3 block truncate">Distribución absoluta de anormalidades físicas registradas.</p>
              <div className="h-52 overflow-x-auto">
                <div className="w-full min-w-[300px] h-full">
                <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <RechartsBarChart data={machineDefChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                    <RechartsCartesianGrid strokeDasharray="3 3" stroke="#1c2436" />
                    <RechartsXAxis dataKey="name" stroke="#5b6c80" style={{ fontSize: '8px' }} />
                    <RechartsYAxis stroke="#5b6c80" style={{ fontSize: '8px' }} />
                    <RechartsTooltip contentStyle={{ backgroundColor: 'rgba(2, 6, 23, 0.9)', borderColor: '#1e293b' }} />
                    <RechartsBar dataKey="Defectos" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </RechartsBarChart>
                </RechartsResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Chart 4: Pareto de defectos */}
            <div className="p-4 bg-slate-900/60 border border-slate-850 rounded-xl font-mono">
              <h4 className="text-xs font-black text-slate-350 uppercase mb-1">
                📉 Pareto de Defectos de Inyección
              </h4>
              <p className="text-[9px] text-slate-550 mb-3">Voz del cliente: Priorización 80/20 de pérdidas de inyección.</p>
              <div className="h-52 overflow-x-auto">
                <div className="w-full min-w-[300px] h-full">
                <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <RechartsBarChart data={paretoDefectChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                    <RechartsCartesianGrid strokeDasharray="3 3" stroke="#1c2436" />
                    <RechartsXAxis dataKey="name" stroke="#5b6c80" style={{ fontSize: '7px' }} />
                    <RechartsYAxis stroke="#5b6c80" style={{ fontSize: '8px' }} />
                    <RechartsTooltip contentStyle={{ backgroundColor: 'rgba(2, 6, 23, 0.9)', borderColor: '#1e293b' }} />
                    <RechartsBar dataKey="Pares" fill="#e11d48" radius={[4, 4, 0, 0]} />
                  </RechartsBarChart>
                </RechartsResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Chart 5: Primeras vs Segundas */}
            <div className="p-4 bg-slate-900/60 border border-slate-850 rounded-xl">
              <h4 className="text-xs font-black font-mono text-slate-350 uppercase mb-1">
                ⚖️ Primeras vs Segundas por Modelo
              </h4>
              <p className="text-[9px] text-slate-550 mb-3">Balance de grado comercial A vs B para modelos dominantes.</p>
              <div className="h-52 overflow-x-auto">
                <div className="w-full min-w-[300px] h-full">
                <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <RechartsBarChart data={modelComparisonsChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                    <RechartsCartesianGrid strokeDasharray="3 3" stroke="#1c2436" />
                    <RechartsXAxis dataKey="name" stroke="#5b6c80" style={{ fontSize: '8px' }} />
                    <RechartsYAxis stroke="#5b6c80" style={{ fontSize: '8px' }} />
                    <RechartsTooltip contentStyle={{ backgroundColor: 'rgba(2, 6, 23, 0.9)', borderColor: '#1e293b' }} />
                    <RechartsLegend style={{ fontSize: '8px' }} />
                    <RechartsBar dataKey="Primeras" fill="#10b981" radius={[3, 3, 0, 0]} />
                    <RechartsBar dataKey="Segundas" fill="#6366f1" radius={[3, 3, 0, 0]} />
                  </RechartsBarChart>
                </RechartsResponsiveContainer>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Tab content 3: Efficiencies & Sizes */}
        {chartTab === 'eff' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Chart 6: Eficiencia por turno */}
            <div className="p-4 bg-slate-900/60 border border-slate-850 rounded-xl">
              <h4 className="text-xs font-black font-mono text-slate-350 uppercase mb-1">
                📊 Eficiencia por Turno de Trabajo
              </h4>
              <p className="text-[9px] text-slate-550 mb-3">Porcentaje de primeras sobre volumen total procesado.</p>
              <div className="h-56 font-mono overflow-x-auto">
                <div className="w-full min-w-[300px] h-full">
                <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <RechartsBarChart data={shiftEffChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                    <RechartsCartesianGrid strokeDasharray="3 3" stroke="#1c2436" />
                    <RechartsXAxis dataKey="name" stroke="#5b6c80" style={{ fontSize: '9px' }} />
                    <RechartsYAxis domain={[75, 100]} stroke="#5b6c80" style={{ fontSize: '9px' }} />
                    <RechartsTooltip contentStyle={{ backgroundColor: 'rgba(2, 6, 23, 0.9)', borderColor: '#1e293b' }} />
                    <RechartsBar dataKey="Eficiencia" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </RechartsBarChart>
                </RechartsResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Chart 7: Defectos por talla */}
            <div className="p-4 bg-slate-900/60 border border-slate-850 rounded-xl">
              <h4 className="text-xs font-black font-mono text-slate-350 uppercase mb-1">
                👟 Defectos por Talla de Calzado
              </h4>
              <p className="text-[9px] text-slate-550 mb-3">Concentración de mermas e incidencias por tamaño de molde.</p>
              <div className="h-56 font-mono overflow-x-auto">
                <div className="w-full min-w-[300px] h-full">
                <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <RechartsBarChart data={tallaDefChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                    <RechartsCartesianGrid strokeDasharray="3 3" stroke="#1c2436" />
                    <RechartsXAxis dataKey="name" stroke="#5b6c80" style={{ fontSize: '8px' }} />
                    <RechartsYAxis stroke="#5b6c80" style={{ fontSize: '8px' }} />
                    <RechartsTooltip contentStyle={{ backgroundColor: 'rgba(2, 6, 23, 0.9)', borderColor: '#1e293b' }} />
                    <RechartsBar dataKey="Hundimientos" fill="#d97706" radius={[4, 4, 0, 0]} />
                  </RechartsBarChart>
                </RechartsResponsiveContainer>
                </div>
              </div>
            </div>

          </div>
        )}

      </div>

      {/* 3. VISTA POR MÁQUINA (10 MAQUINES REGULADO CON COLORES Y DETALLES INDIVIDUALES) */}
      <div id="inj_machines_grid_section" className="space-y-3">
        <h3 className="text-xs font-black font-mono text-amber-500 uppercase tracking-widest pl-1 leading-none flex items-center gap-1.5">
          <Cpu className="w-4 h-4 text-amber-500" />
          ESTADO EN TIEMPO REAL DE LAS 10 INYECTORAS EVA (MÁQUINA 1 - MÁQUINA 10)
        </h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {machineCards.map((m, idx) => {
            
            // Determine status label and colors
            let statusBadgeClass = 'bg-slate-900 text-slate-400 border-slate-800';
            let statusIndicatorColor = 'bg-slate-700';
            let label = 'SIN DATOS';

            if (m.estado === 'activa') {
              label = 'ACTIVA';
              statusIndicatorColor = 'bg-emerald-500 animate-pulse';
              statusBadgeClass = 'bg-emerald-950/40 text-emerald-400 border-emerald-900';
            } else if (m.estado === 'detenida') {
              label = 'DETENIDA';
              statusIndicatorColor = 'bg-rose-500';
              statusBadgeClass = 'bg-rose-950/40 text-rose-400 border-rose-900';
            } else if (m.estado === 'mantenimiento') {
              label = 'MANTENIMIENTO';
              statusIndicatorColor = 'bg-amber-500';
              statusBadgeClass = 'bg-amber-950/40 text-amber-500 border-amber-900';
            } else if (m.estado === 'sin datos') {
              label = 'SIN DATOS';
              statusIndicatorColor = 'bg-slate-500';
              statusBadgeClass = 'bg-slate-900 text-slate-400 border-slate-800';
            }

            // Defect percentage color rule as requested
            let defectColorText = 'text-green-400';
            if (m.pctDefectivo > 5) {
              defectColorText = 'text-red-400 font-bold';
            } else if (m.pctDefectivo > 2) {
              defectColorText = 'text-amber-500';
            }

            return (
              <div 
                key={idx} 
                id={`maquina_card_${idx + 1}`}
                className="bg-slate-950 border border-slate-900 rounded-xl p-4 flex flex-col justify-between shadow-lg relative overflow-hidden space-y-3"
              >
                
                {/* Upper line */}
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[9px] font-mono font-bold text-slate-500 uppercase">PRENSA EVA</span>
                    <h4 className="text-sm font-black font-sans text-slate-100 flex items-center gap-1">
                      {m.name}
                    </h4>
                  </div>
                  <span className={`text-[8px] font-mono px-2 py-0.5 rounded-full border ${statusBadgeClass} font-bold flex items-center gap-1`}>
                    <span className={`w-1 h-1 rounded-full ${statusIndicatorColor}`}></span>
                    {label}
                  </span>
                </div>

                {/* Configuration Specs */}
                <div className="bg-slate-900/50 p-2.5 rounded-lg text-[10px] font-mono text-slate-400 space-y-1 border border-slate-900/50">
                  <div className="flex justify-between">
                    <span>Modelo:</span>
                    <strong className="text-slate-200 uppercase font-sans font-bold text-[9px] truncate max-w-[80px]">{m.modelo}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Color spec:</span>
                    <strong className="text-slate-300 truncate max-w-[80px]">{m.color}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Lote:</span>
                    <strong className="text-cyan-400 truncate max-w-[80px]">{m.lote}</strong>
                  </div>
                </div>

                {/* Performance stats */}
                <div className="space-y-1.5 pt-1">
                  
                  {/* Progress Line */}
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-[10px]">
                      <span className="font-sans text-slate-500 font-medium">Eficiencia:</span>
                      <span className="font-mono font-bold text-slate-200">{m.eficiencia}%</span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-1">
                      <div 
                        className={`h-1 rounded-full ${m.eficiencia >= 90 ? 'bg-emerald-500' : m.eficiencia >= 70 ? 'bg-amber-500' : 'bg-red-500'}`} 
                        style={{ width: `${m.eficiencia}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Production & defect details */}
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                    <div className="bg-slate-900/30 p-1.5 rounded text-center">
                      <span className="text-[8px] text-slate-500 block truncate leading-none">Rend. Turno</span>
                      <strong className="text-slate-200 text-xs font-bold font-mono">{m.produccion} <span className="text-[7px] text-slate-600">p</span></strong>
                    </div>
                    <div className="bg-slate-900/30 p-1.5 rounded text-center">
                      <span className="text-[8px] text-slate-500 block truncate leading-none">Scrap Falla</span>
                      <strong className={`text-xs font-bold font-mono ${defectColorText}`}>
                        {m.defectos} <span className="text-[7px] text-slate-500">p</span>
                      </strong>
                    </div>
                  </div>

                </div>

                {/* Footer specs */}
                <div className="flex justify-between items-center text-[9px] font-mono text-slate-600 border-t border-slate-900/50 pt-2">
                  <span>Audit: {m.ultimoRegistro}</span>
                  <span>Tasa: <strong className={defectColorText}>{m.pctDefectivo}%</strong></span>
                </div>

              </div>
            )
          })}
        </div>
      </div>

      {/* 5. TABLA DE CALIDAD DE INYECCIÓN (CON DETALLES Y BAJAS ESPECÍFICAS DE COLOR) */}
      <div id="inj_quality_table_section" className="bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-2xl space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-xs font-black font-mono text-slate-200 uppercase tracking-widest leading-none">
              📁 Historial Detallado de Inspección de Inyección Termo-Soplante EVA
            </h3>
            <p className="text-[10px] text-slate-550 mt-1">Bitácora técnica con folios, mermas, reprocesos e inspectores.</p>
          </div>
          <span className="text-[9px] bg-slate-900 font-mono text-slate-400 px-2 py-1 rounded border border-slate-850">
            Registros encontrados: <strong className="text-amber-500 font-bold">{filteredRecords.length}</strong>
          </span>
        </div>

        {/* Dynamic Responsive Table Wrapper */}
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-900 text-slate-500 font-mono text-[9px] uppercase hover:bg-slate-900/20">
                <th className="p-3">Fecha</th>
                <th className="p-3">Turno</th>
                <th className="p-3">Máquina</th>
                <th className="p-3">Molde</th>
                <th className="p-3">Lote</th>
                <th className="p-3">Modelo</th>
                <th className="p-3">Color</th>
                <th className="p-3">Talla</th>
                <th className="p-3 text-right">Inspec.</th>
                <th className="p-3 text-right font-semibold text-green-400">Prime</th>
                <th className="p-3 text-right text-indigo-400">Seg.</th>
                <th className="p-3 text-right text-amber-500">Reproc.</th>
                <th className="p-3 text-right text-red-550">Scrap</th>
                <th className="p-3">Defecto Principal</th>
                <th className="p-3 text-right font-medium text-slate-400">Falla Pcs</th>
                <th className="p-3 text-right">Estatus</th>
                <th className="p-3 text-right font-bold">% Def.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/40 text-[11px] font-sans text-slate-300">
              {filteredRecords.map((rec, idx) => {
                const pctDef = rec.totalInspeccionado > 0 ? Number(((rec.cantidad / rec.totalInspeccionado) * 100).toFixed(2)) : 0;
                
                // 5. COLOR ESTATUS RULES AS REQUESTED:
                // - Verde: % defectivo <= 2%
                // - Amarillo: % defectivo > 2% y <= 5%
                // - Rojo: % defectivo > 5%
                let alertColorText = 'text-green-400';
                let alertBadgeBg = 'bg-green-950/40 text-green-400 border-green-800/40';
                let alertLabel = 'VERDE';

                if (pctDef > 5) {
                  alertColorText = 'text-red-400 font-bold';
                  alertBadgeBg = 'bg-rose-950/40 text-rose-450 text-red-400 border-rose-800/40';
                  alertLabel = 'ROJO';
                } else if (pctDef > 2) {
                  alertColorText = 'text-amber-500';
                  alertBadgeBg = 'bg-amber-950/40 text-amber-500 border-amber-800/40';
                  alertLabel = 'AMARILLO';
                }

                return (
                  <tr key={idx} className="hover:bg-slate-900/40 group transition-colors">
                    <td className="p-3 font-mono text-[10px] text-slate-400 whitespace-nowrap">{rec.fecha}</td>
                    <td className="p-3 font-mono">
                      <span className="px-1.5 py-0.5 bg-slate-900 rounded text-slate-400">T{rec.turno}</span>
                    </td>
                    <td className="p-3 font-semibold font-mono text-slate-200 whitespace-nowrap">{rec.maquina}</td>
                    <td className="p-3 font-mono text-slate-400 text-[10px] whitespace-nowrap">{rec.molde}</td>
                    <td className="p-3 font-mono font-bold text-cyan-400 whitespace-nowrap">{rec.lote}</td>
                    <td className="p-3 font-medium text-slate-200 whitespace-nowrap">{rec.modelo}</td>
                    <td className="p-3 text-slate-400 whitespace-nowrap">{rec.color}</td>
                    <td className="p-3 font-mono text-slate-400">{rec.talla}</td>
                    <td className="p-3 text-right font-mono text-slate-200 font-semibold">{rec.totalInspeccionado}</td>
                    <td className="p-3 text-right font-mono text-emerald-400">{rec.primeras}</td>
                    <td className="p-3 text-right font-mono text-slate-350">{rec.segundas}</td>
                    <td className="p-3 text-right font-mono text-indigo-300">{rec.reproceso}</td>
                    <td className="p-3 text-right font-mono text-rose-400">{rec.merma}</td>
                    <td className="p-3 max-w-[150px] truncate" title={rec.observaciones}>
                      {rec.defecto && rec.defecto !== 'Ninguno' ? (
                        <div className="flex flex-col">
                          <span className="font-medium text-amber-500 font-mono text-[10px]">{rec.defecto}</span>
                          <span className="text-[9px] text-slate-550 italic font-sans block max-w-[150px] truncate">"{rec.observaciones}"</span>
                        </div>
                      ) : (
                        <span className="text-slate-500 italic font-sans font-medium text-[10px]">Aprobada sin desvío</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono text-slate-300">{rec.cantidad}</td>
                    <td className="p-3 text-right">
                      <span className={`text-[8px] px-2 py-0.5 border rounded-md font-bold font-mono tracking-wider ${alertBadgeBg}`}>
                        {alertLabel}
                      </span>
                    </td>
                    <td className={`p-3 text-right font-mono font-bold ${alertColorText}`}>
                      {pctDef}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. MODAL DE REGISTRO / FORMULARIO SIMULADO DE CAPTURA */}
      {isFormOpen && (
        <div id="register_inj_modal" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-1.5">
                <Flame className="w-5 h-5 text-amber-500 animate-pulse" />
                <h3 className="text-sm font-black font-mono text-slate-200 uppercase tracking-widest">
                  + Nuevo Reporte de Inyección EVA
                </h3>
              </div>
              <button 
                onClick={() => setIsFormOpen(false)}
                className="text-slate-400 hover:text-white font-mono text-xs cursor-pointer bg-slate-800 px-2.5 py-1 rounded"
              >
                CERRAR
              </button>
            </div>

            <form onSubmit={handleRegisterInjectionLog} className="space-y-4 text-xs font-sans">
              
              <div className="grid grid-cols-2 gap-4">
                
                {/* Fecha */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-450 text-slate-400 font-bold block">Fecha Inspección</label>
                  <input 
                    type="date"
                    required
                    value={newFecha}
                    onChange={(e) => setNewFecha(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded p-1.5 text-slate-200 focus:outline-none focus:border-amber-550 focus:border-amber-500"
                  />
                </div>

                {/* Turno */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-400 font-bold block">Turno</label>
                  <select
                    value={newTurno}
                    onChange={(e) => setNewTurno(e.target.value as '1' | '2' | '3')}
                    className="w-full bg-slate-950 border border-slate-850 rounded p-1.5 text-slate-250 text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value="1">Turno 1 - Matutino</option>
                    <option value="2">Turno 2 - Vespertino</option>
                    <option value="3">Turno 3 - Nocturno</option>
                  </select>
                </div>

                {/* Máquina */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-400 font-bold block">Prensa / Inyectora</label>
                  <select
                    value={newMaquina}
                    onChange={(e) => setNewMaquina(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded p-1.5 text-slate-200 focus:outline-none focus:border-amber-550 focus:border-amber-500"
                  >
                    {Array.from({ length: 10 }, (_, i) => `Máquina ${i + 1}`).map((m, idx) => (
                      <option key={idx} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                {/* Molde */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-400 font-bold block">Molde Acoplado</label>
                  <input 
                    type="text"
                    required
                    value={newMolde}
                    onChange={(e) => setNewMolde(e.target.value)}
                    placeholder="Ej. MLD-SNAP-01"
                    className="w-full bg-slate-950 border border-slate-850 rounded p-1.5 text-slate-250 text-slate-250 text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Inspector */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-400 font-bold block">Inspector de calidad</label>
                  <select 
                    required
                    value={newInspector}
                    onChange={(e) => setNewInspector(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded p-1.5 text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    {!responsibleOptions.includes(newInspector) && <option value={newInspector}>{newInspector}</option>}
                    {responsibleOptions.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>

                {/* Líder */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-400 font-bold block">Líder de Turno</label>
                  <select 
                    required
                    value={newLider}
                    onChange={(e) => setNewLider(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded p-1.5 text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    {!leaderOptions.includes(newLider) && <option value={newLider}>{newLider}</option>}
                    {leaderOptions.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>

                {/* Lote */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-400 font-bold block">Código de Lote</label>
                  <input 
                    type="text"
                    required
                    value={newLote}
                    onChange={(e) => setNewLote(e.target.value)}
                    placeholder="Ej. LOT-INJ-Y01"
                    className="w-full bg-slate-950 border border-slate-850 rounded p-1.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono text-[10px]"
                  />
                </div>

                {/* Modelo */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-400 font-bold block">Modelo Suela (Catálogo)</label>
                  <select
                    value={newModelo}
                    onChange={(e) => setNewModelo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded p-1.5 text-slate-300 focus:outline-none focus:border-amber-500"
                  >
                    <option value="">Pendiente OCR</option>
                    {uniqueModelsList.map((m, idx) => (
                      <option key={idx} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                {/* Color */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-400 font-bold block">Color Eva</label>
                  <input 
                    type="text"
                    required
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    placeholder="Ej. Negro"
                    className="w-full bg-slate-950 border border-slate-850 rounded p-1.5 text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Talla */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-400 font-bold block">Talla Calzado (15-30)</label>
                  <input 
                    type="number"
                    min="15"
                    max="30"
                    required
                    value={newTalla}
                    onChange={(e) => setNewTalla(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-850 rounded p-1.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                {/* Total inspeccionado */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-400 font-bold block">Pares Totales Inspeccionados</label>
                  <input 
                    type="number"
                    min="1"
                    required
                    value={newTotal}
                    onChange={(e) => setNewTotal(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-850 rounded p-1.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono font-bold"
                  />
                </div>

                {/* Segundas */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-400 font-bold block">Fallas Segundas (Detalles Cosméticos)</label>
                  <input 
                    type="number"
                    min="0"
                    required
                    value={newSegundas}
                    onChange={(e) => setNewSegundas(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-850 rounded p-1.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                {/* Reproceso */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-400 font-bold block">Fallas Reproceso (Flasheados / Rebaba)</label>
                  <input 
                    type="number"
                    min="0"
                    required
                    value={newReproceso}
                    onChange={(e) => setNewReproceso(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-850 rounded p-1.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                {/* Merma */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-400 font-bold block">Fallas Merma (Scrap EVA Irrecuperable)</label>
                  <input 
                    type="number"
                    min="0"
                    required
                    value={newMerma}
                    onChange={(e) => setNewMerma(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-850 rounded p-1.5 text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                {/* Tipo de Defecto */}
                <div className="space-y-1 col-span-2">
                  <label className="text-[10px] uppercase font-mono text-slate-400 font-bold block">Anomalía Crítica Detectada</label>
                  <select
                    value={newDefecto}
                    onChange={(e) => setNewDefecto(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 rounded p-1.5 text-slate-300 focus:outline-none focus:border-amber-500"
                  >
                    <option value="Quemado de Material">Quemado de Material (Presión excesiva)</option>
                    <option value="Variación de Volumen">Variación de Volumen (Dosificación compound)</option>
                    <option value="Rebaba de Cierre">Rebaba de Cierre (Cierre imperfecto molde)</option>
                    <option value="Burbuja de Aire">Burbuja de Aire (Defecto venteo gases)</option>
                    <option value="Agujeros en Vía">Agujeros en Vía (Vacío inestable)</option>
                    <option value="Mal Llenado">Mal Llenado (Presión hidráulica baja)</option>
                    <option value="Contracción Térmica">Contracción Térmica (Exceso calor desmoldado)</option>
                    <option value="Diferencia de Color">Diferencia de Color (Variación masterbatch)</option>
                    <option value="Punto de Inyección sin Cortar">Punto de Inyección sin Cortar (Acabado manual)</option>
                    <option value="Ninguno">Ninguno / Aprobación 100% Sin Desvío</option>
                  </select>
                </div>

                {/* Observaciones */}
                <div className="space-y-1 col-span-2">
                  <label className="text-[10px] uppercase font-mono text-slate-400 font-bold block">Detalles Analíticos / Observaciones de Campo</label>
                  <textarea 
                    rows={2}
                    value={newObservaciones}
                    onChange={(e) => setNewObservaciones(e.target.value)}
                    placeholder="Detallar posibles fallas mecánicas de la válvula de purga, molduras sucias o variabilidad de compuesto EVA..."
                    className="w-full bg-slate-950 border border-slate-850 rounded p-1.5 text-slate-200 focus:outline-none focus:border-amber-500"
                  ></textarea>
                </div>

              </div>

              {/* Action lines */}
              <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
                <button 
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded font-mono font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-550 text-slate-950 rounded font-mono font-black transition cursor-pointer shadow-lg border border-amber-500"
                >
                  Registrar Falla
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};

/* 8. Banda View */
export interface BandaProductionRecord {
  fecha: string;
  turno: '1' | '2' | '3';
  banda: string;
  inspector: string;
  lider: string;
  lote: string;
  modelo: string;
  color: string;
  talla: number;
  totalProcesado: number;
  primeras: number;
  segundas: number;
  reproceso: number;
  merma: number;
  defecto: string;
  cantidadDefecto: number;
  accionCorrectiva: string;
  observaciones: string;
  estatus: 'activa' | 'detenida' | 'saturada' | 'sin datos';
}

export const BandaView: React.FC = () => {
  const { currentTenant, addAuditLog, users, can, getGoalForAreaTurn } = useDashboard();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [chartTab, setChartTab] = useState<'prod' | 'def' | 'eff'>('prod');

  const [bandaRecords, setBandaRecords] = useState<BandaProductionRecord[]>([]);

  useEffect(() => {
    setBandaRecords([]);
  }, [currentTenant.id]);

  // Form registration states
  const [newFecha, setNewFecha] = useState('');
  const [newTurno, setNewTurno] = useState<'1' | '2' | '3'>('1');
  const [newBanda, setNewBanda] = useState('');
  const [newInspector, setNewInspector] = useState('');
  const [newLider, setNewLider] = useState('');
  const [newLote, setNewLote] = useState('');
  const [newModelo, setNewModelo] = useState('');
  const [newColor, setNewColor] = useState('');
  const [newTalla, setNewTalla] = useState(0);
  const [newTotal, setNewTotal] = useState(0);
  const [newSegundas, setNewSegundas] = useState(0);
  const [newReproceso, setNewReproceso] = useState(0);
  const [newMerma, setNewMerma] = useState(0);
  const [newDefecto, setNewDefecto] = useState('');
  const [newAccion, setNewAccion] = useState('');
  const [newObservaciones, setNewObservaciones] = useState('');
  const activeResponsables = users.filter(user => user.active).map(user => user.username);
  const responsibleOptions = activeResponsables;
  const leaderOptions = activeResponsables;

  // Distinct filter states
  const [filtroFecha, setFiltroFecha] = useState('');
  const [filtroTurno, setFiltroTurno] = useState('');
  const [filtroBanda, setFiltroBanda] = useState('');
  const [filtroInspector, setFiltroInspector] = useState('');
  const [filtroLider, setFiltroLider] = useState('');
  const [filtroModelo, setFiltroModelo] = useState('');
  const [filtroColor, setFiltroColor] = useState('');
  const [filtroTalla, setFiltroTalla] = useState('');
  const [filtroLote, setFiltroLote] = useState('');
  const [filtroDefecto, setFiltroDefecto] = useState('');
  const [filtroEstatus, setFiltroEstatus] = useState('');

  // Extract master lists dynamically from current records
  const uniqueInspectors = Array.from(new Set(bandaRecords.map(r => r.inspector))).filter(Boolean);
  const uniqueLiders = Array.from(new Set(bandaRecords.map(r => r.lider))).filter(Boolean);
  const uniqueModelsList = Array.from(new Set(bandaRecords.map(r => r.modelo))).filter(Boolean);
  const uniqueColorsList = Array.from(new Set(bandaRecords.map(r => r.color))).filter(Boolean);
  const uniqueDefectsList = Array.from(new Set(bandaRecords.map(r => r.defecto))).filter(f => f && f !== 'Ninguno');
  const uniqueSizesList = Array.from(new Set(bandaRecords.map(r => r.talla))).sort((a,b) => Number(a) - Number(b));

  // Filter application
  const filteredRecords = bandaRecords.filter(log => {
    if (filtroFecha && log.fecha !== filtroFecha) return false;
    if (filtroTurno && log.turno !== filtroTurno) return false;
    if (filtroBanda && log.banda !== filtroBanda) return false;
    if (filtroInspector && log.inspector !== filtroInspector) return false;
    if (filtroLider && log.lider !== filtroLider) return false;
    if (filtroModelo && log.modelo !== filtroModelo) return false;
    if (filtroColor && log.color !== filtroColor) return false;
    if (filtroTalla && String(log.talla) !== filtroTalla) return false;
    if (filtroLote && !log.lote.toLowerCase().includes(filtroLote.toLowerCase())) return false;
    if (filtroDefecto && log.defecto !== filtroDefecto) return false;
    if (filtroEstatus && log.estatus !== filtroEstatus) return false;
    return true;
  });

  const handleClearFilters = () => {
    setFiltroFecha('');
    setFiltroTurno('');
    setFiltroBanda('');
    setFiltroInspector('');
    setFiltroLider('');
    setFiltroModelo('');
    setFiltroColor('');
    setFiltroTalla('');
    setFiltroLote('');
    setFiltroDefecto('');
    setFiltroEstatus('');
  };

  // Register manual report
  const handleRegisterBandaLog = (e: React.FormEvent) => {
    e.preventDefault();
    const actualDefectQty = newSegundas + newReproceso + newMerma;
    const computedPrimeras = Math.max(0, newTotal - actualDefectQty);

    const newLog: BandaProductionRecord = {
      fecha: newFecha,
      turno: newTurno,
      banda: newBanda,
      inspector: newInspector,
      lider: newLider,
      lote: newLote,
      modelo: newModelo,
      color: newColor,
      talla: Number(newTalla),
      totalProcesado: newTotal,
      primeras: computedPrimeras,
      segundas: newSegundas,
      reproceso: newReproceso,
      merma: newMerma,
      defecto: actualDefectQty > 0 ? newDefecto : 'Ninguno',
      cantidadDefecto: actualDefectQty,
      accionCorrectiva: actualDefectQty > 0 ? newAccion : 'No requiere',
      observaciones: newObservaciones,
      estatus: actualDefectQty > newTotal * 0.05 ? 'saturada' : (newTotal > 0 ? 'activa' : 'detenida')
    };

    const nextLogs = [newLog, ...bandaRecords];
    setBandaRecords(nextLogs);

    addAuditLog('PRODUCTION', 'REGISTER_BANDA_LOG', `Registro manual en Banda: ${newBanda}, Lote: ${newLote}, Procesado: ${newTotal}`);
    setIsFormOpen(false);
  };

  // KPI Calculations
  const baseGoal = 12000;
  const selectedTurnCode = filtroTurno === '2' ? 'TARDE' : filtroTurno === '3' ? 'NOCHE' : 'MAÑANA';
  const metaDiariaBanda = getGoalForAreaTurn('banda', selectedTurnCode)?.metaTurno || baseGoal;
  const hoyDate = '2026-05-25';
  
  const recordsHoy = filteredRecords.filter(r => r.fecha === (filtroFecha || hoyDate));
  const paresProcesadosHoy = recordsHoy.reduce((sum, r) => sum + r.totalProcesado, 0);
  const cumplimientoMeta = metaDiariaBanda > 0 ? Number(((paresProcesadosHoy / metaDiariaBanda) * 100).toFixed(1)) : 0;
  const promedioParesPorHora = paresProcesadosHoy > 0 ? Math.round(paresProcesadosHoy / 8) : 0;

  const totalProcesadoScope = filteredRecords.reduce((sum, r) => sum + r.totalProcesado, 0);
  const totalDefectosScope = filteredRecords.reduce((sum, r) => sum + r.cantidadDefecto, 0);
  const pctDefectivoScope = totalProcesadoScope > 0 ? Number(((totalDefectosScope / totalProcesadoScope) * 100).toFixed(2)) : 0;

  const totalSegundasScope = filteredRecords.reduce((sum, r) => sum + r.segundas, 0);
  const totalReprocesosScope = filteredRecords.reduce((sum, r) => sum + r.reproceso, 0);
  const totalMermaScope = filteredRecords.reduce((sum, r) => sum + r.merma, 0);

  const bandaOutputMap: Record<string, number> = {};
  filteredRecords.forEach(r => { bandaOutputMap[r.banda] = (bandaOutputMap[r.banda] || 0) + r.totalProcesado; });
  const maxProdEntry = Object.entries(bandaOutputMap).sort((a,b)=>b[1]-a[1])[0];
  const bandaMayorProduccion = maxProdEntry ? `${maxProdEntry[0]} (${maxProdEntry[1].toLocaleString()})` : 'Ninguna';

  const bandaDefectMap: Record<string, number> = {};
  filteredRecords.forEach(r => { bandaDefectMap[r.banda] = (bandaDefectMap[r.banda] || 0) + r.cantidadDefecto; });
  const maxDefectEntry = Object.entries(bandaDefectMap).sort((a,b)=>b[1]-a[1])[0];
  const bandaMayorDefecto = maxDefectEntry ? `${maxDefectEntry[0]}` : 'Ninguna';

  const tiempoPromedioBanda = totalProcesadoScope > 0
    ? Math.round(95 + (totalDefectosScope / Math.max(1, filteredRecords.length)) * 2) : 95;

  const bandaNames = Array.from(new Set(filteredRecords.map(r => r.banda))).filter(Boolean);
  const bandaCards = bandaNames.map(bName => {
    const bRecords = filteredRecords.filter(r => r.banda === bName);
    const totalProd = bRecords.reduce((sum, r) => sum + r.totalProcesado, 0);
    const totalDef = bRecords.reduce((sum, r) => sum + r.cantidadDefecto, 0);
    const latestRec = bRecords[0];

    let computedStatus: 'activa' | 'detenida' | 'saturada' | 'sin datos' =
      totalProd === 0 && bRecords.length > 0 ? 'detenida' : 'sin datos';
    if (totalProd > 0) {
      computedStatus = (totalDef / totalProd) > 0.05 ? 'saturada' : 'activa';
    }

    const computedDefectPct = totalProd > 0 ? Number(((totalDef / totalProd) * 100).toFixed(1)) : 0;
    const computedEff = computedStatus === 'activa' 
      ? Math.max(75, Math.round(97 - (computedDefectPct * 1.5)))
      : (computedStatus === 'saturada' ? 76 : 0);

    return {
      name: bName,
      estado: computedStatus,
      modelo: latestRec?.modelo || '',
      color: latestRec?.color || '',
      lote: latestRec?.lote || '',
      produccion: totalProd,
      defectos: totalDef,
      pctDefectivo: computedDefectPct,
      eficiencia: computedEff,
      ultimoRegistro: latestRec ? latestRec.fecha.split('-').slice(1).join('/') : '--',
      responsable: latestRec?.lider || ''
    };
  });

  const activeBandsCount = bandaCards.filter(b => b.estado === 'activa' || b.estado === 'saturada').length;

  // Hourly Line charts
  const baseHourlyFactor = totalProcesadoScope / 12000;
  const prodHourlyData = [
    { hour: '06:00', 'Pares': Math.round(410 * baseHourlyFactor) },
    { hour: '10:00', 'Pares': Math.round(750 * baseHourlyFactor) },
    { hour: '14:00', 'Pares': Math.round(610 * baseHourlyFactor) },
    { hour: '18:00', 'Pares': Math.round(730 * baseHourlyFactor) },
    { hour: '22:00', 'Pares': Math.round(490 * baseHourlyFactor) }
  ];

  const bandaProdChartData = bandaCards.map(b => ({ name: b.name, 'Pares': b.produccion }));
  const bandaDefChartData = bandaCards.map(b => ({ name: b.name, 'Defectos': b.defectos }));

  // Pareto chart processing
  const defectCountMap: Record<string, number> = {};
  filteredRecords.forEach(r => {
    if (r.defecto && r.defecto !== 'Ninguno') {
      defectCountMap[r.defecto] = (defectCountMap[r.defecto] || 0) + r.cantidadDefecto;
    }
  });
  const sortedDefects = Object.entries(defectCountMap).sort((a,b)=>b[1]-a[1]);
  const paretoSum = sortedDefects.reduce((s, curr)=>s + curr[1], 0) || 1;
  let cumulativePareto = 0;
  const paretoDefectChartData = sortedDefects.map(([name, count]) => {
    cumulativePareto += count;
    return {
      name: name.substring(0, 10) + '...',
      'Pares': count,
      'Pareto %': Math.min(100, Math.round((cumulativePareto / paretoSum) * 100))
    };
  });

  // Comparisons
  const primeVsSecMap: Record<string, { primeras: number; segundas: number }> = {};
  filteredRecords.forEach(r => {
    if (!primeVsSecMap[r.modelo]) primeVsSecMap[r.modelo] = { primeras: 0, segundas: 0 };
    primeVsSecMap[r.modelo].primeras += r.primeras;
    primeVsSecMap[r.modelo].segundas += r.segundas;
  });
  const modelComparisonsChartData = Object.entries(primeVsSecMap).map(([name, stats]) => ({
    name, 'Primeras': stats.primeras, 'Segundas': stats.segundas
  })).slice(0, 5);

  const modelDefectMap: Record<string, number> = {};
  filteredRecords.forEach(r => { modelDefectMap[r.modelo] = (modelDefectMap[r.modelo] || 0) + r.cantidadDefecto; });
  const modelDefectChartData = Object.entries(modelDefectMap).map(([name, val]) => ({ name, 'Defectos': val })).slice(0, 5);

  const colorDefectMap: Record<string, number> = {};
  filteredRecords.forEach(r => { colorDefectMap[r.color] = (colorDefectMap[r.color] || 0) + r.cantidadDefecto; });
  const colorDefectChartData = Object.entries(colorDefectMap).map(([name, val]) => ({ name, 'Defectos': val })).slice(0, 5);

  const dailyRates: Record<string, { def: number; tot: number }> = {};
  filteredRecords.forEach(r => {
    if (!dailyRates[r.fecha]) dailyRates[r.fecha] = { def: 0, tot: 0 };
    dailyRates[r.fecha].def += r.cantidadDefecto;
    dailyRates[r.fecha].tot += r.totalProcesado;
  });
  const trendChartData = Object.entries(dailyRates).map(([date, stats]) => ({
    name: date.split('-').slice(1).join('/'),
    '% Defectivo': stats.tot > 0 ? Number(((stats.def / stats.tot) * 100).toFixed(2)) : 0
  })).sort((a,b)=>a.name.localeCompare(b.name)).slice(-7);

  return (
    <div className="space-y-6">

      {/* HEADER CONTROL */}
      <div id="bnd_header_control" className="flex justify-between items-center bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-xl flex-wrap gap-4">
        <div>
          <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-widest font-bold block mb-1">
            CONTROL INDUSTRIAL EVA BANDA Y DETALLADO
          </span>
          <h2 className="text-xl font-black font-sans text-slate-100 uppercase tracking-tight leading-none mb-1 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></span>
            Pantalla de Banda - Plastisol e Inspección
          </h2>
          <p className="text-xs text-slate-400 font-sans">
            Validación de fijación de plastisoles, desbarbado, control de mermas e inspección. Tenant ID: <strong className="text-slate-300">{currentTenant.name}</strong>.
          </p>
        </div>

        <div className="flex gap-2">
          {can('banda.create_log') && (
            <button 
              id="register_bnd_report_btn"
              onClick={() => setIsFormOpen(true)}
              className="flex items-center gap-1.5 px-4.5 py-2 bg-indigo-600 hover:bg-indigo-550 text-white text-xs font-mono font-black rounded-lg transition border border-indigo-500 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4 text-white" />
              + Nuevo reporte de banda
            </button>
          )}
        </div>
      </div>

      {/* 1. FILTROS CONSOLIDADORES */}
      <div id="bnd_filters_panel" className="bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-900 pb-2">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-mono text-slate-300 uppercase tracking-wider font-bold">Consola de Filtros de Banda</span>
          </div>
          <button 
            onClick={handleClearFilters}
            className="text-[10px] bg-slate-900 hover:bg-slate-850 px-2 py-1 text-slate-400 hover:text-white border border-slate-800 rounded font-mono transition flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3 text-indigo-400" />
            Limpiar Filtros
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono font-bold text-slate-500 block">Fecha</label>
            <input type="date" value={filtroFecha} onChange={(e) => setFiltroFecha(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none" />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono font-bold text-slate-500 block">Turno</label>
            <select value={filtroTurno} onChange={(e) => setFiltroTurno(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none">
              <option value="">-- Todos --</option>
              <option value="1">Turno 1</option>
              <option value="2">Turno 2</option>
              <option value="3">Turno 3</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono font-bold text-slate-500 block">Banda</label>
            <select value={filtroBanda} onChange={(e) => setFiltroBanda(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none">
              <option value="">-- Todas --</option>
              <option value="Banda 1">Banda 1</option>
              <option value="Banda 2">Banda 2</option>
              <option value="Banda 3">Banda 3</option>
              <option value="Banda 4">Banda 4</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono font-bold text-slate-500 block">Inspector</label>
            <select value={filtroInspector} onChange={(e) => setFiltroInspector(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none">
              <option value="">-- Todos --</option>
              {uniqueInspectors.map((ins, idx) => <option key={idx} value={ins}>{ins}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono font-bold text-slate-500 block">Líder</label>
            <select value={filtroLider} onChange={(e) => setFiltroLider(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none">
              <option value="">-- Todos --</option>
              {uniqueLiders.map((lid, idx) => <option key={idx} value={lid}>{lid}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono font-bold text-slate-500 block">Modelo</label>
            <select value={filtroModelo} onChange={(e) => setFiltroModelo(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none">
              <option value="">-- Todos --</option>
              {uniqueModelsList.map((m, idx) => <option key={idx} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono font-bold text-slate-500 block">Color</label>
            <select value={filtroColor} onChange={(e) => setFiltroColor(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none">
              <option value="">-- Todos --</option>
              {uniqueColorsList.map((c, idx) => <option key={idx} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono font-bold text-slate-500 block">Talla</label>
            <select value={filtroTalla} onChange={(e) => setFiltroTalla(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none">
              <option value="">-- Todas --</option>
              {uniqueSizesList.map((sz, idx) => <option key={idx} value={String(sz)}>{sz}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono font-bold text-slate-500 block">Lote</label>
            <input type="text" placeholder="Buscar lote..." value={filtroLote} onChange={(e) => setFiltroLote(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none" />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono font-bold text-slate-500 block">Defecto</label>
            <select value={filtroDefecto} onChange={(e) => setFiltroDefecto(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none">
              <option value="">-- Todos --</option>
              {uniqueDefectsList.map((def, idx) => <option key={idx} value={def}>{def}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-mono font-bold text-slate-500 block">Estatus</label>
            <select value={filtroEstatus} onChange={(e) => setFiltroEstatus(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none">
              <option value="">-- Todos --</option>
              <option value="activa">🟡 Activa</option>
              <option value="detenida">🔴 Detenida</option>
              <option value="saturada">⚠️ Saturada</option>
              <option value="sin datos">⚪ Sin datos</option>
            </select>
          </div>
        </div>
      </div>

      {/* 2. KPIs SUPERIORES */}
      <div id="bnd_kpis_panel" className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">Pares procesados banda</span>
          <div className="text-xl font-bold font-mono text-indigo-400">{paresProcesadosHoy.toLocaleString()}</div>
          <span className="text-[9px] font-mono text-slate-600 block">Trimado y adhesión hoy</span>
        </div>

        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">Meta diaria banda</span>
          <div className="text-xl font-bold font-mono text-slate-400">{metaDiariaBanda.toLocaleString()}</div>
          <span className="text-[9px] font-mono text-slate-600 block">Parámetro nominal base</span>
        </div>

        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">Cumplimiento meta</span>
          <div className={`text-xl font-bold font-mono ${cumplimientoMeta >= 90 ? 'text-green-400' : 'text-amber-500'}`}>{cumplimientoMeta}%</div>
          <span className="text-[9px] font-mono text-slate-600 block">Porcentaje de avance</span>
        </div>

        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">Producción por hora</span>
          <div className="text-xl font-bold font-mono text-indigo-300">{promedioParesPorHora.toLocaleString()}</div>
          <span className="text-[9px] font-mono text-slate-600 block">Pares por hora avg</span>
        </div>

        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">Bandas activas</span>
          <div className="text-xl font-bold font-mono text-indigo-400">{activeBandsCount} / 4</div>
          <span className="text-[9px] font-mono text-slate-600 block">Celdas energizadas</span>
        </div>

        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">Banda mayor producción</span>
          <div className="text-xs font-bold font-mono text-slate-300 truncate" title={bandaMayorProduccion}>{bandaMayorProduccion}</div>
          <span className="text-[9px] font-mono text-slate-600 block">Línea más veloz</span>
        </div>

        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">Banda mayor defecto</span>
          <div className="text-xs font-bold font-mono text-red-400 truncate">{bandaMayorDefecto}</div>
          <span className="text-[9px] font-mono text-slate-600 block">Rechazos acumulados</span>
        </div>

        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">% defectivo banda</span>
          <div className={`text-xl font-bold font-mono ${pctDefectivoScope > 5 ? 'text-red-400' : 'text-green-400'}`}>{pctDefectivoScope}%</div>
          <span className="text-[9px] font-mono text-slate-600 block">Tasa general de pérdidas</span>
        </div>

        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">Segundas en banda</span>
          <div className="text-xl font-bold font-mono text-teal-400">{totalSegundasScope.toLocaleString()}</div>
          <span className="text-[9px] font-mono text-slate-600 block">Detalle cosmético</span>
        </div>

        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">Reprocesos</span>
          <div className="text-xl font-bold font-mono text-pink-400">{totalReprocesosScope.toLocaleString()}</div>
          <span className="text-[9px] font-mono text-slate-600 block">Reacondicionamientos</span>
        </div>

        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">Merma</span>
          <div className="text-xl font-bold font-mono text-red-500">{totalMermaScope.toLocaleString()}</div>
          <span className="text-[9px] font-mono text-slate-600 block">Piezas destruidas</span>
        </div>

        <div className="p-4 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block tracking-wider leading-none">Tiempo promedio en banda</span>
          <div className="text-xl font-bold font-mono text-indigo-400">{tiempoPromedioBanda} <span className="text-xs font-sans text-slate-500">min</span></div>
          <span className="text-[9px] font-mono text-slate-600 block">Ciclo temporal avg</span>
        </div>
      </div>

      {/* 3. VISTA POR BANDA (CARDS) */}
      <div id="bnd_cards_section" className="space-y-3">
        <h3 className="text-xs font-black font-mono text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-indigo-400" /> Vales Operativos de Bandas (1 - 4)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {bandaCards.map((bCard, idx) => (
            <div key={idx} className="bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-xl space-y-3">
              <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                <div className="flex flex-col">
                  <span className="text-xs font-black font-mono text-slate-100">{bCard.name}</span>
                  <span className="text-[9px] text-slate-500">Líder: {bCard.responsable}</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[8px] font-mono font-bold ${
                  bCard.estado === 'activa' ? 'bg-green-950 text-green-400 border border-green-900' :
                  bCard.estado === 'saturada' ? 'bg-amber-950 text-amber-400 border border-amber-900' :
                  bCard.estado === 'detenida' ? 'bg-red-950 text-red-500 border border-red-900' :
                  'bg-slate-900 text-slate-400 border border-slate-800'
                }`}>
                  {bCard.estado === 'activa' && '🟢 Activa'}
                  {bCard.estado === 'saturada' && '⚠️ Saturada'}
                  {bCard.estado === 'detenida' && '🛑 Detenida'}
                  {bCard.estado === 'sin datos' && '⚪ Sin datos'}
                </span>
              </div>

              <div className="text-[11px] font-mono text-slate-400 space-y-1.5">
                <div className="flex justify-between border-b border-slate-905 pb-1">
                  <span>Modelo actual:</span> <strong className="text-slate-200">{bCard.modelo}</strong>
                </div>
                <div className="flex justify-between border-b border-slate-905 pb-1">
                  <span>Color:</span> <strong className="text-slate-200">{bCard.color}</strong>
                </div>
                <div className="flex justify-between border-b border-slate-905 pb-1">
                  <span>Lote:</span> <strong className="text-amber-500">{bCard.lote}</strong>
                </div>
                <div className="flex justify-between border-b border-slate-905 pb-1">
                  <span>Producción turno:</span> <strong className="text-slate-200">{bCard.produccion.toLocaleString()}</strong>
                </div>
                <div className="flex justify-between border-b border-slate-905 pb-1">
                  <span>Eficiencia:</span> <strong className="text-indigo-400">{bCard.eficiencia}%</strong>
                </div>
                <div className="flex justify-between border-b border-slate-905 pb-1">
                  <span>Defectos:</span> <strong className="text-red-400">{bCard.defectos}</strong>
                </div>
                <div className="flex justify-between">
                  <span>% defectivo:</span> <strong className="text-slate-200">{bCard.pctDefectivo}%</strong>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-900 text-center text-[9px] text-slate-500 flex justify-between font-mono">
                <span>Refresco: Auto</span>
                <span>Último: {bCard.ultimoRegistro}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. GRÁFICAS */}
      <div id="bnd_charts_console" className="bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-2xl space-y-4">
        <div className="flex justify-between items-center border-b border-slate-900 pb-3 flex-wrap gap-2">
          <div>
            <h3 className="text-xs font-black font-mono text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-indigo-400 animate-pulse" /> Consola de Gráficas de Banda
            </h3>
            <p className="text-[10px] text-slate-500">Visualizadores para análisis de productividad, Pareto e imperfecciones.</p>
          </div>

          <div className="bg-slate-900 p-1 rounded-lg border border-slate-800 flex gap-1">
            {[['prod', 'Producción'], ['def', 'Pareto & Defectos'], ['eff', 'Modelos & Tendencias']].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setChartTab(key as any)}
                className={`px-2.5 py-1 text-[9px] font-mono font-bold uppercase rounded transition-colors cursor-pointer ${
                  chartTab === key ? 'bg-indigo-600 text-white font-black' : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {chartTab === 'prod' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 bg-slate-900/60 border border-slate-850 rounded-xl">
              <h4 className="text-[11px] font-mono text-slate-300 uppercase font-black mb-2">⏱️ Producción por hora en banda</h4>
              <div className="h-44 overflow-x-auto">
                <div className="w-full min-w-[300px] h-full">
                <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <RechartsLineChart data={prodHourlyData} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                    <RechartsCartesianGrid strokeDasharray="3 3" stroke="#1c2436" />
                    <RechartsXAxis dataKey="hour" stroke="#5b6c80" style={{ fontSize: '8px' }} />
                    <RechartsYAxis stroke="#5b6c80" style={{ fontSize: '8px' }} />
                    <RechartsTooltip contentStyle={{ backgroundColor: 'rgba(2, 6, 23, 0.9)', borderColor: '#1e293b' }} />
                    <RechartsLine type="monotone" dataKey="Pares" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#818cf8' }} />
                  </RechartsLineChart>
                </RechartsResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-900/60 border border-slate-850 rounded-xl">
              <h4 className="text-[11px] font-mono text-slate-300 uppercase font-black mb-2">⚙️ Producción por banda</h4>
              <div className="h-44 overflow-x-auto">
                <div className="w-full min-w-[300px] h-full">
                <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <RechartsBarChart data={bandaProdChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                    <RechartsCartesianGrid strokeDasharray="3 3" stroke="#1c2436" />
                    <RechartsXAxis dataKey="name" stroke="#5b6c80" style={{ fontSize: '8px' }} />
                    <RechartsYAxis stroke="#5b6c80" style={{ fontSize: '8px' }} />
                    <RechartsTooltip contentStyle={{ backgroundColor: 'rgba(2, 6, 23, 0.9)', borderColor: '#1e293b' }} />
                    <RechartsBar dataKey="Pares" fill="#818cf8" radius={[4, 4, 0, 0]} />
                  </RechartsBarChart>
                </RechartsResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {chartTab === 'def' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 bg-slate-900/60 border border-slate-850 rounded-xl">
              <h4 className="text-[11px] font-mono text-slate-300 uppercase font-black mb-2">⚠️ Defectos por banda</h4>
              <div className="h-44 overflow-x-auto">
                <div className="w-full min-w-[300px] h-full">
                <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <RechartsBarChart data={bandaDefChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                    <RechartsCartesianGrid strokeDasharray="3 3" stroke="#1c2436" />
                    <RechartsXAxis dataKey="name" stroke="#5b6c80" style={{ fontSize: '8px' }} />
                    <RechartsYAxis stroke="#5b6c80" style={{ fontSize: '8px' }} />
                    <RechartsTooltip contentStyle={{ backgroundColor: 'rgba(2, 6, 23, 0.9)', borderColor: '#1e293b' }} />
                    <RechartsBar dataKey="Defectos" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  </RechartsBarChart>
                </RechartsResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-900/60 border border-slate-850 rounded-xl">
              <h4 className="text-[11px] font-mono text-slate-300 uppercase font-black mb-2">📈 Pareto de defectos en banda</h4>
              <div className="h-44 overflow-x-auto">
                <div className="w-full min-w-[300px] h-full">
                <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <RechartsBarChart data={paretoDefectChartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                    <RechartsCartesianGrid strokeDasharray="3 3" stroke="#1c2436" />
                    <RechartsXAxis dataKey="name" stroke="#5b6c80" style={{ fontSize: '7px' }} />
                    <RechartsYAxis stroke="#5b6c80" style={{ fontSize: '8px' }} />
                    <RechartsTooltip contentStyle={{ backgroundColor: 'rgba(2, 6, 23, 0.9)', borderColor: '#1e293b' }} />
                    <RechartsBar dataKey="Pares" fill="#ec4899" radius={[4, 4, 0, 0]} />
                  </RechartsBarChart>
                </RechartsResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {chartTab === 'eff' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 bg-slate-900/60 border border-slate-850 rounded-xl">
                <h4 className="text-[11px] font-mono text-slate-300 uppercase font-black mb-2">⚖️ Primeras vs segundas por modelo</h4>
                <div className="h-44 overflow-x-auto">
                  <div className="w-full min-w-[300px] h-full">
                  <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                    <RechartsBarChart data={modelComparisonsChartData} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                      <RechartsCartesianGrid strokeDasharray="3 3" stroke="#1c2436" />
                      <RechartsXAxis dataKey="name" stroke="#5b6c80" style={{ fontSize: '8px' }} />
                      <RechartsYAxis stroke="#5b6c80" style={{ fontSize: '8px' }} />
                      <RechartsTooltip contentStyle={{ backgroundColor: 'rgba(2, 6, 23, 0.9)', borderColor: '#1e293b' }} />
                      <RechartsLegend wrapperStyle={{ fontSize: '9px' }} />
                      <RechartsBar dataKey="Primeras" fill="#10b981" radius={[2, 2, 0, 0]} />
                      <RechartsBar dataKey="Segundas" fill="#6366f1" radius={[2, 2, 0, 0]} />
                    </RechartsBarChart>
                  </RechartsResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-900/60 border border-slate-850 rounded-xl">
                <h4 className="text-[11px] font-mono text-slate-300 uppercase font-black mb-2">🧵 Defectos por modelo</h4>
                <div className="h-44 overflow-x-auto">
                  <div className="w-full min-w-[300px] h-full">
                  <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                    <RechartsBarChart data={modelDefectChartData} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                      <RechartsCartesianGrid strokeDasharray="3 3" stroke="#1c2436" />
                      <RechartsXAxis dataKey="name" stroke="#5b6c80" style={{ fontSize: '8px' }} />
                      <RechartsYAxis stroke="#5b6c80" style={{ fontSize: '8px' }} />
                      <RechartsTooltip contentStyle={{ backgroundColor: 'rgba(2, 6, 23, 0.9)', borderColor: '#1e293b' }} />
                      <RechartsBar dataKey="Defectos" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                    </RechartsBarChart>
                  </RechartsResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 bg-slate-900/60 border border-slate-850 rounded-xl">
                <h4 className="text-[11px] font-mono text-slate-300 uppercase font-black mb-2">🎨 Defectos por color</h4>
                <div className="h-44 overflow-x-auto">
                  <div className="w-full min-w-[300px] h-full">
                  <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                    <RechartsBarChart data={colorDefectChartData} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                      <RechartsCartesianGrid strokeDasharray="3 3" stroke="#1c2436" />
                      <RechartsXAxis dataKey="name" stroke="#5b6c80" style={{ fontSize: '8px' }} />
                      <RechartsYAxis stroke="#5b6c80" style={{ fontSize: '8px' }} />
                      <RechartsTooltip contentStyle={{ backgroundColor: 'rgba(2, 6, 23, 0.9)', borderColor: '#1e293b' }} />
                      <RechartsBar dataKey="Defectos" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </RechartsBarChart>
                  </RechartsResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-900/60 border border-slate-850 rounded-xl">
                <h4 className="text-[11px] font-mono text-slate-300 uppercase font-black mb-2">📈 Tendencia de % defectivo</h4>
                <div className="h-44 overflow-x-auto">
                  <div className="w-full min-w-[300px] h-full">
                  <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                    <RechartsLineChart data={trendChartData} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                      <RechartsCartesianGrid strokeDasharray="3 3" stroke="#1c2436" />
                      <RechartsXAxis dataKey="name" stroke="#5b6c80" style={{ fontSize: '8px' }} />
                      <RechartsYAxis stroke="#5b6c80" style={{ fontSize: '8px' }} />
                      <RechartsTooltip contentStyle={{ backgroundColor: 'rgba(2, 6, 23, 0.9)', borderColor: '#1e293b' }} />
                      <RechartsLine type="monotone" dataKey="% Defectivo" stroke="#f43f5e" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
                    </RechartsLineChart>
                  </RechartsResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. TABLA DE INSPECCIÓN EN BANDA */}
      <div id="bnd_table_panel" className="bg-slate-950 border border-slate-900 rounded-xl shadow-2xl p-5 space-y-4">
        <div className="border-b border-slate-900 pb-3 flex justify-between items-center- flex-wrap gap-2">
          <div>
            <h3 className="text-xs font-black font-mono text-slate-200 uppercase tracking-widest flex items-center gap-1.5">
              <CheckSquare className="w-4 h-4 text-indigo-400" /> Tabla de Inspección en Banda
            </h3>
            <p className="text-[10px] text-slate-500">Inspección física y control de calidad sobre plastisol y mermas operativas.</p>
          </div>
          <span className="text-[10px] font-mono font-bold text-indigo-400 bg-slate-900 px-2.5 py-1 rounded border border-slate-800">
            {filteredRecords.length} registros
          </span>
        </div>

        <div className="overflow-x-auto w-full border border-slate-900 rounded-lg">
          <table className="w-full text-left border-collapse text-[11px] font-mono">
            <thead>
              <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[9px]">
                <th className="p-3">Fecha</th>
                <th className="p-3">Turno</th>
                <th className="p-3">Banda</th>
                <th className="p-3">Inspector</th>
                <th className="p-3">Líder</th>
                <th className="p-3">Lote</th>
                <th className="p-3">Modelo</th>
                <th className="p-3">Color</th>
                <th className="p-3 text-center">Talla</th>
                <th className="p-3 text-right">Total Procesado</th>
                <th className="p-3 text-right text-green-400">Primeras</th>
                <th className="p-3 text-right text-indigo-400">Segundas</th>
                <th className="p-3 text-right text-amber-500">Reproceso</th>
                <th className="p-3 text-right text-rose-500">Merma</th>
                <th className="p-3">Defecto</th>
                <th className="p-3 text-right text-red-400">Cantidad defecto</th>
                <th className="p-3 text-right">% defectivo</th>
                <th className="p-3">Acción Correctiva</th>
                <th className="p-3">Observaciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={19} className="p-10 text-center text-slate-500 text-xs italic font-sans animate-pulse">
                    Sin registros coincidentes con los parámetros industriales activos.
                  </td>
                </tr>
              ) : (
                filteredRecords.slice(0, 35).map((rec, idx) => {
                  const pctDef = rec.totalProcesado > 0 ? Number(((rec.cantidadDefecto / rec.totalProcesado) * 100).toFixed(1)) : 0;
                  return (
                    <tr key={idx} className="hover:bg-slate-900/50 transition border-b border-slate-900/40 text-slate-300">
                      <td className="p-3 whitespace-nowrap text-slate-200">{rec.fecha}</td>
                      <td className="p-3 text-center"><span className="bg-slate-850 text-slate-300 px-1.5 py-0.5 rounded text-[8px] border border-slate-800 font-bold">T{rec.turno}</span></td>
                      <td className="p-3 whitespace-nowrap font-bold text-indigo-400">{rec.banda}</td>
                      <td className="p-3 whitespace-nowrap text-[10px] text-slate-300">{rec.inspector}</td>
                      <td className="p-3 whitespace-nowrap text-[10px] text-slate-400">{rec.lider}</td>
                      <td className="p-3 whitespace-nowrap text-amber-500 font-bold">{rec.lote}</td>
                      <td className="p-3 whitespace-nowrap font-sans text-slate-200 font-medium">{rec.modelo}</td>
                      <td className="p-3 whitespace-nowrap">{rec.color}</td>
                      <td className="p-3 text-center text-slate-300 font-bold">{rec.talla}</td>
                      <td className="p-3 text-right font-bold">{rec.totalProcesado.toLocaleString()}</td>
                      <td className="p-3 text-right text-green-400 font-bold">{rec.primeras.toLocaleString()}</td>
                      <td className="p-3 text-right text-indigo-300">{rec.segundas.toLocaleString()}</td>
                      <td className="p-3 text-right text-amber-400">{rec.reproceso.toLocaleString()}</td>
                      <td className="p-3 text-right text-red-500 font-bold">{rec.merma.toLocaleString()}</td>
                      <td className="p-3 whitespace-nowrap">
                        {rec.defecto !== 'Ninguno' ? (
                          <span className="text-[10px] text-red-400 font-bold bg-red-950/40 border border-red-900/60 px-1.5 py-0.5 rounded">{rec.defecto}</span>
                        ) : <span className="text-slate-650">Ninguno</span>}
                      </td>
                      <td className="p-3 text-right font-bold text-red-400">{rec.cantidadDefecto}</td>
                      <td className={`p-3 text-right font-black ${pctDef > 5 ? 'text-red-400 bg-red-950/20' : 'text-slate-300'}`}>{pctDef}%</td>
                      <td className="p-3 max-w-xs truncate text-[10px] text-slate-400 font-sans" title={rec.accionCorrectiva}>{rec.accionCorrectiva}</td>
                      <td className="p-3 max-w-xs truncate text-[10px] text-slate-500 font-sans" title={rec.observaciones}>{rec.observaciones}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. FORMULARIO SIMULADO EN MODAL */}
      {isFormOpen && (
        <div id="new_banda_report_modal" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-2xl w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="font-mono text-xs font-black text-slate-100 uppercase tracking-wider">Nuevo Reporte de Banda</h3>
                  <p className="text-[10px] text-slate-500">Ingrese las variables del lote procesado para simular la actualización del dashboard.</p>
                </div>
              </div>
              <button onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-white font-black text-sm cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleRegisterBandaLog} className="space-y-4 text-xs font-mono">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-405 text-slate-400 block font-bold">Fecha:</label>
                  <input type="date" required value={newFecha} onChange={(e) => setNewFecha(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-300 focus:outline-none" />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 block font-bold">Turno:</label>
                  <select value={newTurno} onChange={(e) => setNewTurno(e.target.value as any)} className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-300 focus:outline-none">
                    <option value="1">1 (Matutino)</option>
                    <option value="2">2 (Vespertino)</option>
                    <option value="3">3 (Nocturno)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 block font-bold">Banda:</label>
                  <select value={newBanda} onChange={(e) => setNewBanda(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-300 focus:outline-none">
                    <option value="Banda 1">Banda 1</option>
                    <option value="Banda 2">Banda 2</option>
                    <option value="Banda 3">Banda 3</option>
                    <option value="Banda 4">Banda 4</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 block font-bold">Inspector:</label>
                  <select value={newInspector} onChange={(e) => setNewInspector(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-300 focus:outline-none">
                    {!responsibleOptions.includes(newInspector) && <option value={newInspector}>{newInspector}</option>}
                    {responsibleOptions.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 block font-bold">Líder:</label>
                  <select value={newLider} onChange={(e) => setNewLider(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-300 focus:outline-none">
                    {!leaderOptions.includes(newLider) && <option value={newLider}>{newLider}</option>}
                    {leaderOptions.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 block font-bold">Lote:</label>
                  <input type="text" required value={newLote} onChange={(e) => setNewLote(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-300 focus:outline-none" />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 block font-bold">Modelo:</label>
                  <select value={newModelo} onChange={(e) => setNewModelo(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-300 focus:outline-none">
                    <option value="">Pendiente OCR</option>
                    {uniqueModelsList.map((m, idx) => (
                      <option key={idx} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 block font-bold">Color:</label>
                  <select value={newColor} onChange={(e) => setNewColor(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-300 focus:outline-none">
                    {['Negro', 'Blanco', 'Arena', 'Azul Marino', 'Rojo', 'Gris'].map((c, idx) => (
                      <option key={idx} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 block font-bold">Talla:</label>
                  <input type="number" min={15} max={35} required value={newTalla} onChange={(e) => setNewTalla(Number(e.target.value))} className="w-full bg-slate-955 bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-300 focus:outline-none" />
                </div>
              </div>

              {/* Automatic calculation of % defectivo on live edits */}
              <div className="p-4 bg-slate-950 border border-slate-850 rounded-lg space-y-3.5">
                <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider block">Volúmenes y Cálculo de Pérdida</span>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-slate-400 block font-bold">Total procesado:</label>
                    <input type="number" min={1} required value={newTotal} onChange={(e) => setNewTotal(Math.max(1, Number(e.target.value)))} className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-slate-100 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-slate-400 block font-bold">Segundas:</label>
                    <input type="number" min={0} required value={newSegundas} onChange={(e) => setNewSegundas(Math.max(0, Number(e.target.value)))} className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-slate-300 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-slate-400 block font-bold">Reproceso:</label>
                    <input type="number" min={0} required value={newReproceso} onChange={(e) => setNewReproceso(Math.max(0, Number(e.target.value)))} className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-slate-300 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-slate-400 block font-bold">Merma:</label>
                    <input type="number" min={0} required value={newMerma} onChange={(e) => setNewMerma(Math.max(0, Number(e.target.value)))} className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-slate-300 focus:outline-none" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-900 text-center font-bold">
                  <div className="bg-slate-900 p-2 rounded">
                    <span className="text-[8px] text-slate-500 block uppercase font-mono">Primeras (OK)</span>
                    <strong className="text-xs text-green-400">{Math.max(0, newTotal - (newSegundas + newReproceso + newMerma))}</strong>
                  </div>
                  <div className="bg-slate-900 p-2 rounded">
                    <span className="text-[8px] text-slate-500 block uppercase font-mono">Defectos</span>
                    <strong className="text-xs text-red-500">{newSegundas + newReproceso + newMerma}</strong>
                  </div>
                  <div className="bg-slate-900 p-2 rounded">
                    <span className="text-[8px] text-slate-500 block uppercase font-mono">% Defectivo</span>
                    <span className="text-xs text-amber-400 block">{newTotal > 0 ? (((newSegundas + newReproceso + newMerma) / newTotal) * 100).toFixed(1) : '0.0'}%</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 block font-bold">Defecto Principal:</label>
                  <select value={newDefecto} onChange={(e) => setNewDefecto(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-300 focus:outline-none">
                    <option value="Plastisol Despegado">Plastisol Despegado</option>
                    <option value="Plastisol Mal Colocado">Plastisol Mal Colocado</option>
                    <option value="Manchado de Pigmento">Manchado de Pigmento</option>
                    <option value="Rayado de Material">Rayado de Material</option>
                    <option value="Burbuja Estructura">Burbuja Estructura</option>
                    <option value="Contaminación de Resina">Contaminación de Resina</option>
                    <option value="Defecto de Acabado">Defecto de Acabado</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 block font-bold text-indigo-400">Acción Correctiva Inmediata:</label>
                  <input type="text" required value={newAccion} onChange={(e) => setNewAccion(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-300 focus:outline-none font-sans text-xs" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 block font-bold">Observaciones Generales:</label>
                <textarea value={newObservaciones} onChange={(e) => setNewObservaciones(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-300 focus:outline-none font-sans h-14 resize-none" />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-840 border-slate-800">
                <button type="button" onClick={() => setIsFormOpen(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded font-bold cursor-pointer">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-550 text-white rounded font-bold cursor-pointer font-bold">Registrar</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

/* 9. Aduana View */
export interface AduanaLiberationRecord {
  id: string;
  fecha: string;
  cliente: string;
  oc: string;
  lote: string;
  tarjetaViajera: string;
  modelo: string;
  color: string;
  totalPares: number;
  desgloseTallas: Record<number, number>;
  pedidoCompleto: boolean;
  colorValidado: boolean;
  muestraValidada: boolean;
  responsable: string;
  jefeAduana: string;
  jefePreacabado: string;
  estatus: 'liberado' | 'pendiente' | 'bloqueado' | 'incompleto';
  observaciones: string;
  historial: { fecha: string; accion: string; usuario: string }[];
}

export const AduanaLiberacionView: React.FC = () => {
  const { currentTenant, addAuditLog } = useDashboard();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string>('');
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'refused' } | null>(null);

  const [records, setRecords] = useState<AduanaLiberationRecord[]>([]);

  useEffect(() => {
    setRecords([]);
    setSelectedRecordId('');
  }, [currentTenant.id]);

  const [formCliente, setFormCliente] = useState('');
  const [formOC, setFormOC] = useState('');
  const [formLote, setFormLote] = useState('');
  const [formTarjetaViajera, setFormTarjetaViajera] = useState('');
  const [formModelo, setFormModelo] = useState('');
  const [formColor, setFormColor] = useState('');
  const [formObservaciones, setFormObservaciones] = useState('');
  const [formResponsable, setFormResponsable] = useState('');
  const [formJefeAduana, setFormJefeAduana] = useState('Felipe Mendoza');
  const [formJefePreacabado, setFormJefePreacabado] = useState('Laura Medina');

  // Multi-size values inside "Nueva liberación" form
  const [qty22, setQty22] = useState(50);
  const [qty23, setQty23] = useState(50);
  const [qty24, setQty24] = useState(100);
  const [qty25, setQty25] = useState(100);
  const [qty26, setQty26] = useState(50);
  const [qty27, setQty27] = useState(50);
  const [qty28, setQty28] = useState(0);
  const [qty29, setQty29] = useState(0);

  // Validations inside form
  const [formPedidoCompleto, setFormPedidoCompleto] = useState(true);
  const [formColorValidado, setFormColorValidado] = useState(true);
  const [formMuestraValidada, setFormMuestraValidada] = useState(true);
  const [formValidationMsg, setFormValidationMsg] = useState<string | null>(null);

  // Filters State
  const [filtroFecha, setFiltroFecha] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroOC, setFiltroOC] = useState('');
  const [filtroLote, setFiltroLote] = useState('');
  const [filtroModelo, setFiltroModelo] = useState('');
  const [filtroColor, setFiltroColor] = useState('');
  const [filtroResponsable, setFiltroResponsable] = useState('');
  const [filtroEstatus, setFiltroEstatus] = useState('');
  const [filtroPedidoCompleto, setFiltroPedidoCompleto] = useState('');
  const [filtroColorValidado, setFiltroColorValidado] = useState('');
  const [filtroMuestraValidada, setFiltroMuestraValidada] = useState('');

  // Extract filter source candidates
  const listClientes = Array.from(new Set(records.map(r => r.cliente))).filter(Boolean);
  const listModelos = Array.from(new Set(records.map(r => r.modelo))).filter(Boolean);
  const listColores = Array.from(new Set(records.map(r => r.color))).filter(Boolean);
  const listResponsables = Array.from(new Set(records.map(r => r.responsable))).filter(Boolean);

  // Apply filters
  const filteredRecords = records.filter(item => {
    if (filtroFecha && item.fecha !== filtroFecha) return false;
    if (filtroCliente && item.cliente !== filtroCliente) return false;
    if (filtroOC && !item.oc.toLowerCase().includes(filtroOC.toLowerCase())) return false;
    if (filtroLote && !item.lote.toLowerCase().includes(filtroLote.toLowerCase())) return false;
    if (filtroModelo && item.modelo !== filtroModelo) return false;
    if (filtroColor && item.color !== filtroColor) return false;
    if (filtroResponsable && item.responsable !== filtroResponsable) return false;
    if (filtroEstatus && item.estatus !== filtroEstatus) return false;
    
    if (filtroPedidoCompleto === 'si' && !item.pedidoCompleto) return false;
    if (filtroPedidoCompleto === 'no' && item.pedidoCompleto) return false;
    
    if (filtroColorValidado === 'si' && !item.colorValidado) return false;
    if (filtroColorValidado === 'no' && item.colorValidado) return false;
    
    if (filtroMuestraValidada === 'si' && !item.muestraValidada) return false;
    if (filtroMuestraValidada === 'no' && item.muestraValidada) return false;

    return true;
  });

  const clearFilters = () => {
    setFiltroFecha('');
    setFiltroCliente('');
    setFiltroOC('');
    setFiltroLote('');
    setFiltroModelo('');
    setFiltroColor('');
    setFiltroResponsable('');
    setFiltroEstatus('');
    setFiltroPedidoCompleto('');
    setFiltroColorValidado('');
    setFiltroMuestraValidada('');
  };

  const selectedRecord = records.find(r => r.id === selectedRecordId) || records[0];

  // KPIs calculations
  const totalLotes = filteredRecords.length;
  const totalPares = filteredRecords.reduce((sum, r) => sum + r.totalPares, 0);
  const lotesLiberadosHoy = filteredRecords.filter(r => r.estatus === 'liberado' && r.fecha === '2026-05-25').length;
  const lotesPendientesVal = filteredRecords.filter(r => r.estatus === 'pendiente').length;
  const lotesBloqueados = filteredRecords.filter(r => r.estatus === 'bloqueado').length;
  
  // Custom static formula for standard audit cycle hours
  const promTiempoAduana = totalLotes > 0 ? Number((1.5 + (lotesPendientesVal * 0.4) + (lotesBloqueados * 1.1)).toFixed(1)) : 0;
  
  const pedidosCompletos = filteredRecords.filter(r => r.pedidoCompleto).length;
  const pedidosIncompletos = filteredRecords.filter(r => !r.pedidoCompleto).length;

  // Manual Creation submission
  const handleCreateLiberation = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Auto calculate total items
    const breakdown: Record<number, number> = {
      22: qty22,
      23: qty23,
      24: qty24,
      25: qty25,
      26: qty26,
      27: qty27,
      28: qty28,
      29: qty29
    };
    const totalCalcPares = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

    // Rule: Do not allow estatus Liberado if validation parameters are false
    if (!formPedidoCompleto || !formColorValidado || !formMuestraValidada) {
      setFormValidationMsg("⚠️ REGLA DE ADUANA INFRINGIDA: No se permite registrar una liberación en estatus 'Liberado' si el pedido está incompleto, el color no está aprobado, o la muestra no está físicamente validada.");
      return;
    }

    setFormValidationMsg(null);

    const newRec: AduanaLiberationRecord = {
      id: `ADU-LOT-${new Date().toISOString().replace(/[-:T]/g, '').slice(2, 8)}-${Math.floor(10 + Math.random() * 90)}`,
      fecha: '2026-05-25',
      cliente: formCliente,
      oc: formOC,
      lote: formLote,
      tarjetaViajera: formTarjetaViajera,
      modelo: formModelo,
      color: formColor,
      totalPares: totalCalcPares,
      desgloseTallas: breakdown,
      pedidoCompleto: formPedidoCompleto,
      colorValidado: formColorValidado,
      muestraValidada: formMuestraValidada,
      responsable: formResponsable,
      jefeAduana: formJefeAduana,
      jefePreacabado: formJefePreacabado,
      estatus: 'liberado',
      observaciones: formObservaciones,
      historial: [
        { fecha: '2026-05-25 18:57', accion: 'Registrado directamente y Liberado', usuario: formResponsable }
      ]
    };

    const nextRecords = [newRec, ...records];
    setRecords(nextRecords);
    setSelectedRecordId(newRec.id);
    setIsFormOpen(false);
    
    // Log audit event
    addAuditLog('QUALITY', 'REGISTER_ADUANA_LIBERATION', `Lote aduana registrado y liberado para Cliente: ${formCliente}, Lote: ${formLote}`);
    
    setFeedbackMessage({
      text: `Excelente. Lote ${formLote} registrado y liberado tras cumplir el 100% de controles analíticos.`,
      type: 'success'
    });
    setTimeout(() => setFeedbackMessage(null), 7000);
  };

  // Simulating Release Button from detailed panel
  const handleRelease = () => {
    if (!selectedRecord) return;

    // Strict validation conditions
    if (!selectedRecord.pedidoCompleto || !selectedRecord.colorValidado || !selectedRecord.muestraValidada) {
      const missingComponents = [];
      if (!selectedRecord.pedidoCompleto) missingComponents.push('Pedido Completo [NO]');
      if (!selectedRecord.colorValidado) missingComponents.push('Color Validado [NO]');
      if (!selectedRecord.muestraValidada) missingComponents.push('Muestra Física Validada [NO]');

      setFeedbackMessage({
        text: `Error de Aduana: No se puede liberar el lote ${selectedRecord.lote} porque contiene validaciones críticas no cumplidas: ${missingComponents.join(', ')}.`,
        type: 'refused'
      });
      addAuditLog('QUALITY', 'LIBERATION_REFUSED', `Intento fallido de liberar lote con faltantes: ${selectedRecord.id}`);
      return;
    }

    // Success action
    const nowStr = '2026-05-25 18:57';
    const updatedRecords = records.map(r => {
      if (r.id === selectedRecord.id) {
        return {
          ...r,
          estatus: 'liberado' as const,
          historial: [
            ...r.historial,
            { fecha: nowStr, accion: 'Liberación de Aduanas autorizada formalmente', usuario: currentTenant.name }
          ]
        };
      }
      return r;
    });

    setRecords(updatedRecords);
    addAuditLog('QUALITY', 'RELEASE_ADUANA_BATCH', `Lote ${selectedRecord.lote} liberado exitosamente hacia Logística`);
    setFeedbackMessage({
      text: `Lote ${selectedRecord.lote} liberado al 100% y enviado a embarques.`,
      type: 'success'
    });
    setTimeout(() => setFeedbackMessage(null), 5000);
  };

  // Simulating Block Button
  const handleBlock = () => {
    if (!selectedRecord) return;

    const nowStr = '2026-05-25 18:57';
    const updatedRecords = records.map(r => {
      if (r.id === selectedRecord.id) {
        return {
          ...r,
          estatus: 'bloqueado' as const,
          historial: [
            ...r.historial,
            { fecha: nowStr, accion: 'BLOQUEO PREVENTIVO: Lote retenido en Aduana', usuario: currentTenant.name }
          ]
        };
      }
      return r;
    });

    setRecords(updatedRecords);
    addAuditLog('QUALITY', 'BLOCK_ADUANA_BATCH', `Lote ${selectedRecord.lote} bloqueado en aduanas temporalmente`);
    setFeedbackMessage({
      text: `El lote ${selectedRecord.lote} ha sido marcado como BLOQUEADO temporalmente.`,
      type: 'success'
    });
    setTimeout(() => setFeedbackMessage(null), 5500);
  };

  // Solicitar corrección
  const handleCorrection = () => {
    if (!selectedRecord) return;

    const nowStr = '2026-05-25 18:57';
    const updatedRecords = records.map(r => {
      if (r.id === selectedRecord.id) {
        return {
          ...r,
          estatus: 'pendiente' as const,
          historial: [
            ...r.historial,
            { fecha: nowStr, accion: 'Solicitud formal de corrección a Banda/Preacabado', usuario: currentTenant.name }
          ]
        };
      }
      return r;
    });

    setRecords(updatedRecords);
    addAuditLog('QUALITY', 'REVISION_REQUESTED', `Corrección solicitada para Lote ${selectedRecord.lote}`);
    setFeedbackMessage({
      text: `Estado cambiado a Pendiente. Notificación de corrección enviada a preacabados.`,
      type: 'success'
    });
    setTimeout(() => setFeedbackMessage(null), 5500);
  };

  return (
    <div className="space-y-6">

      {/* HEADER SECTION */}
      <div id="adu_header_panel" className="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-xl flex justify-between items-center flex-wrap gap-4">
        <div>
          <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest font-bold block mb-1">
            MÓDULO DE ADUANA INDUSTRIAL DE PREACABADOS
          </span>
          <h2 className="text-xl font-black font-sans text-slate-100 uppercase tracking-tight leading-none mb-1 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
            Aduana / Liberación de Lotes
          </h2>
          <p className="text-xs text-slate-400 font-sans">
            Inspección formal de lotes de banda, habilitación de muestras maestras y validación de entregas completas.
          </p>
        </div>

        <div className="flex gap-2">
          <button 
            id="new_liberation_btn"
            onClick={() => {
              setFormValidationMsg(null);
              setIsFormOpen(true);
            }}
            className="flex items-center gap-1.5 px-4.5 py-2 bg-cyan-600 hover:bg-cyan-550 text-slate-950 text-xs font-mono font-black rounded-lg transition border border-cyan-400 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4 text-slate-950" />
            + Nueva liberación
          </button>
        </div>
      </div>

      {/* FEEDBACK POPUP MESSAGE SYSTEM */}
      {feedbackMessage && (
        <div id="adu_feedback_banner" className={`p-4 rounded-xl border flex items-start gap-3 transition-transform ${
          feedbackMessage.type === 'success' 
            ? 'bg-emerald-950/80 border-emerald-800 text-emerald-200 shadow-emerald-950/20 shadow-lg' 
            : 'bg-rose-950/80 border-rose-800 text-rose-200 shadow-rose-950/20 shadow-lg'
        }`}>
          <AlertCircle className={`w-5 h-5 flex-shrink-0 ${feedbackMessage.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`} />
          <div className="space-y-1">
            <h4 className="text-xs font-black font-mono uppercase tracking-wider">
              {feedbackMessage.type === 'success' ? 'Notificación de Aduana OK' : 'Control Aduanal Bloqueado'}
            </h4>
            <p className="text-xs font-sans leading-relaxed">{feedbackMessage.text}</p>
          </div>
        </div>
      )}

      {/* 2. KPIs METRICAS INTERMEDIAS */}
      <div id="adu_kpis_panel" className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <div className="p-3 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[9px] font-mono font-bold text-slate-500 uppercase block tracking-wider">Lotes en Aduana</span>
          <div className="text-lg font-bold font-mono text-cyan-400">{totalLotes}</div>
          <span className="text-[8px] font-mono text-slate-600 block">Inspección general</span>
        </div>

        <div className="p-3 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[9px] font-mono font-bold text-slate-500 uppercase block tracking-wider">Pares en aduana</span>
          <div className="text-lg font-bold font-mono text-slate-300">{totalPares.toLocaleString()}</div>
          <span className="text-[8px] font-mono text-slate-600 block">Inventario de transición</span>
        </div>

        <div className="p-3 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[9px] font-mono font-bold text-slate-500 uppercase block tracking-wider">Liberados hoy</span>
          <div className="text-lg font-bold font-mono text-emerald-400">{lotesLiberadosHoy}</div>
          <span className="text-[8px] font-mono text-slate-600 block">Aprobado logísticamente</span>
        </div>

        <div className="p-3 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[9px] font-mono font-bold text-slate-500 uppercase block tracking-wider">Pendientes de Val.</span>
          <div className="text-lg font-bold font-mono text-amber-400">{lotesPendientesVal}</div>
          <span className="text-[8px] font-mono text-slate-600 block">Muestreo en proceso</span>
        </div>

        <div className="p-3 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[9px] font-mono font-bold text-slate-500 uppercase block tracking-wider">Lotes bloqueados</span>
          <div className="text-lg font-bold font-mono text-red-500">{lotesBloqueados}</div>
          <span className="text-[8px] font-mono text-slate-600 block">Con burbuja u opacidad</span>
        </div>

        <div className="p-3 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[9px] font-mono font-bold text-slate-500 uppercase block tracking-wider">Avg horas en aduana</span>
          <div className="text-lg font-bold font-mono text-indigo-400">{promTiempoAduana} <span className="text-[10px] font-sans text-slate-600">hrs</span></div>
          <span className="text-[8px] font-mono text-slate-600 block">Ciclo de inspección avg</span>
        </div>

        <div className="p-3 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[9px] font-mono font-bold text-slate-500 uppercase block tracking-wider">Pedidos completos</span>
          <div className="text-lg font-bold font-mono text-emerald-400">{pedidosCompletos}</div>
          <span className="text-[8px] font-mono text-slate-600 block">Sin faltantes de inyección</span>
        </div>

        <div className="p-3 bg-slate-950 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[9px] font-mono font-bold text-slate-500 uppercase block tracking-wider">Pedidos incompletos</span>
          <div className="text-lg font-bold font-mono text-rose-400">{pedidosIncompletos}</div>
          <span className="text-[8px] font-mono text-slate-600 block">Espera a embarcar</span>
        </div>
      </div>

      {/* 2. CONSOLA DE FILTROS */}
      <div id="adu_filters_panel" className="bg-slate-950 border border-slate-900 rounded-xl p-4.5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-900 pb-2">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-mono text-slate-300 uppercase tracking-wider font-bold">Consola de Filtros de Aduana</span>
          </div>
          <button 
            onClick={clearFilters}
            className="text-[10px] bg-slate-900 hover:bg-slate-850 px-2.5 py-1 text-slate-400 hover:text-white border border-slate-800 rounded font-mono transition flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3 text-cyan-400" />
            Limpiar Filtros
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          <div className="space-y-1">
            <label className="text-[9px] uppercase font-mono font-bold text-slate-500 block">Fecha</label>
            <input type="date" value={filtroFecha} onChange={(e) => setFiltroFecha(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-250 focus:outline-none" />
          </div>

          <div className="space-y-1">
            <label className="text-[9px] uppercase font-mono font-bold text-slate-500 block">Cliente</label>
            <select value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-250 focus:outline-none">
              <option value="">-- Todos --</option>
              {listClientes.map((c, idx) => <option key={idx} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] uppercase font-mono font-bold text-slate-500 block">Orden de compra (OC)</label>
            <input type="text" placeholder="OC-xxxx..." value={filtroOC} onChange={(e) => setFiltroOC(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-205 focus:outline-none" />
          </div>

          <div className="space-y-1">
            <label className="text-[9px] uppercase font-mono font-bold text-slate-500 block">Lote de Banda</label>
            <input type="text" placeholder="Lote..." value={filtroLote} onChange={(e) => setFiltroLote(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-205 focus:outline-none" />
          </div>

          <div className="space-y-1">
            <label className="text-[9px] uppercase font-mono font-bold text-slate-500 block">Modelo</label>
            <select value={filtroModelo} onChange={(e) => setFiltroModelo(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-250 focus:outline-none">
              <option value="">-- Todos --</option>
              {listModelos.map((m, idx) => <option key={idx} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] uppercase font-mono font-bold text-slate-500 block">Color</label>
            <select value={filtroColor} onChange={(e) => setFiltroColor(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-250 focus:outline-none">
              <option value="">-- Todos --</option>
              {listColores.map((c, idx) => <option key={idx} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] uppercase font-mono font-bold text-slate-500 block">Responsable de Inspección</label>
            <select value={filtroResponsable} onChange={(e) => setFiltroResponsable(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-250 focus:outline-none">
              <option value="">-- Todos --</option>
              {listResponsables.map((r, idx) => <option key={idx} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] uppercase font-mono font-bold text-slate-500 block">Estatus de liberación</label>
            <select value={filtroEstatus} onChange={(e) => setFiltroEstatus(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-250 focus:outline-none">
              <option value="">-- Todos --</option>
              <option value="liberado">🟢 Liberado</option>
              <option value="pendiente">🟡 Pendiente Validación</option>
              <option value="bloqueado">🔴 Bloqueado</option>
              <option value="incompleto">⚪ Incompleto</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] uppercase font-mono font-bold text-slate-500 block">Pedido completo</label>
            <select value={filtroPedidoCompleto} onChange={(e) => setFiltroPedidoCompleto(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-250 focus:outline-none">
              <option value="">-- Todos --</option>
              <option value="si">Sí (Completado)</option>
              <option value="no">No (Parcial)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] uppercase font-mono font-bold text-slate-500 block">Color validado</label>
            <select value={filtroColorValidado} onChange={(e) => setFiltroColorValidado(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-250 focus:outline-none">
              <option value="">-- Todos --</option>
              <option value="si">Color Aprobado</option>
              <option value="no">Falta Validar</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] uppercase font-mono font-bold text-slate-500 block">Muestra validada</label>
            <select value={filtroMuestraValidada} onChange={(e) => setFiltroMuestraValidada(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-250 focus:outline-none">
              <option value="">-- Todos --</option>
              <option value="si">Muestra OK</option>
              <option value="no">Muestra desalineada</option>
            </select>
          </div>
        </div>
      </div>

      {/* CORE SPLIT SCREEN LAYOUT (TABLA DE LUZ & DETALLE DE CONTROL) */}
      <div id="aduana_core_grid" className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        
        {/* TABLA DE LIBERACIONES */}
        <div className="xl:col-span-8 bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-2xl space-y-4">
          <div className="flex justify-between items-center border-b border-slate-900 pb-3 flex-wrap gap-2">
            <div>
              <h3 className="text-xs font-black font-mono text-slate-200 uppercase tracking-widest flex items-center gap-1.5">
                <CheckSquare className="w-4 h-4 text-cyan-400" /> Bitácora de Inspección en Aduanas
              </h3>
              <p className="text-[9px] text-slate-500">Seleccione cualquier fila para abrir el panel técnico de detalle.</p>
            </div>
            <span className="text-[9px] text-indigo-400 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
              {filteredRecords.length} lotes listados
            </span>
          </div>

          <div className="overflow-x-auto w-full border border-slate-900 rounded-lg">
            <table className="w-full text-left border-collapse text-[11px] font-sans">
              <thead>
                <tr className="bg-slate-900/80 border-b border-slate-850 text-slate-400 font-mono text-[9px] uppercase tracking-wider">
                  <th className="py-2.5 px-3">Fecha</th>
                  <th className="py-2.5 px-3">Cliente</th>
                  <th className="py-2.5 px-3">OC</th>
                  <th className="py-2.5 px-3">Lote</th>
                  <th className="py-2.5 px-3 text-cyan-400">TV (Viajera)</th>
                  <th className="py-2.5 px-3">Modelo / Color</th>
                  <th className="py-2.5 px-3 text-right">Pares</th>
                  <th className="py-2.5 px-3 text-center">Controles (P / C / M)</th>
                  <th className="py-2.5 px-3 text-center">Resp.</th>
                  <th className="py-2.5 px-3 text-center">Estatus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-905">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-500 italic">
                      No se encontraron lotes para los filtros elegidos en el tenant {currentTenant.name}.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map(item => {
                    const isSelected = selectedRecord?.id === item.id;
                    return (
                      <tr 
                        key={item.id}
                        onClick={() => setSelectedRecordId(item.id)}
                        className={`hover:bg-slate-900 transition-colors cursor-pointer ${
                          isSelected ? 'bg-slate-900/90 border-l-2 border-cyan-400' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap font-mono">{item.fecha.split('-').slice(1).join('/')}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-200">{item.cliente}</td>
                        <td className="py-2.5 px-3 text-slate-400 font-mono">{item.oc}</td>
                        <td className="py-2.5 px-3 text-amber-500 font-bold font-mono">{item.lote}</td>
                        <td className="py-2.5 px-3 text-slate-400 font-mono">{item.tarjetaViajera}</td>
                        <td className="py-2.5 px-3">
                          <span className="text-slate-200 font-medium block">{item.modelo}</span>
                          <span className="text-slate-500 text-[10px]">{item.color}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-200">{item.totalPares}</td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex justify-center gap-1">
                            <span className={`px-1 rounded text-[8px] font-mono leading-tight ${item.pedidoCompleto ? 'bg-green-950 text-green-400 border border-green-900' : 'bg-red-950 text-red-500 border border-red-900'}`}>
                              P: {item.pedidoCompleto ? 'OK' : 'INC'}
                            </span>
                            <span className={`px-1 rounded text-[8px] font-mono leading-tight ${item.colorValidado ? 'bg-green-950 text-green-400 border border-green-900' : 'bg-red-950 text-red-500 border border-red-900'}`}>
                              C: {item.colorValidado ? 'OK' : 'INC'}
                            </span>
                            <span className={`px-1 rounded text-[8px] font-mono leading-tight ${item.muestraValidada ? 'bg-green-950 text-green-400 border border-green-900' : 'bg-red-950 text-red-500 border border-red-900'}`}>
                              M: {item.muestraValidada ? 'OK' : 'INC'}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-400 whitespace-nowrap">{item.responsable.split(' ')[0]}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-mono font-black border uppercase ${
                            item.estatus === 'liberado' ? 'bg-green-950 text-green-400 border-green-900' :
                            item.estatus === 'pendiente' ? 'bg-amber-950 text-amber-500 border-amber-900' :
                            item.estatus === 'bloqueado' ? 'bg-rose-950 text-rose-500 border-rose-900' :
                            'bg-slate-900 text-slate-400 border-slate-700'
                          }`}>
                            {item.estatus === 'liberado' && '🟢 Liberado'}
                            {item.estatus === 'pendiente' && '🟡 Pendiente'}
                            {item.estatus === 'bloqueado' && '🔴 Bloqueado'}
                            {item.estatus === 'incompleto' && '⚪ Incompleto'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* PANEL DE DETALLE */}
        <div id="adu_detail_panel" className="xl:col-span-4 bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-2xl space-y-4">
          <div className="border-b border-slate-900 pb-3">
            <h3 className="text-xs font-black font-mono text-slate-200 uppercase tracking-widest flex items-center gap-1.5">
              <FileCheck className="w-4 h-4 text-cyan-400" /> Hoja de Validación de Lote
            </h3>
            <p className="text-[10px] text-slate-550">Firmas analíticas y calibraciones físicas registradas.</p>
          </div>

          {selectedRecord ? (
            <div className="space-y-4">
              
              {/* Core Badge status */}
              <div className={`p-4 rounded-xl border flex items-center justify-between ${
                selectedRecord.estatus === 'liberado' ? 'bg-green-950/45 border-green-900' :
                selectedRecord.estatus === 'pendiente' ? 'bg-amber-950/45 border-amber-900' :
                selectedRecord.estatus === 'bloqueado' ? 'bg-rose-950/45 border-rose-900' :
                'bg-slate-900/50 border-slate-800'
              }`}>
                <div>
                  <span className="text-[9px] font-mono text-slate-500 uppercase block leading-none">Estatus de inspección</span>
                  <strong className={`font-mono text-xs uppercase ${
                    selectedRecord.estatus === 'liberado' ? 'text-green-400' :
                    selectedRecord.estatus === 'pendiente' ? 'text-amber-400' :
                    selectedRecord.estatus === 'bloqueado' ? 'text-red-400' :
                    'text-slate-355'
                  }`}>
                    {selectedRecord.estatus === 'liberado' && '🟢 Liberado a Embarques'}
                    {selectedRecord.estatus === 'pendiente' && '🟡 Pendiente Validación'}
                    {selectedRecord.estatus === 'bloqueado' && '🔴 Bloqueado con Alerta'}
                    {selectedRecord.estatus === 'incompleto' && '⚪ Incompleto en Banda'}
                  </strong>
                </div>

                <div className="flex gap-1">
                  <span className={`w-2.5 h-2.5 rounded-full ${selectedRecord.estatus === 'liberado' ? 'bg-green-400 shadow-green-500/50 animate-pulse' : 'bg-slate-700'}`}></span>
                  <span className={`w-2.5 h-2.5 rounded-full ${selectedRecord.estatus === 'pendiente' ? 'bg-amber-400 shadow-amber-500/50 animate-pulse' : 'bg-slate-705'}`}></span>
                  <span className={`w-2.5 h-2.5 rounded-full ${selectedRecord.estatus === 'bloqueado' ? 'bg-red-500 shadow-red-550/50 animate-pulse' : 'bg-slate-710'}`}></span>
                </div>
              </div>

              {/* Lote technical cards */}
              <div id="lote_technical_cards" className="bg-slate-900/60 border border-slate-850 p-4.5 rounded-xl space-y-2.5">
                <div className="grid grid-cols-2 gap-3 text-[11px] font-mono border-b border-slate-850 pb-2 text-slate-400">
                  <div>
                    <span>Cliente:</span>
                    <strong className="block text-slate-100 font-sans">{selectedRecord.cliente}</strong>
                  </div>
                  <div>
                    <span>Lote de Banda:</span>
                    <strong className="block text-amber-500">{selectedRecord.lote}</strong>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[11px] font-mono border-b border-slate-850 pb-2 text-slate-400">
                  <div>
                    <span>Órden de Compra:</span>
                    <strong className="block text-slate-300">{selectedRecord.oc}</strong>
                  </div>
                  <div>
                    <span>Tarjeta Viajera:</span>
                    <strong className="block text-cyan-400">{selectedRecord.tarjetaViajera}</strong>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[11px] font-mono text-slate-400">
                  <div>
                    <span>Modelo & Color:</span>
                    <strong className="block text-slate-100 font-sans">{selectedRecord.modelo} / {selectedRecord.color}</strong>
                  </div>
                  <div>
                    <span>Total Pares:</span>
                    <strong className="block text-lg text-slate-100">{selectedRecord.totalPares}</strong>
                  </div>
                </div>
              </div>

              {/* DESGLOSE POR TALLAS */}
              <div id="desglose_tallas_box border border-slate-850" className="space-y-1.5">
                <label className="text-[10px] uppercase font-mono font-bold text-slate-400 tracking-wider">Desglose por Talla (Suela EVA)</label>
                <div className="grid grid-cols-4 gap-1.5 text-center font-mono text-[11px]">
                  {Object.entries(selectedRecord.desgloseTallas).map(([talla, qty]) => (
                    <div key={talla} className="p-2 bg-slate-900 border border-slate-850 rounded">
                      <span className="text-[9px] text-slate-500 block">Talla {talla}</span>
                      <strong className={Number(qty) > 0 ? "text-slate-100" : "text-slate-700"}>{qty || 0} prs</strong>
                    </div>
                  ))}
                </div>
              </div>

              {/* SEMAFORIZACION DE VALIDACIONES */}
              <div id="semaphorization_validations_section" className="space-y-2">
                <label className="text-[10px] uppercase font-mono font-bold text-slate-400 tracking-wider">Estatus de Validaciones Técnicas</label>
                <div className="space-y-2">
                  <div className={`p-3 rounded-lg border flex items-center justify-between text-xs font-mono ${
                    selectedRecord.pedidoCompleto ? 'bg-green-950/20 border-green-900 text-green-300' : 'bg-red-950/20 border-red-900 text-red-400'
                  }`}>
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${selectedRecord.pedidoCompleto ? 'bg-green-400' : 'bg-red-500'}`}></span>
                      Pedido completo según OC
                    </span>
                    <strong>{selectedRecord.pedidoCompleto ? 'SÍ (100% pares)' : 'NO (Parcial-Incompleto)'}</strong>
                  </div>

                  <div className={`p-3 rounded-lg border flex items-center justify-between text-xs font-mono ${
                    selectedRecord.colorValidado ? 'bg-green-950/20 border-green-900 text-green-300' : 'bg-red-950/20 border-red-900 text-red-400'
                  }`}>
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${selectedRecord.colorValidado ? 'bg-green-400' : 'bg-red-500'}`}></span>
                      Color validado en Laboratorio
                    </span>
                    <strong>{selectedRecord.colorValidado ? 'SÍ (Aprobado)' : 'NO (Falta Muestra)'}</strong>
                  </div>

                  <div className={`p-3 rounded-lg border flex items-center justify-between text-xs font-mono ${
                    selectedRecord.muestraValidada ? 'bg-green-950/20 border-green-900 text-green-300' : 'bg-red-950/20 border-red-900 text-red-400'
                  }`}>
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${selectedRecord.muestraValidada ? 'bg-green-400' : 'bg-red-500'}`}></span>
                      Muestra física validada en Mesa
                    </span>
                    <strong>{selectedRecord.muestraValidada ? 'SÍ (Aprobada)' : 'NO (Burbujas/Falta)'}</strong>
                  </div>
                </div>

                {/* ADUANA REGLA WARNING */}
                {(!selectedRecord.pedidoCompleto || !selectedRecord.colorValidado || !selectedRecord.muestraValidada) && (
                  <div className="p-3 bg-red-950/40 border border-red-900 rounded-lg text-red-400 text-[10px] leading-relaxed font-mono">
                    ⚠️ BLOQUEO DE FLUJO: Este lote no puede ser habilitado en estatus 'Liberado' debido a que viola las salvaguardas de Aduana de Preacabados. Complete los tres controles técnicos antes de presionar "Liberar".
                  </div>
                )}
              </div>

              {/* RESPONSABLES FIRMAS */}
              <div className="bg-slate-900 border border-slate-850 p-3 rounded-lg space-y-1 text-xs">
                <span className="text-[10px] font-mono text-slate-500 uppercase block tracking-wider">Firmas Autorizadas</span>
                <div className="space-y-1 text-slate-300 font-mono text-[11px]">
                  <div className="flex justify-between border-b border-slate-850/50 pb-1">
                    <span>Inspector Calidad:</span> <strong className="text-slate-100">{selectedRecord.responsable}</strong>
                  </div>
                  <div className="flex justify-between border-b border-slate-850/50 pb-1">
                    <span>Jefe de Aduana:</span> <strong className="text-slate-100">{selectedRecord.jefeAduana}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Jefe Preacabado:</span> <strong className="text-slate-100">{selectedRecord.jefePreacabado}</strong>
                  </div>
                </div>
              </div>

              {/* OBSERVACIONES */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono text-slate-500 uppercase block tracking-wider">Bitácora de Observaciones</span>
                <div className="p-3 bg-slate-900 border border-slate-850 rounded text-xs text-slate-250 italic leading-relaxed">
                  "{selectedRecord.observaciones || 'Sin observaciones técnicas registradas en este turno.'}"
                </div>
              </div>

              {/* HISTORIAL ANALÍTICO */}
              <div className="space-y-2">
                <span className="text-[10px] tracking-wider uppercase font-mono font-bold text-slate-400 block">Bitácora de Movimiento Temporal</span>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {selectedRecord.historial?.map((h, i) => (
                    <div key={i} className="p-2 bg-slate-900/50 border border-slate-905 rounded text-[10px] font-mono text-slate-400 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-cyan-400 font-bold">{h.accion}</span>
                        <span className="text-[8px] text-slate-600">{h.fecha}</span>
                      </div>
                      <div className="text-[9px] text-slate-500">Operador: {h.usuario}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* BOTTOM OPERATIONS ACTIONS SIMULATOR */}
              <div className="pt-3 border-t border-slate-900 grid grid-cols-3 gap-2">
                <button
                  id="release_batch_action_btn"
                  onClick={handleRelease}
                  className="px-2 py-2 bg-emerald-600 hover:bg-emerald-555 text-emerald-950 font-mono font-extrabold text-[10px] uppercase rounded-lg transition border border-emerald-500 cursor-pointer text-center"
                  title="Sólo permitido si las 3 validaciones técnicas están completadas"
                >
                  🟢 Liberar Lote
                </button>

                <button
                  id="block_batch_action_btn"
                  onClick={handleBlock}
                  className="px-2 py-2 bg-red-650 hover:bg-red-600 text-white font-mono font-black text-[10px] uppercase rounded-lg transition border border-red-500 cursor-pointer text-center"
                >
                  🔴 Bloquear
                </button>

                <button
                  id="correct_batch_action_btn"
                  onClick={handleCorrection}
                  className="px-2 py-2 bg-amber-500 hover:bg-amber-450 text-slate-950 font-mono font-black text-[10px] uppercase rounded-lg transition border border-amber-400 cursor-pointer text-center"
                >
                  🟡 Regresar
                </button>
              </div>

            </div>
          ) : (
            <p className="text-xs text-slate-500 italic text-center p-6 border border-slate-900 border-dashed rounded-xl">
              Seleccione un lote para auditar sus muestras, firmas y controles.
            </p>
          )}
        </div>
      </div>

      {/* 6. MODAL FORMULARIO SIMULADO DE NUEVA LIBERACIÓN */}
      {isFormOpen && (
        <div id="adu_new_lib_modal" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-xs font-black font-mono text-cyan-400 uppercase tracking-widest leading-none">
                  + REGISTRAR EN ADUANA - CALIDAD INTERMEDIA
                </h3>
                <p className="text-[10px] text-slate-500 font-sans mt-0.5">La liberación requiere el cumplimiento estricto de las 3 marcas de validación.</p>
              </div>
              <button 
                onClick={() => setIsFormOpen(false)}
                className="text-slate-500 hover:text-white font-mono text-xs cursor-pointer border border-slate-800 px-2 py-0.5 rounded hover:bg-slate-850"
              >
                Cerrar ✕
              </button>
            </div>

            {formValidationMsg && (
              <div className="p-3 bg-red-950/70 border border-red-900 rounded-lg text-red-300 font-mono text-[10px] leading-relaxed">
                {formValidationMsg}
              </div>
            )}

            <form onSubmit={handleCreateLiberation} className="space-y-4 text-xs">
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-400 block font-bold">Cliente Receptor</label>
                  <select 
                    value={formCliente} 
                    onChange={(e) => setFormCliente(e.target.value)} 
                    className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-slate-200 focus:outline-none"
                  >
                    <option value="">Pendiente OCR</option>
                    {listClientes.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-400 block font-bold">Orden de compra (OC)</label>
                  <input 
                    type="text" 
                    value={formOC} 
                    onChange={(e) => setFormOC(e.target.value)} 
                    className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-slate-200 focus:outline-none" 
                    required 
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-400 block font-bold">Lote asignado</label>
                  <input 
                    type="text" 
                    value={formLote} 
                    onChange={(e) => setFormLote(e.target.value)} 
                    className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-400" 
                    required 
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-400 block font-bold">Tarjeta viajera (TV)</label>
                  <input 
                    type="text" 
                    value={formTarjetaViajera} 
                    onChange={(e) => setFormTarjetaViajera(e.target.value)} 
                    className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-slate-200 focus:outline-none" 
                    required 
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-400 block font-bold">Modelo</label>
                  <select 
                    value={formModelo} 
                    onChange={(e) => setFormModelo(e.target.value)} 
                    className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-slate-200 focus:outline-none"
                  >
                    <option value="">Pendiente OCR</option>
                    {listModelos.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-400 block font-bold">Color soplado</label>
                  <select 
                    value={formColor} 
                    onChange={(e) => setFormColor(e.target.value)} 
                    className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-slate-200 focus:outline-none"
                  >
                    <option value="">Pendiente OCR</option>
                    {listColores.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* TALLAS Y CANTIDADES */}
              <div className="space-y-2 p-3 bg-slate-950 border border-slate-850 rounded-lg">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block font-bold">
                  Inspección de Cantidades físicas por Talla (EVA):
                </span>
                <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                  <div className="space-y-1 text-center font-mono">
                    <label className="text-[9px] text-slate-500 block">T22</label>
                    <input type="number" min="0" value={qty22} onChange={(e) => setQty22(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-800 rounded p-1 text-xs text-center text-slate-100 focus:outline-none" />
                  </div>
                  <div className="space-y-1 text-center font-mono">
                    <label className="text-[9px] text-slate-500 block">T23</label>
                    <input type="number" min="0" value={qty23} onChange={(e) => setQty23(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-800 rounded p-1 text-xs text-center text-slate-100 focus:outline-none" />
                  </div>
                  <div className="space-y-1 text-center font-mono">
                    <label className="text-[9px] text-slate-500 block">T24</label>
                    <input type="number" min="0" value={qty24} onChange={(e) => setQty24(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-800 rounded p-1 text-xs text-center text-slate-100 focus:outline-none" />
                  </div>
                  <div className="space-y-1 text-center font-mono">
                    <label className="text-[9px] text-slate-500 block">T25</label>
                    <input type="number" min="0" value={qty25} onChange={(e) => setQty25(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-800 rounded p-1 text-xs text-center text-slate-100 focus:outline-none" />
                  </div>
                  <div className="space-y-1 text-center font-mono">
                    <label className="text-[9px] text-slate-500 block">T26</label>
                    <input type="number" min="0" value={qty26} onChange={(e) => setQty26(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-800 rounded p-1 text-xs text-center text-slate-100 focus:outline-none" />
                  </div>
                  <div className="space-y-1 text-center font-mono">
                    <label className="text-[9px] text-slate-500 block">T27</label>
                    <input type="number" min="0" value={qty27} onChange={(e) => setQty27(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-800 rounded p-1 text-xs text-center text-slate-100 focus:outline-none" />
                  </div>
                  <div className="space-y-1 text-center font-mono">
                    <label className="text-[9px] text-slate-500 block">T28</label>
                    <input type="number" min="0" value={qty28} onChange={(e) => setQty28(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-800 rounded p-1 text-xs text-center text-slate-100 focus:outline-none" />
                  </div>
                  <div className="space-y-1 text-center font-mono">
                    <label className="text-[9px] text-slate-500 block">T29</label>
                    <input type="number" min="0" value={qty29} onChange={(e) => setQty29(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-800 rounded p-1 text-xs text-center text-slate-100 focus:outline-none" />
                  </div>
                </div>
                <div className="text-right text-[10px] text-slate-400 font-mono pt-1">
                  Total Pares Autocalculado: <strong className="text-cyan-400 text-xs">{qty22 + qty23 + qty24 + qty25 + qty26 + qty27 + qty28 + qty29} prs</strong>
                </div>
              </div>

              {/* CHECKBOXES DE VALIDACIÓN DE ADUANA (REGLAS DE SALIDA) */}
              <div className="space-y-2 p-3 bg-slate-950 border border-slate-850 rounded-lg">
                <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider block font-bold">
                  Checks Analíticos del Laboratorio de Preacabados
                </span>
                
                <div className="space-y-2 text-xs font-mono">
                  <label className="flex items-center gap-2.5 cursor-pointer text-slate-200">
                    <input 
                      type="checkbox" 
                      checked={formPedidoCompleto} 
                      onChange={(e) => setFormPedidoCompleto(e.target.checked)} 
                      className="w-4 h-4 text-cyan-500 bg-slate-900 border-slate-850 rounded focus:ring-0 cursor-pointer"
                    />
                    <span>¿Pedido completo de inyección? (Sin faltantes de tallaje)</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer text-slate-200">
                    <input 
                      type="checkbox" 
                      checked={formColorValidado} 
                      onChange={(e) => setFormColorValidado(e.target.checked)} 
                      className="w-4 h-4 text-cyan-500 bg-slate-900 border-slate-850 rounded focus:ring-0 cursor-pointer"
                    />
                    <span>¿Pigmento validado con reflectómetro de color?</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer text-slate-200">
                    <input 
                      type="checkbox" 
                      checked={formMuestraValidada} 
                      onChange={(e) => setFormMuestraValidada(e.target.checked)} 
                      className="w-4 h-4 text-cyan-500 bg-slate-900 border-slate-850 rounded focus:ring-0 cursor-pointer"
                    />
                    <span>¿Muestra física analizada y validada sin burbujas/poros?</span>
                  </label>
                </div>
              </div>

              {/* RESPONSABLES FIRMAS */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-400 block">Inspector Firmante</label>
                  <input type="text" value={formResponsable} onChange={(e) => setFormResponsable(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-200 focus:outline-none" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-400 block">Jefe de Aduana</label>
                  <input type="text" value={formJefeAduana} onChange={(e) => setFormJefeAduana(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-200 focus:outline-none" required />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-mono text-slate-400 block">Jefe de Preacabado</label>
                  <input type="text" value={formJefePreacabado} onChange={(e) => setFormJefePreacabado(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-200 focus:outline-none" required />
                </div>
              </div>

              {/* OBSERVACIONES */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-mono text-slate-400 block font-bold">Observaciones técnicas de trazabilidad</label>
                <textarea 
                  value={formObservaciones} 
                  onChange={(e) => setFormObservaciones(e.target.value)} 
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-205 focus:outline-none font-sans" 
                  rows={2} 
                />
              </div>

              {/* FORM ACTIONS */}
              <div className="pt-3 border-t border-slate-800 flex justify-end gap-3 font-mono">
                <button 
                  type="button" 
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2 text-xs bg-cyan-600 hover:bg-cyan-550 text-slate-950 font-black rounded cursor-pointer"
                >
                  ✓ Confirmar y Liberar Lote
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};


/* 10. Embarque View */
export interface EmbarqueRecord {
  id: string;
  fecha: string;
  cliente: string;
  oc: string;
  pedido: string;
  lote: string;
  modelo: string;
  color: string;
  totalParesPedido: number;
  paresListos: number;
  paresEmbarcados: number;
  paresPendientes: number;
  fechaCompromiso: string;
  fechaEmbarque?: string;
  estatus: 'Listo para embarque' | 'Embarque parcial' | 'Embarcado completo' | 'Pendiente' | 'Vencido';
  responsable: string;
  observaciones: string;
  historial: { fecha: string; accion: string; usuario: string }[];
}

export const EmbarqueView: React.FC = () => {
  const { currentTenant, addAuditLog } = useDashboard();
  const [selectedPedidoId, setSelectedPedidoId] = useState<string>('');
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'info' } | null>(null);

  // Partial shipping flow input state
  const [partialShipAmount, setPartialShipAmount] = useState<number>(50);
  const [partialShipError, setPartialShipError] = useState<string | null>(null);

  const [records, setRecords] = useState<EmbarqueRecord[]>([]);

  useEffect(() => {
    setRecords([]);
    setSelectedPedidoId('');
  }, [currentTenant.id]);

  // Filters state
  const [filtroFecha, setFiltroFecha] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroOC, setFiltroOC] = useState('');
  const [filtroPedido, setFiltroPedido] = useState('');
  const [filtroLote, setFiltroLote] = useState('');
  const [filtroModelo, setFiltroModelo] = useState('');
  const [filtroColor, setFiltroColor] = useState('');
  const [filtroEstatus, setFiltroEstatus] = useState('');
  const [filtroFechaCompromiso, setFiltroFechaCompromiso] = useState('');
  const [filtroResponsable, setFiltroResponsable] = useState('');

  // Extract filter source candidates
  const listClientes = Array.from(new Set(records.map(r => r.cliente))).filter(Boolean) as string[];
  const listModelos = Array.from(new Set(records.map(r => r.modelo))).filter(Boolean) as string[];
  const listColores = Array.from(new Set(records.map(r => r.color))).filter(Boolean) as string[];
  const listResponsables = Array.from(new Set(records.map(r => r.responsable))).filter(Boolean) as string[];

  // Apply filters to records list
  const filteredRecords = records.filter(item => {
    if (filtroFecha && item.fecha !== filtroFecha) return false;
    if (filtroCliente && item.cliente !== filtroCliente) return false;
    if (filtroOC && !item.oc.toLowerCase().includes(filtroOC.toLowerCase())) return false;
    if (filtroPedido && !item.pedido.toLowerCase().includes(filtroPedido.toLowerCase())) return false;
    if (filtroLote && !item.lote.toLowerCase().includes(filtroLote.toLowerCase())) return false;
    if (filtroModelo && item.modelo !== filtroModelo) return false;
    if (filtroColor && item.color !== filtroColor) return false;
    if (filtroEstatus && item.estatus !== filtroEstatus) return false;
    if (filtroFechaCompromiso && item.fechaCompromiso !== filtroFechaCompromiso) return false;
    if (filtroResponsable && item.responsable !== filtroResponsable) return false;
    return true;
  });

  const selectedRecord = records.find(r => r.id === selectedPedidoId) || records[0];

  const clearFilters = () => {
    setFiltroFecha('');
    setFiltroCliente('');
    setFiltroOC('');
    setFiltroPedido('');
    setFiltroLote('');
    setFiltroModelo('');
    setFiltroColor('');
    setFiltroEstatus('');
    setFiltroFechaCompromiso('');
    setFiltroResponsable('');
  };

  // KPIs calculations
  // Pares listos para embarque (pares terminados but not yet fully shipped)
  const totalParesListosParaEmbarque = filteredRecords.reduce((sum, r) => sum + Math.max(0, r.paresListos - r.paresEmbarcados), 0);
  
  // Pares embarcados hoy (pares embarcados on index day '2026-05-25')
  const totalParesEmbarcadosHoy = filteredRecords.reduce((sum, r) => {
    return sum + (r.fechaEmbarque === '2026-05-25' ? r.paresEmbarcados : 0);
  }, 0);

  const countCompletos = filteredRecords.filter(r => r.estatus === 'Embarcado completo').length;
  const countParciales = filteredRecords.filter(r => r.estatus === 'Embarque parcial').length;
  const countPendientes = filteredRecords.filter(r => r.estatus === 'Pendiente').length;
  const countVencidos = filteredRecords.filter(r => r.estatus === 'Vencido').length;

  // Delivery commitment %
  const totalShippedAndReady = countCompletos + countParciales;
  const compliancePercentage = filteredRecords.length > 0 
    ? Number(((countCompletos * 100) / (countCompletos + countVencidos || 1)).toFixed(1)) 
    : 100.0;
  
  const avgCloseTimeHours = 12.8; // Standarized KPI metric for logging closing cycle

  const handleMarkAsShipped = () => {
    if (!selectedRecord) return;
    const nowStr = '2026-05-25 19:01';
    
    const updated = records.map(r => {
      if (r.id === selectedRecord.id) {
        return {
          ...r,
          paresEmbarcados: r.totalParesPedido,
          paresPendientes: 0,
          estatus: 'Embarcado completo' as const,
          fechaEmbarque: '2026-05-25',
          historial: [
            ...r.historial,
            { fecha: nowStr, accion: 'Embarque total completado y registrado', usuario: 'Jorge Ruiz (Logística)' }
          ]
        };
      }
      return r;
    });

    setRecords(updated);
    addAuditLog('QUALITY', 'COMPLETE_SHIPMENT_DISPATCH', `Pedido: ${selectedRecord.pedido}, Lote: ${selectedRecord.lote} marcado como Embarcado completo`);
    
    setFeedbackMessage({
      text: `Pedido ${selectedRecord.pedido} despachado al 100%. Se emitió el manifiesto de carga digital.`,
      type: 'success'
    });
    setTimeout(() => setFeedbackMessage(null), 5000);
  };

  const handleRegisterPartialShipment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord) return;
    setPartialShipError(null);

    const amount = Number(partialShipAmount);
    if (!amount || amount <= 0) {
      setPartialShipError('El número de pares debe ser mayor a cero.');
      return;
    }

    const availablePares = selectedRecord.totalParesPedido - selectedRecord.paresEmbarcados;
    if (amount > availablePares) {
      setPartialShipError(`No se puede embarcar más de lo pendiente (${availablePares} pares).`);
      return;
    }

    const nowStr = '2026-05-25 19:01';
    const nextEmbarcados = selectedRecord.paresEmbarcados + amount;
    const nextPendientes = selectedRecord.totalParesPedido - nextEmbarcados;
    const isCompleted = nextPendientes === 0;

    const updated = records.map(r => {
      if (r.id === selectedRecord.id) {
        return {
          ...r,
          paresEmbarcados: nextEmbarcados,
          paresPendientes: nextPendientes,
          estatus: (isCompleted ? 'Embarcado completo' : 'Embarque parcial') as any,
          fechaEmbarque: '2026-05-25',
          historial: [
            ...r.historial,
            { fecha: nowStr, accion: `Despacho parcial registrado de: ${amount} pares`, usuario: 'Clara S. (Embarques)' }
          ]
        };
      }
      return r;
    });

    setRecords(updated);
    addAuditLog('QUALITY', 'PARTIAL_SHIPMENT_DISPATCH', `Despacho parcial de ${amount} pares en pedido ${selectedRecord.pedido}`);

    setFeedbackMessage({
      text: `Embarque parcial de ${amount} pares registrado para el Pedido ${selectedRecord.pedido}.`,
      type: 'info'
    });
    setPartialShipAmount(50);
    setTimeout(() => setFeedbackMessage(null), 5000);
  };

  // GRAPH DATA GATHERING
 
  // 1. Embarques por día (pares embarcados by date)
  const uniqueFechasCompromiso = Array.from(new Set(records.map(r => r.fechaCompromiso))).sort() as string[];
  const embarquesDiaChartData = uniqueFechasCompromiso.map(f => {
    const pares = records.filter(r => r.fechaCompromiso === f).reduce((sum, r) => sum + r.paresEmbarcados, 0);
    return {
      fecha: f.split('-').slice(1).join('/'),
      pares: pares
    };
  });

  // 2. Pedidos completos vs parciales (KPI comparing amounts)
  const completosVsParcialesData = [
    { name: 'Completos', cantidad: countCompletos },
    { name: 'Parciales', cantidad: countParciales },
    { name: 'Pendientes', cantidad: countPendientes }
  ];

  // 3. Cumplimiento por cliente (Percentage of orders marked as Shipped Complete / total orders for that client)
  const cumplimientoClienteData = listClientes.map(cli => {
    const totalCli = records.filter(r => r.cliente === cli).length;
    const compCli = records.filter(r => r.cliente === cli && r.estatus === 'Embarcado completo').length;
    const rate = totalCli > 0 ? Math.round((compCli / totalCli) * 100) : 100;
    return {
      cliente: cli,
      porcentaje: rate
    };
  });

  // 4. Pares embarcados por modelo
  const paresEmbarcadosModeloData = listModelos.map(m => {
    const sumPares = records.filter(r => r.modelo === m).reduce((sum, r) => sum + r.paresEmbarcados, 0);
    return {
      modelo: m,
      pares: sumPares
    };
  });

  // 5. Backlog pendiente de embarque (Remaining pairs by Client)
  const backlogPendienteClienteData = listClientes.map(cli => {
    const sumPend = records.filter(r => r.cliente === cli).reduce((sum, r) => sum + r.paresPendientes, 0);
    return {
      cliente: cli.split(' ')[0],
      pares: sumPend
    };
  });

  return (
    <div className="space-y-6">

      {/* HEADER BAR */}
      <div id="emb_header_panel" className="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-xl flex justify-between items-center flex-wrap gap-4">
        <div>
          <span className="text-[10px] font-mono text-indigo-400 uppercase tracking-widest font-bold block mb-1">
            MÓDULO DE EMBARQUE & LOGÍSTICA DE SALIDA
          </span>
          <h2 className="text-xl font-black font-sans text-slate-100 uppercase tracking-tight leading-none mb-1 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Embarques y Manifiestos
          </h2>
          <p className="text-xs text-slate-400 font-sans">
            Despachos, seguimiento de fecha compromiso, control de pares listos, embarques parciales y conformidad de cliente.
          </p>
        </div>

        <div className="flex gap-2">
          <button 
            id="print_manifest_btn"
            onClick={() => {
              addAuditLog('QUALITY', 'PRINT_SHIPPING_MANIFEST', `Impresión de manifiesto para lote ${selectedRecord?.lote || 'Global'}`);
              alert(`🖨️ Generando manifiesto físico de aduanas y guía de transportista para Lote: ${selectedRecord?.lote || 'General'}`);
            }}
            className="flex items-center gap-1.5 px-4.5 py-2 bg-emerald-600 hover:bg-emerald-555 text-slate-950 text-xs font-mono font-black rounded-lg transition border border-emerald-400 cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-950" />
            Imprimir Manifiesto ACT
          </button>
        </div>
      </div>

      {/* FEEDBACK POPUP */}
      {feedbackMessage && (
        <div id="emb_feedback_banner" className={`p-4 rounded-xl border flex items-start gap-3 transition-transform ${
          feedbackMessage.type === 'success' 
            ? 'bg-emerald-950/80 border-emerald-800 text-emerald-200 shadow-emerald-950/20 shadow-lg' 
            : 'bg-indigo-950/80 border-indigo-800 text-indigo-200 shadow-indigo-950/20 shadow-lg'
        }`}>
          <ShieldCheck className={`w-5 h-5 flex-shrink-0 ${feedbackMessage.type === 'success' ? 'text-emerald-400' : 'text-indigo-400'}`} />
          <div className="space-y-1">
            <h4 className="text-xs font-black font-mono uppercase tracking-wider">
              {feedbackMessage.type === 'success' ? 'OPERACIÓN COMPLETADA CON ÉXITO' : 'LOGÍSTICA INFORMATIVA'}
            </h4>
            <p className="text-xs font-sans leading-relaxed">{feedbackMessage.text}</p>
          </div>
        </div>
      )}

      {/* 2. KPIs SECTION */}
      <div id="emb_kpis_panel" className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <div className="p-3 bg-slate-955 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[9px] font-mono font-bold text-slate-500 uppercase block tracking-wider">Pares Listos</span>
          <div className="text-lg font-bold font-mono text-cyan-400">{totalParesListosParaEmbarque.toLocaleString()}</div>
          <span className="text-[8px] font-mono text-slate-600 block">Espera a cargar</span>
        </div>

        <div className="p-3 bg-slate-955 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[9px] font-mono font-bold text-slate-500 uppercase block tracking-wider">Embarcado Hoy</span>
          <div className="text-lg font-bold font-mono text-emerald-400">{totalParesEmbarcadosHoy.toLocaleString()}</div>
          <span className="text-[8px] font-mono text-slate-600 block">Egresados planta</span>
        </div>

        <div className="p-3 bg-slate-955 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[9px] font-mono font-bold text-slate-500 uppercase block tracking-wider font-semibold">Completo</span>
          <div className="text-lg font-bold font-mono text-emerald-500">{countCompletos}</div>
          <span className="text-[8px] font-mono text-slate-600 block">Entregas totales</span>
        </div>

        <div className="p-3 bg-slate-955 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[9px] font-mono font-bold text-slate-500 uppercase block tracking-wider">Parciales</span>
          <div className="text-lg font-bold font-mono text-amber-400">{countParciales}</div>
          <span className="text-[8px] font-mono text-slate-600 block">Con remanentes</span>
        </div>

        <div className="p-3 bg-slate-955 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[9px] font-mono font-bold text-slate-500 uppercase block tracking-wider">Pendientes</span>
          <div className="text-lg font-bold font-mono text-slate-300">{countPendientes}</div>
          <span className="text-[8px] font-mono text-slate-600 block">Faltan de Aduana</span>
        </div>

        <div className="p-3 bg-slate-955 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[9px] font-mono font-bold text-slate-500 uppercase block tracking-wider">Vencidos</span>
          <div className="text-lg font-bold font-mono text-rose-500">{countVencidos}</div>
          <span className="text-[8px] font-mono text-slate-600 block">Expiró fecha lte</span>
        </div>

        <div className="p-3 bg-slate-955 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[9px] font-mono font-bold text-slate-500 uppercase block tracking-wider">Cumplimiento</span>
          <div className="text-lg font-bold font-mono text-green-400">{compliancePercentage}%</div>
          <span className="text-[8px] font-mono text-slate-600 block">OTIF rating</span>
        </div>

        <div className="p-3 bg-slate-955 border border-slate-900 rounded-xl space-y-1 shadow-md">
          <span className="text-[9px] font-mono font-bold text-slate-500 uppercase block tracking-wider">Avg Cierre</span>
          <div className="text-lg font-bold font-mono text-indigo-400">{avgCloseTimeHours} hrs</div>
          <span className="text-[8px] font-mono text-slate-600 block">Cruce de aduana</span>
        </div>
      </div>

      {/* 3. FILTROS ROW */}
      <div id="emb_filters_panel" className="bg-slate-950 border border-slate-900 rounded-xl p-4.5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-900 pb-2">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-mono text-slate-300 uppercase tracking-wider font-bold">Filtros de Logística & Distribución</span>
          </div>
          <button 
            onClick={clearFilters}
            className="text-[10px] bg-slate-900 hover:bg-slate-850 px-2.5 py-1 text-slate-400 hover:text-white border border-slate-800 rounded font-mono transition flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3 text-emerald-400" />
            Limpiar Filtros
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 xl:grid-cols-10 gap-3">
          <div className="space-y-1">
            <label className="text-[9px] uppercase font-mono font-bold text-slate-500 block">Fecha</label>
            <input type="date" value={filtroFecha} onChange={(e) => setFiltroFecha(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-250 focus:outline-none" />
          </div>

          <div className="space-y-1">
            <label className="text-[9px] uppercase font-mono font-bold text-slate-500 block">Cliente</label>
            <select value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-250 focus:outline-none">
              <option value="">-- Todos --</option>
              {listClientes.map((c, idx) => <option key={idx} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] uppercase font-mono font-bold text-slate-500 block">OC</label>
            <input type="text" placeholder="OC-xxxx..." value={filtroOC} onChange={(e) => setFiltroOC(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-205 focus:outline-none" />
          </div>

          <div className="space-y-1">
            <label className="text-[9px] uppercase font-mono font-bold text-slate-500 block">Pedido</label>
            <input type="text" placeholder="PED-xxxx..." value={filtroPedido} onChange={(e) => setFiltroPedido(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-205 focus:outline-none" />
          </div>

          <div className="space-y-1">
            <label className="text-[9px] uppercase font-mono font-bold text-slate-500 block">Lote</label>
            <input type="text" placeholder="LOT-BND..." value={filtroLote} onChange={(e) => setFiltroLote(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-205 focus:outline-none" />
          </div>

          <div className="space-y-1">
            <label className="text-[9px] uppercase font-mono font-bold text-slate-500 block">Modelo</label>
            <select value={filtroModelo} onChange={(e) => setFiltroModelo(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-250 focus:outline-none">
              <option value="">-- Todos --</option>
              {listModelos.map((m, idx) => <option key={idx} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] uppercase font-mono font-bold text-slate-500 block">Color</label>
            <select value={filtroColor} onChange={(e) => setFiltroColor(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-250 focus:outline-none">
              <option value="">-- Todos --</option>
              {listColores.map((c, idx) => <option key={idx} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] uppercase font-mono font-bold text-slate-500 block">Estatus</label>
            <select value={filtroEstatus} onChange={(e) => setFiltroEstatus(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-250 focus:outline-none">
              <option value="">-- Todos --</option>
              <option value="Listo para embarque">🟢 Listo para embarque</option>
              <option value="Embarque parcial">🟡 Embarque parcial</option>
              <option value="Embarcado completo">🔵 Embarcado completo</option>
              <option value="Pendiente">🟠 Pendiente</option>
              <option value="Vencido">🔴 Vencido</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] uppercase font-mono font-bold text-slate-500 block">Compromiso</label>
            <input type="date" value={filtroFechaCompromiso} onChange={(e) => setFiltroFechaCompromiso(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-250 focus:outline-none" />
          </div>

          <div className="space-y-1">
            <label className="text-[9px] uppercase font-mono font-bold text-slate-500 block">Responsable</label>
            <select value={filtroResponsable} onChange={(e) => setFiltroResponsable(e.target.value)} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-250 focus:outline-none">
              <option value="">-- Todos --</option>
              {listResponsables.map((r, idx) => <option key={idx} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* CORE GRID LAYOUT: TABLA & PANEL DETALLES */}
      <div id="emb_core_grid" className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        
        {/* TABLE COMPONENT */}
        <div className="xl:col-span-8 bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-2xl space-y-4">
          <div className="flex justify-between items-center border-b border-slate-900 pb-3 flex-wrap gap-2">
            <div>
              <h3 className="text-xs font-black font-mono text-slate-200 uppercase tracking-widest flex items-center gap-1.5">
                <CheckSquare className="w-4 h-4 text-emerald-400" /> Bitácora de Salidas y Despachos
              </h3>
              <p className="text-[9px] text-slate-500">Haga clic en un registro para controlar la carga y remisión de pares.</p>
            </div>
            <span className="text-[9px] text-indigo-400 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
              {filteredRecords.length} pedidos listados
            </span>
          </div>

          <div className="overflow-x-auto w-full border border-slate-900 rounded-lg">
            <table className="w-full text-left border-collapse text-[10px] font-sans">
              <thead>
                <tr className="bg-slate-900/80 border-b border-slate-850 text-slate-400 font-mono text-[9px] uppercase tracking-wider">
                  <th className="py-2.5 px-2">Fecha</th>
                  <th className="py-2.5 px-2">Cliente</th>
                  <th className="py-2.5 px-2">OC</th>
                  <th className="py-2.5 px-2">Pedido</th>
                  <th className="py-2.5 px-2">Lote</th>
                  <th className="py-2.5 px-2">Modelo</th>
                  <th className="py-2.5 px-2">Color</th>
                  <th className="py-2.5 px-2 text-right">Pares Pedido</th>
                  <th className="py-2.5 px-2 text-right text-cyan-400">Listos</th>
                  <th className="py-2.5 px-2 text-right text-emerald-400">Embarcados</th>
                  <th className="py-2.5 px-2 text-right text-rose-450">Pendientes</th>
                  <th className="py-2.5 px-2 text-center">F. Compromiso</th>
                  <th className="py-2.5 px-2 text-center">F. Embarque</th>
                  <th className="py-2.5 px-2 text-center">Estatus</th>
                  <th className="py-2.5 px-2">Responsable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-905">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="py-8 text-center text-slate-500 italic">
                      No se encontraron registros de embarques para este Tenant.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map(item => {
                    const isSelected = selectedRecord?.id === item.id;
                    const dateClean = item.fecha.split('-').slice(1).join('/');
                    const compClean = item.fechaCompromiso.split('-').slice(1).join('/');
                    const embClean = item.fechaEmbarque ? item.fechaEmbarque.split('-').slice(1).join('/') : '-';
                    return (
                      <tr 
                        key={item.id}
                        onClick={() => {
                          setSelectedPedidoId(item.id);
                          setPartialShipError(null);
                        }}
                        className={`hover:bg-slate-900/80 transition-colors cursor-pointer ${
                          isSelected ? 'bg-slate-900/90 border-l-2 border-emerald-400' : ''
                        }`}
                      >
                        <td className="py-2.5 px-2 text-slate-450 whitespace-nowrap font-mono">{dateClean}</td>
                        <td className="py-2.5 px-2 font-semibold text-slate-200">{item.cliente}</td>
                        <td className="py-2.5 px-2 font-mono text-slate-400">{item.oc}</td>
                        <td className="py-2.5 px-2 font-mono text-slate-300">{item.pedido}</td>
                        <td className="py-2.5 px-2 text-amber-500 font-bold font-mono">{item.lote}</td>
                        <td className="py-2.5 px-2 text-slate-200 font-sans">{item.modelo}</td>
                        <td className="py-2.5 px-2 text-slate-450">{item.color}</td>
                        <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-350">{item.totalParesPedido}</td>
                        <td className="py-2.5 px-2 text-right font-mono text-cyan-400 font-bold">{item.paresListos}</td>
                        <td className="py-2.5 px-2 text-right font-mono text-emerald-400 font-bold">{item.paresEmbarcados}</td>
                        <td className="py-2.5 px-2 text-right font-mono text-rose-400 font-bold">{item.paresPendientes}</td>
                        <td className="py-2.5 px-2 text-center text-slate-400 font-mono whitespace-nowrap">{compClean}</td>
                        <td className="py-2.5 px-2 text-center text-slate-500 font-mono whitespace-nowrap">{embClean}</td>
                        <td className="py-2.5 px-2 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-[8px] font-mono border uppercase tracking-wide font-black ${
                            item.estatus === 'Listo para embarque' ? 'bg-indigo-950 text-indigo-400 border-indigo-900' :
                            item.estatus === 'Embarque parcial' ? 'bg-amber-955 text-amber-500 border-amber-900' :
                            item.estatus === 'Embarcado completo' ? 'bg-emerald-950 text-emerald-400 border-emerald-900' :
                            item.estatus === 'Pendiente' ? 'bg-slate-900 text-slate-400 border-slate-800' :
                            'bg-red-950 text-red-500 border-red-900'
                          }`}>
                            {item.estatus}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-slate-400 font-mono whitespace-nowrap">{item.responsable}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* DETALLE PANEL */}
        <div className="xl:col-span-4 bg-slate-950 border border-slate-900 rounded-xl p-5 shadow-2xl space-y-4">
          <div className="border-b border-slate-900 pb-3">
            <h3 className="text-xs font-black font-mono text-slate-200 uppercase tracking-widest flex items-center gap-1.5">
              <FileCheck className="w-5 h-5 text-emerald-400" /> Remisión y Maniobra Analítica
            </h3>
            <p className="text-[10px] text-slate-500">Mando operacional de embarques del lote seleccionado.</p>
          </div>

          {selectedRecord ? (
            <div className="space-y-4">
              
              {/* STATUS CARD */}
              <div className={`p-4 rounded-xl border flex items-center justify-between ${
                selectedRecord.estatus === 'Embarcado completo' ? 'bg-emerald-950/45 border-emerald-900' :
                selectedRecord.estatus === 'Embarque parcial' ? 'bg-amber-950/45 border-amber-900' :
                selectedRecord.estatus === 'Vencido' ? 'bg-rose-950/45 border-rose-900' :
                'bg-slate-900/50 border-slate-800'
              }`}>
                <div>
                  <span className="text-[9px] font-mono text-slate-500 uppercase block leading-none">Estatus de despacho</span>
                  <strong className={`font-mono text-xs uppercase ${
                    selectedRecord.estatus === 'Embarcado completo' ? 'text-emerald-400' :
                    selectedRecord.estatus === 'Embarque parcial' ? 'text-amber-400' :
                    selectedRecord.estatus === 'Vencido' ? 'text-rose-450' :
                    'text-indigo-400'
                  }`}>
                    🚀 {selectedRecord.estatus}
                  </strong>
                </div>
                <div className="text-[10px] text-slate-400 font-mono text-right">
                  Compromiso: <span className="text-white block font-bold">{selectedRecord.fechaCompromiso}</span>
                </div>
              </div>

              {/* GENERAL INFO METADATA */}
              <div className="bg-slate-900/60 border border-slate-850 p-4 rounded-xl space-y-3">
                <div className="grid grid-cols-2 gap-3 text-[11px] font-mono border-b border-slate-850 pb-2">
                  <div>
                    <span className="text-slate-500 block">Cliente:</span>
                    <strong className="text-slate-100 font-sans block text-xs">{selectedRecord.cliente}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Número Pedido / OC:</span>
                    <strong className="text-slate-100 block">{selectedRecord.pedido} / {selectedRecord.oc}</strong>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[11px] font-mono border-b border-slate-850 pb-2">
                  <div>
                    <span className="text-slate-500 block">Lote Relacionado:</span>
                    <strong className="text-amber-500 font-bold block">{selectedRecord.lote}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Modelo & Color:</span>
                    <strong className="text-cyan-400 font-sans block">{selectedRecord.modelo} - {selectedRecord.color}</strong>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-mono">
                  <div className="p-1.5 bg-slate-950 border border-slate-850 rounded">
                    <span className="text-slate-500 block">Pedido P.</span>
                    <strong className="text-slate-300 text-xs">{selectedRecord.totalParesPedido}</strong>
                  </div>
                  <div className="p-1.5 bg-slate-950 border border-slate-850 rounded">
                    <span className="text-slate-500 block">Listos P.</span>
                    <strong className="text-cyan-400 text-xs">{selectedRecord.paresListos}</strong>
                  </div>
                  <div className="p-1.5 bg-slate-950 border border-slate-850 rounded">
                    <span className="text-slate-500 block">Embarcado</span>
                    <strong className="text-emerald-400 text-xs">{selectedRecord.paresEmbarcados}</strong>
                  </div>
                </div>
              </div>

              {/* PROGRESS BAR */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>Progreso de Despacho del Pedido</span>
                  <strong>{Math.round((selectedRecord.paresEmbarcados * 100) / selectedRecord.totalParesPedido)}%</strong>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-emerald-500 h-full rounded-full transition-all duration-300" 
                    style={{ width: `${(selectedRecord.paresEmbarcados * 100) / selectedRecord.totalParesPedido}%` }}
                  ></div>
                </div>
              </div>

              {/* SIMULATED BUTTON ACTIONS & PARTIAL WORKFLOWS */}
              <div className="p-3 bg-slate-900/30 border border-slate-900 rounded-xl space-y-3">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block font-bold">Mando Físico de Salida</span>
                
                <div className="grid grid-cols-1 gap-2">
                  
                  {/* Mark as Fully Shipped button */}
                  <button 
                    id="mark_full_shipped_btn"
                    onClick={handleMarkAsShipped}
                    disabled={selectedRecord.estatus === 'Embarcado completo'}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-550 disabled:bg-slate-800 text-slate-950 text-xs font-mono font-black rounded-lg transition border border-emerald-400 disabled:border-transparent disabled:text-slate-600 cursor-pointer text-center"
                  >
                    🚀 Marcar como Embarcado (Completo)
                  </button>

                  {/* Partial shipment mini control */}
                  {selectedRecord.estatus !== 'Embarcado completo' && (
                    <form onSubmit={handleRegisterPartialShipment} className="border-t border-slate-900 pt-3 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                        <span>Registrar Embarque Parcial (prs):</span>
                        <span className="text-rose-400">Pares pend: {selectedRecord.paresPendientes}</span>
                      </div>
                      
                      <div className="flex gap-2">
                        <input 
                          type="number"
                          value={partialShipAmount}
                          onChange={(e) => setPartialShipAmount(Math.max(1, Number(e.target.value)))}
                          max={selectedRecord.paresPendientes}
                          min={1}
                          className="w-full bg-slate-950 border border-slate-850 rounded p-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                        />
                        <button
                          id="submit_partial_ship_btn"
                          type="submit"
                          className="px-3 bg-amber-500 hover:bg-amber-450 text-slate-950 text-[11px] font-mono font-bold rounded transition cursor-pointer"
                        >
                          Despachar
                        </button>
                      </div>
                      {partialShipError && (
                        <p className="text-[10px] text-rose-400 font-mono italic">{partialShipError}</p>
                      )}
                    </form>
                  )}
                </div>
              </div>

              {/* TIMELINE HISTORIAL MOVIMIENTOS */}
              <div className="space-y-2">
                <span className="text-[10px] font-mono font-bold text-slate-450 uppercase tracking-wider block">Historial de Movimientos de Carga</span>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {selectedRecord.historial?.map((h, i) => (
                    <div key={i} className="p-2 bg-slate-900 border border-slate-900 rounded text-[10px] font-mono relative">
                      <div className="flex justify-between items-center text-slate-500 mb-0.5">
                        <span>{h.fecha}</span>
                        <span className="text-emerald-400 text-[9px] bg-slate-950 px-1.5 py-0.2 rounded">{h.usuario}</span>
                      </div>
                      <p className="text-slate-300 font-sans leading-relaxed">{h.accion}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* OBSERVACIONES */}
              <div className="p-3 bg-slate-900 rounded-lg text-[11px] border border-slate-850">
                <span className="text-[9px] uppercase font-mono text-slate-500 block">Observaciones Operativas</span>
                <p className="text-slate-300 italic">{selectedRecord.observaciones || "Sin observaciones adicionales registrados."}</p>
              </div>

            </div>
          ) : (
            <p className="text-slate-500 text-xs italic text-center py-6">Seleccione algún registro para proyectar remisiones.</p>
          )}
        </div>
      </div>

      {/* 5. SECCIÓN DE ANALÍTICAS / GRÁFICAS */}
      <div id="emb_analytics_section" className="bg-slate-950 border border-slate-900 p-5 rounded-2xl shadow-xl space-y-4">
        <div>
          <h3 className="text-xs font-black font-mono text-slate-200 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-900 pb-2">
            <BarChart className="w-4 h-4 text-emerald-400" /> Analíticas del Hub de Distribución
          </h3>
          <p className="text-[10px] text-slate-550">Compendio gráfico de OTIF, backlog y volúmenes embarcados.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          
          {/* Graffic 1: Embarques por día */}
          <div className="bg-slate-900 p-4.5 border border-slate-800 rounded-xl space-y-2 shadow-sm">
            <span className="text-[10px] font-mono font-black text-slate-400 uppercase block">1. Pares Embarcados por Día</span>
            <div className="h-44 w-full overflow-x-auto">
              <div className="w-full min-w-[300px] h-full">
              <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <RechartsLineChart data={embarquesDiaChartData} margin={{ top: 5, right: 10, left: -25, bottom: 5 }}>
                  <RechartsCartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                  <RechartsXAxis dataKey="fecha" stroke="#475569" className="text-[9px] font-bold" />
                  <RechartsYAxis stroke="#475569" className="text-[9px] font-bold" />
                  <RechartsTooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', color: '#0f172a' }} />
                  <RechartsLine type="monotone" dataKey="pares" stroke="#059669" strokeWidth={2.5} activeDot={{ r: 6 }} />
                </RechartsLineChart>
              </RechartsResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Graffic 2: Pedidos completos vs parciales */}
          <div className="bg-slate-900 p-4.5 border border-slate-800 rounded-xl space-y-2 shadow-sm">
            <span className="text-[10px] font-mono font-black text-slate-400 uppercase block">2. Pedidos Completos vs Parciales</span>
            <div className="h-44 w-full overflow-x-auto">
              <div className="w-full min-w-[300px] h-full">
              <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <RechartsBarChart data={completosVsParcialesData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                  <RechartsCartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                  <RechartsXAxis dataKey="name" stroke="#475569" className="text-[9px] font-bold" />
                  <RechartsYAxis stroke="#475569" className="text-[9px] font-bold" />
                  <RechartsTooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', color: '#0f172a' }} />
                  <RechartsBar dataKey="cantidad" fill="#4338ca" radius={[4, 4, 0, 0]} />
                </RechartsBarChart>
              </RechartsResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Graffic 3: Cumplimiento por cliente */}
          <div className="bg-slate-900 p-4.5 border border-slate-800 rounded-xl space-y-2 shadow-sm">
            <span className="text-[10px] font-mono font-black text-slate-400 uppercase block">3. Cumplimiento OTIF por Cliente</span>
            <div className="h-44 w-full overflow-x-auto">
              <div className="w-full min-w-[300px] h-full">
              <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <RechartsBarChart data={cumplimientoClienteData} layout="vertical" margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                  <RechartsCartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                  <RechartsXAxis type="number" domain={[0, 100]} stroke="#475569" className="text-[9px] font-bold" />
                  <RechartsYAxis type="category" dataKey="cliente" stroke="#475569" className="text-[9px] font-bold" width={45} />
                  <RechartsTooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', color: '#0f172a' }} />
                  <RechartsBar dataKey="porcentaje" fill="#047857" radius={[0, 4, 4, 0]} />
                </RechartsBarChart>
              </RechartsResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Graffic 4: Pares embarcados por modelo */}
          <div className="bg-slate-900 p-4.5 border border-slate-800 rounded-xl space-y-2 shadow-sm">
            <span className="text-[10px] font-mono font-black text-slate-400 uppercase block">4. Pares Embarcados por Modelo</span>
            <div className="h-44 w-full overflow-x-auto">
              <div className="w-full min-w-[300px] h-full">
              <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <RechartsBarChart data={paresEmbarcadosModeloData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                  <RechartsCartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                  <RechartsXAxis dataKey="modelo" stroke="#475569" className="text-[9px] font-bold" />
                  <RechartsYAxis stroke="#475569" className="text-[9px] font-bold" />
                  <RechartsTooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', color: '#0f172a' }} />
                  <RechartsBar dataKey="pares" fill="#b45309" radius={[4, 4, 0, 0]} />
                </RechartsBarChart>
              </RechartsResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Graffic 5: Backlog pendiente de embarque */}
          <div className="bg-slate-900 p-4.5 border border-slate-800 rounded-xl space-y-2 shadow-sm">
            <span className="text-[10px] font-mono font-black text-slate-400 uppercase block">5. Backlog Pendiente por Cliente</span>
            <div className="h-44 w-full overflow-x-auto">
              <div className="w-full min-w-[300px] h-full">
              <RechartsResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <RechartsBarChart data={backlogPendienteClienteData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                  <RechartsCartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                  <RechartsXAxis dataKey="cliente" stroke="#475569" className="text-[9px] font-bold" />
                  <RechartsYAxis stroke="#475569" className="text-[9px] font-bold" />
                  <RechartsTooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', color: '#0f172a' }} />
                  <RechartsBar dataKey="pares" fill="#be123c" radius={[4, 4, 0, 0]} />
                </RechartsBarChart>
              </RechartsResponsiveContainer>
              </div>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
};


/* 11. OCR Validacion View */
export const OCRValidacionView: React.FC = () => {
  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-805 p-4 rounded-lg">
        <h2 className="text-lg font-black font-mono text-cyan-400 uppercase tracking-widest leading-none mb-1">
          Visor de Reconocimiento de Datos (OCR)
        </h2>
        <p className="text-xs text-slate-500 font-sans">
          Lector neural para etiquetas de inyección. Valida y compara contra las marcas de catálogo del ERP.
        </p>
      </div>
      <OCRValidation />
    </div>
  );
};

/* 12. Reportes Históricos View */
export const ReportesHistoricosView: React.FC = () => {
  const { audits, batches, restoreBatch, currentTenant } = useDashboard();

  // Producción por hora y movimientos reales (BixApp FDB → backend).
  const [erpProduccion, setErpProduccion] = useState<EjecutivoData['produccion']>([]);
  const [erpMovimientos, setErpMovimientos] = useState<MovimientoRow[]>([]);
  useEffect(() => {
    if (!backendEnabled) return;
    let cancelled = false;
    const hoy = new Date();
    const fechaFin = hoy.toISOString().slice(0, 10);
    const fechaInicio = new Date(hoy.getTime() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    dashboardApi.erpOperativo(fechaInicio, fechaFin)
      .then(data => {
        if (!cancelled) {
          setErpProduccion(data.productionHourly);
          setErpMovimientos(data.movements.slice(0, 50));
        }
      })
      .catch(err => console.warn('Reportes: ERP operativo fetch failed', err));
    return () => { cancelled = true; };
  }, []);
  const prodHoraSource = erpProduccion;
  const movimientosSource = erpMovimientos;

  // Find archived (soft-deleted) items
  const archivedBatches = batches.filter(
    b => (b.status as string) === 'ARCHIVED' || b.status === 'ARCHIVADO'
  );

  const auditColumns = [
    { header: 'Fecha', accessorKey: 'timestamp', cell: (a: any) => fontMonoDateTime(a.timestamp) },
    { header: 'Módulo', accessorKey: 'module', cell: (a: any) => <span className="font-mono text-cyan-400">{a.module}</span> },
    { header: 'Evento', accessorKey: 'event', cell: (a: any) => <span className="font-mono text-slate-100 font-bold">{a.event}</span> },
    { header: 'Usuario', accessorKey: 'userId', cell: (a: any) => <span className="text-slate-400 text-[10px]">{a.userId} ({a.userRole.replace('_', ' ')})</span> },
    { header: 'Detalles Bitácora', accessorKey: 'details' }
  ];

  const fontMonoDateTime = (iso: string) => {
    return (
      <span className="font-mono text-[10px]">
        {new Date(iso).toLocaleDateString()} {new Date(iso).toLocaleTimeString()}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      
      {/* Upper header */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg">
        <h2 className="text-lg font-black font-mono text-cyan-400 uppercase tracking-widest leading-none mb-1">
          Reportes Históricos y Auditoría Global
        </h2>
        <p className="text-xs text-slate-500 font-sans">
          Resguardo de bitácora de auditoría digital inalterable y listado de lotes archivados (Mecanismo Soft-delete).
        </p>
      </div>

      {/* Grid structure dividing audits on bottom, archived items on top */}
      <div className="space-y-6">
        
        {/* Archived list (Soft deleted items) */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-3">
          <h3 className="text-xs font-black tracking-widest font-mono text-amber-500 uppercase flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-500" />
            Lotes Archivado (Garantía de Restauración de 30 Días)
          </h3>
          
          {archivedBatches.length === 0 ? (
            <p className="text-xs text-slate-500 italic p-4 text-center border border-dashed border-slate-800 rounded">
              Sin elementos archivados temporalmente.
            </p>
          ) : (
            <div className="space-y-2">
              {archivedBatches.map(b => (
                <div key={b.id} className="p-3 bg-slate-950 border border-slate-850 rounded flex justify-between items-center text-xs">
                  <div>
                    <span className="font-mono font-black text-slate-250 block">{b.id}</span>
                    <p className="text-[10px] text-slate-550 font-sans">
                      Modelo: {b.modelName} ({b.color}) | Cantidad: {b.quantityShoes} Prs
                    </p>
                    <p className="text-[9px] text-red-400 font-mono italic mt-0.5">
                      Archivado hace minutos. Purga permanente el {new Date(b.archivedAt || Date.now() + 30 * 24 * 3600 * 1000).toLocaleDateString()}.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      restoreBatch(b.id);
                      alert(`Lote ${b.id} restaurado con éxito.`);
                    }}
                    className="px-3 py-1 bg-emerald-950 text-emerald-400 hover:bg-emerald-900 border border-emerald-800/40 rounded font-mono text-[10px] uppercase font-bold cursor-pointer"
                  >
                    Restaurar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Audit Log Table */}
        <div className="space-y-2">
          <h3 className="text-xs font-black tracking-widest font-mono text-cyan-400 uppercase">
            Bitácora de Auditoría Central Aislada por Tenant
          </h3>
          <DataTable 
            data={audits} 
            columns={auditColumns} 
            idField="id" 
          />
        </div>

        {/* 11. Producción por hora */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
          <div>
            <h3 className="text-xs font-black tracking-widest font-mono text-cyan-400 uppercase flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              Rendimiento de Producción por Hora (Meta vs Real)
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Estadísticas continuas por área y turno. Resalta eficiencias por debajo del 90% para corregir cuellos de botella.
            </p>
          </div>

          <div className="overflow-x-auto border border-slate-950 rounded max-h-80 overflow-y-auto">
            <table className="w-full text-left text-xs text-slate-405 border-collapse">
              <thead className="bg-slate-950 text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="p-3">Hora/Turno</th>
                  <th className="p-3">Área de Trabajo</th>
                  <th className="p-3">Modelo/Color</th>
                  <th className="p-3 text-right">Meta Hora</th>
                  <th className="p-3 text-right">Prod Real</th>
                  <th className="p-3 text-right">Eficiencia</th>
                  <th className="p-3">Responsable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-950">
                {prodHoraSource.map((p, idx) => {
                  const isLowEff = p.eficiencia < 90;
                  return (
                    <tr key={idx} className="hover:bg-slate-850/45 transition-colors text-[11px]">
                      <td className="p-2.5 font-mono text-slate-300">
                        {p.hora}
                        <span className="block text-[9px] text-indigo-400 font-bold">Turno {p.turno}</span>
                      </td>
                      <td className="p-2.5 font-mono font-bold text-slate-200">{p.area}</td>
                      <td className="p-2.5 text-slate-400">
                        {p.modelo} <span className="text-[9.5px] italic text-slate-550">({p.color})</span>
                      </td>
                      <td className="p-2.5 text-right font-mono text-slate-500">{p.metaHora}</td>
                      <td className="p-2.5 text-right font-mono font-bold text-slate-200">{p.produccionReal}</td>
                      <td className={`p-2.5 text-right font-mono font-black ${
                        isLowEff ? 'text-red-400' : 'text-green-400'
                      }`}>
                        {p.eficiencia}%
                      </td>
                      <td className="p-2.5 italic text-slate-500">{p.responsable}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 8. Movimientos por etapa */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
          <div>
            <h3 className="text-xs font-black tracking-widest font-mono text-pink-400 uppercase flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-pink-400" />
              Trazabilidad de Movimientos en Etapa y Cuellos de Botella (Alertas)
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Duraciones extremas (&gt;3000 minutos) en <strong className="text-purple-400 font-bold">Estabilización</strong> o <strong className="text-indigo-400 font-bold">Banda</strong> exponen los cuellos de botella de la planta.
            </p>
          </div>

          <div className="overflow-x-auto border border-slate-950 rounded max-h-80 overflow-y-auto">
            <table className="w-full text-left text-xs text-slate-405 border-collapse">
              <thead className="bg-slate-950 text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="p-3">Folio Movimiento</th>
                  <th className="p-3">Lote Relacionado</th>
                  <th className="p-3">Etapa</th>
                  <th className="p-3">Fecha Entrada</th>
                  <th className="p-3">Fecha Salida</th>
                  <th className="p-3 text-right">Pares</th>
                  <th className="p-3">Operario Escaneo</th>
                  <th className="p-3 text-right">Duración Mins</th>
                  <th className="p-3 text-right">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-950">
                {movimientosSource.slice(0, 35).map((m, idx) => {
                  const isBottleneck = m.duracionMinutos > 3000;
                  return (
                    <tr key={idx} className="hover:bg-slate-850/45 transition-colors text-[11px]">
                      <td className="p-2.5 font-mono text-cyan-400 font-black">{m.idMovimiento}</td>
                      <td className="p-2.5 font-mono text-slate-300 font-bold">{m.idLote}</td>
                      <td className="p-2.5 text-slate-400">{m.etapa}</td>
                      <td className="p-2.5 font-mono text-[10px] text-slate-500">{new Date(m.fechaEntrada).toLocaleDateString()}</td>
                      <td className="p-2.5 font-mono text-[10px] text-slate-500">
                        {m.fechaSalida ? new Date(m.fechaSalida).toLocaleDateString() : <span className="text-amber-500 font-bold">EN PROCESO</span>}
                      </td>
                      <td className="p-2.5 text-right font-mono text-slate-300">{m.pares.toLocaleString()}</td>
                      <td className="p-2.5 text-slate-450 italic">{m.usuarioEscaneo}</td>
                      <td className="p-2.5 text-right font-mono text-slate-300">{m.duracionMinutos.toLocaleString()}</td>
                      <td className="p-2.5 text-right font-mono font-bold">
                        {isBottleneck ? (
                          <span className="text-[9.5px] px-1.5 py-0.5 bg-red-950/60 text-red-400 border border-red-900 rounded">CUELLO DE BOTELLA</span>
                        ) : (
                          <span className="text-[9.5px] px-1.5 py-0.5 bg-green-950/60 text-green-400 border border-green-900 rounded">REGULAR</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  );
};

/* 13. Catálogos View */
export const CatalogosView: React.FC = () => {
  const { orders, currentTenant } = useDashboard();
  const [catalogs, setCatalogs] = useState<ErpOperationalResponse['catalogs'] | null>(null);

  useEffect(() => {
    if (!backendEnabled) return;
    let cancelled = false;
    const end = new Date();
    const start = new Date(end.getTime() - 365 * 24 * 3600 * 1000);
    dashboardApi.erpOperativo(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10))
      .then(data => { if (!cancelled) setCatalogs(data.catalogs); })
      .catch(err => console.warn('Catalogos: ERP operativo fetch failed', err));
    return () => { cancelled = true; };
  }, []);

  const clientsFromOrders = Array.from(
    new Map(
      orders
        .filter(o => o.tenantId === currentTenant.id)
        .map(o => {
          const name = o.clientName || o.cliente || o.clientId || 'Pendiente OCR';
          const id = String(o.clientId || name);
          return [id, {
            id,
            name,
            rfc: o.rfc || 'Pendiente OCR',
            contactEmail: o.contactEmail || 'Pendiente OCR',
            contactPhone: o.contactPhone || 'Pendiente OCR',
            priority: o.prioridad || 'MEDIA'
          }];
        })
    ).values()
  );
  const clientsFromFdb = catalogs?.clients.length
    ? catalogs.clients.map(c => ({
      id: String(c.id || c.codigo || c.name || c.nombre),
      name: String(c.name || c.nombre || c.codigo || 'S/Cliente'),
      rfc: String(c.rfc || '—'),
      contactEmail: '—',
      contactPhone: '—',
      priority: String(c.clasif || 'MEDIA')
    }))
    : clientsFromOrders;
  const clientColumns = [
    { header: 'RFC Fiscal', accessorKey: 'rfc', cell: (c: any) => <span className="font-mono">{c.rfc}</span> },
    { header: 'Razón Social', accessorKey: 'name', cell: (c: any) => <strong className="text-slate-250">{c.name}</strong> },
    { header: 'Email Contacto', accessorKey: 'contactEmail' },
    { header: 'Teléfono', accessorKey: 'contactPhone', cell: (c: any) => <span className="font-mono">{c.contactPhone}</span> },
    { header: 'Prioridad Comercial', accessorKey: 'priority', cell: (c: any) => <StatusBadge status={c.priority} type="priority" /> }
  ];
  const modelCatalog = (catalogs?.models ?? []).map(m => ({
    id: String(m.id || m.codigo || m.name || m.nombre),
    codigo: String(m.codigo || m.id || ''),
    name: String(m.name || m.nombre || 'S/Modelo'),
    linea: String(m.linea || '—'),
    vigente: m.vigente === false ? 'NO' : 'SI'
  }));
  const deptCatalog = (catalogs?.departments ?? []).map(d => ({
    id: String(d.id || d.codigo || d.name || d.nombre),
    codigo: String(d.codigo || d.id || ''),
    name: String(d.name || d.nombre || 'S/Depto'),
    stage: String(d.stage_id || '—'),
    orden: String(d.orden || '—')
  }));
  const modelColumns = [
    { header: 'Código', accessorKey: 'codigo', cell: (m: any) => <span className="font-mono">{m.codigo}</span> },
    { header: 'Modelo', accessorKey: 'name', cell: (m: any) => <strong className="text-slate-250">{m.name}</strong> },
    { header: 'Línea', accessorKey: 'linea' },
    { header: 'Vigente', accessorKey: 'vigente' }
  ];
  const deptColumns = [
    { header: 'Código', accessorKey: 'codigo', cell: (d: any) => <span className="font-mono">{d.codigo}</span> },
    { header: 'Departamento', accessorKey: 'name', cell: (d: any) => <strong className="text-slate-250">{d.name}</strong> },
    { header: 'Etapa Dashboard', accessorKey: 'stage' },
    { header: 'Orden', accessorKey: 'orden' }
  ];

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg">
        <h2 className="text-lg font-black font-mono text-cyan-400 uppercase tracking-widest leading-none mb-1">
          Catálogo General de Clientes
        </h2>
        <p className="text-xs text-slate-500 font-sans">
          Bases fiscales registradas ante hacienda mexicana y prioridades logísticas locales.
        </p>
      </div>

      <DataTable
        data={clientsFromFdb}
        columns={clientColumns}
        idField="id"
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-2">
          <h3 className="text-xs font-black tracking-widest font-mono text-cyan-400 uppercase">Modelos FDB</h3>
          <DataTable data={modelCatalog} columns={modelColumns} idField="id" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xs font-black tracking-widest font-mono text-cyan-400 uppercase">Departamentos FDB</h3>
          <DataTable data={deptCatalog} columns={deptColumns} idField="id" />
        </div>
      </div>
    </div>
  );
};

/* 14. Configuración View */
export const ConfiguracionView: React.FC = () => {
  const {
    currentTenant,
    currentUser,
    isOffline,
    toggleOffline,
    users,
    turns,
    productionGoals,
    addUser,
    updateUser,
    toggleUserActive,
    activateUser,
    addTurn,
    updateTurn,
    addProductionGoal,
    updateProductionGoal,
    getEffectivePermissions,
    can
  } = useDashboard();

  const roles: Role[] = ['DIRECTOR_GENERAL', 'LIDER_ADMINISTRACION', 'LIDER_INYECCION', 'SUPERVISOR_CALIDAD'];
  const areaOptions: { id: ProductionAreaId; label: string }[] = [
    { id: 'almacen', label: 'Almacén' },
    { id: 'inyeccion', label: 'Inyección' },
    { id: 'aduana', label: 'Aduana' },
    { id: 'banda', label: 'Banda' },
    { id: 'embarque', label: 'Embarque' },
    { id: 'entregas', label: 'Entregas' },
    { id: 'salidas_tercera', label: 'Salidas de tercera' }
  ];
  const activeUsers = users.filter(user => user.active);
  const [activeTab, setActiveTab] = useState<'usuarios' | 'permisos' | 'metas' | 'turnos'>('usuarios');

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [selectedPermissionUserId, setSelectedPermissionUserId] = useState<string>('');
  const [userUsername, setUserUsername] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRoles, setUserRoles] = useState<Role[]>(['LIDER_INYECCION']);
  const selectedPermissionUser = users.find(user => user.id === selectedPermissionUserId) || users[0];

  const [editingTurnId, setEditingTurnId] = useState<string | null>(null);
  const [turnCode, setTurnCode] = useState('MAÑANA');
  const [turnName, setTurnName] = useState('Turno Mañana');
  const [turnStart, setTurnStart] = useState('07:00');
  const [turnEnd, setTurnEnd] = useState('14:59');
  const [turnActive, setTurnActive] = useState(true);
  const [turnResponsable, setTurnResponsable] = useState('');

  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [goalArea, setGoalArea] = useState<ProductionAreaId>('inyeccion');
  const [goalTurnId, setGoalTurnId] = useState(turns[0]?.id || '');
  const [goalMetaHora, setGoalMetaHora] = useState(150);
  const [goalMetaTurno, setGoalMetaTurno] = useState(15000);
  const [goalResponsable, setGoalResponsable] = useState(activeUsers[0]?.id || '');
  const [goalActive, setGoalActive] = useState(true);

  useEffect(() => {
    if (!goalTurnId && turns[0]) setGoalTurnId(turns[0].id);
    if (!goalResponsable && activeUsers[0]) setGoalResponsable(activeUsers[0].id);
    if (!turnResponsable && activeUsers[0]) setTurnResponsable(activeUsers[0].id);
    if (!selectedPermissionUserId && users[0]) setSelectedPermissionUserId(users[0].id);
  }, [activeUsers, goalResponsable, goalTurnId, selectedPermissionUserId, turnResponsable, turns, users]);

  const roleLabel = (role: Role) => role.replace(/_/g, ' ');
  const areaLabel = (area: ProductionAreaId) => areaOptions.find(option => option.id === area)?.label || area;
  const userName = (userId?: string) => users.find(user => user.id === userId)?.username || 'Sin asignar';
  const turnLabel = (turnId: string) => turns.find(turn => turn.id === turnId)?.name || 'Sin turno';

  const resetUserForm = () => {
    setEditingUserId(null);
    setUserUsername('');
    setUserPassword('');
    setUserRoles(['LIDER_INYECCION']);
  };

  const handleEditUser = (user: AppUser) => {
    setEditingUserId(user.id);
    setUserUsername(user.username);
    setUserPassword(user.password);
    setUserRoles(user.roles);
    setActiveTab('usuarios');
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userUsername.trim() || !userPassword.trim()) return;
    const payload = { username: userUsername.trim(), password: userPassword.trim(), roles: userRoles.length ? userRoles : ['LIDER_INYECCION'] };
    if (editingUserId) updateUser(editingUserId, payload);
    else addUser(payload);
    resetUserForm();
  };

  const toggleUserRole = (role: Role) => {
    setUserRoles(prev => prev.includes(role) ? prev.filter(item => item !== role) : [...prev, role]);
  };

  const togglePermission = (user: AppUser, permission: PermissionKey) => {
    const effective = getEffectivePermissions(user).has(permission);
    updateUser(user.id, {
      permissionOverrides: {
        ...user.permissionOverrides,
        [permission]: !effective
      }
    });
  };

  const resetUserPermissions = (user: AppUser) => {
    updateUser(user.id, { permissionOverrides: {} });
  };

  const handleEditTurn = (turn: typeof turns[number]) => {
    setEditingTurnId(turn.id);
    setTurnCode(turn.code);
    setTurnName(turn.name);
    setTurnStart(turn.startTime);
    setTurnEnd(turn.endTime);
    setTurnActive(turn.active);
    setTurnResponsable(turn.responsableUserId || activeUsers[0]?.id || '');
    setActiveTab('turnos');
  };

  const resetTurnForm = () => {
    setEditingTurnId(null);
    setTurnCode('MAÑANA');
    setTurnName('Turno Mañana');
    setTurnStart('07:00');
    setTurnEnd('14:59');
    setTurnActive(true);
    setTurnResponsable(activeUsers[0]?.id || '');
  };

  const handleSaveTurn = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { code: turnCode.trim(), name: turnName.trim(), startTime: turnStart, endTime: turnEnd, active: turnActive, responsableUserId: turnResponsable };
    if (editingTurnId) updateTurn(editingTurnId, payload);
    else addTurn(payload);
    resetTurnForm();
  };

  const handleEditGoal = (goal: typeof productionGoals[number]) => {
    setEditingGoalId(goal.id);
    setGoalArea(goal.area);
    setGoalTurnId(goal.turnId);
    setGoalMetaHora(goal.metaHora);
    setGoalMetaTurno(goal.metaTurno);
    setGoalResponsable(goal.responsableUserId);
    setGoalActive(goal.active);
    setActiveTab('metas');
  };

  const resetGoalForm = () => {
    setEditingGoalId(null);
    setGoalArea('inyeccion');
    setGoalTurnId(turns[0]?.id || '');
    setGoalMetaHora(150);
    setGoalMetaTurno(15000);
    setGoalResponsable(activeUsers[0]?.id || '');
    setGoalActive(true);
  };

  const handleSaveGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalTurnId || !goalResponsable) return;
    const payload = {
      area: goalArea,
      turnId: goalTurnId,
      metaHora: Number(goalMetaHora),
      metaTurno: Number(goalMetaTurno),
      responsableUserId: goalResponsable,
      active: goalActive
    };
    if (editingGoalId) updateProductionGoal(editingGoalId, payload);
    else addProductionGoal(payload);
    resetGoalForm();
  };

  const tabClass = (tab: typeof activeTab) =>
    `px-3 py-2 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider transition ${
      activeTab === tab ? 'bg-cyan-500 text-slate-950' : 'bg-slate-950 text-slate-400 hover:text-slate-100 border border-slate-850'
    }`;

  return (
    <div className="space-y-6">
      
      {/* Title */}
      <div className="bg-slate-900 border border-slate-805 p-4 rounded-lg">
        <h2 className="text-lg font-black font-mono text-cyan-400 uppercase tracking-widest leading-none mb-1">
          Configuración Global Plasyect Intelligence
        </h2>
        <p className="text-xs text-slate-550">
          Usuarios, permisos RBAC, metas por turno y responsables de producción.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setActiveTab('usuarios')} className={tabClass('usuarios')}>Usuarios</button>
        <button onClick={() => setActiveTab('permisos')} className={tabClass('permisos')}>Permisos</button>
        <button onClick={() => setActiveTab('metas')} className={tabClass('metas')}>Metas</button>
        <button onClick={() => setActiveTab('turnos')} className={tabClass('turnos')}>Turnos</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Security / RBAC Cards */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
          <h4 className="text-xs font-black tracking-widest font-mono text-amber-500 uppercase border-b border-slate-850 pb-2 flex items-center gap-1.5">
            <FolderLock className="w-4 h-4 text-amber-500" />
            Configuración Niveles de Acceso (RBAC)
          </h4>
          <div className="space-y-1 text-xs text-slate-400 leading-normal">
            <div className="flex justify-between py-1 border-b border-slate-950">
              <span>Usuario Activo:</span>
              <strong className="text-slate-200">{currentUser.username}</strong>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-950">
              <span>Rol asignado:</span>
              <strong className="text-cyan-400 font-mono uppercase">{currentUser.role.replace('_', ' ')}</strong>
            </div>
            <div className="flex justify-between py-1">
              <span>2FA OTP Activado:</span>
              <span className="text-emerald-400 font-bold">ACTIVO</span>
            </div>
          </div>

          <div className="bg-slate-950 p-4 rounded border border-slate-850 space-y-2">
            <p className="text-[10px] font-bold font-mono tracking-wider text-slate-500 uppercase">
              REGLAS AUTORIZACIONES PERMITIDAS:
            </p>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono leading-tight">
              <span className="text-slate-450">✓ VIEW (Visualizar mermas)</span>
              <span className="text-slate-450">✓ CREATE (Apertura lotes)</span>
              <span className={currentUser.role.includes('DIRECTOR') ? 'text-green-400 font-bold' : 'text-slate-600'}>
                {currentUser.role.includes('DIRECTOR') ? '✓ AUTHORIZE (Descuentos)' : '✗ AUTHORIZE (Líderes)'}
              </span>
              <span className="text-green-400 font-bold">✓ ARCHIVE (Soft delete)</span>
            </div>
          </div>
        </div>

        {/* Operación */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
          <h4 className="text-xs font-black tracking-widest font-mono text-cyan-400 uppercase border-b border-slate-850 pb-2 flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-cyan-400" />
            Modo de Operación
          </h4>
          <div className="space-y-3 font-sans text-xs">
            <div className="flex justify-between items-center bg-slate-955 p-3 rounded">
              <div className="space-y-0.5">
                <span className="text-[10px] font-mono font-bold text-slate-500 uppercase">MODO DESCONECTADO</span>
                <p className="text-[11px] text-slate-400">Permite registrar lotes localmente.</p>
              </div>
              <button
                onClick={toggleOffline}
                className={`px-3 py-1.5 font-mono font-bold text-xs rounded border transition-colors ${
                  isOffline 
                  ? 'bg-red-950 text-red-400 border-red-900' 
                  : 'bg-green-950 text-green-400 border-green-905'
                }`}
              >
                {isOffline ? 'Activado' : 'Estable'}
              </button>
            </div>
          </div>
        </div>

      </div>

      {activeTab === 'usuarios' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <form onSubmit={handleSaveUser} className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
            <h3 className="text-xs font-mono font-black text-cyan-400 uppercase">{editingUserId ? 'Editar usuario' : 'Crear usuario'}</h3>
            <input value={userUsername} onChange={(e) => setUserUsername(e.target.value)} disabled={!can('configuracion.manage_users')} placeholder="username" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-100" required />
            <input value={userPassword} onChange={(e) => setUserPassword(e.target.value)} disabled={!can('configuracion.manage_users')} placeholder="password" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-100" required />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {roles.map(role => (
                <label key={role} className="flex items-center gap-2 bg-slate-950 border border-slate-850 rounded p-2 text-[10px] font-mono text-slate-300">
                  <input type="checkbox" disabled={!can('configuracion.manage_users')} checked={userRoles.includes(role)} onChange={() => toggleUserRole(role)} />
                  {roleLabel(role)}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button disabled={!can('configuracion.manage_users')} className="px-3 py-2 bg-cyan-500 disabled:bg-slate-800 text-slate-950 disabled:text-slate-500 rounded text-[10px] font-mono font-black uppercase">
                {editingUserId ? 'Guardar' : 'Crear'}
              </button>
              {editingUserId && <button type="button" onClick={resetUserForm} className="px-3 py-2 bg-slate-800 text-slate-300 rounded text-[10px] font-mono font-bold uppercase">Nuevo</button>}
            </div>
          </form>

          <div className="xl:col-span-2 bg-slate-900 border border-slate-800 rounded-lg overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-950 text-slate-500 font-mono uppercase text-[10px]">
                <tr>
                  <th className="p-3 text-left">Usuario</th>
                  <th className="p-3 text-left">Roles</th>
                  <th className="p-3 text-left">Password</th>
                  <th className="p-3 text-left">Estado</th>
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {users.map(user => (
                  <tr key={user.id}>
                    <td className="p-3 font-bold text-slate-100">{user.username}</td>
                    <td className="p-3 text-slate-400 font-mono">{user.roles.map(roleLabel).join(', ')}</td>
                    <td className="p-3 text-slate-500 font-mono">{'•'.repeat(Math.min(user.password.length, 10))}</td>
                    <td className="p-3"><span className={user.active ? 'text-emerald-400' : 'text-rose-400'}>{user.active ? 'ACTIVO' : 'INACTIVO'}</span></td>
                    <td className="p-3 text-right space-x-2 whitespace-nowrap">
                      <button onClick={() => activateUser(user.id)} disabled={!user.active} className="text-[10px] text-cyan-400 disabled:text-slate-600 font-mono font-bold">Activar usuario</button>
                      <button onClick={() => handleEditUser(user)} className="text-[10px] text-amber-400 font-mono font-bold">Editar</button>
                      <button onClick={() => toggleUserActive(user.id)} disabled={!can('configuracion.manage_users')} className="text-[10px] text-slate-400 disabled:text-slate-700 font-mono font-bold">{user.active ? 'Desactivar' : 'Activar'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'permisos' && selectedPermissionUser && (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
            <h3 className="text-xs font-mono font-black text-cyan-400 uppercase">Usuario permisos</h3>
            <select value={selectedPermissionUser.id} onChange={(e) => setSelectedPermissionUserId(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-100">
              {users.map(user => <option key={user.id} value={user.id}>{user.username}</option>)}
            </select>
            <div className="text-[10px] text-slate-500 font-mono">
              Base por rol: {selectedPermissionUser.roles.map(roleLabel).join(', ')}
            </div>
            <button onClick={() => resetUserPermissions(selectedPermissionUser)} disabled={!can('configuracion.manage_permissions')} className="px-3 py-2 bg-slate-800 disabled:bg-slate-900 text-slate-300 disabled:text-slate-600 rounded text-[10px] font-mono font-bold uppercase">
              Limpiar overrides
            </button>
          </div>

          <div className="xl:col-span-3 bg-slate-900 border border-slate-800 rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {ALL_PERMISSION_KEYS.map(permission => {
              const effective = getEffectivePermissions(selectedPermissionUser).has(permission);
              const hasOverride = selectedPermissionUser.permissionOverrides[permission] !== undefined;
              return (
                <label key={permission} className={`flex items-start gap-2 border rounded p-2 text-[10px] font-mono ${effective ? 'bg-emerald-950/20 border-emerald-900/40 text-emerald-300' : 'bg-slate-950 border-slate-850 text-slate-500'}`}>
                  <input type="checkbox" disabled={!can('configuracion.manage_permissions')} checked={effective} onChange={() => togglePermission(selectedPermissionUser, permission)} />
                  <span>
                    <span className="block font-bold">{PERMISSION_LABELS[permission]}</span>
                    {hasOverride && <span className="text-amber-400">override</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'turnos' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <form onSubmit={handleSaveTurn} className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
            <h3 className="text-xs font-mono font-black text-cyan-400 uppercase">{editingTurnId ? 'Editar turno' : 'Crear turno'}</h3>
            <input value={turnCode} onChange={(e) => setTurnCode(e.target.value.toUpperCase())} disabled={!can('configuracion.manage_turns')} placeholder="Código" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-100 font-mono" required />
            <input value={turnName} onChange={(e) => setTurnName(e.target.value)} disabled={!can('configuracion.manage_turns')} placeholder="Nombre" className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-100" required />
            <div className="grid grid-cols-2 gap-2">
              <input type="time" value={turnStart} onChange={(e) => setTurnStart(e.target.value)} disabled={!can('configuracion.manage_turns')} className="bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-100" />
              <input type="time" value={turnEnd} onChange={(e) => setTurnEnd(e.target.value)} disabled={!can('configuracion.manage_turns')} className="bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-100" />
            </div>
            <select value={turnResponsable} onChange={(e) => setTurnResponsable(e.target.value)} disabled={!can('configuracion.manage_turns')} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-100">
              {activeUsers.map(user => <option key={user.id} value={user.id}>{user.username}</option>)}
            </select>
            <label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={turnActive} onChange={(e) => setTurnActive(e.target.checked)} /> Activo</label>
            <button disabled={!can('configuracion.manage_turns')} className="px-3 py-2 bg-cyan-500 disabled:bg-slate-800 text-slate-950 disabled:text-slate-500 rounded text-[10px] font-mono font-black uppercase">{editingTurnId ? 'Guardar' : 'Crear'}</button>
          </form>

          <div className="xl:col-span-2 bg-slate-900 border border-slate-800 rounded-lg overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-950 text-slate-500 font-mono uppercase text-[10px]">
                <tr><th className="p-3 text-left">Turno</th><th className="p-3 text-left">Horario</th><th className="p-3 text-left">Responsable</th><th className="p-3 text-left">Estado</th><th className="p-3 text-right">Acción</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {turns.map(turn => (
                  <tr key={turn.id}>
                    <td className="p-3 text-slate-100 font-bold">{turn.name} <span className="text-slate-500 font-mono">({turn.code})</span></td>
                    <td className="p-3 text-slate-400 font-mono">{turn.startTime} - {turn.endTime}</td>
                    <td className="p-3 text-slate-400">{userName(turn.responsableUserId)}</td>
                    <td className="p-3">{turn.active ? <span className="text-emerald-400">ACTIVO</span> : <span className="text-rose-400">INACTIVO</span>}</td>
                    <td className="p-3 text-right"><button onClick={() => handleEditTurn(turn)} className="text-[10px] text-amber-400 font-mono font-bold">Editar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'metas' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <form onSubmit={handleSaveGoal} className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
            <h3 className="text-xs font-mono font-black text-cyan-400 uppercase">{editingGoalId ? 'Editar meta' : 'Crear meta'}</h3>
            <select value={goalArea} onChange={(e) => setGoalArea(e.target.value as ProductionAreaId)} disabled={!can('configuracion.manage_goals')} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-100">
              {areaOptions.map(area => <option key={area.id} value={area.id}>{area.label}</option>)}
            </select>
            <select value={goalTurnId} onChange={(e) => setGoalTurnId(e.target.value)} disabled={!can('configuracion.manage_goals')} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-100">
              {turns.map(turn => <option key={turn.id} value={turn.id}>{turn.name}</option>)}
            </select>
            <select value={goalResponsable} onChange={(e) => setGoalResponsable(e.target.value)} disabled={!can('configuracion.manage_goals')} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-100">
              {activeUsers.map(user => <option key={user.id} value={user.id}>{user.username}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={goalMetaHora} onChange={(e) => setGoalMetaHora(Number(e.target.value))} disabled={!can('configuracion.manage_goals')} placeholder="Meta hora" className="bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-100" />
              <input type="number" value={goalMetaTurno} onChange={(e) => setGoalMetaTurno(Number(e.target.value))} disabled={!can('configuracion.manage_goals')} placeholder="Meta turno" className="bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-100" />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={goalActive} onChange={(e) => setGoalActive(e.target.checked)} /> Activa</label>
            <button disabled={!can('configuracion.manage_goals') || !turns.length || !activeUsers.length} className="px-3 py-2 bg-cyan-500 disabled:bg-slate-800 text-slate-950 disabled:text-slate-500 rounded text-[10px] font-mono font-black uppercase">{editingGoalId ? 'Guardar' : 'Crear'}</button>
          </form>

          <div className="xl:col-span-2 bg-slate-900 border border-slate-800 rounded-lg overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-950 text-slate-500 font-mono uppercase text-[10px]">
                <tr><th className="p-3 text-left">Área</th><th className="p-3 text-left">Turno</th><th className="p-3 text-right">Meta hora</th><th className="p-3 text-right">Meta turno</th><th className="p-3 text-left">Responsable</th><th className="p-3 text-right">Acción</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {productionGoals.map(goal => (
                  <tr key={goal.id}>
                    <td className="p-3 text-slate-100 font-bold">{areaLabel(goal.area)} {!goal.active && <span className="text-rose-400 text-[9px]">(OFF)</span>}</td>
                    <td className="p-3 text-slate-400">{turnLabel(goal.turnId)}</td>
                    <td className="p-3 text-right text-slate-300 font-mono">{goal.metaHora.toLocaleString()}</td>
                    <td className="p-3 text-right text-cyan-400 font-mono font-bold">{goal.metaTurno.toLocaleString()}</td>
                    <td className="p-3 text-slate-400">{userName(goal.responsableUserId)}</td>
                    <td className="p-3 text-right"><button onClick={() => handleEditGoal(goal)} className="text-[10px] text-amber-400 font-mono font-bold">Editar</button></td>
                  </tr>
                ))}
                {productionGoals.length === 0 && (
                  <tr><td colSpan={6} className="p-4 text-center text-slate-500 font-mono text-xs">Sin metas configuradas. Se usan metas fallback.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};
