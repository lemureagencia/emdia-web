-- =====================================================================
-- EmDia · Expõe "Entradas/Saídas JÁ realizadas no mês" para o agente
-- =====================================================================
-- Problema: o agente confundia "receitas do mês" (o que JÁ entrou/foi
-- recebido) com "receita esperada / a receber" (pendente). A RPC só
-- tinha o total recebido de TODOS os tempos (total_income) e o a receber.
--
-- Esta migração acrescenta dois campos escopados ao MÊS CORRENTE:
--   received_month -> entradas pagas/recebidas neste mês
--   paid_month     -> saídas pagas neste mês
-- Mês definido por coalesce(paid_date, created_at::date) — usa a data do
-- pagamento; se faltar (dados antigos), cai na data de criação.
--
-- Mantém intactos os demais campos (incl. a lógica de mês do
-- fix_summary_month.sql para expected_income / bills_to_pay).
-- Rode no SQL Editor do Supabase (projeto vwlscymvrtmkuejtkies).
-- =====================================================================

create or replace function public.get_financial_summary(p_user_id uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'balance',         coalesce(sum(amount) filter (where type = 'income'  and status = 'paid'), 0)
                     - coalesce(sum(amount) filter (where type = 'expense' and status = 'paid'), 0),
    -- Totais pagos de TODOS os tempos (mantidos por compatibilidade)
    'total_income',    coalesce(sum(amount) filter (where type = 'income'  and status = 'paid'), 0),
    'total_expense',   coalesce(sum(amount) filter (where type = 'expense' and status = 'paid'), 0),
    -- NOVO: já recebido / já pago DENTRO DO MÊS CORRENTE
    'received_month',  coalesce(sum(amount) filter (
                         where type = 'income' and status = 'paid'
                           and coalesce(paid_date, created_at::date) >= date_trunc('month', current_date)
                           and coalesce(paid_date, created_at::date) <  date_trunc('month', current_date) + interval '1 month'), 0),
    'paid_month',      coalesce(sum(amount) filter (
                         where type = 'expense' and status = 'paid'
                           and coalesce(paid_date, created_at::date) >= date_trunc('month', current_date)
                           and coalesce(paid_date, created_at::date) <  date_trunc('month', current_date) + interval '1 month'), 0),
    -- Pendentes totais (todas, sem filtro de mês)
    'income_pending',  coalesce(sum(amount) filter (where type = 'income'  and status = 'pending'), 0),
    'expense_pending', coalesce(sum(amount) filter (where type = 'expense' and status = 'pending'), 0),
    -- "A receber / a pagar" do MÊS (vence até o fim do mês corrente, ou sem data)
    'expected_income', coalesce(sum(amount) filter (
                         where type = 'income' and status = 'pending'
                           and (due_date is null or due_date < date_trunc('month', current_date) + interval '1 month')), 0),
    'bills_to_pay',    coalesce(sum(amount) filter (
                         where type = 'expense' and status = 'pending'
                           and (due_date is null or due_date < date_trunc('month', current_date) + interval '1 month')), 0),
    -- Vencidos (pendente + data já passada)
    'income_overdue',  coalesce(sum(amount) filter (where type = 'income'  and status = 'pending' and due_date is not null and due_date < current_date), 0),
    'expense_overdue', coalesce(sum(amount) filter (where type = 'expense' and status = 'pending' and due_date is not null and due_date < current_date), 0),
    'overdue_count',   count(*) filter (where status = 'pending' and due_date is not null and due_date < current_date),
    'transactions_count', count(*)
  )
  from public.transactions
  where user_id = p_user_id;
$$;
