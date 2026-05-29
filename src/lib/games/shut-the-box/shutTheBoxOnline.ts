import type { DataConnection } from 'peerjs';
import type { ShutBoxGameState, ShutBoxDiceValue } from './shutTheBoxTypes';

export type ShutBoxOnlineRole = 'host' | 'guest';
export type ShutBoxConnectionState = 'offline' | 'creating' | 'waiting' | 'connecting' | 'connected' | 'error';

export type ShutBoxOnlineAction =
	| { type: 'roll' }
	| { type: 'toggleTile'; tile: number }
	| { type: 'commitTiles' }
	| { type: 'renameSelf'; name: string }
	| { type: 'forfeit' };

export interface ShutBoxOnlineSnapshot {
	game: ShutBoxGameState;
	sequence: number;
	rollDice?: [ShutBoxDiceValue, ShutBoxDiceValue] | null;
}

export type ShutBoxHostMessage =
	| { kind: 'snapshot'; sessionId: string; snapshot: ShutBoxOnlineSnapshot; localPlayerId: number }
	| { kind: 'rejected'; sessionId: string; message: string }
	| { kind: 'forfeit'; sessionId: string; winnerId: number };

export type ShutBoxGuestMessage =
	| { kind: 'join'; playerName: string }
	| { kind: 'action'; sessionId: string; action: ShutBoxOnlineAction };

export interface ShutBoxPeerConnection extends DataConnection {
	send(data: ShutBoxHostMessage | ShutBoxGuestMessage): void;
}

const SHUT_BOX_ROOM_PREFIX = 'shut-box-room-';

export function getShutBoxRoomPeerId(roomCode: string): string {
	return `${SHUT_BOX_ROOM_PREFIX}${normalizeRoomCode(roomCode)}`;
}

export function createRoomCode(random = secureRandomInt): string {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	return Array.from({ length: 6 }, () => alphabet[random(alphabet.length)]).join('');
}

export function normalizeRoomCode(roomCode: string): string {
	return roomCode.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

export function createOnlineId(prefix: string): string {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function secureRandomInt(max: number): number {
	if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
		const bytes = new Uint32Array(1);
		crypto.getRandomValues(bytes);
		return bytes[0] % max;
	}

	return Math.floor(Math.random() * max);
}
