import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Copy, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useDataScopes,
  useDataScopeUsage,
  useDeleteDataScope,
  useToggleDataScope,
  type DataScopeRow,
} from "@/hooks/useDataScopes";
import { EscopoFormDialog } from "./EscopoFormDialog";

const BASE_LABEL: Record<string, string> = {
  meus_dados: "Somente do próprio vendedor",
  vendedores_selecionados: "Vendedores selecionados",
  empresa: "Toda a empresa",
};

export function EscoposAdminTab() {
  const { data: escopos, isLoading } = useDataScopes();
  const { data: usage } = useDataScopeUsage();
  const toggle = useToggleDataScope();
  const remover = useDeleteDataScope();

  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState<DataScopeRow | null>(null);
  const [duplicando, setDuplicando] = useState<DataScopeRow | null>(null);

  async function excluir(e: DataScopeRow) {
    const vinculados = usage?.get(e.id) ?? 0;
    if (vinculados > 0) {
      return toast.error(
        `Este escopo está vinculado a ${vinculados} usuário(s). Inative-o em vez de excluir.`,
      );
    }
    if (!window.confirm(`Excluir o escopo "${e.nome}"?`)) return;
    try {
      await remover.mutateAsync(e.id);
      toast.success("Escopo excluído.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Escopos de Dados</CardTitle>
          <CardDescription>
            O escopo define QUAIS DADOS o usuário acessa (vendedores, clientes, grupos econômicos e
            regiões). O que ele pode fazer continua sendo definido pelo perfil.
          </CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditando(null);
            setDuplicando(null);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Novo escopo
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <EscopoFormDialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) {
              setEditando(null);
              setDuplicando(null);
            }
          }}
          escopo={editando}
          duplicarDe={duplicando}
        />

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Escopo</TableHead>
                <TableHead>Abrangência</TableHead>
                <TableHead>Conteúdo</TableHead>
                <TableHead className="text-center">Usuários</TableHead>
                <TableHead className="text-center">Ativo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(escopos ?? []).map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">
                    {e.nome}
                    {e.descricao && (
                      <div className="text-xs text-muted-foreground">{e.descricao}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{BASE_LABEL[e.base] ?? e.base}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {e.vendedores.map((v) => (
                        <Badge key={`v-${v}`} variant="secondary" className="text-[10px]">
                          {v}
                        </Badge>
                      ))}
                      {e.clientes.map((c) => (
                        <Badge key={`c-${c}`} variant="outline" className="text-[10px]">
                          Cliente: {c}
                        </Badge>
                      ))}
                      {e.grupos_economicos.map((g) => (
                        <Badge key={`g-${g}`} variant="outline" className="text-[10px]">
                          Grupo: {g}
                        </Badge>
                      ))}
                      {e.regioes.map((r) => (
                        <Badge key={`r-${r}`} variant="outline" className="text-[10px]">
                          Região: {r}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-sm">{usage?.get(e.id) ?? 0}</TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={e.ativo}
                      onCheckedChange={(v) => toggle.mutate({ id: e.id, ativo: v })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        title="Editar escopo"
                        onClick={() => {
                          setDuplicando(null);
                          setEditando(e);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        title="Duplicar escopo"
                        onClick={() => {
                          setEditando(null);
                          setDuplicando(e);
                          setOpen(true);
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        title="Excluir escopo"
                        disabled={(usage?.get(e.id) ?? 0) > 0}
                        onClick={() => excluir(e)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(escopos ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                    Nenhum escopo personalizado criado. Os escopos padrão continuam disponíveis no
                    cadastro de usuários.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
