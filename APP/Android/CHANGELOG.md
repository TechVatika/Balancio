# Changelog

All notable changes to the Balancio Android app are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-11-18

### Added

- Sign-in with password; server URL configured at build time (no URL field on login)
- Home shell with Overview, Month ledger, Year ledger, and Account
- Overview: running balance, this month / this FY cards, add entry and open month
- Month and year ledgers with period swipe (Indian financial year Apr–Mar)
- Header menu: financial year picker, book switch / new book, opening balance, sign out
- Account: books management (rename / delete) only
- Entry sheet for add / edit
- Brand theme matching the web app (navy, fonts, panels, bottom nav, logo glow)
- Branded “Opening the book” loader
- Adaptive launcher icon from `assets/App Icon.png` (`tool/make_app_icon.py`)
- Session vault + obfuscated API endpoint / preference keys
- Release minify (R8) and resource shrinking

### Changed

- Compact floating + action button (48dp)
- Year tab subtitle shows active FY label

### Removed

- Activity tab and paste FAB
- Reports tab and in-app report downloads
- Login API URL field
- Accent underline on bottom-nav selection

## [Unreleased]

### Changed

- Launcher icons installed from `assets/android` adaptive pack (fg / bg / monochrome)
