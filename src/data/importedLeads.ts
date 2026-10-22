// Leads imported from "Agenda de Visitas - Juliano" spreadsheet (v3)
// Status mapping:
//   Agendado/Visita → AGUARDANDO_AGENDAMENTO
//   Negociando → VISITA_AGENDADA (Visitas Realizadas)
//   Concretizado → NEGOCIACAO_CONCRETIZADA
//   Encerrado → NEGOCIACAO_ENCERRADA
//   Rotina → AGUARDANDO_AGENDAMENTO

import { Lead, PipelineStatus } from '@/types/crm';
import { matchBairroRegional } from '@/lib/bairroNormalization';

type Situacao = 'Agendado' | 'Visita' | 'Negociando' | 'Concretizado' | 'Encerrado' | 'Rotina';

interface RawLead {
  nome: string;
  vendedor: string;
  endereco?: string;
  bairro?: string;
  cidade?: string;
  horario?: string;
  contato?: string;
  observacao?: string;
  dia_semana?: string;
  situacao: Situacao;
}

function mapSituacaoToPipeline(s: Situacao): PipelineStatus {
  switch (s) {
    case 'Agendado':
    case 'Visita':
    case 'Rotina':
      return 'AGUARDANDO_AGENDAMENTO';
    case 'Negociando':
      return 'VISITA_AGENDADA';
    case 'Concretizado':
      return 'NEGOCIACAO_CONCRETIZADA';
    case 'Encerrado':
      return 'NEGOCIACAO_ENCERRADA';
  }
}

