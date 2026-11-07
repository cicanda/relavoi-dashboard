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
     * Two rules from eslint-plugin-react-hooks 7, errors since 7 November
     * 2026, when the eleven findings they had been reporting as warnings were
     * cleared. They are errors and not warnings because the debt is paid and
     * the only thing left to do is keep it paid: a warning that nobody has to
     * act on is how eleven of these accumulated in the first place.
     *
     * `set-state-in-effect` fired 10 times, in three shapes. Two list screens
     * held a query's accumulated pages in state and appended to them from an
     * effect, with a second effect emptying them when the filter changed;
     * both are useInfiniteQuery now, and the filter lives in the query key.
     * Four forms copied fetched values into state from an effect; each is
     * either seeded from props at mount or keyed on the record, so React
     * resets it rather than a render doing it afterwards. One page set its
     * own error state in an effect for a condition it could read off the URL
     * during render.
     *
     * `purity` fired once, on the session detail screen reading the clock in
     * the render body to decide whether a session was still live. It now
     * reads src/lib/use-now.ts, which keeps the clock outside render and
     * ticks, so the screen notices an expiry instead of being right only when
     * something else happens to re-render it.
     *
     * If one of these fires again, it is a new instance and not old debt.
     * Fix it; do not turn this line back down.
     */
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/set-state-in-effect': 'error',
      'react-hooks/purity': 'error',
    },
  },
];
