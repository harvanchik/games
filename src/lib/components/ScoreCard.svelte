<script lang="ts">
	import {
		CATEGORY_DEFINITIONS,
		getBaseTotal,
		getFinalTotal,
		getLowerSubtotal,
		getUpperBonus,
		getUpperSubtotal,
		scoreCategory
	} from '$lib/scoring';
	import type { DiceValue, Player, ScoreCategory } from '$lib/types';
	import ScoreRow from './ScoreRow.svelte';

	interface Props {
		player: Player;
		diceValues: DiceValue[];
		rollCount: number;
		active: boolean;
		gameOver: boolean;
		recentScore: { playerId: number; category: ScoreCategory } | null;
		canScoreCategory: (category: ScoreCategory) => boolean;
		onChooseScore: (category: ScoreCategory) => void;
	}

	let {
		player,
		diceValues,
		rollCount,
		active,
		gameOver,
		recentScore,
		canScoreCategory,
		onChooseScore
	}: Props = $props();

	let upperRows = $derived(CATEGORY_DEFINITIONS.filter((category) => category.section === 'upper'));
	let lowerRows = $derived(CATEGORY_DEFINITIONS.filter((category) => category.section === 'lower'));
	let upperSubtotal = $derived(getUpperSubtotal(player.scores));
	let upperBonus = $derived(getUpperBonus(player.scores));
	let lowerSubtotal = $derived(getLowerSubtotal(player.scores));
	let baseTotal = $derived(getBaseTotal(player.scores));
	let finalTotal = $derived(getFinalTotal(player.scores, player.fiveKindBonuses));

	function getPossibleScore(category: ScoreCategory): number | null {
		return rollCount > 0 && player.scores[category] === null
			? scoreCategory(category, diceValues, player.scores)
			: null;
	}

	function isRecentlySelected(category: ScoreCategory): boolean {
		return recentScore?.playerId === player.id && recentScore.category === category;
	}
</script>

<section class={['border bg-white', active && !gameOver ? 'border-accent' : 'border-line']}>
	<div class="scorecard-scroll overflow-x-auto">
		<table class="scorecard-table w-full min-w-[720px] border-collapse text-sm">
			<colgroup>
				<col class="scorecard-category-col" />
				<col class="scorecard-rule-col" />
				<col class="scorecard-possible-col" />
				<col class="scorecard-chosen-col" />
			</colgroup>
			<thead class="bg-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-600">
				<tr>
					<th class="border border-line px-3 py-2">Category</th>
					<th class="scorecard-rule-heading border border-line px-3 py-2">Rule</th>
					<th class="border border-line px-3 py-2 text-center">Possible</th>
					<th class="border border-line px-3 py-2 text-center">Chosen</th>
				</tr>
			</thead>
			<tbody>
				{#each upperRows as category}
					<ScoreRow
						{category}
						playerId={player.id}
						chosenScore={player.scores[category.id]}
						possibleScore={getPossibleScore(category.id)}
						canScore={active && !gameOver && canScoreCategory(category.id)}
						recentlySelected={isRecentlySelected(category.id)}
						onChoose={() => onChooseScore(category.id)}
					/>
				{/each}
				<tr class="bg-neutral-100 font-semibold">
					<td class="border border-line px-3 py-2" colspan="2">Upper Subtotal</td>
					<td class="border border-line px-3 py-2 text-center" colspan="2">{upperSubtotal}</td>
				</tr>
				<tr class="bg-neutral-100 font-semibold">
					<td class="border border-line px-3 py-2" colspan="2">Upper Bonus (35 at 63+)</td>
					<td class="border border-line px-3 py-2 text-center" colspan="2">{upperBonus}</td>
				</tr>
				<tr class="bg-neutral-100 font-semibold">
					<td class="border border-line px-3 py-2" colspan="2">Upper Total</td>
					<td class="border border-line px-3 py-2 text-center" colspan="2">{upperSubtotal + upperBonus}</td>
				</tr>

				{#each lowerRows as category}
					<ScoreRow
						{category}
						playerId={player.id}
						chosenScore={player.scores[category.id]}
						possibleScore={getPossibleScore(category.id)}
						canScore={active && !gameOver && canScoreCategory(category.id)}
						recentlySelected={isRecentlySelected(category.id)}
						onChoose={() => onChooseScore(category.id)}
					/>
				{/each}
				<tr class="bg-neutral-100 font-semibold">
					<td class="border border-line px-3 py-2" colspan="2">Lower Subtotal</td>
					<td class="border border-line px-3 py-2 text-center" colspan="2">{lowerSubtotal}</td>
				</tr>
				<tr class="bg-neutral-100 font-semibold">
					<td class="border border-line px-3 py-2" colspan="2">Bonus Five of a Kinds</td>
					<td class="border border-line px-3 py-2 text-center" colspan="2">
						{player.fiveKindBonuses} x 100 = {player.fiveKindBonuses * 100}
					</td>
				</tr>
				<tr class="bg-neutral-900 font-bold text-white">
					<td class="border border-neutral-900 px-3 py-2" colspan="2">Final Total</td>
					<td class="border border-neutral-900 px-3 py-2 text-center" colspan="2">
						{baseTotal} + {player.fiveKindBonuses * 100} = {finalTotal}
					</td>
				</tr>
			</tbody>
		</table>
	</div>
</section>
