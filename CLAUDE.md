@AGENTS.md

## Before any work in this repo

Before any work in this repo: git fetch origin, then check whether origin/main
has commits you don't have. If it does, list them (author, message, files
touched) in your report before building. Genesis makes UI changes to the
dashboard, admin and site between our sessions. Never overwrite them: rebase
your work onto origin/main, and where a conflict touches their UI work, keep
their version and re-apply our change on top. Fetch again right before you
push, in case something landed while you worked. After a long gap between
sessions, assume something has changed.

If a change of ours would alter a screen Genesis has recently redesigned
(layout, styling, components, not just data wiring), say so in the report so
Kay can give them a heads-up.

## Commit identity

Author and commit as `admin@cicanda.com`.

It is set per repository, `git config user.email admin@cicanda.com`, and not
globally. The global identity is a personal address, and before this was
pinned three different author identities had already reached this history:
`Kalu Chinecherem <kaluchinecherem8@gmail.com>`,
`Chinecherem Kalu <nechecodes@gmail.com>` and
`Kalu Chinecherem <nechecodes@gmail.com>`. Leave `user.name` as it is and
change only the address. Existing history is not rewritten.

Never add a Claude attribution line, a co-author trailer or a generated-by
note to a commit message or a pull request description.

## Genesis works through pull requests

Genesis opens a PR; it is merged by Kay or by us. Three rules, and the first one
is load-bearing rather than stylistic.

**Merge with a merge commit, never squash and never rebase.** On the Vercel
Hobby plan a private repository only deploys when the head commit is authored
by the account owner. Squashing or rebasing rewrites authorship onto the
merger, which would work, but it also throws away Genesis's authorship on their
own work. A merge commit keeps their commits intact and is itself authored by
`admin@cicanda.com`, so the commit Vercel builds satisfies the author check
while their history survives. Use "Create a merge commit" in the GitHub UI, or
`git merge --no-ff`.

A direct consequence worth knowing before this repository is made private: a
push straight to main by any account other than the owner will not deploy. That
is the whole reason the PR route exists here.

**Check the PR builds locally before merging**, and report anything that fails
rather than merging over it. There is no lint script in this repository, so the
checks are:

```
npm run check:copy     # the em dash guard
npx tsc --noEmit       # typecheck
npm run build
```

**Read an open PR and its comments as part of the fetch-before-work rule**, not
only when about to merge it. If it touches something we have changed, say so
before merging rather than after.
