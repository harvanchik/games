import { generateBankerOffer } from './bankerEngine';
import type {
	BankerOffer,
	BankerPersonality,
	CaseNumber,
	CaseState,
	DramaticPauseSetting,
	FinalChoice,
	NoDealOrDealGameState,
	PrizeAmount
} from './noDealOrDealTypes';

export const PRIZE_AMOUNTS: PrizeAmount[] = [
	0.01,
	1,
	5,
	10,
	25,
	50,
	75,
	100,
	200,
	300,
	400,
	500,
	750,
	1_000,
	5_000,
	10_000,
	25_000,
	50_000,
	75_000,
	100_000,
	200_000,
	300_000,
	400_000,
	500_000,
	750_000,
	1_000_000
];

const CASE_NUMBERS = Array.from({ length: 26 }, (_, index) => (index + 1) as CaseNumber);

export function createNewGameState(
	dramaticPause: DramaticPauseSetting = 'normal',
	bankerPersonality: BankerPersonality = 'balanced'
): NoDealOrDealGameState {
	return {
		cases: assignPrizeAmountsToCases(),
		playerCaseNumber: null,
		currentRound: 1,
		casesToOpenThisRound: getCasesToOpenForRound(1),
		casesOpenedThisRound: 0,
		phase: 'choosing-player-case',
		statusMessage: 'Choose your case.',
		currentOffer: null,
		offerHistory: [],
		gameLog: [],
		dramaticPause,
		bankerPersonality,
		skipAllPauses: false,
		pauseRunning: false,
		pauseMessage: '',
		recentOpenedCaseNumber: null,
		recentRemovedAmount: null,
		lastOpenedValues: [],
		finalResult: null,
		gameOver: false
	};
}

export function assignPrizeAmountsToCases(): CaseState[] {
	const shuffledAmounts = shuffle(PRIZE_AMOUNTS);
	return CASE_NUMBERS.map((number, index) => ({
		number,
		amount: shuffledAmounts[index],
		status: 'available'
	}));
}

export function selectPlayerCase(game: NoDealOrDealGameState, caseNumber: CaseNumber): boolean {
	if (game.phase !== 'choosing-player-case' || game.playerCaseNumber !== null) return false;

	const selectedCase = findCase(game, caseNumber);
	if (!selectedCase || selectedCase.status !== 'available') return false;

	selectedCase.status = 'player';
	game.playerCaseNumber = caseNumber;
	game.phase = 'opening-cases';
	game.statusMessage = `Your case is ${caseNumber}. Open ${game.casesToOpenThisRound} cases.`;
	addLog(game, `You chose case ${caseNumber} as your case.`, undefined, caseNumber);
	return true;
}

export function openCase(game: NoDealOrDealGameState, caseNumber: CaseNumber): boolean {
	if (game.phase !== 'opening-cases') return false;

	const selectedCase = findCase(game, caseNumber);
	if (!selectedCase || selectedCase.status !== 'available') return false;

	selectedCase.status = 'opened';
	game.casesOpenedThisRound += 1;
	game.recentOpenedCaseNumber = caseNumber;
	game.recentRemovedAmount = selectedCase.amount;
	game.lastOpenedValues = [...game.lastOpenedValues, selectedCase.amount];
	addLog(game, `Opened case ${caseNumber}: ${formatMoney(selectedCase.amount)}.`, selectedCase.amount, caseNumber);

	const otherCasesRemaining = getAvailableNonPlayerCases(game).length;
	if (otherCasesRemaining === 1) {
		game.phase = 'final-choice';
		game.statusMessage = 'Final decision: keep your case or swap.';
		game.casesToOpenThisRound = 0;
		return true;
	}

	const casesLeft = game.casesToOpenThisRound - game.casesOpenedThisRound;
	if (casesLeft > 0) {
		game.statusMessage = `Open ${casesLeft} more ${casesLeft === 1 ? 'case' : 'cases'}.`;
		return true;
	}

	startBankerCall(game);
	return true;
}

export function startBankerCall(game: NoDealOrDealGameState): void {
	game.phase = 'banker-calling';
	game.pauseRunning = true;
	game.pauseMessage = 'The Banker is calling...';
	game.statusMessage = 'The Banker is calling...';
}

