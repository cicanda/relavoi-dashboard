import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

// Next 16 removed `next lint`, so ESLint runs directly. eslint-config-next 16
// ships native flat configs and is imported as-is; FlatCompat cannot load it
// (it throws on a circular plugin reference) and is not needed.
//
// Errors fail the build, warnings do not. That is plain `eslint` behaviour
// with no --max-warnings, and it is deliberate: a warning here is advice, and
// a gate that blocks on advice is a gate someone switches off.
export default [
  {
    ignores: ['.next/**', 'out/**', 'build/**', 'next-env.d.ts'],
  },
  ...coreWebVitals,
  ...typescript,
  {
    // The copy guard and the SDK version check are CommonJS Node scripts, run
    // by `node check-em-dashes.js` and by CI, never bundled. `require` is
    // correct there, so the TypeScript-oriented rule does not apply.
    files: ['*.js', 'scripts/**/*.{js,mjs}'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    /**
     * Two rules from eslint-plugin-react-hooks 7 report real debt that cannot
     * be cleared in the commit that introduces linting.
     *
     * `set-state-in-effect` fires 10 times, all of it the same two patterns:
     * resetting pagination when a filter changes, and accumulating a query's
     * pages into state. Both are genuine (React can render an intermediate
     * state), and both are fixed by restructuring how the list screens hold
     * their data, not by moving a line. That is a behaviour change to the
     * sessions, calls, settings and webhooks screens, three of which Genesis
     * has redesigned, so it wants its own commit and its own review.
     *
     * `purity` fires once, on the session detail screen reading the clock
     * during render to decide whether a session is still live. Also real: the
     * same render can produce two answers. The honest fix is to hold the time
     * in state and refresh it, which again changes what that screen does.
     *
     * Warnings, so they stay visible and counted, rather than disabled, which
     * would make them invisible, or left as errors, which would mean landing
     * the gate red. Everything else, including any NEW instance of any other
     * rule, still fails the build. Listed site by site in docs/backlog.md.
     */
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
];
