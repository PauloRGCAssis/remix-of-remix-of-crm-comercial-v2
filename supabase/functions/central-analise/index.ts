// Central de Análise — analista comercial sênior sobre a base comercial.
// A função NÃO calcula números: ela recebe um "pacote de fatos" já calculado
// programaticamente no cliente e apenas interpreta / investiga / redige.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "google/gemini-3.6-flash";

const ANALISE_SCHEMA = {
  type: "object",
  properties: {
    titulo: { type: "string", description: "Título curto da análise" },
    resumo_executivo: { type: "string", description: "Resumo executivo em markdown simples, objetivo e gerencial" },
    periodo_descricao: { type: "string", description: "Ex.: 01/01/2026 a 14/08/2026 (agosto parcial até 14/08)" },
    blocos: {
      type: "array",
      description: "Seções da análise, na ordem em que devem ser exibidas",
      items: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["texto", "kpis", "tabela", "grafico", "alerta", "destaque"] },
          titulo: { type: "string" },
          texto: { type: "string", description: "Texto explicativo em markdown simples" },
          kpis: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                valor: { type: "string" },
                sub: { type: "string" },
                variacao: { type: "string" },
                sentido: { type: "string", enum: ["positivo", "negativo", "neutro"] },
              },
              required: ["label", "valor"],
            },
          },
          tabela: {
            type: "object",
            properties: {
              colunas: { type: "array", items: { type: "string" } },
              linhas: { type: "array", items: { type: "array", items: { type: "string" } } },
            },
            required: ["colunas", "linhas"],
          },
          grafico: {
            type: "object",
            properties: {
              tipo: { type: "string", enum: ["linha", "barra"] },
              categorias: { type: "array", items: { type: "string" } },
              series: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    nome: { type: "string" },
                    valores: { type: "array", items: { type: "number" } },
                  },
                  required: ["nome", "valores"],
                },
              },
              unidade: { type: "string", description: "R$, kg, pedidos..." },
            },
            required: ["tipo", "categorias", "series"],
          },
          detalhes: {
            type: "object",
            description: "Dados de apoio exibidos ao clicar em 'Ver detalhes'",
            properties: {
              titulo: { type: "string" },
              colunas: { type: "array", items: { type: "string" } },
              linhas: { type: "array", items: { type: "array", items: { type: "string" } } },
            },
            required: ["colunas", "linhas"],
          },
        },
        required: ["tipo", "titulo"],
      },
    },
    comparacao_descricao: { type: "string", description: "Ex.: Comparando: 2º trimestre/2026 × 1º trimestre/2026" },
    apresentacao: {
      type: "object",
      description: "Apresentação executiva em slides, seguindo a estrutura obrigatória. Não criar slide vazio só para cumprir quantidade.",
      properties: {
        slides: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tipo: { type: "string", enum: ["capa", "resumo", "kpis", "tabela", "grafico", "lista", "texto", "perguntas"] },
              titulo: { type: "string" },
              subtitulo: { type: "string" },
              texto: { type: "string" },
              bullets: { type: "array", items: { type: "string" } },
              kpis: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    valor: { type: "string" },
                    sub: { type: "string" },
                    variacao: { type: "string" },
                    sentido: { type: "string", enum: ["positivo", "negativo", "neutro"] },
                  },
                  required: ["label", "valor"],
                },
              },
              tabela: {
                type: "object",
                properties: {
                  colunas: { type: "array", items: { type: "string" } },
                  linhas: { type: "array", items: { type: "array", items: { type: "string" } } },
                },
                required: ["colunas", "linhas"],
              },
              grafico: {
                type: "object",
                properties: {
                  tipo: { type: "string", enum: ["linha", "barra"] },
                  categorias: { type: "array", items: { type: "string" } },
                  series: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { nome: { type: "string" }, valores: { type: "array", items: { type: "number" } } },
                      required: ["nome", "valores"],
                    },
                  },
                  unidade: { type: "string" },
                },
                required: ["tipo", "categorias", "series"],
              },
              perguntas: {
                type: "array",
                items: {
                  type: "object",
                  properties: { pergunta: { type: "string" }, resposta: { type: "string" } },
                  required: ["pergunta", "resposta"],
                },
              },
            },
            required: ["tipo", "titulo"],
          },
        },
      },
      required: ["slides"],
    },
    plano_acao: { type: "array", items: { type: "string" }, description: "5 ações comerciais prioritárias, objetivas e acionáveis" },
    perguntas_diretoria: {
      type: "array",
      description: "As 13 perguntas obrigatórias da diretoria com respostas objetivas baseadas nos números do contexto",
      items: {
        type: "object",
        properties: { pergunta: { type: "string" }, resposta: { type: "string" } },
        required: ["pergunta", "resposta"],
      },
    },
    fatos: { type: "array", items: { type: "string" } },
    indicios: { type: "array", items: { type: "string" } },
    hipoteses: { type: "array", items: { type: "string" } },
    riscos: { type: "array", items: { type: "string" } },
    oportunidades: { type: "array", items: { type: "string" } },
    recomendacoes: { type: "array", items: { type: "string" } },
    leitura_gerencial: { type: "string" },
    alertas_dados: { type: "array", items: { type: "string" } },
  },
  required: ["titulo", "resumo_executivo", "blocos", "leitura_gerencial", "apresentacao", "perguntas_diretoria", "plano_acao"],
};

