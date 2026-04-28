/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/**/*.test.ts", "<rootDir>/**/*.test.tsx"],
  transformIgnorePatterns: [
    "node_modules/(?!(jest-)?react-native|@react-native|@react-navigation|expo(nent)?|@expo(nent)?/.*|@unimodules/.*|unimodules|sentry-expo|native-base|@noble/.*)",
  ],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
  testPathIgnorePatterns: [
    "/node_modules/",
    "/android/",
    "/ios/",
    "/.expo/",
    "/backend/",
  ],
  collectCoverageFrom: [
    "store/config-migrations.ts",
    "store/config-schema.ts",
    "lib/url-validation.ts",
    "lib/config-crypto.ts",
    "lib/utils.ts",
    "lib/wake-on-lan.ts",
  ],
  testTimeout: 15_000,
};
