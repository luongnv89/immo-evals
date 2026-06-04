# immo-evals

Static showcase for **[bien-evaluator](https://github.com/luongnv89/meta-app)** buyer reports — sample HTML reports, a landing page, and a catalog. Hosted on GitHub Pages (frontend only).

**Live site:** https://luongnv89.github.io/immo-evals/

## Pages

| Page | File |
|------|------|
| Landing | `index.html` |
| Report catalog | `catalog.html` |
| Full sample reports | `reports/*.html` |

## Try the service (CTA)

Buttons open the visitor’s mail client with a pre-filled message to `contact.nguyen.fr@gmail.com`, asking them to paste the listing URL (LeBonCoin, SeLoger, PAP, Bien'ici).

## Update sample reports

Golden reports are copied from [meta-app](https://github.com/luongnv89/meta-app) `tests/golden/bien-evaluator/*/index.html`:

```bash
cp ../meta-app/tests/golden/bien-evaluator/01-appartement-lyon-croix-rousse/index.html reports/01-appartement-lyon-croix-rousse.html
# … repeat for other samples …
python3 scripts/inject-report-chrome.py
git add reports && git commit -m "chore: refresh sample reports"
git push
```

GitHub Actions redeploys Pages on every push to `main`.

## Local preview

```bash
python3 -m http.server 8080
# open http://127.0.0.1:8080/
```

## License

Sample report content is demonstration material from the meta-app golden fixtures. Site markup/CSS is MIT.