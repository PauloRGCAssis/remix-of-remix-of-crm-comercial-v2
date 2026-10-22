import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings } from "lucide-react";
import { useAppSetting, REATIVACAO_DIAS_KEY, REATIVACAO_DIAS_DEFAULT, REATIVACAO_DIAS_OPCOES } from "@/hooks/useAppSetting";
import { toast } from "@/hooks/use-toast";

export function ClassificacaoClientesSettings() {
  const { value, setValue, isLoading, isSaving } = useAppSetting<number>(
    REATIVACAO_DIAS_KEY,
    REATIVACAO_DIAS_DEFAULT,
  );

  return (
    <Card className="shadow-card max-w-2xl">
      <CardHeader>
        <CardTitle className="text-base font-heading flex items-center gap-2">
          <Settings className="h-4 w-4 text-primary" />
          Classificação de clientes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-medium mb-1">Dias sem compra para considerar cliente REATIVADO</p>
          <p className="text-xs text-muted-foreground mb-3">
            Um cliente é <strong>REATIVADO</strong> quando já comprou anteriormente e voltou após ficar sem
            comprar por, no mínimo, o número de dias configurado abaixo. Abaixo desse limite, é considerado{" "}
            <strong>RECORRENTE</strong>. Sem histórico anterior é <strong>NOVO</strong>. Padrão: 60 dias.
          </p>
          <Select
            value={String(value ?? REATIVACAO_DIAS_DEFAULT)}
            disabled={isLoading || isSaving}
            onValueChange={(v) => {
              const n = Number(v);
              if (!Number.isFinite(n) || n <= 0) return;
              setValue(n);
              toast({ title: "Configuração atualizada", description: `Reativação a partir de ${n} dias sem compra.` });
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REATIVACAO_DIAS_OPCOES.map((n) => (
                <SelectItem key={n} value={String(n)}>{n} dias</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-[11px] text-muted-foreground">
          A regra vale para toda a Inteligência Comercial (cards de Movimentação de Clientes, Análise por
          Vendedor, listas de clientes novos e reativados).
        </p>
      </CardContent>
    </Card>
  );
}
