#!/usr/bin/env python3
"""Rebuild the immo-evals public catalog from the reports already in this repo.

Companion to meta-app#101. meta-app's publisher commits each bien-evaluator report
into this repo at ``reports/{report_id}/`` (``index.html`` + ``summary.json``); older
reports were hand-curated as flat ``reports/{slug}.html`` files. This script is the
**single authority** for the catalog: it enumerates *both* layouts, honors each
report's ``catalog_listed`` visibility flag, and rebuilds ``catalog.html`` (the grid),
``data/reports.json``, and ``sitemap.xml`` so every published+listed report appears —
no manual curation, no cap, no dependency on meta-app being reachable.

It replaces ``sync-reports-from-meta-app.py``, which read meta-app's *local* reports
dir, hard-capped at 3 curated entries, and rebuilt nothing from this repo's own
published artifacts.

Visibility gate (meta-app#85/#101): a report is listed iff its ``catalog_listed`` is
true. The flag travels in the published ``summary.json``. Reports published before
meta-app#101 (and all hand-curated flat reports) have **no** flag — those default to
**listed** (``True``), matching the system's default-on contract: a report is only
hidden when it explicitly opted out.

Run: ``python3 scripts/build-catalog.py`` from anywhere; paths resolve from repo root.
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports"
CATALOG_HTML = ROOT / "catalog.html"
DATA = ROOT / "data" / "reports.json"
SITEMAP = ROOT / "sitemap.xml"
SITE_BASE = "https://luongnv.com/immo-evals"

# The grid block in catalog.html is regenerated between these markers; everything
# outside (head, intro, CTA, footer) is preserved verbatim.
GRID_OPEN = '<div class="catalog-grid shell">'
GRID_CLOSE_AFTER_OPEN = "\n  </div>\n"

_TONES = {"good", "warn", "neutral", "bad"}


def _slugify(title: str) -> str:
    s = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return re.sub(r"-+", "-", s).strip("-")[:80] or "report"


def _esc(text: str) -> str:
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _parse_report_data(index_html: Path) -> dict | None:
    """Return the ``<script id="report-data">`` JSON object, or ``None``."""
    text = index_html.read_text(encoding="utf-8")
    pos = text.find('id="report-data">')
    if pos < 0:
        return None
    start = text.find("{", pos)
    if start < 0:
        return None
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start : i + 1])
                except json.JSONDecodeError:
                    return None
    return None


def _catalog_listed(summary_path: Path) -> bool:
    """Honor the published ``catalog_listed`` flag; absent → listed (default-on)."""
    if not summary_path.is_file():
        return True
    try:
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return True
    return bool(summary.get("catalog_listed", True))


def _entry_from_published(report_dir: Path) -> dict | None:
    """Build a catalog entry from a published ``reports/{report_id}/`` dir."""
    index_html = report_dir / "index.html"
    if not index_html.is_file():
        return None
    if not _catalog_listed(report_dir / "summary.json"):
        return None  # explicitly hidden — published at its URL but not listed
    meta = _parse_report_data(index_html)
    if meta is None:
        return None
    report_id = report_dir.name
    verdict = meta.get("verdict") or {}
    tone = verdict.get("tone", "neutral")
    kpi = meta.get("kpi") or {}
    return {
        "id": report_id,
        "jobId": "",  # published artifacts don't carry the job_id; dedupe on id/title
        "title": meta.get("title", report_id),
        "date": meta.get("date", ""),
        "url": meta.get("url", ""),
        "verdict": verdict.get("label", ""),
        "tone": tone if tone in _TONES else "neutral",
        "summary": meta.get("summary", ""),
        "price": kpi.get("price", ""),
        "pricem2": kpi.get("pricem2", ""),
        "surface": kpi.get("surface", ""),
        "type": kpi.get("type", ""),
        "href": f"reports/{report_id}/",
    }


def _entries_from_curated() -> list[dict]:
    """Curated flat ``reports/{slug}.html`` entries, sourced from data/reports.json.

    These pre-date the published-dir layout and have nicer hand-written copy. They
    carry no ``catalog_listed`` flag, so they default to listed. Kept so the catalog
    never regresses by dropping the originally-curated reports.
    """
    if not DATA.is_file():
        return []
    try:
        existing = json.loads(DATA.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    out = []
    for e in existing:
        href = e.get("href", "")
        # Keep only curated flat-file entries whose report still exists on disk.
        if href.endswith(".html") and (ROOT / href).is_file():
            e.setdefault("tone", "neutral")
            out.append(e)
    return out


def collect_entries() -> list[dict]:
    """Union of curated + published-and-listed reports, deduped, newest-first."""
    entries = _entries_from_curated()
    seen_titles = {(e.get("title", ""), e.get("date", "")) for e in entries}

    for report_dir in sorted(REPORTS.glob("rpt-*")):
        if not report_dir.is_dir():
            continue
        entry = _entry_from_published(report_dir)
        if entry is None:
            continue
        # Defensive dedupe: a report curated AND auto-published is listed once
        # (curated wins — nicer copy/URL). Keyed on (title, date) since published
        # artifacts carry no jobId.
        if (entry["title"], entry["date"]) in seen_titles:
            continue
        seen_titles.add((entry["title"], entry["date"]))
        entries.append(entry)

    entries.sort(key=lambda e: (e.get("date", ""), e.get("title", "")), reverse=True)
    return entries


def _card_html(e: dict) -> str:
    tone = e.get("tone", "neutral")
    tone = tone if tone in _TONES else "neutral"
    tag_date = e.get("date", "")
    tag = f"Bien'ici · {tag_date}" if tag_date else "Bien'ici"
    bits = [b for b in (e.get("price"), e.get("surface"), e.get("pricem2")) if b]
    kpi_line = " · ".join(bits)
    summary = e.get("summary", "")
    body_text = f"{kpi_line}. {summary}".strip() if kpi_line else summary
    verdict = e.get("verdict") or e.get("title", "")
    return f"""    <a class="catalog-card" href="{_esc(e['href'])}">
      <div class="catalog-card__body">
        <span class="card__tag">{_esc(tag)}</span>
        <span class="verdict-pill verdict-pill--{_esc(tone)}">{_esc(verdict)}</span>
        <h2>{_esc(e.get('title', ''))}</h2>
        <p>{_esc(body_text)}</p>
      </div>
      <div class="catalog-card__footer">
        <span class="btn btn--primary" aria-hidden="true">Ouvrir le rapport →</span>
      </div>
    </a>"""


def write_catalog_html(entries: list[dict]) -> None:
    """Replace the grid block in catalog.html; preserve all surrounding chrome."""
    html = CATALOG_HTML.read_text(encoding="utf-8")
    open_at = html.find(GRID_OPEN)
    if open_at < 0:
        raise SystemExit(f"grid marker {GRID_OPEN!r} not found in catalog.html")
    grid_start = html.rindex("\n", 0, open_at) + 1  # keep the line's indent
    # The grid is the FIRST `</div>` that closes the catalog-grid container: it sits
    # on its own line at two-space indent after the last card.
    close_at = html.find("\n  </div>\n", open_at)
    if close_at < 0:
        raise SystemExit("grid closing </div> not found in catalog.html")
    grid_end = close_at + len("\n  </div>\n")

    cards = "\n\n".join(_card_html(e) for e in entries)
    new_grid = f'  <div class="catalog-grid shell">\n{cards}\n  </div>\n'
    updated = html[:grid_start] + new_grid + html[grid_end:]
    CATALOG_HTML.write_text(updated, encoding="utf-8")
    print(f"wrote {CATALOG_HTML.name} ({len(entries)} cards)")


def write_data_json(entries: list[dict]) -> None:
    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(
        json.dumps(entries, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"wrote {DATA.relative_to(ROOT)} ({len(entries)} reports)")


def write_sitemap(entries: list[dict]) -> None:
    urls = [
        (f"{SITE_BASE}/", "monthly", "1.0"),
        (f"{SITE_BASE}/catalog.html", "weekly", "0.8"),
    ]
    for e in entries:
        urls.append((f"{SITE_BASE}/{e['href']}", "monthly", "0.6"))
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for loc, changefreq, priority in urls:
        lines += [
            "  <url>",
            f"    <loc>{loc}</loc>",
            f"    <changefreq>{changefreq}</changefreq>",
            f"    <priority>{priority}</priority>",
            "  </url>",
        ]
    lines.append("</urlset>")
    SITEMAP.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {SITEMAP.name} ({len(urls)} urls)")


def main() -> None:
    entries = collect_entries()
    if not entries:
        raise SystemExit("no listed reports found in reports/")
    write_catalog_html(entries)
    write_data_json(entries)
    write_sitemap(entries)
    print(f"done — {len(entries)} reports in the catalog")


if __name__ == "__main__":
    main()
