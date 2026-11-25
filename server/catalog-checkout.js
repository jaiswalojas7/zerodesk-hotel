const hotels = require('../hotels.json');
const DAY = 86400000;
const HOUR = 3600000;
const INDIA_OFFSET = 5.5 * HOUR;

function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().startsWith(value + 'T') ? time : NaN;
}
function quote(hotel, input, now = Date.now()) {
  const day = calendarDate(input.checkIn);
  const localNow = now + INDIA_OFFSET;
  if (!Number.isFinite(day) || day < Math.floor(localNow / DAY) * DAY) return null;
  let start = day;
  let end, units;
  if (hotel.mode === 'hourly') {
    units = input.hours;
    if (!Number.isInteger(input.startHour) || input.startHour < 0 || input.startHour > 23 ||
        !Number.isInteger(units) || units < 1 || units > 6) return null;
    start += input.startHour * HOUR;
    if (start < localNow) return null;
    end = start + units * HOUR;
  } else {
    end = calendarDate(input.checkOut);
    units = (end - start) / DAY;
    if (!Number.isInteger(units) || units < 1 || units > 30) return null;
  }
  const iso = value => new Date(value).toISOString().slice(0,19);
  return {
    start:iso(start), end:iso(end), checkIn:input.checkIn,
    checkOut:iso(Math.ceil(end / DAY) * DAY).slice(0,10),
    amount:hotel.testRate * units * 100
  };
}
async function createCatalogOrder(input, res, {user, keyId, razorpay, base, headers}) {
  if (!keyId.startsWith('rzp_test_')) {
    return res.status(409).json({error:'Catalogue checkout requires Razorpay test mode.'});
  }
  const hotel = hotels.find(item => item.checkoutCode === input.catalogCode);
  const stay = hotel && quote(hotel,input);
  if (!stay) return res.status(400).json({error:'Choose valid stay dates or a future 1–6 hour slot.'});
  if (input.expectedPaise !== stay.amount) return res.status(409).json({error:'The rate has changed. Refresh the room details.'});
  const filter = new URLSearchParams({room_number:'eq.' + hotel.checkoutCode,is_active:'eq.false',select:'id,price_per_night'});
  const inventory = await fetch(base + '/rest/v1/rooms?' + filter,{headers});
  if (!inventory.ok) throw new Error('Catalogue inventory unavailable');
  const [room] = await inventory.json();
  if (!room || Number(room.price_per_night) !== hotel.testRate) return res.status(409).json({error:'This sample rate is currently unavailable.'});
  const overlaps = new URLSearchParams({room_id:'eq.' + room.id, status:'in.(confirmed,checked_in)',
    slot_start:'lt.' + stay.end, slot_end:'gt.' + stay.start, select:'id', limit:'1'});
  const availability = await fetch(base + '/rest/v1/bookings?' + overlaps,{headers});
  if (!availability.ok) throw new Error('Availability check failed');
  if ((await availability.json()).length) return res.status(409).json({error:'This room is booked during those times.'});
  const order = await razorpay.orders.create({amount:stay.amount,currency:'INR',receipt:'zd_test_' + Date.now()});
  const description = hotel.name + ' · ' + hotel.room;
  const saved = await fetch(base + '/rest/v1/payment_orders',{method:'POST',
    headers:{...headers,'Content-Type':'application/json',Prefer:'return=minimal'},
    body:JSON.stringify({guest_id:user.id,room_id:room.id,check_in:stay.checkIn,check_out:stay.checkOut,
      slot_start:stay.start,slot_end:stay.end,catalog_label:description,amount_paise:stay.amount,
      currency:'INR',razorpay_order_id:order.id,status:'pending'})});
  if (!saved.ok) throw new Error('Could not prepare catalogue checkout');
  return res.status(200).json({orderId:order.id,keyId,amount:stay.amount,currency:'INR',description});
}
module.exports = {createCatalogOrder, quote};
