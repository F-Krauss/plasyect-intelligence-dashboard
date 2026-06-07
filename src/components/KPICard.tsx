import React from 'react';
import { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  subtext?: string;
  change?: string | number;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: LucideIcon;
  variant?: 'info' | 'success' | 'warning' | 'error' | 'royal';
}

export const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  subtext,
  change,
  changeType = 'neutral',
  icon: Icon,
  variant = 'info'
}) => {
  const getStyles = () => {
    switch (variant) {
      case 'success':
        return {
          wrapper: 'border-l-4 border-l-emerald-500 bg-white border border-slate-200',
          iconBg: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
          trendColor: 'text-emerald-600'
        };
      case 'warning':
        return {
          wrapper: 'border-l-4 border-l-amber-500 bg-white border border-slate-200',
          iconBg: 'bg-amber-50 text-amber-600 border border-amber-100',
          trendColor: 'text-amber-600'
        };
      case 'error':
        return {
          wrapper: 'border-l-4 border-l-rose-500 bg-white border border-slate-200',
          iconBg: 'bg-rose-50 text-rose-600 border border-rose-100',
          trendColor: 'text-rose-600'
        };
      case 'royal':
        return {
          wrapper: 'border-l-4 border-l-blue-600 bg-white border border-slate-200',
          iconBg: 'bg-indigo-50 text-indigo-600 border border-indigo-100',
          trendColor: 'text-indigo-600'
        };
      default:
        return {
          wrapper: 'border-l-4 border-l-blue-500 bg-white border border-slate-200',
          iconBg: 'bg-blue-50 text-blue-600 border border-blue-100',
          trendColor: 'text-blue-600'
        };
    }
  };

  const styles = getStyles();

  return (
    <div className={`p-5 rounded-lg transition-all duration-200 hover:scale-[1.01] hover:shadow-md ${styles.wrapper}`}>
      <div className="flex justify-between items-start">
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-sans">
            {title}
          </p>
          <p className="text-2xl font-bold tracking-tight text-slate-800">
            {value}
          </p>
        </div>
        <div className={`p-2.5 rounded-lg ${styles.iconBg}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      
      {(subtext || change !== undefined) && (
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
          <span className="text-slate-500 font-sans truncate pr-2">{subtext}</span>
          {change !== undefined && (
            <span className={`font-mono font-bold shrink-0 ${
              changeType === 'positive' ? 'text-emerald-600' :
              changeType === 'negative' ? 'text-rose-600' : 'text-slate-400'
            }`}>
              {changeType === 'positive' && '↑ '}
              {changeType === 'negative' && '↓ '}
              {change}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
