<script lang="ts">
	import DiceFace from '$lib/components/shared/DiceFace.svelte';
	import FortressIcon from './FortressIcon.svelte';
	import { FORTRESS_MAX_ROLLS, formatPower, getSpeedTierLabel } from './fortressDiceLogic';
	import type {
		FortressActionOption,
		FortressDiceValue,
		FortressGameState,
		FortressPlayer
	} from './fortressDiceTypes';

	interface Props {
		player: FortressPlayer;
		options: FortressActionOption[];
		selectedOption: FortressActionOption | null;
		visibleDice: FortressDiceValue[];
		rolling: boolean;
		cooldownLabel: string;
		boostLabel: string;
		shieldTotal: number;
		canRoll: boolean;
		inputLocked: boolean;
		phase: FortressGameState['phase'];
		inverted?: boolean;
		onReady: () => void;
		onRoll: () => void;
		onHold: (dieId: number) => void;
		onSelectOption: (optionId: string) => void;
		onCommit: (option: FortressActionOption) => void;
	}

	let {
		player,
		options,
		selectedOption,
		visibleDice,
		rolling,
		cooldownLabel,
		boostLabel,
		shieldTotal,
		canRoll,
		inputLocked,
		phase,
		inverted = false,
		onReady,
		onRoll,
		onHold,
		onSelectOption,
		onCommit
	}: Props = $props();

	let diceAreWaitingForRoll = $derived(!rolling && player.rollCount === 0);

	function getActionSpeedLabel(option: FortressActionOption): string {
		return getSpeedTierLabel(option.speedTier);
	}

	function actionNeedsLane(option: FortressActionOption): boolean {
		return option.target === 'selectedLane';
	}
</script>

<section class={['border border-line bg-white p-4', inverted ? 'fortress-station-inverted' : '']}>
	<div class="grid items-center gap-4 lg:grid-cols-[minmax(190px,260px)_minmax(0,1fr)_auto]">
		<div class="grid gap-1">
			<div>
				<p class="text-sm font-semibold uppercase tracking-wide text-neutral-500">{player.name}</p>
				<h2 class="text-xl font-bold text-neutral-950">Fortress {formatPower(player.hp)} HP</h2>
				<p class="mt-1 text-sm text-neutral-600">
					{cooldownLabel === '-' ? boostLabel : `Cooldown ${cooldownLabel} - ${boostLabel}`}
				</p>
			</div>
			<p class="text-sm text-neutral-600">Shield {formatPower(shieldTotal)}</p>
		</div>

		<div class="grid gap-3">
			<div class="fortress-dice-row flex flex-wrap items-center justify-center gap-4">
				{#each visibleDice as value, index}
					{@const die = player.dice[index]}
					<DiceFace
						{value}
						held={die?.held ?? false}
						rolling={rolling}
						faded={(phase !== 'playing' && phase !== 'paused') || diceAreWaitingForRoll}
						label={`${player.name} die ${index + 1}`}
						disabled={!die || player.rollCount === 0 || rolling || inputLocked}
						onclick={die ? () => onHold(die.id) : undefined}
					/>
				{/each}
			</div>

			{#if options.length}
				<div
					class="grid gap-2"
					style={`grid-template-columns: repeat(${options.length}, minmax(0, 1fr));`}
				>
					{#each options as option}
						<button
							type="button"
							class={[
								'min-h-12 cursor-pointer border px-3 py-2 text-sm font-semibold',
								selectedOption?.id === option.id
									? 'border-accent bg-accent text-white'
									: 'border-line bg-white text-neutral-800 hover:border-accent hover:text-accent'
							]}
							disabled={inputLocked}
							onclick={() => {
								if (actionNeedsLane(option)) onSelectOption(option.id);
								else onCommit(option);
							}}
						>
							<span class="mb-2 flex justify-center">
								<FortressIcon type={option.type} combo={option.combo} size="lg" label={`${option.label} icon`} />
							</span>
							<span class="block">{option.label}</span>
							{#if option.troops}
								<span class="block text-xs font-normal opacity-80">Troops {option.troops}</span>
							{/if}
							{#if option.shieldAmount}
								<span class="block text-xs font-normal opacity-80">Shield +{option.shieldAmount}</span>
							{/if}
							<span class="block text-xs font-normal opacity-80">Speed {getActionSpeedLabel(option)}</span>
						</button>
					{/each}
				</div>

			{:else if player.dice.length && !rolling}
				<p class="border border-line bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
					{player.dice.some((die) => die.held)
						? 'Selected dice do not make an action yet.'
						: 'Select dice to reveal matching actions.'}
				</p>
			{/if}
		</div>

		<div class="grid gap-2">
			{#if phase === 'ready'}
				<button
					type="button"
					class={[
						'h-12 w-32 cursor-pointer border px-3 font-semibold',
						player.ready ? 'border-accent bg-accent text-white' : 'border-line bg-white text-neutral-800 hover:border-accent hover:text-accent'
					]}
					onclick={onReady}
				>
					{player.ready ? 'Ready' : 'Tap Ready'}
				</button>
			{:else}
				<button
					type="button"
					class="h-12 w-32 cursor-pointer border border-accent bg-accent px-3 font-semibold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:border-neutral-300 disabled:bg-neutral-200 disabled:text-neutral-500"
					disabled={!canRoll}
					onclick={onRoll}
				>
					{player.rollCount > 0 ? 'Reroll' : 'Roll Dice'}
				</button>
			{/if}
			<div class="grid h-12 w-32 place-items-center border border-line bg-white text-sm font-semibold">
				Roll {player.rollCount} of {FORTRESS_MAX_ROLLS}
			</div>
		</div>
	</div>
</section>

<style>
	.fortress-station-inverted {
		transform: rotate(180deg);
	}

	.fortress-dice-row :global(button) {
		min-height: 4.5rem;
		padding: 0.75rem;
		width: 4.5rem;
	}
</style>
