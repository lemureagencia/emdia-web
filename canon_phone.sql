-- Forma canônica de telefone BR: 55 + DDD + últimos 8 dígitos (ignora o 9º dígito)
create or replace function public.canon_phone(p text)
returns text language sql immutable as $$
  with d as (select regexp_replace(coalesce(p,''),'\D','','g') as v)
  select case
    when length(v) >= 12 and left(v,2) = '55'
      then '55' || substr(v,3,2) || right(v,8)
    else v
  end from d;
$$;

create or replace function public.get_summary_by_phone(p_phone text)
returns json language plpgsql stable security definer set search_path = public as $$
declare v_user_id uuid; v_name text; v_balance numeric;
begin
  select id, full_name, coalesce(current_balance,0) into v_user_id, v_name, v_balance
  from public.profiles where canon_phone(phone) = canon_phone(p_phone) limit 1;
  if v_user_id is null then
    return json_build_object('found', false, 'message', 'Nenhum usuário cadastrado com este número de WhatsApp.');
  end if;
  return json_build_object('found',true,'user_id',v_user_id,'name',v_name,'account_balance',v_balance,
    'finance',public.get_financial_summary(v_user_id),'pending',public.get_pending_items(v_user_id),'goals',public.get_goals_summary(v_user_id));
end; $$;

create or replace function public.agent_register_by_phone(
  p_phone text, p_type text, p_amount numeric, p_description text,
  p_category text default null, p_payment_method text default null,
  p_status text default 'paid', p_due_date date default null, p_affect_balance boolean default true)
returns json language plpgsql security definer set search_path = public as $$
declare v_user_id uuid; v_id uuid; v_new_bal numeric; v_is_paid boolean := coalesce(p_status,'paid')='paid';
begin
  select id into v_user_id from public.profiles where canon_phone(phone)=canon_phone(p_phone) limit 1;
  if v_user_id is null then return json_build_object('success',false,'message','Usuário não encontrado para este número.'); end if;
  insert into public.transactions (user_id,type,status,amount,description,category,payment_method,due_date,paid_date)
  values (v_user_id,p_type::transaction_type,coalesce(p_status,'paid')::transaction_status,p_amount,p_description,p_category,p_payment_method,p_due_date,
    case when v_is_paid then current_date else null end) returning id into v_id;
  if v_is_paid and coalesce(p_affect_balance,true) then
    update public.profiles set current_balance = coalesce(current_balance,0) + case when p_type='income' then p_amount else -p_amount end
    where id=v_user_id returning current_balance into v_new_bal;
  else select current_balance into v_new_bal from public.profiles where id=v_user_id; end if;
  return json_build_object('success',true,'transaction_id',v_id,'user_id',v_user_id,'status',coalesce(p_status,'paid'),'account_balance',coalesce(v_new_bal,0));
end; $$;

create or replace function public.agent_set_balance_by_phone(p_phone text, p_balance numeric)
returns json language plpgsql security definer set search_path = public as $$
declare v_user_id uuid;
begin
  select id into v_user_id from public.profiles where canon_phone(phone)=canon_phone(p_phone) limit 1;
  if v_user_id is null then return json_build_object('success',false,'message','Usuário não encontrado.'); end if;
  update public.profiles set current_balance=p_balance where id=v_user_id;
  return json_build_object('success',true,'account_balance',p_balance);
end; $$;
