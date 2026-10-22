import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Search } from "lucide-react";
import { clientMatchScore, matchesClientQuery } from "@/lib/clientSearch";
import type { ClientRef } from "@/lib/clientAddressMatch";

/**
 * Seletor de cliente com busca rápida (qualquer parte do nome, ignorando
 * acentos e maiúsculas/minúsculas). Usado na associação manual de endereços.
 */
export function ClienteSelectSearch({
  refs,
  onSelect,
  placeholder = "Associar a um cliente...",
  className = "h-8 w-[280px] text-xs",
}: {
  refs: ClientRef[];
  onSelect: (ref: ClientRef) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");

  const lista = useMemo(() => {
    const q = busca.trim();
    if (!q) return refs.slice(0, 80);
    return refs
      .filter((r) => matchesClientQuery(q, [r.nome, r.nomeFantasia, r.cidade, r.bairro], r.cnpj))
      .sort((a, b) => clientMatchScore(q, b.nome) - clientMatchScore(q, a.nome))
      .slice(0, 80);
  }, [refs, busca]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={`justify-start font-normal ${className}`}>
          <Search className="mr-2 h-3.5 w-3.5 shrink-0 opacity-60" />
          <span className="truncate">{placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] bg-popover p-0" align="end">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar cliente..." value={busca} onValueChange={setBusca} />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>Nenhum cliente encontrado</CommandEmpty>
            <CommandGroup>
              {lista.map((r, i) => (
                <CommandItem
                  key={`${r.id ?? "vendas"}-${r.nome}-${i}`}
                  value={`${r.nome}-${i}`}
                  onSelect={() => {
                    onSelect(r);
                    setOpen(false);
                    setBusca("");
                  }}
                  className="py-2"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">{r.nomeFantasia?.trim() || r.nome}</span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {[r.cidade, r.bairro, r.somenteVendas ? "somente vendas" : "ficha cadastrada"]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
