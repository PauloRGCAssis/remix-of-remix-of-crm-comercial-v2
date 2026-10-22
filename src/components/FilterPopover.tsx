import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Filter, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface FilterPopoverProps {
  label: string;
  options: string[];
  selected: string[];
  onApply: (selected: string[]) => void;
  align?: "start" | "end";
  className?: string;
  widthClass?: string;
  /** Enables a search box at the top of the dropdown (accent-insensitive). */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Wrap long labels instead of truncating with "...". */
  wrapLabels?: boolean;
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function FilterPopover({
  label,
  options,
  selected,
  onApply,
  align = "start",
  className,
  widthClass = "w-52",
  searchable = false,
  searchPlaceholder = "Buscar...",
  wrapLabels = false,
}: FilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      setPending([...selected]);
      setQuery("");
    }
    setOpen(isOpen);
  };

  const toggle = (item: string) => {
    setPending(prev =>
      prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]
    );
  };

  const visibleOptions = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = normalizeSearch(query);
    return options.filter(opt => normalizeSearch(opt).includes(q));
  }, [options, query, searchable]);

  const handleApply = () => {
    onApply(pending);
    setOpen(false);
  };

  const handleCancel = () => {
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("gap-1.5", className)}>
          <Filter className="h-3.5 w-3.5" />
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
              {selected.length}
            </Badge>
          )}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(widthClass, "p-2")}
        align={align}
      >
        {searchable && (
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 pl-7 text-xs"
            />
          </div>
        )}
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {visibleOptions.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              Nenhum item encontrado
            </p>
          ) : (
            visibleOptions.map(opt => (
              <label
                key={opt}
                className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm"
                title={opt}
              >
                <Checkbox
                  checked={pending.includes(opt)}
                  onCheckedChange={() => toggle(opt)}
                  className="mt-0.5 shrink-0"
                />
                <span
                  className={cn(wrapLabels ? "" : "truncate")}
                  style={wrapLabels ? { whiteSpace: "normal", wordBreak: "break-word", overflowWrap: "anywhere" } : undefined}
                >
                  {opt}
                </span>
              </label>
            ))
          )}
        </div>
        <div className="flex gap-1 mt-2 pt-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 text-xs"
            onClick={() => setPending([...visibleOptions])}
          >
            Todos
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 text-xs"
            onClick={() => setPending([])}
          >
            Limpar
          </Button>
        </div>
        <div className="flex gap-1 mt-1">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            onClick={handleCancel}
          >
            Cancelar
          </Button>
          <Button size="sm" className="flex-1 text-xs" onClick={handleApply}>
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

