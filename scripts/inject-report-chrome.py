#!/usr/bin/env python3
"""Add immo-evals navigation chrome to copied report HTML files."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"

CHROME_STATIC = """<link rel="stylesheet" href="../assets/site.css">
<header class="site-top" role="banner">
  <div class="site-top__inner">
    <a href="../index.html">← Accueil</a>
    <a href="../catalog.html">Catalogue</a>
    <a href="#" data-mailto-cta>Essayer le service</a>
    <span class="sample-note">Rapport réel · bien-evaluator</span>
  </div>
</header>
<script src="../assets/mailto.js" defer></script>
"""

CHROME_TEMPLATE = """<link rel="stylesheet" href="../assets/site.css">
<div class="immo-evals-bar no-print" role="navigation" aria-label="immo-evals">
  <div class="immo-evals-bar__inner">
    <a href="../index.html">← Accueil</a>
    <a href="../catalog.html">Catalogue</a>
    <a href="#" data-mailto-cta>Essayer le service</a>
    <span class="immo-evals-bar__note">Rapport réel · bien-evaluator</span>
  </div>
</div>
<script src="../assets/mailto.js" defer></script>
"""

BODY_RE = re.compile(r"<body(\s[^>]*)?>", re.IGNORECASE)


def patch(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if "immo-evals-bar" in text or 'class="site-top"' in text:
        return

    is_template = 'id="report-data"' in text
    chrome = CHROME_TEMPLATE if is_template else CHROME_STATIC

    text = text.replace('lang="en"', 'lang="fr"', 1)

    def repl(match: re.Match[str]) -> str:
        attrs = match.group(1) or ""
        if is_template:
            if 'class="' in attrs:
                if "report-view" not in attrs:
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
            return f"<body{attrs}>\n{chrome}"
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
        return f"<body{attrs}>\n{chrome}"

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