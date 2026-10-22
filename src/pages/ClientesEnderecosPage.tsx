import { useMemo, useRef, useState } from "react";
import { EscopoUsuarioBar } from "@/components/EscopoUsuarioBar";
import * as XLSX from "xlsx";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useBulkPatchClientProfiles,
  useClientProfiles,
  useCreateClientProfilesRaw,
} from "@/hooks/useClientProfiles";
import { useFullClientDirectory } from "@/hooks/useClientDirectory";
import {
  useAddressStaging,
  useAddressStagingStats,
  useDeleteStaging,
  useMarkStagingApplied,
  useUpsertAddressStaging,
} from "@/hooks/usePdvData";
import {
  buildClientIndex,
  motivoSemCorrespondencia,
  nameKeyStrict,
  resolveAddressClient,
  type ClientRef,
} from "@/lib/clientAddressMatch";
import { matchesClientQuery } from "@/lib/clientSearch";
import { ClienteSelectSearch } from "@/components/clientes/ClienteSelectSearch";
import { BuscaGeralClientes } from "@/components/clientes/BuscaGeralClientes";
import {
  autoMap,
  buildAddressPatch,
  buildMatchIndex,
  CADASTRO_FIELDS,
  CADASTRO_ID_FIELDS,
  cellValue,
  formatDuration,
  isAddressIncomplete,
  matchProfile,
  NONE,
  stagingKey,
  type AddressValues,
} from "@/lib/pdvImport";


const ALL_FIELDS = [...CADASTRO_ID_FIELDS, ...CADASTRO_FIELDS];

interface Relatorio {
  lidos: number;
  atualizados: string[];
  receberamEndereco: string[];
  semAlteracao: number;
  naoEncontrados: string[];
  ambiguos: string[];
  ignoradas: number;
  incompletos: string[];
  erros: string[];
  substituicoes: Array<{ cliente: string; campo: string; de: string; para: string }>;
  duracaoMs: number;
}

