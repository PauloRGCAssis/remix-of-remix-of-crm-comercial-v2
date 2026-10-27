import { supabase } from "@/integrations/supabase/client";
import { CrmSnapshot, extractMaxIdCounterFromEntities } from "@/lib/crmPersistence";
import { repairCrmSnapshot } from "@/lib/crmSnapshotRepair";
import { normalizeVisitaLegacyFields } from "@/lib/visitaHorario";
import { Lead, Visita } from "@/types/crm";

/**
 * Sincronização de leads e visitas com o Supabase.
 *
 * Três estados por registro, nunca confundidos:
 * - local: só no estado React (e no cache do navegador);
 * - pendente: diferente da última versão confirmada, aguardando gravação;
 * - confirmado: o banco devolveu a linha gravada (`confirmados`).
 *
 * Regras:
 * - grava só o que mudou desde a última versão confirmada (não o snapshot inteiro);
 * - UPDATE/DELETE exigem que o banco ainda esteja na versão conhecida
 *   (`atualizado_em`); 0 linhas afetadas = RLS ou conflito, conferido relendo;
 * - exclusões só são enviadas quando o usuário exclui (`registrarExclusao`);
 * - nada é gravado antes de uma carga bem-sucedida, nem para outro usuário.
 */

type LegacyVisita = Visita & { horario?: string; horarioVisita?: string; hora_visita?: string };

export type EntidadeCrm = "lead" | "visita";
export type OperacaoCrm = "criar" | "editar" | "excluir";
export type TipoFalha = "permissao" | "conflito" | "rede" | "autenticacao" | "outro";
export type FaseSync = "carregando" | "indisponivel" | "salvando" | "pendente" | "erro" | "sincronizado";

export interface FalhaSync {
  entidade: EntidadeCrm;
  id: string;
  nome: string;
  operacao: OperacaoCrm;
  tipo: TipoFalha;
  mensagem: string;
}

export interface EstadoSync {
  fase: FaseSync;
  /** Registros alterados localmente e ainda não confirmados pelo banco. */
  pendentes: number;
  ultimaFalha: FalhaSync | null;
}

/**
 * Correção do estado local após recusa ou conflito. `seAtualizadoEm` protege
 * alterações válidas feitas depois: só se aplica se o registro local ainda
 * estiver na versão recusada (null = registro ausente localmente).
 */
export interface ReconciliacaoCrm {
  entidade: EntidadeCrm;
  remover: { id: string; seAtualizadoEm: string }[];
  restaurar: { item: Lead | Visita; seAtualizadoEm: string | null }[];
}

export interface CrmCloudSyncCallbacks {
  onEstado?: (estado: EstadoSync) => void;
  onFalha?: (falha: FalhaSync) => void;
  onReconciliar?: (rec: ReconciliacaoCrm) => void;
}

type Item = Lead | Visita;
type Confirmado = { item: Item; versao: string };
type ErroSupabase = { code?: string; message?: string; status?: number } | null | undefined;

const TABELA: Record<EntidadeCrm, "crm_leads" | "crm_visitas"> = { lead: "crm_leads", visita: "crm_visitas" };
const ESPERA_MAXIMA_MS = 60_000;

function instante(valor?: string | null): number {
  const t = Date.parse(valor ?? "");
  return Number.isFinite(t) ? t : 0;
}

/** Classifica um erro do Supabase/fetch. */
export function classificarErro(erro: unknown): TipoFalha {
  const e = (erro ?? {}) as { code?: string; message?: string; status?: number };
  const code = String(e.code ?? "");
  const msg = String(e.message ?? erro ?? "");
  if (code === "42501" || /row-level security|permission denied/i.test(msg)) return "permissao";
  if (code === "PGRST301" || code === "PGRST303" || e.status === 401 || /jwt|token.*expired|not authenticated/i.test(msg)) return "autenticacao";
  if (/failed to fetch|networkerror|network request failed|fetch failed|load failed|timeout/i.test(msg)) return "rede";
  return "outro";
}

const MENSAGENS: Record<TipoFalha, string> = {
  permissao: "o banco recusou a operação (sem permissão). A alteração foi desfeita.",
  conflito: "o registro foi alterado ou removido por outra pessoa. A versão do banco foi mantida.",
  rede: "sem conexão com o servidor. A alteração continua pendente e será reenviada.",
  autenticacao: "a sessão terminou. A alteração não foi enviada.",
  outro: "o banco recusou a operação. A alteração não foi salva na nuvem.",
};

