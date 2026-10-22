import { useState, useEffect } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useUpsertVendor } from "@/hooks/useVendors";
import { toast } from "@/hooks/use-toast";

interface Props {
  unknownNames: string[];
  onClose: () => void;
}

export function UnknownVendorPrompt({ unknownNames, onClose }: Props) {
  const upsert = useUpsertVendor();
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const init: Record<string, boolean> = {};
    unknownNames.forEach((n) => (init[n] = true));
    setSelected(init);
  }, [unknownNames]);

  if (unknownNames.length === 0) return null;

  const handleConfirm = async () => {
    const toCreate = unknownNames.filter((n) => selected[n]);
    let success = 0;
    for (const n of toCreate) {
      try {
        await upsert.mutateAsync({ nome: n, ativo: true, is_team: false });
        success++;
      } catch {}
    }
    if (success > 0) toast({ title: `${success} vendedor(es) cadastrado(s)` });
    onClose();
  };

  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Vendedor não cadastrado encontrado</AlertDialogTitle>
          <AlertDialogDescription>
            A planilha importada contém vendedores ainda não cadastrados. Deseja cadastrá-los automaticamente?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 max-h-60 overflow-auto py-2">
          {unknownNames.map((n) => (
            <label key={n} className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={!!selected[n]} onCheckedChange={(c) => setSelected((s) => ({ ...s, [n]: !!c }))} />
              <span className="text-sm">{n}</span>
            </label>
          ))}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Não cadastrar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={upsert.isPending}>Cadastrar selecionados</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
