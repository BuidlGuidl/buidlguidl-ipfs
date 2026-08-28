---
"bgipfs": patch
---

Post-rollout hardening: fix the DNS template's subdomain-gateway rule for Traefik v3 (v2 `{name:regex}` syntax was silently dropped, breaking subdomain gateway URLs), set `restart: unless-stopped` on template services and inject it during `cluster update` so nodes survive reboots and daemon crashes, report the backup directory accurately (no more "backup was created" after declining), and add an UPGRADING.md runbook.
