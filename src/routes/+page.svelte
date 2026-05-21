<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import DiceRow from '$lib/components/DiceRow.svelte';
	import GameControls from '$lib/components/GameControls.svelte';
	import GameLeaderboard from '$lib/components/GameLeaderboard.svelte';
	import PlayerSetup from '$lib/components/PlayerSetup.svelte';
	import ScoreCard from '$lib/components/ScoreCard.svelte';
	import AppHeader from '$lib/components/shared/AppHeader.svelte';
	import HowToPlayModal from '$lib/components/shared/HowToPlayModal.svelte';
	import { canScoreCategory as canScoreCategoryByRules, getFinalTotal } from '$lib/scoring';
	import {
		chooseCpuHeldDice,
		chooseCpuScoreCategory,
		cpuMakesOversight,
		shouldCpuScoreNow
	} from '$lib/pokerDiceCpu';
	import {
		getCpuGameSummary,
		loadCpuGameHistory,
		migrateCpuGameHistoryFromSavedGames,
		upsertCpuGameLogEntry
	} from '$lib/pokerDiceHistory';
	import { playDiceRollSound } from '$lib/utils/soundEffects';
	import {
		completeTurn,
		createCompletedRollOff,
		createCpuOpponentGame,
		createFreshDice,
		createGame,
		createPlayer,
		getWinnerText,
		isGameOver,
		rollOpenDice,
		scoreCurrentTurn,
		toggleDieHold
	} from '$lib/game';
	import {
		buildSaveRecord,
		createDefaultGameName,
		createSaveId,
		deleteSavedGame,
		loadLastGameId,
		loadSavedGames,
		MAX_SAVED_GAMES,
		saveGameRecord,
		setLastGameId
	} from '$lib/persistence';
	import type {
		CpuDifficulty,
		DiceValue,
		GameState,
		PersistedGameSnapshot,
		PlayerCount,
		PlayerRotation,
		RollOffResult,
		SavedGameRecord,
		ScoreCategory
	} from '$lib/types';

	const PLAYER_ROTATIONS: PlayerRotation[] = [0, 90, 180, 270];

	let playerCount = $state<PlayerCount>(1);
	let cpuDifficulty = $state<CpuDifficulty>('moderate');
	let setupVisible = $state(true);
	let game = $state<GameState>(createGame(1));
	let gameName = $state(createDefaultGameName());
	let currentSaveId = $state(createSaveId());
	let savedGames = $state<SavedGameRecord[]>([]);
	let setupMode = $state<'new' | 'load'>('new');
	let selectedLoadGameId = $state('');
	let confirmDeleteGameId = $state('');
	let persistenceReady = $state(false);
	let rollVersion = $state(0);
	let rollingDiceCount = $state(0);
	let selectedScorecardIndex = $state(0);
	let renamePlayerIndex = $state<number | null>(null);
	let lastTabClick = $state({ index: -1, at: 0 });
	let renameInput = $state<HTMLInputElement | null>(null);
	let recentScore = $state<{ playerId: number; category: ScoreCategory } | null>(null);
	let scoreRevealEndsAt = $state<number | null>(null);
	let howToPlayOpen = $state(false);
	let statsOpen = $state(false);
	let cpuGameHistory = $state(loadCpuGameHistory());
	let cpuTurnInProgress = $state(false);
	let rollOffInProgress = $state(false);
	let scoreRevealTimer: ReturnType<typeof setTimeout> | null = null;
	const cpuTimers = new Set<ReturnType<typeof setTimeout>>();

	const howToPlaySections = [
		{
			title: 'Goal',
			items: [
				'Roll five dice and choose one score category each round.',
				'Each category can be used only once.',
				'The game ends after all 13 categories are filled. Highest final total wins.'
			]
		},
		{
			title: 'Your Turn',
			items: [
				'Before Round 1, each player rolls once. Highest total chooses who starts.',
				'Roll up to three times.',
				'After the first roll, click dice to hold or release them.',
				'Held dice stay fixed while the other dice roll.'
			]
		},
		{
			title: 'Scoring',
			items: [
				'After at least one roll, pick any open legal category.',
				'The upper section gets a 35-point bonus when its subtotal reaches 63.',
				'Five of a Kind can earn extra 100-point bonuses after that category has scored 50.'
			]
		}
	];

	let activePlayer = $derived(game.players[game.activePlayerIndex]);
	let rollOffActive = $derived(game.rollOff?.active === true);
	let rollOffCurrentPlayer = $derived(
		game.players.find((player) => player.id === game.rollOff.currentPlayerId) ?? null
	);
	let rollOffPicker = $derived(
		game.players.find((player) => player.id === game.rollOff.pickerPlayerId) ?? null
	);
	let selectedPlayer = $derived(game.players[selectedScorecardIndex] ?? activePlayer);
	let renamePlayer = $derived(
		renamePlayerIndex === null ? null : (game.players[renamePlayerIndex] ?? null)
	);
	let activeRotation = $derived(setupVisible ? 0 : getPlayerRotation(activePlayer));
	let currentRenameRotation = $derived(getPlayerRotation(renamePlayer));
	let nextRenameRotation = $derived(getNextRotation(currentRenameRotation));
	let diceValues = $derived(game.dice.map((die) => die.value) as DiceValue[]);
	let gameOver = $derived(isGameOver(game));
	let winnerText = $derived(getWinnerText(game.players));
	let diceAreScrambling = $derived(rollingDiceCount > 0);
	let scoreRevealActive = $derived(recentScore !== null);
	let isCpuTurn = $derived(!setupVisible && !rollOffActive && !!activePlayer?.isCpu && !gameOver);
	let isCpuRollOffTurn = $derived(
		!setupVisible &&
			rollOffActive &&
			game.rollOff.status === 'rolling' &&
			!!rollOffCurrentPlayer?.isCpu
	);
	let canRoll = $derived(
		!rollOffActive &&
			!isCpuTurn &&
			!gameOver &&
			!diceAreScrambling &&
			!scoreRevealActive &&
			game.rollCount < 3
	);
	let canRollOff = $derived(
		rollOffActive &&
			game.rollOff.status === 'rolling' &&
			!rollOffCurrentPlayer?.isCpu &&
			!rollOffInProgress &&
			!diceAreScrambling
	);
	let canHoldDice = $derived(
		!rollOffActive &&
			!isCpuTurn &&
			!gameOver &&
			!diceAreScrambling &&
			!scoreRevealActive &&
			game.rollCount > 0
	);
	let scorecardRollCount = $derived(diceAreScrambling ? 0 : game.rollCount);
	let hasSavedGames = $derived(savedGames.length > 0);
	let canRemoveRenamePlayer = $derived(
		renamePlayerIndex !== null &&
			game.players.length > 1 &&
			!rollOffActive &&
			!scoreRevealActive &&
			!cpuTurnInProgress
	);
	let trimmedGameName = $derived(gameName.trim());
	let duplicateSavedGame = $derived(
		savedGames.find(
			(savedGame) => savedGame.name.toLocaleLowerCase() === trimmedGameName.toLocaleLowerCase()
		) ?? null
	);
	let newSaveWouldExceedLimit = $derived(!duplicateSavedGame && savedGames.length >= MAX_SAVED_GAMES);
	let canStartNewGame = $derived(trimmedGameName.length > 0 && !newSaveWouldExceedLimit);
	let cpuGameSummary = $derived(getCpuGameSummary(cpuGameHistory));

	$effect(() => {
		if (scoreRevealActive) return;
		selectedScorecardIndex = game.activePlayerIndex;
	});

	$effect(() => {
		if (!persistenceReady || setupVisible) return;
		persistCurrentGame();
	});

	$effect(() => {
		if (!savedGames.length) {
			selectedLoadGameId = '';
			confirmDeleteGameId = '';
			if (setupMode === 'load') setupMode = 'new';
			return;
		}

		if (savedGames.some((savedGame) => savedGame.id === selectedLoadGameId)) return;

		selectedLoadGameId = savedGames[0].id;
	});

	$effect(() => {
		if (savedGames.some((savedGame) => savedGame.id === confirmDeleteGameId)) return;

		confirmDeleteGameId = '';
	});

	$effect(() => {
		if (!renamePlayer || !renameInput) return;

		renameInput.focus();
		renameInput.select();
	});

	$effect(() => {
		if (!isCpuTurn || diceAreScrambling || scoreRevealActive || cpuTurnInProgress) return;

		startCpuTurn();
	});

	$effect(() => {
		if (!isCpuRollOffTurn || diceAreScrambling || rollOffInProgress) return;

		rollOffInProgress = true;
		queueCpuAction(() => rollForFirstTurn(true), 700);
	});

	$effect(() => {
		if (!persistenceReady || setupVisible || !gameOver) return;

		cpuGameHistory = upsertCpuGameLogEntry(
			loadCpuGameHistory(),
			$state.snapshot(game),
			currentSaveId,
			gameName
		);
	});

	onMount(() => {
		const loadedGames = loadSavedGames();
		const lastGameId = loadLastGameId();
		const gameToLoad =
			loadedGames.find((savedGame) => savedGame.id === lastGameId) ?? loadedGames[0] ?? null;

		savedGames = loadedGames;
		cpuGameHistory = migrateCpuGameHistoryFromSavedGames(loadedGames, loadCpuGameHistory());

		if (gameToLoad) {
			applySavedGame(gameToLoad);
		}

		persistenceReady = true;
	});

	onDestroy(() => {
		clearScoreRevealTimer();
		clearCpuTimers();
	});

	function startGame(): void {
		if (!canStartNewGame) return;

		const nextGameName = trimmedGameName;

		clearScoreReveal();
		clearCpuTimers();
		game = playerCount === 1 ? createCpuOpponentGame(cpuDifficulty) : createGame(playerCount, cpuDifficulty);
		gameName = nextGameName;
		currentSaveId = duplicateSavedGame?.id ?? createSaveId();
		rollVersion = 0;
		rollingDiceCount = 0;
		selectedScorecardIndex = 0;
		setupVisible = false;
		setupMode = 'new';
		persistIfReady();
	}

	function newGame(): void {
		clearScoreReveal();
		clearCpuTimers();
		game = createGame(1);
		playerCount = 1;
		cpuDifficulty = 'moderate';
		gameName = createDefaultGameName();
		currentSaveId = createSaveId();
		rollVersion = 0;
		rollingDiceCount = 0;
		selectedScorecardIndex = 0;
		confirmDeleteGameId = '';
		setupVisible = true;
		setupMode = 'new';
		renamePlayerIndex = null;
		howToPlayOpen = false;
		statsOpen = false;
	}

	function rollDice(): void {
		if (rollOffActive) {
			rollForFirstTurn();
			return;
		}

		if (!canRoll) return;

		rollActiveDice();
	}

	function rollActiveDice(): void {
		playDiceRollSound();
		game.dice = rollOpenDice(game.dice);
		game.rollCount += 1;
		rollVersion += 1;
		persistIfReady();
	}

	function toggleHold(index: number): void {
		if (!canHoldDice) return;

		game.dice = toggleDieHold(game.dice, index);
		persistIfReady();
	}

	function addPlayer(): void {
		if (game.players.length >= 10 || scoreRevealActive || cpuTurnInProgress) return;

		const nextPlayerId = Math.max(...game.players.map((player) => player.id), 0) + 1;

		game.players = [...game.players, createPlayer(nextPlayerId)];
		playerCount = game.players.length as PlayerCount;
		selectedScorecardIndex = game.players.length - 1;
		persistIfReady();
	}

	function handleScorecardTabClick(index: number): void {
		if (scoreRevealActive) return;

		const now = Date.now();
		const isDoubleClick = lastTabClick.index === index && now - lastTabClick.at < 350;

		selectedScorecardIndex = index;
		lastTabClick = { index, at: now };

		if (isDoubleClick) {
			openRenamePlayer(index);
		}
	}

	function openRenamePlayer(index: number): void {
		renamePlayerIndex = index;
	}

	function closeRenamePlayer(): void {
		if (renamePlayerIndex !== null) {
			const player = game.players[renamePlayerIndex];

			if (player && player.name.trim().length === 0) {
				player.name = `Player ${player.id}`;
			}
		}

		renamePlayerIndex = null;
	}

	function renamePlayerAsTyped(name: string): void {
		if (renamePlayerIndex === null) return;

		const player = game.players[renamePlayerIndex];
		if (!player) return;

		player.name = name;
		persistIfReady();
	}

	function cycleRenamePlayerRotation(): void {
		if (renamePlayerIndex === null) return;

		const player = game.players[renamePlayerIndex];
		if (!player) return;

		player.screenRotation = getNextRotation(getPlayerRotation(player));
		persistIfReady();
	}

	function removeRenamePlayer(): void {
		if (renamePlayerIndex === null || !canRemoveRenamePlayer) return;

		const removedIndex = renamePlayerIndex;
		const remainingPlayers = game.players.filter((_, index) => index !== removedIndex);

		game.players = remainingPlayers;
		game.activePlayerIndex = clampPlayerIndex(
			adjustIndexAfterRemoval(game.activePlayerIndex, removedIndex),
			remainingPlayers.length
		);
		selectedScorecardIndex = clampPlayerIndex(
			adjustIndexAfterRemoval(selectedScorecardIndex, removedIndex),
			remainingPlayers.length
		);
		playerCount = remainingPlayers.length as PlayerCount;
		renamePlayerIndex = null;
		persistIfReady();
	}

	function handlePageKeydown(event: KeyboardEvent): void {
		if (event.defaultPrevented || isTextEntryTarget(event.target)) return;

		if (event.key === 'Escape' && renamePlayerIndex !== null) {
			event.preventDefault();
			closeRenamePlayer();
			return;
		}

		if (event.code === 'Space') {
			event.preventDefault();
			rollDice();
			return;
		}

		const dieIndex = getShortcutDieIndex(event);
		if (dieIndex === null) return;

		event.preventDefault();
		toggleHold(dieIndex);
	}

	function canScoreCategory(category: ScoreCategory): boolean {
		if (rollOffActive || isCpuTurn || diceAreScrambling || scoreRevealActive) return false;
		return canScoreCategoryByRules(category, diceValues, activePlayer.scores, game.rollCount);
	}

	function chooseScore(category: ScoreCategory): void {
		if (!canScoreCategory(category)) return;

		scoreActiveCategory(category);
	}

	function scoreActiveCategory(category: ScoreCategory): void {
		const scoringPlayerId = activePlayer.id;
		if (!scoreCurrentTurn(game, category)) return;

		recentScore = { playerId: scoringPlayerId, category };
		scoreRevealEndsAt = Date.now() + 2000;
		selectedScorecardIndex = game.activePlayerIndex;
		rollVersion = 0;
		rollingDiceCount = 0;
		clearScoreRevealTimer();
		scoreRevealTimer = setTimeout(finishScoreReveal, 2000);
		persistIfReady();
	}

	function finishScoreReveal(): void {
		scoreRevealTimer = null;
		completeTurn(game);
		recentScore = null;
		scoreRevealEndsAt = null;
		cpuTurnInProgress = false;
		selectedScorecardIndex = game.activePlayerIndex;
		persistIfReady();
	}

	function handleDieAnimationStart(): void {
		rollingDiceCount += 1;
	}

	function handleDieAnimationEnd(): void {
		rollingDiceCount = Math.max(0, rollingDiceCount - 1);
	}

	function rollForFirstTurn(force = false): void {
		if (!rollOffActive || (!force && rollOffInProgress) || diceAreScrambling) return;
		if (game.rollOff.status !== 'rolling') return;

		rollOffInProgress = true;
		playDiceRollSound();
		game.dice = rollOpenDice(game.dice.map((die) => ({ ...die, held: false })));
		game.rollCount = 1;
		rollVersion += 1;
		persistIfReady();
		queueCpuAction(finishRollOffRoll, 2200);
	}

	function finishRollOffRoll(): void {
		if (!rollOffActive || game.rollOff.status !== 'rolling' || !game.rollOff.currentPlayerId) {
			rollOffInProgress = false;
			return;
		}

		const currentPlayerId = game.rollOff.currentPlayerId;
		const result: RollOffResult = {
			playerId: currentPlayerId,
			dice: diceValues,
			total: diceValues.reduce((total, value) => total + value, 0)
		};
		const nextResults = [
			...game.rollOff.results.filter((existingResult) => existingResult.playerId !== currentPlayerId),
			result
		];
		const currentIndex = game.rollOff.eligiblePlayerIds.indexOf(currentPlayerId);
		const nextPlayerId = game.rollOff.eligiblePlayerIds[currentIndex + 1] ?? null;

		game.rollOff.results = nextResults;
		game.rollCount = 0;
		rollVersion = 0;
		game.dice = createFreshDice();

		if (nextPlayerId !== null) {
			game.rollOff.currentPlayerId = nextPlayerId;
			rollOffInProgress = false;
			persistIfReady();
			return;
		}

		resolveRollOffRound(nextResults);
		rollOffInProgress = false;
		persistIfReady();
	}

	function resolveRollOffRound(results: RollOffResult[]): void {
		const eligibleResults = results.filter((result) =>
			game.rollOff.eligiblePlayerIds.includes(result.playerId)
		);
		const highestTotal = Math.max(...eligibleResults.map((result) => result.total));
		const highResults = eligibleResults.filter((result) => result.total === highestTotal);

		if (highResults.length > 1) {
			game.rollOff.eligiblePlayerIds = highResults.map((result) => result.playerId);
			game.rollOff.currentPlayerId = highResults[0].playerId;
			game.rollOff.results = results.filter((result) =>
				highResults.some((highResult) => highResult.playerId === result.playerId)
			);
			game.rollOff.pickerPlayerId = null;
			game.rollOff.status = 'rolling';
			return;
		}

		const pickerPlayerId = highResults[0].playerId;
		game.rollOff.pickerPlayerId = pickerPlayerId;
		game.rollOff.currentPlayerId = null;
		game.rollOff.status = 'chooseStarter';

		const picker = game.players.find((player) => player.id === pickerPlayerId);
		if (picker?.isCpu) {
			rollOffInProgress = true;
			queueCpuAction(() => chooseStartingPlayer(pickerPlayerId), 1000);
		}
	}

	function chooseStartingPlayer(playerId: number): void {
		if (!rollOffActive || game.rollOff.status !== 'chooseStarter') return;

		const nextIndex = game.players.findIndex((player) => player.id === playerId);
		if (nextIndex < 0) return;

		game.activePlayerIndex = nextIndex;
		selectedScorecardIndex = nextIndex;
		game.rollOff.active = false;
		game.rollOff.status = 'complete';
		game.rollOff.currentPlayerId = null;
		game.dice = createFreshDice();
		game.rollCount = 0;
		rollVersion = 0;
		rollOffInProgress = false;
		persistIfReady();
	}

	function startCpuTurn(): void {
		if (!isCpuTurn) return;

		cpuTurnInProgress = true;
		selectedScorecardIndex = game.activePlayerIndex;
		queueCpuAction(takeCpuRoll, 700);
	}

	function takeCpuRoll(): void {
		if (!isCpuTurn || scoreRevealActive || diceAreScrambling || game.rollCount >= 3) {
			cpuTurnInProgress = false;
			return;
		}

		rollActiveDice();
		queueCpuAction(reviewCpuRoll, 2200);
	}

	function reviewCpuRoll(): void {
		if (!isCpuTurn || scoreRevealActive || diceAreScrambling) {
			cpuTurnInProgress = false;
			return;
		}

		const difficulty = game.cpuDifficulty ?? 'moderate';
		const oversight = cpuMakesOversight(difficulty);
		if (shouldCpuScoreNow(diceValues, activePlayer.scores, game.rollCount, oversight ? true : difficulty)) {
			const category = chooseCpuScoreCategory(diceValues, activePlayer.scores, oversight ? true : difficulty);
			scoreActiveCategory(category);
			return;
		}

		const heldDice = chooseCpuHeldDice(
			game.dice,
			activePlayer.scores,
			oversight ? true : difficulty,
			game.rollCount
		);
		game.dice = game.dice.map((die, index) => ({
			...die,
			held: heldDice[index] ?? false
		}));
		persistIfReady();
		queueCpuAction(takeCpuRoll, 1000);
	}

	function queueCpuAction(action: () => void, delay: number): void {
		const timer = setTimeout(() => {
			cpuTimers.delete(timer);
			action();
		}, delay);
		cpuTimers.add(timer);
	}

	function clearCpuTimers(): void {
		for (const timer of cpuTimers) {
			clearTimeout(timer);
		}
		cpuTimers.clear();
		cpuTurnInProgress = false;
		rollOffInProgress = false;
	}

	function renameGame(name: string): void {
		gameName = name;
		persistIfReady();
	}

	function loadSavedGame(id: string): void {
		const savedGame =
			loadSavedGames().find((record) => record.id === id) ??
			savedGames.find((record) => record.id === id);
		if (!savedGame) return;

		clearScoreReveal();
		applySavedGame(savedGame);
		savedGames = loadSavedGames();
	}

	function selectSavedGame(id: string): void {
		selectedLoadGameId = id;
		confirmDeleteGameId = '';
		loadSavedGame(id);
	}

	function requestDeleteSavedGame(id: string): void {
		confirmDeleteGameId = id;
	}

	function confirmDeleteSavedGame(id: string): void {
		savedGames = deleteSavedGame(id);
		confirmDeleteGameId = '';

		if (id === selectedLoadGameId) {
			selectedLoadGameId = savedGames[0]?.id ?? '';
		}

		if (setupVisible) {
			if (id === currentSaveId) {
				currentSaveId = createSaveId();
			}

			if (!savedGames.length) {
				setupMode = 'new';
			}

			return;
		}

		if (id !== currentSaveId) return;

		const nextSavedGame = savedGames[0];
		if (nextSavedGame) {
			applySavedGame(nextSavedGame);
			return;
		}

		clearScoreReveal();
		game = createGame(1);
		playerCount = 1;
		cpuDifficulty = 'moderate';
		gameName = createDefaultGameName();
		currentSaveId = createSaveId();
		setupVisible = true;
		setupMode = 'new';
		selectedScorecardIndex = 0;
		rollVersion = 0;
		rollingDiceCount = 0;
	}

	function applySavedGame(savedGame: SavedGameRecord): void {
		const snapshot = savedGame.snapshot;

		clearScoreReveal();
		clearCpuTimers();
		game = normalizeGameState(structuredClone(snapshot.game));
		cpuDifficulty = game.cpuDifficulty ?? 'moderate';
		gameName = snapshot.gameName || savedGame.name;
		playerCount = snapshot.playerCount;
		setupVisible = snapshot.setupVisible;
		selectedScorecardIndex = Math.min(
			snapshot.selectedScorecardIndex,
			Math.max(0, snapshot.game.players.length - 1)
		);
		currentSaveId = savedGame.id;
		rollVersion = 0;
		rollingDiceCount = 0;
		renamePlayerIndex = null;
		setLastGameId(savedGame.id);

		if (snapshot.recentScore && snapshot.scoreRevealEndsAt) {
			recentScore = snapshot.recentScore;
			scoreRevealEndsAt = snapshot.scoreRevealEndsAt;
			selectedScorecardIndex = game.activePlayerIndex;
			scheduleScoreReveal(snapshot.scoreRevealEndsAt - Date.now());
		}
	}

	function clearScoreReveal(): void {
		clearScoreRevealTimer();
		recentScore = null;
		scoreRevealEndsAt = null;
	}

	function clearScoreRevealTimer(): void {
		if (!scoreRevealTimer) return;

		clearTimeout(scoreRevealTimer);
		scoreRevealTimer = null;
	}

	function scheduleScoreReveal(delay: number): void {
		clearScoreRevealTimer();

		if (delay <= 0) {
			finishScoreReveal();
			return;
		}

		scoreRevealTimer = setTimeout(finishScoreReveal, delay);
	}

	function persistCurrentGame(): void {
		savedGames = saveGameRecord(buildSaveRecord(currentSaveId, gameName, createCurrentSnapshot()));
	}

	function persistIfReady(): void {
		if (!persistenceReady || setupVisible) return;
		persistCurrentGame();
	}

	function createCurrentSnapshot(): PersistedGameSnapshot {
		const plainRecentScore = recentScore
			? { playerId: recentScore.playerId, category: recentScore.category }
			: null;

		return {
			game: $state.snapshot(game),
			gameName,
			playerCount,
			selectedScorecardIndex,
			setupVisible,
			recentScore: plainRecentScore,
			scoreRevealEndsAt
		};
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

	function getShortcutDieIndex(event: KeyboardEvent): number | null {
		const key = event.key;

		if (!['1', '2', '3', '4', '5'].includes(key)) return null;

		return Number(key) - 1;
	}

	function adjustIndexAfterRemoval(index: number, removedIndex: number): number {
		if (index > removedIndex) return index - 1;
		if (index === removedIndex) return removedIndex;

		return index;
	}

	function clampPlayerIndex(index: number, playerTotal: number): number {
		return Math.max(0, Math.min(index, playerTotal - 1));
	}

	function normalizeGameState(savedGame: GameState): GameState {
		const players = savedGame.players.map((player) => ({
			...player,
			isCpu: player.isCpu ?? false,
			screenRotation: getPlayerRotation(player)
		}));
		const rollOff = savedGame.rollOff ?? createCompletedRollOff();
		const currentPlayerStillExists = players.some((player) => player.id === rollOff.currentPlayerId);
		const pickerStillExists = players.some((player) => player.id === rollOff.pickerPlayerId);

		return {
			...savedGame,
			cpuDifficulty: savedGame.cpuDifficulty ?? 'moderate',
			rollOff: {
				...rollOff,
				active: rollOff.active ?? false,
				status: rollOff.status ?? 'complete',
				eligiblePlayerIds: (rollOff.eligiblePlayerIds ?? []).filter((playerId) =>
					players.some((player) => player.id === playerId)
				),
				currentPlayerId: currentPlayerStillExists ? rollOff.currentPlayerId : null,
				pickerPlayerId: pickerStillExists ? rollOff.pickerPlayerId : null,
				results: rollOff.results ?? []
			},
			players,
			activePlayerIndex: clampPlayerIndex(savedGame.activePlayerIndex, players.length)
		};
	}

	function getPlayerRotation(player: { screenRotation?: number } | null | undefined): PlayerRotation {
		const rotation = player?.screenRotation;

		return PLAYER_ROTATIONS.includes(rotation as PlayerRotation)
			? (rotation as PlayerRotation)
			: 0;
	}

	function getNextRotation(rotation: PlayerRotation): PlayerRotation {
		const currentIndex = PLAYER_ROTATIONS.indexOf(rotation);

		return PLAYER_ROTATIONS[(currentIndex + 1) % PLAYER_ROTATIONS.length];
	}

	function formatRotation(rotation: PlayerRotation): string {
		if (rotation === 0) return '0 degrees';
		if (rotation === 270) return '-90 degrees';

		return `${rotation} degrees`;
	}

	function formatCpuDifficulty(difficulty: CpuDifficulty): string {
		return difficulty[0].toUpperCase() + difficulty.slice(1);
	}

	function formatGameDate(value: string): string {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Unknown date';

		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function formatResult(result: 'win' | 'loss' | 'tie'): string {
		if (result === 'win') return 'Win';
		if (result === 'loss') return 'Loss';

		return 'Tie';
	}

	function getRollOffResult(playerId: number): RollOffResult | null {
		return game.rollOff.results.find((result) => result.playerId === playerId) ?? null;
	}

	function formatRollOffDice(result: RollOffResult | null): string {
		return result ? result.dice.join('-') : '-';
	}
</script>

<svelte:head>
	<title>Poker Dice</title>
	<meta
		name="description"
		content="A clean digital five-dice scorecard game with classic scoring rules."
	/>
</svelte:head>

<svelte:window onkeydown={handlePageKeydown} />

<main
	class={[
		'min-h-screen bg-paper text-neutral-900',
		activeRotation === 90 || activeRotation === 270
			? 'page-rotation-stage'
			: 'px-4 py-6 sm:px-6 lg:px-8',
		activeRotation === 90 ? 'page-rotation-90' : '',
		activeRotation === 180 ? 'page-rotation-180' : '',
		activeRotation === 270 ? 'page-rotation-270' : ''
	]}
>
	<div
		data-testid="rotation-shell"
		class="page-rotation-shell mx-auto flex max-w-7xl flex-col gap-5"
		style={`--page-rotation: ${activeRotation}deg; --page-scale: ${activeRotation === 90 || activeRotation === 270 ? 0.8 : 1};`}
	>
		<AppHeader
			title="Poker Dice"
			activeGameId="poker-dice"
			onNewGame={newGame}
			onHelp={() => (howToPlayOpen = true)}
			onStats={() => (statsOpen = true)}
		/>

		{#if setupVisible}
			<section class="grid min-h-[55vh] place-items-center">
				<div class="grid w-full max-w-2xl gap-0 border border-line bg-white">
					<div class="grid grid-cols-2 border-b border-line">
						<button
							type="button"
							data-testid="setup-new-game-tab"
							class={[
								'cursor-pointer border-r border-line px-4 py-3 font-semibold',
								setupMode === 'new'
									? 'bg-accent text-white'
									: 'bg-white text-neutral-700 hover:bg-neutral-100'
							]}
							onclick={() => (setupMode = 'new')}
						>
							New Game
						</button>
						<button
							type="button"
							data-testid="setup-load-game-tab"
							class={[
								'px-4 py-3 font-semibold disabled:cursor-not-allowed disabled:text-neutral-300',
								hasSavedGames ? 'cursor-pointer' : '',
								setupMode === 'load'
									? 'bg-accent text-white'
									: 'bg-white text-neutral-700 hover:bg-neutral-100'
							]}
							disabled={!hasSavedGames}
							onclick={() => (setupMode = hasSavedGames ? 'load' : 'new')}
						>
							Load Game
						</button>
					</div>

					{#if setupMode === 'new'}
						<div class="grid gap-5 p-5">
							<div class="text-center">
								<h2 class="text-xl font-bold text-neutral-950">New Game</h2>
								<p class="mt-1 text-sm text-neutral-600">
									Name the game, choose players, then start. Up to {MAX_SAVED_GAMES} games can be saved.
								</p>
							</div>

							<label class="grid gap-1">
								<span class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Game Name</span>
								<input
									data-testid="setup-game-name-input"
									class="w-full border border-line bg-white px-3 py-2 text-neutral-950 outline-none focus:border-accent"
									type="text"
									value={gameName}
									oninput={(event) => renameGame((event.currentTarget as HTMLInputElement).value)}
								/>
							</label>

							{#if duplicateSavedGame}
								<p class="border border-accent bg-yellow-50 px-3 py-2 text-sm text-neutral-700">
									This name already exists. Starting will override that saved game.
								</p>
							{:else if newSaveWouldExceedLimit}
								<p class="border border-accent bg-yellow-50 px-3 py-2 text-sm text-neutral-700">
									You have {MAX_SAVED_GAMES} saved games. Delete one or enter an existing game name to override it.
								</p>
							{:else if trimmedGameName.length === 0}
								<p class="border border-line bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
									Enter a game name before starting.
								</p>
							{/if}

							<PlayerSetup
								{playerCount}
								{cpuDifficulty}
								onSelectPlayerCount={(count) => (playerCount = count)}
								onSelectCpuDifficulty={(difficulty) => (cpuDifficulty = difficulty)}
								centered={true}
							/>

							<div class="flex justify-center">
								<button
									type="button"
									data-testid="start-button"
									class="cursor-pointer border border-neutral-950 bg-neutral-950 px-5 py-2 font-semibold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:border-neutral-300 disabled:bg-neutral-200 disabled:text-neutral-500"
									disabled={!canStartNewGame}
									onclick={startGame}
								>
									{duplicateSavedGame ? 'Override Saved Game' : 'Start New Game'}
								</button>
							</div>
						</div>
					{:else}
						<div class="grid gap-5 p-5">
							<div class="text-center">
								<h2 class="text-xl font-bold text-neutral-950">Load Game</h2>
								<p class="mt-1 text-sm text-neutral-600">
									Choose a saved game to continue. Saved games are limited to {MAX_SAVED_GAMES}.
								</p>
							</div>

							<div class="grid gap-2">
								<p class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Saved Games</p>

								{#if savedGames.length === 0}
									<p class="border border-line bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
										No saved games yet.
									</p>
								{:else}
									{#each savedGames as savedGame}
										<div
											class={[
												'grid grid-cols-[1fr_auto] items-center border border-line bg-white',
												savedGame.id === currentSaveId ? 'border-accent bg-yellow-50' : ''
											]}
										>
											<button
												type="button"
												data-testid={`load-game-${savedGame.id}`}
												class="min-w-0 cursor-pointer px-3 py-3 text-left font-semibold text-neutral-950 hover:bg-neutral-100"
												onclick={() => selectSavedGame(savedGame.id)}
											>
												<span class="block truncate">{savedGame.name}</span>
											</button>

											{#if confirmDeleteGameId === savedGame.id}
												<button
													type="button"
													data-testid={`confirm-delete-game-${savedGame.id}`}
													class="cursor-pointer border-l border-accent bg-accent px-3 py-3 text-sm font-semibold text-white hover:bg-accent-dark"
													onclick={() => confirmDeleteSavedGame(savedGame.id)}
												>
													Confirm
												</button>
											{:else}
												<button
													type="button"
													data-testid={`delete-game-${savedGame.id}`}
													class="cursor-pointer border-l border-line px-3 py-3 text-lg font-bold text-neutral-500 hover:text-accent"
													aria-label={`Delete ${savedGame.name}`}
													onclick={() => requestDeleteSavedGame(savedGame.id)}
												>
													x
												</button>
											{/if}
										</div>
									{/each}
								{/if}
							</div>
						</div>
					{/if}
				</div>
			</section>
		{:else if rollOffActive}
			<section class="grid gap-5 lg:grid-cols-[minmax(280px,420px)_1fr]">
				<div class="grid gap-5">
					<section class="border border-line bg-white p-5">
						<p class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Roll For First Turn</p>
						<h2 class="mt-1 text-2xl font-bold text-neutral-950">
							{#if game.rollOff.status === 'chooseStarter' && rollOffPicker}
								{rollOffPicker.name} chooses who starts
							{:else if rollOffCurrentPlayer}
								{rollOffCurrentPlayer.name} rolls now
							{:else}
								Preparing roll-off
							{/if}
						</h2>
						<p class="mt-2 text-sm text-neutral-600">
							Each player rolls all five dice once. Highest total picks who takes the first turn.
						</p>
					</section>

					<section class="border border-line bg-white p-4">
						<div class="mb-4 flex items-center justify-between gap-4">
							<button
								type="button"
								data-testid="roll-off-button"
								class="h-10 min-w-32 cursor-pointer border border-accent bg-accent px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:border-neutral-300 disabled:bg-neutral-200 disabled:text-neutral-500"
								disabled={!canRollOff}
								onclick={() => rollForFirstTurn()}
							>
								{rollOffCurrentPlayer?.isCpu ? 'CPU Rolling' : 'Roll Dice'}
							</button>
							<p class="grid h-10 min-w-32 place-items-center border border-line px-3 text-sm font-semibold">
								One Roll
							</p>
						</div>
						<DiceRow
							dice={game.dice}
							canHold={false}
							rollCount={game.rollCount}
							{rollVersion}
							onToggle={() => undefined}
							onAnimationStart={handleDieAnimationStart}
							onAnimationEnd={handleDieAnimationEnd}
						/>
					</section>
				</div>

				<section class="border border-line bg-white p-5">
					<div class="flex items-start justify-between gap-4">
						<div>
							<h2 class="text-xl font-bold text-neutral-950">Roll-Off Results</h2>
							<p class="mt-1 text-sm text-neutral-600">
								Ties reroll until one player has the highest total.
							</p>
						</div>
					</div>

					<div class="mt-4 overflow-x-auto border border-line">
						<table class="w-full min-w-[520px] border-collapse text-sm">
							<thead>
								<tr class="bg-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-500">
									<th class="border-b border-r border-line px-3 py-2">Player</th>
									<th class="border-b border-r border-line px-3 py-2">Dice</th>
									<th class="border-b border-line px-3 py-2">Total</th>
								</tr>
							</thead>
							<tbody>
								{#each game.players as player}
									{@const result = getRollOffResult(player.id)}
									<tr
										class={[
											player.id === game.rollOff.currentPlayerId ? 'bg-yellow-50' : 'bg-white',
											player.id === game.rollOff.pickerPlayerId ? 'font-bold' : ''
										]}
									>
										<td class="border-b border-r border-line px-3 py-2">
											{player.name}
											{#if player.id === game.rollOff.currentPlayerId}
												<span class="ml-1 text-xs uppercase text-accent">Roll</span>
											{:else if player.id === game.rollOff.pickerPlayerId}
												<span class="ml-1 text-xs uppercase text-accent">High</span>
											{/if}
										</td>
										<td class="border-b border-r border-line px-3 py-2 text-neutral-600">
											{formatRollOffDice(result)}
										</td>
										<td class="border-b border-line px-3 py-2 font-bold">
											{result?.total ?? '-'}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					{#if game.rollOff.status === 'chooseStarter' && rollOffPicker}
						<div class="mt-5 border border-accent bg-yellow-50 p-4">
							<p class="font-semibold text-neutral-950">
								{rollOffPicker.name} rolled highest and picks who goes first.
							</p>
							<div class="mt-3 grid gap-2 sm:grid-cols-2">
								{#each game.players as player}
									<button
										type="button"
										data-testid={`choose-starter-${player.id}`}
										class="cursor-pointer border border-line bg-white px-3 py-2 font-semibold hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:text-neutral-400"
										disabled={rollOffPicker.isCpu || rollOffInProgress}
										onclick={() => chooseStartingPlayer(player.id)}
									>
										{player.name} starts
									</button>
								{/each}
							</div>
							{#if rollOffPicker.isCpu}
								<p class="mt-3 text-sm text-neutral-600">CPU is choosing the first player.</p>
							{/if}
						</div>
					{:else if game.rollOff.eligiblePlayerIds.length < game.players.length}
						<p class="mt-4 border border-line bg-neutral-50 p-3 text-sm text-neutral-600">
							Tied high rollers are rolling again.
						</p>
					{/if}
				</section>
			</section>
		{:else}
			<section
				class={[
					'game-table-layout game-board',
					activeRotation === 90 ? 'game-board-rotation-90' : '',
					activeRotation === 180 ? 'game-board-rotation-180' : '',
					activeRotation === 270 ? 'game-board-rotation-270' : ''
				]}
			>
				<div class="game-side-panel flex flex-col gap-5">
					<GameControls
						activePlayerName={activePlayer.name}
						roundNumber={game.roundNumber}
						{gameOver}
						{winnerText}
					/>

					<section class="border border-line bg-white p-4">
						<div class="mb-4 flex items-center justify-between gap-4">
							<button
								type="button"
								data-testid="roll-button"
								class="h-10 min-w-32 cursor-pointer border border-accent bg-accent px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:border-neutral-300 disabled:bg-neutral-200 disabled:text-neutral-500"
								disabled={!canRoll}
								onclick={rollDice}
							>
								Roll Dice
							</button>
							<p class="grid h-10 min-w-32 place-items-center border border-line px-3 text-sm font-semibold">
								Roll {game.rollCount} of 3
							</p>
						</div>
						<DiceRow
							dice={game.dice}
							canHold={canHoldDice}
							rollCount={game.rollCount}
							{rollVersion}
							onToggle={toggleHold}
							onAnimationStart={handleDieAnimationStart}
							onAnimationEnd={handleDieAnimationEnd}
						/>
					</section>

					<GameLeaderboard players={game.players} activePlayerId={activePlayer.id} />
				</div>

				<div class="scorecard-panel grid gap-0">
					<div class="flex flex-wrap border border-b-0 border-line bg-white" role="tablist" aria-label="Player scorecards">
						{#each game.players as player, index}
							<button
								type="button"
								role="tab"
							data-testid={`scorecard-tab-${player.id}`}
							class={[
								'border-r border-line px-4 py-3 text-sm font-semibold hover:bg-neutral-100 disabled:cursor-not-allowed',
								scoreRevealActive ? 'cursor-not-allowed' : 'cursor-pointer',
								selectedScorecardIndex === index
									? 'bg-accent text-white hover:bg-accent'
									: index === game.activePlayerIndex
											? 'bg-neutral-100 text-accent'
											: 'bg-white text-neutral-700'
								]}
								aria-selected={selectedScorecardIndex === index}
								disabled={scoreRevealActive}
								onclick={() => handleScorecardTabClick(index)}
							>
								{player.name}
								{#if index === game.activePlayerIndex && !gameOver}
									<span class="ml-1 text-xs uppercase">Turn</span>
								{/if}
							</button>
						{/each}
						<button
							type="button"
							data-testid="add-player-button"
							class="cursor-pointer border-r border-line bg-white px-4 py-3 text-lg font-bold text-accent hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-300"
							aria-label="Add player"
							disabled={game.players.length >= 10 || scoreRevealActive || cpuTurnInProgress || gameOver}
							onclick={addPlayer}
						>
							+
						</button>
					</div>

					<ScoreCard
						player={selectedPlayer}
						{diceValues}
						rollCount={scorecardRollCount}
						active={selectedScorecardIndex === game.activePlayerIndex}
						{gameOver}
						{recentScore}
						{canScoreCategory}
						onChooseScore={chooseScore}
					/>
				</div>
			</section>

			{#if gameOver}
				<section class="border border-accent bg-white p-5">
					<h2 class="text-xl font-bold text-neutral-950">Final Scores</h2>
					<p class="mt-1 text-neutral-700">{winnerText}</p>
					<div class="mt-4 grid gap-2 sm:grid-cols-2">
						{#each game.players as player}
							<div class="border border-line p-3">
								<p class="font-semibold">{player.name}</p>
								<p class="text-2xl font-bold">
									{getFinalTotal(player.scores, player.fiveKindBonuses)}
								</p>
							</div>
						{/each}
					</div>
				</section>
			{/if}
		{/if}
	</div>
	{#if renamePlayer}
		<div
			class="fixed inset-0 z-50 grid place-items-center bg-black/30 px-4"
			role="presentation"
			onclick={closeRenamePlayer}
		>
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
					<div>
						<h2 id="edit-player-title" class="text-xl font-bold text-neutral-950">Edit Player</h2>
					</div>
					<button
						type="button"
						class="cursor-pointer border border-line px-3 py-1 font-semibold text-neutral-700 hover:border-accent hover:text-accent"
						aria-label="Close edit player dialog"
						onclick={closeRenamePlayer}
					>
						Close
					</button>
				</div>

				<label class="mt-5 grid gap-2">
					<span class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Player Name</span>
					<div class="grid grid-cols-[1fr_auto_auto] items-center gap-3">
						<input
							data-testid="rename-player-input"
							class="border border-line bg-white px-3 py-2 text-neutral-950 outline-none focus:border-accent"
							type="text"
							value={renamePlayer.name}
							bind:this={renameInput}
							oninput={(event) => renamePlayerAsTyped((event.currentTarget as HTMLInputElement).value)}
							onkeydown={(event) => {
								if (event.key === 'Enter' || event.key === 'Escape') {
									event.preventDefault();
									closeRenamePlayer();
								}
							}}
						/>
						<button
							type="button"
							data-testid="rotate-player-button"
							class="grid h-[42px] w-[42px] cursor-pointer place-items-center border border-line text-neutral-700 hover:border-accent hover:text-accent"
							onclick={cycleRenamePlayerRotation}
							aria-label={`Current screen rotation is ${formatRotation(currentRenameRotation)}. Tap to set ${formatRotation(nextRenameRotation)}.`}
							title={`Current rotation: ${formatRotation(currentRenameRotation)}`}
						>
							<svg
								class="h-5 w-5"
								style={`transform: rotate(${currentRenameRotation}deg);`}
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="square"
								stroke-linejoin="miter"
								aria-hidden="true"
							>
								<path d="M12 19V5" />
								<path d="M6 11l6-6 6 6" />
							</svg>
						</button>
						<button
							type="button"
							data-testid="remove-player-button"
							class="grid h-[42px] w-[42px] cursor-pointer place-items-center border border-accent text-accent hover:bg-accent hover:text-white disabled:cursor-not-allowed disabled:border-neutral-300 disabled:text-neutral-400 disabled:hover:bg-white"
							disabled={!canRemoveRenamePlayer}
							onclick={removeRenamePlayer}
							aria-label="Remove player"
							title={canRemoveRenamePlayer ? 'Remove player' : 'At least one player must stay in the game'}
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
	{/if}
	{#if howToPlayOpen}
		<HowToPlayModal
			title="How to Play Poker Dice"
			intro="Poker Dice is a five-dice scorecard game. Roll, hold dice, and choose the best open category."
			sections={howToPlaySections}
			onClose={() => (howToPlayOpen = false)}
		/>
	{/if}
	{#if statsOpen}
		<div
			class="fixed inset-0 z-50 grid place-items-center bg-black/30 px-4"
			role="presentation"
			onclick={() => (statsOpen = false)}
		>
			<div
				class="max-h-[90vh] w-full max-w-4xl overflow-y-auto border border-line bg-white p-5 shadow-sm"
				role="dialog"
				tabindex="-1"
				aria-modal="true"
				aria-labelledby="cpu-stats-title"
				onclick={(event) => event.stopPropagation()}
				onkeydown={(event) => event.stopPropagation()}
			>
				<div class="flex items-start justify-between gap-4">
					<div>
						<h2 id="cpu-stats-title" class="text-xl font-bold text-neutral-950">CPU Game Stats</h2>
						<p class="mt-1 text-sm text-neutral-600">
							Completed one-player games against the CPU are logged here.
						</p>
					</div>
					<button
						type="button"
						class="cursor-pointer border border-line px-3 py-1 font-semibold text-neutral-700 hover:border-accent hover:text-accent"
						aria-label="Close CPU game stats"
						onclick={() => (statsOpen = false)}
					>
						Close
					</button>
				</div>

				<div class="mt-5 grid gap-3 sm:grid-cols-5">
					<div class="border border-line p-3">
						<p class="text-xs font-semibold uppercase tracking-wide text-neutral-500">Games</p>
						<p class="text-2xl font-bold">{cpuGameSummary.games}</p>
					</div>
					<div class="border border-line p-3">
						<p class="text-xs font-semibold uppercase tracking-wide text-neutral-500">Wins</p>
						<p class="text-2xl font-bold">{cpuGameSummary.wins}</p>
					</div>
					<div class="border border-line p-3">
						<p class="text-xs font-semibold uppercase tracking-wide text-neutral-500">Losses</p>
						<p class="text-2xl font-bold">{cpuGameSummary.losses}</p>
					</div>
					<div class="border border-line p-3">
						<p class="text-xs font-semibold uppercase tracking-wide text-neutral-500">Ties</p>
						<p class="text-2xl font-bold">{cpuGameSummary.ties}</p>
					</div>
					<div class="border border-line p-3">
						<p class="text-xs font-semibold uppercase tracking-wide text-neutral-500">Avg Score</p>
						<p class="text-2xl font-bold">{cpuGameSummary.averageHumanScore}</p>
					</div>
				</div>

				<div class="mt-5">
					<h3 class="text-lg font-bold text-neutral-950">Game Log</h3>
					<div class="mt-3 overflow-x-auto border border-line">
						<table class="w-full min-w-[760px] border-collapse text-sm">
							<thead>
								<tr class="bg-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-500">
									<th class="border-b border-r border-line px-3 py-2">Date</th>
									<th class="border-b border-r border-line px-3 py-2">Game</th>
									<th class="border-b border-r border-line px-3 py-2">Difficulty</th>
									<th class="border-b border-r border-line px-3 py-2">Result</th>
									<th class="border-b border-r border-line px-3 py-2">You</th>
									<th class="border-b border-line px-3 py-2">CPU</th>
								</tr>
							</thead>
							<tbody>
								{#if cpuGameHistory.length === 0}
									<tr>
										<td colspan="6" class="bg-neutral-50 px-3 py-4 text-center text-sm text-neutral-600">
											No completed CPU games yet. Finish a one-player game and it will appear here.
										</td>
									</tr>
								{:else}
									{#each cpuGameHistory as entry}
										<tr class="bg-white">
											<td class="border-b border-r border-line px-3 py-2 text-neutral-600">
												{formatGameDate(entry.endedAt)}
											</td>
											<td class="border-b border-r border-line px-3 py-2 font-semibold">
												{entry.gameName}
											</td>
											<td class="border-b border-r border-line px-3 py-2">
												{formatCpuDifficulty(entry.difficulty)}
											</td>
											<td
												class={[
													'border-b border-r border-line px-3 py-2 font-bold',
													entry.result === 'win'
														? 'text-green-700'
														: entry.result === 'loss'
															? 'text-accent'
															: 'text-neutral-700'
												]}
											>
												{formatResult(entry.result)}
											</td>
											<td class="border-b border-r border-line px-3 py-2">
												{entry.humanName}: <span class="font-bold">{entry.humanScore}</span>
											</td>
											<td class="border-b border-line px-3 py-2">
												{entry.cpuName}: <span class="font-bold">{entry.cpuScore}</span>
											</td>
										</tr>
									{/each}
								{/if}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</div>
	{/if}
</main>
