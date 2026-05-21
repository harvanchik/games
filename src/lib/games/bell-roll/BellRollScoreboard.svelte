<script lang="ts">
	import type { BellRollGameState } from './bellRollTypes';

	interface Props {
		game: BellRollGameState;
		currentPlayerId: number;
		nextPlayerId: number;
		onEditPlayer: (playerId: number) => void;
	}

	let { game, currentPlayerId, nextPlayerId, onEditPlayer }: Props = $props();

	let rows = $derived(
		[...game.players]
			.filter((player) => !player.ghost)
			.sort((a, b) => {
				const aStats = game.stats[a.id];
				const bStats = game.stats[b.id];
				return (
					bStats.wins + bStats.roundWins - (aStats.wins + aStats.roundWins) ||
					bStats.totalPoints - aStats.totalPoints ||
					a.name.localeCompare(b.name)
				);
			})
	);
</script>

<section class="border border-line bg-white p-4">
	<h2 class="text-xl font-bold text-neutral-950">Scoreboard</h2>
	<div class="mt-4 overflow-x-auto">
		<table class="w-full min-w-[620px] border-collapse text-sm">
			<thead>
				<tr class="bg-neutral-100 text-left text-neutral-600">
					<th class="border border-line px-3 py-2">Player</th>
					<th class="border border-line px-3 py-2">Wins</th>
					<th class="border border-line px-3 py-2">Losses</th>
					<th class="border border-line px-3 py-2">Perfect</th>
					<th class="border border-line px-3 py-2">Mini</th>
					<th class="border border-line px-3 py-2">Points</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as player}
					{@const stats = game.stats[player.id]}
					<tr class={player.id === currentPlayerId ? 'bg-yellow-50' : 'bg-white'}>
						<td class="border border-line px-3 py-2 font-semibold">
							<button
								type="button"
								class="cursor-pointer text-left font-semibold hover:text-accent"
								ondblclick={() => onEditPlayer(player.id)}
								title="Double click to edit player"
							>
								{player.name}
							</button>
							{#if player.id === currentPlayerId && !game.gameOver}
								<span class="ml-1 text-xs uppercase text-accent">Turn</span>
							{/if}
							{#if player.id === nextPlayerId && player.id !== currentPlayerId && !game.gameOver}
								<span class="ml-1 text-xs uppercase text-neutral-500">Next</span>
							{/if}
						</td>
						<td class="border border-line px-3 py-2">{stats.wins + stats.roundWins}</td>
						<td class="border border-line px-3 py-2">{stats.losses + stats.roundLosses}</td>
						<td class="border border-line px-3 py-2">{stats.perfectTriples}</td>
						<td class="border border-line px-3 py-2">{stats.miniTriples}</td>
						<td class="border border-line px-3 py-2 font-semibold">{stats.totalPoints}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>
