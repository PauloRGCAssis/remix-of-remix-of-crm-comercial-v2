import { Client, Sale, Prospect, Visit, Seller, DashboardMetrics, Product } from '@/types/crm';

// Generate sample data based on the uploaded spreadsheets
const today = new Date();
const daysDiff = (dateStr: string) => {
  const d = new Date(dateStr);
  return Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
};

export const sampleClients: Client[] = [
  { id: '1', nome: 'Padaria Bonna Massa - Vale do Sol', contato: 'Carlos', telefone: '(31) 3333-1111', cidade: 'BH', estado: 'MG', bairro: 'Vale do Sol', vendedor: 'Juliano', clientType: 'revenda', status: 'ativo', dataUltimaCompra: '2026-02-20', diasSemComprar: 6, totalCompras: 48, valorTotal: 42500, ticketMedio: 885.42, mediaKg: 32, novDecKg: 180, frequenciaMedia: 7, frequenciaLabel: 'Semanal' },
  { id: '2', nome: 'Lanchonete Pastel na Feira', contato: 'Maria', telefone: '(31) 3333-2222', cidade: 'BH', estado: 'MG', bairro: 'Centro', vendedor: 'Juliano', clientType: 'consumo', status: 'ativo', dataUltimaCompra: '2026-02-18', diasSemComprar: 8, totalCompras: 36, valorTotal: 31200, ticketMedio: 866.67, mediaKg: 25, novDecKg: 140, frequenciaMedia: 8, frequenciaLabel: 'Semanal' },
  { id: '3', nome: 'Hotel Bourbon - Afonso Pena', contato: 'Roberto', telefone: '(31) 3333-3333', cidade: 'BH', estado: 'MG', bairro: 'Afonso Pena', vendedor: 'João Paulo', clientType: 'consumo', status: 'ativo', dataUltimaCompra: '2026-02-15', diasSemComprar: 11, totalCompras: 52, valorTotal: 78900, ticketMedio: 1517.31, mediaKg: 55, novDecKg: 320, frequenciaMedia: 5, frequenciaLabel: 'Mais de 1x/semana' },
  { id: '4', nome: 'Padaria Kero Kero', contato: 'Ana', telefone: '(31) 3333-4444', cidade: 'BH', estado: 'MG', bairro: 'Centro', vendedor: 'Ti Delso', clientType: 'revenda', status: 'ativo', dataUltimaCompra: '2026-02-22', diasSemComprar: 4, totalCompras: 60, valorTotal: 55800, ticketMedio: 930.00, mediaKg: 40, novDecKg: 250, frequenciaMedia: 6, frequenciaLabel: 'Semanal' },
  { id: '5', nome: 'Cafeteria Gallery', contato: 'Pedro', telefone: '(31) 3333-5555', cidade: 'BH', estado: 'MG', bairro: 'Savassi', vendedor: 'Ti Delso', clientType: 'consumo', status: 'ativo', dataUltimaCompra: '2026-02-10', diasSemComprar: 16, totalCompras: 24, valorTotal: 12600, ticketMedio: 525.00, mediaKg: 15, novDecKg: 80, frequenciaMedia: 14, frequenciaLabel: 'Quinzenal' },
  { id: '6', nome: 'Dumont Conveniência - Savassi', contato: 'Lucas', telefone: '(31) 3333-6666', cidade: 'BH', estado: 'MG', bairro: 'Savassi', vendedor: 'Juliano', clientType: 'revenda', status: 'ativo', dataUltimaCompra: '2026-02-19', diasSemComprar: 7, totalCompras: 30, valorTotal: 18500, ticketMedio: 616.67, mediaKg: 20, novDecKg: 110, frequenciaMedia: 10, frequenciaLabel: 'Semanal' },
  { id: '7', nome: 'Cafeteria Cappuccini - Pátio Savassi', contato: 'Fernanda', telefone: '(31) 3333-7777', cidade: 'BH', estado: 'MG', bairro: 'Savassi', vendedor: 'Ti Delso', clientType: 'consumo', status: 'ativo', dataUltimaCompra: '2026-01-28', diasSemComprar: 29, totalCompras: 18, valorTotal: 9800, ticketMedio: 544.44, mediaKg: 12, novDecKg: 65, frequenciaMedia: 18, frequenciaLabel: 'Quinzenal' },
  { id: '8', nome: 'Mister Black Café - Shopping Cidade', contato: 'Marcos', telefone: '(31) 3333-8888', cidade: 'BH', estado: 'MG', bairro: 'Centro', vendedor: 'Ti Delso', clientType: 'consumo', status: 'ativo', dataUltimaCompra: '2026-02-12', diasSemComprar: 14, totalCompras: 22, valorTotal: 14200, ticketMedio: 645.45, mediaKg: 18, novDecKg: 90, frequenciaMedia: 14, frequenciaLabel: 'Quinzenal' },
  { id: '9', nome: 'Padaria A Padoca São Bento', contato: 'Juliana', telefone: '(31) 3333-9999', cidade: 'BH', estado: 'MG', bairro: 'São Bento', vendedor: 'Ti Delso', clientType: 'revenda', status: 'ativo', dataUltimaCompra: '2026-02-05', diasSemComprar: 21, totalCompras: 15, valorTotal: 8900, ticketMedio: 593.33, mediaKg: 16, novDecKg: 85, frequenciaMedia: 21, frequenciaLabel: 'Quinzenal' },
  { id: '10', nome: 'Lanchonete Santo Agostinho', contato: 'Ricardo', telefone: '(31) 3334-1111', cidade: 'BH', estado: 'MG', bairro: 'Santo Agostinho', vendedor: 'Juliano', clientType: 'consumo', status: 'ativo', dataUltimaCompra: '2026-02-20', diasSemComprar: 6, totalCompras: 40, valorTotal: 45600, ticketMedio: 1140.00, mediaKg: 38, novDecKg: 220, frequenciaMedia: 7, frequenciaLabel: 'Semanal' },
  { id: '11', nome: 'Restaurante Meretíssimo', contato: 'Sônia', telefone: '(31) 3334-2222', cidade: 'BH', estado: 'MG', bairro: 'Centro', vendedor: 'Ti Delso', clientType: 'consumo', status: 'inativo', dataUltimaCompra: '2025-10-08', diasSemComprar: 141, totalCompras: 12, valorTotal: 5400, ticketMedio: 450.00, mediaKg: 10, novDecKg: 0, frequenciaMedia: 35, frequenciaLabel: 'Mensal' },
  { id: '12', nome: 'Escola Fausto Figueiredo', contato: 'Patrícia', telefone: '(31) 3334-3333', cidade: 'BH', estado: 'MG', bairro: 'Centro', vendedor: 'Ti Delso', clientType: 'consumo', status: 'perdido', dataUltimaCompra: '2024-08-07', diasSemComprar: 568, totalCompras: 8, valorTotal: 3200, ticketMedio: 400.00, mediaKg: 8, novDecKg: 0, frequenciaMedia: 60, frequenciaLabel: 'Bimestral' },
  { id: '13', nome: 'Padaria Morea - Esmeraldas', contato: 'José', telefone: '(31) 3334-4444', cidade: 'Esmeraldas', estado: 'MG', bairro: 'Centro', vendedor: 'Ednei', clientType: 'revenda', status: 'perdido', dataUltimaCompra: '2023-08-04', diasSemComprar: 937, totalCompras: 5, valorTotal: 2100, ticketMedio: 420.00, mediaKg: 6, novDecKg: 0, frequenciaMedia: 90, frequenciaLabel: 'Esporádico' },
  { id: '14', nome: 'Lanchonete Mania do Pão de Queijo', contato: 'Cláudia', telefone: '(21) 3334-5555', cidade: 'Rio de Janeiro', estado: 'RJ', bairro: 'Realengo', vendedor: 'Ti Delso', clientType: 'consumo', status: 'ativo', dataUltimaCompra: '2026-02-14', diasSemComprar: 12, totalCompras: 28, valorTotal: 19800, ticketMedio: 707.14, mediaKg: 22, novDecKg: 120, frequenciaMedia: 12, frequenciaLabel: 'Quinzenal' },
  { id: '15', nome: 'Lanchonete Ceará - Ouro Preto', contato: 'Antônio', telefone: '(31) 3334-6666', cidade: 'BH', estado: 'MG', bairro: 'Ouro Preto', vendedor: 'Ti Delso', clientType: 'consumo', status: 'ativo', dataUltimaCompra: '2026-02-08', diasSemComprar: 18, totalCompras: 20, valorTotal: 8500, ticketMedio: 425.00, mediaKg: 12, novDecKg: 60, frequenciaMedia: 15, frequenciaLabel: 'Quinzenal' },
  { id: '16', nome: 'Posto CJ - Ale Entreposto', contato: 'Renato', telefone: '(31) 3334-7777', cidade: 'BH', estado: 'MG', bairro: 'Centro', vendedor: 'Ti Delso', clientType: 'consumo', status: 'ativo', dataUltimaCompra: '2026-01-15', diasSemComprar: 42, totalCompras: 14, valorTotal: 7200, ticketMedio: 514.29, mediaKg: 10, novDecKg: 45, frequenciaMedia: 30, frequenciaLabel: 'Mensal' },
  { id: '17', nome: 'Padaria Padua', contato: 'Silvana', telefone: '(31) 3334-8888', cidade: 'BH', estado: 'MG', bairro: 'Funcionários', vendedor: 'Juliano', clientType: 'revenda', status: 'ativo', dataUltimaCompra: '2026-02-24', diasSemComprar: 2, totalCompras: 55, valorTotal: 62000, ticketMedio: 1127.27, mediaKg: 45, novDecKg: 280, frequenciaMedia: 5, frequenciaLabel: 'Mais de 1x/semana' },
  { id: '18', nome: 'Lanchonete Tropical Savassi', contato: 'Marcelo', telefone: '(31) 3334-9999', cidade: 'BH', estado: 'MG', bairro: 'Savassi', vendedor: 'Juliano', clientType: 'consumo', status: 'ativo', dataUltimaCompra: '2026-02-24', diasSemComprar: 2, totalCompras: 45, valorTotal: 38500, ticketMedio: 855.56, mediaKg: 30, novDecKg: 170, frequenciaMedia: 7, frequenciaLabel: 'Semanal' },
  { id: '19', nome: 'Plataforma Vogue', contato: 'Débora', telefone: '(31) 3335-1111', cidade: 'BH', estado: 'MG', bairro: 'Centro', vendedor: 'Ti Delso', clientType: 'consumo', status: 'ativo', dataUltimaCompra: '2026-02-24', diasSemComprar: 2, totalCompras: 32, valorTotal: 15600, ticketMedio: 487.50, mediaKg: 14, novDecKg: 75, frequenciaMedia: 10, frequenciaLabel: 'Semanal' },
  { id: '20', nome: 'Padaria Riber Pão', contato: 'Flávio', telefone: '(31) 3335-2222', cidade: 'BH', estado: 'MG', bairro: 'Centro', vendedor: 'Juliano', clientType: 'revenda', status: 'ativo', dataUltimaCompra: '2026-02-24', diasSemComprar: 2, totalCompras: 38, valorTotal: 22800, ticketMedio: 600.00, mediaKg: 20, novDecKg: 120, frequenciaMedia: 8, frequenciaLabel: 'Semanal' },
  { id: '21', nome: 'Buffet Club Du Chef', contato: 'Adriana', telefone: '(31) 3335-3333', cidade: 'BH', estado: 'MG', bairro: 'Funcionários', vendedor: 'Ti Delso', clientType: 'consumo', status: 'ativo', dataUltimaCompra: '2026-02-23', diasSemComprar: 3, totalCompras: 42, valorTotal: 35200, ticketMedio: 838.10, mediaKg: 28, novDecKg: 160, frequenciaMedia: 7, frequenciaLabel: 'Semanal' },
  { id: '22', nome: 'Hotel Campos Gerais', contato: 'Rogério', telefone: '(31) 3335-4444', cidade: 'BH', estado: 'MG', bairro: 'Centro', vendedor: 'Ti Delso', clientType: 'consumo', status: 'inativo', dataUltimaCompra: '2025-05-22', diasSemComprar: 280, totalCompras: 16, valorTotal: 12400, ticketMedio: 775.00, mediaKg: 20, novDecKg: 0, frequenciaMedia: 45, frequenciaLabel: 'Mensal' },
  { id: '23', nome: 'Cantina Save Me - Bernoulli', contato: 'Teresa', telefone: '(31) 3335-5555', cidade: 'BH', estado: 'MG', bairro: 'Barro Preto', vendedor: 'Juliano', clientType: 'consumo', status: 'perdido', dataUltimaCompra: '2024-07-05', diasSemComprar: 601, totalCompras: 10, valorTotal: 4500, ticketMedio: 450.00, mediaKg: 10, novDecKg: 0, frequenciaMedia: 60, frequenciaLabel: 'Bimestral' },
  { id: '24', nome: 'Cafeteria Borora', contato: 'Helena', telefone: '(31) 99552-1023', cidade: 'BH', estado: 'MG', bairro: 'Savassi', vendedor: 'Juliano', clientType: 'consumo', status: 'novo', dataPrimeiraCompra: '2026-02-15', dataUltimaCompra: '2026-02-15', diasSemComprar: 11, totalCompras: 1, valorTotal: 850, ticketMedio: 850.00, mediaKg: 5, novDecKg: 0, frequenciaMedia: undefined, frequenciaLabel: '-' },
  { id: '25', nome: 'Padaria Bread Baker', contato: 'Bruno', telefone: '(31) 991073108', cidade: 'BH', estado: 'MG', bairro: 'Estoril', vendedor: 'Bruno', clientType: 'revenda', status: 'perdido', dataPrimeiraCompra: '2025-06-10', dataUltimaCompra: '2025-09-15', diasSemComprar: 172, totalCompras: 5, valorTotal: 4800, ticketMedio: 960.00, mediaKg: 8, novDecKg: 0, frequenciaMedia: 30, frequenciaLabel: 'Mensal' },
  { id: '26', nome: 'Padaria Real Sabor - Contagem', contato: 'Márcio', telefone: '(31) 3391-4455', cidade: 'Contagem', estado: 'MG', bairro: 'Centro', vendedor: 'Haroldo Henrique', clientType: 'revenda', status: 'ativo', dataUltimaCompra: '2026-02-22', diasSemComprar: 4, totalCompras: 42, valorTotal: 38500, ticketMedio: 916.67, mediaKg: 35, novDecKg: 200, frequenciaMedia: 7, frequenciaLabel: 'Semanal' },
  { id: '27', nome: 'Lanchonete Ponto Certo - Betim', contato: 'Simone', telefone: '(31) 3531-2233', cidade: 'Betim', estado: 'MG', bairro: 'Centro', vendedor: 'Haroldo Henrique', clientType: 'consumo', status: 'ativo', dataUltimaCompra: '2026-02-18', diasSemComprar: 8, totalCompras: 30, valorTotal: 22000, ticketMedio: 733.33, mediaKg: 22, novDecKg: 130, frequenciaMedia: 10, frequenciaLabel: 'Semanal' },
  { id: '28', nome: 'Cafeteria Moinho - Contagem', contato: 'Leandro', telefone: '(31) 3392-5566', cidade: 'Contagem', estado: 'MG', bairro: 'Eldorado', vendedor: 'Haroldo Henrique', clientType: 'consumo', status: 'ativo', dataUltimaCompra: '2026-02-10', diasSemComprar: 16, totalCompras: 18, valorTotal: 9800, ticketMedio: 544.44, mediaKg: 14, novDecKg: 75, frequenciaMedia: 15, frequenciaLabel: 'Quinzenal' },
  { id: '29', nome: 'Supermercado BomPreço - Ibirité', contato: 'Wagner', telefone: '(31) 3521-7788', cidade: 'Ibirité', estado: 'MG', bairro: 'Centro', vendedor: 'Haroldo Henrique', clientType: 'revenda', status: 'ativo', dataUltimaCompra: '2026-01-28', diasSemComprar: 29, totalCompras: 25, valorTotal: 18200, ticketMedio: 728.00, mediaKg: 20, novDecKg: 110, frequenciaMedia: 14, frequenciaLabel: 'Quinzenal' },
  { id: '30', nome: 'Padaria Sabor da Terra - Ribeirão das Neves', contato: 'Edson', telefone: '(31) 3627-3344', cidade: 'Ribeirão das Neves', estado: 'MG', bairro: 'Centro', vendedor: 'Edinei', clientType: 'revenda', status: 'ativo', dataUltimaCompra: '2026-02-20', diasSemComprar: 6, totalCompras: 35, valorTotal: 28000, ticketMedio: 800.00, mediaKg: 28, novDecKg: 160, frequenciaMedia: 8, frequenciaLabel: 'Semanal' },
  { id: '31', nome: 'Lanchonete Bom Gosto - Santa Luzia', contato: 'Regina', telefone: '(31) 3641-5566', cidade: 'Santa Luzia', estado: 'MG', bairro: 'Centro', vendedor: 'Edinei', clientType: 'consumo', status: 'ativo', dataUltimaCompra: '2026-02-15', diasSemComprar: 11, totalCompras: 22, valorTotal: 14500, ticketMedio: 659.09, mediaKg: 18, novDecKg: 95, frequenciaMedia: 12, frequenciaLabel: 'Quinzenal' },
  { id: '32', nome: 'Padaria Trigo de Ouro - Vespasiano', contato: 'Nilton', telefone: '(31) 3621-8899', cidade: 'Vespasiano', estado: 'MG', bairro: 'Centro', vendedor: 'Edinei', clientType: 'revenda', status: 'ativo', dataUltimaCompra: '2026-02-08', diasSemComprar: 18, totalCompras: 28, valorTotal: 19600, ticketMedio: 700.00, mediaKg: 22, novDecKg: 120, frequenciaMedia: 10, frequenciaLabel: 'Semanal' },
  { id: '33', nome: 'Restaurante Colonial - Lagoa Santa', contato: 'Eliane', telefone: '(31) 3688-1122', cidade: 'Lagoa Santa', estado: 'MG', bairro: 'Centro', vendedor: 'Edinei', clientType: 'consumo', status: 'ativo', dataUltimaCompra: '2026-01-20', diasSemComprar: 37, totalCompras: 15, valorTotal: 11200, ticketMedio: 746.67, mediaKg: 16, novDecKg: 85, frequenciaMedia: 21, frequenciaLabel: 'Quinzenal' },
  { id: '34', nome: 'Padaria Vitória - Sete Lagoas', contato: 'Paulo', telefone: '(31) 3771-4455', cidade: 'Sete Lagoas', estado: 'MG', bairro: 'Centro', vendedor: 'Raiane', clientType: 'revenda', status: 'ativo', dataUltimaCompra: '2026-02-24', diasSemComprar: 2, totalCompras: 38, valorTotal: 32000, ticketMedio: 842.11, mediaKg: 30, novDecKg: 175, frequenciaMedia: 7, frequenciaLabel: 'Semanal' },
  { id: '35', nome: 'Lanchonete Delícia - Pedro Leopoldo', contato: 'Carla', telefone: '(31) 3661-2233', cidade: 'Pedro Leopoldo', estado: 'MG', bairro: 'Centro', vendedor: 'Raiane', clientType: 'consumo', status: 'ativo', dataUltimaCompra: '2026-02-19', diasSemComprar: 7, totalCompras: 20, valorTotal: 12800, ticketMedio: 640.00, mediaKg: 15, novDecKg: 80, frequenciaMedia: 12, frequenciaLabel: 'Quinzenal' },
  { id: '36', nome: 'Cafeteria Ponto do Café - Sabará', contato: 'Fátima', telefone: '(31) 3671-3344', cidade: 'Sabará', estado: 'MG', bairro: 'Centro', vendedor: 'Raiane', clientType: 'consumo', status: 'ativo', dataUltimaCompra: '2026-02-12', diasSemComprar: 14, totalCompras: 16, valorTotal: 8500, ticketMedio: 531.25, mediaKg: 12, novDecKg: 60, frequenciaMedia: 15, frequenciaLabel: 'Quinzenal' },
  { id: '37', nome: 'Mercado Central - Nova Lima', contato: 'André', telefone: '(31) 3581-5566', cidade: 'Nova Lima', estado: 'MG', bairro: 'Centro', vendedor: 'Haroldo Henrique', clientType: 'revenda', status: 'ativo', dataUltimaCompra: '2026-02-05', diasSemComprar: 21, totalCompras: 20, valorTotal: 15600, ticketMedio: 780.00, mediaKg: 18, novDecKg: 100, frequenciaMedia: 14, frequenciaLabel: 'Quinzenal' },
  { id: '39', nome: 'Padaria Sol Nascente - Divinópolis', contato: 'Luciana', telefone: '(37) 3221-4455', cidade: 'Divinópolis', estado: 'MG', bairro: 'Centro', vendedor: 'Jorge', clientType: 'revenda', status: 'ativo', dataUltimaCompra: '2026-02-21', diasSemComprar: 5, totalCompras: 32, valorTotal: 26000, ticketMedio: 812.50, mediaKg: 25, novDecKg: 145, frequenciaMedia: 8, frequenciaLabel: 'Semanal' },
  { id: '40', nome: 'Lanchonete Tropical - Itaúna', contato: 'Celso', telefone: '(37) 3241-6677', cidade: 'Itaúna', estado: 'MG', bairro: 'Centro', vendedor: 'Jorge', clientType: 'consumo', status: 'ativo', dataUltimaCompra: '2026-02-16', diasSemComprar: 10, totalCompras: 20, valorTotal: 13500, ticketMedio: 675.00, mediaKg: 16, novDecKg: 90, frequenciaMedia: 12, frequenciaLabel: 'Quinzenal' },
  { id: '41', nome: 'Cafeteria Grão Dourado - Pará de Minas', contato: 'Marta', telefone: '(37) 3231-8899', cidade: 'Pará de Minas', estado: 'MG', bairro: 'Centro', vendedor: 'Jorge', clientType: 'consumo', status: 'ativo', dataUltimaCompra: '2026-02-08', diasSemComprar: 18, totalCompras: 15, valorTotal: 8200, ticketMedio: 546.67, mediaKg: 12, novDecKg: 65, frequenciaMedia: 18, frequenciaLabel: 'Quinzenal' },
  { id: '42', nome: 'Supermercado Mineirão - Sete Lagoas', contato: 'Geraldo', telefone: '(31) 3773-1122', cidade: 'Sete Lagoas', estado: 'MG', bairro: 'Centro', vendedor: 'Lúcio', clientType: 'revenda', status: 'ativo', dataUltimaCompra: '2026-02-23', diasSemComprar: 3, totalCompras: 40, valorTotal: 35000, ticketMedio: 875.00, mediaKg: 32, novDecKg: 185, frequenciaMedia: 7, frequenciaLabel: 'Semanal' },
  { id: '43', nome: 'Padaria Bom Pão - Curvelo', contato: 'Valdir', telefone: '(38) 3721-3344', cidade: 'Curvelo', estado: 'MG', bairro: 'Centro', vendedor: 'Lúcio', clientType: 'revenda', status: 'ativo', dataUltimaCompra: '2026-02-17', diasSemComprar: 9, totalCompras: 28, valorTotal: 21000, ticketMedio: 750.00, mediaKg: 24, novDecKg: 135, frequenciaMedia: 10, frequenciaLabel: 'Semanal' },
  { id: '44', nome: 'Lanchonete Estrela - Corinto', contato: 'Ivone', telefone: '(38) 3751-5566', cidade: 'Corinto', estado: 'MG', bairro: 'Centro', vendedor: 'Lúcio', clientType: 'consumo', status: 'ativo', dataUltimaCompra: '2026-02-05', diasSemComprar: 21, totalCompras: 18, valorTotal: 10500, ticketMedio: 583.33, mediaKg: 14, novDecKg: 70, frequenciaMedia: 15, frequenciaLabel: 'Quinzenal' },
  { id: '45', nome: 'Padaria Pão & Cia - Montes Claros', contato: 'Rodrigo', telefone: '(38) 3221-7788', cidade: 'Montes Claros', estado: 'MG', bairro: 'Centro', vendedor: 'Fábio', clientType: 'revenda', status: 'ativo', dataUltimaCompra: '2026-02-22', diasSemComprar: 4, totalCompras: 35, valorTotal: 30000, ticketMedio: 857.14, mediaKg: 28, novDecKg: 165, frequenciaMedia: 8, frequenciaLabel: 'Semanal' },
  { id: '46', nome: 'Cafeteria Aroma - Governador Valadares', contato: 'Denise', telefone: '(33) 3271-1122', cidade: 'Governador Valadares', estado: 'MG', bairro: 'Centro', vendedor: 'Fábio', clientType: 'consumo', status: 'ativo', dataUltimaCompra: '2026-02-13', diasSemComprar: 13, totalCompras: 22, valorTotal: 15800, ticketMedio: 718.18, mediaKg: 18, novDecKg: 100, frequenciaMedia: 12, frequenciaLabel: 'Quinzenal' },
  { id: '47', nome: 'Lanchonete Sabor Mineiro - Ipatinga', contato: 'Marcos', telefone: '(31) 3821-3344', cidade: 'Ipatinga', estado: 'MG', bairro: 'Centro', vendedor: 'Fábio', clientType: 'consumo', status: 'ativo', dataUltimaCompra: '2026-01-30', diasSemComprar: 27, totalCompras: 14, valorTotal: 9200, ticketMedio: 657.14, mediaKg: 13, novDecKg: 68, frequenciaMedia: 18, frequenciaLabel: 'Quinzenal' },
  { id: '48', nome: 'Padaria Delícia Real - BH Centro', contato: 'Aparecida', telefone: '(31) 3222-5566', cidade: 'BH', estado: 'MG', bairro: 'Centro', vendedor: 'Ti Delso', clientType: 'revenda', status: 'ativo', dataUltimaCompra: '2026-02-24', diasSemComprar: 2, totalCompras: 50, valorTotal: 48000, ticketMedio: 960.00, mediaKg: 38, novDecKg: 220, frequenciaMedia: 6, frequenciaLabel: 'Semanal' },
  { id: '49', nome: 'Restaurante Sabor Caseiro - Funcionários', contato: 'Lúcia', telefone: '(31) 3261-7788', cidade: 'BH', estado: 'MG', bairro: 'Funcionários', vendedor: 'Ti Delso', clientType: 'consumo', status: 'ativo', dataUltimaCompra: '2026-02-20', diasSemComprar: 6, totalCompras: 35, valorTotal: 28500, ticketMedio: 814.29, mediaKg: 25, novDecKg: 140, frequenciaMedia: 8, frequenciaLabel: 'Semanal' },
];

