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

## GitHub Pages

This app builds as a static SvelteKit site into `build/`. The included GitHub Actions workflow deploys
that directory to GitHub Pages whenever `main` is pushed.

For a local production build that simulates this repository being served from
`https://harvanchik.github.io/games/`, set the repository base path before building:

```powershell
$env:BASE_PATH='/games'
npm run build
```

The workflow sets `BASE_PATH` from the GitHub repository name automatically. If the repository is
renamed to `your-name.github.io` or moved behind a root custom domain, remove that repository base
path so the site is served from `/`.

## Project Shape

- `src/lib/scoring.ts` contains score categories, totals, Joker behavior, and bonus rules.
- `src/lib/game.ts` contains player setup, dice rolling, turn advancement, and score saving.
- `src/lib/components/` contains the presentational Svelte components.
- `src/routes/+page.svelte` wires the state helpers to the UI.
