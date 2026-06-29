# Diagnóstico e correções do agente WhatsApp — EmDia

> Registro da análise de erros/ambiguidades do agente e das correções aplicadas.
> Sessão 6 — 29/06/2026.

O agente lê uma mensagem no WhatsApp, interpreta com IA (Groq) e grava/consulta no
Supabase. Este documento lista o que podia dar errado, no formato **Antes → Agora → Risco**.

---

## 🔴 Corrigidos (prioridade crítica/alta)

### 1. "recebi 2000 da Maria" duplicava a pendência
- **Antes:** o agente sempre criava um **lançamento novo pago**. Se a Maria já tinha
  uma pendência de R$ 2.000 a receber, ela continuava aberta E aparecia uma entrada
  nova → **conta em dobro, silenciosa**.
- **Agora:** antes de registrar, procura uma pendência aberta do mesmo lado com aquele
  nome. Se acha, pergunta: *"Você já tem esta pendência em aberto: Maria — R$ 2.000.
  Quer dar baixa nela? sim / não"*. **Sim** = quita a existente (não duplica).
  **Não** = registra um lançamento novo separado.
- **Risco que tinha:** pendências fantasmas acumulando; o "a receber" nunca batia.

### 2. Exclusão imediata e irreversível
- **Antes:** *"cancela a conta de luz"* deletava na hora, sem perguntar. `DELETE` não
  tem desfazer.
- **Agora:** mostra o item exato e avisa *"⚠️ isso apaga a pendência e não pode ser
  desfeito. sim / não"*. Só exclui após **sim**.
- **Risco que tinha:** item casado errado (ou engano) apagava dado real, sem volta.

### 3. Marcar como pago mexia no saldo com o sinal errado
- **Antes:** *"Maria pagou"* marcava a primeira pendência que casava, **sem olhar o
  tipo**. Se "Maria" era fornecedora (a pagar), **subtraía** do saldo quando deveria
  somar (ou vice-versa).
- **Agora:** antes de confirmar, mostra o **lado** (a receber/a pagar) e o **efeito**
  (*"vou somar no saldo"* / *"vou subtrair do saldo"*). O cliente vê e confirma.
- **Risco que tinha:** saldo errado, descoberto só muito depois.

### 4. Editar/excluir parava de funcionar quando o Groq caía
- **Antes:** no modo de regras (sem IA), o termo de busca de *"muda o valor da Juliana
  para 1800"* virava a frase inteira → não casava com nada → *"não encontrei"*.
- **Agora:** o fallback extrai certo: nome = "Juliana", novo valor = 1800; e em
  *"cancela a conta de luz"* limpa o verbo → busca "conta de luz". Funciona **mesmo
  sem o Groq** (importante no plano grátis: 30 req/min).
- **Risco que tinha:** em pico ou queda da IA, editar/marcar pago não respondia.

### 8. "150 mil" registrava R$ 150
- **Antes:** o parser só lia dígitos → *"recebi 150 mil"* virava **R$ 150** (1000× menor).
- **Agora:** entende **"mil"** e **"k"** (*"2k"* = R$ 2.000).
- **Risco que tinha:** valores 1000× errados no caixa.

---

## ⚙️ Como funciona o fluxo de confirmação (técnico)

- Toda ação destrutiva/ambígua (excluir, marcar pago, editar, quitar) **não executa
  direto** — guarda a intenção na tabela `agent_confirmations` e pergunta.
- A confirmação **expira em 10 minutos** (some sozinha se o cliente não responder).
- Um **"sim/não" não chama a IA** (mais rápido, economiza requisição do Groq).
- Se o cliente responder **outra coisa** em vez de sim/não, a ação é **abandonada por
  segurança** — nada destrutivo acontece sem confirmação explícita.

**Arquivos envolvidos:**
- Banco: `agent_confirm.sql` (tabela `agent_confirmations` + RPCs `set`/`get`/`clear`).
- Agente: `emdia.py` (chamadas RPC), `handler.py` (fluxo + executor), `llm.py` (fallback
  de regras + parser de valor).

---

## 🟡 Ainda em aberto (médio/baixo — não corrigidos ainda)

| # | Ponto | Risco atual |
|---|-------|-------------|
| 6 | Busca genérica ("cancela a conta") | Se só 1 item casar, pode ser o errado — mitigado pela confirmação, mas a busca ainda é ampla |
| 7 | `find_pending` retorna só **5** itens | Cliente com muitas pendências do mesmo nome: a certa pode ficar fora dos 5 |
| 9 | `definir_saldo` sobrescreve sem confirmar | *"saldo é 30000"* (dígito a mais) troca o saldo calado |
| 10 | "dia 15" / fim de mês | Casos de borda (dia 31, fevereiro) podem gerar data estranha |
| 11 | Dedup em memória zera no redeploy | Mensagem reprocessada após deploy pode registrar de novo |
| 12 | Mensagem quebrada em duas | *"recebi 2000"* + *"da Maria"* (separado): o nome se perde |
| 13 | Áudio mal transcrito | Whisper pode ouvir valor errado e registrar sem o cliente notar |

---

## Exemplo de conversa (depois das correções)

```
Você: maria pagou
Bot:  Confirmar baixa: *Maria* — videos — R$ 2.000,00 (a receber, vence 10/07/2026)
      Vou marcar como recebido e somar no saldo. Responda *sim* ou *não*.
Você: sim
Bot:  ✅ *Maria* marcado como recebido. Saldo na conta: R$ 2.500,00.
```
