import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { parseCommissionFile } from "@/lib/commissionImport";
import { commissionRowsToBonificacaoRows, persistBonificacaoRows } from "@/hooks/useBonificacoes";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: () => void;
}

export function ImportarBonificacoesDialog({ open, onOpenChange, onImported }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleImport() {
    if (files.length === 0) return;
    setLoading(true);
    try {
      let total = 0;
      for (const file of files) {
        const parsed = await parseCommissionFile(file);
        const rows = commissionRowsToBonificacaoRows(parsed.rows, file.name);
        total += await persistBonificacaoRows(rows);
      }
      toast.success(`${total} linhas de bonificação importadas.`);
      setFiles([]);
      onImported();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Falha na importação: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar bonificações realizadas</DialogTitle>
          <DialogDescription>
            Envie a planilha de comissão/faturamento. O sistema lê as abas de bonificação (Brinde, Cortesia,
            Degustação, Preço Final) e grava as quantidades em kg efetivamente enviadas. A planilha é a fonte
            oficial — nada é reinterpretado.
          </DialogDescription>
        </DialogHeader>

        <Input
          type="file"
          multiple
          accept=".xlsx,.xls"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
        {files.length > 0 && (
          <ul className="text-sm text-muted-foreground list-disc pl-5">
            {files.map((f) => (
              <li key={f.name}>{f.name}</li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleImport} disabled={loading || files.length === 0}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            Importar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
