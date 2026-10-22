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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { DataScope } from "@/hooks/usePermissions";

export interface PermissionProfileRow {
  id: string;
  nome: string;
  descricao: string | null;
  is_system: boolean;
  ativo: boolean;
  escopo_padrao: DataScope;
}

export const ESCOPO_OPTIONS: { value: DataScope; label: string }[] = [
  { value: "meus_dados", label: "Somente meus dados" },
  { value: "vendedores_selecionados", label: "Vendedores selecionados" },
  { value: "empresa", label: "Toda a empresa" },
];

export function PerfilFormDialog({
  open,
  onOpenChange,
  perfil,
  /** Quando informado, o novo perfil copia as permissões deste perfil. */
  duplicarDe,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  perfil?: PermissionProfileRow | null;
  duplicarDe?: PermissionProfileRow | null;
  onSaved: (id: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [escopo, setEscopo] = useState<DataScope>("meus_dados");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const base = perfil ?? duplicarDe ?? null;
    setNome(perfil ? perfil.nome : base ? `${base.nome} (cópia)` : "");
    setDescricao(base?.descricao ?? "");
    setAtivo(perfil ? perfil.ativo : true);
    setEscopo(base?.escopo_padrao ?? "meus_dados");
  }, [open, perfil, duplicarDe]);

  async function submit() {
    const nomeLimpo = nome.trim();
    if (!nomeLimpo) return toast.error("Informe o nome do perfil.");
    setBusy(true);
    try {
      if (perfil) {
        const { error } = await supabase
          .from("permission_profiles")
          .update({
            nome: nomeLimpo,
            descricao: descricao.trim() || null,
            ativo,
            escopo_padrao: escopo,
          } as never)
          .eq("id", perfil.id);
        if (error) throw error;
        toast.success("Perfil atualizado.");
        onSaved(perfil.id);
      } else {
        const { data, error } = await supabase
          .from("permission_profiles")
          .insert({
            nome: nomeLimpo,
            descricao: descricao.trim() || null,
            ativo,
            escopo_padrao: escopo,
            is_system: false,
          } as never)
          .select("id")
          .single();
        if (error) throw error;
        const novoId = (data as { id: string }).id;

        if (duplicarDe) {
          const { data: perms, error: permErr } = await supabase
            .from("profile_permissions")
            .select("modulo, acao, permitido")
            .eq("profile_id", duplicarDe.id);
          if (permErr) throw permErr;
          const rows = (perms ?? []).map((p) => ({ ...p, profile_id: novoId }));
          if (rows.length) {
            const { error: insErr } = await supabase
              .from("profile_permissions")
              .upsert(rows as never, { onConflict: "profile_id,modulo,acao" });
            if (insErr) throw insErr;
          }
        }
        toast.success(
          duplicarDe ? "Perfil duplicado. Ajuste as permissões abaixo." : "Perfil criado. Defina as permissões abaixo.",
        );
        onSaved(novoId);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {perfil ? "Editar perfil" : duplicarDe ? "Duplicar perfil" : "Novo perfil"}
          </DialogTitle>
          <DialogDescription>
            Depois de salvar, configure as abas, sub-abas, ações e permissões especiais deste perfil.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="pf-nome">Nome do perfil</Label>
            <Input
              id="pf-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Supervisor Comercial"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pf-desc">Descrição</Label>
            <Textarea
              id="pf-desc"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Para que serve este perfil"
              rows={3}
            />
          </div>
          <div className="space-y-1">
            <Label>Escopo padrão de dados</Label>
            <Select value={escopo} onValueChange={(v) => setEscopo(v as DataScope)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ESCOPO_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label>Status</Label>
              <p className="text-xs text-muted-foreground">
                Perfis inativos não aparecem na hora de cadastrar usuários.
              </p>
            </div>
            <Switch checked={ativo} onCheckedChange={setAtivo} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {perfil ? "Salvar" : "Criar perfil"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