export const sampleSellers: Seller[] = [
  { id: '1', nome: 'Juliano', clientesAtivos: 12, clientesNovos: 1, clientesPerdidos: 2, volumeVendido: 15474, valorVendido: 245000, ticketMedio: 890 },
  { id: '2', nome: 'Ti Delso', clientesAtivos: 15, clientesNovos: 0, clientesPerdidos: 1, volumeVendido: 17158, valorVendido: 310000, ticketMedio: 750 },
  { id: '3', nome: 'João Paulo', clientesAtivos: 4, clientesNovos: 0, clientesPerdidos: 0, volumeVendido: 5200, valorVendido: 85000, ticketMedio: 1200 },
  { id: '4', nome: 'Haroldo Henrique', clientesAtivos: 5, clientesNovos: 0, clientesPerdidos: 0, volumeVendido: 10400, valorVendido: 104100, ticketMedio: 740 },
  { id: '5', nome: 'Edinei', clientesAtivos: 6, clientesNovos: 0, clientesPerdidos: 1, volumeVendido: 9200, valorVendido: 90100, ticketMedio: 700 },
  { id: '6', nome: 'Raiane', clientesAtivos: 3, clientesNovos: 0, clientesPerdidos: 0, volumeVendido: 5700, valorVendido: 53300, ticketMedio: 670 },
  { id: '7', nome: 'Jorge', clientesAtivos: 3, clientesNovos: 0, clientesPerdidos: 0, volumeVendido: 5300, valorVendido: 47700, ticketMedio: 680 },
  { id: '8', nome: 'Lúcio', clientesAtivos: 3, clientesNovos: 0, clientesPerdidos: 0, volumeVendido: 7000, valorVendido: 66500, ticketMedio: 736 },
  { id: '9', nome: 'Fábio', clientesAtivos: 3, clientesNovos: 0, clientesPerdidos: 0, volumeVendido: 5900, valorVendido: 55000, ticketMedio: 744 },
  { id: '10', nome: 'Ednei', clientesAtivos: 2, clientesNovos: 0, clientesPerdidos: 1, volumeVendido: 2100, valorVendido: 28000, ticketMedio: 560 },
];

