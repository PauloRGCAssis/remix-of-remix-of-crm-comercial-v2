import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ChevronDown } from "lucide-react";
import { CATALOGO_PRODUTOS, produtoSearchText } from "@/types/crm";
import { searchProducts } from "@/lib/productSearch";

interface Props {
  value: string;
  /** recebe o nome completo do produto */
  onChange: (nome: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** permite manter um valor livre já existente (ex.: importado da planilha) */
  allowFree?: boolean;
}

/** Seletor de produto único com busca rápida e inteligente. */
export function ProdutoSelectSearch({
  value,
  onChange,
  placeholder = "Selecione o produto...",
  disabled,
  allowFree = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");

  const ativos = useMemo(() => CATALOGO_PRODUTOS.filter((p) => p.ativo), []);
  const filtrados = useMemo(() => searchProducts(ativos, busca, produtoSearchText), [ativos, busca]);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setBusca(""); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="h-10 w-full justify-between gap-2 font-normal"
        >
          <span className={`truncate text-left ${value ? "" : "text-muted-foreground"}`} title={value}>
            {value || placeholder}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-popover" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por nome, código, recheio..."
            value={busca}
            onValueChange={setBusca}
          />
          <CommandList className="max-h-[280px]">
            <CommandEmpty>Nenhum produto encontrado</CommandEmpty>
            <CommandGroup>
              {allowFree && busca.trim() && (
                <CommandItem
                  value={`__livre__${busca}`}
                  onSelect={() => { onChange(busca.trim()); setOpen(false); }}
                  className="text-xs"
                >
                  Usar “{busca.trim()}”
                </CommandItem>
              )}
              {filtrados.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.id}
                  onSelect={() => { onChange(p.nome); setOpen(false); }}
                  className="text-xs"
                >
                  {p.codigo && <span className="mr-2 text-muted-foreground">{p.codigo}</span>}
                  <span className="flex-1">{p.nome}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
