/**
 * The published SDK releases, in one place.
 *
 * The SDK & Docs page used to carry its own copies of the coordinates, and
 * they were wrong in four ways at once: a Maven repository that does not exist
 * (`maven.relavoi.com`), a version that was never published (`0.1.0`), and a
 * GitHub organisation that is not ours (`relavoi` rather than `cicanda`). A
 * snippet nobody can run is worse than no snippet, because the reader assumes
 * the fault is theirs.
 *
 * So the versions live here, every snippet is built from them, and
 * `npm run check:sdk-versions` fails if these stop matching the tags on the
 * public repositories.
 *
 * Verified on 2026-11-01 by resolving each one in a clean project:
 *
 *   Android  com.github.cicanda:relavoi-android-sdk:v0.3.0 from JitPack,
 *            276 KB aar downloaded. `google()` is required in the repository
 *            list, because the published POM depends on firebase-bom, which
 *            lives only in Google's Maven repository.
 *   iOS      https://github.com/cicanda/relavoi-ios-sdk resolved at 0.3.0,
 *            revision 3680cd7.
 *   Flutter  git ref v0.3.0 resolved to 6bc30c8, 68 dependencies.
 *
 * JitPack is the interim distribution, not the destination. It builds the
 * public repository on demand at a tag, which is enough to integrate against
 * and not something to depend on for a production release schedule. Maven
 * Central replaces it.
 */

export const GITHUB_ORG = "cicanda";

export interface SdkRelease {
  /** The git tag on the public repository. */
  tag: string;
  /** What a human should see as the version. */
  version: string;
  repo: string;
}

export const SDK_RELEASES = {
  android: {
    tag: "v0.3.0",
    version: "0.3.0",
    repo: "relavoi-android-sdk",
  },
  ios: {
    // SPM strips the leading v, so the dependency reads 0.3.0 and the tag is v0.3.0.
    tag: "v0.3.0",
    version: "0.3.0",
    repo: "relavoi-ios-sdk",
  },
  flutter: {
    tag: "v0.3.0",
    version: "0.3.0",
    repo: "relavoi-flutter-sdk",
  },
} satisfies Record<string, SdkRelease>;

export type SdkPlatform = keyof typeof SDK_RELEASES;

const { android, ios, flutter } = SDK_RELEASES;

export const ANDROID_INSTALL = `// settings.gradle.kts
dependencyResolutionManagement {
  repositories {
    // google() is required, not optional: the SDK's POM depends on
    // firebase-bom, which only Google's repository serves.
    google()
    mavenCentral()
    maven("https://jitpack.io")
  }
}

// app/build.gradle.kts
dependencies {
  implementation("com.github.${GITHUB_ORG}:${android.repo}:${android.tag}")
}`;

export const IOS_INSTALL = `// Package.swift
dependencies: [
  .package(
    url: "https://github.com/${GITHUB_ORG}/${ios.repo}",
    from: "${ios.version}"
  )
]

.target(
  name: "MyApp",
  dependencies: [
    .product(name: "RelavoiSDK", package: "${ios.repo}")
  ]
)`;

export const FLUTTER_INSTALL = `# pubspec.yaml
dependencies:
  relavoi_flutter:
    git:
      url: https://github.com/${GITHUB_ORG}/${flutter.repo}.git
      ref: ${flutter.tag}`;
