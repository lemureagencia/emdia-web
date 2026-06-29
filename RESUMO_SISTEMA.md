# EmDia — Resumo do Sistema

Organizador financeiro (pessoal e empresarial) com **painel web** + **agente de IA no WhatsApp**.
Visual premium inspirado em Notion/Stripe, com tema claro/escuro e responsivo.

> Última atualização: 29/06/2026 (sessão 5).

---

## 1. Visão geral da arquitetura

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  App Web (EmDia)│────▶│   Supabase (banco)   │◀────│  Agente WhatsApp     │
│ React+Vite      │     │  Postgres + RLS      │     │  Python/FastAPI      │
│ Vercel          │     │  + funções RPC       │     │  (VPS/Easypanel)     │
└─────────────────┘     └──────────────────────┘     └──────────┬──────────┘
                                                                 │
                                          Zernio (WhatsApp oficial, coexistência)
                                                                 │
                                                          WhatsApp do cliente
```

- **App web**: o usuário gerencia finanças pela tela.
- **Supabase**: banco único, compartilhado pelo app e pelo agente. Toda regra/dado mora aqui.
- **Agente**: recebe mensagens no WhatsApp, interpreta com IA e grava/consulta no Supabase.

---

## 2. Conceito central: Transações × Pendências

O sistema separa **dinheiro que já se moveu** de **dinheiro que ainda vai se mover**. Tudo vive na
mesma tabela `transactions`, diferenciado pela coluna **`status`**:

| Aba | `status` | O que é | Exemplos |
|-----|----------|---------|----------|
| **Transações** | `paid` | Já concluído (entrou/saiu) | Cliente pagou, paguei uma conta |
| **Pendências** | `pending` | Ainda em aberto | Cliente que vai pagar, conta a pagar, vencidos |

- Apagar/editar em **Transações** não afeta **Pendências** (cada aba filtra seu `status`).
- Quando uma pendência é marcada como paga (✓), ela **migra** para Transações automaticamente.
- **Parcelamento** gera parcelas futuras (pendentes) → fica na aba **Pendências**.

### Terminologia (Entradas / Saídas)
- **Entrada** = receita (dinheiro que entra). **Saída** = despesa (dinheiro que sai).
- No Painel: **Entradas/Saídas** = pagos (de Transações); **A Receber / A Pagar / Vencidos** = pendentes (de Pendências).

### Campos "Nome" e "Descrição"
- A coluna **Nome** (cliente) é guardada no campo `category` do banco.
- A coluna **Descrição** (o que foi vendido/pago) é o campo `description`.
- (Registros antigos podem ter esses dois trocados — corrigir pelo botão **Editar**.)

---

## 3. App Web (Front-end)

- **Stack**: React + Vite + TypeScript, CSS puro (design system próprio), Recharts, Lucide Icons.
- **Hospedagem**: **Vercel** → https://emdia-web.vercel.app (deploy automático a cada push no `main`).
- **GitHub**: `github.com/lemureagencia/emdia-web` (público).
- **Auth**: Supabase Auth (e-mail/senha), com auto-confirmação ligada.
- **Idioma**: Português (BR). Datas/moeda em pt-BR (R$).

### Telas
- **Login / Cadastro** — com logo da marca.
- **Painel** (Dashboard):
  - **Saldo na Conta** → valor **manual** (você digita quanto tem no banco). Isolado.
  - **Entradas / Saídas** → soma dos lançamentos **pagos** (Transações).
  - **Pendências do mês**: A Receber, Contas a Pagar, Vencidos — só do **mês atual + atrasados**.
  - Gráficos (ilustrativos).
- **Transações**: lista **apenas concluídos** (`status='paid'`). Cria movimentação já paga/recebida
  (tipo Entrada/Saída, forma de pagamento, data, valor, Nome do cliente, destinar a meta).
  Colunas: **Nome** · **Descrição** · Data · Tipo · Situação · Forma · Valor. Tem **Editar** ✏️ e Excluir.
  - **Tipo de serviço/produto** (opcional): dropdown com serviços cadastrados + criação inline.
- **Pendências**: itens em aberto (a receber / a pagar / vencidos), com **filtro** de abas:
  **Todos · A receber (clientes) · A pagar (contas) · Vencidos**. Marcar como pago ✓, **Editar** ✏️,
  Excluir. Suporta **parcelamento** (gera N parcelas mês a mês).
  - Formulário com ordem: **Nome do cliente → Descrição → Valor + Data de Vencimento**.
  - **Descrição**: dropdown com itens do Catálogo + campo de texto livre. Sem auto-save e sem exclusão aqui — gerenciamento exclusivo na página Catálogo.
- **Catálogo**: página dedicada (`/catalog`) para gerenciar **descrições padrão** (produtos, serviços, tipos de pendência). CRUD completo: adicionar, editar inline (Enter salva / Esc cancela), excluir. Alimenta o dropdown de Descrição em Pendências e o agente do WhatsApp.
- **Metas**: progresso (quanto falta / quanto chegou / %). Tem **Editar** ✏️.
- **Conectar Agente**: gerencia os números de WhatsApp do usuário. Badge do plano (Mensal/Semestral/Anual/Admin), lista de números com remoção, contador de slots, botão "Adicionar" bloqueado ao atingir limite.
- **Tela de Ativação** (`PlanActivation`): exibida automaticamente quando `plan = null`. Mostra os 3 planos com preços e links do Kiwify. Botão "Já comprei — verificar ativação" atualiza sem precisar sair.

### Saldo em conta (manual)
O "Saldo na Conta" é digitado pelo usuário (campo em Transações) e guardado em `profiles.current_balance`.
Quando o agente registra algo **pago**, ele soma/subtrai desse saldo automaticamente.

---

## 4. Supabase (Back-end / Banco)

- **Projeto**: `https://vwlscymvrtmkuejtkies.supabase.co`
- **Segurança**: RLS ativo — cada usuário só vê os próprios dados.

