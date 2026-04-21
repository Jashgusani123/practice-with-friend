
-- PROFILES
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "Profiles are viewable by authenticated users"
  on public.profiles for select to authenticated using (true);
create policy "Users can insert their own profile"
  on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "Users can update their own profile"
  on public.profiles for update to authenticated using (auth.uid() = id);

-- Auto create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- PASSAGES
create table public.passages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.passages enable row level security;
create policy "Passages readable by authenticated"
  on public.passages for select to authenticated using (true);

-- QUESTIONS
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  passage_id uuid not null references public.passages(id) on delete cascade,
  question text not null,
  options jsonb not null,
  correct_index int not null,
  order_index int not null default 0
);
alter table public.questions enable row level security;
create policy "Questions readable by authenticated"
  on public.questions for select to authenticated using (true);

-- ROOMS
create type public.room_status as enum ('waiting', 'started', 'finished');

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id uuid not null references auth.users(id) on delete cascade,
  passage_id uuid references public.passages(id),
  status public.room_status not null default 'waiting',
  duration_seconds int not null default 600,
  started_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.rooms enable row level security;

-- ROOM MEMBERS
create table public.room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (room_id, user_id)
);
alter table public.room_members enable row level security;

-- helper: is user a member of room (security definer to avoid recursion)
create or replace function public.is_room_member(_room_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.room_members where room_id = _room_id and user_id = _user_id
  ) or exists (
    select 1 from public.rooms where id = _room_id and host_id = _user_id
  );
$$;

-- ROOMS policies
create policy "Authenticated can read rooms"
  on public.rooms for select to authenticated using (true);
create policy "Authenticated can create rooms as host"
  on public.rooms for insert to authenticated with check (auth.uid() = host_id);
create policy "Host can update room"
  on public.rooms for update to authenticated using (auth.uid() = host_id);
create policy "Host can delete room"
  on public.rooms for delete to authenticated using (auth.uid() = host_id);

-- ROOM MEMBERS policies
create policy "Members and host can view room members"
  on public.room_members for select to authenticated
  using (public.is_room_member(room_id, auth.uid()));
create policy "User can join a room as themselves"
  on public.room_members for insert to authenticated
  with check (auth.uid() = user_id);
create policy "User can leave a room"
  on public.room_members for delete to authenticated
  using (auth.uid() = user_id);

-- ATTEMPTS
create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  score int not null default 0,
  total int not null default 0,
  submitted_at timestamptz not null default now(),
  unique (room_id, user_id)
);
alter table public.attempts enable row level security;

create policy "Room members can view attempts in their room"
  on public.attempts for select to authenticated
  using (public.is_room_member(room_id, auth.uid()));
create policy "User can insert their own attempt"
  on public.attempts for insert to authenticated
  with check (auth.uid() = user_id and public.is_room_member(room_id, auth.uid()));

-- ANSWERS
create table public.answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  selected_index int not null,
  is_correct boolean not null default false,
  unique (attempt_id, question_id)
);
alter table public.answers enable row level security;

create policy "User can view own answers"
  on public.answers for select to authenticated
  using (exists (select 1 from public.attempts a where a.id = attempt_id and a.user_id = auth.uid()));
create policy "User can insert own answers"
  on public.answers for insert to authenticated
  with check (exists (select 1 from public.attempts a where a.id = attempt_id and a.user_id = auth.uid()));

-- Realtime
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_members;
alter publication supabase_realtime add table public.attempts;
alter table public.rooms replica identity full;
alter table public.room_members replica identity full;
alter table public.attempts replica identity full;
