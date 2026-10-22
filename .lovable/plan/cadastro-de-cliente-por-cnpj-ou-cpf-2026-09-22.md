# Cadastro de cliente por CNPJ ou CPF

Permitir que a mesma ficha aceite pessoa jurídica (CNPJ) ou pessoa física (CPF), sem mudar nada do que já funciona para CNPJ e sem tocar nos cadastros existentes.

## Como fica a ficha

**Seletor de tipo de documento** no topo de "Dados principais", com duas opções: CNPJ (padrão) e CPF.

Com **CNPJ** selecionado: exatamente o comportamento de hoje — máscara `00.000.000/0000-00`, validação, consulta automática ao sair do campo, preenchimento de razão social, nome fantasia, inscrições, telefone e endereço.

Com **CPF** selecionado:
- campo passa a se chamar "CPF", máscara `000.000.000-00`, validação dos dígitos verificadores antes de salvar;
- o campo "Razão Social *" passa a se chamar "Nome completo *" (mesmo campo interno, só o rótulo muda);
- Inscrição Estadual e Inscrição Municipal deixam de ser exigidas (permanecem visíveis e opcionais);
- todo o resto da ficha continua igual: nome fantasia, empresa, segmento, ramo de atividade, vendedor, telefone, e-mail, contatos, endereço completo, entrega, dias de rota, formas de pagamento, produtos, observações, ponto de venda;
- não há consulta pública e autorizada de dados pessoais por CPF, então mostramos um aviso discreto: "Consulta automática indisponível para CPF. Preencha os dados manualmente." Isso nunca bloqueia o cadastro.

**Troca de tipo**: ao alternar CNPJ ↔ CPF, o documento digitado é limpo, a máscara e as validações trocam, e os dados que vieram da consulta anterior de CNPJ (razão social, nome fantasia, inscrições, telefone e endereço) são limpos para não ficarem associados ao documento errado — com confirmação antes, para não apagar digitação por engano.

## Duplicidade

Antes de salvar um cadastro novo, o sistema compara apenas os números do documento (ignorando pontos, barras e traços) e avisa se aquele CPF ou CNPJ já tem ficha, oferecendo atualizar a existente — mesma experiência que já existe hoje para CNPJ.

## Exibição e busca

- Ficha, visualização e PDF do cliente mostram "CPF: 000.000.000-00" ou "CNPJ: 00.000.000/0000-00" conforme o cadastro.
- A busca de clientes já encontra por números do documento, nome, razão social e nome fantasia; confirmamos que funciona igual para CPF (11 dígitos) em Cadastro de Clientes e nas buscas de cliente usadas em ações comerciais, bonificações, degustações, agenda e pagamentos.

## Detalhes técnicos

- Banco: nova coluna `client_profiles.tipo_documento` (`'CNPJ' | 'CPF'`, padrão `'CNPJ'`). O documento continua na coluna `cnpj` já existente, para não quebrar vendas, importações, análises, PDVs, relatórios e o motor de cadastro central que já cruzam clientes por esse campo. Registros atuais recebem `'CNPJ'` por padrão, sem alteração de valores.
- Índice único atual de CNPJ é mantido; ele passa a cobrir também CPFs (o valor é o documento, com máscara normalizada).
- `src/lib/cnpjLookup.ts`: acrescentar `isValidCpf` e `maskCpf` (validação local, sem nenhuma consulta externa a dados pessoais).
- `src/types/clientProfile.ts`: campo `tipo_documento` no tipo e no formulário.
- `src/hooks/useClientProfiles.ts`: mapear `tipo_documento` na leitura/gravação e no merge; `findClientProfileByCnpj` passa a aceitar 11 ou 14 dígitos (já compara por dígitos).
- `src/components/cadastro/ClientProfileDialog.tsx`: seletor de tipo, rótulos dinâmicos, máscara/validação condicional, consulta automática só para CNPJ, limpeza ao trocar de tipo, validação do documento no salvamento, mensagens de duplicidade com o rótulo certo.
- `ClientProfileViewer.tsx`, `clientProfilePdf.ts`, `CadastroClientesPage.tsx`: rótulo correto e formatação por tipo.
- Sem mudanças em cálculos de vendas, metas, comissões ou importações.

## Verificação

Testes no navegador cobrindo: cadastro por CNPJ com consulta automática, cadastro por CPF preenchido manualmente, CPF inválido, CNPJ inválido, CPF e CNPJ já existentes, edição de ficha de cada tipo, e busca por CPF e por CNPJ.