### Tabelas
- **profiles**: `id`, `full_name`, `phone` (WhatsApp legado), `current_balance` (saldo manual), `plan` (`mensal`/`semestral`/`anual`, **default `null`** — sem plano até comprar), `plan_expires_at` (data de expiração), `is_admin` (boolean, acesso total sem bloqueio).
- **transactions**: `type` (income/expense), `status` (paid/pending), `amount`, `description` (= Descrição),
  `category` (= **Nome** do cliente), `service_type` (tipo de serviço/produto, opcional), `due_date`, `paid_date`, `payment_method` (pix/card/cash),
  parcelas (`installments`, `installment_number`, `installment_group`), `goal_id`.
- **goals**: `title`, `target_amount`, `current_amount`, `deadline`.
- **services**: `user_id`, `name` — categorias de serviço/produto criadas pelo usuário (usado no campo `service_type`).
- **descriptions**: `user_id`, `text` — catálogo de descrições padrão do usuário (gerenciado pela página Catálogo; aparece no dropdown de Pendências e é consultado pelo agente).
- **user_phones**: `user_id`, `phone` — múltiplos números de WhatsApp por usuário. Limite pelo plano: mensal=1, semestral=2, anual=4. Gerenciado pela página Conectar Agente.
- **pending_plans**: `email`, `plan`, `expires_at` — plano aguardando o usuário criar conta. Preenchido pelo webhook do Kiwify quando o email não existe ainda. Limpo automaticamente ao criar conta (trigger).
- **agent_messages**: memória curta da conversa do agente (`phone_norm`, `role`, `content`, `created_at`).

