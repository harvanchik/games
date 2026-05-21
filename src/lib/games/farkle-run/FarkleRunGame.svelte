<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import AppHeader from '$lib/components/shared/AppHeader.svelte';
	import DiceFace from '$lib/components/shared/DiceFace.svelte';
	import EditPlayerModal from '$lib/components/shared/EditPlayerModal.svelte';
	import HowToPlayModal from '$lib/components/shared/HowToPlayModal.svelte';
	import MiniDiceRow from '$lib/components/shared/MiniDiceRow.svelte';
	import { createDiceScrambleDurations } from '$lib/utils/diceAnimation';
	import { playDiceRollSound } from '$lib/utils/soundEffects';
	import {
		applyFarkleRoll,
		bankTurn,
		createFarkleGame,
		getActivePlayer,
		getNextPlayer,
		getSelectedScore,
		keepSelectedDice,
		normalizeFarkleGame,
		removeFarklePlayer,
		renameFarklePlayer,
		startFarkleGame,
		toggleDie
	} from './farkleGame';
	import { rollFarkleDice, scoreSelectedDice } from './farkleScoring';
	import {
		buildFarkleSaveRecord,
		createDefaultFarkleGameName,
		createFarkleSaveId,
		deleteFarkleSavedGame,
		loadFarkleLastGameId,
		loadFarkleSavedGames,
		MAX_FARKLE_SAVED_GAMES,
		saveFarkleGameRecord,
		setFarkleLastGameId
	} from './farkleSave';
	import type {
		FarkleDiceValue,
		FarkleGameState,
		FarkleSavedGameRecord,
		FarkleTurnLogEntry
	} from './farkleTypes';

	let game = $state<FarkleGameState>(createFarkleGame());
	let gameName = $state(createDefaultFarkleGameName());
	let currentSaveId = $state(createFarkleSaveId());
	let savedGames = $state<FarkleSavedGameRecord[]>([]);
	let setupMode = $state<'new' | 'load'>('new');
	let playerCount = $state(2);
	let targetScore = $state(5000);
	let playerNames = $state(['Player 1', 'Player 2']);
	let confirmDeleteGameId = $state('');
	let persistenceReady = $state(false);
	let howToPlayOpen = $state(false);
	let rolling = $state(false);
	let visualDice = $state<FarkleDiceValue[]>([1, 2, 3, 4, 5, 6]);
	let rollingIndexes = $state(new Set<number>());
	let editPlayerId = $state<number | null>(null);
	const rollIntervals = new Map<number, ReturnType<typeof setInterval>>();
	const rollTimers = new Map<number, ReturnType<typeof setTimeout>>();

	const targetOptions = [1000, 2500, 5000, 10000];
	const howToPlaySections = [
		{
			title: 'Goal',
			items: [
				'Take turns rolling dice and banking points.',
				'The first player to reach the target score wins.',
				'You may keep rolling on a turn, but a no-score roll loses the unbanked turn points.'
			]
		},
		{
			title: 'Rolling',
			items: [
				'Roll all available dice, then select only dice that score.',
				'Keep selected scoring dice to add them to your turn points.',
				'Bank turn points to make them permanent, or roll again to try for more.'
			]
		},
		{
			title: 'Scoring',
			items: [
				'Single ones score 100, and single fives score 50.',
				'Three of a kind scores 100 times the value, except three ones score 1000.',
				'Four, five, and six of a kind score 1000, 2000, and 3000.',
				'A straight or three pairs scores 1500, and two triplets score 2500.'
			]
		}
	];

	let currentPlayer = $derived(getActivePlayer(game));
	let nextPlayer = $derived(getNextPlayer(game));
	let selectedScore = $derived(getSelectedScore(game));
	let trimmedGameName = $derived(gameName.trim());
	let duplicateSavedGame = $derived(
		savedGames.find(
			(savedGame) => savedGame.name.toLocaleLowerCase() === trimmedGameName.toLocaleLowerCase()
		) ?? null
	);
	let newSaveWouldExceedLimit = $derived(!duplicateSavedGame && savedGames.length >= MAX_FARKLE_SAVED_GAMES);
	let canStartNewGame = $derived(trimmedGameName.length > 0 && !newSaveWouldExceedLimit);
	let canRoll = $derived(game.setupComplete && game.phase === 'ready' && !rolling);
	let canKeepSelection = $derived(game.phase === 'selecting' && selectedScore.valid && !rolling);
	let canBank = $derived(game.phase === 'ready' && game.turnPoints > 0 && !rolling);
	let visibleDice = $derived(getVisibleDice());
	let diceAreFaded = $derived(!rolling && game.dice.length === 0);
	let rankedPlayers = $derived(
		[...game.players].sort((a, b) => b.totalScore - a.totalScore || b.lastTurnScore - a.lastTurnScore)
	);
	let editPlayer = $derived(
		editPlayerId === null ? null : (game.players.find((player) => player.id === editPlayerId) ?? null)
	);

	$effect(() => {
		if (!persistenceReady || !game.setupComplete) return;
		persistGame();
	});

	onMount(() => {
		const loadedGames = loadFarkleSavedGames();
		const lastGameId = loadFarkleLastGameId();
		const gameToLoad =
			loadedGames.find((savedGame) => savedGame.id === lastGameId) ?? loadedGames[0] ?? null;

		savedGames = loadedGames;
		if (gameToLoad) {
			applySavedGame(gameToLoad);
		}

		persistenceReady = true;
	});

	onDestroy(() => {
		clearRollTimers();
	});

	function startGame(): void {
		if (!canStartNewGame) return;

		clearRollTimers();
		const names = playerNames.slice(0, playerCount).map((name, index) => name.trim() || `Player ${index + 1}`);
		currentSaveId = duplicateSavedGame?.id ?? createFarkleSaveId();
		gameName = trimmedGameName;
		game = startFarkleGame(names, targetScore, gameName);
		setupMode = 'new';
		persistIfReady();
	}

	function newGame(): void {
		clearRollTimers();
		game = createFarkleGame();
		gameName = createDefaultFarkleGameName();
		currentSaveId = createFarkleSaveId();
		setupMode = 'new';
		playerCount = 2;
		targetScore = 5000;
		playerNames = ['Player 1', 'Player 2'];
		confirmDeleteGameId = '';
		howToPlayOpen = false;
		editPlayerId = null;
		visualDice = [1, 2, 3, 4, 5, 6];
	}

	function handleRollDice(): void {
		if (!canRoll) return;

		playDiceRollSound();
		const diceCount = game.availableDiceCount || 6;
		const finalValues = rollFarkleDice(diceCount);
		const durations = createDiceScrambleDurations(diceCount);
		rolling = true;
		rollingIndexes = new Set(finalValues.map((_, index) => index));
		game.statusMessage = 'Rolling...';
		visualDice = rollFarkleDice(diceCount);

		finalValues.forEach((finalValue, index) => {
			rollIntervals.set(
				index,
				setInterval(() => {
					visualDice[index] = rollFarkleDice(1)[0];
				}, 70)
			);

			rollTimers.set(
				index,
				setTimeout(() => finishRollingDie(index, finalValue, finalValues), durations[index])
			);
		});
	}

	function finishRollingDie(
		index: number,
		finalValue: FarkleDiceValue,
		finalValues: FarkleDiceValue[]
	): void {
		clearRollTimer(index);
		visualDice[index] = finalValue;
		const nextRollingIndexes = new Set([...rollingIndexes].filter((rollingIndex) => rollingIndex !== index));
		rollingIndexes = nextRollingIndexes;

		if (nextRollingIndexes.size > 0) return;

		rolling = false;
		applyFarkleRoll(game, finalValues);
		persistIfReady();
	}

	function handleToggleDie(dieId: number): void {
		toggleDie(game, dieId);
		persistIfReady();
	}

	function selectScoringDice(): void {
		if (game.phase !== 'selecting') return;

		const selectedIds = getAutoScoringDieIds();
		for (const die of game.dice) die.selected = selectedIds.includes(die.id);
		persistIfReady();
	}

	function keepSelection(): void {
		if (!canKeepSelection) return;

		keepSelectedDice(game);
		visualDice = getPlaceholderDice(game.availableDiceCount || 6);
		persistIfReady();
	}

	function bankPoints(): void {
		if (!canBank) return;

		bankTurn(game);
		visualDice = getPlaceholderDice(6);
		persistIfReady();
	}

	function renameGame(name: string): void {
		gameName = name;
	}

	function setPlayerCount(nextCount: number): void {
		playerCount = Math.min(8, Math.max(2, nextCount));
		playerNames = Array.from({ length: playerCount }, (_, index) => playerNames[index] ?? `Player ${index + 1}`);
	}

	function renameSetupPlayer(index: number, name: string): void {
		playerNames[index] = name;
	}

	function openEditPlayer(playerId: number): void {
		if (rolling) return;
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
		renameFarklePlayer(game, editPlayerId, name);
		persistIfReady();
	}

	function removeEditedPlayer(): void {
		if (editPlayerId === null) return;
		const removed = removeFarklePlayer(game, editPlayerId);
		if (!removed) return;
		editPlayerId = null;
		persistIfReady();
	}

	function changeSetupMode(nextMode: 'new' | 'load'): void {
		setupMode = savedGames.length > 0 || nextMode === 'new' ? nextMode : 'new';
		confirmDeleteGameId = '';
	}

	function loadSavedGame(id: string): void {
		const savedGame =
			loadFarkleSavedGames().find((record) => record.id === id) ??
			savedGames.find((record) => record.id === id);
		if (!savedGame) return;

		applySavedGame(savedGame);
		savedGames = loadFarkleSavedGames();
	}

	function requestDeleteSavedGame(id: string): void {
		confirmDeleteGameId = id;
	}

	function confirmDeleteSavedGame(id: string): void {
		savedGames = deleteFarkleSavedGame(id);
		confirmDeleteGameId = '';

		if (id === currentSaveId) newGame();
		if (!savedGames.length) setupMode = 'new';
	}

	function applySavedGame(savedGame: FarkleSavedGameRecord): void {
		clearRollTimers();
		game = normalizeFarkleGame(structuredClone(savedGame.snapshot.game));
		gameName = savedGame.snapshot.gameName || savedGame.name;
		currentSaveId = savedGame.id;
		setupMode = 'new';
		visualDice = game.dice.length ? game.dice.map((die) => die.value) : getPlaceholderDice(game.availableDiceCount || 6);
		setFarkleLastGameId(savedGame.id);
	}

	function persistIfReady(): void {
		if (!persistenceReady || !game.setupComplete) return;
		persistGame();
	}

	function persistGame(): void {
		savedGames = saveFarkleGameRecord(
			buildFarkleSaveRecord(currentSaveId, gameName, $state.snapshot(game))
		);
	}

	function getVisibleDice(): FarkleDiceValue[] {
		if (rolling) return visualDice;
		if (game.dice.length) return game.dice.map((die) => die.value);
		return getPlaceholderDice(game.availableDiceCount || 6);
	}

	function getPlaceholderDice(count: number): FarkleDiceValue[] {
		return Array.from({ length: count }, (_, index) => ((index % 6) + 1) as FarkleDiceValue);
	}

	function getAutoScoringDieIds(): number[] {
		const values = game.dice.map((die) => die.value);
		if (scoreSelectedDice(values).valid) return game.dice.map((die) => die.id);

		const ids = new Set<number>();
		for (const value of [1, 2, 3, 4, 5, 6] as FarkleDiceValue[]) {
			const matchingDice = game.dice.filter((die) => die.value === value);
			if (matchingDice.length >= 3) {
				for (const die of matchingDice) ids.add(die.id);
			}
		}

		for (const die of game.dice) {
			if (die.value === 1 || die.value === 5) ids.add(die.id);
		}

		const selectedDice = game.dice.filter((die) => ids.has(die.id));
		if (scoreSelectedDice(selectedDice.map((die) => die.value)).valid) return selectedDice.map((die) => die.id);

		return game.dice.filter((die) => die.value === 1 || die.value === 5).map((die) => die.id);
	}

	function getLogResult(entry: FarkleTurnLogEntry): string {
		if (entry.points === 0) return '+0 Turn over.';
		if (entry.points && entry.points > 0) return `+${entry.points}`;
		return entry.message;
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
		handleRollDice();
	}

	function clearRollTimers(): void {
		for (const index of [...rollIntervals.keys(), ...rollTimers.keys()]) {
			clearRollTimer(index);
		}
		rollingIndexes = new Set();
		rolling = false;
	}

	function clearRollTimer(index: number): void {
		const interval = rollIntervals.get(index);
		const timer = rollTimers.get(index);

		if (interval) clearInterval(interval);
		if (timer) clearTimeout(timer);

		rollIntervals.delete(index);
		rollTimers.delete(index);
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

	function formatPoints(points: number): string {
		return `${points.toLocaleString()} pts`;
	}
</script>

<svelte:head>
	<title>Farkle Run</title>
	<meta name="description" content="A clean push-your-luck six-dice game." />
</svelte:head>

<svelte:window onkeydown={handlePageKeydown} />

<main class="min-h-screen bg-paper px-4 py-6 text-neutral-900 sm:px-6 lg:px-8">
	<div class="mx-auto flex max-w-7xl flex-col gap-5">
		<AppHeader
			title="Farkle Run"
			activeGameId="farkle-run"
			onNewGame={newGame}
			onHelp={() => (howToPlayOpen = true)}
		/>

		{#if !game.setupComplete}
			<section class="grid min-h-[60vh] place-items-center">
				<div class="w-full max-w-5xl border border-line bg-white">
					<div class="grid grid-cols-2 border-b border-line">
						<button
							type="button"
							class={[
								'cursor-pointer border-r border-line px-4 py-4 text-lg font-semibold',
								setupMode === 'new' ? 'bg-accent text-white' : 'bg-white text-neutral-800'
							]}
							onclick={() => changeSetupMode('new')}
						>
							New Game
						</button>
						<button
							type="button"
							class={[
								'cursor-pointer px-4 py-4 text-lg font-semibold',
								setupMode === 'load' ? 'bg-accent text-white' : 'bg-white text-neutral-800'
							]}
							onclick={() => changeSetupMode('load')}
						>
							Load Game
						</button>
					</div>

					{#if setupMode === 'new'}
						<div class="grid gap-5 p-5">
							<div class="text-center">
								<h2 class="text-2xl font-bold text-neutral-950">New Farkle Run Game</h2>
								<p class="mt-2 text-neutral-600">Keep scoring dice, push your luck, and bank before you lose the turn.</p>
							</div>

							<label class="grid gap-2">
								<span class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Game Name</span>
								<input
									class="border border-line bg-white px-3 py-3 text-lg outline-none focus:border-accent"
									value={gameName}
									oninput={(event) => renameGame((event.currentTarget as HTMLInputElement).value)}
								/>
							</label>

							<div class="grid gap-4 md:grid-cols-3">
								<label class="grid gap-2">
									<span class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Players</span>
									<div class="grid grid-cols-[auto_1fr_auto] border border-line">
										<button
											type="button"
											class="cursor-pointer border-r border-line px-4 py-3 text-accent disabled:cursor-not-allowed disabled:text-neutral-300"
											disabled={playerCount <= 2}
											onclick={() => setPlayerCount(playerCount - 1)}
										>
											-
										</button>
										<div class="grid place-items-center px-4 py-3 text-lg font-bold">{playerCount}</div>
										<button
											type="button"
											class="cursor-pointer border-l border-line px-4 py-3 text-accent disabled:cursor-not-allowed disabled:text-neutral-300"
											disabled={playerCount >= 8}
											onclick={() => setPlayerCount(playerCount + 1)}
										>
											+
										</button>
									</div>
								</label>

								<label class="grid gap-2">
									<span class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Target Score</span>
									<select
										class="cursor-pointer border border-line bg-white px-3 py-3 text-lg outline-none focus:border-accent"
										value={targetScore}
										onchange={(event) => (targetScore = Number((event.currentTarget as HTMLSelectElement).value))}
									>
										{#each targetOptions as option}
											<option value={option}>{option.toLocaleString()} Points</option>
										{/each}
									</select>
								</label>

								<button
									type="button"
									class="mt-7 cursor-pointer border border-neutral-950 bg-neutral-950 px-4 py-3 text-lg font-semibold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:border-neutral-300 disabled:bg-neutral-200 disabled:text-neutral-500"
									disabled={!canStartNewGame}
									onclick={startGame}
								>
									Start Game
								</button>
							</div>

							{#if duplicateSavedGame}
								<p class="text-sm text-neutral-600">Starting will update the saved game with this same name.</p>
							{:else if newSaveWouldExceedLimit}
								<p class="text-sm font-semibold text-accent">Delete or overwrite a saved game first. Farkle Run keeps up to six saved games.</p>
							{/if}

							<div class="grid gap-3 md:grid-cols-2">
								{#each playerNames.slice(0, playerCount) as name, index}
									<label class="grid gap-2">
										<span class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Player {index + 1}</span>
										<input
											class="border border-line bg-white px-3 py-3 outline-none focus:border-accent"
											value={name}
											oninput={(event) => renameSetupPlayer(index, (event.currentTarget as HTMLInputElement).value)}
										/>
									</label>
								{/each}
							</div>
						</div>
					{:else}
						<div class="grid gap-5 p-5">
							<div class="text-center">
								<h2 class="text-2xl font-bold text-neutral-950">Load Game</h2>
								<p class="mt-2 text-neutral-600">Choose a saved Farkle Run game to continue.</p>
							</div>

							{#if savedGames.length}
								<div class="grid gap-2">
									{#each savedGames as savedGame}
										<div class="grid grid-cols-[1fr_auto_auto] items-center border border-line bg-white">
											<button
												type="button"
												class="cursor-pointer px-4 py-3 text-left font-semibold hover:bg-neutral-50"
												onclick={() => loadSavedGame(savedGame.id)}
											>
												{savedGame.name}
											</button>
											<span class="px-4 py-3 text-sm text-neutral-500">
												{new Date(savedGame.updatedAt).toLocaleDateString()}
											</span>
											{#if confirmDeleteGameId === savedGame.id}
												<button
													type="button"
													class="cursor-pointer border-l border-line px-4 py-3 font-semibold text-accent hover:bg-accent hover:text-white"
													onclick={() => confirmDeleteSavedGame(savedGame.id)}
												>
													Confirm
												</button>
											{:else}
												<button
													type="button"
													class="cursor-pointer border-l border-line px-4 py-3 text-lg text-accent hover:bg-neutral-50"
													aria-label={`Delete ${savedGame.name}`}
													onclick={() => requestDeleteSavedGame(savedGame.id)}
												>
													x
												</button>
											{/if}
										</div>
									{/each}
								</div>
							{:else}
								<p class="border border-line bg-neutral-50 p-4 text-center text-neutral-600">No saved Farkle Run games yet.</p>
							{/if}
						</div>
					{/if}
				</div>
			</section>
		{:else}
			<section class="grid gap-5 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
				<div class="flex flex-col gap-5">
					<section class="border border-line bg-white p-4">
						<p class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Current Turn</p>
						<h2 class="mt-1 text-xl font-bold text-neutral-950">
							{currentPlayer.name} - Round {game.roundNumber}
						</h2>
						<p class="mt-1 text-sm text-neutral-600">
							Turn points: {game.turnPoints.toLocaleString()} · Target {game.targetScore.toLocaleString()}
						</p>
					</section>

					<section class="border border-line bg-white p-4">
						<div class="flex items-center justify-between gap-3">
							<button
								type="button"
								class="h-12 w-32 cursor-pointer border border-accent bg-accent px-3 text-base font-semibold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:border-neutral-300 disabled:bg-neutral-200 disabled:text-neutral-500"
								disabled={!canRoll}
								onclick={handleRollDice}
							>
								Roll Dice
							</button>
							<div class="grid h-12 w-32 place-items-center border border-line bg-white text-base font-semibold">
								{game.availableDiceCount || 6} Dice
							</div>
						</div>

						<div class="mt-4 grid grid-cols-3 gap-2">
							{#each visibleDice as value, index}
								{@const die = game.dice[index]}
								<DiceFace
									{value}
									faded={diceAreFaded}
									rolling={rollingIndexes.has(index)}
									held={die?.selected ?? false}
									label={`Die ${index + 1} showing ${value}`}
									disabled={game.phase !== 'selecting' || !die}
									onclick={die ? () => handleToggleDie(die.id) : undefined}
								/>
							{/each}
						</div>

						<div class="mt-4 border border-line bg-neutral-50 p-3">
							<p class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Turn Status</p>
							<p class="mt-1 font-semibold text-neutral-950">{game.statusMessage}</p>
							{#if game.phase === 'selecting'}
								<p class="mt-1 text-sm text-neutral-600">
									Selected: {selectedScore.valid ? `${selectedScore.label} +${selectedScore.score}` : selectedScore.label}
								</p>
							{/if}
						</div>

						<div class="mt-4 grid gap-2 sm:grid-cols-3">
							<button
								type="button"
								class="cursor-pointer border border-line px-3 py-2 font-semibold hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:text-neutral-400 disabled:hover:border-line"
								disabled={game.phase !== 'selecting' || rolling}
								onclick={selectScoringDice}
							>
								Select Scoring
							</button>
							<button
								type="button"
								class="cursor-pointer border border-line px-3 py-2 font-semibold hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:text-neutral-400 disabled:hover:border-line"
								disabled={!canKeepSelection}
								onclick={keepSelection}
							>
								Keep Selected
							</button>
							<button
								type="button"
								class="cursor-pointer border border-neutral-950 bg-neutral-950 px-3 py-2 font-semibold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:border-neutral-300 disabled:bg-neutral-200 disabled:text-neutral-500"
								disabled={!canBank}
								onclick={bankPoints}
							>
								Bank Points
							</button>
						</div>
					</section>

					<section class="border border-line bg-white p-4">
						<h2 class="text-xl font-bold text-neutral-950">Turn Log</h2>
						<div class="mt-4 max-h-[20rem] overflow-y-auto pr-1">
							{#if game.turnLog.length}
								<div class="grid gap-2">
									{#each game.turnLog as entry}
										<div class="border border-line bg-white p-3 text-sm">
											<span class="font-semibold">{entry.playerName}</span>
											<span> {entry.dice ? 'rolled' : entry.message}</span>
											{#if entry.dice}
												<MiniDiceRow values={entry.dice} />
												<span class="ml-2 font-semibold">{getLogResult(entry)}</span>
											{/if}
										</div>
									{/each}
								</div>
							{:else}
								<p class="border border-line bg-neutral-50 p-3 text-sm text-neutral-600">Roll to begin.</p>
							{/if}
						</div>
					</section>
				</div>

				<div class="grid min-w-0 gap-5">
					<section class="border border-line bg-white">
						<div class="border-b border-line p-4">
							<h2 class="text-2xl font-bold text-neutral-950">Scoreboard</h2>
						</div>
						<div class="overflow-x-auto">
							<table class="w-full min-w-[720px] border-collapse text-sm">
								<thead class="bg-neutral-50 text-left text-neutral-500">
									<tr>
										<th class="border-b border-line px-4 py-3">Player</th>
										<th class="border-b border-line px-4 py-3 text-right">Total</th>
										<th class="border-b border-line px-4 py-3 text-right">Turn</th>
										<th class="border-b border-line px-4 py-3 text-right">Last Turn</th>
										<th class="border-b border-line px-4 py-3 text-right">Farkles</th>
									</tr>
								</thead>
								<tbody>
									{#each game.players as player}
										<tr class={player.id === currentPlayer.id ? 'bg-yellow-50' : 'bg-white'}>
											<td class="border-b border-line px-4 py-3">
												<button
													type="button"
													class="cursor-pointer text-left font-bold text-neutral-950 hover:text-accent"
													ondblclick={() => openEditPlayer(player.id)}
													onclick={(event) => {
														if ((event as MouseEvent).detail === 2) openEditPlayer(player.id);
													}}
												>
													{player.name}
												</button>
												{#if player.id === currentPlayer.id}
													<span class="ml-2 text-xs font-semibold text-accent">TURN</span>
												{:else if player.id === nextPlayer.id}
													<span class="ml-2 text-xs font-semibold text-neutral-500">NEXT</span>
												{/if}
											</td>
											<td class="border-b border-line px-4 py-3 text-right font-semibold">{formatPoints(player.totalScore)}</td>
											<td class="border-b border-line px-4 py-3 text-right">{player.id === currentPlayer.id ? formatPoints(game.turnPoints) : '-'}</td>
											<td class="border-b border-line px-4 py-3 text-right">{formatPoints(player.lastTurnScore)}</td>
											<td class="border-b border-line px-4 py-3 text-right">{player.farkles}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</section>

					<section class="grid gap-5 xl:grid-cols-[1fr_1fr]">
						<section class="border border-line bg-white p-4">
							<h2 class="text-xl font-bold text-neutral-950">Leaderboard</h2>
							<div class="mt-4 grid gap-2">
								{#each rankedPlayers as player, index}
									<div class={['grid grid-cols-[auto_1fr_auto] items-center gap-3 border border-line px-3 py-2', player.id === currentPlayer.id ? 'bg-yellow-50' : 'bg-white']}>
										<span class="text-neutral-500">{index + 1}</span>
										<span class="font-bold">{player.name}</span>
										<span class="font-semibold">{formatPoints(player.totalScore)}</span>
									</div>
								{/each}
							</div>
						</section>

						<section class="border border-line bg-white p-4">
							<h2 class="text-xl font-bold text-neutral-950">Scoring</h2>
							<div class="mt-4 grid gap-2 text-sm">
								<div class="grid grid-cols-[1fr_auto] border border-line px-3 py-2"><span>Single One</span><strong>100</strong></div>
								<div class="grid grid-cols-[1fr_auto] border border-line px-3 py-2"><span>Single Five</span><strong>50</strong></div>
								<div class="grid grid-cols-[1fr_auto] border border-line px-3 py-2"><span>Three Ones</span><strong>1000</strong></div>
								<div class="grid grid-cols-[1fr_auto] border border-line px-3 py-2"><span>Other Triples</span><strong>x100</strong></div>
								<div class="grid grid-cols-[1fr_auto] border border-line px-3 py-2"><span>Straight / Three Pairs</span><strong>1500</strong></div>
							</div>
						</section>
					</section>

					{#if game.phase === 'game-over'}
						<section class="border border-neutral-950 bg-neutral-950 p-5 text-white">
							<h2 class="text-2xl font-bold">Final Results</h2>
							<p class="mt-2 text-lg">
								{game.players.find((player) => player.id === game.winnerId)?.name ?? 'Winner'} wins with
								{(game.players.find((player) => player.id === game.winnerId)?.totalScore ?? 0).toLocaleString()} points.
							</p>
						</section>
					{/if}
				</div>
			</section>
		{/if}
	</div>

	{#if howToPlayOpen}
		<HowToPlayModal
			title="How to Play Farkle Run"
			intro="Farkle Run is a six-dice push-your-luck game. Keep scoring dice, then decide whether to roll again or bank."
			sections={howToPlaySections}
			onClose={() => (howToPlayOpen = false)}
		/>
	{/if}

	{#if editPlayer}
		<EditPlayerModal
			playerName={editPlayer.name}
			canRemove={game.players.length > 2}
			onNameChange={renameEditedPlayer}
			onRemove={removeEditedPlayer}
			onClose={closeEditPlayer}
		/>
	{/if}
</main>
