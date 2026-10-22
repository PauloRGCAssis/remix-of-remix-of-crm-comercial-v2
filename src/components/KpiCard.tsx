import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: number;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}

const variantStyles = {
  default: 'bg-card border-border',
  success: 'bg-card border-success/20',
  warning: 'bg-card border-warning/20',
  danger: 'bg-card border-destructive/20',
  info: 'bg-card border-info/20',
};

const iconVariantStyles = {
  default: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-destructive/10 text-destructive',
  info: 'bg-info/10 text-info',
};

export function KpiCard({ title, value, subtitle, icon: Icon, trend, variant = 'default', className }: KpiCardProps) {
  return (
    <div className={cn(
      "rounded-lg border p-4 md:p-5 shadow-card hover:shadow-card-hover transition-all duration-300 animate-fade-in",
      variantStyles[variant],
      className
    )}>
      <div className="flex items-start justify-between mb-3">
        <div className={cn("p-2 rounded-lg", iconVariantStyles[variant])}>
          <Icon className="h-4 w-4" />
        </div>
        {trend !== undefined && (
          <span className={cn(
            "text-xs font-semibold px-2 py-0.5 rounded-full",
            trend >= 0
              ? "bg-success/10 text-success"
              : "bg-destructive/10 text-destructive"
          )}>
            {trend >= 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">{title}</p>
        <p className="text-2xl font-bold text-card-foreground font-heading animate-count-up">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}