export const sampleProducts: Product[] = [
  { id: '1', nome: 'Pão de Queijo Tradicional Ti Delso 1kg', volumeTotal: 38356, valorTotal: 620000, ticketMedio: 16.17, variacao: 5.2 },
  { id: '2', nome: 'Pão de Queijo Super Lanche Ti Delso 1kg', volumeTotal: 90029, valorTotal: 1450000, ticketMedio: 16.11, variacao: 12.8 },
  { id: '3', nome: 'Pão de Queijo Tradicional Vó Lozinha 1kg', volumeTotal: 67722, valorTotal: 850000, ticketMedio: 12.55, variacao: -3.2 },
  { id: '4', nome: 'Pão de Queijo Tradicional Requeijão 1kg', volumeTotal: 29157, valorTotal: 580000, ticketMedio: 19.90, variacao: 8.5 },
  { id: '5', nome: 'Biscoito de Queijo Palito Ti Delso 1kg', volumeTotal: 22157, valorTotal: 370000, ticketMedio: 16.70, variacao: -1.4 },
  { id: '6', nome: 'Pão de Queijo Big Lanche Ti Delso 1kg', volumeTotal: 14617, valorTotal: 245000, ticketMedio: 16.76, variacao: 15.3 },
  { id: '7', nome: 'Pão de Queijo Coquetel Ti Delso 1kg', volumeTotal: 12351, valorTotal: 210000, ticketMedio: 17.00, variacao: -5.8 },
  { id: '8', nome: 'Pão de Queijo Tradicional Frango 1kg', volumeTotal: 11777, valorTotal: 235000, ticketMedio: 19.95, variacao: 2.1 },
  { id: '9', nome: 'Pão de Queijo Lanche Requeijão 1kg', volumeTotal: 9001, valorTotal: 195000, ticketMedio: 21.66, variacao: 7.9 },
  { id: '10', nome: 'Pão de Queijo Premium Empanado Frango 1kg', volumeTotal: 5558, valorTotal: 145000, ticketMedio: 26.09, variacao: 22.4 },
];

