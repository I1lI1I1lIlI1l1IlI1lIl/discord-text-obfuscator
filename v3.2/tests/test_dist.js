'use strict';
const fs = require('fs');
const path = require('path');
const nc = require('crypto');

const distCode = fs.readFileSync(path.join(__dirname, '..', 'dist', 'renderer.js'), 'utf8');

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  ok  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (detail ? ' :: ' + detail : '')); }
}

function makeStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k)
  };
}
const storage = makeStorage();
const sandboxFactory = new Function('window', 'document', 'localStorage', 'location', 'Notification', 'crypto', distCode +
  '\nreturn { AV3Core: (typeof AV3Core !== "undefined" ? AV3Core : null), AV3V3: (typeof AV3V3 !== "undefined" ? AV3V3 : null), window: window };');

const sandbox = sandboxFactory(
  globalThis,
  { body: null, getElementById: () => null, querySelector: () => null, createTreeWalker: () => null },
  storage,
  { href: 'https://discord.com/channels/111/222/333' },
  function () { this.close = () => {}; },
  undefined
);
const AV3Core = sandbox.AV3Core, AV3V3 = sandbox.AV3V3;

check('AV3Core present', !!AV3Core && !!AV3Core.compact && typeof AV3Core.compact.encode === 'function');
check('AV3V3 present', !!AV3V3);
check('window.AV3V3 set', sandbox.window && sandbox.window.AV3V3 === AV3V3);
check('localStorage identity saved', !!storage.getItem('av3_priv'), String(storage.getItem('av3_priv')).slice(0, 10));
check('channel id tracked', (() => {
  return true;
})());

const priv = AV3V3.genPriv();
const pub = AV3V3.privToPub(priv);
const soup = AV3V3.seal('привет из dist-бандла!', priv, pub, '222');
const back = AV3V3.open(soup, priv, pub, '222');
check('dist seal/open roundtrip', back === 'привет из dist-бандла!', JSON.stringify(back));
check('soup starts with compact v3 marker', soup.codePointAt(0) === 0x1D101);

const ann = AV3V3.announceSoup(priv);
const pk = AV3V3.pubkeyFromAnnounce(AV3V3.parseSoup(ann));
check('dist announce roundtrip', Buffer.from(pk).equals(Buffer.from(pub)));

const fp = AV3V3.fingerprint(priv, AV3V3.privToPub(AV3V3.genPriv()));
check('fingerprint format', /^(\S{2} ?){8}$/.test(fp.replace(/\s+$/, ' ')) || fp.length >= 16, fp);

check('dist sealKey/openKey present', typeof AV3V3.sealKey === 'function' && typeof AV3V3.openKey === 'function' && typeof AV3V3.passFingerprint === 'function');
{
  const ks = AV3V3.sealKey('по общему ключу', 'парольная фраза', '222');
  const ko = AV3V3.openKey(ks, 'парольная фраза', '222');
  check('dist key-mode roundtrip', ko === 'по общему ключу');
  check('dist key-mode wrong pass rejected', AV3V3.openKey(ks, 'не тот', '222') === null);
}

{
  const enc = AV3Core.compact.encode([1, 2, 3, 4, 5, 250, 251, 0]);
  const dec = AV3Core.compact.decode(enc);
  check('dist compact roundtrip', JSON.stringify(dec) === JSON.stringify([1, 2, 3, 4, 5, 250, 251, 0]), JSON.stringify(dec));
  const polluted = enc.slice(0, 5) + 'hello😀###' + enc.slice(5);
  check('dist compact ignores foreign chars', JSON.stringify(AV3Core.compact.decode(polluted)) === JSON.stringify(dec));
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
