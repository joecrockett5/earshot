# Security

## Earshot has no authentication

This is a deliberate design choice, not an oversight. Earshot is a small tool for a home server, and it has no users, passwords, sessions or permissions.

**Anyone who can reach Earshot's port can list, read, change, export and delete every Sound and clip stored in it, and can upload files up to `MAX_UPLOAD_MB` until the disk is full.**

Run it in one of these ways:

- **On a trusted local network**, with the port not forwarded from your router.
- **Over a private network** such as Tailscale or WireGuard.
- **Behind a reverse proxy that adds authentication** (for example Caddy, Traefik or nginx with basic auth, or an identity-aware proxy such as Authelia, Authentik or Cloudflare Access), with TLS.

Do not expose Earshot directly to the internet.

## What Earshot does to limit damage

- Uploads are limited in size, must be sent as an audio content type, and are accepted only if their first bytes identify a supported audio format.
- File names supplied by the client are never used to build paths. Clips and scenes are stored under server-generated ids, and every id in a URL is validated before it touches the file system.
- All request bodies are validated against a schema.
- Clips are served with `X-Content-Type-Options: nosniff`, and the app is served with a restrictive Content-Security-Policy.
- The container runs the server as an unprivileged user and needs no capabilities.
- Release images are published with provenance and SBOM attestations.

## Supported versions

Security fixes are made on the latest release only.

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's [security advisory form](https://github.com/joecrockett5/earshot/security/advisories/new) rather than in a public issue. Include what you found, how to reproduce it, and what you think the impact is. You should get a reply within a week.

The lack of authentication described above is known and intended, so it is not a vulnerability. Ways to get around the protections that _are_ meant to exist (for example path traversal, storing non-audio content, or script injection) very much are.
