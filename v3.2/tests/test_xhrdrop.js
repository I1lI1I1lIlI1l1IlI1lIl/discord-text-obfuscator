'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const distCode = fs.readFileSync(path.join(__dirname, '..', 'dist', 'renderer.js'), 'utf8');

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  ok  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (detail ? ' :: ' + detail : '')); }
}

const MSG_URL = 'https://discord.com/api/v9/channels/222/messages';
const CHANNELLESS_URL = 'https://discord.com/api/v9/channels/@me/messages';
const KEY = 'shared secret phrase';
const DEFAULT_KEY = 'ArsenicV3-Dsc/DEFAULT-KEY';
const SUF = ' ᵉⁿᶜ';
const PLAIN = 'hello there';

const node_AV3V3 = require('./load_av3.js').load().AV3V3;

function makeContext(opts) {
  opts = opts || {};
  const store = new Map();
  if (opts.passkey) store.set('av3_passkey', opts.passkey);
  if (opts.pubs) store.set('av3_pubs', JSON.stringify(opts.pubs));
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k)
  };
  const nodes = [];
  const body = { children: [] };
  const MOs = [];
  const document = {
    body,
    getElementById: () => null,
    querySelector: () => null,
    createElement: () => ({
      style: {}, setAttribute() { }, addEventListener() { },
      appendChild() { }, set innerHTML(v) { }, removeChild() { },
      get firstChild() { return null; }, isConnected: false
    }),
    createTreeWalker: (root) => {
      const list = [];
      (function collect(n) {
        (n.children || []).forEach(ch => { if (ch.nodeType === 3) list.push(ch); collect(ch); });
      })(root);
      let i = -1;
      return { nextNode() { i++; return i < list.length ? list[i] : null; } };
    }
  };
  const sent = [];
  const origFetch = function (input, init) { sent.push({ input, init: init || {}, via: 'fetch' }); return {}; };
  class FakeXMLHttpRequest {
    constructor() {
      this._listeners = {};
      this.readyState = 0;
      this.status = 0;
      this.statusText = '';
      this.responseText = '';
      this.responseType = '';
      this.sentBody = null;
    }
    open(method, url) {
      this.method = String(method).toUpperCase();
      this.url = String(url);
      this.readyState = 1;
    }
    setRequestHeader() { }
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
    dispatchEvent(ev) {
      (this._listeners[ev && ev.type] || []).forEach(fn => fn.call(this, ev));
      return true;
    }
    send(body) {
      this.sentBody = body;
      sent.push({ xhr: this, body, url: this.url, method: this.method, via: 'xhr' });
    }
  }
  const ctx = {
    console, setTimeout, setInterval, clearTimeout, clearInterval,
    TextEncoder, TextDecoder, Uint8Array, Promise, JSON, Math, Date, Object, Array, String, Number, Error, WeakMap,
    Response: globalThis.Response,
    crypto: globalThis.crypto,
    localStorage,
    location: { href: opts.locationHref || 'https://discord.com/channels/111/222' },
    document,
    fetch: origFetch,
    NodeFilter: { SHOW_TEXT: 4 },
    Event: class Event { constructor(type) { this.type = type; } },
    ProgressEvent: class ProgressEvent { constructor(type) { this.type = type; } },
    MutationObserver: function (cb) {
      const inst = { cb, observe() { } };
      MOs.push(inst);
      return inst;
    }
  };
  ctx.XMLHttpRequest = FakeXMLHttpRequest;
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(distCode, ctx, { filename: 'dist/renderer.js' });
  return { ctx, sent, MOs, body };
}

function xhrSendLikeSuperagent(c, body, url) {
  const xhr = new c.ctx.window.XMLHttpRequest();
  return new Promise(resolve => {
    let settled = false;
    xhr.addEventListener('readystatechange', () => {
      if (xhr.readyState !== 4 || settled) return;
      settled = true;
      if (!xhr.status) { resolve({ settled: true, networkStyleError: true }); return; }
      resolve({
        settled: true,
        status: xhr.status,
        statusText: xhr.statusText,
        text: xhr.responseText,
        ok: xhr.status >= 200 && xhr.status < 300
      });
    });
    xhr.open('POST', url || MSG_URL);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(body);
  });
}