function nomeDe(entidade: EntidadeCrm, item: Item | undefined, id: string) {
  if (!item) return id;
  return entidade === "lead" ? (item as Lead).nome_fantasia || id : `visita de ${(item as Visita).data_visita ?? id}`;
}

export function normalizeCloudSnapshot(leads: Lead[], visitas: LegacyVisita[], updatedAt?: string): CrmSnapshot {
  const visitasNorm = visitas.map((v) => normalizeVisitaLegacyFields(v));
  return repairCrmSnapshot({
    leads,
    visitas: visitasNorm,
    justificativas: [],
    leadsExcluidos: [],
    idCounter: extractMaxIdCounterFromEntities({ leads, visitas: visitasNorm, fallback: 100 }),
    savedAt: updatedAt || new Date().toISOString(),
  });
}

/** Aplica uma reconciliação a uma lista local, sem desfazer alterações mais novas. */
export function aplicarReconciliacao<T extends Item>(lista: T[], rec: ReconciliacaoCrm): T[] {
  let resultado = lista;
  for (const r of rec.remover) {
    const atual = resultado.find((x) => x.id === r.id);
    if (atual && atual.atualizado_em === r.seAtualizadoEm) resultado = resultado.filter((x) => x.id !== r.id);
  }
  for (const { item, seAtualizadoEm } of rec.restaurar) {
    const atual = resultado.find((x) => x.id === item.id);
    if (!atual) {
      if (seAtualizadoEm === null) resultado = [...resultado, item as T];
    } else if (atual.atualizado_em === seAtualizadoEm) {
      resultado = resultado.map((x) => (x.id === item.id ? (item as T) : x));
    }
  }
  return resultado;
}

export class CrmCloudSync {
  private confirmados: Record<EntidadeCrm, Map<string, Confirmado>> = { lead: new Map(), visita: new Map() };
  private exclusoes: Record<EntidadeCrm, Set<string>> = { lead: new Set(), visita: new Set() };
  /** Recusas definitivas ("outro"): não reenviar a mesma versão. */
  private recusados = new Map<string, string>();
  private carregado = false;
  private encerrada = false;
  private ultimo: { leads: Lead[]; visitas: Visita[] } | null = null;
  private conhecido: { leads: Lead[]; visitas: Visita[] } | null = null;
  private fila: Promise<void> | null = null;
  private espera: ReturnType<typeof setTimeout> | null = null;
  private tentativas = 0;
  private estado: EstadoSync = { fase: "carregando", pendentes: 0, ultimaFalha: null };

  constructor(private readonly userId: string, private readonly callbacks: CrmCloudSyncCallbacks = {}) {}

  get estadoAtual(): EstadoSync {
    return this.estado;
  }

  /** O registro está gravado no banco exatamente nesta versão local? */
  confirmado(entidade: EntidadeCrm, id: string, atualizadoEm?: string): boolean {
    const c = this.confirmados[entidade].get(id);
    return !!c && (atualizadoEm === undefined || c.item.atualizado_em === atualizadoEm);
  }

  private emitir(parcial: Partial<EstadoSync>) {
    this.estado = { ...this.estado, ...parcial };
    this.callbacks.onEstado?.(this.estado);
  }

  private falhar(entidade: EntidadeCrm, id: string, item: Item | undefined, operacao: OperacaoCrm, tipo: TipoFalha, detalhe?: string) {
    const falha: FalhaSync = {
      entidade, id, operacao, tipo,
      nome: nomeDe(entidade, item, id),
      mensagem: `${MENSAGENS[tipo]}${detalhe ? ` (${detalhe})` : ""}`,
    };
    this.emitir({ ultimaFalha: falha });
    this.callbacks.onFalha?.(falha);
  }

  private reconciliar(rec: ReconciliacaoCrm) {
    if (rec.remover.length || rec.restaurar.length) this.callbacks.onReconciliar?.(rec);
  }

