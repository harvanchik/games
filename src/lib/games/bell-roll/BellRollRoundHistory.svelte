<script lang="ts">
	import type { BellRollGameState } from './bellRollTypes';

	interface Props {
		game: BellRollGameState;
	}

	let { game }: Props = $props();
</script>

<section class="border border-line bg-white p-4">
	<h2 class="text-xl font-bold text-neutral-950">Round History</h2>
	<div class="mt-4 overflow-x-auto">
		<table class="w-full min-w-[560px] border-collapse text-sm">
			<thead>
				<tr class="bg-neutral-100 text-left text-neutral-600">
					<th class="border border-line px-3 py-2">Set</th>
					<th class="border border-line px-3 py-2">Round</th>
					<th class="border border-line px-3 py-2">Target</th>
					<th class="border border-line px-3 py-2">Winner</th>
					<th class="border border-line px-3 py-2">High</th>
					<th class="border border-line px-3 py-2">Perfect</th>
					<th class="border border-line px-3 py-2">Mini</th>
				</tr>
			</thead>
			<tbody>
				{#if game.roundHistory.length === 0}
					<tr>
						<td class="border border-line px-3 py-3 text-neutral-500" colspan="7">
							Completed rounds will appear here.
						</td>
					</tr>
				{:else}
					{#each game.roundHistory as round}
						<tr>
							<td class="border border-line px-3 py-2">{round.set}</td>
							<td class="border border-line px-3 py-2">{round.round}</td>
							<td class="border border-line px-3 py-2">{round.target}</td>
							<td class="border border-line px-3 py-2 font-semibold">{round.winners}</td>
							<td class="border border-line px-3 py-2">{round.highestScore}</td>
							<td class="border border-line px-3 py-2">{round.perfectTriples}</td>
							<td class="border border-line px-3 py-2">{round.miniTriples}</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</section>
