/**
 * Whether accounts exist in this build: they need Clerk's publishable key
 * (app.json → extra.clerkPublishableKey). Without it the app is exactly what
 * it was — every walk on the phone, nothing to sign in to.
 */

import Constants from "expo-constants";

export const CLERK_PUBLISHABLE_KEY =
  (Constants.expoConfig?.extra?.clerkPublishableKey as string | undefined) || null;

export const accountsEnabled = CLERK_PUBLISHABLE_KEY !== null;
