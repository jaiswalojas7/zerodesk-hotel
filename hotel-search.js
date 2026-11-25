const byId = id => document.getElementById(id);
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text != null) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const arrival = byId('arrivalDay');
const departure = byId('departureDay');
const city = byId('cityChoice');
const dialog = byId('roomDialog');
const dateInIndia = (now = Date.now()) => new Date(now + 19800000).toISOString().slice(0, 10);
const nextDate = date => new Date(Date.parse(date + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
let mode = 'day';
let hotels = [];
let scenes = [];

function syncDates() {
  arrival.min = dateInIndia();
  if (!arrival.value) return;
  departure.min = nextDate(arrival.value);
  if (!departure.value || departure.value < departure.min) departure.value = departure.min;
}
arrival.value = dateInIndia();
syncDates();
for (let hour = 0; hour < 24; hour++) {
  const value = String(hour).padStart(2, '0');
  byId('arrivalHour').add(new Option(value + ':00', value));
}
byId('arrivalHour').value = '12';
for (let hours = 1; hours <= 6; hours++) byId('hourCount').add(new Option(hours + (hours === 1 ? ' hour' : ' hours'), hours));
byId('hourCount').value = '3';

function updateMode(value) {
  mode = value;
  const hourly = mode === 'hourly';
  departure.disabled = hourly;
  byId('departureField').hidden = hourly;
  byId('timeField').hidden = byId('durationField').hidden = !hourly;
  document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
  if (hourly && arrival.value === dateInIndia() && startTime() < Date.now()) {
    const next = new Date(Date.now() + 19800000 + 3600000);
    arrival.value = next.toISOString().slice(0, 10);
    byId('arrivalHour').value = next.toISOString().slice(11, 13);
  }
  syncDates();
  renderHotels();
}
function startTime() {
  return Date.parse(arrival.value + 'T' + byId('arrivalHour').value + ':00:00+05:30');
}
function validSearch() {
  arrival.min = dateInIndia();
  byId('arrivalHour').setCustomValidity(mode === 'hourly' && startTime() < Date.now() ? 'Choose a future arrival time in India.' : '');
  return byId('cityForm').reportValidity();
}
function renderHotels() {
  if (!hotels.length) return;
  const results = hotels.filter(hotel => hotel.mode === mode && (!city.value || city.value === hotel.city)
    && (!byId('coupleFilter').checked || hotel.couples));
  const target = byId('propertyList');
  target.replaceChildren();
  byId('hotelHeading').textContent = (mode === 'hourly' ? 'Hourly stays' : 'Hotels') + ' in ' + (city.value || 'India');
  byId('hotelCount').textContent = results.length + (results.length === 1 ? ' property' : ' properties') +
    (mode === 'hourly' ? ' · Select a room to check the provider’s time slots.' : ' · Select a room for rates and availability.');
  for (const hotel of results) {
    const card = node('article', null, 'property-card');
    const figure = node('figure');
    const img = node('img');
    img.loading = 'lazy';
    const scene = scenes.find(photo => photo.topic.includes(hotel.city));
    if (hotel.photo || scene) {
      img.src = hotel.photo || scene.src;
      img.alt = hotel.photo ? hotel.name : scene.topic;
      figure.append(img);
      if (!hotel.photo && scene) {
        const credit = node('figcaption');
        credit.append(scene.topic + ' · ', ...creditLinks(scene));
        figure.append(credit);
      }
    }
    const body = node('div', null, 'property-body');
    const location = node('p', hotel.city, 'eyebrow');
    const title = node('h3', hotel.name);
    const room = node('p', hotel.room, 'category-name');
    const description = node('p', hotel.description);
    const policy = node('p', hotel.couples ? 'Couple-friendly' : 'Unmarried couples not accepted', 'policy-note');
    const book = node('button', 'Book this room →', 'primary');
    book.type = 'button';
    book.onclick = () => {
      if (!validSearch()) return;
      showDetails(hotel);
    };
    body.append(location, title, room, description, policy, book);
    card.append(figure, body);
    target.append(card);
  }
  if (!results.length) target.append(node('p', 'No matching hotels. Change the city or clear the couple-friendly filter.'));
}
function providerUrl(hotel) {
  const url = new URL(hotel.booking);
  if (mode === 'hourly') {
    url.searchParams.set('date', arrival.value);
    url.searchParams.set('time', byId('arrivalHour').value);
    url.searchParams.set('rooms', '1');
    url.searchParams.set('adults', '2');
  } else {
    const format = value => value.slice(5, 7) + value.slice(8) + value.slice(0, 4);
    url.searchParams.set('checkin', format(arrival.value));
    url.searchParams.set('checkout', format(departure.value));
    url.searchParams.set('roomStayQualifier', '2e0e');
  }
  return url.href;
}
function showDetails(hotel) {
  byId('detailCity').textContent = hotel.city;
  byId('detailProperty').textContent = hotel.name;
  byId('detailRoom').textContent = hotel.room;
  byId('detailSummary').textContent = hotel.description;
  const facts = byId('roomFacts');
  facts.replaceChildren();
  const rules = [
    ['Couple policy', hotel.couples ? 'Unmarried couples accepted' : 'Unmarried couples not accepted'],
    ['Local photo ID', hotel.localId === null ? 'Check with the property' : hotel.localId ? 'Accepted' : 'Not accepted'],
    ['Shower', hotel.shower], ['Toiletries', hotel.toiletries]
  ];
  for (const [label, value] of rules) facts.append(node('dt', label), node('dd', value));
  const hours = Number(byId('hourCount').value);
  const hourly = mode === 'hourly';
  const formatTime = ms => new Intl.DateTimeFormat('en-IN', {timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(ms);
  byId('detailStay').textContent = hourly ? formatTime(startTime()) + ' – ' + formatTime(startTime() + hours * 3600000) + ' IST · ' + hours + (hours === 1 ? ' hour requested' : ' hours requested')
    : arrival.value + ' → ' + departure.value + ' · ' + (Date.parse(departure.value) - Date.parse(arrival.value)) / 86400000 + ' night(s)';
  byId('providerNote').textContent = hourly ? 'Brevistay confirms available blocks and prices. Compare your requested duration with the paid slot before booking; shorter visits may require a longer paid block.'
    : 'MakeMyTrip confirms the room category, dates, final rate and cancellation terms at checkout.';
  byId('providerBook').href = providerUrl(hotel);
  byId('providerBook').textContent = hourly ? 'See time slots on Brevistay ↗' : 'See rates on MakeMyTrip ↗';
  byId('roomSource').href = hotel.source;
  byId('ruleSource').href = hotel.booking;
  configureRequest(hotel);
  dialog.showModal();
}
byId('closeDetail').onclick = () => dialog.close();
dialog.addEventListener('click', event => { if (event.target === dialog && !event.target.closest('a,button')) {
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
}});
document.querySelectorAll('[data-mode]').forEach(button => button.onclick = () => updateMode(button.dataset.mode));
city.onchange = byId('coupleFilter').onchange = renderHotels;
arrival.onchange = syncDates;
byId('cityForm').oninput = () => byId('arrivalHour').setCustomValidity('');
byId('cityForm').onsubmit = event => {
  event.preventDefault();
  if (validSearch()) {
    renderHotels();
    byId('hotelResults').scrollIntoView();
  }
};

function creditLinks(photo) {
  const file = node('a', photo.credit);
  file.href = photo.file;
  const license = node('a', 'CC ' + photo.license.replace('/', ' ').toUpperCase());
  license.href = 'https://creativecommons.org/licenses/' + photo.license + '/';
  return [file, ' · ', license];
}
function slideshow(photos) {
  let index = 0;
  let version = 0;
  let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const button = byId('pauseScene');
  const syncPause = () => {
    button.textContent = paused ? '▶' : 'Ⅱ';
    button.setAttribute('aria-label', paused ? 'Play slideshow' : 'Pause slideshow');
  };
  async function advance(step) {
    const ticket = ++version;
    for (let attempts = 0; attempts < photos.length; attempts++) {
      index = (index + step + photos.length) % photos.length;
      const photo = photos[index];
      const img = new Image();
      img.src = photo.src;
      try { await img.decode(); } catch { if (ticket !== version) return; step = step || 1; continue; }
      if (ticket !== version) return;
      const hero = byId('destinationImage');
      hero.src = img.src;
      hero.alt = photo.title;
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) hero.animate([{opacity:.6},{opacity:1}], {duration:500});
      byId('sceneCaption').textContent = photo.topic;
      byId('sceneCredit').replaceChildren(...creditLinks(photo));
      return;
    }
  }
  byId('previousScene').onclick = () => advance(-1);
  byId('nextScene').onclick = () => advance(1);
  button.onclick = () => { paused = !paused; syncPause(); };
  syncPause();
  advance(0);
  setInterval(() => {
    if (!paused && !document.hidden && byId('home').classList.contains('active') && !dialog.open) advance(1);
  }, 7500);
}
async function readList(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error('Catalogue unavailable');
  return response.json();
}
readList('destinations.json').then(data => {
  scenes = data;
  slideshow(data);
  renderHotels();
}).catch(() => document.querySelector('.scene-controls').hidden = true);
readList('hotels.json').then(data => {
  hotels = data;
  for (const destination of new Set(hotels.map(hotel => hotel.city))) {
    if (![...city.options].some(option => option.value === destination)) city.add(new Option(destination, destination));
  }
  renderHotels();
}).catch(() => byId('propertyList').textContent = 'The hotel list could not load. Refresh to try again.');

// The supplier checkout remains available before the stay-request migration
// is installed. Probe with the guest's own session and row-level policies.
let requestUser = null;
let requestVersion = 0;
let activeProperty = null;
async function checkRequests() {
  const version = ++requestVersion;
  requestUser = null;
  for (const id of ['guestRequests', 'staffRequests', 'requestActions']) byId(id).hidden = true;
  if (typeof currentUser === 'undefined' || !currentUser) return;
  const guestId = currentUser.id;
  try {
    const {error} = await db.from('stay_requests').select('id').eq('guest_id', guestId).limit(1);
    if (error || version !== requestVersion || currentUser?.id !== guestId) return;
    requestUser = guestId;
    if (dialog.open && activeProperty) configureRequest(activeProperty);
    await showRequestList(document.querySelector('.view.active')?.id);
  } catch { /* Supplier checkout works independently. */ }
}
function configureRequest(hotel) {
  activeProperty = hotel;
  byId('requestActions').hidden = !requestUser;
  byId('requestMessage').textContent = '';
  const button = byId('requestStay');
  button.disabled = false;
  button.onclick = async () => {
    if (!requestUser || !validSearch()) return;
    button.disabled = true;
    const hourly = mode === 'hourly';
    const row = {hotel:hotel.name, room:hotel.room, city:hotel.city, arrival:arrival.value,
      departure:hourly ? null : departure.value, start_hour:hourly ? Number(byId('arrivalHour').value) : null,
      duration_hours:hourly ? Number(byId('hourCount').value) : null};
    try {
      const {error} = await db.from('stay_requests').insert(row);
      if (error && error.code !== '23505') throw error;
      byId('requestMessage').textContent = error ? 'This request is already in My bookings.'
        : 'Request received. Staff will check with the hotel. Track the response in My bookings.';
    } catch {
      button.disabled = false;
      byId('requestMessage').textContent = 'Request could not be saved. Please retry.';
    }
  };
}
async function showRequestList(view) {
  const staff = view === 'admin';
  if (!requestUser || (staff ? !isAdmin : view !== 'booking')) return;
  const guestId = requestUser;
  const section = byId(staff ? 'staffRequests' : 'guestRequests');
  const target = section.querySelector('div');
  let query = db.from('stay_requests').select('id,hotel,room,city,arrival,departure,start_hour,duration_hours,status,supplier_reference');
  if (!staff) query = query.eq('guest_id', guestId);
  const {data, error} = await query.order('created_at',{ascending:false});
  if (requestUser !== guestId || (staff && !isAdmin)) return;
  section.hidden = false;
  target.replaceChildren();
  if (error || !data?.length) {
    target.textContent = error ? 'Hotel requests could not be loaded.' : 'No hotel requests yet.';
    return;
  }
  for (const row of data) {
    const item = node('article', null, 'request-row');
    const slot = row.departure ? row.arrival + ' → ' + row.departure
      : row.arrival + ' at ' + String(row.start_hour).padStart(2,'0') + ':00 IST · ' + row.duration_hours + 'h';
    item.append(node('strong',row.hotel), node('p',row.room + ' · ' + slot),
      node('p',row.status + (row.supplier_reference ? ' · Hotel reference ' + row.supplier_reference : '')));
    if (staff && row.status === 'requested') {
      const form = node('form');
      const label = node('label','Hotel confirmation reference ');
      const ref = node('input'); ref.required = true; ref.maxLength = 120; label.append(ref);
      const confirm = node('button','Confirm reservation','secondary');
      const decline = node('button','Decline request','secondary'); decline.type = 'button';
      const message = node('p'); message.setAttribute('role','status');
      async function resolve(status) {
        const reference = ref.value.trim();
        if (status === 'confirmed' && !reference) { ref.focus(); return; }
        confirm.disabled = decline.disabled = true;
        try {
          const result = await db.from('stay_requests').update({
            status, supplier_reference:status === 'confirmed' ? reference : null
          }).eq('id',row.id).eq('status','requested').select('id');
          if (result.error) throw result.error;
          await showRequestList(view);
        } catch { message.textContent = 'Update failed. Retry after checking the request.'; }
        finally { confirm.disabled = decline.disabled = false; }
      }
      form.onsubmit = event => { event.preventDefault(); resolve('confirmed'); };
      decline.onclick = () => resolve('declined');
      form.append(label,confirm,decline,message); item.append(form);
    }
    target.append(item);
  }
}
document.addEventListener('zerodesk:session', checkRequests);
document.addEventListener('zerodesk:view', event => showRequestList(event.detail));
checkRequests();
