import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { DataScope } from "@/hooks/usePermissions";
import type { DataScopeRow } from "@/hooks/useDataScopes";
import { VendorFormDialog } from "@/components/vendedores/VendorFormDialog";
import { PerfilFormDialog, type PermissionProfileRow } from "./PerfilFormDialog";
import { PerfilPermissoesDialog } from "./PerfilPermissoesDialog";
import { EscopoFormDialog } from "./EscopoFormDialog";
import { VendedorSelectBusca } from "./VendedorSelectBusca";


const SEM_PERFIL = "__no_profile__";
const NOVO_PERFIL = "__new_profile__";
const NOVO_ESCOPO = "__new_scope__";

const ESCOPOS_PADRAO: { value: DataScope; label: string }[] = [
  { value: "meus_dados", label: "Somente meus dados" },
  { value: "vendedores_selecionados", label: "Vendedores selecionados" },
  { value: "empresa", label: "Toda a empresa" },
];

export interface BaseUsuarioCopia {
  id: string;
  nome: string;
  profile_id: string | null;
  escopo: DataScope;
  scope_id: string | null;
  vendedores_autorizados: string[];
}

export function NovoUsuarioDialog({
  open,
  onOpenChange,
  vendorNames,
  permProfiles,
  escopos,
  onCreated,
  base = null,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vendorNames: string[];
  permProfiles: PermissionProfileRow[];
  escopos: DataScopeRow[];
  onCreated: () => void;
  base?: BaseUsuarioCopia | null;
}) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [vendedores, setVendedores] = useState<string[]>([]);
  const [perfil, setPerfil] = useState(SEM_PERFIL);
  const [escopo, setEscopo] = useState<DataScope>("meus_dados");
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [autorizados, setAutorizados] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // Ao abrir para cópia, pré-preenche as configurações do usuário modelo.
  useEffect(() => {
    if (!open) return;
    setNome("");
    setEmail("");
    setVendedores([]);
    setPerfil(base?.profile_id ?? SEM_PERFIL);
    setEscopo(base?.escopo ?? "meus_dados");
    setScopeId(base?.scope_id ?? null);
    setAutorizados(base?.vendedores_autorizados ?? []);
  }, [open, base]);

  const [vendorOpen, setVendorOpen] = useState(false);
  const [perfilOpen, setPerfilOpen] = useState(false);
  const [escopoOpen, setEscopoOpen] = useState(false);
  const [permsProfileId, setPermsProfileId] = useState<string | null>(null);

  const perfisAtivos = permProfiles.filter((p) => p.ativo !== false);
  const escoposAtivos = escopos.filter((e) => e.ativo);
  const escopoValue = scopeId ? `scope:${scopeId}` : escopo;

  function selecionarPerfil(id: string) {
    setPerfil(id);
    const alvo = permProfiles.find((p) => p.id === id);
    if (alvo?.escopo_padrao) {
      setEscopo(alvo.escopo_padrao as DataScope);
      setScopeId(null);
    }
  }

  function aplicarEscopoPersonalizado(e: DataScopeRow) {
    setScopeId(e.id);
    setEscopo(e.base as DataScope);
    setAutorizados(e.vendedores ?? []);
  }

  async function submit() {
    if (!email.trim()) return toast.error("Informe o e-mail.");
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: {
        action: "create",
        nome,
        email,
        vendedor: vendedores[0] ?? null,
        vendedores,
        profile_id: perfil === SEM_PERFIL ? null : perfil,
        escopo,
        scope_id: scopeId,
        vendedores_autorizados: scopeId
          ? escoposAtivos.find((e) => e.id === scopeId)?.vendedores ?? autorizados
          : autorizados,
        copy_from_user_id: base?.id ?? null,
        copy_from_label: base?.nome ?? null,
      },
    });
    setBusy(false);
    const err = error?.message ?? (data as { error?: string } | null)?.error;
    if (err) return toast.error(err);
    toast.success(
      "Usuário autorizado. Peça que ele use \"Primeiro acesso / Criar minha senha\" na tela de login.",
      { duration: 12000 },
    );
    onCreated();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {base ? `Novo usuário baseado em ${base.nome}` : "Novo usuário"}
          </DialogTitle>
          <DialogDescription>
            {base
              ? `Perfil, escopo e permissões individuais de ${base.nome} já vêm preenchidos e podem ser alterados. Nome, e-mail e senha são novos: o usuário criará a senha em "Primeiro acesso / Criar minha senha".`
              : 'Autorize o e-mail do usuário. Ele mesmo criará a senha na tela de login, em "Primeiro acesso / Criar minha senha".'}
          </DialogDescription>
        </DialogHeader>

        <VendorFormDialog
          open={vendorOpen}
          onOpenChange={setVendorOpen}
          onSaved={(_id, novoNome) => {
            setVendedores((prev) => Array.from(new Set([...prev, novoNome])));
            qc.invalidateQueries({ queryKey: ["vendors"] });
          }}
        />
        <PerfilFormDialog
          open={perfilOpen}
          onOpenChange={setPerfilOpen}
          onSaved={(id) => {
            qc.invalidateQueries({ queryKey: ["permission-profiles"] });
            qc.invalidateQueries({ queryKey: ["admin-usuarios"] });
            setPerfil(id);
            setPermsProfileId(id);
          }}
        />
        <PerfilPermissoesDialog
          open={!!permsProfileId}
          onOpenChange={(v) => !v && setPermsProfileId(null)}
          profileId={permsProfileId}
        />
        <EscopoFormDialog
          open={escopoOpen}
          onOpenChange={setEscopoOpen}
          onSaved={async (id) => {
            qc.invalidateQueries({ queryKey: ["data-scopes"] });
            const { data: novo } = await supabase
              .from("data_scopes" as never)
              .select("*")
              .eq("id", id)
              .maybeSingle();
            if (novo) aplicarEscopoPersonalizado(novo as unknown as DataScopeRow);
          }}
        />

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="nu-nome">Nome</Label>
            <Input id="nu-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nu-email">E-mail</Label>
            <Input
              id="nu-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@empresa.com.br"
            />
          </div>
          <div className="space-y-1">
            <Label>Vendedores vinculados</Label>
            <VendedorSelectBusca
              values={vendedores}
              onChange={setVendedores}
              vendorNames={vendorNames}
              onCriarNovo={() => setVendorOpen(true)}
            />
          </div>

          <div className="space-y-1">
            <Label>Perfil de permissões</Label>
            <Select
              value={perfil}
              onValueChange={(v) => (v === NOVO_PERFIL ? setPerfilOpen(true) : selecionarPerfil(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_PERFIL}>Sem perfil</SelectItem>
                {perfisAtivos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
                {perfil !== SEM_PERFIL && !perfisAtivos.some((p) => p.id === perfil) && (
                  <SelectItem value={perfil}>Perfil recém-criado</SelectItem>
                )}
                <SelectSeparator />
                <SelectItem value={NOVO_PERFIL}>+ Cadastrar novo perfil</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Escopo de dados</Label>
            <Select
              value={escopoValue}
              onValueChange={(v) => {
                if (v === NOVO_ESCOPO) return setEscopoOpen(true);
                if (v.startsWith("scope:")) {
                  const alvo = escoposAtivos.find((e) => e.id === v.slice(6));
                  if (alvo) aplicarEscopoPersonalizado(alvo);
                  return;
                }
                setScopeId(null);
                setEscopo(v as DataScope);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ESCOPOS_PADRAO.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
                {escoposAtivos.length > 0 && <SelectSeparator />}
                {escoposAtivos.map((e) => (
                  <SelectItem key={e.id} value={`scope:${e.id}`}>
                    {e.nome}
                  </SelectItem>
                ))}
                {scopeId && !escoposAtivos.some((e) => e.id === scopeId) && (
                  <SelectItem value={`scope:${scopeId}`}>Escopo recém-criado</SelectItem>
                )}
                <SelectSeparator />
                <SelectItem value={NOVO_ESCOPO}>+ Criar novo escopo</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              O perfil define o que a pessoa pode fazer; o escopo define quais dados ela enxerga.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {base ? "Criar cópia" : "Criar usuário"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
