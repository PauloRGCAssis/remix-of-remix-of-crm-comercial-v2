import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";

interface Item {
  value: string;
  label: string;
  removable?: boolean;
  onRemove?: () => void | Promise<void>;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: Item[];
  placeholder?: string;
  createLabel?: string;
  onCreate: (name: string) => Promise<string | void>;
  disabled?: boolean;
}

function norm(v: string) {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function CreatableSelect({
  value,
  onChange,
  options,
  placeholder = "Selecione...",
  createLabel = "Cadastrar novo",
  onCreate,
  disabled,
}: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const s = norm(search);
    if (!s) return options;
    return options.filter((o) => norm(o.label).includes(s));
  }, [options, search]);

  const exactExists = useMemo(
    () => options.some((o) => norm(o.label) === norm(search)),
    [options, search],
  );
  const canCreate = search.trim().length > 0 && !exactExists;

  const handleCreate = async () => {
    if (!canCreate || creating) return;
    setCreating(true);
    try {
      const created = await onCreate(search.trim());
      const newValue = typeof created === "string" ? created : search.trim();
      onChange(newValue);
      setSearch("");
      setOpen(false);
      toast({ title: "Opção cadastrada", description: newValue });
    } catch (e: any) {
      toast({ title: "Não foi possível cadastrar", description: e?.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value ?? "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selectedLabel && "text-muted-foreground")}>
            {selectedLabel || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-[1000] w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0" align="start">
        <div className="border-b p-2">
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar ou digitar nova..."
            className="h-9 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && canCreate) {
                e.preventDefault();
                void handleCreate();
              }
            }}
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 && !canCreate && (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">Nenhum resultado</div>
          )}
          {filtered.map((opt) => (
            <div
              key={opt.value}
              className={cn(
                "group flex items-center gap-1 rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
                value === opt.value && "bg-accent/60",
              )}
            >
              <button
                type="button"
                className="flex flex-1 items-center text-left"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                  setSearch("");
                }}
              >
                <Check className={cn("mr-2 h-3.5 w-3.5", value === opt.value ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{opt.label}</span>
              </button>
              {opt.removable && opt.onRemove && (
                <button
                  type="button"
                  className="invisible rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:visible"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirm(`Excluir "${opt.label}"?`)) return;
                    try {
                      await opt.onRemove?.();
                      toast({ title: "Opção removida" });
                    } catch (err: any) {
                      toast({ title: "Erro ao remover", description: err?.message, variant: "destructive" });
                    }
                  }}
                  title="Excluir opção"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          {canCreate && (
            <button
              type="button"
              disabled={creating}
              onClick={handleCreate}
              className="mt-1 flex w-full items-center gap-2 rounded-sm border border-dashed border-primary/40 bg-primary/5 px-2 py-2 text-sm text-primary hover:bg-primary/10 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="truncate">{createLabel}: "{search.trim()}"</span>
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
