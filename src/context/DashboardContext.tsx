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
  StageId,
  AppUser,
  PermissionKey,
  ProductionTurn,
  ProductionGoal,
  ProductionAreaId
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
import { backendEnabled, dashboardApi, sendApiMutation } from '../api/dashboardApi';
import { clearHeavyLocalCaches, getStoredJson, getStoredString, setStoredJson, setStoredString } from '../utils/storage';

export const ALL_PERMISSION_KEYS: PermissionKey[] = [
  'dashboard.view',
  'pipeline_lote.view',
  'pipeline_pedido.view',
  'produccion_area.view',
  'modelos_productos.view',
  'calidad.view',
  'inyeccion.view',
  'banda.view',
  'aduana_liberacion.view',
  'embarque.view',
  'ocr_validacion.view',
  'reportes_historicos.view',
  'catalogos.view',
  'configuracion.view',
  'produccion_area.create_log',
  'produccion_area.export',
  'inyeccion.create_log',
  'inyeccion.export',
  'banda.create_log',
  'banda.export',
  'configuracion.manage_users',
  'configuracion.manage_permissions',
  'configuracion.manage_goals',
  'configuracion.manage_turns'
];

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  'dashboard.view': 'Ver Dashboard',
  'pipeline_lote.view': 'Ver Pipeline por Lote',
  'pipeline_pedido.view': 'Ver Pipeline por Pedido',
  'produccion_area.view': 'Ver Producción por Área',
  'modelos_productos.view': 'Ver Modelos y Productos',
  'calidad.view': 'Ver Calidad',
  'inyeccion.view': 'Ver Inyección',
  'banda.view': 'Ver Banda',
  'aduana_liberacion.view': 'Ver Aduana / Liberación',
  'embarque.view': 'Ver Embarque',
  'ocr_validacion.view': 'Ver OCR',
  'reportes_historicos.view': 'Ver Reportes',
  'catalogos.view': 'Ver Catálogos',
  'configuracion.view': 'Ver Configuración',
  'produccion_area.create_log': 'Crear logs Producción',
  'produccion_area.export': 'Exportar Producción',
  'inyeccion.create_log': 'Crear logs Inyección',
  'inyeccion.export': 'Exportar Inyección',
  'banda.create_log': 'Crear logs Banda',
  'banda.export': 'Exportar Banda',
  'configuracion.manage_users': 'Administrar usuarios',
  'configuracion.manage_permissions': 'Administrar permisos',
  'configuracion.manage_goals': 'Administrar metas',
  'configuracion.manage_turns': 'Administrar turnos'
};

export const ROLE_PERMISSION_DEFAULTS: Record<Role, PermissionKey[]> = {
  DIRECTOR_GENERAL: ALL_PERMISSION_KEYS,
  LIDER_ADMINISTRACION: [
    'dashboard.view',
    'pipeline_lote.view',
    'pipeline_pedido.view',
    'produccion_area.view',
    'modelos_productos.view',
    'reportes_historicos.view',
    'catalogos.view',
    'configuracion.view',
    'produccion_area.export',
    'inyeccion.export',
    'banda.export',
    'configuracion.manage_users',
    'configuracion.manage_permissions',
    'configuracion.manage_goals',
    'configuracion.manage_turns'
  ],
  LIDER_INYECCION: [
    'dashboard.view',
    'pipeline_lote.view',
    'produccion_area.view',
    'inyeccion.view',
    'banda.view',
    'produccion_area.create_log',
    'produccion_area.export',
    'inyeccion.create_log',
    'inyeccion.export',
    'banda.create_log',
    'banda.export'
  ],
  SUPERVISOR_CALIDAD: [
    'dashboard.view',
    'pipeline_lote.view',
    'modelos_productos.view',
    'calidad.view',
    'aduana_liberacion.view',
    'ocr_validacion.view',
    'reportes_historicos.view'
  ]
};

