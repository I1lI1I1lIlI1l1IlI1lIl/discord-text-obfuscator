const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const noise = JSON.parse(fs.readFileSync(path.join(ROOT, 'av3', 'noise.json'), 'utf8'));
const prelude = 'var AV3_NOISE=' + JSON.stringify(noise) + ';';

const core = fs.readFileSync(path.join(ROOT, 'src', 'core.js'), 'utf8');
const v3 = fs.readFileSync(path.join(ROOT, 'src', 'v3crypto.js'), 'utf8');

function load() {
  return new Function(prelude + '\n' + core + '\n' + v3 +
    '\nreturn { AV3Core: AV3Core, AV3V3: AV3V3 };')();
}
module.exports = { load, prelude };
