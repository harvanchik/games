<script lang="ts">
	import { MAX_BELL_ROLL_SAVED_GAMES } from './bellRollSave';
	import type { BellRollSavedGameRecord } from './bellRollSave';
	import type { BellRollMode } from './bellRollTypes';

	interface StartConfig {
		mode: BellRollMode;
		names: string[];
		setCount: 1 | 3 | 4;
	}

	interface Props {
		setupMode: 'new' | 'load';
		gameName: string;
		savedGames: BellRollSavedGameRecord[];
		confirmDeleteGameId: string;
		canStartNewGame: boolean;
		duplicateSavedGameName: boolean;
		newSaveWouldExceedLimit: boolean;
		onSetupModeChange: (mode: 'new' | 'load') => void;
		onGameNameChange: (name: string) => void;
		onStart: (config: StartConfig) => void;
		onLoadGame: (id: string) => void;
		onRequestDeleteGame: (id: string) => void;
		onConfirmDeleteGame: (id: string) => void;
	}

	let {
		setupMode,
		gameName,
		savedGames,
		confirmDeleteGameId,
		canStartNewGame,
		duplicateSavedGameName,
		newSaveWouldExceedLimit,
		onSetupModeChange,
		onGameNameChange,
		onStart,
		onLoadGame,
		onRequestDeleteGame,
		onConfirmDeleteGame
	}: Props = $props();

	let mode = $state<BellRollMode>('quick');
	let quickPlayerCount = $state(2);
	let partyPlayerCount = $state(12);
	let setCount = $state<1 | 3 | 4>(1);
	let playerNames = $state<string[]>(createNames(12));

	let activePlayerCount = $derived(mode === 'quick' ? quickPlayerCount : partyPlayerCount);
	let playerNamesAreValid = $derived(
		playerNames.slice(0, activePlayerCount).every((name) => name.trim().length > 0)
	);
	let canStart = $derived(playerNamesAreValid && canStartNewGame);

	$effect(() => {
		playerNames = resizeNames(playerNames, activePlayerCount);
	});

	function startGame(): void {
		if (!canStart) return;
		onStart({
			mode,
			names: playerNames.slice(0, activePlayerCount),
			setCount
		});
	}

	function createNames(count: number): string[] {
		return Array.from({ length: count }, (_, index) => `Player ${index + 1}`);
	}

	function resizeNames(names: string[], count: number): string[] {
		if (names.length === count) return names;

		return Array.from({ length: count }, (_, index) => names[index] ?? `Player ${index + 1}`);
	}
</script>

