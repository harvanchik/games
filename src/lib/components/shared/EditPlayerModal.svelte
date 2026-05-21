<script lang="ts">
	interface Props {
		playerName: string;
		canRemove: boolean;
		onNameChange: (name: string) => void;
		onRemove: () => void;
		onClose: () => void;
	}

	let { playerName, canRemove, onNameChange, onRemove, onClose }: Props = $props();
	let nameInput = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (!nameInput) return;

		nameInput.focus();
		nameInput.select();
	});
</script>

<div class="fixed inset-0 z-50 grid place-items-center bg-black/30 px-4" role="presentation" onclick={onClose}>
	<div
		class="w-full max-w-md border border-line bg-white p-5 shadow-sm"
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		aria-labelledby="edit-player-title"
		onclick={(event) => event.stopPropagation()}
		onkeydown={(event) => event.stopPropagation()}
	>
		<div class="flex items-start justify-between gap-4">
			<h2 id="edit-player-title" class="text-xl font-bold text-neutral-950">Edit Player</h2>
			<button
				type="button"
				class="cursor-pointer border border-line px-3 py-1 font-semibold text-neutral-700 hover:border-accent hover:text-accent"
				aria-label="Close edit player dialog"
				onclick={onClose}
			>
				Close
			</button>
		</div>

		<label class="mt-5 grid gap-2">
			<span class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Player Name</span>
			<div class="grid grid-cols-[1fr_auto] items-center gap-3">
				<input
					class="border border-line bg-white px-3 py-2 text-neutral-950 outline-none focus:border-accent"
					type="text"
					value={playerName}
					bind:this={nameInput}
					oninput={(event) => onNameChange((event.currentTarget as HTMLInputElement).value)}
					onkeydown={(event) => {
						if (event.key === 'Enter' || event.key === 'Escape') {
							event.preventDefault();
							onClose();
						}
					}}
				/>
				<button
					type="button"
					class="grid h-[42px] w-[42px] cursor-pointer place-items-center border border-accent text-accent hover:bg-accent hover:text-white disabled:cursor-not-allowed disabled:border-neutral-300 disabled:text-neutral-400 disabled:hover:bg-white"
					disabled={!canRemove}
					onclick={onRemove}
					aria-label="Remove player"
					title={canRemove ? 'Remove player' : 'At least the minimum players must stay in the game'}
				>
					<svg
						class="h-5 w-5"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="square"
						stroke-linejoin="miter"
						aria-hidden="true"
					>
						<path d="M3 6h18" />
						<path d="M8 6V4h8v2" />
						<path d="M6 6l1 14h10l1-14" />
						<path d="M10 11v5" />
						<path d="M14 11v5" />
					</svg>
				</button>
			</div>
		</label>
	</div>
</div>
