# scripts

Your deploy scripts. Publish on the Deploy Site page runs each enabled one
after it copies the site to your deploy folders.

Add, edit and turn scripts on or off on the Deploy Site page. The page saves
each script here as `<id>.ps1`, `<id>.sh` or `<id>.mjs`, and lists them in
`hbm-config.json`. A file you drop in by hand isn't listed, so it won't run.

Scripts get the values from `../.env` as environment variables. Put tokens
there, not in a script.

## Cross-Platform Cloudflare Cache Purge (`node` / `.mjs`)

Prefer a `node` (`.mjs`) script over PowerShell when running across Windows,
Linux, or Docker/Synology containers. Add a `node` script on the Deploy Site
page and paste:

```js
const zoneId = (process.env.CLOUDFLARE_ZONE_ID ?? '').trim();
const apiToken = (process.env.CLOUDFLARE_API_TOKEN ?? '').trim();
const baseUrl = (process.env.CLOUDFLARE_BASE_URL ?? process.env.HBM_SITE_URL ?? '')
  .trim()
  .replace(/\/+$/, '');

if (!zoneId || !apiToken) {
  console.error('Set CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN in .env');
  process.exit(1);
}

const endpoint = `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`;
const files = (process.env.HBM_CHANGED_FILES ?? '')
  .split(/\r?\n/)
  .map((f) => f.trim().replace(/^\/+/, ''))
  .filter(Boolean);

if (!files.length || !baseUrl) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ purge_everything: true }),
  });
  if (!res.ok) throw new Error(`Purge failed: ${res.status} ${await res.text()}`);
  console.log('Purged entire Cloudflare zone cache.');
} else {
  const urls = files.map((rel) => `${baseUrl}/${rel}`);
  for (let i = 0; i < urls.length; i += 30) {
    const batch = urls.slice(i, i + 30);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: batch }),
    });
    if (!res.ok) throw new Error(`Purge failed: ${res.status} ${await res.text()}`);
  }
  console.log(`Purged ${urls.length} URL(s) from Cloudflare cache.`);
}
```
