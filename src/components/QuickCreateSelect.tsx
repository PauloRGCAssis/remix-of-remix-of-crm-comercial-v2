import { useMemo } from "react";
import { CreatableSelect } from "@/components/cadastro/CreatableSelect";
import {
  useTaxonomies,
  useCreateTaxonomy,
  useDeleteTaxonomy,
  type TaxonomyTipo,
} from "@/hooks/useTaxonomies";

interface QuickCreateSelectProps {
  /** Tipo de cadastro administrável (tabela client_taxonomies). */
  tipo: TaxonomyTipo;
  value: string;
  onChange: (value: string) => void;
  /** Opções base do sistema (não removíveis). */
  baseOptions?: readonly string[];
  placeholder?: string;
  createLabel?: string;
  disabled?: boolean;
  /** Rótulo da opção vazia. Se omitido, não exibe opção vazia. */
  emptyLabel?: string;
}

function norm(v: string) {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/**
 * Campo de seleção com cadastro rápido: pesquisa, seleciona uma opção existente
 * ou cadastra uma nova na hora (sem sair da tela) — já deixando-a selecionada.
 */
export function QuickCreateSelect({
  tipo,
  value,
  onChange,
  baseOptions = [],
  placeholder = "Selecione...",
  createLabel = "Cadastrar novo",
  disabled,
  emptyLabel,
}: QuickCreateSelectProps) {
  const { data: taxonomies = [] } = useTaxonomies(tipo);
  const createTaxonomy = useCreateTaxonomy();
  const deleteTaxonomy = useDeleteTaxonomy();

  const options = useMemo(() => {
    const seen = new Set<string>();
    const list: {
      value: string;
      label: string;
      removable?: boolean;
      onRemove?: () => Promise<void>;
    }[] = [];

    if (emptyLabel) {
      list.push({ value: "", label: emptyLabel });
    }

    for (const opt of baseOptions) {
      if (!opt || seen.has(norm(opt))) continue;
      seen.add(norm(opt));
      list.push({ value: opt, label: opt });
    }

    for (const t of taxonomies) {
      if (!t.nome || seen.has(norm(t.nome))) continue;
      seen.add(norm(t.nome));
      list.push({
        value: t.nome,
        label: t.nome,
        removable: true,
        onRemove: async () => {
          await deleteTaxonomy.mutateAsync(t.id);
          if (norm(value) === norm(t.nome)) onChange("");
        },
      });
    }

    // Mantém um valor legado que não esteja mais nas listas.
    if (value && !seen.has(norm(value))) {
      list.push({ value, label: value });
    }

    return list;
  }, [baseOptions, taxonomies, emptyLabel, value, deleteTaxonomy, onChange]);

  return (
    <CreatableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      createLabel={createLabel}
      disabled={disabled}
      onCreate={async (nome) => {
        const created = await createTaxonomy.mutateAsync({ tipo, nome });
        return created.nome;
      }}
    />
  );
}
