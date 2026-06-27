-- get_financial_summary: "a receber" e "a pagar" passam a refletir só o MÊS ATUAL
-- (vencendo até o fim do mês corrente, ou sem data) + atrasados — igual ao Painel.
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
    'total_income',    coalesce(sum(amount) filter (where type = 'income'  and status = 'paid'), 0),
    'total_expense',   coalesce(sum(amount) filter (where type = 'expense' and status = 'paid'), 0),
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
