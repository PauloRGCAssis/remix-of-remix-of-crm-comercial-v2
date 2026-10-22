import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfCanvasViewerProps {
  bytes: Uint8Array;
  onError?: (message: string) => void;
}

export function PdfCanvasViewer({ bytes, onError }: PdfCanvasViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;

    const renderPdf = async () => {
      setLoading(true);
      setError(null);
      container.replaceChildren();

      try {
        // PDF.js pode transferir o buffer recebido; a cópia preserva os bytes
        // originais usados pelo upload, nova aba e download.
        loadingTask = pdfjsLib.getDocument({ data: bytes.slice() });
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          if (cancelled) return;

          const baseViewport = page.getViewport({ scale: 1 });
          const availableWidth = Math.max(280, Math.min(container.clientWidth - 32, 820));
          const cssScale = availableWidth / baseViewport.width;
          const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
          const renderViewport = page.getViewport({ scale: cssScale * pixelRatio });

          const section = document.createElement("section");
          section.className = "flex flex-col items-center gap-2";
          section.setAttribute("aria-label", `Página ${pageNumber} de ${pdf.numPages}`);

          const label = document.createElement("p");
          label.className = "text-xs font-medium text-muted-foreground";
          label.textContent = `Página ${pageNumber} de ${pdf.numPages}`;

          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(renderViewport.width);
          canvas.height = Math.ceil(renderViewport.height);
          canvas.style.width = `${Math.floor(renderViewport.width / pixelRatio)}px`;
          canvas.style.height = "auto";
          canvas.style.maxWidth = "100%";
          canvas.className = "block bg-background shadow-sm";

          const context = canvas.getContext("2d", { alpha: false });
          if (!context) throw new Error("Não foi possível preparar a página do relatório.");

          section.append(label, canvas);
          container.appendChild(section);
          await page.render({ canvasContext: context, viewport: renderViewport }).promise;
        }
      } catch (cause) {
        if (cancelled) return;
        const message = cause instanceof Error ? cause.message : "Falha desconhecida ao renderizar o PDF.";
        setError(message);
        onError?.(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void renderPdf();

    return () => {
      cancelled = true;
      if (loadingTask) void loadingTask.destroy();
      container.replaceChildren();
    };
  }, [bytes, onError]);

  return (
    <div className="relative min-h-full">
      {loading && (
        <div className="absolute inset-x-0 top-10 z-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Preparando visualização…
        </div>
      )}
      {error && (
        <div className="mx-auto mt-10 max-w-md rounded-md border border-destructive/30 bg-destructive/5 p-4 text-center text-sm text-destructive">
          Não foi possível carregar a visualização do relatório.
        </div>
      )}
      <div ref={containerRef} className="flex flex-col items-center gap-6 p-4" />
    </div>
  );
}