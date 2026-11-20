"""Build the QR Origin website.

Every page lives in src/pages as an HTML file that starts with a JSON block
inside an HTML comment (its title, address and so on), followed by the page's
main content. This script wraps each one in the shared head, header, footer
and scripts, and writes the finished pages into site/, which is what
Cloudflare publishes. It also writes site/sitemap.xml.

    python3 build.py

Placeholders a page can use in its content:
    {{generator}}    the QR code generator
    {{crumbs}}       breadcrumb trail from the page's "breadcrumbs"
    {{types_grid}}   cards for every QR code type page
    {{more_types}}   the same cards, minus the current page
    {{guides_grid}}  cards for every guide
    {{more_guides}}  the same cards, minus the current page
"""
import hashlib
import html
import json
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "src"
SITE = ROOT / "site"
ORIGIN = "https://qrorigin.net"
YEAR = 2026

FRONT = re.compile(r"\A<!--\s*(\{.*?\})\s*-->\s*", re.S)


def read(path):
    return (SRC / path).read_text(encoding="utf-8")


def esc(text):
    return html.escape(str(text), quote=True)


def load_pages():
    pages = []
    for path in sorted((SRC / "pages").rglob("*.html")):
        text = path.read_text(encoding="utf-8")
        m = FRONT.match(text)
        if not m:
            raise SystemExit(f"{path}: missing the JSON block at the top")
        meta = json.loads(m.group(1))
        meta["body"] = text[m.end():]
        meta["src"] = path
        for key in ("out", "url", "kind", "title", "description"):
            if key not in meta:
                raise SystemExit(f"{path}: missing '{key}'")
        pages.append(meta)
    return pages


def asset_version():
    h = hashlib.sha256()
    for name in ("assets/app.css", "assets/app.js", "assets/site.js", "qr.js"):
        h.update((SITE / name).read_bytes())
    return h.hexdigest()[:10]


def card(p, cls):
    return (f'<a class="{cls}" href="{esc(p["url"])}">'
            f'<b>{esc(p["card_title"])}</b><span>{esc(p["card_text"])}</span>'
            f'<span class="go">{"Make one" if cls == "type-card" else "Read the guide"} →</span></a>')


def grid(pages, cls, wrap_cls, skip=None):
    items = [card(p, cls) for p in pages if p is not skip]
    return f'<div class="{wrap_cls}">\n' + "\n".join(items) + "\n</div>"


def crumbs(meta):
    trail = meta.get("breadcrumbs")
    if not trail:
        return ""
    parts = []
    for i, (name, url) in enumerate(trail):
        last = i == len(trail) - 1
        parts.append(f'<li><a href="{esc(url)}"{" aria-current=\"page\"" if last else ""}>{esc(name)}</a></li>')
    return '<nav aria-label="Breadcrumb"><ol class="crumbs">' + "".join(parts) + "</ol></nav>"


def jsonld(meta, url):
    graph = []
    website = {"@id": f"{ORIGIN}/#website"}
    if meta["kind"] == "home":
        graph.append({"@type": "WebSite", "@id": f"{ORIGIN}/#website", "name": "QR Origin",
                      "url": f"{ORIGIN}/", "inLanguage": "en-GB"})
    if meta["kind"] in ("home", "tool"):
        graph.append({
            "@type": "WebApplication",
            "name": meta.get("app_name", "QR Origin"),
            "url": url,
            "description": meta["description"],
            "applicationCategory": "DesignApplication",
            "operatingSystem": "Any (runs in the browser)",
            "browserRequirements": "Requires JavaScript",
            "image": f"{ORIGIN}/og-image.png",
            "offers": {"@type": "Offer", "price": "0", "priceCurrency": "GBP"},
            **({"featureList": meta["features"]} if meta.get("features") else {}),
            "isPartOf": website,
        })
    if meta["kind"] == "guide":
        graph.append({
            "@type": "Article",
            "headline": meta.get("headline", meta["title"]),
            "description": meta["description"],
            "datePublished": meta["published"],
            "dateModified": meta.get("updated", meta["published"]),
            "author": {"@type": "Organization", "name": "QR Origin", "url": f"{ORIGIN}/"},
            "publisher": {"@type": "Organization", "name": "QR Origin", "url": f"{ORIGIN}/",
                          "logo": {"@type": "ImageObject", "url": f"{ORIGIN}/apple-touch-icon.png"}},
            "image": f"{ORIGIN}/og-image.png",
            "mainEntityOfPage": url,
            "inLanguage": "en-GB",
            "isPartOf": website,
        })
    if meta["kind"] == "guides":
        graph.append({"@type": "CollectionPage", "name": meta["title"], "url": url,
                      "description": meta["description"], "isPartOf": website})
    if meta.get("breadcrumbs"):
        graph.append({"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": name, "item": ORIGIN + u}
            for i, (name, u) in enumerate(meta["breadcrumbs"])]})
    if not graph:
        return ""
    data = {"@context": "https://schema.org", "@graph": graph}
    text = json.dumps(data, indent=2, ensure_ascii=False).replace("</", "<\\/")
    return f'<script type="application/ld+json">\n{text}\n</script>'