const DEFAULT_TURNS: Omit<ProductionTurn, 'tenantId'>[] = [
  { id: 'turno_manana', code: 'MAÑANA', name: 'Turno Mañana', startTime: '07:00', endTime: '14:59', active: true },
  { id: 'turno_tarde', code: 'TARDE', name: 'Turno Tarde', startTime: '15:00', endTime: '22:59', active: true },
  { id: 'turno_noche', code: 'NOCHE', name: 'Turno Noche', startTime: '23:00', endTime: '06:59', active: true }
];

const createDefaultUsers = (tenantId: TenantId): AppUser[] => [
  {
    id: `usr_${tenantId}_director`,
    tenantId,
    username: 'Luis Felipe Bedia',
    password: 'director123',
    roles: ['DIRECTOR_GENERAL'],
    permissionOverrides: {},
    active: true
  },
  {
    id: `usr_${tenantId}_inyeccion`,
    tenantId,
    username: 'Carlos Mendoza',
    password: 'inyeccion123',
    roles: ['LIDER_INYECCION'],
    permissionOverrides: {},
    active: true
  },
  {
    id: `usr_${tenantId}_calidad`,
    tenantId,
    username: 'Elena G.',
    password: 'calidad123',
    roles: ['SUPERVISOR_CALIDAD'],
    permissionOverrides: {},
    active: true
  }
];

const createDefaultTurns = (tenantId: TenantId): ProductionTurn[] =>
  DEFAULT_TURNS.map(turn => ({ ...turn, tenantId }));

