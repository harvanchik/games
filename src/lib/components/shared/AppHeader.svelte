<script lang="ts">
	import { base } from '$app/paths';

	interface GameLink {
		id: string;
		name: string;
		href: string;
	}

	interface Props {
		title: string;
		activeGameId: string;
		onNewGame: () => void;
		onHelp?: () => void;
		onStats?: () => void;
		onPause?: () => void;
		pauseActive?: boolean;
		showPause?: boolean;
	}

	let {
		title,
		activeGameId,
		onNewGame,
		onHelp,
		onStats,
		onPause,
		pauseActive = false,
		showPause = false
	}: Props = $props();
	let menuOpen = $state(false);

	const games: GameLink[] = [
		{ id: 'poker-dice', name: 'Poker Dice', href: '/' },
		{ id: 'bell-roll', name: 'Bell Roll', href: '/bell-roll' },
		{ id: 'no-deal-or-deal', name: 'No Deal or Deal', href: '/no-deal-or-deal' },
		{ id: 'farkle-run', name: 'Farkle Run', href: '/farkle' },
		{ id: 'fortress-dice', name: 'Fortress Dice', href: '/fortress-dice' }
	];

	function getGameHref(href: string): string {
		return `${base}${href}`;
	}
</script>

<header class="relative border border-line bg-white p-5">
	<div class="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
		<div class="flex items-center gap-2 justify-self-start">
			<button
				type="button"
				class="cursor-pointer border border-line bg-white px-4 py-2 text-sm font-semibold text-neutral-800 hover:border-accent hover:text-accent"
				aria-expanded={menuOpen}
				aria-haspopup="menu"
				onclick={() => (menuOpen = !menuOpen)}
			>
				Games
			</button>

			{#if onHelp}
				<button
					type="button"
					class="grid h-10 w-10 cursor-pointer place-items-center border border-line bg-white text-neutral-800 hover:border-accent hover:text-accent"
					aria-label="How to play"
					title="How to play"
					onclick={onHelp}
				>
					<svg
						class="h-5 w-5"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="square"
						stroke-linejoin="miter"
						aria-hidden="true"
					>
						<circle cx="12" cy="12" r="9" />
						<path d="M12 11v6" />
						<path d="M12 7h.01" />
					</svg>
				</button>
			{/if}

			{#if menuOpen}
				<div
					class="absolute left-5 top-[calc(100%-0.75rem)] z-40 grid min-w-44 border border-line bg-white shadow-sm"
					role="menu"
				>
					{#each games as game}
						<a
							class={[
								'border-b border-line px-4 py-3 text-sm font-semibold last:border-b-0 hover:bg-neutral-100',
								game.id === activeGameId ? 'bg-accent text-white hover:bg-accent' : 'text-neutral-800'
							]}
							href={getGameHref(game.href)}
							role="menuitem"
							onclick={() => (menuOpen = false)}
						>
							{game.name}
						</a>
					{/each}
				</div>
			{/if}
		</div>

		<h1 class="col-start-2 text-center text-3xl font-bold text-neutral-950">{title}</h1>

		<div class="col-start-3 flex items-center gap-2 justify-self-end">
			{#if showPause && onPause}
				<button
					type="button"
					class={[
						'grid h-11 w-11 cursor-pointer place-items-center border font-bold hover:bg-accent-dark',
						pauseActive
							? 'border-accent bg-accent text-white'
							: 'border-neutral-950 bg-neutral-950 text-white'
					]}
					aria-label={pauseActive ? 'Resume game' : 'Pause game'}
					title={pauseActive ? 'Resume' : 'Pause'}
					onclick={onPause}
				>
					<svg
						class="h-5 w-5"
						viewBox="0 0 24 24"
						fill="currentColor"
						aria-hidden="true"
					>
						<rect x="6" y="4" width="4" height="16" />
						<rect x="14" y="4" width="4" height="16" />
					</svg>
				</button>
			{/if}

			{#if onStats}
				<button
					type="button"
					data-testid="header-stats-button"
					class="grid h-11 w-11 cursor-pointer place-items-center border border-line bg-white text-neutral-800 hover:border-accent hover:text-accent"
					aria-label="CPU game stats"
					title="CPU game stats"
					onclick={onStats}
				>
					<svg
						class="h-5 w-5"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="square"
						stroke-linejoin="miter"
						aria-hidden="true"
					>
						<path d="M4 19h16" />
						<path d="M7 16V9" />
						<path d="M12 16V5" />
						<path d="M17 16v-4" />
					</svg>
				</button>
			{/if}

			<button
				type="button"
				data-testid="header-new-game-button"
				class="cursor-pointer border border-neutral-950 bg-neutral-950 px-5 py-2 font-semibold text-white hover:bg-accent-dark"
				onclick={onNewGame}
			>
				New Game
			</button>
		</div>
	</div>
</header>
