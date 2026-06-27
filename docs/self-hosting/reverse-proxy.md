# Reverse proxy & TLS

For anything beyond local testing, run Caravan behind a reverse proxy that
terminates TLS and forwards to the container on port 3000. Two things matter:

1. **Set `BASE_URL`** to your public `https://…` URL. Caravan uses it for
   links/emails *and* as the trusted auth origin — if it's wrong, sign-in
   rejects requests as cross-origin.
2. **Proxy WebSockets.** The live-sync endpoint is a WebSocket at
   **`/api/trips/:tripId/ws`** (the browser opens `wss://<host>/api/trips/<id>/ws`).
   Because it lives under `/api`, any proxy rule that forwards `/api` to the
   container will carry it — *provided WebSocket upgrades are enabled* for that
   route (the `Upgrade`/`Connection` headers must pass through). Both examples
   below handle this.

In both examples the container should listen only on the proxy's network — bind
it to localhost in compose (`ports: ["127.0.0.1:3000:3000"]`) or put the proxy
and Caravan on the same Docker network and don't publish 3000 at all.

Set the public URL in `compose.yml`:

```yaml
    environment:
      BASE_URL: "https://caravan.example.com"
```

## Caddy

Caddy is the simplest option: automatic HTTPS via Let's Encrypt, and it proxies
WebSockets transparently — `reverse_proxy` upgrades connections automatically, so
there's nothing extra to configure for the sync socket.

`Caddyfile`:

```caddy
caravan.example.com {
    # Automatic TLS (ACME). WebSocket upgrades are handled transparently,
    # so the /api/trips/:id/ws sync socket just works.
    reverse_proxy localhost:3000
}
```

That's the whole file. Run Caddy on the host (`caddy run`) or as its own
container sharing a network with Caravan (then use `reverse_proxy caravan:3000`).
Reload with `caddy reload` after edits.

## Traefik

With Traefik (v3) the common setup is container labels and an HTTP→HTTPS redirect.
Traefik forwards the `Upgrade`/`Connection` headers and switches protocols for
WebSocket connections automatically, so the sync socket under `/api/.../ws` needs
no special router — the single service router covers it.

`compose.yml` with Traefik labels (assumes a Traefik instance with an ACME
`certresolver` named `le` and entrypoints `web`/`websecure` already configured):

```yaml
services:
  caravan:
    image: ghcr.io/aedrand/caravan:latest
    restart: unless-stopped
    # No published ports — Traefik reaches it over the shared network.
    networks: [web]
    volumes:
      - caravan-data:/app/data
    environment:
      BASE_URL: "https://caravan.example.com"
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.caravan.rule=Host(`caravan.example.com`)"
      - "traefik.http.routers.caravan.entrypoints=websecure"
      - "traefik.http.routers.caravan.tls.certresolver=le"
      - "traefik.http.services.caravan.loadbalancer.server.port=3000"

networks:
  web:
    external: true

volumes:
  caravan-data:
```

If you terminate TLS at Traefik and proxy onward, no extra middleware is needed
for WebSockets — Traefik detects the upgrade. (You only need explicit
`Upgrade`/`Connection` header handling on proxies that don't auto-detect; see the
nginx note below.)

## nginx (header reference)

If you use nginx instead, WebSocket upgrades are **not** automatic — you must
forward the `Upgrade` and `Connection` headers explicitly. The relevant directives
for the `/api` (or whole-site) location:

```nginx
server {
    server_name caravan.example.com;
    # ... listen 443 ssl; + your certs ...

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Required for the /api/trips/:id/ws live-sync socket:
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;   # don't cut idle WebSockets
    }
}
```

The `Upgrade`/`Connection` pair is what turns a normal proxied request into a
WebSocket; without it the sync socket fails to connect and the app falls back to
polling/refetch. A long `proxy_read_timeout` keeps idle sockets alive (the server
also sends periodic heartbeats).

## Verifying the socket

After deploying, open a trip and watch the browser devtools **Network → WS** tab:
you should see a `101 Switching Protocols` request to
`wss://caravan.example.com/api/trips/<id>/ws` that stays open. If it returns
`200`/`400`/`502` or repeatedly reconnects, the proxy isn't upgrading the
connection — re-check the WebSocket directives above.
