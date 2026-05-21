<script lang="ts">
	import type { BankerPersonality, DramaticPauseSetting, NoDealOrDealGameState } from './noDealOrDealTypes';

	interface Props {
		game: NoDealOrDealGameState;
		disabled?: boolean;
		onPauseChange: (setting: DramaticPauseSetting) => void;
		onPersonalityChange: (personality: BankerPersonality) => void;
		onSkipAllChange: (skipAll: boolean) => void;
	}

	let {
		game,
		disabled = false,
		onPauseChange,
		onPersonalityChange,
		onSkipAllChange
	}: Props = $props();

	const pauseSettings: DramaticPauseSetting[] = ['off', 'short', 'normal', 'long'];
	const personalities: BankerPersonality[] = ['conservative', 'balanced', 'generous', 'dramatic'];

	function label(value: string): string {
		return value
			.split('-')
			.map((part) => part[0].toUpperCase() + part.slice(1))
			.join(' ');
	}
</script>

<section class="border border-line bg-white p-4">
	<h2 class="text-xl font-bold text-neutral-950">Settings</h2>
	<div class="mt-4 grid gap-3">
		<label class="grid gap-1">
			<span class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Dramatic Pauses</span>
			<select
				class="cursor-pointer border border-line bg-white px-3 py-2 disabled:cursor-not-allowed"
				value={game.dramaticPause}
				disabled={disabled}
				onchange={(event) => onPauseChange((event.currentTarget as HTMLSelectElement).value as DramaticPauseSetting)}
			>
				{#each pauseSettings as setting}
					<option value={setting}>{label(setting)}</option>
				{/each}
			</select>
		</label>

		<label class="grid gap-1">
			<span class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Banker</span>
			<select
				class="cursor-pointer border border-line bg-white px-3 py-2 disabled:cursor-not-allowed"
				value={game.bankerPersonality}
				disabled={disabled}
				onchange={(event) =>
					onPersonalityChange((event.currentTarget as HTMLSelectElement).value as BankerPersonality)}
			>
				{#each personalities as personality}
					<option value={personality}>{label(personality)} Banker</option>
				{/each}
			</select>
		</label>

		<label class="flex cursor-pointer items-center gap-2 text-sm">
			<input
				type="checkbox"
				class="h-4 w-4 cursor-pointer"
				checked={game.skipAllPauses}
				disabled={disabled}
				onchange={(event) => onSkipAllChange((event.currentTarget as HTMLInputElement).checked)}
			/>
			<span>Skip all pauses</span>
		</label>
	</div>
</section>
