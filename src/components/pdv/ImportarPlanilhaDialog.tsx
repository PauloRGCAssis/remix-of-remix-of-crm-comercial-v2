import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { formatDuration } from "@/lib/pdvImport";
import {
  runSalesImport,
  refreshSalesCaches,
  type ImportProgress,
  type SalesImportReport,
} from "@/lib/salesImportRunner";
import type { ClientProfile } from "@/types/clientProfile";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: ClientProfile[];
}

/**
 * Importação de planilha a partir da aba Ponto de Venda.
 * Usa exatamente o mesmo processo central da aba geral "Importar Planilha":
 * mesma leitura, mesmas validações e mesma base de vendas.
 */
export function ImportarPlanilhaDialog({ open, onOpenChange, profiles }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [report, setReport] = useState<SalesImportReport | null>(null);

  const importar = async (files: File[]) => {
    setImporting(true);
    setReport(null);
    try {
      const result = await runSalesImport(files, {
        profiles,
        onProgress: setProgress,
        importedBy: user?.email ?? "Lovable Cloud",
      });
      setReport(result);
      // Sincronização imediata: todas as telas que dependem de vendas são recarregadas.
      await refreshSalesCaches(qc);
      toast({
        title: "Importação concluída",
        description: `${result.linhas} linha(s) · ${result.pedidos} pedido(s) · ${result.pdvAtualizados} ponto(s) de venda atualizado(s).`,
      });
    } catch (e: any) {
      toast({ title: "Erro ao importar", description: e?.message, variant: "destructive" });
    } finally {
      setImporting(false);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading">Importar planilha</DialogTitle>
          <DialogDescription>
            Mesma planilha de vendas usada na aba “Importar Planilha”. O arquivo pode ter qualquer nome — a
            estrutura é identificada pelas colunas. Todos os clientes válidos alimentam o CRM inteiro, mas apenas
            os clientes já cadastrados como ponto de venda aparecem nesta aba.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          multiple
          className="hidden"
          onChange={(e) => {
            const list = Array.from(e.target.files ?? []);
            if (list.length) void importar(list);
          }}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1 h-4 w-4" />}
            Importar planilha
          </Button>
          {progress && (
            <span className="text-xs text-muted-foreground">
              {progress.phase}
              {progress.total ? ` · ${progress.current}/${progress.total}` : ""}
            </span>
          )}
        </div>

        {report && (
          <div className="max-h-80 space-y-1 overflow-y-auto rounded-md border p-3 text-sm">
            <p className="font-medium">Resumo da importação</p>
            <Line label="Linhas processadas" value={report.linhas} />
            <Line label="Pedidos identificados" value={report.pedidos} />
            <Line label="Itens novos inseridos" value={report.inserted} />
            <Line label="Itens atualizados" value={report.updated} />
            <Line label="Itens duplicados ignorados" value={report.unchanged} />
            <Line label="Clientes na planilha" value={report.clientesPlanilha} />
            <Line label="Clientes encontrados no CRM" value={report.clientesEncontrados} />
            <Line label="Clientes não encontrados" value={report.clientesNaoEncontrados} />
            <Line label="Registros para revisão manual" value={report.clientesRevisao} />
            <Line label="Pontos de venda atualizados" value={report.pdvAtualizados} />
            <Line label="Clientes comuns (não viram PDV)" value={report.clientesComuns} />
            <p className="pt-1 text-xs text-muted-foreground">
              Período dos dados: {report.periodo} · Tempo: {formatDuration(report.duracaoMs)}
            </p>
            {report.errors.length > 0 && (
              <p className="text-xs text-destructive">Erros: {report.errors.slice(0, 3).join(" | ")}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <p className="flex justify-between gap-4 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value.toLocaleString("pt-BR")}</span>
    </p>
  );
}
