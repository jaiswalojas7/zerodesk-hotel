# ZeroDesk Android beta

From this directory run `npm ci`, then `npm run build` with Node 22+, JDK 21 and Android SDK platform 36 installed. The debug APK is at `android/app/build/outputs/apk/debug/app-debug.apk`. Install it with `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`. The generated Android Studio project can be opened with `npx cap open android`.

The beta packages the repository's guest interface and uses its existing Supabase project. The native HTTP bridge calls the ZeroDesk Vercel booking APIs. Razorpay checkout accepts test keys. Pending order references survive app restarts and are scoped to the signed-in guest.

For Google sign-in and email confirmation or recovery on the device that initiated the request, allow the exact redirect URLs `in.zerodesk.stays://auth/callback` and `in.zerodesk.stays://auth/recover` in the Supabase Auth redirect settings. The app uses a system browser and PKCE.

Before distributing to guests, test a sandbox booking on a phone, interrupt checkout, recover the booking, reopen My bookings, and scan the issued QR from the staff device. Public distribution requires a separately signed release and store review.

## Google Play internal testing

Use a private upload keystore you control. After running `npm run sync`, open the generated Android project in Android Studio, use **Build → Generate Signed Bundle / APK → Android App Bundle**, select the release variant and sign with your upload key. Keep the keystore and passwords outside Git. Increase the version code in `prepare.mjs` for each subsequent Play release.

In Play Console create the ZeroDesk app and enable Play App Signing. Start with **Testing → Internal testing**, upload the signed release AAB, add testers and distribute the opt-in link. Complete store listing, screenshots, privacy policy, Data safety, reviewer access and account deletion requirements before applying for production. The beta currently uses test payments.
