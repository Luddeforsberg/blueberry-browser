-- The mascot Gallery. Row-level security and column grants are the enforcement here: the app only ships the publishable
-- key, so anything a client could send is assumed to be sent. Run it once in the SQL editor of a new project.

create table public.mascots (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  palette text not null,
  accessory text not null,
  description text not null,
  category text not null,
  instructions text not null,
  sites text[] not null default '{}',
  tools text[] not null default '{}',
  author_name text not null,
  example_prompt text,
  example_answer text,
  -- The remove switch, only for us, from the dashboard's table editor. Clients can't read or set it.
  hidden boolean not null default false,
  add_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The app checks all of this and more when it reads a row. These are so a hand-made request can't store worse.
  constraint name_shape check (
    char_length(name) between 1 and 24 and name !~ '[<>"\n\r\t]' and lower(name) not in ('berry', 'blueberry')
  ),
  constraint look_shape check (
    palette in ('jackdaw', 'robin', 'canary', 'parakeet', 'flamingo', 'kingfisher')
    and accessory in ('none', 'crown', 'cap', 'glasses', 'headphones', 'bow')
  ),
  constraint description_shape check (char_length(description) between 1 and 140),
  constraint category_shape check (category in ('News and research', 'Home and shopping', 'Travel', 'Work', 'Other')),
  constraint instructions_shape check (char_length(instructions) between 1 and 2000),
  constraint sites_shape check (cardinality(sites) <= 20),
  constraint tools_shape check (tools <@ array['visit', 'click', 'type']),
  -- An author name can't be an address or pass for us.
  constraint author_shape check (
    char_length(author_name) between 1 and 40 and author_name !~ '[@<>\n\r\t]' and lower(author_name) !~ 'blueberry'
  ),
  constraint example_shape check (
    (example_prompt is null and example_answer is null)
    or (example_prompt is not null and example_answer is not null
      and char_length(example_prompt) between 1 and 2000 and char_length(example_answer) between 1 and 6000)
  )
);

-- Who has added what, so each counts once. Nobody reads this but the function below.
create table public.mascot_adds (
  mascot_id uuid not null references public.mascots (id) on delete cascade,
  -- 'account:<id>' or 'install:<id>'.
  adder text not null,
  added_at timestamptz not null default now(),
  primary key (mascot_id, adder)
);
create index mascot_adds_recent on public.mascot_adds (mascot_id, added_at);

alter table public.mascots enable row level security;
alter table public.mascot_adds enable row level security;

create policy "Anyone reads what isn't hidden" on public.mascots
  for select to anon, authenticated using (not hidden);
-- Needed to change or remove one's own after it's been hidden. It doesn't show `hidden`, which no client can select.
create policy "Owners read their own" on public.mascots
  for select to authenticated using (owner = auth.uid());
create policy "Owners publish as themselves" on public.mascots
  for insert to authenticated with check (owner = auth.uid());
create policy "Owners change their own" on public.mascots
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "Owners remove their own" on public.mascots
  for delete to authenticated using (owner = auth.uid());

-- Row rules say which rows. These say which columns: nobody selects `owner` or `hidden`, so one author's mascots can't
-- be linked to each other, and nobody writes `owner`, `hidden`, `add_count` or the dates.
revoke all on table public.mascots from anon, authenticated;
revoke all on table public.mascot_adds from anon, authenticated;
grant select (id, name, palette, accessory, description, category, instructions, sites, tools, author_name, example_prompt, example_answer, add_count, created_at)
  on table public.mascots to anon, authenticated;
grant insert (name, palette, accessory, description, category, instructions, sites, tools, author_name, example_prompt, example_answer),
  update (name, palette, accessory, description, category, instructions, sites, tools, author_name, example_prompt, example_answer),
  delete
  on table public.mascots to authenticated;

-- Keeps one account from filling the Gallery, and stamps changes.
create function public.mascots_before_write() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and (select count(*) from public.mascots where owner = new.owner) >= 20 then
    raise exception 'Too many published mascots' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger mascots_before_write before insert or update on public.mascots
  for each row execute function public.mascots_before_write();
revoke all on function public.mascots_before_write() from public, anon, authenticated;

-- The one way a count changes. One account or install counts once, an author's own add doesn't count, and a burst on
-- one mascot stops counting, so a script making up install ids can only go so fast.
create function public.record_add(p_mascot uuid, p_install uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  account text := case when auth.uid() is null then null else 'account:' || auth.uid() end;
  install text := 'install:' || p_install;
begin
  if p_mascot is null or p_install is null then return; end if;
  if not exists (select 1 from public.mascots m where m.id = p_mascot and not m.hidden and m.owner is distinct from auth.uid()) then return; end if;
  if exists (select 1 from public.mascot_adds a where a.mascot_id = p_mascot and a.adder = account) then return; end if;
  if exists (select 1 from public.mascot_adds a where a.mascot_id = p_mascot and a.adder = install) then
    -- Already counted from here, perhaps before signing in. That account has now added it, wherever it adds it next.
    if account is not null then
      insert into public.mascot_adds (mascot_id, adder) values (p_mascot, account) on conflict do nothing;
    end if;
    return;
  end if;
  -- Every counted add has one install row, and a signed-in one has an account row too.
  if (select count(*) from public.mascot_adds a where a.mascot_id = p_mascot and a.adder like 'install:%' and a.added_at > now() - interval '1 hour') >= 60 then return; end if;
  insert into public.mascot_adds (mascot_id, adder) values (p_mascot, install);
  if account is not null then
    insert into public.mascot_adds (mascot_id, adder) values (p_mascot, account);
  end if;
  update public.mascots set add_count = add_count + 1 where id = p_mascot;
end;
$$;
revoke all on function public.record_add(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_add(uuid, uuid) to anon, authenticated;

-- An author's own list, with whether we've hidden one, and nothing that shows whose it is.
create function public.my_mascots()
returns table (
  id uuid, name text, palette text, accessory text, description text, category text, instructions text, sites text[], tools text[],
  author_name text, example_prompt text, example_answer text, add_count integer, created_at timestamptz, hidden boolean
)
language sql stable security definer set search_path = ''
as $$
  select m.id, m.name, m.palette, m.accessory, m.description, m.category, m.instructions, m.sites, m.tools,
    m.author_name, m.example_prompt, m.example_answer, m.add_count, m.created_at, m.hidden
  from public.mascots m where m.owner = auth.uid() order by m.created_at desc;
$$;
revoke all on function public.my_mascots() from public, anon, authenticated;
grant execute on function public.my_mascots() to authenticated;
