import { requireOptionalNativeModule } from "expo-modules-core";

// Native binding for the per-host TLS-validation bypass. The module exposes a
// single imperative call: push the set of hostnames the user has opted into
// "ignore certificate errors" for, and the native layer (iOS NSURLSession
// challenge handler / Android OkHttp socket factory) skips trust evaluation
// for exactly those hosts and no others.
//
// `requireOptionalNativeModule` returns null when the native module isn't
// present — Expo Go, web, or a JS bundle running against a binary built before
// this module existed. Callers go through `lib/insecure-tls.ts`, which no-ops
// in that case, so the app still runs (just without the bypass).
interface InsecureTlsNativeModule {
  // Replaces the allowlist wholesale. Hosts are lowercased hostnames without
  // scheme or port (e.g. "192.168.1.50", "nas.local").
  setInsecureHosts(hosts: string[]): void;
}

const nativeModule =
  requireOptionalNativeModule<InsecureTlsNativeModule>("InsecureTls");

export const isInsecureTlsAvailable = nativeModule != null;

export function setInsecureHosts(hosts: string[]): void {
  nativeModule?.setInsecureHosts(hosts);
}
