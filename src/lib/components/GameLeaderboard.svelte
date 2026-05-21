<script lang="ts">
	import { getFinalTotal } from '$lib/scoring';
	import type { Player, ScoreCategory } from '$lib/types';

	interface Props {
		players: Player[];
		activePlayerId: number;
	}

	let { players, activePlayerId }: Props = $props();

	let rankedPlayers = $derived(
		[...players].sort((firstPlayer, secondPlayer) => {
			const scoreDifference =
				getFinalTotal(secondPlayer.scores, secondPlayer.fiveKindBonuses) -
				getFinalTotal(firstPlayer.scores, firstPlayer.fiveKindBonuses);

			return scoreDifference || firstPlayer.id - secondPlayer.id;
		})
	);

	const shortCategoryNames: Record<ScoreCategory, string> = {
		ones: 'Ones',
		twos: 'Twos',
		threes: 'Threes',
		fours: 'Fours',
		fives: 'Fives',
		sixes: 'Sixes',
		threeKind: '3 of Kind',
		fourKind: '4 of Kind',
		fullHouse: 'Full House',
		smallStraight: 'Sm. Straight',
		largeStraight: 'Lg. Straight',
		fiveKind: '5 of Kind',
		chance: 'Chance'
	};

	function getLastTurnText(player: Player): string {
		if (
			player.lastTurnScore === null ||
			player.lastTurnCategory === null ||
			!shortCategoryNames[player.lastTurnCategory]
		) {
			return '-';
		}

		return `${shortCategoryNames[player.lastTurnCategory]} +${player.lastTurnScore}`;
	}
</script>

<section class="border border-line bg-white p-4">
	<div class="mb-3 flex items-end justify-between gap-3">
		<div>
			<h2 class="text-lg font-bold text-neutral-950">Leaderboard</h2>
		</div>
	</div>

	<ol class="grid gap-1.5">
		{#each rankedPlayers as player, index}
			{@const totalScore = getFinalTotal(player.scores, player.fiveKindBonuses)}
			<li
				class={[
					'grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 border border-line px-2.5 py-2 text-sm',
					player.id === activePlayerId ? 'border-accent bg-yellow-50' : 'bg-white'
				]}
			>
				<span class="text-xs font-semibold text-neutral-500">{index + 1}</span>
				<div class="flex min-w-0 items-baseline gap-2">
					<p class="truncate font-semibold text-neutral-950">{player.name}</p>
					<p class="shrink-0 text-xs text-neutral-500">{getLastTurnText(player)}</p>
				</div>
				<p class="shrink-0 text-xs font-semibold text-neutral-600">
					{totalScore} {totalScore === 1 ? 'pt' : 'pts'}
				</p>
			</li>
		{/each}
	</ol>
</section>