### Funções (RPC) usadas pelo agente (executadas só com a service_role)
- `_phone_to_user_id(phone)` → helper interno: busca `user_id` checando `profiles.phone` **e** `user_phones` (suporta múltiplos números).
- `get_summary_by_phone(phone)` → resumo completo: saldo, recebido/pago do mês, a receber/pagar (do mês),
  vencidos, lista de pendências (com `category`/Nome) e metas.
- `get_financial_summary(user_id)` → inclui `received_month` e `paid_month` (entradas/saídas **já realizadas no mês**).
- `get_pending_items(user_id)` → retorna pendências com `service_type`.
- `agent_register_by_phone(...)` → registra transação (aceita `p_category` = Nome do cliente, `p_service_type` = tipo de serviço); se **paga**, ajusta o Saldo na Conta.
- `get_descriptions_by_phone(phone)` → retorna catálogo de descrições do usuário pelo telefone (usado pelo agente para matching).
- `agent_set_balance_by_phone(phone, valor)` → define o saldo.
- `agent_log_message(phone, role, content)` / `agent_recent_messages(phone, limit)` → memória da conversa.
- `canon_phone(p)` → normaliza telefone BR (casa número **com ou sem** o 9).
- `set_plan_by_email(email, plan, expires_at)` → atualiza `profiles.plan` pelo email. Se o usuário não existe ainda, salva em `pending_plans`. Chamada pelo webhook do Kiwify.
- `apply_pending_plan()` → **trigger** em `profiles` (INSERT): ao criar conta, verifica `pending_plans` pelo email e aplica o plano automaticamente, depois limpa o registro.

### Scripts SQL (na raiz do projeto)
`schema.sql`, `agent_setup.sql`, `agent_actions.sql`, `canon_phone.sql`, `fix_summary_month.sql`,
`entradas_mes.sql` (received_month/paid_month), `agent_memory.sql` (tabela + RPCs de memória),
`services_setup.sql` (tabela services + RLS), `descriptions_setup.sql` (tabela descriptions + RLS),
`catalog_setup.sql` (UPDATE policy em descriptions + RPC `get_descriptions_by_phone`),
`plans_setup.sql` (planos + tabela `user_phones` + RLS + migração + RPCs atualizados),
`kiwify_setup.sql` (tabela `pending_plans` + função `set_plan_by_email` + trigger `apply_pending_plan`).

---

## 5. Agente de IA no WhatsApp (pasta `agent/`)

Serviço **Python (FastAPI)** que conecta o WhatsApp ao EmDia.

### Fluxo
```
Cliente manda no WhatsApp
  → Zernio (API oficial, coexistência) dispara webhook "message.received"
  → Agente identifica o cliente pelo número (profiles.phone)
  → Recupera memória da conversa (agent_messages)
  → Groq (LLM) interpreta / compõe a resposta
  → Supabase grava/consulta (dados reais, sem alucinação)
  → Agente responde via Zernio → WhatsApp
```

### Componentes
- **Transporte WhatsApp**: **Zernio** (oficial, coexistência). `TRANSPORT=zernio`. (Evolution API é legado/desligado.)
- **IA**: **Groq** (`llama-3.3-70b-versatile`).
- **Arquivos**: `main.py` (webhook WhatsApp + rota Kiwify), `zernio.py` (envio/recebimento), `handler.py` (lógica/respostas),
  `llm.py` (interpretação + modo inteligente), `emdia.py` (RPC Supabase), `config.py`, `installments.py`,
  `kiwify.py` (webhook Kiwify → atualiza plano no banco).
- **`_fix_spacing()`** em `handler.py`: pós-processamento que colapsa 2+ linhas em branco para exatamente 1 em todas as respostas.
- **Hospedagem**: **VPS via Easypanel** (Docker).
  - URL: `https://evolution-emdia-agent.iyrj6w.easypanel.host`
  - Repositório: `github.com/lemureagencia/emdia-agent` (branch `main`)
  - Variáveis (chaves) ficam nas **Environment** do Easypanel (não no código).
  - **Deploy**: a cada push na `main`, clicar **Deploy** no Easypanel (ou auto-deploy, se ativo).

