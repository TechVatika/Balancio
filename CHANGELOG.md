# Changelog

All notable changes to Balancio are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- **Shift+S** saves the open form (entry, paste, opening balance, change password). Ctrl/⌘+S is not used — those belong to the browser.
- Android adaptive launcher icons and Icon Kitchen / AppIcons asset set under `ASSETS/AppIcons/` and `APP/Android` mipmaps.
- Android session helpers (`session_vault.dart`, `secure_config.dart`) and tighter API timeouts / keep-alive client.

### Changed
- Android README and launcher branding refreshed for Play Store / local builds.

## [1.1.0] — 2026-11-17

### Added
- Split mobile apps under `APP/Android/` and `APP/IOS/` (Flutter Android project lives in `APP/Android/`).
- Shared brand assets from `ASSETS/` (Balancio logo, IBM Plex Sans, Source Serif 4, Rasa, Noto Serif Gujarati).
- Android Account screen: change password, rename/delete books, encryption key history, sign out.
- Android reports: custom date range, statement vs monthly summary, web-aligned copy.
- Android sign-in defaults for LAN testing (`http://192.168.31.70:4000`).
- Windows helper `APP/Android/open-from-windows.cmd` for a local junction when the repo is on a network share.

### Changed
- Android UI aligned with the web app: Overview / Month / Year / Reports / Account, brand fonts and colors, Gujarati-capable ledger text.
- WEB API listens on `0.0.0.0:4000` so phones on Wi‑Fi can reach the server.
- WEB client logo refreshed from `ASSETS/Balancio.png`.
- Gradle wrapper kept in-repo (jar + scripts) so Windows network-share builds are more reliable.

### Removed
- Activity tab from the Android app (system log remains on web).
- Paste floating action button from Android (add-entry FAB kept).

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

## [1.0.0] — 2026-11-17

### Added
- Balancio web app: passbook ledger, multi-book support, encrypted descriptions, reports (Excel/PDF).
- Security: password auth, session cookies, activity logs, AES-256-GCM field encryption.
- Initial Flutter Android client for overview, month/year ledger, reports, and entry CRUD.
