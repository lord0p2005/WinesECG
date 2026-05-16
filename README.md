# WinesECG

Interactive Expo React Native visualization of a high-resolution animated ECG PQRST waveform with physiology notes, pathology overlays, comparison fade mode, and export actions (PNG/SVG/HTML).

## Run

```bash
npm install
npm run web
```

## Export

Use the in-app buttons:
- **Export PNG** for static image capture
- **Export SVG** for publication-quality vector output
- **Export HTML** for a portable interactive portfolio artifact

## CI / Automated APK build

This repository includes a GitHub Actions workflow to build an Android APK with Expo EAS and publish it as a GitHub Release.

Required repository secrets:
- `EAS_TOKEN` (preferred) or `EXPO_TOKEN` — an Expo/EAS API token. Create with `eas token:create` after logging in with `eas login`.
- `GITHUB_TOKEN` is provided by GitHub Actions automatically for the release step.

How to trigger:
- Push to `main` or use the Actions tab and run the `Build Android APK and Release` workflow manually.

Notes:
- The workflow uses the `production` profile in `eas.json` which requests an `apk` build.
- If your project requires an Android keystore, EAS will prompt to manage it the first time; EAS can handle keystore creation and storage in the cloud.

