'use strict';
const { load } = require('./load_av3.js');

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  ok  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (detail ? ' :: ' + detail : '')); }
}

const CHAN = '1234567890123456789';
const alice = load();
const bob = load();
const AV3V3 = alice.AV3V3, AV3V3b = bob.AV3V3;

const aPriv = alice.AV3V3.genPriv();
const bPriv = bob.AV3V3.genPriv();
const aPub = alice.AV3V3.privToPub(aPriv);
const bPub = bob.AV3V3.privToPub(bPriv);
check('pubkey lengths', aPub.length === 32 && bPub.length === 32);

const annA = alice.AV3V3.announceSoup(aPriv);
const annB = bob.AV3V3.announceSoup(bPriv);
check('announce soup produced', typeof annA === 'string' && annA.length > 10 && typeof annB === 'string');
const importedB = bob.AV3V3.pubkeyFromAnnounce(bob.AV3V3.parseSoup(annA));
const importedA = alice.AV3V3.pubkeyFromAnnounce(alice.AV3V3.parseSoup(annB));
check('keys exchanged via soup', Buffer.from(importedB).equals(Buffer.from(aPub)) &&
      Buffer.from(importedA).equals(Buffer.from(bPub)));

const fpA = alice.AV3V3.fingerprint(aPriv, importedA);
const fpB = bob.AV3V3.fingerprint(bPriv, importedB);
check('fingerprints match', fpA === fpB && fpA.length > 10, JSON.stringify([fpA, fpB]));

const peers = {
  A: { v3: alice.AV3V3, priv: aPriv, peerPub: importedA },
  B: { v3: bob.AV3V3, priv: bPriv, peerPub: importedB }
};
const cases = [
  ['A->B', peers.A, peers.B, 'hello world'],
  ['B->A', peers.B, peers.A, 'от мельницы♍ до ЙОТЫ 100%! 🙃 emojis+like'],
  ['A->B empty', peers.A, peers.B, ''],
  ['A->B long', peers.A, peers.B, 'x'.repeat(1500) + ' конца.']
];
for (const [label, sender, receiver] of cases) {
  const soup = sender.v3.seal(casesArgText(label), sender.priv, sender.peerPub, CHAN);
  check(label + ': sealed', typeof soup === 'string' && soup.length > 6);
  const parsed = receiver.v3.parseSoup(soup);
  check(label + ': type byte', parsed && parsed[0] === 3);
  const pt = receiver.v3.open(soup, receiver.priv, receiver.peerPub, CHAN);
  check(label + ': opened == plaintext', pt === casesArgText(label), JSON.stringify(pt && pt.slice(0, 40)));
}
function casesArgText(label) {
  return { 'A->B': 'hello world',
    'B->A': 'от мельницы♍ до ЙОТЫ 100%! 🙃 emojis+like',
    'A->B empty': '',
    'A->B long': 'x'.repeat(1500) + ' конца.' }[label];
}

{
  const soup = AV3V3.seal('Привет, мир! Это v3 тест.', aPriv, importedA, CHAN);
  check('compact soup starts with U+1D101', soup.codePointAt(0) === 0x1D101);
  const payload = AV3V3.parseSoup(soup);
  check('parseSoup decodes compact soup', payload && payload[0] === 3);
}

{
  const soup = AV3V3.seal('secret', aPriv, importedA, CHAN);
  const other = bob.AV3V3.open(soup, bPriv, importedB, '9876543210000000001');
  check('cross-channel rejected', other === null);
}

