-- =====================================================================
-- EmDia · Tabela de Serviços/Produtos + coluna service_type
-- Categorias criadas pelo cliente para classificar transações.
-- =====================================================================

-- 1. Tabela de serviços (categorias criadas pelo usuário)
create table if not exists public.services (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references auth.users on delete cascade not null,
  name        text not null,
  created_at  timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS: cada usuário só vê seus próprios serviços
alter table public.services enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'Users can manage own services' and tablename = 'services'
  ) then
    create policy "Users can manage own services"
      on public.services for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- Índice para buscas rápidas por user_id
create index if not exists idx_services_user_id on public.services (user_id);

-- 2. Adicionar coluna service_type na tabela transactions (se não existir)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'transactions' and column_name = 'service_type'
  ) then
    alter table public.transactions add column service_type text default null;
  end if;
end $$;
