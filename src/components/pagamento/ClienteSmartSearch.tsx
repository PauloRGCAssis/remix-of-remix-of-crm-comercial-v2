import { useMemo, useRef, useState, useEffect } from "react";
import { Search, X, Check, MapPin, Building2, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useClientProfiles } from "@/hooks/useClientProfiles";
import { useClientDirectory } from "@/hooks/useClientDirectory";
import { matchesClientQuery } from "@/lib/clientSearch";

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const norm = (v: string) =>
  (v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const digitsOnly = (v: string) => (v || "").replace(/\D+/g, "");

export interface ClienteFatItem {
  cliente: string;
  faturamento: number;
}

interface ClienteEnriquecido {
  cliente: string;
  faturamento: number;
  cidade?: string;
  cnpj?: string;
  vendedor?: string;
  doVendedor: boolean;
  temFaturamento: boolean;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Clientes com faturamento do vendedor no mês */
  clientesFaturamento: ClienteFatItem[];
  /** Vendedor atualmente selecionado (para priorizar) */
  vendedorAtual?: string;
  placeholder?: string;
  className?: string;
}

export function ClienteSmartSearch({
  value,
  onChange,
  clientesFaturamento,
  vendedorAtual,
  placeholder = "Buscar cliente por nome, cidade, CNPJ...",
  className,
}: Props) {
  const { data: profiles = [] } = useClientProfiles();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value ?? "");
  const { entries: directory } = useClientDirectory(search);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSearch(value ?? "");
  }, [value]);

  const enriched = useMemo<ClienteEnriquecido[]>(() => {
    const profileByName = new Map<string, typeof profiles[number]>();
    for (const p of profiles) profileByName.set(norm(p.nome), p);

    const fatMap = new Map(clientesFaturamento.map((c) => [norm(c.cliente), c.faturamento]));
    const seen = new Set<string>();
    const items: ClienteEnriquecido[] = [];

    // 1) primeiro os clientes do mês (faturamento)
    for (const c of clientesFaturamento) {
      const key = norm(c.cliente);
      seen.add(key);
      const p = profileByName.get(key);
      items.push({
        cliente: c.cliente,
        faturamento: c.faturamento,
        cidade: p?.cidade ?? p?.entrega_cidade,
        cnpj: p?.cnpj,
        vendedor: p?.vendedor,
        doVendedor: vendedorAtual ? norm(p?.vendedor ?? "") === norm(vendedorAtual) : false,
        temFaturamento: true,
      });
    }
    // 2) demais clientes cadastrados
    for (const p of profiles) {
      const key = norm(p.nome);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        cliente: p.nome,
        faturamento: fatMap.get(key) ?? 0,
        cidade: p.cidade ?? p.entrega_cidade,
        cnpj: p.cnpj,
        vendedor: p.vendedor,
        doVendedor: vendedorAtual ? norm(p.vendedor ?? "") === norm(vendedorAtual) : false,
        temFaturamento: false,
      });
    }
    // 3) base completa (clientes importados sem ficha cadastral)
    for (const e of directory) {
      const key = norm(e.nome);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        cliente: e.nome,
        faturamento: fatMap.get(key) ?? 0,
        cidade: e.cidade,
        cnpj: e.cnpj,
        vendedor: e.vendedor,
        doVendedor: vendedorAtual ? norm(e.vendedor ?? "") === norm(vendedorAtual) : false,
        temFaturamento: false,
      });
    }
    return items;
  }, [profiles, directory, clientesFaturamento, vendedorAtual]);

  const results = useMemo(() => {
    const q = search.trim();
    let list = enriched;
    if (q) {
      list = enriched.filter((it) =>
        matchesClientQuery(q, [it.cliente, it.cidade, it.vendedor], it.cnpj),
      );
    }
    // Ordenação: do vendedor + com faturamento primeiro, depois do vendedor, depois com fat, depois alfabético
    return [...list].sort((a, b) => {
      const scoreA = (a.doVendedor ? 2 : 0) + (a.temFaturamento ? 1 : 0);
      const scoreB = (b.doVendedor ? 2 : 0) + (b.temFaturamento ? 1 : 0);
      if (scoreB !== scoreA) return scoreB - scoreA;
      if (b.faturamento !== a.faturamento) return b.faturamento - a.faturamento;
      return a.cliente.localeCompare(b.cliente, "pt-BR");
    }).slice(0, 50);
  }, [enriched, search]);


  const select = (item: ClienteEnriquecido) => {
    onChange(item.cliente);
    setSearch(item.cliente);
    setOpen(false);
  };

  const clear = () => {
    onChange("");
    setSearch("");
    inputRef.current?.focus();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className={cn("relative", className)}>
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            value={search}
            onChange={(e) => { setSearch(e.target.value); if (!open) setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="h-8 pl-7 pr-7 text-xs"
          />
          {(search || value) && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); clear(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="p-0 w-[420px] max-w-[calc(100vw-2rem)]"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="max-h-[360px] overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              Nenhum cliente encontrado.
            </div>
          ) : (
            <ul className="py-1">
              {results.map((it) => {
                const selected = value === it.cliente;
                return (
                  <li key={it.cliente}>
                    <button
                      type="button"
                      onClick={() => select(it)}
                      className={cn(
                        "w-full text-left px-3 py-2 hover:bg-accent flex items-start gap-2",
                        selected && "bg-accent/60"
                      )}
                    >
                      <Check className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", selected ? "opacity-100 text-primary" : "opacity-0")} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium truncate">{it.cliente}</span>
                          {it.doVendedor && (
                            <Badge variant="secondary" className="h-4 px-1 text-[9px]">seu cliente</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                          {it.cidade && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {it.cidade}
                            </span>
                          )}
                          {it.cnpj && (
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {it.cnpj}
                            </span>
                          )}
                          {it.vendedor && (
                            <span className="inline-flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {it.vendedor}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {it.temFaturamento ? (
                          <div className="font-mono text-xs font-semibold">{fmt(it.faturamento)}</div>
                        ) : (
                          <div className="text-[10px] text-muted-foreground italic">sem faturamento no mês</div>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t px-3 py-1.5 flex items-center justify-between text-[10px] text-muted-foreground bg-muted/30">
          <span>{results.length} resultado(s)</span>
          <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setOpen(false)}>Fechar</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
