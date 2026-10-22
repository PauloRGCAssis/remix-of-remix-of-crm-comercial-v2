import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronDown } from "lucide-react";
import { formatProductDisplay } from "@/lib/productDisplay";
import { searchProducts } from "@/lib/productSearch";

interface ProductFilterPopoverProps {
  label: string;
  products: string[];
  selected: string[];
  onApply: (selected: string[]) => void;
}

export function ProductFilterPopover({ label, products, selected, onApply }: ProductFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [tempSelected, setTempSelected] = useState<string[]>(selected);

  const filtered = searchProducts(products, search, (p) => p);

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      setTempSelected(selected);
      setSearch("");
    }
    setOpen(isOpen);
  };

  const toggleProduct = (product: string) => {
    setTempSelected(prev =>
      prev.includes(product) ? prev.filter(p => p !== product) : [...prev, product]
    );
  };

  const selectAll = () => setTempSelected([...products]);
  const clearAll = () => setTempSelected([]);

  const apply = () => {
    onApply(tempSelected);
    setOpen(false);
  };

  const cancel = () => {
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-10 gap-2 whitespace-nowrap">
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
              {selected.length}
            </Badge>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, código, recheio..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAll}>Todos</Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearAll}>Limpar</Button>
          </div>
          <ScrollArea className="h-48">
            <div className="space-y-1">
              {filtered.map(product => (
                <label
                  key={product}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer text-sm"
                >
                  <Checkbox
                    checked={tempSelected.includes(product)}
                    onCheckedChange={() => toggleProduct(product)}
                  />
                  <span className="truncate" title={formatProductDisplay(product)}>{formatProductDisplay(product)}</span>
                </label>
              ))}
              {filtered.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhum produto encontrado</p>
              )}
            </div>
          </ScrollArea>
          <div className="flex gap-2 pt-1 border-t">
            <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={cancel}>Cancelar</Button>
            <Button size="sm" className="flex-1 h-8 text-xs" onClick={apply}>Aplicar</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
