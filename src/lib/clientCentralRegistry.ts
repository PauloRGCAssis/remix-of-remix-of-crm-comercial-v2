// ============================================================================
// CADASTRO CENTRAL DO CLIENTE — "cadastre uma vez, use em todo o CRM".
//
// Qualquer módulo (Degustações, Ações Comerciais, Agenda, PDV...) pode informar
// dados cadastrais. Esta biblioteca:
//   1. localiza o cliente pelo ID / CNPJ / nome normalizado (nunca duplica);
//   2. preenche automaticamente os campos VAZIOS da ficha central;
//   3. devolve os conflitos (dado diferente já cadastrado) para confirmação;
//   4. cria a ficha mínima quando o cliente existe só no histórico de vendas;
//   5. registra a auditoria (data, módulo, usuário, registro de origem).
// ============================================================================

import { supabase } from "@/integrations/supabase/client";
import { normalizeClientName } from "@/lib/clientNameNormalization";
import { nameKeyStrict, docKey, addressKey, similarity } from "@/lib/clientAddressMatch";
import { formatPhone } from "@/lib/phoneFormatting";
import type { ClientProfile, Contato } from "@/types/clientProfile";

/* ------------------------------------------------------------------ tipos */

export interface DadosCadastraisInput {
  /** Nome como aparece na tela (pode conter marcadores; será normalizado) */
  nome: string;
  cnpj?: string | null;
  vendedor?: string | null;
  /** Endereço em texto livre: "Rua X, 100 - Sala 2" */
  endereco?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  /** Contato em texto livre: "Maria · (31) 99999-0000" ou só o nome */
  contato?: string | null;
  telefone?: string | null;
}

export type CampoCadastral =
  | "endereco"
  | "bairro"
  | "cidade"
  | "estado"
  | "telefone"
  | "contato";

export interface ConflitoCadastral {
  campo: CampoCadastral;
  label: string;
  atual: string;
  novo: string;
  /** opções extras disponíveis para o campo */
  permiteAlternativo: boolean;
}

export type ResolucaoConflito = "manter" | "atualizar" | "alternativo";

export interface PlanoSincronizacao {
  cliente: string;
  profile?: ClientProfile;
  /** patch com os campos que estavam VAZIOS na ficha (aplicação automática) */
  patch: Record<string, any>;
  /** rótulos dos campos preenchidos automaticamente (para o toast) */
  preenchidos: string[];
  conflitos: ConflitoCadastral[];
  dados: DadosCadastraisInput;
  /** ficha precisa ser criada (cliente só existe no histórico de vendas) */
  criarFicha: boolean;
}

export interface OrigemSincronizacao {
  modulo: string;
  registroId?: string | null;
  usuario?: string | null;
}

/* ------------------------------------------------------------- utilitários */

/** "Rua X, 100 - Sala 2" -> { rua, numero, complemento } */
export function parseEnderecoLivre(texto: string | null | undefined) {
  const valor = String(texto ?? "").trim();
  if (!valor) return { rua: "", numero: "", complemento: "" };
  const [enderecoParte, ...resto] = valor.split(/\s+-\s+/);
  const complemento = resto.join(" - ").trim();
  const partes = enderecoParte.split(",");
  const rua = (partes.shift() ?? "").trim();
  const numero = partes.join(",").trim();
  return { rua, numero, complemento };
}

export function juntarEnderecoLivre(p: {
  rua?: string | null;
  numero?: string | null;
  complemento?: string | null;
}): string {
  const base = [p.rua, p.numero].map((v) => (v ?? "").trim()).filter(Boolean).join(", ");
  const comp = (p.complemento ?? "").trim();
  return [base, comp].filter(Boolean).join(" - ");
}

/** "Maria · (31) 99999-0000" -> { nome, telefone } */
export function parseContatoLivre(texto: string | null | undefined) {
  const valor = String(texto ?? "").trim();
  if (!valor) return { nome: "", telefone: "" };
  const partes = valor.split(/\s*[·|-]\s*/);
  let nome = "";
  let telefone = "";
  for (const parte of partes) {
    const digitos = parte.replace(/\D/g, "");
    if (digitos.length >= 10) telefone = digitos;
    else if (parte.trim()) nome = nome ? `${nome} ${parte.trim()}` : parte.trim();
  }
  if (!telefone) {
    const digitos = valor.replace(/\D/g, "");
    if (digitos.length >= 10) telefone = digitos;
  }
  return { nome: nome.trim(), telefone };
}

