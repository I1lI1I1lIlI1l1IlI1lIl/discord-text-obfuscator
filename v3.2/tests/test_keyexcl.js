'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { load } = require('./load_av3.js');

const distCode = fs.readFileSync(path.join(__dirname, '..', 'dist', 'renderer.js'), 'utf8');

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  ok  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (detail ? ' :: ' + detail : '')); }
}

const SUF = ' ᵉⁿᶜ';
const CHAN_URL = 'https://discord.com/channels/111/222';
const MSG_URL = 'https://discord.com/api/v9/channels/222/messages';
const KEY = 'shared secret phrase';
const DEFAULT_KEY = 'ArsenicV3-Dsc/DEFAULT-KEY';
const PLAIN = 'hello from key mode';

const node_AV3V3 = load().AV3V3;
const pairPriv = node_AV3V3.genPriv();
const pairPub64 = node_AV3V3.b64FromBytes(node_AV3V3.privToPub(pairPriv));

function makeContext(opts) {
  opts = opts || {};
  const store = new Map();
  if (opts.passkey) store.set('av3_passkey', opts.passkey);
  if (opts.pubs) store.set('av3_pubs', JSON.stringify(opts.pubs));
  if (opts.enabled === false) store.set('arsenic_v3_enabled', '0');
  const brokenStorage = !!opts.brokenStorage;
  const localStorage = {
    getItem: k => {
      if (brokenStorage) throw new Error('storage disabled');
      return store.has(k) ? store.get(k) : null;
    },
    setItem: (k, v) => {
      if (brokenStorage) throw new Error('storage disabled');
      store.set(k, String(v));
    },
    removeItem: k => {
      if (brokenStorage) throw new Error('storage disabled');
      store.delete(k);
    }
  };
  const nodes = [];
  function T(v) { const n = { nodeType: 3, nodeValue: v, children: [] }; nodes.push(n); return n; }
  const body = { children: [] };
  const MOs = [];
  const saved = [];
  const state = Object.assign({}, opts.state);
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
  const origFetch = function (input, init) { sent.push({ input, init: init || {} }); return {}; };
  const ctx = {
    console, setTimeout, setInterval, clearTimeout, clearInterval,
    TextEncoder, TextDecoder, Uint8Array, Promise, JSON, Math, Date, Object, Array, String, Number, Error, WeakMap,
    Response: globalThis.Response,
    crypto: globalThis.crypto,
    localStorage,
    AV3_STATE: state,
    AV3_SAVE: function (json) { saved.push(String(json)); },
    location: { href: CHAN_URL },
    document,
    fetch: origFetch,
    NodeFilter: { SHOW_TEXT: 4 },
    MutationObserver: function (cb) {
      const inst = { cb, observe() { } };
      MOs.push(inst);
      return inst;
    }
  };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(distCode, ctx, { filename: 'dist/renderer.js' });
  return { ctx, nodes, MOs, store, sent, body, saved, state };
}

function sendContent(c, content, url) {
  const ctx = c.ctx;
  const before = c.sent.length;
  try {
    const p = ctx.window.fetch(url || MSG_URL, {
      method: 'POST',
      body: JSON.stringify({ content: content, nonce: '1', tts: false })
    });
    if (p && typeof p.catch === 'function') p.catch(() => { });
  } catch (e) { }
  if (c.sent.length === before) return null;
  try {
    return JSON.parse(c.sent[before].init.body).content;
  } catch (e) { return undefined; }
}

check('sender with key + existing ECDH pair -> 0x05, NOT 0x03', (() => {
  const c = makeContext({ passkey: KEY, pubs: { '222': pairPub64 } });
  const out = sendContent(c, PLAIN);
  if (out == null) return false;
  const payload = node_AV3V3.parseSoup(out.slice(0, out.length - SUF.length));
  return payload && payload[0] === 5;
})(), 'expected type 0x05');

check('no ECDH fallback: 0x03 absent when key set', (() => {
  const c = makeContext({ passkey: KEY, pubs: { '222': pairPub64 } });
  const out = sendContent(c, PLAIN);
  const payload = node_AV3V3.parseSoup(out.slice(0, out.length - SUF.length));
  return payload[0] !== 3;
})());

check('default peer (no key) cannot read key-mode soup', (() => {
  const c = makeContext({ passkey: KEY, pubs: { '222': pairPub64 } });
  const out = sendContent(c, PLAIN);
  const payload = node_AV3V3.parseSoup(out.slice(0, out.length - SUF.length));
  return payload && payload[0] === 5 &&
    node_AV3V3.openKey(out.slice(0, out.length - SUF.length), 'wrong phrase', '222') === null;
})());

