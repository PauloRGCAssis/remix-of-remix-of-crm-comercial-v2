import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Loader2, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { ClientProfile } from "@/types/clientProfile";
import { ClientProfileViewer } from "@/components/cadastro/ClientProfileViewer";
import { ClientProfileDialog } from "@/components/cadastro/ClientProfileDialog";
import { clientMatchScore, matchesClientQuery, normalizeSearchText } from "@/lib/clientSearch";
import { docKey, nameKeyStrict, similarity } from "@/lib/clientAddressMatch";
import { detectarGruposEconomicos } from "@/lib/centralAnalise/economicGroups";
import { normalizeClientName } from "@/lib/clientNameNormalization";
import { formatPhone } from "@/lib/phoneFormatting";

/**
 * Busca GERAL da base de clientes/endereços — independente do estado de
 * associação. Consulta fichas cadastradas (client_profiles), o cadastro
 * importado do Sige (client_address_staging, em qualquer status) e os clientes
 * que só existem nas vendas importadas (client_directory).
 */

interface StagingRow {
  id: string;
  nome_fantasia: string | null;
  razao_social: string | null;
  cnpj_cpf: string | null;
  codigo_cliente: string | null;
  rua: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  vendedor: string | null;
  segmento: string | null;
  status: string;
  applied_profile_id: string | null;
}

interface EnderecoItem {
  origem: "ficha" | "cadastro";
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
  statusAssociacao: string;
}

interface Resultado {
  key: string;
  nome: string;
  nomeFantasia?: string;
  codigo?: string;
  cnpj?: string;
  vendedor?: string;
  telefone?: string;
  segmento?: string;
  temFicha: boolean;
  ativo: boolean;
  profile?: ClientProfile;
  enderecos: EnderecoItem[];
  score: number;
}

function useAllAddressStaging() {
  return useQuery({
    queryKey: ["client_address_staging_all"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const all: StagingRow[] = [];
      const size = 1000;
      for (let from = 0; ; from += size) {
        const { data, error } = await (supabase as any)
          .from("client_address_staging")
          .select(
            "id, nome_fantasia, razao_social, cnpj_cpf, codigo_cliente, rua, numero, complemento, bairro, cidade, estado, vendedor, segmento, status, applied_profile_id",
          )
          .range(from, from + size - 1);
        if (error) throw error;
        const rows = (data ?? []) as StagingRow[];
        all.push(...rows);
        if (rows.length < size) break;
      }
      return all;
    },
  });
}

function juntar(p: { rua?: string | null; numero?: string | null; complemento?: string | null }) {
  const base = [p.rua, p.numero].filter(Boolean).join(", ");
  return [base, p.complemento].filter(Boolean).join(" - ").trim();
}

function rotuloStatusStaging(row: StagingRow) {
  if (row.status === "aplicado") return "associado ao cadastro";
  if (row.status === "ambiguo") return "aguardando associação (ambíguo)";
  return "aguardando associação";
}

const dash = (v?: string | null) => (v && String(v).trim() ? String(v).trim() : "—");

