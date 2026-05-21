<script lang="ts">
	import { formatMoney } from './noDealOrDealGameLogic';
	import type { NoDealOrDealGameState } from './noDealOrDealTypes';

	interface Props {
		game: NoDealOrDealGameState;
	}

	let { game }: Props = $props();
</script>

<section class="border border-line bg-white p-4">
	<h2 class="text-xl font-bold text-neutral-950">Offer History</h2>
	<div class="mt-4 overflow-x-auto">
		<table class="w-full min-w-[620px] border-collapse text-sm">
			<thead>
				<tr class="bg-neutral-100 text-left text-neutral-600">
					<th class="border border-line px-3 py-2">Offer</th>
					<th class="border border-line px-3 py-2">Cases</th>
					<th class="border border-line px-3 py-2">Banker</th>
					<th class="border border-line px-3 py-2">Expected</th>
					<th class="border border-line px-3 py-2">Percent</th>
					<th class="border border-line px-3 py-2">Decision</th>
				</tr>
			</thead>
			<tbody>
				{#if game.offerHistory.length === 0}
					<tr>
						<td class="border border-line px-3 py-2 text-neutral-500" colspan="6">
							Offers will appear here.
						</td>
					</tr>
				{:else}
					{#each game.offerHistory as offer}
						<tr class={offer.decision === 'Pending' ? 'bg-yellow-50' : 'bg-white'}>
							<td class="border border-line px-3 py-2 font-semibold">{offer.id}</td>
							<td class="border border-line px-3 py-2">{offer.casesRemaining}</td>
							<td class="border border-line px-3 py-2 font-semibold">{formatMoney(offer.offerAmount)}</td>
							<td class="border border-line px-3 py-2">{formatMoney(offer.expectedValue)}</td>
							<td class="border border-line px-3 py-2">
								{Math.round((offer.offerAmount / offer.expectedValue) * 100)}%
							</td>
							<td class="border border-line px-3 py-2">{offer.decision}</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</section>