check('key-mode soup decrypts for holder of same key', (() => {
  const c = makeContext({ passkey: KEY, pubs: { '222': pairPub64 } });
  const out = sendContent(c, PLAIN);
  const got = node_AV3V3.openKey(out.slice(0, out.length - SUF.length), KEY, '222');
  return got === PLAIN;
})());

check('no key: existing pair -> 0x03 (pair mode unchanged)', (() => {
  const c = makeContext({ pubs: { '222': pairPub64 } });
  const out = sendContent(c, PLAIN);
  const payload = node_AV3V3.parseSoup(out.slice(0, out.length - SUF.length));
  return payload && payload[0] === 3;
})());

check('no key, no pair: built-in default key sends 0x05 (no plaintext leak)', (() => {
  const c = makeContext({});
  const out = sendContent(c, PLAIN);
  if (out == null || out === PLAIN || c.sent.length !== 1) return false;
  const soup = out.slice(0, out.length - SUF.length);
  const payload = node_AV3V3.parseSoup(soup);
  return payload && payload[0] === 5 && node_AV3V3.openKey(soup, DEFAULT_KEY, '222') === PLAIN;
})());

check('user key wins over built-in default key', (() => {
  const c = makeContext({ passkey: KEY });
  const out = sendContent(c, PLAIN);
  const soup = out.slice(0, out.length - SUF.length);
  return node_AV3V3.openKey(soup, KEY, '222') === PLAIN &&
         node_AV3V3.openKey(soup, DEFAULT_KEY, '222') === null;
})());

check('AV3_STATE persistence: passkey from injected state works', (() => {
  const c = makeContext({ state: { av3_passkey: KEY } });
  const out = sendContent(c, PLAIN);
  const payload = node_AV3V3.parseSoup(out.slice(0, out.length - SUF.length));
  return payload && payload[0] === 5 &&
    node_AV3V3.openKey(out.slice(0, out.length - SUF.length), KEY, '222') === PLAIN;
})());

check('AV3_SAVE called: priv persisted through bridge', (() => {
  const c = makeContext({ state: {} });
  const ok = c.saved.length > 0 && c.saved.some(s => s.indexOf('av3_priv') !== -1);
  return ok && !!c.state.av3_priv;
})());

check('broken storage: init survives, default key still encrypts', (() => {
  const c = makeContext({ brokenStorage: true });
  const out = sendContent(c, PLAIN);
  if (out == null || out === PLAIN) return false;
  const soup = out.slice(0, out.length - SUF.length);
  const payload = node_AV3V3.parseSoup(soup);
  return !!c.state.av3_priv && payload && payload[0] === 5 &&
    node_AV3V3.openKey(soup, DEFAULT_KEY, '222') === PLAIN;
})());

check('broken storage: passkey from AV3_STATE still encrypts', (() => {
  const c = makeContext({ brokenStorage: true, state: { av3_passkey: KEY } });
  const out = sendContent(c, PLAIN);
  const got = node_AV3V3.openKey(out.slice(0, out.length - SUF.length), KEY, '222');
  return got === PLAIN;
})());

check('client-style URL also extracts channel id', (() => {
  const c = makeContext({ passkey: KEY, pubs: { '222': pairPub64 } });
  const out = sendContent(c, 'x'.repeat(30), 'https://discord.com/channels/111/222/messages');
  const payload = node_AV3V3.parseSoup(out.slice(0, out.length - SUF.length));
  return payload && payload[0] === 5;
})());

check('edit PATCH URL extracts channel id (key mode)', (() => {
  const c = makeContext({ passkey: KEY });
  const out = sendContent(c, 'edit me', 'https://discord.com/api/v9/channels/222/messages/999');
  const payload = node_AV3V3.parseSoup(out.slice(0, out.length - SUF.length));
  return payload && payload[0] === 5;
})());

check('DM API URL extracts channel id (pair mode)', (() => {
  const c = makeContext({ pubs: { '999': pairPub64 } });
  const out = sendContent(c, 'dm hello', 'https://discord.com/api/v9/channels/999/messages');
  const payload = node_AV3V3.parseSoup(out.slice(0, out.length - SUF.length));
  return payload && payload[0] === 3;
})());

check('shield off (kill switch): raw passthrough, key ignored', (() => {
  const c = makeContext({ passkey: KEY, enabled: false });
  const out = sendContent(c, PLAIN);
  return out === PLAIN;
})());

check('default peer DOM: key-mode soup stays garbage', (() => {
  const c1 = makeContext({ passkey: KEY });
  const soup = sendContent(c1, PLAIN);
  const c2 = makeContext({});
  const n = { nodeType: 3, nodeValue: soup, children: [] };
  c2.body.children.push(n);
  c2.MOs.forEach(mo => mo.cb([{ type: 'childList', addedNodes: [n], removedNodes: [] }]));
  return c2.body.children[0].nodeValue === soup;
})());

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
