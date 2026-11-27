-- Guest requests are distinct from paid bookings. Staff confirm only after
-- obtaining a reservation reference directly from the property or supplier.
begin;

create table public.stay_requests (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  hotel text not null check (length(hotel) between 1 and 150),
  room text not null check (length(room) between 1 and 150),
  city text not null check (length(city) between 1 and 80),
  arrival date not null,
  departure date,
  start_hour smallint,
  duration_hours smallint,
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'declined')),
  supplier_reference text check (length(trim(supplier_reference)) between 1 and 120),
  created_at timestamptz not null default now(),
  check ((departure is not null and departure > arrival and start_hour is null and duration_hours is null)
    or (departure is null and start_hour is not null and start_hour between 0 and 23
      and duration_hours is not null and duration_hours between 1 and 6)),
  check ((status = 'confirmed') = (supplier_reference is not null))
);
create unique index stay_requests_pending_slot on public.stay_requests
  (guest_id, hotel, room, arrival, coalesce(departure, arrival), coalesce(start_hour, -1), coalesce(duration_hours, 0))
  where status in ('requested', 'confirmed');
alter table public.stay_requests enable row level security;
revoke all on public.stay_requests from public, anon, authenticated;
grant select on public.stay_requests to authenticated;
grant insert (hotel, room, city, arrival, departure, start_hour, duration_hours) on public.stay_requests to authenticated;
grant update (status, supplier_reference) on public.stay_requests to authenticated;
create policy "Guests and staff can read relevant requests" on public.stay_requests
  for select to authenticated using (guest_id = (select auth.uid()) or (select public.is_hotel_admin()));
create policy "Guests may request a future stay" on public.stay_requests for insert to authenticated
  with check (guest_id = (select auth.uid()) and status = 'requested'
    and arrival >= (now() at time zone 'Asia/Kolkata')::date
    and (start_hour is null or (arrival + make_time(start_hour, 0, 0)) >= now() at time zone 'Asia/Kolkata'));
create policy "Staff may resolve a pending request" on public.stay_requests for update to authenticated
  using (status = 'requested' and (select public.is_hotel_admin()))
  with check (status in ('confirmed','declined') and (select public.is_hotel_admin()));
commit;
