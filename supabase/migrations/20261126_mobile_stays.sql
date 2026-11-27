begin;
set local lock_timeout = '5s';
alter table public.stay_requests add column room_count smallint not null default 1 check(room_count between 1 and 4),
add column adults smallint not null default 2 check(adults between 1 and 8), add column children smallint not null default 0 check(children between 0 and 4);
grant insert(room_count,adults,children) on public.stay_requests to authenticated;
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
alter table public.payment_orders add column catalog_adults smallint check(catalog_adults between 1 and 2);
alter table public.bookings add column catalog_adults smallint check(catalog_adults between 1 and 2);
CREATE OR REPLACE FUNCTION public.confirm_paid_booking(p_order_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.payment_orders%rowtype;
  v_booking_id uuid;
begin
  -- Lock this payment order to prevent duplicate bookings.
  select *
  into v_order
  from public.payment_orders
  where razorpay_order_id = p_order_id
  for update;

  if not found then
    raise exception 'Payment order not found';
  end if;

  -- Return the existing booking if already confirmed.
  if v_order.status = 'booking_confirmed' then
    return jsonb_build_object(
      'success', true,
      'booking_id', v_order.booking_id
    );
  end if;

  -- Only an independently verified payment can be booked.
  if v_order.status <> 'paid'
     or v_order.razorpay_payment_id is null then
    raise exception 'Payment has not been verified';
  end if;

  -- Serialize reservations for this room.
  perform pg_catalog.pg_advisory_xact_lock(v_order.room_id);

  if exists (
    select 1
    from public.bookings
    where room_id = v_order.room_id
      and status in ('confirmed', 'checked_in')
      and tsrange(coalesce(slot_start, check_in::timestamp), coalesce(slot_end, check_out::timestamp), '[)')
          && tsrange(coalesce(v_order.slot_start, v_order.check_in::timestamp), coalesce(v_order.slot_end, v_order.check_out::timestamp), '[)')
  ) then
    update public.payment_orders
    set status = 'booking_failed',
        failure_reason = 'Room unavailable after payment',
        updated_at = now()
    where id = v_order.id;

    return jsonb_build_object(
      'success', false,
      'reason', 'room_unavailable'
    );
  end if;

  -- The exclusion constraint remains the final safeguard.
  begin
    insert into public.bookings (
      guest_id,
      room_id,
      check_in,
      check_out,
      slot_start, slot_end, catalog_label, catalog_adults,
      total_amount,
      status
    )
    values (
      v_order.guest_id,
      v_order.room_id,
      v_order.check_in,
      v_order.check_out,
      v_order.slot_start, v_order.slot_end, v_order.catalog_label, v_order.catalog_adults,
      v_order.amount_paise / 100.0,
      'confirmed'
    )
    returning id into v_booking_id;

  exception when exclusion_violation then
    update public.payment_orders
    set status = 'booking_failed',
        failure_reason = 'Overlapping reservation',
        updated_at = now()
    where id = v_order.id;

    return jsonb_build_object(
      'success', false,
      'reason', 'room_unavailable'
    );
  end;

  update public.payment_orders
  set status = 'booking_confirmed',
      booking_id = v_booking_id,
      updated_at = now()
  where id = v_order.id;

  return jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id
  );
end;
$function$
;
commit;
