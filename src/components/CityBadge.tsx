import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface CityBadgeProps {
  cidade?: string | null;
  estado?: string | null;
  className?: string;
  // Props legados (ignorados) para evitar quebra em chamadas existentes
  endereco?: string | null;
  bairro?: string | null;
  geoStatus?: unknown;
}

/**
 * Exibe apenas a cidade/UF que existe no cadastro do cliente.
 * Sem validações ou status técnicos.
 */
export function CityBadge({ cidade, estado, className }: CityBadgeProps) {
  const c = cidade?.trim();
  const uf = estado?.trim().toUpperCase();
  if (!c || !uf) return null;

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] h-5 gap-1 font-medium bg-secondary/60 text-foreground border-border",
        className,
      )}
    >
      <MapPin className="h-3 w-3" />
      {c}/{uf}
    </Badge>
  );
}
