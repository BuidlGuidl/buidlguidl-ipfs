# Upgrading a bgipfs cluster node

Runbook for updating a live node to the current pinned versions with
`bgipfs cluster update`. Validated end to end on legacy nodes (Kubo 0.32/0.33,
repo version 16, read-only `ipfs.config.json` bind mount, traefik v2.10).

Update nodes one at a time, **while they are running** — restart-mode detection
(IP vs DNS) reads the live containers. Roll an IP node first, then a DNS node,
then the rest.

## Per node

```bash
cd <cluster-dir>                   # wherever docker-compose.yml lives
docker ps                          # all services up; port 80 on traefik = DNS mode
df -h .                            # ~2GB free for image pulls

npm i -g bgipfs && bgipfs --version
```

### DNS nodes only: traefik v3 rule syntax

Traefik v3 removed the v2 `{name:regex}` rule syntax. Overlays written before
this was fixed in the template carry a v2-syntax subdomain rule that v3
silently drops (subdomain gateway URLs 404; everything else keeps working).
Check and fix before updating:

```bash
grep "subdomain-gateway.rule" docker-compose.dns.yml
# If it contains {subdomain:[^.]+}, rewrite it:
cp docker-compose.dns.yml docker-compose.dns.yml.bak
sed -i 's|^      - "traefik.http.routers.subdomain-gateway.rule=.*|      - "traefik.http.routers.subdomain-gateway.rule=HostRegexp(`^[^.]+[.]ipfs[.]${GATEWAY_DOMAIN}$$`)"|' docker-compose.dns.yml
# Gate: must show your domain interpolated (the $$ is display escaping)
docker compose -f docker-compose.yml -f docker-compose.dns.yml config | grep "subdomain-gateway.rule"
```

### Update

```bash
bgipfs cluster update        # or --force to skip prompts (auto-creates the backup)
```

Expected milestones: config backup → `Migrated IPFS config (…)` →
`Staged ipfs.config.json into data/ipfs/config` → image tags updated → pull →
restart (in the detected mode) → `Running IPFS x.y.z and IPFS Cluster x.y.z` →
`Archived legacy exported IPFS config`.

### Verify

Test with a CID pinned on **this** cluster — gateways run with
`Gateway.NoFetch`, so content from other clusters correctly fails.

```bash
docker exec ipfs ipfs version && sudo cat data/ipfs/version    # expect current repo version
echo test-$(date +%s) | curl -s -X POST -F file=@- http://127.0.0.1:9094/add
curl -s http://127.0.0.1:8080/ipfs/<cid-from-add>              # IP mode
curl -sL https://<GATEWAY_DOMAIN>/ipfs/<cid-from-add>          # DNS mode
docker logs <traefik-container> 2>&1 | grep -ci "error while parsing rule"   # want 0 (DNS)
```

### Cleanup

```bash
docker image prune -a -f     # superseded images accumulate ~250-500MB per update
```

## Reboot resilience

The template sets `restart: unless-stopped` on all services, and
`cluster update` adds it to older compose files — containers come back after a
host reboot or daemon crash, in the same mode, while an explicitly stopped
cluster stays stopped. Check once per node that Docker itself starts on boot:

```bash
systemctl is-enabled docker    # enabled
```

## If something goes wrong

- **"Update failed" but containers are up**: likely a slow repo migration
  outlasting the verify window. Check `docker compose logs ipfs`; if healthy,
  re-run `bgipfs cluster update` (idempotent) so the legacy config archival
  completes.
- **Rollback**: `cp docker-compose.yml.<timestamp>.bak docker-compose.yml`
  (and the dns overlay `.bak` if edited), then `bgipfs cluster restart`.
  Config backups are in `backup_<timestamp>/` and `config-backup/`. The update
  never touches the blockstore.
- **DNS node came up in IP mode**: it was updated while stopped — run
  `bgipfs cluster start --mode dns`.
