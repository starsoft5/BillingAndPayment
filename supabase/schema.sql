create table if not exists public.member (
  id bigint generated always as identity primary key,
  first_name varchar(50) not null,
  last_name varchar(50) not null,
  email varchar(254) not null unique,
  created_at timestamptz not null default now(),
  constraint member_first_name_length check (char_length(btrim(first_name)) between 2 and 50),
  constraint member_last_name_length check (char_length(btrim(last_name)) between 2 and 50),
  constraint member_email_length check (char_length(email) <= 254)
);

alter table public.member
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.inventory (
  id bigint generated always as identity primary key,
  name varchar(120) not null,
  item_code varchar(64) unique,
  sku varchar(64) not null,
  category varchar(100),
  description text,
  quantity integer not null default 0,
  unit_price numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  constraint inventory_name_length check (char_length(btrim(name)) between 1 and 120),
  constraint inventory_sku_length check (char_length(btrim(sku)) between 1 and 64),
  constraint inventory_category_length check (category is null or char_length(category) <= 100),
  constraint inventory_quantity_nonnegative check (quantity >= 0),
  constraint inventory_unit_price_nonnegative check (unit_price >= 0)
);

alter table public.inventory
  add column if not exists item_code varchar(64) unique;

create table if not exists public.inventory_master (
  id bigint generated always as identity primary key,
  customer_id bigint not null references public.member(id) on delete restrict,
  inventory_date date not null default current_date,
  status varchar(20) not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  constraint inventory_master_status_length check (char_length(btrim(status)) between 1 and 20)
);

create table if not exists public.inventory_detail (
  id bigint generated always as identity primary key,
  inventory_master_id bigint not null references public.inventory_master(id) on delete cascade,
  inventory_id bigint not null references public.inventory(id) on delete restrict,
  quantity integer not null,
  unit_price numeric(12, 2) not null,
  line_total numeric(14, 2) generated always as (quantity * unit_price) stored,
  constraint inventory_detail_quantity_positive check (quantity > 0),
  constraint inventory_detail_unit_price_nonnegative check (unit_price >= 0)
);

create index if not exists inventory_master_customer_id_idx
  on public.inventory_master(customer_id);
create index if not exists inventory_detail_inventory_master_id_idx
  on public.inventory_detail(inventory_master_id);
create index if not exists inventory_detail_inventory_id_idx
  on public.inventory_detail(inventory_id);

do $$
declare
  constraint_name text;
  index_name text;
begin
  for constraint_name in
    select constraint_row.conname
    from pg_constraint as constraint_row
    join unnest(constraint_row.conkey) as constrained_column(attnum) on true
    join pg_attribute as attribute_row
      on attribute_row.attrelid = constraint_row.conrelid
      and attribute_row.attnum = constrained_column.attnum
    where constraint_row.conrelid = 'public.inventory'::regclass
      and constraint_row.contype = 'u'
      and attribute_row.attname = 'sku'
  loop
    execute format('alter table public.inventory drop constraint %I', constraint_name);
  end loop;

  for index_name in
    select index_row.relname
    from pg_index as index_definition
    join pg_class as table_row on table_row.oid = index_definition.indrelid
    join pg_class as index_row on index_row.oid = index_definition.indexrelid
    join pg_attribute as attribute_row
      on attribute_row.attrelid = table_row.oid
      and attribute_row.attnum = index_definition.indkey[0]
    where table_row.oid = 'public.inventory'::regclass
      and index_definition.indisunique
      and index_definition.indnkeyatts = 1
      and attribute_row.attname = 'sku'
      and not exists (
        select 1
        from pg_constraint as constraint_row
        where constraint_row.conindid = index_definition.indexrelid
      )
  loop
    execute format('drop index public.%I', index_name);
  end loop;
end;
$$;

create table if not exists public.member_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.member enable row level security;
alter table public.inventory enable row level security;
alter table public.inventory_master enable row level security;
alter table public.inventory_detail enable row level security;
alter table public.member_admins enable row level security;

create or replace function public.is_member_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.member_admins
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_member_admin() from public;
grant execute on function public.is_member_admin() to authenticated;
revoke all on public.member_admins from anon, authenticated;
grant select, insert, update, delete on public.member to authenticated;
grant select, insert, update, delete on public.inventory to authenticated;
grant select, insert, update, delete on public.inventory_master to authenticated;
grant select, insert, update, delete on public.inventory_detail to authenticated;

