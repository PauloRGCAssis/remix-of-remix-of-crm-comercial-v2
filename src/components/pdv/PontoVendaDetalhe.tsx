import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MapPin, MessageCircle, Phone } from "lucide-react";
import {
  buildPdvSalesIndex,
  diasSemComprar,
  formatCurrency,
  formatDate,
  formatKg,
  formatPhone,
  fullAddress,
  normalizePhone,
  profilePhone,
  profileWhatsapp,
  resolvePdvStats,
} from "@/lib/pontoVenda";
import { filterByDateRange, type SaleRow } from "@/hooks/useSalesData";
import type { ClientProfile } from "@/types/clientProfile";

interface Props {
  profile: ClientProfile | null;
  sales: SaleRow[];
  periodoInicio: string;
  periodoFim: string;
  onOpenChange: (open: boolean) => void;
}

export function PontoVendaDetalhe({ profile, sales, periodoInicio, periodoFim, onOpenChange }: Props) {
  const [inicio, setInicio] = useState(periodoInicio);
  const [fim, setFim] = useState(periodoFim);

  const stats = useMemo(() => {
    if (!profile) return null;
    const base = inicio && fim ? filterByDateRange(sales, inicio, fim) : sales;
    return resolvePdvStats(buildPdvSalesIndex(base), profile);
  }, [profile, sales, inicio, fim]);

  const statsGlobal = useMemo(() => {
    if (!profile) return null;
    return resolvePdvStats(buildPdvSalesIndex(sales), profile);
  }, [profile, sales]);

  if (!profile) return null;

  const telefone = profilePhone(profile);
  const whatsapp = profileWhatsapp(profile);
  const dias = diasSemComprar(statsGlobal?.ultimoPedido ?? null);

  return (
    <Sheet open={!!profile} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="font-heading text-lg">
            {profile.nome_fantasia?.trim() || profile.nome}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          <section className="space-y-1 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={profile.pdv_ativo ? "default" : "secondary"}>
                {profile.pdv_ativo ? "Ativo" : "Inativo"}
              </Badge>
              {profile.pdv_tipo && <Badge variant="outline">{profile.pdv_tipo}</Badge>}
              {profile.vendedor && <Badge variant="outline">{profile.vendedor}</Badge>}
            </div>
            <p><span className="text-muted-foreground">Razão social:</span> {profile.nome}</p>
            <p><span className="text-muted-foreground">Nome fantasia:</span> {profile.nome_fantasia || "—"}</p>
            <p><span className="text-muted-foreground">CPF/CNPJ:</span> {profile.cnpj || "—"}</p>
            <p><span className="text-muted-foreground">Endereço:</span> {fullAddress(profile)}</p>
            <p><span className="text-muted-foreground">Telefone:</span> {telefone ? formatPhone(telefone) : "—"}</p>
            <p><span className="text-muted-foreground">WhatsApp:</span> {whatsapp ? formatPhone(whatsapp) : "—"}</p>
            <div className="flex flex-wrap gap-2 pt-2">
              {whatsapp && (
                <Button size="sm" variant="outline" asChild>
                  <a href={`https://wa.me/${normalizePhone(whatsapp)}`} target="_blank" rel="noreferrer">
                    <MessageCircle className="mr-1 h-3 w-3" /> WhatsApp
                  </a>
                </Button>
              )}
              {telefone && (
                <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(telefone)}>
                  <Phone className="mr-1 h-3 w-3" /> Copiar telefone
                </Button>
              )}
              <Button size="sm" variant="outline" asChild>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress(profile))}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MapPin className="mr-1 h-3 w-3" /> Google Maps
                </a>
              </Button>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Período</span>
              <Input type="date" className="h-8 w-[145px]" value={inicio} onChange={(e) => setInicio(e.target.value)} />
              <span className="text-xs text-muted-foreground">até</span>
              <Input type="date" className="h-8 w-[145px]" value={fim} onChange={(e) => setFim(e.target.value)} />
              {(inicio || fim) && (
                <Button size="sm" variant="ghost" onClick={() => { setInicio(""); setFim(""); }}>
                  Limpar
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Metric label="Pedidos" value={String(stats?.pedidos ?? 0)} />
              <Metric label="Quantidade" value={formatKg(stats?.kg ?? 0)} />
              <Metric label="Faturamento" value={formatCurrency(stats?.faturamento ?? 0)} />
              <Metric
                label="Dias sem comprar"
                value={dias === null ? "Nunca comprou" : `${dias} dia(s)`}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Último pedido (histórico completo): {formatDate(statsGlobal?.ultimoPedido)}
            </p>
          </section>

          <Separator />

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Produtos comprados</h3>
            {!stats?.produtos.length ? (
              <p className="text-sm text-muted-foreground">Nenhuma compra no período.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Qtd total</TableHead>
                      <TableHead className="text-right">Últ. compra</TableHead>
                      <TableHead className="text-right">Qtd últ. pedido</TableHead>
                      <TableHead className="text-right">Pedidos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.produtos.map((p) => (
                      <TableRow key={`${p.codigoProduto}-${p.produto}`}>
                        <TableCell className="text-xs">{p.codigoProduto || "—"}</TableCell>
                        <TableCell className="text-xs">{p.produto}</TableCell>
                        <TableCell className="text-right text-xs">{formatKg(p.quantidadeTotal)}</TableCell>
                        <TableCell className="text-right text-xs">{formatDate(p.ultimaCompra)}</TableCell>
                        <TableCell className="text-right text-xs">{formatKg(p.quantidadeUltimoPedido)}</TableCell>
                        <TableCell className="text-right text-xs">{p.pedidos}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          <Separator />

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Últimos pedidos</h3>
            {!stats?.orders.length ? (
              <p className="text-sm text-muted-foreground">Nenhum pedido no período.</p>
            ) : (
              <div className="space-y-2">
                {stats.orders.slice(0, 10).map((o) => (
                  <div key={o.codigoVenda} className="rounded-md border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-medium">Pedido #{o.codigoVenda}</span>
                      <span className="text-muted-foreground">{formatDate(o.data)}</span>
                      <span>{formatKg(o.kg)}</span>
                      <span className="font-semibold">{formatCurrency(o.valor)}</span>
                    </div>
                    <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                      {o.itens.map((i, idx) => (
                        <li key={idx}>
                          {i.codigoProduto ? `${i.codigoProduto} - ` : ""}{i.produto} · {formatKg(i.quantidade)} · {formatCurrency(i.valor)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}
