# Five Dice Scorecard

A small SvelteKit dice scorecard game inspired by classic five-dice scorecard rules. The UI uses neutral naming and original styling only.

## Tech

- SvelteKit
- Svelte 5 runes
- TypeScript
- TailwindCSS v4
- Vitest for scoring-rule tests

## Run Locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. By default it is usually `http://localhost:5173`.

## Useful Commands

```sh
npm run check
npm run test
npm run build
```

## Project Shape

- `src/lib/scoring.ts` contains score categories, totals, Joker behavior, and bonus rules.
- `src/lib/game.ts` contains player setup, dice rolling, turn advancement, and score saving.
- `src/lib/components/` contains the presentational Svelte components.
- `src/routes/+page.svelte` wires the state helpers to the UI.
