window.AV3_NOISE=[256,512,768,1024,1280,1536,1792,2048,2304,3072,3328,3840,4096,4352,4608,4864,5120,5376,5632,5888,6144,6400,6656,6912,7168,7424,7680,7936,8192,8448,8704,8960,9216,9472,10240,10496,10752,11008,11264,11520,11776,12032,12288,12800,13056,13312,13568,13824,14080,14336,14592,14848,15104,15360,15616,15872,16128,16384,16640,16896,17152,17408,17664,17920,18176,18432,18688,18944,19200,19456,19712,36352,36608,36864,37120,37376,37632,37888,38144,38400,38656,38912,39168,39424,39680,39936,40192,40448,40704,40960,41216,41472,41728,41984,42240,42496,42752,43008,43264,43520,44032,44288,44544,44800,45056,45312,45568,45824,46080,46336,46592,46848,47104,47360,47616,47872,48128,48384,48640,48896,49152,49408,49664,49920,50176,50432,50688,50944,51200,51456,51712,51968,52224,52480,52736,52992,53248,53504,53760,54016,54272,54528,54784,55040,63744,64000,64256,64512,64768,65024,65536,65792,66304,66560,66816,67072,67328,67584,67840,68096,68352,68608,68864,69376,69632,69888,70144,70400,70656,71168,71424,71680,71936,72192,72448,72704,72960,73472,73728,73984,74240,74496,74752,75008,77824,78080,78336,78592,78848,82944,83200,83456,92160,92416,92672,92928,93952,94208,94464,94720,94976,95232,95488,95744,96000,96256,96512,96768,97024,97280,97536,97792,98048,98304,98560,98816,99072,99328,99584,99840,100096,100352,100608,100864,101120,101376,101632,110592,110848,111104,113664,118528,118784,119296,119552,119808,120064,120320,120576,120832,121088,121344,122624,122880,123136,124928,125184,126464,131072,131328,131584,131840,132096,132352,132608,132864,133120,133376,133632,133888,134144,134400,134656,134912,135168,135424,135680,135936,136192,136448,136704,136960,137216,137472,137728,137984,138240,138496,138752,139008,139264,139520,139776,140032,140288,140544,140800,141056,141312,141568,141824,142080,142336,142592,142848,143104,143360,143616,143872,144128,144384,144640,144896,145152,145408,145664,145920,146176,146432,146688,146944,147200,147456,147712,147968,148224,148480,148736,148992,149248,149504,149760,150016,150272,150528,150784,151040,151296,151552,151808,152064,152320,152576,152832,153088,153344,153600,153856,154112,154368,154624,154880,155136,155392,155648,155904,156160,156416,156672,156928,157184,157440,157696,157952,158208,158464,158720,158976,159232,159488,159744,160000,160256,160512,160768,161024,161280,161536,161792,162048,162304,162560,162816,163072,163328,163584,163840,164096,164352,164608,164864,165120,165376,165632,165888,166144,166400,166656,166912,167168,167424,167680,167936,168192,168448,168704,168960,169216,169472,169728,169984,170240,170496,170752,171008,171264,171520,171776,172032,172288,172544,172800,173056,173312,173568,173824,174080,174336,174592,174848,175104,175360,175616,175872,176128,176384,176640,176896,177152,177408,177664,177920,178176,178432,178688,178944,179200,179456,179712,179968,180224,180480,180736,180992,181248,181504,181760,182016,182272,182528,182784,183040,183296,183552,183808,184064,184320,184576,184832,185088,185344,185600,185856,186112,186368,186624,186880,187136,187392,187648,187904,188160,188416,188672,188928,189184,189440,189696,189952,190208,190464,190720,190976,191232,191488,191744,192000,194560,194816,195072,196608,196864,197120,197376,197632,197888,198144,198400,198656,198912,199168,199424,199680,199936,200192,200448,200704,200960,201216,201472,201728,201984,202240,202496,202752,203008,203264,203520,203776,204032,204288,204544,204800,205056,205312,205568,917760];
var AV3Core = (function () {
  'use strict';

  function utf8Encode(s) { return new TextEncoder().encode(s); }
  function utf8Decode(b) { return new TextDecoder('utf-8').decode(b); }

  function fromCodePoints(arr) {
    var out = '', CH = 4096;
    for (var i = 0; i < arr.length; i += CH) {
      out += String.fromCodePoint.apply(null, arr.slice(i, i + CH));
    }
    return out;
  }

  var MARKER = 0x1D101;
  var CBASE = 0x4E00;
  var CBITS = 14;
  var CMASK = (1 << CBITS) - 1;

  var NOISE = [];
  if (typeof AV3_NOISE !== 'undefined' && AV3_NOISE) {
    for (var ni = 0; ni < AV3_NOISE.length; ni++) {
      var ncp = AV3_NOISE[ni] & 0x10FFFF;
      if (ncp < 0x100) continue;
      if (ncp >= 0xD800 && ncp <= 0xDFFF) continue;
      if (ncp === 0xFFFE || ncp === 0xFFFF) continue;
      if (ncp >= CBASE && ncp <= CBASE + CMASK) continue;
      if (ncp === MARKER) continue;
      NOISE.push(ncp);
    }
  }

  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = rng(i + 1), t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
  }
  function defaultRng(n) {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      var a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return a[0] % n;
    }
    return Math.floor(Math.random() * n);
  }

  function encode(bytes, rng) {
    rng = rng || defaultRng;
    if (!bytes || bytes.length > 65535) return null;
    var noise = NOISE.slice();
    shuffle(noise, rng);
    var ni = 0;
    var out = [MARKER];
    function maybeNoise() {
      if (rng(5) !== 0 || !noise.length) return;
      out.push(noise[ni++ % noise.length]);
    }
    var bitbuf = 0, bitcnt = 0;
    var stream = [(bytes.length >> 8) & 255, bytes.length & 255];
    for (var i = 0; i < bytes.length + 2; i++) {
      var b = i < 2 ? stream[i] : (bytes[i - 2] & 0xFF);
      bitbuf = ((bitbuf << 8) | b) & 0x1FFFFF;
      bitcnt += 8;
      while (bitcnt >= CBITS) {
        bitcnt -= CBITS;
        maybeNoise();
        out.push(CBASE + ((bitbuf >> bitcnt) & CMASK));
      }
      bitbuf &= (1 << bitcnt) - 1;
    }
    if (bitcnt > 0) {
      maybeNoise();
      out.push(CBASE + ((bitbuf << (CBITS - bitcnt)) & CMASK));
    }
    return fromCodePoints(out);
  }

  function decode(str) {
    var bytes = [], cur = 0, cnt = 0;
    for (var i = 0; i < str.length; ) {
      var u = str.charCodeAt(i);
      i++;
      if (u >= 0xD800 && u <= 0xDBFF && i < str.length) {
        var lo = str.charCodeAt(i);
        if (lo >= 0xDC00 && lo <= 0xDFFF) {
          u = 0x10000 + ((u - 0xD800) << 10) + (lo - 0xDC00);
          i++;
        }
      }
      if (u < CBASE || u > CBASE + CMASK) continue;
      cur = ((cur << CBITS) | (u - CBASE)) & 0x1FFFFF;
      cnt += CBITS;
      while (cnt >= 8) {
        cnt -= 8;
        bytes.push((cur >> cnt) & 255);
      }
      cur &= (1 << cnt) - 1;
    }
    if (bytes.length < 2) return null;
    var len = (bytes[0] << 8) | bytes[1];
    if (bytes.length < 2 + len) return null;
    return bytes.slice(2, 2 + len);
  }

  return {
    utf8Encode: utf8Encode,
    utf8Decode: utf8Decode,
    compact: { encode: encode, decode: decode, marker: MARKER }
  };
})();
if (typeof window !== 'undefined') { try { window.AV3Core = AV3Core; } catch (e) {} }
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
(function () {
  'use strict';
  if (window.__ARSENIC_V3__) return;
  window.__ARSENIC_V3__ = true;

  var cfg = (window.AV3_CONFIG && typeof window.AV3_CONFIG === 'object') ? window.AV3_CONFIG : null;
  if (!cfg || typeof cfg !== 'object') {
    cfg = { enabled: true };
  }
  if (typeof cfg.enabled !== 'boolean') cfg.enabled = true;
  try {
    var ov = localStorage.getItem('arsenic_v3_enabled');
    if (ov === '0') cfg.enabled = false;
    else if (ov === '1') cfg.enabled = true;
  } catch (e) { }

  var V3 = window.AV3V3 || null;
  var PRIV = null, PUBS = {}, CURCHAN = null;
  var DEFAULT_KEY = (cfg && typeof cfg.defaultKey === 'string' && cfg.defaultKey)
    ? cfg.defaultKey : 'ArsenicV3-Dsc/DEFAULT-KEY';
  var PASSKEY = null;
  var MEMSTORE = {};
  function lsGet(k) {
    try { var v = localStorage.getItem(k); if (v != null) return v; } catch (e) { }
    try { if (window.AV3_STATE && typeof window.AV3_STATE[k] !== 'undefined') return window.AV3_STATE[k]; } catch (e) { }
    return Object.prototype.hasOwnProperty.call(MEMSTORE, k) ? MEMSTORE[k] : null;
  }
  function lsSet(k, v) {
    MEMSTORE[k] = v;
    try { localStorage.setItem(k, v); } catch (e) { }
    try { if (window.AV3_STATE) window.AV3_STATE[k] = v; } catch (e) { }
    try { if (typeof window.AV3_SAVE === 'function') window.AV3_SAVE(JSON.stringify(MEMSTORE)); } catch (e) { }
  }
  function initV3() {
    if (!V3) return;
    try {
      var p = lsGet('av3_priv');
      if (p) { try { PRIV = V3.bytesFromB64(p); } catch (e) { PRIV = null; } }
      if (!PRIV || PRIV.length !== 32) {
        PRIV = V3.genPriv();
        lsSet('av3_priv', V3.b64FromBytes(PRIV));
      }
      var s = lsGet('av3_pubs');
      if (s) { try { PUBS = JSON.parse(s) || {}; } catch (e) { PUBS = {}; } }
      var pk = lsGet('av3_passkey');
      PASSKEY = pk ? pk : null;
      CURCHAN = chanFromUrl(location.href);
    } catch (e) { }
  }
  function savePubs() { lsSet('av3_pubs', JSON.stringify(PUBS)); }
  function chanFromUrl(u) {
    u = String(u || '');
    var m = /\/api\/v\d+\/channels\/(\d+)/.exec(u) ||
      /\/channels\/@me\/(\d+)/.exec(u) ||
      /\/channels\/(\d+)\/(\d+)/.exec(u) ||
      /\/channels\/(\d+)/.exec(u);
    if (!m) return null;
    return m[2] || m[1] || null;
  }
  var ENC_SUFFIX = " ᵉⁿᶜ";
  var PAIR_CMD = '>av3pair';
  var MARKER = (AV3Core && AV3Core.compact) ? AV3Core.compact.marker : 0x1D101;

  function encMarkOf(content) {
    if (content.length > ENC_SUFFIX.length && content.slice(-ENC_SUFFIX.length) === ENC_SUFFIX) return ENC_SUFFIX;
    return null;
  }

  function encryptOut(content, cid) {
    if (!cfg.enabled) return content;
    if (!V3 || !PRIV) return content;
    var base = stripEncMark(content);
    if (base.trim() === PAIR_CMD) {
      var ann = V3.announceSoup(PRIV);
      return ann ? ann + ENC_SUFFIX : null;
    }
    if (PASSKEY) {
      var target = cid || CURCHAN;
      if (target) {
        var soup = V3.sealKey(base, PASSKEY, target);
        if (soup) return soup + ENC_SUFFIX;
      }
      return null;
    }
    if (cid && PUBS[cid]) {
      var soup2 = V3.seal(base, PRIV, V3.bytesFromB64(PUBS[cid]), cid);
      if (soup2) return soup2 + ENC_SUFFIX;
    }
    var target2 = cid || CURCHAN;
    if (target2) {
      var soup3 = V3.sealKey(base, DEFAULT_KEY, target2);
      if (soup3) return soup3 + ENC_SUFFIX;
    }
    return null;
  }

  function stripEncMark(content) {
    var mark = encMarkOf(content);
    return mark ? content.slice(0, -mark.length) : content;
  }

  function isMessagesUrl(url, method) {
    if (!url || method !== 'POST' && method !== 'PATCH') return false;
    var u = String(url);
    return u.indexOf('/channels/') !== -1 && u.indexOf('/messages') !== -1;
  }

  function encryptBodyObject(obj, cid) {
    if (obj && typeof obj.content === 'string' && obj.content && cfg.enabled) {
      var enc = encryptOut(obj.content, cid);
      if (enc === null) { obj.__av3Drop = true; return false; }
      if (enc !== obj.content) { obj.content = enc; return true; }
    }
    return false;
  }

  function blockedSend() {
    try {
      if (typeof Response === 'function') {
        return Promise.resolve(new Response(JSON.stringify({ message: 'ArsenicV3: no key configured for this channel', code: 50006 }), { status: 400, statusText: 'Blocked', headers: { 'Content-Type': 'application/json' } }));
      }
    } catch (e) { }
    return Promise.reject(new Error('ArsenicV3: send blocked'));
  }

  function patchFetch() {
    if (window.__av3FetchPatched) return;
    window.__av3FetchPatched = true;
    var orig = window.fetch;
    window.fetch = function (input, init) {
      try {
        var url = (typeof input === 'string') ? input : (input && input.url) || '';
        var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        if (init && init.body && isMessagesUrl(url, method)) {
          var cid = chanFromUrl(url);
          init = Object.assign({}, init);
          var body = init.body;
          if (typeof body === 'string' && body.charAt(0) === '{') {
            var parsed = JSON.parse(body);
            var ch = encryptBodyObject(parsed, cid);
            if (parsed.__av3Drop) return blockedSend();
            if (ch) init.body = JSON.stringify(parsed);
          } else if (typeof FormData !== 'undefined' && body instanceof FormData) {
            var pj = body.get('payload_json');
            if (typeof pj === 'string') {
              var obj = JSON.parse(pj);
              var ch2 = encryptBodyObject(obj, cid);
              if (obj.__av3Drop) return blockedSend();
              if (ch2) body.set('payload_json', JSON.stringify(obj));
            }
          }
        }
      } catch (e) { }
      return orig.call(this, input, init);
    };
  }

  function patchXHR() {
    if (window.__av3XhrPatched) return;
    if (typeof XMLHttpRequest === 'undefined') return;
    window.__av3XhrPatched = true;
    var origSend = XMLHttpRequest.prototype.send;
    var origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      try { this.__av3Method = String(method || '').toUpperCase(); this.__av3Url = String(url || ''); } catch (e) { }
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
      try {
        if (body != null && isMessagesUrl(this.__av3Url, this.__av3Method)) {
          var cid = chanFromUrl(this.__av3Url);
          var drop = false;
          if (typeof body === 'string' && body.charAt(0) === '{') {
            var parsed = JSON.parse(body);
            var ch = encryptBodyObject(parsed, cid);
            if (parsed.__av3Drop) drop = true;
            else if (ch) body = JSON.stringify(parsed);
          } else if (typeof FormData !== 'undefined' && body instanceof FormData) {
            var pj = body.get('payload_json');
            if (typeof pj === 'string') {
              var obj = JSON.parse(pj);
              var ch2 = encryptBodyObject(obj, cid);
              if (obj.__av3Drop) drop = true;
              else if (ch2) body.set('payload_json', JSON.stringify(obj));
            }
          }
          if (drop) {
            var self = this;
            setTimeout(function () {
              try {
                var ERR = JSON.stringify({ message: 'ArsenicV3: no key configured for this channel', code: 50006 });
                try { Object.defineProperty(self, 'readyState', { value: 4, configurable: true }); } catch (e) { }
                try { Object.defineProperty(self, 'status', { value: 400, configurable: true }); } catch (e) { }
                try { Object.defineProperty(self, 'statusText', { value: 'Blocked', configurable: true }); } catch (e) { }
                try { Object.defineProperty(self, 'responseText', { value: ERR, configurable: true }); } catch (e) { }
                try { if (typeof Event === 'function' && typeof self.dispatchEvent === 'function') self.dispatchEvent(new Event('readystatechange')); } catch (e) { }
                try { if (typeof self.onreadystatechange === 'function') self.onreadystatechange({ type: 'readystatechange' }); } catch (e) { }
                try { if (typeof ProgressEvent === 'function' && typeof self.dispatchEvent === 'function') self.dispatchEvent(new ProgressEvent('load')); } catch (e) { }
                try { if (typeof self.onload === 'function') self.onload({ type: 'load' }); } catch (e) { }
                try { if (typeof ProgressEvent === 'function' && typeof self.dispatchEvent === 'function') self.dispatchEvent(new ProgressEvent('loadend')); } catch (e) { }
                try { if (typeof self.onloadend === 'function') self.onloadend({ type: 'loadend' }); } catch (e) { }
              } catch (e) { }
            }, 0);
            return;
          }
        }
      } catch (e) { }
      return origSend.call(this, body);
    };
  }

  function domDecryptText(s) {
    if (!s || s.length < 8 || !V3) return null;
    var chan = chanFromUrl(location.href) || CURCHAN;
    var mark = encMarkOf(s);
    var content = mark ? s.slice(0, -mark.length) : s;
    if (!content.trim()) return null;
    if (content.codePointAt(0) !== MARKER) return null;

    var payload = null;
    try { payload = V3.parseSoup(content); } catch (e) { payload = null; }
    if (payload && payload[0] === V3.TYPE_PUBKEY) {
      if (!PRIV) return null;
      var pk = V3.pubkeyFromAnnounce(payload);
      if (!pk) return null;
      var pb64 = V3.b64FromBytes(pk);
      var myb64 = V3.b64FromBytes(V3.privToPub(PRIV));
      if (pb64 !== myb64 && chan) {
        if (PUBS[chan] !== pb64) {
          PUBS[chan] = pb64;
          savePubs();
          scheduleWalk();
        }
      }
      return null;
    }
    if (payload && payload[0] === V3.TYPE_DATA) {
      if (PRIV && chan && PUBS[chan]) {
        try {
          var pt = V3.open(content, PRIV, V3.bytesFromB64(PUBS[chan]), chan);
          if (pt != null) return pt + ENC_SUFFIX;
        } catch (e) { }
      }
      return null;
    }
    if (payload && payload[0] === V3.TYPE_KEYMSG) {
      if (chan) {
        if (PASSKEY) {
          try {
            var pt2 = V3.openKey(content, PASSKEY, chan);
            if (pt2 != null) return pt2 + ENC_SUFFIX;
          } catch (e) { }
        }
        try {
          var pt3 = V3.openKey(content, DEFAULT_KEY, chan);
          if (pt3 != null) return pt3 + ENC_SUFFIX;
        } catch (e) { }
      }
    }
    return null;
  }

  function decryptTextNode(node) {
    var res = domDecryptText(node.nodeValue);
    if (res != null && node.nodeValue !== res) node.nodeValue = res;
  }

  function walkText(root) {
    var walker;
    try { walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); } catch (e) { return; }
    var n;
    while ((n = walker.nextNode())) decryptTextNode(n);
  }

  function scheduleWalk() {
    setTimeout(function () { if (document.body) walkText(document.body); }, 30);
  }

  var domObs = false;
  function patchDomDecrypt() {
    if (domObs || !document.body) return;
    try {
      domObs = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var m = muts[i];
          if (m.type === 'characterData' && m.target && m.target.nodeType === 3) {
            decryptTextNode(m.target);
            continue;
          }
          for (var j = 0; j < m.addedNodes.length; j++) {
            var a = m.addedNodes[j];
            if (a.nodeType === 3) decryptTextNode(a);
            else if (a.nodeType === 1) walkText(a);
          }
        }
      });
      domObs.observe(document.body, { childList: true, subtree: true, characterData: true });
      walkText(document.body);
    } catch (e) {
      domObs = false;
    }
  }

  var AV3_ICON_ON = '<svg viewBox="0 0 24 24" width="24" height="24" style="display:block" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 6h2v2h-2V7zm0 4h2v6h-2v-6z"/></svg>';
  var AV3_ICON_OFF = '<svg viewBox="0 0 24 24" width="24" height="24" style="display:block" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 6h2v2h-2V7zm0 4h2v6h-2v-6z" opacity="0.35"/><line x1="4" y1="4" x2="20" y2="20" stroke="#f04747" stroke-width="2.4" stroke-linecap="round"/></svg>';

  function updateToggleVisual() {
    var el = document.getElementById('av3-toggle') || document.getElementById('av3-float');
    if (!el) return;
    el.innerHTML = cfg.enabled ? AV3_ICON_ON : AV3_ICON_OFF;
    el.style.opacity = cfg.enabled ? '1' : '0.55';
    el.title = 'ArsenicV3-Dsc: ' + (cfg.enabled ? 'ON' : 'OFF');
    el.setAttribute('aria-label', el.title);
  }

  function toggleEncryption() {
    cfg.enabled = !cfg.enabled;
    try { localStorage.setItem('arsenic_v3_enabled', cfg.enabled ? '1' : '0'); } catch (e) { }
    updateToggleVisual();
  }

  var KEY_PANEL = null, keyHideT = null;

  function cancelKeyHide() {
    if (keyHideT) { clearTimeout(keyHideT); keyHideT = null; }
  }
  function armKeyHide() {
    cancelKeyHide();
    keyHideT = setTimeout(hideKeyPanel, 600);
  }

  function setPasskey(v) {
    PASSKEY = (v && v.length) ? v : null;
    lsSet('av3_passkey', PASSKEY || '');
  }

  function hideKeyPanel() {
    if (KEY_PANEL) KEY_PANEL.style.display = 'none';
  }

  function ensureKeyPanel() {
    if (KEY_PANEL && KEY_PANEL.isConnected) return KEY_PANEL;
    var p = document.createElement('div');
    p.id = 'av3-keypanel';
    p.style.cssText = 'display:none;position:fixed;z-index:9999;background:#2b2d31;color:#dbdee1;' +
      'border:1px solid #1e1f22;border-radius:8px;padding:10px 12px;width:220px;box-sizing:border-box;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.45);font-size:13px;line-height:1.4;font-family:system-ui,sans-serif;';
    p.addEventListener('mouseenter', cancelKeyHide);
    p.addEventListener('mouseleave', armKeyHide);
    document.body.appendChild(p);
    KEY_PANEL = p;
    return p;
  }

  function renderKeyPanel() {
    var p = ensureKeyPanel();
    while (p.firstChild) p.removeChild(p.firstChild);
    var h = document.createElement('div');
    h.textContent = 'Key';
    h.style.cssText = 'font-weight:700;margin-bottom:6px;';
    p.appendChild(h);
    var inp = document.createElement('input');
    inp.type = 'password';
    inp.value = PASSKEY || '';
    inp.style.cssText = 'width:100%;box-sizing:border-box;background:#1e1f22;color:#dbdee1;' +
      'border:1px solid #3f4147;border-radius:6px;padding:6px 8px;font-size:13px;outline:none;';
    inp.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        applyBtn.click();
      }
    });
    p.appendChild(inp);
    var row = document.createElement('div');
    row.style.cssText = 'margin-top:8px;';
    p.appendChild(row);
    function btn(label, fn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'background:#4e5058;color:#fff;border:0;border-radius:6px;padding:6px 12px;margin-right:8px;cursor:pointer;font-size:13px;';
      b.addEventListener('click', function (e) { e.preventDefault(); fn(); });
      row.appendChild(b);
      return b;
    }
    var applyBtn = btn('Apply', function () {
      var v = inp.value || '';
      setPasskey(v);
      renderKeyPanel();
      scheduleWalk();
    });
    btn('Reset', function () {
      setPasskey('');
      renderKeyPanel();
      scheduleWalk();
    });
    return p;
  }

  function showKeyPanel(anchor) {
    if (!document.body) return;
    var p = renderKeyPanel();
    var r = anchor.getBoundingClientRect();
    p.style.display = 'block';
    var top = r.top - p.offsetHeight - 8;
    if (top < 8) top = r.bottom + 8;
    p.style.top = top + 'px';
    p.style.left = Math.max(8, Math.min(r.right - p.offsetWidth, (window.innerWidth || 1600) - p.offsetWidth - 8)) + 'px';
  }

  function ensureToolbarButton() {
    try {
      var existing = document.getElementById('av3-toggle');
      if (existing && existing.isConnected) return;
      var anchor = document.querySelector('button[aria-label*="модзи" i], button[aria-label*="moji" i], button[class*="emojiButton" i]');
      var container = null;
      if (anchor) {
        container = anchor.closest('div[class*="buttonContainer" i]') || anchor.closest('div[class*="button" i]') || anchor.parentElement;
      }
      if (!container || !container.parentElement) {
        container = null;
        var row = document.querySelector('form div[class*="buttons" i]');
        if (row && row.lastElementChild) container = row.lastElementChild;
      }
      if (!container || !container.parentElement) {
        var flo = document.getElementById('av3-float');
        if (!flo) {
          flo = document.createElement('div');
          flo.id = 'av3-float';
          flo.style.cssText = 'position:fixed;z-index:9998;right:12px;bottom:80px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:#2b2d31;border-radius:50%;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.4);';
          flo.innerHTML = AV3_ICON_ON;
          flo.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            toggleEncryption();
          });
          flo.addEventListener('mouseenter', function () {
            cancelKeyHide();
            showKeyPanel(flo);
          });
          flo.addEventListener('mouseleave', armKeyHide);
          document.body.appendChild(flo);
        }
        updateToggleVisual();
        return;
      }
      var fl = document.getElementById('av3-float');
      if (fl) fl.parentNode.removeChild(fl);
      var clone = container.cloneNode(true);
      clone.id = 'av3-toggle';
      clone.className = container.className;
      clone.style.cursor = 'pointer';
      clone.innerHTML = AV3_ICON_ON;
      clone.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleEncryption();
      });
      clone.addEventListener('mouseenter', function () {
        cancelKeyHide();
        showKeyPanel(clone);
      });
      clone.addEventListener('mouseleave', armKeyHide);
      container.parentElement.insertBefore(clone, container.nextSibling);
      updateToggleVisual();
    } catch (e) { }
  }
  setInterval(ensureToolbarButton, 1500);
  setTimeout(ensureToolbarButton, 3000);

  function tryInit() {
    try { patchFetch(); } catch (e) { }
    try { patchXHR(); } catch (e) { }
    try { initV3(); } catch (e) { }
    try { patchDomDecrypt(); } catch (e) { }
    return !!domObs;
  }
  var initTries = 0;
  var initTimer = setInterval(function () {
    if (tryInit() || ++initTries > 240) {
      clearInterval(initTimer);
    }
  }, 500);
  tryInit();
  setInterval(function () {
    var nc = chanFromUrl(location.href);
    if (nc && nc !== CURCHAN) {
      CURCHAN = nc;
      scheduleWalk();
    }
  }, 900);
})();
