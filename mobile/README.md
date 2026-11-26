# ZeroDesk Android beta

From this directory run `npm ci`, then `npm run build` with Node 22+, JDK 21 and Android SDK platform 36 installed. The debug APK is at `android/app/build/outputs/apk/debug/app-debug.apk`. Install it with `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`. The generated Android Studio project can be opened with `npx cap open android`.

The beta packages the repository's guest interface and uses its existing Supabase project. The native HTTP bridge calls the ZeroDesk Vercel booking APIs. Razorpay checkout accepts test keys. Pending order references survive app restarts and are scoped to the signed-in guest.

For Google sign-in and email confirmation or recovery on the device that initiated the request, allow the exact redirect URLs `in.zerodesk.stays://auth/callback` and `in.zerodesk.stays://auth/recover` in the Supabase Auth redirect settings. The app uses a system browser and PKCE.

Before distributing to guests, test a sandbox booking on a phone, interrupt checkout, recover the booking, reopen My bookings, and scan the issued QR from the staff device. Public distribution requires a separately signed release and store review.
