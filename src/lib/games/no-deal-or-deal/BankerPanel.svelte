<script lang="ts">
	import { formatMoney } from './noDealOrDealGameLogic';
	import type { NoDealOrDealGameState } from './noDealOrDealTypes';

	interface Props {
		game: NoDealOrDealGameState;
		onDeal: () => void;
		onNoDeal: () => void;
		onSkip: () => void;
	}

	let { game, onDeal, onNoDeal, onSkip }: Props = $props();
</script>

<section class="border border-line bg-white p-4">
	<h2 class="text-xl font-bold text-neutral-950">Banker Offer</h2>

	{#if game.pauseRunning}
		<div class="mt-4 border border-accent bg-yellow-50 p-4">
			<p class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Please hold</p>
			<p class="mt-1 text-xl font-bold text-neutral-950">{game.pauseMessage}</p>
			<button
				type="button"
				class="mt-4 cursor-pointer border border-neutral-950 bg-neutral-950 px-4 py-2 font-semibold text-white hover:bg-accent-dark"
				onclick={() => onSkip()}
			>
				Skip
			</button>
		</div>
	{:else if game.currentOffer && game.phase === 'banker-offer'}
		<div class="mt-4 border border-accent bg-yellow-50 p-4">
			<p class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Current Offer</p>
			<p class="mt-1 text-3xl font-bold text-neutral-950">{formatMoney(game.currentOffer.offerAmount)}</p>
			<p class="mt-2 text-sm text-neutral-700">{game.currentOffer.offerExplanation}</p>
			<div class="mt-4 grid grid-cols-2 gap-3">
				<button
					type="button"
					class="cursor-pointer border border-neutral-950 bg-neutral-950 px-4 py-3 font-semibold text-white hover:bg-accent-dark"
					onclick={() => onDeal()}
				>
					Deal
				</button>
				<button
					type="button"
					class="cursor-pointer border border-accent bg-white px-4 py-3 font-semibold text-accent hover:bg-yellow-50"
					onclick={() => onNoDeal()}
				>
					No Deal
				</button>
			</div>
			<details class="mt-4 border border-line bg-white p-3 text-sm">
				<summary class="cursor-pointer font-semibold">Offer Details</summary>
				<dl class="mt-3 grid gap-2">
					<div class="flex justify-between gap-4">
						<dt>Expected value</dt>
						<dd class="font-semibold">{formatMoney(game.currentOffer.expectedValue)}</dd>
					</div>
					<div class="flex justify-between gap-4">
						<dt>Median value</dt>
						<dd class="font-semibold">{formatMoney(game.currentOffer.medianValue)}</dd>
					</div>
					<div class="flex justify-between gap-4">
						<dt>Highest remaining</dt>
						<dd class="font-semibold">{formatMoney(game.currentOffer.maxRemaining)}</dd>
					</div>
					<div class="flex justify-between gap-4">
						<dt>Offer percent</dt>
						<dd class="font-semibold">
							{Math.round((game.currentOffer.offerAmount / game.currentOffer.expectedValue) * 100)}%
						</dd>
					</div>
				</dl>
			</details>
		</div>
	{:else}
		<p class="mt-4 border border-line bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
			Open the required cases to receive the next offer.
		</p>
	{/if}
</section>
