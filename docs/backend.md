# SCADA Backend

The backend is intentionally a thin workspace-persistence service. It does not own the SCADA runtime or component rendering model.

## Topology

```text
GitHub Pages
    |
    | HTTPS
    v
system Nginx :443
    |
    v
127.0.0.1:3000
SCADA API (rootless Podman)
    |
    v
PostgreSQL (rootless Podman)
```

The containers are managed by the `scada-deploy` user's systemd manager through Podman Quadlet.

## API

Public reads:

- `GET /health`
- `GET /api/components`
- `GET /api/components/:id`

Authenticated writes:

- `POST /api/components`
- `PUT /api/components/:id`
- `DELETE /api/components/:id`

Write requests require:

```http
Authorization: Bearer <SCADA_ADMIN_TOKEN>
```

The API stores each reusable component package as JSONB rather than decomposing private visual layers, rules, and future implementation details into relational tables.

## Server state

Runtime environment files are created once by `deploy/scripts/deploy.sh` and intentionally kept outside Git:

```text
/opt/scada/env/postgres.env
/opt/scada/env/api.env
```

The deployment script does not rotate them on subsequent releases.

The PostgreSQL data is held in the named rootless Podman volume `scada-db`.

## Deployment

`.github/workflows/deploy-backend.yml` builds the API image on the GitHub-hosted runner, exports it as an image archive, copies it over SSH, then loads it with rootless Podman and restarts the generated Quadlet services.

No container registry credentials are required for the application image in this first deployment slice.

Useful server-side diagnostics as `scada-deploy`:

```bash
systemctl --user status scada-api.service scada-db.service
journalctl --user -u scada-api.service -f
journalctl --user -u scada-db.service -f
podman ps
```

The API is bound only to `127.0.0.1:3000`. Port 3000 and PostgreSQL port 5432 must not be exposed through the cloud or host firewall. Public HTTPS termination is a separate one-time host configuration step.
