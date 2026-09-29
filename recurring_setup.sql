-- =====================================================================
-- EmDia · Lançamentos fixos (recorrentes mês a mês)
-- =====================================================================
-- recurring_items: "modelo" de um lançamento que se repete todo mês
-- (ex.: cliente com mensalidade, aluguel, assinatura). A cada mês o app
-- gera automaticamente 1 transação pendente para cada item ativo, via
-- ensure_recurring_month(). Idempotente: nunca duplica o mesmo mês.
-- Rode no SQL Editor do Supabase (ou via Management API).
-- =====================================================================

create table if not exists public.recurring_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  type transaction_type not null,
  amount numeric(12, 2) not null,
  description text not null,
  category text,                 -- Nome do cliente
  service_type text,
  due_day smallint not null check (due_day between 1 and 31),
  payment_method text default 'pix',
  active boolean default true not null,
  start_month date not null default date_trunc('month', current_date), -- 1º mês a gerar
  skipped_months date[] not null default '{}', -- meses (dia 1) em que o usuário excluiu a pendência gerada
  created_at timestamptz default timezone('utc', now()) not null
);

alter table public.recurring_items enable row level security;

drop policy if exists "recurring_select_own" on public.recurring_items;
drop policy if exists "recurring_insert_own" on public.recurring_items;
drop policy if exists "recurring_update_own" on public.recurring_items;
drop policy if exists "recurring_delete_own" on public.recurring_items;
create policy "recurring_select_own" on public.recurring_items for select using (auth.uid() = user_id);
create policy "recurring_insert_own" on public.recurring_items for insert with check (auth.uid() = user_id);
create policy "recurring_update_own" on public.recurring_items for update using (auth.uid() = user_id);
create policy "recurring_delete_own" on public.recurring_items for delete using (auth.uid() = user_id);

-- Liga cada transação gerada ao seu modelo fixo
alter table public.transactions
  add column if not exists recurring_id uuid references public.recurring_items(id) on delete set null;

-- Garante 1 transação por (fixo, mês)
create unique index if not exists transactions_recurring_month_uidx
  on public.transactions (recurring_id, ((date_trunc('month', due_date::timestamp))::date))
  where recurring_id is not null;

-- Gera (se ainda não existir) a transação pendente de cada fixo ativo para o mês informado.
-- p_month: qualquer dia do mês desejado (default = mês atual). Usa auth.uid() → seguro via RLS.
-- Concorrência: o app chama esta função ao abrir Painel/Receitas/Despesas e o React StrictMode
-- dispara o efeito duas vezes, então duas chamadas podem rodar ao mesmo tempo. O advisory lock
-- serializa por usuário e o "on conflict do nothing" evita erro de chave duplicada.
create or replace function public.ensure_recurring_month(p_month date default current_date)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_first date := date_trunc('month', p_month)::date;
  v_last  date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_count integer;
begin
  -- Sem usuário logado não há o que gerar (evita lock e trabalho à toa)
  if auth.uid() is null then
    return 0;
  end if;

  -- Serializa as chamadas concorrentes do mesmo usuário (liberado no fim da transação)
  perform pg_advisory_xact_lock(hashtext('ensure_recurring_month'), hashtext(auth.uid()::text));

  insert into public.transactions
    (user_id, type, status, amount, description, category, service_type, due_date, payment_method, installments, recurring_id)
  select r.user_id, r.type, 'pending', r.amount, r.description, r.category, r.service_type,
         -- dia do vencimento limitado ao último dia do mês (ex.: dia 31 em fevereiro → 28/29)
         v_first + (least(r.due_day, extract(day from v_last)::int) - 1),
         r.payment_method, 1, r.id
  from public.recurring_items r
  where r.user_id = auth.uid()
    and r.active
    and r.start_month <= v_first
    and not (v_first = any(r.skipped_months))
    and not exists (
      select 1 from public.transactions t
      where t.recurring_id = r.id
        and t.due_date between v_first and v_last
    )
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.ensure_recurring_month(date) to authenticated;

-- Exclui a pendência gerada de um fixo e marca o mês como "pulado" (não volta a gerar).
create or replace function public.skip_recurring_transaction(p_tx_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare v_rid uuid; v_month date;
begin
  select recurring_id, date_trunc('month', due_date)::date into v_rid, v_month
  from public.transactions where id = p_tx_id and user_id = auth.uid();
  if v_rid is not null and v_month is not null then
    update public.recurring_items
      set skipped_months = array_append(skipped_months, v_month)
      where id = v_rid and not (v_month = any(skipped_months));
  end if;
  delete from public.transactions where id = p_tx_id and user_id = auth.uid();
end;
$$;

grant execute on function public.skip_recurring_transaction(uuid) to authenticated;
