export type BellDiceValue = 1 | 2 | 3 | 4 | 5 | 6;

export type BellRollMode = 'quick' | 'party';

export interface BellRollPlayer {
	id: number;
	name: string;
	ghost: boolean;
}

export interface BellRollStats {
	wins: number;
	losses: number;
	roundWins: number;
	roundLosses: number;
	totalPoints: number;
	perfectTriples: number;
	miniTriples: number;
}

export interface BellRollTeam {
	id: 'A' | 'B';
	playerIds: number[];
	score: number;
}

export interface BellRollTable {
	id: number;
	name: string;
	isHead: boolean;
	teamA: BellRollTeam;
	teamB: BellRollTeam;
	activeTeamId: 'A' | 'B';
	activePlayerIndex: number;
}

export interface BellRollResult {
	dice: BellDiceValue[];
	points: number;
	label: 'Perfect Triple' | 'Mini Triple' | 'Matches' | 'No Score';
	message: string;
	turnContinues: boolean;
}

export interface BellRollPendingRoll {
	dice: BellDiceValue[];
	playerId: number;
	playerName: string;
	result: BellRollResult;
}

export interface BellRollRoundHistory {
	set: number;
	round: number;
	target: BellDiceValue;
	winners: string;
	highestScore: number;
	perfectTriples: number;
	miniTriples: number;
}

export interface BellRollLogEntry {
	id: number;
	text: string;
	playerName?: string;
	dice?: BellDiceValue[];
	resultText?: string;
	target?: BellDiceValue;
	resultLabel?: BellRollResult['label'];
}

export interface BellRollGameState {
	mode: BellRollMode;
	setupComplete: boolean;
	players: BellRollPlayer[];
	stats: Record<number, BellRollStats>;
	setCount: 1 | 3 | 4;
	currentSet: number;
	currentRound: BellDiceValue;
	dice: BellDiceValue[];
	rollVersion: number;
	lastRoll: BellRollResult | null;
	statusMessage: string;
	turnLog: BellRollLogEntry[];
	roundHistory: BellRollRoundHistory[];
	roundPerfectTriples: number;
	roundMiniTriples: number;
	gameOver: boolean;
	quick: {
		currentPlayerIndex: number;
		roundScores: Record<number, number>;
	};
	party: {
		tables: BellRollTable[];
		activeTableIndex: number;
		roundEnding: boolean;
	};
}
