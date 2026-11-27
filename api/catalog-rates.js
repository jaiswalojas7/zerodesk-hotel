const hotels = require('../hotels.json');

module.exports = async function catalogRates(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const endpoint = new URL('/rest/v1/rooms', process.env.SUPABASE_URL);
    endpoint.search = new URLSearchParams({
      select: 'room_number,price_per_night', is_active: 'eq.false',
      room_number: 'in.(' + hotels.map(h => h.checkoutCode).join(',') + ')'
    });
    const response = await fetch(endpoint, {headers: {apikey: key, Authorization: 'Bearer ' + key}});
    if (!response.ok) throw new Error('Rate lookup failed');
    const rates = {};
    for (const room of await response.json()) {
      const price = Number(room.price_per_night);
      if (Number.isFinite(price) && price > 0) rates[room.room_number] = price;
    }
    res.setHeader('Cache-Control', 'public, s-maxage=30');
    return res.status(200).json(rates);
  } catch {
    return res.status(503).json({error:'Temporarily unable to check test room rates.'});
  }
};
