import { getFinalTotal, isScorecardComplete } from './scoring';
import type { GameState } from './types';

export type OnlineGameResult = 'win' | 'loss' | 'tie';
export type OnlineGameFinish = 'completed' | 'forfeit';

export interface OnlineGameLogEntry {
	id: string;
	endedAt: string;
	localName: string;
	opponentName: string;
	opponentKey: string;
	localScore: number;
	opponentScore: number;
	result: OnlineGameResult;
	finish: OnlineGameFinish;
}

export interface OnlineGameSummary {
	wins: number;
	losses: number;
	ties: number;
	games: number;
	averageLocalScore: number;
	averageOpponentScore: number;
}

export interface OnlineOpponentRecord {
	wins: number;
	losses: number;
	ties: number;
	games: number;
}

const STORAGE_KEY = 'poker-dice:online-game-history:v1';

export function loadOnlineGameHistory(): OnlineGameLogEntry[] {
	if (!browserStorageAvailable()) return [];

	try {
		const rawValue = localStorage.getItem(STORAGE_KEY);
		if (!rawValue) return [];

		const parsedValue = JSON.parse(rawValue);
		if (!Array.isArray(parsedValue)) return [];

		return parsedValue.filter(isOnlineGameLogEntry).sort(compareEntriesByDateDesc);
	} catch {
		return [];
	}
}

export function saveOnlineGameHistory(entries: OnlineGameLogEntry[]): OnlineGameLogEntry[] {
	const uniqueEntries = getUniqueEntries(entries).sort(compareEntriesByDateDesc);
	if (browserStorageAvailable()) {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(uniqueEntries));
	}

	return uniqueEntries;
}

export function upsertOnlineGameLogEntry(
	entries: OnlineGameLogEntry[],
	game: GameState,
	sessionId: string,
	localPlayerId: number,
	resultOverride?: OnlineGameResult,
	finish: OnlineGameFinish = resultOverride ? 'forfeit' : 'completed',
	endedAt = new Date().toISOString()
): OnlineGameLogEntry[] {
	const entry = createOnlineGameLogEntry(
		game,
		sessionId,
		localPlayerId,
		resultOverride,
		finish,
		endedAt
	);
	if (!entry) return entries;

	return saveOnlineGameHistory([entry, ...entries.filter((existingEntry) => existingEntry.id !== entry.id)]);
}

export function getOnlineGameSummary(entries: OnlineGameLogEntry[]): OnlineGameSummary {
	const games = entries.length;
	const localTotal = entries.reduce((total, entry) => total + entry.localScore, 0);
	const opponentTotal = entries.reduce((total, entry) => total + entry.opponentScore, 0);

	return {
		wins: entries.filter((entry) => entry.result === 'win').length,
		losses: entries.filter((entry) => entry.result === 'loss').length,
		ties: entries.filter((entry) => entry.result === 'tie').length,
		games,
		averageLocalScore: games > 0 ? Math.round(localTotal / games) : 0,
		averageOpponentScore: games > 0 ? Math.round(opponentTotal / games) : 0
	};
}

export function getOnlineOpponentRecord(
	entries: OnlineGameLogEntry[],
	opponentNameOrKey: string
): OnlineOpponentRecord {
	const opponentKey = normalizeOnlineOpponentName(opponentNameOrKey);
	const opponentEntries = entries.filter((entry) => entry.opponentKey === opponentKey);

	return {
		wins: opponentEntries.filter((entry) => entry.result === 'win').length,
		losses: opponentEntries.filter((entry) => entry.result === 'loss').length,
		ties: opponentEntries.filter((entry) => entry.result === 'tie').length,
		games: opponentEntries.length
	};
}

export function normalizeOnlineOpponentName(name: string): string {
	return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function createOnlineGameLogEntry(
	game: GameState,
	sessionId: string,
	localPlayerId: number,
	resultOverride: OnlineGameResult | undefined,
	finish: OnlineGameFinish,
	endedAt: string
): OnlineGameLogEntry | null {
	if (!sessionId || game.players.length !== 2) return null;

	const localPlayer = game.players.find((player) => player.id === localPlayerId);
	const opponent = game.players.find((player) => player.id !== localPlayerId);
	if (!localPlayer || !opponent) return null;
	if (!resultOverride && !game.players.every((player) => isScorecardComplete(player.scores))) return null;

	const localScore = getFinalTotal(localPlayer.scores, localPlayer.fiveKindBonuses);
	const opponentScore = getFinalTotal(opponent.scores, opponent.fiveKindBonuses);
	const result =
		resultOverride ??
		(localScore === opponentScore ? 'tie' : localScore > opponentScore ? 'win' : 'loss');
	const opponentName = opponent.name.trim() || `Player ${opponent.id}`;

	return {
		id: sessionId,
		endedAt,
		localName: localPlayer.name.trim() || `Player ${localPlayer.id}`,
		opponentName,
		opponentKey: normalizeOnlineOpponentName(opponentName),
		localScore,
		opponentScore,
		result,
		finish
	};
}

function getUniqueEntries(entries: OnlineGameLogEntry[]): OnlineGameLogEntry[] {
	const seenIds = new Set<string>();
	const uniqueEntries: OnlineGameLogEntry[] = [];

	for (const entry of entries) {
		if (seenIds.has(entry.id)) continue;

		seenIds.add(entry.id);
		uniqueEntries.push(entry);
	}

	return uniqueEntries;
}

function compareEntriesByDateDesc(a: OnlineGameLogEntry, b: OnlineGameLogEntry): number {
	return Date.parse(b.endedAt) - Date.parse(a.endedAt);
}

function isOnlineGameLogEntry(value: unknown): value is OnlineGameLogEntry {
	if (!value || typeof value !== 'object') return false;

	const entry = value as OnlineGameLogEntry;
	return (
		typeof entry.id === 'string' &&
		typeof entry.endedAt === 'string' &&
		typeof entry.localName === 'string' &&
		typeof entry.opponentName === 'string' &&
		typeof entry.opponentKey === 'string' &&
		typeof entry.localScore === 'number' &&
		typeof entry.opponentScore === 'number' &&
		(entry.result === 'win' || entry.result === 'loss' || entry.result === 'tie') &&
		(entry.finish === 'completed' || entry.finish === 'forfeit')
	);
}

function browserStorageAvailable(): boolean {
	return typeof localStorage !== 'undefined';
}
