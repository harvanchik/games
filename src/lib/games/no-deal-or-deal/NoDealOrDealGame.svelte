<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import AppHeader from '$lib/components/shared/AppHeader.svelte';
	import HowToPlayModal from '$lib/components/shared/HowToPlayModal.svelte';
	import BankerPanel from './BankerPanel.svelte';
	import CaseGrid from './CaseGrid.svelte';
	import FinalResults from './FinalResults.svelte';
	import GameLog from './GameLog.svelte';
	import GameSettings from './GameSettings.svelte';
	import OfferHistory from './OfferHistory.svelte';
	import {
		acceptDeal,
		chooseKeepOrSwap,
		createNewGameState,
		finishBankerCall,
		formatMoney,
		normalizeGameState,
		openCase,
		rejectDeal,
		selectPlayerCase
	} from './noDealOrDealGameLogic';
	import {
		buildNoDealSaveRecord,
		createDefaultNoDealGameName,
		createNoDealSaveId,
		deleteNoDealSavedGame,
		loadNoDealLastGameId,
		loadNoDealSavedGames,
		MAX_NO_DEAL_SAVED_GAMES,
		saveNoDealGameRecord,
		setNoDealLastGameId
	} from './noDealOrDealSave';
	import type {
		BankerPersonality,
		CaseNumber,
		DramaticPauseSetting,
		NoDealOrDealGameState,
		NoDealOrDealSavedGameRecord
	} from './noDealOrDealTypes';

	let game = $state<NoDealOrDealGameState>(createNewGameState());
	let setupVisible = $state(true);
	let gameName = $state(createDefaultNoDealGameName());
	let currentSaveId = $state(createNoDealSaveId());
	let savedGames = $state<NoDealOrDealSavedGameRecord[]>([]);
	let setupMode = $state<'new' | 'load'>('new');
	let confirmDeleteGameId = $state('');
	let persistenceReady = $state(false);
	let howToPlayOpen = $state(false);
	let setupPause = $state<DramaticPauseSetting>('normal');
	let setupPersonality = $state<BankerPersonality>('balanced');
	let bankerSequenceActive = $state(false);
	let pauseTimer: ReturnType<typeof setTimeout> | null = null;

	const howToPlaySections = [
		{
			title: 'Goal',
			items: [
				'Choose one case to keep, then open other cases to reveal and remove prize amounts.',
				'After each round of opened cases, the Banker makes an offer.',
				'Take a Deal to lock in that offer, or say No Deal and keep going.'
			]
		},
		{
			title: 'Rounds',
			items: [
				'Open 6 cases, then 5, 4, 3, 2, then 1 at a time.',
				'When only your case and one other case remain, choose whether to keep or swap.',
				'The value in the final selected case is your prize if you never take a deal.'
			]
		},
		{
			title: 'Offers',
			items: [
				'Offers react to the remaining board, risk, recent opened cases, and Banker personality.',
				'Open Offer Details to see expected value and why the Banker moved.',
				'Use Skip or Skip all pauses if you want a faster game.'
			]
		}
	];

	let trimmedGameName = $derived(gameName.trim());
	let hasSavedGames = $derived(savedGames.length > 0);
	let duplicateSavedGame = $derived(
		savedGames.find(
			(savedGame) => savedGame.name.toLocaleLowerCase() === trimmedGameName.toLocaleLowerCase()
		) ?? null
	);
	let newSaveWouldExceedLimit = $derived(!duplicateSavedGame && savedGames.length >= MAX_NO_DEAL_SAVED_GAMES);
	let canStartNewGame = $derived(trimmedGameName.length > 0 && !newSaveWouldExceedLimit);
	let inputLocked = $derived(game.pauseRunning || game.phase === 'banker-calling');
	let remainingCases = $derived(game.cases.filter((caseState) => caseState.status !== 'opened').length);
	let openedCases = $derived(game.cases.filter((caseState) => caseState.status === 'opened').length);
	let playerCase = $derived(
		game.playerCaseNumber
			? (game.cases.find((caseState) => caseState.number === game.playerCaseNumber) ?? null)
			: null
	);
	let otherFinalCase = $derived(
		game.phase === 'final-choice'
			? (game.cases.find((caseState) => caseState.status === 'available') ?? null)
			: null
	);

	$effect(() => {
		if (!persistenceReady || setupVisible) return;
		persistGame();
	});

	onMount(() => {
		const loadedGames = loadNoDealSavedGames();
		const lastGameId = loadNoDealLastGameId();
		const gameToLoad =
			loadedGames.find((savedGame) => savedGame.id === lastGameId) ?? loadedGames[0] ?? null;

		savedGames = loadedGames;

		if (gameToLoad) {
			applySavedGame(gameToLoad);
		}

		persistenceReady = true;
	});

	onDestroy(() => {
		clearPauseTimer();
	});

	function startGame(): void {
		if (!canStartNewGame) return;

		clearPauseTimer();
		currentSaveId = duplicateSavedGame?.id ?? createNoDealSaveId();
		gameName = trimmedGameName;
		game = createNewGameState(setupPause, setupPersonality);
		setupVisible = false;
		setupMode = 'new';
		confirmDeleteGameId = '';
		persistIfReady();
	}

	function newGame(): void {
		clearPauseTimer();
		game = createNewGameState(setupPause, setupPersonality);
		gameName = createDefaultNoDealGameName();
		currentSaveId = createNoDealSaveId();
		setupVisible = true;
		setupMode = 'new';
		confirmDeleteGameId = '';
		howToPlayOpen = false;
	}

	function chooseCase(caseNumber: CaseNumber): void {
		if (inputLocked || game.gameOver) return;

		const changed =
			game.phase === 'choosing-player-case'
				? selectPlayerCase(game, caseNumber)
				: openCase(game, caseNumber);

		if (!changed) return;
		if (game.phase === 'banker-calling' && game.pauseRunning) startBankerSequence();
		persistIfReady();
	}

	function takeDeal(): void {
		if (inputLocked || !acceptDeal(game)) return;
		persistIfReady();
	}

	function sayNoDeal(): void {
		if (inputLocked || !rejectDeal(game)) return;
		persistIfReady();
	}

	function makeFinalChoice(choice: 'keep' | 'swap'): void {
		if (inputLocked || !chooseKeepOrSwap(game, choice)) return;
		persistIfReady();
	}

	function updatePause(setting: DramaticPauseSetting): void {
		game.dramaticPause = setting;
		setupPause = setting;
		persistIfReady();
	}

	function updatePersonality(personality: BankerPersonality): void {
		game.bankerPersonality = personality;
		setupPersonality = personality;
		persistIfReady();
	}

	function updateSkipAll(skipAll: boolean): void {
		game.skipAllPauses = skipAll;
		if (skipAll && game.pauseRunning) skipBankerSequence();
		persistIfReady();
	}

	function startBankerSequence(): void {
		const duration = getPauseDuration();
		if (duration === 0) {
			completeBankerSequence();
			return;
		}

		clearPauseTimer();
		bankerSequenceActive = true;
		game.pauseRunning = true;
		game.pauseMessage = 'The Banker is calling...';
		pauseTimer = setTimeout(() => {
			game.pauseMessage = 'The Banker is calculating...';
			persistIfReady();
			clearPauseTimer();
			pauseTimer = setTimeout(completeBankerSequence, duration);
		}, duration);
	}

	function skipBankerSequence(): void {
		if (!game.pauseRunning) return;
		completeBankerSequence();
	}

	function completeBankerSequence(): void {
		clearPauseTimer();
		bankerSequenceActive = false;
		finishBankerCall(game);
		persistIfReady();
	}

	function clearPauseTimer(): void {
		if (pauseTimer) {
			clearTimeout(pauseTimer);
			pauseTimer = null;
		}

		bankerSequenceActive = false;
	}

	function getPauseDuration(): number {
		if (game.skipAllPauses || game.dramaticPause === 'off') return 0;
		if (game.dramaticPause === 'short') return 400;
		if (game.dramaticPause === 'long') return 1200;
		return 750;
	}

	function renameGame(name: string): void {
		gameName = name;
	}

	function changeSetupMode(nextMode: 'new' | 'load'): void {
		setupMode = savedGames.length > 0 || nextMode === 'new' ? nextMode : 'new';
		confirmDeleteGameId = '';
	}

	function loadSavedGame(id: string): void {
		const savedGame =
			loadNoDealSavedGames().find((record) => record.id === id) ??
			savedGames.find((record) => record.id === id);
		if (!savedGame) return;

		applySavedGame(savedGame);
		savedGames = loadNoDealSavedGames();
	}

	function requestDeleteSavedGame(id: string): void {
		confirmDeleteGameId = id;
	}

	function confirmDeleteSavedGame(id: string): void {
		savedGames = deleteNoDealSavedGame(id);
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

	function applySavedGame(savedGame: NoDealOrDealSavedGameRecord): void {
		clearPauseTimer();
		game = normalizeGameState(structuredClone(savedGame.snapshot.game));
		gameName = savedGame.snapshot.gameName || savedGame.name;
		currentSaveId = savedGame.id;
		setupPause = game.dramaticPause;
		setupPersonality = game.bankerPersonality;
		setupVisible = false;
		setupMode = 'new';
		confirmDeleteGameId = '';
		setNoDealLastGameId(savedGame.id);
		if (game.phase === 'banker-calling' && game.pauseRunning) startBankerSequence();
	}

	function persistIfReady(): void {
		if (!persistenceReady || setupVisible) return;
		persistGame();
	}

	function persistGame(): void {
		savedGames = saveNoDealGameRecord(
			buildNoDealSaveRecord(currentSaveId, gameName, $state.snapshot(game))
		);
	}
</script>

<svelte:head>
	<title>No Deal or Deal</title>
	<meta name="description" content="A clean single-player case-opening offer game." />
</svelte:head>

<main class="min-h-screen bg-paper px-4 py-6 text-neutral-900 sm:px-6 lg:px-8">
	<div class="mx-auto flex max-w-7xl flex-col gap-5">
		<AppHeader
			title="No Deal or Deal"
			activeGameId="no-deal-or-deal"
			onNewGame={newGame}
			onHelp={() => (howToPlayOpen = true)}
		/>

		{#if setupVisible}
			<section class="grid min-h-[55vh] place-items-center">
				<div class="grid w-full max-w-3xl gap-0 border border-line bg-white">
					<div class="grid grid-cols-2 border-b border-line">
						<button
							type="button"
							class={[
								'cursor-pointer border-r border-line px-4 py-3 font-semibold',
								setupMode === 'new'
									? 'bg-accent text-white'
									: 'bg-white text-neutral-700 hover:bg-neutral-100'
							]}
							onclick={() => changeSetupMode('new')}
						>
							New Game
						</button>
						<button
							type="button"
							class={[
								'px-4 py-3 font-semibold disabled:cursor-not-allowed disabled:text-neutral-300',
								hasSavedGames ? 'cursor-pointer' : '',
								setupMode === 'load'
									? 'bg-accent text-white'
									: 'bg-white text-neutral-700 hover:bg-neutral-100'
							]}
							disabled={!hasSavedGames}
							onclick={() => changeSetupMode('load')}
						>
							Load Game
						</button>
					</div>

					{#if setupMode === 'new'}
						<div class="grid gap-5 p-5">
							<div class="text-center">
								<h2 class="text-xl font-bold text-neutral-950">New No Deal or Deal Game</h2>
								<p class="mt-1 text-sm text-neutral-600">
									Choose a case, open the board, and decide when the offer is good enough.
								</p>
							</div>

							<label class="grid gap-1">
								<span class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Game Name</span>
								<input
									class="w-full border border-line bg-white px-3 py-2 text-neutral-950 outline-none focus:border-accent"
									type="text"
									value={gameName}
									oninput={(event) => renameGame((event.currentTarget as HTMLInputElement).value)}
								/>
							</label>

							<div class="grid gap-4 sm:grid-cols-2">
								<label class="grid gap-1">
									<span class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Dramatic Pauses</span>
									<select
										class="cursor-pointer border border-line bg-white px-3 py-2"
										value={setupPause}
										onchange={(event) =>
											(setupPause = (event.currentTarget as HTMLSelectElement).value as DramaticPauseSetting)}
									>
										<option value="off">Off</option>
										<option value="short">Short</option>
										<option value="normal">Normal</option>
										<option value="long">Long</option>
									</select>
								</label>
								<label class="grid gap-1">
									<span class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Banker</span>
									<select
										class="cursor-pointer border border-line bg-white px-3 py-2"
										value={setupPersonality}
										onchange={(event) =>
											(setupPersonality = (event.currentTarget as HTMLSelectElement).value as BankerPersonality)}
									>
										<option value="conservative">Conservative Banker</option>
										<option value="balanced">Balanced Banker</option>
										<option value="generous">Generous Banker</option>
										<option value="dramatic">Dramatic Banker</option>
									</select>
								</label>
							</div>

							{#if duplicateSavedGame}
								<p class="border border-accent bg-yellow-50 px-3 py-2 text-sm text-neutral-700">
									This name already exists. Starting will override that saved game.
								</p>
							{:else if newSaveWouldExceedLimit}
								<p class="border border-accent bg-yellow-50 px-3 py-2 text-sm text-neutral-700">
									You have {MAX_NO_DEAL_SAVED_GAMES} saved games. Delete one or enter an existing game name to override it.
								</p>
							{/if}

							<div class="flex justify-center">
								<button
									type="button"
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
								<p class="mt-1 text-sm text-neutral-600">Choose a saved game to continue.</p>
							</div>

							<div class="grid gap-2">
								{#each savedGames as savedGame}
									<div
										class={[
											'grid grid-cols-[1fr_auto] items-center border border-line bg-white',
											savedGame.id === currentSaveId ? 'border-accent bg-yellow-50' : ''
										]}
									>
										<button
											type="button"
											class="min-w-0 cursor-pointer px-3 py-3 text-left font-semibold hover:bg-neutral-100"
											onclick={() => loadSavedGame(savedGame.id)}
										>
											<span class="block truncate">{savedGame.name}</span>
										</button>

										{#if confirmDeleteGameId === savedGame.id}
											<button
												type="button"
												class="cursor-pointer border-l border-accent bg-accent px-3 py-3 text-sm font-semibold text-white hover:bg-accent-dark"
												onclick={() => confirmDeleteSavedGame(savedGame.id)}
											>
												Confirm
											</button>
										{:else}
											<button
												type="button"
												class="cursor-pointer border-l border-line px-3 py-3 text-lg font-bold text-neutral-500 hover:text-accent"
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
			<section class="grid gap-5 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
				<div class="flex min-w-0 flex-col gap-5">
					<section class="border border-line bg-white p-4">
						<p class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Game Status</p>
						<h2 class="mt-1 text-xl font-bold text-neutral-950">
							{game.phase === 'choosing-player-case'
								? 'Choose Your Case'
								: game.phase === 'final-choice'
									? 'Final Choice'
									: game.phase === 'game-over'
										? 'Game Complete'
										: `Round ${game.currentRound}`}
						</h2>
						<p class="mt-2 text-sm text-neutral-700">{game.statusMessage}</p>
						<div class="mt-4 grid gap-2 text-sm">
							<p class="flex justify-between border border-line px-3 py-2">
								<span>Your Case</span>
								<strong>{game.playerCaseNumber ? `#${game.playerCaseNumber}` : '-'}</strong>
							</p>
							<p class="flex justify-between border border-line px-3 py-2">
								<span>Cases Left to Open</span>
								<strong>{Math.max(0, game.casesToOpenThisRound - game.casesOpenedThisRound)}</strong>
							</p>
							<p class="flex justify-between border border-line px-3 py-2">
								<span>Cases Remaining</span>
								<strong>{remainingCases}</strong>
							</p>
							<p class="flex justify-between border border-line px-3 py-2">
								<span>Opened</span>
								<strong>{openedCases}</strong>
							</p>
							{#if game.currentOffer}
								<p class="flex justify-between border border-accent bg-yellow-50 px-3 py-2">
									<span>Current Offer</span>
									<strong>{formatMoney(game.currentOffer.offerAmount)}</strong>
								</p>
							{/if}
						</div>
					</section>

					<section class="border border-line bg-white p-4">
						<h2 class="text-xl font-bold text-neutral-950">Your Case</h2>
						<div class="mt-4 border border-accent bg-yellow-50 p-4 text-center">
							<p class="text-sm font-semibold uppercase tracking-wide text-neutral-500">Selected Case</p>
							<p class="mt-1 text-3xl font-bold">
								{playerCase ? `#${playerCase.number}` : '-'}
							</p>
							<p class="mt-1 text-sm text-neutral-600">
								{game.gameOver && playerCase ? formatMoney(playerCase.amount) : 'Hidden value'}
							</p>
						</div>
					</section>

					<GameSettings
						{game}
						disabled={game.gameOver}
						onPauseChange={updatePause}
						onPersonalityChange={updatePersonality}
						onSkipAllChange={updateSkipAll}
					/>
				</div>

				<div class="flex min-w-0 flex-col gap-5">
					<FinalResults {game} />
					<BankerPanel {game} onDeal={takeDeal} onNoDeal={sayNoDeal} onSkip={skipBankerSequence} />

					{#if game.phase === 'final-choice' && otherFinalCase}
						<section class="border border-accent bg-white p-4">
							<h2 class="text-xl font-bold text-neutral-950">Final Decision</h2>
							<p class="mt-1 text-sm text-neutral-700">
								Only your case and case #{otherFinalCase.number} remain.
							</p>
							<div class="mt-4 grid grid-cols-2 gap-3">
								<button
									type="button"
									class="cursor-pointer border border-neutral-950 bg-neutral-950 px-4 py-3 font-semibold text-white hover:bg-accent-dark"
									onclick={() => makeFinalChoice('keep')}
								>
									Keep My Case
								</button>
								<button
									type="button"
									class="cursor-pointer border border-accent bg-white px-4 py-3 font-semibold text-accent hover:bg-yellow-50"
									onclick={() => makeFinalChoice('swap')}
								>
									Swap Cases
								</button>
							</div>
						</section>
					{/if}

					<CaseGrid
						{game}
						disabled={inputLocked ||
							game.gameOver ||
							(game.phase !== 'choosing-player-case' && game.phase !== 'opening-cases')}
						onChooseCase={chooseCase}
					/>

					<OfferHistory {game} />
					<GameLog {game} />
				</div>
			</section>
		{/if}
	</div>

	{#if howToPlayOpen}
		<HowToPlayModal
			title="How to Play No Deal or Deal"
			intro="No Deal or Deal is a case-opening offer game. Pick your case, reveal the board, and decide whether the Banker offer beats your hidden case."
			sections={howToPlaySections}
			onClose={() => (howToPlayOpen = false)}
		/>
	{/if}
</main>
