import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useVendors } from "@/hooks/useVendors";
import {
  useUpsertDataScope,
  type DataScopeRow,
  type ScopeBase,
} from "@/hooks/useDataScopes";

const BASES: { value: ScopeBase; label: string; hint: string }[] = [
  { value: "meus_dados", label: "Somente os dados do próprio vendedor", hint: "Vê apenas o que é dele." },
  {
    value: "vendedores_selecionados",
    label: "Vendedores selecionados",
    hint: "Vê os dados dos vendedores marcados abaixo.",
  },
  { value: "empresa", label: "Toda a empresa", hint: "Vê toda a operação comercial." },
];

/** Campo de lista livre (clientes, grupos econômicos, regiões). */
function TagInput({
  label,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [texto, setTexto] = useState("");
  const add = () => {
    const v = texto.trim();
    if (!v) return;
    if (!values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setTexto("");
  };
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          value={texto}
          placeholder={placeholder}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={add}>
          Adicionar
        </Button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {values.map((v) => (
            <Badge key={v} variant="secondary" className="gap-1">
              {v}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function EscopoFormDialog({
  open,
  onOpenChange,
  escopo,
  duplicarDe,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  escopo?: DataScopeRow | null;
  duplicarDe?: DataScopeRow | null;
  onSaved?: (id: string) => void;
}) {
  const { data: vendors } = useVendors();
  const upsert = useUpsertDataScope();

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [base, setBase] = useState<ScopeBase>("vendedores_selecionados");
  const [vendedores, setVendedores] = useState<string[]>([]);
  const [clientes, setClientes] = useState<string[]>([]);
  const [grupos, setGrupos] = useState<string[]>([]);
  const [regioes, setRegioes] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    const b = escopo ?? duplicarDe ?? null;
    setNome(escopo ? escopo.nome : b ? `${b.nome} (cópia)` : "");
    setDescricao(b?.descricao ?? "");
    setAtivo(escopo ? escopo.ativo : true);
    setBase(b?.base ?? "vendedores_selecionados");
    setVendedores(b?.vendedores ?? []);
    setClientes(b?.clientes ?? []);
    setGrupos(b?.grupos_economicos ?? []);
    setRegioes(b?.regioes ?? []);
  }, [open, escopo, duplicarDe]);

  const vendorNames = (vendors ?? []).filter((v) => v.ativo && v.nome?.trim()).map((v) => v.nome);

  async function salvar() {
    const nomeLimpo = nome.trim();
    if (!nomeLimpo) return toast.error("Informe o nome do escopo.");
    if (base === "vendedores_selecionados" && vendedores.length === 0) {
      return toast.error("Selecione ao menos um vendedor para este escopo.");
    }
    try {
      const id = await upsert.mutateAsync({
        id: escopo?.id,
        nome: nomeLimpo,
        descricao,
        ativo,
        base,
        vendedores,
        clientes,
        grupos_economicos: grupos,
        regioes,
      });
      toast.success(escopo ? "Escopo atualizado." : "Escopo criado.");
      onSaved?.(id);
      onOpenChange(false);
    } catch (e) {
      const msg = (e as Error).message;
      toast.error(
        msg.includes("data_scopes_nome_unique") ? "Já existe um escopo com esse nome." : msg,
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {escopo ? "Editar escopo" : duplicarDe ? "Duplicar escopo" : "Novo escopo de dados"}
          </DialogTitle>
          <DialogDescription>
            O escopo define QUAIS DADOS o usuário enxerga. As funcionalidades continuam sendo
            controladas pelo perfil de permissões.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="es-nome">Nome do escopo</Label>
            <Input
              id="es-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Região Metropolitana"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="es-desc">Descrição</Label>
            <Textarea
              id="es-desc"
              rows={2}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Quais dados este escopo libera"
            />
          </div>

          <div className="space-y-1">
            <Label>Abrangência</Label>
            <Select value={base} onValueChange={(v) => setBase(v as ScopeBase)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BASES.map((b) => (
                  <SelectItem key={b.value} value={b.value}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {BASES.find((b) => b.value === base)?.hint}
            </p>
          </div>

          {base === "vendedores_selecionados" && (
            <div className="space-y-1">
              <Label>Vendedores incluídos</Label>
              <div className="max-h-44 overflow-y-auto rounded-md border p-2 space-y-1">
                {vendorNames.map((n) => (
                  <label key={n} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={vendedores.includes(n)}
                      onCheckedChange={(v) =>
                        setVendedores(
                          v === true
                            ? Array.from(new Set([...vendedores, n]))
                            : vendedores.filter((x) => x !== n),
                        )
                      }
                    />
                    {n}
                  </label>
                ))}
                {vendorNames.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhum vendedor ativo cadastrado.</p>
                )}
              </div>
            </div>
          )}

          <TagInput
            label="Clientes específicos (opcional)"
            placeholder="Nome do cliente e Enter"
            values={clientes}
            onChange={setClientes}
          />
          <TagInput
            label="Grupos econômicos (opcional)"
            placeholder="Nome do grupo e Enter"
            values={grupos}
            onChange={setGrupos}
          />
          <TagInput
            label="Regiões / carteiras (opcional)"
            placeholder="Ex.: Sete Lagoas e Enter"
            values={regioes}
            onChange={setRegioes}
          />

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label>Status</Label>
              <p className="text-xs text-muted-foreground">
                Escopos inativos não aparecem no cadastro de usuários.
              </p>
            </div>
            <Switch checked={ativo} onCheckedChange={setAtivo} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={upsert.isPending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={upsert.isPending}>
            {upsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {escopo ? "Salvar escopo" : "Criar escopo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