export const sampleProspects: Prospect[] = [
  { id: '1', empresa: 'Cafeteria Blue Coffee', contato: 'Fernando', telefone: '(31) 3665-0551', cidade: 'BH', bairro: 'Castelo', endereco: 'Av. Presidente Tancredo Neves, 2313', demanda: '30kg/semana', concorrente: 'Forno de Minas', valorConcorrente: 14.50, produtosInteresse: ['p-3', 'p-4'], etapa: 'qualificado', observacoes: 'Sear pela manhã', createdAt: '2026-01-15' },
  { id: '2', empresa: 'Droga Hum', contato: 'Amanda', telefone: '', cidade: 'BH', bairro: 'Prado', endereco: 'R. Turquesa, 653', demanda: '15kg/semana', concorrente: '', produtosInteresse: ['p-1', 'p-5'], etapa: 'lead_novo', createdAt: '2026-02-10' },
  { id: '3', empresa: 'Empório Nacional BH', contato: '', telefone: '(31) 3024-8833', cidade: 'BH', bairro: 'Gutierrez', endereco: 'Av. Francisco Sá, 1267', demanda: '20kg/semana', concorrente: 'Artesanal local', valorConcorrente: 18.00, produtosInteresse: ['p-15', 'p-8'], etapa: 'amostra_entregue', createdAt: '2026-01-20' },
  { id: '4', empresa: 'Padaria Forneria Gutierrez', contato: '', telefone: '', cidade: 'BH', bairro: 'Gutierrez', endereco: 'Av. Francisco Sá, 1468', demanda: '25kg/semana', produtosInteresse: ['p-2', 'p-3'], etapa: 'pre_qualificado', createdAt: '2026-02-05' },
  { id: '5', empresa: 'Restaurante Xapuri', contato: '', telefone: '', cidade: 'BH', bairro: 'Pampulha', endereco: 'Rua Mandacarú, 260', demanda: '40kg/semana', concorrente: 'Produção própria', produtosInteresse: ['p-1', 'p-2'], etapa: 'negociacao', observacoes: 'Cliente tem produção própria, avaliar preço competitivo', createdAt: '2026-01-10' },
  { id: '6', empresa: 'Padaria Pão do Padre - Lourdes', contato: 'Gilmar', telefone: '(31) 3337-8446', cidade: 'BH', bairro: 'Lourdes', endereco: 'Rua Curitiba, 1701', demanda: '50kg/semana', concorrente: 'Forno de Minas', valorConcorrente: 13.80, produtosInteresse: ['p-3', 'p-14', 'p-4'], etapa: 'amostra_entregue', createdAt: '2025-12-15' },
];

