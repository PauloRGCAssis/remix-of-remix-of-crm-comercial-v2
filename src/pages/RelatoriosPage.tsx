import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Construction } from "lucide-react";

export default function RelatoriosPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-heading">Relatórios</h1>
          <p className="text-sm text-muted-foreground mt-1">Relatórios detalhados e exportáveis</p>
        </div>

        <Card className="shadow-card">
          <CardContent className="p-12 text-center">
            <Construction className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-lg font-heading font-semibold text-muted-foreground mb-2">Em Desenvolvimento</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Os relatórios detalhados com exportação para PDF e Excel estarão disponíveis em breve. 
              Utilize o Dashboard e as páginas de Vendas e Vendedores para análises.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
