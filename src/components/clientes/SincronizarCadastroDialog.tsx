import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type {
  CampoCadastral,
  PlanoSincronizacao,
  ResolucaoConflito,
} from "@/lib/clientCentralRegistry";

interface Props {
  open: boolean;
  plano: PlanoSincronizacao | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (resolucoes: Partial<Record<CampoCadastral, ResolucaoConflito>>) => void;
}

export function SincronizarCadastroDialog({ open, plano, onOpenChange, onConfirm }: Props) {
  const [resolucoes, setResolucoes] = useState<Partial<Record<CampoCadastral, ResolucaoConflito>>>({});

  useEffect(() => {
    if (!plano) return;
    const inicial: Partial<Record<CampoCadastral, ResolucaoConflito>> = {};
    for (const c of plano.conflitos) inicial[c.campo] = "manter";
    setResolucoes(inicial);
  }, [plano]);

  if (!plano) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">Atualizar cadastro do cliente</DialogTitle>
          <DialogDescription>
            {plano.cliente} já possui informações cadastradas diferentes das que você informou.
            Escolha o que fazer com cada dado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1 max-h-[55vh] overflow-y-auto">
          {plano.conflitos.map((c) => (
            <div key={c.campo} className="rounded-lg border p-3 space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold">{c.label}</p>
                <p className="text-xs text-muted-foreground">
                  Atual: <span className="font-medium text-foreground">{c.atual}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Novo: <span className="font-medium text-foreground">{c.novo}</span>
                </p>
              </div>
              <RadioGroup
                value={resolucoes[c.campo] ?? "manter"}
                onValueChange={(v) =>
                  setResolucoes((prev) => ({ ...prev, [c.campo]: v as ResolucaoConflito }))
                }
                className="gap-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="manter" id={`${c.campo}-manter`} />
                  <Label htmlFor={`${c.campo}-manter`} className="font-normal text-sm">
                    Manter atual
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="atualizar" id={`${c.campo}-atualizar`} />
                  <Label htmlFor={`${c.campo}-atualizar`} className="font-normal text-sm">
                    Atualizar cadastro
                  </Label>
                </div>
                {c.permiteAlternativo && (
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="alternativo" id={`${c.campo}-alt`} />
                    <Label htmlFor={`${c.campo}-alt`} className="font-normal text-sm">
                      {c.campo === "endereco"
                        ? "Adicionar como novo endereço/unidade"
                        : "Adicionar como telefone alternativo"}
                    </Label>
                  </div>
                )}
              </RadioGroup>
            </div>
          ))}

          {plano.preenchidos.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Também serão preenchidos automaticamente (estavam vazios):{" "}
              <span className="font-medium text-foreground">{plano.preenchidos.join(", ")}</span>.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => onConfirm(resolucoes)}>Salvar no cadastro</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
