<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import AppHeader from '$lib/components/shared/AppHeader.svelte';
	import EditPlayerModal from '$lib/components/shared/EditPlayerModal.svelte';
	import HowToPlayModal from '$lib/components/shared/HowToPlayModal.svelte';
	import MiniDiceRow from '$lib/components/shared/MiniDiceRow.svelte';
	import { playDiceRollSound } from '$lib/utils/soundEffects';
	import BellRollDicePanel from './BellRollDicePanel.svelte';
	import BellRollFinalResults from './BellRollFinalResults.svelte';
	import BellRollRoundHistory from './BellRollRoundHistory.svelte';
	import BellRollScoreboard from './BellRollScoreboard.svelte';
	import BellRollSetup from './BellRollSetup.svelte';
	import BellRollTableScores from './BellRollTableScores.svelte';
	import {
		applyBellRollRoll,
		advanceBellRollTurn,
		createBellRollGame,
		getCurrentPlayer,
		getCurrentTable,
		getFinalRankings,
		getNextPlayer,
		getTotalRounds,
		prepareBellRollRoll,
		removeBellRollPlayer,
		renameBellRollPlayer,
		startBellRollGame
	} from './bellRollGame';
	import {
		buildBellRollSaveRecord,
		createBellRollSaveId,
		createDefaultBellRollGameName,
		deleteBellRollSavedGame,
		loadBellRollLastGameId,
		loadBellRollSavedGames,
		MAX_BELL_ROLL_SAVED_GAMES,
		saveBellRollGameRecord,
		setBellRollLastGameId
	} from './bellRollSave';
	import type {
		BellDiceValue,
		BellRollGameState,
		BellRollLogEntry,
		BellRollMode,
		BellRollPendingRoll,
		BellRollStats
	} from './bellRollTypes';
	import type { BellRollSavedGameRecord } from './bellRollSave';

	let game = $state<BellRollGameState>(createBellRollGame());
	let gameName = $state(createDefaultBellRollGameName());
	let currentSaveId = $state(createBellRollSaveId());
	let savedGames = $state<BellRollSavedGameRecord[]>([]);
	let setupMode = $state<'new' | 'load'>('new');
	let confirmDeleteGameId = $state('');
	let persistenceReady = $state(false);
	let howToPlayOpen = $state(false);
	let rollingDiceCount = $state(0);
	let pendingRoll = $state<BellRollPendingRoll | null>(null);
	let turnAdvancePending = $state(false);
	let editPlayerId = $state<number | null>(null);
	let turnAdvanceTimer: ReturnType<typeof setTimeout> | null = null;

	const howToPlaySections = [
		{
			title: 'Goal',
			items: [
				'Play through numbered rounds. The target number is the same as the current round.',
				'Score points by rolling dice that match the target number.',
				'After the final round of the final set, the player with the best results wins.'
			]
		},
		{
			title: 'Rolling',
			items: [
				'Roll all three dice on your turn.',
				'If the roll scores points, you keep rolling.',
				'If the roll scores 0, your turn ends and play passes to the next player.'
			]
		},
		{
			title: 'Scoring',
			items: [
				'Each die matching the target number scores 1 point.',
				'Three target dice score a Perfect Triple for 21 points.',
				'Three matching non-target dice score a Mini Triple for 5 points.'
			]
		}
	];

	let currentPlayer = $derived(getCurrentPlayer(game));
	let nextPlayer = $derived(getNextPlayer(game));
	let currentTable = $derived(getCurrentTable(game));
	let rankings = $derived(getFinalRankings(game));
	let completedRoundCount = $derived((game.currentSet - 1) * 6 + game.currentRound - 1);
	let totalRoundCount = $derived(getTotalRounds(game));
	let diceAreScrambling = $derived(rollingDiceCount > 0);
	let canRoll = $derived(
		game.setupComplete && !game.gameOver && !diceAreScrambling && !pendingRoll && !turnAdvancePending
	);
	let editPlayer = $derived(
		editPlayerId === null ? null : (game.players.find((player) => player.id === editPlayerId) ?? null)
	);
	let trimmedGameName = $derived(gameName.trim());
	let duplicateSavedGame = $derived(
		savedGames.find(
			(savedGame) => savedGame.name.toLocaleLowerCase() === trimmedGameName.toLocaleLowerCase()
		) ?? null
	);
	let newSaveWouldExceedLimit = $derived(!duplicateSavedGame && savedGames.length >= MAX_BELL_ROLL_SAVED_GAMES);
	let canStartNewGame = $derived(trimmedGameName.length > 0 && !newSaveWouldExceedLimit);

	$effect(() => {
		if (!persistenceReady || !game.setupComplete) return;
		persistGame();
	});

	onMount(() => {
		const loadedGames = loadBellRollSavedGames();
		const playableGames = getPlayableSavedGames(loadedGames);
		const lastGameId = loadBellRollLastGameId();
		const gameToLoad =
			playableGames.find((savedGame) => savedGame.id === lastGameId) ?? playableGames[0] ?? null;

		savedGames = playableGames;

		if (gameToLoad) {
			applySavedGame(gameToLoad);
		} else {
			setupMode = 'new';
		}

		persistenceReady = true;
	});

	onDestroy(() => {
		clearPendingTurnAdvance();
	});

	function startGame(config: { mode: BellRollMode; names: string[]; setCount: 1 | 3 | 4 }): void {
		if (!canStartNewGame) return;

		clearPendingTurnAdvance();
		rollingDiceCount = 0;
		pendingRoll = null;
		currentSaveId = duplicateSavedGame?.id ?? createBellRollSaveId();
		gameName = trimmedGameName;
		game = startBellRollGame(config.mode, config.names, config.setCount);
		setupMode = 'new';
		persistIfReady();
	}

	function newGame(): void {
		clearPendingTurnAdvance();
		game = createBellRollGame();
		gameName = createDefaultBellRollGameName();
		currentSaveId = createBellRollSaveId();
		setupMode = 'new';
		confirmDeleteGameId = '';
		howToPlayOpen = false;
		rollingDiceCount = 0;
		pendingRoll = null;
		editPlayerId = null;
	}

	function rollDice(): void {
		if (!canRoll) return;

		playDiceRollSound();
		const nextRoll = prepareBellRollRoll(game);
		if (!nextRoll) return;

		pendingRoll = nextRoll;
		game.dice = nextRoll.dice;
		game.rollVersion += 1;
		persistIfReady();
	}

	function openEditPlayer(playerId: number): void {
		if (diceAreScrambling || pendingRoll || turnAdvancePending || game.gameOver) return;

		editPlayerId = playerId;
	}

	function closeEditPlayer(): void {
		if (editPlayer && editPlayer.name.trim().length === 0) {
			editPlayer.name = `Player ${editPlayer.id}`;
			persistIfReady();
		}

		editPlayerId = null;
	}

	function renameEditedPlayer(name: string): void {
		if (editPlayerId === null) return;

		renameBellRollPlayer(game, editPlayerId, name);
		persistIfReady();
	}

	function removeEditedPlayer(): void {
		if (editPlayerId === null) return;

		const removed = removeBellRollPlayer(game, editPlayerId);
		if (!removed) return;

		editPlayerId = null;
		persistIfReady();
	}

	function handlePageKeydown(event: KeyboardEvent): void {
		if (event.defaultPrevented || isTextEntryTarget(event.target)) return;

		if (event.key === 'Escape' && editPlayerId !== null) {
			event.preventDefault();
			closeEditPlayer();
			return;
		}

		if (event.code !== 'Space') return;

		event.preventDefault();
		rollDice();
	}

	function handleDieAnimationStart(): void {
		rollingDiceCount += 1;
	}

	function handleDieAnimationEnd(): void {
		const nextRollingDiceCount = Math.max(0, rollingDiceCount - 1);
		rollingDiceCount = nextRollingDiceCount;

		if (nextRollingDiceCount === 0 && pendingRoll) {
			const shouldDelayTurnAdvance = applyBellRollRoll(game, pendingRoll, { deferTurnEnd: true });
			pendingRoll = null;
			persistIfReady();

			if (shouldDelayTurnAdvance) {
				turnAdvancePending = true;
				turnAdvanceTimer = setTimeout(() => {
					advanceBellRollTurn(game);
					turnAdvancePending = false;
					turnAdvanceTimer = null;
					persistIfReady();
				}, 2000);
			}
		}
	}

	function clearPendingTurnAdvance(): void {
		if (turnAdvanceTimer) {
			clearTimeout(turnAdvanceTimer);
			turnAdvanceTimer = null;
		}

		turnAdvancePending = false;
	}

	function persistIfReady(): void {
		if (!persistenceReady || !game.setupComplete) return;
		persistGame();
	}

	function persistGame(): void {
		savedGames = getPlayableSavedGames(
			saveBellRollGameRecord(
				buildBellRollSaveRecord(currentSaveId, gameName, $state.snapshot(game))
			)
		);
	}

	function renameGame(name: string): void {
		gameName = name;
	}

	function changeSetupMode(nextMode: 'new' | 'load'): void {
		setupMode = savedGames.length > 0 || nextMode === 'new' ? nextMode : 'new';
		confirmDeleteGameId = '';
	}

	function loadSavedGame(id: string): void {
		const savedGame = savedGames.find((record) => record.id === id);
		if (!savedGame) return;

		applySavedGame(savedGame);
		savedGames = getPlayableSavedGames(loadBellRollSavedGames());
	}

	function requestDeleteSavedGame(id: string): void {
		confirmDeleteGameId = id;
	}

	function confirmDeleteSavedGame(id: string): void {
		savedGames = getPlayableSavedGames(deleteBellRollSavedGame(id));
		confirmDeleteGameId = '';

		if (id !== currentSaveId) {
			if (!savedGames.length) setupMode = 'new';
			return;
		}

		const nextSavedGame = savedGames[0];
		if (nextSavedGame) {
			applySavedGame(nextSavedGame);
			return;
		}

		newGame();
	}

	function applySavedGame(savedGame: BellRollSavedGameRecord): void {
		clearPendingTurnAdvance();
		rollingDiceCount = 0;
		pendingRoll = null;
		game = normalizeSavedGame(structuredClone(savedGame.snapshot.game));
		gameName = savedGame.snapshot.gameName || savedGame.name;
		currentSaveId = savedGame.id;
		setupMode = 'new';
		confirmDeleteGameId = '';
		setBellRollLastGameId(savedGame.id);
	}

	function normalizeSavedGame(savedGame: BellRollGameState): BellRollGameState {
		const baseline = createBellRollGame(
			savedGame.mode,
			savedGame.players.map((player) => player.name),
			savedGame.setCount
		);

		return {
			...baseline,
			...savedGame,
			roundPerfectTriples: savedGame.roundPerfectTriples ?? 0,
			roundMiniTriples: savedGame.roundMiniTriples ?? 0,
			stats: normalizeStats(savedGame)
		};
	}

	function getPlayableSavedGames(records: BellRollSavedGameRecord[]): BellRollSavedGameRecord[] {
		return records.filter((record) => !record.snapshot.game.gameOver);
	}

	function normalizeStats(savedGame: BellRollGameState): Record<number, BellRollStats> {
		return Object.fromEntries(
			savedGame.players.map((player) => {
				const stats = savedGame.stats[player.id];
				return [
					player.id,
					{
						wins: stats?.wins ?? 0,
						losses: stats?.losses ?? 0,
						roundWins: stats?.roundWins ?? 0,
						roundLosses: stats?.roundLosses ?? 0,
						totalPoints: stats?.totalPoints ?? 0,
						perfectTriples: stats?.perfectTriples ?? 0,
						miniTriples: stats?.miniTriples ?? 0
					}
				];
			})
		);
	}

	function getDisplayLogEntry(entry: BellRollLogEntry):
		| {
				playerName: string;
				dice: BellDiceValue[];
				resultText: string;
				target: BellDiceValue;
				resultLabel: BellRollLogEntry['resultLabel'];
		  }
		| null {
		if (entry.playerName && entry.dice && entry.resultText) {
			return {
				playerName: entry.playerName,
				dice: entry.dice,
				resultText: formatResultText(entry.resultText),
				target: entry.target ?? game.currentRound,
				resultLabel: entry.resultLabel ?? inferResultLabel(entry.resultText)
			};
		}

		const parsedEntry = entry.text.match(/^(.+) rolled ([1-6])-([1-6])-([1-6]): (.+)$/);
		if (!parsedEntry) return null;

		return {
			playerName: parsedEntry[1],
			dice: [
				Number(parsedEntry[2]) as BellDiceValue,
				Number(parsedEntry[3]) as BellDiceValue,
				Number(parsedEntry[4]) as BellDiceValue
			],
			resultText: formatResultText(parsedEntry[5]),
			target: game.currentRound,
			resultLabel: inferResultLabel(parsedEntry[5])
		};
	}

	function formatResultText(resultText: string): string {
		return resultText === 'No points. Turn over.' ? '+0 Turn over.' : resultText;
	}

	function inferResultLabel(resultText: string): BellRollLogEntry['resultLabel'] {
		if (resultText.includes('Perfect Triple')) return 'Perfect Triple';
		if (resultText.includes('Mini Triple')) return 'Mini Triple';
		if (resultText.startsWith('+0') || resultText === 'No points. Turn over.') return 'No Score';

		return 'Matches';
	}

	function getLogHighlightIndexes(displayEntry: {
		dice: BellDiceValue[];
		target: BellDiceValue;
		resultLabel: BellRollLogEntry['resultLabel'];
	}): number[] {
		if (!displayEntry.resultLabel || displayEntry.resultLabel === 'No Score') return [];
		if (displayEntry.resultLabel === 'Mini Triple' || displayEntry.resultLabel === 'Perfect Triple') {
			return [0, 1, 2];
		}

		return displayEntry.dice
			.map((value, index) => (value === displayEntry.target ? index : -1))
			.filter((index) => index >= 0);
	}

	function getLogCelebrationIndexes(displayEntry: {
		resultLabel: BellRollLogEntry['resultLabel'];
	}): number[] {
		return displayEntry.resultLabel === 'Perfect Triple' ? [0, 1, 2] : [];
	}

	function isTextEntryTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;

		return (
			target instanceof HTMLInputElement ||
			target instanceof HTMLTextAreaElement ||
			target instanceof HTMLSelectElement ||
			target.isContentEditable
		);
	}
