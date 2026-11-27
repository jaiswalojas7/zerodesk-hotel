import { CapacitorHttp } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Checkout } from 'capacitor-razorpay';

const site = 'https://zerodesk-hotel.vercel.app';
const callback = 'in.zerodesk.stays://auth/callback';
const recoveryCallback = 'in.zerodesk.stays://auth/recover';

async function request(path, options = {}) {
  const url = new URL(path, site);
  if (url.origin !== site || !url.pathname.startsWith('/api/')) throw new Error('Unknown booking endpoint');
  const result = await CapacitorHttp.request({
    url: url.href, method: options.method || 'GET', headers: options.headers || {},
    data: options.body ? JSON.parse(options.body) : undefined, disableRedirects: true,
    connectTimeout: 15000, readTimeout: 30000
  });
  return {ok: result.status >= 200 && result.status < 300, json: async () => {
    if (!result.data || typeof result.data !== 'object') throw new Error('Booking service is unavailable. Please retry.');
    return result.data;
  }};
}

// The shared checkout handler sends successful responses to the existing verification API.
window.Razorpay = class {
  constructor(options) { this.options = options; }
  on(name, listener) { if (name === 'payment.failed') this.failed = listener; }
  async open() {
    const {handler, modal, ...order} = this.options;
    try {
      if (!order.key?.startsWith('rzp_test_')) throw new Error('Android beta accepts test payments only.');
      const {response} = await Checkout.open(order);
      await handler(typeof response === 'string' ? JSON.parse(response) : response);
    } catch {
      this.failed?.({error:{description:'Checkout closed or unavailable'}});
      modal?.ondismiss?.();
    }
  }
};

window.ZeroDeskAndroid = {
  site, callback, recoveryCallback, request,
  openAuth: url => Browser.open({url}),
  async start({session, view, signOut, callback: finishAuth, notify}) {
    const tabs = document.getElementById('guestTabs');
    tabs.onclick = event => {
      const target = event.target.closest('button')?.dataset.tab;
      if (target) view(target);
    };
    document.addEventListener('zerodesk:view', ({detail}) => {
      for (const button of tabs.querySelectorAll('button')) {
        const active = button.dataset.tab === detail || (button.dataset.tab === 'account' && ['auth','password','account'].includes(detail));
        button.setAttribute('aria-current', active ? 'page' : 'false');
      }
    });
    let lastCode;
    async function receive({url}) {
      const redirect = new URL(url);
      if (![callback,recoveryCallback].includes(redirect.protocol+'//'+redirect.host+redirect.pathname)) return;
      const code = redirect.searchParams.get('code');
      if (!code) return notify('The sign-in link has expired or was cancelled.');
      if (lastCode === code) return;
      lastCode = code;
      await Browser.close().catch(() => {});
      await finishAuth(code, redirect.pathname === '/recover');
    }
    await App.addListener('appUrlOpen', receive);
    const initial = await App.getLaunchUrl();
    if (initial?.url) await receive(initial);
    await App.addListener('backButton', () => {
      const dialog = document.querySelector('dialog[open]');
      if (dialog) dialog.close();
      else if (!document.getElementById('home').classList.contains('active')) view('home');
      else App.minimizeApp();
    });
  }
};
