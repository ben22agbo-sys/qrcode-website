"""Build a single-file version of the site with the QR engine inlined.

The site in site/ works as it is (index.html loads qr.js next to it).
Run this only if you want one self-contained file:

    python3 build.py   ->  dist/index.html
"""
from pathlib import Path

root = Path(__file__).parent
html = (root / "site" / "index.html").read_text(encoding="utf-8")
js = (root / "site" / "qr.js").read_text(encoding="utf-8")

# A closing script tag inside the engine would end the inline script early.
assert "</script" not in js, "qr.js must not contain a closing script tag"
tag = '<script src="qr.js"></script>'
assert tag in html, "site/index.html must load qr.js with: " + tag

out = root / "dist" / "index.html"
out.parent.mkdir(exist_ok=True)
out.write_text(html.replace(tag, "<script>\n" + js + "\n</script>"), encoding="utf-8")
print(f"Built {out.relative_to(root)} ({out.stat().st_size // 1024} KB)")
