import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CalendarIcon, Route, FileText, MapPin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { resolveVisitaHorario } from "@/lib/visitaHorario";
import { Visita, Lead } from "@/types/crm";
import {
  geocodeAddress,
  GeoPoint,
  nearestNeighborOrder,
} from "@/lib/geocode";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "@/hooks/use-toast";
import { savePdfDoc, preopenPdfTab } from "@/lib/pdfDownload";
import { CityBadge } from "@/components/CityBadge";

const BASE_PARTS = {
  rua: "Rua Odilon Braga",
  numero: "305",
  bairro: "Anchieta",
  cidade: "Belo Horizonte",
  estado: "MG",
};
const BASE_LABEL = "Rua Odilon Braga, 305, Apto 701 — Anchieta, Belo Horizonte/MG";
const BASE_FALLBACK_COORDS: GeoPoint = { lat: -19.9484, lon: -43.9298 };

type RouteVisita = Visita & { lead?: Lead };
type GeocodedItem = { visita: RouteVisita; coords: GeoPoint };

interface RouteGeneratorProps {
  visitas: RouteVisita[];
}

function leadParts(lead?: Lead) {
  return {
    rua: lead?.endereco,
    numero: undefined,
    bairro: lead?.bairro,
    cidade: lead?.cidade,
    estado: lead?.estado,
    cep: lead?.cep,
  };
}

function leadCidadeUf(lead?: Lead): string {
  return [lead?.cidade?.trim(), lead?.estado?.trim().toUpperCase()].filter(Boolean).join("/");
}

function formatEnderecoLinha(lead?: Lead): string {
  const cidadeUf = leadCidadeUf(lead);
  return [lead?.endereco, lead?.bairro, cidadeUf || null].filter(Boolean).join(" — ") || "—";
}

