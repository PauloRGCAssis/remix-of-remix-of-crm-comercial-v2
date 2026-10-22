import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClienteAgregado } from "@/hooks/useClientesPorProduto";
import type { ClientProfile } from "@/types/clientProfile";

const R$ = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

interface Props {
  cliente: ClienteAgregado | null;
  profile?: ClientProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function depBadge(pct: number) {
  if (pct > 50) return <Badge className="bg-red-500 text-white">{pct.toFixed(1)}% • Alta</Badge>;
  if (pct > 20) return <Badge className="bg-amber-500 text-white">{pct.toFixed(1)}% • Média</Badge>;
  return <Badge className="bg-emerald-600 text-white">{pct.toFixed(1)}% • Baixa</Badge>;
}

export function ClientePorProdutoDetalheDialog({ cliente, profile, open, onOpenChange }: Props) {
  if (!cliente) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">{cliente.cliente}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {[cliente.cidade, cliente.vendedor].filter(Boolean).join(" · ")}
          </p>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card><CardContent className="p-3">
            <p className="text-[10px] uppercase text-muted-foreground">Fat. produtos filtrados</p>
            <p className="text-lg font-bold">{R$(cliente.faturamentoFiltrado)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <p className="text-[10px] uppercase text-muted-foreground">Fat. total do cliente</p>
            <p className="text-lg font-bold">{R$(cliente.faturamentoTotalCliente)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <p className="text-[10px] uppercase text-muted-foreground">Dependência</p>
            <div className="mt-1">{depBadge(cliente.dependencia)}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <p className="text-[10px] uppercase text-muted-foreground">Última compra</p>
            <p className="text-lg font-bold">{cliente.ultimaCompra || "—"}</p>
          </CardContent></Card>
        </div>

        {profile && (
          <Card className="mb-4">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Dados cadastrais</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              {profile.cnpj && <div><span className="text-muted-foreground">CNPJ: </span>{profile.cnpj}</div>}
              {profile.segmento && <div><span className="text-muted-foreground">Segmento: </span>{profile.segmento}</div>}
              {profile.vendedor && <div><span className="text-muted-foreground">Vendedor: </span>{profile.vendedor}</div>}
              {profile.cidade && <div><span className="text-muted-foreground">Cidade: </span>{profile.cidade} / {profile.estado ?? ""}</div>}
              {profile.bairro && <div><span className="text-muted-foreground">Bairro: </span>{profile.bairro}</div>}
              {profile.rua && <div className="col-span-full"><span className="text-muted-foreground">Endereço: </span>{profile.rua}, {profile.numero ?? "s/n"}</div>}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Produtos adquiridos no período</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Produto</TableHead>
                  <TableHead className="text-xs text-right">Qtd</TableHead>
                  <TableHead className="text-xs text-right">Faturamento</TableHead>
                  <TableHead className="text-xs text-right">% no cliente</TableHead>
                  <TableHead className="text-xs text-right">Pedidos</TableHead>
                  <TableHead className="text-xs text-right">Última</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cliente.produtos.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs whitespace-normal break-words">{p.produto}</TableCell>
                    <TableCell className="text-xs text-right">{num(p.quantidade)}</TableCell>
                    <TableCell className="text-xs text-right font-semibold">{R$(p.faturamento)}</TableCell>
                    <TableCell className="text-xs text-right">{p.participacaoNoCliente.toFixed(1)}%</TableCell>
                    <TableCell className="text-xs text-right">{p.numPedidos}</TableCell>
                    <TableCell className="text-xs text-right">{p.ultimaCompra || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