<section class="mx-auto grid w-full max-w-4xl gap-0 border border-line bg-white">
	<div class="grid grid-cols-2 border-b border-line">
		<button
			type="button"
			class={[
				'cursor-pointer border-r border-line px-4 py-3 font-semibold',
				setupMode === 'new' ? 'bg-accent text-white' : 'bg-white text-neutral-700 hover:bg-neutral-100'
			]}
			onclick={() => onSetupModeChange('new')}
		>
			New Game
		</button>
		<button
			type="button"
			class={[
				'px-4 py-3 font-semibold disabled:cursor-not-allowed disabled:text-neutral-300',
				savedGames.length > 0 ? 'cursor-pointer' : '',
				setupMode === 'load' ? 'bg-accent text-white' : 'bg-white text-neutral-700 hover:bg-neutral-100'
			]}
			disabled={savedGames.length === 0}
			onclick={() => onSetupModeChange(savedGames.length > 0 ? 'load' : 'new')}
		>
			Load Game
		</button>
	</div>

	{#if setupMode === 'new'}
		<div class="grid gap-5 p-5">
			<div class="text-center">
				<h2 class="text-xl font-bold text-neutral-950">New Bell Roll Game</h2>
				<p class="mt-1 text-sm text-neutral-600">
					Quick Play is individual scoring. Party Table uses teams, tables, and head-table round control.
				</p>
			</div>

			<label class="grid gap-1">
				<span class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Game Name</span>
				<input
					class="border border-line bg-white px-3 py-2 outline-none focus:border-accent"
					type="text"
					value={gameName}
					oninput={(event) => onGameNameChange((event.currentTarget as HTMLInputElement).value)}
				/>
			</label>

			{#if duplicateSavedGameName}
				<p class="border border-accent bg-yellow-50 px-3 py-2 text-sm text-neutral-700">
					This name already exists. Starting will override that saved game.
				</p>
			{:else if newSaveWouldExceedLimit}
				<p class="border border-accent bg-yellow-50 px-3 py-2 text-sm text-neutral-700">
					You have {MAX_BELL_ROLL_SAVED_GAMES} saved games. Delete one or enter an existing game name to override it.
				</p>
			{:else if gameName.trim().length === 0}
				<p class="border border-line bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
					Enter a game name before starting.
				</p>
			{/if}

			<div class="grid grid-cols-2 border border-line">
				<button
					type="button"
					class={[
						'cursor-pointer border-r border-line px-4 py-3 text-left',
						mode === 'quick' ? 'bg-accent text-white' : 'bg-white text-neutral-700 hover:bg-neutral-100'
					]}
					onclick={() => (mode = 'quick')}
				>
					<span class="block font-semibold">Quick Play</span>
					<span class="mt-1 block text-sm opacity-80">2-4 players. Everyone scores individually.</span>
				</button>
				<button
					type="button"
					class={[
						'cursor-pointer px-4 py-3 text-left',
						mode === 'party' ? 'bg-accent text-white' : 'bg-white text-neutral-700 hover:bg-neutral-100'
					]}
					onclick={() => (mode = 'party')}
				>
					<span class="block font-semibold">Party Table</span>
					<span class="mt-1 block text-sm opacity-80">4-16 players. Teams, tables, and rotation.</span>
				</button>
			</div>

			<div class="grid gap-4 md:grid-cols-3">
				<label class="grid gap-1">
					<span class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Players</span>
					<select
						class="cursor-pointer border border-line bg-white px-3 py-2 outline-none focus:border-accent"
						value={activePlayerCount}
						onchange={(event) => {
							const value = Number((event.currentTarget as HTMLSelectElement).value);
							if (mode === 'quick') quickPlayerCount = value;
							else partyPlayerCount = value;
						}}
					>
						{#if mode === 'quick'}
							{#each [2, 3, 4] as count}
								<option value={count}>{count} Players</option>
							{/each}
						{:else}
							{#each [4, 8, 12, 16] as count}
								<option value={count}>{count} Players</option>
							{/each}
						{/if}
					</select>
				</label>

				<label class="grid gap-1">
					<span class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Sets</span>
					<select
						class="cursor-pointer border border-line bg-white px-3 py-2 outline-none focus:border-accent"
						bind:value={setCount}
					>
						<option value={1}>1 Set</option>
						<option value={3}>3 Sets</option>
						<option value={4}>4 Sets</option>
					</select>
				</label>

				<div class="grid content-end">
					<button
						type="button"
						class="cursor-pointer border border-neutral-950 bg-neutral-950 px-5 py-2 font-semibold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:border-neutral-300 disabled:bg-neutral-200 disabled:text-neutral-500"
						disabled={!canStart}
						onclick={startGame}
					>
						{duplicateSavedGameName ? 'Override Saved Game' : 'Start New Game'}
					</button>
				</div>
			</div>

			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{#each playerNames.slice(0, activePlayerCount) as name, index}
					<label class="grid gap-1">
						<span class="text-sm font-semibold uppercase tracking-wide text-neutral-500">
							Player {index + 1}
						</span>
						<input
							class="border border-line bg-white px-3 py-2 outline-none focus:border-accent"
							type="text"
							value={name}
							oninput={(event) => (playerNames[index] = (event.currentTarget as HTMLInputElement).value)}
						/>
					</label>
				{/each}
			</div>
		</div>
	{:else}
		<div class="grid gap-5 p-5">
			<div class="text-center">
				<h2 class="text-xl font-bold text-neutral-950">Load Bell Roll Game</h2>
				<p class="mt-1 text-sm text-neutral-600">Choose a saved game to continue.</p>
			</div>

			<div class="grid gap-2">
				<p class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Saved Games</p>

				{#if savedGames.length === 0}
					<p class="border border-line bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
						No saved games yet.
					</p>
				{:else}
					{#each savedGames as savedGame}
						<div class="grid grid-cols-[1fr_auto] items-center border border-line bg-white">
							<button
								type="button"
								class="min-w-0 cursor-pointer px-3 py-3 text-left font-semibold text-neutral-950 hover:bg-neutral-100"
								onclick={() => onLoadGame(savedGame.id)}
							>
								<span class="block truncate">{savedGame.name}</span>
							</button>

							{#if confirmDeleteGameId === savedGame.id}
								<button
									type="button"
									class="cursor-pointer border-l border-accent bg-accent px-3 py-3 text-sm font-semibold text-white hover:bg-accent-dark"
									onclick={() => onConfirmDeleteGame(savedGame.id)}
								>
									Confirm
								</button>
							{:else}
								<button
									type="button"
									class="cursor-pointer border-l border-line px-3 py-3 text-lg font-bold text-neutral-500 hover:text-accent"
									aria-label={`Delete ${savedGame.name}`}
									onclick={() => onRequestDeleteGame(savedGame.id)}
								>
									x
								</button>
							{/if}
						</div>
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</section>
