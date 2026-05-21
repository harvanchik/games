export type FortressDiceValue = 1 | 2 | 3 | 4 | 5 | 6;
export type FortressPhase = 'setup' | 'ready' | 'countdown' | 'playing' | 'paused' | 'game-over';
export type FortressPlayerId = 1 | 2;
export type FortressLaneId = 0 | 1 | 2;
export type FortressCombo =
	| 'single'
	| 'pair'
	| 'two-pair'
	| 'triple'
	| 'four-kind'
	| 'full-house'
	| 'small-straight'
	| 'large-straight'
	| 'five-kind';
export type FortressSpeedTier = 'single' | 'pair' | 'triple' | 'fourKind' | 'fiveKind';
export type FortressActionType =
	| 'troopMarch'
	| 'shield'
	| 'fullHousePush'
	| 'freeze'
	| 'regen'
	| 'slowLane'
	| 'restoreShield'
	| 'hasteLane'
	| 'clearLane';
export type FortressActionTarget = 'selectedLane' | 'allLanes' | 'self' | 'opponent';

export interface FortressDie {
	id: number;
	value: FortressDiceValue;
	held: boolean;
}

export interface FortressPlayer {
	id: FortressPlayerId;
	name: string;
	hp: number;
	maxHp: number;
	damageDealt: number;
	damageShielded: number;
	damageRepaired: number;
	ready: boolean;
	cooldownEndsAt: number;
	freezeEndsAt: number;
	regenEndsAt: number;
	lastRegenTickAt: number;
	dice: FortressDie[];
	rollCount: number;
	lastAction: string;
	lastRoll: FortressDiceValue[];
}

export interface FortressUnit {
	id: string;
	ownerId: FortressPlayerId;
	laneId: FortressLaneId;
	combo: FortressCombo;
	troops: number;
	speedTier: FortressSpeedTier;
	speed: number;
	position: number;
	direction: 1 | -1;
	status: 'moving' | 'fighting';
}

export interface FortressLane {
	id: FortressLaneId;
	shields: Record<FortressPlayerId, number>;
	slowEndsAt: Record<FortressPlayerId, number>;
	hasteEndsAt: Record<FortressPlayerId, number>;
	units: FortressUnit[];
}

export interface FortressActionOption {
	id: string;
	combo: FortressCombo;
	type: FortressActionType;
	target: FortressActionTarget;
	label: string;
	description: string;
	troops?: number;
	shieldAmount?: number;
	speedTier?: FortressSpeedTier;
	durationMs?: number;
	hpPerSecond?: number;
	slowMultiplier?: number;
	speedMultiplier?: number;
}

export interface FortressLogEntry {
	id: string;
	message: string;
}

export interface FortressGameState {
	setupComplete: boolean;
	gameName: string;
	phase: FortressPhase;
	hpMax: number;
	players: [FortressPlayer, FortressPlayer];
	lanes: FortressLane[];
	activeCountdown: number;
	winnerId: FortressPlayerId | null;
	log: FortressLogEntry[];
	updatedAt: number;
}

export interface FortressSavedGameSnapshot {
	game: FortressGameState;
	gameName: string;
}

export interface FortressSavedGameRecord {
	id: string;
	name: string;
	createdAt: string;
	updatedAt: string;
	version: number;
	snapshot: FortressSavedGameSnapshot;
}
