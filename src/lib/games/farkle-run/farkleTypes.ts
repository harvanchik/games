export type FarkleDiceValue = 1 | 2 | 3 | 4 | 5 | 6;
export type FarklePhase = 'setup' | 'ready' | 'selecting' | 'farkle' | 'game-over';

export interface FarkleDie {
	id: number;
	value: FarkleDiceValue;
	selected: boolean;
}

export interface FarklePlayer {
	id: number;
	name: string;
	totalScore: number;
	farkles: number;
	roundsWon: number;
	lastTurnScore: number;
}

export interface FarkleTurnLogEntry {
	id: number;
	playerName: string;
	message: string;
	points?: number;
	dice?: FarkleDiceValue[];
}

export interface FarkleScoreResult {
	score: number;
	valid: boolean;
	label: string;
	scoringIndexes: number[];
}

export interface FarkleGameState {
	setupComplete: boolean;
	gameName: string;
	targetScore: number;
	players: FarklePlayer[];
	activePlayerIndex: number;
	roundNumber: number;
	dice: FarkleDie[];
	availableDiceCount: number;
	turnPoints: number;
	phase: FarklePhase;
	statusMessage: string;
	rollVersion: number;
	lastRollScore: number;
	lastRollLabel: string;
	turnLog: FarkleTurnLogEntry[];
	winnerId: number | null;
}

export interface FarkleSavedGameSnapshot {
	game: FarkleGameState;
	gameName: string;
}

export interface FarkleSavedGameRecord {
	id: string;
	name: string;
	createdAt: string;
	updatedAt: string;
	version: number;
	snapshot: FarkleSavedGameSnapshot;
}
