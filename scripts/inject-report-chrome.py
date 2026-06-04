#!/usr/bin/env python3
"""Add immo-evals navigation chrome to copied report HTML files."""

from __future__ import annotations

import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"

# Public base URL (custom domain; the github.io URL 301-redirects here).
SITE_BASE = "https://luongnv.com/immo-evals"
OG_IMAGE = f"{SITE_BASE}/assets/logo/og-image.png"

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
<nav class="immo-evals-bar no-print" role="navigation" aria-label="immo-evals">
  <div class="immo-evals-bar__inner">
    <a href="../index.html">← immo-evals</a>
    <a href="../catalog.html">Catalogue</a>
    <a href="#" data-mailto-cta>Essayer le service</a>
    <span class="immo-evals-bar__note">Rapport réel</span>
  </div>
</nav>
<script src="../assets/mailto.js" defer></script>
"""

BODY_RE = re.compile(r"<body(\s[^>]*)?>", re.IGNORECASE)
REPORT_DATA_RE = re.compile(
    r'<script[^>]*id="report-data"[^>]*>(.*?)</script>', re.IGNORECASE | re.DOTALL
)
TITLE_RE = re.compile(r"<title>.*?</title>", re.IGNORECASE | re.DOTALL)
HEAD_OPEN_RE = re.compile(r"</head>", re.IGNORECASE)
SEO_MARKER = "<!-- immo-evals seo -->"


def _report_meta(path: Path, text: str) -> tuple[str, str]:
    """Derive a truthful (title, description) from the embedded report-data JSON.

    Falls back to the filename slug if the JSON is missing/unparseable so the
    function never invents content.
    """
    title = None
    summary = None
    m = REPORT_DATA_RE.search(text)
    if m:
        try:
            data = json.loads(m.group(1).strip())
            title = (data.get("title") or "").strip() or None
            summary = (data.get("summary") or "").strip() or None
        except (json.JSONDecodeError, AttributeError):
            pass

    if not title:
        slug = path.stem.replace("-", " ").strip().capitalize()
        title = f"Rapport d'évaluation — {slug}"

    if not summary:
        summary = (
            "Rapport acheteur immo·evals : verdict prix au m², risques et coût total "
            "pour cette annonce immobilière."
        )
    # Trim description to the recommended meta length (~155 chars) at a word
    # boundary so it isn't cut mid-word.
    if len(summary) > 158:
        cut = summary[:155].rsplit(" ", 1)[0].rstrip(" ,.;:")
        summary = cut + "…"

    return title, summary


def patch_head(path: Path) -> bool:
    """Add per-report SEO to <head>: title, meta description, canonical, OG/Twitter.

    Idempotent — re-running is a no-op once the SEO marker is present. Returns
    True if the file was modified.
    """
    text = path.read_text(encoding="utf-8")
    if SEO_MARKER in text:
        return False

    title, description = _report_meta(path, text)
    canonical = f"{SITE_BASE}/reports/{path.name}"
    t = html.escape(title, quote=True)
    d = html.escape(description, quote=True)

    # Rewrite the (stale "Bien Evaluator") title to the derived report title.
    new_title = f"<title>{html.escape(title)} · immo·evals</title>"
    if TITLE_RE.search(text):
        text = TITLE_RE.sub(new_title, text, count=1)
        title_block = ""
    else:
        title_block = new_title + "\n"

    seo = f"""{SEO_MARKER}
{title_block}<meta name="description" content="{d}">
<link rel="canonical" href="{canonical}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="immo·evals">
<meta property="og:locale" content="fr_FR">
<meta property="og:title" content="{t}">
<meta property="og:description" content="{d}">
<meta property="og:url" content="{canonical}">
<meta property="og:image" content="{OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{t}">
<meta name="twitter:description" content="{d}">
<meta name="twitter:image" content="{OG_IMAGE}">
<script type="application/ld+json">
{json.dumps({
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": title,
    "description": description,
    "url": canonical,
    "inLanguage": "fr-FR",
    "image": OG_IMAGE,
    "isPartOf": {
        "@type": "WebSite",
        "name": "immo·evals",
        "url": f"{SITE_BASE}/",
    },
    "publisher": {
        "@type": "Organization",
        "name": "immo·evals",
        "url": f"{SITE_BASE}/",
    },
}, ensure_ascii=False, indent=2)}
</script>
<!-- /immo-evals seo -->
"""

    text, n = HEAD_OPEN_RE.subn(seo + "</head>", text, count=1)
    if n != 1:
        raise SystemExit(f"no </head> in {path}")
    path.write_text(encoding="utf-8", data=text)
    print(f"seo-patched {path.name}")
    return True


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
    for report in sorted(REPORTS.glob("*.html")):
        patch_head(report)
        patch(report)


if __name__ == "__main__":
    main()