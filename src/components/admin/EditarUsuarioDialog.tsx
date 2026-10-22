import { useEffect, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { DataScope } from "@/hooks/usePermissions";
import type { DataScopeRow } from "@/hooks/useDataScopes";
import type { PermissionProfileRow } from "./PerfilFormDialog";
import { VendedorSelectBusca } from "./VendedorSelectBusca";
import { UsuarioPermissoesDialog } from "./UsuarioPermissoesDialog";

const SEM_PERFIL = "__no_profile__";
const NOVO_ESCOPO = "__new_scope__";

const ESCOPOS_PADRAO: { value: DataScope; label: string }[] = [
  { value: "meus_dados", label: "Somente meus dados" },
  { value: "vendedores_selecionados", label: "Vendedores selecionados" },
  { value: "empresa", label: "Toda a empresa" },
];

export interface UsuarioEdicao {
  id: string;
  nome: string;
  email: string;
  vendedor: string | null;
  vendedores: string[];
  profile_id: string | null;
  escopo: DataScope;
  scope_id: string | null;
  vendedores_autorizados: string[];
  ativo: boolean;
  admin: boolean;
}

export function EditarUsuarioDialog({
  usuario,
  onOpenChange,
  vendorNames,
  permProfiles,
  escopos,
  onSaved,
  onCriarVendedor,
}: {
  usuario: UsuarioEdicao | null;
  onOpenChange: (v: boolean) => void;
  vendorNames: string[];
  permProfiles: PermissionProfileRow[];
  escopos: DataScopeRow[];
  onSaved: () => void;
  onCriarVendedor?: () => void;
}) {
  const open = !!usuario;
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [vendedores, setVendedores] = useState<string[]>([]);
  const [perfil, setPerfil] = useState(SEM_PERFIL);
  const [escopo, setEscopo] = useState<DataScope>("meus_dados");
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [ativo, setAtivo] = useState(true);
  const [admin, setAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [permsOpen, setPermsOpen] = useState(false);

  useEffect(() => {
    if (!usuario) return;
    setNome(usuario.nome ?? "");
    setEmail(usuario.email ?? "");
    setVendedores(
      usuario.vendedores?.length
        ? usuario.vendedores
        : usuario.vendedor
          ? [usuario.vendedor]
          : [],
    );
    setPerfil(usuario.profile_id ?? SEM_PERFIL);
    setEscopo(usuario.escopo);
    setScopeId(usuario.scope_id);
    setAtivo(usuario.ativo);
    setAdmin(usuario.admin);
  }, [usuario]);

  const escoposAtivos = escopos.filter((e) => e.ativo);
  const perfisVisiveis = permProfiles.filter((p) => p.ativo !== false || p.id === perfil);
  const escopoValue = scopeId ? `scope:${scopeId}` : escopo;

  async function salvar() {
    if (!usuario) return;
    if (!nome.trim()) return toast.error("Informe o nome do usuário.");
    if (!email.trim()) return toast.error("Informe o e-mail.");
    setBusy(true);
    const escopoAlvo = escoposAtivos.find((e) => e.id === scopeId) ?? null;
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: {
        action: "update",
        user_id: usuario.id,
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        vendedor: vendedores[0] ?? null,
        vendedores,
        profile_id: perfil === SEM_PERFIL ? null : perfil,
        escopo,
        scope_id: scopeId,
        vendedores_autorizados: escopoAlvo?.vendedores ?? usuario.vendedores_autorizados,
        ativo,
        admin,
      },
    });
    setBusy(false);
    const err = error?.message ?? (data as { error?: string } | null)?.error;
    if (err) return toast.error(err);
    toast.success("Usuário atualizado.");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">Editar usuário</DialogTitle>
          <DialogDescription>
            Alterações mantêm o mesmo login, ID, permissões e histórico do usuário.
          </DialogDescription>
        </DialogHeader>

        <UsuarioPermissoesDialog
          open={permsOpen}
          onOpenChange={setPermsOpen}
          userId={usuario?.id ?? null}
          userNome={nome}
        />

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="eu-nome">Nome</Label>
            <Input id="eu-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="eu-email">E-mail</Label>
            <Input
              id="eu-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Vendedores vinculados</Label>
            <VendedorSelectBusca
              values={vendedores}
              onChange={setVendedores}
              vendorNames={vendorNames}
              onCriarNovo={onCriarVendedor}
            />
          </div>
          <div className="space-y-1">
            <Label>Perfil de permissões</Label>
            <Select
              value={perfil}
              onValueChange={(v) => {
                setPerfil(v);
                const alvo = permProfiles.find((p) => p.id === v);
                if (alvo?.escopo_padrao) {
                  setEscopo(alvo.escopo_padrao as DataScope);
                  setScopeId(null);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_PERFIL}>Sem perfil</SelectItem>
                {perfisVisiveis.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                    {p.ativo === false ? " (inativo)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Escopo de dados</Label>
            <Select
              value={escopoValue}
              onValueChange={(v) => {
                if (v === NOVO_ESCOPO) return;
                if (v.startsWith("scope:")) {
                  const alvo = escoposAtivos.find((e) => e.id === v.slice(6));
                  if (alvo) {
                    setScopeId(alvo.id);
                    setEscopo(alvo.base as DataScope);
                  }
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
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <span className="text-sm">Usuário ativo</span>
            <Switch checked={ativo} onCheckedChange={setAtivo} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <span className="text-sm">Administrador</span>
            <Switch checked={admin} onCheckedChange={setAdmin} />
          </div>

          <Button variant="outline" className="w-full" onClick={() => setPermsOpen(true)}>
            <ShieldCheck className="h-4 w-4 mr-2" />
            Permissões individuais
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