  /** Carrega a nuvem e define a base confirmada. `null` = falha (nada será gravado). */
  async carregar(): Promise<CrmSnapshot | null> {
    this.emitir({ fase: "carregando" });
    try {
      const [leadsRes, visitasRes] = await Promise.all([
        supabase.from("crm_leads").select("id,payload,atualizado_em"),
        supabase.from("crm_visitas").select("id,payload,atualizado_em"),
      ]);
      if (leadsRes.error) throw leadsRes.error;
      if (visitasRes.error) throw visitasRes.error;
      if (this.encerrada) return null;

      const linhasLead = (leadsRes.data ?? []) as { id: string; payload: unknown; atualizado_em: string }[];
      const linhasVisita = (visitasRes.data ?? []) as { id: string; payload: unknown; atualizado_em: string }[];
      for (const l of linhasLead) this.confirmados.lead.set(l.id, { item: l.payload as Lead, versao: l.atualizado_em });
      for (const v of linhasVisita) {
        this.confirmados.visita.set(v.id, { item: normalizeVisitaLegacyFields(v.payload as LegacyVisita), versao: v.atualizado_em });
      }
      this.carregado = true;
      this.emitir({ fase: "sincronizado", pendentes: 0 });

      const updatedAt = [...linhasLead, ...linhasVisita].map((r) => r.atualizado_em).sort().at(-1);
      return normalizeCloudSnapshot(
        linhasLead.map((l) => l.payload as Lead),
        linhasVisita.map((v) => v.payload as LegacyVisita),
        updatedAt,
      );
    } catch (erro) {
      const tipo = classificarErro(erro);
      this.emitir({
        fase: "indisponivel",
        ultimaFalha: {
          entidade: "lead", id: "", nome: "dados do CRM", operacao: "editar", tipo,
          mensagem: "Não foi possível carregar os dados da nuvem. Alterações não serão salvas até recarregar.",
        },
      });
      return null;
    }
  }

  /** Exclusão explícita do usuário (as únicas exclusões enviadas ao banco). */
  registrarExclusao(entidade: EntidadeCrm, ids: string[]) {
    for (const id of ids) this.exclusoes[entidade].add(id);
  }

  /** Enfileira o estado atual; chamadas seguidas são agrupadas na mais recente. */
  sincronizar(estado: { leads: Lead[]; visitas: Visita[] }): Promise<void> {
    this.conhecido = estado;
    if (this.encerrada) return Promise.resolve();
    if (!this.carregado) {
      // Sem base confirmada não há como saber o que é novo: nada é gravado.
      this.emitir({ pendentes: this.contarPendentes(estado) });
      return Promise.resolve();
    }
    this.ultimo = estado;
    return this.bombear();
  }

  /** Reenvia o último estado conhecido (após queda de rede, por exemplo). */
  tentarNovamente(): Promise<void> {
    if (this.espera) clearTimeout(this.espera);
    this.espera = null;
    return this.conhecido ? this.sincronizar(this.conhecido) : Promise.resolve();
  }

  /** Para tudo: nenhuma gravação desta instância acontece depois disto. */
  encerrar() {
    this.encerrada = true;
    this.ultimo = null;
    if (this.espera) clearTimeout(this.espera);
    this.espera = null;
  }

  private bombear(): Promise<void> {
    if (!this.fila) {
      this.fila = (async () => {
        while (this.ultimo && !this.encerrada) {
          const estado = this.ultimo;
          this.ultimo = null;
          await this.gravar(estado);
        }
      })().finally(() => {
        this.fila = null;
        if (this.ultimo && !this.encerrada) void this.bombear();
      });
    }
    return this.fila;
  }

  private alterados<T extends Item>(entidade: EntidadeCrm, lista: T[]) {
    const novos: T[] = [];
    const editados: T[] = [];
    for (const item of lista) {
      if (this.exclusoes[entidade].has(item.id)) continue;
      if (this.recusados.get(`${entidade}:${item.id}`) === item.atualizado_em) continue;
      const c = this.confirmados[entidade].get(item.id);
      if (!c) novos.push(item);
      // Só versões mais novas que a confirmada: um snapshot antigo nunca regrava.
      else if (instante(item.atualizado_em) > instante(c.item.atualizado_em)) editados.push(item);
    }
    return { novos, editados };
  }

  private contarPendentes(estado: { leads: Lead[]; visitas: Visita[] }) {
    const l = this.alterados("lead", estado.leads);
    const v = this.alterados("visita", estado.visitas);
    const exclusoes = [...this.exclusoes.lead, ...this.exclusoes.visita].length;
    return l.novos.length + l.editados.length + v.novos.length + v.editados.length + exclusoes;
  }

  private agendarNovaTentativa() {
    if (this.espera || this.encerrada) return;
    this.tentativas += 1;
    const atraso = Math.min(ESPERA_MAXIMA_MS, 2_000 * 2 ** (this.tentativas - 1));
    this.espera = setTimeout(() => {
      this.espera = null;
      void this.tentarNovamente();
    }, atraso);
  }

