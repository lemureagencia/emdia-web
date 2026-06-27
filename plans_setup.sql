-- =====================================================================
-- EmDia · Planos e múltiplos números de WhatsApp
-- Rodar no SQL Editor do Supabase (service_role / Management API).
-- =====================================================================

-- 1. Adiciona colunas plan e is_admin em profiles
alter table public.profiles
  add column if not exists plan text default 'mensal'
  check (plan in ('mensal', 'semestral', 'anual'));

alter table public.profiles
  add column if not exists is_admin boolean default false;

-- Admin: contatodejefferson@gmail.com (acesso ilimitado, sem restrição de plano)
-- update public.profiles set is_admin = true where id = 'fe790a42-7247-4793-bed8-b09405132b55';

-- 2. Tabela de números de WhatsApp por usuário
create table if not exists public.user_phones (
  id         uuid default uuid_generate_v4() primary key,
  user_id    uuid references auth.users on delete cascade not null,
  phone      text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, phone)
);

alter table public.user_phones enable row level security;

create policy "Users can view their own phones"
  on public.user_phones for select using (auth.uid() = user_id);

create policy "Users can insert their own phones"
  on public.user_phones for insert with check (auth.uid() = user_id);

create policy "Users can delete their own phones"
  on public.user_phones for delete using (auth.uid() = user_id);

-- 3. Migra profiles.phone existente para user_phones (sem duplicar)
insert into public.user_phones (user_id, phone)
select id, regexp_replace(phone, '\D', '', 'g')
from public.profiles
where phone is not null and phone <> ''
on conflict (user_id, phone) do nothing;

-- 4. Helper: resolve user_id pelo número (checa profiles E user_phones)
--    Mantém retrocompatibilidade com profiles.phone E suporta múltiplos números.
create or replace function public._phone_to_user_id(p_phone text)
returns uuid
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select id from public.profiles
     where regexp_replace(coalesce(phone, ''), '\D', '', 'g')
         = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
     limit 1),
    (select user_id from public.user_phones
     where regexp_replace(coalesce(phone, ''), '\D', '', 'g')
         = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
     limit 1)
  );
$$;

-- 5. Atualiza get_summary_by_phone para usar o helper
create or replace function public.get_summary_by_phone(p_phone text)
returns json
language plpgsql stable security definer set search_path = public
as $$
declare
  v_user_id uuid;
  v_name    text;
  v_balance numeric;
begin
  v_user_id := public._phone_to_user_id(p_phone);

  if v_user_id is null then
    return json_build_object(
      'found', false,
      'message', 'Nenhum usuário cadastrado com este número de WhatsApp.'
    );
  end if;

  select full_name, coalesce(current_balance, 0)
    into v_name, v_balance
  from public.profiles where id = v_user_id;

  return json_build_object(
    'found',           true,
    'user_id',         v_user_id,
    'name',            v_name,
    'account_balance', v_balance,
    'finance',         public.get_financial_summary(v_user_id),
    'pending',         public.get_pending_items(v_user_id),
    'goals',           public.get_goals_summary(v_user_id)
  );
end;
$$;

-- 6. Atualiza agent_register_by_phone para usar o helper
create or replace function public.agent_register_by_phone(
  p_phone          text,
  p_type           text,
  p_amount         numeric,
  p_description    text,
  p_category       text    default null,
  p_payment_method text    default null,
  p_status         text    default 'paid',
  p_due_date       date    default null,
  p_affect_balance boolean default true,
  p_service_type   text    default null
)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid;
  v_id      uuid;
  v_new_bal numeric;
  v_is_paid boolean := coalesce(p_status, 'paid') = 'paid';
begin
  v_user_id := public._phone_to_user_id(p_phone);

  if v_user_id is null then
    return json_build_object('success', false, 'message', 'Usuário não encontrado para este número.');
  end if;

  insert into public.transactions
    (user_id, type, status, amount, description, category, service_type, payment_method, due_date, paid_date)
  values (
    v_user_id,
    p_type::transaction_type,
    coalesce(p_status, 'paid')::transaction_status,
    p_amount,
    p_description,
    p_category,
    p_service_type,
    p_payment_method,
    p_due_date,
    case when v_is_paid then current_date else null end
  )
  returning id into v_id;

  if v_is_paid and coalesce(p_affect_balance, true) then
    update public.profiles
       set current_balance = coalesce(current_balance, 0)
         + case when p_type = 'income' then p_amount else -p_amount end
     where id = v_user_id
    returning current_balance into v_new_bal;
  else
    select current_balance into v_new_bal from public.profiles where id = v_user_id;
  end if;

  return json_build_object(
    'success', true,
    'transaction_id', v_id,
    'user_id', v_user_id,
    'status', coalesce(p_status, 'paid'),
    'account_balance', coalesce(v_new_bal, 0)
  );
end;
$$;

-- 7. Atualiza agent_set_balance_by_phone para usar o helper
create or replace function public.agent_set_balance_by_phone(p_phone text, p_balance numeric)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public._phone_to_user_id(p_phone);

  if v_user_id is null then
    return json_build_object('success', false, 'message', 'Usuário não encontrado.');
  end if;

  update public.profiles set current_balance = p_balance where id = v_user_id;
  return json_build_object('success', true, 'account_balance', p_balance);
end;
$$;

-- 8. Segurança: só service_role pode executar
do $$
declare fn text;
begin
  foreach fn in array array[
    'public._phone_to_user_id(text)',
    'public.get_summary_by_phone(text)',
    'public.agent_register_by_phone(text, text, numeric, text, text, text, text, date, boolean, text)',
    'public.agent_set_balance_by_phone(text, numeric)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated;', fn);
    execute format('grant execute on function %s to service_role;', fn);
  end loop;
end $$;
