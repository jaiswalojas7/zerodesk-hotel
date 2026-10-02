// ZeroDesk Phase 2 — Supabase-backed educational prototype.
// Digital key and door unlock are intentionally DEMO ONLY.
const cfg = window.ZERODESK_CONFIG;
const db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
let currentUser = null, rooms = [], myBookings = [], isAdmin = false;
let recoveryMode = false;
let scanStream=null, scanTimer=null, scanBusy=false;
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
 if(view!=='admin')stopScanner();
 if(load&&view==='booking')loadBookings(); if(view==='admin')loadAdmin();
 window.scrollTo(0,0);
}
document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));
$('startBooking').onclick=()=>$('roomsSection').scrollIntoView({behavior:'smooth'});
$('loginBtn').onclick=async()=>{
 const {error}=await db.auth.signInWithPassword({email:$('authEmail').value.trim(),password:$('authPassword').value});
 if(error) return toast(error.message); toast('Signed in'); await refreshSession(); show('home');
};
$('googleLoginBtn').onclick=async()=>{
 const {error}=await db.auth.signInWithOAuth({
  provider:'google',
  options:{
   redirectTo:location.origin
  }
 });
 if(error) toast(error.message);
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
// Curated illustrative photos. Replace these with real hotel room photos before commercial use.
const roomPhotos = [
 ['photo-1611892440504-42a792e24d32','photo-1590490360182-c33d57733427','photo-1591088398332-8a7791972843','photo-1595576508898-0ad5c879a061','photo-1566665797739-1674de7a421a'],
 ['photo-1566073771259-6a8506099945','photo-1582719508461-905c673771fd','photo-1571896349842-33c89424de2d','photo-1578683010236-d716f9a3f461','photo-1540518614846-7eded433c457'],
 ['photo-1564013799919-ab600027ffc6','photo-1600607687920-4e2a09cf159d','photo-1600566753190-17f0baa2a6c3','photo-1600607687939-ce8a6c25118c','photo-1600210492486-724fe5c67fb0']
];
const roomImage=(idx,photo=0,width=1000)=>`https://images.unsplash.com/${roomPhotos[idx%3][photo]}?auto=format&fit=crop&w=${width}&q=82`;
let activeRoomFilter='all', galleryRoom=0, galleryPhoto=0, selectedDates={};
function filteredRooms(){return rooms.filter(r=>activeRoomFilter==='all'||r.room_type.toLowerCase().includes(activeRoomFilter));}
function drawRooms(){
 const selected=filteredRooms();
 $('roomGrid').innerHTML=selected.length?selected.map(r=>{
 const i=rooms.indexOf(r);
 return `<article class="room-card"><div class="room-photo-wrap"><img class="room-photo-img" src="${roomImage(i)}" alt="Illustrative photograph for ${safe(r.room_type)}" loading="lazy"><span class="photo-count">▧ 5 PHOTOS</span><button class="photo-view" data-gallery="${i}" aria-label="View five photos of ${safe(r.room_type)}">View gallery ↗</button></div><div class="room-body"><div class="room-top"><span class="room-type">ROOM ${safe(r.room_number)}</span><span class="room-available">● Available to book</span></div><h3>${safe(r.room_type)}</h3><p class="room-meta">✦ Premium comfort &nbsp; · &nbsp; ◉ Complimentary Wi-Fi &nbsp; · &nbsp; ♧ Thoughtful amenities</p><div class="room-bottom"><div><span class="from-label">STARTING FROM</span><p class="room-price">${money(r.price_per_night)} <small>/ night</small></p><span class="tax-note">Room price · Secure payment via Razorpay</span></div><button class="primary" data-room="${r.id}">Book this room →</button></div></div></article>`;
 }).join(''):'<p class="empty">No rooms match this filter.</p>';
 $('roomGrid').querySelectorAll('[data-room]').forEach(b=>b.onclick=()=>openForm(Number(b.dataset.room)));
 $('roomGrid').querySelectorAll('[data-gallery]').forEach(b=>b.onclick=()=>openGallery(Number(b.dataset.gallery)));
}
async function loadRooms(){
 const {data,error}=await db.from('rooms').select('id,room_number,room_type,price_per_night,is_active').eq('is_active',true).order('room_number');
 if(error){$('roomGrid').textContent='Could not load rooms: '+error.message;return;}
 rooms=data||[];drawRooms();
}
function openForm(roomId){
 if(!currentUser){toast('Sign in to book a room');show('auth');return;}
 const r=rooms.find(x=>x.id===roomId);if(!r)return;
 const i=rooms.indexOf(r);
 show('booking',false);
 $('bookingContent').innerHTML=`<div class="form-layout"><div class="form-card"><p class="eyebrow">YOUR RESERVATION</p><h3>${safe(r.room_type)} · Room ${safe(r.room_number)}</h3><p>Choose your stay dates and confirm your reservation.</p><div class="field"><label for="checkinDate">Check-in</label><input id="checkinDate" type="date" min="${today()}" value="${selectedDates.checkin||today()}"></div><div class="field"><label for="checkoutDate">Check-out</label><input id="checkoutDate" type="date" min="${today()}" value="${selectedDates.checkout||''}"></div><div class="alert info">Payments are processed via Razorpay. QR check-in and smart locks are for demonstration only. No real ID verification is performed.</div><button class="primary" id="reserveBtn"> Proceed to payment → </button></div><div class="summary-card booking-summary"><img src="${roomImage(i)}" alt="Illustrative room photograph"><div class="summary-padding"><span class="eyebrow">YOUR SELECTED ROOM</span><h3>${safe(r.room_type)}</h3><p>Room ${safe(r.room_number)}</p><p class="room-price">${money(r.price_per_night)} <small>/ night</small></p><p>Secure booking · Contactless QR check-in</p></div></div></div>`;
 $('checkinDate').onchange=()=>{selectedDates.checkin=$('checkinDate').value;$('checkoutDate').min=selectedDates.checkin;};
 $('checkoutDate').onchange=()=>{selectedDates.checkout=$('checkoutDate').value;};
 $('reserveBtn').onclick=()=>reserve(r.id);
}
function openGallery(i){galleryRoom=i;galleryPhoto=0;$('galleryModal').hidden=false;document.body.classList.add('modal-open');renderGallery();}
function renderGallery(){
 $('galleryImage').src=roomImage(galleryRoom,galleryPhoto,1500);
 $('galleryImage').alt=`Illustrative room photograph ${galleryPhoto+1} of 5`;
 $('galleryCounter').textContent=`${galleryPhoto+1} / 5`;
 $('galleryThumbs').innerHTML=roomPhotos[galleryRoom%3].map((_,j)=>`<button class="gallery-thumb ${j===galleryPhoto?'active':''}" data-photo="${j}" aria-label="Show photo ${j+1}"><img src="${roomImage(galleryRoom,j,220)}" alt="Room photo ${j+1}" loading="lazy"></button>`).join('');
 $('galleryThumbs').querySelectorAll('[data-photo]').forEach(b=>b.onclick=()=>{galleryPhoto=Number(b.dataset.photo);renderGallery();});
}
function closeGallery(){$('galleryModal').hidden=true;document.body.classList.remove('modal-open');}
$('closeGallery').onclick=closeGallery;
$('galleryPrev').onclick=()=>{galleryPhoto=(galleryPhoto+4)%5;renderGallery();};
$('galleryNext').onclick=()=>{galleryPhoto=(galleryPhoto+1)%5;renderGallery();};
$('galleryModal').addEventListener('click',e=>{if(e.target===$('galleryModal'))closeGallery();});
document.addEventListener('keydown',e=>{if($('galleryModal').hidden)return;if(e.key==='Escape')closeGallery();if(e.key==='ArrowRight')$('galleryNext').click();if(e.key==='ArrowLeft')$('galleryPrev').click();});
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{activeRoomFilter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));drawRooms();});
$('searchCheckin').min=today();$('searchCheckout').min=today();
$('searchCheckin').onchange=()=>{$('searchCheckout').min=$('searchCheckin').value;};
$('searchRooms').onclick=()=>{
 const a=$('searchCheckin').value,b=$('searchCheckout').value;
 if(!a||!b||b<=a)return toast('Select valid check-in and check-out dates');
 selectedDates={checkin:a,checkout:b};
 $('roomsSection').scrollIntoView({behavior:'smooth'});
 toast('Select a room to continue your reservation');
};
let heroSlide=0;const slides=[...document.querySelectorAll('.hero-slide')],dots=[...document.querySelectorAll('.hero-dot')];
function setHeroSlide(n){heroSlide=n;slides.forEach((el,i)=>el.classList.toggle('is-active',i===n));dots.forEach((el,i)=>el.classList.toggle('active',i===n));}
dots.forEach((dot,i)=>dot.onclick=()=>setHeroSlide(i));
if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)setInterval(()=>{if(document.visibilityState==='visible')setHeroSlide((heroSlide+1)%slides.length);},5500);
async function reserve(roomId) {
  const checkIn = $('checkinDate').value;
  const checkOut = $('checkoutDate').value;
  const button = $('reserveBtn');

  if (!checkIn || !checkOut || checkOut <= checkIn) {
    return toast('Choose valid check-in and check-out dates');
  }

  if (typeof Razorpay === 'undefined') {
    return toast('Payment checkout could not load');
  }

  button.disabled = true;

  try {
    const { data: { session }, error: sessionError } =
      await db.auth.getSession();

    if (sessionError || !session?.access_token) {
      toast('Please sign in again');
      show('auth');
      return;
    }

    const token = session.access_token;
    const pendingOrderKey = 'zerodesk_pending_booking';

    const response = await fetch('/api/create-booking-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        roomId,
        checkIn,
        checkOut
      })
    });

    const order = await response.json();

    if (!response.ok || !order.orderId) {
      throw new Error(order.error || 'Could not prepare payment');
    }

    sessionStorage.setItem(pendingOrderKey, order.orderId);
    const room = rooms.find(r => r.id === roomId);

    const checkout = new Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      order_id: order.orderId,
      name: 'ZeroDesk',
      description: `${room?.room_type || 'Hotel room'} · ${order.nights} night(s)`,
      theme: { color: '#ee233b' },

      handler: async function (payment) {
        try {
          toast('Payment received. Verifying your booking...');

          const verifyResponse = await fetch(
            '/api/verify-booking-payment',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify(payment)
            }
          );

          const result = await verifyResponse.json();

          if (verifyResponse.ok && result.bookingConfirmed) {
            sessionStorage.removeItem(pendingOrderKey);
            toast('Payment verified! Booking confirmed.');
            await loadBookings();
            return;
        }

          toast(
            result.error ||
            'Payment status needs checking. Contact support.'
          );
        } catch (error) {
          console.error('Booking verification error:', error);
          toast(
            'Could not confirm booking. Check payment status before retrying.'
          );
        } finally {
          button.disabled = false;
        }
      },

      modal: {
        ondismiss: function () {
          button.disabled = false;
        }
      }
    });

    checkout.on('payment.failed', function (response) {
      console.error('Payment failed:', response.error);
      toast('Payment failed or was cancelled');
      button.disabled = false;
    });

    checkout.open();

  } catch (error) {
    console.error('Booking payment error:', error);
    toast(error.message || 'Could not start payment');
    button.disabled = false;
  }
}

