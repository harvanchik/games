import type { ShutBoxGameState, ShutBoxSavedGameRecord } from './shutTheBoxTypes';

const STORAGE_KEY = 'shut-the-box:saves:v1';
const LAST_GAME_KEY = 'shut-the-box:last-game-id:v1';
const SAVE_VERSION = 1;
export const MAX_SHUT_BOX_SAVED_GAMES = 6;

export function createDefaultShutBoxGameName(date = new Date()): string {
	const day = date.getDate();
	const month = date.toLocaleString('en-US', { month: 'short' });
	const year = date.getFullYear();
	let hours = date.getHours();
	const minutes = String(date.getMinutes()).padStart(2, '0');
	const meridiem = hours >= 12 ? 'pm' : 'am';
	hours = hours % 12 || 12;
	return `Shut the Box ${day} ${month} ${year} ${hours}:${minutes} ${meridiem}`;
}

export function createShutBoxSaveId(): string {
	return `shut-box-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadShutBoxSavedGames(): ShutBoxSavedGameRecord[] {
	if (!browserStorageAvailable()) return [];

	try {
		const rawValue = localStorage.getItem(STORAGE_KEY);
		if (!rawValue) return [];
		const parsedValue = JSON.parse(rawValue);
		if (!Array.isArray(parsedValue)) return [];
		const records = getUniqueRecentRecords(parsedValue.filter(isSavedGameRecord));
		if (records.length !== parsedValue.length) writeSavedGames(records);
		return records;
	} catch {
		return [];
	}
}

export function loadShutBoxLastGameId(): string | null {
	if (!browserStorageAvailable()) return null;
	return localStorage.getItem(LAST_GAME_KEY);
}

export function saveShutBoxGameRecord(record: ShutBoxSavedGameRecord): ShutBoxSavedGameRecord[] {
	const records = loadShutBoxSavedGames().filter(
		(savedRecord) => savedRecord.snapshot.game.phase !== 'game-over'
	);
	const nextName = normalizeName(record.name);

	if (record.snapshot.game.phase === 'game-over') {
		const unfinishedRecords = records.filter(
			(savedRecord) => savedRecord.id !== record.id && normalizeName(savedRecord.name) !== nextName
		);
		writeSavedGames(unfinishedRecords);
		return unfinishedRecords;
	}

	const existingIndex = records.findIndex(
		(savedRecord) => savedRecord.id === record.id || normalizeName(savedRecord.name) === nextName
	);

	if (existingIndex < 0 && records.length >= MAX_SHUT_BOX_SAVED_GAMES) return records;

	const nextRecord = structuredClone({
		...record,
		createdAt: existingIndex >= 0 ? records[existingIndex].createdAt : record.createdAt,
		updatedAt: new Date().toISOString(),
		version: SAVE_VERSION
	});

	if (existingIndex >= 0) records[existingIndex] = nextRecord;
	else records.unshift(nextRecord);

	records.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
	const cappedRecords = records.slice(0, MAX_SHUT_BOX_SAVED_GAMES);
	writeSavedGames(cappedRecords);
	setShutBoxLastGameId(nextRecord.id);
	return cappedRecords;
}

export function deleteShutBoxSavedGame(id: string): ShutBoxSavedGameRecord[] {
	const records = loadShutBoxSavedGames().filter((record) => record.id !== id);
	writeSavedGames(records);

	if (loadShutBoxLastGameId() === id) {
		const nextId = records[0]?.id ?? '';
		if (nextId) setShutBoxLastGameId(nextId);
		else localStorage.removeItem(LAST_GAME_KEY);
	}

	return records;
}

export function buildShutBoxSaveRecord(
	id: string,
	name: string,
	game: ShutBoxGameState,
	createdAt?: string
): ShutBoxSavedGameRecord {
	const now = new Date().toISOString();
	const savedName = name.trim() || createDefaultShutBoxGameName();
	return {
		id,
		name: savedName,
		createdAt: createdAt ?? now,
		updatedAt: now,
		version: SAVE_VERSION,
		snapshot: {
			game: structuredClone(game),
			gameName: savedName
		}
	};
}

export function setShutBoxLastGameId(id: string): void {
	if (!browserStorageAvailable()) return;
	localStorage.setItem(LAST_GAME_KEY, id);
}

function getUniqueRecentRecords(records: ShutBoxSavedGameRecord[]): ShutBoxSavedGameRecord[] {
	const seenNames = new Set<string>();
	const sortedRecords = [...records].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
	const uniqueRecords: ShutBoxSavedGameRecord[] = [];

	for (const record of sortedRecords) {
		const name = normalizeName(record.name);
		if (seenNames.has(name)) continue;
		seenNames.add(name);
		uniqueRecords.push(record);
		if (uniqueRecords.length >= MAX_SHUT_BOX_SAVED_GAMES) break;
	}

	return uniqueRecords;
}

function writeSavedGames(records: ShutBoxSavedGameRecord[]): void {
	if (!browserStorageAvailable()) return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function normalizeName(name: string): string {
	return name.trim().toLocaleLowerCase();
}

function isSavedGameRecord(value: unknown): value is ShutBoxSavedGameRecord {
	if (!value || typeof value !== 'object') return false;
	const record = value as ShutBoxSavedGameRecord;
	return (
		typeof record.id === 'string' &&
		typeof record.name === 'string' &&
		typeof record.createdAt === 'string' &&
		typeof record.updatedAt === 'string' &&
		typeof record.version === 'number' &&
		!!record.snapshot &&
		typeof record.snapshot === 'object'
	);
}

function browserStorageAvailable(): boolean {
	return typeof localStorage !== 'undefined';
}
