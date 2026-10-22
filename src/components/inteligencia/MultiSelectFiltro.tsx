import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronDown } from "lucide-react";
import { normalizeSearchText } from "@/lib/clientSearch";

export interface OpcaoFiltro {
  value: string;
  label: string;
  /** texto auxiliar exibido abaixo do rótulo (cidade, CNPJ, código...) */
  sub?: string;
  /** termos extras pesquisáveis (aliases, razão social, CNPJ, grupo) */
  termos?: string[];
}

interface Props {
  /** rótulo quando nada está selecionado (ex.: "Empresa inteira", "Todos os clientes") */
  placeholderTodos: string;
  opcoes: OpcaoFiltro[];
  selecionados: string[];
  onChange: (valores: string[]) => void;
  buscaPlaceholder?: string;
  /** quantos nomes cabem antes de mostrar "N selecionados" */
  maxNomes?: number;
  disabled?: boolean;
}

export function MultiSelectFiltro({
  placeholderTodos,
  opcoes,
  selecionados,
  onChange,
  buscaPlaceholder = "Buscar...",
  maxNomes = 3,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");

  const indice = useMemo(
    () =>
      opcoes.map((o) => ({
        opcao: o,
        hay: normalizeSearchText([o.label, o.sub, ...(o.termos ?? [])].filter(Boolean).join(" ")),
      })),
    [opcoes],
  );

  const filtradas = useMemo(() => {
    const q = normalizeSearchText(busca);
    const tokens = q.split(" ").filter(Boolean);
    const base = tokens.length ? indice.filter((i) => tokens.every((t) => i.hay.includes(t))) : indice;
    return base.slice(0, 400).map((i) => i.opcao);
  }, [indice, busca]);

  const setSel = new Set(selecionados);

  // Mantém sempre visíveis os já selecionados, mesmo com nova busca.
  const visiveis = useMemo(() => {
    const jaSelecionados = opcoes.filter((o) => setSel.has(o.value));
    const restantes = filtradas.filter((o) => !setSel.has(o.value));
    return [...jaSelecionados, ...restantes];
  }, [filtradas, opcoes, selecionados.join("|")]);

  const toggle = (value: string) => {
    onChange(setSel.has(value) ? selecionados.filter((v) => v !== value) : [...selecionados, value]);
  };

  const rotulo = (() => {
    if (!selecionados.length) return placeholderTodos;
    const nomes = selecionados
      .map((v) => opcoes.find((o) => o.value === v)?.label ?? v)
      .filter(Boolean);
    if (nomes.length <= maxNomes) return nomes.join(", ");
    return `${nomes.length} selecionados`;
  })();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="h-9 w-full justify-between gap-2 font-normal"
        >
          <span className="truncate text-left" title={rotulo}>{rotulo}</span>
          <span className="flex items-center gap-1 shrink-0">
            {selecionados.length > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{selecionados.length}</Badge>
            )}
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-3" align="start">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              autoFocus
              placeholder={buscaPlaceholder}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {selecionados.length ? `${selecionados.length} selecionado(s)` : placeholderTodos}
            </span>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange([])}>
              Limpar
            </Button>
          </div>
          <ScrollArea className="h-56">
            <div className="space-y-0.5 pr-2">
              {visiveis.map((o) => (
                <label
                  key={o.value}
                  className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-sm"
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={setSel.has(o.value)}
                    onCheckedChange={() => toggle(o.value)}
                  />
                  <span className="min-w-0">
                    <span className="block truncate" title={o.label}>{o.label}</span>
                    {o.sub && <span className="block text-[11px] text-muted-foreground truncate">{o.sub}</span>}
                  </span>
                </label>
              ))}
              {!visiveis.length && (
                <p className="text-xs text-muted-foreground text-center py-6">Nenhum resultado</p>
              )}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}
