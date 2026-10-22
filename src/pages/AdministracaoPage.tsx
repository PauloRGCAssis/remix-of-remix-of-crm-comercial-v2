import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UsuariosAdminTab } from "@/components/admin/UsuariosAdminTab";
import { PermissoesMatrixTab } from "@/components/admin/PermissoesMatrixTab";
import { EscoposAdminTab } from "@/components/admin/EscoposAdminTab";
import { AuditoriaAcessosTab } from "@/components/admin/AuditoriaAcessosTab";
import { VendorsManagementTab } from "@/components/vendedores/VendorsManagementTab";
import { ShieldCheck } from "lucide-react";

export default function AdministracaoPage() {
  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-xl font-bold font-heading">Administração</h1>
            <p className="text-sm text-muted-foreground">
              Usuários, vendedores, perfis de permissão, escopos de dados e auditoria de acessos.
            </p>
          </div>
        </div>

        <Tabs defaultValue="usuarios">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="usuarios">Usuários</TabsTrigger>
            <TabsTrigger value="vendedores">Vendedores</TabsTrigger>
            <TabsTrigger value="permissoes">Perfis e Permissões</TabsTrigger>
            <TabsTrigger value="escopos">Escopos de Dados</TabsTrigger>
            <TabsTrigger value="auditoria">Auditoria de Acessos</TabsTrigger>
          </TabsList>
          <TabsContent value="usuarios" className="mt-4">
            <UsuariosAdminTab />
          </TabsContent>
          <TabsContent value="vendedores" className="mt-4">
            <VendorsManagementTab />
          </TabsContent>
          <TabsContent value="permissoes" className="mt-4">
            <PermissoesMatrixTab />
          </TabsContent>
          <TabsContent value="escopos" className="mt-4">
            <EscoposAdminTab />
          </TabsContent>
          <TabsContent value="auditoria" className="mt-4">
            <AuditoriaAcessosTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
