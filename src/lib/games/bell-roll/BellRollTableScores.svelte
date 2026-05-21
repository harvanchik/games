<script lang="ts">
	import type { BellRollGameState } from './bellRollTypes';

	interface Props {
		game: BellRollGameState;
	}

	let { game }: Props = $props();

	function playerName(id: number): string {
		return game.players.find((player) => player.id === id)?.name ?? 'Unknown';
	}
</script>

<section class="border border-line bg-white p-4">
	<h2 class="text-xl font-bold text-neutral-950">
		{game.mode === 'quick' ? 'Round Scores' : 'Table Scores'}
	</h2>

	{#if game.mode === 'quick'}
		<div class="mt-4 grid gap-2">
			{#each game.players.filter((player) => !player.ghost) as player}
				<div class="grid grid-cols-[1fr_auto] border border-line px-3 py-2">
					<p class="font-semibold">{player.name}</p>
					<p>{game.quick.roundScores[player.id] ?? 0}</p>
				</div>
			{/each}
		</div>
	{:else}
		<div class="mt-4 grid gap-3 lg:grid-cols-2">
			{#each game.party.tables as table, index}
				<div class={['border p-3', index === game.party.activeTableIndex ? 'border-accent bg-yellow-50' : 'border-line bg-white']}>
					<div class="flex items-center justify-between gap-3">
						<h3 class="font-bold">{table.name}</h3>
						{#if table.isHead}
							<span class="text-xs font-semibold uppercase text-accent">Head Table</span>
						{/if}
					</div>

					<div class="mt-3 grid gap-2">
						<div class="grid grid-cols-[1fr_auto] border border-line bg-white px-3 py-2">
							<p>
								Team A:
								<span class="font-semibold">{table.teamA.playerIds.map(playerName).join(' / ')}</span>
							</p>
							<p class="font-bold">{table.teamA.score}</p>
						</div>
						<div class="grid grid-cols-[1fr_auto] border border-line bg-white px-3 py-2">
							<p>
								Team B:
								<span class="font-semibold">{table.teamB.playerIds.map(playerName).join(' / ')}</span>
							</p>
							<p class="font-bold">{table.teamB.score}</p>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</section>
