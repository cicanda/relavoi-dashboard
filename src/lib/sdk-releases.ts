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
 * Verified on 2026-11-02 by resolving each one in a clean scratch project:
 *
 *   Android  com.github.cicanda:relavoi-android-sdk:v0.3.1 from JitPack, in a
 *            real Android project: 269 KB aar, 74 artifacts on the release
 *            runtime classpath. `google()` is required in the repository list,
 *            because the published POM imports firebase-bom and depends on
 *            firebase-messaging-ktx, which only Google's repository serves.
 *            Note that a non-Android Gradle project cannot resolve this at
 *            all: the aar needs variant-aware resolution, and without it the
 *            BOM-managed firebase version comes through empty.
 *   iOS      https://github.com/cicanda/relavoi-ios-sdk resolved at 0.3.3.
 *            Do not move this below 0.3.2: create() and list() recursed until
 *            the process died in 0.3.0 and 0.3.1, so those two releases crash
 *            an app on its first session.
 *   Flutter  git ref v0.3.2 resolved to 4813d36, version 0.3.2, 68
 *            dependencies.
 *
 * JitPack builds a tag the first time somebody asks for it, so a freshly cut
 * tag is not instantly resolvable and the first request can time out while the
 * build runs. Anonymous requests are also rate limited, which looks like a
 * timeout or a bogus "private repository" answer from its API rather than a
 * 429. Both are reasons the version here should move only after a real resolve.
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
    tag: "v0.3.1",
    version: "0.3.1",
    repo: "relavoi-android-sdk",
  },
  ios: {
    // SPM strips the leading v, so the dependency reads 0.3.3 and the tag is v0.3.3.
    tag: "v0.3.3",
    version: "0.3.3",
    repo: "relavoi-ios-sdk",
  },
  flutter: {
    tag: "v0.3.2",
    version: "0.3.2",
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
