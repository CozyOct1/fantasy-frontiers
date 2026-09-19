# Server preview

The current server preview is served as a production build through the existing default HTTP site:

`http://49.234.190.55/fantasy-frontiers/`

Nginx serves the static Vite build from `apps/game/dist/` and forwards `/fantasy-frontiers/api/` to the Node API on loopback port 3001. The API is intentionally not exposed as a public port.

Installed server files:

- `/etc/systemd/system/fantasy-frontiers-api.service` (enabled for startup after reboot)
- Nginx default-site server block includes `deploy/nginx-fantasy-frontiers-location.conf`

After changing the frontend, rebuild the deployable bundle with `VITE_BASE_PATH=/fantasy-frontiers/ VITE_API_BASE_URL=/fantasy-frontiers pnpm --filter @fantasy-frontiers/game build`. Use `sudo systemctl status fantasy-frontiers-api.service` and `sudo nginx -t && sudo systemctl reload nginx` after Nginx changes. The existing `cozyweb.cloud` TLS certificate is expired; use the HTTP IP URL above unless the certificate is renewed.
