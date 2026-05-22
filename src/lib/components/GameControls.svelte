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

<section class="game-controls border border-line bg-white p-4">
	<div class="game-controls-summary">
		<p class="game-controls-label text-sm font-semibold uppercase tracking-wide text-neutral-500">
			{turnLabel}
		</p>
		<p class="game-controls-round text-xl font-bold text-neutral-950">
			{gameOver ? 'Game Complete' : `${activePlayerName} - Round ${roundNumber} of 13`}
		</p>
		{#if gameOver}
			<p class="game-controls-winner text-sm text-neutral-600">{winnerText}</p>
		{/if}
	</div>
</section>
