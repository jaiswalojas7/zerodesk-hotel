begin;
set local lock_timeout = '5s';
-- Catalogue timestamps are hotel-local time in India. Legacy date-only bookings retain midnight boundaries.
alter table public.payment_orders add column slot_start timestamp, add column slot_end timestamp, add column catalog_label text, add check ((slot_start is null and slot_end is null and catalog_label is null) or (slot_start is not null and slot_end is not null and slot_end > slot_start and catalog_label is not null));
alter table public.bookings add column slot_start timestamp, add column slot_end timestamp, add column catalog_label text, add check ((slot_start is null and slot_end is null and catalog_label is null) or (slot_start is not null and slot_end is not null and slot_end > slot_start and catalog_label is not null));
alter table public.bookings add constraint prevent_overlapping_stay_times exclude using gist
(room_id with =, tsrange(coalesce(slot_start,check_in::timestamp),coalesce(slot_end,check_out::timestamp),'[)') with &&)
where (status in ('confirmed','checked_in'));
alter table public.bookings drop constraint prevent_overlapping_bookings;
-- Inactive synthetic units never appear in the existing real/active inventory lookup.
insert into public.rooms(room_number, room_type, price_per_night, is_active) values
('ZDT-TAJ-LAKE-PALACE', 'Taj Lake Palace · Luxury Room · Garden View', 24000, false),
('ZDT-ITC-MAURYA', 'ITC Maurya · Executive Club', 11500, false),
('ZDT-UMAID-BHAWAN-PALACE', 'Umaid Bhawan Palace · Palace Room · King Bed', 26000, false),
('ZDT-THE-TAJ-MAHAL-PALACE', 'The Taj Mahal Palace · Signature Suite', 32500, false),
('ZDT-SHERATON-GRAND-PUNE-BUND-GARDEN-HOTEL', 'Sheraton Grand Pune Bund Garden Hotel · Classic King · City View', 7900, false),
('ZDT-ITC-GRAND-CENTRAL', 'ITC Grand Central · Executive Club', 10900, false),
('ZDT-HOTEL-AMBIENCE', 'Hotel Ambience · Deluxe · Day use', 350, false),
('ZDT-HOTEL-SAHAR-GARDEN', 'Hotel Sahar Garden · Standard · Day use', 475, false),
('ZDT-HOTEL-STUDIO-ESTIQUE', 'Hotel Studio Estique · Deluxe · Day use', 525, false),
('ZDT-STAMPS-BY-EIGHT-CONTINENTS', 'Stamps by Eight Continents · Deluxe · Day use', 450, false),
('ZDT-HOTEL-ACE-PLAZA', 'Hotel Ace Plaza · Standard · Day use', 300, false),
('ZDT-ITC-MARATHA', 'ITC Maratha · Executive Club', 12500, false),
('ZDT-ITC-RAJPUTANA', 'ITC Rajputana · Executive Club', 9500, false),
('ZDT-ITC-GRAND-CHOLA', 'ITC Grand Chola · Executive Club', 11900, false),
('ZDT-ITC-ROYAL-BENGAL', 'ITC Royal Bengal · Towers', 11400, false),
('ZDT-ITC-KOHENUR', 'ITC Kohenur · Executive Club', 10300, false),
('ZDT-ITC-WINDSOR', 'ITC Windsor · Manor Room', 9800, false);
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
      slot_start, slot_end, catalog_label,
      total_amount,
      status
    )
    values (
      v_order.guest_id,
      v_order.room_id,
      v_order.check_in,
      v_order.check_out,
      v_order.slot_start, v_order.slot_end, v_order.catalog_label,
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
$function$;
revoke all on function public.confirm_paid_booking(text) from public, anon, authenticated;
grant execute on function public.confirm_paid_booking(text) to service_role;
commit;
