<script lang="ts">
	import type { CaseNumber, CaseState } from './noDealOrDealTypes';
	import { formatMoney } from './noDealOrDealGameLogic';

	interface Props {
		caseState: CaseState;
		playerCaseNumber: CaseNumber | null;
		recentOpenedCaseNumber: CaseNumber | null;
		disabled?: boolean;
		compact?: boolean;
		onChoose: (caseNumber: CaseNumber) => void;
	}

	let {
		caseState,
		playerCaseNumber,
		recentOpenedCaseNumber,
		disabled = false,
		compact = false,
		onChoose
	}: Props = $props();

	let isPlayerCase = $derived(caseState.number === playerCaseNumber);
	let isRecent = $derived(caseState.number === recentOpenedCaseNumber);
	let canClick = $derived(!disabled && caseState.status === 'available');
</script>

<button
	type="button"
	class={[
		'grid border-2 text-center font-bold transition-colors',
		compact ? 'min-h-14 w-full min-w-0 px-2 py-1 lg:w-16' : 'min-h-16 px-2 py-2',
		canClick ? 'cursor-pointer hover:border-accent hover:bg-yellow-50' : 'cursor-not-allowed',
		isPlayerCase
			? 'border-accent bg-accent text-white'
			: caseState.status === 'opened'
				? 'border-line bg-neutral-100 text-neutral-500'
				: isRecent
					? 'border-accent bg-yellow-50 text-neutral-950'
					: 'border-line bg-white text-neutral-950'
	]}
	disabled={!canClick}
	aria-label={caseState.status === 'opened'
		? `Case ${caseState.number} opened for ${formatMoney(caseState.amount)}`
		: isPlayerCase
			? `Your case ${caseState.number}`
			: `Open case ${caseState.number}`}
	onclick={() => onChoose(caseState.number)}
>
	<span class={compact ? 'text-lg leading-none' : 'text-lg'}>#{caseState.number}</span>
	{#if isPlayerCase}
		<span class="mt-1 text-xs uppercase">Your Case</span>
	{:else if caseState.status === 'opened'}
		<span class="mt-1 text-xs uppercase">Opened</span>
		{#if !compact}
			<span class="mt-1 text-xs">{formatMoney(caseState.amount)}</span>
		{/if}
	{:else}
		<span class="mt-1 text-xs uppercase text-neutral-500">Closed</span>
	{/if}
</button>
