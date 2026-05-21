import type { DataConnection } from 'peerjs';
import type { DiceValue, GameState, PersistedGameSnapshot, ScoreCategory } from './types';

export type OnlineRole = 'host' | 'guest';

export type OnlineConnectionState =
	| 'offline'
	| 'creating'
	| 'waiting'
	| 'connecting'
	| 'connected'
	| 'reconnecting'
	| 'error';

export type PokerDiceOnlineAction =
	| { type: 'roll' }
	| { type: 'toggleHold'; index: number }
	| { type: 'score'; category: ScoreCategory }
	| { type: 'chooseStarter'; playerId: number }
	| { type: 'renameSelf'; name: string };

export interface PokerDiceOnlineSnapshot extends PersistedGameSnapshot {
	rollVersion: number;
}

export interface PokerDiceOnlineSession {
	sessionId: string;
	roomCode: string;
	role: OnlineRole;
	localPlayerId: number;
	localPlayerToken: string;
	guestPlayerToken?: string | null;
	sequence: number;
	snapshot: PokerDiceOnlineSnapshot;
}

export interface VerifiedRollState {
	rollId: string;
	requestedByPlayerId: number;
	hostNonce: string;
	hostCommit: string;
	guestCommit?: string;
	guestNonce?: string;
}

export interface GuestVerifiedRollState {
	rollId: string;
	guestNonce: string;
	guestCommit: string;
	hostCommit: string;
}

export type PokerDiceHostMessage =
	| {
			kind: 'snapshot';
			sessionId: string;
			sequence: number;
			localPlayerId: number;
			guestPlayerToken: string;
			snapshot: PokerDiceOnlineSnapshot;
	  }
	| { kind: 'rollCommit'; sessionId: string; rollId: string; commit: string }
	| { kind: 'rollReveal'; sessionId: string; rollId: string; nonce: string }
	| { kind: 'forfeit'; sessionId: string; playerId: number }
	| { kind: 'actionRejected'; sessionId: string; message: string };

export type PokerDiceGuestMessage =
	| { kind: 'join'; roomCode: string; playerName: string; playerToken: string }
	| {
			kind: 'action';
			sessionId: string;
			actionId: string;
			playerToken: string;
			action: PokerDiceOnlineAction;
	  }
	| { kind: 'rollCommit'; sessionId: string; rollId: string; commit: string }
	| { kind: 'rollReveal'; sessionId: string; rollId: string; nonce: string }
	| { kind: 'forfeit'; sessionId: string; playerToken: string }
	| { kind: 'resync'; sessionId: string; playerToken: string };

export interface PokerDicePeerConnection extends DataConnection {
	send(data: PokerDiceHostMessage | PokerDiceGuestMessage): void;
}

export const POKER_DICE_ROOM_PREFIX = 'poker-dice-room-';

export function getPokerDiceRoomPeerId(roomCode: string): string {
	return `${POKER_DICE_ROOM_PREFIX}${normalizeRoomCode(roomCode)}`;
}

export function createRoomCode(random = secureRandomInt): string {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

	return Array.from({ length: 6 }, () => alphabet[random(alphabet.length)]).join('');
}

export function normalizeRoomCode(roomCode: string): string {
	return roomCode.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

export function createOnlineId(prefix: string): string {
	return `${prefix}-${Date.now().toString(36)}-${createNonce().slice(0, 10)}`;
}

export function createNonce(): string {
	const bytes = new Uint8Array(24);
	crypto.getRandomValues(bytes);
	return bytesToHex(bytes);
}

export async function createRollCommitment(
	sessionId: string,
	rollId: string,
	role: OnlineRole,
	nonce: string
): Promise<string> {
	return sha256Hex(`${sessionId}:${rollId}:${role}:${nonce}`);
}

export async function verifyRollCommitment(
	sessionId: string,
	rollId: string,
	role: OnlineRole,
	nonce: string,
	commitment: string
): Promise<boolean> {
	return (await createRollCommitment(sessionId, rollId, role, nonce)) === commitment;
}

export async function deriveVerifiedDice(
	sessionId: string,
	rollId: string,
	hostNonce: string,
	guestNonce: string
): Promise<DiceValue[]> {
	const bytes = await sha256Bytes(`${sessionId}:${rollId}:${hostNonce}:${guestNonce}`);

	return Array.from({ length: 5 }, (_, index) => ((bytes[index] % 6) + 1) as DiceValue);
}

export function applyVerifiedRoll(game: GameState, values: DiceValue[]): void {
	let valueIndex = 0;

	game.dice = game.dice.map((die) => {
		if (!game.rollOff.active && die.held) return die;

		const value = values[valueIndex] ?? values[values.length - 1] ?? die.value;
		valueIndex += 1;

		return { value, held: false };
	});
	game.rollCount = game.rollOff.active ? 1 : game.rollCount + 1;
}

function secureRandomInt(max: number): number {
	const bytes = new Uint32Array(1);
	crypto.getRandomValues(bytes);
	return bytes[0] % max;
}

async function sha256Hex(value: string): Promise<string> {
	return bytesToHex(await sha256Bytes(value));
}

async function sha256Bytes(value: string): Promise<Uint8Array> {
	const bytes = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return new Uint8Array(digest);
}

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
