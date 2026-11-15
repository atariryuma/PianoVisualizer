// Google OAuth client IDs for cloud sync. These are public identifiers, not
// secrets: they ship inside every copy of the app. The browser uses the GIS
// token model; never put a web client secret in this app or its build variables.
// An empty ID hides the Google option on that platform.

export const GOOGLE_CLIENT_ID_IOS =
  '163258338551-1ovvhhidc7d0i7h7heecr1c9q43m9e0k.apps.googleusercontent.com';
// Must be a Web application client in the SAME Cloud project as the iOS client
// so both platforms can access the same appDataFolder. See docs/GOOGLE-SYNC.md.
export const GOOGLE_CLIENT_ID_WEB =
  '163258338551-c3hoa9ijs942svne1lu6trs5q2n9mc26.apps.googleusercontent.com';

/** The app's private folder in the player's Drive, and nothing else. */
export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
