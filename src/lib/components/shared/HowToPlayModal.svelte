<script lang="ts">
	interface HowToPlaySection {
		title: string;
		items: string[];
	}

	interface Props {
		title: string;
		intro: string;
		sections: HowToPlaySection[];
		onClose: () => void;
	}

	let { title, intro, sections, onClose }: Props = $props();

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape') return;

		event.preventDefault();
		onClose();
	}

	function handleBackdropClick(event: MouseEvent): void {
		if (event.target !== event.currentTarget) return;

		onClose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	class="fixed inset-0 z-50 grid place-items-center bg-black/30 px-4"
	role="presentation"
	onclick={handleBackdropClick}
>
	<div
		class="max-h-[85vh] w-full max-w-2xl overflow-y-auto border border-line bg-white p-5 shadow-sm"
		role="dialog"
		aria-modal="true"
		aria-labelledby="how-to-play-title"
		tabindex="-1"
	>
		<div class="flex items-start justify-between gap-4">
			<div>
				<h2 id="how-to-play-title" class="text-2xl font-bold text-neutral-950">{title}</h2>
				<p class="mt-2 text-sm text-neutral-600">{intro}</p>
			</div>
			<button
				type="button"
				class="cursor-pointer border border-line px-3 py-2 font-semibold text-neutral-700 hover:border-accent hover:text-accent"
				onclick={onClose}
			>
				Close
			</button>
		</div>

		<div class="mt-5 grid gap-4">
			{#each sections as section}
				<div class="border border-line bg-neutral-50 p-4">
					<h3 class="font-bold text-neutral-950">{section.title}</h3>
					<ul class="mt-2 grid gap-2 text-sm text-neutral-700">
						{#each section.items as item}
							<li>{item}</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	</div>
</div>
