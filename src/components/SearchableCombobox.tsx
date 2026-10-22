import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface SearchableComboboxProps {
  options: string[];
  value: string[];
  onValueChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  allLabel?: string;
  applyMode?: boolean;
  widthClass?: string;
  selectionMode?: "single" | "multiple";
  closeOnSelect?: boolean;
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function SearchableCombobox({
  options,
  value,
  onValueChange,
  placeholder = "Selecionar...",
  searchPlaceholder = "Buscar...",
  emptyMessage = "Nenhum resultado.",
  className,
  allLabel = "Todos",
  applyMode = true,
  widthClass = "w-[var(--radix-popover-trigger-width)] min-w-[280px] max-w-[calc(100vw-2rem)]",
  selectionMode = "multiple",
  closeOnSelect,
}: SearchableComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [pendingValue, setPendingValue] = React.useState<string[]>(value);
  const [search, setSearch] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const itemRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const workingValue = applyMode ? pendingValue : value;
  const isAll = workingValue.length === 0;
  const selectedCount = value.length;
  const shouldCloseOnSelect = closeOnSelect ?? selectionMode === "single";

  const filteredOptions = React.useMemo(() => {
    const normalizedSearch = normalizeSearch(search);
    if (!normalizedSearch) return options;

    return options.filter((option) => normalizeSearch(option).includes(normalizedSearch));
  }, [options, search]);

  const visibleItems = React.useMemo(() => [allLabel, ...filteredOptions], [allLabel, filteredOptions]);

  React.useEffect(() => {
    if (!open) return;
    const selectedIndex = filteredOptions.findIndex((option) => workingValue.includes(option));
    setActiveIndex(selectedIndex >= 0 ? selectedIndex + 1 : 0);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, filteredOptions, workingValue]);

  React.useEffect(() => {
    if (!open) return;
    itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const resetSearch = () => setSearch("");

  const toggleOption = (option: string) => {
    const next = selectionMode === "single"
      ? [option]
      : workingValue.includes(option)
        ? workingValue.filter((item) => item !== option)
        : [...workingValue, option];

    if (applyMode) {
      setPendingValue(next);
      return;
    }

    onValueChange(next);
    resetSearch();
    if (shouldCloseOnSelect) setOpen(false);
  };

  const selectAllOption = () => {
    if (applyMode) {
      setPendingValue([]);
      return;
    }

    onValueChange([]);
    resetSearch();
    if (shouldCloseOnSelect) setOpen(false);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, visibleItems.length - 1));
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (activeIndex === 0) selectAllOption();
      else if (filteredOptions[activeIndex - 1]) toggleOption(filteredOptions[activeIndex - 1]);
    }

    if (event.key === "Escape") {
      event.preventDefault();
      handleCancel();
    }
  };

  const removeOption = (option: string, event: React.MouseEvent) => {
    event.stopPropagation();

    if (applyMode) {
      const next = value.filter((item) => item !== option);
      onValueChange(next);
      setPendingValue(next);
      resetSearch();
      return;
    }

    onValueChange(value.filter((item) => item !== option));
    resetSearch();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && applyMode) {
      setPendingValue([...value]);
    }

    if (!nextOpen && applyMode) {
      setPendingValue([...value]);
    }

    resetSearch();
    setOpen(nextOpen);
  };

  const handleApply = () => {
    onValueChange(pendingValue);
    resetSearch();
    setOpen(false);
  };

  const handleCancel = () => {
    setPendingValue([...value]);
    resetSearch();
    setOpen(false);
  };

  const displayValue = selectedCount === 0
    ? allLabel
    : selectedCount === 1
      ? value[0]
      : `${selectedCount} selecionados`;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-auto min-h-8 w-full justify-between py-1 text-xs font-normal", className)}
        >
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {selectedCount === 0 ? (
              <span className="truncate">{allLabel}</span>
            ) : selectedCount <= 2 && !applyMode && selectionMode !== "single" ? (
              value.map((item) => (
                <Badge key={item} variant="secondary" className="h-5 gap-0.5 px-1.5 py-0 text-[10px] font-normal">
                  <span className="max-w-[80px] truncate">{item}</span>
                  <X
                    className="h-2.5 w-2.5 shrink-0 cursor-pointer opacity-60 hover:opacity-100"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => removeOption(item, event)}
                  />
                </Badge>
              ))
            ) : (
              <span className="truncate">{displayValue || placeholder}</span>
            )}
          </div>

          <div className="ml-1 flex shrink-0 items-center gap-0.5">
            {selectedCount > 0 && (
              <span
                className="inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onValueChange([]);
                  setPendingValue([]);
                  resetSearch();
                }}
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="h-3 w-3 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className={cn(widthClass, "z-[1000] flex flex-col overflow-hidden p-0")}
        align="start"
        side="bottom"
        sideOffset={4}
        avoidCollisions
        collisionPadding={16}
        style={{
          maxHeight: "min(70vh, var(--radix-popover-content-available-height, 70vh))",
        }}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          window.requestAnimationFrame(() => inputRef.current?.focus());
        }}
      >
        {applyMode && (
          <div className="space-y-1 border-b bg-popover p-2">
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 text-xs"
                onClick={() => setPendingValue([...options])}
              >
                Todos
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 text-xs"
                onClick={() => setPendingValue([])}
              >
                Limpar
              </Button>
            </div>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs"
                onClick={handleCancel}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                className="flex-1 text-xs"
                onClick={handleApply}
              >
                Aplicar
              </Button>
            </div>
          </div>
        )}

        <div className="sticky top-0 z-10 border-b bg-popover p-2">
          <Input
            ref={inputRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={searchPlaceholder}
            className="h-9 text-xs"
            role="combobox"
            aria-expanded={open}
            aria-activedescendant={`combobox-item-${activeIndex}`}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1" role="listbox">
          <button
            id="combobox-item-0"
            ref={(node) => { itemRefs.current[0] = node; }}
            type="button"
            role="option"
            aria-selected={isAll}
            onMouseEnter={() => setActiveIndex(0)}
            onClick={selectAllOption}
            className={cn(
              "flex w-full items-center rounded-sm px-2 py-2 text-left text-xs outline-none",
              activeIndex === 0 && "bg-accent text-accent-foreground",
            )}
          >
            <Check className={cn("mr-2 h-3 w-3 shrink-0", isAll ? "opacity-100" : "opacity-0")} />
            <span className="truncate">{allLabel}</span>
          </button>

          {filteredOptions.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">{emptyMessage}</div>
          ) : (
            filteredOptions.map((option, index) => {
              const itemIndex = index + 1;
              const selected = workingValue.includes(option);
              return (
                <button
                  id={`combobox-item-${itemIndex}`}
                  ref={(node) => { itemRefs.current[itemIndex] = node; }}
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActiveIndex(itemIndex)}
                  onClick={() => toggleOption(option)}
                  className={cn(
                    "flex w-full items-center rounded-sm px-2 py-2 text-left text-xs outline-none",
                    activeIndex === itemIndex && "bg-accent text-accent-foreground",
                  )}
                >
                  <Check className={cn("mr-2 h-3 w-3 shrink-0", selected ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1 truncate" title={option}>{option}</span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
