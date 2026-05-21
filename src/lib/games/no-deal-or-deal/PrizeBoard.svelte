<script lang="ts">
	import { PRIZE_AMOUNTS, formatMoney } from './noDealOrDealGameLogic';
	import type { NoDealOrDealGameState, PrizeAmount } from './noDealOrDealTypes';

	interface Props {
		game: NoDealOrDealGameState;
	}

	let { game }: Props = $props();

	let openedAmounts = $derived(
		new Set(game.cases.filter((caseState) => caseState.status === 'opened').map((caseState) => caseState.amount))
	);
	let leftPrizes = $derived(PRIZE_AMOUNTS.slice(0, 13));
	let rightPrizes = $derived(PRIZE_AMOUNTS.slice(13));

	function prizeClass(amount: PrizeAmount): string {
		if (game.recentRemovedAmount === amount) return 'border-accent bg-yellow-50 text-neutral-950';
		if (openedAmounts.has(amount)) return 'border-line bg-neutral-100 text-neutral-400 line-through';
		return 'border-line bg-white text-neutral-950';
	}
</script>

<section class="border border-line bg-white p-4">
	<h2 class="text-xl font-bold text-neutral-950">Prize Board</h2>
	<div class="mt-4 grid grid-cols-2 gap-3">
		<div class="grid gap-2">
			{#each leftPrizes as amount}
				<div class={['border px-3 py-2 text-sm font-semibold', prizeClass(amount)]}>
					<span class="sr-only">{openedAmounts.has(amount) ? 'Removed' : 'Remaining'} </span>
					{formatMoney(amount)}
				</div>
			{/each}
		</div>
		<div class="grid gap-2">
			{#each rightPrizes as amount}
				<div class={['border px-3 py-2 text-sm font-semibold', prizeClass(amount)]}>
					<span class="sr-only">{openedAmounts.has(amount) ? 'Removed' : 'Remaining'} </span>
					{formatMoney(amount)}
				</div>
			{/each}
		</div>
	</div>
</section>