export function finishBankerCall(game: NoDealOrDealGameState): void {
	const offer = createBankerOffer(game);
	game.currentOffer = offer;
	game.offerHistory = [{ ...offer, decision: 'Pending' }, ...game.offerHistory];
	game.phase = 'banker-offer';
	game.pauseRunning = false;
	game.pauseMessage = '';
	game.statusMessage = 'The offer is in. Deal or No Deal?';
	addLog(game, `Banker offer: ${formatMoney(offer.offerAmount)}.`);
}

export function acceptDeal(game: NoDealOrDealGameState): boolean {
	if (game.phase !== 'banker-offer' || !game.currentOffer || !game.playerCaseNumber) return false;

	updatePendingOfferDecision(game, 'Deal');
	const playerCase = findCase(game, game.playerCaseNumber);
	if (!playerCase) return false;

	game.finalResult = {
		finalWinnings: game.currentOffer.offerAmount,
		playerCaseValue: playerCase.amount,
		acceptedDealAmount: game.currentOffer.offerAmount,
		finalChoice: 'deal',
		selectedCaseNumber: game.playerCaseNumber,
		otherCaseNumber: getAvailableNonPlayerCases(game)[0]?.number ?? null,
		otherCaseValue: getAvailableNonPlayerCases(game)[0]?.amount ?? null,
		differenceFromCase: game.currentOffer.offerAmount - playerCase.amount,
		goodDeal: game.currentOffer.offerAmount >= playerCase.amount
	};
	game.phase = 'game-over';
	game.gameOver = true;
	game.statusMessage = 'Deal accepted. Final result revealed.';
	addLog(game, `Deal accepted for ${formatMoney(game.currentOffer.offerAmount)}.`);
	addLog(game, `Your case held ${formatMoney(playerCase.amount)}.`, playerCase.amount, game.playerCaseNumber);
	return true;
}

export function rejectDeal(game: NoDealOrDealGameState): boolean {
	if (game.phase !== 'banker-offer' || !game.currentOffer) return false;

	updatePendingOfferDecision(game, 'No Deal');
	addLog(game, `No Deal: rejected ${formatMoney(game.currentOffer.offerAmount)}.`);
	game.currentOffer = null;
	game.currentRound += 1;
	game.casesToOpenThisRound = Math.min(
		getCasesToOpenForRound(game.currentRound),
		Math.max(0, getAvailableNonPlayerCases(game).length - 1)
	);
	game.casesOpenedThisRound = 0;
	game.lastOpenedValues = [];
	game.recentOpenedCaseNumber = null;
	game.recentRemovedAmount = null;

	if (game.casesToOpenThisRound <= 0) {
		game.phase = 'final-choice';
		game.statusMessage = 'Final decision: keep your case or swap.';
		return true;
	}

	game.phase = 'opening-cases';
	game.statusMessage = `Open ${game.casesToOpenThisRound} ${game.casesToOpenThisRound === 1 ? 'case' : 'cases'}.`;
	return true;
}

export function chooseKeepOrSwap(game: NoDealOrDealGameState, choice: FinalChoice): boolean {
	if (game.phase !== 'final-choice' || !game.playerCaseNumber) return false;

	const playerCase = findCase(game, game.playerCaseNumber);
	const otherCase = getAvailableNonPlayerCases(game)[0] ?? null;
	if (!playerCase || !otherCase) return false;

	const selectedCase = choice === 'keep' ? playerCase : otherCase;
	const otherFinalCase = choice === 'keep' ? otherCase : playerCase;
	game.finalResult = {
		finalWinnings: selectedCase.amount,
		playerCaseValue: playerCase.amount,
		acceptedDealAmount: null,
		finalChoice: choice,
		selectedCaseNumber: selectedCase.number,
		otherCaseNumber: otherFinalCase.number,
		otherCaseValue: otherFinalCase.amount,
		differenceFromCase: 0,
		goodDeal: null
	};
	game.phase = 'game-over';
	game.gameOver = true;
	game.statusMessage = `Final winnings: ${formatMoney(selectedCase.amount)}.`;
	addLog(game, `Final choice: ${choice === 'keep' ? 'kept your case' : 'swapped cases'}.`);
	addLog(game, `Final winnings: ${formatMoney(selectedCase.amount)}.`, selectedCase.amount, selectedCase.number);
	return true;
}

export function getCasesToOpenForRound(roundNumber: number): number {
	if (roundNumber === 1) return 6;
	if (roundNumber === 2) return 5;
	if (roundNumber === 3) return 4;
	if (roundNumber === 4) return 3;
	if (roundNumber === 5) return 2;
	return 1;
}

