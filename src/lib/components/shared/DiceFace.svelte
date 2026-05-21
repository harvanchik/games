<script lang="ts">
	type DiceValue = 1 | 2 | 3 | 4 | 5 | 6;

	interface Props {
		value: DiceValue;
		faded?: boolean;
		held?: boolean;
		rolling?: boolean;
		highlighted?: boolean;
		celebrating?: boolean;
		label?: string;
		onclick?: () => void;
		disabled?: boolean;
	}

	let {
		value,
		faded = false,
		held = false,
		rolling = false,
		highlighted = false,
		celebrating = false,
		label = `Die showing ${value}`,
		onclick,
		disabled = false
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

<button
	type="button"
	class={[
		'grid aspect-square min-h-16 grid-cols-3 grid-rows-3 place-items-center border-2 p-3',
		onclick && !disabled ? 'cursor-pointer' : 'cursor-default',
		celebrating ? 'dice-face-celebrate' : '',
		held
			? 'border-accent bg-accent'
			: rolling
				? 'border-accent bg-neutral-50'
				: highlighted
					? 'border-accent bg-yellow-50'
					: 'border-neutral-300 bg-white'
	]}
	disabled={disabled}
	aria-label={label}
	onclick={() => onclick?.()}
>
	{#each pipPositions[value] as position}
		<span
			class={[
				'pip',
				`pip-${position}`,
				held ? 'bg-white' : 'bg-neutral-950',
				faded ? 'opacity-25' : 'opacity-100'
			]}
		></span>
	{/each}
</button>

<style>
	.pip {
		width: clamp(0.5rem, 28%, 1rem);
		aspect-ratio: 1;
		border-radius: 9999px !important;
	}

	.pip-top-left {
		grid-area: 1 / 1;
	}

	.pip-top-right {
		grid-area: 1 / 3;
	}

	.pip-middle-left {
		grid-area: 2 / 1;
	}

	.pip-center {
		grid-area: 2 / 2;
	}

	.pip-middle-right {
		grid-area: 2 / 3;
	}

	.pip-bottom-left {
		grid-area: 3 / 1;
	}

	.pip-bottom-right {
		grid-area: 3 / 3;
	}

	.dice-face-celebrate {
		animation: dice-face-celebrate 0.7s ease-in-out 3;
	}

	@keyframes dice-face-celebrate {
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