function foneKey(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "").replace(/^55/, "").slice(-11);
}

function rowToProfileLite(row: any): ClientProfile {
  return {
    ...row,
    contatos: Array.isArray(row?.contatos) ? row.contatos : [],
    produtos_negociados: Array.isArray(row?.produtos_negociados) ? row.produtos_negociados : [],
    dias_rota: Array.isArray(row?.dias_rota) ? row.dias_rota : [],
    formas_pagamento: Array.isArray(row?.formas_pagamento) ? row.formas_pagamento : [],
  } as ClientProfile;
}

/* -------------------------------------------------- localização do cliente */

/**
 * Localiza a ficha central pelo CNPJ e, na falta dele, pelo NOME NORMALIZADO
 * (ignora acentos, caixa e marcadores como (IM), (GR), (TD), (INATIVO)).
 * Nunca cria um cliente novo aqui — apenas identifica.
 */
export async function localizarFichaCentral(
  nome: string,
  cnpj?: string | null,
): Promise<ClientProfile | undefined> {
  const doc = docKey(cnpj);
  if (doc) {
    const { data } = await (supabase as any)
      .from("client_profiles")
      .select("*")
      .ilike("cnpj", `%${doc}%`)
      .limit(1);
    if (data?.length) return rowToProfileLite(data[0]);
  }

  const canonico = normalizeClientName(nome || "");
  const chave = nameKeyStrict(canonico);
  if (!chave) return undefined;

  // primeira palavra significativa como filtro amplo, comparação final por chave
  const termo = canonico.replace(/[%,()*]/g, " ").trim().split(/\s+/).slice(0, 2).join(" ");
  if (!termo) return undefined;
  const { data } = await (supabase as any)
    .from("client_profiles")
    .select("*")
    .or(`nome.ilike.%${termo}%,nome_fantasia.ilike.%${termo}%`)
    .limit(50);

  const candidatos = (data ?? []) as any[];
  const exato = candidatos.find(
    (c) => nameKeyStrict(c.nome) === chave || nameKeyStrict(c.nome_fantasia) === chave,
  );
  return exato ? rowToProfileLite(exato) : undefined;
}

/* ------------------------------------------------------------ planejamento */

const LABELS: Record<CampoCadastral, string> = {
  endereco: "Endereço",
  bairro: "Bairro",
  cidade: "Cidade",
  estado: "Estado",
  telefone: "Telefone/WhatsApp",
  contato: "Contato",
};