create or replace function public.create_inventory_order(
  p_customer_id bigint,
  p_inventory_date date,
  p_status text,
  p_notes text,
  p_details jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_master_id bigint;
  detail_row jsonb;
begin
  if not public.is_member_admin() then
    raise exception 'You are not authorized to create inventory orders.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_details) is distinct from 'array' then
    raise exception 'Order lines must be provided as an array.' using errcode = '23514';
  end if;
  if jsonb_array_length(p_details) = 0 then
    raise exception 'An order must contain at least one inventory line.' using errcode = '23514';
  end if;

  insert into public.inventory_master (customer_id, inventory_date, status, notes)
  values (p_customer_id, p_inventory_date, p_status, p_notes)
  returning id into new_master_id;

  for detail_row in select value from jsonb_array_elements(p_details)
  loop
    insert into public.inventory_detail (inventory_master_id, inventory_id, quantity, unit_price)
    values (
      new_master_id,
      (detail_row ->> 'inventory_id')::bigint,
      (detail_row ->> 'quantity')::integer,
      (detail_row ->> 'unit_price')::numeric(12, 2)
    );
  end loop;

  return new_master_id;
end;
$$;

revoke all on function public.create_inventory_order(bigint, date, text, text, jsonb) from public;
grant execute on function public.create_inventory_order(bigint, date, text, text, jsonb) to authenticated;

drop policy if exists "Admins can read members" on public.member;
create policy "Admins can read members"
  on public.member for select to authenticated
  using (public.is_member_admin());

drop policy if exists "Admins can create members" on public.member;
create policy "Admins can create members"
  on public.member for insert to authenticated
  with check (public.is_member_admin());

drop policy if exists "Admins can update members" on public.member;
create policy "Admins can update members"
  on public.member for update to authenticated
  using (public.is_member_admin())
  with check (public.is_member_admin());

drop policy if exists "Admins can delete members" on public.member;
create policy "Admins can delete members"
  on public.member for delete to authenticated
  using (public.is_member_admin());

drop policy if exists "Admins can read inventory" on public.inventory;
create policy "Admins can read inventory"
  on public.inventory for select to authenticated
  using (public.is_member_admin());

drop policy if exists "Admins can create inventory" on public.inventory;
create policy "Admins can create inventory"
  on public.inventory for insert to authenticated
  with check (public.is_member_admin());

drop policy if exists "Admins can update inventory" on public.inventory;
create policy "Admins can update inventory"
  on public.inventory for update to authenticated
  using (public.is_member_admin())
  with check (public.is_member_admin());

drop policy if exists "Admins can delete inventory" on public.inventory;
create policy "Admins can delete inventory"
  on public.inventory for delete to authenticated
  using (public.is_member_admin());

drop policy if exists "Admins can read inventory masters" on public.inventory_master;
create policy "Admins can read inventory masters"
  on public.inventory_master for select to authenticated
  using (public.is_member_admin());

drop policy if exists "Admins can create inventory masters" on public.inventory_master;
create policy "Admins can create inventory masters"
  on public.inventory_master for insert to authenticated
  with check (public.is_member_admin());

drop policy if exists "Admins can update inventory masters" on public.inventory_master;
create policy "Admins can update inventory masters"
  on public.inventory_master for update to authenticated
  using (public.is_member_admin())
  with check (public.is_member_admin());

drop policy if exists "Admins can delete inventory masters" on public.inventory_master;
create policy "Admins can delete inventory masters"
  on public.inventory_master for delete to authenticated
  using (public.is_member_admin());

drop policy if exists "Admins can read inventory details" on public.inventory_detail;
create policy "Admins can read inventory details"
  on public.inventory_detail for select to authenticated
  using (public.is_member_admin());

drop policy if exists "Admins can create inventory details" on public.inventory_detail;
create policy "Admins can create inventory details"
  on public.inventory_detail for insert to authenticated
  with check (public.is_member_admin());

drop policy if exists "Admins can update inventory details" on public.inventory_detail;
create policy "Admins can update inventory details"
  on public.inventory_detail for update to authenticated
  using (public.is_member_admin())
  with check (public.is_member_admin());

drop policy if exists "Admins can delete inventory details" on public.inventory_detail;
create policy "Admins can delete inventory details"
  on public.inventory_detail for delete to authenticated
  using (public.is_member_admin());

notify pgrst, 'reload schema';
