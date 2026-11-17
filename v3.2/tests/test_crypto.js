'use strict';
const fs = require('fs');
const path = require('path');
const nc = require('crypto');
const { load } = require('./load_av3.js');

const { AV3Core, AV3V3 } = load();
if (!AV3Core || !AV3Core.compact) throw new Error('AV3Core failed to init');
if (!AV3V3) throw new Error('AV3V3 failed to init');

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log('  ok  ' + name); }
  else { failed++; console.log('FAIL  ' + name + (detail ? ' :: ' + detail : '')); }
}
const hex = a => Buffer.from(a).toString('hex');
const bytesOf = b => Array.from(b);

console.log('== SHA-256 ==');
const shaMsgs = [Buffer.from(''), Buffer.from('abc'), Buffer.from('a'.repeat(1000)),
  nc.randomBytes(1), nc.randomBytes(63), nc.randomBytes(64),
  nc.randomBytes(65), nc.randomBytes(257), nc.randomBytes(5000)];
for (const m of shaMsgs) {
  const exp = nc.createHash('sha256').update(m).digest();
  const got = AV3V3.sha256(bytesOf(m));
  check('sha256 len=' + m.length, hex(exp) === hex(got));
}

console.log('== HMAC-SHA256 ==');
for (const [klen, mlen] of [[16, 11], [64, 80], [65, 20], [131, 300]]) {
  const k = nc.randomBytes(klen), m = nc.randomBytes(mlen);
  const exp = nc.createHmac('sha256', k).update(m).digest();
  const got = AV3V3.hmacSha256(bytesOf(k), bytesOf(m));
  check('hmac len=' + klen + '/' + mlen, hex(exp) === hex(got));
}

console.log('== HKDF-SHA256 ==');
for (const [ikmLen, saltLen, infoLen, L] of [[16, 0, 5, 32], [32, 12, 11, 32], [64, 64, 32, 64], [7, 3, 1, 100]]) {
  const ikm = nc.randomBytes(ikmLen), salt = saltLen ? nc.randomBytes(saltLen) : Buffer.alloc(0),
        info = nc.randomBytes(infoLen);
  const exp = Buffer.from(nc.hkdfSync('sha256', ikm, salt, info, L));
  const got = AV3V3._hkdf(bytesOf(ikm), bytesOf(salt), bytesOf(info), L);
  check('hkdf ' + ikmLen + '/' + saltLen + '/' + infoLen + '/' + L, hex(exp) === hex(got),
    'exp=' + exp.toString('hex').slice(0, 16) + ' got=' + Buffer.from(got).toString('hex').slice(0, 16));
}

console.log('== PBKDF2-HMAC-SHA256 ==');
for (const [plen, slen, iters, dkLen] of [[20, 9, 1000, 32], [27, 0, 4096, 32], [64, 17, 2000, 64]]) {
  const p = nc.randomBytes(plen), s = slen ? nc.randomBytes(slen) : Buffer.alloc(0);
  const exp = nc.pbkdf2Sync(p, s, iters, dkLen, 'sha256');
  const got = AV3V3._pbkdf2(bytesOf(p), bytesOf(s), iters, dkLen);
  check('pbkdf2 ' + plen + '/' + slen + '/it' + iters + '/' + dkLen, hex(exp) === hex(got),
    'exp=' + exp.toString('hex').slice(0, 16) + ' got=' + Buffer.from(got).toString('hex').slice(0, 16));
}

console.log('== X25519 ==');
const alicePriv = Buffer.from('77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a', 'hex');
const alicePubExp = Buffer.from('8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a', 'hex');
{
  const gotPub = Buffer.from(AV3V3.privToPub(bytesOf(alicePriv)));
  check('x25519 RFC7748 pub(Alice)', gotPub.equals(alicePubExp),
    'exp=' + alicePubExp.toString('hex') + ' got=' + gotPub.toString('hex'));
}
{
  const bobPriv = Buffer.from('5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb', 'hex');
  const bobPubExp = Buffer.from('de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f', 'hex');
  const gotBob = Buffer.from(AV3V3.privToPub(bytesOf(bobPriv)));
  check('x25519 RFC7748 pub(Bob)', gotBob.equals(bobPubExp),
    'exp=' + bobPubExp.toString('hex') + ' got=' + gotBob.toString('hex'));
  const sharedExp = Buffer.from('4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742', 'hex');
  const gotSharedA = Buffer.from(AV3V3.x25519(bytesOf(alicePriv), bytesOf(bobPubExp)));
  const gotSharedB = Buffer.from(AV3V3.x25519(bytesOf(bobPriv), bytesOf(alicePubExp)));
  check('x25519 RFC7748 shared(A)', gotSharedA.equals(sharedExp),
    'exp=' + sharedExp.toString('hex') + ' got=' + gotSharedA.toString('hex'));
  check('x25519 RFC7748 shared(B)', gotSharedB.equals(sharedExp));
}
for (let i = 0; i < 8; i++) {
  const a = nc.generateKeyPairSync('x25519');
  const b = nc.generateKeyPairSync('x25519');
  const aPrivRaw = bytesOf(a.privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(16, 48));
  const bPubRaw = bytesOf(b.publicKey.export({ type: 'spki', format: 'der' }).subarray(12, 44));
  const expShared = nc.diffieHellman({ privateKey: a.privateKey, publicKey: b.publicKey });
  const gotPub = Buffer.from(AV3V3.privToPub(aPrivRaw));
  const nodeAPub = a.publicKey.export({ type: 'spki', format: 'der' }).subarray(12, 44);
  const gotShared = Buffer.from(AV3V3.x25519(aPrivRaw, bPubRaw));
  check('x25519 rand pub #' + i, gotPub.equals(nodeAPub));
  check('x25519 rand shared #' + i, gotShared.equals(expShared));
}

console.log('== ChaCha20-Poly1305 ==');
for (let i = 0; i < 10; i++) {
  const key = nc.randomBytes(32);
  const nonce = nc.randomBytes(12);
  const aad = nc.randomBytes(1 + i * 7);
  const pt = nc.randomBytes((i * 37) % 300);
  const cipher = nc.createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
  cipher.setAAD(aad);
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  const got = Buffer.from(AV3V3._aeadSeal(bytesOf(key), bytesOf(nonce), bytesOf(aad), bytesOf(pt)));
  check('aead seal #' + i + ' len=' + pt.length, got.equals(Buffer.concat([ct, tag])),
    'exp=' + Buffer.concat([ct, tag]).toString('hex').slice(0, 32) + ' got=' + got.toString('hex').slice(0, 32));
  const opened = AV3V3._aeadOpen(bytesOf(key), bytesOf(nonce), bytesOf(aad), bytesOf(got));
  check('aead open #' + i, opened && Buffer.from(opened).equals(pt));
}
{
  const key = nc.randomBytes(32), nonce = nc.randomBytes(12);
  const data = AV3V3._aeadSeal(bytesOf(key), bytesOf(nonce), [1, 2, 3], [5, 5, 5, 5]);
  data[data.length - 3] ^= 0x40;
  const opened = AV3V3._aeadOpen(bytesOf(key), bytesOf(nonce), [1, 2, 3], data);
  check('aead tamper rejected', opened === null);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
