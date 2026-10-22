import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  novo: { label: 'Novo', className: 'bg-info/20 text-info border-info/50' },
  ativo: { label: 'Ativo', className: 'bg-success/20 text-success border-success/50' },
  atencao: { label: 'Atenção', className: 'bg-warning/25 text-warning border-warning/60' },
  critico: { label: 'Crítico', className: 'bg-destructive/20 text-destructive border-destructive/50' },
  inativo: { label: 'Inativo', className: 'bg-destructive/15 text-destructive border-destructive/40' },
  perdido: { label: 'Perdido', className: 'bg-destructive/20 text-destructive border-destructive/50' },
  agendado: { label: 'Agendado', className: 'bg-info/20 text-info border-info/50' },
  concluida_sucesso: { label: 'Concluída ✓', className: 'bg-success/20 text-success border-success/50' },
  concluida_sem_sucesso: { label: 'Sem Sucesso', className: 'bg-destructive/20 text-destructive border-destructive/50' },
  cancelada: { label: 'Cancelada', className: 'bg-muted text-muted-foreground border-border' },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || { label: status, className: 'bg-muted text-muted-foreground border-border' };
  
  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border",
      config.className,
      className
    )}>
      {config.label}
    </span>
  );
}
