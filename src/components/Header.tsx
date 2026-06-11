import React, { useState } from 'react';
import {
  Bell,
  Wifi,
  WifiOff,
  RefreshCw,
  ShieldAlert,
  DollarSign,
  Lock,
  Sparkles,
  Search,
  CheckCircle2,
  Sliders,
  X,
  AlertOctagon,
  Menu
} from 'lucide-react';
import { useDashboard } from '../context/DashboardContext';
import { TenantId, Role } from '../types';

interface HeaderProps {
  onMenuClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const {
    tenants,
    currentTenant,
    setCurrentTenant,
    currentUser,
    changeRole,
    verifyOTP,
    clear2FA,
    exchangeRate,
    setExchangeRate,
    isOffline,
    toggleOffline,
    offlineQueue,
    audits
  } = useDashboard();

  const [isTenantDropdownOpen, setIsTenantDropdownOpen] = useState(false);
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [isRateModalOpen, setIsRateModalOpen] = useState(false);
  const [tempRate, setTempRate] = useState(exchangeRate.toString());
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState(false);
  const [otpSuccess, setOtpSuccess] = useState(false);

  const handleRateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(tempRate);
    if (!isNaN(parsed) && parsed > 0) {
      setExchangeRate(parsed);
      setIsRateModalOpen(false);
    }
  };

  const handleOTPSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyOTP(otpInput)) {
      setOtpSuccess(true);
      setOtpError(false);
      setTimeout(() => {
        setOtpSuccess(false);
        setOtpInput('');
      }, 2000);
    } else {
      setOtpError(true);
    }
  };

  const getSystemNoticeCount = () => {
    return offlineQueue.length;
  };

  const activeUserRequires2FA = currentUser.require2FA && !currentUser.has2FAVerified;

  return (
    <header className="h-14 md:h-16 bg-white border-b border-slate-200 flex items-center justify-between px-3 md:px-6 shrink-0 relative z-30 shadow-sm">

      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuClick}
        className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
        aria-label="Abrir menú"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Search and Scope Branding */}
      <div className="flex items-center gap-2 md:gap-6 min-w-0">
        <div className="flex items-center gap-1.5 md:gap-2 text-slate-500 min-w-0">
          <Sliders className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="hidden sm:inline text-xs font-bold tracking-wider font-mono uppercase text-slate-500">
            Filtro Tenant:
          </span>
          
          <div className="relative">
            <button 
              onClick={() => setIsTenantDropdownOpen(!isTenantDropdownOpen)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded text-xs font-bold text-blue-600 font-mono flex items-center gap-1.5 cursor-pointer"
            >
              {currentTenant.name.split(' - ')[0]}
              <span className="text-[10px] text-slate-500">▼</span>
            </button>

            {isTenantDropdownOpen && (
              <div className="absolute top-8 left-0 dropdown-menu bg-white border border-slate-200 rounded-md shadow-xl w-64 p-1 space-y-0.5 z-50 text-slate-800">
                {tenants.map(t => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setCurrentTenant(t.id);
                      setIsTenantDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded text-xs font-semibold block ${
                      currentTenant.id === t.id 
                        ? 'bg-blue-50 text-blue-600 font-bold border-l-2 border-l-blue-600' 
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                    }`}
                  >
                    <div>{t.name}</div>
                    <div className="text-[9px] text-slate-400 font-mono italic mt-0.5">{t.location}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Currency Switcher */}
        <div className="hidden lg:flex items-center gap-2 text-xs">
          <span className="text-slate-400 font-sans">Tipo de Cambio:</span>
          <button 
            onClick={() => {
              setTempRate(exchangeRate.toString());
              setIsRateModalOpen(true);
            }}
            className="flex items-center gap-1 bg-slate-50 px-2 py-1.5 rounded border border-slate-200 hover:bg-slate-100 hover:border-blue-500 text-slate-700 font-mono font-bold cursor-pointer transition-colors"
          >
            <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
            1 USD = {exchangeRate} MXN
            <span className="text-[9px] text-slate-400">✏️</span>
          </button>
        </div>
      </div>

      {/* Center 2FA Attention Banner */}
      {activeUserRequires2FA && (
        <div className="hidden md:flex items-center gap-2 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-sm text-rose-600 text-xs animate-pulse">
          <ShieldAlert className="w-4 h-4 text-rose-500" />
          <span className="font-bold">2FA PENDIENTE:</span> Operaciones Directivas bloqueadas.
        </div>
      )}

      {/* User settings, clock & actions */}
      <div className="flex items-center gap-2 md:gap-4 shrink-0">
        {/* Connection Status Button */}
        <button 
          onClick={toggleOffline}
          title={isOffline ? "Modo Offline Activo. Acciones en cola local." : "Conexión a Servidor Estable."}
          className={`px-3 py-1.5 rounded-lg border cursor-pointer hover:bg-opacity-80 transition-colors flex items-center gap-1.5 text-xs font-mono font-bold ${
            isOffline 
              ? 'bg-red-50 border-red-200 text-red-600' 
              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}
        >
          {isOffline ? (
            <>
              <WifiOff className="w-4 h-4 animate-bounce" />
              <span className="hidden sm:inline">OFFLINE</span>
            </>
          ) : (
            <>
              <Wifi className="w-4 h-4" />
              <span className="hidden sm:inline">ONLINE</span>
            </>
          )}
          {offlineQueue.length > 0 && (
            <span className="bg-amber-600 text-white rounded-full px-1.5 py-0.5 text-[9px] leading-none">
              {offlineQueue.length}
            </span>
          )}
        </button>

        {/* Audit Log Notifier */}
        <div className="relative">
          <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition-colors cursor-pointer flex items-center gap-1">
            <Bell className="w-4 h-4" />
            {getSystemNoticeCount() > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgb(245,158,11)]"></span>
            )}
          </div>
        </div>

        {/* Role Select and Information */}
        <div className="flex items-center gap-2 md:gap-3 border-l border-slate-200 pl-2 md:pl-4">
          <div className="hidden sm:block text-right">
            <div className="text-xs font-bold text-slate-800 tracking-wide font-sans">{currentUser.username}</div>
            <div className="relative">
              <button 
                onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                className="text-[10px] uppercase font-mono tracking-widest text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1 ml-auto cursor-pointer"
              >
                {currentUser.role.replace('_', ' ')}
                <span>▼</span>
              </button>

              {isRoleDropdownOpen && (
                <div className="absolute right-0 top-6 dropdown-menu bg-white border border-slate-200 rounded shadow-xl w-56 p-1 z-50 space-y-0.5 text-slate-800">
                  <div className="px-3 py-1.5 text-[9px] font-bold tracking-wider text-slate-400 border-b border-slate-100 uppercase">
                    Roles Perfiles Plasyect
                  </div>
                  {(['DIRECTOR_GENERAL', 'LIDER_ADMINISTRACION', 'LIDER_INYECCION', 'SUPERVISOR_CALIDAD'] as Role[]).map(role => (
                    <button
                      key={role}
                      onClick={() => {
                        changeRole(role);
                        setIsRoleDropdownOpen(false);
                      }}
                      className={`w-full text-right px-3 py-1.5 rounded text-[10px] font-mono leading-tight flex items-center justify-between ${
                        currentUser.role === role 
                          ? 'bg-blue-50 text-blue-600 font-bold border-l-2 border-l-blue-600' 
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {role === 'DIRECTOR_GENERAL' || role === 'LIDER_ADMINISTRACION' ? (
                        <Lock className="w-3 h-3 text-red-500 mr-2" />
                      ) : (
                        <span className="w-3" />
                      )}
                      {role.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="w-9 h-9 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center font-bold text-slate-700 text-xs shadow-inner select-none">
            {currentUser.role.includes('DIRECTOR') ? 'DG' : currentUser.role.includes('ADMIN') ? 'LA' : 'OP'}
          </div>
        </div>
      </div>

      {/* Manual Exchange Rate Modifer Modal */}
      {isRateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 shadow-2xl rounded-lg p-6 w-full max-w-sm text-slate-800">
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-2">
              <h3 className="text-sm font-bold tracking-wider font-mono text-blue-600 uppercase">Tasa de Cambio (Recalcular)</h3>
              <button onClick={() => setIsRateModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleRateSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-slate-500 block font-sans">
                  Tipo de cambio manual para recalculaciones generales MXN/USD:
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none font-mono font-bold text-slate-400">
                    $
                  </div>
                  <input 
                    type="number" 
                    step="0.01"
                    value={tempRate}
                    onChange={(e) => setTempRate(e.target.value)}
                    className="w-full pl-8 pr-12 py-2 bg-slate-50 border border-slate-200 rounded text-slate-800 font-mono text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="18.50"
                    required
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none font-mono text-xs text-slate-400 font-bold">
                    MXN
                  </div>
                </div>
              </div>
              <button 
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-sans font-bold py-2 rounded text-xs tracking-wider uppercase shadow-md shadow-blue-200 cursor-pointer"
              >
                Actualizar Conversión
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Floating 2FA Unlock Portal if role requires it & is not verified */}
      {activeUserRequires2FA && (
        <div className="fixed bottom-4 right-2 left-2 sm:left-auto sm:right-4 sm:w-80 bg-white border border-rose-200 rounded-lg p-4 sm:p-5 z-50 shadow-2xl text-slate-805">
          <div className="flex items-start gap-3">
            <AlertOctagon className="w-5 h-5 text-rose-500 shrink-0 mt-0.5 animate-pulse" />
            <div className="space-y-1 w-full">
              <h4 className="text-xs font-black text-rose-600 uppercase tracking-widest font-mono">Control de Acceso (2FA OTP)</h4>
              <p className="text-[10px] text-slate-500 font-sans">
                Se requiere confirmación OTP por email para desbloquear privilegios del rol <strong className="text-slate-700">{currentUser.role.replace('_', ' ')}</strong>.
              </p>
              
              <form onSubmit={handleOTPSubmit} className="mt-3 flex gap-2">
                <input 
                  type="text" 
                  value={otpInput}
                  onChange={(e) => {
                    setOtpInput(e.target.value);
                    setOtpError(false);
                  }}
                  maxLength={6}
                  placeholder="Debug: 123456"
                  className="bg-slate-50 border border-slate-200 rounded px-2.5 py-1 text-xs font-mono font-bold text-blue-600 focus:outline-none focus:border-blue-500 flex-1 placeholder:text-slate-400 placeholder:text-[10px]"
                />
                <button 
                  type="submit"
                  className="bg-rose-600 hover:bg-rose-700 text-white font-mono font-bold px-3 py-1 rounded text-[10px] uppercase tracking-wider cursor-pointer"
                >
                  Verificar
                </button>
              </form>

              {otpError && (
                <p className="text-[9px] text-red-500 font-bold font-mono">Código incorrecto. Intente con: 123456</p>
              )}
              {otpSuccess && (
                <div className="flex items-center gap-1 text-[9px] text-green-600 font-bold font-mono mt-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  Privilegios desbloqueados con éxito.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </header>
  );
};
