import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Download, ExternalLink, FileText, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { buildEstudoVendasPdf, buildEstudoPdfFileName, type EstudoPdfInput } from "@/lib/estudoVendasPdf";
import { uploadTemporaryPdf, type TemporaryPdfLinks } from "@/lib/temporaryPdfStorage";
import { PdfCanvasViewer } from "@/components/estudo-vendas/PdfCanvasViewer";

/**
 * Botões de relatório individual do cliente no Estudo de Vendas.
 * Usa exatamente os dados já consolidados na tela (nenhum recálculo próprio).
 *
 * Gera um único conjunto de bytes. O preview é renderizado pelo PDF.js e as
 * ações externas usam links HTTPS temporários do armazenamento privado.
 */
export function ClienteRelatorioPdfButtons({ input }: { input: EstudoPdfInput }) {
  const [previewBytes, setPreviewBytes] = useState<Uint8Array | null>(null);
  const [links, setLinks] = useState<TemporaryPdfLinks | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const generationRef = useRef(0);

  const clearReport = useCallback(() => {
    generationRef.current += 1;
    setPreviewBytes(null);
    setLinks(null);
    setIsPreparing(false);
  }, []);

  useEffect(() => clearReport, [clearReport]);

  const generateBytes = (): Uint8Array | null => {
    try {
      const doc = buildEstudoVendasPdf(input);
      return new Uint8Array(doc.output("arraybuffer"));
    } catch (err) {
      toast({
        title: "Erro ao gerar PDF",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
      return null;
    }
  };

  const downloadFromHttpsUrl = (url: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const openHttpsUrl = (url: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const uploadReport = async (bytes: Uint8Array) => {
    return uploadTemporaryPdf(bytes, buildEstudoPdfFileName(input));
  };

  const handleDownloadStandalone = async () => {
    const bytes = generateBytes();
    if (!bytes) return;
    setIsDownloading(true);
    try {
      const uploadedLinks = await uploadReport(bytes);
      downloadFromHttpsUrl(uploadedLinks.downloadUrl);
    } catch (err) {
      toast({
        title: "Erro ao baixar PDF",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePreview = async () => {
    clearReport();
    const generation = generationRef.current;
    const bytes = generateBytes();
    if (!bytes) return;

    setPreviewBytes(bytes);
    setIsPreparing(true);
    try {
      const uploadedLinks = await uploadReport(bytes);
      if (generation === generationRef.current) setLinks(uploadedLinks);
    } catch (err) {
      if (generation !== generationRef.current) return;
      toast({
        title: "Relatório exibido, mas o link não foi criado",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      if (generation === generationRef.current) setIsPreparing(false);
    }
  };

  const handlePreviewRenderError = useCallback((message: string) => {
    console.error("Falha ao renderizar o relatório com PDF.js:", message);
  }, []);

  const handleDownloadPreview = () => {
    if (!links) return;
    downloadFromHttpsUrl(links.downloadUrl);
  };

  const openInNewTab = () => {
    if (!links) return;
    openHttpsUrl(links.inlineUrl);
  };

  const closePreview = () => {
    clearReport();
  };

  return (
    <>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={handlePreview}>
          <FileText className="h-3 w-3 mr-1" /> Visualizar PDF
        </Button>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={handleDownloadStandalone} disabled={isDownloading}>
          {isDownloading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />} Baixar PDF
        </Button>
      </div>

      <Dialog open={!!previewBytes} onOpenChange={(open) => { if (!open) closePreview(); }}>
        <DialogContent className="max-w-5xl h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader>
            <DialogTitle className="px-6 pt-5 pb-4 text-base font-heading">Relatório — {input.clientName}</DialogTitle>
          </DialogHeader>

          {previewBytes && (
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden border-y bg-muted/40">
              <PdfCanvasViewer bytes={previewBytes} onError={handlePreviewRenderError} />
            </div>
          )}

          <DialogFooter className="gap-2 p-4 sm:space-x-0">
            <Button variant="outline" onClick={openInNewTab} disabled={!links || isPreparing}>
              {isPreparing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-1" />} Abrir em nova aba
            </Button>
            <Button variant="outline" onClick={closePreview}>Fechar</Button>
            <Button onClick={handleDownloadPreview} disabled={!links || isPreparing}>
              {isPreparing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />} Baixar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