async function recoverBookingPayment() {
  const orderId = sessionStorage.getItem(
    'zerodesk_pending_booking'
  );

  if (!orderId) {
    return toast('No pending booking payment found');
  }

  try {
    const { data: { session } } = await db.auth.getSession();

    if (!session?.access_token) {
      return toast('Please sign in to recover your booking');
    }

    toast('Checking your payment with Razorpay...');

    const response = await fetch(
      '/api/recover-booking-payment',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ orderId })
      }
    );

    const result = await response.json();

    if (response.ok && result.bookingConfirmed) {
      sessionStorage.removeItem(
        'zerodesk_pending_booking'
      );

      toast('Booking recovered successfully!');
      await loadBookings();
      return;
    }

    toast(
      result.error ||
      'Payment status is unresolved. Do not pay again.'
    );

  } catch (error) {
    console.error('Recovery error:', error);
    toast('Could not check payment. Please try again later.');
  }
}
async function loadBookings(){
 if(!currentUser)return;
 const pendingOrderId = sessionStorage.getItem(
  'zerodesk_pending_booking'
);
 const {data,error}=await db.from('bookings').select('id,room_id,check_in,check_out,total_amount,status,created_at').eq('guest_id',currentUser.id).order('created_at',{ascending:false});
 if(error){$('bookingContent').textContent=error.message;return;}
 myBookings=data||[];
 const byId=Object.fromEntries(rooms.map(r=>[r.id,r]));
 $('bookingContent').innerHTML=myBookings.length?myBookings.map(b=>{
 const r=byId[b.room_id];
 return `<div class="summary-card" style="margin-bottom:14px"><p class="eyebrow">BOOKING ${safe(b.id.slice(0,8))}</p><h3>${safe(r?.room_type||'Room')} · ${safe(r?.room_number||b.room_id)}</h3><p>${safe(b.check_in)} → ${safe(b.check_out)}</p><p>${money(b.total_amount)} · <strong>${safe(b.status)}</strong></p><div class="form-actions">${b.status==='confirmed'?`<button class="primary" data-pass="${b.id}">Generate check-in QR</button>`:''}${b.status==='checked_in'?`<button class="primary" data-key="${b.id}">Show demo QR</button><button class="secondary" data-checkout="${b.id}">Demo checkout</button>`:''}</div><div id="key-${b.id}"></div></div>`;
 }).join(''):'<div class="empty">No bookings yet. Choose a room from the Book tab.</div>';
 if (pendingOrderId) {
  const recoveryButton = document.createElement('button');

  recoveryButton.className = 'primary';
  recoveryButton.textContent = 'Recover pending payment';
  recoveryButton.style.marginBottom = '20px';
  recoveryButton.onclick = recoverBookingPayment;

  $('bookingContent').prepend(recoveryButton);
}
 document.querySelectorAll('[data-pass]').forEach(x=>x.onclick=()=>issueCheckinPass(x.dataset.pass));
 document.querySelectorAll('[data-checkout]').forEach(x=>x.onclick=()=>changeStatus('demo_check_out',x.dataset.checkout));
 document.querySelectorAll('[data-key]').forEach(x=>x.onclick=()=>demoKey(x.dataset.key));
}
async function issueCheckinPass(id){
 const target=$('key-'+id); if(!target)return;
 target.textContent='Creating a 15-minute check-in pass…';
 const {data,error}=await db.rpc('issue_checkin_pass',{p_booking_id:id});
 if(error){target.textContent=error.message;return;}
 // The token is displayed only to the guest who requested it; no guest PII in the QR.
 const pass='ZD3:'+data.token;
 target.innerHTML='<div class="alert info">Show this QR to hotel staff. It expires in 15 minutes and can be used once. This is a demo check-in pass, not a room key.</div><div class="qr" id="passqr-'+id+'"></div><div class="key-token" style="overflow-wrap:anywhere;color:#17202a" id="passcode-'+id+'"></div><p>Expires: '+safe(new Date(data.expires_at).toLocaleString())+'</p>';
 $('passcode-'+id).textContent=pass;
 new QRCode($('passqr-'+id),{text:pass,width:180,height:180});
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
async function approvePass(){
 if(!isAdmin)return toast('Staff access required');
 const pass=$('staffPass').value.trim();
 if(!/^ZD3:[0-9a-f-]{36}$/i.test(pass))return $('scanResult').textContent='Enter a valid ZeroDesk check-in QR code.';
 $('verifyPassBtn').disabled=true;
 const {data,error}=await db.rpc('staff_checkin_pass',{p_token:pass.slice(4)});
 $('verifyPassBtn').disabled=false;
 if(error){$('scanResult').textContent='Check-in rejected: '+error.message;return;}
 $('scanResult').textContent='Checked in successfully: Room '+data.room_number+' · '+data.room_type+'. Pass used and invalidated.';
 $('staffPass').value=''; stopScanner(); await loadAdmin();
}
$('verifyPassBtn').onclick=approvePass;
function stopScanner(){
 if(scanTimer){clearInterval(scanTimer);scanTimer=null;}
 if(scanStream){scanStream.getTracks().forEach(t=>t.stop());scanStream=null;}
 $('scanVideo').hidden=true;$('stopScannerBtn').hidden=true;$('startScannerBtn').hidden=false;
}
$('stopScannerBtn').onclick=stopScanner;
$('startScannerBtn').onclick=async()=>{
 if(!('BarcodeDetector' in window)||!navigator.mediaDevices?.getUserMedia){
  $('scanResult').textContent='Camera QR scanning is not supported in this browser. Paste the QR pass code instead.';return;
 }
 try{
  const detector=new BarcodeDetector({formats:['qr_code']});
  scanStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});
  $('scanVideo').srcObject=scanStream;$('scanVideo').hidden=false;
  $('stopScannerBtn').hidden=false;$('startScannerBtn').hidden=true;
  scanTimer=setInterval(async()=>{
   if(scanBusy||$('scanVideo').readyState<2)return;
   scanBusy=true;
   try{const codes=await detector.detect($('scanVideo'));
    const code=codes.find(c=>c.rawValue?.startsWith('ZD3:'));
    if(code){$('staffPass').value=code.rawValue;stopScanner();await approvePass();}
   }catch(e){$('scanResult').textContent='Camera scan failed. Paste the code instead.';stopScanner();}
   finally{scanBusy=false;}
  },500);
 }catch(e){stopScanner();$('scanResult').textContent='Camera unavailable or permission denied. Paste the QR pass code instead.';}
};
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


