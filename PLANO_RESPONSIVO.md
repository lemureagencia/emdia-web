# Plano de Implementação: Design Responsivo (Mobile)

Este documento detalha o plano para tornar o sistema responsivo, garantindo que o layout, o menu lateral e as áreas de conteúdo fiquem perfeitamente utilizáveis em celulares e tablets.

## Perguntas em Aberto / Decisões
1. O menu lateral atual (Sidebar) ocupa 260px fixos. No celular, a proposta é transformá-lo em um menu gaveta (drawer) que desliza da esquerda para a direita, acionado por um botão de "hamburguer" no cabeçalho. Você concorda com essa interação?
2. Para tabelas (como a de Transações e Pendentes), que costumam "quebrar" no celular, a proposta é manter uma barra de rolagem horizontal suave, para que você possa arrastar a tabela para os lados sem quebrar o layout da tela. Isso é mais fácil de manter. Deseja manter assim ou prefere transformar cada linha da tabela em um "cartão" em telas pequenas?

## Alterações Propostas

### 1. Layout & Navegação (`src/components/layout`)

*   **DashboardLayout:** 
    *   Adicionar controle de estado (aberto/fechado) para o menu mobile.
    *   Passar esse estado para a Sidebar e para o Header.
    *   Adicionar um fundo escurecido (backdrop) quando o menu estiver aberto no celular, para o usuário poder clicar e fechar.
*   **Sidebar:**
    *   No celular, ficará fixa à esquerda, inicialmente fora da tela (`transform: translateX(-100%)`).
    *   Quando acionada, deslizará para dentro da tela suavemente.
    *   No computador (telas acima de 1024px), o menu continua fixo normalmente como já é hoje.
    *   Adicionar um botão de "fechar" dentro do menu para mobile, e fechar o menu ao clicar em algum link.
*   **Header:**
    *   Adicionar o ícone de menu (hamburguer) alinhado à esquerda, que só vai aparecer no celular, para poder abrir a Sidebar.

### 2. Dashboard e Páginas de Conteúdo (`src/pages`)

*   **Dashboard.module.css:**
    *   Ajustar os grids (resumos, gráficos) para que em telas menores fiquem em 1 coluna (um abaixo do outro), melhorando a leitura.
    *   Ajustar margens e espaçamentos no celular (no computador continua igual).
*   **Transactions / Pending:**
    *   Garantir que a barra de ferramentas (filtros e botões) se adapte quebrando linhas (flex-wrap) caso falte espaço.
    *   Garantir que os `containers` das tabelas tenham `overflow-x: auto` e que a rolagem seja fluida no toque (`-webkit-overflow-scrolling: touch`).
    *   Ajustar tamanhos de fonte e paddings para melhorar a leitura em telas pequenas.

## Como Validar Após a Execução
1. Testar o projeto pelo celular ou simulando um celular no painel de desenvolvedor do navegador.
2. Clicar no botão de menu hamburguer para verificar se a barra lateral abre e fecha corretamente.
3. Verificar a rolagem das tabelas em Transações.
4. Garantir que o design no Desktop continua intacto sem nenhuma alteração.
