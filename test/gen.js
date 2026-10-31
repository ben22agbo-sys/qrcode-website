// Generates test cases from qr.js as JSON for the Python checker.
const QR = require('../site/qr.js');
const fs = require('fs');
const inputs = [
  '0', '01234567', '1234567890123456789012345678901234567890',
  'HELLO WORLD', 'HTTPS://EXAMPLE.COM/ABC', 'A', '$%*+-./: 99',
  'https://example.com', 'Hello, world!', 'Café ☕ naïve — 日本語 🙂',
  'WIFI:T:WPA;S:MyNetwork;P:secret pass;;',
  'BEGIN:VCARD\nVERSION:3.0\nFN:Ben Test\nTEL:+441234567890\nEMAIL:ben@example.com\nEND:VCARD',
  'x'.repeat(300), '9'.repeat(1500), 'Lorem ipsum dolor sit amet '.repeat(60),
];
// Generate random strings for broad coverage of versions.
let seed = 42; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
for (let i = 0; i < 60; i++) {
  const len = Math.floor(rnd() ** 2 * 2200) + 1;
  let s = ''; for (let j = 0; j < len; j++) s += String.fromCharCode(32 + Math.floor(rnd() * 95));
  inputs.push(s);
}
const cases = [];
const dump = (c) => c.toArray().map(r => r.map(b => b ? '1' : '0').join('')).join('\n');
for (const text of inputs) {
  for (const ecl of ['L', 'M', 'Q', 'H']) {
    let auto;
    try { auto = QR.encode(text, { ecl }); } catch (e) { cases.push({ text, ecl, error: e.code }); continue; }
    cases.push({ text, ecl, version: auto.version, mask: auto.mask, mode: auto.mode, matrix: dump(auto), auto: true });
    // Forced masks on a subset to check every mask formula.
    if (text.length < 120) for (let m = 0; m < 8; m++) {
      const c = QR.encode(text, { ecl, mask: m });
      cases.push({ text, ecl, version: c.version, mask: m, matrix: dump(c), auto: false });
    }
  }
}
// Every version 1-40, forced via minVersion.
for (let v = 1; v <= 40; v++) for (const ecl of ['L', 'H']) {
  const c = QR.encode('Version test ' + v, { ecl, minVersion: v });
  cases.push({ text: 'Version test ' + v, ecl, version: c.version, mask: c.mask, matrix: dump(c), auto: true, forcedVersion: v });
}
// SVG renders in each style for decode checks.
const svgs = [];
for (const style of ['square', 'rounded', 'dots']) for (const text of ['https://example.com/some/longer/path?q=1', 'Café ☕ 🙂']) {
  svgs.push({ style, text, svg: QR.toSVG(QR.encode(text, { ecl: 'M' }), { style, scale: 8 }) });
}
fs.writeFileSync(__dirname + '/cases.json', JSON.stringify({ cases, svgs }));
console.log('cases', cases.length, 'svgs', svgs.length);
