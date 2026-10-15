-- Oct 13: invite by email ("Board sharing" / "Share your board"). An invite can be bound to one address (lower case):
-- the person with an account on that address sees it in the app (Accept / Decline) without the link; declining marks it.
alter table public.board_invites add column if not exists email text check (email is null or (email = lower(email) and length(email) <= 254));
alter table public.board_invites add column if not exists declined_at timestamptz;
create index if not exists board_invites_email_idx on public.board_invites (email) where email is not null;
