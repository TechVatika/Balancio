# Contributing

This repository is private. External contributions are not accepted unless arranged with the maintainers.

## Internal workflow

1. Create a branch from the latest main line of work.
2. Keep changes focused (UI, API, or tooling — not all at once unless needed).
3. Run the app on a device against a real Balancio server before merging.
4. Bump `version` in `pubspec.yaml` when shipping, and update `CHANGELOG.md`.
5. If you change `assets/App Icon.png` or `assets/logo.png` for the launcher, run:

   ```bash
   python tool/make_app_icon.py
   ```

   Then fully reinstall the app to refresh the home-screen icon.

## Code style

- Follow `analysis_options.yaml` / `flutter_lints`
- Match existing patterns in `lib/theme.dart` and nearby pages
- Prefer small, readable widgets over large one-off trees
