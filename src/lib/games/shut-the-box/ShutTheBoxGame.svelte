<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { Peer } from 'peerjs';
	import AppHeader from '$lib/components/shared/AppHeader.svelte';
	import DiceFace from '$lib/components/shared/DiceFace.svelte';
	import HowToPlayModal from '$lib/components/shared/HowToPlayModal.svelte';
	import MiniDiceRow from '$lib/components/shared/MiniDiceRow.svelte';
	import { createDiceScrambleDurations } from '$lib/utils/diceAnimation';
	import { playDiceRollSound } from '$lib/utils/soundEffects';
	import {
		SHUT_BOX_TILES,
		applyRoll,
		chooseCpuTiles,
		commitSelectedTiles,
		createShutBoxGame,
		getActivePlayer,
		getOpenTileSum,
		getOpenTiles,
		getTileCombinations,
		getWinnerText,
		normalizeShutBoxGame,
		renameShutBoxPlayer,
		rollShutBoxDice,
		startShutBoxGame,
		toggleTile
	} from './shutTheBoxGame';
	import {
		MAX_SHUT_BOX_SAVED_GAMES,
		buildShutBoxSaveRecord,
		createDefaultShutBoxGameName,
		createShutBoxSaveId,
		deleteShutBoxSavedGame,
		loadShutBoxLastGameId,
		loadShutBoxSavedGames,
		saveShutBoxGameRecord,
		setShutBoxLastGameId
	} from './shutTheBoxSave';
	import {
		createOnlineId,
		createRoomCode,
		getShutBoxRoomPeerId,
		normalizeRoomCode
	} from './shutTheBoxOnline';
	import type {
		ShutBoxConnectionState,
		ShutBoxGuestMessage,
		ShutBoxHostMessage,
		ShutBoxOnlineAction,
		ShutBoxOnlineRole,
		ShutBoxPeerConnection
	} from './shutTheBoxOnline';
	import type {
		ShutBoxDiceValue,
		ShutBoxGameState,
		ShutBoxMode,
		ShutBoxSavedGameRecord
	} from './shutTheBoxTypes';

	let game = $state<ShutBoxGameState>(createShutBoxGame());
	let gameName = $state(createDefaultShutBoxGameName());
	let currentSaveId = $state(createShutBoxSaveId());
	let savedGames = $state<ShutBoxSavedGameRecord[]>([]);
	let setupVisible = $state(true);
	let setupMode = $state<'new' | 'load' | 'online'>('new');
	let selectedMode = $state<ShutBoxMode>('cpu');
	let playerCount = $state(2);
	let playerNames = $state(['Player 1', 'Player 2']);
	let confirmDeleteGameId = $state('');
	let persistenceReady = $state(false);
	let howToPlayOpen = $state(false);
	let rolling = $state(false);
	let rollingIndexes = $state(new Set<number>());
	let visualDice = $state<ShutBoxDiceValue[]>([1, 2]);
	let localPlayerId = $state<number | null>(null);
	let onlineRole = $state<ShutBoxOnlineRole | null>(null);
	let onlineRoomCode = $state('');
	let onlineRoomInput = $state('');
	let onlineHostName = $state('Player 1');
	let onlineGuestName = $state('Player 2');
	let onlineSessionId = $state('');
	let onlineConnectionState = $state<ShutBoxConnectionState>('offline');
	let onlineMessage = $state('');
	let onlinePeer: Peer | null = null;
	let onlineConnection: ShutBoxPeerConnection | null = null;
	let onlineSequence = 0;
	const rollIntervals = new Map<number, ReturnType<typeof setInterval>>();
	const rollTimers = new Map<number, ReturnType<typeof setTimeout>>();
	const cpuTimers = new Set<ReturnType<typeof setTimeout>>();

	let trimmedGameName = $derived(gameName.trim());
	let activePlayer = $derived(getActivePlayer(game));
	let winnerText = $derived(getWinnerText(game));
	let playableSavedGames = $derived(savedGames);
	let duplicateSavedGame = $derived(
		playableSavedGames.find((savedGame) => savedGame.name.toLocaleLowerCase() === trimmedGameName.toLocaleLowerCase()) ?? null
	);
	let canStartNewGame = $derived(
		trimmedGameName.length > 0 && (!!duplicateSavedGame || playableSavedGames.length < MAX_SHUT_BOX_SAVED_GAMES)
	);
	let localOnlineTurn = $derived(!onlineRole || activePlayer.id === localPlayerId);
	let canRoll = $derived(
		game.setupComplete &&
			game.phase === 'ready' &&
			!rolling &&
			!activePlayer.isCpu &&
			localOnlineTurn
	);
	let canCommitTiles = $derived(
		game.phase === 'choosing' &&
			!rolling &&
			localOnlineTurn &&
			!activePlayer.isCpu &&
			!!game.lastRoll &&
			game.selectedTiles.reduce((total, tile) => total + tile, 0) === game.lastRoll.total
	);
	let selectedTotal = $derived(game.selectedTiles.reduce((total, tile) => total + tile, 0));
	let openTiles = $derived(getOpenTiles(activePlayer));
	let possibleCombinations = $derived(game.lastRoll ? getTileCombinations(openTiles, game.lastRoll.total) : []);
	let onlineActive = $derived(!!onlineRole);
	let headerButtonLabel = $derived(onlineActive && onlineConnectionState === 'connected' && !setupVisible ? 'Disconnect' : 'New Game');

	const howToPlaySections = [
		{
			title: 'Goal',
			items: [
				'Roll two dice, then close open tiles that add exactly to the roll total.',
				'Keep rolling until no open tile combination can match the roll.',
				'Lowest remaining tile total wins. Closing every tile shuts the box and wins instantly.'
			]
		},
		{
			title: 'Turns',
			items: [
				'Each player gets one run at the box.',
				'After a player gets stuck, their open tiles are added as their score.',
				'In CPU and online games, both players use the same rules and random dice.'
			]
		}
	];

	$effect(() => {
		if (!persistenceReady || setupVisible || onlineActive || !game.setupComplete) return;
		persistGame();
	});

	$effect(() => {
		if (!game.setupComplete || game.phase !== 'ready' || !activePlayer.isCpu || rolling || setupVisible) return;
		queueCpuAction(() => beginRoll(rollShutBoxDice()), 700);
	});

	$effect(() => {
		if (!game.setupComplete || game.phase !== 'choosing' || !activePlayer.isCpu || rolling || setupVisible) return;
		queueCpuAction(() => {
			const tiles = chooseCpuTiles(game);
			for (const tile of tiles) toggleTile(game, tile);
			persistIfReady();
			queueCpuAction(() => {
				commitSelectedTiles(game);
				persistIfReady();
			}, 800);
		}, 900);
	});

	onMount(() => {
		const loadedGames = loadShutBoxSavedGames();
		const playableGames = getPlayableSavedGames(loadedGames);
		const lastGameId = loadShutBoxLastGameId();
		const gameToLoad =
			playableGames.find((savedGame) => savedGame.id === lastGameId) ?? playableGames[0] ?? null;

		savedGames = playableGames;
		if (gameToLoad) applySavedGame(gameToLoad);
		persistenceReady = true;
	});

	onDestroy(() => {
		clearRollTimers();
		clearCpuTimers();
		destroyPeer();
	});

	function startGame(): void {
		if (!canStartNewGame) return;

		clearCpuTimers();
		clearRollTimers();
		const names =
			selectedMode === 'cpu'
				? [playerNames[0]?.trim() || 'Player 1', 'CPU']
				: playerNames.slice(0, playerCount).map((name, index) => name.trim() || `Player ${index + 1}`);
		currentSaveId = duplicateSavedGame?.id ?? createShutBoxSaveId();
		gameName = trimmedGameName;
		game = startShutBoxGame(names, selectedMode, gameName);
		setupVisible = false;
		setupMode = 'new';
		localPlayerId = null;
		onlineRole = null;
		visualDice = [...game.dice];
		persistIfReady();
	}

	function newGame(): void {
		clearCpuTimers();
		clearRollTimers();
		destroyPeer();
		game = createShutBoxGame();
		gameName = createDefaultShutBoxGameName();
		currentSaveId = createShutBoxSaveId();
		setupVisible = true;
		setupMode = 'new';
		selectedMode = 'cpu';
		playerCount = 2;
		playerNames = ['Player 1', 'Player 2'];
		confirmDeleteGameId = '';
		howToPlayOpen = false;
		localPlayerId = null;
		onlineRole = null;
		onlineRoomCode = '';
		onlineConnectionState = 'offline';
		onlineMessage = '';
		visualDice = [1, 2];
	}

	function handleHeaderNewGame(): void {
		if (onlineActive && onlineConnectionState === 'connected' && !setupVisible) {
			sendForfeit();
			newGame();
			return;
		}

		newGame();
	}

	function beginRoll(dice: [ShutBoxDiceValue, ShutBoxDiceValue]): void {
		if (rolling || game.phase !== 'ready') return;

		playDiceRollSound();
		clearRollTimers();
		rolling = true;
		rollingIndexes = new Set([0, 1]);
		const durations = createDiceScrambleDurations(2, 750, 2000);

		dice.forEach((finalValue, index) => {
			rollIntervals.set(
				index,
				setInterval(() => {
					visualDice[index] = rollRandomFace();
				}, 70)
			);
			rollTimers.set(
				index,
				setTimeout(() => finishRollingDie(index, finalValue, dice), durations[index])
			);
		});
	}

	function finishRollingDie(
		index: number,
		finalValue: ShutBoxDiceValue,
		finalDice: [ShutBoxDiceValue, ShutBoxDiceValue]
	): void {
		clearRollTimer(index);
		visualDice[index] = finalValue;
		rollingIndexes = new Set([...rollingIndexes].filter((rollingIndex) => rollingIndex !== index));

		if (rollingIndexes.size > 0) return;

		rolling = false;
		applyRoll(game, finalDice);
		persistIfReady();
		broadcastSnapshot();
	}

	function rollDice(): void {
		if (!canRoll) return;

		if (onlineRole === 'guest') {
			sendGuestAction({ type: 'roll' });
			return;
		}

		beginRoll(rollShutBoxDice());
	}

	function handleTile(tile: number): void {
		if (game.phase !== 'choosing' || rolling || activePlayer.isCpu || !localOnlineTurn) return;

		if (onlineRole === 'guest') {
			sendGuestAction({ type: 'toggleTile', tile });
			return;
		}

		toggleTile(game, tile);
		persistIfReady();
		broadcastSnapshot();
	}

	function commitTiles(): void {
		if (!canCommitTiles) return;

		if (onlineRole === 'guest') {
			sendGuestAction({ type: 'commitTiles' });
			return;
		}

		commitSelectedTiles(game);
		persistIfReady();
		broadcastSnapshot();
	}

	function setPlayerCount(nextCount: number): void {
		playerCount = Math.min(4, Math.max(2, nextCount));
		playerNames = Array.from({ length: playerCount }, (_, index) => playerNames[index] ?? `Player ${index + 1}`);
	}

	function renameSetupPlayer(index: number, name: string): void {
		playerNames[index] = name;
	}

	function renameGame(name: string): void {
		gameName = name;
	}

	function changeSetupMode(nextMode: 'new' | 'load' | 'online'): void {
		setupMode = savedGames.length > 0 || nextMode !== 'load' ? nextMode : 'new';
		confirmDeleteGameId = '';
	}

	function loadSavedGame(id: string): void {
		const savedGame = savedGames.find((record) => record.id === id);
		if (!savedGame) return;
		applySavedGame(savedGame);
		savedGames = getPlayableSavedGames(loadShutBoxSavedGames());
	}

	function requestDeleteSavedGame(id: string): void {
		confirmDeleteGameId = id;
	}

	function confirmDeleteSavedGame(id: string): void {
		savedGames = getPlayableSavedGames(deleteShutBoxSavedGame(id));
		confirmDeleteGameId = '';
		if (id === currentSaveId) newGame();
		if (!savedGames.length) setupMode = 'new';
	}

	function applySavedGame(savedGame: ShutBoxSavedGameRecord): void {
		clearCpuTimers();
		clearRollTimers();
		game = normalizeShutBoxGame(structuredClone(savedGame.snapshot.game));
		gameName = savedGame.snapshot.gameName || savedGame.name;
		currentSaveId = savedGame.id;
		setupVisible = false;
		setupMode = 'new';
		selectedMode = game.mode;
		visualDice = [...game.dice];
		localPlayerId = null;
		onlineRole = null;
		setShutBoxLastGameId(savedGame.id);
	}

	function persistIfReady(): void {
		if (!persistenceReady || setupVisible || onlineActive || !game.setupComplete) return;
		persistGame();
	}

	function persistGame(): void {
		savedGames = getPlayableSavedGames(
			saveShutBoxGameRecord(buildShutBoxSaveRecord(currentSaveId, gameName, $state.snapshot(game)))
		);
	}

	function getPlayableSavedGames(records: ShutBoxSavedGameRecord[]): ShutBoxSavedGameRecord[] {
		return records.filter((record) => record.snapshot.game.phase !== 'game-over');
	}

	function queueCpuAction(action: () => void, delay: number): void {
		const timer = setTimeout(() => {
			cpuTimers.delete(timer);
			action();
		}, delay);
		cpuTimers.add(timer);
	}

	function clearCpuTimers(): void {
		for (const timer of cpuTimers) clearTimeout(timer);
		cpuTimers.clear();
	}

	function clearRollTimers(): void {
		for (const index of [...rollIntervals.keys(), ...rollTimers.keys()]) clearRollTimer(index);
		rolling = false;
		rollingIndexes = new Set();
	}

	function clearRollTimer(index: number): void {
		const interval = rollIntervals.get(index);
		const timer = rollTimers.get(index);
		if (interval) clearInterval(interval);
		if (timer) clearTimeout(timer);
		rollIntervals.delete(index);
		rollTimers.delete(index);
	}

	function rollRandomFace(): ShutBoxDiceValue {
		return (Math.floor(Math.random() * 6) + 1) as ShutBoxDiceValue;
	}

	async function hostOnlineGame(): Promise<void> {
		clearCpuTimers();
		clearRollTimers();
		game = startShutBoxGame([onlineHostName.trim() || 'Player 1', 'Player 2'], 'online', gameName);
		setupVisible = true;
		setupMode = 'online';
		selectedMode = 'online';
		localPlayerId = 1;
		onlineRole = 'host';
		onlineSessionId = createOnlineId('shut-box-session');
		onlineSequence = 0;
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

		clearCpuTimers();
		clearRollTimers();
		setupMode = 'online';
		selectedMode = 'online';
		localPlayerId = 2;
		onlineRole = 'guest';
		onlineRoomCode = roomCode;
		onlineMessage = 'Connecting to host.';
		await openGuestPeer(roomCode, onlineGuestName.trim() || 'Player 2');
	}

	async function openHostPeer(roomCode: string, allowNewCode: boolean, attempt = 0): Promise<void> {
		if (attempt > 4) {
			onlineConnectionState = 'error';
			onlineMessage = 'Could not create a room. Try again.';
			return;
		}

		destroyPeer();
		onlineRoomCode = roomCode;
		onlineConnectionState = 'creating';
		const PeerClient = await loadPeerClient();
		const peer = new PeerClient(getShutBoxRoomPeerId(roomCode), { debug: 0 });
		onlinePeer = peer;

		peer.on('open', () => {
			onlineConnectionState = onlineConnection ? 'connected' : 'waiting';
			onlineMessage = onlineConnection ? 'Connected.' : 'Room ready. Share the game code.';
		});
		peer.on('connection', (connection) => attachHostConnection(connection as ShutBoxPeerConnection));
		peer.on('error', (error) => {
			const errorType = getPeerErrorType(error);
			if (allowNewCode && errorType === 'unavailable-id') {
				void openHostPeer(createRoomCode(), true, attempt + 1);
				return;
			}
			onlineConnectionState = 'error';
			onlineMessage = 'The online room could not be created.';
		});
	}

	async function openGuestPeer(roomCode: string, playerName: string): Promise<void> {
		destroyPeer();
		onlineConnectionState = 'connecting';
		const PeerClient = await loadPeerClient();
		const peer = new PeerClient({ debug: 0 });
		onlinePeer = peer;

		peer.on('open', () => {
			const connection = peer.connect(getShutBoxRoomPeerId(roomCode), { serialization: 'json' });
			attachGuestConnection(connection as ShutBoxPeerConnection, playerName);
		});
		peer.on('error', (error) => {
			onlineConnectionState = 'error';
			onlineMessage =
				getPeerErrorType(error) === 'peer-unavailable'
					? 'No host is waiting for that code.'
					: 'Could not connect to the host.';
		});
	}

	function attachHostConnection(connection: ShutBoxPeerConnection): void {
		onlineConnection?.close();
		onlineConnection = connection;
		onlineConnectionState = 'connecting';
		connection.on('data', (data) => handleHostData(data as ShutBoxGuestMessage));
		connection.on('close', () => {
			onlineConnectionState = 'error';
			onlineMessage = 'The other player disconnected.';
		});
	}

	function attachGuestConnection(connection: ShutBoxPeerConnection, playerName: string): void {
		onlineConnection = connection;
		connection.on('open', () => {
			connection.send({ kind: 'join', playerName });
		});
		connection.on('data', (data) => handleGuestData(data as ShutBoxHostMessage));
		connection.on('close', () => {
			onlineConnectionState = 'error';
			onlineMessage = 'Disconnected from host.';
		});
	}

	function handleHostData(message: ShutBoxGuestMessage): void {
		if (message.kind === 'join') {
			game.players[1].name = message.playerName.trim() || 'Player 2';
			setupVisible = false;
			onlineConnectionState = 'connected';
			onlineMessage = 'Connected.';
			broadcastSnapshot();
			return;
		}

		if (message.kind !== 'action' || message.sessionId !== onlineSessionId) return;
		handleOnlineAction(2, message.action);
	}

	function handleGuestData(message: ShutBoxHostMessage): void {
		if (message.kind === 'snapshot') {
			onlineSessionId = message.sessionId;
			localPlayerId = message.localPlayerId;
			onlineConnectionState = 'connected';
			onlineMessage = 'Connected.';
			applyRemoteSnapshot(message.snapshot.game);
			setupVisible = false;
			return;
		}

		if (message.kind === 'forfeit') {
			applyRemoteSnapshot(game);
			game.phase = 'game-over';
			game.winnerIds = [message.winnerId];
			game.statusMessage = 'The other player left. You win.';
		}
	}

	function handleOnlineAction(playerId: number, action: ShutBoxOnlineAction): void {
		if (playerId !== activePlayer.id && action.type !== 'renameSelf' && action.type !== 'forfeit') {
			rejectOnlineAction('It is not your turn.');
			return;
		}

		if (action.type === 'roll') {
			if (game.phase !== 'ready' || rolling) return;
			beginRoll(rollShutBoxDice());
			return;
		}

		if (action.type === 'toggleTile') {
			toggleTile(game, action.tile);
			broadcastSnapshot();
			return;
		}

		if (action.type === 'commitTiles') {
			commitSelectedTiles(game);
			broadcastSnapshot();
			return;
		}

		if (action.type === 'renameSelf') {
			renameShutBoxPlayer(game, playerId, action.name);
			broadcastSnapshot();
			return;
		}

		if (action.type === 'forfeit') {
			game.phase = 'game-over';
			game.winnerIds = [playerId === 1 ? 2 : 1];
			game.statusMessage = 'The other player left. You win.';
			broadcastForfeit(game.winnerIds[0] ?? 1);
		}
	}

	function sendGuestAction(action: ShutBoxOnlineAction): void {
		if (!onlineConnection || !onlineSessionId) return;
		onlineConnection.send({ kind: 'action', sessionId: onlineSessionId, action });
	}

	function sendForfeit(): void {
		if (onlineRole === 'guest') {
			sendGuestAction({ type: 'forfeit' });
			return;
		}
		broadcastForfeit(2);
	}

	function broadcastSnapshot(): void {
		if (onlineRole !== 'host' || !onlineConnection?.open) return;
		onlineSequence += 1;
		onlineConnection.send({
			kind: 'snapshot',
			sessionId: onlineSessionId,
			localPlayerId: 2,
			snapshot: { game: $state.snapshot(game), sequence: onlineSequence }
		});
	}

	function rejectOnlineAction(message: string): void {
		if (onlineRole !== 'host' || !onlineConnection?.open) return;
		onlineConnection.send({ kind: 'rejected', sessionId: onlineSessionId, message });
	}

	function broadcastForfeit(winnerId: number): void {
		if (onlineRole !== 'host' || !onlineConnection?.open) return;
		onlineConnection.send({ kind: 'forfeit', sessionId: onlineSessionId, winnerId });
	}

	function applyRemoteSnapshot(nextGame: ShutBoxGameState): void {
		game = normalizeShutBoxGame(structuredClone(nextGame));
		visualDice = [...game.dice];
	}

	async function loadPeerClient(): Promise<typeof Peer> {
		const peerModule = await import('peerjs');
		const peerExports = peerModule as unknown as { Peer?: typeof Peer; default?: { Peer?: typeof Peer } };
		const PeerClient = peerExports.Peer ?? peerExports.default?.Peer;
		if (!PeerClient) throw new Error('PeerJS client unavailable.');
		return PeerClient;
	}

	function destroyPeer(): void {
		onlineConnection?.close();
		onlineConnection = null;
		onlinePeer?.destroy();
		onlinePeer = null;
	}

	function getPeerErrorType(error: unknown): string {
		if (typeof error === 'object' && error && 'type' in error) return String(error.type);
		return '';
	}
