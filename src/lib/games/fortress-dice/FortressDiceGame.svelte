<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import AppHeader from '$lib/components/shared/AppHeader.svelte';
	import HowToPlayModal from '$lib/components/shared/HowToPlayModal.svelte';
	import FortressPlayerStation from './FortressPlayerStation.svelte';
	import { createDiceScrambleDurations } from '$lib/utils/diceAnimation';
	import { playDiceRollSound } from '$lib/utils/soundEffects';
	import {
		commitFortressAction,
		createFortressGame,
		FORTRESS_LANE_IDS,
		FORTRESS_MAX_ROLLS,
		FORTRESS_MAX_LANE_SHIELD,
		formatPower,
		getComboOptions,
		getLaneName,
		isCooldownReady,
		isPlayerFrozen,
		normalizeFortressGame,
		rollFortressDice,
		startFortressGame,
		tickFortressGame
	} from './fortressDiceLogic';
	import {
		buildFortressSaveRecord,
		createDefaultFortressGameName,
		createFortressSaveId,
		deleteFortressSavedGame,
		loadFortressLastGameId,
		loadFortressSavedGames,
		MAX_FORTRESS_SAVED_GAMES,
		saveFortressGameRecord,
		setFortressLastGameId
	} from './fortressDiceSave';
	import type {
		FortressActionOption,
		FortressDiceValue,
		FortressGameState,
		FortressLaneId,
		FortressPlayer,
		FortressPlayerId,
		FortressSavedGameRecord
	} from './fortressDiceTypes';

	let game = $state<FortressGameState>(createFortressGame());
	let gameName = $state(createDefaultFortressGameName());
	let currentSaveId = $state(createFortressSaveId());
	let savedGames = $state<FortressSavedGameRecord[]>([]);
	let setupMode = $state<'new' | 'load'>('new');
	let confirmDeleteGameId = $state('');
	let playerNames = $state(['Player 1', 'Player 2']);
	let fortressHp = $state(30);
	let persistenceReady = $state(false);
	let lastAutoPersistAt = 0;
	let gameOverHandled = false;
	let howToPlayOpen = $state(false);
	let now = $state(Date.now());
	let selectedOptions = $state<Record<FortressPlayerId, string | null>>({ 1: null, 2: null });
	let rollingPlayerIds = $state(new Set<FortressPlayerId>());
	let visualDice = $state<Record<FortressPlayerId, FortressDiceValue[]>>({
		1: [1, 2, 3, 4, 5],
		2: [1, 2, 3, 4, 5]
	});

	const rollIntervals = new Map<string, ReturnType<typeof setInterval>>();
	const rollTimers = new Map<string, ReturnType<typeof setTimeout>>();
	const howToPlaySections = [
		{
			title: 'Goal',
			items: ['Break the other fortress first.', 'Each troop removes one lane shield or deals one fortress damage.', 'Shields protect individual lanes and cap at 12.']
		},
		{
			title: 'Turns Without Turns',
			items: ['Both players play live from opposite sides of the tablet.', 'Tap Ready, wait for the countdown, then roll when your cooldown is ready.', 'Roll five dice, hold any dice, reroll up to three times, then choose an action.']
		},
		{
			title: 'Actions',
			items: ['Die value controls troop count. Matching dice make those troops faster.', 'Straights build shields. Full House adds shield and sends troops in one lane.', 'Single dice can march or use a tactical effect like Freeze, Regen, Slow, Haste, Restore Shield, or Clear Lane.']
		}
	];

	let trimmedGameName = $derived(gameName.trim());
	let duplicateSavedGame = $derived(
		savedGames.find((savedGame) => savedGame.name.toLocaleLowerCase() === trimmedGameName.toLocaleLowerCase()) ?? null
	);
	let newSaveWouldExceedLimit = $derived(!duplicateSavedGame && savedGames.length >= MAX_FORTRESS_SAVED_GAMES);
	let canStartNewGame = $derived(trimmedGameName.length > 0 && !newSaveWouldExceedLimit);
	let winner = $derived(game.winnerId ? game.players.find((player) => player.id === game.winnerId) : null);

	onMount(() => {
		const loadedGames = loadFortressSavedGames();
		const playableGames = getPlayableSavedGames(loadedGames);
		const lastGameId = loadFortressLastGameId();
		const gameToLoad = playableGames.find((savedGame) => savedGame.id === lastGameId) ?? playableGames[0] ?? null;
		savedGames = playableGames;
		if (gameToLoad) applySavedGame(gameToLoad);
		persistenceReady = true;

		let lastTick = Date.now();
		const interval = setInterval(() => {
			const nextNow = Date.now();
			const elapsed = nextNow - lastTick;
			lastTick = nextNow;
			now = nextNow;
			tickFortressGame(game, elapsed, nextNow);
			if (game.phase === 'game-over' && !gameOverHandled) {
				gameOverHandled = true;
				clearRollTimers();
				persistIfReady();
			}
			if (game.setupComplete && nextNow - lastAutoPersistAt > 1500) {
				lastAutoPersistAt = nextNow;
				persistIfReady();
			}
		}, 100);

		return () => clearInterval(interval);
	});

	onDestroy(() => {
		clearRollTimers();
	});

	function startGame(): void {
		if (!canStartNewGame) return;

		clearRollTimers();
		const names = playerNames.map((name, index) => name.trim() || `Player ${index + 1}`);
		currentSaveId = duplicateSavedGame?.id ?? createFortressSaveId();
		gameName = trimmedGameName;
		game = startFortressGame(names, fortressHp, gameName);
		gameOverHandled = false;
		selectedOptions = { 1: null, 2: null };
		gameOverHandled = false;
		setupMode = 'new';
		persistIfReady();
	}

	function newGame(): void {
		clearRollTimers();
		game = createFortressGame();
		gameName = createDefaultFortressGameName();
		currentSaveId = createFortressSaveId();
		setupMode = 'new';
		confirmDeleteGameId = '';
		playerNames = ['Player 1', 'Player 2'];
		fortressHp = 30;
		visualDice = { 1: [1, 2, 3, 4, 5], 2: [1, 2, 3, 4, 5] };
		selectedOptions = { 1: null, 2: null };
		gameOverHandled = false;
	}

	function restartMatch(): void {
		clearRollTimers();
		const names = game.players.map((player) => player.name);
		game = startFortressGame(names, game.hpMax, gameName);
		visualDice = { 1: [1, 2, 3, 4, 5], 2: [1, 2, 3, 4, 5] };
		selectedOptions = { 1: null, 2: null };
		gameOverHandled = false;
		persistIfReady();
	}

	function toggleReady(playerId: FortressPlayerId): void {
		if (game.phase !== 'ready') return;
		const player = getPlayer(playerId);
		player.ready = !player.ready;
		game.log = [{ id: createUiId(), message: `${player.name} ${player.ready ? 'is ready.' : 'is not ready.'}` }, ...game.log].slice(0, 12);
		if (game.players.every((candidate) => candidate.ready)) startCountdown();
		persistIfReady();
	}

	function startCountdown(): void {
		game.phase = 'countdown';
		game.activeCountdown = 3;
		const countdown = setInterval(() => {
			if (game.phase !== 'countdown') {
				clearInterval(countdown);
				return;
			}
			game.activeCountdown -= 1;
			if (game.activeCountdown > 0) return;
			clearInterval(countdown);
			game.phase = 'playing';
			game.log = [{ id: createUiId(), message: 'The siege begins.' }, ...game.log].slice(0, 12);
			persistIfReady();
		}, 1000);
	}

	function togglePause(): void {
		if (game.phase === 'playing') {
			clearRollTimers();
			game.phase = 'paused';
		}
		else if (game.phase === 'paused') game.phase = 'playing';
		persistIfReady();
	}

	function handleRoll(playerId: FortressPlayerId): void {
		const player = getPlayer(playerId);
		if (!canPlayerRoll(player)) return;

		const heldDice = player.dice.filter((die) => die.held);
		const rollSlots = player.rollCount === 0 ? 5 : 5 - heldDice.length;
		if (rollSlots <= 0) return;

		const finalValues = rollFortressDice(rollSlots);
		const durations = createDiceScrambleDurations(rollSlots, 1000, 2000);
		const rollingSet = new Set(rollingPlayerIds);
		rollingSet.add(playerId);
		rollingPlayerIds = rollingSet;
		selectedOptions[playerId] = null;
		playDiceRollSound();

		if (player.rollCount === 0) {
			player.dice = Array.from({ length: 5 }, (_, index) => ({
				id: index + 1,
				value: visualDice[playerId][index],
				held: false
			}));
		}

		finalValues.forEach((finalValue, rollIndex) => {
			const dieIndex = player.rollCount === 0 ? rollIndex : player.dice.findIndex((die, index) => !die.held && player.dice.slice(0, index).filter((candidate) => !candidate.held).length === rollIndex);
			const key = `${playerId}-${dieIndex}`;
			rollIntervals.set(
				key,
				setInterval(() => {
					player.dice[dieIndex].value = rollFortressDice(1)[0];
					visualDice[playerId][dieIndex] = player.dice[dieIndex].value;
				}, 70)
			);
			rollTimers.set(
				key,
				setTimeout(() => finishRollingDie(playerId, dieIndex, finalValue), durations[rollIndex])
			);
		});
	}

	function finishRollingDie(playerId: FortressPlayerId, dieIndex: number, finalValue: FortressDiceValue): void {
		const key = `${playerId}-${dieIndex}`;
		clearRollTimer(key);
		const player = getPlayer(playerId);
		player.dice[dieIndex].value = finalValue;
		visualDice[playerId][dieIndex] = finalValue;

		const stillRolling = [...rollTimers.keys()].some((timerKey) => timerKey.startsWith(`${playerId}-`));
		if (stillRolling) return;

		const rollingSet = new Set(rollingPlayerIds);
		rollingSet.delete(playerId);
		rollingPlayerIds = rollingSet;
		player.rollCount += 1;
		player.lastRoll = player.dice.map((die) => die.value);

		persistIfReady();
	}

	function toggleHold(playerId: FortressPlayerId, dieId: number): void {
		const player = getPlayer(playerId);
		if (game.phase !== 'playing' || player.rollCount === 0 || rollingPlayerIds.has(playerId) || isPlayerFrozen(player, now)) return;
		const die = player.dice.find((candidate) => candidate.id === dieId);
		if (die) die.held = !die.held;

		const options = getOptions(player);
		if (!options.some((option) => option.id === selectedOptions[playerId])) {
			selectedOptions[playerId] = null;
		}
	}

	function commitAction(playerId: FortressPlayerId, option: FortressActionOption, laneId: FortressLaneId | null): void {
		if (rollingPlayerIds.has(playerId) || game.phase !== 'playing' || isPlayerFrozen(getPlayer(playerId), now)) return;
		commitFortressAction(game, playerId, option, laneId);
		selectedOptions[playerId] = null;
		persistIfReady();
	}

	function handleLaneTap(event: MouseEvent, laneId: FortressLaneId): void {
		if (game.phase !== 'playing') return;
		const target = event.currentTarget as HTMLElement;
		const bounds = target.getBoundingClientRect();
		const pendingPlayers = game.players
			.filter((player) => getSelectedOption(player.id, getOptions(player))?.target === 'selectedLane')
			.map((player) => player.id);
		const playerId: FortressPlayerId =
			pendingPlayers.length === 1 ? pendingPlayers[0] : event.clientY - bounds.top < bounds.height / 2 ? 2 : 1;
		const option = getSelectedOption(playerId, getOptions(getPlayer(playerId)));

		if (option?.target !== 'selectedLane') return;

		commitAction(playerId, option, laneId);
	}

	function renameGame(name: string): void {
		gameName = name;
	}

	function renameSetupPlayer(index: number, name: string): void {
		playerNames[index] = name;
	}

	function changeHp(value: number): void {
		fortressHp = Math.min(100, Math.max(10, Math.round(value || 30)));
	}

	function loadSavedGame(id: string): void {
		const savedGame = savedGames.find((record) => record.id === id);
		if (!savedGame) return;
		applySavedGame(savedGame);
		savedGames = getPlayableSavedGames(loadFortressSavedGames());
	}

	function requestDeleteSavedGame(id: string): void {
		confirmDeleteGameId = id;
	}

	function confirmDeleteSavedGame(id: string): void {
		savedGames = getPlayableSavedGames(deleteFortressSavedGame(id));
		confirmDeleteGameId = '';
		if (id === currentSaveId) newGame();
		if (!savedGames.length) setupMode = 'new';
	}

	function applySavedGame(savedGame: FortressSavedGameRecord): void {
		clearRollTimers();
		game = normalizeFortressGame(structuredClone(savedGame.snapshot.game));
		gameOverHandled = game.phase === 'game-over';
		gameName = savedGame.snapshot.gameName || savedGame.name;
		currentSaveId = savedGame.id;
		setupMode = 'new';
		visualDice = {
			1: game.players[0].dice.length ? game.players[0].dice.map((die) => die.value) : [1, 2, 3, 4, 5],
			2: game.players[1].dice.length ? game.players[1].dice.map((die) => die.value) : [1, 2, 3, 4, 5]
		};
		setFortressLastGameId(savedGame.id);
	}

	function persistIfReady(): void {
		if (!persistenceReady || !game.setupComplete) return;
		persistGame();
	}

	function persistGame(): void {
		savedGames = getPlayableSavedGames(
			saveFortressGameRecord(
				buildFortressSaveRecord(currentSaveId, gameName, $state.snapshot(game))
			)
		);
	}

	function getPlayableSavedGames(records: FortressSavedGameRecord[]): FortressSavedGameRecord[] {
		return records.filter((record) => record.snapshot.game.phase !== 'game-over');
	}

	function canPlayerRoll(player: FortressPlayer): boolean {
		return (
			game.phase === 'playing' &&
			!rollingPlayerIds.has(player.id) &&
			isCooldownReady(player, now) &&
			!isPlayerFrozen(player, now) &&
			player.rollCount < FORTRESS_MAX_ROLLS
		);
	}

	function getPlayer(playerId: FortressPlayerId): FortressPlayer {
		return game.players.find((player) => player.id === playerId) ?? game.players[0];
	}

	function getOptions(player: FortressPlayer): FortressActionOption[] {
		if (!player.dice.length || rollingPlayerIds.has(player.id)) return [];
		const selectedDice = player.dice.filter((die) => die.held);
		if (!selectedDice.length) return [];
		return getComboOptions(selectedDice.map((die) => die.value));
	}

	function getSelectedOption(playerId: FortressPlayerId, options: FortressActionOption[]): FortressActionOption | null {
		const selectedId = selectedOptions[playerId];
		return options.find((option) => option.id === selectedId) ?? null;
	}

	function hasPendingLaneAction(): boolean {
		return game.players.some((player) => {
			const option = getSelectedOption(player.id, getOptions(player));
			return option?.target === 'selectedLane';
		});
	}

	function hasPendingLaneActionFor(playerId: FortressPlayerId): boolean {
		const option = getSelectedOption(playerId, getOptions(getPlayer(playerId)));
		return option?.target === 'selectedLane';
	}

	function getCooldownLabel(player: FortressPlayer): string {
		if (game.phase !== 'playing') return '-';
		const remaining = Math.max(0, player.cooldownEndsAt - now);
		return remaining > 0 ? `${(remaining / 1000).toFixed(1)}s` : 'Ready';
	}

	function getBoostLabel(player: FortressPlayer): string {
		const frozen = Math.max(0, player.freezeEndsAt - now);
		if (frozen > 0) return `Frozen ${(frozen / 1000).toFixed(1)}s`;
		const regen = Math.max(0, player.regenEndsAt - now);
		return regen > 0 ? `Regen ${Math.ceil(regen / 1000)}s` : 'Normal';
	}

	function getShieldTotal(playerId: FortressPlayerId): number {
		return game.lanes.reduce((total, lane) => total + lane.shields[playerId], 0);
	}

	function getLaneShieldPercent(value: number): number {
		return Math.min(100, (Math.max(0, value) / FORTRESS_MAX_LANE_SHIELD) * 100);
	}

	function getVisibleDice(player: FortressPlayer): FortressDiceValue[] {
		if (player.dice.length) return player.dice.map((die) => die.value);
		return visualDice[player.id];
	}

	function getVisibleTroops(troops: number): number[] {
		return Array.from({ length: Math.max(1, Math.min(6, Math.ceil(troops))) }, (_, index) => index);
	}

	function getWinnerSummary(): string {
		return winner ? `${winner.name} broke the fortress.` : 'The siege is complete.';
	}

	function clearRollTimers(): void {
		for (const key of [...rollIntervals.keys(), ...rollTimers.keys()]) clearRollTimer(key);
		rollingPlayerIds = new Set();
	}

	function clearRollTimer(key: string): void {
		const interval = rollIntervals.get(key);
		const timer = rollTimers.get(key);
		if (interval) clearInterval(interval);
		if (timer) clearTimeout(timer);
		rollIntervals.delete(key);
		rollTimers.delete(key);
	}

	function createUiId(): string {
		return `ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	}
</script>

<svelte:head>
	<title>Fortress Dice</title>
	<meta name="description" content="A live two-player fortress battle built around five dice combos." />
</svelte:head>

<main class="min-h-screen bg-paper px-4 py-6 text-neutral-900 sm:px-6 lg:px-8">
	<div class="mx-auto flex max-w-7xl flex-col gap-5">
		<AppHeader
			title="Fortress Dice"
			activeGameId="fortress-dice"
			onNewGame={newGame}
			onHelp={() => (howToPlayOpen = true)}
			onPause={togglePause}
			pauseActive={game.phase === 'paused'}
			showPause={game.setupComplete && (game.phase === 'playing' || game.phase === 'paused')}
		/>

		{#if !game.setupComplete}
			<section class="grid min-h-[60vh] place-items-center">
				<div class="w-full max-w-5xl border border-line bg-white">
					<div class="grid grid-cols-2 border-b border-line">
						<button
							type="button"
							class={['cursor-pointer border-r border-line px-4 py-4 text-lg font-semibold', setupMode === 'new' ? 'bg-accent text-white' : 'bg-white text-neutral-800']}
							onclick={() => (setupMode = 'new')}
						>
							New Game
						</button>
						<button
							type="button"
							class={['px-4 py-4 text-lg font-semibold disabled:cursor-not-allowed disabled:text-neutral-300', savedGames.length ? 'cursor-pointer' : '', setupMode === 'load' ? 'bg-accent text-white' : 'bg-white text-neutral-800']}
							disabled={!savedGames.length}
							onclick={() => (setupMode = savedGames.length ? 'load' : 'new')}
						>
							Load Game
						</button>
					</div>

					{#if setupMode === 'new'}
						<div class="grid gap-5 p-5">
							<div class="text-center">
								<h2 class="text-2xl font-bold text-neutral-950">New Fortress Dice Game</h2>
								<p class="mt-2 text-neutral-600">Two players roll combos at the same time and push units through three lanes.</p>
							</div>

							<label class="grid gap-2">
								<span class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Game Name</span>
								<input
									class="border border-line bg-white px-3 py-3 text-lg outline-none focus:border-accent"
									value={gameName}
									oninput={(event) => renameGame((event.currentTarget as HTMLInputElement).value)}
								/>
							</label>

							<div class="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
								{#each playerNames as name, index}
									<label class="grid gap-2">
										<span class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Player {index + 1}</span>
										<input
											class="border border-line bg-white px-3 py-3 outline-none focus:border-accent"
											value={name}
											oninput={(event) => renameSetupPlayer(index, (event.currentTarget as HTMLInputElement).value)}
										/>
									</label>
								{/each}

								<label class="grid gap-2">
									<span class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Fortress HP</span>
									<input
										class="w-32 border border-line bg-white px-3 py-3 text-center outline-none focus:border-accent"
										type="number"
										min="10"
										max="100"
										value={fortressHp}
										oninput={(event) => changeHp(Number((event.currentTarget as HTMLInputElement).value))}
									/>
								</label>
							</div>

							{#if duplicateSavedGame}
								<p class="border border-accent bg-yellow-50 px-3 py-2 text-sm text-neutral-700">This name already exists. Starting will override that saved game.</p>
							{:else if newSaveWouldExceedLimit}
								<p class="border border-accent bg-yellow-50 px-3 py-2 text-sm text-neutral-700">Delete or overwrite a saved game first. Fortress Dice keeps up to six saved games.</p>
							{/if}

							<button
								type="button"
								class="cursor-pointer border border-neutral-950 bg-neutral-950 px-5 py-3 text-lg font-semibold text-white hover:bg-accent-dark disabled:cursor-not-allowed disabled:border-neutral-300 disabled:bg-neutral-200 disabled:text-neutral-500"
								disabled={!canStartNewGame}
								onclick={startGame}
							>
								{duplicateSavedGame ? 'Override Saved Game' : 'Start Game'}
							</button>
						</div>
					{:else}
						<div class="grid gap-5 p-5">
							<div class="text-center">
								<h2 class="text-2xl font-bold text-neutral-950">Load Fortress Dice Game</h2>
								<p class="mt-2 text-neutral-600">Choose a saved siege to continue.</p>
							</div>

							<div class="grid gap-2">
								{#each savedGames as savedGame}
									<div class="grid grid-cols-[1fr_auto] items-center border border-line bg-white">
										<button
											type="button"
											class="min-w-0 cursor-pointer px-4 py-3 text-left font-semibold hover:bg-neutral-50"
											onclick={() => loadSavedGame(savedGame.id)}
										>
											<span class="block truncate">{savedGame.name}</span>
										</button>
										{#if confirmDeleteGameId === savedGame.id}
											<button
												type="button"
												class="cursor-pointer border-l border-accent bg-accent px-4 py-3 font-semibold text-white hover:bg-accent-dark"
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
						</div>
					{/if}
				</div>
			</section>
		{:else}
			<section class="grid gap-4">
				<FortressPlayerStation
					player={game.players[1]}
					inverted
					options={getOptions(game.players[1])}
					selectedOption={getSelectedOption(2, getOptions(game.players[1]))}
					visibleDice={getVisibleDice(game.players[1])}
					rolling={rollingPlayerIds.has(2)}
					cooldownLabel={getCooldownLabel(game.players[1])}
					boostLabel={getBoostLabel(game.players[1])}
					shieldTotal={getShieldTotal(2)}
					canRoll={canPlayerRoll(game.players[1])}
					inputLocked={isPlayerFrozen(game.players[1], now)}
					phase={game.phase}
					onReady={() => toggleReady(2)}
					onRoll={() => handleRoll(2)}
					onHold={(dieId) => toggleHold(2, dieId)}
					onSelectOption={(optionId) => (selectedOptions[2] = optionId)}
					onCommit={(option) => commitAction(2, option, null)}
				/>

				<section class="grid gap-3">
					<div class="relative grid grid-cols-3 gap-3">
						<div class="pointer-events-none absolute left-1/2 top-[-0.55rem] h-0 w-0 -translate-x-1/2 border-x-[0.65rem] border-b-[0.95rem] border-x-transparent border-b-accent"></div>
						<div class="pointer-events-none absolute bottom-[-0.55rem] left-1/2 h-0 w-0 -translate-x-1/2 border-x-[0.65rem] border-t-[0.95rem] border-x-transparent border-t-accent"></div>
						{#if game.phase === 'countdown'}
							<div class="pointer-events-none absolute inset-0 z-20 grid place-items-center">
								<div class="border border-accent bg-yellow-50 px-10 py-5 text-4xl font-bold text-neutral-950">
									{game.activeCountdown}
								</div>
							</div>
						{/if}
						{#each game.lanes as lane}
							<div class="border border-line bg-white">
								<button
									type="button"
									class={[
										'relative block h-[48vh] min-h-[28rem] w-full overflow-hidden bg-white text-left',
										hasPendingLaneAction() ? 'cursor-pointer hover:bg-neutral-50' : 'cursor-default'
									]}
									aria-label={`${getLaneName(lane.id)} lane. Tap your half to place a selected lane action.`}
									onclick={(event) => handleLaneTap(event, lane.id)}
								>
									<div
										class="fortress-shield-bar absolute left-4 right-4 top-4 border border-line bg-white"
										aria-label={`Player 2 shield ${formatPower(lane.shields[2])}`}
										title={`P2 Shield ${formatPower(lane.shields[2])}`}
									>
										<div
											class="h-full bg-neutral-950"
											style={`width: ${getLaneShieldPercent(lane.shields[2])}%;`}
										></div>
									</div>
									<div
										class="fortress-shield-bar absolute bottom-4 left-4 right-4 border border-line bg-white"
										aria-label={`Player 1 shield ${formatPower(lane.shields[1])}`}
										title={`P1 Shield ${formatPower(lane.shields[1])}`}
									>
										<div
											class="h-full bg-accent"
											style={`width: ${getLaneShieldPercent(lane.shields[1])}%;`}
										></div>
									</div>
									{#if hasPendingLaneActionFor(2)}
										<div class="fortress-lane-target-pulse pointer-events-none absolute left-0 right-0 top-0 h-1/2"></div>
									{/if}
									{#if hasPendingLaneActionFor(1)}
										<div class="fortress-lane-target-pulse pointer-events-none absolute bottom-0 left-0 right-0 h-1/2"></div>
									{/if}
									<div class="absolute bottom-4 left-1/2 top-12 border-l border-dashed border-line"></div>

									{#each lane.units as unit}
										<div
											class={[
												'fortress-unit-formation absolute left-1/2 -translate-x-1/2',
												unit.ownerId === 1 ? 'text-accent' : 'text-neutral-950'
											]}
											style={`top: calc(${100 - unit.position}% - 2rem);`}
											aria-label={`${unit.ownerId === 1 ? game.players[0].name : game.players[1].name} marching ${formatPower(unit.troops)} troops`}
											title={`${formatPower(unit.troops)} troops`}
										>
											{#each getVisibleTroops(unit.troops) as troopIndex}
												<span
													class={[
														'fortress-troop',
														unit.ownerId === 2 ? 'fortress-troop-inverted' : ''
													]}
													style={`animation-delay: -${troopIndex * 0.13}s;`}
												>
													<span class="fortress-troop-head"></span>
													<span class="fortress-troop-body"></span>
													<span class="fortress-troop-leg fortress-troop-leg-left"></span>
													<span class="fortress-troop-leg fortress-troop-leg-right"></span>
												</span>
											{/each}
										</div>
									{/each}
								</button>
							</div>
						{/each}
					</div>
				</section>

				<FortressPlayerStation
					player={game.players[0]}
					options={getOptions(game.players[0])}
					selectedOption={getSelectedOption(1, getOptions(game.players[0]))}
					visibleDice={getVisibleDice(game.players[0])}
					rolling={rollingPlayerIds.has(1)}
					cooldownLabel={getCooldownLabel(game.players[0])}
					boostLabel={getBoostLabel(game.players[0])}
					shieldTotal={getShieldTotal(1)}
					canRoll={canPlayerRoll(game.players[0])}
					inputLocked={isPlayerFrozen(game.players[0], now)}
					phase={game.phase}
					onReady={() => toggleReady(1)}
					onRoll={() => handleRoll(1)}
					onHold={(dieId) => toggleHold(1, dieId)}
					onSelectOption={(optionId) => (selectedOptions[1] = optionId)}
					onCommit={(option) => commitAction(1, option, null)}
				/>
			</section>
		{/if}
	</div>

	{#if howToPlayOpen}
		<HowToPlayModal
			title="How to Play Fortress Dice"
			intro="Fortress Dice is a fast two-player lane battle. Send troops, build shields, and use quick tactical effects from selected dice."
			sections={howToPlaySections}
			onClose={() => (howToPlayOpen = false)}
		/>
	{/if}

	{#if game.phase === 'game-over'}
		<div class="fixed inset-0 z-50 grid place-items-center bg-black/30 px-4" role="presentation">
			<div
				class="grid w-full max-w-2xl gap-5 border border-line bg-white p-5 shadow-sm"
				role="dialog"
				aria-modal="true"
				aria-labelledby="fortress-results-title"
			>
				<div class="fortress-result-copy fortress-result-inverted border-b border-line pb-5">
					<h2 class="text-center text-2xl font-bold text-neutral-950">Fortress Results</h2>
					<p class="mt-2 text-center text-lg font-semibold text-accent">{getWinnerSummary()}</p>
					{@render ResultStats(game.players)}
				</div>

				<div class="fortress-result-copy">
					<h2 id="fortress-results-title" class="text-center text-2xl font-bold text-neutral-950">
						Fortress Results
					</h2>
					<p class="mt-2 text-center text-lg font-semibold text-accent">{getWinnerSummary()}</p>
					{@render ResultStats(game.players)}
				</div>

				<button
					type="button"
					class="cursor-pointer border border-neutral-950 bg-neutral-950 px-5 py-3 font-semibold text-white hover:bg-accent-dark"
					onclick={newGame}
				>
					New Game
				</button>
			</div>
		</div>
	{/if}

	{#if game.phase === 'paused'}
		<div class="fixed inset-0 z-50 grid place-items-center bg-black/30 px-4" role="presentation">
			<div
				class="w-full max-w-md border border-line bg-white p-5 shadow-sm"
				role="dialog"
				aria-modal="true"
				aria-labelledby="fortress-paused-title"
			>
				<h2 id="fortress-paused-title" class="text-center text-2xl font-bold text-neutral-950">Paused</h2>
				<p class="mt-2 text-center text-sm text-neutral-600">The siege is frozen until play resumes.</p>
				<div class="mt-5 grid grid-cols-2 gap-3">
					<button
						type="button"
						class="cursor-pointer border border-line bg-white px-4 py-3 font-semibold text-neutral-800 hover:border-accent hover:text-accent"
						onclick={restartMatch}
					>
						Restart
					</button>
					<button
						type="button"
						class="cursor-pointer border border-neutral-950 bg-neutral-950 px-4 py-3 font-semibold text-white hover:bg-accent-dark"
						onclick={togglePause}
					>
						Resume
					</button>
				</div>
			</div>
		</div>
	{/if}
</main>

{#snippet ResultStats(players: [FortressPlayer, FortressPlayer])}
	<div class="mt-4 grid gap-3 sm:grid-cols-2">
		{#each players as player}
			<div class="border border-line bg-neutral-50 p-4">
				<h3 class="font-bold text-neutral-950">{player.name}</h3>
				<div class="mt-3 grid gap-2 text-sm text-neutral-700">
					<p class="grid grid-cols-[1fr_auto] gap-3">
						<span>Damage dealt</span>
						<strong>{formatPower(player.damageDealt)}</strong>
					</p>
					<p class="grid grid-cols-[1fr_auto] gap-3">
						<span>Damage shielded</span>
						<strong>{formatPower(player.damageShielded)}</strong>
					</p>
					<p class="grid grid-cols-[1fr_auto] gap-3">
						<span>Fortress repaired</span>
						<strong>{formatPower(player.damageRepaired)}</strong>
					</p>
					<p class="grid grid-cols-[1fr_auto] gap-3">
						<span>Final HP</span>
						<strong>{formatPower(player.hp)}</strong>
					</p>
				</div>
			</div>
		{/each}
	</div>
{/snippet}

<style>
	.fortress-result-inverted {
		transform: rotate(180deg);
	}

	.fortress-lane-target-pulse {
		animation: fortress-lane-target-pulse 1.8s ease-in-out infinite;
		background: rgb(0 0 0 / 0.04);
	}

	.fortress-shield-bar {
		height: 0.7rem;
	}

	.fortress-unit-formation {
		display: grid;
		gap: 0.1rem 0.16rem;
		grid-template-columns: repeat(3, 0.9rem);
		justify-content: center;
		min-height: 3rem;
		pointer-events: none;
		width: 3.4rem;
		z-index: 5;
	}

	.fortress-troop {
		animation: fortress-troop-march 0.56s steps(2, end) infinite;
		color: currentColor;
		display: block;
		height: 1.36rem;
		position: relative;
		--troop-rotation: 0deg;
		width: 0.9rem;
	}

	.fortress-troop-inverted {
		--troop-rotation: 180deg;
	}

	.fortress-troop-head,
	.fortress-troop-body,
	.fortress-troop-leg {
		background: currentColor;
		display: block;
		left: 50%;
		position: absolute;
		transform: translateX(-50%);
	}

	.fortress-troop-head {
		height: 0.28rem;
		top: 0;
		width: 0.28rem;
	}

	.fortress-troop-body {
		height: 0.52rem;
		top: 0.36rem;
		width: 0.42rem;
	}

	.fortress-troop-leg {
		height: 0.42rem;
		top: 0.9rem;
		transform-origin: top center;
		width: 0.16rem;
	}

	.fortress-troop-leg-left {
		margin-left: -0.12rem;
		transform: translateX(-50%) rotate(14deg);
	}

	.fortress-troop-leg-right {
		margin-left: 0.12rem;
		transform: translateX(-50%) rotate(-14deg);
	}

	@keyframes fortress-lane-target-pulse {
		0%,
		100% {
			opacity: 0.2;
		}

		50% {
			opacity: 0.75;
		}
	}

	@keyframes fortress-troop-march {
		0% {
			transform: rotate(var(--troop-rotation)) translateY(-0.06rem);
		}

		50% {
			transform: rotate(var(--troop-rotation)) translateY(0.06rem);
		}

		100% {
			transform: rotate(var(--troop-rotation)) translateY(-0.06rem);
		}
	}
</style>
