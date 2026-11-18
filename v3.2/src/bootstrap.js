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
  var STORE = path.join(DIR, 'storage.json');

  function loadConfig() {
    try { return JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch (e) { return null; }
  }
  function saveConfig(cfg) {
    try { fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2)); } catch (e) { }
  }
  var cfg = loadConfig();
  if (!cfg || typeof cfg !== 'object') {
    cfg = { enabled: true };
    saveConfig(cfg);
  }
  if (typeof cfg.enabled !== 'boolean') cfg.enabled = true;

  try {
    electron.ipcMain.on('av3-save', function (_e, json) {
      try { fs.writeFileSync(STORE, String(json)); } catch (e) { }
    });
  } catch (e) { }

  var payload = null;
  try {
    payload = fs.readFileSync(PAYLOAD, 'utf8');
  } catch (e) { payload = null; }

  var SAVE_SRC = 'function (json) { try { process.ipcRenderer.send("av3-save", String(json)); } catch (e) { } }';

  function looksLikeDiscordUrl(url) {
    if (!url) return false;
    return url.indexOf('discord.com') !== -1 ||
           url.indexOf('discordapp') !== -1 ||
           url.indexOf('app://') === 0;
  }

  app.on('web-contents-created', function (_e, wc) {
    if (!payload) return;

  var inject = function () {
    var url = '', type = '';
    try { url = wc.getURL() || ''; } catch (e) { }
    try { type = wc.getType(); } catch (e) { }
    if (type !== 'window') return;
    if (!looksLikeDiscordUrl(url)) return;
    var state = {};
    try { state = JSON.parse(fs.readFileSync(STORE, 'utf8')) || {}; } catch (e) { }
    var script = 'window.AV3_CONFIG = ' + JSON.stringify(cfg) + ';\n' +
      'window.AV3_STATE = ' + JSON.stringify(state) + ';\n' +
      'window.AV3_SAVE = ' + SAVE_SRC + ';\n' + payload;
    wc.executeJavaScript(script, true).catch(function () { });
  };
    try { wc.on('dom-ready', inject); } catch (e) { }
    wc.on('did-finish-load', inject);
  });
})();
