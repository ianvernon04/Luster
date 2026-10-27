-- Gift cards move to the cloud: a card sold on one iPad can be spent on any other, and the same money can't be spent
-- twice. A card's value only changes through its ledger (gift_card_uses): one row per redemption, refund back onto the
-- card, or void, written by the device that rang it up. The database works out the balance from the ledger, refuses a
-- use that would take a card below zero (two iPads spending one card at once, or an iPad that was offline), and never
-- lets a ledger row be rewritten or deleted.

-- ===================================================================== cards
create table public.gift_cards (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  code          text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{3,23}$'),
  amount_cents  int not null check (amount_cents > 0 and amount_cents <= 1000000),   -- what it was sold for (up to $10,000)
  balance_cents int not null default 0 check (balance_cents >= 0),                    -- worked out from the ledger; devices never set it
  client_id     uuid references public.clients (id) on delete set null,               -- who bought it
  ticket_id     uuid references public.tickets (id) on delete set null,               -- the sale
  issued_on     date not null,
  data          jsonb not null default '{}'::jsonb,                                   -- recipient, note
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index gift_cards_code_idx on public.gift_cards (business_id, code);
create index gift_cards_updated_idx on public.gift_cards (business_id, updated_at);

-- ===================================================================== the ledger
create table public.gift_card_uses (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  card_id      uuid not null references public.gift_cards (id) on delete cascade,
  ticket_id    uuid references public.tickets (id) on delete set null,
  kind         text not null check (kind in ('redeem', 'refund', 'void')),
  amount_cents int not null check (amount_cents <> 0 and (kind = 'refund') = (amount_cents < 0)),   -- taken off the card; a refund back onto it is negative
  used_on      date not null,
  data         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index gift_card_uses_card_idx on public.gift_card_uses (card_id);
create index gift_card_uses_updated_idx on public.gift_card_uses (business_id, updated_at);

-- ===================================================================== rules
-- A card's code, value and date never change once sold; its balance is always what the ledger says.
create or replace function public.gift_cards_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.business_id := old.business_id; new.code := old.code; new.amount_cents := old.amount_cents; new.issued_on := old.issued_on;
  end if;
  new.code := upper(new.code);
  if new.client_id is not null and not exists (select 1 from clients c where c.id = new.client_id and c.business_id = new.business_id) then
    raise exception 'client does not belong to this business' using errcode = '42501';
  end if;
  if new.ticket_id is not null and not exists (select 1 from tickets t where t.id = new.ticket_id and t.business_id = new.business_id) then
    raise exception 'ticket does not belong to this business' using errcode = '42501';
  end if;
  new.balance_cents := new.amount_cents - coalesce((select sum(u.amount_cents) from gift_card_uses u where u.card_id = new.id), 0);
  return new;
end $$;
create trigger gift_cards_guard before insert or update on public.gift_cards for each row execute function public.gift_cards_guard();
create trigger gift_cards_touch before update on public.gift_cards for each row execute function public.touch_updated_at();

-- One use of a card at a time (the card row is locked), checked against what's left. A use sent again by a device that
-- didn't hear back is left exactly as it was.
create or replace function public.gift_card_uses_apply() returns trigger
language plpgsql security definer set search_path = public as $$
declare c gift_cards; v_left int;
begin
  if tg_op = 'UPDATE' then return old; end if;
  if exists (select 1 from gift_card_uses u where u.id = new.id) then return new; end if;   -- the upsert turns this into a no-op update
  select * into c from gift_cards where id = new.card_id for update;
  if not found or c.business_id <> new.business_id then
    raise exception 'gift card does not belong to this business' using errcode = '42501';
  end if;
  if new.ticket_id is not null and not exists (select 1 from tickets t where t.id = new.ticket_id and t.business_id = new.business_id) then
    raise exception 'ticket does not belong to this business' using errcode = '42501';
  end if;
  v_left := c.amount_cents - coalesce((select sum(u.amount_cents) from gift_card_uses u where u.card_id = c.id), 0);
  if new.amount_cents > v_left then
    raise exception 'gift card % has $% left', c.code, trim(to_char(v_left / 100.0, '9999990.00')) using errcode = '23514', hint = 'gift_card_balance';
  end if;
  if v_left - new.amount_cents > c.amount_cents then
    raise exception 'gift card % can''t hold more than it was sold for', c.code using errcode = '23514', hint = 'gift_card_balance';
  end if;
  return new;
end $$;
create trigger gift_card_uses_apply before insert or update on public.gift_card_uses for each row execute function public.gift_card_uses_apply();

-- the card's balance follows its ledger, and its updated_at moves so every device pulls the new balance
create or replace function public.gift_card_uses_settle() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update gift_cards set updated_at = now() where id = new.card_id;   -- gift_cards_guard works out the balance again
  return new;
end $$;
create trigger gift_card_uses_settle after insert on public.gift_card_uses for each row execute function public.gift_card_uses_settle();

create trigger gift_cards_audit     after insert or update or delete on public.gift_cards     for each row execute function public.audit_row();
create trigger gift_card_uses_audit after insert or update or delete on public.gift_card_uses for each row execute function public.audit_row();

-- ===================================================================== row-level security
-- Anyone on the team sells and takes gift cards; other studios never see them; nothing is ever deleted (no policy).
alter table public.gift_cards     enable row level security;
alter table public.gift_card_uses enable row level security;
create policy gift_cards_read     on public.gift_cards for select to authenticated using (public.is_member(business_id));
create policy gift_cards_insert   on public.gift_cards for insert to authenticated with check (public.is_member(business_id));
create policy gift_cards_update   on public.gift_cards for update to authenticated using (public.is_member(business_id)) with check (public.is_member(business_id));
create policy gift_uses_read      on public.gift_card_uses for select to authenticated using (public.is_member(business_id));
create policy gift_uses_insert    on public.gift_card_uses for insert to authenticated with check (public.is_member(business_id));
create policy gift_uses_update    on public.gift_card_uses for update to authenticated using (public.is_member(business_id)) with check (public.is_member(business_id));   -- a re-sent use; the trigger keeps it as it was
revoke all on public.gift_cards, public.gift_card_uses from anon;
revoke execute on function public.gift_cards_guard(), public.gift_card_uses_apply(), public.gift_card_uses_settle() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.gift_cards, public.gift_card_uses;
  end if;
end $$;
