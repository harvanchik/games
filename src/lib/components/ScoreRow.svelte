<script lang="ts">
	import type { CategoryDefinition } from '$lib/types';

	interface Props {
		category: CategoryDefinition;
		playerId: number;
		chosenScore: number | null;
		possibleScore: number | null;
		canHighlight: boolean;
		canScore: boolean;
		recentlySelected: boolean;
		onChoose: () => void;
	}

	let {
		category,
		playerId,
		chosenScore,
		possibleScore,
		canHighlight,
		canScore,
		recentlySelected,
		onChoose
	}: Props = $props();
</script>

<tr
	data-testid={`score-row-${playerId}-${category.id}`}
	class={[
		chosenScore === null ? 'bg-white' : 'bg-neutral-50 text-neutral-500',
		canHighlight ? 'bg-yellow-50' : '',
		recentlySelected ? 'bg-green-50 text-neutral-950' : ''
	]}
>
	<th class="scorecard-category-cell border border-line px-3 py-2 text-left font-semibold" scope="row">
		{category.name}
	</th>
	<td class="scorecard-rule-cell border border-line px-3 py-2 text-sm text-neutral-600">{category.description}</td>
	<td class="border border-line px-3 py-2 text-center font-semibold">
		{possibleScore === null ? '-' : possibleScore}
	</td>
	<td class="border border-line px-3 py-2 text-center">
		{#if chosenScore !== null}
			<span
				class="block w-full border border-transparent px-3 py-1 font-bold text-neutral-950"
				aria-label={`Chosen score ${chosenScore}`}
			>
				{chosenScore}
			</span>
		{:else}
			<button
				type="button"
				data-testid={`score-${playerId}-${category.id}`}
				class="w-full cursor-pointer border border-accent px-3 py-1 font-semibold text-accent hover:bg-accent hover:text-white disabled:cursor-not-allowed disabled:border-neutral-300 disabled:text-neutral-400 disabled:hover:bg-white disabled:hover:text-neutral-400"
				disabled={!canScore}
				onclick={onChoose}
			>
				Score
			</button>
		{/if}
	</td>
</tr>
