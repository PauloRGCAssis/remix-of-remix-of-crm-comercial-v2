export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      access_audit_log: {
        Row: {
          created_at: string
          detalhe: string | null
          evento: string
          id: string
          metadata: Json
          modulo: string | null
          user_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          created_at?: string
          detalhe?: string | null
          evento: string
          id?: string
          metadata?: Json
          modulo?: string | null
          user_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          created_at?: string
          detalhe?: string | null
          evento?: string
          id?: string
          metadata?: Json
          modulo?: string | null
          user_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: []
      }
      analysis_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          payload: Json | null
          role: string
          session_id: string
          user_id: string | null
          versao: number | null
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          payload?: Json | null
          role: string
          session_id: string
          user_id?: string | null
          versao?: number | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          payload?: Json | null
          role?: string
          session_id?: string
          user_id?: string | null
          versao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "analysis_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "analysis_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_sessions: {
        Row: {
          created_at: string
          filtros: Json
          id: string
          pdf_gerado_em: string | null
          periodo_fim: string | null
          periodo_inicio: string | null
          status: string
          titulo: string
          updated_at: string
          user_id: string | null
          versao_aprovada: number | null
        }
        Insert: {
          created_at?: string
          filtros?: Json
          id?: string
          pdf_gerado_em?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          status?: string
          titulo?: string
          updated_at?: string
          user_id?: string | null
          versao_aprovada?: number | null
        }
        Update: {
          created_at?: string
          filtros?: Json
          id?: string
          pdf_gerado_em?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          status?: string
          titulo?: string
          updated_at?: string
          user_id?: string | null
          versao_aprovada?: number | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      bonificacao_cadastro: {
        Row: {
          ativo: boolean
          categoria: string
          cliente: string
          cliente_key: string
          cnpj_cpf: string | null
          created_at: string
          id: string
          observacoes: string | null
          origem: string | null
          pct_negociacao: number | null
          preco_anterior: number | null
          preco_atual: number
          produto: string
          produto_key: string
          produtos_bonificados: number
          updated_at: string
          vendedor: string | null
        }
        Insert: {
          ativo?: boolean
          categoria?: string
          cliente: string
          cliente_key: string
          cnpj_cpf?: string | null
          created_at?: string
          id?: string
          observacoes?: string | null
          origem?: string | null
          pct_negociacao?: number | null
          preco_anterior?: number | null
          preco_atual?: number
          produto: string
          produto_key: string
          produtos_bonificados?: number
          updated_at?: string
          vendedor?: string | null
        }
        Update: {
          ativo?: boolean
          categoria?: string
          cliente?: string
          cliente_key?: string
          cnpj_cpf?: string | null
          created_at?: string
          id?: string
          observacoes?: string | null
          origem?: string | null
          pct_negociacao?: number | null
          preco_anterior?: number | null
          preco_atual?: number
          produto?: string
          produto_key?: string
          produtos_bonificados?: number
          updated_at?: string
          vendedor?: string | null
        }
        Relationships: []
      }
      bonificacao_rows: {
        Row: {
          categoria: string
          cliente: string
          cliente_key: string
          cnpj_cpf: string | null
          codigo_venda: string | null
          created_at: string
          custo: number
          data: string | null
          id: number
          import_key: string
          imported_at: string
          produto: string
          produto_key: string
          quantidade: number
          source_file: string | null
          updated_at: string
          vendedor: string | null
        }
        Insert: {
          categoria?: string
          cliente: string
          cliente_key: string
          cnpj_cpf?: string | null
          codigo_venda?: string | null
          created_at?: string
          custo?: number
          data?: string | null
          id?: number
          import_key: string
          imported_at?: string
          produto: string
          produto_key: string
          quantidade?: number
          source_file?: string | null
          updated_at?: string
          vendedor?: string | null
        }
        Update: {
          categoria?: string
          cliente?: string
          cliente_key?: string
          cnpj_cpf?: string | null
          codigo_venda?: string | null
          created_at?: string
          custo?: number
          data?: string | null
          id?: number
          import_key?: string
          imported_at?: string
          produto?: string
          produto_key?: string
          quantidade?: number
          source_file?: string | null
          updated_at?: string
          vendedor?: string | null
        }
        Relationships: []
      }
      bonificacao_vinculos: {
        Row: {
          bonificacao_row_id: number
          codigo_venda: string | null
          created_at: string
          criado_por: string | null
          desvinculado: boolean
          id: string
          updated_at: string
        }
        Insert: {
          bonificacao_row_id: number
          codigo_venda?: string | null
          created_at?: string
          criado_por?: string | null
          desvinculado?: boolean
          id?: string
          updated_at?: string
        }
        Update: {
          bonificacao_row_id?: number
          codigo_venda?: string | null
          created_at?: string
          criado_por?: string | null
          desvinculado?: boolean
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bonificacao_vinculos_bonificacao_row_id_fkey"
            columns: ["bonificacao_row_id"]
            isOneToOne: true
            referencedRelation: "bonificacao_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      client_address_staging: {
        Row: {
          applied_profile_id: string | null
          bairro: string | null
          candidates: Json
          cidade: string | null
          cnpj_cpf: string | null
          codigo_cliente: string | null
          complemento: string | null
          created_at: string
          estado: string | null
          id: string
          match_key: string
          nome_fantasia: string | null
          numero: string | null
          razao_social: string | null
          rua: string | null
          segmento: string | null
          source_file: string | null
          status: string
          updated_at: string
          vendedor: string | null
        }
        Insert: {
          applied_profile_id?: string | null
          bairro?: string | null
          candidates?: Json
          cidade?: string | null
          cnpj_cpf?: string | null
          codigo_cliente?: string | null
          complemento?: string | null
          created_at?: string
          estado?: string | null
          id?: string
          match_key: string
          nome_fantasia?: string | null
          numero?: string | null
          razao_social?: string | null
          rua?: string | null
          segmento?: string | null
          source_file?: string | null
          status?: string
          updated_at?: string
          vendedor?: string | null
        }
        Update: {
          applied_profile_id?: string | null
          bairro?: string | null
          candidates?: Json
          cidade?: string | null
          cnpj_cpf?: string | null
          codigo_cliente?: string | null
          complemento?: string | null
          created_at?: string
          estado?: string | null
          id?: string
          match_key?: string
          nome_fantasia?: string | null
          numero?: string | null
          razao_social?: string | null
          rua?: string | null
          segmento?: string | null
          source_file?: string | null
          status?: string
          updated_at?: string
          vendedor?: string | null
        }
        Relationships: []
      }
      client_aliases: {
        Row: {
          alias_name: string
          canonical_name: string
          created_at: string
          id: string
          motivo: string | null
          updated_at: string
        }
        Insert: {
          alias_name: string
          canonical_name: string
          created_at?: string
          id?: string
          motivo?: string | null
          updated_at?: string
        }
        Update: {
          alias_name?: string
          canonical_name?: string
          created_at?: string
          id?: string
          motivo?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      client_data_updates: {
        Row: {
          acao: string
          campo: string
          client_profile_id: string | null
          cliente: string
          created_at: string
          id: string
          origem_modulo: string
          origem_registro_id: string | null
          usuario: string | null
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          acao?: string
          campo: string
          client_profile_id?: string | null
          cliente: string
          created_at?: string
          id?: string
          origem_modulo: string
          origem_registro_id?: string | null
          usuario?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          acao?: string
          campo?: string
          client_profile_id?: string | null
          cliente?: string
          created_at?: string
          id?: string
          origem_modulo?: string
          origem_registro_id?: string | null
          usuario?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_data_updates_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_duplicate_decisions: {
        Row: {
          cliente_a: string
          cliente_b: string
          created_at: string
          decisao: string
          id: string
          updated_at: string
        }
        Insert: {
          cliente_a: string
          cliente_b: string
          created_at?: string
          decisao?: string
          id?: string
          updated_at?: string
        }
        Update: {
          cliente_a?: string
          cliente_b?: string
          created_at?: string
          decisao?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_profiles: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          cnpj: string | null
          codigo_cliente: string | null
          complemento: string | null
          contatos: Json
          created_at: string
          dias_rota: string[]
          empresa: string | null
          endereco_atualizado_em: string | null
          endereco_origem: string | null
          entrega_bairro: string | null
          entrega_cep: string | null
          entrega_cidade: string | null
          entrega_complemento: string | null
          entrega_estado: string | null
          entrega_mesmo_endereco: boolean
          entrega_numero: string | null
          entrega_rua: string | null
          estado: string | null
          formas_pagamento: string[]
          horario_manha_fim: string | null
          horario_manha_inicio: string | null
          horario_tarde_fim: string | null
          horario_tarde_inicio: string | null
          id: string
          inscricao_estadual: string | null
          inscricao_municipal: string | null
          is_ponto_venda: boolean
          nome: string
          nome_fantasia: string | null
          numero: string | null
          observacoes: string | null
          pdv_ativo: boolean
          pdv_atualizado_em: string | null
          pdv_atualizado_por: string | null
          pdv_origem: string | null
          pdv_removido_em: string | null
          pdv_removido_por: string | null
          pdv_tipo: string | null
          prazo_pagamento: string | null
          produtos_negociados: Json
          ramo_atividade: string | null
          regiao: string | null
          rua: string | null
          segmento: string | null
          telefone: string | null
          tipo_documento: string
          updated_at: string
          vendedor: string | null
          whatsapp: string | null
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          codigo_cliente?: string | null
          complemento?: string | null
          contatos?: Json
          created_at?: string
          dias_rota?: string[]
          empresa?: string | null
          endereco_atualizado_em?: string | null
          endereco_origem?: string | null
          entrega_bairro?: string | null
          entrega_cep?: string | null
          entrega_cidade?: string | null
          entrega_complemento?: string | null
          entrega_estado?: string | null
          entrega_mesmo_endereco?: boolean
          entrega_numero?: string | null
          entrega_rua?: string | null
          estado?: string | null
          formas_pagamento?: string[]
          horario_manha_fim?: string | null
          horario_manha_inicio?: string | null
          horario_tarde_fim?: string | null
          horario_tarde_inicio?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          is_ponto_venda?: boolean
          nome: string
          nome_fantasia?: string | null
          numero?: string | null
          observacoes?: string | null
          pdv_ativo?: boolean
          pdv_atualizado_em?: string | null
          pdv_atualizado_por?: string | null
          pdv_origem?: string | null
          pdv_removido_em?: string | null
          pdv_removido_por?: string | null
          pdv_tipo?: string | null
          prazo_pagamento?: string | null
          produtos_negociados?: Json
          ramo_atividade?: string | null
          regiao?: string | null
          rua?: string | null
          segmento?: string | null
          telefone?: string | null
          tipo_documento?: string
          updated_at?: string
          vendedor?: string | null
          whatsapp?: string | null
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          codigo_cliente?: string | null
          complemento?: string | null
          contatos?: Json
          created_at?: string
          dias_rota?: string[]
          empresa?: string | null
          endereco_atualizado_em?: string | null
          endereco_origem?: string | null
          entrega_bairro?: string | null
          entrega_cep?: string | null
          entrega_cidade?: string | null
          entrega_complemento?: string | null
          entrega_estado?: string | null
          entrega_mesmo_endereco?: boolean
          entrega_numero?: string | null
          entrega_rua?: string | null
          estado?: string | null
          formas_pagamento?: string[]
          horario_manha_fim?: string | null
          horario_manha_inicio?: string | null
          horario_tarde_fim?: string | null
          horario_tarde_inicio?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          is_ponto_venda?: boolean
          nome?: string
          nome_fantasia?: string | null
          numero?: string | null
          observacoes?: string | null
          pdv_ativo?: boolean
          pdv_atualizado_em?: string | null
          pdv_atualizado_por?: string | null
          pdv_origem?: string | null
          pdv_removido_em?: string | null
          pdv_removido_por?: string | null
          pdv_tipo?: string | null
          prazo_pagamento?: string | null
          produtos_negociados?: Json
          ramo_atividade?: string | null
          regiao?: string | null
          rua?: string | null
          segmento?: string | null
          telefone?: string | null
          tipo_documento?: string
          updated_at?: string
          vendedor?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      client_status: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome_cliente: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome_cliente: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome_cliente?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_taxonomies: {
        Row: {
          created_at: string
          id: string
          nome: string
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          tipo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      commercial_action_history: {
        Row: {
          action_id: string
          alteracoes: Json
          autor: string | null
          created_at: string
          evento: string
          id: string
        }
        Insert: {
          action_id: string
          alteracoes?: Json
          autor?: string | null
          created_at?: string
          evento: string
          id?: string
        }
        Update: {
          action_id?: string
          alteracoes?: Json
          autor?: string | null
          created_at?: string
          evento?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commercial_action_history_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "commercial_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_action_types: {
        Row: {
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      commercial_actions: {
        Row: {
          atualizado_por: string | null
          bonificacao_produtos: string[]
          bonificacao_unidade: string
          client_profile_id: string | null
          cliente: string
          created_at: string
          criado_por: string | null
          criado_por_id: string | null
          custo_kg_degustacao: number
          data_fim: string
          data_inicio: string
          degustacao_ids: string[]
          forma_investimento: string
          id: string
          nome: string
          objetivo: string | null
          observacoes: string | null
          outros_custos: number
          possui_degustacoes: boolean
          quantidade_bonificada: number | null
          regras: string | null
          responsavel: string | null
          status: string
          tipo: string
          updated_at: string
          valor_investimento: number
          valor_promotora: number
          vendedor: string | null
        }
        Insert: {
          atualizado_por?: string | null
          bonificacao_produtos?: string[]
          bonificacao_unidade?: string
          client_profile_id?: string | null
          cliente: string
          created_at?: string
          criado_por?: string | null
          criado_por_id?: string | null
          custo_kg_degustacao?: number
          data_fim: string
          data_inicio: string
          degustacao_ids?: string[]
          forma_investimento?: string
          id?: string
          nome: string
          objetivo?: string | null
          observacoes?: string | null
          outros_custos?: number
          possui_degustacoes?: boolean
          quantidade_bonificada?: number | null
          regras?: string | null
          responsavel?: string | null
          status?: string
          tipo: string
          updated_at?: string
          valor_investimento?: number
          valor_promotora?: number
          vendedor?: string | null
        }
        Update: {
          atualizado_por?: string | null
          bonificacao_produtos?: string[]
          bonificacao_unidade?: string
          client_profile_id?: string | null
          cliente?: string
          created_at?: string
          criado_por?: string | null
          criado_por_id?: string | null
          custo_kg_degustacao?: number
          data_fim?: string
          data_inicio?: string
          degustacao_ids?: string[]
          forma_investimento?: string
          id?: string
          nome?: string
          objetivo?: string | null
          observacoes?: string | null
          outros_custos?: number
          possui_degustacoes?: boolean
          quantidade_bonificada?: number | null
          regras?: string | null
          responsavel?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          valor_investimento?: number
          valor_promotora?: number
          vendedor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commercial_actions_client_profile_id_fkey"
            columns: ["client_profile_id"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_batch_rows: {
        Row: {
          batch_uid: string
          created_at: string
          id: number
          payload: Json
          seq: number
          vendedor: string | null
          year_month: string
        }
        Insert: {
          batch_uid: string
          created_at?: string
          id?: never
          payload: Json
          seq: number
          vendedor?: string | null
          year_month: string
        }
        Update: {
          batch_uid?: string
          created_at?: string
          id?: never
          payload?: Json
          seq?: number
          vendedor?: string | null
          year_month?: string
        }
        Relationships: []
      }
      commission_batches: {
        Row: {
          batch_uid: string
          bonificacao_value_column: string | null
          created_at: string
          file_name: string
          id: string
          imported_at: string
          processing_version: string | null
          row_count: number
          updated_at: string
          year_month: string
        }
        Insert: {
          batch_uid?: string
          bonificacao_value_column?: string | null
          created_at?: string
          file_name: string
          id?: string
          imported_at?: string
          processing_version?: string | null
          row_count?: number
          updated_at?: string
          year_month: string
        }
        Update: {
          batch_uid?: string
          bonificacao_value_column?: string | null
          created_at?: string
          file_name?: string
          id?: string
          imported_at?: string
          processing_version?: string | null
          row_count?: number
          updated_at?: string
          year_month?: string
        }
        Relationships: []
      }
      crm_leads: {
        Row: {
          agendado_por: string | null
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          id: string
          payload: Json
          seller_id: string | null
          vendedor: string | null
        }
        Insert: {
          agendado_por?: string | null
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          id: string
          payload?: Json
          seller_id?: string | null
          vendedor?: string | null
        }
        Update: {
          agendado_por?: string | null
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          payload?: Json
          seller_id?: string | null
          vendedor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_leads_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_state: {
        Row: {
          id: string
          snapshot: Json
          updated_at: string
        }
        Insert: {
          id?: string
          snapshot?: Json
          updated_at?: string
        }
        Update: {
          id?: string
          snapshot?: Json
          updated_at?: string
        }
        Relationships: []
      }
      crm_visitas: {
        Row: {
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          id: string
          lead_id: string
          payload: Json
          seller_id: string | null
          vendedor: string | null
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          id: string
          lead_id: string
          payload?: Json
          seller_id?: string | null
          vendedor?: string | null
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          lead_id?: string
          payload?: Json
          seller_id?: string | null
          vendedor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_visitas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_visitas_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      data_scopes: {
        Row: {
          ativo: boolean
          base: string
          clientes: string[]
          created_at: string
          descricao: string | null
          grupos_economicos: string[]
          id: string
          nome: string
          regioes: string[]
          updated_at: string
          vendedores: string[]
        }
        Insert: {
          ativo?: boolean
          base?: string
          clientes?: string[]
          created_at?: string
          descricao?: string | null
          grupos_economicos?: string[]
          id?: string
          nome: string
          regioes?: string[]
          updated_at?: string
          vendedores?: string[]
        }
        Update: {
          ativo?: boolean
          base?: string
          clientes?: string[]
          created_at?: string
          descricao?: string | null
          grupos_economicos?: string[]
          id?: string
          nome?: string
          regioes?: string[]
          updated_at?: string
          vendedores?: string[]
        }
        Relationships: []
      }
      degustacao_equipamentos: {
        Row: {
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      degustacao_materiais: {
        Row: {
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      degustacoes: {
        Row: {
          bairro: string | null
          cidade: string | null
          cliente: string
          contato_cliente: string | null
          created_at: string
          criado_por_id: string | null
          data: string
          data_entrega_materiais: string | null
          endereco: string | null
          equipamentos: Json
          horario: string | null
          horas_evento: number
          id: string
          materiais: Json
          observacoes: string | null
          produtos: Json
          promotora: string | null
          promotoras: Json
          status: string
          updated_at: string
          vendedor: string | null
        }
        Insert: {
          bairro?: string | null
          cidade?: string | null
          cliente: string
          contato_cliente?: string | null
          created_at?: string
          criado_por_id?: string | null
          data: string
          data_entrega_materiais?: string | null
          endereco?: string | null
          equipamentos?: Json
          horario?: string | null
          horas_evento?: number
          id?: string
          materiais?: Json
          observacoes?: string | null
          produtos?: Json
          promotora?: string | null
          promotoras?: Json
          status?: string
          updated_at?: string
          vendedor?: string | null
        }
        Update: {
          bairro?: string | null
          cidade?: string | null
          cliente?: string
          contato_cliente?: string | null
          created_at?: string
          criado_por_id?: string | null
          data?: string
          data_entrega_materiais?: string | null
          endereco?: string | null
          equipamentos?: Json
          horario?: string | null
          horas_evento?: number
          id?: string
          materiais?: Json
          observacoes?: string | null
          produtos?: Json
          promotora?: string | null
          promotoras?: Json
          status?: string
          updated_at?: string
          vendedor?: string | null
        }
        Relationships: []
      }
      import_history: {
        Row: {
          created_at: string
          debug_sample: Json
          deleted_count: number
          file_count: number
          file_names: string[]
          id: string
          import_type: string
          imported_by: string | null
          inserted_count: number
          integrity_snapshot: Json
          range_end: string | null
          range_start: string | null
          total_rows: number
          unchanged_count: number
          updated_count: number
          warning_message: string | null
        }
        Insert: {
          created_at?: string
          debug_sample?: Json
          deleted_count?: number
          file_count?: number
          file_names?: string[]
          id?: string
          import_type: string
          imported_by?: string | null
          inserted_count?: number
          integrity_snapshot?: Json
          range_end?: string | null
          range_start?: string | null
          total_rows?: number
          unchanged_count?: number
          updated_count?: number
          warning_message?: string | null
        }
        Update: {
          created_at?: string
          debug_sample?: Json
          deleted_count?: number
          file_count?: number
          file_names?: string[]
          id?: string
          import_type?: string
          imported_by?: string | null
          inserted_count?: number
          integrity_snapshot?: Json
          range_end?: string | null
          range_start?: string | null
          total_rows?: number
          unchanged_count?: number
          updated_count?: number
          warning_message?: string | null
        }
        Relationships: []
      }
      meta_config: {
        Row: {
          id: string
          pct_azul: number
          pct_gasolina: number
          pct_roxa: number
          pct_verde: number
          updated_at: string
          valor_fixo_azul: number | null
          valor_fixo_gasolina: number | null
          valor_fixo_verde: number | null
        }
        Insert: {
          id?: string
          pct_azul?: number
          pct_gasolina?: number
          pct_roxa?: number
          pct_verde?: number
          updated_at?: string
          valor_fixo_azul?: number | null
          valor_fixo_gasolina?: number | null
          valor_fixo_verde?: number | null
        }
        Update: {
          id?: string
          pct_azul?: number
          pct_gasolina?: number
          pct_roxa?: number
          pct_verde?: number
          updated_at?: string
          valor_fixo_azul?: number | null
          valor_fixo_gasolina?: number | null
          valor_fixo_verde?: number | null
        }
        Relationships: []
      }
      order_schedule_clients: {
        Row: {
          ativo: boolean
          created_at: string
          criado_por: string | null
          criado_por_id: string | null
          dias_semana: string[]
          id: string
          modo: string
          modo_por_dia: Json
          nome: string
          observacoes: string | null
          telefone: string | null
          updated_at: string
          vendedor: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          criado_por?: string | null
          criado_por_id?: string | null
          dias_semana?: string[]
          id?: string
          modo?: string
          modo_por_dia?: Json
          nome: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
          vendedor?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          criado_por?: string | null
          criado_por_id?: string | null
          dias_semana?: string[]
          id?: string
          modo?: string
          modo_por_dia?: Json
          nome?: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
          vendedor?: string | null
        }
        Relationships: []
      }
      order_schedule_weekly_log: {
        Row: {
          cliente_id: string
          created_at: string
          data_envio: string | null
          dia_semana: string
          id: string
          mensagem_enviada: boolean
          observacao: string | null
          respondeu: boolean
          semana_date: string
          status_resposta: string | null
          updated_at: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          data_envio?: string | null
          dia_semana: string
          id?: string
          mensagem_enviada?: boolean
          observacao?: string | null
          respondeu?: boolean
          semana_date: string
          status_resposta?: string | null
          updated_at?: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          data_envio?: string | null
          dia_semana?: string
          id?: string
          mensagem_enviada?: boolean
          observacao?: string | null
          respondeu?: boolean
          semana_date?: string
          status_resposta?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_schedule_weekly_log_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "order_schedule_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamento_fechamentos: {
        Row: {
          closed_at: string | null
          config: Json
          created_at: string
          criado_por_id: string | null
          id: string
          status: string
          updated_at: string
          vendedor: string
          year_month: string
        }
        Insert: {
          closed_at?: string | null
          config?: Json
          created_at?: string
          criado_por_id?: string | null
          id?: string
          status?: string
          updated_at?: string
          vendedor: string
          year_month: string
        }
        Update: {
          closed_at?: string | null
          config?: Json
          created_at?: string
          criado_por_id?: string | null
          id?: string
          status?: string
          updated_at?: string
          vendedor?: string
          year_month?: string
        }
        Relationships: []
      }
      pdv_sales_rows: {
        Row: {
          cliente: string
          cliente_key: string
          cnpj_cpf: string | null
          codigo_cliente: string | null
          codigo_produto: string | null
          codigo_venda: string | null
          created_at: string
          data: string | null
          id: number
          import_key: string
          imported_at: string
          preco_total: number
          preco_unitario: number
          produto: string
          quantidade: number
          segmento: string | null
          source_file: string | null
          updated_at: string
          vendedor: string | null
        }
        Insert: {
          cliente: string
          cliente_key: string
          cnpj_cpf?: string | null
          codigo_cliente?: string | null
          codigo_produto?: string | null
          codigo_venda?: string | null
          created_at?: string
          data?: string | null
          id?: number
          import_key: string
          imported_at?: string
          preco_total?: number
          preco_unitario?: number
          produto?: string
          quantidade?: number
          segmento?: string | null
          source_file?: string | null
          updated_at?: string
          vendedor?: string | null
        }
        Update: {
          cliente?: string
          cliente_key?: string
          cnpj_cpf?: string | null
          codigo_cliente?: string | null
          codigo_produto?: string | null
          codigo_venda?: string | null
          created_at?: string
          data?: string | null
          id?: number
          import_key?: string
          imported_at?: string
          preco_total?: number
          preco_unitario?: number
          produto?: string
          quantidade?: number
          segmento?: string | null
          source_file?: string | null
          updated_at?: string
          vendedor?: string | null
        }
        Relationships: []
      }
      permission_profiles: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          escopo_padrao: string
          id: string
          is_system: boolean
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          escopo_padrao?: string
          id?: string
          is_system?: boolean
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          escopo_padrao?: string
          id?: string
          is_system?: boolean
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      profile_permissions: {
        Row: {
          acao: string
          created_at: string
          id: string
          modulo: string
          permitido: boolean
          profile_id: string
          updated_at: string
        }
        Insert: {
          acao: string
          created_at?: string
          id?: string
          modulo: string
          permitido?: boolean
          profile_id: string
          updated_at?: string
        }
        Update: {
          acao?: string
          created_at?: string
          id?: string
          modulo?: string
          permitido?: boolean
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_permissions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "permission_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          cargo: string | null
          created_at: string
          email: string | null
          id: string
          must_change_password: boolean
          nome: string | null
          senha_definida: boolean
          updated_at: string
          vendedor: string | null
          vendedores: string[]
        }
        Insert: {
          avatar_url?: string | null
          cargo?: string | null
          created_at?: string
          email?: string | null
          id: string
          must_change_password?: boolean
          nome?: string | null
          senha_definida?: boolean
          updated_at?: string
          vendedor?: string | null
          vendedores?: string[]
        }
        Update: {
          avatar_url?: string | null
          cargo?: string | null
          created_at?: string
          email?: string | null
          id?: string
          must_change_password?: boolean
          nome?: string | null
          senha_definida?: boolean
          updated_at?: string
          vendedor?: string | null
          vendedores?: string[]
        }
        Relationships: []
      }
      sales: {
        Row: {
          cliente: string
          cnpj_cpf: string | null
          codigo_venda: number
          created_at: string
          data: string
          descricao: string
          id: number
          preco_total: number
          preco_unitario: number
          quantidade: number
          vendedor: string
        }
        Insert: {
          cliente: string
          cnpj_cpf?: string | null
          codigo_venda: number
          created_at?: string
          data: string
          descricao: string
          id?: never
          preco_total: number
          preco_unitario: number
          quantidade: number
          vendedor: string
        }
        Update: {
          cliente?: string
          cnpj_cpf?: string | null
          codigo_venda?: number
          created_at?: string
          data?: string
          descricao?: string
          id?: never
          preco_total?: number
          preco_unitario?: number
          quantidade?: number
          vendedor?: string
        }
        Relationships: []
      }
      sales_raw_rows: {
        Row: {
          active: boolean
          cliente: string
          cnpj_cpf: string | null
          codigo_venda: number
          created_at: string
          data: string
          data_importacao: string
          descricao: string
          id: number
          import_key: string | null
          nome_arquivo_importado: string | null
          original_row_number: number
          preco_total: number
          preco_unitario: number
          preco_venda: number
          preco_venda_total: number
          quantidade: number
          superseded_at: string | null
          superseded_by_file: string | null
          superseded_reason: string | null
          vendedor: string
        }
        Insert: {
          active?: boolean
          cliente?: string
          cnpj_cpf?: string | null
          codigo_venda?: number
          created_at?: string
          data: string
          data_importacao?: string
          descricao?: string
          id?: number
          import_key?: string | null
          nome_arquivo_importado?: string | null
          original_row_number: number
          preco_total?: number
          preco_unitario?: number
          preco_venda?: number
          preco_venda_total?: number
          quantidade?: number
          superseded_at?: string | null
          superseded_by_file?: string | null
          superseded_reason?: string | null
          vendedor?: string
        }
        Update: {
          active?: boolean
          cliente?: string
          cnpj_cpf?: string | null
          codigo_venda?: number
          created_at?: string
          data?: string
          data_importacao?: string
          descricao?: string
          id?: number
          import_key?: string | null
          nome_arquivo_importado?: string | null
          original_row_number?: number
          preco_total?: number
          preco_unitario?: number
          preco_venda?: number
          preco_venda_total?: number
          quantidade?: number
          superseded_at?: string | null
          superseded_by_file?: string | null
          superseded_reason?: string | null
          vendedor?: string
        }
        Relationships: []
      }
      user_access: {
        Row: {
          ativo: boolean
          created_at: string
          escopo: string
          profile_id: string | null
          scope_id: string | null
          updated_at: string
          user_id: string
          vendedores_autorizados: string[]
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          escopo?: string
          profile_id?: string | null
          scope_id?: string | null
          updated_at?: string
          user_id: string
          vendedores_autorizados?: string[]
        }
        Update: {
          ativo?: boolean
          created_at?: string
          escopo?: string
          profile_id?: string | null
          scope_id?: string | null
          updated_at?: string
          user_id?: string
          vendedores_autorizados?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "user_access_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "permission_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_access_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "data_scopes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          acao: string
          created_at: string
          id: string
          modulo: string
          permitido: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          acao: string
          created_at?: string
          id?: string
          modulo: string
          permitido: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          acao?: string
          created_at?: string
          id?: string
          modulo?: string
          permitido?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendor_metas: {
        Row: {
          created_at: string
          id: string
          meta_aceleracao: number | null
          meta_azul: number | null
          meta_gasolina: number | null
          meta_verde: number | null
          updated_at: string
          vendedor: string
          year_month: string
        }
        Insert: {
          created_at?: string
          id?: string
          meta_aceleracao?: number | null
          meta_azul?: number | null
          meta_gasolina?: number | null
          meta_verde?: number | null
          updated_at?: string
          vendedor: string
          year_month: string
        }
        Update: {
          created_at?: string
          id?: string
          meta_aceleracao?: number | null
          meta_azul?: number | null
          meta_gasolina?: number | null
          meta_verde?: number | null
          updated_at?: string
          vendedor?: string
          year_month?: string
        }
        Relationships: []
      }
      vendor_monthly_history: {
        Row: {
          clientes_novos: number
          clientes_reativados: number
          clientes_sem_recompra: number
          clientes_validados: number
          commission_level: number
          consecutive_months: number
          created_at: string
          cursos: number
          faturamento: number
          id: string
          meta_atingida: boolean
          override_comissao_pct: number | null
          updated_at: string
          vendedor: string
          year_month: string
        }
        Insert: {
          clientes_novos?: number
          clientes_reativados?: number
          clientes_sem_recompra?: number
          clientes_validados?: number
          commission_level?: number
          consecutive_months?: number
          created_at?: string
          cursos?: number
          faturamento?: number
          id?: string
          meta_atingida?: boolean
          override_comissao_pct?: number | null
          updated_at?: string
          vendedor: string
          year_month: string
        }
        Update: {
          clientes_novos?: number
          clientes_reativados?: number
          clientes_sem_recompra?: number
          clientes_validados?: number
          commission_level?: number
          consecutive_months?: number
          created_at?: string
          cursos?: number
          faturamento?: number
          id?: string
          meta_atingida?: boolean
          override_comissao_pct?: number | null
          updated_at?: string
          vendedor?: string
          year_month?: string
        }
        Relationships: []
      }
      vendors: {
        Row: {
          ativo: boolean
          created_at: string
          data_entrada: string | null
          email: string | null
          id: string
          is_team: boolean
          nome: string
          observacoes: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          data_entrada?: string | null
          email?: string | null
          id?: string
          is_team?: boolean
          nome: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          data_entrada?: string | null
          email?: string | null
          id?: string
          is_team?: boolean
          nome?: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      client_directory: {
        Row: {
          bairro: string | null
          canonical: string | null
          cidade: string | null
          cnpj: string | null
          nome: string | null
          nome_fantasia: string | null
          origem: string | null
          ultima_compra: string | null
          vendedor: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_authorized_sellers: { Args: { _user_id?: string }; Returns: string[] }
      get_import_integrity_report: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      pode_ver_vendedor: {
        Args: { _user_id: string; _vendedor: string }
        Returns: boolean
      }
      rebuild_sales_dedupe: {
        Args: { _reason?: string }
        Returns: {
          grupos_afetados: number
          linhas_desativadas: number
          valor_removido: number
        }[]
      }
      replace_commission_batch: {
        Args: {
          _bonificacao_value_column: string
          _expected_row_count: number
          _file_name: string
          _imported_at: string
          _processing_version: string
          _rows: Json
          _year_month: string
        }
        Returns: Json
      }
      replace_commission_batch_with_bonificacoes: {
        Args: {
          _bonificacao_rows: Json
          _bonificacao_value_column: string
          _expected_row_count: number
          _file_name: string
          _imported_at: string
          _processing_version: string
          _rows: Json
          _year_month: string
        }
        Returns: Json
      }
      sales_raw_financial_sequence: {
        Args: { _import_key: string }
        Returns: number
      }
      sales_raw_normalized_text: { Args: { _value: string }; Returns: string }
      sales_raw_product_token: { Args: { _descricao: string }; Returns: string }
      tem_permissao: {
        Args: { _acao: string; _modulo: string; _user_id: string }
        Returns: boolean
      }
      validate_import_totals: {
        Args: { _max_data: string; _min_data: string }
        Returns: Json
      }
      vendor_in_scope: {
        Args: { _allowed: string[]; _vendedor: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "member"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "member"],
    },
  },
} as const