SIGN_IN = """      <div class="account" id="account">
        <button type="button" class="btn ghost small" id="signin-btn">Sign in</button>
        <div class="account-in" id="account-in" hidden>
          <span class="account-email" id="account-email"></span>
          <button type="button" class="btn ghost small" id="signout-btn">Sign out</button>
        </div>
      </div>"""
MAKE_CTA = '      <a class="btn primary small head-cta" href="/#generator">Make a QR code</a>'


def render(meta, pages, version):
    kind = meta["kind"]
    has_tool = kind in ("home", "tool")
    url = ORIGIN + meta["url"]
    tools = [p for p in pages if p["kind"] == "tool"]
    guides = [p for p in pages if p["kind"] == "guide"]

    head = read("partials/head.html")
    head = (head.replace("{{title}}", esc(meta["title"]))
                .replace("{{description}}", esc(meta["description"]))
                .replace("{{og_title}}", esc(meta.get("og_title", meta["title"])))
                .replace("{{og_type}}", "article" if kind == "guide" else "website")
                .replace("{{canonical}}", esc(url))
                .replace("{{robots}}", '<meta name="robots" content="noindex">\n' if kind == "404" else "")
                .replace("{{jsonld}}", jsonld(meta, url))
                .replace("{{asset_version}}", version))

    header = read("partials/header.html")
    header = (header.replace("{{account}}", SIGN_IN if has_tool else MAKE_CTA)
                    .replace("{{make_href}}", "#generator" if has_tool else "/#generator")
                    .replace("{{mobile_types}}", '      <a href="/#types">QR code types</a>')
                    .replace("{{nav_types}}", "")
                    .replace("{{nav_guides}}", ' aria-current="page"' if kind in ("guide", "guides") else ""))

    footer = read("partials/footer.html")
    footer = (footer.replace("{{footer_types}}", "\n".join(
                  f'        <a href="{esc(p["url"])}">{esc(p["card_title"])}</a>' for p in tools))
                    .replace("{{footer_guides}}", "\n".join(
                  f'        <a href="{esc(p["url"])}">{esc(p["card_title"])}</a>' for p in guides))
                    .replace("{{year}}", str(YEAR)))

    body = meta["body"]
    body = (body.replace("{{generator}}", read("partials/generator.html"))
                .replace("{{crumbs}}", crumbs(meta))
                .replace("{{types_grid}}", grid(tools, "type-card", "types-grid"))
                .replace("{{more_types}}", grid(tools, "type-card", "types-grid", skip=meta))
                .replace("{{guides_grid}}", grid(guides, "guide-card", "guides-grid"))
                .replace("{{more_guides}}", grid(guides, "guide-card", "guides-grid", skip=meta)))
    left = re.findall(r"\{\{[a-z_]+\}\}", body)
    if left:
        raise SystemExit(f"{meta['src']}: unknown placeholders {left}")

    scripts = []
    if has_tool:
        page_cfg = {"tab": meta.get("tab", "link"), "fields": meta.get("fields", {})}
        scripts += [
            read("partials/overlays.html"),
            "<!-- Supabase handles sign-in. Pinned version, loaded before the page script. -->",
            '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js"></script>',
            "<script>window.QRO_PAGE = " + json.dumps(page_cfg, ensure_ascii=False).replace("</", "<\\/") + ";</script>",
            f'<script src="/qr.js?v={version}"></script>',
            f'<script src="/assets/app.js?v={version}"></script>',
        ]
    scripts.append(f'<script src="/assets/site.js?v={version}"></script>')

    return "\n".join([head + header, f'<main id="top">\n{body.strip()}\n</main>\n', footer] + scripts) + "\n</body>\n</html>\n"


def sitemap(pages):
    today = date.today().isoformat()
    rows = []
    for p in sorted(pages, key=lambda p: (p["url"] != "/", p["url"])):
        if p["kind"] == "404":
            continue
        rows.append(f"  <url>\n    <loc>{esc(ORIGIN + p['url'])}</loc>\n"
                    f"    <lastmod>{p.get('updated', p.get('published', today))}</lastmod>\n  </url>")
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + "\n".join(rows) + "\n</urlset>\n")


def main():
    pages = load_pages()
    pages.sort(key=lambda p: (p.get("order", 99), p["url"]))
    version = asset_version()
    for meta in pages:
        out = SITE / meta["out"]
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(render(meta, pages, version), encoding="utf-8")
        print(f"  {meta['url']:<34} -> site/{meta['out']}")
    (SITE / "sitemap.xml").write_text(sitemap(pages), encoding="utf-8")
    print(f"Built {len(pages)} pages and site/sitemap.xml (assets v{version})")


if __name__ == "__main__":
    main()