  /** Grava as diferenças; rede ou sessão interrompem e agendam nova tentativa. */
  private async gravar(estado: { leads: Lead[]; visitas: Visita[] }): Promise<void> {
    this.emitir({ fase: "salvando", pendentes: this.contarPendentes(estado) });

    const { data: auth } = await supabase.auth.getUser();
    if (this.encerrada) return;
    if (auth.user?.id !== this.userId) {
      this.falhar("lead", "", undefined, "editar", "autenticacao");
      this.encerrar();
      this.emitir({ fase: "erro", pendentes: this.contarPendentes(estado) });
      return;
    }

    const vendedorPorLead = new Map(estado.leads.map((l) => [l.id, l.vendedor ?? null]));
    const passos: Array<() => Promise<TipoFalha | null>> = [];
    const l = this.alterados("lead", estado.leads);
    const v = this.alterados("visita", estado.visitas);
    for (const item of l.novos) passos.push(() => this.inserir("lead", item, vendedorPorLead));
    for (const item of l.editados) passos.push(() => this.atualizar("lead", item, vendedorPorLead));
    for (const item of v.novos) passos.push(() => this.inserir("visita", item, vendedorPorLead));
    for (const item of v.editados) passos.push(() => this.atualizar("visita", item, vendedorPorLead));
    for (const id of [...this.exclusoes.visita]) passos.push(() => this.excluir("visita", id));
    for (const id of [...this.exclusoes.lead]) passos.push(() => this.excluir("lead", id));

    let interrompido: TipoFalha | null = null;
    for (const passo of passos) {
      if (this.encerrada) return;
      const r = await passo();
      if (r === "rede" || r === "autenticacao") {
        interrompido = r;
        break;
      }
    }
    if (this.encerrada) return;

    const pendentes = this.contarPendentes(this.conhecido ?? estado);
    if (interrompido) {
      this.emitir({ fase: "pendente", pendentes });
      this.agendarNovaTentativa();
      return;
    }
    this.tentativas = 0;
    const recusado = (entidade: EntidadeCrm, x: Item) => this.recusados.get(`${entidade}:${x.id}`) === x.atualizado_em;
    const comRecusa = estado.leads.some((x) => recusado("lead", x)) || estado.visitas.some((x) => recusado("visita", x));
    this.emitir({ fase: comRecusa ? "erro" : pendentes ? "pendente" : "sincronizado", pendentes });
  }

  private linha(entidade: EntidadeCrm, item: Item, vendedorPorLead: Map<string, string | null>) {
    if (entidade === "lead") {
      const lead = item as Lead;
      return {
        vendedor: lead.vendedor ?? null,
        agendado_por: lead.agendado_por ?? null,
        payload: lead as never,
        criado_em: lead.criado_em,
        atualizado_em: lead.atualizado_em,
      };
    }
    const visita = item as Visita;
    return {
      lead_id: visita.lead_id,
      vendedor: vendedorPorLead.get(visita.lead_id) ?? null,
      payload: visita as never,
      criado_em: visita.criado_em,
      atualizado_em: visita.atualizado_em,
    };
  }

  /** Trata erro devolvido pelo banco: desfaz (permissão), marca recusa (outro) ou mantém pendente (rede/sessão). */
  private tratarErro(entidade: EntidadeCrm, item: Item, operacao: OperacaoCrm, erro: ErroSupabase | unknown): TipoFalha {
    const tipo = classificarErro(erro);
    const detalhe = (erro as { message?: string })?.message;
    if (tipo === "permissao") {
      const c = this.confirmados[entidade].get(item.id);
      if (operacao === "criar") this.reconciliar({ entidade, remover: [{ id: item.id, seAtualizadoEm: item.atualizado_em }], restaurar: [] });
      else if (c) this.reconciliar({ entidade, remover: [], restaurar: [{ item: c.item, seAtualizadoEm: operacao === "excluir" ? null : item.atualizado_em }] });
      if (operacao === "excluir") this.exclusoes[entidade].delete(item.id);
    } else if (tipo === "outro") {
      this.recusados.set(`${entidade}:${item.id}`, item.atualizado_em);
      if (operacao === "excluir") this.exclusoes[entidade].delete(item.id);
    }
    this.falhar(entidade, item.id, item, operacao, tipo, tipo === "outro" ? detalhe : undefined);
    return tipo;
  }

