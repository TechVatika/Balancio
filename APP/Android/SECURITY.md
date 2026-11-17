# Security

## Reporting

If you find a vulnerability in this Android client or its handling of session data, contact the Balancio / Techvatika maintainers privately. Do not open a public issue with exploit details.

## Notes

- The server URL can be overridden at build time with `--dart-define=BALANCIO_API=...`
- Session material on device is obfuscated, not hardware-backed encryption
- Prefer HTTPS for any non-LAN deployment
- Release builds use R8 minify; this raises the bar for casual reverse engineering only