interface DashboardContextType {
  tenants: Tenant[];
  currentTenant: Tenant;
  setCurrentTenant: (tenantId: TenantId) => void;
  currentUser: UserSession;
  changeRole: (role: Role) => void;
  users: AppUser[];
  turns: ProductionTurn[];
  productionGoals: ProductionGoal[];
  addUser: (user: Pick<AppUser, 'username' | 'password' | 'roles'>) => void;
  updateUser: (userId: string, updates: Partial<Pick<AppUser, 'username' | 'password' | 'roles' | 'permissionOverrides' | 'active'>>) => void;
  toggleUserActive: (userId: string) => void;
  activateUser: (userId: string) => void;
  addTurn: (turn: Omit<ProductionTurn, 'id' | 'tenantId'>) => void;
  updateTurn: (turnId: string, updates: Partial<Omit<ProductionTurn, 'id' | 'tenantId'>>) => void;
  addProductionGoal: (goal: Omit<ProductionGoal, 'id' | 'tenantId'>) => void;
  updateProductionGoal: (goalId: string, updates: Partial<Omit<ProductionGoal, 'id' | 'tenantId'>>) => void;
  getEffectivePermissions: (user?: AppUser) => Set<PermissionKey>;
  can: (permission: PermissionKey) => boolean;
  getGoalForAreaTurn: (area: ProductionAreaId, turnCode?: string) => ProductionGoal | undefined;
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
    return (getStoredString('plasyect_tenant_id') as TenantId) || 'plasyect_matriz';
  });
  
  const [currentUser, setCurrentUser] = useState<UserSession>(() => {
    return getStoredJson<UserSession>('plasyect_user', {
      username: 'Luis Felipe Bedia',
      email: 'lf.bedia@gmail.com',
      role: 'DIRECTOR_GENERAL',
      require2FA: true,
      has2FAVerified: true
    });
  });

  const [users, setUsers] = useState<AppUser[]>(() => {
    return getStoredJson<AppUser[]>('plasyect_config_users', createDefaultUsers('plasyect_matriz'));
  });

  const [turns, setTurns] = useState<ProductionTurn[]>(() => {
    return getStoredJson<ProductionTurn[]>('plasyect_config_turns', createDefaultTurns('plasyect_matriz'));
  });

  const [productionGoals, setProductionGoals] = useState<ProductionGoal[]>(() => {
    return getStoredJson<ProductionGoal[]>('plasyect_config_goals', []);
  });

  const [exchangeRate, setExchangeRateState] = useState<number>(() => {
    return parseFloat(getStoredString('plasyect_exchange_rate') || '18.45');
  });

  const [isOffline, setIsOffline] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState<any[]>(() => {
    return getStoredJson<any[]>('plasyect_offline_queue', []);
  });

  // Business entities state
  const [orders, setOrders] = useState<Order[]>(() => {
    return backendEnabled ? INITIAL_ORDERS : getStoredJson<Order[]>('plasyect_orders', INITIAL_ORDERS);
  });

  const [batches, setBatches] = useState<Batch[]>(() => {
    return backendEnabled ? INITIAL_BATCHES : getStoredJson<Batch[]>('plasyect_batches', INITIAL_BATCHES);
  });

  const [machines, setMachines] = useState<Machine[]>(() => {
    return backendEnabled ? INITIAL_MACHINES : getStoredJson<Machine[]>('plasyect_machines', INITIAL_MACHINES);
  });

  const [bands, setBands] = useState<Band[]>(() => {
    return backendEnabled ? INITIAL_BANDS : getStoredJson<Band[]>('plasyect_bands', INITIAL_BANDS);
  });

  const [defects, setDefects] = useState<QualityDefect[]>(() => {
    return backendEnabled ? INITIAL_DEFECTS : getStoredJson<QualityDefect[]>('plasyect_defects', INITIAL_DEFECTS);
  });

  const [audits, setAudits] = useState<AuditLog[]>(() => {
    return backendEnabled ? INITIAL_AUDITS : getStoredJson<AuditLog[]>('plasyect_audits', INITIAL_AUDITS);
  });

  useEffect(() => {
    if (!backendEnabled) return;
    clearHeavyLocalCaches();
    let active = true;
    dashboardApi.bootstrap()
      .then(data => {
        if (!active) return;
        setOrders(data.orders);
        setBatches(data.batches);
        setMachines(data.machines);
        setBands(data.bands);
        setDefects(data.defects);
        setAudits(data.audits);
      })
      .catch(error => {
        console.warn('Backend bootstrap failed. Using local dashboard data.', error);
      });
    return () => {
      active = false;
    };
  }, []);

  // Save to Web LocalStorage on change
  useEffect(() => {
    setStoredString('plasyect_tenant_id', currentTenantId);
  }, [currentTenantId]);

  useEffect(() => {
    setStoredJson('plasyect_user', currentUser);
  }, [currentUser]);

  useEffect(() => {
    setUsers(prev => {
      const hasTenantUsers = prev.some(user => user.tenantId === currentTenantId);
      return hasTenantUsers ? prev : [...prev, ...createDefaultUsers(currentTenantId)];
    });
    setTurns(prev => {
      const hasTenantTurns = prev.some(turn => turn.tenantId === currentTenantId);
      return hasTenantTurns ? prev : [...prev, ...createDefaultTurns(currentTenantId)];
    });
  }, [currentTenantId]);

  useEffect(() => {
    setStoredJson('plasyect_config_users', users);
  }, [users]);

  useEffect(() => {
    setStoredJson('plasyect_config_turns', turns);
  }, [turns]);

  useEffect(() => {
    setStoredJson('plasyect_config_goals', productionGoals);
  }, [productionGoals]);

  useEffect(() => {
    if (!backendEnabled) setStoredJson('plasyect_orders', orders);
  }, [orders]);

  useEffect(() => {
    if (!backendEnabled) setStoredJson('plasyect_batches', batches);
  }, [batches]);

  useEffect(() => {
    if (!backendEnabled) setStoredJson('plasyect_machines', machines);
  }, [machines]);

  useEffect(() => {
    if (!backendEnabled) setStoredJson('plasyect_bands', bands);
  }, [bands]);

  useEffect(() => {
    if (!backendEnabled) setStoredJson('plasyect_defects', defects);
  }, [defects]);

  useEffect(() => {
    if (!backendEnabled) setStoredJson('plasyect_audits', audits);
  }, [audits]);

  useEffect(() => {
    setStoredJson('plasyect_offline_queue', offlineQueue);
  }, [offlineQueue]);

  const currentTenant = TENANTS.find(t => t.id === currentTenantId) || TENANTS[0];
  const tenantUsers = users.filter(user => user.tenantId === currentTenantId);
  const tenantTurns = turns.filter(turn => turn.tenantId === currentTenantId);
  const tenantGoals = productionGoals.filter(goal => goal.tenantId === currentTenantId);

  const getCurrentAppUser = () => {
    return tenantUsers.find(user => user.username === currentUser.username && user.active);
  };

  const getEffectivePermissions = (user?: AppUser) => {
    const targetUser = user || getCurrentAppUser();
    const baseRoles = targetUser?.roles || [currentUser.role];
    const permissionSet = new Set<PermissionKey>();

    baseRoles.forEach(role => {
      (ROLE_PERMISSION_DEFAULTS[role] || []).forEach(permission => permissionSet.add(permission));
    });

    if (targetUser?.permissionOverrides) {
      Object.entries(targetUser.permissionOverrides).forEach(([permission, allowed]) => {
        if (allowed) permissionSet.add(permission as PermissionKey);
        else permissionSet.delete(permission as PermissionKey);
      });
    }

    return permissionSet;
  };

  const can = (permission: PermissionKey) => getEffectivePermissions().has(permission);

  const getGoalForAreaTurn = (area: ProductionAreaId, turnCode?: string) => {
    const activeTurns = tenantTurns.filter(turn => turn.active);
    const matchingTurn = turnCode
      ? activeTurns.find(turn => turn.code === turnCode || turn.name === turnCode || turn.id === turnCode)
      : activeTurns[0];
    return tenantGoals.find(goal => goal.active && goal.area === area && (!matchingTurn || goal.turnId === matchingTurn.id));
  };

  const addUser = (user: Pick<AppUser, 'username' | 'password' | 'roles'>) => {
    const newUser: AppUser = {
      id: `usr_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      tenantId: currentTenantId,
      username: user.username,
      password: user.password,
      roles: user.roles.length ? user.roles : ['LIDER_INYECCION'],
      permissionOverrides: {},
      active: true
    };
    setUsers(prev => [newUser, ...prev]);
    addAuditLog('CONFIG', 'USER_CREATED', `Usuario ${newUser.username} creado con roles ${newUser.roles.join(', ')}`);
  };

  const updateUser = (userId: string, updates: Partial<Pick<AppUser, 'username' | 'password' | 'roles' | 'permissionOverrides' | 'active'>>) => {
    setUsers(prev => prev.map(user => {
      if (user.id !== userId) return user;
      const updated = { ...user, ...updates };
      addAuditLog('CONFIG', 'USER_UPDATED', `Usuario ${updated.username} actualizado`);
      return updated;
    }));
  };

  const toggleUserActive = (userId: string) => {
    setUsers(prev => prev.map(user => {
      if (user.id !== userId) return user;
      const updated = { ...user, active: !user.active };
      addAuditLog('CONFIG', updated.active ? 'USER_ENABLED' : 'USER_DISABLED', `Usuario ${updated.username} ${updated.active ? 'activado' : 'desactivado'}`);
      return updated;
    }));
  };

  const activateUser = (userId: string) => {
    const target = users.find(user => user.id === userId);
    if (!target) return;
    const primaryRole = target.roles[0] || 'LIDER_INYECCION';
    const sensitive = primaryRole === 'DIRECTOR_GENERAL' || primaryRole === 'LIDER_ADMINISTRACION';
    setCurrentUser({
      username: target.username,
      email: `${target.username.toLowerCase().replace(/\s+/g, '.')}@plasyect.local`,
      role: primaryRole,
      require2FA: sensitive,
      has2FAVerified: !sensitive
    });
    addAuditLog('AUTH', 'USER_ACTIVATED', `Usuario activo cambiado a ${target.username}`);
  };

  const addTurn = (turn: Omit<ProductionTurn, 'id' | 'tenantId'>) => {
    const newTurn: ProductionTurn = {
      ...turn,
      id: `turn_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      tenantId: currentTenantId
    };
    setTurns(prev => [newTurn, ...prev]);
    addAuditLog('CONFIG', 'TURN_CREATED', `Turno ${newTurn.name} creado (${newTurn.startTime}-${newTurn.endTime})`);
  };

  const updateTurn = (turnId: string, updates: Partial<Omit<ProductionTurn, 'id' | 'tenantId'>>) => {
    setTurns(prev => prev.map(turn => {
      if (turn.id !== turnId) return turn;
      const updated = { ...turn, ...updates };
      addAuditLog('CONFIG', 'TURN_UPDATED', `Turno ${updated.name} actualizado`);
      return updated;
    }));
  };

  const addProductionGoal = (goal: Omit<ProductionGoal, 'id' | 'tenantId'>) => {
    const newGoal: ProductionGoal = {
      ...goal,
      id: `goal_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      tenantId: currentTenantId
    };
    setProductionGoals(prev => [newGoal, ...prev]);
    addAuditLog('CONFIG', 'PRODUCTION_GOAL_CREATED', `Meta creada para ${newGoal.area}: ${newGoal.metaTurno} pares por turno`);
  };

  const updateProductionGoal = (goalId: string, updates: Partial<Omit<ProductionGoal, 'id' | 'tenantId'>>) => {
    setProductionGoals(prev => prev.map(goal => {
      if (goal.id !== goalId) return goal;
      const updated = { ...goal, ...updates };
      addAuditLog('CONFIG', 'PRODUCTION_GOAL_UPDATED', `Meta actualizada para ${updated.area}: ${updated.metaTurno} pares por turno`);
      return updated;
    }));
  };

  const setExchangeRate = (rate: number) => {
    setExchangeRateState(rate);
    setStoredString('plasyect_exchange_rate', rate.toString());
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
    sendApiMutation(dashboardApi.createAudit(newLog));
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
      sendApiMutation(dashboardApi.createOrder(newOrder));
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
        sendApiMutation(dashboardApi.updateOrderDiscount(orderId, discount, authorized));
        return updated;
      }
      return o;
    }));
  };

  const moveBatchStage = (batchId: string, nextStage: StageId) => {
    setBatches(prev => prev.map(b => {
      if (b.id === batchId) {
        const prevStage = b.stage;
        const isDelivered = nextStage === 'embarque';
        const updated = {
          ...b,
          stage: nextStage,
          etapaActual: nextStage,
          status: isDelivered ? 'ENTREGADO' as Batch['status'] : b.status,
          estatus: isDelivered ? 'ENTREGADO' as Batch['estatus'] : b.estatus,
          ultimoEscaneo: new Date().toISOString(),
          lastUpdate: new Date().toISOString()
        };
        
        if (isOffline) {
          setOfflineQueue(prevQueue => [...prevQueue, { id: `off_${Date.now()}`, action: 'MOVE_BATCH', payload: { batchId, nextStage }, timestamp: new Date().toISOString() }]);
        } else {
          addAuditLog('PRODUCCION', 'BATCH_STAGE_CHANGED', 
            `Lote ${batchId} movido de [${prevStage}] a [${nextStage}]`
          );
          sendApiMutation(dashboardApi.moveBatchStage(batchId, nextStage));
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
        sendApiMutation(dashboardApi.updateBatchStatus(batchId, status));
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
      sendApiMutation(dashboardApi.createBatch(newBatch));
    }
  };

  const softDeleteBatch = (batchId: string) => {
    setBatches(prev => prev.map(b => {
      if (b.id === batchId) {
        addAuditLog('PRODUCCION', 'BATCH_ARCHIVED', `Lote ${batchId} ARCHIVADO. Purga automática programada en 30 días.`);
        sendApiMutation(dashboardApi.archiveBatch(batchId));
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
        sendApiMutation(dashboardApi.restoreBatch(batchId));
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
    sendApiMutation(dashboardApi.createDefect(newDefect));

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
        sendApiMutation(dashboardApi.resolveDefect(defectId));
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
      users: tenantUsers,
      turns: tenantTurns,
      productionGoals: tenantGoals,
      addUser,
      updateUser,
      toggleUserActive,
      activateUser,
      addTurn,
      updateTurn,
      addProductionGoal,
      updateProductionGoal,
      getEffectivePermissions,
      can,
      getGoalForAreaTurn,
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
