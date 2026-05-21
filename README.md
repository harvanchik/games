# Games

A small SvelteKit casual game collection with Poker Dice, Bell Roll, Farkle Run, Fortress Dice,
and No Deal or Deal.

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

In GitHub, set `Settings > Pages > Source` to `GitHub Actions`. If Pages is set to publish the
repository branch instead, GitHub publishes this README as a Jekyll page instead of the SvelteKit
`build/` output.

For a local production build that simulates this repository being served from
`https://harvanchik.github.io/games/`, set the repository base path before building:

```powershell
$env:BASE_PATH='/games'
npm run build
```

The workflow sets `BASE_PATH` from the GitHub repository name automatically. If the repository is
renamed to `your-name.github.io` or moved behind a root custom domain, remove that repository base
path so the site is served from `/`.

For the `games` repository, the public game URLs are:

- `https://harvanchik.github.io/games/` for Poker Dice
- `https://harvanchik.github.io/games/farkle/` for Farkle Run
- `https://harvanchik.github.io/games/bell-roll/` for Bell Roll
- `https://harvanchik.github.io/games/fortress-dice/` for Fortress Dice
- `https://harvanchik.github.io/games/no-deal-or-deal/` for No Deal or Deal

## Project Shape

- `src/lib/scoring.ts` contains score categories, totals, Joker behavior, and bonus rules.
- `src/lib/game.ts` contains player setup, dice rolling, turn advancement, and score saving.
- `src/lib/components/` contains the presentational Svelte components.
- `src/routes/+page.svelte` wires the state helpers to the UI.
