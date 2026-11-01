#!/usr/bin/env node
/**
 * Fail if src/lib/sdk-releases.ts has drifted from the tags on the public
 * repositories.
 *
 * The page's snippets are built from those constants, so a stale constant is a
 * snippet that does not resolve. This is the guard: it asks GitHub what tags
 * exist and compares.
 *
 *   node scripts/check-sdk-versions.mjs
 *
 * It only reads public tag lists, so it needs no credential. A rate limit or a
 * network failure is reported as a skip rather than a failure, because a CI box
 * without egress should not turn red over this.
 */
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/lib/sdk-releases.ts", import.meta.url), "utf8");

const ORG = /GITHUB_ORG = "([^"]+)"/.exec(src)?.[1];
if (!ORG) {
  console.error("could not read GITHUB_ORG from sdk-releases.ts");
  process.exit(1);
}

const entries = [...src.matchAll(/^ {2}(\w+): \{([\s\S]*?)^ {2}\},$/gm)].map(([, platform, body]) => ({
  platform,
  tag: /tag: "([^"]+)"/.exec(body)?.[1],
  repo: /repo: "([^"]+)"/.exec(body)?.[1],
}));

if (entries.length === 0) {
  console.error("could not parse SDK_RELEASES from sdk-releases.ts");
  process.exit(1);
}

let failed = false;
for (const { platform, tag, repo } of entries) {
  let tags;
  try {
    const res = await fetch(`https://api.github.com/repos/${ORG}/${repo}/tags`, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "relavoi-sdk-version-check",
      },
    });
    if (!res.ok) {
      console.log(`skip  ${platform.padEnd(8)} GitHub answered ${res.status}`);
      continue;
    }
    tags = (await res.json()).map((t) => t.name);
  } catch (err) {
    console.log(`skip  ${platform.padEnd(8)} ${err.message}`);
    continue;
  }

  if (!tags.includes(tag)) {
    console.error(
      `FAIL  ${platform.padEnd(8)} sdk-releases.ts says ${tag}, which is not a tag on ` +
        `${ORG}/${repo}. Tags: ${tags.slice(0, 5).join(", ") || "(none)"}`,
    );
    failed = true;
    continue;
  }

  if (tags[0] !== tag) {
    console.error(
      `FAIL  ${platform.padEnd(8)} ${ORG}/${repo} has a newer tag ${tags[0]}; ` +
        `sdk-releases.ts still points at ${tag}`,
    );
    failed = true;
    continue;
  }

  console.log(`ok    ${platform.padEnd(8)} ${tag} is the newest tag on ${ORG}/${repo}`);
}

process.exit(failed ? 1 : 0);
