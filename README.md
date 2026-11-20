# QR Origin

A free QR code generator. Visitors can make a code for a link, text, Wi-Fi details or an email, style it with colours, patterns and a logo, and download it as SVG or PNG. Codes are made in the visitor's browser, and a free account is needed to download.

Live at [qrorigin.net](https://qrorigin.net).

## What's in here

```
src/
  pages/        one file per page: a JSON block (title, address, etc.) then the content
  partials/     shared head, header, footer, generator and sign-in window
site/           the finished website that Cloudflare publishes (built from src/)
  qr.js         the QR code engine (no dependencies)
  assets/       app.css (styles), app.js (generator and sign-in), site.js (menu, animations)
test/           engine tests against a reference library, plus sample logos
build.py        builds every page in site/ from src/, and writes site/sitemap.xml
```

## Edit or add a page

1. Edit a file in `src/pages`, or copy one to make a new page. Tool pages (like `wifi-qr-code.html`) open the generator on a chosen tab with chosen example values; guides live in `src/pages/guides`.
2. Run `python3 build.py`. It writes the HTML into `site/` and updates the sitemap, footer links and "QR code types" cards everywhere.
3. Commit both `src/` and `site/`, then push.

Styles and scripts are edited directly in `site/assets/` and `site/qr.js`. Rebuild after changing them so pages pick up the new version.

Each page gets its own title, description, canonical link, breadcrumbs and structured data from its JSON block.

## Run it locally

Pages are served without `.html` on the live site (`/wifi-qr-code`). For the same behaviour locally, run `npx wrangler dev`. A plain file server also works if you add `.html` to addresses yourself:

```
cd site
python3 -m http.server 8000
```

## Deploy

The live site runs as a Cloudflare Worker connected to this repo. `wrangler.jsonc` publishes only the `site` folder, serves pages without `.html`, and shows `site/404.html` for unknown addresses. Every push to `main` deploys automatically. There's no build step on Cloudflare, so always run `build.py` before pushing.

## Turn on sign-in

Downloads stay open until sign-in is connected, so the site never locks people out by accident.

1. Create a free project at supabase.com.
2. In the project's API settings, copy the Project URL and the anon public key into `AUTH_CONFIG` in `site/assets/app.js`. The anon key is designed to be public.
3. In the authentication settings, set the Site URL to your live address and add it to the allowed redirect URLs.
4. For Google sign-in, turn on the Google provider. This needs an OAuth client from Google Cloud.
5. Before launch, connect your own email sender (for example Resend). Supabase's built-in sender is limited and meant for testing.
6. Paste `email/sign-in.html` into Supabase under Authentication > Email Templates, in both **Magic Link** and **Confirm signup**, with the subject `{{ .Token }} is your QR Origin code` (code first, so it shows in phone notifications). It shows a sign-in code (`{{ .Token }}`) and a backup link (`{{ .ConfirmationURL }}`). The code is what keeps people signed in on the device where they made their QR code.

## The engine

`site/qr.js` follows ISO/IEC 18004 (QR Code Model 2):

- versions 1 to 40 and error correction levels L, M, Q and H
- numeric, alphanumeric and UTF-8 byte modes, picked automatically
- automatic version and mask selection
- SVG and canvas output with square, rounded and dot patterns
- logos up to 25% of the code width (use error correction H)

```js
const code = QR.encode('https://example.com', { ecl: 'M' });
const svg = QR.toSVG(code, { style: 'dots', foreground: '#1b1b1b' });
```

### Limits that came from testing

- **Logos:** up to 25% of the code width with error correction H. At 28%, small codes started failing to scan.
- **Colours:** pairs below a 3:1 contrast ratio are blocked in the page.

## Tests

The engine tests check every generated code against the Python `qrcode` library, module for module, and scan each one with the ZXing decoder.

```
pip install -r test/requirements.txt
node test/gen.js
python3 test/check.py
```

The last line should report `matrix_mismatch=0 decode_fail=0`.

## Before launch

- Add a privacy policy. The site stores email addresses for accounts, which falls under UK GDPR.
- Check the name is free to use.
- Scan downloaded codes with a few different phones.
