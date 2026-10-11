-- Shared boards (Oct 11). Same security model as 0001: only the server (service role) touches these tables; RLS on
-- with no policies; board documents are encrypted by the server with the board's own data key.
--
-- A shared board has its own key and documents (board_keys, board_documents: the Vault addresses it as
-- "board:<uuid>"), members with a role, and invite links stored only as the SHA-256 of their token.

create table if not exists public.boards (
  id         uuid primary key,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
  -- The board's name lives in its encrypted settings document, not here.
);

create table if not exists public.board_members (
  board_id     uuid not null references public.boards(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null check (role in ('viewer','editor','co_owner')),
  display_name text check (char_length(display_name) <= 80),
  invited_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (board_id, user_id)
);
create index if not exists board_members_user_idx on public.board_members (user_id);

create table if not exists public.board_keys (
  board_id    uuid primary key references public.boards(id) on delete cascade,
  kek_version text not null,
  wrapped     text not null,             -- the board's data key, wrapped by the master key
  created_at  timestamptz not null default now()
);

create table if not exists public.board_documents (
  board_id   uuid not null references public.boards(id) on delete cascade,
  collection text not null check (collection in ('entries','years','overrides','budgets','budgetDefaults','settings')),
  doc_id     text not null check (doc_id ~ '^[A-Za-z0-9_.~:@+-]{1,200}$'),
  payload    text not null,              -- base64 AES-256-GCM ciphertext
  updated_at timestamptz not null default now(),
  primary key (board_id, collection, doc_id)
);
create index if not exists board_documents_board_collection_idx on public.board_documents (board_id, collection);

create table if not exists public.board_invites (
  id          uuid primary key,
  board_id    uuid not null references public.boards(id) on delete cascade,
  token_hash  text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  role        text not null check (role in ('viewer','editor','co_owner')),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  max_uses    integer not null check (max_uses between 1 and 20),
  uses        integer not null default 0 check (uses >= 0),
  emails_sent integer not null default 0,
  revoked_at  timestamptz
);
create index if not exists board_invites_board_idx on public.board_invites (board_id);

alter table public.boards          enable row level security;
alter table public.board_members   enable row level security;
alter table public.board_keys      enable row level security;
alter table public.board_documents enable row level security;
alter table public.board_invites   enable row level security;
alter table public.boards          force row level security;
alter table public.board_members   force row level security;
alter table public.board_keys      force row level security;
alter table public.board_documents force row level security;
alter table public.board_invites   force row level security;
revoke all on public.boards, public.board_members, public.board_keys, public.board_documents, public.board_invites from anon, authenticated;
grant  all on public.boards, public.board_members, public.board_keys, public.board_documents, public.board_invites to service_role;

-- Takes one use of an invite if it is still open (not revoked, not expired, uses left). Atomic: two people opening a
-- single-use link at the same moment, only one gets in.
create or replace function public.use_board_invite(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.board_invites set uses = uses + 1
   where id = p_id and revoked_at is null and expires_at > now() and uses < max_uses;
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke all on function public.use_board_invite(uuid) from public, anon, authenticated;
grant execute on function public.use_board_invite(uuid) to service_role;

create or replace function public.count_board_invite_email(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.board_invites set emails_sent = emails_sent + 1 where id = p_id;
$$;
revoke all on function public.count_board_invite_email(uuid) from public, anon, authenticated;
grant execute on function public.count_board_invite_email(uuid) to service_role;