function xhrs(c) { return c.sent.filter(s => s.via === 'xhr'); }

async function main() {
  {
    const c = makeContext({});
    const p = xhrSendLikeSuperagent(c, JSON.stringify({ content: PLAIN, nonce: '1', tts: false }));
    await Promise.race([p, new Promise(r => setTimeout(r, 500))]);
    const list = xhrs(c);
    check('default key: send reaches transport via xhr', list.length === 1);
    const out = list.length ? JSON.parse(list[0].body).content : '';
    check('default key: content is 0x05 soup, not plaintext',
      out !== PLAIN && out.endsWith(SUF) && node_AV3V3.parseSoup(out.slice(0, -SUF.length))?.[0] === 5, out.slice(0, 20));
    check('default key: peer with same build decrypts',
      node_AV3V3.openKey(out.slice(0, -SUF.length), DEFAULT_KEY, '222') === PLAIN);
  }

  {
    const c = makeContext({ passkey: KEY });
    const p = xhrSendLikeSuperagent(c, JSON.stringify({ content: PLAIN, nonce: '2', tts: false }));
    await Promise.race([p, new Promise(r => setTimeout(r, 500))]);
    const list = xhrs(c);
    const out = list.length ? JSON.parse(list[0].body).content : '';
    const soup = out.slice(0, out.length - SUF.length);
    check('user key: 0x05 with user key, default key cannot open',
      node_AV3V3.parseSoup(soup)?.[0] === 5 &&
      node_AV3V3.openKey(soup, KEY, '222') === PLAIN &&
      node_AV3V3.openKey(soup, DEFAULT_KEY, '222') === null);
  }

  {
    const priv = node_AV3V3.genPriv();
    const pub64 = node_AV3V3.b64FromBytes(node_AV3V3.privToPub(priv));
    const c = makeContext({ pubs: { '222': pub64 } });
    const p = xhrSendLikeSuperagent(c, JSON.stringify({ content: PLAIN, nonce: '3', tts: false }));
    await Promise.race([p, new Promise(r => setTimeout(r, 500))]);
    const list = xhrs(c);
    const out = list.length ? JSON.parse(list[0].body).content : '';
    check('pair: encrypted soup type 0x03 sent',
      node_AV3V3.parseSoup(out.slice(0, -SUF.length))?.[0] === 3);
  }

  {
    const soup = node_AV3V3.sealKey(PLAIN, DEFAULT_KEY, '222') + SUF;
    const mk = (opts) => {
      const c = makeContext(opts);
      const n = { nodeType: 3, nodeValue: soup, children: [] };
      c.body.children.push(n);
      c.MOs.forEach(mo => mo.cb([{ type: 'childList', addedNodes: [n], removedNodes: [] }]));
      return n.nodeValue;
    };
    check('receive: no user key -> default-key soup decrypted',
      mk({}) === PLAIN + SUF, mk({}));
    check('receive: user key set -> default-key soup still decrypted via fallback',
      mk({ passkey: KEY }) === PLAIN + SUF, mk({ passkey: KEY }));
    check('receive: wrong user key soup stays garbage',
      (() => {
        const foreign = node_AV3V3.sealKey('секрет другим ключом', 'other key', '222') + SUF;
        const c = makeContext({ passkey: KEY });
        const n = { nodeType: 3, nodeValue: foreign, children: [] };
        c.body.children.push(n);
        c.MOs.forEach(mo => mo.cb([{ type: 'childList', addedNodes: [n], removedNodes: [] }]));
        return n.nodeValue === foreign;
      })());
  }

  {
    const c = makeContext({ locationHref: 'https://discord.com/app' });
    const p = xhrSendLikeSuperagent(c, JSON.stringify({ content: PLAIN, nonce: '5', tts: false }), CHANNELLESS_URL);
    const out = await Promise.race([p, new Promise(r => setTimeout(() => r({ settled: false }), 500))]);
    check('drop: send does not hang superagent', out.settled === true, JSON.stringify(out));
    check('drop: settles as completed 400', out.status === 400 && out.ok === false, JSON.stringify(out));
    check('drop: no plaintext leaked to transport', xhrs(c).length === 0);
    check('drop: fake response carries error json', typeof out.text === 'string' && out.text.indexOf('no key configured') !== -1);
    check('drop: statusText Blocked', out.statusText === 'Blocked');
  }

  {
    const c = makeContext({ locationHref: 'https://discord.com/app' });
    const xhr = new c.ctx.window.XMLHttpRequest();
    const seen = [];
    xhr.addEventListener('readystatechange', () => seen.push('rs:' + xhr.readyState));
    xhr.onreadystatechange = () => seen.push('prop-rs');
    xhr.onload = () => seen.push('onload');
    xhr.onloadend = () => seen.push('onloadend');
    xhr.open('POST', CHANNELLESS_URL);
    xhr.send(JSON.stringify({ content: PLAIN, nonce: '6', tts: false }));
    await new Promise(r => setTimeout(r, 50));
    check('drop: single readystatechange(4), load, loadend delivered',
      JSON.stringify(seen) === JSON.stringify(['rs:4', 'prop-rs', 'onload', 'onloadend']),
      JSON.stringify(seen));
  }

  {
    const c = makeContext({ locationHref: 'https://discord.com/app' });
    const res = c.ctx.window.fetch(CHANNELLESS_URL, { method: 'POST', body: JSON.stringify({ content: PLAIN, nonce: '7', tts: false }) });
    let settled = null;
    const p = Promise.resolve(res).then(r => { settled = r; }).catch(() => { settled = 'rejected'; });
    await Promise.race([p, new Promise(r => setTimeout(r, 500))]);
    check('drop via fetch: blocked with 400 Response', settled && typeof settled === 'object' && settled.status === 400, String(settled));
  }

  {
    const c = makeContext({ locationHref: 'https://discord.com/app' });
    const p = xhrSendLikeSuperagent(c, JSON.stringify({ content: PLAIN }), CHANNELLESS_URL + '/999');
    const out = await Promise.race([p, new Promise(r => setTimeout(() => r({ settled: false }), 500))]);
    check('drop on PATCH: settles as 400', out.settled === true && out.status === 400, JSON.stringify(out));
  }

  {
    const soup = node_AV3V3.sealKey(PLAIN, DEFAULT_KEY, '222') + SUF;
    const c = makeContext({ locationHref: 'https://discord.com/channels/111/999' });
    const n = { nodeType: 3, nodeValue: soup, children: [] };
    c.body.children.push(n);
    c.MOs.forEach(mo => mo.cb([{ type: 'childList', addedNodes: [n], removedNodes: [] }]));
    check('switch: node rendered while href points to another channel stays soup',
      n.nodeValue === soup, String(n.nodeValue).slice(0, 20));
    await new Promise(r => setTimeout(r, 700));
    c.ctx.location.href = 'https://discord.com/channels/111/222';
    await new Promise(r => setTimeout(r, 1500));
    check('switch: channel-change re-walk decrypts after href catches up',
      n.nodeValue === PLAIN + SUF, String(n.nodeValue).slice(0, 20));
  }

  {
    const soup = node_AV3V3.sealKey(PLAIN, DEFAULT_KEY, '222') + SUF;
    const c = makeContext({ locationHref: 'https://discord.com/channels/@me/222' });
    const n = { nodeType: 3, nodeValue: soup, children: [] };
    c.body.children.push(n);
    c.MOs.forEach(mo => mo.cb([{ type: 'childList', addedNodes: [n], removedNodes: [] }]));
    check('switch: DM url fresh at render time decrypts immediately, no tick needed',
      n.nodeValue === PLAIN + SUF, String(n.nodeValue).slice(0, 20));
  }

  {
    const soup = node_AV3V3.sealKey(PLAIN, DEFAULT_KEY, '222') + SUF;
    const c = makeContext({ locationHref: 'https://discord.com/channels/111/222' });
    c.ctx.location.href = 'https://discord.com/app';
    const n = { nodeType: 3, nodeValue: soup, children: [] };
    c.body.children.push(n);
    c.MOs.forEach(mo => mo.cb([{ type: 'childList', addedNodes: [n], removedNodes: [] }]));
    check('switch: channel-less href falls back to cached channel',
      n.nodeValue === PLAIN + SUF, String(n.nodeValue).slice(0, 20));
  }

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
