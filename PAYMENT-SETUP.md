# ZeroDesk ₹1 Razorpay test integration

This preserves the red-and-white ZeroDesk design. The floating **Pay ₹1 (Test)** button is a standalone payment test; it does **not** mark hotel bookings as paid or create a reservation.

1. Upload these files and the `api` folder to the same Vercel-connected GitHub branch. Keep `config.js` as supplied by your existing project.
2. In Vercel Project Settings → Environment Variables, add `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` from Razorpay **Test Mode**. Set them for the target deployment environment (Preview and/or Production), then redeploy. Never put the secret in browser JavaScript or commit `.env.local`.
3. Confirm your domain shows the red-and-white homepage and the floating button. Use only Razorpay's documented test payment methods; test mode does not collect real money.
4. After a test payment, look for the message `₹1 test payment verified successfully`. The backend verifies the signature and fetches the payment and order from Razorpay.

**Important:** To charge actual hotel bookings, a separate server-side booking/order mapping and authenticated webhook flow are required. This demo intentionally keeps ₹1 payment separate from booking.
