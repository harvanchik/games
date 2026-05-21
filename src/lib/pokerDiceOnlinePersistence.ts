import type { PokerDiceOnlineSession } from './pokerDiceOnline';

const STORAGE_KEY = 'poker-dice:online-session:v1';

export function loadPokerDiceOnlineSession(): PokerDiceOnlineSession | null {
	if (!browserStorageAvailable()) return null;

	try {
		const rawValue = localStorage.getItem(STORAGE_KEY);
		if (!rawValue) return null;

		const parsedValue = JSON.parse(rawValue);
		return isPokerDiceOnlineSession(parsedValue) ? parsedValue : null;
	} catch {
		return null;
	}
}

export function savePokerDiceOnlineSession(session: PokerDiceOnlineSession): void {
	if (!browserStorageAvailable()) return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(structuredClone(session)));
}

export function clearPokerDiceOnlineSession(): void {
	if (!browserStorageAvailable()) return;
	localStorage.removeItem(STORAGE_KEY);
}

function browserStorageAvailable(): boolean {
	return typeof localStorage !== 'undefined';
}

function isPokerDiceOnlineSession(value: unknown): value is PokerDiceOnlineSession {
	if (!value || typeof value !== 'object') return false;

	const session = value as PokerDiceOnlineSession;
	return (
		typeof session.sessionId === 'string' &&
		typeof session.roomCode === 'string' &&
		(session.role === 'host' || session.role === 'guest') &&
		typeof session.localPlayerId === 'number' &&
		typeof session.localPlayerToken === 'string' &&
		typeof session.sequence === 'number' &&
		!!session.snapshot &&
		typeof session.snapshot === 'object' &&
		!!session.snapshot.game &&
		typeof session.snapshot.game === 'object'
	);
}
