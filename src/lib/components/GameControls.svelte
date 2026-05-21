<script lang="ts">
	interface Props {
		activePlayerName: string;
		roundNumber: number;
		gameOver: boolean;
		winnerText: string;
		turnLabel?: string;
	}

	let {
		activePlayerName,
		roundNumber,
		gameOver,
		winnerText,
		turnLabel = 'Current Turn'
	}: Props = $props();
</script>

<section class="border border-line bg-white p-4">
	<div>
		<p class="text-sm font-semibold uppercase tracking-wide text-neutral-500">{turnLabel}</p>
		<p class="text-xl font-bold text-neutral-950">
			{gameOver ? 'Game Complete' : `${activePlayerName} - Round ${roundNumber} of 13`}
		</p>
		{#if gameOver}
			<p class="text-sm text-neutral-600">{winnerText}</p>
		{/if}
	</div>
</section>