// Independent ₹1 Razorpay TEST checkout. Does not create or pay for a hotel booking.
async function testRazorpayPayment(){
 const button=$('testPaymentBtn');
 if(button)button.disabled=true;
 try{
  if(typeof Razorpay==='undefined')throw new Error('Razorpay Checkout did not load');
  const response=await fetch('/api/create-order',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  const order=await response.json();
  if(!response.ok||!order.orderId)throw new Error(order.error||'Could not create order');
  const checkout=new Razorpay({
   key:order.keyId,amount:order.amount,currency:order.currency,order_id:order.orderId,
   name:'ZeroDesk',description:'₹1 test payment',theme:{color:'#ee233b'},
   handler:async function(payment){
    try{
     const resultResponse=await fetch('/api/verify-payment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payment)});
     const result=await resultResponse.json();
     if(resultResponse.ok&&result.verified)toast('₹1 test payment verified successfully');
     else toast('Payment verification failed. Check Razorpay dashboard.');
    }catch(error){console.error('Verification error',error);toast('Could not verify payment. Check Razorpay dashboard.');}
   },
   modal:{ondismiss:()=>{if(button)button.disabled=false;}}
  });
  checkout.open();
 }catch(error){console.error('Payment error',error);toast(error.message||'Payment error');}
 finally{if(button)button.disabled=false;}
}
