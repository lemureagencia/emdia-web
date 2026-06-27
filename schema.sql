-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Create profiles table (optional, but good for user metadata like full name)
create table profiles (
  id uuid references auth.users on delete cascade not null primary key,
  full_name text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create transactions table
create type transaction_type as enum ('income', 'expense');
create type transaction_status as enum ('pending', 'paid');

create table transactions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  type transaction_type not null,
  status transaction_status default 'paid' not null,
  amount numeric(12, 2) not null,
  description text not null,
  category text,
  due_date date,
  paid_date date,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create goals table
create table goals (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  target_amount numeric(12, 2) not null,
  current_amount numeric(12, 2) default 0 not null,
  deadline date,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Set up Row Level Security (RLS)
alter table profiles enable row level security;
alter table transactions enable row level security;
alter table goals enable row level security;

-- Policies for profiles
create policy "Users can view their own profile."
  on profiles for select
  using ( auth.uid() = id );

create policy "Users can update their own profile."
  on profiles for update
  using ( auth.uid() = id );

-- Insert profile automatically on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

-- Trigger for new users
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Policies for transactions
create policy "Users can view their own transactions."
  on transactions for select
  using ( auth.uid() = user_id );

create policy "Users can insert their own transactions."
  on transactions for insert
  with check ( auth.uid() = user_id );

create policy "Users can update their own transactions."
  on transactions for update
  using ( auth.uid() = user_id );

create policy "Users can delete their own transactions."
  on transactions for delete
  using ( auth.uid() = user_id );

-- Policies for goals
create policy "Users can view their own goals."
  on goals for select
  using ( auth.uid() = user_id );

create policy "Users can insert their own goals."
  on goals for insert
  with check ( auth.uid() = user_id );

create policy "Users can update their own goals."
  on goals for update
  using ( auth.uid() = user_id );

create policy "Users can delete their own goals."
  on goals for delete
  using ( auth.uid() = user_id );
