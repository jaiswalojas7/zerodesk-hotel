// Public room availability for half-open stays [checkIn, checkOut).
function validDate(value) {
 if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
 const date = new Date(value + 'T00:00:00Z');
 return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function readPages(base, key, table, filters) {
 const rows = [];
 const limit = 250;
 for (;;) {
  const params = new URLSearchParams({...filters, order:'id.asc', offset:String(rows.length), limit:String(limit)});
  const response = await fetch(base + '/rest/v1/' + table + '?' + params, {
   headers:{apikey:key, Authorization:'Bearer ' + key}
  });
  if (!response.ok) throw new Error('Inventory read failed');
  const page = await response.json();
  if (!Array.isArray(page)) throw new Error('Invalid inventory response');
  if (!page.length) return rows;
  rows.push(...page);
 }
}

module.exports = async function availability(req, res) {
 res.setHeader('Cache-Control', 'no-store');
 if (req.method !== 'GET') {
  res.setHeader('Allow', 'GET');
  return res.status(405).json({error:'Use GET'});
 }
 const {checkIn, checkOut} = req.query;
 if (!validDate(checkIn) || !validDate(checkOut) || checkOut <= checkIn) {
  return res.status(400).json({error:'Choose valid stay dates'});
 }
 const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
 const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
 if (!base || !key) return res.status(503).json({error:'Availability temporarily unavailable'});
 try {
  const [rooms, overlaps] = await Promise.all([
   readPages(base, key, 'rooms', {select:'id', is_active:'eq.true'}),
   readPages(base, key, 'bookings', {select:'room_id', status:'in.(confirmed,checked_in)', check_in:'lt.' + checkOut, check_out:'gt.' + checkIn})
  ]);
  const occupied = new Set(overlaps.map(row => row.room_id));
  return res.status(200).json({roomIds:rooms.filter(room => !occupied.has(room.id)).map(room => room.id)});
 } catch {
  return res.status(503).json({error:'Availability temporarily unavailable'});
 }
};
