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
const CHAN_URL = 'https://discord.com/channels/555/777';
const KEY = 'test pass phrase';

const { AV3Core, AV3V3 } = load();
const soupKey = AV3V3.sealKey('retro secret message', KEY, '777') + SUF;
const soupKey2 = AV3V3.sealKey('second one', KEY, '777') + SUF;
const soupWrong = AV3V3.sealKey('never readable', 'different key', '777') + SUF;

function makeContext(keyInStorage) {
  const store = new Map([['av3_passkey', keyInStorage || '']]);
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k)
  };
  const nodes = [];
  function T(v) { const n = { nodeType: 3, nodeValue: v, children: [] }; nodes.push(n); return n; }
  const body = { children: [T(soupKey), T(soupWrong)] };
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
  const ctx = {
    console,
    setTimeout, setInterval, clearTimeout, clearInterval,
    TextEncoder, TextDecoder, Uint8Array, Promise, JSON, Math, Date, Object, Array, String, Number, Error,WeakMap: WeakMap,
    crypto: globalThis.crypto,
    localStorage,
    location: { href: CHAN_URL },
    document,
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
  return { ctx, nodes, MOs, store, body };
}

check('precondition: soup is not plaintext', !soupKey.includes('retro secret message'));

{
  const { nodes } = makeContext(KEY);
  const vals = nodes.map(n => n.nodeValue);
  check('retro: key was set BEFORE load -> history decrypted at init walk',
    vals[0] === 'retro secret message' + SUF, JSON.stringify(vals[0]));
  check('retro: wrong-key soup left as garbage',
    vals[1] === soupWrong, JSON.stringify(vals[1]));
}

{
  const { nodes, MOs, body } = makeContext(KEY);
  check('key active: history decrypted',
    nodes[0].nodeValue === 'retro secret message' + SUF, JSON.stringify(nodes[0].nodeValue));

  const late = { nodeType: 3, nodeValue: soupKey2, children: [] };
  body.children.push(late);
  MOs.forEach(mo => mo.cb([{ type: 'childList', addedNodes: [late] }]));
  check('observer: message mounted later decrypted on the fly',
    late.nodeValue === 'second one' + SUF, JSON.stringify(late.nodeValue));

  const ch = body.children[0];
  ch.nodeValue = soupKey2;
  MOs.forEach(mo => mo.cb([{ type: 'characterData', target: ch }]));
  check('observer: characterData mutation decoded on the fly',
    ch.nodeValue === 'second one' + SUF, JSON.stringify(ch.nodeValue));

  const wrongLate = { nodeType: 3, nodeValue: soupWrong, children: [] };
  body.children.push(wrongLate);
  MOs.forEach(mo => mo.cb([{ type: 'childList', addedNodes: [wrongLate] }]));
  check('observer: wrong-key message stays garbage, no placeholder',
    wrongLate.nodeValue === soupWrong, JSON.stringify(wrongLate.nodeValue));
}

{
  const { nodes } = makeContext('');
  check('no key: history untouched', nodes.every(n => n.nodeValue !== 'retro secret message' + SUF));
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
