(function () {
  'use strict';
  if (window.__ARSENIC_V3__) return;
  window.__ARSENIC_V3__ = true;

  var cfg = (window.AV3_CONFIG && typeof window.AV3_CONFIG === 'object') ? window.AV3_CONFIG : null;
  if (!cfg || typeof cfg !== 'object') {
    cfg = { v: 2, enabled: true };
  }
  if (typeof cfg.enabled !== 'boolean') cfg.enabled = true;
  try {
    var ov = localStorage.getItem('arsenic_v3_enabled');
    if (ov === '0') cfg.enabled = false;
    else if (ov === '1') cfg.enabled = true;
  } catch (e) { }

  function notify(text) {
    try {
      if (typeof Notification === 'function') {
        var n = new Notification('ArsenicV3-Dsc', { body: text, silent: true });
        setTimeout(function () { try { n.close(); } catch (e) { } }, 6000);
      }
    } catch (e) {   }
  }

  var ENC_SUFFIX = " ᵉⁿᶜ";
  var ENC_SUFFIX_OLD = " /enc";

  function encMarkOf(content) {
    if (content.length > ENC_SUFFIX.length && content.slice(-ENC_SUFFIX.length) === ENC_SUFFIX) return ENC_SUFFIX;
    if (content.length > ENC_SUFFIX_OLD.length && content.slice(-ENC_SUFFIX_OLD.length) === ENC_SUFFIX_OLD) return ENC_SUFFIX_OLD;
    return null;
  }

  function encryptOut(content) {
    if (!cfg.enabled) return content;
    if (AV3Core.v2) return AV3Core.v2.encryptTokens(stripEncMark(content)) + ENC_SUFFIX;
    return content;
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

  function encryptBodyObject(obj) {
    if (obj && typeof obj.content === 'string' && obj.content && cfg.enabled) {
      var enc = encryptOut(obj.content);
      if (enc !== obj.content) { obj.content = enc; return true; }
    }
    return false;
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
          init = Object.assign({}, init);
          var body = init.body;
          if (typeof body === 'string' && body.charAt(0) === '{') {
            var parsed = JSON.parse(body);
            if (encryptBodyObject(parsed)) init.body = JSON.stringify(parsed);
          } else if (typeof FormData !== 'undefined' && body instanceof FormData) {
            var pj = body.get('payload_json');
            if (typeof pj === 'string') {
              var obj = JSON.parse(pj);
              if (encryptBodyObject(obj)) body.set('payload_json', JSON.stringify(obj));
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
          if (typeof body === 'string' && body.charAt(0) === '{') {
            var parsed = JSON.parse(body);
            if (encryptBodyObject(parsed)) body = JSON.stringify(parsed);
          } else if (typeof FormData !== 'undefined' && body instanceof FormData) {
            var pj = body.get('payload_json');
            if (typeof pj === 'string') {
              var obj = JSON.parse(pj);
              if (encryptBodyObject(obj)) body.set('payload_json', JSON.stringify(obj));
            }
          }
        }
      } catch (e) { }
      return origSend.call(this, body);
    };
  }

  function domDecryptText(s) {
    if (!s || s.length < 8 || !AV3Core.v2) return null;
    var mark = encMarkOf(s);
    var content = mark ? s.slice(0, -mark.length) : s;
    if (!content.trim()) return null;
    if (!AV3Core.v2.looksLike(content)) return null;
    var pt = AV3Core.v2.decryptTokens(content);
    if (pt == null || !pt.length) return null;
    return pt + ENC_SUFFIX;
  }

  function decryptTextNode(node) {
    var dec = domDecryptText(node.nodeValue);
    if (dec != null) node.nodeValue = dec;
  }

  function walkText(root) {
    var walker;
    try { walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); } catch (e) { return; }
    var n;
    while ((n = walker.nextNode())) decryptTextNode(n);
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
    var el = document.getElementById('av3-toggle');
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
    notify('ArsenicV3-Dsc: ' + (cfg.enabled ? 'ON' : 'OFF'));
  }

  function ensureToolbarButton() {
    try {
      if (document.getElementById('av3-toggle') && document.getElementById('av3-toggle').isConnected) return;
      var anchor = document.querySelector('button[aria-label*="модзи" i], button[aria-label*="moji" i], button[class*="emojiButton" i]');
      var container = null;
      if (anchor) {
        container = anchor.closest('div[class*="buttonContainer" i]') || anchor.closest('div[class*="button" i]') || anchor.parentElement;
      }
      if (!container || !container.parentElement) {
        var row = document.querySelector('form div[class*="buttons" i]');
        if (!row || !row.lastElementChild) return;
        container = row.lastElementChild;
      }
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
      container.parentElement.insertBefore(clone, container.nextSibling);
      updateToggleVisual();
    } catch (e) { }
  }
  setInterval(ensureToolbarButton, 1500);
  setTimeout(ensureToolbarButton, 3000);

  function tryInit() {
    patchFetch();
    patchXHR();
    patchDomDecrypt();
    return !!domObs;
  }
  var initTries = 0;
  var initTimer = setInterval(function () {
    if (tryInit() || ++initTries > 240) {
      clearInterval(initTimer);
    }
  }, 500);
  tryInit();
})();