const RAW_LEADS: RawLead[] = [
  // === AGENDADO ===
  { nome: 'Coelho Conveniência (BR Mania) - Antonio Carlos', vendedor: 'Juliano', endereco: 'Av. Pres. Antônio Carlos, 3572', bairro: 'Cachoeirinha', cidade: 'BH', dia_semana: 'Sexta', situacao: 'Agendado' },
  { nome: 'Breik Breik - Afonso Pena', vendedor: 'Juliano', bairro: 'Anchieta', cidade: 'BH', dia_semana: 'Terça', situacao: 'Agendado' },
  { nome: 'Café Bahia', vendedor: 'Juliano', endereco: 'Rua Tupis, 369', bairro: 'Centro', cidade: 'BH', contato: '3274-4530', dia_semana: 'Quinta', situacao: 'Agendado' },
  { nome: 'Cafeteria Blue Coffee', vendedor: 'Juliano', endereco: 'Av. Presidente Tancredo Neves, 2313', bairro: 'Castelo', cidade: 'BH', contato: '(31) 3665-0551', observacao: 'Sear (manhã)', dia_semana: 'Sexta', situacao: 'Agendado' },
  { nome: 'Cafeteria Borora', vendedor: 'Juliano', endereco: 'Rua Paraiba, 1023', bairro: 'Savassi', cidade: 'BH', contato: '(31) 99552-1023', dia_semana: 'Terça', situacao: 'Agendado' },
  { nome: 'Cafeteria The Rocks Café', vendedor: 'Victória', endereco: 'Rua Boaventura, 1167', bairro: 'Liberdade', cidade: 'BH', contato: '(31) 97238-8455', dia_semana: 'Sexta', situacao: 'Agendado' },
  { nome: 'Clube Celp', vendedor: 'Juliano', endereco: 'R. Monte Cassino, 600', bairro: 'Pampulha', cidade: 'BH', dia_semana: 'Sexta', situacao: 'Agendado' },
  { nome: 'Coleguium Buritis', vendedor: 'Juliano', endereco: 'Rua Paulo Piedade Campos, 340', bairro: 'Buritis', cidade: 'BH', dia_semana: 'Segunda', situacao: 'Agendado' },
  { nome: 'Droga Hum', vendedor: 'Juliano', endereco: 'R. Turquesa, 653', bairro: 'Prado', cidade: 'BH', contato: 'Amanda', dia_semana: 'Quarta', situacao: 'Agendado' },
  { nome: 'Emporio Nacional BH', vendedor: 'Victória', endereco: 'Av. Francisco Sá, 1267', bairro: 'Gutierrez', cidade: 'BH', contato: '(31) 3024-8833', dia_semana: 'Quarta', situacao: 'Agendado' },
  { nome: 'Indicação Liberty', vendedor: 'Juliano', cidade: 'BH', situacao: 'Agendado' },
  { nome: 'Lanchonete Biscoitim', vendedor: 'Juliano', endereco: 'Rua Goias, 341', bairro: 'Centro', cidade: 'BH', dia_semana: 'Quinta', situacao: 'Agendado' },
  { nome: 'Lanchonete Bolha\'s Burguer (Jaraguá)', vendedor: 'Victória', endereco: 'Av. Izabel Bueno, 668', bairro: 'Jaraguá', cidade: 'BH', dia_semana: 'Sexta', situacao: 'Agendado' },
  { nome: 'Lanchonete Cantina Alegria', vendedor: 'Juliano', endereco: 'Rua da Bahia', bairro: 'Centro', cidade: 'BH', dia_semana: 'Quinta', situacao: 'Agendado' },
  { nome: 'Lanchonete da Praça de Serviços da UFMG', vendedor: 'Victória', bairro: 'Pampulha', cidade: 'BH', contato: '3495-9660', dia_semana: 'Sexta', situacao: 'Agendado' },
  { nome: 'Lanchonete Estação da Cerveja - Mercado Novo', vendedor: 'Juliano', endereco: 'Rua Rio Grande do Sul, 505', bairro: 'Centro', cidade: 'BH', dia_semana: 'Quinta', situacao: 'Agendado' },
  { nome: 'Lanchonete Menina da empada', vendedor: 'Bruno', endereco: 'Rua Guaicuí, 126', bairro: 'Cidade Jardim', cidade: 'BH', contato: '975731534', dia_semana: 'Terça', situacao: 'Agendado' },
  { nome: 'Padaria e Confeitaria Le Doceria', vendedor: 'Victória', endereco: 'Rua Boaventura, 1524 – Loja 02', bairro: 'Jaraguá', cidade: 'BH', dia_semana: 'Sexta', situacao: 'Agendado' },
  { nome: 'Padaria Bonissima - Afonso Pena', vendedor: 'Juliano', endereco: 'Av. Afonso Pena, 4270', bairro: 'Mangabeiras', cidade: 'BH', contato: '99910-2080', observacao: 'Leo', dia_semana: 'Terça', situacao: 'Agendado' },
  { nome: 'Padaria Bread Baker', vendedor: 'Bruno', endereco: 'Rua Paulo Piedade campos, 131', bairro: 'Estoril', cidade: 'BH', contato: '991073108', dia_semana: 'Segunda', situacao: 'Agendado' },
  { nome: 'Padaria Doçura Estoril', vendedor: 'Juliano', endereco: 'Rua Ursula Paulino, 946', bairro: 'Estoril', cidade: 'BH', dia_semana: 'Segunda', situacao: 'Agendado' },
  { nome: 'Padaria Dona Clara', vendedor: 'Victória', endereco: 'Rua Bolívar Mineiro, 430', bairro: 'Dona Clara', cidade: 'BH', dia_semana: 'Sexta', situacao: 'Agendado' },
  { nome: 'Padaria Express Estoril', vendedor: 'Juliano', endereco: 'R. Maria Beatriz, 744 - Havaí', bairro: 'Estoril', cidade: 'BH', dia_semana: 'Segunda', situacao: 'Agendado' },
  { nome: 'Padaria Forneria Gutierrez', vendedor: 'Juliano', endereco: 'Av. Francisco Sá, 1468', bairro: 'Gutierrez', cidade: 'BH', dia_semana: 'Quarta', situacao: 'Agendado' },
  { nome: 'Padaria Hangar dos Pães', vendedor: 'Juliano', endereco: 'Av. Portugal, 4304', bairro: 'Pampulha', cidade: 'BH', contato: '3566-7063', dia_semana: 'Sexta', situacao: 'Agendado' },
  { nome: 'Padaria Jaraguá', vendedor: 'Victória', endereco: 'Rua Boaventura, 1682, LOJA: 05', bairro: 'Jaraguá', cidade: 'BH', dia_semana: 'Sexta', situacao: 'Agendado' },
  { nome: 'Padaria Liberdade', vendedor: 'Victória', endereco: 'Rua Liberdade, 125', bairro: 'Barreiro', cidade: 'BH', dia_semana: 'Segunda', situacao: 'Agendado' },
  { nome: 'Padaria Maffile - Jaraguá', vendedor: 'Victória', endereco: 'Rua Izabel Bueno, 943', bairro: 'Jaraguá', cidade: 'BH', contato: 'Luis', dia_semana: 'Sexta', situacao: 'Agendado' },
  { nome: 'Padaria Monteiro', vendedor: 'Juliano', endereco: 'Rua São Lucas, 413', bairro: 'Sagrada Familia', cidade: 'BH', dia_semana: 'Quinta', situacao: 'Agendado' },
  { nome: 'Padaria Napoli Estoril', vendedor: 'Juliano', endereco: 'R. Maria Beatriz, 215 - Havaí', bairro: 'Estoril', cidade: 'BH', dia_semana: 'Segunda', situacao: 'Agendado' },
  { nome: 'Padaria Pães e Energia', vendedor: 'Victória', endereco: 'R. Min. Orozimbo Nonato, 1029', bairro: 'Dona Clara', cidade: 'BH', contato: '3134978580', dia_semana: 'Sexta', situacao: 'Agendado' },
  { nome: 'Padaria Pandeli', vendedor: 'Juliano', endereco: 'R. Paulo Piedade Campos, 405', bairro: 'Estoril', cidade: 'BH', dia_semana: 'Segunda', situacao: 'Agendado' },
  { nome: 'Padaria Pandepi', vendedor: 'Juliano', endereco: 'Rua Maria Heilbuth Surette, 207', bairro: 'Buritis', cidade: 'BH', contato: '99799-1243', observacao: 'Clemilda', dia_semana: 'Segunda', situacao: 'Agendado' },
  { nome: 'Padaria Pão do Padre - Funcionários', vendedor: 'Juliano', endereco: 'R. Alagoas, 750', bairro: 'Funcionários', contato: 'Sandro', dia_semana: 'Terça', situacao: 'Agendado' },
  { nome: 'Padaria Pão do Padre - Lourdes', vendedor: 'Juliano', endereco: 'Rua Curitiba, 1701', bairro: 'Lourdes', cidade: 'BH', contato: '3337-8446', observacao: 'Gilmar', dia_semana: 'Terça', situacao: 'Agendado' },
  { nome: 'Padaria Pão e Vida', vendedor: 'Victória', endereco: 'Rua João de Paula, 259', bairro: 'Sagrada Familia', cidade: 'BH', contato: '9 9071-1033', dia_semana: 'Quinta', situacao: 'Agendado' },
  { nome: 'Padaria Pão Santo', vendedor: 'Victória', endereco: 'Rua Espírito Santo, 1676', bairro: 'Lourdes', cidade: 'BH', contato: '3132249071', dia_semana: 'Terça', situacao: 'Agendado' },
  { nome: 'Padaria Ping Pão - Dona Clara', vendedor: 'Victória', endereco: 'Rua Desembargador Afonso Lages, 430', bairro: 'Dona Clara', cidade: 'BH', contato: 'Fernanda', dia_semana: 'Sexta', situacao: 'Agendado' },
  { nome: 'Padaria Trigo de Ouro', vendedor: 'Victória', endereco: 'Rua Pitt 255', bairro: 'União', cidade: 'BH', contato: '3134866144', dia_semana: 'Sexta', situacao: 'Agendado' },
  { nome: 'Padaria Trigolandia', vendedor: 'Victória', endereco: 'Rua Furtado De Menezes, Nº 280', bairro: 'Pampulha', cidade: 'BH', dia_semana: 'Sexta', situacao: 'Agendado' },
  { nome: 'Padaria Tudipão', vendedor: 'Victória', endereco: 'Rua José de Alencar, 452', bairro: 'Calafate', cidade: 'BH', contato: '3133349725', dia_semana: 'Quarta', situacao: 'Agendado' },
  { nome: 'Padaria Veneza', vendedor: 'Victória', endereco: 'Av. Silva Lobo, 534', bairro: 'Calafate', cidade: 'BH', contato: '3133713131', dia_semana: 'Quarta', situacao: 'Agendado' },
  { nome: 'Padaria Victoria - Nova Floresta', vendedor: 'Juliano', endereco: 'Rua Macaé, 291', bairro: 'Nova Floresta', cidade: 'BH', dia_semana: 'Sexta', situacao: 'Agendado' },
  { nome: 'Pastel Bahia', vendedor: 'Juliano', endereco: 'Rua da Bahia, 1152', bairro: 'Centro', cidade: 'BH', dia_semana: 'Quinta', situacao: 'Agendado' },
  { nome: 'Posto Estoril', vendedor: 'Juliano', endereco: 'Av. Professor Mario Werneck, 1910', bairro: 'Buritis', cidade: 'BH', contato: '97175-7604', observacao: 'Claudia', dia_semana: 'Segunda', situacao: 'Agendado' },
  { nome: 'Posto Petrobras - Prudente', vendedor: 'Victória', endereco: 'Av. Prudente de Morais, 303', bairro: 'Santo Antônio', cidade: 'BH', contato: '3132964844', dia_semana: 'Terça', situacao: 'Agendado' },
  { nome: 'Restaurante Xapuri', vendedor: 'Juliano', endereco: 'Rua Mandacarú, 260', bairro: 'Pampulha', cidade: 'BH', dia_semana: 'Sexta', situacao: 'Agendado' },
  { nome: 'Sterna Café', vendedor: 'Juliano', endereco: 'Rua Desembargador Edesio Fernandes, 144', bairro: 'Estoril', cidade: 'BH', dia_semana: 'Segunda', situacao: 'Agendado' },
  { nome: 'Padaria Napolitano', vendedor: 'Juliano', endereco: 'Rua dos Inconfidentes, 937', bairro: 'Savassi', dia_semana: 'Terça', situacao: 'Agendado' },
  { nome: 'Cafeteria Life Café (Life Center)', vendedor: 'Raiane', endereco: 'Avenida do Contorno, 4747', bairro: 'Funcionários', cidade: 'BH', dia_semana: 'Terça', situacao: 'Agendado' },
  { nome: 'Lanchonete Leo Lanches', vendedor: 'Raiane', endereco: 'Av. Guarapari, 699', bairro: 'Santa Amelia', cidade: 'BH', dia_semana: 'Sexta', situacao: 'Agendado' },
  { nome: 'Lanchonete Campos Michel', vendedor: 'Raiane', endereco: 'Av. do Contorno, 6586', bairro: 'Savassi', cidade: 'BH', dia_semana: 'Terça', situacao: 'Agendado' },
  { nome: 'Padaria Trigo Real', vendedor: 'Raiane', endereco: 'Rua Hebert de Souza, 275', bairro: 'Pampulha', cidade: 'BH', dia_semana: 'Sexta', situacao: 'Agendado' },
  { nome: 'Padaria Pao Pao', vendedor: 'Raiane', endereco: 'Rua Cristalina, 129', bairro: 'Pampulha', cidade: 'BH', dia_semana: 'Sexta', situacao: 'Agendado' },

  // === ENCERRADO ===
  { nome: 'Livraria Bikas', vendedor: 'Juliano', endereco: 'Rua Lavras, 188', bairro: 'São Pedro', situacao: 'Encerrado' },
  { nome: 'Buffet Fora do Comum', vendedor: 'Juliano', endereco: 'Rua Bernardino de Lima, 373', bairro: 'Gutierrez', cidade: 'BH', situacao: 'Encerrado' },
  { nome: 'Café Nice', vendedor: 'Juliano', endereco: 'Avenida Afonso Pena, 727', bairro: 'Centro', cidade: 'BH', contato: '3222-6924', situacao: 'Encerrado' },
  { nome: 'Cafeteria Ah!Bom - Shopping Diamond', vendedor: 'Juliano', endereco: 'Av. Olegário Maciel, 1600', bairro: 'Lourdes', cidade: 'BH', situacao: 'Encerrado' },
  { nome: 'Cafeteria Trigais', vendedor: 'Victória', endereco: 'Rua Rio de Janeiro, 2221', bairro: 'Lourdes', cidade: 'BH', contato: '(31) 292-6099', situacao: 'Encerrado' },
  { nome: 'Lanchonete Araguari Lanches', vendedor: 'Juliano', endereco: 'R. Araguari, 686', bairro: 'Barro Preto', cidade: 'BH', situacao: 'Encerrado' },
  { nome: 'Lanchonete e Sorveteria do Flavio', vendedor: 'Victória', endereco: 'R. Oeste, 618', bairro: 'Calafate', cidade: 'BH', contato: '3130195065', dia_semana: 'Quarta', situacao: 'Encerrado' },
  { nome: 'Padaria Diamantina\'s - Colégio batista', vendedor: 'Victória', endereco: 'Rua galena, 29', bairro: 'Colegio Batista', cidade: 'BH', contato: '31996529004', dia_semana: 'Sexta', situacao: 'Encerrado' },
  { nome: 'Padaria Ferrero', vendedor: 'Victória', endereco: 'R. Platina, 1375', bairro: 'Calafate', cidade: 'BH', contato: '31999591640', dia_semana: 'Quarta', situacao: 'Encerrado' },
  { nome: 'Padaria Sabor de Pão - Calafate', vendedor: 'Victória', endereco: 'Rua Alterosa, 121', bairro: 'Calafate', cidade: 'BH', contato: '3133712987', dia_semana: 'Quarta', situacao: 'Encerrado' },
  { nome: 'Cafeteria Boca de Pito', vendedor: 'Victória', endereco: 'Rua Alagoas, 1314 – Lj. 29B – Shopping 5ª Avenida', bairro: 'Savassi', cidade: 'BH', contato: '(31) 3281-0105', situacao: 'Encerrado' },
  { nome: 'Cafeteria Grão e Graça', vendedor: 'Juliano', endereco: 'Av. Alvares Cabral, 842', bairro: 'Lourdes', cidade: 'BH', situacao: 'Encerrado' },
  { nome: 'Lanchonete Açaí Savassi Bom Gosto', vendedor: 'Juliano', endereco: 'R. Tomé de Souza, 955', bairro: 'Savassi', cidade: 'BH', situacao: 'Encerrado' },
  { nome: 'Colegio Maximus / Copam', vendedor: 'Victória', endereco: 'Rua Garuma, 565', bairro: 'Jaraguá', cidade: 'BH', situacao: 'Encerrado' },
  { nome: 'Padaria La Panetteria', vendedor: 'Victória', bairro: 'Fernao Dias', cidade: 'BH', situacao: 'Encerrado' },
  { nome: 'Cafeteria Du Pain - Belvedere', vendedor: 'Juliano', endereco: 'R. Jornalista Djalma Andrade, 177', bairro: 'Belvedere', cidade: 'BH', situacao: 'Encerrado' },
  { nome: 'Cafeteria Du Pain - Vila da Serra', vendedor: 'Juliano', endereco: 'Alameda do Ingá, 150', bairro: 'Vila da Serra', cidade: 'BH', situacao: 'Encerrado' },
  { nome: 'Cafeteria Du Pain - Mercado Central', vendedor: 'Juliano', endereco: 'Mercado Central', bairro: 'Centro', cidade: 'BH', situacao: 'Encerrado' },
  { nome: 'Cafeteria Encontro - Shopping Diamond', vendedor: 'Victória', endereco: 'Av. Olegário Maciel, 1600', bairro: 'Lourdes', cidade: 'BH', situacao: 'Encerrado' },
  { nome: 'Cantina Piquinique - Colegio Santa Doroteia', vendedor: 'Juliano', bairro: 'Sion', cidade: 'BH', situacao: 'Encerrado' },
  { nome: 'Padaria Mais Ki Pão - Cidade Jardim', vendedor: 'Juliano', endereco: 'Av. Arthur Bernardes, 470', bairro: 'Cidade Jardim', cidade: 'BH', situacao: 'Encerrado' },
  { nome: 'Lanchonete JC - Barreiro', vendedor: 'Juliano', bairro: 'Barreiro', cidade: 'BH', situacao: 'Encerrado' },
  { nome: 'Lanchonete Boca Plena', vendedor: 'Juliano', cidade: 'Santa Luzia', situacao: 'Encerrado' },
  { nome: 'Lanchonete Saborear - Loja Eletrica (Sion)', vendedor: 'Juliano', endereco: 'Av. Nossa Senhora do Carmo, nº 1202', bairro: 'Sion', cidade: 'BH', situacao: 'Encerrado' },
  { nome: 'Rede Ímpar Hotéis', vendedor: 'Juliano', endereco: 'Rua Campos Sales', bairro: 'Nova Suissa', cidade: 'BH', contato: '(31) 2533-0600', situacao: 'Encerrado' },
  { nome: 'Padaria Trigopan', vendedor: 'Victória', endereco: 'Rua Campos Sales, 382', bairro: 'Calafate', cidade: 'BH', contato: '3133724090', situacao: 'Encerrado' },
  { nome: 'Lanchonete Sabor Especial - Barreiro', vendedor: 'Juliano', endereco: 'Rua Campo Grande, 565', bairro: 'Barreiro', cidade: 'BH', situacao: 'Encerrado' },
  { nome: 'Padaria Sabinão - Cidade Nova', vendedor: 'Juliano', endereco: 'Rua Cardeal Stepinac, 463', bairro: 'Cidade Nova', cidade: 'BH', situacao: 'Encerrado' },
  { nome: 'Café Marcelino - Contagem', vendedor: 'Juliano', endereco: 'Av. Carmelita Drumond Diniz, 564', bairro: 'Maracanã', cidade: 'Contagem', situacao: 'Encerrado' },
  { nome: 'Padaria Millepão - Barreiro', vendedor: 'Juliano', endereco: 'Rua Jericó, 230', bairro: 'Barreiro', cidade: 'BH', situacao: 'Encerrado' },
  { nome: 'Colegio Monte Sião', vendedor: 'Juliano', endereco: 'R. Érico Veríssimo, 1826', bairro: 'Santa Mônica', cidade: 'BH', situacao: 'Encerrado' },
  { nome: 'Cafeteria Slowcoffee', vendedor: 'Juliano', endereco: 'Rua Monteiro Lobato, 351', bairro: 'Ouro Preto', situacao: 'Encerrado' },
  { nome: 'Ímpar Hotéis', vendedor: 'Juliano', endereco: 'R. Campos Sales, 664', bairro: 'Calafate', cidade: 'BH', situacao: 'Encerrado' },
  { nome: 'Armazem Casa e Pet', vendedor: 'Juliano', endereco: 'Av. Terra, 147', bairro: 'Vale do Sol', cidade: 'Nova Lima', situacao: 'Encerrado' },

  // === CONCRETIZADO ===
  { nome: 'Conveniência Flexpoint', vendedor: 'Juliano', endereco: 'MG-030, 1346', bairro: 'Vila da Serra', situacao: 'Concretizado' },
  { nome: 'Lanchonete JM - Estoril (IM)', vendedor: 'Juliano', endereco: 'Avenida Professor Mário Werneck, 1685', bairro: 'Estoril', cidade: 'BH', situacao: 'Concretizado' },
  { nome: 'Mercearia Guedes', vendedor: 'Juliano', endereco: 'Rua Álvares de Azevedo, 332', bairro: 'Colegio Batista', cidade: 'BH', situacao: 'Concretizado' },
  { nome: 'Lanchonete Dom Sabor - Vila da Serra', vendedor: 'Juliano', endereco: 'Rua da Paisagem, 240', bairro: 'Vila da Serra', cidade: 'BH', situacao: 'Concretizado' },
  { nome: 'Padaria Mais Ki Pão Cristal - Jardim Canadá', vendedor: 'Juliano', endereco: 'Rua Labrador, 219', bairro: 'Jardim Canada', cidade: 'BH', situacao: 'Concretizado' },
  { nome: 'Colégio Magnum Cid Nova', vendedor: 'Victória', endereco: 'R. São Gonçalo, 1364', bairro: 'Nova Floresta', cidade: 'BH', contato: '996640038', observacao: 'Jussara', situacao: 'Concretizado' },
  { nome: 'Cafeteria Cheirin Bao - São Pedro', vendedor: 'Juliano', bairro: 'São Pedro', situacao: 'Concretizado' },
  { nome: 'Cafeteria Cheirin Bao - Buritis 2', vendedor: 'Juliano', bairro: 'Buritis', situacao: 'Concretizado' },
  { nome: 'Danta Alimentos', vendedor: 'Juliano', cidade: 'BH', situacao: 'Concretizado' },
  { nome: 'Supermercado Catalão', vendedor: 'Bruno', endereco: 'Rua dos Atleticanos, 933', bairro: 'Barreiro', cidade: 'BH', contato: '3439-5650', situacao: 'Concretizado' },
  { nome: 'Cafeteria Intuição Bolo e Café', vendedor: 'Victória', endereco: 'R. Monsenhor Horta, 12B', bairro: 'Calafate', cidade: 'BH', contato: '31996142798', observacao: 'Pao de Queijo Canastra (Padre Eustaquio)', situacao: 'Concretizado' },
  { nome: 'Lanchonete Suricato', vendedor: 'Juliano', endereco: 'Av. Carandaí, 785', bairro: 'Funcionários', cidade: 'BH', situacao: 'Concretizado' },

  // === NEGOCIANDO ===
  { nome: 'Padaria Andreia', vendedor: 'Juliano', endereco: 'Rua Conselheiro Joaquim Caetano, 1530', bairro: 'Nova Granada', cidade: 'BH', dia_semana: 'Quarta', situacao: 'Negociando' },
  { nome: 'Santíssimo Pão - Estevão Pinto', vendedor: 'Juliano', endereco: 'Rua Professor Estevão Pinto, 858', bairro: 'Serra', cidade: 'BH', contato: '98851-8174', observacao: 'Edneia', dia_semana: 'Terça', situacao: 'Negociando' },
  { nome: 'Lanchonete Hoje Tem', vendedor: 'Juliano', endereco: 'Rua dos Timbiras, 2249', bairro: 'Lourdes', cidade: 'BH', situacao: 'Negociando' },
  { nome: 'Cafeteria Mocca - Shopping Diamond', vendedor: 'Victória', endereco: 'Av. Olegário Maciel, 1600', bairro: 'Lourdes', cidade: 'BH', contato: '3291-2786', situacao: 'Negociando' },
  { nome: 'Cafeteria Fofissima Café - Shopping Diamond', vendedor: 'Juliano', endereco: 'Av. Olegário Maciel, 1600', bairro: 'Lourdes', cidade: 'BH', situacao: 'Negociando' },
  { nome: 'Ao Gosto - Silviano Brandao', vendedor: 'Juliano', endereco: 'Av. Silviano Brandão, 685', bairro: 'Sagrada Familia', cidade: 'BH', situacao: 'Negociando' },
  { nome: 'Colegio Exccellente', vendedor: 'Victória', endereco: 'Rua Manoel Venancio Martins, 323', bairro: 'Palmares', cidade: 'BH', situacao: 'Negociando' },
  { nome: 'Colegio Olimpo Mangabeiras', vendedor: 'Juliano', endereco: 'Av. dos Bandeirantes, 2222', bairro: 'Mangabeiras', cidade: 'BH', observacao: 'Manhã', situacao: 'Negociando' },
  { nome: 'Confeitaria Arte do Doce - Nova Floresta', vendedor: 'Juliano', endereco: 'Rua São Gonçalo, 1335', bairro: 'Nova Floresta', cidade: 'BH', observacao: 'Ligar dia 30/09', situacao: 'Negociando' },
  { nome: 'Hotel Nobile', vendedor: 'Juliano', endereco: 'Av. Professor Magalhães Penido, 378', bairro: 'Pampulha', cidade: 'BH', situacao: 'Negociando' },
  { nome: 'Hotel Quality - Pampulha', vendedor: 'Juliano', endereco: 'Av. Presidente Antônio Carlos, 7456', bairro: 'Pampulha', cidade: 'BH', situacao: 'Negociando' },
  { nome: 'Hotel Royal - Savassi', vendedor: 'Juliano', endereco: 'Rua Rio Grande do Norte, 1015', bairro: 'Savassi', cidade: 'BH', observacao: 'Feira', situacao: 'Negociando' },
  { nome: 'Hotel Vivenzo', vendedor: 'Victória', endereco: 'Av. Cristiano Machado, 3030', bairro: 'Cidade Nova', cidade: 'BH', situacao: 'Negociando' },
  { nome: 'Lanchonete Santé - Vila da Serra', vendedor: 'Juliano', endereco: 'Rua da Paisagem, 240', bairro: 'Vila da Serra', cidade: 'BH', situacao: 'Negociando' },
  { nome: 'Padaria Dupão - Ouro Preto', vendedor: 'Victória', endereco: 'Rua Mantena 182', bairro: 'Ouro Preto', cidade: 'BH', contato: '3582-9076', situacao: 'Negociando' },
  { nome: 'Padaria Papa Pao', vendedor: 'Juliano', endereco: 'Rua Icaraí, 653', bairro: 'Caiçara', cidade: 'BH', contato: '998979758', situacao: 'Negociando' },
  { nome: 'Trailer JR Lanches', vendedor: 'Juliano', endereco: 'Rua da Paisagem, 240', bairro: 'Vila da Serra', cidade: 'BH', situacao: 'Negociando' },
  { nome: 'Uai Emporio MG - Dona Clara', vendedor: 'Juliano', endereco: 'Rua Gilson Bretas, 206', bairro: 'Dona Clara', cidade: 'BH', situacao: 'Negociando' },
  { nome: 'Café da Serra - Hospital Orizonti', vendedor: 'Juliano', endereco: 'Praça Engenheiro Flávio Gutierrez', bairro: 'Mangabeiras', cidade: 'BH', situacao: 'Negociando' },
  { nome: 'Padaria Trigu\'s - Barreiro', vendedor: 'Juliano', endereco: 'Rua Caetano Pirri, 780', bairro: 'Barreiro', cidade: 'BH', situacao: 'Negociando' },
  { nome: 'Loja do Itamar - Mercado Central', vendedor: 'Juliano', endereco: 'Av. Augusto de Lima, 744', bairro: 'Centro', cidade: 'BH', situacao: 'Negociando' },
  { nome: 'La no Mercado 01 - Mercado Central', vendedor: 'Juliano', endereco: 'Av. Augusto de Lima, 744', bairro: 'Centro', cidade: 'BH', situacao: 'Negociando' },
  { nome: 'La no Mercado 02 - Mercado Central', vendedor: 'Juliano', endereco: 'Av. Augusto de Lima, 744', bairro: 'Centro', cidade: 'BH', situacao: 'Negociando' },
  { nome: 'Café 3 Corações - Mercado Central', vendedor: 'Juliano', endereco: 'Av. Augusto de Lima, 744', bairro: 'Centro', cidade: 'BH', situacao: 'Negociando' },
  { nome: 'Loja de Conveniência SR (Posto Ipiranga) - Alphaville', vendedor: 'Juliano', endereco: 'Av. Princesa Diana, 565', bairro: 'Alphaville', cidade: 'Nova Lima', situacao: 'Negociando' },
  { nome: 'Lanchonete Parque Central - Parque Municipal', vendedor: 'Juliano', endereco: 'Parque Municipal', bairro: 'Centro', cidade: 'BH', situacao: 'Negociando' },
  { nome: 'Posto Colibri (BR Mania) - Antonio Carlos', vendedor: 'Juliano', endereco: 'Avenida Antonio Carlos, 7585', bairro: 'Pampulha', situacao: 'Negociando' },
  { nome: 'Grupo Zelo', vendedor: 'Juliano', endereco: 'Rua Paracatu, 1253', bairro: 'Santo Agostinho', cidade: 'BH', situacao: 'Negociando' },
  { nome: 'Cafeteria Brewtopia', vendedor: 'Juliano', endereco: 'Rua Benjamim Constant, 54', bairro: 'Centro', cidade: 'Conselheiro Lafaiete', situacao: 'Negociando' },
  { nome: 'Hotel Savassi', vendedor: 'Juliano', endereco: 'Rua Sergipe 939', bairro: 'Savassi', cidade: 'BH', situacao: 'Negociando' },
  { nome: 'Colégio Dimensão', vendedor: 'Juliano', endereco: 'Rua Teotônio Maciel, 64', bairro: 'Alto Caiçara', cidade: 'BH', situacao: 'Negociando' },
  { nome: 'Emporio Minas Geral', vendedor: 'Juliano', endereco: 'Av Otacilio Negrao de Lima, 3850', bairro: 'Pampulha', cidade: 'BH', situacao: 'Negociando' },
  { nome: 'Padaria Cia do Pão - Fleming', vendedor: 'Juliano', endereco: 'Av. Fleming, 800', bairro: 'Ouro Preto', cidade: 'BH', situacao: 'Negociando' },

  // === ROTINA ===
  { nome: 'Padaria Boníssima - Vila da Serra', vendedor: 'Juliano', bairro: 'Vila da Serra', cidade: 'BH', situacao: 'Rotina' },

  // === VISITA ===
  { nome: 'Supermercado Seu João - Barreiro', vendedor: 'Juliano', endereco: 'Rua Doutor Francisco Silveira, 360', bairro: 'Barreiro', situacao: 'Visita' },
  { nome: 'Supermercado Marina Coisas da Roça', vendedor: 'Victória', endereco: 'R. Comendador Antônio Alves, 1213', bairro: 'Centro', cidade: 'Pedro Leopoldo', situacao: 'Visita' },
  { nome: 'A Cafeteria - Shopping Del Rey', vendedor: 'Victória', endereco: 'Av. Presidente Carlos Luz, 3001', bairro: 'Caiçara', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Aslemg', vendedor: 'Juliano', endereco: 'Rua Dias Adorno, 300', bairro: 'Santo Agostinho', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Buffet Mai Eventos - Venda Nova', vendedor: 'Juliano', endereco: 'Rua Maria Jose Alchaar, 147', bairro: 'Venda Nova', cidade: 'BH', observacao: 'Feira', situacao: 'Visita' },
  { nome: 'Café com Pão Niteroi', vendedor: 'Victória', endereco: 'Av. Belo Horizonte, 2050', bairro: 'Niterói', cidade: 'Betim', contato: '(31) 3532-7175', situacao: 'Visita' },
  { nome: 'Cafeteria Amelia', vendedor: 'Juliano', endereco: 'R. Rubens Caporali Ribeiro, 715', bairro: 'Buritis', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Cafeteria e Pastelaria Ponto Certo', vendedor: 'Victória', endereco: 'Rua Lorena, 93', bairro: 'Cruzeiro', cidade: 'Betim', contato: '(31) 9 9553-8383', situacao: 'Visita' },
  { nome: 'Cafeteria Expresso Café', vendedor: 'Victória', endereco: 'Alameda Maria Turibia de Jesus, n92', bairro: 'Centro', cidade: 'Betim', situacao: 'Visita' },
  { nome: 'Cafeteria Expresso Pão de Queijo', vendedor: 'Victória', endereco: 'Av. Babita Camargos, 1920', bairro: 'Cidade Industrial', cidade: 'Contagem', contato: '(31) 3363-1072', situacao: 'Visita' },
  { nome: 'Cafeteria Querido Café', vendedor: 'Victória', endereco: 'Rua Santa Cruz, 411', bairro: 'Brasiléia', cidade: 'Betim', contato: '(31)3592-2638', situacao: 'Visita' },
  { nome: 'Cafeteria Raiz', vendedor: 'Juliano', endereco: 'Rua dos Otoni, 714', bairro: 'Santa Efigênia', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Cafeteria Se Achegue Doces e Café', vendedor: 'Victória', endereco: 'Av. Silva Lobo, 2053', bairro: 'Grajaú', cidade: 'BH', contato: '31992532226', situacao: 'Visita' },
  { nome: 'Colegio Santa Maria - Floresta', vendedor: 'Juliano', bairro: 'Floresta', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Confeitaria La Belle', vendedor: 'Juliano', endereco: 'Rua Rio Negro, 1085', bairro: 'Barroca', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Emporio Adriano Ltda', vendedor: 'Victória', endereco: 'Rua Belfort Roxo, Nº 454', bairro: 'Nova Granada', cidade: 'BH', contato: '3222-0518 / 2535-0579', situacao: 'Visita' },
  { nome: 'Emporio Birosca', vendedor: 'Victória', endereco: 'Rua Conselheiro Joaquim Caetano, 1574', bairro: 'Nova Granada', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Emporio Caeté', vendedor: 'Victória', endereco: 'Av. 21 de Abril, 252', bairro: 'São Geraldo', cidade: 'Caeté', contato: '(31) 99063-8059', observacao: 'Roberta', situacao: 'Visita' },
  { nome: 'Empório Casa de Vó', vendedor: 'Victória', endereco: 'Av. Silva Lobo, 1188', bairro: 'Nova Granada', cidade: 'BH', contato: '3132440400', situacao: 'Visita' },
  { nome: 'Emporio Estrada Real', vendedor: 'Victória', endereco: 'Avenida Barão Homem de Melo, 55', bairro: 'Nova Granada', cidade: 'BH', contato: '(31) 3222-4594', situacao: 'Visita' },
  { nome: 'Emporio Trem de Minas', vendedor: 'Victória', endereco: 'Rua Jacui, 1898', bairro: 'Floresta', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Express Conveniência - Jardim Canada', vendedor: 'Juliano', bairro: 'Jardim Canada', cidade: 'Nova Lima', situacao: 'Visita' },
  { nome: 'Faculdade Sabará', vendedor: 'Victória', endereco: 'Av. Expedicionario Romeu Jer Dantas, 1084', bairro: 'Rosário', cidade: 'Sabará', contato: '3671-2560', observacao: 'Andreia', situacao: 'Visita' },
  { nome: 'Hotel Actual', vendedor: 'Juliano', endereco: 'Rodovia BR-381, 3443', bairro: 'Riacho das Pedras', cidade: 'Contagem', situacao: 'Visita' },
  { nome: 'Hotel BH Raja', vendedor: 'Juliano', endereco: 'Av. Raja Gabáglia, 1137', bairro: 'Luxemburgo', cidade: 'BH', observacao: 'Feira', situacao: 'Visita' },
  { nome: 'Hotel Clube Campestre Juca Vieira', vendedor: 'Victória', endereco: 'Fazenda Juca Vieira s/nº', bairro: 'São Geraldo', cidade: 'Caeté', situacao: 'Visita' },
  { nome: 'Hotel Vovó Duda', vendedor: 'Victória', endereco: 'Estrada para Morro Vermelho, Km 1', bairro: 'São Geraldo', cidade: 'Caeté', contato: '(31) 3651-9180', observacao: 'Rafael', situacao: 'Visita' },
  { nome: 'Lanchonete Arena Comercial', vendedor: 'Juliano', bairro: 'Barreiro', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Lanchonete Confraria Mineira', vendedor: 'Victória', endereco: 'Av. Silva Lobo, 1748', bairro: 'Nova Granada', cidade: 'BH', contato: '3133471748', situacao: 'Visita' },
  { nome: 'Lanchonete Puc', vendedor: 'Juliano', bairro: 'Savassi', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Lanchonete Vip Açaí', vendedor: 'Juliano', endereco: 'Rua dos Goitacazes, 130', bairro: 'Barro Preto', cidade: 'BH', contato: 'Alessandro', situacao: 'Visita' },
  { nome: 'Padaria A Panilar', vendedor: 'Victória', endereco: 'R. Inconfidência, 203', bairro: 'Centro', cidade: 'Betim', contato: '(31) 3531-2677', situacao: 'Visita' },
  { nome: 'Padaria Beira Rio', vendedor: 'Victória', endereco: 'Rua Presidente Juscelino Kubitscheck, 86', bairro: 'Siderurgica', cidade: 'Sabará', contato: '3136711656', situacao: 'Visita' },
  { nome: 'Padaria Bom Pão 24hrs', vendedor: 'Victória', endereco: 'Rua Alvorada, 58', bairro: 'São Benedito', cidade: 'Santa Luzia', contato: '3636-8826 / 97166-2763', situacao: 'Visita' },
  { nome: 'Padaria Buenopão', vendedor: 'Victória', endereco: 'Av. Luis Souza Bráz, 182', bairro: 'Conj. Olimpia Bueno Franco', cidade: 'Betim', contato: '31994417642', situacao: 'Visita' },
  { nome: 'Padaria Central do Pão', vendedor: 'Victória', endereco: 'Rua Pará Minas, 41', bairro: 'Centro', cidade: 'Betim', contato: '(31) 3531-2446', situacao: 'Visita' },
  { nome: 'Padaria das Américas', vendedor: 'Victória', endereco: 'Av. das Américas, 275', bairro: 'Filadélfia', cidade: 'Betim', contato: '(31) 3532-3669', situacao: 'Visita' },
  { nome: 'Padaria Delícias do Trigo', vendedor: 'Victória', endereco: 'Rua João Teodoro Silva, 474', bairro: 'Conj. Hab. Romero C Filho', cidade: 'Pedro Leopoldo', contato: '98235-1719', observacao: 'Pedro', situacao: 'Visita' },
  { nome: 'Padaria e Empório Nutrivida', vendedor: 'Victória', endereco: 'Av. Edmeia Matos Lazzarotti, 1381', bairro: 'Angola', cidade: 'Betim', contato: '3125237308', situacao: 'Visita' },
  { nome: 'Padaria Horizonte', vendedor: 'Victória', endereco: 'R. Alcântara, 224', bairro: 'Nova Granada', cidade: 'BH', contato: '3133173910', situacao: 'Visita' },
  { nome: 'Padaria Imperial', vendedor: 'Juliano', endereco: 'Rua Mármore, 632', bairro: 'Santa Tereza', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Padaria La Bella', vendedor: 'Victória', endereco: 'R. Clemente Neto Silva', bairro: 'Filadélfia', cidade: 'Betim', contato: '(31) 3594-6976', situacao: 'Visita' },
  { nome: 'Padaria Leal e Rossi', vendedor: 'Victória', endereco: 'Rua das Laranjeiras, 15', bairro: 'Centro', cidade: 'Sabará', situacao: 'Visita' },
  { nome: 'Padaria Madre Paes - Planalto', vendedor: 'Juliano', endereco: 'Av. Deputado Último de Carvalho, 841', bairro: 'Planalto', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Padaria Mateus', vendedor: 'Victória', endereco: 'Rua Dr. Neiva, 436', bairro: 'Centro', cidade: 'Pedro Leopoldo', contato: '3661-3968', situacao: 'Visita' },
  { nome: 'Padaria Nides', vendedor: 'Victória', endereco: 'Rua São Tadeu, 50', bairro: 'Conj. São José', cidade: 'Sabará', contato: '3136726900', situacao: 'Visita' },
  { nome: 'Padaria Oca Dos Pães', vendedor: 'Victória', endereco: 'Av Araguaia, 197', bairro: 'Parque Andiara', cidade: 'Pedro Leopoldo', contato: '3662-2957', situacao: 'Visita' },
  { nome: 'Padaria Pan Mel', vendedor: 'Juliano', endereco: 'Rua Itu, 1171', bairro: 'Renascença', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Padaria Pão da Hora', vendedor: 'Victória', endereco: 'Rua Vereador Magno Claret Vieira, 763', bairro: 'Lagoa de Santo Antônio', cidade: 'Pedro Leopoldo', contato: '3136628059', situacao: 'Visita' },
  { nome: 'Padaria Pão de Mel', vendedor: 'Victória', endereco: 'R. Um, 15', bairro: 'Conj. Romero Gil Lazarotti', cidade: 'Betim', contato: '(31) 3511-2241', situacao: 'Visita' },
  { nome: 'Padaria Pão do Dia', vendedor: 'Victória', endereco: 'Rua Minas Nova, 517-577', bairro: 'Nossa Sra. de Fatima', cidade: 'Sabará', contato: '3673-2435', situacao: 'Visita' },
  { nome: 'Padaria Pão e Trigo', vendedor: 'Victória', endereco: 'Rua Conselheiro Joaquim Caetano, 1530', bairro: 'Nova Granada', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Padaria Pão Maior', vendedor: 'Victória', endereco: 'R. Leozino de Oliveira, 205', bairro: 'Filadélfia', cidade: 'Betim', contato: '(31) 3531-9965', situacao: 'Visita' },
  { nome: 'Padaria Pão Mais', vendedor: 'Victória', endereco: 'Rua do Comércio, 240', bairro: 'São João Batista', cidade: 'Santa Luzia', contato: '3642-3494', situacao: 'Visita' },
  { nome: 'Padaria Pão Paraíso', vendedor: 'Victória', endereco: 'Rua Rio Grande do Sul, 412', bairro: 'Vila Rica', cidade: 'Sabará', contato: '31982486742', situacao: 'Visita' },
  { nome: 'Padaria Pão Tinino', vendedor: 'Victória', endereco: 'Av. Dr. Henrique de Melo, 459', bairro: 'Santo Antonio', cidade: 'Sabará', situacao: 'Visita' },
  { nome: 'Padaria Paraoquena', vendedor: 'Victória', endereco: 'Rua Paraoquena, 253', bairro: 'Nova Granada', cidade: 'BH', contato: '33987096185', situacao: 'Visita' },
  { nome: 'Padaria Penaforte', vendedor: 'Victória', endereco: 'Rua Padre Nico, 144', bairro: 'Corrego da Ilha', cidade: 'Sabará', situacao: 'Visita' },
  { nome: 'Padaria Ping Pão - Betim', vendedor: 'Victória', endereco: 'Av. Pres. Juscelino Kubitschek, 397', bairro: 'Centro', cidade: 'Betim', contato: '(31) 2571-0006', situacao: 'Visita' },
  { nome: 'Padaria Ponto Certo', vendedor: 'Victória', endereco: 'Rua Porto Alegre, 496', bairro: 'Bandeirinhas', cidade: 'Betim', horario: '15h as 22h', contato: '(31) 9 9553-8383', situacao: 'Visita' },
  { nome: 'Padaria Sagrado Pão', vendedor: 'Victória', endereco: 'Av. Petrolina, 987', bairro: 'Horto', cidade: 'BH', contato: '99222-5383', situacao: 'Visita' },
  { nome: 'Padaria Salerno', vendedor: 'Victória', endereco: 'Rua Mariano Abreu, 692', bairro: 'Esplanada', cidade: 'BH', contato: '(31) 3467-7312', situacao: 'Visita' },
  { nome: 'Padaria Santo Pão - Nova Granada', vendedor: 'Victória', endereco: 'Av. Silva Lobo, 1694', bairro: 'Nova Granada', cidade: 'BH', contato: '3130472021', situacao: 'Visita' },
  { nome: 'Padaria Santo Pao - Cidade Nova', vendedor: 'Juliano', endereco: 'Rua João Arantes, 413', bairro: 'Cidade Nova', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Padaria São Benedito', vendedor: 'Victória', endereco: 'Rua Itamarati, 151', bairro: 'São Benedito', cidade: 'Santa Luzia', contato: '3637-1001', situacao: 'Visita' },
  { nome: 'Padaria São Judas Tadeu', vendedor: 'Victória', endereco: 'Av. Rio Madeira, 240', bairro: 'Santa Cruz', cidade: 'Betim', contato: '(31) 98276-8596', situacao: 'Visita' },
  { nome: 'Padaria Sarah', vendedor: 'Victória', endereco: 'Rua Sylvio Andrade, 610', bairro: 'Serrano', cidade: 'BH', contato: '3412-0671', situacao: 'Visita' },
  { nome: 'Padaria Serra Verde', vendedor: 'Juliano', endereco: 'Rua Manoel Miranda dos Santos, 146', bairro: 'Serra Verde', cidade: 'BH', contato: '98684-6794', situacao: 'Visita' },
  { nome: 'Padaria Pifonso', vendedor: 'Victória', endereco: 'Av. Cel. Juventino Dias, 238', bairro: 'Cachoeira Grande', cidade: 'Pedro Leopoldo', contato: '3661-2323', situacao: 'Visita' },
  { nome: 'Padaria Trigo de Ouro - Betim', vendedor: 'Victória', endereco: 'Rua nove, 19', bairro: 'Parque das Acácias', cidade: 'Betim', contato: '31 99432-2717', situacao: 'Visita' },
  { nome: 'Padaria Trigomar', vendedor: 'Victória', endereco: 'Av. José Faria da Rocha, 1724', bairro: 'Eldorado', cidade: 'Contagem', contato: '2565-8947', situacao: 'Visita' },
  { nome: 'Padaria Verena', vendedor: 'Victória', endereco: 'Rua Maria dos Anjos Ribeiro de Jesus, 221', bairro: 'Sra. das Graças', cidade: 'Betim', contato: '(31) 3595-6705', situacao: 'Visita' },
  { nome: 'Padaria Vô Pedro', vendedor: 'Victória', endereco: 'Rua Comendador Vianna, 310', bairro: 'Centro', cidade: 'Sabará', contato: '3136712845', situacao: 'Visita' },
  { nome: 'Panificadora Olhos d\'Agua', vendedor: 'Victória', endereco: 'Rua Armando Tauil, 98', bairro: 'Pilar', cidade: 'BH', contato: '3132881887', situacao: 'Visita' },
  { nome: 'Panificadora Rei do Pão', vendedor: 'Victória', endereco: 'Rua Trinta Quatro, 265', bairro: 'Oitis', cidade: 'Contagem', contato: '(31) 99108-0051', situacao: 'Visita' },
  { nome: 'Padaria Ponto com Pão', vendedor: 'Victória', endereco: 'Av. Waldemar Damas, 441', bairro: 'Teotônio Batista de Freitas', cidade: 'Pedro Leopoldo', contato: '3660-8192', situacao: 'Visita' },
  { nome: 'Pousada e Restaurante Victorio\'s', vendedor: 'Victória', endereco: 'Alameda Manacás, 2200', bairro: 'Sitio Cardoso', cidade: 'Caeté', contato: '99815-1413', situacao: 'Visita' },
  { nome: 'Restaurante Quero Mais / Hotel Tupygua', vendedor: 'Victória', endereco: 'Rua Cândido Viana, 81', bairro: 'Centro', cidade: 'Pedro Leopoldo', contato: '3663-3016', situacao: 'Visita' },
  { nome: 'Restaurante PF Central', vendedor: 'Juliano', endereco: 'Rua Rio de Janeiro, 211', bairro: 'Centro', cidade: 'BH', contato: '31985726129', situacao: 'Visita' },
  { nome: 'Roma Panetteria', vendedor: 'Juliano', endereco: 'Rua Modesto Carvalho Araujo, 674', bairro: 'Belvedere', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Supermercado Bretas', vendedor: 'Victória', endereco: 'Rua Dr. Cristiano Otoni, 327 - Centro', bairro: 'Centro', cidade: 'Pedro Leopoldo', contato: '3663-3200', situacao: 'Visita' },
  { nome: 'Supermercado Dupovo', vendedor: 'Juliano', endereco: 'Rua Maria Amélia Maia, 671', bairro: 'Planalto', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Supermercado JJ', vendedor: 'Juliano', endereco: 'Rua Detetive William Nunes, 154', bairro: 'Barreiro', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Supermercado Meu Prata', vendedor: 'Victória', endereco: 'Rua Izabel Alves Martins, 396', bairro: 'Serrano', cidade: 'Santa Luzia', situacao: 'Visita' },
  { nome: 'Supermercado Paranaíba', vendedor: 'Victória', endereco: 'Av. Camilo Alves da Silva, 262', bairro: 'Lagoa de Santo Antônio', cidade: 'Pedro Leopoldo', contato: '97226-5948', situacao: 'Visita' },
  { nome: 'Supermercado Ponto Certo - Betim', vendedor: 'Juliano', endereco: 'Rua Mannesman, 12', bairro: 'Amazonas', cidade: 'Betim', situacao: 'Visita' },
  { nome: 'Supermercado Teco - Floramar', vendedor: 'Juliano', endereco: 'Av. Jose Lopes Muradas, 17', bairro: 'Floramar', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Supermercado Uberaba - Floramar', vendedor: 'Juliano', endereco: 'Av. Dr. Cristiano Guimarães, 135', bairro: 'Floramar', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Supermercado Verde Amarelo', vendedor: 'Victória', endereco: 'Rua Rio Mantiqueira, 569', bairro: 'Novo Riacho', cidade: 'Contagem', contato: '(31) 3391-1115', situacao: 'Visita' },
  { nome: 'Tia Célia Lanchonete', vendedor: 'Victória', endereco: 'Rua Comendador Antônio Alves, 1301', bairro: 'Centro', cidade: 'Pedro Leopoldo', contato: '3662-1187', situacao: 'Visita' },
  { nome: 'Hotel Abba - Betim', vendedor: 'Juliano', endereco: 'R. Romualda Augusta de Melo, 337', bairro: 'Centro', cidade: 'Betim', contato: '(31) 3544-1900', situacao: 'Visita' },
  { nome: 'Padarias Trigu\'s - Bairro das Indústrias', vendedor: 'Juliano', endereco: 'Rua Margarida Araujo, 18', bairro: 'Bairro das Indústrias', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Padarias Trigu\'s - Solar', vendedor: 'Juliano', endereco: 'Av. Warley Aparecido Martins, 971', bairro: 'Solar', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Lanchonete D\'ulio - Portal Auto Shopping', vendedor: 'Juliano', endereco: 'Av. Dom Pedro II', bairro: 'Carlos Prates', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Cafeteria Rua do Jasmin', vendedor: 'Raiane', endereco: 'Rua Carangol, 446', bairro: 'Santo Antonio', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Cafeteria Nattural Mix', vendedor: 'Raiane', endereco: 'Rua Gonçalves Dias, 876', bairro: 'Savassi', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Padaria Verena - Betim', vendedor: 'Raiane', endereco: 'Rua Maria dos Anjos Ribeiro de Jesus, 221', bairro: 'Senhora das Graças', cidade: 'Betim', situacao: 'Visita' },
  { nome: 'Clalua Coffee Break', vendedor: 'Raiane', endereco: 'Sebastião Patrus de Souza, Nº 291', bairro: 'Rio Branco', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Padaria Shop do Pao', vendedor: 'Raiane', endereco: 'Junquilhos, 1273', bairro: 'Nova Suissa', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Nosso Lanche', vendedor: 'Raiane', endereco: 'Rua do Acre, 86', bairro: 'Centro', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Mais Servicos de Cafeteria', vendedor: 'Raiane', endereco: 'Rua Espirito Santo, 616', bairro: 'Centro', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Lanchonete Divina Lanches', vendedor: 'Raiane', endereco: 'Av. Brigadeiro Eduardo Gomes, 1787', bairro: 'Glória', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Padaria Sao Judas Tadeu - Jardim Canada', vendedor: 'Raiane', endereco: 'Rua Mississipi, 170', bairro: 'Jardim Canada', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Escola Estadual Nossa Senhora do Carmo', vendedor: 'Raiane', endereco: 'Rua Artur Trindade, 525', bairro: 'Jardim Iara', cidade: 'Betim', situacao: 'Visita' },
  { nome: 'Colegio Novos Tempos', vendedor: 'Raiane', endereco: 'Av. Pref. Gil Diniz, 581', bairro: 'Centro', cidade: 'Contagem', situacao: 'Visita' },
  { nome: 'Biscoiteria Tia Cece', vendedor: 'Raiane', endereco: 'Av. Paraná, 256', bairro: 'Centro', cidade: 'BH', situacao: 'Visita' },
  { nome: 'American Food Comercio', vendedor: 'Raiane', endereco: 'Av. Cristiano Machado, 1794', bairro: 'Cidade Nova', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Lanchonete Best Buy', vendedor: 'Raiane', endereco: 'Rua São Paulo, 1198', bairro: 'Centro', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Escola SEB Serra', vendedor: 'Juliano', endereco: 'Rua Professor Estêvão Pinto, 400', bairro: 'Serra', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Escola da Serra', vendedor: 'Juliano', endereco: 'R. do Ouro, 1900', bairro: 'Serra', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Escola Theodor Herzl', vendedor: 'Juliano', endereco: 'Rua Caraça, 15', bairro: 'Serra', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Cafeteria Monã', vendedor: 'Juliano', endereco: 'Av. Miguel Perrela, 663', bairro: 'Castelo', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Lanchonete Divino Lanches - Esmeraldas', vendedor: 'Juliano', cidade: 'Esmeraldas', situacao: 'Visita' },
  { nome: 'Restaurante Dolma Grill - Clube Olympico', vendedor: 'Juliano', endereco: 'Rua Professor Estevão Pinto, 783', bairro: 'Serra', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Endurence Beah Tennis', vendedor: 'Juliano', endereco: 'Rua Laplace, 245', bairro: 'Santa Lucia', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Hotel Radisson', vendedor: 'Juliano', endereco: 'Rua Lavras, 150', bairro: 'São Pedro', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Cafeteria Sterna Café', vendedor: 'Juliano', endereco: 'Rua Desembargador Edésio Fernandes, 144', bairro: 'Estoril', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Empório Nobre - Olhos D\'agua', vendedor: 'Juliano', endereco: 'Rua Sete, 121', bairro: 'Olhos D\'agua', cidade: 'Nova Lima', situacao: 'Visita' },
  { nome: 'Colegio Lucia Casa Santa', vendedor: 'Juliano', endereco: 'Rua Rio Verde', bairro: 'Sion', cidade: 'BH', situacao: 'Visita' },
  { nome: 'Ibrahim Empório Árabe', vendedor: 'Juliano', endereco: 'Coronel Jose Dias Bicalho, 587', bairro: 'São José', cidade: 'BH', situacao: 'Visita' },
];

let _importCounter = 200;
const IMPORTED_LEADS_TIMESTAMP = '2026-03-01T00:00:00.000Z';

export function createImportedLeads(): Lead[] {
  const now = IMPORTED_LEADS_TIMESTAMP;
  
  return RAW_LEADS.map(raw => {
    const id = `l-${++_importCounter}`;
    
    // Auto-detect regional from bairro
    let regional: string | undefined;
    let regional_status: Lead['regional_status'] = undefined;
    let regional_confianca: number | undefined;
    
    if (raw.bairro && (raw.cidade === 'BH' || !raw.cidade)) {
      const match = matchBairroRegional(raw.bairro);
      regional = match.regional;
      regional_status = match.regional_status;
      regional_confianca = match.regional_confianca;
    }

    // Parse contato: separate phone from name
    let contato_nome: string | undefined;
    let telefone: string | undefined;
    
    if (raw.contato) {
      const phoneMatch = raw.contato.match(/^[\d(]/);
      if (phoneMatch) {
        const parts = raw.contato.match(/^([\d().\s\-/]+)\s*(.*)$/);
        if (parts) {
          telefone = parts[1].trim();
          contato_nome = parts[2]?.trim() || undefined;
        } else {
          telefone = raw.contato;
        }
      } else {
        contato_nome = raw.contato;
      }
    }

    // Map situacao to pipeline status
    const status_pipeline = mapSituacaoToPipeline(raw.situacao);

    // Set negocio_status for concretizado/encerrado
    let negocio_status: Lead['negocio_status'] = null;
    let ultima_visita_status: Lead['ultima_visita_status'] = null;
    
    if (raw.situacao === 'Concretizado') {
      negocio_status = 'FECHADO';
      ultima_visita_status = 'CONCLUIDA_SUCESSO';
    } else if (raw.situacao === 'Encerrado') {
      negocio_status = 'NAO_FECHADO';
      ultima_visita_status = 'CONCLUIDA_SEM_SUCESSO';
    } else if (raw.situacao === 'Negociando') {
      ultima_visita_status = 'REALIZADA';
    }

    return {
      id,
      nome_fantasia: raw.nome,
      agendado_por: 'Juliano',
      contato_nome,
      telefone,
      cidade: raw.cidade,
      bairro: raw.bairro,
      vendedor: raw.vendedor,
      dia_semana: raw.dia_semana,
      horario: raw.horario,
      regional,
      regional_status,
      regional_confianca,
      regional_fonte: regional ? 'BH_BAIRROS_REGIONAIS' : undefined,
      endereco: raw.endereco,
      observacoes: raw.observacao,
      status_pipeline,
      proxima_visita_em: null,
      ultima_visita_status,
      negocio_status,
      negocio_justificativa_id: null,
      negocio_valor_estimado: null,
      criado_em: now,
      atualizado_em: now,
    };
  });
}
