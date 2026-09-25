// ZeroDesk Phase 2 — Supabase-backed educational prototype.
// Digital key and door unlock are intentionally DEMO ONLY.
const cfg = window.ZERODESK_CONFIG;
const db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
let currentUser = null, rooms = [], myBookings = [], isAdmin = false;
let recoveryMode = false;
const recoveryError = new URLSearchParams(location.hash.replace(/^#/, '')).get('error_code');
const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(n);
const safe = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => { const d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); };
function toast(msg){ const el=$('toast'); el.textContent=msg; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),3000); }
function show(view, load=true){
 if(view==='admin'&&!isAdmin){toast('Admin access required');return;}
 if(view==='booking'&&!currentUser)view='auth';
 if(view==='password'&&!currentUser){toast('Sign in or open a valid recovery link first');return;}
 document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===view));
 document.querySelectorAll('.nav-btn').forEach(v=>v.classList.toggle('active',v.dataset.view===view));
 if(load&&view==='booking')loadBookings(); if(view==='admin')loadAdmin();
 window.scrollTo(0,0);
}
document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));
$('startBooking').onclick=()=>$('roomsSection').scrollIntoView({behavior:'smooth'});
$('loginBtn').onclick=async()=>{
 const {error}=await db.auth.signInWithPassword({email:$('authEmail').value.trim(),password:$('authPassword').value});
 if(error) return toast(error.message); toast('Signed in'); await refreshSession(); show('home');
};
$('registerBtn').onclick=async()=>{
 const email=$('authEmail').value.trim(), password=$('authPassword').value, full_name=$('authName').value.trim();
 if(!full_name||password.length<8)return toast('Enter your name and an 8+ character password');
 const {error}=await db.auth.signUp({email,password,options:{data:{full_name},emailRedirectTo:location.origin}});
 if(error)return toast(error.message);
 $('authMessage').textContent='Registration submitted. Check your email and confirm your account before signing in.';
};
$('forgotPasswordBtn').onclick=async()=>{
 const email=$('authEmail').value.trim();
 if(!email)return toast('Enter your registered email first');
 $('forgotPasswordBtn').disabled=true;
 const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/'});
 $('forgotPasswordBtn').disabled=false;
 $('authMessage').textContent=error ? error.message : 'If this account exists, a recovery email has been requested. Open only the newest link.';
};
$('changePasswordNav').onclick=()=>{recoveryMode=false;show('password');};
$('updatePasswordBtn').onclick=async()=>{
 const password=$('newPassword').value, confirm=$('confirmPassword').value;
 if(password.length<8)return $('passwordMessage').textContent='Use at least 8 characters.';
 if(password!==confirm)return $('passwordMessage').textContent='Passwords do not match.';
 $('updatePasswordBtn').disabled=true;
 const {error}=await db.auth.updateUser({password});
 $('updatePasswordBtn').disabled=false;
 if(error){$('passwordMessage').textContent=error.message;return;}
 $('newPassword').value='';$('confirmPassword').value='';
 recoveryMode=false;
 $('passwordMessage').textContent='Password updated successfully. You can use it to sign in next time.';
 toast('Password updated');
 // Clear expired/recovery tokens from the address bar without a reload.
 history.replaceState(null,'',location.pathname);
};
$('signOut').onclick=async()=>{await db.auth.signOut(); await refreshSession(); show('home');};
async function refreshSession(){
 const {data:{user}}=await db.auth.getUser(); currentUser=user;
 $('authNav').hidden=!!user; $('signOut').hidden=!user; $('changePasswordNav').hidden=!user;
 isAdmin=false;
 if(user){
  const {data,error}=await db.rpc('is_hotel_admin');
  if(!error)isAdmin=!!data;
  // The profile contains only non-sensitive display fields.
  const {data:profile}=await db.from('profiles').select('id').eq('id',user.id).maybeSingle();
  if(!profile)await db.from('profiles').insert({id:user.id,full_name:user.user_metadata?.full_name||''});
 }
 $('adminNav').hidden=!isAdmin;
 await loadRooms();
}
async function loadRooms(){
 const {data,error}=await db.from('rooms').select('id,room_number,room_type,price_per_night,is_active').eq('is_active',true).order('room_number');
 if(error){$('roomGrid').textContent='Could not load rooms: '+error.message;return;}
 rooms=data||[];
 $('roomGrid').innerHTML=rooms.map(r=>`<div class="room-card"><p class="eyebrow">ROOM ${safe(r.room_number)}</p><h3>${safe(r.room_type)}</h3><p class="room-price">${money(r.price_per_night)} / night</p><p class="room-meta">Availability is checked for your selected dates.</p><button class="primary" data-room="${r.id}">Choose Room</button></div>`).join('');
 $('roomGrid').querySelectorAll('[data-room]').forEach(b=>b.onclick=()=>openForm(Number(b.dataset.room)));
}
function openForm(roomId){
 if(!currentUser){toast('Sign in to book a room');show('auth');return;}
 const r=rooms.find(x=>x.id===roomId); if(!r)return;
 show('booking',false);
 $('bookingContent').innerHTML=`<div class="form-layout"><div class="form-card"><p class="eyebrow">NEW BOOKING</p><h3>${safe(r.room_type)} · ${safe(r.room_number)}</h3><div class="field"><label>Check-in</label><input id="checkinDate" type="date" min="${today()}" value="${today()}"></div><div class="field"><label>Check-out</label><input id="checkoutDate" type="date" min="${today()}"></div><div class="alert info">Demo reservation: no payment is collected. Identity verification and smart locks are not connected.</div><button class="primary" id="reserveBtn">Confirm demo booking</button></div><div class="summary-card"><h3>${safe(r.room_type)}</h3><p>${money(r.price_per_night)} per night</p></div></div>`;
 $('reserveBtn').onclick=()=>reserve(r.id);
}
async function reserve(roomId){
 const a=$('checkinDate').value,b=$('checkoutDate').value;
 if(!a||!b||b<=a)return toast('Choose valid dates');
 $('reserveBtn').disabled=true;
 const {data,error}=await db.rpc('reserve_room',{p_room_id:roomId,p_check_in:a,p_check_out:b});
 if(error){$('reserveBtn').disabled=false;return toast(error.message);}
 toast('Demo reservation saved online'); await loadBookings();
}
async function loadBookings(){
 if(!currentUser)return;
 const {data,error}=await db.from('bookings').select('id,room_id,check_in,check_out,total_amount,status,created_at').eq('guest_id',currentUser.id).order('created_at',{ascending:false});
 if(error){$('bookingContent').textContent=error.message;return;}
 myBookings=data||[];
 const byId=Object.fromEntries(rooms.map(r=>[r.id,r]));
 $('bookingContent').innerHTML=myBookings.length?myBookings.map(b=>{
 const r=byId[b.room_id];
 return `<div class="summary-card" style="margin-bottom:14px"><p class="eyebrow">BOOKING ${safe(b.id.slice(0,8))}</p><h3>${safe(r?.room_type||'Room')} · ${safe(r?.room_number||b.room_id)}</h3><p>${safe(b.check_in)} → ${safe(b.check_out)}</p><p>${money(b.total_amount)} · <strong>${safe(b.status)}</strong></p><div class="form-actions">${b.status==='confirmed'?`<button class="primary" data-checkin="${b.id}">Demo check-in</button>`:''}${b.status==='checked_in'?`<button class="primary" data-key="${b.id}">Show demo QR</button><button class="secondary" data-checkout="${b.id}">Demo checkout</button>`:''}</div><div id="key-${b.id}"></div></div>`;
 }).join(''):'<div class="empty">No bookings yet. Choose a room from the Book tab.</div>';
 document.querySelectorAll('[data-checkin]').forEach(x=>x.onclick=()=>changeStatus('demo_check_in',x.dataset.checkin));
 document.querySelectorAll('[data-checkout]').forEach(x=>x.onclick=()=>changeStatus('demo_check_out',x.dataset.checkout));
 document.querySelectorAll('[data-key]').forEach(x=>x.onclick=()=>demoKey(x.dataset.key));
}
async function changeStatus(fn,id){
 const {error}=await db.rpc(fn,{p_booking_id:id});
 if(error)return toast(error.message);toast('Demo booking updated');await loadBookings();
}
function demoKey(id){
 const b=myBookings.find(x=>x.id===id);if(!b||b.status!=='checked_in')return;
 const target=$('key-'+id);target.innerHTML='<div class="alert warning">DEMO QR ONLY — not a secure access credential or real door key.</div><div class="qr" id="qr-'+id+'"></div><button class="secondary" id="unlock-'+id+'">Simulate unlock</button>';
 new QRCode($('qr-'+id),{text:'ZERODESK-DEMO:'+id,width:180,height:180});
 $('unlock-'+id).onclick=()=>toast('Simulated door unlocked. No physical lock connected.');
}
async function loadAdmin(){
 if(!isAdmin)return;
 const {data,error}=await db.from('bookings').select('id,guest_id,room_id,check_in,check_out,total_amount,status').order('check_in',{ascending:false});
 if(error){$('adminBookings').textContent=error.message;return;}
 const bs=data||[];
 $('stats').innerHTML=[['Total bookings',bs.length],['Checked in',bs.filter(b=>b.status==='checked_in').length],['Confirmed',bs.filter(b=>b.status==='confirmed').length],['Demo booking value',money(bs.reduce((n,b)=>n+Number(b.total_amount),0))]].map(([label,value])=>`<div class="stat"><div class="num">${safe(value)}</div><div class="label">${label}</div></div>`).join('');
 $('adminBookings').innerHTML=bs.map(b=>`<div class="booking-row"><span>${safe(b.id.slice(0,8))}</span><span>Room ${safe(rooms.find(r=>r.id===b.room_id)?.room_number||b.room_id)}</span><span>${safe(b.check_in)} → ${safe(b.check_out)}</span><span>${money(b.total_amount)}</span><strong>${safe(b.status)}</strong></div>`).join('')||'<p>No bookings.</p>';
 $('adminRooms').innerHTML=rooms.map(r=>`<div class="room-status"><strong>Room ${safe(r.room_number)}</strong><p>${safe(r.room_type)}</p><p>${money(r.price_per_night)} / night</p></div>`).join('');
}
db.auth.onAuthStateChange((event)=>{
 if(event==='PASSWORD_RECOVERY'){
  recoveryMode=true;
  setTimeout(async()=>{await refreshSession();show('password');$('passwordMessage').textContent='Recovery link accepted. Set your new password below.';},0);
 } else {
  setTimeout(async()=>{await refreshSession();if(recoveryMode&&currentUser)show('password');},0);
 }
});
refreshSession().then(()=>{
 if(recoveryError){
  $('authMessage').textContent='This recovery link has expired or was already used. Request a fresh link, or use Change password if already signed in.';
  if(!currentUser)show('auth');
  history.replaceState(null,'',location.pathname);
 }
});
