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
  var wpRequire = null;
  try {
    var chunks = window.webpackChunkdiscord_app;
    if (chunks && typeof chunks.push === 'function') {
      chunks.push([[Math.random()], {}, function (r) { wpRequire = r; }]);
    }
  } catch (e) { }

  var lastScanAt = 0;

  function exportsMatches(ex, keys) {
    var targets = [];
    try { if (ex && (typeof ex === 'object' || typeof ex === 'function')) targets.push(ex); } catch (e) { }
    try { if (ex && ex.default && (typeof ex.default === 'object' || typeof ex.default === 'function')) targets.push(ex.default); } catch (e) { }
    for (var t = 0; t < targets.length; t++) {
      var a = targets[t], ok = true;
      for (var i = 0; i < keys.length; i++) {
        try { if (a[keys[i]] == null) { ok = false; break; } } catch (e) { ok = false; break; }
      }
      if (ok) return a;
    }
    return null;
  }

  function findByKeys(keys) {
    if (!wpRequire) return null;
    var cache = wpRequire.c;
    if (!cache) return null;
    var now = Date.now();
    if (now - lastScanAt < 500) return null;
    lastScanAt = now;
    for (var fid in cache) {
      var ex = cache[fid] && cache[fid].exports;
      if (!ex) continue;
      var m = exportsMatches(ex, keys);
      if (m) return m;
    }
    return null;
  }

  var Dispatcher = null;

  var ENC_SUFFIX = " /enc";

  function stripEncSuffix(content) {
    if (content.length > ENC_SUFFIX.length && content.slice(-ENC_SUFFIX.length) === ENC_SUFFIX) {
      return content.slice(0, -ENC_SUFFIX.length);
    }
    return content;
  }

  function tryDecryptContent(msg) {
    if (!msg || typeof msg.content !== 'string' || !msg.content) return false;
    var content = stripEncSuffix(msg.content);
    if (!content.trim()) return false;

    if (AV3Core.v2 && AV3Core.v2.looksLike(content)) {
      var pt2 = AV3Core.v2.decryptTokens(content);
      if (pt2 != null && pt2.length) {
        msg.content = pt2;
        return true;
      }
    }

    return false;
  }

  function transformPayload(payload) {
    if (!payload) return;
    try {
      if (payload.message) tryDecryptContent(payload.message);
      if (payload.messages && payload.messages.forEach) payload.messages.forEach(tryDecryptContent);
      tryDecryptContent(payload);
    } catch (e) { }
  }

  function patchDispatchProp(target) {
    if (!target || typeof target.dispatch !== 'function' || target.__av3Patched) return false;
    target.__av3Patched = true;
    var orig = target.dispatch;
    target.dispatch = function (payload) {
      try { transformPayload(payload); } catch (e) { }
      return orig.apply(this, arguments);
    };
    return true;
  }

  function patchDispatcher() {
    var d = null;
    try {
      var vc = (window.Vencord && window.Vencord.Webpack && typeof window.Vencord.Webpack.findByProps === 'function')
        ? window.Vencord
        : ((window.Equicord && window.Equicord.Webpack && typeof window.Equicord.Webpack.findByProps === 'function')
            ? window.Equicord : null);
      if (vc) {
        d = vc.Webpack.findByProps('dispatch', 'subscribe', 'addInterceptor') ||
            vc.Webpack.findByProps('dispatch', 'subscribe');
      }
    } catch (e) { }
    if (!d) {
      d = findByKeys(['dispatch', 'subscribe', 'addInterceptor']) ||
          findByKeys(['dispatch', 'subscribe', 'isDispatching']) ||
          findByKeys(['dispatch', 'subscribe', 'wait']);
    }
    if (!d || typeof d.dispatch !== 'function') return false;

    var fnSrc = String(d.dispatch).replace(/\s+/g, ' ');
    if (fnSrc.length < 30 && fnSrc.indexOf('get(') !== -1) {
      return false;
    }
    Dispatcher = d;
    var ok = patchDispatchProp(d);
    try {
      var base = d.$$baseObject;
      if (base && base !== d && typeof base === 'object') ok = patchDispatchProp(base) || ok;
    } catch (e) { }
    return ok;
  }

  function patchStores() {
    if (!wpRequire || !wpRequire.c) return;
    var cache = wpRequire.c;
    var events = ['MESSAGE_CREATE', 'MESSAGE_UPDATE', 'LOAD_MESSAGES_SUCCESS'];
    for (var id in cache) {
      var ex = cache[id] && cache[id].exports;
      var targets = [];
      try {
        if (ex && typeof ex === 'object') targets.push(ex);
        if (ex && ex.default && typeof ex.default === 'object' && ex.default !== ex) targets.push(ex.default);
      } catch (e) { continue; }
      for (var t = 0; t < targets.length; t++) {
        var obj = targets[t];
        if (obj.__av3StorePatched) continue;
        if (typeof obj.MESSAGE_CREATE !== 'function' || typeof obj.MESSAGE_UPDATE !== 'function') continue;
        try {
          obj.__av3StorePatched = true;
          events.forEach(function (evt) {
            var orig = obj[evt];
            if (typeof orig !== 'function') return;
            obj[evt] = function (payload) {
              try { transformPayload(payload); } catch (e) { }
              return orig.apply(this, arguments);
            };
          });
        } catch (e) {
          obj.__av3StorePatched = true;
        }
      }
    }
  }

  function encryptOut(content) {
    if (!cfg.enabled) return content;
    if (AV3Core.v2) return AV3Core.v2.encryptTokens(content) + ENC_SUFFIX;
    return content;
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

  var initTries = 0;
  function tryInit() {
    if (!Dispatcher) patchDispatcher();
    patchStores();
    patchFetch();
    patchXHR();
    return !!Dispatcher;
  }
  var initTimer = setInterval(function () {
    if (tryInit()) {
      clearInterval(initTimer);
    } else if (++initTries > 240) {
      clearInterval(initTimer);
    }
  }, 500);
  tryInit();
})();
