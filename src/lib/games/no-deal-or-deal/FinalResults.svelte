<script lang="ts">
	import { calculateFinalStats, formatMoney } from './noDealOrDealGameLogic';
	import type { NoDealOrDealGameState } from './noDealOrDealTypes';

	interface Props {
		game: NoDealOrDealGameState;
	}

	let { game }: Props = $props();
	let stats = $derived(calculateFinalStats(game));
</script>

{#if game.finalResult}
	<section class="border border-accent bg-white p-5">
		<h2 class="text-xl font-bold text-neutral-950">Final Results</h2>
		<div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			<div class="border border-line p-3">
				<p class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Final Winnings</p>
				<p class="mt-1 text-2xl font-bold">{formatMoney(game.finalResult.finalWinnings)}</p>
			</div>
			<div class="border border-line p-3">
				<p class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Your Case</p>
				<p class="mt-1 text-2xl font-bold">{formatMoney(game.finalResult.playerCaseValue)}</p>
			</div>
			<div class="border border-line p-3">
				<p class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Highest Offer</p>
				<p class="mt-1 text-2xl font-bold">
					{stats.highestOffer ? formatMoney(stats.highestOffer.offerAmount) : '-'}
				</p>
			</div>
			<div class="border border-line p-3">
				<p class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Difference</p>
				<p class="mt-1 text-2xl font-bold">{formatMoney(Math.abs(game.finalResult.differenceFromCase))}</p>
			</div>
		</div>

		<p class="mt-4 border border-line bg-neutral-50 px-3 py-2 text-sm">
			{#if game.finalResult.finalChoice === 'deal'}
				{game.finalResult.goodDeal ? 'Good deal.' : 'The case had more than the deal.'}
				The accepted deal was {formatMoney(game.finalResult.acceptedDealAmount ?? 0)}.
			{:else}
				You {game.finalResult.finalChoice === 'keep' ? 'kept your case' : 'swapped cases'} and won
				{formatMoney(game.finalResult.finalWinnings)}.
			{/if}
			{#if game.finalResult.otherCaseNumber}
				The other case, #{game.finalResult.otherCaseNumber}, held {formatMoney(game.finalResult.otherCaseValue ?? 0)}.
			{/if}
		</p>
	</section>
{/if}
