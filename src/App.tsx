import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { CrmProvider } from "@/contexts/CrmContext";
import { useClientAliases } from "@/hooks/useClientAliases";
import { useIosSafariPersistence } from "@/hooks/useIosSafariPersistence";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import ProspeccaoPage from "./pages/ProspeccaoPage";
import ClientesPage from "./pages/ClientesPage";
import ImportarPage from "./pages/ImportarPage";
import VendedoresPage from "./pages/VendedoresPage";
import AgendaPage from "./pages/AgendaPage";
import AgendaPedidosPage from "./pages/AgendaPedidosPage";
import RelatoriosPage from "./pages/RelatoriosPage";
import EstudoVendasPage from "./pages/EstudoVendasPage";
import MetasPage from "./pages/MetasPage";
import InteligenciaComercialPage from "./pages/InteligenciaComercialPage";
import CadastroClientesPage from "./pages/CadastroClientesPage";
import PontoVendaPage from "./pages/PontoVendaPage";
import ClientesEnderecosPage from "./pages/ClientesEnderecosPage";
import DegustacoesPage from "./pages/DegustacoesPage";
import AcoesComerciaisPage from "./pages/AcoesComerciaisPage";
import BonificacoesPage from "./pages/BonificacoesPage";
import ClientesDuplicadosPage from "./pages/ClientesDuplicadosPage";
import PagamentoVendedoresPage from "./pages/PagamentoVendedoresPage";
import AdministracaoPage from "./pages/AdministracaoPage";
import AuthPage from "./pages/AuthPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import NovaSenhaPage from "./pages/NovaSenhaPage";
import PrimeiroAcessoPage from "./pages/PrimeiroAcessoPage";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";


// Defaults conservadores para evitar refresh ao retornar de outro app no iPhone.
// Safari iOS dispara visibilitychange/focus ao retornar do background; com
// refetchOnWindowFocus ativo o app exibia skeletons e "recarregava" a tela.
focusManager.setEventListener(() => () => undefined);
onlineManager.setEventListener(() => () => undefined);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      staleTime: Infinity,
      gcTime: 24 * 60 * 60 * 1000,
      retry: 1,
    },
  },
});

const P = ({ children }: { children: JSX.Element }) => <ProtectedRoute>{children}</ProtectedRoute>;
const G = ({ children }: { children: JSX.Element }) => (
  <ProtectedRoute gestorOnly>{children}</ProtectedRoute>
);

// Carrega aliases dinâmicos no boot para que normalizeClientName os use globalmente.
function AliasBootstrap() {
  useClientAliases();
  return null;
}

function IosSafariPersistenceBootstrap() {
  useIosSafariPersistence();
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <AuthProvider>
          <CrmProvider>
            <Toaster />
            <Sonner />
            <IosSafariPersistenceBootstrap />
            <AliasBootstrap />
            <AppErrorBoundary>
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/nova-senha" element={<NovaSenhaPage />} />
              <Route path="/primeiro-acesso" element={<PrimeiroAcessoPage />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<P><Index /></P>} />
              <Route path="/prospeccao" element={<P><ProspeccaoPage /></P>} />
              <Route path="/ponto-de-venda" element={<P><PontoVendaPage /></P>} />
              <Route path="/clientes-enderecos" element={<P><ClientesEnderecosPage /></P>} />
              <Route path="/clientes" element={<P><ClientesPage /></P>} />
              <Route path="/clientes-duplicados" element={<G><ClientesDuplicadosPage /></G>} />
              <Route path="/importar" element={<G><ImportarPage /></G>} />
              <Route path="/vendedores" element={<G><VendedoresPage /></G>} />
              <Route path="/agenda" element={<P><AgendaPage /></P>} />
              <Route path="/agenda-pedidos" element={<P><AgendaPedidosPage /></P>} />
              <Route path="/estudo-vendas" element={<P><EstudoVendasPage /></P>} />
              <Route path="/metas" element={<P><MetasPage /></P>} />
              <Route path="/pagamento-vendedores" element={<G><PagamentoVendedoresPage /></G>} />
              <Route path="/inteligencia" element={<P><InteligenciaComercialPage /></P>} />
              <Route path="/cadastro" element={<P><CadastroClientesPage /></P>} />
              <Route path="/degustacoes" element={<P><DegustacoesPage /></P>} />
              <Route path="/acoes-comerciais" element={<G><AcoesComerciaisPage /></G>} />
              <Route path="/bonificacoes" element={<G><BonificacoesPage /></G>} />
              <Route path="/administracao" element={<G><AdministracaoPage /></G>} />
              <Route path="/relatorios" element={<P><RelatoriosPage /></P>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
            </AppErrorBoundary>
          </CrmProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
