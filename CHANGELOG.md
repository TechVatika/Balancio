# Changelog

All notable changes to Balancio are documented in this file.

## 2026-11-17

### Security
- Seal books, transactions, and activity logs as AES-256-GCM payloads so amounts, text, and dates are not readable in MySQL (only ids and opaque tokens remain).
- Replace readable `key_date` / timestamps with opaque `key_id`, `day_token`, and `month_token`.
- Encrypt daily files under `WEB/logs/` and stop printing sensitive detail to the server console.

### Added
- Activity logging for downloads, book switches, copies, page views, login, and related actions, with performer IP and user-agent.
- Monthly auto-purge of previous-month activity rows and old log files.
- Ledgerly-style keyboard shortcuts (`N`, `P`, `/`, `B`, `G` then letter, `?`).
- Custom rail menus for financial year and book; report download icons and PDF/Excel polish.

### Changed
- Display dates as **DD-MM-YYYY** on web and Android.
- Keep all `.log` files under `WEB/logs/`.
- Overview: **Latest entries** appears above **Largest payments**.
- Modals no longer close on backdrop click.

### Fixed
- Activity page description copy removed; Account key history shows opaque key ids instead of calendar dates.
