'use strict';
const { load } = require('./load_av3.js');
const { AV3Core, AV3V3 } = load();

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  ok  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (detail ? ' :: ' + detail : '')); }
}

const E = AV3Core.compact.encode, D = AV3Core.compact.decode;

for (const size of [0, 1, 2, 31, 33, 255, 256, 500, 2000]) {
  const bytes = Array.from({ length: size }, (_, i) => (i * 37 + 11) & 255);
  const enc = E(bytes);
  const dec = D(enc);
  check('roundtrip ' + size + 'B', JSON.stringify(dec || []) === JSON.stringify(bytes),
    dec ? 'len=' + dec.length : 'null');
}

const big = Array.from({ length: 70000 }, () => 7);
check('oversize rejected -> null', E(big) === null);

const enc31 = E(Array.from({ length: 31 }, (_, i) => (i * 7 + 3) & 255));
const enc31legacyLen = Math.ceil((31 + 2) * 8 / 14) + 1 + Math.ceil((33 * 8 / 14) * 0.2);
check('31B compact ~' + Array.from(enc31).length + ' chars (header+data+noise bound)',
  Array.from(enc31).length <= enc31legacyLen + 8, 'len=' + Array.from(enc31).length);

check('starts with compact marker U+1D101', enc31.codePointAt(0) === 0x1D101);

const chars = Array.from(enc31);
check('marker first, no raw ascii, no lone surrogates',
  chars[0].codePointAt(0) === 0x1D101 &&
  chars.every(c => { const cp = c.codePointAt(0); return cp >= 0x80 && (cp < 0xD800 || cp > 0xDFFF); }));

const polluted = enc31.slice(0, 5) + '😀hello world###뀀' + enc31.slice(5);
check('foreign chars ignored in decode', JSON.stringify(D(polluted)) === JSON.stringify(D(enc31)));

check('decode deterministic', JSON.stringify(D(enc31)) === JSON.stringify(D(enc31)));

check('truncated stream -> null', D(enc31.slice(0, 8)) === null);
check('garbage -> null', D('hello world') === null);
check('empty string -> null', D('') === null);

const CHAN = '1234567890123456789';
const priv = AV3V3.genPriv();
const pub = AV3V3.privToPub(priv);
const KEY = 'pass phrase 123';

{
  const soup = AV3V3.sealKey('hi', KEY, CHAN);
  const len = Array.from(soup).length;
  check('keymsg "hi" compact length < 32 chars (' + len + ')', len > 5 && len < 32, 'len=' + len);
  check('keymsg "hi" roundtrip', AV3V3.openKey(soup, KEY, CHAN) === 'hi');
}

{
  const msg = 'a'.repeat(500);
  const t0 = Date.now();
  const soup = AV3V3.seal(msg, priv, pub, CHAN);
  const pt = AV3V3.open(soup, priv, pub, CHAN);
  const dt = Date.now() - t0;
  const len = Array.from(soup).length;
  check('500B ascii roundtrip + length ' + len + ' < 420', pt === msg && len < 420, 'len=' + len);
  check('500B fast (' + dt + 'ms)', dt < 2000);
  const msgCyr = 'д'.repeat(500);
  const soup2 = AV3V3.seal(msgCyr, priv, pub, CHAN);
  check('500B cyr roundtrip (' + Array.from(soup2).length + ' chars)', AV3V3.open(soup2, priv, pub, CHAN) === msgCyr);
}

{
  const ann = AV3V3.announceSoup(priv);
  const pk = AV3V3.pubkeyFromAnnounce(AV3V3.parseSoup(ann));
  check('announce compact roundtrip', Buffer.from(pk).equals(Buffer.from(pub)));
  check('announce short (' + Array.from(ann).length + ')', Array.from(ann).length < 36);
}

{
  const soup = AV3V3.sealKey('tamper me', KEY, CHAN);
  const chars = Array.from(soup);
  for (let i = chars.length - 1; i >= 1; i--) {
    const cp = chars[i].codePointAt(0);
    if (cp >= 0x4E00 && cp <= 0x8DFF) {
      chars[i] = String.fromCodePoint(cp ^ 0x55);
      break;
    }
  }
  const flipped = chars.join('');
  check('compact tamper -> tag reject', AV3V3.openKey(flipped, KEY, CHAN) === null);
}

{
  const soup = AV3V3.seal('legacy check', priv, pub, CHAN);
  check('old v2 marker soup no longer produced', soup.codePointAt(0) !== 0x1D100);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
