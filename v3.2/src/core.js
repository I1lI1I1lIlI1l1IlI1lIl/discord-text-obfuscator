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
