<script lang="ts">
	type DiceValue = 1 | 2 | 3 | 4 | 5 | 6;

	interface Props {
		values: DiceValue[];
		label?: string;
		highlightedIndexes?: number[];
		celebrationIndexes?: number[];
	}

	let {
		values,
		label = 'Dice roll',
		highlightedIndexes = [],
		celebrationIndexes = []
	}: Props = $props();

	const pipPositions: Record<DiceValue, string[]> = {
		1: ['center'],
		2: ['top-left', 'bottom-right'],
		3: ['top-left', 'center', 'bottom-right'],
		4: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
		5: ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'],
		6: ['top-left', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-right']
	};
</script>

<span class="inline-flex items-center gap-1 align-middle" aria-label={label}>
	{#each values as value, index}
		<span
			class={[
				'mini-die grid grid-cols-3 grid-rows-3 place-items-center border',
				highlightedIndexes.includes(index) ? 'border-accent bg-yellow-50' : 'border-neutral-300 bg-white',
				celebrationIndexes.includes(index) ? 'mini-die-celebrate' : ''
			]}
			aria-label={`Die showing ${value}`}
		>
			{#each pipPositions[value] as position}
				<span class={['mini-pip', `mini-pip-${position}`, 'bg-neutral-950']}></span>
			{/each}
		</span>
	{/each}
</span>

<style>
	.mini-die {
		height: 1.25rem;
		width: 1.25rem;
		padding: 0.2rem;
	}

	.mini-pip {
		display: block;
		height: 0.2rem;
		border-radius: 9999px !important;
		width: 0.2rem;
	}

	.mini-pip-top-left {
		grid-area: 1 / 1;
	}

	.mini-pip-top-right {
		grid-area: 1 / 3;
	}

	.mini-pip-middle-left {
		grid-area: 2 / 1;
	}

	.mini-pip-center {
		grid-area: 2 / 2;
	}

	.mini-pip-middle-right {
		grid-area: 2 / 3;
	}

	.mini-pip-bottom-left {
		grid-area: 3 / 1;
	}

	.mini-pip-bottom-right {
		grid-area: 3 / 3;
	}

	.mini-die-celebrate {
		animation: mini-die-celebrate 0.7s ease-in-out 3;
	}

	@keyframes mini-die-celebrate {
		0%,
		100% {
			background: #fffbeb;
		}

		50% {
			background: #fef3c7;
			border-color: #8f5252;
		}
	}
</style>
