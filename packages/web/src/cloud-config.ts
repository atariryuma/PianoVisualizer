// Google OAuth client IDs for cloud sync. These are public identifiers, not
// secrets: they ship inside every copy of the app, and neither client type has a
// client secret. An empty ID hides the Google option on that platform.

export const GOOGLE_CLIENT_ID_IOS =
  '163258338551-1ovvhhidc7d0i7h7heecr1c9q43m9e0k.apps.googleusercontent.com';
export const GOOGLE_CLIENT_ID_WEB = '';

/** The app's private folder in the player's Drive, and nothing else. */
export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
