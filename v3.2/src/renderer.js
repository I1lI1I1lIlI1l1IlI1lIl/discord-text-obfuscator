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
