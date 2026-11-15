# Google sync: iOS and GitHub Pages

Both platforms use `drive.appdata`, `appDataFolder`, and the same file,
`piano-visualizer-sync.json`. Keep their OAuth clients in the **same Google
Cloud project**. A different project has a separate app-data space even for the
same Google account. The iOS client ID stays unchanged in `cloud-config.ts`.

## Google Cloud setup

1. Open
   [Google Auth Platform / Clients](https://console.cloud.google.com/auth/clients).
   Select the existing project containing iOS client
   `163258338551-1ovvhhidc7d0i7h7heecr1c9q43m9e0k.apps.googleusercontent.com`.
   Its project number is `163258338551`; confirm the actual project in the
   console rather than creating another project.
2. In APIs & Services / Enabled APIs, confirm **Google Drive API** is enabled.
3. In Google Auth Platform / Clients, create **Web application**, for example
   `PianoVisualizer GitHub Pages`.
4. Add this **Authorized JavaScript origin**: `https://atariryuma.github.io`.
   Origins have no path or trailing slash; do not enter `/PianoVisualizer/`
   here. For local interactive tests also add `http://localhost` and
   `http://localhost:8443`.
5. Leave **Authorized redirect URIs** empty. This app uses the GIS popup token
   model, with no redirect callback or server token exchange.
6. Check the existing Branding, Audience, and Data Access settings. Keep the iOS
   consent configuration; the only requested scope is
   `https://www.googleapis.com/auth/drive.appdata`. If the audience is External
   / Testing, add the testing Google accounts to Test users. Testing grants can
   expire after seven days; publishing the OAuth app is a separate console step
   from deploying the website.
7. Copy the Web **client ID** (`163258338551-….apps.googleusercontent.com`). A
   Web client secret may also be generated: **do not copy it into source,
   Actions variables, the website, or chat**. The browser does not use it.

Google references:
[GIS setup](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid),
[token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model),
[Drive app data](https://developers.google.com/workspace/drive/api/guides/appdata).

## Build and publication

The public client IDs are configured in `packages/web/src/cloud-config.ts`:

- iOS:
  `163258338551-1ovvhhidc7d0i7h7heecr1c9q43m9e0k.apps.googleusercontent.com`
- Web:
  `163258338551-c3hoa9ijs942svne1lu6trs5q2n9mc26.apps.googleusercontent.com`

No GitHub secret or Actions variable is needed. Build and validate with:

```sh
corepack pnpm verify
```

After review and approval, merge the implementation into `main`; the existing
Web workflow on that push builds and deploys Pages. Confirm the Deploy to GitHub
Pages job succeeds and reload the site to get the updated service worker and
bundle. No iOS rebuild is required for this Web ID. `workflow_dispatch`
currently only builds; it does not deploy.

## Verification with a real account

1. Back up local practice data using the existing export before a live test. Use
   a test Google account with both clients authorized.
2. Open `https://atariryuma.github.io/PianoVisualizer/` in desktop Chrome. In
   settings, press Connect Google Drive and select the **same account** as iOS.
   Before connection, no Google script or Drive request should occur.
3. Verify iOS practice records and synced preferences appear on Web. If the
   cloud values change local language/theme, the app reloads intentionally.
4. Practice on Web, finish the section, and press Sync now. On iOS, sync and
   check the records. Change a synced setting on iOS and check it on Web too.
   Device input, volume, and audio latency must stay device-specific.
5. Reload Web: its token is memory-only, so Sign in again is expected. Reconnect
   to the same account and check that records/minutes are not duplicated.
6. Verify cancellation and denied Drive permission show a connection failure
   without replacing data. Browser popup blockers may need to allow this site.

Score files are not synced. Built-in song IDs match across platforms; for custom
scores, use the existing library export/import to preserve their identities.
Merge rules, deletion tombstones, per-device minutes ledger, validation of
newer/corrupt documents, and deferral during practice are shared by both
platforms and must not be bypassed.

Disconnect retains the cloud file. Revoking Google authorization can require
other clients in the same project to sign in again. Delete cloud copy affects
the shared file: avoid it during verification of existing data.
