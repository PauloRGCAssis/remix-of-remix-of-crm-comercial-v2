import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { SincronizacaoIndicador } from "@/components/SincronizacaoIndicador";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b-2 border-brand-orange bg-card px-4 sticky top-0 z-10">
            <SidebarTrigger className="mr-4" />
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground font-body">
                Pão de Queijo Ti Delso
              </span>
              <span className="hidden sm:inline text-border">|</span>
              <span className="hidden sm:inline text-sm text-muted-foreground">CRM Comercial</span>
            </div>
            <SincronizacaoIndicador />
          </header>
          <main data-app-main-scroll="true" className="flex-1 p-4 md:p-6 overflow-x-auto overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
