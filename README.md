# divinereconnection.com

Static landing site for UN-DO: The Founding Cohort. Served by the Cloudflare Worker `divinereconnection-web` (static assets).

- `public/` — everything in here is served as-is (index.html, favicon, icons, og-image).
- `wrangler.jsonc` — Worker config. Deploy: `npx wrangler deploy` (Cloudflare Git integration runs this on every push to `main`).

Deploys: pushes to `main` build and deploy automatically via Cloudflare Workers Builds.
