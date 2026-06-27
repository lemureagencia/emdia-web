-- =====================================================================
-- EmDia · Setup do Agente de IA (Evolution API -> n8n -> Supabase)
-- Multitenant: o n8n usa a service_role key (ignora RLS) e identifica
-- o cliente pelo número de telefone do WhatsApp.
-- =====================================================================

-- 1) Mapeamento do tenant: número de WhatsApp -> usuário ------------------
alter table public.profiles add column if not exists phone text;

-- Índice único por telefone normalizado (somente dígitos), ignorando nulos.
create unique index if not exists profiles_phone_norm_idx
  on public.profiles ((regexp_replace(coalesce(phone, ''), '\D', '', 'g')))
  where phone is not null and phone <> '';

-- Índices de performance para as agregações por usuário
create index if not exists transactions_user_id_idx on public.transactions (user_id);
create index if not exists goals_user_id_idx on public.goals (user_id);

-- =====================================================================
-- 2) Funções auxiliares
-- =====================================================================

-- Resumo financeiro por user_id (saldo, receitas, despesas, pendentes, vencidos)
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
    -- Pendentes (a receber / a pagar)
    'income_pending',  coalesce(sum(amount) filter (where type = 'income'  and status = 'pending'), 0),
    'expense_pending', coalesce(sum(amount) filter (where type = 'expense' and status = 'pending'), 0),
    'expected_income', coalesce(sum(amount) filter (where type = 'income'  and status = 'pending'), 0),
    'bills_to_pay',    coalesce(sum(amount) filter (where type = 'expense' and status = 'pending'), 0),
    -- Vencidos (pendente + data de vencimento passada)
    'income_overdue',  coalesce(sum(amount) filter (where type = 'income'  and status = 'pending' and due_date is not null and due_date < current_date), 0),
    'expense_overdue', coalesce(sum(amount) filter (where type = 'expense' and status = 'pending' and due_date is not null and due_date < current_date), 0),
    'overdue_count',   count(*) filter (where status = 'pending' and due_date is not null and due_date < current_date),
    'transactions_count', count(*)
  )
  from public.transactions
  where user_id = p_user_id;
$$;

-- Lista de pendências (a pagar/receber) por user_id, com flag de vencido
create or replace function public.get_pending_items(p_user_id uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(p order by p_due asc nulls last), '[]'::json)
  from (
    select
      json_build_object(
        'id',           id,
        'type',         type,
        'amount',       amount,
        'description',  description,
        'category',     category,
        'service_type', service_type,
        'due_date',     due_date,
        'overdue',      (due_date is not null and due_date < current_date)
      ) as p,
      due_date as p_due
    from public.transactions
    where user_id = p_user_id and status = 'pending'
  ) s;
$$;

-- Resumo de metas por user_id (quanto falta / quanto chegou / %)
create or replace function public.get_goals_summary(p_user_id uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(g order by g_created desc), '[]'::json)
  from (
    select
      json_build_object(
        'id',               id,
        'title',            title,
        'target_amount',    target_amount,
        'current_amount',   current_amount,
        'remaining',        greatest(target_amount - current_amount, 0),
        'progress_percent', case when target_amount > 0
                                 then round((current_amount / target_amount) * 100, 2)
                                 else 0 end,
        'completed',        current_amount >= target_amount,
        'deadline',         deadline
      ) as g,
      created_at as g_created
    from public.goals
    where user_id = p_user_id
  ) s;
$$;

-- =====================================================================
-- 3) Funções principais para o n8n (entrada = número de WhatsApp)
-- =====================================================================

-- Resume TUDO que o agente precisa saber, a partir do telefone.
create or replace function public.get_summary_by_phone(p_phone text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_name    text;
begin
  select id, full_name
    into v_user_id, v_name
  from public.profiles
  where regexp_replace(coalesce(phone, ''), '\D', '', 'g')
      = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
  limit 1;

  if v_user_id is null then
    return json_build_object(
      'found', false,
      'message', 'Nenhum usuário cadastrado com este número de WhatsApp.'
    );
  end if;

  return json_build_object(
    'found',   true,
    'user_id', v_user_id,
    'name',    v_name,
    'finance', public.get_financial_summary(v_user_id),
    'pending', public.get_pending_items(v_user_id),
    'goals',   public.get_goals_summary(v_user_id)
  );
end;
$$;

-- Registra uma transação a partir do telefone (ex: "Paguei 120 de luz").
-- Se status = 'pending', use p_due_date para a data de vencimento.
drop function if exists public.add_transaction_by_phone(text, text, numeric, text, text, text);
create or replace function public.add_transaction_by_phone(
  p_phone       text,
  p_type        text,                 -- 'income' | 'expense'
  p_amount      numeric,
  p_description text,
  p_category    text default null,
  p_status      text default 'paid',  -- 'paid' | 'pending'
  p_due_date    date default null     -- vencimento (quando pendente)
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_id      uuid;
begin
  select id into v_user_id
  from public.profiles
  where regexp_replace(coalesce(phone, ''), '\D', '', 'g')
      = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
  limit 1;

  if v_user_id is null then
    return json_build_object('success', false, 'message', 'Usuário não encontrado para este número.');
  end if;

  insert into public.transactions (user_id, type, status, amount, description, category, due_date, paid_date)
  values (
    v_user_id,
    p_type::transaction_type,
    coalesce(p_status, 'paid')::transaction_status,
    p_amount,
    p_description,
    p_category,
    p_due_date,
    case when coalesce(p_status, 'paid') = 'paid' then current_date else null end
  )
  returning id into v_id;

  return json_build_object('success', true, 'transaction_id', v_id, 'user_id', v_user_id);
end;
$$;

-- =====================================================================
-- 4) Segurança: só a service_role (n8n) pode executar essas funções.
--    (Evita que anon/usuários consultem dados de outros pelo telefone.)
-- =====================================================================
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.get_financial_summary(uuid)',
    'public.get_pending_items(uuid)',
    'public.get_goals_summary(uuid)',
    'public.get_summary_by_phone(text)',
    'public.add_transaction_by_phone(text, text, numeric, text, text, text, date)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated;', fn);
    execute format('grant execute on function %s to service_role;', fn);
  end loop;
end $$;
