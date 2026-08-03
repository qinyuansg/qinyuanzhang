#!/usr/bin/env python3
"""Bundle HomeHero into one self-contained HTML file (HomeHero.html).

The output can be shared over WhatsApp/email/USB and opened directly in any
browser — it runs fully offline with no other files needed.

Usage: python3 tools/build_single_file.py
"""

import base64
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent

html = (ROOT / "index.html").read_text(encoding="utf-8")
css = (ROOT / "css/styles.css").read_text(encoding="utf-8")
js = (ROOT / "js/app.js").read_text(encoding="utf-8")
manifest = (ROOT / "manifest.webmanifest").read_text(encoding="utf-8")

manifest_uri = "data:application/manifest+json;base64," + base64.b64encode(
    manifest.encode("utf-8")
).decode("ascii")

html = html.replace(
    '<link rel="manifest" href="manifest.webmanifest" />',
    f'<link rel="manifest" href="{manifest_uri}" />',
)
html = html.replace(
    '<link rel="stylesheet" href="css/styles.css" />',
    "<style>\n" + css + "</style>",
)
html = html.replace(
    '<script src="js/app.js"></script>',
    "<script>\n" + js + "</script>",
)

assert "css/styles.css" not in html and "js/app.js" not in html, "inlining failed"
assert re.search(r"<style>", html) and re.search(r"<script>", html)

out = ROOT / "HomeHero.html"
out.write_text(html, encoding="utf-8")
print(f"Built {out} ({out.stat().st_size:,} bytes)")
