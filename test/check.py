import json, qrcode, zxingcpp, io, cairosvg
from qrcode.constants import ERROR_CORRECT_L, ERROR_CORRECT_M, ERROR_CORRECT_Q, ERROR_CORRECT_H
from PIL import Image
E = dict(L=ERROR_CORRECT_L, M=ERROR_CORRECT_M, Q=ERROR_CORRECT_Q, H=ERROR_CORRECT_H)
data = json.load(open(__import__('os').path.join(__import__('os').path.dirname(__file__), 'cases.json')))
mismatch = decode_fail = ok = errs = automask_same = automask_total = version_diff = 0

def ref(text, ecl, version, mask):
    q = qrcode.QRCode(version=version, error_correction=E[ecl], mask_pattern=mask, border=0)
    q.add_data(text, optimize=0); q.make(fit=False)
    return '\n'.join(''.join('1' if b else '0' for b in row) for row in q.modules)

def decode(matrix):
    rows = matrix.split('\n'); n = len(rows); s = 6; b = 4
    img = Image.new('L', ((n + 2*b)*s,)*2, 255)
    px = img.load()
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c == '1':
                for dy in range(s):
                    for dx in range(s): px[(x+b)*s+dx, (y+b)*s+dy] = 0
    res = zxingcpp.read_barcodes(img, formats=zxingcpp.BarcodeFormat.QRCode)
    return res[0].text if res else None

for c in data['cases']:
    if 'error' in c:
        errs += 1
        # Confirm the reference also cannot fit it.
        q = qrcode.QRCode(error_correction=E[c['ecl']]); q.add_data(c['text'], optimize=0)
        try: q.make(fit=True); print('ENGINE REJECTED BUT REF FITS', c['ecl'], len(c['text'])); mismatch += 1
        except Exception: pass
        continue
    r = ref(c['text'], c['ecl'], c['version'], c['mask'])
    if r != c['matrix']:
        mismatch += 1; print('MISMATCH', c['ecl'], c['version'], c['mask'], repr(c['text'][:40]))
    # Smallest-version check against reference auto fit.
    if c['auto'] and 'forcedVersion' not in c:
        q = qrcode.QRCode(error_correction=E[c['ecl']], border=0); q.add_data(c['text'], optimize=0); q.make(fit=True)
        if q.version != c['version']: version_diff += 1; print('VERSION DIFF', q.version, c['version'])
        automask_total += 1
        automask_same += (q.mask_pattern if q.mask_pattern is not None else q.best_mask_pattern()) == c['mask']
        d = decode(c['matrix'])
        if d != c['text']: decode_fail += 1; print('DECODE FAIL', c['ecl'], c['version'], repr(c['text'][:40]), repr((d or '')[:40]))
    ok += 1

svg_fail = 0
for s in data['svgs']:
    png = cairosvg.svg2png(bytestring=s['svg'].encode())
    img = Image.open(io.BytesIO(png)).convert('L')
    res = zxingcpp.read_barcodes(img)
    got = res[0].text if res else None
    print('SVG', s['style'], 'OK' if got == s['text'] else 'FAIL ' + repr(got))
    svg_fail += got != s['text']

print(f'\nchecked={ok} matrix_mismatch={mismatch} decode_fail={decode_fail} too_long={errs} version_diff={version_diff} svg_fail={svg_fail}')
print(f'auto mask agrees with python-qrcode: {automask_same}/{automask_total}')
