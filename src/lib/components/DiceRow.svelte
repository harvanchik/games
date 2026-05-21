<script lang="ts">
	import { onDestroy } from 'svelte';
	import { createDiceScrambleDurations } from '$lib/utils/diceAnimation';
	import type { Dice } from '$lib/types';

	interface Props {
		dice: Dice[];
		canHold: boolean;
		rollCount: number;
		rollVersion: number;
		onToggle: (index: number) => void;
		onAnimationStart: () => void;
		onAnimationEnd: () => void;
	}

	let { dice, canHold, rollCount, rollVersion, onToggle, onAnimationStart, onAnimationEnd }: Props =
		$props();

	const pipPositions: Record<number, string[]> = {
		1: ['center'],
		2: ['top-left', 'bottom-right'],
		3: ['top-left', 'center', 'bottom-right'],
		4: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
		5: ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'],
		6: ['top-left', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-right']
	};

	let displayedValues = $state<number[]>([1, 2, 3, 4, 5]);
	let rollingIndexes = $state(new Set<number>());
	let lastAnimatedRoll = 0;
	const timers = new Map<number, ReturnType<typeof setTimeout>>();
	const intervals = new Map<number, ReturnType<typeof setInterval>>();

	$effect(() => {
		// Reset visible faces whenever a new round starts or the dice array is recreated.
		if (rollVersion === 0) {
			stopAllAnimations();
			displayedValues = dice.map((die) => die.value);
			lastAnimatedRoll = 0;
			return;
		}

		if (rollVersion === lastAnimatedRoll) return;

		lastAnimatedRoll = rollVersion;

		const rollingDice = dice
			.map((die, index) => ({ die, index }))
			.filter(({ die }) => !die.held);
		const durations = createDiceScrambleDurations(rollingDice.length);

		dice.forEach((die, index) => {
			if (!die.held) return;
			displayedValues[index] = die.value;
		});

		rollingDice.forEach(({ die, index }, durationIndex) => {
			startScramble(index, die.value, durations[durationIndex]);
		});
	});

	onDestroy(() => {
		stopAllAnimations();
	});

	function startScramble(index: number, finalValue: number, duration: number): void {
		clearTimer(index);
		onAnimationStart();
		rollingIndexes = new Set([...rollingIndexes, index]);

		intervals.set(
			index,
			setInterval(() => {
				displayedValues[index] = rollRandomFace();
			}, 90)
		);

		timers.set(
			index,
			setTimeout(
				() => {
					clearTimer(index);
					displayedValues[index] = finalValue;
					rollingIndexes = new Set([...rollingIndexes].filter((rollingIndex) => rollingIndex !== index));
					onAnimationEnd();
				},
				duration
			)
		);
	}

	function stopAllAnimations(): void {
		for (const index of [...timers.keys(), ...intervals.keys()]) {
			clearTimer(index);
		}

		rollingIndexes = new Set();
	}

	function clearTimer(index: number): void {
		const timer = timers.get(index);
		const interval = intervals.get(index);

		if (timer) clearTimeout(timer);
		if (interval) clearInterval(interval);

		timers.delete(index);
		intervals.delete(index);
	}

	function rollRandomFace(): number {
		return Math.floor(Math.random() * 6) + 1;
	}
</script>

<div class="grid grid-cols-5 gap-3" aria-label="Dice">
	{#each dice as die, index}
		<button
			type="button"
			data-testid={`die-${index + 1}`}
			class={[
				'grid aspect-square min-h-16 grid-cols-3 grid-rows-3 place-items-center border-2 p-3 transition-colors',
				canHold ? 'cursor-pointer' : 'cursor-not-allowed',
				die.held
					? 'border-accent bg-accent'
					: rollingIndexes.has(index)
						? 'border-accent bg-neutral-50'
						: 'border-neutral-300 bg-white hover:border-accent'
			]}
			disabled={!canHold}
			aria-pressed={die.held}
			aria-label={`Die ${index + 1}, ${die.value}${die.held ? ', held' : ''}`}
			onclick={() => onToggle(index)}
		>
			{#each pipPositions[displayedValues[index]] as position}
				<span
					class={[
						'pip',
						`pip-${position}`,
						die.held ? 'bg-white' : 'bg-neutral-950',
						rollCount === 0 ? 'opacity-25' : 'opacity-100'
					]}
				></span>
			{/each}
		</button>
	{/each}
</div>

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
</style>
