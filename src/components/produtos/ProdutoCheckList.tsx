import { useMemo, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Search } from "lucide-react";
import { searchProducts } from "@/lib/productSearch";

export interface ProdutoCheckItem {
  /** valor único usado na seleção (id ou nome) */
  value: string;
  /** rótulo exibido */
  label: string;
  /** texto pesquisável (nome + código + marca) */
  searchText: string;
  /** conteúdo extra à direita (ex.: custo/kg, marca) */
  right?: ReactNode;
}

interface Props {
  items: ProdutoCheckItem[];
  selected: string[];
  onToggle: (value: string, checked: boolean) => void;
  placeholder?: string;
  /** altura máxima da lista */
  maxHeightClass?: string;
  emptyLabel?: string;
}

/** Lista de produtos com busca rápida e inteligente (nome, código, recheio, gramatura). */
export function ProdutoCheckList({
  items,
  selected,
  onToggle,
  placeholder = "Buscar produto por nome, código ou recheio...",
  maxHeightClass = "max-h-52",
  emptyLabel = "Nenhum produto encontrado",
}: Props) {
  const [busca, setBusca] = useState("");
  const filtrados = useMemo(() => searchProducts(items, busca, (i) => i.searchText), [items, busca]);
  const sel = new Set(selected);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={placeholder}
          className="pl-8 h-8 text-sm"
        />
      </div>
      <div className={`${maxHeightClass} overflow-y-auto rounded-md border border-border divide-y divide-border`}>
        {filtrados.map((p) => (
          <label
            key={p.value}
            className="flex items-center gap-2 px-2 py-1.5 text-xs cursor-pointer hover:bg-accent/50"
          >
            <Checkbox checked={sel.has(p.value)} onCheckedChange={(v) => onToggle(p.value, v === true)} />
            <span className="flex-1 min-w-0">{p.label}</span>
            {p.right}
          </label>
        ))}
        {!filtrados.length && (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">{emptyLabel}</p>
        )}
      </div>
    </div>
  );
}