function limpar(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

/**
 * Monta o plano de sincronização: o que pode ser preenchido automaticamente
 * (campo vazio no cadastro) e o que precisa de confirmação (valor diferente).
 */
export async function planejarSincronizacao(
  dados: DadosCadastraisInput,
): Promise<PlanoSincronizacao | null> {
  const nomeCanonico = normalizeClientName(dados.nome || "");
  if (!nomeCanonico) return null;

  const profile = await localizarFichaCentral(dados.nome, dados.cnpj);

  const enderecoNovo = limpar(dados.endereco);
  const bairroNovo = limpar(dados.bairro);
  const cidadeNova = limpar(dados.cidade);
  const estadoNovo = limpar(dados.estado);
  const contato = parseContatoLivre(dados.contato);
  const telefoneNovo = foneKey(dados.telefone) || contato.telefone;
  const contatoNomeNovo = contato.nome;

  if (
    !enderecoNovo && !bairroNovo && !cidadeNova && !estadoNovo && !telefoneNovo && !contatoNomeNovo
  ) {
    return null;
  }

  const patch: Record<string, any> = {};
  const preenchidos: string[] = [];
  const conflitos: ConflitoCadastral[] = [];

  const enderecoAtual = profile ? juntarEnderecoLivre(profile) : "";
  if (enderecoNovo) {
    if (!enderecoAtual) {
      const p = parseEnderecoLivre(enderecoNovo);
      patch.rua = p.rua || null;
      patch.numero = p.numero || null;
      if (p.complemento) patch.complemento = p.complemento;
      preenchidos.push(LABELS.endereco);
    } else {
      const igual =
        addressKey({ rua: enderecoAtual, bairro: profile?.bairro, cidade: profile?.cidade }) ===
          addressKey({ rua: enderecoNovo, bairro: bairroNovo, cidade: cidadeNova }) ||
        similarity(enderecoAtual.toLowerCase(), enderecoNovo.toLowerCase()) >= 0.92;
      if (!igual) {
        conflitos.push({
          campo: "endereco",
          label: LABELS.endereco,
          atual: enderecoAtual,
          novo: enderecoNovo,
          permiteAlternativo: true,
        });
      }
    }
  }

  const simples: Array<[CampoCadastral, string, string]> = [
    ["bairro", bairroNovo, limpar(profile?.bairro)],
    ["cidade", cidadeNova, limpar(profile?.cidade)],
    ["estado", estadoNovo, limpar(profile?.estado)],
  ];
  for (const [campo, novo, atual] of simples) {
    if (!novo) continue;
    if (!atual) {
      patch[campo] = novo;
      preenchidos.push(LABELS[campo]);
    } else if (nameKeyStrict(atual) !== nameKeyStrict(novo)) {
      conflitos.push({ campo, label: LABELS[campo], atual, novo, permiteAlternativo: false });
    }
  }

  if (telefoneNovo) {
    const atual = foneKey(profile?.telefone) || foneKey(profile?.whatsapp);
    if (!atual) {
      patch.telefone = formatPhone(telefoneNovo);
      if (!limpar(profile?.whatsapp)) patch.whatsapp = formatPhone(telefoneNovo);
      preenchidos.push(LABELS.telefone);
    } else if (atual !== telefoneNovo) {
      conflitos.push({
        campo: "telefone",
        label: LABELS.telefone,
        atual: formatPhone(atual),
        novo: formatPhone(telefoneNovo),
        permiteAlternativo: true,
      });
    }
  }

  if (contatoNomeNovo) {
    const contatosAtuais = profile?.contatos ?? [];
    const jaExiste = contatosAtuais.some(
      (c) => nameKeyStrict(c?.nome) === nameKeyStrict(contatoNomeNovo),
    );
    if (!jaExiste) {
      const novoContato: Contato = {
        id: crypto.randomUUID(),
        nome: contatoNomeNovo,
        telefone: telefoneNovo ? formatPhone(telefoneNovo) : undefined,
      };
      patch.contatos = [...contatosAtuais, novoContato];
      preenchidos.push(LABELS.contato);
    }
  }

  const criarFicha = !profile;
  if (!criarFicha && !preenchidos.length && !conflitos.length) return null;

  return {
    cliente: nomeCanonico,
    profile,
    patch,
    preenchidos,
    conflitos,
    dados: { ...dados, nome: nomeCanonico },
    criarFicha,
  };
}

/* ---------------------------------------------------------------- auditoria */

async function registrarAuditoria(
  profileId: string | null,
  cliente: string,
  entradas: Array<{ campo: string; anterior?: string | null; novo?: string | null; acao: string }>,
  origem: OrigemSincronizacao,
) {
  if (!entradas.length) return;
  try {
    await (supabase as any).from("client_data_updates").insert(
      entradas.map((e) => ({
        client_profile_id: profileId,
        cliente,
        campo: e.campo,
        valor_anterior: e.anterior ?? null,
        valor_novo: e.novo ?? null,
        acao: e.acao,
        origem_modulo: origem.modulo,
        origem_registro_id: origem.registroId ?? null,
        usuario: origem.usuario ?? null,
      })),
    );
  } catch {
    /* auditoria nunca bloqueia o fluxo do usuário */
  }
}

/* ---------------------------------------------------------------- aplicação */

export interface ResultadoSincronizacao {
  profileId: string | null;
  fichaCriada: boolean;
  camposPreenchidos: string[];
  enderecosAdicionados: number;
}

/**
 * Grava no cadastro central: cria a ficha mínima quando necessário, aplica o
 * patch automático e resolve os conflitos conforme escolha do usuário.
 */
export async function aplicarSincronizacao(
  plano: PlanoSincronizacao,
  resolucoes: Partial<Record<CampoCadastral, ResolucaoConflito>>,
  origem: OrigemSincronizacao,
): Promise<ResultadoSincronizacao> {
  const auditoria: Array<{ campo: string; anterior?: string | null; novo?: string | null; acao: string }> = [];
  let profileId = plano.profile?.id ?? null;
  let fichaCriada = false;
  let enderecosAdicionados = 0;
  const patch: Record<string, any> = { ...plano.patch };
  let contatos: Contato[] = (patch.contatos as Contato[]) ?? plano.profile?.contatos ?? [];

  for (const campo of plano.preenchidos) auditoria.push({ campo, novo: "", acao: "preenchido" });

  // conflitos resolvidos
  for (const conflito of plano.conflitos) {
    const escolha = resolucoes[conflito.campo] ?? "manter";
    if (escolha === "manter") {
      auditoria.push({
        campo: conflito.campo, anterior: conflito.atual, novo: conflito.novo, acao: "mantido",
      });
      continue;
    }
    if (escolha === "atualizar") {
      if (conflito.campo === "endereco") {
        const p = parseEnderecoLivre(conflito.novo);
        patch.rua = p.rua || null;
        patch.numero = p.numero || null;
        patch.complemento = p.complemento || null;
      } else if (conflito.campo === "telefone") {
        patch.telefone = conflito.novo;
        patch.whatsapp = conflito.novo;
      } else {
        patch[conflito.campo] = conflito.novo;
      }
      auditoria.push({
        campo: conflito.campo, anterior: conflito.atual, novo: conflito.novo, acao: "atualizado",
      });
      continue;
    }
    // alternativo
    if (conflito.campo === "telefone") {
      contatos = [
        ...contatos,
        { id: crypto.randomUUID(), nome: "Telefone alternativo", telefone: conflito.novo },
      ];
      patch.contatos = contatos;
      auditoria.push({ campo: "telefone", novo: conflito.novo, acao: "alternativo" });
    } else if (conflito.campo === "endereco") {
      enderecosAdicionados += 1; // gravado depois, junto do id da ficha
      auditoria.push({ campo: "endereco", novo: conflito.novo, acao: "nova_unidade" });
    }
  }

  // 1) criar ficha mínima quando o cliente só existe no histórico de vendas
  if (!profileId) {
    const enderecoBase = parseEnderecoLivre(plano.dados.endereco);
    const contato = parseContatoLivre(plano.dados.contato);
    const telefone = foneKey(plano.dados.telefone) || contato.telefone;
    const row: Record<string, any> = {
      nome: plano.cliente,
      cnpj: docKey(plano.dados.cnpj) || null,
      vendedor: limpar(plano.dados.vendedor) || null,
      rua: enderecoBase.rua || null,
      numero: enderecoBase.numero || null,
      complemento: enderecoBase.complemento || null,
      bairro: limpar(plano.dados.bairro) || null,
      cidade: limpar(plano.dados.cidade) || null,
      estado: limpar(plano.dados.estado) || null,
      telefone: telefone ? formatPhone(telefone) : null,
      whatsapp: telefone ? formatPhone(telefone) : null,
      contatos: contato.nome
        ? [{ id: crypto.randomUUID(), nome: contato.nome, telefone: telefone ? formatPhone(telefone) : undefined }]
        : [],
      endereco_origem: origem.modulo,
      endereco_atualizado_em: new Date().toISOString(),
    };
    const { data, error } = await (supabase as any)
      .from("client_profiles")
      .insert(row)
      .select("id")
      .single();
    if (error) throw error;
    profileId = data.id as string;
    fichaCriada = true;
    auditoria.push({ campo: "ficha", novo: plano.cliente, acao: "ficha_criada" });
  } else if (Object.keys(patch).length) {
    patch.endereco_origem = origem.modulo;
    patch.endereco_atualizado_em = new Date().toISOString();
    const { error } = await (supabase as any)
      .from("client_profiles")
      .update(patch)
      .eq("id", profileId);
    if (error) throw error;
  }

  // 2) endereços adicionais (novas unidades) ficam vinculados ao MESMO cliente
  if (enderecosAdicionados > 0 && profileId) {
    const conflitoEndereco = plano.conflitos.find((c) => c.campo === "endereco");
    if (conflitoEndereco) {
      const p = parseEnderecoLivre(conflitoEndereco.novo);
      await (supabase as any).from("client_address_staging").insert({
        match_key: nameKeyStrict(plano.cliente),
        nome_fantasia: plano.cliente,
        razao_social: plano.cliente,
        cnpj_cpf: docKey(plano.dados.cnpj) || null,
        rua: p.rua || null,
        numero: p.numero || null,
        complemento: p.complemento || null,
        bairro: limpar(plano.dados.bairro) || null,
        cidade: limpar(plano.dados.cidade) || null,
        vendedor: limpar(plano.dados.vendedor) || null,
        status: "aplicado",
        candidates: [],
        applied_profile_id: profileId,
        source_file: `origem:${origem.modulo}`,
      });
    }
  }

  await registrarAuditoria(profileId, plano.cliente, auditoria, origem);

  return {
    profileId,
    fichaCriada,
    camposPreenchidos: plano.preenchidos,
    enderecosAdicionados,
  };
}
