import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Pencil, Plus, Loader2 } from "lucide-react";
import { useVendors, useToggleVendorActive, type Vendor } from "@/hooks/useVendors";
import { VendorFormDialog } from "./VendorFormDialog";

export function VendorsManagementTab() {
  const { data: vendors, isLoading } = useVendors();
  const toggle = useToggleVendorActive();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);

  const handleNew = () => {
    setEditing(null);
    setOpen(true);
  };
  const handleEdit = (v: Vendor) => {
    setEditing(v);
    setOpen(true);
  };

  return (
    <Card className="shadow-card">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-heading">Cadastro de Vendedores</CardTitle>
        <Button size="sm" onClick={handleNew}>
          <Plus className="h-4 w-4 mr-1" /> Novo vendedor
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Data entrada</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(vendors ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                    Nenhum vendedor cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                (vendors ?? []).map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.nome}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{v.email ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{v.telefone ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {v.data_entrada ? new Date(v.data_entrada).toLocaleDateString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell>
                      {v.is_team ? <Badge variant="secondary">Interno</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={v.ativo}
                          onCheckedChange={(checked) => toggle.mutate({ id: v.id, ativo: checked })}
                        />
                        <span className={`text-xs ${v.ativo ? "text-success" : "text-muted-foreground"}`}>
                          {v.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(v)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <VendorFormDialog open={open} onOpenChange={setOpen} vendor={editing} />
    </Card>
  );
}
