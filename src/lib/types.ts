export type DiceValue = 1 | 2 | 3 | 4 | 5 | 6;

export type PlayerCount = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type PlayerRotation = 0 | 90 | 180 | 270;

export type CpuDifficulty = 'easy' | 'moderate' | 'masterful';

export type UpperCategory = 'ones' | 'twos' | 'threes' | 'fours' | 'fives' | 'sixes';

export type LowerCategory =
	| 'threeKind'
	| 'fourKind'
	| 'fullHouse'
	| 'smallStraight'
	| 'largeStraight'
	| 'fiveKind'
	| 'chance';

export type ScoreCategory = UpperCategory | LowerCategory;

export type ScoreSection = 'upper' | 'lower';

export type Scorecard = Record<ScoreCategory, number | null>;

export interface Dice {
	value: DiceValue;
	held: boolean;
}

export interface RollOffResult {
	playerId: number;
	dice: DiceValue[];
	total: number;
}

export interface RollOffState {
	active: boolean;
	eligiblePlayerIds: number[];
	currentPlayerId: number | null;
	results: RollOffResult[];
	pickerPlayerId: number | null;
	status: 'rolling' | 'chooseStarter' | 'complete';
}

export interface CategoryDefinition {
	id: ScoreCategory;
	name: string;
	section: ScoreSection;
	description: string;
}

export interface Player {
	id: number;
	name: string;
	isCpu?: boolean;
	scores: Scorecard;
	fiveKindBonuses: number;
	lastTurnScore: number | null;
	lastTurnCategory: ScoreCategory | null;
	screenRotation: PlayerRotation;
}

export interface GameState {
	players: Player[];
	activePlayerIndex: number;
	dice: Dice[];
	rollCount: number;
	roundNumber: number;
	cpuDifficulty: CpuDifficulty;
	rollOff: RollOffState;
}

export interface PersistedGameSnapshot {
	game: GameState;
	gameName: string;
	playerCount: PlayerCount;
	selectedScorecardIndex: number;
	setupVisible: boolean;
	recentScore?: { playerId: number; category: ScoreCategory } | null;
	scoreRevealEndsAt?: number | null;
}

export interface SavedGameRecord {
	id: string;
	name: string;
	createdAt: string;
	updatedAt: string;
	version: number;
	snapshot: PersistedGameSnapshot;
}
