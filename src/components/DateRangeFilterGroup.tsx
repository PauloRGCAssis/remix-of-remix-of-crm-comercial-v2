import { Calendar, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DateRangeFilterGroupProps {
  label: string;
  start: string;
  end: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  helperText?: string;
  optional?: boolean;
  onClear?: () => void;
}

export function DateRangeFilterGroup({
  label,
  start,
  end,
  onStartChange,
  onEndChange,
  helperText,
  optional = false,
  onClear,
}: DateRangeFilterGroupProps) {
  const showClear = Boolean(onClear && (start || end));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Calendar className="h-4 w-4" />
        <span className="font-medium">{label}</span>
        {optional && (
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide">
            Opcional
          </span>
        )}
        {showClear && onClear && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onClear}
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            Limpar
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">De</Label>
          <Input
            type="date"
            value={start}
            onChange={(event) => onStartChange(event.target.value)}
            className="w-40"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Até</Label>
          <Input
            type="date"
            value={end}
            onChange={(event) => onEndChange(event.target.value)}
            className="w-40"
          />
        </div>
      </div>

      {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
    </div>
  );
}