export const sampleVisits: Visit[] = [
  { id: '1', cliente: 'Cafeteria Blue Coffee', vendedor: 'Juliano', endereco: 'Av. Presidente Tancredo Neves, 2313', bairro: 'Castelo', cidade: 'BH', diaSemana: 'Sexta', contato: '(31) 3665-0551', observacoes: 'Sear pela manhã', status: 'agendado', amostraEntregue: false },
  { id: '2', cliente: 'Cafeteria Borora', vendedor: 'Juliano', endereco: 'Rua Paraiba, 1023', bairro: 'Savassi', cidade: 'BH', diaSemana: 'Terça', contato: '(31) 99552-1023', status: 'agendado', amostraEntregue: false },
  { id: '3', cliente: 'Droga Hum', vendedor: 'Juliano', endereco: 'R. Turquesa, 653', bairro: 'Prado', cidade: 'BH', diaSemana: 'Quarta', contato: 'Amanda', status: 'agendado', amostraEntregue: false },
  { id: '4', cliente: 'Empório Nacional BH', vendedor: 'Victória', endereco: 'Av. Francisco Sá, 1267', bairro: 'Gutierrez', cidade: 'BH', diaSemana: 'Quarta', contato: '(31) 3024-8833', status: 'concluida_sucesso', amostraEntregue: true, data: '2026-02-19' },
  { id: '5', cliente: 'Padaria Forneria Gutierrez', vendedor: 'Juliano', endereco: 'Av. Francisco Sá, 1468', bairro: 'Gutierrez', cidade: 'BH', diaSemana: 'Quarta', status: 'agendado', amostraEntregue: false },
  { id: '6', cliente: 'Padaria Hangar dos Pães', vendedor: 'Juliano', endereco: 'Av. Portugal, 4304', bairro: 'Pampulha', cidade: 'BH', diaSemana: 'Sexta', contato: '3566-7063', status: 'agendado', amostraEntregue: false },
  { id: '7', cliente: 'Padaria Pão do Padre - Lourdes', vendedor: 'Juliano', endereco: 'Rua Curitiba, 1701', bairro: 'Lourdes', cidade: 'BH', diaSemana: 'Terça', contato: 'Gilmar - 3337-8446', status: 'concluida_sucesso', amostraEntregue: true, data: '2026-02-18' },
  { id: '8', cliente: 'Restaurante Xapuri', vendedor: 'Juliano', endereco: 'Rua Mandacarú, 260', bairro: 'Pampulha', cidade: 'BH', diaSemana: 'Sexta', status: 'concluida_sem_sucesso', amostraEntregue: false, motivoInsucesso: 'Cliente tem produção própria e não quis receber amostra no momento', data: '2026-02-14' },
  { id: '9', cliente: 'Padaria Bonissima - Afonso Pena', vendedor: 'Juliano', endereco: 'Av. Afonso Pena, 4270', bairro: 'Mangabeiras', cidade: 'BH', diaSemana: 'Terça', contato: 'Leo - 99910-2080', status: 'agendado', amostraEntregue: false },
  { id: '10', cliente: 'Padaria Doçura Estoril', vendedor: 'Juliano', endereco: 'Rua Ursula Paulino, 946', bairro: 'Estoril', cidade: 'BH', diaSemana: 'Segunda', status: 'agendado', amostraEntregue: false },
];

