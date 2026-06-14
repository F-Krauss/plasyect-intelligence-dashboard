import React, { useState } from 'react';
import {
  Bell,
  ShieldAlert,
  Lock,
  CheckCircle2,
  AlertOctagon,
  Menu
} from 'lucide-react';
import { useDashboard } from '../context/DashboardContext';
import { Role } from '../types';

interface HeaderProps {
  onMenuClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const {
    currentUser,
    changeRole,
    verifyOTP,
    offlineQueue,
  } = useDashboard();

  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState(false);
  const [otpSuccess, setOtpSuccess] = useState(false);

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
      <div className="min-w-0 flex-1" />

      {/* Center 2FA Attention Banner */}
      {activeUserRequires2FA && (
        <div className="hidden md:flex items-center gap-2 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-sm text-rose-600 text-xs animate-pulse">
          <ShieldAlert className="w-4 h-4 text-rose-500" />
          <span className="font-bold">2FA PENDIENTE:</span> Operaciones Directivas bloqueadas.
        </div>
      )}

      {/* User settings, clock & actions */}
      <div className="flex items-center gap-2 md:gap-4 shrink-0">
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
