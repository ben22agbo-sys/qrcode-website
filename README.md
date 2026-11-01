# QR Origin

A free QR code generator. Visitors can make a code for a link, text, Wi-Fi details or an email, style it with colours, patterns and a logo, and download it as SVG or PNG. Codes are made in the visitor's browser, and a free account is needed to download.

Live at [qrorigin.net](https://qrorigin.net).

## What's in here

```
site/
  index.html   the landing page and generator
  qr.js        the QR code engine (no dependencies)
test/
  gen.js       makes test codes with the engine
  check.py     compares them with a reference library and scans each one
  logos/       sample logos used when testing logo sizes
build.py       optional: builds one self-contained file in dist/
```

## Run it locally

The page loads `qr.js` from the same folder, so serve the `site` folder rather than opening the file directly:

```
cd site
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploy

The `site` folder is the whole website and needs no build step.

The live site runs as a Cloudflare Worker connected to this repo. `wrangler.jsonc` tells Cloudflare to publish only the `site` folder, and every push to `main` deploys automatically.

On Netlify or Vercel instead, set the output (publish) directory to `site` and leave the build command empty.

## Turn on sign-in

Downloads stay open until sign-in is connected, so the site never locks people out by accident.

1. Create a free project at supabase.com.
2. In the project's API settings, copy the Project URL and the anon public key into `AUTH_CONFIG` near the bottom of `site/index.html`. The anon key is designed to be public.
3. In the authentication settings, set the Site URL to your live address and add it to the allowed redirect URLs.
4. For Google sign-in, turn on the Google provider. This needs an OAuth client from Google Cloud.
5. Before launch, connect your own email sender (for example Resend). Supabase's built-in sender is limited and meant for testing.
6. Paste `email/sign-in.html` into Supabase under Authentication > Email Templates, in both **Magic Link** and **Confirm signup**, with the subject `Your QR Origin sign-in code`. It shows a sign-in code (`{{ .Token }}`) and a backup link (`{{ .ConfirmationURL }}`). The code is what keeps people signed in on the device where they made their QR code.

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
