<script lang="ts">
	import type { BellRollGameState, BellRollPlayer } from './bellRollTypes';

	interface Props {
		game: BellRollGameState;
		rankings: BellRollPlayer[];
	}

	let { game, rankings }: Props = $props();

	function statValue(playerId: number, field: 'wins' | 'perfectTriples' | 'miniTriples' | 'totalPoints' | 'losses'): number {
		const stats = game.stats[playerId];
		if (field === 'wins') return stats.wins + stats.roundWins;
		if (field === 'losses') return stats.losses + stats.roundLosses;
		return stats[field];
	}

	function award(field: 'wins' | 'perfectTriples' | 'miniTriples' | 'totalPoints' | 'losses'): string {
		const best = Math.max(...rankings.map((player) => statValue(player.id, field)));
		return rankings
			.filter((player) => statValue(player.id, field) === best)
			.map((player) => player.name)
			.join(', ');
	}
</script>

{#if game.gameOver}
	<section class="border border-accent bg-white p-4">
		<h2 class="text-xl font-bold text-neutral-950">Final Results</h2>
		<p class="mt-1 text-neutral-700">
			Winner: <span class="font-semibold">{rankings[0]?.name ?? 'No winner'}</span>
		</p>

		<div class="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
			<div class="border border-line">
				{#each rankings as player, index}
					{@const stats = game.stats[player.id]}
					<div class="grid grid-cols-[auto_1fr_auto] gap-3 border-b border-line px-3 py-2 last:border-b-0">
						<p>{index + 1}</p>
						<p class="font-semibold">{player.name}</p>
						<p>{stats.totalPoints} pts</p>
					</div>
				{/each}
			</div>

			<div class="grid gap-2 text-sm">
				<p><span class="font-semibold">Most Wins:</span> {award('wins')}</p>
				<p><span class="font-semibold">Most Perfect Triples:</span> {award('perfectTriples')}</p>
				<p><span class="font-semibold">Most Mini Triples:</span> {award('miniTriples')}</p>
				<p><span class="font-semibold">Highest Total Points:</span> {award('totalPoints')}</p>
				<p><span class="font-semibold">Most Losses:</span> {award('losses')}</p>
			</div>
		</div>
	</section>
{/if}