  private async inserir(entidade: EntidadeCrm, item: Item, vendedorPorLead: Map<string, string | null>): Promise<TipoFalha | null> {
    try {
      const { data, error } = await supabase
        .from(TABELA[entidade])
        .insert({ id: item.id, ...this.linha(entidade, item, vendedorPorLead), criado_por: this.userId } as never)
        .select("id,atualizado_em")
        .maybeSingle();
      if (error) return this.tratarErro(entidade, item, "criar", error);
      const versao = (data as { atualizado_em?: string } | null)?.atualizado_em ?? item.atualizado_em;
      this.confirmados[entidade].set(item.id, { item, versao });
      this.recusados.delete(`${entidade}:${item.id}`);
      return null;
    } catch (erro) {
      return this.tratarErro(entidade, item, "criar", erro);
    }
  }

  /** Relê o registro após 0 linhas afetadas: decide entre permissão e conflito. */
  private async diagnosticar(entidade: EntidadeCrm, item: Item, operacao: OperacaoCrm): Promise<TipoFalha | null> {
    const c = this.confirmados[entidade].get(item.id)!;
    const { data, error } = await supabase
      .from(TABELA[entidade])
      .select("id,payload,atualizado_em")
      .eq("id", item.id)
      .maybeSingle();
    if (error) return this.tratarErro(entidade, item, operacao, error);
    const atual = data as unknown as { payload: Item; atualizado_em: string } | null;
    const seLocal = operacao === "excluir" ? null : item.atualizado_em;

    if (!atual) {
      // Removido por outra pessoa ou fora do acesso: não há o que gravar.
      this.confirmados[entidade].delete(item.id);
      this.exclusoes[entidade].delete(item.id);
      if (operacao === "excluir") return null; // já não existe: exclusão cumprida
      this.reconciliar({ entidade, remover: [{ id: item.id, seAtualizadoEm: item.atualizado_em }], restaurar: [] });
      this.falhar(entidade, item.id, item, operacao, "conflito");
      return "conflito";
    }
    if (atual.atualizado_em !== c.versao) {
      const servidor = entidade === "visita" ? normalizeVisitaLegacyFields(atual.payload as LegacyVisita) : atual.payload;
      this.confirmados[entidade].set(item.id, { item: servidor, versao: atual.atualizado_em });
      this.exclusoes[entidade].delete(item.id);
      this.reconciliar({ entidade, remover: [], restaurar: [{ item: servidor, seAtualizadoEm: seLocal }] });
      this.falhar(entidade, item.id, item, operacao, "conflito");
      return "conflito";
    }
    // Mesma versão, visível, mas nada foi gravado: a RLS recusou.
    this.exclusoes[entidade].delete(item.id);
    this.reconciliar({ entidade, remover: [], restaurar: [{ item: c.item, seAtualizadoEm: seLocal }] });
    this.falhar(entidade, item.id, item, operacao, "permissao");
    return "permissao";
  }

  private async atualizar(entidade: EntidadeCrm, item: Item, vendedorPorLead: Map<string, string | null>): Promise<TipoFalha | null> {
    const c = this.confirmados[entidade].get(item.id)!;
    try {
      const { data, error } = await supabase
        .from(TABELA[entidade])
        .update(this.linha(entidade, item, vendedorPorLead) as never)
        .eq("id", item.id)
        .eq("atualizado_em", c.versao)
        .select("id,atualizado_em");
      if (error) return this.tratarErro(entidade, item, "editar", error);
      const linhas = (data ?? []) as { atualizado_em: string }[];
      if (linhas.length === 0) return await this.diagnosticar(entidade, item, "editar");
      this.confirmados[entidade].set(item.id, { item, versao: linhas[0].atualizado_em });
      this.recusados.delete(`${entidade}:${item.id}`);
      return null;
    } catch (erro) {
      return this.tratarErro(entidade, item, "editar", erro);
    }
  }

  private async excluir(entidade: EntidadeCrm, id: string): Promise<TipoFalha | null> {
    const c = this.confirmados[entidade].get(id);
    if (!c) {
      // Nunca foi confirmado no banco: não há o que excluir.
      this.exclusoes[entidade].delete(id);
      return null;
    }
    try {
      const { data, error } = await supabase
        .from(TABELA[entidade])
        .delete()
        .eq("id", id)
        .eq("atualizado_em", c.versao)
        .select("id");
      if (error) return this.tratarErro(entidade, c.item, "excluir", error);
      if (((data ?? []) as unknown[]).length === 0) return await this.diagnosticar(entidade, c.item, "excluir");
      this.confirmados[entidade].delete(id);
      this.exclusoes[entidade].delete(id);
      return null;
    } catch (erro) {
      return this.tratarErro(entidade, c.item, "excluir", erro);
    }
  }
}
