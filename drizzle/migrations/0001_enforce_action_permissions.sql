DO $$
DECLARE
  t record;
  act text;
  cmd text;
  expr text;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('client_profiles', ARRAY['cadastro_clientes','clientes_enderecos','ponto_venda']),
    ('commercial_actions', ARRAY['acoes_comerciais']),
    ('crm_leads', ARRAY['prospeccao']),
    ('crm_visitas', ARRAY['prospeccao','agenda_visitas']),
    ('degustacoes', ARRAY['degustacoes']),
    ('order_schedule_clients', ARRAY['agenda_pedidos']),
    ('bonificacao_cadastro', ARRAY['bonificacoes']),
    ('vendor_metas', ARRAY['metas'])
  ) v(tbl, mods) LOOP
    FOREACH act IN ARRAY ARRAY['criar','editar','excluir'] LOOP
      cmd := CASE act WHEN 'criar' THEN 'INSERT' WHEN 'editar' THEN 'UPDATE' ELSE 'DELETE' END;
      SELECT string_agg(format('public.tem_permissao(auth.uid(), %L, %L)', m, act), ' OR ')
        INTO expr FROM unnest(t.mods) m;
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'perm_' || act || '_' || t.tbl, t.tbl);
      IF cmd = 'INSERT' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (%s)', 'perm_' || act || '_' || t.tbl, t.tbl, expr);
      ELSE
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR %s TO authenticated USING (%s)', 'perm_' || act || '_' || t.tbl, t.tbl, cmd, expr);
      END IF;
    END LOOP;
  END LOOP;
END $$;