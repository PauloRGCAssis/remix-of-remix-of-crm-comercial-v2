# Corrigir visualização, abertura e download dos PDFs

## Objetivo
Eliminar completamente a navegação para URLs `blob:` e manter um único PDF por ação, sem alterar conteúdo, cálculos ou layout do relatório.

## Implementação
- Instalar `pdfjs-dist` em versão compatível com React/Vite.
- Gerar o PDF uma única vez em bytes (`ArrayBuffer`/`Uint8Array`).
- Renderizar todas as páginas diretamente no modal com PDF.js e canvas responsivo, sem `iframe`, `embed` ou `object`.
- Reutilizar o bucket privado existente `client-pdfs` para salvar uma cópia temporária por usuário e relatório.
- Ajustar as regras do bucket, se necessário, para garantir que cada usuário acesse apenas seus próprios relatórios.
- Criar uma URL HTTPS assinada de curta duração para “Abrir em nova aba” e “Baixar PDF”.
- Garantir que os três botões usem exatamente os mesmos bytes, exibindo mensagens claras quando a renderização ou o envio falhar.
- Limpar o estado visual, canvases e referências ao fechar ou trocar de cliente.

## Validação
- Verificar que o código não usa mais `blob:` para visualizar, abrir ou baixar esse relatório.
- Testar Arena Paris BH e outro cliente no navegador: modal PDF.js, rolagem de todas as páginas, URL HTTPS em nova aba e download íntegro.
- Comparar páginas e texto do arquivo baixado com os bytes usados no preview.
- Conferir console, requisições, tipos, testes e compilação.
- Testar o endereço publicado atual sem publicar novas alterações; a validação da correção publicada exigirá publicação posterior.

## Observação técnica
O `ERR_BLOCKED_BY_CLIENT` indica bloqueio no cliente/navegador. O fluxo atual confirma que preview, nova aba e download dependem da mesma URL `blob:`; por isso, trocar apenas o contêiner não eliminou a causa. A nova solução usa PDF.js localmente e Storage privado com URL assinada HTTPS.
