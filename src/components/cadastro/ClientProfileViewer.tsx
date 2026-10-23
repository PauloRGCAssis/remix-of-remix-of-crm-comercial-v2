import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Download, Pencil, Share2, MessageCircle } from "lucide-react";
import type { ClientProfile } from "@/types/clientProfile";
import { useToast } from "@/hooks/use-toast";
import { useModuleCrud } from "@/hooks/useModuleCrud";
import { savePdfDoc, preopenPdfTab } from "@/lib/pdfDownload";
import { buildClientProfilePdf, slugifyClientName } from "@/lib/clientProfilePdf";
import { ClienteAcoesComerciais } from "@/components/acoes/ClienteAcoesComerciais";
import { documentoLabel, formatDocumento } from "@/lib/documentoCliente";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: ClientProfile | null;
  onEdit: () => void;
}

const fmt = (v?: string) => (v && v.trim() ? v : "—");
const fmtMoney = (v?: number) =>
  typeof v === "number" ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

function buildAddress(p: ClientProfile, type: "main" | "delivery") {
  const get = (key: string) =>
    type === "main" ? (p as any)[key] : (p as any)[`entrega_${key}`];
  const linha1 = [get("rua"), get("numero")].filter(Boolean).join(", ");
  const linha2 = [get("complemento")].filter(Boolean).join(" ");
  const linha3 = [get("bairro"), get("cidade") && `${get("cidade")}/${get("estado") ?? ""}`]
    .filter(Boolean).join(" - ");
  const cep = get("cep");
  return [linha1, linha2, linha3, cep && `CEP ${cep}`].filter(Boolean).join("\n");
}

