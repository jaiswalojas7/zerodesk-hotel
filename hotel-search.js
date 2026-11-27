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
const centers = {Delhi:[28.61,77.21], Mumbai:[19.08,72.88], Pune:[18.52,73.86], Jodhpur:[26.24,73.02], Udaipur:[24.59,73.71], Jaipur:[26.91,75.79], Chennai:[13.08,80.27], Kolkata:[22.57,88.36], Hyderabad:[17.39,78.49], Bengaluru:[12.97,77.59]};
function distance(a,b) {
  const radians = angle => angle * Math.PI / 180;
  const h = Math.sin(radians(b[0]-a[0])/2)**2 + Math.cos(radians(a[0])) * Math.cos(radians(b[0])) * Math.sin(radians(b[1]-a[1])/2)**2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1,h)));
}
function party() {
  return {room_count:+byId('guestRooms').value, adults:+byId('guestAdults').value, children:+byId('guestChildren').value};
}
function partyText() {
  const {room_count,adults,children} = party();
  return [room_count+' room'+(room_count===1?'':'s'),adults+' adult'+(adults===1?'':'s'),children+' '+(children===1?'child':'children')].join(' · ');
}
for (const [id,min,max,initial] of [['guestRooms',1,4,1],['guestAdults',1,8,2],['guestChildren',0,4,0]]) {
  const field=byId(id);
  for(let n=min;n<=max;n++) field.add(new Option(String(n),String(n)));
  field.value=initial;
  field.onchange = () => {
    const guests = party();
    if (id !== 'guestRooms') byId('guestRooms').value = Math.max(guests.room_count, Math.ceil(guests.adults / 2), guests.children);
    byId('partySummary').textContent = partyText();
  };
}
byId('nearMe').onclick = () => {
  const message=byId('geoStatus');
  if(!navigator.geolocation){message.textContent='Choose a location manually on this device.'; return;}
  message.textContent='Finding your nearest listed city…';
  navigator.geolocation.getCurrentPosition(({coords})=>{
    const point=[coords.latitude,coords.longitude];
    city.value=Object.keys(centers).sort((a,b)=>distance(point,centers[a])-distance(point,centers[b]))[0];
    message.textContent='Nearest listed city: '+city.value+'.';renderHotels();
  },()=>{message.textContent='Location unavailable. Select your city above.';},{timeout:8000,maximumAge:60000});
};

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
  if(mode==='nearby' && !centers[city.value]) city.value='Delhi';
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
const searchDialog = byId('citySearch');
function openSearch() {
  byId('dialogBookingControls').append(byId('bookingControls'));
  if (!searchDialog.open) searchDialog.showModal();
  byId('hotelQuery').focus();
}
searchDialog.addEventListener('close', () => {
  if (!searchDialog.open) byId('landingSearch').append(byId('bookingControls'));
});
byId('openStaySearch').onclick = openSearch;
byId('closeStaySearch').onclick = () => searchDialog.close();

