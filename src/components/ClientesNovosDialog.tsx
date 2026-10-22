import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export interface ClienteNovoLinha {
  cliente: string;
  primeiraCompra: Date;
  valorPrimeiraCompra: number;
  vendedorPrimeiraCompra: string;
  totalNoPeriodo: number;
  totalNoPeriodoAnterior?: number;
  pedidosNoPeriodo?: number;
  temHistoricoAnterior?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo?: string;
  descricao?: string;
  itens: ClienteNovoLinha[];
  /** Quando "novo", exibe a coluna de 1ª compra; caso contrário, oculta. */
  mostrarPrimeiraCompra?: boolean;
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d: Date) => d.toLocaleDateString("pt-BR");

export function ClientesNovosDialog({
  open,
  onOpenChange,
  titulo = "Clientes",
  descricao,
  itens,
  mostrarPrimeiraCompra = true,
}: Props) {
  const totalAtual = itens.reduce((s, c) => s + (c.totalNoPeriodo ?? 0), 0);
  const totalAnterior = itens.reduce((s, c) => s + (c.totalNoPeriodoAnterior ?? 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{titulo} ({itens.length})</DialogTitle>
          {descricao && <DialogDescription>{descricao}</DialogDescription>}
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded-md bg-muted">
            <span className="text-muted-foreground">Total atual:</span>{" "}
            <strong className="text-foreground">{fmt(totalAtual)}</strong>
          </div>
          <div className="p-2 rounded-md bg-muted">
            <span className="text-muted-foreground">Total anterior:</span>{" "}
            <strong className="text-foreground">{fmt(totalAnterior)}</strong>
          </div>
        </div>
        <div className="max-h-[55vh] overflow-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                {mostrarPrimeiraCompra && <TableHead>1ª compra (histórica)</TableHead>}
                {mostrarPrimeiraCompra && <TableHead className="text-right">Valor 1ª compra</TableHead>}
                <TableHead>Vendedor (1ª)</TableHead>
                <TableHead className="text-right">Atual</TableHead>
                <TableHead className="text-right">Anterior</TableHead>
                <TableHead>Auditoria</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.length === 0 && (
                <TableRow>
                  <TableCell colSpan={mostrarPrimeiraCompra ? 7 : 5} className="text-center text-muted-foreground py-6">
                    Nenhum cliente neste grupo no período.
                  </TableCell>
                </TableRow>
              )}
              {itens.map((c) => (
                <TableRow key={c.cliente}>
                  <TableCell className="font-medium">{c.cliente}</TableCell>
                  {mostrarPrimeiraCompra && <TableCell>{fmtDate(c.primeiraCompra)}</TableCell>}
                  {mostrarPrimeiraCompra && <TableCell className="text-right">{fmt(c.valorPrimeiraCompra)}</TableCell>}
                  <TableCell>{c.vendedorPrimeiraCompra || "—"}</TableCell>
                  <TableCell className="text-right">{fmt(c.totalNoPeriodo)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{fmt(c.totalNoPeriodoAnterior ?? 0)}</TableCell>
                  <TableCell>
                    {c.temHistoricoAnterior ? (
                      <Badge variant="secondary" className="text-[10px]">com histórico</Badge>
                    ) : (
                      <Badge variant="default" className="text-[10px]">sem histórico</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Fonte: <code>sales_raw_rows</code>. Comparação por nome normalizado (sem acentos, caixa baixa,
          sufixos como "(IM)/(GR)" removidos, aliases aplicados). "Atual" e "Anterior" referem-se ao
          mês selecionado e ao mês imediatamente anterior, somente para este vendedor.
        </p>
      </DialogContent>
    </Dialog>
  );
}