export const sampleDashboardMetrics: DashboardMetrics = {
  totalClientesAtivos: 18,
  totalClientesNovos: 2,
  totalClientesPerdidos: 3,
  totalClientesInativos: 2,
  faturamentoMensal: 542453,
  crescimentoMensal: 8.5,
  crescimentoAnual: 12.3,
  ticketMedioGeral: 785.50,
};

export const monthlyRevenue = [
  { mes: 'Mar/24', valor: 11162, faturamento: 178592 },
  { mes: 'Abr/24', valor: 12064, faturamento: 193024 },
  { mes: 'Mai/24', valor: 12977, faturamento: 207632 },
  { mes: 'Jun/24', valor: 12437, faturamento: 198992 },
  { mes: 'Jul/24', valor: 12875, faturamento: 206000 },
  { mes: 'Ago/24', valor: 12869, faturamento: 205904 },
  { mes: 'Set/24', valor: 15386, faturamento: 246176 },
  { mes: 'Out/24', valor: 14668, faturamento: 234688 },
  { mes: 'Nov/24', valor: 14824, faturamento: 237184 },
  { mes: 'Dez/24', valor: 11885, faturamento: 190160 },
  { mes: 'Jan/25', valor: 13015, faturamento: 208240 },
  { mes: 'Fev/25', valor: 14000, faturamento: 224000 },
  { mes: 'Mar/25', valor: 14590, faturamento: 233440 },
  { mes: 'Abr/25', valor: 15474, faturamento: 247584 },
  { mes: 'Mai/25', valor: 16250, faturamento: 260000 },
  { mes: 'Jun/25', valor: 14398, faturamento: 230368 },
  { mes: 'Jul/25', valor: 17158, faturamento: 274528 },
  { mes: 'Ago/25', valor: 14973, faturamento: 239568 },
  { mes: 'Set/25', valor: 17546, faturamento: 280736 },
  { mes: 'Out/25', valor: 15858, faturamento: 253728 },
  { mes: 'Nov/25', valor: 13946, faturamento: 223136 },
  { mes: 'Dez/25', valor: 15005, faturamento: 240080 },
  { mes: 'Jan/26', valor: 12340, faturamento: 197440 },
];
