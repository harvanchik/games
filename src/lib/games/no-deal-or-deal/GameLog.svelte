<script lang="ts">
	import type { NoDealOrDealGameState } from './noDealOrDealTypes';

	interface Props {
		game: NoDealOrDealGameState;
	}

	let { game }: Props = $props();
</script>

<section class="border border-line bg-white p-4">
	<h2 class="text-xl font-bold text-neutral-950">Game Log</h2>
	<div class="mt-4 max-h-64 overflow-y-auto pr-1">
		{#if game.gameLog.length === 0}
			<p class="border border-line bg-neutral-50 px-3 py-2 text-sm text-neutral-500">
				Game events will appear here.
			</p>
		{:else}
			<div class="grid gap-2">
				{#each game.gameLog as entry}
					<p class="border border-line px-3 py-2 text-sm">{entry.message}</p>
				{/each}
			</div>
		{/if}
	</div>
</section>
