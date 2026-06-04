#!/usr/bin/env python3
"""Prepend site navigation chrome to copied bien-evaluator report HTML files."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"

CHROME = """<link rel="stylesheet" href="../assets/site.css">
<header class="site-top" role="banner">
  <div class="site-top__inner">
    <a href="../index.html">← Accueil</a>
    <a href="../catalog.html">Catalogue</a>
    <a href="#" data-mailto-cta>Essayer le service</a>
    <span class="sample-note">Rapport exemple · démo</span>
  </div>
</header>
<script src="../assets/mailto.js" defer></script>
"""

BODY_RE = re.compile(r"<body(\s[^>]*)?>", re.IGNORECASE)


def patch(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if 'class="site-top"' in text:
        return
    text = text.replace('lang="en"', 'lang="fr"', 1)

    def repl(match: re.Match[str]) -> str:
        attrs = match.group(1) or ""
        if 'class="' in attrs:
            attrs = re.sub(
                r'class="([^"]*)"',
                lambda m: f'class="report-view {m.group(1).strip()}"',
                attrs,
                count=1,
            )
        else:
            attrs = (attrs + ' class="report-view"').strip()
            if not attrs.startswith(" "):
                attrs = " " + attrs
        return f"<body{attrs}>\n{CHROME}"

    text, n = BODY_RE.subn(repl, text, count=1)
    if n != 1:
        raise SystemExit(f"no <body> in {path}")
    path.write_text(encoding="utf-8", data=text)
    print(f"patched {path.name}")


def main() -> None:
    for html in sorted(REPORTS.glob("*.html")):
        patch(html)


if __name__ == "__main__":
    main()