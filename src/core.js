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

  var TOKEN_RE = /<@!?\d+>|<#\d+>|<@&\d+>|<:(?:\w|~)+:\d+>|<a:(?:\w|~)+:\d+>|(?<![A-Za-z0-9_])@(?:everyone|here)/g;
  function splitTokens(text) {
    var out = [], last = 0, m;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(text)) !== null) {
      if (m.index > last) out.push({ token: false, value: text.slice(last, m.index) });
      out.push({ token: true, value: m[0] });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ token: false, value: text.slice(last) });
    return out;
  }

  var V2 = null;
  if (typeof AV3_V2_TABLE !== 'undefined' && AV3_V2_TABLE && AV3_V2_TABLE.union) {
    V2 = (function () {
      var UNION = AV3_V2_TABLE.union;
      var JUNK = AV3_V2_TABLE.junk;
      var MASKS = AV3_V2_TABLE.masks;
      var MARKER = 0x1D100;
      var SPACE = 0x2588;
      var poolCache = {};

      function nib(hx, i) {
        var c = hx.charCodeAt(i);
        return c <= 57 ? c - 48 : (c | 32) - 87;
      }
      function poolFor(key) {
        var p = poolCache[key];
        if (p) return p;
        var hx = MASKS[key] || '';
        var arr = [];
        for (var i = 0; i < UNION.length; i++) {
          var byteIdx = i >> 3;
          var b = nib(hx, byteIdx * 2) * 16 + nib(hx, byteIdx * 2 + 1);
          if ((b >> (i & 7)) & 1) arr.push(UNION[i] + key);
        }
        poolCache[key] = arr;
        return arr;
      }
      function tryDecode(low) {
        if (low >= 0x30 && low <= 0x39) return String.fromCharCode(low);
        if (low >= 0xB0 && low <= 0xB9) return String.fromCharCode(0x30 + low - 0xB0);
        if (low >= 0x41 && low <= 0x5A) return String.fromCharCode(low);
        if (low >= 0xC1 && low <= 0xDA) return String.fromCharCode(0x41 + low - 0xC1);
        if (low >= 0x61 && low <= 0x7A) return String.fromCharCode(low);
        if (low >= 0x01 && low <= 0x1A) return String.fromCharCode(0x61 + low - 0x01);
        if (low >= 0x81 && low <= 0x9A) return String.fromCharCode(0x61 + low - 0x81);
        return null;
      }
      function getKey(u, rng) {
        if (u >= 0x30 && u <= 0x39) { var o = u - 0x30; return rng(2) === 0 ? 0x30 + o : 0xB0 + o; }
        if (u >= 0x41 && u <= 0x5A) { var o2 = u - 0x41; return rng(2) === 0 ? 0x41 + o2 : 0xC1 + o2; }
        if (u >= 0x61 && u <= 0x7A) {
          var o3 = u - 0x61, p = rng(3);
          return p === 0 ? 0x61 + o3 : (p === 1 ? 0x01 + o3 : 0x81 + o3);
        }
        return u & 0xFF;
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

      function v2Encrypt(text, rng, marker) {
        rng = rng || defaultRng;
        if (marker === undefined) marker = true;
        var used = Object.create(null);
        var out = marker ? [MARKER] : [];
        var junk = JUNK.slice();
        shuffle(junk, rng);
        var junkIdx = 0;
        var local = {};
        function maybeJunk() {
          if (rng(2) !== 0) return;
          while (junkIdx < junk.length) {
            var cp = junk[junkIdx++];
            if (!used[cp]) { used[cp] = 1; out.push(cp); return; }
          }
        }
        for (var i = 0; i < text.length; i++) {
          var u = text.charCodeAt(i);
          if (u === 0x0D) continue;
          if (u === 0x20) { maybeJunk(); out.push(SPACE); maybeJunk(); continue; }
          var key = getKey(u, rng);
          var ent = local[key];
          if (!ent) {
            ent = [poolFor(key).slice(), 0];
            shuffle(ent[0], rng);
            local[key] = ent;
          }
          var lst = ent[0], idx = ent[1], sym = -1;
          while (idx < lst.length) {
            var cp = lst[idx];
            idx++;
            if (!used[cp]) { sym = cp; used[cp] = 1; break; }
          }
          ent[1] = idx;
          if (sym === -1) { out.push(u); continue; }
          maybeJunk();
          out.push(sym);
          maybeJunk();
        }
        return fromCodePoints(out);
      }

      function v2Decrypt(str) {
        var out = [];
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
          if (u === 0x0D) continue;
          if (u === SPACE) { out.push(' '); continue; }
          if ((u & 0xFF) === 0) continue;
          var d = tryDecode(u & 0xFF);
          if (d != null) out.push(d);
        }
        return out.join('');
      }

      function v2LooksLike(str) {
        if (typeof str !== 'string' || str.length < 6) return false;
        var parts = splitTokens(str);
        var total = 0, junk = 0, dec = 0, marked = false;
        for (var p = 0; p < parts.length; p++) {
          if (parts[p].token) continue;
          var s = parts[p].value;
          if (!s) continue;
          if (!marked && s.codePointAt(0) === MARKER) marked = true;
          for (var i = 0; i < s.length; ) {
            var u = s.charCodeAt(i);
            i++;
            if (u >= 0xD800 && u <= 0xDBFF && i < s.length) {
              var lo2 = s.charCodeAt(i);
              if (lo2 >= 0xDC00 && lo2 <= 0xDFFF) {
                u = 0x10000 + ((u - 0xD800) << 10) + (lo2 - 0xDC00);
                i++;
              }
            }
            total++;
            var low = u & 0xFF;
            if (low === 0) junk++;
            else if (tryDecode(low) !== null) dec++;
          }
        }
        if (marked) return total >= 4 && dec / total >= 0.05;
        if (total < 10) return false;
        return junk / total >= 0.12 && dec / total >= 0.25;
      }

      function v2EncryptBytes(text, rng, marker) {
        rng = rng || defaultRng;
        if (marker === undefined) marker = true;
        var used = Object.create(null);
        var out = marker ? [MARKER] : [];
        var junk = JUNK.slice();
        shuffle(junk, rng);
        var junkIdx = 0;
        var local = {};
        function maybeJunk() {
          if (rng(2) !== 0) return;
          while (junkIdx < junk.length) {
            var cp = junk[junkIdx++];
            if (!used[cp]) { used[cp] = 1; out.push(cp); return; }
          }
        }
        var bytes = utf8Encode(text);
        for (var i = 0; i < bytes.length; i++) {
          var b = bytes[i];
          if (b === 0x20) { maybeJunk(); out.push(SPACE); maybeJunk(); continue; }
          var ent = local[b];
          if (!ent) {
            ent = [poolFor(b).slice(), 0];
            shuffle(ent[0], rng);
            local[b] = ent;
          }
          var lst = ent[0], idx = ent[1], sym = -1;
          while (idx < lst.length) {
            var cp = lst[idx];
            idx++;
            if (!used[cp]) { sym = cp; used[cp] = 1; break; }
          }
          ent[1] = idx;
          if (sym === -1) continue;
          maybeJunk();
          out.push(sym);
          maybeJunk();
        }
        return fromCodePoints(out);
      }

      function v2DecryptBytes(str) {
        var bytes = [];
        for (var i = 0; i < str.length; ) {
          var u = str.charCodeAt(i);
          i++;
          if (u >= 0xD800 && u <= 0xDBFF && i < str.length) {
            var lo4 = str.charCodeAt(i);
            if (lo4 >= 0xDC00 && lo4 <= 0xDFFF) {
              u = 0x10000 + ((u - 0xD800) << 10) + (lo4 - 0xDC00);
              i++;
            }
          }
          if (u === 0x0D) continue;
          if (u === SPACE) { bytes.push(0x20); continue; }
          var low = u & 0xFF;
          if (low === 0) continue;
          bytes.push(low);
        }
        try { return utf8Decode(new Uint8Array(bytes)); } catch (e) { return null; }
      }

      function isMarked(str) {

        var parts = splitTokens(str);
        for (var i = 0; i < parts.length; i++) {
          if (parts[i].token || !parts[i].value) continue;
          return parts[i].value.codePointAt(0) === MARKER;
        }
        return false;
      }

      function v2EncryptTokens(text, rng) {
        var parts = splitTokens(text);
        var out = [], marked = false;
        for (var i = 0; i < parts.length; i++) {
          if (parts[i].token || !parts[i].value) { out.push(parts[i].value); continue; }
          out.push(v2EncryptBytes(parts[i].value, rng, !marked));
          marked = true;
        }
        return out.join('');
      }

      function v2DecryptTokens(str) {
        var bytesMode = isMarked(str);
        var parts = splitTokens(str);
        var out = [];
        for (var i = 0; i < parts.length; i++) {
          if (parts[i].token) { out.push(parts[i].value); continue; }
          var v = parts[i].value;
          if (!v) continue;
          var pt = bytesMode ? v2DecryptBytes(v) : v2Decrypt(v);
          if (pt == null) return null;
          out.push(pt);
        }
        return out.join('');
      }

      function v2Stats(str) {
        var total = 0, junk = 0, dec = 0;
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
          total++;
          var low = u & 0xFF;
          if (low === 0) junk++;
          else if (tryDecode(low) !== null) dec++;
        }
        return { total: total, junk: junk, dec: dec };
      }

      return {
        encrypt: v2Encrypt, decrypt: v2Decrypt,
        encryptBytes: v2EncryptBytes, decryptBytes: v2DecryptBytes,
        encryptTokens: v2EncryptTokens, decryptTokens: v2DecryptTokens,
        isMarked: isMarked,
        looksLike: v2LooksLike,
        stats: v2Stats
      };
    })();
  }

  return {
    utf8Encode: utf8Encode,
    utf8Decode: utf8Decode,
    splitTokens: splitTokens,
    v2: V2
  };
})();
if (typeof window !== 'undefined') { try { window.AV3Core = AV3Core; } catch (e) {} }