export function calculateRemainingPrizeAmounts(game: NoDealOrDealGameState): PrizeAmount[] {
	return game.cases.filter((caseState) => caseState.status !== 'opened').map((caseState) => caseState.amount);
}

export function createBankerOffer(game: NoDealOrDealGameState) {
	const remainingPrizeAmounts = calculateRemainingPrizeAmounts(game);
	const maxRemaining = Math.max(...remainingPrizeAmounts);
	const casesRemaining = remainingPrizeAmounts.length;

	return generateBankerOffer({
		remainingPrizeAmounts,
		roundNumber: game.currentRound,
		casesRemaining,
		previousOffers: [...game.offerHistory].reverse(),
		lastOpenedValues: game.lastOpenedValues,
		highestPrizeStillInPlay: maxRemaining === 1_000_000,
		topPrizeCountRemaining: remainingPrizeAmounts.filter((amount) => amount >= 400_000).length,
		gameStage: getGameStage(casesRemaining),
		personality: game.bankerPersonality
	});
}

export function calculateFinalStats(game: NoDealOrDealGameState): {
	highestOffer: BankerOffer | null;
	lowestOffer: BankerOffer | null;
	bestOffer: BankerOffer | null;
	finalExpectedValue: number;
} {
	const offers = game.offerHistory;
	const sortedByAmount = [...offers].sort((a, b) => a.offerAmount - b.offerAmount);

	return {
		highestOffer: sortedByAmount.at(-1) ?? null,
		lowestOffer: sortedByAmount[0] ?? null,
		bestOffer: sortedByAmount.at(-1) ?? null,
		finalExpectedValue: offers[0]?.expectedValue ?? average(calculateRemainingPrizeAmounts(game))
	};
}

export function formatMoney(amount: PrizeAmount): string {
	if (amount === 0.01) return '$0.01';
	return amount.toLocaleString('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	});
}

export function normalizeGameState(savedGame: NoDealOrDealGameState): NoDealOrDealGameState {
	const baseline = createNewGameState(savedGame.dramaticPause, savedGame.bankerPersonality);
	const normalized = {
		...baseline,
		...savedGame,
		pauseRunning: false,
		pauseMessage: '',
		cases: normalizeCases(savedGame.cases)
	};

	if (!normalized.playerCaseNumber && normalized.phase !== 'choosing-player-case') {
		return createNewGameState();
	}

	return normalized;
}

function normalizeCases(cases: CaseState[]): CaseState[] {
	if (!Array.isArray(cases) || cases.length !== 26) return assignPrizeAmountsToCases();

	const seenNumbers = new Set<number>();
	const seenAmounts = new Set<number>();
	for (const caseState of cases) {
		seenNumbers.add(caseState.number);
		seenAmounts.add(caseState.amount);
	}

	if (seenNumbers.size !== 26 || seenAmounts.size !== 26) return assignPrizeAmountsToCases();
	return cases;
}

function getAvailableNonPlayerCases(game: NoDealOrDealGameState): CaseState[] {
	return game.cases.filter((caseState) => caseState.status === 'available');
}

function getGameStage(casesRemaining: number): 'early' | 'middle' | 'late' | 'final' {
	if (casesRemaining <= 2) return 'final';
	if (casesRemaining <= 6) return 'late';
	if (casesRemaining <= 14) return 'middle';
	return 'early';
}

function findCase(game: NoDealOrDealGameState, caseNumber: CaseNumber): CaseState | undefined {
	return game.cases.find((caseState) => caseState.number === caseNumber);
}

function updatePendingOfferDecision(
	game: NoDealOrDealGameState,
	decision: 'Deal' | 'No Deal'
): void {
	const pendingOffer = game.offerHistory.find((offer) => offer.decision === 'Pending');
	if (pendingOffer) pendingOffer.decision = decision;
}

function addLog(
	game: NoDealOrDealGameState,
	message: string,
	amount?: PrizeAmount,
	caseNumber?: CaseNumber
): void {
	game.gameLog = [{ id: Date.now() + Math.random(), message, amount, caseNumber }, ...game.gameLog].slice(0, 80);
}

function average(values: PrizeAmount[]): number {
	if (!values.length) return 0;
	return values.reduce((total, value) => total + value, 0) / values.length;
}

function shuffle<T>(values: T[]): T[] {
	const shuffledValues = [...values];

	for (let index = shuffledValues.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(Math.random() * (index + 1));
		[shuffledValues[index], shuffledValues[swapIndex]] = [shuffledValues[swapIndex], shuffledValues[index]];
	}

	return shuffledValues;
}
