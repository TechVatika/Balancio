# Balancio (Android)

**Your money, in balance.**

Android client for Balancio — a simple double-entry style cash book for Indian ledgers. Talks to your Balancio server over the local network (or any host you configure at build time).

| | |
|---|---|
| **Package** | `com.techvatika.balancio` |
| **Version** | `1.0.0+1` |
| **Flutter** | SDK `^3.14` |
| **Platform** | Android |

---

## Features

- **Sign in** with password (no API URL field on device)
- **Overview** — running balance, this month, this financial year
- **Month & year ledgers** — swipe between periods; Indian FY (Apr–Mar)
- **Financial year picker** — switch FY from the header menu
- **Books** — create, switch, rename, delete; set opening balance
- **Add / edit entries** — floating + button
- **Account** — manage books only
- Branded UI aligned with the Balancio web app (navy, type, panels)

---

## Requirements

- [Flutter](https://docs.flutter.dev/get-started/install) (stable, SDK ≥ 3.14)
- Android SDK / device or emulator
- A running **Balancio server** reachable from the phone

Default server (baked as obfuscated bytes; override at build time):

```text
http://192.168.31.70:4000
```

---

## Setup

```bash
flutter pub get
flutter run
```

### Point at another server

```bash
flutter run --dart-define=BALANCIO_API=http://YOUR_HOST:4000
# or
flutter build apk --dart-define=BALANCIO_API=https://your.host
```

### Release APK

```bash
flutter build apk --release --dart-define=BALANCIO_API=https://your.host
```

Release builds enable R8 minify + resource shrinking (`android/app/build.gradle.kts`).

---

## App icon

Launcher icons come from the adaptive pack in `assets/android/` (foreground, background, monochrome, mipmaps):

```bash
python tool/make_app_icon.py
```

Then **fully reinstall** the app (hot reload does not refresh the home-screen icon).

Previews land in `assets/app_icon/`. Mipmaps are written under `android/app/src/main/res/mipmap-*`.

---

## Project layout

```text
lib/
  main.dart           # Shell, sign-in, header menu, navigation
  overview_page.dart
  ledger_page.dart
  account_page.dart
  sheets.dart         # Add / edit entry
  store.dart          # Session + book state
  api.dart            # HTTP client
  secure_config.dart  # Obfuscated endpoint + opaque prefs keys
  session_vault.dart  # XOR-obfuscated session on device
  theme.dart          # Brand UI
  money.dart          # ₹ formatting + FY helpers
  statement.dart
assets/
  logo.png
  App Icon.png
  fonts/
tool/
  make_app_icon.py
android/              # Native Android project
```

---

## What is stored on device

| Data | Where |
|------|--------|
| Session cookie (obfuscated) | Local prefs via `SessionVault` |
| Active book id | Opaque pref key |
| Nothing else of the ledger | Server is source of truth |

This is obfuscation for casual inspection — not a substitute for HTTPS, device lock, or server auth.

---

## Tabs

1. **Overview**
2. **Month** ledger
3. **Year** ledger (respects selected FY)
4. **Account** (books)

---

## License

Private — Techvatika / Balancio. All rights reserved unless otherwise stated.