export default function ClientesEnderecosPage() {
  const { data: profiles = [] } = useClientProfiles();
  const { data: pendentes = [] } = useAddressStaging();
  const { data: directory = [], isLoading: carregandoBase } = useFullClientDirectory();
  const { data: stats } = useAddressStagingStats();
  const bulkPatch = useBulkPatchClientProfiles();
  const createProfiles = useCreateClientProfilesRaw();
  const upsertStaging = useUpsertAddressStaging();
  const markApplied = useMarkStagingApplied();
  const deleteStaging = useDeleteStaging();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null);
  const [saving, setSaving] = useState(false);
  const [busca, setBusca] = useState("");
  const [rodando, setRodando] = useState(false);
  const [autoRel, setAutoRel] = useState<{
    aplicados: number;
    fichasCriadas: number;
    via: Record<string, number>;
    erros: string[];
  } | null>(null);

  /** Base oficial: fichas cadastradas + clientes que só existem nas vendas importadas. */
  const clientRefs = useMemo<ClientRef[]>(() => {
    const refs: ClientRef[] = profiles.map((p) => ({
      id: p.id,
      nome: p.nome,
      nomeFantasia: p.nome_fantasia,
      cnpj: p.cnpj,
      codigo: p.codigo_cliente,
      telefone: p.telefone || p.whatsapp,
      rua: p.rua,
      numero: p.numero,
      bairro: p.bairro,
      cidade: p.cidade,
    }));
    const jaTem = new Set(refs.map((r) => nameKeyStrict(r.nome)));
    for (const row of directory as any[]) {
      const nome = (row.canonical || row.nome || "").trim();
      if (!nome) continue;
      const key = nameKeyStrict(nome);
      if (!key || jaTem.has(key)) continue;
      jaTem.add(key);
      refs.push({
        nome,
        nomeFantasia: row.nome_fantasia,
        cnpj: row.cnpj,
        cidade: row.cidade,
        bairro: row.bairro,
        somenteVendas: true,
      });
    }
    return refs;
  }, [profiles, directory]);

  const index = useMemo(() => buildClientIndex(clientRefs), [clientRefs]);

  const resolucoes = useMemo(
    () => pendentes.map((item) => ({ item, res: resolveAddressClient(item as any, index) })),
    [pendentes, index],
  );

  const autoAplicaveis = useMemo(() => resolucoes.filter((r) => r.res.status === "match"), [resolucoes]);
  const semCorrespondencia = useMemo(() => resolucoes.filter((r) => r.res.status === "nenhum"), [resolucoes]);

  const filtrados = useMemo(() => {
    const q = busca.trim();
    if (!q) return resolucoes;
    return resolucoes.filter(({ item }) =>
      matchesClientQuery(
        q,
        [item.nome_fantasia, item.razao_social, item.rua, item.bairro, item.cidade, item.vendedor],
        item.cnpj_cpf,
      ),
    );
  }, [resolucoes, busca]);


  const handleFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
      const cols = data.length ? Object.keys(data[0]) : [];
      setRows(data);
      setHeaders(cols);
      setFileName(file.name);
      setMapping(autoMap(cols, ALL_FIELDS));
      setRelatorio(null);
      toast({ title: `${data.length} linha(s) carregada(s)`, description: file.name });
    } catch (e: any) {
      toast({ title: "Erro ao ler a planilha", description: e?.message, variant: "destructive" });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const readValues = (row: Record<string, any>): AddressValues => {
    const out: AddressValues = {};
    for (const f of CADASTRO_FIELDS) (out as any)[f.key] = cellValue(row, mapping[f.key]);
    return out;
  };

  const aplicar = async () => {
    if (!rows.length) return;
    const t0 = performance.now();
    setSaving(true);
    const rel: Relatorio = {
      lidos: rows.length, atualizados: [], receberamEndereco: [], semAlteracao: 0,
      naoEncontrados: [], ambiguos: [], ignoradas: 0, incompletos: [], erros: [],
      substituicoes: [], duracaoMs: 0,
    };
    const index = buildMatchIndex(profiles);
    const updates: Array<{ id: string; patch: Record<string, any> }> = [];
    const staging: Array<Record<string, any>> = [];
    const processados = new Set<string>();

    for (const row of rows) {
      const ids = {
        codigo_cliente: cellValue(row, mapping.codigo_cliente),
        cnpj_cpf: cellValue(row, mapping.cnpj_cpf),
        razao_social: cellValue(row, mapping.razao_social),
      };
      const values = readValues(row);
      const label = values.nome_fantasia || ids.razao_social || ids.cnpj_cpf || ids.codigo_cliente;
      if (!label) {
        rel.ignoradas += 1;
        continue;
      }
      if (isAddressIncomplete(values)) rel.incompletos.push(label);

      const input = { ...ids, nome_fantasia: values.nome_fantasia };
      const result = matchProfile(input, index);
      const base = {
        match_key: stagingKey(input),
        nome_fantasia: values.nome_fantasia || null,
        razao_social: ids.razao_social || null,
        cnpj_cpf: ids.cnpj_cpf || null,
        codigo_cliente: ids.codigo_cliente || null,
        rua: values.rua || null,
        numero: values.numero || null,
        complemento: values.complemento || null,
        bairro: values.bairro || null,
        cidade: values.cidade || null,
        estado: values.estado || null,
        vendedor: values.vendedor || null,
        segmento: values.segmento || null,
        source_file: fileName,
      };

      if (result.status === "ambiguo") {
        rel.ambiguos.push(label);
        staging.push({ ...base, status: "ambiguo", candidates: result.candidates.map((c) => ({ id: c.id, nome: c.nome })) });
        continue;
      }
      if (result.status === "nao_encontrado") {
        rel.naoEncontrados.push(label);
        staging.push({ ...base, status: "pendente", candidates: [] });
        continue;
      }
      const profile = result.profile;
      if (processados.has(profile.id)) {
        rel.ignoradas += 1;
        continue;
      }
      processados.add(profile.id);

      const { patch, changes } = buildAddressPatch(values, profile, fileName);
      if (Object.keys(patch).length === 0) {
        rel.semAlteracao += 1;
        continue;
      }
      updates.push({ id: profile.id, patch });
      rel.atualizados.push(profile.nome);
      if (changes.some((c) => ["rua", "bairro", "cidade"].some((k) => c.campo.toLowerCase().includes(k)))) {
        rel.receberamEndereco.push(profile.nome);
      }
      for (const c of changes) rel.substituicoes.push({ cliente: profile.nome, ...c });
    }

    try {
      if (updates.length) await bulkPatch.mutateAsync(updates);
      if (staging.length) await upsertStaging.mutateAsync(staging as any);
    } catch (e: any) {
      rel.erros.push(e?.message ?? "Erro desconhecido");
      toast({ title: "Erro ao atualizar", description: e?.message, variant: "destructive" });
    }
    rel.duracaoMs = performance.now() - t0;
    setRelatorio(rel);
    setSaving(false);
    if (!rel.erros.length) {
      toast({
        title: "Importação concluída",
        description: `${rel.atualizados.length} cliente(s) atualizado(s) em ${formatDuration(rel.duracaoMs)}.`,
      });
    }
  };

  /* ------------------------------- associação com o cadastro oficial ------ */

  const valuesFromStaging = (item: any): AddressValues => ({
    nome_fantasia: item.nome_fantasia ?? "",
    rua: item.rua ?? "",
    numero: item.numero ?? "",
    complemento: item.complemento ?? "",
    bairro: item.bairro ?? "",
    cidade: item.cidade ?? "",
    estado: item.estado ?? "",
    vendedor: item.vendedor ?? "",
    segmento: item.segmento ?? "",
  });

  const novaFichaRow = (item: any, nome: string) => ({
    nome,
    nome_fantasia: item.nome_fantasia || null,
    cnpj: item.cnpj_cpf || null,
    codigo_cliente: item.codigo_cliente || null,
    rua: item.rua || null,
    numero: item.numero || null,
    complemento: item.complemento || null,
    bairro: item.bairro || null,
    cidade: item.cidade || null,
    estado: item.estado || null,
    vendedor: item.vendedor || null,
    segmento: item.segmento || null,
    endereco_origem: item.source_file || "cadastro Sige",
    endereco_atualizado_em: new Date().toISOString(),
  });

  /** Aplica um registro pendente a um cliente (ficha existente ou cliente que só existe nas vendas). */
  const aplicarRef = async (item: any, ref: ClientRef) => {
    try {
      let profileId = ref.id;
      if (!profileId) {
        const criados = await createProfiles.mutateAsync([novaFichaRow(item, ref.nome)]);
        profileId = criados[0]?.id;
      } else {
        const profile = profiles.find((p) => p.id === profileId);
        if (profile) {
          const { patch } = buildAddressPatch(
            valuesFromStaging(item),
            profile,
            item.source_file ?? "revisão manual",
          );
          if (Object.keys(patch).length) await bulkPatch.mutateAsync([{ id: profileId, patch }]);
        }
      }
      if (!profileId) throw new Error("Não foi possível obter a ficha do cliente");
      await markApplied.mutateAsync({ ids: [item.id], profileIdById: { [item.id]: profileId } });
      toast({ title: "Endereço associado", description: ref.nome });
    } catch (e: any) {
      toast({ title: "Erro ao associar", description: e?.message, variant: "destructive" });
    }
  };

  /** Cruzamento em lote de todos os pendentes de alta confiança. */
  const executarAssociacao = async () => {
    if (!autoAplicaveis.length) return;
    setRodando(true);
    const via: Record<string, number> = {};
    const erros: string[] = [];
    let aplicados = 0;
    let fichasCriadas = 0;
    const idPorRef = new Map<ClientRef, string>();

    for (const { item, res } of autoAplicaveis) {
      if (res.status !== "match") continue;
      try {
        let profileId = res.ref.id ?? idPorRef.get(res.ref);
        if (!profileId) {
          const criados = await createProfiles.mutateAsync([novaFichaRow(item, res.ref.nome)]);
          profileId = criados[0]?.id;
          if (profileId) {
            idPorRef.set(res.ref, profileId);
            fichasCriadas += 1;
          }
        } else if (res.ref.id) {
          const profile = profiles.find((p) => p.id === profileId);
          if (profile) {
            const { patch } = buildAddressPatch(
              valuesFromStaging(item),
              profile,
              item.source_file ?? "associação automática",
            );
            if (Object.keys(patch).length) await bulkPatch.mutateAsync([{ id: profileId, patch }]);
          }
        }
        if (!profileId) throw new Error(`Sem ficha para ${res.ref.nome}`);
        await markApplied.mutateAsync({ ids: [item.id], profileIdById: { [item.id]: profileId } });
        via[res.via] = (via[res.via] ?? 0) + 1;
        aplicados += 1;
      } catch (e: any) {
        erros.push(`${item.nome_fantasia ?? item.razao_social ?? item.id}: ${e?.message}`);
      }
    }

    setAutoRel({ aplicados, fichasCriadas, via, erros });
    setRodando(false);
    toast({
      title: "Associação automática concluída",
      description: `${aplicados} endereço(s) associado(s)${fichasCriadas ? `, ${fichasCriadas} ficha(s) criada(s)` : ""}.`,
    });
  };

  /** Cria fichas para registros do cadastro Sige que não existem em nenhuma base. */
  const criarFichasDoCadastro = async () => {
    if (!semCorrespondencia.length) return;
    setRodando(true);
    const erros: string[] = [];
    let criadas = 0;
    for (const { item } of semCorrespondencia) {
      const nome = (item.razao_social || item.nome_fantasia || "").trim();
      if (!nome) continue;
      try {
        const criados = await createProfiles.mutateAsync([novaFichaRow(item, nome)]);
        const profileId = criados[0]?.id;
        if (!profileId) throw new Error("ficha não criada");
        await markApplied.mutateAsync({ ids: [item.id], profileIdById: { [item.id]: profileId } });
        criadas += 1;
      } catch (e: any) {
        erros.push(`${nome}: ${e?.message}`);
      }
    }
    setAutoRel({ aplicados: criadas, fichasCriadas: criadas, via: { "cadastro Sige": criadas }, erros });
    setRodando(false);
    toast({ title: "Fichas criadas", description: `${criadas} cliente(s) do cadastro oficial.` });
  };


  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold md:text-3xl">Clientes (Endereços)</h1>
            <EscopoUsuarioBar className="mt-3" />
          <p className="mt-1 text-sm text-muted-foreground">
            Importa a planilha de cadastro (Sige) somente com nome fantasia, endereço, número, complemento,
            bairro, cidade, estado, vendedor e segmento. As demais colunas são ignoradas e nenhum dado
            comercial é alterado. Os dados alimentam também a tela Ponto de Venda.
          </p>
        </div>

        <BuscaGeralClientes profiles={profiles} directory={directory} carregandoBase={carregandoBase} />


        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">1. Selecionar planilha de cadastro</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            <Button onClick={() => fileRef.current?.click()}>
              <FileSpreadsheet className="mr-1 h-4 w-4" /> Importar planilha de cadastro
            </Button>
            {rows.length > 0 && <Badge variant="secondary">{rows.length} linha(s) · {fileName}</Badge>}
          </CardContent>
        </Card>

        {rows.length > 0 && (
          <>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">2. Mapeamento das colunas</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {ALL_FIELDS.map((campo) => (
                  <div key={campo.key}>
                    <p className="mb-1 text-xs text-muted-foreground">
                      {campo.label}
                      {CADASTRO_ID_FIELDS.some((f) => f.key === campo.key) && " (identificação)"}
                    </p>
                    <Select
                      value={mapping[campo.key] || NONE}
                      onValueChange={(v) => setMapping((prev) => ({ ...prev, [campo.key]: v }))}
                    >
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>— Não importar —</SelectItem>
                        {headers.map((h) => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">3. Pré-visualização (10 primeiras linhas)</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {ALL_FIELDS.map((c) => <TableHead key={c.key} className="text-xs">{c.label}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 10).map((row, idx) => (
                      <TableRow key={idx}>
                        {ALL_FIELDS.map((c) => (
                          <TableCell key={c.key} className="whitespace-nowrap text-xs">
                            {cellValue(row, mapping[c.key]) || "—"}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">4. Aplicar importação</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-3">
                <Button onClick={aplicar} disabled={saving}>
                  {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Aplicar importação
                </Button>
                <p className="text-xs text-muted-foreground">
                  Identificação: código do cliente → CPF/CNPJ → nome fantasia → razão social. Somente os campos
                  importados são sobrescritos; os demais dados do CRM são preservados. Clientes não encontrados
                  ficam na fila abaixo e são associados automaticamente na próxima importação de PDVs.
                </p>
              </CardContent>
            </Card>
          </>
        )}

        {relatorio && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Relatório da importação do cadastro</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium">
                Registros lidos: <span className="text-muted-foreground">{relatorio.lidos}</span> · Tempo total:{" "}
                <span className="text-muted-foreground">{formatDuration(relatorio.duracaoMs)}</span>
              </p>
              <Linha label="Clientes encontrados e atualizados" items={relatorio.atualizados} />
              <Linha label="Clientes que receberam endereço" items={relatorio.receberamEndereco} />
              <Linha label="Não encontrados nos PDVs / cadastro" items={relatorio.naoEncontrados} />
              <Linha label="Mais de uma correspondência possível" items={relatorio.ambiguos} />
              <Linha label="Registros com endereço incompleto" items={relatorio.incompletos} />
              <p className="font-medium">
                Registros ignorados:{" "}
                <span className="text-muted-foreground">{relatorio.ignoradas + relatorio.semAlteracao}</span>
              </p>
              <Linha label="Registros com erro" items={relatorio.erros} />
              {relatorio.substituicoes.length > 0 && (
                <div>
                  <p className="font-medium">
                    Substituições: <span className="text-muted-foreground">{relatorio.substituicoes.length}</span>
                  </p>
                  <div className="max-h-48 overflow-y-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Cliente</TableHead>
                          <TableHead className="text-xs">Campo</TableHead>
                          <TableHead className="text-xs">Dado anterior</TableHead>
                          <TableHead className="text-xs">Novo dado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {relatorio.substituicoes.slice(0, 300).map((s, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{s.cliente}</TableCell>
                            <TableCell className="text-xs">{s.campo}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{s.de}</TableCell>
                            <TableCell className="text-xs">{s.para}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Associação automática com o cadastro oficial</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              O cruzamento usa, nesta ordem: código do cliente → CNPJ/CPF → telefone → nome normalizado
              (ignora acentos, maiúsculas, pontuação e tags como “(IM)”, “(GR)”, “INATIVO”) → nome + endereço.
              A base consultada é o cadastro de clientes <strong>somada</strong> a todos os clientes com vendas
              importadas. Nada é fundido apenas por semelhança: nomes parecidos viram sugestão.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => void executarAssociacao()} disabled={rodando || carregandoBase || !autoAplicaveis.length}>
                {(rodando || carregandoBase) && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Executar associação automática ({carregandoBase ? "..." : autoAplicaveis.length})
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void criarFichasDoCadastro()}
                disabled={rodando || carregandoBase || !semCorrespondencia.length}
              >
                Criar ficha a partir do cadastro Sige ({carregandoBase ? "..." : semCorrespondencia.length})
              </Button>
              <Badge variant="secondary">
                {stats ? `${stats.aplicados} de ${stats.total} endereços já aplicados` : "carregando totais..."}
              </Badge>
            </div>
            {autoRel && (
              <div className="rounded-md border p-3 text-xs">
                <p className="font-medium">
                  {autoRel.aplicados} endereço(s) associado(s) automaticamente
                  {autoRel.fichasCriadas > 0 && ` · ${autoRel.fichasCriadas} ficha(s) criada(s) para clientes que já existiam nas vendas`}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {Object.entries(autoRel.via).map(([via, n]) => `${via}: ${n}`).join(" · ") || "—"}
                </p>
                {autoRel.erros.length > 0 && (
                  <p className="mt-1 text-destructive">Erros: {autoRel.erros.slice(0, 5).join(" | ")}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-3 pb-3">
            <CardTitle className="text-sm">
              Revisão manual · {pendentes.length} registro(s) aguardando associação
            </CardTitle>
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome fantasia, razão social, endereço, bairro, cidade ou CNPJ..."
              className="h-9 max-w-xl"
            />
          </CardHeader>
          <CardContent className="space-y-2">
            {pendentes.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum registro pendente de revisão.</p>
            )}
            {filtrados.length === 0 && pendentes.length > 0 && (
              <p className="text-sm text-muted-foreground">Nenhum registro encontrado para “{busca}”.</p>
            )}
            {filtrados.slice(0, 150).map(({ item, res }) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {item.nome_fantasia || item.razao_social || item.cnpj_cpf || "(sem nome)"}
                    {res.status === "match" && (
                      <Badge variant="secondary" className="ml-2">Pronto para associar via {res.via}</Badge>
                    )}
                    {res.status === "sugestao" && (
                      <Badge variant="outline" className="ml-2">Sugestão de cliente</Badge>
                    )}
                    {res.status === "nenhum" && (
                      <Badge variant="destructive" className="ml-2">Sem cliente correspondente</Badge>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[item.rua, item.numero, item.bairro, item.cidade, item.estado].filter(Boolean).join(", ") || "—"}
                  </p>
                  {res.status === "match" && (
                    <p className="truncate text-xs text-muted-foreground">→ {res.ref.nome}</p>
                  )}
                  {res.status === "sugestao" && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {res.sugestoes.map((s, i) => (
                        <Button
                          key={i}
                          size="sm"
                          variant="outline"
                          className="h-6 text-[11px]"
                          onClick={() => void aplicarRef(item, s.ref)}
                        >
                          {s.ref.nome} ({Math.round(s.score * 100)}%)
                        </Button>
                      ))}
                    </div>
                  )}
                  {res.status === "nenhum" && (
                    <p className="text-[11px] text-muted-foreground">{motivoSemCorrespondencia(item as any)}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <ClienteSelectSearch refs={clientRefs} onSelect={(ref) => void aplicarRef(item, ref)} />
                  <Button size="sm" variant="ghost" onClick={() => void deleteStaging.mutateAsync(item.id)}>
                    Descartar
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}




function Linha({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="font-medium">
        {label}: <span className="text-muted-foreground">{items.length}</span>
      </p>
      {items.length > 0 && (
        <p className="max-h-24 overflow-y-auto text-xs text-muted-foreground">{items.slice(0, 200).join(", ")}</p>
      )}
    </div>
  );
}
