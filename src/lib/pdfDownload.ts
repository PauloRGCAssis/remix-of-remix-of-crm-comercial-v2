import type jsPDF from "jspdf";

/**
 * Download de PDF compatível com desktop, Chrome Android e Safari iOS.
 *
 * No iOS/Safari o atributo `download` de <a> é ignorado (e blob: em nova aba
 * costuma ser bloqueado quando aberto de forma assíncrona). Por isso:
 *  - iOS/Safari: abrimos o PDF numa aba já pré-aberta no gesto do usuário
 *    (ou, em último caso, navegamos para a URL) para permitir
 *    "Compartilhar → Salvar em Arquivos".
 *  - Demais navegadores: download direto via <a download> + Blob URL.
 */

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ se identifica como Mac com touch
  const iPadOS = /Macintosh/.test(ua) && typeof document !== "undefined" && "ontouchend" in document;
  return iOSDevice || iPadOS;
}

export function isSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(ua);
}

/** Safari iOS não suporta download programático confiável. */
export function needsNewTabPdf(): boolean {
  return isIOS() || isSafari();
}

/**
 * Pré-abre uma aba SINCRONAMENTE dentro do handler de clique.
 * Necessário no iOS quando a geração do PDF é assíncrona (html2canvas),
 * senão o `window.open` posterior é bloqueado como popup.
 */
export function preopenPdfTab(): Window | null {
  if (!needsNewTabPdf()) return null;
  try {
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<title>Gerando PDF…</title><body style="font-family:-apple-system,sans-serif;padding:24px;color:#444">' +
          "Gerando PDF, aguarde…</body>",
      );
    }
    return win;
  } catch {
    return null;
  }
}

export interface SavePdfOptions {
  /** Aba pré-aberta no gesto do usuário (ver preopenPdfTab). */
  preopened?: Window | null;
  /** Callback de erro amigável. */
  onError?: (message: string) => void;
}

export function savePdfBlob(blob: Blob, filename: string, options: SavePdfOptions = {}): boolean {
  const { preopened = null, onError } = options;
  const safeName = filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`;

  try {
    // Garante o Content-Type correto no blob servido pela URL de objeto.
    const pdfBlob = blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" });
    const url = URL.createObjectURL(pdfBlob);
    const revoke = () => setTimeout(() => URL.revokeObjectURL(url), 60_000);

    if (needsNewTabPdf()) {
      if (preopened && !preopened.closed) {
        preopened.location.href = url;
        revoke();
        return true;
      }
      const win = window.open(url, "_blank");
      if (win) {
        revoke();
        return true;
      }
      // Popup bloqueado: navega na própria aba (Safari exibe o PDF e permite compartilhar).
      window.location.href = url;
      revoke();
      return true;
    }

    const a = document.createElement("a");
    a.href = url;
    a.download = safeName;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    revoke();
    return true;
  } catch (err) {
    if (preopened && !preopened.closed) preopened.close();
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    onError?.(`Não foi possível gerar o PDF. ${message}`);
    return false;
  }
}

/** Salva um documento jsPDF de forma compatível com iOS. */
export function savePdfDoc(doc: jsPDF, filename: string, options: SavePdfOptions = {}): boolean {
  try {
    const blob = doc.output("blob") as Blob;
    return savePdfBlob(blob, filename, options);
  } catch (err) {
    if (options.preopened && !options.preopened.closed) options.preopened.close();
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    options.onError?.(`Não foi possível gerar o PDF. ${message}`);
    return false;
  }
}

/** Abre o PDF numa nova aba (visualização) em qualquer plataforma. */
export function openPdfDoc(doc: jsPDF, options: SavePdfOptions = {}): boolean {
  const { preopened = null, onError } = options;
  try {
    const blob = doc.output("blob") as Blob;
    const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    if (preopened && !preopened.closed) {
      preopened.location.href = url;
      return true;
    }
    const win = window.open(url, "_blank");
    if (!win) window.location.href = url;
    return true;
  } catch (err) {
    if (preopened && !preopened.closed) preopened.close();
    onError?.(`Não foi possível gerar o PDF. ${err instanceof Error ? err.message : ""}`.trim());
    return false;
  }
}
