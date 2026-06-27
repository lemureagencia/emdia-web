-- =====================================================================
-- EmDia · Memória curta de conversa do agente
-- =====================================================================
-- Permite perguntas de continuação no WhatsApp:
--   "o que tenho a pagar no próximo mês?"  -> R$ 6.000
--   "e a receber?"                          -> entende: próximo mês
--   "me refiro ao próximo mês"              -> refaz a última consulta
-- Guarda as últimas mensagens por número (sobrevive a redeploy do agente).
-- Rode no SQL Editor do Supabase (projeto vwlscymvrtmkuejtkies).
-- =====================================================================

create table if not exists public.agent_messages (
  id          bigint generated always as identity primary key,
  phone_norm  text not null,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists agent_messages_phone_idx
  on public.agent_messages (phone_norm, created_at desc);

-- RLS ligado e sem policies => anon/authenticated não acessam; só service_role.
alter table public.agent_messages enable row level security;

-- Loga uma mensagem (normaliza o telefone só com dígitos para casar variações).
create or replace function public.agent_log_message(p_phone text, p_role text, p_content text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.agent_messages (phone_norm, role, content)
  values (regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), p_role, left(p_content, 2000));
$$;

-- Retorna as últimas N mensagens em ordem cronológica (antiga -> recente).
create or replace function public.agent_recent_messages(p_phone text, p_limit int default 8)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
           json_agg(json_build_object('role', role, 'content', content) order by created_at),
           '[]'::json)
  from (
    select role, content, created_at
    from public.agent_messages
    where phone_norm = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
    order by created_at desc
    limit greatest(coalesce(p_limit, 8), 1)
  ) s;
$$;

-- Segurança: só a service_role (o agente) executa.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.agent_log_message(text, text, text)',
    'public.agent_recent_messages(text, int)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated;', fn);
    execute format('grant execute on function %s to service_role;', fn);
  end loop;
end $$;