</script>

<svelte:window onkeydown={(event) => {
	if (event.defaultPrevented || ['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement)?.tagName)) return;
	if (event.code === 'Space') {
		event.preventDefault();
		rollDice();
	}
}} />

<main class="min-h-screen bg-paper px-4 py-6 text-neutral-900 sm:px-6 lg:px-8">
	<div class="mx-auto flex max-w-7xl flex-col gap-5">
		<AppHeader
			title="Shut the Box"
			activeGameId="shut-the-box"
			onNewGame={handleHeaderNewGame}
			onHelp={() => (howToPlayOpen = true)}
			newGameLabel={headerButtonLabel}
			roomCode={onlineActive && !setupVisible ? onlineRoomCode : ''}
			onRoomCodeClick={() => navigator.clipboard?.writeText(onlineRoomCode)}
		/>

		{#if setupVisible}
			<section class="border border-line bg-white">
				<div class="grid grid-cols-3 border-b border-line text-center text-lg">
					<button class={['cursor-pointer border-r border-line px-4 py-4', setupMode === 'new' ? 'bg-accent text-white' : 'bg-white']} onclick={() => changeSetupMode('new')}>New Game</button>
					<button class={['cursor-pointer border-r border-line px-4 py-4 disabled:cursor-not-allowed disabled:text-neutral-300', setupMode === 'load' ? 'bg-accent text-white' : 'bg-white']} disabled={!savedGames.length} onclick={() => changeSetupMode('load')}>Load Game</button>
					<button class={['cursor-pointer px-4 py-4', setupMode === 'online' ? 'bg-accent text-white' : 'bg-white']} onclick={() => changeSetupMode('online')}>Online</button>
				</div>

				{#if setupMode === 'new'}
					<div class="grid gap-6 p-6">
						<div class="text-center">
							<h2 class="text-2xl font-bold">New Shut the Box Game</h2>
							<p class="text-neutral-600">Close tiles that match your dice total. Lowest score wins.</p>
						</div>
						<label class="grid gap-1">
							<span class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Game Name</span>
							<input class="border border-line px-3 py-3 text-lg outline-none focus:border-accent" value={gameName} oninput={(event) => renameGame((event.currentTarget as HTMLInputElement).value)} />
						</label>
						<div class="grid gap-4 md:grid-cols-3">
							<label class="grid gap-1">
								<span class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Mode</span>
								<select class="cursor-pointer border border-line px-3 py-3 text-lg" bind:value={selectedMode}>
									<option value="cpu">Vs CPU</option>
									<option value="local">Local Multiplayer</option>
								</select>
							</label>
							{#if selectedMode === 'local'}
								<label class="grid gap-1">
									<span class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Players</span>
									<input class="border border-line px-3 py-3 text-lg" type="number" min="2" max="4" value={playerCount} oninput={(event) => setPlayerCount(Number((event.currentTarget as HTMLInputElement).value))} />
								</label>
							{/if}
							<button class="cursor-pointer border border-neutral-950 bg-neutral-950 px-4 py-3 text-lg font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300" disabled={!canStartNewGame} onclick={startGame}>Start Game</button>
						</div>
						<div class="grid gap-3 md:grid-cols-2">
							{#each playerNames.slice(0, selectedMode === 'cpu' ? 1 : playerCount) as name, index}
								<label class="grid gap-1">
									<span class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Player {index + 1}</span>
									<input class="border border-line px-3 py-3 text-lg" value={name} oninput={(event) => renameSetupPlayer(index, (event.currentTarget as HTMLInputElement).value)} />
								</label>
							{/each}
						</div>
					</div>
				{:else if setupMode === 'load'}
					<div class="grid gap-4 p-6">
						<h2 class="text-xl font-bold">Load Game</h2>
						{#if savedGames.length}
							{#each savedGames as savedGame}
								<div class="flex items-center justify-between border border-line">
									<button class="min-w-0 flex-1 cursor-pointer px-4 py-3 text-left font-semibold hover:bg-yellow-50" onclick={() => loadSavedGame(savedGame.id)}>{savedGame.name}</button>
									{#if confirmDeleteGameId === savedGame.id}
										<button class="cursor-pointer border-l border-accent px-4 py-3 text-accent" onclick={() => confirmDeleteSavedGame(savedGame.id)}>Confirm</button>
									{:else}
										<button class="cursor-pointer border-l border-line px-4 py-3 text-accent" onclick={() => requestDeleteSavedGame(savedGame.id)}>X</button>
									{/if}
								</div>
							{/each}
						{:else}
							<p class="border border-line p-4 text-neutral-600">No unfinished saved games.</p>
						{/if}
					</div>
				{:else}
					<div class="grid gap-6 p-6 md:grid-cols-2">
						<div class="grid gap-3 border border-line p-4">
							<h2 class="text-xl font-bold">Create Online Game</h2>
							<input class="border border-line px-3 py-3 text-lg" value={onlineHostName} oninput={(event) => (onlineHostName = (event.currentTarget as HTMLInputElement).value)} />
							<button class="cursor-pointer border border-neutral-950 bg-neutral-950 px-4 py-3 font-semibold text-white" onclick={() => void hostOnlineGame()}>Create Room</button>
							{#if onlineRoomCode}<p class="font-mono text-lg">{onlineRoomCode}</p>{/if}
						</div>
						<div class="grid gap-3 border border-line p-4">
							<h2 class="text-xl font-bold">Join Online Game</h2>
							<input class="border border-line px-3 py-3 text-lg" placeholder="Your name" value={onlineGuestName} oninput={(event) => (onlineGuestName = (event.currentTarget as HTMLInputElement).value)} />
							<input class="border border-line px-3 py-3 text-lg uppercase" placeholder="Game code" value={onlineRoomInput} oninput={(event) => (onlineRoomInput = (event.currentTarget as HTMLInputElement).value)} />
							<button class="cursor-pointer border border-neutral-950 bg-neutral-950 px-4 py-3 font-semibold text-white" onclick={() => void joinOnlineGame()}>Join Room</button>
						</div>
						{#if onlineMessage}<p class="md:col-span-2 border border-line p-3 text-neutral-700">{onlineMessage}</p>{/if}
					</div>
				{/if}
			</section>
		{:else}
			<section class="grid gap-4 lg:grid-cols-[360px_1fr]">
				<div class="grid content-start gap-4">
					<section class="border border-line bg-white p-4">
						<p class="text-sm font-semibold uppercase tracking-wide text-neutral-500">
							{onlineActive ? (localOnlineTurn ? 'Your Turn' : "Opponent's Turn") : 'Current Turn'}
						</p>
						<h2 class="text-2xl font-bold">{activePlayer.name}</h2>
						<p class="text-neutral-600">{game.statusMessage}</p>
					</section>

					<section class="border border-line bg-white p-4">
						<div class="mb-4 grid grid-cols-[2fr_1fr] gap-2">
							<button class="cursor-pointer border border-accent bg-accent px-3 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:border-neutral-300 disabled:bg-neutral-200 disabled:text-neutral-500" disabled={!canRoll} onclick={rollDice}>Roll Dice</button>
							<p class="border border-line px-3 py-3 text-center font-semibold">{game.lastRoll ? `Total ${game.lastRoll.total}` : 'Ready'}</p>
						</div>
						<div class="grid grid-cols-2 gap-3">
							{#each [0, 1] as index}
								<DiceFace value={visualDice[index] ?? game.dice[index]} faded={!game.lastRoll && !rolling} rolling={rollingIndexes.has(index)} disabled={true} />
							{/each}
						</div>
						{#if game.lastRoll}
							<div class="mt-4 flex items-center gap-3 border border-line bg-neutral-50 p-3">
								<span class="text-sm font-semibold text-neutral-500">Last Roll</span>
								<MiniDiceRow values={game.lastRoll.dice} label="Last roll dice" />
								<strong>{game.lastRoll.total}</strong>
							</div>
						{/if}
					</section>

					<section class="border border-line bg-white p-4">
						<h2 class="mb-3 text-xl font-bold">Scores</h2>
						<div class="grid gap-2">
							{#each game.players as player}
								<div class={['grid grid-cols-[1fr_auto] gap-2 border border-line p-3', player.id === activePlayer.id && game.phase !== 'game-over' ? 'bg-yellow-50' : 'bg-white']}>
									<div>
										<p class="font-semibold">{player.name} {player.id === activePlayer.id && game.phase !== 'game-over' ? 'TURN' : ''}</p>
										<p class="text-sm text-neutral-600">{player.score === null ? `${getOpenTileSum(player)} open` : `Score ${player.score}`}</p>
									</div>
									<strong>{player.score ?? '-'}</strong>
								</div>
							{/each}
						</div>
					</section>
				</div>

				<div class="grid content-start gap-4">
					<section class="border border-line bg-white p-4">
						<div class="mb-4 flex items-center justify-between gap-3">
							<h2 class="text-2xl font-bold">Tiles</h2>
							{#if game.phase === 'choosing'}
								<p class="font-semibold">Selected {selectedTotal} / {game.lastRoll?.total}</p>
							{/if}
						</div>
						<div class="grid grid-cols-4 gap-2 sm:grid-cols-6">
							{#each SHUT_BOX_TILES as tile}
								{@const closed = !openTiles.includes(tile)}
								{@const selected = game.selectedTiles.includes(tile)}
								<button
									class={[
										'aspect-square border text-2xl font-bold',
										closed
											? 'border-neutral-300 bg-neutral-100 text-neutral-300'
											: selected
												? 'cursor-pointer border-accent bg-accent text-white'
												: game.phase === 'choosing' && localOnlineTurn && !activePlayer.isCpu
													? 'cursor-pointer border-line bg-white hover:border-accent hover:bg-yellow-50'
													: 'border-line bg-white'
									]}
									disabled={closed || game.phase !== 'choosing' || !localOnlineTurn || activePlayer.isCpu}
									onclick={() => handleTile(tile)}
								>
									{tile}
								</button>
							{/each}
						</div>
						{#if game.phase === 'choosing'}
							<div class="mt-4 grid gap-3 border border-line bg-neutral-50 p-3">
								<p class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Possible Moves</p>
								<p>{possibleCombinations.map((combo) => combo.join(' + ')).join('   |   ')}</p>
								<button class="cursor-pointer border border-neutral-950 bg-neutral-950 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-300" disabled={!canCommitTiles} onclick={commitTiles}>Close Selected Tiles</button>
							</div>
						{/if}
					</section>

					<section class="border border-line bg-white p-4">
						<h2 class="mb-3 text-xl font-bold">Turn Log</h2>
						<div class="grid max-h-80 gap-2 overflow-y-auto">
							{#each game.turnLog as entry}
								<div class="border border-line p-3">
									<p><strong>{entry.playerName}</strong> {entry.message}</p>
									{#if entry.dice}<MiniDiceRow values={entry.dice} label="Log roll dice" />{/if}
								</div>
							{:else}
								<p class="border border-line p-3 text-neutral-600">Roll to begin.</p>
							{/each}
						</div>
					</section>
				</div>
			</section>

			{#if game.phase === 'game-over'}
				<section class="border border-neutral-950 bg-white p-5">
					<h2 class="text-2xl font-bold">Game Over</h2>
					<p class="text-lg">{winnerText}</p>
				</section>
			{/if}
		{/if}
	</div>
</main>

{#if howToPlayOpen}
	<HowToPlayModal
		title="How to Play Shut the Box"
		intro="Shut the Box is a quick dice-and-tiles game. Roll two dice, close matching tile totals, and try to leave the lowest score."
		sections={howToPlaySections}
		onClose={() => (howToPlayOpen = false)}
	/>
{/if}
