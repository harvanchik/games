<script lang="ts">
	import CaseCard from './CaseCard.svelte';
	import { PRIZE_AMOUNTS, formatMoney } from './noDealOrDealGameLogic';
	import type { CaseNumber, NoDealOrDealGameState, PrizeAmount } from './noDealOrDealTypes';

	interface Props {
		game: NoDealOrDealGameState;
		disabled?: boolean;
		onChooseCase: (caseNumber: CaseNumber) => void;
	}

	let { game, disabled = false, onChooseCase }: Props = $props();

	const caseRows: CaseNumber[][] = [
		[1, 2, 3, 4, 5, 6, 7],
		[8, 9, 10, 11, 12, 13],
		[14, 15, 16, 17, 18, 19, 20],
		[21, 22, 23, 24, 25, 26]
	];

	let openedAmounts = $derived(
		new Set(game.cases.filter((caseState) => caseState.status === 'opened').map((caseState) => caseState.amount))
	);
	let lowPrizes = $derived(PRIZE_AMOUNTS.slice(0, 13));
	let highPrizes = $derived(PRIZE_AMOUNTS.slice(13));

	function getCase(caseNumber: CaseNumber) {
		return game.cases.find((caseState) => caseState.number === caseNumber);
	}

	function prizeClass(amount: PrizeAmount): string {
		if (game.recentRemovedAmount === amount) return 'border-accent bg-yellow-50 text-neutral-950';
		if (openedAmounts.has(amount)) return 'border-line bg-neutral-100 text-neutral-400 line-through';
		return 'border-line bg-white text-neutral-950';
	}
</script>

<section class="min-w-0 border border-line bg-white p-4">
	<div class="mb-4 flex flex-wrap items-end justify-between gap-3">
		<div>
			<h2 class="text-xl font-bold text-neutral-950">Cases</h2>
			<p class="text-sm text-neutral-600">
				{game.playerCaseNumber ? 'Open the remaining cases.' : 'Choose one case to keep.'}
			</p>
		</div>
		{#if game.playerCaseNumber}
			<p class="border border-accent bg-yellow-50 px-3 py-2 text-sm font-semibold">
				Your Case: #{game.playerCaseNumber}
			</p>
		{/if}
	</div>

	<div class="case-stage-grid">
		<div class="case-prize-column" aria-label="Low prize amounts">
			{#each lowPrizes as amount}
				<div class={['border px-2 py-1 text-right text-xs font-semibold', prizeClass(amount)]}>
					<span class="sr-only">{openedAmounts.has(amount) ? 'Removed' : 'Remaining'} </span>
					{formatMoney(amount)}
				</div>
			{/each}
		</div>

		<div class="grid content-center gap-3 border border-line bg-neutral-50 p-3">
			<div class="case-board-rows grid gap-2" aria-label="Case board">
				{#each caseRows as row}
					<div class="case-row flex justify-center gap-2">
						{#each row as caseNumber}
							{@const caseState = getCase(caseNumber)}
							{#if caseState}
								<CaseCard
									{caseState}
									playerCaseNumber={game.playerCaseNumber}
									recentOpenedCaseNumber={game.recentOpenedCaseNumber}
									disabled={disabled || game.pauseRunning}
									compact={true}
									onChoose={onChooseCase}
								/>
							{/if}
						{/each}
					</div>
				{/each}
			</div>

			<div class="grid gap-2 border-t border-line pt-3 sm:grid-cols-[auto_1fr]">
				<div class="border border-accent bg-yellow-50 px-3 py-2 text-center">
					<p class="text-xs font-semibold uppercase tracking-wide text-neutral-500">Your Case</p>
					<p class="text-xl font-bold">{game.playerCaseNumber ? `#${game.playerCaseNumber}` : '?'}</p>
				</div>
				<div class="grid place-items-center border border-line bg-white px-3 py-2 text-center text-sm font-semibold">
					{game.statusMessage}
				</div>
			</div>
		</div>

		<div class="case-prize-column" aria-label="High prize amounts">
			{#each highPrizes as amount}
				<div class={['border px-2 py-1 text-right text-xs font-semibold', prizeClass(amount)]}>
					<span class="sr-only">{openedAmounts.has(amount) ? 'Removed' : 'Remaining'} </span>
					{formatMoney(amount)}
				</div>
			{/each}
		</div>
	</div>
</section>

<style>
	.case-stage-grid {
		display: grid;
		gap: 0.75rem;
		grid-template-columns: minmax(5.75rem, 7rem) minmax(0, 1fr) minmax(6.5rem, 8rem);
		max-width: 100%;
		width: 100%;
	}

	.case-prize-column {
		align-content: stretch;
		display: grid;
		gap: 0.35rem;
	}

	@media (max-width: 980px) {
		.case-stage-grid {
			grid-template-columns: 1fr;
			min-width: 0;
		}

		.case-prize-column {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			min-width: 0;
		}
	}

	@media (max-width: 680px) {
		.case-row {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>
