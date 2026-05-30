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

	const casinoFlashColors = [
		{ bg: '#b66f6b', border: '#8f504e', pip: '#fff8e6' },
		{ bg: '#c58a5d', border: '#9a6a42', pip: '#231f1b' },
		{ bg: '#cfb45c', border: '#9d873d', pip: '#fff8e6' },
		{ bg: '#7fa66f', border: '#5f7c53', pip: '#fff8e6' },
		{ bg: '#6f98b6', border: '#536f88', pip: '#fff8e6' },
		{ bg: '#8f78b6', border: '#6a5a88', pip: '#fff8e6' },
		{ bg: '#b77390', border: '#8a566d', pip: '#fff8e6' },
		{ bg: '#7aa79e', border: '#5c7d77', pip: '#231f1b' }
	];

	let displayedValues = $state<number[]>([1, 2, 3, 4, 5]);
	let rollingIndexes = $state(new Set<number>());
	let fiveKindCelebrating = $state(false);
	let fiveKindCelebrationStyles = $state<string[]>([]);
	let lastAnimatedRoll = 0;
	let celebrationTimer: ReturnType<typeof setTimeout> | null = null;
	let celebrationCheckTimer: ReturnType<typeof setTimeout> | null = null;
	const timers = new Map<number, ReturnType<typeof setTimeout>>();
	const intervals = new Map<number, ReturnType<typeof setInterval>>();

	$effect(() => {
		// Reset visible faces whenever a new round starts or the dice array is recreated.
		if (rollVersion === 0) {
			stopAllAnimations();
			stopFiveKindCelebration();
			clearFiveKindCelebrationCheck();
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
		scheduleFiveKindCelebrationCheck(durations, rollVersion);

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
		stopFiveKindCelebration();
		clearFiveKindCelebrationCheck();
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
					if (rollingIndexes.size === 0 && isFiveKindRoll()) {
						startFiveKindCelebration();
					}
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

	function startFiveKindCelebration(): void {
		stopFiveKindCelebration();
		fiveKindCelebrationStyles = dice.map((_, index) => createFiveKindCelebrationStyle(index));
		fiveKindCelebrating = true;
		celebrationTimer = setTimeout(() => {
			fiveKindCelebrating = false;
			fiveKindCelebrationStyles = [];
			celebrationTimer = null;
		}, 3000);
	}

	function stopFiveKindCelebration(): void {
		if (celebrationTimer) {
			clearTimeout(celebrationTimer);
			celebrationTimer = null;
		}

		fiveKindCelebrating = false;
		fiveKindCelebrationStyles = [];
	}

	function createFiveKindCelebrationStyle(index: number): string {
		const colors = rotateColors(shuffleColors(casinoFlashColors), index);
		const duration = 240 + Math.floor(Math.random() * 40);
		const delay = -Math.floor(Math.random() * duration);

		return [
			...colors.flatMap((color, colorIndex) => [
				`--five-kind-bg-${colorIndex}: ${color.bg}`,
				`--five-kind-border-${colorIndex}: ${color.border}`,
				`--five-kind-pip-${colorIndex}: ${color.pip}`
			]),
			`--five-kind-step-duration: ${duration}ms`,
			`--five-kind-delay: ${delay}ms`
		].join('; ');
	}

	function shuffleColors(colors: typeof casinoFlashColors): typeof casinoFlashColors {
		const shuffled = [...colors];

		for (let index = shuffled.length - 1; index > 0; index -= 1) {
			const swapIndex = Math.floor(Math.random() * (index + 1));
			[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
		}

		return shuffled;
	}

	function rotateColors(colors: typeof casinoFlashColors, offset: number): typeof casinoFlashColors {
		const rotation = offset % colors.length;
		return [...colors.slice(rotation), ...colors.slice(0, rotation)];
	}

	function scheduleFiveKindCelebrationCheck(durations: number[], targetRollVersion: number): void {
		clearFiveKindCelebrationCheck();
		if (durations.length === 0) return;

		celebrationCheckTimer = setTimeout(
			() => {
				celebrationCheckTimer = null;
				if (rollVersion === targetRollVersion && rollingIndexes.size === 0 && isFiveKindRoll()) {
					startFiveKindCelebration();
				}
			},
			Math.max(...durations) + 40
		);
	}

	function clearFiveKindCelebrationCheck(): void {
		if (!celebrationCheckTimer) return;
		clearTimeout(celebrationCheckTimer);
		celebrationCheckTimer = null;
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

	function isFiveKindRoll(): boolean {
		const firstValue = dice[0]?.value;
		return rollCount > 0 && firstValue !== undefined && dice.every((die) => die.value === firstValue);
	}
</script>

<div class="grid grid-cols-5 gap-3" aria-label="Dice">
	{#each dice as die, index}
		<button
			type="button"
			data-testid={`die-${index + 1}`}
			class={[
				'grid aspect-square min-h-16 grid-cols-3 grid-rows-3 place-items-center border-2 p-3 transition-colors',
				fiveKindCelebrating ? 'five-kind-casino-flash' : '',
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
			style={fiveKindCelebrationStyles[index] ?? ''}
			onclick={() => onToggle(index)}
		>
			{#each pipPositions[displayedValues[index]] as position}
				<span
					class={[
						'pip',
						`pip-${position}`,
						fiveKindCelebrating ? 'five-kind-casino-pip' : die.held ? 'bg-white' : 'bg-neutral-950',
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

	.five-kind-casino-flash {
		animation: five-kind-casino-flash calc(var(--five-kind-step-duration, 250ms) * 8) steps(1, end)
			infinite;
		animation-delay: var(--five-kind-delay, 0ms);
	}

	.five-kind-casino-pip {
		animation: five-kind-casino-pip calc(var(--five-kind-step-duration, 250ms) * 8) steps(1, end)
			infinite;
		animation-delay: var(--five-kind-delay, 0ms);
	}

	@keyframes five-kind-casino-flash {
		0% {
			background-color: var(--five-kind-bg-0);
			border-color: var(--five-kind-border-0);
		}

		12.5% {
			background-color: var(--five-kind-bg-1);
			border-color: var(--five-kind-border-1);
		}

		25% {
			background-color: var(--five-kind-bg-2);
			border-color: var(--five-kind-border-2);
		}

		37.5% {
			background-color: var(--five-kind-bg-3);
			border-color: var(--five-kind-border-3);
		}

		50% {
			background-color: var(--five-kind-bg-4);
			border-color: var(--five-kind-border-4);
		}

		62.5% {
			background-color: var(--five-kind-bg-5);
			border-color: var(--five-kind-border-5);
		}

		75% {
			background-color: var(--five-kind-bg-6);
			border-color: var(--five-kind-border-6);
		}

		87.5% {
			background-color: var(--five-kind-bg-7);
			border-color: var(--five-kind-border-7);
		}
	}

	@keyframes five-kind-casino-pip {
		0% {
			background-color: var(--five-kind-pip-0);
		}

		12.5% {
			background-color: var(--five-kind-pip-1);
		}

		25% {
			background-color: var(--five-kind-pip-2);
		}

		37.5% {
			background-color: var(--five-kind-pip-3);
		}

		50% {
			background-color: var(--five-kind-pip-4);
		}

		62.5% {
			background-color: var(--five-kind-pip-5);
		}

		75% {
			background-color: var(--five-kind-pip-6);
		}

		87.5% {
			background-color: var(--five-kind-pip-7);
		}
	}
</style>
