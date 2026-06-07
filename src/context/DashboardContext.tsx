import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  Order, 
  Batch, 
  Machine, 
  Band, 
  QualityDefect, 
  AuditLog, 
  Tenant, 
  Role, 
  UserSession,
  TenantId,
  StageId
} from '../types';
import { 
  TENANTS, 
  CLIENTS, 
  MODELS, 
  INITIAL_ORDERS, 
  INITIAL_BATCHES, 
  INITIAL_MACHINES, 
  INITIAL_BANDS, 
  INITIAL_DEFECTS, 
  INITIAL_AUDITS 
} from '../data/mockData';

interface DashboardContextType {
  tenants: Tenant[];
  currentTenant: Tenant;
  setCurrentTenant: (tenantId: TenantId) => void;
  currentUser: UserSession;
  changeRole: (role: Role) => void;
  verifyOTP: (code: string) => boolean;
  clear2FA: () => void;
  orders: Order[];
  batches: Batch[];
  machines: Machine[];
  bands: Band[];
  defects: QualityDefect[];
  audits: AuditLog[];
  exchangeRate: number;
  setExchangeRate: (rate: number) => void;
  isOffline: boolean;
  toggleOffline: () => void;
  offlineQueue: any[];
  addAuditLog: (module: string, event: string, details: string) => void;
  addOrder: (order: Partial<Order>) => void;
  updateOrderDiscount: (orderId: string, discount: number, authorized: boolean) => void;
  moveBatchStage: (batchId: string, nextStage: StageId) => void;
  updateBatchStatus: (batchId: string, status: Batch['status']) => void;
  addBatch: (batch: Partial<Batch>) => void;
  softDeleteBatch: (batchId: string) => void;
  restoreBatch: (batchId: string) => void;
  addDefect: (defect: Partial<QualityDefect>) => void;
  resolveDefect: (defectId: string) => void;
  syncOfflineQueue: () => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export const DashboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Config state
  const [currentTenantId, setCurrentTenantId] = useState<TenantId>(() => {
    return (localStorage.getItem('plasyect_tenant_id') as TenantId) || 'plasyect_matriz';
  });
  
  const [currentUser, setCurrentUser] = useState<UserSession>(() => {
    const saved = localStorage.getItem('plasyect_user');
    if (saved) return JSON.parse(saved);
    return {
      username: 'Luis Felipe Bedia',
      email: 'lf.bedia@gmail.com',
      role: 'DIRECTOR_GENERAL',
      require2FA: true,
      has2FAVerified: true
    };
  });

  const [exchangeRate, setExchangeRateState] = useState<number>(() => {
    return parseFloat(localStorage.getItem('plasyect_exchange_rate') || '18.45');
  });

  const [isOffline, setIsOffline] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState<any[]>(() => {
    return JSON.parse(localStorage.getItem('plasyect_offline_queue') || '[]');
  });

  // Business entities state
  const [orders, setOrders] = useState<Order[]>(() => {
    const saved = localStorage.getItem('plasyect_orders');
    return saved ? JSON.parse(saved) : INITIAL_ORDERS;
  });

  const [batches, setBatches] = useState<Batch[]>(() => {
    const saved = localStorage.getItem('plasyect_batches');
    return saved ? JSON.parse(saved) : INITIAL_BATCHES;
  });

  const [machines, setMachines] = useState<Machine[]>(() => {
    const saved = localStorage.getItem('plasyect_machines');
    return saved ? JSON.parse(saved) : INITIAL_MACHINES;
  });

  const [bands, setBands] = useState<Band[]>(() => {
    const saved = localStorage.getItem('plasyect_bands');
    return saved ? JSON.parse(saved) : INITIAL_BANDS;
  });

  const [defects, setDefects] = useState<QualityDefect[]>(() => {
    const saved = localStorage.getItem('plasyect_defects');
    return saved ? JSON.parse(saved) : INITIAL_DEFECTS;
  });

  const [audits, setAudits] = useState<AuditLog[]>(() => {
    const saved = localStorage.getItem('plasyect_audits');
    return saved ? JSON.parse(saved) : INITIAL_AUDITS;
  });

