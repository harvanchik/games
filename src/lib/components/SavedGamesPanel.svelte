<script lang="ts">
	import type { SavedGameRecord } from '$lib/types';

	interface Props {
		currentSaveId: string;
		gameName: string;
		savedGames: SavedGameRecord[];
		onRename: (name: string) => void;
		onLoad: (id: string) => void;
		onDelete: (id: string) => void;
		onNewGame: () => void;
		compact?: boolean;
	}

	let {
		currentSaveId,
		gameName,
		savedGames,
		onRename,
		onLoad,
		onDelete,
		onNewGame,
		compact = false
	}: Props = $props();
	let selectedSaveId = $state('');
	let lastCurrentSaveId = $state('');
	let selectedSaveExists = $derived(savedGames.some((savedGame) => savedGame.id === selectedSaveId));

	$effect(() => {
		const currentSaveExists = savedGames.some((savedGame) => savedGame.id === currentSaveId);
		const selectedSaveStillExists = savedGames.some((savedGame) => savedGame.id === selectedSaveId);

		// When the current game changes, point the dropdown at it. Otherwise keep a user's
		// manual selection in place so the Load button targets what they chose.
		if (currentSaveId !== lastCurrentSaveId) {
			lastCurrentSaveId = currentSaveId;
			selectedSaveId = currentSaveExists ? currentSaveId : (savedGames[0]?.id ?? '');
			return;
		}

		if (selectedSaveStillExists) return;

		selectedSaveId = currentSaveExists ? currentSaveId : (savedGames[0]?.id ?? '');
	});

	function handleNameInput(event: Event): void {
		onRename((event.currentTarget as HTMLInputElement).value);
	}

	function handleSelectedSave(event: Event): void {
		selectedSaveId = (event.currentTarget as HTMLSelectElement).value;
	}
</script>

<div class={['grid min-w-0 gap-3', compact ? 'max-w-xl' : '']}>
		<label class="grid min-w-0 gap-1">
			<span class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Game Name</span>
			<input
				data-testid="game-name-input"
				class="w-full min-w-0 border border-line bg-white px-3 py-2 text-neutral-950 outline-none focus:border-accent"
				type="text"
				value={gameName}
				oninput={handleNameInput}
			/>
		</label>

		<label class="grid min-w-0 gap-1">
			<span class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Other Games</span>
			<select
				data-testid="saved-game-select"
				class="w-full min-w-0 cursor-pointer border border-line bg-white px-3 py-2 text-neutral-950 outline-none focus:border-accent"
				bind:value={selectedSaveId}
				onchange={handleSelectedSave}
			>
				{#if savedGames.length === 0}
					<option value="">No saved games yet</option>
				{:else}
					{#each savedGames as savedGame}
						<option value={savedGame.id}>{savedGame.name}</option>
					{/each}
				{/if}
			</select>
		</label>

		<div class="flex flex-wrap gap-2">
			<button
				type="button"
				data-testid="new-game-button"
				class="cursor-pointer border border-neutral-950 bg-neutral-950 px-4 py-2 font-semibold text-white hover:bg-accent-dark"
				onclick={onNewGame}
			>
				New Game
			</button>
			<button
				type="button"
				data-testid="load-game-button"
				class="cursor-pointer border border-accent px-4 py-2 font-semibold text-accent hover:bg-accent hover:text-white disabled:cursor-not-allowed disabled:border-neutral-300 disabled:text-neutral-400 disabled:hover:bg-white disabled:hover:text-neutral-400"
				disabled={!selectedSaveExists || selectedSaveId === currentSaveId}
				onclick={() => onLoad(selectedSaveId)}
			>
				Load
			</button>
			<button
				type="button"
				data-testid="delete-game-button"
				class="cursor-pointer border border-neutral-400 px-4 py-2 font-semibold text-neutral-700 hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:border-neutral-300 disabled:text-neutral-400"
				disabled={!selectedSaveExists}
				onclick={() => onDelete(selectedSaveId)}
			>
				Delete
			</button>
		</div>
</div>
