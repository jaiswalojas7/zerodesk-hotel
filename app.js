const ROOMS = [
  { id:"101", name:"Deluxe King", price:2499, maxGuests:2, features:["King Bed","Wi‑Fi","Smart TV"] },
  { id:"102", name:"Premium Twin", price:3499, maxGuests:3, features:["Twin Beds","Breakfast","Work Desk"] },
  { id:"103", name:"Executive Suite", price:4999, maxGuests:4, features:["King Bed","Living Area","Breakfast"] }
];

const KEY_TTL_MS = 12 * 60 * 60 * 1000;

function getData(){
  return JSON.parse(localStorage.getItem("zerodeskData") || JSON.stringify({
    bookings: [],
    roomStatus: { "101":"available", "102":"available", "103":"available" }
  }));
}
function saveData(data){ localStorage.setItem("zerodeskData", JSON.stringify(data)); }
function getCurrentBooking(){
  const id = localStorage.getItem("zerodeskCurrentBooking");
  if(!id) return null;
  return getData().bookings.find(b => b.id === id) || null;
}
function id(){ return "ZD-" + Math.random().toString(36).slice(2,8).toUpperCase(); }
function token(){ return "KEY-" + cryptoRandom(10); }
function cryptoRandom(len){
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out="";
  for(let i=0;i<len;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}
function money(n){ return new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n); }
function toast(msg){
  const el=document.getElementById("toast");
  el.textContent=msg; el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"),2200);
}
function todayISO(){
  const d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
  return d.toISOString().slice(0,10);
}

function switchView(view){
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  document.getElementById(view).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  if(view==="booking") renderBooking();
  if(view==="admin") renderAdmin();
  window.scrollTo({top:0,behavior:"smooth"});
}

document.querySelectorAll(".nav-btn").forEach(btn=>btn.addEventListener("click",()=>switchView(btn.dataset.view)));
document.getElementById("startBooking").addEventListener("click",()=>{
  document.getElementById("roomsSection").scrollIntoView({behavior:"smooth"});
});

