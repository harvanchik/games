export type CaseNumber =
	| 1
	| 2
	| 3
	| 4
	| 5
	| 6
	| 7
	| 8
	| 9
	| 10
	| 11
	| 12
	| 13
	| 14
	| 15
	| 16
	| 17
	| 18
	| 19
	| 20
	| 21
	| 22
	| 23
	| 24
	| 25
	| 26;

export type PrizeAmount = number;

export type CaseStatus = 'available' | 'player' | 'opened';
export type GamePhase =
	| 'setup'
	| 'choosing-player-case'
	| 'opening-cases'
	| 'banker-calling'
	| 'banker-offer'
	| 'final-choice'
	| 'game-over';

export type BankerPersonality = 'conservative' | 'balanced' | 'generous' | 'dramatic';
export type DramaticPauseSetting = 'off' | 'short' | 'normal' | 'long';
export type FinalChoice = 'keep' | 'swap';

export interface CaseState {
	number: CaseNumber;
	amount: PrizeAmount;
	status: CaseStatus;
}

export interface BankerOffer {
	id: number;
	roundNumber: number;
	casesRemaining: number;
	expectedValue: number;
	medianValue: number;
	maxRemaining: number;
	minRemaining: number;
	highPrizeCount: number;
	lowPrizeCount: number;
	riskIndex: number;
	volatilityIndex: number;
	boardStrength: number;
	offerMultiplier: number;
	offerAmount: number;
	offerExplanation: string;
}

export interface OfferHistoryEntry extends BankerOffer {
	decision: 'Deal' | 'No Deal' | 'Pending';
}

export interface GameLogEntry {
	id: number;
	message: string;
	amount?: PrizeAmount;
	caseNumber?: CaseNumber;
}

export interface FinalResult {
	finalWinnings: PrizeAmount;
	playerCaseValue: PrizeAmount;
	acceptedDealAmount: PrizeAmount | null;
	finalChoice: FinalChoice | 'deal';
	selectedCaseNumber: CaseNumber;
	otherCaseNumber: CaseNumber | null;
	otherCaseValue: PrizeAmount | null;
	differenceFromCase: number;
	goodDeal: boolean | null;
}

export interface NoDealOrDealGameState {
	cases: CaseState[];
	playerCaseNumber: CaseNumber | null;
	currentRound: number;
	casesToOpenThisRound: number;
	casesOpenedThisRound: number;
	phase: GamePhase;
	statusMessage: string;
	currentOffer: BankerOffer | null;
	offerHistory: OfferHistoryEntry[];
	gameLog: GameLogEntry[];
	dramaticPause: DramaticPauseSetting;
	bankerPersonality: BankerPersonality;
	skipAllPauses: boolean;
	pauseRunning: boolean;
	pauseMessage: string;
	recentOpenedCaseNumber: CaseNumber | null;
	recentRemovedAmount: PrizeAmount | null;
	lastOpenedValues: PrizeAmount[];
	finalResult: FinalResult | null;
	gameOver: boolean;
}

export interface BankerEngineInput {
	remainingPrizeAmounts: PrizeAmount[];
	roundNumber: number;
	casesRemaining: number;
	previousOffers: BankerOffer[];
	lastOpenedValues: PrizeAmount[];
	highestPrizeStillInPlay: boolean;
	topPrizeCountRemaining: number;
	gameStage: 'early' | 'middle' | 'late' | 'final';
	personality: BankerPersonality;
}

export type BankerEngineOutput = BankerOffer;

export interface NoDealOrDealSavedGameSnapshot {
	game: NoDealOrDealGameState;
	gameName: string;
}

export interface NoDealOrDealSavedGameRecord {
	id: string;
	name: string;
	createdAt: string;
	updatedAt: string;
	version: number;
	snapshot: NoDealOrDealSavedGameSnapshot;
}
