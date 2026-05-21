<script lang="ts">
	import { onDestroy } from 'svelte';
	import DiceFace from '$lib/components/shared/DiceFace.svelte';
	import MiniDiceRow from '$lib/components/shared/MiniDiceRow.svelte';
	import { createDiceScrambleDurations } from '$lib/utils/diceAnimation';
	import type { BellDiceValue, BellRollGameState, BellRollPlayer } from './bellRollTypes';

	interface Props {
		game: BellRollGameState;
		currentPlayer: BellRollPlayer;
		canRoll: boolean;
		onRoll: () => void;
		onAnimationStart: () => void;
		onAnimationEnd: () => void;
	}

	let { game, currentPlayer, canRoll, onRoll, onAnimationStart, onAnimationEnd }: Props = $props();

	let fadedDice = $derived(game.rollVersion === 0);
	let displayedValues = $state<BellDiceValue[]>([1, 2, 3]);
	let rollingIndexes = $state(new Set<number>());
	let lastAnimatedRoll = $state<number | null>(null);
	const timers = new Map<number, ReturnType<typeof setTimeout>>();
	const intervals = new Map<number, ReturnType<typeof setInterval>>();

	$effect(() => {
		if (lastAnimatedRoll === null) {
			displayedValues = [...game.dice];
			lastAnimatedRoll = game.rollVersion;
			return;
		}

		if (game.rollVersion === 0) {
			stopAllAnimations();
			displayedValues = [...game.dice];
			lastAnimatedRoll = 0;
			return;
		}

		if (game.rollVersion === lastAnimatedRoll) return;

		lastAnimatedRoll = game.rollVersion;
		const durations = createDiceScrambleDurations(game.dice.length);
		game.dice.forEach((die, index) => startScramble(index, die, durations[index]));
	});

	onDestroy(() => {
		stopAllAnimations();
	});

	function startScramble(index: number, finalValue: BellDiceValue, duration: number): void {
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
			setTimeout(() => {
				clearTimer(index);
				displayedValues[index] = finalValue;
				rollingIndexes = new Set([...rollingIndexes].filter((rollingIndex) => rollingIndex !== index));
				onAnimationEnd();
			}, duration)
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

	function rollRandomFace(): BellDiceValue {
		return (Math.floor(Math.random() * 6) + 1) as BellDiceValue;
	}

	function formatResultMessage(message: string): string {
		return message === 'No points. Turn over.' ? '+0 Turn over.' : message;
	}

	function getHighlightedIndexes(): number[] {
		if (!game.lastRoll || game.lastRoll.points === 0) return [];
		if (game.lastRoll.label === 'Mini Triple' || game.lastRoll.label === 'Perfect Triple') return [0, 1, 2];

		return game.lastRoll.dice
			.map((value, index) => (value === game.currentRound ? index : -1))
			.filter((index) => index >= 0);
	}

	function getCelebrationIndexes(): number[] {
		return game.lastRoll?.label === 'Perfect Triple' ? [0, 1, 2] : [];
	}
</script>

<section class="border border-line bg-white p-4">
	<div class="mb-4 flex items-center justify-between gap-4">
		<button
			type="button"
			class="h-10 min-w-32 cursor-pointer border border-accent bg-accent px-3 text-sm font-semibold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:border-neutral-300 disabled:bg-neutral-200 disabled:text-neutral-500"
			disabled={!canRoll}
			onclick={onRoll}
		>
			Roll Dice
		</button>
		<p class="border border-line px-3 py-2 text-sm font-semibold">Target {game.currentRound}</p>
	</div>

	<div class="grid grid-cols-3 gap-2" aria-label="Bell Roll dice">
		{#each game.dice as die, index}
			<DiceFace
				value={displayedValues[index] ?? die}
				faded={fadedDice}
				rolling={rollingIndexes.has(index)}
				highlighted={!rollingIndexes.has(index) && getHighlightedIndexes().includes(index)}
				celebrating={!rollingIndexes.has(index) && getCelebrationIndexes().includes(index)}
				label={`Die ${index + 1} showing ${displayedValues[index] ?? die}`}
				disabled={true}
			/>
		{/each}
	</div>

	<div class="mt-4 flex flex-wrap items-center gap-2 border border-line bg-neutral-50 p-3">
		{#if game.lastRoll}
			<p class="text-sm font-semibold text-neutral-500">Last Roll</p>
			<MiniDiceRow
				values={game.lastRoll.dice}
				label="Last roll dice"
				highlightedIndexes={getHighlightedIndexes()}
				celebrationIndexes={getCelebrationIndexes()}
			/>
			<span class="font-semibold whitespace-nowrap text-neutral-950">
				{formatResultMessage(game.statusMessage)}
			</span>
		{:else}
			<p class="text-sm font-semibold text-neutral-500">Roll to Begin</p>
		{/if}
	</div>
</section>
