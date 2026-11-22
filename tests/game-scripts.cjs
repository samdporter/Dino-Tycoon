const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function scripts(entry) {
  const html = fs.readFileSync(path.join(root, entry), 'utf8');
  return new Map(Array.from(html.matchAll(/<script defer src="(src\/[^"]+)"/g), ([, file]) =>
    [path.basename(file), path.join(root, file)]));
}

const dinoScripts = scripts('index.html');
const zooScripts = scripts('zoo.html');

function gameScripts(zoo = false) {
  return zoo ? zooScripts : dinoScripts;
}

function readScript(file, zoo = false) {
  const fullPath = gameScripts(zoo).get(file);
  if (!fullPath) throw new Error(`${file} is missing from ${zoo ? 'zoo.html' : 'index.html'}`);
  return fs.readFileSync(fullPath, 'utf8');
}

function simulationScripts(zoo = false, boats = false) {
  return Array.from(gameScripts(zoo).keys()).filter(file =>
    /^(00|10|2\d\w?)-/.test(file) || file.endsWith('-config.js')
  ).filter(file => boats || !file.endsWith('-sim-boats.js'));
}

module.exports = { gameScripts, readScript, simulationScripts };
