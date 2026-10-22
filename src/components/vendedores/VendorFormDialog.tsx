import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { useUpsertVendor, type Vendor } from "@/hooks/useVendors";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendor?: Vendor | null;
  initialName?: string;
  onSaved?: (id: string, name: string) => void;
}

export function VendorFormDialog({ open, onOpenChange, vendor, initialName, onSaved }: Props) {
  const upsert = useUpsertVendor();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [dataEntrada, setDataEntrada] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [isTeam, setIsTeam] = useState(false);

  useEffect(() => {
    if (open) {
      setNome(vendor?.nome ?? initialName ?? "");
      setEmail(vendor?.email ?? "");
      setTelefone(vendor?.telefone ?? "");
      setDataEntrada(vendor?.data_entrada ?? "");
      setObservacoes(vendor?.observacoes ?? "");
      setAtivo(vendor?.ativo ?? true);
      setIsTeam(vendor?.is_team ?? false);
    }
  }, [open, vendor, initialName]);

  const handleSave = async () => {
    if (!nome.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    try {
      const id = await upsert.mutateAsync({
        id: vendor?.id,
        nome: nome.trim(),
        email: email.trim() || null,
        telefone: telefone.trim() || null,
        data_entrada: dataEntrada || null,
        observacoes: observacoes.trim() || null,
        ativo,
        is_team: isTeam,
      });
      toast({ title: vendor ? "Vendedor atualizado" : "Vendedor cadastrado" });
      onSaved?.(id, nome.trim());
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err?.message ?? String(err), variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{vendor ? "Editar vendedor" : "Cadastrar novo vendedor"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do vendedor" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>E-mail</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@empresa.com" />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(31) 99999-9999" />
            </div>
          </div>
          <div>
            <Label>Data de entrada</Label>
            <Input type="date" value={dataEntrada} onChange={(e) => setDataEntrada(e.target.value)} />
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Ativo</Label>
              <p className="text-xs text-muted-foreground">Aparece em filtros e relatórios</p>
            </div>
            <Switch checked={ativo} onCheckedChange={setAtivo} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label>Faz parte do time interno</Label>
              <p className="text-xs text-muted-foreground">Inclui nas Metas Comerciais e KPIs da equipe</p>
            </div>
            <Switch checked={isTeam} onCheckedChange={setIsTeam} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={upsert.isPending}>Cancelar</Button>
          <Button onClick={handleSave} disabled={upsert.isPending}>
            {upsert.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