</script>

<svelte:head>
	<title>Bell Roll</title>
	<meta name="description" content="A clean three-dice round game with table-style scoring." />
</svelte:head>

<svelte:window onkeydown={handlePageKeydown} />

<main class="min-h-screen bg-paper px-4 py-6 text-neutral-900 sm:px-6 lg:px-8">
	<div class="mx-auto flex max-w-7xl flex-col gap-5">
		<AppHeader
			title="Bell Roll"
			activeGameId="bell-roll"
			onNewGame={newGame}
			onHelp={() => (howToPlayOpen = true)}
		/>

		{#if !game.setupComplete}
			<section class="grid min-h-[60vh] place-items-center">
				<BellRollSetup
					{setupMode}
					{gameName}
					{savedGames}
					{confirmDeleteGameId}
					{canStartNewGame}
					duplicateSavedGameName={duplicateSavedGame !== null}
					{newSaveWouldExceedLimit}
					onSetupModeChange={changeSetupMode}
					onGameNameChange={renameGame}
					onStart={startGame}
					onLoadGame={loadSavedGame}
					onRequestDeleteGame={requestDeleteSavedGame}
					onConfirmDeleteGame={confirmDeleteSavedGame}
				/>
			</section>
		{:else}
			<section class="grid gap-5 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
				<div class="flex flex-col gap-5">
					<section class="border border-line bg-white p-4">
						<p class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Current Round</p>
						<h2 class="mt-1 text-xl font-bold text-neutral-950">
							{currentPlayer.name} - Set {game.currentSet}, Round {game.currentRound}
						</h2>
						<p class="mt-1 text-sm text-neutral-600">
							Target {game.currentRound} · Round {completedRoundCount + 1} of {totalRoundCount}
						</p>
						{#if game.mode === 'party' && currentTable}
							<p class="mt-2 border border-line bg-neutral-50 px-3 py-2 text-sm">
								{currentTable.name} · Team {currentTable.activeTeamId}
							</p>
						{/if}
					</section>

					<BellRollDicePanel
						{game}
						{currentPlayer}
						{canRoll}
						onRoll={rollDice}
						onAnimationStart={handleDieAnimationStart}
						onAnimationEnd={handleDieAnimationEnd}
					/>

					<section class="border border-line bg-white p-4">
						<h2 class="text-xl font-bold text-neutral-950">Turn Log</h2>
						<div class="turn-log-scroll mt-3 grid gap-2 overflow-y-auto pr-1 text-sm">
							{#if game.turnLog.length === 0}
								<p class="border border-line bg-neutral-50 px-3 py-2 text-neutral-500">
									Rolls for this round will appear here.
								</p>
							{:else}
								{#each game.turnLog as entry}
									{@const displayEntry = getDisplayLogEntry(entry)}
									<div class="flex flex-wrap items-center gap-2 border border-line px-3 py-2">
										{#if displayEntry}
											<span>{displayEntry.playerName} rolled</span>
											<MiniDiceRow
												values={displayEntry.dice}
												label={`${displayEntry.playerName} roll dice`}
												highlightedIndexes={getLogHighlightIndexes(displayEntry)}
												celebrationIndexes={getLogCelebrationIndexes(displayEntry)}
											/>
											<span class="whitespace-nowrap">{displayEntry.resultText}</span>
										{:else}
											<span>{entry.text}</span>
										{/if}
									</div>
								{/each}
							{/if}
						</div>
					</section>
				</div>

				<div class="grid gap-5">
					<BellRollFinalResults {game} {rankings} />
					<BellRollScoreboard
						{game}
						currentPlayerId={currentPlayer.id}
						nextPlayerId={nextPlayer.id}
						onEditPlayer={openEditPlayer}
					/>
					<BellRollTableScores {game} />
					<BellRollRoundHistory {game} />
				</div>
			</section>
		{/if}
	</div>

	{#if howToPlayOpen}
		<HowToPlayModal
			title="How to Play Bell Roll"
			intro="Bell Roll is a three-dice round game about matching the current target number."
			sections={howToPlaySections}
			onClose={() => (howToPlayOpen = false)}
		/>
	{/if}
	{#if editPlayer}
		<EditPlayerModal
			playerName={editPlayer.name}
			canRemove={game.mode === 'party'
				? game.players.filter((player) => !player.ghost).length > 4
				: game.players.filter((player) => !player.ghost).length > 2}
			onNameChange={renameEditedPlayer}
			onRemove={removeEditedPlayer}
			onClose={closeEditPlayer}
		/>
	{/if}
</main>

<style>
	.turn-log-scroll {
		max-height: calc((2.75rem * 5) + (0.5rem * 4));
	}
</style>
