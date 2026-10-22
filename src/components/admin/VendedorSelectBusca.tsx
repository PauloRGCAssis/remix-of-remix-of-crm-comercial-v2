import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Check, ChevronDown, Search, UserPlus, X } from "lucide-react";
import { normalizeSearchText } from "@/lib/clientSearch";
import { cn } from "@/lib/utils";

export const SEM_VINCULO_VALUE = "__none__";

/**
 * Seletor de "Vendedores vinculados" (seleção múltipla) com busca inteligente
 * fixa no topo, chips dos selecionados, lista rolável e abertura para baixo
 * limitada ao espaço disponível do viewport/modal.
 */
export function VendedorSelectBusca({
  values,
  onChange,
  vendorNames,
  onCriarNovo,
  className,
  disabled,
}: {
  /** vendedores vinculados (vazio = sem vínculo) */
  values: string[];
  onChange: (vendedores: string[]) => void;
  vendorNames: string[];
  onCriarNovo?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");

  const selecionados = useMemo(() => values.filter(Boolean), [values]);

  const opcoes = useMemo(() => {
    const extras = selecionados.filter((v) => !vendorNames.includes(v));
    const todos = [...extras, ...vendorNames];
    const q = normalizeSearchText(busca);
    if (!q) return todos;
    const tokens = q.split(" ").filter(Boolean);
    return todos.filter((n) => {
      const hay = normalizeSearchText(n);
      return tokens.every((t) => hay.includes(t));
    });
  }, [vendorNames, busca, selecionados]);

  const rotulo = selecionados.length
    ? `${selecionados.length} vendedor(es) vinculado(s)`
    : "Sem vínculo";

  const alternar = (nome: string) => {
    onChange(
      selecionados.includes(nome)
        ? selecionados.filter((v) => v !== nome)
        : [...selecionados, nome],
    );
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      {selecionados.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selecionados.map((n) => (
            <span
              key={n}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-xs"
            >
              <span className="max-w-[10rem] truncate" title={n}>
                {n}
              </span>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remover ${n}`}
                onClick={() => onChange(selecionados.filter((v) => v !== n))}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <Popover
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setBusca("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            disabled={disabled}
            className="h-9 w-full justify-between gap-2 font-normal"
          >
            <span
              className={cn("truncate text-left", !selecionados.length && "text-muted-foreground")}
              title={rotulo}
            >
              {rotulo}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={4}
          avoidCollisions
          collisionPadding={16}
          // A altura acompanha o espaço realmente disponível abaixo/acima do
          // campo, então a busca nunca é cortada e o topo nunca sai da tela.
          className="flex w-[var(--radix-popover-trigger-width)] min-w-56 max-h-[min(20rem,var(--radix-popover-content-available-height))] flex-col overflow-hidden p-0"
        >
          <div className="shrink-0 border-b bg-popover p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar vendedor..."
                className="h-8 pl-8 text-sm"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            {opcoes.map((n) => {
              const marcado = selecionados.includes(n);
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => alternar(n)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60"
                >
                  <Check className={cn("h-3.5 w-3.5", marcado ? "opacity-100" : "opacity-0")} />
                  <span className="truncate" title={n}>
                    {n}
                  </span>
                </button>
              );
            })}
            {!opcoes.length && (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Nenhum vendedor encontrado
              </p>
            )}
          </div>

          <div className="shrink-0 border-t p-1">
            {selecionados.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60"
              >
                <X className="h-3.5 w-3.5" />
                Limpar seleção (sem vínculo)
              </button>
            )}
            {onCriarNovo && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setBusca("");
                  onCriarNovo();
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Cadastrar novo vendedor
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
