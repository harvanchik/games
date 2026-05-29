export type ShutBoxDiceValue = 1 | 2 | 3 | 4 | 5 | 6;
export type ShutBoxMode = 'local' | 'cpu' | 'online';
export type ShutBoxPhase = 'ready' | 'choosing' | 'turn-over' | 'game-over';

export interface ShutBoxPlayer {
	id: number;
	name: string;
	isCpu?: boolean;
	closedTiles: number[];
	score: number | null;
	shutTheBox: boolean;
	lastTurnScore: number | null;
}

export interface ShutBoxRoll {
	dice: [ShutBoxDiceValue, ShutBoxDiceValue];
	total: number;
}

export interface ShutBoxLogEntry {
	id: number;
	playerName: string;
	message: string;
	dice?: [ShutBoxDiceValue, ShutBoxDiceValue];
	tiles?: number[];
}

export interface ShutBoxGameState {
	setupComplete: boolean;
	gameName: string;
	mode: ShutBoxMode;
	players: ShutBoxPlayer[];
	activePlayerIndex: number;
	dice: [ShutBoxDiceValue, ShutBoxDiceValue];
	rollVersion: number;
	phase: ShutBoxPhase;
	selectedTiles: number[];
	lastRoll: ShutBoxRoll | null;
	statusMessage: string;
	turnLog: ShutBoxLogEntry[];
	winnerIds: number[];
}

export interface ShutBoxSavedGameSnapshot {
	game: ShutBoxGameState;
	gameName: string;
}

export interface ShutBoxSavedGameRecord {
	id: string;
	name: string;
	createdAt: string;
	updatedAt: string;
	version: number;
	snapshot: ShutBoxSavedGameSnapshot;
}