### Como o agente funciona (importante)
- **Escrita** (registrar / definir saldo) → caminho **estruturado e seguro**: o LLM extrai os campos e o
  Python grava valores exatos no banco (sem inventar número). Separa **Nome do cliente** da **Descrição**.
- **Leitura** (perguntas) → **MODO INTELIGENTE**: o LLM recebe o panorama financeiro real + o histórico
  da conversa e **compõe** a resposta. Responde perguntas compostas ("contas a pagar **e** clientes a receber"),
  variadas e com filtro de mês. Regra forte: usar só os números fornecidos, nunca inventar. Se o LLM falhar,
  cai numa resposta estruturada (rede de segurança).
- **Memória de conversa**: lembra as últimas mensagens por número (resolve "e a receber?", "me refiro ao próximo mês").
- **Distingue conceitos**: "entradas/recebi" (já entrou) ≠ "a receber/esperada" (pendente). Rótulos com o nome
  do mês (ex.: "junho").
- **Service type**: o snapshot financeiro inclui `[serviço: X]` para itens com `service_type`, permitindo perguntas como "quantos clientes do tráfego estão devendo?"
- **Catálogo de descrições**: o agente busca as descrições padrão do cliente (`get_descriptions_by_phone`) e as inclui no prompt do LLM. Se a descrição da mensagem corresponder a uma cadastrada, o LLM usa o texto exato.
- **Formatação das listagens**: respostas de lista (clientes/contas) seguem formato fixo — nome em *negrito*, sub-linhas com Serviço / Valor / Data, 1 linha em branco entre itens. Espaçamento garantido por código (`_fix_spacing`), não pelo LLM.

### Exemplos que o agente entende
- Registrar: *"paguei 150 de luz no pix"*, *"recebi 2000 da Maria de consultoria"*,
  *"cadastre a cliente Juliana Chieppe, serviço de vídeos, 2000 pro dia 30"* (vira pendência com Nome=Juliana).
  O agente também preenche o campo `service_type` quando identifica o tipo de serviço.
- Saldo: *"qual meu saldo?"*, *"meu saldo é 3000"*.
- Consultas: *"quanto recebi esse mês?"* (entradas), *"quanto tenho a receber?"* (esperado),
  *"quais contas a pagar e quais clientes faltam pagar?"* (resposta com as duas seções),
  *"quais contas estão vencidas?"* (lista com nomes), *"resumo"*.

### Regras de acesso
- **Só responde quem está cadastrado** (`profiles.phone`). Número desconhecido → silêncio total.
- **Multi-tenant**: cada cliente cadastra o próprio WhatsApp e vê só os dados dele.
- Casamento de telefone tolerante ao **9º dígito** (com ou sem o 9).
- Pago/recebido ajusta o Saldo na Conta; pendente vira conta a pagar/receber (não mexe no saldo).

---

## 6. Onde está cada coisa

| Item | Local |
|------|-------|
| App web | Vercel · https://emdia-web.vercel.app |
| Código do app (web) | GitHub `lemureagencia/emdia-web` (público) · pasta raiz (`src/`) |
| Banco/funções | Supabase (`vwlscymvrtmkuejtkies`) |
| Agente (código) | pasta `agent/` · GitHub `lemureagencia/emdia-agent` |
| Agente (rodando) | Easypanel · `https://evolution-emdia-agent.iyrj6w.easypanel.host` |
| WhatsApp | Zernio (coexistência) · número robô +55 11 97817-6498 |

---

## 7. Credenciais e tokens de acesso

> ⚠️ **SEGREDO. Valores reais ficam SOMENTE em `credenciais.md` (arquivo local, no .gitignore).**
> Este arquivo é público — não escreva tokens aqui. Rotacione periodicamente.

