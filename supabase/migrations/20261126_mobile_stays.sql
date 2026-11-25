begin;
set local lock_timeout = '5s';
insert into public.rooms(room_number,room_type,price_per_night,is_active) values
('ZDT-GINGER-MUMBAI-AIRPORT','Ginger Mumbai Airport · Luxe Twin Room',4900,false),
('ZDT-BLOOMROOMS-JANPATH','bloomrooms @ Janpath · Standard Twin',5200,false),
('ZDT-EROS-HOTEL-NEW-DELHI-NEHRU-PLACE','Eros Hotel New Delhi Nehru Place · 2 Twin Classic',8500,false);
alter table public.stay_requests add column room_count smallint not null default 1 check(room_count between 1 and 4),
add column adults smallint not null default 2 check(adults between 1 and 8), add column children smallint not null default 0 check(children between 0 and 4);
grant insert(room_count,adults,children) on public.stay_requests to authenticated;
create table public.checkout_passes(booking_id uuid primary key references public.bookings(id) on delete cascade,token_hash text not null unique,expires_at timestamptz not null,used_at timestamptz,created_at timestamptz not null default now());
alter table public.checkout_passes enable row level security;
revoke all on public.checkout_passes from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.issue_checkout_pass(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_token text; v_exp timestamptz := now() + interval '15 minutes';
begin
 if auth.uid() is null then raise exception 'Please sign in'; end if;
 -- Lock the booking to serialize issuing passes with staff redemption.
 perform 1 from public.bookings where id=p_booking_id and guest_id=auth.uid()
   and status='checked_in' for update;
 if not found then raise exception 'Only your checked-in booking can receive a pass'; end if;
 v_token := gen_random_uuid()::text;
 insert into public.checkout_passes(booking_id,token_hash,expires_at,used_at)
 values(p_booking_id,encode(sha256(convert_to(v_token,'UTF8')),'hex'),v_exp,null)
 on conflict(booking_id) do update set token_hash=excluded.token_hash,
  expires_at=excluded.expires_at,used_at=null,created_at=now();
 return jsonb_build_object('token',v_token,'expires_at',v_exp);
end $function$
;
CREATE OR REPLACE FUNCTION public.staff_checkout_pass(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_pass public.checkout_passes%rowtype; v_room_number text; v_room_type text; v_room_id bigint;
begin
 if auth.uid() is null or not public.is_hotel_admin() then
   raise exception 'Only authorized staff can check out guests';
 end if;
 if p_token is null or length(p_token)>100 then raise exception 'Invalid pass'; end if;
 select * into v_pass from public.checkout_passes
  where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if not found or v_pass.used_at is not null or v_pass.expires_at<=now() then
   raise exception 'Pass invalid, expired or already used';
 end if;
 update public.bookings set status='checked_out'
  where id=v_pass.booking_id and status='checked_in'
  returning room_id into v_room_id;
 if not found then raise exception 'Booking is not eligible for checkout'; end if;
 select room_number,room_type into v_room_number,v_room_type from public.rooms where id=v_room_id;
 update public.checkout_passes set used_at=now() where booking_id=v_pass.booking_id;
 return jsonb_build_object('room_number',v_room_number,'room_type',v_room_type);
end $function$
;
revoke all on function public.issue_checkout_pass(uuid), public.staff_checkout_pass(text) from public,anon;
grant execute on function public.issue_checkout_pass(uuid), public.staff_checkout_pass(text) to authenticated;
create table public.stay_reviews (
 booking_id uuid primary key references public.bookings(id) on delete cascade,
 rating smallint not null check(rating between 1 and 5),
 comment text not null check(length(trim(comment)) between 1 and 500),
 created_at timestamptz not null default now()
);
alter table public.stay_reviews enable row level security;
revoke all on public.stay_reviews from public, anon, authenticated;
grant insert(booking_id,rating,comment) on public.stay_reviews to authenticated;
create policy "Guests may review their completed catalogue stays" on public.stay_reviews for insert to authenticated with check(exists(select 1 from public.bookings b where b.id=booking_id and b.guest_id=(select auth.uid()) and b.status='checked_out' and b.catalog_label is not null));
create function public.catalogue_reviews(p_code text) returns table(stars smallint, feedback text, posted_at timestamptz)
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
