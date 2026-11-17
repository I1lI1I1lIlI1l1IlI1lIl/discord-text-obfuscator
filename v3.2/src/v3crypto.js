var AV3V3 = (function () {
  'use strict';
  if (typeof AV3Core === 'undefined' || !AV3Core || !AV3Core.compact) return null;

  var TYPE_DATA = 0x03;
  var TYPE_PUBKEY = 0x04;
  var TYPE_KEYMSG = 0x05;

  function utf8(s) { return Array.prototype.slice.call(AV3Core.utf8Encode(s)); }
  function utf8b(bytes) {
    try { return AV3Core.utf8Decode(new Uint8Array(bytes)); } catch (e) { return null; }
  }

  function randomBytes(n) {
    var out = new Array(n);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      var a = new Uint8Array(n);
      crypto.getRandomValues(a);
      for (var i = 0; i < n; i++) out[i] = a[i];
    } else {
      for (var j = 0; j < n; j++) out[j] = Math.floor(Math.random() * 256) & 0xFF;
    }
    return out;
  }

  function bytesEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= (a[i] ^ b[i]);
    return diff === 0;
  }

  var B64C = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function b64FromBytes(bytes) {
    var out = '', i;
    for (i = 0; i + 3 <= bytes.length; i += 3) {
      var n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      out += B64C.charAt((n >> 18) & 63) + B64C.charAt((n >> 12) & 63) +
             B64C.charAt((n >> 6) & 63) + B64C.charAt(n & 63);
    }
    var rest = bytes.length - i;
    if (rest === 1) {
      var n1 = bytes[i] << 16;
      out += B64C.charAt((n1 >> 18) & 63) + B64C.charAt((n1 >> 12) & 63) + '==';
    } else if (rest === 2) {
      var n2 = (bytes[i] << 16) | (bytes[i + 1] << 8);
      out += B64C.charAt((n2 >> 18) & 63) + B64C.charAt((n2 >> 12) & 63) +
             B64C.charAt((n2 >> 6) & 63) + '=';
    }
    return out;
  }
  function bytesFromB64(s) {
    var out = [], buf = 0, bits = 0, i;
    for (i = 0; i < s.length; i++) {
      var c = B64C.indexOf(s.charAt(i));
      if (c < 0) continue;
      buf = (buf << 6) | c;
      bits += 6;
      if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 0xFF); }
    }
    return out;
  }

  var K256 = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  function rotr(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }
  function sha256(msg) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
             0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var len = msg.length, i, j;
    var padded = msg.slice();
    padded.push(0x80);
    while (padded.length % 64 !== 56) padded.push(0);
    var bitHi = Math.floor(len / 536870912) >>> 0;
    var bitLo = (len << 3) >>> 0;
    padded.push((bitHi >>> 24) & 0xFF, (bitHi >>> 16) & 0xFF, (bitHi >>> 8) & 0xFF, bitHi & 0xFF);
    padded.push((bitLo >>> 24) & 0xFF, (bitLo >>> 16) & 0xFF, (bitLo >>> 8) & 0xFF, bitLo & 0xFF);
    var w = new Array(64);
    for (i = 0; i < padded.length; i += 64) {
      for (j = 0; j < 16; j++) {
        w[j] = ((padded[i + j * 4] << 24) | (padded[i + j * 4 + 1] << 16) |
                (padded[i + j * 4 + 2] << 8) | padded[i + j * 4 + 3]) >>> 0;
      }
      for (j = 16; j < 64; j++) {
        var s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        var s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (j = 0; j < 64; j++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ ((~e) & g);
        var t1 = (h + S1 + ch + K256[j] + w[j]) >>> 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    var out = [];
    for (i = 0; i < 8; i++) out.push((H[i] >>> 24) & 0xFF, (H[i] >>> 16) & 0xFF, (H[i] >>> 8) & 0xFF, H[i] & 0xFF);
    return out;
  }

  function hmacSha256(key, msg) {
    var k = key.slice();
    if (k.length > 64) k = sha256(k);
    while (k.length < 64) k.push(0);
    var ipad = [], opad = [], i;
    for (i = 0; i < 64; i++) { ipad.push(k[i] ^ 0x36); opad.push(k[i] ^ 0x5c); }
    var inner = ipad.concat(msg);
    var innerHash = sha256(inner);
    return sha256(opad.concat(innerHash));
  }

  function hkdfSha256(ikm, salt, info, outLen) {
    if (!salt || !salt.length) salt = zeros(32);
    var prk = hmacSha256(salt, ikm);
    var t = [], okm = [], i = 1;
    while (okm.length < outLen) {
      var inp = t.concat(info, [i]);
      t = hmacSha256(prk, inp);
      okm = okm.concat(t);
      i++;
    }
    return okm.slice(0, outLen);
  }
  function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }

  var P = (1n << 255n) - 19n;
  var A24 = 121665n;

  function leToBig(bytes) {
    var x = 0n;
    for (var i = bytes.length - 1; i >= 0; i--) x = (x << 8n) | BigInt(bytes[i] & 0xFF);
    return x;
  }
  function bigToLe(n, len) {
    var out = [];
    for (var i = 0; i < len; i++) { out.push(Number(n & 0xFFn)); n >>= 8n; }
    return out;
  }
  function fm(a, b) { return (a * b) % P; }
  function fa(a, b) { return (a + b) % P; }
  function fs(a, b) { return (a - b + P * 2n) % P; }
  function fpow(b, e) {
    var r = 1n;
    b = ((b % P) + P) % P;
    while (e > 0n) {
      if (e & 1n) r = fm(r, b);
      b = fm(b, b);
      e >>= 1n;
    }
    return r;
  }
  function finv(a) { return fpow(a, P - 2n); }

  function clampScalar(bytes) {
    var k = bytes.slice(0, 32);
    k[0] &= 248;
    k[31] &= 127;
    k[31] |= 64;
    return k;
  }

  function x25519(scalarBytes, uBytes) {
    var k = leToBig(clampScalar(scalarBytes));
    var u = leToBig(uBytes);
    u = u & ((1n << 255n) - 1n);
    u = u % P;
    var x1 = u, x2 = 1n, z2 = 0n, x3 = u, z3 = 1n, swap = 0n;
    var t, kt, tmp;
    var A, AA, B, BB, E, C, D, DA, CB;
    for (t = 254; t >= 0; t--) {
      kt = (k >> BigInt(t)) & 1n;
      if ((swap ^ kt) !== 0n) {
        tmp = x2; x2 = x3; x3 = tmp;
        tmp = z2; z2 = z3; z3 = tmp;
      }
      swap = kt;
      A = fa(x2, z2); AA = fm(A, A);
      B = fs(x2, z2); BB = fm(B, B);
      E = fs(AA, BB);
      C = fa(x3, z3); D = fs(x3, z3);
      DA = fm(D, A); CB = fm(C, B);
      x3 = fm(fa(DA, CB), fa(DA, CB));
      z3 = fm(x1, fm(fs(DA, CB), fs(DA, CB)));
      x2 = fm(AA, BB);
      z2 = fm(E, fa(AA, fm(A24, E)));
    }
    if (swap === 1n) {
      tmp = x2; x2 = x3; x3 = tmp;
      tmp = z2; z2 = z3; z3 = tmp;
    }
    var res = fm(x2, finv(z2));
    return bigToLe(res, 32);
  }

  var BASE9 = [9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
               0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  function genPriv() { return clampScalar(randomBytes(32)); }
  function privToPub(priv) {
    if (!priv) return null;
    return x25519(clampScalar(priv), BASE9);
  }
  function sharedSecret(priv, peerPubRaw) {
    if (!peerPubRaw || peerPubRaw.length !== 32) return null;
    return x25519(clampScalar(priv), peerPubRaw);
  }

  function rotl(x, n) { return ((x << n) | (x >>> (32 - n))) >>> 0; }
  function add(a, b) { return (a + b) >>> 0; }
  function quarterRound(w, a, b, c, d) {
    w[a] = add(w[a], w[b]); w[d] = rotl(w[d] ^ w[a], 16);
    w[c] = add(w[c], w[d]); w[b] = rotl(w[b] ^ w[c], 12);
    w[a] = add(w[a], w[b]); w[d] = rotl(w[d] ^ w[a], 8);
    w[c] = add(w[c], w[d]); w[b] = rotl(w[b] ^ w[c], 7);
  }
  function leWords(bytes, off, count) {
    var w = [], i, j;
    for (i = 0; i < count; i++) {
      var v = 0;
      for (j = 3; j >= 0; j--) v = (v << 8) | (bytes[off + i * 4 + j] & 0xFF);
      w.push(v >>> 0);
    }
    return w;
  }
  function chachaBlock(keyW, counter, nonceW) {
    var st = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]
      .concat(keyW, [counter >>> 0], nonceW);
    var w = st.slice(), i;
    for (i = 0; i < 10; i++) {
      quarterRound(w, 0, 4, 8, 12); quarterRound(w, 1, 5, 9, 13);
      quarterRound(w, 2, 6, 10, 14); quarterRound(w, 3, 7, 11, 15);
      quarterRound(w, 0, 5, 10, 15); quarterRound(w, 1, 6, 11, 12);
      quarterRound(w, 2, 7, 8, 13); quarterRound(w, 3, 4, 9, 14);
    }
    var out = [];
    for (i = 0; i < 16; i++) out.push((w[i] + st[i]) >>> 0);
    return out;
  }
  function chachaKeystream(key32, counter, nonce12, numBlocks) {
    var kw = leWords(key32, 0, 8);
    var nw = leWords(nonce12, 0, 3);
    var out = [];
    for (var n = 0; n < numBlocks; n++) {
      var blk = chachaBlock(kw, counter + n, nw);
      for (var i = 0; i < 16; i++) {
        out.push(blk[i] & 0xFF, (blk[i] >>> 8) & 0xFF, (blk[i] >>> 16) & 0xFF, (blk[i] >>> 24) & 0xFF);
      }
    }
    return out;
  }
  function poly1305(msg, key32) {
    var rb = key32.slice(0, 16);
    rb[3] &= 15; rb[7] &= 15; rb[11] &= 15; rb[15] &= 15;
    rb[4] &= 252; rb[8] &= 252; rb[12] &= 252;
    var r = leToBig(rb);
    var s = leToBig(key32.slice(16, 32));
    var MODP = (1n << 130n) - 5n;
    var h = 0n, i = 0;
    while (i < msg.length) {
      var n = Math.min(16, msg.length - i);
      var blk = msg.slice(i, i + n);
      var v = leToBig(blk);
      v = v | (1n << BigInt(8 * n));
      h = (h + v) * r % MODP;
      i += n;
    }
    h = (h + s) & ((1n << 128n) - 1n);
    return bigToLe(h, 16);
  }
  function pad16To(bytes) {
    var out = bytes.slice();
    var pad = (16 - (bytes.length % 16)) % 16;
    for (var i = 0; i < pad; i++) out.push(0);
    return out;
  }
  function le64(n) {
    var out = [];
    for (var i = 0; i < 8; i++) { out.push(n & 0xFF); n = Math.floor(n / 256); }
    return out;
  }
  function aeadSeal(key32, nonce12, aad, plaintext) {
    var blocks = Math.ceil((plaintext.length || 0) / 64) || 0;
    var ks = chachaKeystream(key32, 1, nonce12, blocks);
    var ct = [];
    for (var i = 0; i < plaintext.length; i++) ct.push(plaintext[i] ^ ks[i]);
    var polyKey = chachaKeystream(key32, 0, nonce12, 1).slice(0, 32);
    var mac = pad16To(aad).concat(pad16To(ct), le64(aad.length), le64(ct.length));
    var tag = poly1305(mac, polyKey);
    return ct.concat(tag);
  }
  function aeadOpen(key32, nonce12, aad, ctAndTag) {
    if (!ctAndTag || ctAndTag.length < 16) return null;
    var ct = ctAndTag.slice(0, ctAndTag.length - 16);
    var tag = ctAndTag.slice(ctAndTag.length - 16);
    var blocks = Math.ceil(ct.length / 64) || 0;
    var ks = chachaKeystream(key32, 1, nonce12, blocks);
    var pt = [];
    for (var i = 0; i < ct.length; i++) pt.push(ct[i] ^ ks[i]);
    var polyKey = chachaKeystream(key32, 0, nonce12, 1).slice(0, 32);
    var mac = pad16To(aad).concat(pad16To(ct), le64(aad.length), le64(ct.length));
    var calc = poly1305(mac, polyKey);
    if (!bytesEqual(calc, tag)) return null;
    return pt;
  }

  var SHARED = {};

  function deriveKey(priv, peerPubRaw, cid) {
    var pb64 = b64FromBytes(peerPubRaw);
    var shared = SHARED[pb64];
    if (!shared) {
      shared = sharedSecret(priv, peerPubRaw);
      if (!shared) return null;
      SHARED[pb64] = shared;
    }
    return hkdfSha256(shared, utf8('av3|' + cid), utf8('av3-msg-v1'), 32);
  }

  function packPayload(payload) {
    return AV3Core.compact.encode(payload);
  }

  function seal(text, priv, peerPubRaw, cid) {
    if (!priv || !peerPubRaw || !cid) return null;
    var key = deriveKey(priv, peerPubRaw, cid);
    if (!key) return null;
    var payload = [TYPE_DATA].concat(randomBytes(12));
    var ct = aeadSeal(key, payload.slice(1, 13), utf8('av3v1|' + cid), utf8(text));
    payload = payload.concat(ct);
    return packPayload(payload);
  }

  function parseSoup(soupOrBytes) {
    var payload = (typeof soupOrBytes === 'string') ? AV3Core.compact.decode(soupOrBytes) : soupOrBytes;
    if (!payload || payload.length < 1) return null;
    return payload;
  }

  function open(soup, priv, peerPubRaw, cid) {
    if (!priv || !peerPubRaw || !cid) return null;
    var payload = parseSoup(soup);
    if (!payload || payload[0] !== TYPE_DATA || payload.length < 1 + 12 + 16) return null;
    var key = deriveKey(priv, peerPubRaw, cid);
    if (!key) return null;
    var pt = aeadOpen(key, payload.slice(1, 13), utf8('av3v1|' + cid), payload.slice(13));
    if (!pt) return null;
    return utf8b(pt);
  }

  function announceSoup(priv) {
    var pub = privToPub(priv);
    if (!pub) return null;
    return packPayload([TYPE_PUBKEY].concat(pub));
  }

  function pubkeyFromAnnounce(payload) {
    if (!payload || payload[0] !== TYPE_PUBKEY || payload.length < 1 + 32) return null;
    return payload.slice(1, 33);
  }

  var FP_EMOJI = ['🍎', '🐝', '🌵', '🎩', '🐘', '🔥', '🍇', '🐰',
                  '🌞', '🍉', '🐙', '🦊', '🐼', '🍊', '🐸', '🦄'];
  function fingerprint(priv, peerPubRaw) {
    var shared = sharedSecret(priv, peerPubRaw);
    if (!shared) return '';
    var h = sha256(shared.concat(utf8('av3fp-v1')));
    var out = '';
    for (var i = 0; i < 8; i++) out += FP_EMOJI[(h[i] >> 4) & 15] + FP_EMOJI[h[i] & 15] + ' ';
    return out.trim();
  }

  var PBKDF2_ITER = 60000;
  var PASS_CACHE = {};

  function xorInto(a, b) { for (var i = 0; i < a.length; i++) a[i] ^= b[i]; return a; }

  function pbkdf2Sha256(pass, salt, iters, dkLen) {
    var blocks = Math.ceil(dkLen / 32), out = [];
    for (var bi = 1; bi <= blocks; bi++) {
      var idx = [(bi >>> 24) & 255, (bi >>> 16) & 255, (bi >>> 8) & 255, bi & 255];
      var u = hmacSha256(pass, salt.concat(idx));
      var t = u.slice();
      for (var i = 1; i < iters; i++) {
        u = hmacSha256(pass, u);
        xorInto(t, u);
      }
      out = out.concat(t);
    }
    return out.slice(0, dkLen);
  }

  function passMaster(pass) {
    if (PASS_CACHE[pass]) return PASS_CACHE[pass];
    var m = pbkdf2Sha256(utf8(pass), utf8('av3-pk-v1'), PBKDF2_ITER, 32);
    PASS_CACHE[pass] = m;
    return m;
  }

  function passKeyFor(pass, cid) {
    if (!pass) return null;
    return hkdfSha256(passMaster(pass), utf8('av3-k|' + (cid || 'x')), utf8('av3-msg-v1'), 32);
  }

  function sealKey(text, pass, cid) {
    if (!pass || !cid) return null;
    var key = passKeyFor(pass, cid);
    if (!key) return null;
    var payload = [TYPE_KEYMSG].concat(randomBytes(12));
    var ct = aeadSeal(key, payload.slice(1, 13), utf8('av3k1|' + cid), utf8(text));
    return packPayload(payload.concat(ct));
  }

  function openKey(soup, pass, cid) {
    if (!pass || !cid) return null;
    var payload = parseSoup(soup);
    if (!payload || payload[0] !== TYPE_KEYMSG || payload.length < 1 + 12 + 16) return null;
    var key = passKeyFor(pass, cid);
    var pt = aeadOpen(key, payload.slice(1, 13), utf8('av3k1|' + cid), payload.slice(13));
    if (!pt) return null;
    return utf8b(pt);
  }

  function passFingerprint(pass) {
    if (!pass) return null;
    var h = sha256(passMaster(pass).concat(utf8('av3fp-key-v1')));
    var out = '';
    for (var i = 0; i < 8; i++) out += FP_EMOJI[(h[i] >> 4) & 15] + FP_EMOJI[h[i] & 15] + ' ';
    return out.trim();
  }

  return {
    TYPE_DATA: TYPE_DATA,
    TYPE_PUBKEY: TYPE_PUBKEY,
    TYPE_KEYMSG: TYPE_KEYMSG,
    b64FromBytes: b64FromBytes,
    bytesFromB64: bytesFromB64,
    genPriv: genPriv,
    privToPub: privToPub,
    seal: seal,
    open: open,
    sealKey: sealKey,
    openKey: openKey,
    passFingerprint: passFingerprint,
    passKeyFor: passKeyFor,
    parseSoup: parseSoup,
    announceSoup: announceSoup,
    pubkeyFromAnnounce: pubkeyFromAnnounce,
    fingerprint: fingerprint,
    sha256: sha256,
    hmacSha256: hmacSha256,
    x25519: x25519,
    _hkdf: hkdfSha256,
    _pbkdf2: pbkdf2Sha256,
    _deriveKey: deriveKey,
    _aeadSeal: aeadSeal,
    _aeadOpen: aeadOpen
  };
})();
if (typeof window !== 'undefined') { try { window.AV3V3 = AV3V3; } catch (e) {} }
