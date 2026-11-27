set local lock_timeout = '5s';
create table if not exists public.checkout_passes(booking_id uuid primary key references public.bookings(id) on delete cascade,token_hash text not null unique,expires_at timestamptz not null,used_at timestamptz,created_at timestamptz not null default now());
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
create or replace function public.admin_checkout_booking(p_booking_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_room_id bigint;
begin
  if auth.uid() is null or public.is_hotel_admin() is not true then
    raise exception 'Staff access required';
  end if;
  update public.bookings set status='checked_out'
    where id=p_booking_id and status='checked_in' returning room_id into v_room_id;
  if not found then raise exception 'This booking is no longer checked in'; end if;
  update public.checkout_passes set used_at=now() where booking_id=p_booking_id and used_at is null;
  return (select jsonb_build_object('room_number',room_number,'room_type',room_type) from public.rooms where id=v_room_id);
end $$;

create or replace function public.staff_checkout_pass(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_booking uuid; v_hash text;
begin
  if auth.uid() is null or public.is_hotel_admin() is not true then raise exception 'Staff access required'; end if;
  if p_token is null or length(p_token) <> 36 then raise exception 'Invalid departure pass'; end if;
  v_hash := encode(sha256(convert_to(p_token,'UTF8')),'hex');
  select booking_id into v_booking from public.checkout_passes where token_hash=v_hash;
  -- Issuance, scanning and manual checkout all lock the booking first.
  perform 1 from public.bookings where id=v_booking and status='checked_in' for update;
  if not found or not exists(select 1 from public.checkout_passes
      where booking_id=v_booking and token_hash=v_hash and used_at is null and expires_at>clock_timestamp()) then
    raise exception 'Departure pass expired, replaced or already used';
  end if;
  return public.admin_checkout_booking(v_booking);
end $$;
revoke all on function public.issue_checkout_pass(uuid), public.staff_checkout_pass(text), public.admin_checkout_booking(uuid) from public, anon;
grant execute on function public.issue_checkout_pass(uuid), public.staff_checkout_pass(text), public.admin_checkout_booking(uuid) to authenticated;
notify pgrst, 'reload schema';
