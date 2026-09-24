# ZeroDesk — Contactless Hotel Check-in Demo

## What this project contains
A browser-based educational prototype showing:
- Room selection
- Booking creation
- Pre-check-in form
- Mock ID verification
- Demo payment state
- Digital room key token
- QR code credential
- Demo door-unlock action
- Checkout
- Housekeeping state
- Admin dashboard
- localStorage persistence

## Important
This is NOT production-ready KYC, payment or smart-lock software.

For a real deployment you would add:
1. Secure backend authentication
2. PostgreSQL/Supabase database
3. Real payment gateway (e.g. Razorpay/Stripe)
4. Compliant identity/KYC provider
5. Secure encrypted document storage
6. Hotel PMS integration
7. Smart-lock provider / BLE / NFC integration
8. Server-side key issuance and revocation
9. Audit logs, rate limiting and access control

## Run locally

### Easiest
Open `index.html` in Chrome.

### Better local server
Open this folder in VS Code, then run:

```bash
python -m http.server 5500
```

Open:
http://localhost:5500

## Deploy on Vercel
1. Create a GitHub repository.
2. Upload these files.
3. Import the repository into Vercel.
4. Framework preset: Other / static.
5. Deploy.

No build command is required.

## Demo flow
Book tab -> Choose Room -> Fill details -> Pre-check-in -> Verify & Check In -> Digital Key -> Unlock Door -> Check Out.

Do not upload real identity documents into this educational prototype.