  // Save to Web LocalStorage on change
  useEffect(() => {
    localStorage.setItem('plasyect_tenant_id', currentTenantId);
  }, [currentTenantId]);

  useEffect(() => {
    localStorage.setItem('plasyect_user', JSON.stringify(currentUser));
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('plasyect_orders', JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem('plasyect_batches', JSON.stringify(batches));
  }, [batches]);

  useEffect(() => {
    localStorage.setItem('plasyect_machines', JSON.stringify(machines));
  }, [machines]);

  useEffect(() => {
    localStorage.setItem('plasyect_bands', JSON.stringify(bands));
  }, [bands]);

  useEffect(() => {
    localStorage.setItem('plasyect_defects', JSON.stringify(defects));
  }, [defects]);

  useEffect(() => {
    localStorage.setItem('plasyect_audits', JSON.stringify(audits));
  }, [audits]);

  useEffect(() => {
    localStorage.setItem('plasyect_offline_queue', JSON.stringify(offlineQueue));
  }, [offlineQueue]);

  const currentTenant = TENANTS.find(t => t.id === currentTenantId) || TENANTS[0];

  const setExchangeRate = (rate: number) => {
    setExchangeRateState(rate);
    localStorage.setItem('plasyect_exchange_rate', rate.toString());
    addAuditLog('CONFIG', 'EXCHANGE_RATE_CHANGED', `Tasa de cambio manual establecida en $${rate} MXN/USD`);
  };

  const addAuditLog = (module: string, event: string, details: string) => {
    const newLog: AuditLog = {
      id: `aud_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      tenantId: currentTenantId,
      timestamp: new Date().toISOString(),
      userId: currentUser.email,
      userRole: currentUser.role,
      event,
      module,
      details
    };
    setAudits(prev => [newLog, ...prev]);
  };

  const setTenantIdAndLog = (id: TenantId) => {
    setCurrentTenantId(id);
    const targetName = TENANTS.find(t => t.id === id)?.name || id;
    const newLog: AuditLog = {
      id: `aud_${Date.now()}`,
      tenantId: id,
      timestamp: new Date().toISOString(),
      userId: currentUser.email,
      userRole: currentUser.role,
      event: 'TENANT_SWITCH',
      module: 'SYSTEM',
      details: `Cambiado a sucursal/tenant: ${targetName}`
    };
    setAudits(prev => [newLog, ...prev]);
  };

  const changeRole = (role: Role) => {
    const sensitive = role === 'DIRECTOR_GENERAL' || role === 'LIDER_ADMINISTRACION';
    setCurrentUser({
      username: currentUser.username,
      email: currentUser.email,
      role,
      require2FA: sensitive,
      has2FAVerified: !sensitive // If sensitive, they must verify OTP in the UI
    });
    addAuditLog('AUTH', 'ROLE_SWITCH', `Cambio de rol de usuario a: ${role} ${sensitive ? '(Requiere verificación 2FA por email)' : ''}`);
  };

  const verifyOTP = (code: string) => {
    // Simulated OTP verification. Our secret debug OTP is '123456'.
    if (code === '123456' || code === '654321') {
      setCurrentUser(prev => ({
        ...prev,
        has2FAVerified: true
      }));
      addAuditLog('AUTH', '2FA_VERIFICATION_SUCCESS', `Validación OTP exitosa para rol ${currentUser.role}`);
      return true;
    }
    addAuditLog('AUTH', '2FA_VERIFICATION_FAILED', `Intento fallido de validación OTP para ${currentUser.role}`);
    return false;
  };

  const clear2FA = () => {
    setCurrentUser(prev => ({
      ...prev,
      has2FAVerified: false
    }));
  };

  const toggleOffline = () => {
    setIsOffline(prev => {
      const next = !prev;
      addAuditLog('SYSTEM', next ? 'OFFLINE_ENTERED' : 'ONLINE_ENTERED', `Modo sin conexión ${next ? 'ACTIVADO' : 'DESACTIVADO'}`);
      if (!next && offlineQueue.length > 0) {
        // Just returned online
        syncOfflineQueue();
      }
      return next;
    });
  };

  const syncOfflineQueue = () => {
    offlineQueue.forEach(item => {
      addAuditLog('OFFLINE_SYNC', 'SYNC_ITEM', `Sincronizada acción local: ${item.action} - Detalles: ${JSON.stringify(item.payload)}`);
    });
    setOfflineQueue([]);
    addAuditLog('OFFLINE_SYNC', 'SYNC_COMPLETED', `Sincronización de cola completada con éxito. Multi-inquilino aislado.`);
  };

  // Business Actions
  const addOrder = (order: Partial<Order>) => {
    const newOrder: Order = {
      id: order.id || `PED-2026-${Math.floor(Math.random() * 899) + 100}`,
      tenantId: currentTenantId,
      clientId: order.clientId || 'cli_flexi',
      clientName: CLIENTS.find(c => c.id === order.clientId)?.name || 'Cliente Genérico',
      modelId: order.modelId || 'mod_spider',
      modelName: MODELS.find(m => m.id === order.modelId)?.name || 'Modelo Genérico',
      color: order.color || 'Negro',
      quantity: order.quantity || 1000,
      exchangeRate: exchangeRate,
      totalUSD: order.totalUSD || 3000,
      totalMXN: (order.totalUSD || 3000) * exchangeRate,
      createdAt: new Date().toISOString(),
      deliveryDate: order.deliveryDate || new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      status: 'PENDIENTE',
      discountAuthorized: order.discountAuthorized || false,
      discountPercentage: order.discountPercentage || 0
    };

    if (isOffline) {
      setOfflineQueue(prev => [...prev, { id: `off_${Date.now()}`, action: 'ADD_ORDER', payload: newOrder, timestamp: new Date().toISOString() }]);
    } else {
      setOrders(prev => [newOrder, ...prev]);
      addAuditLog('COMERCIAL', 'ORDER_CREATED', `Nuevo pedido ${newOrder.id} creado para ${newOrder.clientName}. Folio: ${newOrder.id}`);
    }
  };

  const updateOrderDiscount = (orderId: string, discount: number, authorized: boolean) => {
    setOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        const updated = {
          ...o,
          discountPercentage: discount,
          discountAuthorized: authorized,
          totalUSD: o.totalUSD * (1 - discount / 100),
          totalMXN: (o.totalUSD * (1 - discount / 100)) * o.exchangeRate
        };
        addAuditLog('COMERCIAL', 'DISCOUNT_AUTHORIZED_CHECK', 
          `Descuento de ${discount}% para ${orderId} ${authorized ? 'APROBADO por rol superior' : 'SOLICITADO / PENDIENTE'}`
        );
        return updated;
      }
      return o;
    }));
  };

  const moveBatchStage = (batchId: string, nextStage: StageId) => {
    setBatches(prev => prev.map(b => {
      if (b.id === batchId) {
        const prevStage = b.stage;
        const updated = { ...b, stage: nextStage, lastUpdate: new Date().toISOString() };
        
        if (isOffline) {
          setOfflineQueue(prevQueue => [...prevQueue, { id: `off_${Date.now()}`, action: 'MOVE_BATCH', payload: { batchId, nextStage }, timestamp: new Date().toISOString() }]);
        } else {
          addAuditLog('PRODUCCION', 'BATCH_STAGE_CHANGED', 
            `Lote ${batchId} movido de [${prevStage}] a [${nextStage}]`
          );
        }
        return updated;
      }
      return b;
    }));
  };

  const updateBatchStatus = (batchId: string, status: Batch['status']) => {
    setBatches(prev => prev.map(b => {
      if (b.id === batchId) {
        const prevStatus = b.status;
        const updated = { ...b, status, lastUpdate: new Date().toISOString() };
        addAuditLog('PRODUCCION', 'BATCH_STATUS_CHANGED', 
          `Estatus de lote ${batchId} cambiado de [${prevStatus}] a [${status}]`
        );
        return updated;
      }
      return b;
    }));
  };

  const addBatch = (batch: Partial<Batch>) => {
    const newBatch: Batch = {
      id: batch.id || `LOTE-26-${Math.floor(Math.random() * 899) + 100}`,
      tenantId: currentTenantId,
      orderId: batch.orderId || 'PED-2026-001',
      modelId: batch.modelId || 'mod_spider',
      modelName: MODELS.find(m => m.id === batch.modelId)?.name || 'Modelo Genérico',
      color: batch.color || 'Negro',
      size: batch.size || 26,
      quantityShoes: batch.quantityShoes || 1000,
      stage: batch.stage || 'alta_pedido',
      machineId: batch.machineId,
      operatorId: batch.operatorId || 'Operador Central',
      densityMeasured: batch.densityMeasured || 0.24,
      shrinkageRatio: batch.shrinkageRatio || 1.55,
      temperatureTarget: batch.temperatureTarget || 175,
      cycleTimeSeconds: batch.cycleTimeSeconds || 240,
      status: batch.status || 'OPTIMO',
      defectRate: batch.defectRate || 0.0,
      lastUpdate: new Date().toISOString()
    };

    if (isOffline) {
      setOfflineQueue(prev => [...prev, { id: `off_${Date.now()}`, action: 'ADD_BATCH', payload: newBatch, timestamp: new Date().toISOString() }]);
    } else {
      setBatches(prev => [newBatch, ...prev]);
      addAuditLog('PRODUCCION', 'BATCH_CREATED', `Nuevo Lote ${newBatch.id} asignado para modelo ${newBatch.modelName}`);
    }
  };

  const softDeleteBatch = (batchId: string) => {
    setBatches(prev => prev.map(b => {
      if (b.id === batchId) {
        addAuditLog('PRODUCCION', 'BATCH_ARCHIVED', `Lote ${batchId} ARCHIVADO. Purga automática programada en 30 días.`);
        return { ...b, status: 'ARCHIVED' as any, archivedAt: new Date().toISOString() };
      }
      return b;
    }));
  };

  const restoreBatch = (batchId: string) => {
    setBatches(prev => prev.map(b => {
      if (b.id === batchId) {
        addAuditLog('PRODUCCION', 'BATCH_RESTORED', `Lote ${batchId} RESTAURADO desde el archivo.`);
        const { archivedAt, ...rest } = b;
        return { ...rest, status: 'OPTIMO', lastUpdate: new Date().toISOString() } as Batch;
      }
      return b;
    }));
  };

  const addDefect = (defect: Partial<QualityDefect>) => {
    const newDefect: QualityDefect = {
      id: `def_${Date.now()}`,
      batchId: defect.batchId || '',
      defectType: defect.defectType || 'BURBUJA',
      severity: defect.severity || 'LEVE',
      detectedAt: new Date().toISOString(),
      inspectorName: defect.inspectorName || 'Inspector Turno',
      notes: defect.notes || '',
      resolved: false
    };

    setDefects(prev => [newDefect, ...prev]);

    // Automatically update related batch status triggers when severe defects appear
    if (newDefect.severity === 'GRAVE') {
      updateBatchStatus(newDefect.batchId, 'CRITICO');
    } else if (newDefect.severity === 'MODERADO') {
      updateBatchStatus(newDefect.batchId, 'ALERTA');
    }

    addAuditLog('CALIDAD', 'DEFECT_REPORTED', 
      `Defecto [${newDefect.defectType}] (${newDefect.severity}) reportado en Lote ${newDefect.batchId}`
    );
  };

  const resolveDefect = (defectId: string) => {
    setDefects(prev => prev.map(d => {
      if (d.id === defectId) {
        addAuditLog('CALIDAD', 'DEFECT_RESOLVED', `Defecto ${d.defectType} resuelto por inspector en Lote ${d.batchId}`);
        return { ...d, resolved: true };
      }
      return d;
    }));
  };

  return (
    <DashboardContext.Provider value={{
      tenants: TENANTS,
      currentTenant,
      setCurrentTenant: setTenantIdAndLog,
      currentUser,
      changeRole,
      verifyOTP,
      clear2FA,
      orders,
      batches,
      machines,
      bands,
      defects,
      audits,
      exchangeRate,
      setExchangeRate,
      isOffline,
      toggleOffline,
      offlineQueue,
      addAuditLog,
      addOrder,
      updateOrderDiscount,
      moveBatchStage,
      updateBatchStatus,
      addBatch,
      softDeleteBatch,
      restoreBatch,
      addDefect,
      resolveDefect,
      syncOfflineQueue
    }}>
      {children}
    </DashboardContext.Provider>
  );
};

export const useDashboard = () => {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
};