{
  const soup = AV3V3.seal('tamper-test', aPriv, importedA, CHAN);
  const arr = Array.from(soup);
  let flipped = null;
  for (let i = arr.length - 1; i >= 1; i--) {
    const cp = arr[i].codePointAt(0);
    if (cp >= 0x4E00 && cp <= 0x8DFF) {
      const cp2 = cp ^ 0x55;
      if (cp2 < 0x4E00 || cp2 > 0x8DFF) continue;
      arr[i] = String.fromCodePoint(cp2);
      flipped = arr.join('');
      break;
    }
  }
  check('tamper: data symbol found', flipped !== null);
  const pt = bob.AV3V3.open(flipped, bPriv, importedB, CHAN);
  check('payload tamper -> tag reject', pt === null, JSON.stringify(pt));
  const arr2 = Array.from(soup);
  let shifted = null;
  for (let i = 1; i < arr2.length; i++) {
    const cp = arr2[i].codePointAt(0);
    if (cp >= 0x4E00 && cp <= 0x8DFF) continue;
    const cp2 = cp + 0x100;
    if (cp2 >= 0x4E00 && cp2 <= 0x8DFF) continue;
    if (cp2 >= 0xD800 && cp2 <= 0xDFFF) continue;
    arr2[i] = String.fromCodePoint(cp2);
    shifted = arr2.join('');
    break;
  }
  if (shifted) {
    const pt2 = bob.AV3V3.open(shifted, bPriv, importedB, CHAN);
    check('noise flip tolerated', pt2 === 'tamper-test', JSON.stringify(pt2));
  } else {
    check('noise flip tolerated (no noise found)', true);
  }
}

{
  let allOk = true;
  for (let i = 0; i < 12; i++) {
    const len = 1 + Math.floor(Math.random() * 400);
    let msg = '';
    for (let j = 0; j < len; j++) {
      msg += String.fromCodePoint(0x400 + Math.floor(Math.random() * 0x80));
    }
    const soup = AV3V3.seal(msg, aPriv, importedA, CHAN);
    const pt = bob.AV3V3.open(soup, bPriv, importedB, CHAN);
    if (pt !== msg) { allOk = false; break; }
  }
  check('random unicode roundtrip x12', allOk);
}

{
  const msg = 'д'.repeat(500);
  const t0 = Date.now();
  const soup = AV3V3.seal(msg, aPriv, importedA, CHAN);
  const pt = bob.AV3V3.open(soup, bPriv, importedB, CHAN);
  const dt = Date.now() - t0;
  check('perf 500B roundtrip < 2s (' + dt + 'ms)', pt === msg && dt < 2000);
}

console.log('== passphrase mode ==');
const PASS1 = 'правильный конь батарея штука 42';
const PASS2 = 'совсем другой ключ';
{
  const soup = alice.AV3V3.sealKey('секрет по ключу', PASS1, CHAN);
  check('keyMsg sealed', typeof soup === 'string' && soup.codePointAt(0) === 0x1D101);
  const payload = bob.AV3V3.parseSoup(soup);
  check('keyMsg type byte = 0x05', payload && payload[0] === 5);
  const pt = bob.AV3V3.openKey(soup, PASS1, CHAN);
  check('same key opens', pt === 'секрет по ключу', JSON.stringify(pt));
  const wrong = bob.AV3V3.openKey(soup, PASS2, CHAN);
  check('wrong key rejected', wrong === null);
  const noKey = bob.AV3V3.openKey(soup, null, CHAN);
  check('no key rejected', noKey === null);
  const otherChan = bob.AV3V3.openKey(soup, PASS1, '9999');
  check('key mode channel-bound', otherChan === null);
  const fpA = alice.AV3V3.passFingerprint(PASS1);
  const fpB = bob.AV3V3.passFingerprint(PASS1);
  const fpC = alice.AV3V3.passFingerprint(PASS2);
  check('key fingerprints match for same pass', fpA === fpB && fpA.length > 10);
  check('key fingerprint differs for other pass', fpA !== fpC);
  const soup2 = alice.AV3V3.sealKey('после ротации', PASS2, CHAN);
  check('rotated key rejected by old pass', bob.AV3V3.openKey(soup2, PASS1, CHAN) === null);
  check('rotated key opens after update', bob.AV3V3.openKey(soup2, PASS2, CHAN) === 'после ротации');
  const soup3 = alice.AV3V3.seal('по паре', aPriv, importedA, CHAN);
  check('pair mode still works alongside', bob.AV3V3.open(soup3, bPriv, importedB, CHAN) === 'по паре');
  const t0 = Date.now();
  const s4 = alice.AV3V3.sealKey('скорость', PASS1, CHAN);
  const p4 = bob.AV3V3.openKey(s4, PASS1, CHAN);
  const dt = Date.now() - t0;
  check('key mode roundtrip fast (' + dt + 'ms)', p4 === 'скорость' && dt < 400);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
