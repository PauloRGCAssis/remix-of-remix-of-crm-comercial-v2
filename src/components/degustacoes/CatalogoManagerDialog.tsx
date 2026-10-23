import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { CatalogoItem } from "@/hooks/useDegustacaoCatalogos";
import { useModuleCrud } from "@/hooks/useModuleCrud";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  items: CatalogoItem[];
  onCreate: (nome: string) => Promise<unknown>;
  onUpdate: (args: { id: string; nome: string }) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
}

export function CatalogoManagerDialog({ open, onOpenChange, title, items, onCreate, onUpdate, onRemove }: Props) {
  const [novo, setNovo] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [removeTarget, setRemoveTarget] = useState<CatalogoItem | null>(null);
  const { podeCriar, podeEditar, podeExcluir } = useModuleCrud("degustacoes", "catálogos de degustação");

  const handleAdd = async () => {
    if (!novo.trim()) return;
    await onCreate(novo.trim());
    setNovo("");
  };

  const startEdit = (it: CatalogoItem) => {
    setEditingId(it.id);
    setEditingValue(it.nome);
  };
  const saveEdit = async () => {
    if (!editingId || !editingValue.trim()) return;
    await onUpdate({ id: editingId, nome: editingValue.trim() });
    setEditingId(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">{title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {podeCriar && <div className="flex gap-2">
              <Input
                value={novo}
                onChange={(e) => setNovo(e.target.value)}
                placeholder="Novo item..."
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
              />
              <Button onClick={handleAdd} disabled={!novo.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>}
            <div className="border rounded-md divide-y max-h-[55vh] overflow-y-auto">
              {items.length === 0 && (
                <p className="p-3 text-sm text-muted-foreground text-center">Nenhum item cadastrado</p>
              )}
              {items.map((it) => (
                <div key={it.id} className="flex items-center gap-2 p-2">
                  {editingId === it.id ? (
                    <>
                      <Input
                        autoFocus
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); }}
                        className="flex-1"
                      />
                      <Button size="icon" variant="ghost" onClick={saveEdit}><Check className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm">{it.nome}</span>
                      {podeEditar && <Button size="icon" variant="ghost" onClick={() => startEdit(it)}><Pencil className="h-4 w-4" /></Button>}
                      {podeExcluir && (
                        <Button size="icon" variant="ghost" onClick={() => setRemoveTarget(it)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{removeTarget?.nome}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. As degustações já criadas que usam este item não serão alteradas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (removeTarget) await onRemove(removeTarget.id);
                setRemoveTarget(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
