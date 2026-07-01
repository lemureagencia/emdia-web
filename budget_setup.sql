-- =====================================================================
-- EmDia · Controle de gastos mensal (orçamento)
-- =====================================================================
-- profiles.monthly_budget: teto de gastos do mês (null = sem controle).
-- "Gasto do mês" = saídas JÁ PAGAS no mês atual (finance.paid_month).
-- Rode no SQL Editor do Supabase.
-- =====================================================================

alter table public.profiles add column if not exists monthly_budget numeric;

-- Define/atualiza/remove (null) o orçamento pelo telefone (agente).
create or replace function public.agent_set_budget_by_phone(p_phone text, p_budget numeric)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid;
begin
  select id into v_uid from public.profiles
  where canon_phone(phone) = canon_phone(p_phone) limit 1;
  if v_uid is null then
    return json_build_object('success', false, 'message', 'Usuário não encontrado.');
  end if;
  update public.profiles set monthly_budget = p_budget where id = v_uid;
  return json_build_object('success', true, 'monthly_budget', p_budget);
end;
$$;

revoke all on function public.agent_set_budget_by_phone(text, numeric) from public, anon, authenticated;
grant execute on function public.agent_set_budget_by_phone(text, numeric) to service_role;

-- get_summary_by_phone: passa a incluir monthly_budget no resumo do agente.
create or replace function public.get_summary_by_phone(p_phone text)
returns json language plpgsql stable security definer set search_path = public as $$
declare v_user_id uuid; v_name text; v_balance numeric; v_budget numeric;
begin
  select id, full_name, coalesce(current_balance,0), monthly_budget
    into v_user_id, v_name, v_balance, v_budget
  from public.profiles where canon_phone(phone) = canon_phone(p_phone) limit 1;
  if v_user_id is null then
    return json_build_object('found', false, 'message', 'Nenhum usuário cadastrado com este número de WhatsApp.');
  end if;
  return json_build_object('found',true,'user_id',v_user_id,'name',v_name,
    'account_balance',v_balance,'monthly_budget',v_budget,
    'finance',public.get_financial_summary(v_user_id),
    'pending',public.get_pending_items(v_user_id),
    'goals',public.get_goals_summary(v_user_id));
end; $$;