### Supabase (projeto `vwlscymvrtmkuejtkies`)
- API URL: `https://vwlscymvrtmkuejtkies.supabase.co`
- Publishable key (frontend): ver `credenciais.md`
- Secret / service_role key (servidor/agente): ver `credenciais.md`
- Management token (rodar SQL via API): ver `credenciais.md`

### Netlify (legado — migrou para Vercel)
- Site: `emdia-financas` · id `90c48fa9-ae6d-45c1-939d-a9a6c2346c09` (créditos esgotados, não utilizado)

### GitHub
- **Repo web** (`lemureagencia/emdia-web`): público, deploy automático via Vercel.
- **Repo agent** (`lemureagencia/emdia-agent`): privado.
- Personal Access Token: ver `credenciais.md`
- Uso no push: `git push https://lemureagencia:<TOKEN>@github.com/lemureagencia/emdia-agent.git main`

### Easypanel / Groq / Zernio
- Chaves do agente (Groq, Zernio, Supabase service_role) ficam nas **Environment** do serviço no Easypanel.

---

## 8. Como publicar mudanças

| Onde mudou | Como publicar |
|------------|----------------|
| **Banco** (arquivo `.sql`) | Rodar o SQL no SQL Editor do Supabase (ou via Management API com o token). |
| **App web** (`src/`) | `git push origin main` → Vercel faz deploy automático. |
| **Agente** (`agent/`) | `git push` na `main` do `emdia-agent` → **Deploy** no Easypanel. |

---

## 10. Histórico de mudanças recentes

### Sessão 5 — 29/06/2026

#### Painel: Vencidos separados por tipo
- Card único "Vencidos" substituído por dois cards: **Vencidos a Receber** (amarelo) e **Vencidos a Pagar** (vermelho).
- Cálculo em `Dashboard.tsx`: `overdueIncome` (type=income) e `overdueExpense` (type=expense) separados.

#### Agente: Transcrição de áudio via Groq Whisper
- Usuário pode enviar **mensagem de áudio** no WhatsApp; o agente transcreve e responde normalmente.
- **Fluxo**: Zernio envia webhook com `message.attachments[{type:"audio", url:...}]` → agente baixa o arquivo com auth Bearer → Groq `whisper-large-v3` transcreve em pt-BR → texto vai para o handler normal.
- **Sem nova chave de API**: usa a mesma `LLM_API_KEY` do Groq já configurada no Easypanel.
- **Dedup antes da transcrição**: evita chamar o Whisper duas vezes quando o Zernio reenvia o webhook.
- **Arquivos novos/alterados no `emdia-agent`**:
  - `transcribe.py` *(novo)*: baixa áudio e chama `openai.audio.transcriptions.create()` apontando para `api.groq.com`.
  - `zernio.py`: `parse_webhook` agora retorna 5 valores `(phone, text, msg_id, conv, audio_url)`; detecta áudio em `msg.attachments`; expõe `get_download_headers()` com Bearer token.
  - `main.py`: dedup por `msg_id` antes de transcrever; chama `transcribe.transcribe_audio(url, headers)` quando `audio_url` presente.
  - `config.py`: `GROQ_API_KEY` com fallback automático para `LLM_API_KEY` quando `LLM_PROVIDER=groq`.
  - `evolution.py`: `parse_webhook` ajustado para retornar 5 valores (compatibilidade).

#### App Web: Layout responsivo mobile
- **Sidebar drawer**: em telas `≤768px` a sidebar some e aparece deslizando pela esquerda ao tocar no ☰. Overlay escuro ao fundo. Fecha ao navegar ou tocar fora.
- **Hamburguer (☰)**: adicionado no `Header` — visível só em mobile (`display:none` em desktop).
- **Grids**: `minmax` reduzido de 220-240px → 160px nos cards de resumo (Painel e Pendências), permitindo 2 colunas em smartphones. Metas: 300px → 260px.
- **Tabelas**: padding de células reduzido em `≤640px` (`spacing-2/3` em vez de `spacing-3/4`).
- **Content padding**: reduzido de `spacing-6` → `spacing-4` em mobile.
- **Transações**: `balanceBar` empilha verticalmente em mobile; `balanceInput` passa para 100% de largura.
- **Arquivos alterados**: `DashboardLayout.tsx/.css`, `Header.tsx/.css`, `Sidebar.tsx/.css`, `Dashboard.module.css`, `Pending.module.css`, `Goals.module.css`, `Transactions.module.css`.