function validSearch() {
  arrival.min = dateInIndia();
  byId('arrivalHour').setCustomValidity(mode === 'hourly' && startTime() < Date.now() ? 'Choose a future arrival time in India.' : '');
  if (!byId('cityForm').checkValidity() && !searchDialog.open) openSearch();
  return byId('cityForm').reportValidity();
}
function normalize(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/bangalore/g,'bengaluru').replace(/bombay/g,'mumbai').replace(/calcutta/g,'kolkata');
}
function matchesSearch(hotel) {
  const terms = normalize(byId('hotelQuery').value.trim()).split(/\s+/);
  const words = normalize([hotel.name,hotel.city,hotel.chain,hotel.state,hotel.room || ''].join(' '));
  return terms.every(term => words.includes(term));
}
function renderHotels() {
  renderDirectory();
  if (!hotels.length) return;
  const results = hotels.filter(hotel => matchesSearch(hotel) && hotel.mode === (mode === 'hourly' ? 'hourly' : 'day') && (mode === 'nearby' ? hotel.city !== city.value : (!city.value || city.value === hotel.city))
    && (!byId('chainChoice').value || hotel.chain === byId('chainChoice').value)
    && (!byId('coupleFilter').checked || hotel.couples));
  const origin = centers[city.value];
  if (mode === 'nearby' && origin) results.sort((a,b)=>distance(origin,centers[a.city])-distance(origin,centers[b.city]));
  const sort=byId('priceOrder').value;
  if(sort) results.sort((a,b)=>(a.testRate-b.testRate)*(sort==='asc'?1:-1));
  const target = byId('propertyList');
  target.replaceChildren();
  byId('hotelHeading').textContent = (mode === 'hourly' ? 'Hourly stays' : 'Hotels') + ' in ' + (city.value || 'India');
  if(mode==='nearby') byId('hotelHeading').textContent = 'Getaways from '+(city.value || 'your city');
  byId('hotelCount').textContent = results.length + (results.length === 1 ? ' property' : ' properties') +
    (mode === 'hourly' ? ' · Choose a time and duration to see your total.' : ' · Select a room for rates and availability.');
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
        const credit = node('span');
        credit.textContent = scene.topic;
        figure.append(credit);
      }
    }
    const body = node('div', null, 'property-body');
    const location = node('p', hotel.city + (mode==='nearby' && origin ? ' · '+Math.round(distance(origin,centers[hotel.city]))+' km from '+city.value : ''), 'eyebrow');
    const title = node('h3', hotel.name);
    const room = node('p', hotel.room, 'category-name');
    const description = node('p', hotel.description);
    const policy = node('p', hotel.couples ? 'Couple-friendly' : 'Unmarried couples not accepted', 'policy-note');
    const book = node('button', hotel.salesClosed ? 'View room details →' : 'Book this room →', 'primary');
    book.type = 'button';
    book.onclick = () => {
      if (!validSearch()) return;
      showDetails(hotel);
    };
    const rate = node('strong', hotel.salesClosed ? 'Test inventory pending' : rupees(hotel.testRate) + (mode === 'hourly' ? ' / hour' : ' / night') + ' · Test rate');
    body.append(location, title, room, description, rate, policy, book);
    const photoButton = node('button', null, 'property-photo-button');
    photoButton.type = 'button';
    photoButton.setAttribute('aria-label', 'View ' + hotel.name + ' details');
    photoButton.onclick = () => { if (validSearch()) showDetails(hotel); };
    photoButton.append(...Array.from(figure.childNodes));
    figure.append(photoButton);
    card.append(figure, body);
    target.append(card);
  }
  if (!results.length) target.append(node('p', 'No matching hotels. Change the city or clear the couple-friendly filter.'));
}
const rupees = value => new Intl.NumberFormat('en-IN', {style:'currency', currency:'INR', maximumFractionDigits:0}).format(value);
function showDetails(hotel) {
  byId('detailCity').textContent = hotel.city;
  byId('detailProperty').textContent = hotel.name;
  byId('detailRoom').textContent = hotel.room;
  byId('detailSummary').textContent = hotel.description;
  const photo=byId('detailPhoto'); photo.hidden=!hotel.photo;
  if(hotel.photo){photo.src=hotel.photo;photo.alt=hotel.name;}
  const share=new URL(window.ZeroDeskAndroid?.site || location.href);share.searchParams.set('hotel',hotel.checkoutCode);
  const gallery=byId('roomPhotos');gallery.replaceChildren();
  for(const [i,url] of (hotel.gallery || []).entries()) {
    const thumb=node('button');thumb.type='button';thumb.setAttribute('aria-label','Show property photo '+(i+1));
    const image=node('img');image.alt='';image.loading='lazy';image.src=url;thumb.append(image);
    thumb.onclick=()=>{photo.src=url;photo.hidden=false;};gallery.append(thumb);
  }
  byId('shareStay').href='https://wa.me/?text='+encodeURIComponent(hotel.name+' · '+hotel.city+' '+share.href);
  byId('hotelServices').replaceChildren(...hotel.facts.amenities.map(value=>node('li',value)));
  const {rating,count,near}=hotel.facts;
  byId('guestRating').textContent=rating ? rating.toFixed(1)+'/5 · '+count.toLocaleString('en-IN')+' listing ratings · 26 Nov 2026 snapshot' : 'See the listing for the latest guest ratings.';
  const comments=byId('guestComments'); comments.replaceChildren();
  for (const review of hotel.reviewNotes || []) {
    const item = node('article', null, 'request-row');
    item.append(node('strong', review.author + ' · ' + review.score), node('p', review.summary),
      node('small', review.source + ' · ' + review.month + ' · Paraphrased guest review'));
    comments.append(item);
  }
  const reviewKey=hotel.checkoutCode; comments.dataset.hotel=reviewKey;
  if(typeof db!=='undefined') db.rpc('catalogue_reviews',{p_code:reviewKey}).then(({data})=>{
    if(comments.dataset.hotel!==reviewKey || !Array.isArray(data)) return;
    for(const review of data) comments.append(node('p',review.stars+'/5 · ZeroDesk test stay: '+review.feedback));
  }).catch(()=>{});
  byId('nearbyList').replaceChildren(...near.map(value=>node('li',value)));
  byId('mapLinks').replaceChildren(...['Attractions','Transport','Restaurants'].map(category=>{
    const link=node('a',category+' ↗');link.target='_blank';link.rel='noopener';
    link.href='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(category+' near '+hotel.name+' '+hotel.city);return link;
  }));
  const facts = byId('roomFacts');
  facts.replaceChildren();
  const rules = [
    ['Couple policy', hotel.couples ? 'Unmarried couples accepted' : 'Unmarried couples not accepted'],
    ['Local photo ID', hotel.localId === null ? 'Check with the property' : hotel.localId ? 'Accepted' : 'Not accepted'],
    ['Shower', hotel.shower], ['Toiletries', hotel.toiletries]
  ];
  for(const rule of hotel.facts.rules){const split=rule.indexOf(':'); rules.push(split<0?['Policy',rule]:[rule.slice(0,split),rule.slice(split+1).trim()]);}
  for (const [label, value] of rules) facts.append(node('dt', label), node('dd', value));
  const hours = Number(byId('hourCount').value);
  const hourly = mode === 'hourly';
  const formatTime = ms => new Intl.DateTimeFormat('en-IN', {timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(ms);
  byId('detailStay').textContent = hourly ? formatTime(startTime()) + ' – ' + formatTime(startTime() + hours * 3600000) + ' IST · ' + hours + (hours === 1 ? ' hour requested' : ' hours requested')
    : arrival.value + ' → ' + departure.value + ' · ' + (Date.parse(departure.value) - Date.parse(arrival.value)) / 86400000 + ' night(s)';
  const units = hourly ? hours : (Date.parse(departure.value) - Date.parse(arrival.value)) / 86400000;
  const guests = party();
  const total = units * hotel.testRate * guests.room_count;
  const pay = byId('catalogPay');
  byId('detailStay').textContent += ' · '+partyText();
  const validParty = guests.adults >= guests.room_count && guests.adults <= 2 * guests.room_count && guests.children <= guests.room_count;
  pay.textContent = 'Proceed to payment';
  pay.disabled = !validParty;
  byId('providerNote').textContent = validParty
    ? rupees(hotel.testRate) + (hourly ? ' per hour' : ' per night') + ' × ' + units + ' × ' + guests.room_count + ' room(s) = ' + rupees(total) + '. Test payment. One ZeroDesk QR covers the party. No hotel reservation.'
    : 'Test occupancy is 1–2 adults and up to one child per room. Close details to change your party.';
  if (hotel.salesClosed) {
    pay.disabled = true;
    pay.textContent = 'Test inventory pending';
    byId('providerNote').textContent = 'This property is awaiting test inventory. Choose another listed room to pay.';
  }
  pay.onclick = () => {
    if (!validSearch()) return;
    if (!currentUser) {
      sessionStorage.setItem('zd-checkout-intent',JSON.stringify({code:hotel.checkoutCode,arrival:arrival.value,departure:departure.value,hour:byId('arrivalHour').value,duration:byId('hourCount').value,...party()}));
      dialog.close();show('auth');toast('Sign in to continue with this room');return;
    }
    reserve(null, {catalogCode:hotel.checkoutCode, checkIn:arrival.value, checkOut:hourly ? null : departure.value,
      startHour:hourly ? Number(byId('arrivalHour').value) : null, hours:hourly ? hours : null,
      ...guests, expectedPaise:total * 100}, pay);
  };
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
city.onchange = byId('chainChoice').onchange = byId('priceOrder').onchange = byId('coupleFilter').onchange = renderHotels;
arrival.onchange = syncDates;
byId('cityForm').oninput = () => byId('arrivalHour').setCustomValidity('');
byId('cityForm').onsubmit = event => {
  event.preventDefault();
  if (validSearch()) {
    byId('partyPicker').open=false;
    searchDialog.close();
    show('home');
    byId('hotelResults').hidden = false;
    loadMapDirectory();
    renderHotels();
    byId('hotelResults').scrollIntoView();
  }
};

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
  const response = path.startsWith('/api/') ? await apiFetch(path) : await fetch(path);
  if (!response.ok) throw new Error('Catalogue unavailable');
  return response.json();
}
readList('destinations.json').then(data => {
  scenes = data;
  slideshow(data);
  for (const [cityName, index] of [['Udaipur',0],['Jodhpur',1],['Delhi',2],['Mumbai',5],['Pune',4],['Jaipur',11]]) {
    const destination = node('button');
    destination.type = 'button';
    const photo = node('img');
    photo.src = data[index].src;
    photo.loading = 'lazy';
    photo.alt = '';
    destination.append(photo,node('span',cityName));
    destination.onclick = () => {
      if (![...city.options].some(option => option.value === cityName)) city.add(new Option(cityName,cityName));
      city.value = cityName;
      byId('hotelQuery').value = byId('directoryState').value = byId('chainChoice').value = '';
      updateMode('day');
      byId('cityForm').requestSubmit();
    };
    byId('destinationGrid').append(destination);
  }
  renderHotels();
}).catch(() => document.querySelector('.scene-controls').hidden = true);
Promise.all([readList('hotels.json'), readList('/api/catalog-rates').catch(() => null)]).then(([data, rates]) => {
  for (const h of data) {
    h.salesClosed = !Number.isFinite(rates?.[h.checkoutCode]);
    if (!h.salesClosed) h.testRate = rates[h.checkoutCode];
  }
  hotels = data;
  for(const chain of [...new Set(data.map(h=>h.chain))].sort()) byId('chainChoice').add(new Option(chain,chain));
  for (const destination of new Set(hotels.map(hotel => hotel.city))) {
    if (![...city.options].some(option => option.value === destination)) city.add(new Option(destination, destination));
  }
  renderHotels();
  const shared=hotels.find(h=>h.checkoutCode===new URLSearchParams(location.search).get('hotel'));
  if(!resumeCheckout() && shared){city.value=shared.city;updateMode(shared.mode);showDetails(shared);}
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
    const row = {...party(),hotel:hotel.name, room:hotel.room, city:hotel.city, arrival:arrival.value,
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
  let query = db.from('stay_requests').select('id,hotel,room,city,arrival,departure,start_hour,duration_hours,status,supplier_reference,room_count,adults,children');
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
    item.append(node('strong',row.hotel), node('p',row.room + ' · ' + slot + ' · Rooms: '+row.room_count+' · Adults: '+row.adults+' · Children: '+row.children),
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

function resumeCheckout() {
  if(!hotels.length || typeof currentUser==='undefined' || !currentUser) return false;
  const raw=sessionStorage.getItem('zd-checkout-intent');
  if(!raw) return false;
  sessionStorage.removeItem('zd-checkout-intent');
  let intent;
  try { intent=JSON.parse(raw); } catch { return false; }
  const hotel=hotels.find(item=>item.checkoutCode===intent.code);
  if(!hotel) return false;
  city.value=hotel.city; arrival.value=intent.arrival; departure.value=intent.departure;
  byId('arrivalHour').value=intent.hour;byId('hourCount').value=intent.duration;
  byId('guestRooms').value=intent.room_count;byId('guestAdults').value=intent.adults;byId('guestChildren').value=intent.children;
  byId('partySummary').textContent=partyText();updateMode(hotel.mode);
  if(!dialog.open) showDetails(hotel);
  return true;
}
document.addEventListener('zerodesk:session',resumeCheckout);

let directory = [];
let mappedStays = [];
let directoryLoad;
let directoryError = false;
function loadMapDirectory() {
  if (directoryLoad) return directoryLoad;
  directoryLoad = readList('india-stays.json').then(groups => {
    for (const [state,rows] of Object.entries(groups)) {
      byId('directoryState').add(new Option(state,state));
      for (const [name,city,kind,id] of rows) mappedStays.push({name,city,state,kind,id});
    }
    directoryError = false;
    renderDirectory();
  }).catch(() => { directoryLoad = null; directoryError = true; renderDirectory(); });
  return directoryLoad;
}
byId('directoryState').onchange = () => renderDirectory();
let directoryLimit = 24;
function renderDirectory(extend = false) {
  if (!extend) directoryLimit = 24;
  const section = byId('directorySection');
  section.hidden = (!directory.length && !mappedStays.length && !directoryError) || mode !== 'day' || byId('coupleFilter').checked;
  if (section.hidden) return;
  const chain = byId('chainChoice').value;
  const region = byId('directoryState').value;
  const place = normalize(city.value);
  const matches = directory.concat(mappedStays).filter(h => (!region || h.state === region) &&
    (!place || normalize(h.city || '').includes(place) || normalize(h.state || '') === place) &&
    (!chain || chain === h.chain) && matchesSearch(h));
  byId('directoryCount').textContent = matches.length.toLocaleString('en-IN') + ' directory listings' + (directoryError ? ' · National directory unavailable. Search again to retry.' : '');
  byId('directoryList').replaceChildren(...matches.slice(0, directoryLimit).map(h => {
    const entry = node('li');
    entry.append(node('strong', h.name), node('small', [h.chain || h.kind,h.city,h.state].filter(Boolean).join(' · ')));
    if (h.id) {
      const link = node('a','View on map');
      link.href = 'https://www.openstreetmap.org/' + h.id;
      link.target = '_blank';
      link.rel = 'noopener';
      entry.append(link);
    }
    return entry;
  }));
  byId('directoryMore').hidden = directoryLimit >= matches.length;
}
byId('hotelQuery').oninput = renderHotels;
byId('directoryMore').onclick = () => { directoryLimit += 24; renderDirectory(true); };
readList('hotel-directory.json').then(data => {
  directory = data;
  for (const destination of [...new Set(data.map(h => h.city))].sort()) {
    if (![...city.options].some(option => option.value === destination)) city.add(new Option(destination, destination));
  }
  renderDirectory();
}).catch(() => { byId('directorySection').hidden = true; });