export function RouteGenerator({ visitas }: RouteGeneratorProps) {
  const [open, setOpen] = useState(false);
  const [routeDate, setRouteDate] = useState<Date | undefined>(undefined);
  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ordered, setOrdered] = useState<GeocodedItem[]>([]);
  const [semCoords, setSemCoords] = useState<RouteVisita[]>([]);

  const dayVisitas = useMemo(() => {
    if (!routeDate) return [];
    const dateStr = format(routeDate, "yyyy-MM-dd");
    return visitas.filter((v) => v.data_visita === dateStr && v.status === "AGENDADA");
  }, [visitas, routeDate]);

  useEffect(() => {
    if (!showPreview || !routeDate) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const baseCoords = (await geocodeAddress(BASE_PARTS)) ?? BASE_FALLBACK_COORDS;

      const geocoded: GeocodedItem[] = [];
      const semCoord: RouteVisita[] = [];
      for (const v of dayVisitas) {
        if (cancelled) return;
        const lead = v.lead;
        if (lead?.latitude != null && lead?.longitude != null) {
          geocoded.push({ visita: v, coords: { lat: lead.latitude, lon: lead.longitude } });
          continue;
        }
        const c = await geocodeAddress(leadParts(lead));
        if (c) geocoded.push({ visita: v, coords: c });
        else semCoord.push(v);
      }

      if (cancelled) return;
      const sorted = nearestNeighborOrder(baseCoords, geocoded);
      // Inclui clientes sem coordenadas no final, na ordem original
      const finalOrdered: GeocodedItem[] = [
        ...sorted,
        ...semCoord.map((v) => ({ visita: v, coords: baseCoords })),
      ];
      setOrdered(finalOrdered);
      setSemCoords(semCoord);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [showPreview, routeDate, dayVisitas]);

  const buildPDF = () => {
    const doc = new jsPDF();
    const dateStr = routeDate ? format(routeDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : "";

    doc.setFontSize(16);
    doc.text("Roteiro de Visitas", 14, 20);
    doc.setFontSize(10);
    doc.text(dateStr, 14, 28);
    doc.text(`Ponto de partida: ${BASE_LABEL}`, 14, 34);
    doc.text(`Total de visitas: ${ordered.length}`, 14, 40);

    const tableData = ordered.map((item, i) => {
      const v = item.visita;
      const lead = v.lead;
      const phone = lead?.whatsapp || lead?.telefone || "—";
      const phoneLabel = lead?.whatsapp ? `📱 ${phone}` : `📞 ${phone}`;
      const cidadeUf = leadCidadeUf(lead);
      const enderecoLinha = formatEnderecoLinha(lead);
      return [
        `${i + 1}`,
        resolveVisitaHorario(v),
        `${lead?.nome_fantasia || "—"}${cidadeUf ? `\n[${cidadeUf}]` : ""}`,
        enderecoLinha,
        lead?.contato_nome || "—",
        phoneLabel,
      ];
    });

    autoTable(doc, {
      startY: 46,
      head: [["#", "Horário", "Cliente / Cidade", "Endereço", "Contato", "Telefone"]],
      body: tableData,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [59, 130, 246] },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 16 },
        2: { cellWidth: 40 },
        3: { cellWidth: 51 },
        4: { cellWidth: 28 },
        5: { cellWidth: 35 },
      },
    });

    return doc;
  };

  const generatePDF = () => {
    const preopened = preopenPdfTab();
    savePdfDoc(buildPDF(), `roteiro-${format(routeDate!, "yyyy-MM-dd")}.pdf`, {
      preopened,
      onError: (message) => toast({ title: "Erro ao gerar PDF", description: message, variant: "destructive" }),
    });
  };

  return (
    <>
      <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5" onClick={() => setOpen(true)}>
        <Route className="h-4 w-4" />
        Gerar Rota
      </Button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setShowPreview(false);
            setOrdered([]);
            setSemCoords([]);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Route className="h-5 w-5" /> Gerar Roteiro de Visitas
            </DialogTitle>
            <DialogDescription>
              Rota otimizada por geolocalização, partindo de {BASE_LABEL}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Selecione a data:</p>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal h-9 text-xs",
                      !routeDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-3 w-3" />
                    {routeDate ? format(routeDate, "dd/MM/yyyy") : "Escolher data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={routeDate}
                    onSelect={(d) => {
                      setRouteDate(d);
                      setShowPreview(false);
                    }}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {routeDate && (
              <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium">
                  {format(routeDate, "EEEE, dd/MM/yyyy", { locale: ptBR })} — {dayVisitas.length} visita(s) agendada(s)
                </p>

                {dayVisitas.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma visita agendada nesta data.</p>
                ) : !showPreview ? (
                  <Button
                    variant="outline"
                    className="w-full h-9 text-xs gap-1.5"
                    onClick={() => setShowPreview(true)}
                  >
                    <Route className="h-4 w-4" />
                    Visualizar Roteiro
                  </Button>
                ) : loading ? (
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-6">
                    <Loader2 className="h-4 w-4 animate-spin" /> Geocodificando endereços...
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> Partida: {BASE_LABEL}
                      </p>
                      {ordered.map((item, i) => {
                        const v = item.visita;
                        return (
                          <div
                            key={`${v.id}-${v.data_visita}-${v.horario_visita || "sem-hora"}-${v.criado_em}`}
                            className="flex items-start gap-2 text-xs bg-background p-2 rounded border"
                          >
                            <span className="bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                              {i + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                  <p className="font-medium truncate">{v.lead?.nome_fantasia}</p>
                                  <CityBadge cidade={v.lead?.cidade} estado={v.lead?.estado} />
                                </div>
                                <span className="text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded flex-shrink-0">
                                  🕐 {resolveVisitaHorario(v)}
                                </span>
                              </div>
                              <p className="text-muted-foreground">
                                {formatEnderecoLinha(v.lead)}
                                {v.lead?.regional ? ` • ${v.lead.regional}` : ""}
                              </p>
                              {(v.lead?.contato_nome || v.lead?.whatsapp || v.lead?.telefone) && (
                                <p className="text-muted-foreground">
                                  {v.lead.contato_nome && `${v.lead.contato_nome} • `}
                                  {v.lead?.whatsapp
                                    ? `📱 ${v.lead.whatsapp}`
                                    : v.lead?.telefone
                                    ? `📞 ${v.lead.telefone}`
                                    : ""}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 h-9 text-xs gap-1.5"
                        disabled={ordered.length === 0}
                        onClick={() => {
                          const pdfDoc = buildPDF();
                          window.open(pdfDoc.output("bloburl"), "_blank");
                        }}
                      >
                        <FileText className="h-4 w-4" />
                        Visualizar
                      </Button>
                      <Button
                        className="flex-1 h-9 text-xs gap-1.5"
                        disabled={ordered.length === 0}
                        onClick={() => generatePDF()}
                      >
                        <FileText className="h-4 w-4" />
                        Baixar PDF
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
