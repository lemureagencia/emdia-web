-- =====================================================================
-- EmDia · Confirmação de ações destrutivas/ambíguas do agente
-- =====================================================================
-- Guarda 1 ação pendente de confirmação por telefone (último estado vence).
-- Usada para confirmar antes de: excluir, marcar pago, editar valor/data,
-- e para oferecer "dar baixa numa pendência" em vez de duplicar.
-- Expira sozinha em 10 minutos. Rode no SQL Editor do Supabase.
-- =====================================================================

create table if not exists public.agent_confirmations (
  phone_norm  text primary key,
  payload     jsonb not null,
  created_at  timestamptz not null default now()
);

-- RLS ligado e sem policies => só a service_role (o agente) acessa.
alter table public.agent_confirmations enable row level security;

-- Salva (ou substitui) a confirmação pendente do número.
create or replace function public.agent_set_confirmation(p_phone text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.agent_confirmations (phone_norm, payload, created_at)
  values (canon_phone(p_phone), p_payload, now())
  on conflict (phone_norm)
  do update set payload = excluded.payload, created_at = now();
end;
$$;

-- Retorna a confirmação pendente se ainda válida (< 10 min); senão NULL.
create or replace function public.agent_get_confirmation(p_phone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v jsonb;
begin
  select payload into v
  from public.agent_confirmations
  where phone_norm = canon_phone(p_phone)
    and created_at > now() - interval '10 minutes';
  return v;
end;
$$;

-- Limpa a confirmação pendente do número.
create or replace function public.agent_clear_confirmation(p_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.agent_confirmations where phone_norm = canon_phone(p_phone);
end;
$$;

-- Segurança: só a service_role executa.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.agent_set_confirmation(text, jsonb)',
    'public.agent_get_confirmation(text)',
    'public.agent_clear_confirmation(text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated;', fn);
    execute format('grant execute on function %s to service_role;', fn);
  end loop;
end $$;
