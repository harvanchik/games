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
	import {
		getOnlineGameSummary,
		getOnlineOpponentRecord,
		loadOnlineGameHistory,
		upsertOnlineGameLogEntry
	} from '$lib/pokerDiceOnlineHistory';
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
		loadLastPlayerName,
		loadSavedGames,
		MAX_SAVED_GAMES,
		saveGameRecord,
		setLastGameId,
		setLastPlayerName
	} from '$lib/persistence';
	import {
		applyVerifiedRoll,
		createNonce,
		createOnlineId,
		createRoomCode,
		createRollCommitment,
		deriveVerifiedDice,
		getPokerDiceRoomPeerId,
		normalizeRoomCode,
		verifyRollCommitment
	} from '$lib/pokerDiceOnline';
	import {
		clearPokerDiceOnlineSession,
		loadPokerDiceOnlineSession,
		savePokerDiceOnlineSession
	} from '$lib/pokerDiceOnlinePersistence';
	import type {
		CpuDifficulty,
		DiceValue,
		GameState,
		PersistedGameSnapshot,
		PlayerCount,
		PlayerRotation,
		PokerDicePlayMode,
		RollOffResult,
		SavedGameRecord,
		ScoreCategory
	} from '$lib/types';
	import type {
		GuestVerifiedRollState,
		OnlineConnectionState,
		OnlineRole,
		PokerDiceGuestMessage,
		PokerDiceHostMessage,
		PokerDiceOnlineAction,
		PokerDiceOnlineSession,
		PokerDiceOnlineSnapshot,
		PokerDicePeerConnection,
		VerifiedRollState
	} from '$lib/pokerDiceOnline';
	import type { OnlineGameLogEntry, OnlineGameResult } from '$lib/pokerDiceOnlineHistory';
	import type { Peer } from 'peerjs';

	const PLAYER_ROTATIONS: PlayerRotation[] = [0, 90, 180, 270];

	let playerCount = $state<PlayerCount>(1);
	let cpuDifficulty = $state<CpuDifficulty>('moderate');
	let setupVisible = $state(true);
	let game = $state<GameState>(createGame(1));
	let gameName = $state(createDefaultGameName());
	let currentSaveId = $state(createSaveId());
	let savedGames = $state<SavedGameRecord[]>([]);
	let setupMode = $state<'new' | 'load' | 'online'>('new');
	let selectedLoadGameId = $state('');
	let confirmDeleteGameId = $state('');
	let persistenceReady = $state(false);
	let rollVersion = $state(0);
	let rollingDiceCount = $state(0);
	let selectedScorecardIndex = $state(0);
	let renamePlayerIndex = $state<number | null>(null);
	let renameDraftName = $state('');
	let renameFocusVersion = $state(0);
	let lastTabClick = $state({ index: -1, at: 0 });
	let renameInput = $state<HTMLInputElement | null>(null);
	let recentScore = $state<{ playerId: number; category: ScoreCategory } | null>(null);
	let scoreRevealEndsAt = $state<number | null>(null);
	let playMode = $state<PokerDicePlayMode>('cpu');
	let onlineRole = $state<OnlineRole | null>(null);
	let onlineConnectionState = $state<OnlineConnectionState>('offline');
	let onlineMessage = $state('');
	let onlineRoomCode = $state('');
	let onlineRoomInput = $state('');
	let onlineHostName = $state('Player 1');
	let onlineGuestName = $state('Player 2');
	let lastPlayerName = $state<string | null>(null);
	let onlineSessionId = $state('');
	let onlineLocalPlayerId = $state<number | null>(null);
	let onlineLocalPlayerToken = $state('');
	let onlineGuestPlayerToken = $state<string | null>(null);
	let onlineForfeitMessage = $state('');
	let onlineSequence = $state(0);
	let lastOnlineSequence = $state(-1);
	let pendingVerifiedRoll = $state<VerifiedRollState | null>(null);
	let guestVerifiedRoll = $state<GuestVerifiedRollState | null>(null);
	let howToPlayOpen = $state(false);
	let statsOpen = $state(false);
	let statsView = $state<'cpu' | 'online'>('cpu');
	let cpuGameHistory = $state(loadCpuGameHistory());
	let onlineGameHistory = $state(loadOnlineGameHistory());
	let cpuTurnInProgress = $state(false);
	let rollOffInProgress = $state(false);
	let scoreRevealTimer: ReturnType<typeof setTimeout> | null = null;
	const cpuTimers = new Set<ReturnType<typeof setTimeout>>();
	const handledOnlineActionIds = new Set<string>();
	let onlinePeer: Peer | null = null;
	let onlineConnection: PokerDicePeerConnection | null = null;

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
	let onlineActive = $derived(onlineRole !== null);
	let onlineConnected = $derived(onlineConnectionState === 'connected');
	let localOnlinePlayer = $derived(
		onlineLocalPlayerId === null
			? null
			: (game.players.find((player) => player.id === onlineLocalPlayerId) ?? null)
	);
	let localOnlineTurn = $derived(
		!onlineActive || (!!localOnlinePlayer && activePlayer?.id === localOnlinePlayer.id)
	);
	let localOnlineRollOffTurn = $derived(
		!onlineActive ||
			(!!localOnlinePlayer &&
				rollOffCurrentPlayer?.id === localOnlinePlayer.id)
	);
	let onlineTurnLabel = $derived(
		onlineActive ? (localOnlineTurn ? 'Your Turn' : "Opponent's Turn") : 'Current Turn'
	);
	let showOnlineDisconnect = $derived(onlineActive && onlineConnected && !setupVisible);
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
			game.rollCount < 3 &&
			(!onlineActive || (onlineConnected && localOnlineTurn && !pendingVerifiedRoll))
	);
	let canRollOff = $derived(
		rollOffActive &&
			game.rollOff.status === 'rolling' &&
			!rollOffCurrentPlayer?.isCpu &&
			!rollOffInProgress &&
			!diceAreScrambling &&
			(!onlineActive || (onlineConnected && localOnlineRollOffTurn && !pendingVerifiedRoll))
	);
	let canHoldDice = $derived(
		!rollOffActive &&
			!isCpuTurn &&
			!gameOver &&
			!diceAreScrambling &&
			!scoreRevealActive &&
			game.rollCount > 0 &&
			(!onlineActive || (onlineConnected && localOnlineTurn))
	);
	let scorecardRollCount = $derived(diceAreScrambling ? 0 : game.rollCount);
	let hasSavedGames = $derived(savedGames.length > 0);
	let canRemoveRenamePlayer = $derived(
			renamePlayerIndex !== null &&
			game.players.length > 1 &&
			!rollOffActive &&
			!scoreRevealActive &&
			!cpuTurnInProgress &&
			!onlineActive
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
	let onlineGameSummary = $derived(getOnlineGameSummary(onlineGameHistory));
	let statsShowOnline = $derived(statsView === 'online');

	$effect(() => {
		if (scoreRevealActive) return;
		selectedScorecardIndex = game.activePlayerIndex;
	});

	$effect(() => {
		if (!persistenceReady || setupVisible || onlineActive) return;
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
		renameFocusVersion;
		const input = renameInput;
		if (renamePlayerIndex === null || !input) return;

		input.focus();
		input.select();
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

	$effect(() => {
		if (
			!persistenceReady ||
			setupVisible ||
			!onlineActive ||
			!gameOver ||
			!onlineSessionId ||
			onlineLocalPlayerId === null
		) {
			return;
		}

		onlineGameHistory = upsertOnlineGameLogEntry(
			loadOnlineGameHistory(),
			$state.snapshot(game),
			onlineSessionId,
			onlineLocalPlayerId
		);
	});

	onMount(() => {
		onlineGameHistory = loadOnlineGameHistory();
		const savedPlayerName = loadLastPlayerName();
		if (savedPlayerName) {
			lastPlayerName = savedPlayerName;
			onlineHostName = savedPlayerName;
			onlineGuestName = savedPlayerName;
			game.players[0].name = savedPlayerName;
		}

		const savedOnlineSession = loadPokerDiceOnlineSession();
		if (savedOnlineSession) {
			restoreOnlineSession(savedOnlineSession);
			persistenceReady = true;
			return;
		}

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
		destroyOnlinePeer();
	});

	function startGame(): void {
		if (!canStartNewGame) return;

		const nextGameName = trimmedGameName;

		clearOnlineSession();
		clearScoreReveal();
		clearCpuTimers();
		game = playerCount === 1 ? createCpuOpponentGame(cpuDifficulty) : createGame(playerCount, cpuDifficulty);
		game.players[0].name = getDefaultPlayerName();
		rememberPlayerName(game.players[0].name);
		playMode = playerCount === 1 ? 'cpu' : 'local';
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
		clearOnlineSession();
		clearScoreReveal();
		clearCpuTimers();
		game = createGame(1);
		game.players[0].name = getDefaultPlayerName();
		playMode = 'cpu';
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
		renameDraftName = '';
		howToPlayOpen = false;
		statsOpen = false;
	}

	function openStats(): void {
		statsView = onlineActive && playMode === 'online' ? 'online' : 'cpu';
		statsOpen = true;
	}

	function getDefaultPlayerName(): string {
		return lastPlayerName || 'Player 1';
	}

	function rememberPlayerName(name: string): void {
		const trimmedName = name.trim();
		if (!trimmedName) return;

		lastPlayerName = trimmedName;
		onlineHostName = trimmedName;
		onlineGuestName = trimmedName;
		setLastPlayerName(trimmedName);
	}

	function shouldRememberPlayer(player: GameState['players'][number]): boolean {
		if (player.isCpu) return false;
		if (onlineActive) return player.id === onlineLocalPlayerId;

		return player.id === game.players[0]?.id;
	}

	function rollDice(): void {
		if (rollOffActive) {
			rollForFirstTurn();
			return;
		}

		if (!canRoll) return;

		if (onlineActive) {
			submitOnlineAction({ type: 'roll' });
			return;
		}

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

		if (onlineActive) {
			submitOnlineAction({ type: 'toggleHold', index });
			return;
		}

		game.dice = toggleDieHold(game.dice, index);
		persistIfReady();
	}

	function addPlayer(): void {
		if (onlineActive || game.players.length >= 10 || scoreRevealActive || cpuTurnInProgress) return;

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
			if (onlineActive && game.players[index]?.id !== onlineLocalPlayerId) return;
			openRenamePlayer(index);
		}
	}

	function openRenamePlayer(index: number): void {
		renameDraftName = game.players[index]?.name ?? '';
		renamePlayerIndex = index;
		renameFocusVersion += 1;
	}

	function closeRenamePlayer(): void {
		if (renamePlayerIndex !== null) {
			const player = game.players[renamePlayerIndex];

			if (player && player.name.trim().length === 0) {
				const fallbackName = `Player ${player.id}`;
				player.name = fallbackName;
				renameDraftName = fallbackName;

				if (onlineActive && player.id === onlineLocalPlayerId) {
					submitOnlineAction({ type: 'renameSelf', name: fallbackName });
				}
			}

			if (player && shouldRememberPlayer(player)) {
				rememberPlayerName(player.name);
			}
		}

		renamePlayerIndex = null;
		renameDraftName = '';
	}

	function renamePlayerAsTyped(name: string): void {
		if (renamePlayerIndex === null) return;

		const player = game.players[renamePlayerIndex];
		if (!player) return;
		renameDraftName = name;

		if (onlineActive) {
			if (player.id !== onlineLocalPlayerId) return;
			rememberPlayerName(name);
			submitOnlineAction({ type: 'renameSelf', name });
			return;
		}

		player.name = name;
		if (shouldRememberPlayer(player)) {
			rememberPlayerName(name);
		}
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
		if (onlineActive || renamePlayerIndex === null || !canRemoveRenamePlayer) return;

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
		if (onlineActive && (!onlineConnected || !localOnlineTurn)) return false;
		return canScoreCategoryByRules(category, diceValues, activePlayer.scores, game.rollCount);
	}

	function chooseScore(category: ScoreCategory): void {
		if (!canScoreCategory(category)) return;

		if (onlineActive) {
			submitOnlineAction({ type: 'score', category });
			return;
		}

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
		if (onlineRole === 'guest') return;

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

		if (onlineActive) {
			submitOnlineAction({ type: 'roll' });
			return;
		}

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

		if (onlineActive && onlineRole === 'guest') {
			submitOnlineAction({ type: 'chooseStarter', playerId });
			return;
		}

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
		game.players[0].name = getDefaultPlayerName();
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
		if (onlineRole === 'host') {
			broadcastOnlineSnapshot();
			return;
		}
		if (onlineRole === 'guest') return;

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

	function createOnlineSnapshot(): PokerDiceOnlineSnapshot {
		return {
			...createCurrentSnapshot(),
			rollVersion
		};
	}

	async function hostOnlineGame(): Promise<void> {
		clearOnlineSession();
		clearScoreReveal();
		clearCpuTimers();
		game = createGame(2);
		game.players[0].name = onlineHostName.trim() || 'Player 1';
		rememberPlayerName(game.players[0].name);
		game.players[1].name = 'Player 2';
		playMode = 'online';
		setupVisible = true;
		setupMode = 'online';
		selectedScorecardIndex = 0;
		onlineRole = 'host';
		onlineSessionId = createOnlineId('poker-session');
		onlineLocalPlayerId = game.players[0].id;
		onlineLocalPlayerToken = createOnlineId('host');
		onlineGuestPlayerToken = null;
		onlineForfeitMessage = '';
		onlineSequence = 0;
		lastOnlineSequence = -1;
		onlineMessage = 'Creating a room.';
		await openHostPeer(createRoomCode(), true);
	}

	async function joinOnlineGame(): Promise<void> {
		const roomCode = normalizeRoomCode(onlineRoomInput);
		if (!roomCode) {
			onlineConnectionState = 'error';
			onlineMessage = 'Enter a game code first.';
			return;
		}

		clearOnlineSession();
		clearScoreReveal();
		clearCpuTimers();
		playMode = 'online';
		setupVisible = true;
		setupMode = 'online';
		onlineRole = 'guest';
		onlineRoomCode = roomCode;
		onlineLocalPlayerId = 2;
		onlineLocalPlayerToken = createOnlineId('guest');
		onlineForfeitMessage = '';
		onlineMessage = 'Connecting to the host.';
		const guestName = onlineGuestName.trim() || 'Player 2';
		rememberPlayerName(guestName);
		await openGuestPeer(roomCode, guestName);
	}

	async function reconnectOnlineGame(): Promise<void> {
		if (!onlineRole || !onlineRoomCode) return;

		onlineMessage = 'Reconnecting.';
		onlineConnectionState = 'reconnecting';
		destroyOnlinePeer();

		if (onlineRole === 'host') {
			await openHostPeer(onlineRoomCode, false);
			return;
		}

		await openGuestPeer(onlineRoomCode, localOnlinePlayer?.name || onlineGuestName || 'Player 2');
	}

	function restoreOnlineSession(savedSession: PokerDiceOnlineSession): void {
		playMode = 'online';
		onlineRole = savedSession.role;
		onlineSessionId = savedSession.sessionId;
		onlineRoomCode = savedSession.roomCode;
		onlineRoomInput = savedSession.roomCode;
		onlineLocalPlayerId = savedSession.localPlayerId;
		onlineLocalPlayerToken = savedSession.localPlayerToken;
		onlineGuestPlayerToken = savedSession.guestPlayerToken ?? null;
		onlineSequence = savedSession.sequence;
		lastOnlineSequence = savedSession.sequence;
		applyOnlineSnapshot(savedSession.snapshot, savedSession.sequence, false);
		onlineMessage =
			savedSession.role === 'host'
				? 'Restoring the room. The other player can reconnect with the same code.'
				: 'Restoring the match and reconnecting to the host.';
		onlineConnectionState = 'reconnecting';

		if (savedSession.role === 'host') {
			void openHostPeer(savedSession.roomCode, false);
			return;
		}

		void openGuestPeer(savedSession.roomCode, localOnlinePlayer?.name || 'Player 2');
	}

	async function openHostPeer(roomCode: string, allowNewCode: boolean, attempt = 0): Promise<void> {
		if (attempt > 4) {
			onlineConnectionState = 'error';
			onlineMessage = 'Could not create an online room. Try again.';
			return;
		}

		destroyOnlinePeer();
		onlineRoomCode = roomCode;
		onlineConnectionState = 'creating';
		let PeerClient: typeof Peer;
		try {
			PeerClient = await loadPeerClient();
		} catch {
			onlineConnectionState = 'error';
			onlineMessage = 'PeerJS could not load. Check the connection and try again.';
			return;
		}
		const peer = new PeerClient(getPokerDiceRoomPeerId(roomCode), getPeerOptions());
		onlinePeer = peer;

		peer.on('open', () => {
			onlineConnectionState = onlineConnection ? 'connected' : 'waiting';
			onlineMessage = onlineConnection
				? 'The other player is connected.'
				: 'Room ready. Share the game code with Player 2.';
			saveCurrentOnlineSession();
		});
		peer.on('connection', (connection) => attachHostConnection(connection as PokerDicePeerConnection));
		peer.on('disconnected', () => {
			onlineConnectionState = onlineConnection?.open ? 'connected' : 'reconnecting';
		});
		peer.on('error', (error) => {
			logPeerError('host peer', error);
			const errorType = getPeerErrorType(error);
			if (allowNewCode && errorType === 'unavailable-id') {
				void openHostPeer(createRoomCode(), true, attempt + 1);
				return;
			}

			onlineConnectionState = 'error';
			onlineMessage =
				errorType === 'unavailable-id'
					? 'That restored room code is already in use. Start a new online game.'
					: 'The online room could not reach PeerJS. Try reconnecting.';
		});
	}

	async function openGuestPeer(roomCode: string, playerName: string): Promise<void> {
		destroyOnlinePeer();
		onlineConnectionState = 'connecting';
		let PeerClient: typeof Peer;
		try {
			PeerClient = await loadPeerClient();
		} catch {
			onlineConnectionState = 'error';
			onlineMessage = 'PeerJS could not load. Check the connection and try again.';
			return;
		}
		const peer = new PeerClient(getPeerOptions());
		onlinePeer = peer;

		peer.on('open', () => {
			const connection = peer.connect(getPokerDiceRoomPeerId(roomCode), {
				serialization: 'json',
				metadata: { roomCode }
			});
			attachGuestConnection(connection as PokerDicePeerConnection, playerName);
		});
		peer.on('disconnected', () => {
			onlineConnectionState = onlineConnection?.open ? 'connected' : 'reconnecting';
		});
		peer.on('error', (error) => {
			logPeerError('guest peer', error);
			onlineConnectionState = 'error';
			onlineMessage =
				getPeerErrorType(error) === 'peer-unavailable'
					? 'No host is waiting for that code. Create a room on the host device first, then join with the code it shows.'
					: 'Could not connect to the online host.';
		});
	}

	function attachHostConnection(connection: PokerDicePeerConnection): void {
		onlineConnection?.close();
		onlineConnection = connection;
		onlineConnectionState = 'connecting';
		onlineMessage = 'Player 2 is joining.';

		connection.on('open', () => {
			onlineConnectionState = 'connected';
		});
		connection.on('data', (data) => void handleHostData(data));
		connection.on('close', markRemoteDisconnected);
		connection.on('error', (error) => {
			logPeerError('host data connection', error);
			markRemoteDisconnected();
		});
	}

	async function loadPeerClient(): Promise<typeof Peer> {
		const peerModule = await import('peerjs');
		const peerExports = peerModule as unknown as {
			Peer?: typeof Peer;
			default?: { Peer?: typeof Peer };
		};
		const PeerClient = peerExports.Peer ?? peerExports.default?.Peer;
		if (!PeerClient) throw new Error('PeerJS client unavailable.');

		return PeerClient;
	}

	function attachGuestConnection(connection: PokerDicePeerConnection, playerName: string): void {
		onlineConnection = connection;
		connection.on('open', () => {
			onlineConnectionState = 'connecting';
			sendGuestMessage({
				kind: 'join',
				roomCode: onlineRoomCode,
				playerName,
				playerToken: onlineLocalPlayerToken
			});
		});
		connection.on('data', (data) => void handleGuestData(data));
		connection.on('close', markRemoteDisconnected);
		connection.on('error', (error) => {
			logPeerError('guest data connection', error);
			markRemoteDisconnected();
		});
	}

	async function handleHostData(data: unknown): Promise<void> {
		const message = data as PokerDiceGuestMessage;
		if (!message || typeof message !== 'object') return;

		if (message.kind === 'join') {
			acceptOnlineGuest(message);
			return;
		}

		if (message.sessionId !== onlineSessionId) return;

		if (message.kind === 'action') {
			if (handledOnlineActionIds.has(message.actionId)) return;
			if (message.playerToken !== onlineGuestPlayerToken) {
				rejectGuestAction('This online seat is already claimed.');
				return;
			}

			handledOnlineActionIds.add(message.actionId);
			handleHostOnlineAction(message.action, 2);
			return;
		}

		if (message.kind === 'rollCommit') {
			handleGuestRollCommit(message.rollId, message.commit);
			return;
		}

		if (message.kind === 'rollReveal') {
			await handleGuestRollReveal(message.rollId, message.nonce);
			return;
		}

		if (message.kind === 'forfeit' && message.playerToken === onlineGuestPlayerToken) {
			receiveOnlineForfeit();
			return;
		}

		if (message.kind === 'resync' && message.playerToken === onlineGuestPlayerToken) {
			broadcastOnlineSnapshot();
		}
	}

	async function handleGuestData(data: unknown): Promise<void> {
		const message = data as PokerDiceHostMessage;
		if (!message || typeof message !== 'object') return;

		if (message.kind !== 'snapshot' && message.sessionId !== onlineSessionId) return;

		if (message.kind === 'snapshot') {
			if (message.sequence < lastOnlineSequence) return;

			onlineSessionId = message.sessionId;
			onlineGuestPlayerToken = message.guestPlayerToken;
			onlineConnectionState = 'connected';
			onlineMessage = 'Connected to the online game.';
			applyOnlineSnapshot(message.snapshot, message.sequence);
			return;
		}

		if (message.kind === 'rollCommit') {
			await answerHostRollCommit(message.rollId, message.commit);
			return;
		}

		if (message.kind === 'rollReveal') {
			await answerHostRollReveal(message.rollId, message.nonce);
			return;
		}

		if (message.kind === 'forfeit') {
			receiveOnlineForfeit();
			return;
		}

		if (message.kind === 'actionRejected') {
			onlineMessage = message.message;
		}
	}

	function acceptOnlineGuest(message: Extract<PokerDiceGuestMessage, { kind: 'join' }>): void {
		if (normalizeRoomCode(message.roomCode) !== onlineRoomCode) return;
		if (onlineGuestPlayerToken && onlineGuestPlayerToken !== message.playerToken) {
			rejectGuestAction('This room already has two players.');
			return;
		}

		onlineGuestPlayerToken = message.playerToken;
		game.players[1].name = message.playerName.trim() || 'Player 2';
		setupVisible = false;
		onlineConnectionState = 'connected';
		onlineMessage = 'Player 2 connected.';
		broadcastOnlineSnapshot();
	}

	function applyOnlineSnapshot(snapshot: PokerDiceOnlineSnapshot, sequence: number, persist = true): void {
		const nextRollVersion = snapshot.rollVersion ?? 0;
		const shouldPlayRemoteRoll = nextRollVersion > rollVersion;

		clearCpuTimers();
		game = normalizeGameState(structuredClone(snapshot.game));
		gameName = snapshot.gameName;
		playerCount = snapshot.playerCount;
		setupVisible = snapshot.setupVisible;
		selectedScorecardIndex = Math.min(snapshot.selectedScorecardIndex, game.players.length - 1);
		recentScore = snapshot.recentScore ?? null;
		scoreRevealEndsAt = snapshot.scoreRevealEndsAt ?? null;
		rollVersion = nextRollVersion;
		rollingDiceCount = 0;
		lastOnlineSequence = sequence;
		if (shouldPlayRemoteRoll) playDiceRollSound();
		if (onlineRole === 'host' && recentScore && scoreRevealEndsAt) {
			scheduleScoreReveal(scoreRevealEndsAt - Date.now());
		}
		if (persist) saveCurrentOnlineSession(snapshot, sequence);
	}

	function broadcastOnlineSnapshot(): void {
		if (onlineRole !== 'host' || !onlineSessionId || !onlineRoomCode) return;

		const snapshot = createOnlineSnapshot();
		onlineSequence += 1;
		saveCurrentOnlineSession(snapshot, onlineSequence);
		sendHostMessage({
			kind: 'snapshot',
			sessionId: onlineSessionId,
			sequence: onlineSequence,
			localPlayerId: 2,
			guestPlayerToken: onlineGuestPlayerToken ?? '',
			snapshot
		});
	}

	function saveCurrentOnlineSession(snapshot = createOnlineSnapshot(), sequence = onlineSequence): void {
		if (!onlineRole || !onlineSessionId || !onlineRoomCode || onlineLocalPlayerId === null) return;

		savePokerDiceOnlineSession({
			sessionId: onlineSessionId,
			roomCode: onlineRoomCode,
			role: onlineRole,
			localPlayerId: onlineLocalPlayerId,
			localPlayerToken: onlineLocalPlayerToken,
			guestPlayerToken: onlineGuestPlayerToken,
			sequence,
			snapshot
		});
	}

	function submitOnlineAction(action: PokerDiceOnlineAction): void {
		if (!onlineActive || !onlineConnected || onlineLocalPlayerId === null) return;

		if (onlineRole === 'host') {
			handleHostOnlineAction(action, onlineLocalPlayerId);
			return;
		}

		sendGuestMessage({
			kind: 'action',
			sessionId: onlineSessionId,
			actionId: createOnlineId('action'),
			playerToken: onlineLocalPlayerToken,
			action
		});
	}

	function handleHostOnlineAction(action: PokerDiceOnlineAction, actorPlayerId: number): void {
		if (onlineRole !== 'host') return;

		if (action.type === 'renameSelf') {
			const player = game.players.find((candidate) => candidate.id === actorPlayerId);
			if (!player) return;

			player.name = action.name;
			broadcastOnlineSnapshot();
			return;
		}

		if (action.type === 'chooseStarter') {
			if (game.rollOff.pickerPlayerId !== actorPlayerId) {
				rejectGuestAction('Only the high roller can choose who starts.');
				return;
			}

			chooseStartingPlayer(action.playerId);
			broadcastOnlineSnapshot();
			return;
		}

		const actorCanTakeTurn =
			rollOffActive
				? game.rollOff.currentPlayerId === actorPlayerId
				: activePlayer?.id === actorPlayerId;
		if (!actorCanTakeTurn) {
			rejectGuestAction('Wait for your turn.');
			return;
		}

		if (action.type === 'roll') {
			if (
				pendingVerifiedRoll ||
				diceAreScrambling ||
				scoreRevealActive ||
				(!rollOffActive && (game.rollCount >= 3 || gameOver))
			) {
				rejectGuestAction('Dice cannot roll right now.');
				return;
			}

			void beginVerifiedOnlineRoll(actorPlayerId);
			return;
		}

		if (action.type === 'toggleHold') {
			if (rollOffActive || game.rollCount === 0 || diceAreScrambling || scoreRevealActive) return;

			game.dice = toggleDieHold(game.dice, action.index);
			broadcastOnlineSnapshot();
			return;
		}

		if (action.type === 'score') {
			if (
				rollOffActive ||
				!canScoreCategoryByRules(action.category, diceValues, activePlayer.scores, game.rollCount)
			) {
				rejectGuestAction('That score cannot be selected now.');
				return;
			}

			scoreActiveCategory(action.category);
		}
	}

	async function beginVerifiedOnlineRoll(requestedByPlayerId: number): Promise<void> {
		if (onlineRole !== 'host' || !onlineConnection?.open || pendingVerifiedRoll) return;

		const rollId = createOnlineId('roll');
		const hostNonce = createNonce();
		const hostCommit = await createRollCommitment(onlineSessionId, rollId, 'host', hostNonce);
		pendingVerifiedRoll = { rollId, requestedByPlayerId, hostNonce, hostCommit };
		rollOffInProgress = rollOffActive;
		onlineMessage = 'Both players are verifying this roll.';
		playDiceRollSound();
		sendHostMessage({ kind: 'rollCommit', sessionId: onlineSessionId, rollId, commit: hostCommit });
	}

	function handleGuestRollCommit(rollId: string, commit: string): void {
		if (!pendingVerifiedRoll || pendingVerifiedRoll.rollId !== rollId || pendingVerifiedRoll.guestCommit) return;

		pendingVerifiedRoll.guestCommit = commit;
		sendHostMessage({
			kind: 'rollReveal',
			sessionId: onlineSessionId,
			rollId,
			nonce: pendingVerifiedRoll.hostNonce
		});
	}

	async function handleGuestRollReveal(rollId: string, nonce: string): Promise<void> {
		if (!pendingVerifiedRoll || pendingVerifiedRoll.rollId !== rollId || !pendingVerifiedRoll.guestCommit) return;

		const validReveal = await verifyRollCommitment(
			onlineSessionId,
			rollId,
			'guest',
			nonce,
			pendingVerifiedRoll.guestCommit
		);
		if (!validReveal) {
			pendingVerifiedRoll = null;
			rollOffInProgress = false;
			onlineMessage = 'The other player could not verify the roll.';
			return;
		}

		pendingVerifiedRoll.guestNonce = nonce;
		const values = await deriveVerifiedDice(
			onlineSessionId,
			rollId,
			pendingVerifiedRoll.hostNonce,
			nonce
		);
		applyVerifiedRoll(game, values);
		rollVersion += 1;
		pendingVerifiedRoll = null;
		onlineMessage = 'Verified roll complete.';
		broadcastOnlineSnapshot();

		if (rollOffActive) {
			queueCpuAction(finishRollOffRoll, 2200);
		}
	}

	async function answerHostRollCommit(rollId: string, hostCommit: string): Promise<void> {
		if (guestVerifiedRoll?.rollId === rollId) return;

		const guestNonce = createNonce();
		const guestCommit = await createRollCommitment(onlineSessionId, rollId, 'guest', guestNonce);
		guestVerifiedRoll = { rollId, guestNonce, guestCommit, hostCommit };
		sendGuestMessage({ kind: 'rollCommit', sessionId: onlineSessionId, rollId, commit: guestCommit });
	}

	async function answerHostRollReveal(rollId: string, nonce: string): Promise<void> {
		if (!guestVerifiedRoll || guestVerifiedRoll.rollId !== rollId) return;

		const validReveal = await verifyRollCommitment(
			onlineSessionId,
			rollId,
			'host',
			nonce,
			guestVerifiedRoll.hostCommit
		);
		if (!validReveal) {
			guestVerifiedRoll = null;
			onlineMessage = 'The host roll could not be verified.';
			return;
		}

		sendGuestMessage({
			kind: 'rollReveal',
			sessionId: onlineSessionId,
			rollId,
			nonce: guestVerifiedRoll.guestNonce
		});
		guestVerifiedRoll = null;
	}

	function rejectGuestAction(message: string): void {
		sendHostMessage({ kind: 'actionRejected', sessionId: onlineSessionId, message });
		onlineMessage = message;
	}

	function sendHostMessage(message: PokerDiceHostMessage): void {
		if (!onlineConnection?.open) return;
		onlineConnection.send(message);
	}

	function sendGuestMessage(message: PokerDiceGuestMessage): void {
		if (!onlineConnection?.open) return;
		onlineConnection.send(message);
	}

	function markRemoteDisconnected(): void {
		onlineConnection = null;
		pendingVerifiedRoll = null;
		guestVerifiedRoll = null;
		rollOffInProgress = false;
		if (!onlineActive || onlineForfeitMessage) return;

		onlineConnectionState = 'reconnecting';
		onlineMessage =
			onlineRole === 'host'
				? 'Player 2 disconnected. They can rejoin with the same code.'
				: 'Connection lost. Reconnect when the host is ready.';
	}

	function disconnectOnlineGame(): void {
		if (showOnlineDisconnect && !gameOver) {
			recordOnlineForfeit('loss');
			if (onlineRole === 'host' && onlineLocalPlayerId !== null) {
				sendHostMessage({
					kind: 'forfeit',
					sessionId: onlineSessionId,
					playerId: onlineLocalPlayerId
				});
			} else if (onlineRole === 'guest') {
				sendGuestMessage({
					kind: 'forfeit',
					sessionId: onlineSessionId,
					playerToken: onlineLocalPlayerToken
				});
			}
		}

		newGame();
		setupMode = 'online';
	}

	function receiveOnlineForfeit(): void {
		if (!gameOver) {
			recordOnlineForfeit('win');
		}

		onlineConnection?.close();
		onlineConnection = null;
		pendingVerifiedRoll = null;
		guestVerifiedRoll = null;
		rollOffInProgress = false;
		onlineConnectionState = 'offline';
		onlineForfeitMessage = 'The other player left the game. A win has been awarded to you.';
		onlineMessage = onlineForfeitMessage;
		clearPokerDiceOnlineSession();
	}

	function recordOnlineForfeit(result: OnlineGameResult): void {
		if (!onlineSessionId || onlineLocalPlayerId === null) return;

		onlineGameHistory = upsertOnlineGameLogEntry(
			loadOnlineGameHistory(),
			$state.snapshot(game),
			onlineSessionId,
			onlineLocalPlayerId,
			result
		);
	}

	async function copyOnlineRoomCode(): Promise<void> {
		if (!onlineRoomCode) return;

		try {
			await navigator.clipboard.writeText(onlineRoomCode);
		} catch {
			onlineMessage = 'Copy the game code from the header.';
		}
	}

	function clearOnlineSession(): void {
		destroyOnlinePeer();
		clearPokerDiceOnlineSession();
		onlineRole = null;
		onlineConnectionState = 'offline';
		onlineMessage = '';
		onlineRoomCode = '';
		onlineRoomInput = '';
		onlineSessionId = '';
		onlineLocalPlayerId = null;
		onlineLocalPlayerToken = '';
		onlineGuestPlayerToken = null;
		onlineForfeitMessage = '';
		onlineSequence = 0;
		lastOnlineSequence = -1;
		pendingVerifiedRoll = null;
		guestVerifiedRoll = null;
		handledOnlineActionIds.clear();
	}

	function destroyOnlinePeer(): void {
		onlineConnection?.close();
		onlineConnection = null;
		onlinePeer?.destroy();
		onlinePeer = null;
	}

	function getPeerErrorType(error: unknown): string {
		return typeof error === 'object' && error && 'type' in error
			? String((error as { type?: unknown }).type ?? '')
			: '';
	}

	function getPeerOptions(): { debug: number } {
		// PeerJS owns signalling here. Dev logging keeps WebRTC setup failures visible while player UI stays calm.
		return { debug: import.meta.env.DEV ? 2 : 0 };
	}

	function logPeerError(context: string, error: unknown): void {
		if (!import.meta.env.DEV) return;
		console.error(`[Poker Dice online] ${context}`, error);
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

	function formatOnlineResult(entry: OnlineGameLogEntry): string {
		const result = formatResult(entry.result);
		return entry.finish === 'forfeit' ? `${result} (FFT)` : result;
	}

	function formatOnlineOpponentRecord(opponentName: string): string {
		const record = getOnlineOpponentRecord(onlineGameHistory, opponentName);
		return `${record.wins}-${record.losses}-${record.ties}`;
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
		<div class="poker-header-sticky">
			<AppHeader
				title="Poker Dice"
				activeGameId="poker-dice"
				onNewGame={showOnlineDisconnect ? disconnectOnlineGame : newGame}
				onHelp={() => (howToPlayOpen = true)}
				onStats={openStats}
				statsLabel="Game stats"
				roomCode={onlineActive && !setupVisible && !onlineForfeitMessage ? onlineRoomCode : ''}
				onRoomCodeClick={() => void copyOnlineRoomCode()}
				newGameLabel={showOnlineDisconnect ? 'Disconnect' : 'New Game'}
			/>
		</div>

		{#if onlineActive && !setupVisible && onlineConnectionState !== 'connected'}
			<section class="flex flex-wrap items-center justify-between gap-3 border border-line bg-white p-3 text-sm text-neutral-700">
				<p>{onlineForfeitMessage || onlineMessage}</p>
				{#if !onlineForfeitMessage}
					<button
						type="button"
						class="cursor-pointer border border-neutral-950 bg-neutral-950 px-3 py-2 font-semibold text-white hover:bg-accent-dark"
						onclick={() => void reconnectOnlineGame()}
					>
						Reconnect
					</button>
				{/if}
			</section>
		{/if}

		{#if setupVisible}
			<section class="grid min-h-[55vh] place-items-center">
				<div class="grid w-full max-w-2xl gap-0 border border-line bg-white">
					<div class="grid grid-cols-3 border-b border-line">
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
								'border-r border-line px-4 py-3 font-semibold disabled:cursor-not-allowed disabled:text-neutral-300',
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
						<button
							type="button"
							data-testid="setup-online-game-tab"
							class={[
								'cursor-pointer px-4 py-3 font-semibold',
								setupMode === 'online'
									? 'bg-accent text-white'
									: 'bg-white text-neutral-700 hover:bg-neutral-100'
							]}
							onclick={() => (setupMode = 'online')}
						>
							Online
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
					{:else if setupMode === 'load'}
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
					{:else}
						<div class="grid gap-5 p-5">
							<div class="text-center">
								<h2 class="text-xl font-bold text-neutral-950">Online Game</h2>
								<p class="mt-1 text-sm text-neutral-600">
									Create a two-player room or join one with a game code.
								</p>
							</div>

							{#if !onlineActive}
								<div class="grid gap-4 md:grid-cols-2">
									<form
										class="grid h-full grid-rows-[auto_auto_1fr_auto] gap-3 border border-line p-4"
										onsubmit={(event) => {
											event.preventDefault();
											void hostOnlineGame();
										}}
									>
										<h3 class="font-bold text-neutral-950">Create Room</h3>
										<p class="text-sm text-neutral-600">
											Start the host room here. A shareable code appears when the room is ready.
										</p>
										<div class="grid content-end gap-3">
											<label class="grid gap-1">
												<span class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Your Name</span>
												<input
													data-testid="online-host-name"
													class="border border-line px-3 py-2 outline-none focus:border-accent"
													value={onlineHostName}
													oninput={(event) => (onlineHostName = (event.currentTarget as HTMLInputElement).value)}
												/>
											</label>
										</div>
										<button
											type="submit"
											data-testid="create-online-room"
											class="h-11 w-full cursor-pointer border border-neutral-950 bg-neutral-950 px-4 font-semibold text-white hover:bg-accent-dark"
										>
											Create Online Game
										</button>
									</form>

									<form
										class="grid h-full grid-rows-[auto_auto_1fr_auto] gap-3 border border-line p-4"
										onsubmit={(event) => {
											event.preventDefault();
											void joinOnlineGame();
										}}
									>
										<h3 class="font-bold text-neutral-950">Join Room</h3>
										<p class="text-sm text-neutral-600">
											Use the code shown on the host device after it creates the room.
										</p>
										<div class="grid content-end gap-3">
											<label class="grid gap-1">
												<span class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Game Code</span>
												<input
													data-testid="online-room-code-input"
													class="border border-line px-3 py-2 uppercase outline-none focus:border-accent"
													value={onlineRoomInput}
													maxlength="8"
													oninput={(event) => (onlineRoomInput = normalizeRoomCode((event.currentTarget as HTMLInputElement).value))}
												/>
											</label>
											<label class="grid gap-1">
												<span class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Your Name</span>
												<input
													data-testid="online-guest-name"
													class="border border-line px-3 py-2 outline-none focus:border-accent"
													value={onlineGuestName}
													oninput={(event) => (onlineGuestName = (event.currentTarget as HTMLInputElement).value)}
												/>
											</label>
										</div>
										<button
											type="submit"
											data-testid="join-online-room"
											class="h-11 w-full cursor-pointer border border-neutral-950 bg-neutral-950 px-4 font-semibold text-white hover:bg-accent-dark"
										>
											Join Online Game
										</button>
									</form>
								</div>
							{:else}
								<section class="grid gap-4 border border-line bg-neutral-50 p-4">
									<div class="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
										<div>
											<p class="text-sm font-semibold uppercase tracking-wide text-neutral-500">
												{onlineRole === 'host' ? 'Share Game Code' : 'Joining Game Code'}
											</p>
											<p data-testid="online-room-code" class="text-3xl font-bold tracking-wide text-neutral-950">
												{onlineRoomCode}
											</p>
										</div>
										<p class="border border-line bg-white px-3 py-2 text-sm font-semibold text-neutral-700">
											{onlineConnectionState}
										</p>
									</div>
									<p data-testid="online-status-message" class="text-sm text-neutral-700">{onlineMessage}</p>
									<div class="flex flex-wrap gap-2">
										{#if onlineConnectionState === 'reconnecting' || onlineConnectionState === 'error'}
											<button
												type="button"
												data-testid="reconnect-online-room"
												class="cursor-pointer border border-neutral-950 bg-neutral-950 px-4 py-2 font-semibold text-white hover:bg-accent-dark"
												onclick={() => void reconnectOnlineGame()}
											>
												Reconnect
											</button>
										{/if}
										<button
											type="button"
											class="cursor-pointer border border-line bg-white px-4 py-2 font-semibold hover:border-accent hover:text-accent"
											onclick={clearOnlineSession}
										>
											Leave Online Setup
										</button>
									</div>
								</section>
							{/if}
						</div>
					{/if}
				</div>
			</section>
		{:else if rollOffActive}
			<section class="poker-rolloff-layout grid gap-5 lg:grid-cols-[minmax(280px,420px)_1fr]">
				<div class="poker-rolloff-side grid gap-5">
					<section class="poker-rolloff-status border border-line bg-white p-5">
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

					<section class="poker-rolloff-dice poker-dice-panel border border-line bg-white p-4">
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

				<section class="poker-rolloff-results border border-line bg-white p-5">
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
								disabled={rollOffPicker.isCpu ||
									rollOffInProgress ||
									(onlineActive && rollOffPicker.id !== onlineLocalPlayerId)}
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
				<div class="poker-side-panel flex flex-col gap-5">
					<div class="poker-turn-panel">
						<GameControls
							activePlayerName={activePlayer.name}
							roundNumber={game.roundNumber}
							{gameOver}
							{winnerText}
							turnLabel={onlineTurnLabel}
						/>
					</div>

					<section class="poker-dice-panel border border-line bg-white p-4">
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

					<div class="poker-leaderboard-panel">
						<GameLeaderboard players={game.players} activePlayerId={activePlayer.id} />
					</div>
				</div>

				<div class="scorecard-panel grid gap-0">
					<div
						class="scorecard-tabs flex flex-wrap border border-b-0 border-line bg-white"
						role="tablist"
						aria-label="Player scorecards"
					>
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
							disabled={onlineActive || game.players.length >= 10 || scoreRevealActive || cpuTurnInProgress || gameOver}
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
							value={renameDraftName}
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
				aria-labelledby="poker-stats-title"
				onclick={(event) => event.stopPropagation()}
				onkeydown={(event) => event.stopPropagation()}
			>
				<div class="flex items-start justify-between gap-4">
					<div>
						<h2 id="poker-stats-title" class="sr-only">Game Stats</h2>
						<div
							class="flex flex-wrap border border-line"
							role="tablist"
							aria-labelledby="poker-stats-title"
						>
							<button
								type="button"
								role="tab"
								aria-selected={statsView === 'cpu'}
								tabindex={statsView === 'cpu' ? 0 : -1}
								class={[
									'cursor-pointer px-3 py-2 text-left text-xl font-bold',
									statsView === 'cpu'
										? 'bg-neutral-950 text-white'
										: 'bg-white text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950'
								]}
								onclick={() => (statsView = 'cpu')}
							>
								CPU Game Stats
							</button>
							<button
								type="button"
								role="tab"
								aria-selected={statsView === 'online'}
								tabindex={statsView === 'online' ? 0 : -1}
								class={[
									'cursor-pointer border-l border-line px-3 py-2 text-left text-xl font-bold',
									statsView === 'online'
										? 'bg-neutral-950 text-white'
										: 'bg-white text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950'
								]}
								onclick={() => (statsView = 'online')}
							>
								Online Game Stats
							</button>
						</div>
						<p class="mt-1 text-sm text-neutral-600">
							{statsShowOnline
								? 'Completed online Poker Dice matches and forfeits are logged here.'
								: 'Completed one-player games against the CPU are logged here.'}
						</p>
					</div>
					<button
						type="button"
						class="cursor-pointer border border-line px-3 py-1 font-semibold text-neutral-700 hover:border-accent hover:text-accent"
						aria-label="Close game stats"
						onclick={() => (statsOpen = false)}
					>
						Close
					</button>
				</div>

				<div class="mt-5 grid gap-3 sm:grid-cols-5">
					<div class="border border-line p-3">
						<p class="text-xs font-semibold uppercase tracking-wide text-neutral-500">Games</p>
						<p class="text-2xl font-bold">{statsShowOnline ? onlineGameSummary.games : cpuGameSummary.games}</p>
					</div>
					<div class="border border-line p-3">
						<p class="text-xs font-semibold uppercase tracking-wide text-neutral-500">Wins</p>
						<p class="text-2xl font-bold">{statsShowOnline ? onlineGameSummary.wins : cpuGameSummary.wins}</p>
					</div>
					<div class="border border-line p-3">
						<p class="text-xs font-semibold uppercase tracking-wide text-neutral-500">Losses</p>
						<p class="text-2xl font-bold">{statsShowOnline ? onlineGameSummary.losses : cpuGameSummary.losses}</p>
					</div>
					<div class="border border-line p-3">
						<p class="text-xs font-semibold uppercase tracking-wide text-neutral-500">Ties</p>
						<p class="text-2xl font-bold">{statsShowOnline ? onlineGameSummary.ties : cpuGameSummary.ties}</p>
					</div>
					<div class="border border-line p-3">
						<p class="text-xs font-semibold uppercase tracking-wide text-neutral-500">Avg Score</p>
						<p class="text-2xl font-bold">
							{statsShowOnline ? onlineGameSummary.averageLocalScore : cpuGameSummary.averageHumanScore}
						</p>
					</div>
				</div>

				<div class="mt-5">
					<h3 class="text-lg font-bold text-neutral-950">Game Log</h3>
					<div class="mt-3 overflow-x-auto border border-line">
						<table class="w-full min-w-[760px] border-collapse text-sm">
							<thead>
								<tr class="bg-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-500">
									<th class="border-b border-r border-line px-3 py-2">Date</th>
									<th class="border-b border-r border-line px-3 py-2">
										{statsShowOnline ? 'Opponent' : 'Game'}
									</th>
									<th class="border-b border-r border-line px-3 py-2">
										{statsShowOnline ? 'Opponent Record (W-L-T)' : 'Difficulty'}
									</th>
									<th class="border-b border-r border-line px-3 py-2">Result</th>
									<th class="border-b border-r border-line px-3 py-2">You</th>
									<th class="border-b border-line px-3 py-2">
										{statsShowOnline ? 'Opponent' : 'CPU'}
									</th>
								</tr>
							</thead>
							<tbody>
								{#if statsShowOnline && onlineGameHistory.length === 0}
									<tr>
										<td colspan="6" class="bg-neutral-50 px-3 py-4 text-center text-sm text-neutral-600">
											No completed online games yet. Finish a match or receive a forfeit and it will appear here.
										</td>
									</tr>
								{:else if statsShowOnline}
									{#each onlineGameHistory as entry}
										<tr class="bg-white">
											<td class="border-b border-r border-line px-3 py-2 text-neutral-600">
												{formatGameDate(entry.endedAt)}
											</td>
											<td class="border-b border-r border-line px-3 py-2 font-semibold">
												{entry.opponentName}
											</td>
											<td class="border-b border-r border-line px-3 py-2">
												{formatOnlineOpponentRecord(entry.opponentName)}
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
												{formatOnlineResult(entry)}
											</td>
											<td class="border-b border-r border-line px-3 py-2">
												{entry.localName}: <span class="font-bold">{entry.localScore}</span>
											</td>
											<td class="border-b border-line px-3 py-2">
												{entry.opponentName}: <span class="font-bold">{entry.opponentScore}</span>
											</td>
										</tr>
									{/each}
								{:else if cpuGameHistory.length === 0}
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
