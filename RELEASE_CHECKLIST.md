# v1.2.0 Release Checklist

## Repository contents

- [ ] `LICENSE`, `README.md`, `THIRD_PARTY_NOTICES.md`, and `CHANGELOG.md` are committed.
- [ ] `USER_GUIDE.md`, `RELEASE_REVIEW.md`, and `DEVELOPMENT_HANDOVER.md` are committed.
- [ ] `docs/index.html`, `docs/.nojekyll`, and `docs/assets/` are committed.
- [ ] Generated development folders such as `node_modules/`, `dist/`, and `build/` are not committed.
- [ ] No individual tracked file exceeds GitHub's normal upload limits.

## Local verification

```bash
npm install
npm test
npm run build:pages
npm run package:release
```

- [ ] The main menu opens from a static HTTP server.
- [ ] The master-volume setting persists after reloading the main menu.
- [ ] **最初から滑る** starts Track 1.
- [ ] A track preview plays and returns to silence.
- [ ] A bundled track starts with music and subtitles.
- [ ] Pause and completion menus respond to cursor keys and Enter.
- [ ] The FPS overlay starts hidden and appears when `F` is pressed.
- [ ] An external audio file can be selected locally.

## GitHub Pages

1. Upload or push the complete repository.
2. Open **Settings → Pages**.
3. Set **Source** to **Deploy from a branch**.
4. Select the `main` branch and `/docs` folder.
5. Save and wait for the Pages deployment to finish.
6. Open the published URL shown by GitHub and perform one final ride test.

## Canonical repository package

The one canonical release archive is written to:

```text
dist/snow-motion-v1.2.0.zip
```

Extracting the archive creates one `snow-motion-v1.2.0/` folder containing the reproducible repository. It does not scatter repository files directly into the selected extraction directory. The folder includes source files, the lockfile, smoke tests, runtime assets actually used by the game, complete documentation, and the committed `docs/` GitHub Pages build.

- [ ] The archive has exactly one top-level `snow-motion-v1.2.0/` folder.
- [ ] That folder contains `README.md`, `LICENSE`, `package.json`, `package-lock.json`, `src/`, `scripts/`, and `docs/index.html`.
- [ ] The archive can run `npm ci`, `npm test`, and `npm run build` after extraction.
- [ ] The archive does not contain `.git/`, `node_modules/`, `build/`, `dist/`, `tests/tmp/`, obsolete menu BGM, unused cover art, or source texture ZIP files.

GitHub Pages branch publishing should use the committed `docs/` directory instead of uploading a ZIP directly.