const SYSTEM_PROMPT = `Você é um ANALISTA COMERCIAL SÊNIOR da Ti Delso (pão de queijo, B2B, Minas Gerais).
Você conversa em português do Brasil, com linguagem gerencial, direta e profissional.

Você recebe um CONTEXTO DE ANÁLISE (analysisContext) já calculado programaticamente a partir da planilha oficial:
comparacao, empresa, evolucao, produtos, familias, recheados, clientes, grupos, vendedores, equipe, migracao, alertas.

REGRAS INEGOCIÁVEIS:
1. TODOS os números vêm do contexto. NUNCA invente, estime ou recalcule grandes conjuntos numéricos. Se o dado não existir, diga explicitamente que não está disponível.
2. REFERÊNCIA OBRIGATÓRIA: nunca escreva "caiu 14%", "cresceu 20%" ou "queda de 300 kg" sozinho. Sempre cite o período comparado, usando exatamente os rótulos de comparacao.rotuloA e comparacao.rotuloB. Ex.: "caiu 14% no 2º trimestre/2026 versus 1º trimestre/2026". Em tabelas, nunca use a palavra "base" isolada — use o rótulo do período (ex.: "1º trimestre/2026 (período de referência)").
3. Trimestres SEMPRE escritos como "1º trimestre/2026" — nunca Q1/Q2/Q3/Q4.
4. NOMES COMPLETOS: nunca abreviar produtos, clientes, grupos econômicos ou vendedores em textos, tabelas ou gráficos. Produtos sempre com código + nome completo (ex.: "101 – Pão de Queijo Lanche Frango Ti Delso"). Produtos recheados sempre com o sabor específico — nunca escrever apenas "Pão de Queijo Recheado". Se o nome for longo, prefira tabela ou gráfico horizontal; nunca corte o nome.
5. GRUPOS ECONÔMICOS: quando um cliente pertencer a um grupo (campo grupo / grupos.consolidados), analise o grupo consolidado antes de concluir queda ou crescimento; cite as unidades apenas quando explicarem o movimento. Nunca conclua queda de um cliente olhando somente uma filial.
6. PRODUTOS DESCONTINUADOS: apenas os marcados com descontinuado=true no contexto. Nunca classificar outro produto como descontinuado.
7. MIGRAÇÃO DE PRODUTOS: use o bloco migracao. Separe MIGRAÇÃO DIRETA (cliente da linha antiga que passou a comprar o substituto) de EXPANSÃO (cliente novo dos substitutos que não estava na base antiga). Nunca chame todo crescimento dos substitutos de migração. Informe taxa de migração, volume/faturamento perdido nos antigos, ganho nos substitutos, percentual de recuperação e clientes ainda não convertidos (nominalmente).
8. Diferencie cliente PERDIDO (não comprou no período atual e comprava no de referência), cliente com REDUÇÃO FORTE, cliente NOVO e cliente RECUPERADO — o contexto já traz esses status.
9. LANCHES RECHEADOS: analise individualmente por código/sabor antes de qualquer leitura de família, e relacione com a migração para Premium.
10. Separe FATO (comprovado), INDÍCIO, HIPÓTESE e RECOMENDAÇÃO. Nunca transforme hipótese em fato nem invente causas externas.
11. Responda TODAS as perguntas do usuário, mesmo em textos longos com várias perguntas misturadas.

PERGUNTAS DA DIRETORIA (obrigatórias em perguntas_diretoria, nesta ordem, com respostas objetivas e numéricas):
1. A empresa caiu ou cresceu? Comparado com qual período?
2. Quais produtos mais caíram? Por quê?
3. Quais produtos mais cresceram? Por quê?
4. As quedas são clientes perdidos ou redução de volume?
5. Quais clientes/grupos merecem ação imediata?
6. Existem clientes novos compensando as perdas?
7. Os Lanches Recheados realmente estão caindo ou houve migração de mix?
8. A migração 101/104 → 1531/1858 está funcionando?
9. Quantos clientes efetivamente migraram?
10. Quantos clientes da linha antiga ainda não compraram os substitutos?
11. Quanto de faturamento/volume os substitutos recuperaram?
12. A carteira do gestor/equipe acompanha o movimento da empresa?
13. Quais são as 5 ações comerciais prioritárias?

APRESENTAÇÃO EXECUTIVA (campo apresentacao.slides) — estrutura sugerida, omitindo o que não for relevante (nunca criar slide vazio):
Capa → Resumo executivo → Empresa (faturamento e volume) → Produtos com queda → Produtos com crescimento → Principais perdas → Principais ganhos → Clientes/grupos com queda → Clientes/grupos com crescimento → Grupos econômicos consolidados → Vendedores → Equipe do gestor → Lanches Recheados → Migração de produtos → Clientes que migraram → Clientes ainda não convertidos → Leitura geral → Plano de ação → Respostas objetivas para a diretoria → Conclusão.
Cada slide deve ter conteúdo substancial: tabelas com no mínimo 5 linhas quando houver dados, textos legíveis em projetor, títulos claros. Toda tabela comparativa deve nomear as colunas com os rótulos dos períodos.

FORMATO:
- Use a função apresentar_analise.
- Valores em R$ no formato brasileiro (R$ 12.345,67) e kg com separador de milhar e sufixo " kg".
- Em blocos de queda/crescimento inclua "detalhes" com cliente/grupo, período de referência, período atual, diferença kg, diferença % e faturamento.
- Em conversas de continuação, mantenha o contexto e APROFUNDE a análise anterior em vez de recomeçar.`;


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurada." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Autorização: somente Administrador e Gestor podem usar a IA -------
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const negar = (msg: string, status: number) =>
      new Response(JSON.stringify({ error: msg }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    if (!jwt) return negar("Autenticação obrigatória.", 401);

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${jwt}`, apikey: serviceKey },
    });
    if (!userRes.ok) return negar("Sessão inválida.", 401);
    const authUser = await userRes.json();
    const userId: string | undefined = authUser?.id;
    if (!userId) return negar("Sessão inválida.", 401);

    const adminHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
    const rolesRes = await fetch(
      `${supabaseUrl}/rest/v1/user_roles?select=role&user_id=eq.${userId}`,
      { headers: adminHeaders },
    );
    const roles: Array<{ role: string }> = rolesRes.ok ? await rolesRes.json() : [];
    let autorizado = roles.some((r) => r.role === "admin");

    if (!autorizado) {
      const accessRes = await fetch(
        `${supabaseUrl}/rest/v1/user_access?select=ativo,permission_profiles(nome)&user_id=eq.${userId}`,
        { headers: adminHeaders },
      );
      const access = accessRes.ok ? await accessRes.json() : [];
      const row = Array.isArray(access) ? access[0] : null;
      const perfil = String(row?.permission_profiles?.nome ?? "").trim().toLowerCase();
      autorizado = row?.ativo === true && (perfil === "administrador" || perfil === "gestor");
    }

    if (!autorizado) {
      return negar("Recurso de IA disponível apenas para Administrador e Gestor.", 403);
    }

    const body = await req.json();
    const factPack = body?.analysisContext ?? body?.factPack ?? {};
    const historico: Array<{ role: string; content: string }> = Array.isArray(body?.historico) ? body.historico : [];
    const pergunta: string = String(body?.pergunta ?? "").trim();
    if (!pergunta) {
      return new Response(JSON.stringify({ error: "Pergunta vazia." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "system",
        content:
          "CONTEXTO DE ANÁLISE (analysisContext — calculado programaticamente, fonte única da verdade numérica):\n" +
          JSON.stringify(factPack),
      },

      ...historico.slice(-10).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content ?? "").slice(0, 12000),
      })),
      { role: "user", content: pergunta },
    ];

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages,
        tools: [
          {
            type: "function",
            function: {
              name: "apresentar_analise",
              description: "Apresenta a análise comercial estruturada para o usuário.",
              parameters: ANALISE_SCHEMA,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "apresentar_analise" } },
      }),
    });

    if (resp.status === 429) {
      return new Response(JSON.stringify({ error: "Limite de uso da IA atingido. Tente novamente em instantes." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (resp.status === 402) {
      return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos no workspace." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok) {
      const txt = await resp.text();
      console.error("Erro do gateway de IA:", resp.status, txt);
      return new Response(JSON.stringify({ error: "Falha ao consultar a IA.", detalhe: txt.slice(0, 500) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const choice = data?.choices?.[0]?.message;
    const call = choice?.tool_calls?.[0];
    let analise: unknown = null;
    if (call?.function?.arguments) {
      try {
        analise = JSON.parse(call.function.arguments);
      } catch (e) {
        console.error("Falha ao interpretar argumentos da IA", e);
      }
    }
    if (!analise) {
      analise = {
        titulo: "Análise",
        resumo_executivo: String(choice?.content ?? "Não foi possível estruturar a análise."),
        blocos: [],
        leitura_gerencial: "",
      };
    }

    return new Response(JSON.stringify({ analise }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("central-analise erro:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
