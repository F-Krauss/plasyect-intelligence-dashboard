import React, { useState } from 'react';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  type: 'line' | 'bar' | 'donut' | 'radar';
  data: { label: string; value: number; color?: string; secondaryValue?: number }[];
  yAxisLabel?: string;
  height?: number;
}

export const ChartCard: React.FC<ChartCardProps> = ({
  title,
  subtitle,
  type,
  data,
  yAxisLabel = '',
  height = 200
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const maxValue = Math.max(...data.map(d => d.value), 1);
  const totalValue = data.reduce((acc, current) => acc + current.value, 0);

  // Line Chart calculation
  const paddingX = 40;
  const paddingY = 30;
  const chartWidth = 500;
  const chartHeight = height - paddingY * 2;

  const points = data.map((d, index) => {
    const x = paddingX + (index / (data.length - 1 || 1)) * (chartWidth - paddingX * 2);
    const y = height - paddingY - (d.value / maxValue) * chartHeight;
    return { x, y, ...d };
  });

  const pathD = points.length > 0
    ? `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
    : '';

  // Gradient area path for line chart
  const areaD = points.length > 0
    ? `${pathD} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`
    : '';

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between shadow-sm">
      <div>
        <div className="flex justify-between items-start mb-1">
          <h4 className="text-xs font-bold text-slate-700 tracking-widest uppercase font-mono">{title}</h4>
          {yAxisLabel && <span className="text-[10px] font-mono text-slate-400 uppercase">{yAxisLabel}</span>}
        </div>
        {subtitle && <p className="text-xs text-slate-500 mb-4">{subtitle}</p>}
      </div>

      <div className="grow flex items-center justify-center relative my-2" style={{ height: `${height}px` }}>
        {type === 'bar' && (
          <div className="w-full h-full flex items-end justify-between px-2 gap-2 pt-6">
            {data.map((item, idx) => {
              const pct = (item.value / maxValue) * 100;
              return (
                <div 
                  key={idx} 
                  className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer"
                  onMouseEnter={() => setHoverIndex(idx)}
                  onMouseLeave={() => setHoverIndex(null)}
                >
                  <div className="text-[10px] font-mono text-white opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 px-2 py-1 rounded mb-1 absolute top-0 z-10">
                    {item.value.toLocaleString()} {yAxisLabel}
                  </div>
                  <div 
                    className={`w-full rounded-t-sm transition-all duration-300 ${
                      hoverIndex === idx 
                        ? 'bg-blue-600 shadow-md shadow-blue-200/50' 
                        : item.color || 'bg-slate-300'
                    }`}
                    style={{ height: `${pct}%` }}
                  />
                  <div className="text-[10px] text-slate-500 font-mono mt-2 truncate w-full text-center tracking-tight">
                    {item.label}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {type === 'line' && (
          <svg className="w-full h-full" viewBox={`0 0 ${chartWidth} ${height}`}>
            <defs>
              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            {/* Grid Lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
              const y = paddingY + p * chartHeight;
              const val = (maxValue * (1 - p)).toFixed(0);
              return (
                <g key={i}>
                  <line 
                    x1={paddingX} 
                    y1={y} 
                    x2={chartWidth - paddingX} 
                    y2={y} 
                    stroke="#f1f5f9" 
                    strokeWidth="1" 
                  />
                  <text 
                    x={2} 
                    y={y + 3} 
                    fill="#94a3b8" 
                    fontSize="9" 
                    fontFamily="monospace"
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            {/* Area */}
            {areaD && (
              <path d={areaD} fill="url(#areaGradient)" />
            )}

            {/* Line */}
            {pathD && (
              <path 
                d={pathD} 
                fill="none" 
                stroke="#2563eb" 
                strokeWidth="2.5"
                className="drop-shadow-sm"
              />
            )}

            {/* Circles */}
            {points.map((p, idx) => (
              <g key={idx}>
                <circle 
                  cx={p.x} 
                  cy={p.y} 
                  r={hoverIndex === idx ? 6 : 4} 
                  fill={hoverIndex === idx ? '#2563eb' : '#ffffff'} 
                  stroke="#2563eb" 
                  strokeWidth="2" 
                  className="cursor-pointer transition-all duration-200"
                  onMouseEnter={() => setHoverIndex(idx)}
                  onMouseLeave={() => setHoverIndex(null)}
                />
                
                {/* Horizontal X axis label */}
                <text 
                  x={p.x} 
                  y={height - 8} 
                  fill="#64748b" 
                  fontSize="9" 
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  {p.label}
                </text>

                {/* Hover value tooltip */}
                {hoverIndex === idx && (
                  <g>
                    <rect 
                      x={p.x - 45} 
                      y={p.y - 28} 
                      width="90" 
                      height="20" 
                      rx="3" 
                      fill="#1e293b" 
                    />
                    <text 
                      x={p.x} 
                      y={p.y - 15} 
                      fill="#ffffff" 
                      fontSize="9" 
                      fontFamily="monospace" 
                      textAnchor="middle"
                    >
                      {p.value.toLocaleString()} {yAxisLabel}
                    </text>
                  </g>
                )}
              </g>
            ))}
          </svg>
        )}

        {type === 'donut' && (
          <div className="flex items-center w-full gap-4">
            <svg width="140" height="140" viewBox="0 0 140 140" className="shrink-0">
              <circle cx="70" cy="70" r="50" fill="none" stroke="#f1f5f9" strokeWidth="16" />
              {(() => {
                let accumulatedAngle = 0;
                return data.map((item, idx) => {
                  const percentage = item.value / (totalValue || 1);
                  const strokeDash = percentage * 314; // Circle perimeter with r=50 is ~314
                  const strokeOffset = 314 - strokeDash + accumulatedAngle;
                  accumulatedAngle -= strokeDash;

                  return (
                    <circle
                      key={idx}
                      cx="70"
                      cy="70"
                      r="50"
                      fill="none"
                      stroke={item.color || '#2563eb'}
                      strokeWidth={hoverIndex === idx ? 20 : 16}
                      strokeDasharray="314"
                      strokeDashoffset={strokeOffset}
                      transform="rotate(-90 70 70)"
                      className="transition-all duration-250 cursor-pointer"
                      onMouseEnter={() => setHoverIndex(idx)}
                      onMouseLeave={() => setHoverIndex(null)}
                    />
                  );
                });
              })()}
              <circle cx="70" cy="70" r="32" fill="#ffffff" />
              <text 
                x="70" 
                y="74" 
                textAnchor="middle" 
                fill="#334155" 
                className="font-mono text-xs font-bold"
              >
                {hoverIndex !== null ? `${((data[hoverIndex].value / totalValue) * 100).toFixed(0)}%` : 'Total'}
              </text>
            </svg>
            <div className="flex flex-col gap-1 w-full text-left">
              {data.map((item, idx) => (
                <div 
                  key={idx} 
                  className={`flex items-center justify-between p-1.5 rounded transition ${
                    hoverIndex === idx ? 'bg-slate-50' : ''
                  }`}
                  onMouseEnter={() => setHoverIndex(idx)}
                  onMouseLeave={() => setHoverIndex(null)}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-xs text-slate-600 font-sans truncate pr-2 max-w-[120px]">{item.label}</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-800">{item.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
