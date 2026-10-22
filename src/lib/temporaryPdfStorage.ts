import { supabase } from "@/integrations/supabase/client";

const BUCKET = "client-pdfs";
const SIGNED_URL_SECONDS = 10 * 60;
const CLEANUP_AFTER_MS = 60 * 60 * 1000;

export interface TemporaryPdfLinks {
  path: string;
  inlineUrl: string;
  downloadUrl: string;
}

async function removeExpiredReports(userId: string) {
  const folder = `${userId}/estudo-vendas`;
  const { data } = await supabase.storage.from(BUCKET).list(folder, {
    limit: 100,
    sortBy: { column: "created_at", order: "asc" },
  });

  if (!data?.length) return;

  const cutoff = Date.now() - CLEANUP_AFTER_MS;
  const expired = data
    .filter((file) => file.created_at && new Date(file.created_at).getTime() < cutoff)
    .map((file) => `${folder}/${file.name}`);

  if (expired.length) await supabase.storage.from(BUCKET).remove(expired);
}

export async function uploadTemporaryPdf(bytes: Uint8Array, fileName: string): Promise<TemporaryPdfLinks> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sua sessão expirou. Entre novamente para gerar o relatório.");

  void removeExpiredReports(userData.user.id);

  const safeId = crypto.randomUUID();
  const path = `${userData.user.id}/estudo-vendas/${Date.now()}-${safeId}.pdf`;
  const pdfFile = new File([bytes.slice()], fileName, { type: "application/pdf" });
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, pdfFile, {
    contentType: "application/pdf",
    cacheControl: "600",
    upsert: false,
  });
  if (uploadError) throw new Error(`Não foi possível enviar o PDF com segurança: ${uploadError.message}`);

  const [inlineResult, downloadResult] = await Promise.all([
    supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS),
    supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS, { download: fileName }),
  ]);

  if (inlineResult.error || !inlineResult.data?.signedUrl) {
    throw new Error(`Não foi possível criar o link de visualização: ${inlineResult.error?.message ?? "URL indisponível"}`);
  }
  if (downloadResult.error || !downloadResult.data?.signedUrl) {
    throw new Error(`Não foi possível criar o link de download: ${downloadResult.error?.message ?? "URL indisponível"}`);
  }

  return {
    path,
    inlineUrl: inlineResult.data.signedUrl,
    downloadUrl: downloadResult.data.signedUrl,
  };
}