#### Escalabilidade: análise para MVP
- Arquitetura atual suporta confortavelmente **até ~150 usuários** sem alterações.
- Limitante real: plano grátis do Groq (30 req/min LLM, 20 req/min Whisper). Plano pago (~$10-20/mês) eleva o teto para 300-400 usuários.
- `requests` síncrono no agente: baixo impacto para uso típico de app financeiro (5-20 msgs/dia/usuário); prioridade quando ultrapassar 400 usuários.

---

### Sessão 4 — 27/06/2026

#### Integração Kiwify + Bloqueio por plano

**Kiwify:**
- Produto **"Emdia"** (`85e280f0-...`) com 3 assinaturas: Mensal (R$19,90/mês), Semestral (R$97,00), Anual (R$120,00).
- Webhook registrado no Kiwify: `"EmDia - Ativa plano"` → ouve `compra_aprovada`, `subscription_renewed`, `subscription_canceled`, `compra_reembolsada`.
- URL do webhook: `https://evolution-emdia-agent.iyrj6w.easypanel.host/webhook/kiwify?token=<ver credenciais.md>`.

**Agente Python (`emdia-agent`):**
- `kiwify.py`: processa o payload do Kiwify, mapeia plano pelo ID ou nome da assinatura, chama `set_plan_by_email`.
- `main.py`: nova rota `POST /webhook/kiwify` com verificação de token por query param.
- `config.py`: variável `KIWIFY_WEBHOOK_TOKEN` (definida no Easypanel).

**Banco (rodado via Management API):**
- `profiles.plan_expires_at` adicionado.
- `profiles.is_admin` adicionado; `contatodejefferson@gmail.com` marcado como admin.
- `profiles.plan` default removido → novos cadastros começam com `plan = null`.
- Tabela `pending_plans`: guarda plano para emails sem conta ainda.
- Função `set_plan_by_email`: atualiza plano ou salva em `pending_plans` se usuário não existe.
- Trigger `apply_pending_plan` em `profiles` INSERT: aplica e remove o plano pendente automaticamente ao criar conta.

**App web:**
- `AuthContext`: expõe `profile` (plan + is_admin) e `refreshProfile()`. Aguarda perfil carregar antes de liberar o layout (sem flash de conteúdo).
- `DashboardLayout`: redireciona para `PlanActivation` quando `plan = null` e não é admin.
- `PlanActivation`: tela com cards dos 3 planos, preços, links Kiwify e botão "Já comprei — verificar ativação".

**Fluxos suportados:**
1. Cria conta → compra: webhook ativa plano na hora.
2. Compra → cria conta: plano fica em `pending_plans`, trigger aplica no cadastro.
3. Admin (`is_admin=true`): nunca bloqueado, sem limite de números.

---

### Sessão 3 — 27/06/2026

#### Planos e múltiplos números de WhatsApp
- **Sistema de planos**: campo `plan` em `profiles` (`mensal`/`semestral`/`anual`). Limites: mensal=1, semestral=2, anual=4 números.
- **Tabela `user_phones`**: múltiplos números por conta, com RLS. Números existentes em `profiles.phone` migrados automaticamente pelo `plans_setup.sql`.
- **RPC helper `_phone_to_user_id`**: todas as funções do agente agora buscam o usuário em `profiles.phone` **e** `user_phones` — suporta múltiplos números sem alterar o agente Python.
- **Página Conectar Agente reformulada**:
  - Badge do plano atual (Mensal / Semestral / Anual) com cores distintas.
  - Lista dos números cadastrados com botão de remover.
  - Contador de slots usados (X de N).
  - Formulário de adicionar número (bloqueado ao atingir limite, com mensagem de upgrade).
  - Banner verde "Número salvo com sucesso!" após salvar (3 segundos, com animação).
  - Banner vermelho para erros (número duplicado, etc.).
