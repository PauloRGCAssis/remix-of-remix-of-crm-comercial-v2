import {
  LayoutDashboard,
  Target,
  Users,
  FileSpreadsheet,
  UserCheck,
  Map,
  FileText,
  Calendar,
  TrendingUp,
  Brain,
  ClipboardList,
  Sparkles,
  GitMerge,
  DollarSign,
  Store,
  MapPin,
  Megaphone,
  Percent,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { usePermissions } from "@/hooks/usePermissions";
import { moduleKeyForRoute } from "@/lib/modulesCatalog";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const menuItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Prospecção", url: "/prospeccao", icon: Target },
  { title: "Ponto de Venda", url: "/ponto-de-venda", icon: Store },
  { title: "Agenda de Visitas", url: "/agenda", icon: Calendar },
  { title: "Agenda de Pedidos", url: "/agenda-pedidos", icon: Map },
  { title: "Cadastro de Clientes", url: "/cadastro", icon: ClipboardList },
  { title: "Clientes (Endereços)", url: "/clientes-enderecos", icon: MapPin },
  { title: "Análise de Clientes", url: "/clientes", icon: Users },
  { title: "Clientes Duplicados", url: "/clientes-duplicados", icon: GitMerge },
  { title: "Vendedores", url: "/vendedores", icon: UserCheck },
  { title: "Estudo de Vendas", url: "/estudo-vendas", icon: TrendingUp },
  { title: "Inteligência Comercial", url: "/inteligencia", icon: Brain },
  { title: "Metas Comerciais", url: "/metas", icon: Target },
  { title: "Pagamento Vendedores", url: "/pagamento-vendedores", icon: DollarSign },
  { title: "Relatórios", url: "/relatorios", icon: FileText },
  { title: "Ações Comerciais", url: "/acoes-comerciais", icon: Megaphone },
  { title: "Controle de Bonificações", url: "/bonificacoes", icon: Percent },
  { title: "Degustações", url: "/degustacoes", icon: Sparkles },
  { title: "Importar Planilha", url: "/importar", icon: FileSpreadsheet },
  { title: "Administração", url: "/administracao", icon: ShieldCheck, adminOnly: true, modulo: "administracao" },
];


export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { isGestor, isAdmin, nome, vendedor } = useUserRole();
  const { can } = usePermissions();
  // O menu reflete as mesmas regras do ProtectedRoute: permissões efetivas
  // (perfil + exceções) e, para Administração, a role técnica `admin`.
  const visibleItems = menuItems.filter((item) => {
    if (item.adminOnly && !isAdmin) return false;
    const modulo = (item as { modulo?: string }).modulo ?? moduleKeyForRoute(item.url);
    return !modulo || can(modulo, "acessar");
  });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg gradient-brand flex items-center justify-center shadow-brand flex-shrink-0">
            <span className="text-lg font-bold text-primary-foreground font-heading">T</span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-sidebar-primary-foreground font-heading truncate">
                Ti Delso
              </h2>
              <p className="text-xs text-sidebar-foreground/60 truncate">
                {isGestor ? "Gestor" : vendedor || nome || "Vendedor"}
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/40 text-xs uppercase tracking-wider">
            Menu Principal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (

                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="hover:bg-sidebar-accent/50 transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 space-y-2">
        <LogoutButton collapsed={collapsed} />
        {!collapsed && (
          <p className="text-[10px] text-sidebar-foreground/30 text-center">
            Pão de Queijo Ti Delso © 2026
          </p>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

function LogoutButton({ collapsed }: { collapsed: boolean }) {
  const { user, signOut } = useAuth();
  return (
    <div className="flex flex-col gap-1">
      {!collapsed && user?.email && (
        <p className="text-[10px] text-sidebar-foreground/50 truncate px-1">{user.email}</p>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => signOut()}
        className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground"
        title="Sair"
      >
        <LogOut className="h-4 w-4 flex-shrink-0" />
        {!collapsed && <span className="ml-2">Sair</span>}
      </Button>
    </div>
  );
}