export function BuscaGeralClientes({
  profiles,
  directory,
  carregandoBase,
}: {
  profiles: ClientProfile[];
  directory: any[];
  carregandoBase?: boolean;
}) {
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  const [verProfile, setVerProfile] = useState<ClientProfile | null>(null);
  const [editProfile, setEditProfile] = useState<ClientProfile | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setTermo(busca), 250);
    return () => clearTimeout(t);
  }, [busca]);

  const { data: staging = [], isLoading: carregandoStaging } = useAllAddressStaging();

  const grupos = useMemo(() => {
    if (normalizeSearchText(termo).length < 2) return null;
    return detectarGruposEconomicos(
      profiles.map((p) => ({ nome: p.nome, cnpj: p.cnpj ?? null })),
    );
  }, [profiles, termo]);

  const resultados = useMemo<Resultado[]>(() => {
    const q = termo.trim();
    if (normalizeSearchText(q).length < 2) return [];

    const mapa = new Map<string, Resultado>();
    const chave = (nome: string, cnpj?: string | null) =>
      docKey(cnpj) || nameKeyStrict(nome) || normalizeSearchText(nome);

    const tolerante = (nome?: string | null) =>
      similarity(normalizeSearchText(q), normalizeSearchText(nome)) >= 0.82;

    // 1) fichas cadastradas
    for (const p of profiles) {
      const ok =
        matchesClientQuery(
          q,
          [p.nome, p.nome_fantasia, p.rua, p.bairro, p.cidade, p.vendedor, p.codigo_cliente, p.telefone, p.whatsapp],
          p.cnpj,
        ) || tolerante(p.nome) || tolerante(p.nome_fantasia);
      if (!ok) continue;
      const k = chave(p.nome, p.cnpj);
      const enderecos: EnderecoItem[] = [];
      const end = juntar(p);
      if (end || p.bairro || p.cidade) {
        enderecos.push({
          origem: "ficha",
          endereco: end,
          bairro: p.bairro ?? "",
          cidade: p.cidade ?? "",
          estado: p.estado ?? "",
          statusAssociacao: "endereço da ficha",
        });
      }
      const existente = mapa.get(k);
      if (existente) {
        existente.enderecos.push(...enderecos);
        continue;
      }
      const contato = p.contatos?.[0];
      mapa.set(k, {
        key: k,
        nome: p.nome,
        nomeFantasia: p.nome_fantasia,
        codigo: p.codigo_cliente,
        cnpj: p.cnpj,
        vendedor: p.vendedor,
        telefone: p.telefone || p.whatsapp || contato?.telefone || contato?.whatsapp,
        segmento: p.segmento,
        temFicha: true,
        ativo: p.pdv_ativo !== false,
        profile: p,
        enderecos,
        score: clientMatchScore(q, p.nome_fantasia || p.nome),
      });
    }

    // 2) cadastro importado (qualquer status de associação)
    for (const s of staging) {
      const nome = (s.nome_fantasia || s.razao_social || "").trim();
      if (!nome) continue;
      const ok =
        matchesClientQuery(
          q,
          [s.nome_fantasia, s.razao_social, s.rua, s.bairro, s.cidade, s.vendedor, s.codigo_cliente],
          s.cnpj_cpf,
        ) || tolerante(nome);
      if (!ok) continue;
      const k = chave(nome, s.cnpj_cpf);
      const item: EnderecoItem = {
        origem: "cadastro",
        endereco: juntar(s),
        bairro: s.bairro ?? "",
        cidade: s.cidade ?? "",
        estado: s.estado ?? "",
        statusAssociacao: rotuloStatusStaging(s),
      };
      const existente = mapa.get(k);
      if (existente) {
        const dup = existente.enderecos.some(
          (e) => e.endereco === item.endereco && e.bairro === item.bairro && e.cidade === item.cidade,
        );
        if (!dup) existente.enderecos.push(item);
        if (!existente.codigo && s.codigo_cliente) existente.codigo = s.codigo_cliente;
        if (!existente.cnpj && s.cnpj_cpf) existente.cnpj = s.cnpj_cpf;
        if (!existente.vendedor && s.vendedor) existente.vendedor = s.vendedor;
        continue;
      }
      mapa.set(k, {
        key: k,
        nome,
        nomeFantasia: s.nome_fantasia ?? undefined,
        codigo: s.codigo_cliente ?? undefined,
        cnpj: s.cnpj_cpf ?? undefined,
        vendedor: s.vendedor ?? undefined,
        segmento: s.segmento ?? undefined,
        temFicha: false,
        ativo: true,
        enderecos: [item],
        score: clientMatchScore(q, nome),
      });
    }

    // 3) clientes que só existem nas vendas importadas
    for (const row of directory) {
      const nome = (row.canonical || row.nome || "").trim();
      if (!nome) continue;
      const ok =
        matchesClientQuery(q, [row.nome, row.canonical, row.nome_fantasia, row.cidade, row.bairro, row.vendedor], row.cnpj) ||
        tolerante(nome);
      if (!ok) continue;
      const k = chave(nome, row.cnpj);
      if (mapa.has(k)) continue;
      mapa.set(k, {
        key: k,
        nome,
        nomeFantasia: row.nome_fantasia ?? undefined,
        cnpj: row.cnpj ?? undefined,
        vendedor: row.vendedor ?? undefined,
        temFicha: false,
        ativo: true,
        enderecos:
          row.cidade || row.bairro
            ? [
                {
                  origem: "cadastro",
                  endereco: "",
                  bairro: row.bairro ?? "",
                  cidade: row.cidade ?? "",
                  estado: "",
                  statusAssociacao: "somente vendas (sem ficha)",
                },
              ]
            : [],
        score: clientMatchScore(q, nome),
      });
    }

    return Array.from(mapa.values())
      .sort((a, b) => b.score - a.score || a.nome.localeCompare(b.nome, "pt-BR"))
      .slice(0, 30);
  }, [termo, profiles, staging, directory]);

  const grupoDe = (nome: string) => {
    if (!grupos) return undefined;
    const gk = grupos.clienteParaGrupo.get(normalizeClientName(nome));
    return gk ? grupos.grupos.get(gk)?.nome : undefined;
  };

  const carregando = carregandoStaging || carregandoBase;

  return (
    <>
      <Card className="border-primary/40">
        <CardHeader className="gap-2 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Search className="h-4 w-4" /> Buscar cliente na base
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Consulta TODOS os clientes e endereços da base — associados, aguardando associação, com ou sem
            ficha. Pesquisa por nome fantasia, razão social, parte do nome, CNPJ, endereço, bairro, cidade,
            telefone e código do cliente (ignora acentos e maiúsculas).
          </p>
          <div className="relative max-w-2xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Ex.: Emporio Cafe e Vinho, 12.345.678/0001-90, Savassi..."
              className="h-10 pl-9"
            />
            {carregando && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {normalizeSearchText(termo).length >= 2 && resultados.length === 0 && !carregando && (
            <p className="text-sm text-muted-foreground">Nenhum cliente encontrado para “{termo}”.</p>
          )}
          {resultados.map((r) => {
            const grupo = grupoDe(r.nome);
            return (
              <div key={r.key} className="rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{r.nomeFantasia?.trim() || r.nome}</p>
                    {r.nomeFantasia?.trim() && r.nomeFantasia.trim() !== r.nome && (
                      <p className="text-xs text-muted-foreground">Razão social: {r.nome}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge variant={r.temFicha ? "secondary" : "outline"}>
                      {r.temFicha ? "com ficha" : "sem ficha"}
                    </Badge>
                    <Badge variant={r.ativo ? "secondary" : "destructive"}>{r.ativo ? "ativo" : "inativo"}</Badge>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
                  <p><span className="text-muted-foreground">Código: </span>{dash(r.codigo)}</p>
                  <p><span className="text-muted-foreground">CNPJ/CPF: </span>{dash(r.cnpj)}</p>
                  <p><span className="text-muted-foreground">Vendedor: </span>{dash(r.vendedor)}</p>
                  <p>
                    <span className="text-muted-foreground">Telefone/WhatsApp: </span>
                    {r.telefone ? formatPhone(String(r.telefone)) : "—"}
                  </p>
                  <p><span className="text-muted-foreground">Segmento: </span>{dash(r.segmento)}</p>
                  <p><span className="text-muted-foreground">Grupo econômico: </span>{dash(grupo)}</p>
                </div>

                <div className="mt-2 space-y-1">
                  {r.enderecos.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum endereço cadastrado.</p>
                  )}
                  {r.enderecos.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 rounded border bg-muted/30 p-2 text-xs">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p>
                          {[e.endereco, e.bairro, [e.cidade, e.estado].filter(Boolean).join("/")]
                            .filter(Boolean)
                            .join(" · ") || "endereço não informado"}
                        </p>
                        <p className="text-muted-foreground">
                          {e.origem === "ficha" ? "Ficha do CRM" : "Cadastro Sige"} · {e.statusAssociacao}
                        </p>
                      </div>
                    </div>
                  ))}
                  {r.enderecos.length > 1 && (
                    <p className="text-[11px] text-muted-foreground">
                      {r.enderecos.length} endereços/unidades vinculados a este cliente.
                    </p>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!r.profile}
                    onClick={() => r.profile && setVerProfile(r.profile)}
                  >
                    Ver cadastro completo
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditProfile(r.profile ?? null);
                      setEditOpen(true);
                    }}
                  >
                    {r.profile ? "Editar endereço" : "Criar ficha"}
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <ClientProfileViewer
        open={!!verProfile}
        onOpenChange={(o) => !o && setVerProfile(null)}
        profile={verProfile}
        onEdit={() => {
          setEditProfile(verProfile);
          setVerProfile(null);
          setEditOpen(true);
        }}
      />
      <ClientProfileDialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setEditProfile(null);
        }}
        initial={editProfile}
      />
    </>
  );
}
