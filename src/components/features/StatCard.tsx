import { type LucideIcon } from 'lucide-react';
import { useInteraction } from '@/hooks/useInteraction';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  gradient: 'blue' | 'emerald' | 'amber' | 'violet' | 'red' | 'teal';
  trend?: { value: number; label: string };
  onClick?: () => void;
  delay?: number;
}

const configs: Record<string, { bg: string; iconBg: string; iconColor: string; valueColor: string }> = {
  blue:    { bg: '#eff6ff', iconBg: '#dbeafe', iconColor: '#1d4ed8', valueColor: '#1e40af' },
  emerald: { bg: '#f0fdf4', iconBg: '#dcfce7', iconColor: '#15803d', valueColor: '#15803d' },
  amber:   { bg: '#fffbeb', iconBg: '#fef3c7', iconColor: '#b45309', valueColor: '#92400e' },
  violet:  { bg: '#fdf4ff', iconBg: '#f3e8ff', iconColor: '#7c3aed', valueColor: '#6d28d9' },
  red:     { bg: '#fef2f2', iconBg: '#fee2e2', iconColor: '#b91c1c', valueColor: '#991b1b' },
  teal:    { bg: '#f0fdf9', iconBg: '#d8f0f0', iconColor: '#1d6b6b', valueColor: '#1d6b6b' },
};

const StatCard = ({ title, value, subtitle, icon: Icon, gradient, trend, onClick, delay = 0 }: StatCardProps) => {
  const { interact } = useInteraction();
  const cfg = configs[gradient] || configs.teal;

  return (
    <div
      className="stat-card cursor-pointer select-none animate-fade-up"
      style={{ background: cfg.bg, borderColor: 'transparent', animationDelay: `${delay}ms` }}
      onClick={() => { interact('click'); onClick?.(); }}>
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: cfg.iconBg }}>
          <Icon className="w-5 h-5" style={{ color: cfg.iconColor }} />
        </div>
        {trend && (
          <div className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg"
            style={{ background: trend.value > 0 ? '#dcfce7' : '#fee2e2', color: trend.value > 0 ? '#15803d' : '#b91c1c' }}>
            <span>{trend.value > 0 ? '▲' : '▼'}</span>
            <span>{Math.abs(trend.value)}%</span>
          </div>
        )}
      </div>
      <p className="text-[11px] font-medium text-slate-400 mb-1">{title}</p>
      <p className="text-xl font-black leading-tight break-all" style={{ color: cfg.valueColor }}>{value}</p>
      {subtitle && <p className="text-[11px] text-slate-400 mt-1.5 leading-tight">{subtitle}</p>}
      {trend && <p className="text-[10px] text-slate-400 mt-0.5">{trend.label}</p>}
    </div>
  );
};

export default StatCard;