function renderRooms(){
  const data=getData();
  const grid=document.getElementById("roomGrid");
  grid.innerHTML=ROOMS.map(room=>{
    const status=data.roomStatus[room.id] || "available";
    const disabled=status!=="available";
    return `
      <div class="room-card">
        <div class="room-top">
          <div><div class="eyebrow">ROOM ${room.id}</div><h3>${room.name}</h3></div>
          <div class="room-price">${money(room.price)}<small>/night</small></div>
        </div>
        <div class="room-meta">Up to ${room.maxGuests} guests</div>
        <div class="room-features">${room.features.map(f=>`<span class="tag">${f}</span>`).join("")}</div>
        <button class="primary" ${disabled?"disabled":""} onclick="openBookingForm('${room.id}')">
          ${disabled ? "Unavailable" : "Choose Room"}
        </button>
      </div>
    `;
  }).join("");
}
function openBookingForm(roomId){
  const room=ROOMS.find(r=>r.id===roomId);
  switchView("booking");
  document.getElementById("bookingContent").innerHTML=`
    <div class="form-layout">
      <div class="form-card">
        <div class="eyebrow">STEP 1</div>
        <h3>Reserve ${room.name} · Room ${room.id}</h3>
        <div class="field"><label>Check-in date</label><input id="checkinDate" type="date" min="${todayISO()}" value="${todayISO()}"></div>
        <div class="field"><label>Check-out date</label><input id="checkoutDate" type="date" min="${todayISO()}" value="${todayISO()}"></div>
        <div class="field"><label>Guest name</label><input id="guestName" placeholder="e.g. Ojas Jaiswal"></div>
        <div class="field"><label>Phone</label><input id="guestPhone" placeholder="+91 98765 43210"></div>
        <div class="field"><label>Email</label><input id="guestEmail" type="email" placeholder="you@example.com"></div>
        <div class="field"><label>Number of guests</label><select id="guestCount">${Array.from({length:room.maxGuests},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join("")}</select></div>
        <div class="alert info">Demo note: payment and identity verification are simulated. Do not upload real documents.</div>
        <button class="primary" onclick="createBooking('${room.id}')">Continue to Pre‑Check‑in</button>
      </div>
      <div class="summary-card">
        <div class="eyebrow">YOUR ROOM</div>
        <h2>${room.name}</h2><p>Room ${room.id}</p>
        <h3 style="margin-top:25px">${money(room.price)} / night</h3>
        <div class="room-features">${room.features.map(f=>`<span class="tag">${f}</span>`).join("")}</div>
      </div>
    </div>
  `;
}
function createBooking(roomId){
  const name=document.getElementById("guestName").value.trim();
  const phone=document.getElementById("guestPhone").value.trim();
  const email=document.getElementById("guestEmail").value.trim();
  const checkin=document.getElementById("checkinDate").value;
  const checkout=document.getElementById("checkoutDate").value;
  const guests=Number(document.getElementById("guestCount").value);
  if(!name||!phone||!email||!checkin||!checkout){toast("Please complete all fields.");return;}
  if(new Date(checkout)<=new Date(checkin)){toast("Check-out must be after check-in.");return;}
  const data=getData();
  if(data.roomStatus[roomId]!=="available"){toast("Room is no longer available.");renderRooms();return;}
  const room=ROOMS.find(r=>r.id===roomId);
  const nights=Math.max(1,Math.ceil((new Date(checkout)-new Date(checkin))/86400000));
  const booking={id:id(),roomId,roomName:room.name,name,phone,email,guests,checkin,checkout,nights,total:room.price*nights,status:"reserved",idVerified:false,paymentStatus:"paid-demo",key:null,keyExpiresAt:null,createdAt:new Date().toISOString()};
  data.bookings.push(booking);
  data.roomStatus[roomId]="occupied";
  saveData(data);
  localStorage.setItem("zerodeskCurrentBooking",booking.id);
  toast("Room reserved.");
  renderPreCheckin(booking.id);
}
function renderPreCheckin(bookingId){
  const b=getData().bookings.find(x=>x.id===bookingId);
  document.getElementById("bookingContent").innerHTML=`
    <div class="form-layout">
      <div class="form-card">
        <div class="eyebrow">STEP 2</div>
        <h3>Complete contactless pre‑check‑in</h3>
        <div class="alert info">For your college demo, this is a mock identity verification flow. Use placeholder details only.</div>
        <div class="field"><label>Identity document</label><select id="idType"><option>Passport</option><option>Driving Licence</option><option>Government ID</option></select></div>
        <div class="field"><label>Demo document number</label><input id="idNumber" placeholder="DEMO-123456"></div>
        <div class="field"><label>Document file (demo only)</label><input id="idFile" type="file" accept=".jpg,.jpeg,.png,.pdf"></div>
        <div class="field"><label>Signature</label><input id="signature" placeholder="Type your full name"></div>
        <div class="alert warning">Production version: replace this mock step with a compliant KYC/identity-verification provider and secure document storage.</div>
        <div class="form-actions">
          <button class="secondary" onclick="switchView('home')">Back</button>
          <button class="primary" onclick="completeCheckin('${b.id}')">Verify & Check In</button>
        </div>
      </div>
      <div class="summary-card">
        <div class="eyebrow">RESERVATION</div>
        <h2>${b.roomName}</h2>
        <p>Room ${b.roomId}</p>
        <p>${b.checkin} → ${b.checkout}</p>
        <p>${b.guests} guest(s) · ${money(b.total)}</p>
        <span class="booking-status status-reserved">Reserved</span>
      </div>
    </div>
  `;
}
function completeCheckin(bookingId){
  const idNum=document.getElementById("idNumber").value.trim();
  const sig=document.getElementById("signature").value.trim();
  if(!idNum||!sig){toast("Enter the demo ID and signature.");return;}
  const data=getData();
  const b=data.bookings.find(x=>x.id===bookingId);
  b.idVerified=true;b.status="checked-in";b.key=token();b.keyExpiresAt=Date.now()+KEY_TTL_MS;
  saveData(data); localStorage.setItem("zerodeskCurrentBooking",b.id);
  toast("Check-in complete.");
  renderDigitalKey(b.id);
}
function renderDigitalKey(bookingId){
  const b=getData().bookings.find(x=>x.id===bookingId);
  document.getElementById("bookingContent").innerHTML=`
    <div class="form-layout">
      <div class="key-card">
        <div class="eyebrow" style="color:#93c5fd">STEP 3</div>
        <h3>Digital Room Key</h3>
        <p>Room ${b.roomId} · ${b.roomName}</p>
        <div id="qrcode" class="qr"></div>
        <div class="key-token">${b.key}</div>
        <button class="primary" style="background:#2563eb;width:100%" onclick="unlockDoor('${b.id}')">Unlock Door (Demo)</button>
        <div class="form-actions" style="justify-content:center">
          <button class="secondary" onclick="checkout('${b.id}')">Check Out</button>
        </div>
      </div>
      <div class="summary-card">
        <div class="eyebrow">READY</div>
        <h2>You're checked in.</h2>
        <p>The QR is a demonstration credential. In production, this would be tied to a secure electronic-lock system.</p>
        <div class="alert success">✓ Identity verification marked complete</div>
        <div class="alert success">✓ Payment marked complete (demo)</div>
        <div class="alert success">✓ Digital key issued</div>
      </div>
    </div>
  `;
  new QRCode(document.getElementById("qrcode"),{
    text: JSON.stringify({booking:b.id,room:b.roomId,key:b.key}),
    width:180,height:180
  });
}
function unlockDoor(bookingId){
  const b=getData().bookings.find(x=>x.id===bookingId);
  if(!b||b.status!=="checked-in"){toast("Key is not active.");return;}
  if(Date.now()>b.keyExpiresAt){toast("Key expired.");return;}
  toast(`✓ Demo door unlocked for Room ${b.roomId}`);
}
function checkout(bookingId){
  const data=getData();
  const b=data.bookings.find(x=>x.id===bookingId);
  if(!b)return;
  b.status="checked-out";b.key=null;b.keyExpiresAt=null;
  data.roomStatus[b.roomId]="cleaning";
  saveData(data);
  toast("Checked out. Room sent to housekeeping.");
  renderBooking();
  renderRooms();
}
function renderBooking(){
  const b=getCurrentBooking();
  if(!b){
    document.getElementById("bookingContent").innerHTML=`
      <div class="empty">
        <h3>No booking yet</h3>
        <p>Choose a room from the Book tab to start.</p>
        <button class="primary" onclick="switchView('home')">Browse Rooms</button>
      </div>`;
    return;
  }
  if(b.status==="reserved"){renderPreCheckin(b.id);return;}
  if(b.status==="checked-in"){renderDigitalKey(b.id);return;}
  document.getElementById("bookingContent").innerHTML=`
    <div class="summary-card">
      <div class="eyebrow">COMPLETED</div>
      <h2>${b.roomName}</h2>
      <p>Booking ${b.id} · Room ${b.roomId}</p>
      <span class="booking-status status-checkedout">Checked out</span>
      <div class="alert success">Thank you, ${b.name}. Your demo stay is complete.</div>
    </div>`;
}
function renderAdmin(){
  const data=getData();
  const bookings=data.bookings;
  document.getElementById("stats").innerHTML=`
    <div class="stat"><div class="num">${bookings.length}</div><div class="label">Total bookings</div></div>
    <div class="stat"><div class="num">${bookings.filter(b=>b.status==="checked-in").length}</div><div class="label">Currently checked in</div></div>
    <div class="stat"><div class="num">${bookings.filter(b=>b.status==="reserved").length}</div><div class="label">Awaiting check-in</div></div>
    <div class="stat"><div class="num">${money(bookings.reduce((s,b)=>s+b.total,0))}</div><div class="label">Demo booking value</div></div>
  `;
  const rows=bookings.length?bookings.slice().reverse().map(b=>`
    <div class="booking-row">
      <div><strong>${b.name}</strong><br><small>${b.id}</small></div>
      <div>Room ${b.roomId}<br><small>${b.roomName}</small></div>
      <div>${b.checkin}<br><small>→ ${b.checkout}</small></div>
      <div>${money(b.total)}<br><span class="booking-status ${b.status==="checked-in"?"status-checkedin":b.status==="reserved"?"status-reserved":"status-checkedout"}">${b.status}</span></div>
      <div>${b.status==="checked-in"?`<button class="secondary" onclick="revokeKey('${b.id}')">Revoke Key</button>`:""}</div>
    </div>
  `).join(""):`<div class="empty">No bookings yet.</div>`;
  document.getElementById("adminBookings").innerHTML=rows;
  document.getElementById("adminRooms").innerHTML=ROOMS.map(r=>{
    const s=data.roomStatus[r.id]||"available";
    return `<div class="room-status"><strong>Room ${r.id}</strong><p>${r.name}</p><span class="${s}"><span class="dot"></span>${s}</span>${s==="cleaning"?`<button class="secondary" style="margin-top:10px" onclick="setRoomStatus('${r.id}','available')">Mark Clean</button>`:""}</div>`;
  }).join("");
}
function revokeKey(bookingId){
  const data=getData(); const b=data.bookings.find(x=>x.id===bookingId);
  if(!b)return;b.key=null;b.keyExpiresAt=null;b.status="reserved";saveData(data);toast("Key revoked.");renderAdmin();
}
function setRoomStatus(roomId,status){
  const data=getData();data.roomStatus[roomId]=status;saveData(data);toast(`Room ${roomId} marked ${status}.`);renderAdmin();renderRooms();
}
document.getElementById("clearDemo").addEventListener("click",()=>{
  localStorage.removeItem("zerodeskData");localStorage.removeItem("zerodeskCurrentBooking");
  toast("Demo data reset.");renderRooms();renderAdmin();renderBooking();
});

renderRooms();
renderBooking();
