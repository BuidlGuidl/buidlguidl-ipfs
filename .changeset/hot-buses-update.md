---
"bgipfs": patch
---

Overhaul `bgipfs cluster update`: pin Kubo v0.41.0, IPFS Cluster v1.1.6, and Traefik v3.6.1 as managed image tags (single-sourced and template-checked), migrate the live Kubo config and remove the legacy read-only `ipfs.config.json` bind mount, verify the cluster after updating, and fail loudly on backup problems. `cluster backup` now works on clusters without the legacy exported config, and permission errors on the live config point at the `chown` fix.