- **Banco**: rodar `plans_setup.sql` no Supabase SQL Editor.

---

### Sessão 2 — 27/06/2026

#### Funcionalidades novas
- **Catálogo de Descrições** (`/catalog`): nova página no menu lateral para gerenciar descrições padrão (produtos, serviços, tipos de pendência). CRUD completo com edição inline.
- **Agente reconhece catálogo**: ao receber mensagem no WhatsApp, o agente busca as descrições cadastradas e usa o texto exato quando há correspondência.
- **Listagem formatada no WhatsApp**: clientes/contas listados com nome em negrito, serviço, valor e data em linhas separadas; exatamente 1 linha em branco entre itens (garantido por `_fix_spacing` no código).
- **Data de vencimento nas listagens**: agente sempre informa "📅 Vence em" ou "⚠️ Vencido em" para cada item listado.

#### Ajustes no formulário de Pendências
- **Campo "Tipo de serviço/produto" removido** do formulário (gerenciamento centralizado no Catálogo).
- **Bloco de descrição simplificado**: apenas dropdown do catálogo + campo livre. Removidos tags com exclusão e auto-save.
- **Nova ordem dos campos**: Nome do cliente → Descrição → Valor + Data de Vencimento.

#### Banco (SQL rodado no Supabase)
- `catalog_setup.sql`: política `UPDATE` em `descriptions` + RPC `get_descriptions_by_phone`.

---

### Sessão 1 — 27/06/2026

#### Funcionalidades novas
- **Edição em todas as abas**: Metas, Transações e Pendências agora têm botão ✏️ para editar registros.
- **Campo "Tipo de serviço/produto"**: dropdown em Transações com serviços criados pelo usuário (tabela `services`).
- **Descrições padrão em Pendências**: dropdown com descrições salvas + texto livre (tabela `descriptions`).

#### Infraestrutura
- **Migração Netlify → Vercel**: deploy automático a cada push no GitHub (`lemureagencia/emdia-web`).
- **GitHub**: repo web público, repo agent privado (`lemureagencia/emdia-agent`).
- **Banco**: criadas tabelas `services` e `descriptions` com RLS.
- **Agente**: atualizado para aceitar `p_service_type` no registro, exibir `[serviço: X]` no snapshot.

---

## 9. Próximos passos / ideias
- Exibir aviso de plano próximo do vencimento (checar `plan_expires_at` no painel).
- Painel admin para visualizar todos os clientes, planos e status (só para `is_admin=true`).
- Editar registros pelo agente do WhatsApp (ex.: *"muda o valor da Nicole pra 1500"*).
- Agente capturar forma de pagamento/meta também.
- ~~Mensagens de áudio no WhatsApp (transcrição) para o agente.~~ ✅ Feito na sessão 5.
- ~~Editar registros pelo WhatsApp.~~ ✅ Feito na sessão 6.
- ~~Gráficos do Painel com dados reais por mês.~~ ✅ Feito na sessão 6.
- ~~Aviso de plano próximo do vencimento no app web.~~ ✅ Feito na sessão 6.
- ~~Confirmação antes de excluir/editar/marcar pago + ponte de quitação (anti-duplicação).~~ ✅ Feito na sessão 6.
- Avaliar mover o agente para serverless (Vercel) e aposentar a VPS.
- **Rotacionar as chaves** periodicamente (boa prática de segurança).
- Atualizar `agent_setup.sql` e `agent_actions.sql` no repo do agent com as novas colunas.
