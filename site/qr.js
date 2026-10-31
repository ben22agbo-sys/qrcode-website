/*!
 * qr.js - a dependency-free QR code engine (ISO/IEC 18004, Model 2)
 *
 * Supports versions 1 to 40, error correction levels L/M/Q/H,
 * numeric, alphanumeric and byte (UTF-8) modes, automatic version
 * and mask selection, and rendering to SVG or <canvas>.
 *
 * Usage (browser):   load qr.js with a script tag  ->  window.QR
 * Usage (Node):      const QR = require('./qr.js')
 *
 *   const code = QR.encode('https://example.com', { ecl: 'M' });
 *   code.size, code.version, code.mask, code.isDark(x, y)
 *   const svg = QR.toSVG(code, { scale: 10, margin: 4, style: 'square' });
 *   QR.toCanvas(code, canvasElement, { scale: 10 });
 *
 * Logos: encode with { ecl: 'H' }, then pass a logo when rendering.
 *   toSVG(code, { logo: { src: dataUrl, size: 0.2 } })
 *   toCanvas(code, canvas, { logo: { image: await QR.loadImage(dataUrl), size: 0.2 } })
 * Size is capped at QR.MAX_LOGO_SIZE (0.25), the largest size that scanned in testing.
 *
 * License: MIT
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QR = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Constants                                                           */
  /* ------------------------------------------------------------------ */

  // Error correction levels. `ord` indexes the tables below; `bits` is the
  // 2-bit value written into the format information.
  const ECL = {
    L: { name: 'L', ord: 0, bits: 1 },
    M: { name: 'M', ord: 1, bits: 0 },
    Q: { name: 'Q', ord: 2, bits: 3 },
    H: { name: 'H', ord: 3, bits: 2 },
  };

  // Error correction codewords per block, indexed [ecl][version].
  const ECC_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  ];

  // Number of error correction blocks, indexed [ecl][version].
  const NUM_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  ];

  // Encoding modes: 4-bit indicator and character-count field widths for
  // versions 1-9, 10-26 and 27-40.
  const MODE = {
    numeric:      { name: 'numeric',      indicator: 0x1, countBits: [10, 12, 14] },
    alphanumeric: { name: 'alphanumeric', indicator: 0x2, countBits: [9, 11, 13] },
    byte:         { name: 'byte',         indicator: 0x4, countBits: [8, 16, 16] },
  };

  const ALNUM_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
  const NUMERIC_RE = /^[0-9]*$/;
  const ALNUM_RE = /^[0-9A-Z $%*+\-./:]*$/;

  const MIN_VERSION = 1;
  const MAX_VERSION = 40;

  // Mask penalty weights from the standard.
  const PENALTY_N1 = 3, PENALTY_N2 = 3, PENALTY_N3 = 40, PENALTY_N4 = 10;

  /* ------------------------------------------------------------------ */
  /* Bit buffer                                                          */
  /* ------------------------------------------------------------------ */

  class BitBuffer {
    constructor() { this.bits = []; }
    get length() { return this.bits.length; }
    append(value, len) {
      if (len < 0 || len > 31 || value >>> len !== 0) throw new RangeError('Value out of range');
      for (let i = len - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
    }
    toBytes() {
      const out = new Uint8Array(Math.ceil(this.bits.length / 8));
      this.bits.forEach((b, i) => { out[i >>> 3] |= b << (7 - (i & 7)); });
      return out;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Data segments                                                       */
  /* ------------------------------------------------------------------ */

  function countBitsFor(mode, version) {
    return mode.countBits[version <= 9 ? 0 : version <= 26 ? 1 : 2];
  }

  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    // Fallback for very old environments.
    const s = unescape(encodeURIComponent(str));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function makeSegment(data, forcedMode) {
    const isBytes = data instanceof Uint8Array;
    let mode = forcedMode && forcedMode !== 'auto' ? MODE[forcedMode] : null;
    if (forcedMode && forcedMode !== 'auto' && !mode) throw new Error('Unknown mode: ' + forcedMode);

    if (!mode) {
      if (isBytes) mode = MODE.byte;
      else if (NUMERIC_RE.test(data)) mode = MODE.numeric;
      else if (ALNUM_RE.test(data)) mode = MODE.alphanumeric;
      else mode = MODE.byte;
    }

    const bb = new BitBuffer();
    let numChars;

    if (mode === MODE.numeric) {
      if (isBytes || !NUMERIC_RE.test(data)) throw new Error('Numeric mode needs digits only');
      numChars = data.length;
      for (let i = 0; i < data.length; i += 3) {
        const chunk = data.substr(i, 3);
        bb.append(parseInt(chunk, 10), chunk.length * 3 + 1); // 10, 7 or 4 bits
      }
    } else if (mode === MODE.alphanumeric) {
      if (isBytes || !ALNUM_RE.test(data)) throw new Error('Alphanumeric mode supports 0-9, A-Z, space and $%*+-./: only');
      numChars = data.length;
      let i = 0;
      for (; i + 2 <= data.length; i += 2) {
        bb.append(ALNUM_CHARSET.indexOf(data[i]) * 45 + ALNUM_CHARSET.indexOf(data[i + 1]), 11);
      }
      if (i < data.length) bb.append(ALNUM_CHARSET.indexOf(data[i]), 6);
    } else {
      const bytes = isBytes ? data : utf8(data);
      numChars = bytes.length;
      for (const b of bytes) bb.append(b, 8);
    }

    return { mode, numChars, bits: bb.bits };
  }

  function segmentBitLength(seg, version) {
    const ccbits = countBitsFor(seg.mode, version);
    if (seg.numChars >= 1 << ccbits) return Infinity;
    return 4 + ccbits + seg.bits.length;
  }

  /* ------------------------------------------------------------------ */
  /* Capacity helpers                                                    */
  /* ------------------------------------------------------------------ */

  // Modules available for data + ECC (excludes function patterns and
  // format/version info), including remainder bits.
  function numRawDataModules(ver) {
    let result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }

  function numDataCodewords(ver, ecl) {
    return Math.floor(numRawDataModules(ver) / 8) -
      ECC_PER_BLOCK[ecl.ord][ver] * NUM_BLOCKS[ecl.ord][ver];
  }

  function alignmentPositions(ver) {
    if (ver === 1) return [];
    const size = ver * 4 + 17;
    const numAlign = Math.floor(ver / 7) + 2;
    const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const result = [6];
    for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  /* ------------------------------------------------------------------ */
  /* Reed-Solomon over GF(256), primitive polynomial 0x11D               */
  /* ------------------------------------------------------------------ */

  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  (function initGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11D;
    }
    for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
  })();

  function gfMul(a, b) {
    return a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  const divisorCache = {};
  // Generator polynomial (x - a^0)(x - a^1)...(x - a^(degree-1)), stored
  // high-to-low without the leading 1 term.
  function rsDivisor(degree) {
    if (divisorCache[degree]) return divisorCache[degree];
    const result = new Uint8Array(degree);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < degree; j++) {
        result[j] = gfMul(result[j], root);
        if (j + 1 < degree) result[j] ^= result[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    divisorCache[degree] = result;
    return result;
  }

  function rsRemainder(data, divisor) {
    const result = new Uint8Array(divisor.length);
    for (const b of data) {
      const factor = b ^ result[0];
      result.copyWithin(0, 1);
      result[result.length - 1] = 0;
      for (let i = 0; i < divisor.length; i++) result[i] ^= gfMul(divisor[i], factor);
    }
    return result;
  }

  // Split data into blocks, add ECC to each, and interleave.
  function addEccAndInterleave(data, ver, ecl) {
    const numBlocks = NUM_BLOCKS[ecl.ord][ver];
    const eccLen = ECC_PER_BLOCK[ecl.ord][ver];
    const rawCodewords = Math.floor(numRawDataModules(ver) / 8);
    const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
    const shortBlockLen = Math.floor(rawCodewords / numBlocks);
    const shortDataLen = shortBlockLen - eccLen;

    const divisor = rsDivisor(eccLen);
    const blocks = [];
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const len = shortDataLen + (i < numShortBlocks ? 0 : 1);
      const dat = Array.from(data.slice(k, k + len));
      k += len;
      const ecc = rsRemainder(dat, divisor);
      if (i < numShortBlocks) dat.push(0); // placeholder so all blocks align
      blocks.push(dat.concat(Array.from(ecc)));
    }

    const result = [];
    for (let i = 0; i < blocks[0].length; i++) {
      for (let j = 0; j < blocks.length; j++) {
        // Skip the placeholder byte in short blocks.
        if (i !== shortDataLen || j >= numShortBlocks) result.push(blocks[j][i]);
      }
    }
    return result;
  }

  /* ------------------------------------------------------------------ */
  /* Matrix construction                                                 */
  /* ------------------------------------------------------------------ */

  class Matrix {
    constructor(ver) {
      this.size = ver * 4 + 17;
      this.dark = new Uint8Array(this.size * this.size);
      this.reserved = new Uint8Array(this.size * this.size);
    }
    get(x, y) { return this.dark[y * this.size + x] === 1; }
    setFunction(x, y, isDark) {
      const i = y * this.size + x;
      this.dark[i] = isDark ? 1 : 0;
      this.reserved[i] = 1;
    }
    isFunction(x, y) { return this.reserved[y * this.size + x] === 1; }
  }

  function drawFinder(m, cx, cy) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= m.size || y >= m.size) continue;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        m.setFunction(x, y, dist !== 2 && dist !== 4); // dist 4 is the separator
      }
    }
  }

  function drawAlignment(m, cx, cy) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        m.setFunction(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  function formatBits(ecl, mask) {
    const data = (ecl.bits << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((data << 10) | rem) ^ 0x5412;
  }

  function drawFormat(m, ecl, mask) {
    const bits = formatBits(ecl, mask);
    const bit = (i) => ((bits >>> i) & 1) === 1;
    const s = m.size;
    // Copy 1, around the top-left finder.
    for (let i = 0; i <= 5; i++) m.setFunction(8, i, bit(i));
    m.setFunction(8, 7, bit(6));
    m.setFunction(8, 8, bit(7));
    m.setFunction(7, 8, bit(8));
    for (let i = 9; i < 15; i++) m.setFunction(14 - i, 8, bit(i));
    // Copy 2, split between the top-right and bottom-left finders.
    for (let i = 0; i < 8; i++) m.setFunction(s - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) m.setFunction(8, s - 15 + i, bit(i));
    m.setFunction(8, s - 8, true); // the "dark module", always dark
  }

  function drawVersion(m, ver) {
    if (ver < 7) return;
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    const bits = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const b = ((bits >>> i) & 1) === 1;
      const a = m.size - 11 + (i % 3);
      const c = Math.floor(i / 3);
      m.setFunction(a, c, b);
      m.setFunction(c, a, b);
    }
  }

  function drawFunctionPatterns(m, ver, ecl) {
    const s = m.size;
    // Timing patterns.
    for (let i = 0; i < s; i++) {
      m.setFunction(6, i, i % 2 === 0);
      m.setFunction(i, 6, i % 2 === 0);
    }
    // Finder patterns (drawn after timing so they overwrite it).
    drawFinder(m, 3, 3);
    drawFinder(m, s - 4, 3);
    drawFinder(m, 3, s - 4);
    // Alignment patterns, skipping the three that would hit finders.
    const pos = alignmentPositions(ver);
    const n = pos.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        drawAlignment(m, pos[i], pos[j]);
      }
    }
    // Reserve format area (real values drawn after mask choice) and version info.
    drawFormat(m, ecl, 0);
    drawVersion(m, ver);
  }

  // Place codeword bits in the two-column zigzag, from bottom-right.
  function drawCodewords(m, codewords) {
    const s = m.size;
    const totalBits = codewords.length * 8;
    let i = 0;
    for (let right = s - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // skip the vertical timing column
      for (let vert = 0; vert < s; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? s - 1 - vert : vert;
          if (!m.isFunction(x, y) && i < totalBits) {
            m.dark[y * s + x] = (codewords[i >>> 3] >>> (7 - (i & 7))) & 1;
            i++;
          }
          // Remaining "remainder bits" stay light (0).
        }
      }
    }
  }

  const MASKS = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x, y) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];

  // XOR is its own inverse, so calling this twice undoes it.
  function applyMask(m, mask) {
    const fn = MASKS[mask];
    const s = m.size;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        if (!m.isFunction(x, y) && fn(x, y)) m.dark[y * s + x] ^= 1;
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Mask penalty scoring                                                */
  /* ------------------------------------------------------------------ */

  // Finder-like pattern: dark-light-dark-dark-dark-light-dark with 4 light
  // modules on one side. Out-of-bounds counts as light (the quiet zone).
  const FINDER_A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const FINDER_B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];

  function penaltyLine(get, s) {
    let score = 0;
    // Rule 1: runs of 5+ same-colour modules.
    let runColor = -1, runLen = 0;
    for (let i = 0; i < s; i++) {
      const c = get(i);
      if (c === runColor) {
        runLen++;
        if (runLen === 5) score += PENALTY_N1;
        else if (runLen > 5) score += 1;
      } else {
        runColor = c;
        runLen = 1;
      }
    }
    // Rule 3: finder-like patterns.
    for (let i = -4; i < s; i++) {
      let matchA = true, matchB = true;
      for (let k = 0; k < 11; k++) {
        const p = i + k;
        const c = p < 0 || p >= s ? 0 : get(p);
        if (c !== FINDER_A[k]) matchA = false;
        if (c !== FINDER_B[k]) matchB = false;
        if (!matchA && !matchB) break;
      }
      // Only count windows whose dark core lies fully inside the symbol.
      if (matchA && i >= 0 && i + 6 < s) score += PENALTY_N3;
      if (matchB && i + 4 >= 0 && i + 10 < s) score += PENALTY_N3;
    }
    return score;
  }

  function penaltyScore(m) {
    const s = m.size;
    const d = m.dark;
    let score = 0;
    for (let y = 0; y < s; y++) score += penaltyLine((x) => d[y * s + x], s);
    for (let x = 0; x < s; x++) score += penaltyLine((y) => d[y * s + x], s);
    // Rule 2: 2x2 blocks of one colour.
    for (let y = 0; y < s - 1; y++) {
      for (let x = 0; x < s - 1; x++) {
        const c = d[y * s + x];
        if (c === d[y * s + x + 1] && c === d[(y + 1) * s + x] && c === d[(y + 1) * s + x + 1]) {
          score += PENALTY_N2;
        }
      }
    }
    // Rule 4: dark/light balance, 10 points per 5% away from 50%.
    let dark = 0;
    for (let i = 0; i < d.length; i++) dark += d[i];
    const total = s * s;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    score += Math.max(0, k) * PENALTY_N4;
    return score;
  }

  /* ------------------------------------------------------------------ */
  /* Public: encode                                                      */
  /* ------------------------------------------------------------------ */

  /**
   * Encode text (string) or binary data (Uint8Array) into a QR code.
   *
   * options:
   *   ecl         'L' | 'M' | 'Q' | 'H'    error correction level (default 'M')
   *   minVersion  1-40                      smallest version to try (default 1)
   *   maxVersion  1-40                      largest version to try (default 40)
   *   mask        0-7, or -1 for auto       (default -1)
   *   mode        'auto' | 'numeric' | 'alphanumeric' | 'byte' (default 'auto')
   *   boostEcl    true to raise the ECC level when it fits the same version
   */
  function encode(data, options) {
    const opts = Object.assign({
      ecl: 'M', minVersion: MIN_VERSION, maxVersion: MAX_VERSION,
      mask: -1, mode: 'auto', boostEcl: false,
    }, options || {});

    if (typeof data !== 'string' && !(data instanceof Uint8Array)) {
      throw new TypeError('Data must be a string or Uint8Array');
    }
    let ecl = ECL[String(opts.ecl).toUpperCase()];
    if (!ecl) throw new Error('Error correction level must be L, M, Q or H');
    const minV = opts.minVersion | 0, maxV = opts.maxVersion | 0;
    if (minV < MIN_VERSION || maxV > MAX_VERSION || minV > maxV) throw new RangeError('Invalid version range');
    if (opts.mask < -1 || opts.mask > 7) throw new RangeError('Mask must be -1 (auto) or 0-7');

    const seg = makeSegment(data, opts.mode);

    // Find the smallest version that fits.
    let version, usedBits;
    for (version = minV; ; version++) {
      usedBits = segmentBitLength(seg, version);
      if (usedBits <= numDataCodewords(version, ecl) * 8) break;
      if (version >= maxV) {
        const err = new RangeError('Data too long for a QR code at this error correction level');
        err.code = 'DATA_TOO_LONG';
        throw err;
      }
    }

    // Optionally upgrade the ECC level for free.
    if (opts.boostEcl) {
      for (const next of [ECL.M, ECL.Q, ECL.H]) {
        if (next.ord > ecl.ord && usedBits <= numDataCodewords(version, next) * 8) ecl = next;
      }
    }

    // Build the data bitstream.
    const capacityBits = numDataCodewords(version, ecl) * 8;
    const bb = new BitBuffer();
    bb.append(seg.mode.indicator, 4);
    bb.append(seg.numChars, countBitsFor(seg.mode, version));
    for (const b of seg.bits) bb.bits.push(b);
    bb.append(0, Math.min(4, capacityBits - bb.length)); // terminator
    bb.append(0, (8 - (bb.length % 8)) % 8);             // byte align
    for (let pad = 0xEC; bb.length < capacityBits; pad ^= 0xEC ^ 0x11) bb.append(pad, 8);

    const codewords = addEccAndInterleave(bb.toBytes(), version, ecl);

    // Build the matrix.
    const m = new Matrix(version);
    drawFunctionPatterns(m, version, ecl);
    drawCodewords(m, codewords);

    let mask = opts.mask;
    if (mask === -1) {
      let best = Infinity;
      for (let i = 0; i < 8; i++) {
        applyMask(m, i);
        drawFormat(m, ecl, i);
        const p = penaltyScore(m);
        if (p < best) { best = p; mask = i; }
        applyMask(m, i); // undo
      }
    }
    applyMask(m, mask);
    drawFormat(m, ecl, mask);

    return createResult(m, version, ecl, mask, seg.mode);
  }

  function createResult(m, version, ecl, mask, mode) {
    const size = m.size;
    const dark = m.dark;
    const reserved = m.reserved;
    return {
      version,
      size,
      ecl: ecl.name,
      mask,
      mode: mode.name,
      /** true if the module at column x, row y is dark. Out of range = light. */
      isDark(x, y) {
        return x >= 0 && y >= 0 && x < size && y < size && dark[y * size + x] === 1;
      },
      /** true if the module belongs to a fixed pattern (finder, timing, etc.). */
      isFunction(x, y) {
        return x >= 0 && y >= 0 && x < size && y < size && reserved[y * size + x] === 1;
      },
      /** Rows of booleans, handy for custom renderers. */
      toArray() {
        const rows = [];
        for (let y = 0; y < size; y++) {
          const row = [];
          for (let x = 0; x < size; x++) row.push(dark[y * size + x] === 1);
          rows.push(row);
        }
        return rows;
      },
    };
  }

  /* ------------------------------------------------------------------ */
  /* Rendering                                                           */
  /* ------------------------------------------------------------------ */

  const RENDER_DEFAULTS = {
    scale: 10,          // pixels per module
    margin: 4,          // quiet zone in modules (the standard asks for 4)
    foreground: '#000000',
    background: '#ffffff', // use 'transparent' for none
    style: 'square',    // 'square' | 'rounded' | 'dots'
    eyeStyle: null,     // 'square' | 'rounded' | 'circle'; defaults to match style
    logo: null,         // see LOGO_DEFAULTS; needs ecl 'H' to stay scannable
  };

  const LOGO_DEFAULTS = {
    src: null,      // image URL or data URL, used by toSVG
    image: null,    // loaded image (HTMLImageElement, ImageBitmap...), used by toCanvas
    size: 0.2,      // logo width as a fraction of the code width (quiet zone excluded)
    padding: 1,     // clear space around the logo, in modules
    shape: 'square', // shape of the cleared area: 'square' | 'circle'
  };

  /** Largest tested-safe logo size at level H. At 0.28 small codes start failing to scan. */
  const MAX_LOGO_SIZE = 0.25;

  // Works out the logo box and which modules to leave out underneath it.
  function logoLayout(code, o) {
    if (!o.logo || (!o.logo.src && !o.logo.image)) return null;
    const l = Object.assign({}, LOGO_DEFAULTS, o.logo);
    const size = Math.min(Math.max(+l.size || 0, 0), MAX_LOGO_SIZE);
    if (!size) return null;
    const side = code.size * size;            // logo side in modules
    const centre = code.size / 2;
    const half = side / 2 + Math.max(0, +l.padding || 0); // cleared half-width
    const hidden = (x, y) => {
      if (inFinder(code, x, y)) return false; // never clear the corner eyes
      const dx = x + 0.5 - centre, dy = y + 0.5 - centre;
      return l.shape === 'circle'
        ? dx * dx + dy * dy <= half * half
        : Math.abs(dx) <= half && Math.abs(dy) <= half;
    };
    const pos = centre - side / 2 + o.margin; // logo top-left, in drawing units
    return { l, side, pos, hidden };
  }

  /** Share of dark-or-light data modules covered by the logo (0 to 1). Useful for warnings. */
  function logoCoverage(code, options) {
    const o = resolveOptions(options);
    const layout = logoLayout(code, o);
    if (!layout) return 0;
    let covered = 0, total = 0;
    for (let y = 0; y < code.size; y++) {
      for (let x = 0; x < code.size; x++) {
        if (code.isFunction(x, y)) continue;
        total++;
        if (layout.hidden(x, y)) covered++;
      }
    }
    return covered / total;
  }

  function inFinder(code, x, y) {
    const s = code.size;
    return (x < 7 && y < 7) || (x >= s - 7 && y < 7) || (x < 7 && y >= s - 7);
  }

  function finderOrigins(code) {
    const s = code.size;
    return [[0, 0], [s - 7, 0], [0, s - 7]];
  }

  function resolveOptions(options) {
    const o = Object.assign({}, RENDER_DEFAULTS, options || {});
    if (!o.eyeStyle) o.eyeStyle = o.style === 'dots' ? 'circle' : o.style === 'rounded' ? 'rounded' : 'square';
    return o;
  }

  function fmt(n) { return Math.round(n * 1000) / 1000; }

  // Rounded rectangle path in module units.
  function roundRectPath(x, y, w, h, r) {
    if (r <= 0) return `M${x} ${y}h${w}v${h}h${-w}z`;
    return `M${fmt(x + r)} ${y}h${fmt(w - 2 * r)}a${r} ${r} 0 0 1 ${r} ${r}v${fmt(h - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${r}` +
      `h${fmt(-(w - 2 * r))}a${r} ${r} 0 0 1 ${-r} ${-r}v${fmt(-(h - 2 * r))}a${r} ${r} 0 0 1 ${r} ${-r}z`;
  }

  function circlePath(cx, cy, r) {
    return `M${fmt(cx - r)} ${fmt(cy)}a${r} ${r} 0 1 0 ${fmt(2 * r)} 0a${r} ${r} 0 1 0 ${fmt(-2 * r)} 0z`;
  }

  // Each eye is an outer 7x7 ring (drawn with even-odd fill) plus a 3x3 centre.
  function eyePaths(code, o) {
    let d = '';
    for (const [ex, ey] of finderOrigins(code)) {
      const x = ex + o.margin, y = ey + o.margin;
      if (o.eyeStyle === 'circle') {
        d += circlePath(x + 3.5, y + 3.5, 3.5) + circlePath(x + 3.5, y + 3.5, 2.5) + circlePath(x + 3.5, y + 3.5, 1.5);
      } else {
        const r1 = o.eyeStyle === 'rounded' ? 1.6 : 0;
        const r2 = o.eyeStyle === 'rounded' ? 1 : 0;
        const r3 = o.eyeStyle === 'rounded' ? 0.8 : 0;
        d += roundRectPath(x, y, 7, 7, r1) + roundRectPath(x + 1, y + 1, 5, 5, r2) + roundRectPath(x + 2, y + 2, 3, 3, r3);
      }
    }
    return d;
  }

  function modulePaths(code, o, layout) {
    let d = '';
    for (let y = 0; y < code.size; y++) {
      for (let x = 0; x < code.size; x++) {
        if (!code.isDark(x, y) || inFinder(code, x, y)) continue;
        if (layout && layout.hidden(x, y)) continue;
        const px = x + o.margin, py = y + o.margin;
        if (o.style === 'dots') d += circlePath(px + 0.5, py + 0.5, 0.45);
        else if (o.style === 'rounded') d += roundRectPath(px, py, 1, 1, 0.35);
        else d += `M${px} ${py}h1v1h-1z`;
      }
    }
    return d;
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  /** Render to an SVG string. Coordinates are in modules; width/height use `scale`. */
  function toSVG(code, options) {
    const o = resolveOptions(options);
    const dim = code.size + o.margin * 2;
    const px = dim * o.scale;
    const bg = o.background && o.background !== 'transparent'
      ? `<rect width="${dim}" height="${dim}" fill="${escapeAttr(o.background)}"/>` : '';
    const fg = escapeAttr(o.foreground);
    const layout = logoLayout(code, o);
    let logo = '';
    if (layout && layout.l.src) {
      const href = escapeAttr(layout.l.src);
      logo = `<image x="${fmt(layout.pos)}" y="${fmt(layout.pos)}" width="${fmt(layout.side)}" height="${fmt(layout.side)}" ` +
        `preserveAspectRatio="xMidYMid meet" href="${href}" xlink:href="${href}"/>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${dim} ${dim}" width="${px}" height="${px}" shape-rendering="${o.style === 'square' ? 'crispEdges' : 'geometricPrecision'}">` +
      bg +
      `<path fill="${fg}" d="${modulePaths(code, o, layout)}"/>` +
      `<path fill="${fg}" fill-rule="evenodd" d="${eyePaths(code, o)}"/>` +
      logo +
      `</svg>`;
  }

  /** Draw onto a <canvas> (or OffscreenCanvas). Resizes the canvas to fit. */
  function toCanvas(code, canvas, options) {
    const o = resolveOptions(options);
    const dim = code.size + o.margin * 2;
    canvas.width = canvas.height = dim * o.scale;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(o.scale, o.scale);
    ctx.clearRect(0, 0, dim, dim);
    if (o.background && o.background !== 'transparent') {
      ctx.fillStyle = o.background;
      ctx.fillRect(0, 0, dim, dim);
    }
    ctx.fillStyle = o.foreground;
    const layout = logoLayout(code, o);
    if (typeof Path2D !== 'undefined') {
      ctx.fill(new Path2D(modulePaths(code, o, layout)));
      ctx.fill(new Path2D(eyePaths(code, o)), 'evenodd');
    } else {
      // Path2D-less fallback: plain squares.
      for (let y = 0; y < code.size; y++) {
        for (let x = 0; x < code.size; x++) {
          if (code.isDark(x, y) && !(layout && layout.hidden(x, y))) ctx.fillRect(x + o.margin, y + o.margin, 1, 1);
        }
      }
    }
    if (layout && layout.l.image) {
      // Fit the image inside the logo box, keeping its proportions.
      const img = layout.l.image;
      // SVGs without a set size report 0, so treat them as square.
      const w = img.naturalWidth || img.width || 1, h = img.naturalHeight || img.height || 1;
      const k = layout.side / Math.max(w, h);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, layout.pos + (layout.side - w * k) / 2, layout.pos + (layout.side - h * k) / 2, w * k, h * k);
    }
    ctx.restore();
    return canvas;
  }

  /** Browser helper: load an image so it can be passed as logo.image. */
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load image'));
      img.src = src;
    });
  }

  /** Browser helper: PNG data URL. */
  function toDataURL(code, options) {
    if (typeof document === 'undefined') throw new Error('toDataURL needs a browser; use toSVG in Node');
    return toCanvas(code, document.createElement('canvas'), options).toDataURL('image/png');
  }

  /** Largest number of characters that fit, for showing limits in a UI. */
  function capacity(version, ecl, mode) {
    const e = ECL[String(ecl || 'M').toUpperCase()];
    const m = MODE[mode || 'byte'];
    const bits = numDataCodewords(version, e) * 8 - 4 - countBitsFor(m, version);
    if (m === MODE.numeric) return Math.floor(bits / 10) * 3 + (bits % 10 >= 7 ? 2 : bits % 10 >= 4 ? 1 : 0);
    if (m === MODE.alphanumeric) return Math.floor(bits / 11) * 2 + (bits % 11 >= 6 ? 1 : 0);
    return Math.floor(bits / 8);
  }

  return {
    encode, toSVG, toCanvas, toDataURL, capacity,
    loadImage, logoCoverage, MAX_LOGO_SIZE, version: '1.1.0',
  };
});
