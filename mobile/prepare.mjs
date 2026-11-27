import {readFile, writeFile, mkdir, copyFile, access, rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

process.chdir(fileURLToPath(new URL('.',import.meta.url)));
await mkdir('www',{recursive:true});
for (const obsolete of ['hotel-directory.json','india-stays.json','geonames-hotels.json','destinations.json','photo-credits.html']) await rm('www/'+obsolete,{force:true});
for (const file of ['app.js','config.js','hotel-search.js','style.css','hotels.json','favicon.png']) {
  await copyFile('../'+file,'www/'+file);
}
await copyFile('node_modules/@supabase/supabase-js/dist/umd/supabase.js','www/supabase.js');
await copyFile('node_modules/qrcodejs/qrcode.min.js','www/qrcode.min.js');
await copyFile('mobile.css','www/mobile.css');
await build({entryPoints:['native.js'],outfile:'www/native.js',bundle:true,minify:true,format:'iife'});
const template = await readFile('../index.html','utf8');
const html = template.replace('https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js','qrcode.min.js')
 .replace('<script defer src="https://checkout.razorpay.com/v1/checkout.js"></script>','')
 .replace('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js','supabase.js')
 .replace('</head>','<link rel="stylesheet" href="mobile.css"></head>')
 .replace('<script src="app.js">','<script src="native.js"></script><script src="app.js">')
 .replace('</main>',`</main>
 <nav id="guestTabs" aria-label="Guest navigation"><button data-tab="home" aria-current="page">Explore</button>
 <button data-tab="booking">My bookings</button><button data-tab="account">Account</button></nav>`);
if (!html.includes('id="guestTabs"') || !html.includes('src="native.js"')) throw Error('Guest navigation or native bridge missing');
await writeFile('www/index.html',html);

try { await access('android/gradlew'); }
catch { execFileSync(process.execPath,['node_modules/@capacitor/cli/bin/capacitor','add','android'],{stdio:'inherit'}); }
const res='android/app/src/main/res/';
await mkdir(res+'drawable-nodpi',{recursive:true});
await copyFile('../favicon.png',res+'drawable-nodpi/zerodesk.png');
const manifestPath='android/app/src/main/AndroidManifest.xml';
let manifest=await readFile(manifestPath,'utf8');
manifest=manifest.replace('android:allowBackup="true"','android:allowBackup="false"')
 .replace('@mipmap/ic_launcher"','@drawable/zerodesk"').replace('@mipmap/ic_launcher_round"','@drawable/zerodesk"');
if (!manifest.includes('android:host="auth"')) manifest=manifest.replace('</activity>',`
  <intent-filter>
    <action android:name="android.intent.action.VIEW"/>
    <category android:name="android.intent.category.DEFAULT"/>
    <category android:name="android.intent.category.BROWSABLE"/>
    <data android:scheme="in.zerodesk.stays" android:host="auth"/>
  </intent-filter></activity>`);
for (const permission of ['CAMERA','ACCESS_COARSE_LOCATION','ACCESS_FINE_LOCATION']) {
  if (!manifest.includes('android.permission.'+permission+'"')) manifest=manifest.replace('</manifest>','<uses-permission android:name="android.permission.'+permission+'"/></manifest>');
}
await writeFile(manifestPath,manifest);
const stylesPath=res+'values/styles.xml';
let styles=await readFile(stylesPath,'utf8');
styles=styles.replace('<item name="android:background">@drawable/splash</item>','<item name="windowSplashScreenAnimatedIcon">@drawable/zerodesk</item><item name="windowSplashScreenBackground">#FFFFFF</item><item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>');
await writeFile(stylesPath,styles);
const gradlePath='android/app/build.gradle';
let appBuild=await readFile(gradlePath,'utf8');
appBuild=appBuild.replace(/versionCode \d+/, 'versionCode 7').replace(/versionName "[^"]+"/,'versionName "0.5.0"');
await writeFile(gradlePath,appBuild);
