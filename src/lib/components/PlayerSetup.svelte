<script lang="ts">
	import type { CpuDifficulty, PlayerCount } from '$lib/types';

	interface Props {
		playerCount: PlayerCount;
		cpuDifficulty: CpuDifficulty;
		centered?: boolean;
		onSelectPlayerCount: (count: PlayerCount) => void;
		onSelectCpuDifficulty: (difficulty: CpuDifficulty) => void;
	}

	let {
		playerCount,
		cpuDifficulty,
		centered = false,
		onSelectPlayerCount,
		onSelectCpuDifficulty
	}: Props = $props();

	const minPlayers = 1;
	const maxPlayers = 10;
	const cpuDifficulties: Array<{ id: CpuDifficulty; name: string; description: string }> = [
		{ id: 'easy', name: 'Easy', description: 'Beginner-friendly CPU with short-sighted choices.' },
		{ id: 'moderate', name: 'Moderate', description: 'Average CPU with solid but imperfect planning.' },
		{ id: 'masterful', name: 'Masterful', description: 'Expected-value planner with no intentional mistakes.' }
	];

	function clampPlayerCount(value: number): PlayerCount {
		return Math.min(maxPlayers, Math.max(minPlayers, Math.round(value))) as PlayerCount;
	}

	function updateFromInput(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		const parsedValue = Number(input.value);
		const nextValue = Number.isFinite(parsedValue) ? clampPlayerCount(parsedValue) : minPlayers;

		input.value = String(nextValue);
		onSelectPlayerCount(nextValue);
	}
</script>

<section>
	<div class={['flex flex-col gap-4', centered ? 'items-center text-center' : '']}>
		<div class={centered ? 'max-w-md' : ''}>
			<h2 class="text-xl font-bold text-neutral-950">Choose Players</h2>
			<p class="mt-1 text-sm text-neutral-600">
				One player plays against the CPU. Two or more players can pass and play locally.
			</p>
		</div>

		<div class={['flex flex-wrap items-center gap-2', centered ? 'justify-center' : '']}>
			<div class="flex items-center border border-line">
				<button
					type="button"
					data-testid="decrease-players"
					class="h-11 w-11 cursor-pointer border-r border-line bg-white text-xl font-bold text-accent hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-300"
					disabled={playerCount <= minPlayers}
					aria-label="Decrease players"
					onclick={() => onSelectPlayerCount(clampPlayerCount(playerCount - 1))}
				>
					-
				</button>
				<label class="sr-only" for="player-count">Player count</label>
				<input
					id="player-count"
					data-testid="player-count-input"
					class="h-11 w-28 border-0 bg-white px-3 text-center font-semibold text-neutral-950 outline-none"
					type="text"
					inputmode="numeric"
					pattern="[0-9]*"
					value={playerCount}
					oninput={updateFromInput}
					onchange={updateFromInput}
					onblur={updateFromInput}
				/>
				<button
					type="button"
					data-testid="increase-players"
					class="h-11 w-11 cursor-pointer border-l border-line bg-white text-xl font-bold text-accent hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-300"
					disabled={playerCount >= maxPlayers}
					aria-label="Increase players"
					onclick={() => onSelectPlayerCount(clampPlayerCount(playerCount + 1))}
				>
					+
				</button>
			</div>
			<p class="w-32 text-sm font-semibold text-neutral-700">
				{playerCount === 1 ? '1 Player + CPU' : `${playerCount} Players`}
			</p>
		</div>

		{#if playerCount === 1}
			<div class={['grid w-full gap-2', centered ? 'max-w-xl' : '']}>
				<p class="text-sm font-semibold uppercase tracking-wide text-neutral-500">CPU Difficulty</p>
				<div class="grid grid-cols-1 border border-line sm:grid-cols-3">
					{#each cpuDifficulties as difficulty, index}
						<button
							type="button"
							data-testid={`cpu-difficulty-${difficulty.id}`}
							class={[
								'cursor-pointer border-line px-3 py-2 text-left hover:bg-neutral-100',
								index < cpuDifficulties.length - 1 ? 'border-b sm:border-b-0 sm:border-r' : '',
								cpuDifficulty === difficulty.id
									? 'bg-accent text-white hover:bg-accent'
									: 'bg-white text-neutral-700'
							]}
							onclick={() => onSelectCpuDifficulty(difficulty.id)}
						>
							<span class="block font-semibold">{difficulty.name}</span>
							<span class={['mt-1 block text-xs', cpuDifficulty === difficulty.id ? 'text-white' : 'text-neutral-500']}>
								{difficulty.description}
							</span>
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</section>