export function ClientProfileViewer({ open, onOpenChange, profile, onEdit }: Props) {
  const { toast } = useToast();
  // Ficha completa pertence ao Cadastro de Clientes, de qualquer tela que a abra.
  const { podeEditar } = useModuleCrud("cadastro_clientes", "fichas de clientes");
  if (!profile) return null;

  const baseName = (profile.nome_fantasia && profile.nome_fantasia.trim()) || profile.nome;
  const filename = `cadastro-${slugifyClientName(baseName)}.pdf`;

  const exportPdf = () => {
    const preopened = preopenPdfTab();
    savePdfDoc(buildClientProfilePdf(profile), filename, {
      preopened,
      onError: (message) =>
        toast({ title: "Erro ao gerar PDF", description: message, variant: "destructive" }),
    });
  };

  const buildShareText = () => {
    const lines: string[] = [];
    lines.push(`*Ficha de Cadastro*`);
    lines.push(`*${(profile.nome_fantasia && profile.nome_fantasia.trim()) || profile.nome}*`);
    if (profile.nome_fantasia && profile.nome_fantasia.trim() && profile.nome) {
      lines.push(
        `${documentoLabel(profile.tipo_documento, profile.cnpj) === "CPF" ? "Nome completo" : "Razão social"}: ${profile.nome}`,
      );
    }
    if (profile.cnpj) {
      lines.push(
        `${documentoLabel(profile.tipo_documento, profile.cnpj)}: ${formatDocumento(profile.cnpj, profile.tipo_documento)}`,
      );
    }
    if (profile.vendedor) lines.push(`Vendedor: ${profile.vendedor}`);
    if (profile.segmento) lines.push(`Segmento: ${profile.segmento}`);
    const addr = buildAddress(profile, "main");
    if (addr) {
      lines.push("");
      lines.push(`📍 ${addr.replace(/\n/g, " — ")}`);
    }
    if (profile.contatos.length > 0) {
      lines.push("");
      lines.push("📞 Contatos:");
      profile.contatos.forEach((c) => {
        const parts = [c.nome, c.cargo].filter(Boolean).join(" - ");
        const ch = [c.telefone && `Tel: ${c.telefone}`, c.whatsapp && `WhatsApp: ${c.whatsapp}`, c.email && `E-mail: ${c.email}`]
          .filter(Boolean)
          .join(" · ");
        lines.push(`• ${parts}${ch ? ` (${ch})` : ""}`);
      });
    }
    if (profile.dias_rota && profile.dias_rota.length > 0) {
      lines.push("");
      lines.push(`📅 Dias da rota: ${profile.dias_rota.join(", ")}`);
    }
    return lines.join("\n");
  };

  const shareWhatsApp = async () => {
    try {
      const text = buildShareText();
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    } catch {
      toast({ title: "Não foi possível compartilhar", description: "Tente copiar os dados do cliente." });
    }
  };

  const shareNative = async () => {
    const text = buildShareText();
    try {
      const nav: any = navigator;
      if (nav.share) {
        await nav.share({ title: baseName, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast({
        title: "Dados copiados",
        description: "Cadastro copiado para compartilhar onde quiser.",
      });
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(text);
        toast({
          title: "Dados copiados",
          description: "Cadastro copiado para compartilhar onde quiser.",
        });
      } catch {
        toast({
          title: "Não foi possível compartilhar",
          description: "Tente selecionar e copiar os dados do cadastro.",
        });
      }
    }
  };


  const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || "—"}</p>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="font-heading text-xl">
                {(profile.nome_fantasia && profile.nome_fantasia.trim()) || profile.nome}
              </SheetTitle>
              {profile.nome_fantasia && profile.nome_fantasia.trim() && profile.nome && (
                <p className="text-xs text-muted-foreground">Razão social: {profile.nome}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {podeEditar && (
                <Button size="sm" variant="outline" onClick={onEdit}>
                  <Pencil className="h-3 w-3 mr-1" /> Editar
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={shareWhatsApp}>
                <MessageCircle className="h-3 w-3 mr-1" />
                WhatsApp
              </Button>
              <Button size="sm" variant="outline" onClick={shareNative}>
                <Share2 className="h-3 w-3 mr-1" />
                Compartilhar
              </Button>
              <Button size="sm" onClick={exportPdf}>
                <Download className="h-3 w-3 mr-1" />
                PDF
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <section>
            <h3 className="text-sm font-semibold mb-3">🏢 Dados principais</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label={documentoLabel(profile.tipo_documento, profile.cnpj)}
                value={formatDocumento(profile.cnpj, profile.tipo_documento)}
              />
              <Field label="Empresa" value={profile.empresa} />
              <Field label="Insc. Estadual" value={profile.inscricao_estadual} />
              <Field label="Insc. Municipal" value={profile.inscricao_municipal} />
              <Field label="Segmento" value={profile.segmento} />
              <Field label="Ramo de atividade" value={profile.ramo_atividade} />
              <Field label="Vendedor" value={profile.vendedor} />
            </div>
          </section>

          <Separator />

          <section>
            <h3 className="text-sm font-semibold mb-3">📍 Endereço principal</h3>
            <p className="text-sm whitespace-pre-line">{buildAddress(profile, "main") || "—"}</p>
            {profile.regiao && (
              <Badge variant="outline" className="mt-2">Região: {profile.regiao}</Badge>
            )}
          </section>

          {!profile.entrega_mesmo_endereco && (
            <>
              <Separator />
              <section>
                <h3 className="text-sm font-semibold mb-3">🚚 Endereço de entrega</h3>
                <p className="text-sm whitespace-pre-line">{buildAddress(profile, "delivery") || "—"}</p>
              </section>
            </>
          )}

          <Separator />

          <section>
            <h3 className="text-sm font-semibold mb-3">⏰ Horário de entrega</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Manhã"
                value={
                  profile.horario_manha_inicio || profile.horario_manha_fim
                    ? `${fmt(profile.horario_manha_inicio)} – ${fmt(profile.horario_manha_fim)}`
                    : "—"
                }
              />
              <Field
                label="Tarde"
                value={
                  profile.horario_tarde_inicio || profile.horario_tarde_fim
                    ? `${fmt(profile.horario_tarde_inicio)} – ${fmt(profile.horario_tarde_fim)}`
                    : "—"
                }
              />
            </div>
          </section>

          {profile.dias_rota && profile.dias_rota.length > 0 && (
            <>
              <Separator />
              <section>
                <h3 className="text-sm font-semibold mb-3">📅 Dias da rota de entrega</h3>
                <div className="flex flex-wrap gap-1.5">
                  {profile.dias_rota.map((d) => (
                    <Badge key={d} variant="secondary" className="text-xs">{d}</Badge>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Sincronizado automaticamente com a Agenda de Pedidos.
                </p>
              </section>
            </>
          )}

          {((profile.formas_pagamento && profile.formas_pagamento.length > 0) || profile.prazo_pagamento) && (
            <>
              <Separator />
              <section>
                <h3 className="text-sm font-semibold mb-3">💳 Forma de pagamento</h3>
                <div className="flex flex-wrap gap-1.5">
                  {(profile.formas_pagamento ?? []).map((f) => (
                    <Badge key={f} variant="secondary" className="text-xs">{f}</Badge>
                  ))}
                </div>
                {profile.prazo_pagamento && (
                  <p className="mt-2 text-xs">
                    <span className="text-muted-foreground">Prazo: </span>
                    <span className="font-medium">{profile.prazo_pagamento}</span>
                  </p>
                )}
              </section>
            </>
          )}

          {profile.contatos.length > 0 && (
            <>
              <Separator />
              <section>
                <h3 className="text-sm font-semibold mb-3">📞 Contatos</h3>
                <div className="space-y-2">
                  {profile.contatos.map((c) => (
                    <div key={c.id} className="rounded-md border border-border p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{c.nome || "—"}</span>
                        {c.cargo && <Badge variant="secondary" className="text-[10px]">{c.cargo}</Badge>}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-x-2">
                        {c.telefone && <span>📞 {c.telefone}</span>}
                        {c.whatsapp && <span>💬 {c.whatsapp}</span>}
                        {c.email && <span>✉️ {c.email}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {profile.produtos_negociados.length > 0 && (
            <>
              <Separator />
              <section>
                <h3 className="text-sm font-semibold mb-3">🧀 Produtos negociados</h3>
                <div className="space-y-2">
                  {profile.produtos_negociados.map((p) => (
                    <div key={p.id} className="rounded-md border border-border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">{p.produto_nome}</span>
                        <Badge variant="outline">{fmtMoney(p.preco)}</Badge>
                      </div>
                      {p.observacao && (
                        <p className="mt-1 text-xs text-muted-foreground">{p.observacao}</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          <Separator />

          <section>
            <h3 className="text-sm font-semibold mb-3">📣 Ações Comerciais</h3>
            <ClienteAcoesComerciais
              clientProfileId={profile.id}
              clienteNome={(profile.nome_fantasia && profile.nome_fantasia.trim()) || profile.nome}
            />
          </section>

          {profile.observacoes && (
            <>
              <Separator />
              <section>
                <h3 className="text-sm font-semibold mb-3">📝 Observações</h3>
                <p className="text-sm whitespace-pre-line">{profile.observacoes}</p>
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
