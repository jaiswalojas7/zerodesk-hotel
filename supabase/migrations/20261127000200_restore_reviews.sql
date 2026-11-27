create table if not exists public.stay_reviews (
 booking_id uuid primary key references public.bookings(id) on delete cascade,
 rating smallint not null check(rating between 1 and 5),
 comment text not null check(length(trim(comment)) between 1 and 500),
 created_at timestamptz not null default now()
);
alter table public.stay_reviews enable row level security;
revoke all on public.stay_reviews from public, anon, authenticated;
grant insert(booking_id,rating,comment) on public.stay_reviews to authenticated;
drop policy if exists "Guests may review their completed catalogue stays" on public.stay_reviews;
create policy "Guests may review their completed catalogue stays" on public.stay_reviews for insert to authenticated with check(exists(select 1 from public.bookings b where b.id=booking_id and b.guest_id=(select auth.uid()) and b.status='checked_out' and b.catalog_label is not null));
create or replace function public.catalogue_reviews(p_code text) returns table(stars smallint, feedback text, posted_at timestamptz)
language sql stable security definer set search_path='' as $$
 select v.rating,v.comment,v.created_at from public.stay_reviews v join public.bookings b on b.id=v.booking_id join public.rooms r on r.id=b.room_id where r.room_number=p_code and r.room_number like 'ZDT-%' order by v.created_at desc limit 20
$$;
revoke all on function public.catalogue_reviews(text) from public;
grant execute on function public.catalogue_reviews(text) to anon,authenticated;
notify pgrst, 'reload schema';
