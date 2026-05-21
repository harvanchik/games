import { BELL_ROLL_STORAGE_KEY, createBellRollGame } from './bellRollGame';
import type { BellRollGameState } from './bellRollTypes';

const STORAGE_KEY = 'bell-roll:saves:v1';
const LAST_GAME_KEY = 'bell-roll:last-game-id:v1';
const SAVE_VERSION = 1;
export const MAX_BELL_ROLL_SAVED_GAMES = 6;

export interface BellRollSavedGameSnapshot {
	game: BellRollGameState;
	gameName: string;
}

export interface BellRollSavedGameRecord {
	id: string;
	name: string;
	createdAt: string;
	updatedAt: string;
	version: number;
	snapshot: BellRollSavedGameSnapshot;
}

export function createDefaultBellRollGameName(date = new Date()): string {
	const day = date.getDate();
	const month = date.toLocaleString('en-US', { month: 'short' });
	const year = date.getFullYear();
	let hours = date.getHours();
	const minutes = String(date.getMinutes()).padStart(2, '0');
	const meridiem = hours >= 12 ? 'pm' : 'am';

	hours = hours % 12 || 12;

	return `Bell Roll ${day} ${month} ${year} ${hours}:${minutes} ${meridiem}`;
}

export function createBellRollSaveId(): string {
	return `bell-roll-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadBellRollSavedGames(): BellRollSavedGameRecord[] {
	if (!browserStorageAvailable()) return [];

	const migratedRecord = migrateLegacySingleSave();

	try {
		const rawValue = localStorage.getItem(STORAGE_KEY);
		if (!rawValue) return migratedRecord ? [migratedRecord] : [];

		const parsedValue = JSON.parse(rawValue);
		if (!Array.isArray(parsedValue)) return migratedRecord ? [migratedRecord] : [];

		const records = getUniqueRecentRecords(parsedValue.filter(isBellRollSavedGameRecord));
		if (records.length !== parsedValue.length) {
			writeSavedGames(records);
		}

		return records;
	} catch {
		return migratedRecord ? [migratedRecord] : [];
	}
}

export function loadBellRollLastGameId(): string | null {
	if (!browserStorageAvailable()) return null;
	return localStorage.getItem(LAST_GAME_KEY);
}

export function saveBellRollGameRecord(record: BellRollSavedGameRecord): BellRollSavedGameRecord[] {
	const records = loadBellRollSavedGames();
	const nextName = normalizeName(record.name);
	const existingIndex = records.findIndex(
		(savedRecord) => savedRecord.id === record.id || normalizeName(savedRecord.name) === nextName
	);

	if (existingIndex < 0 && records.length >= MAX_BELL_ROLL_SAVED_GAMES) {
		return records;
	}

	const nextRecord = cloneRecord({
		...record,
		createdAt: existingIndex >= 0 ? records[existingIndex].createdAt : record.createdAt,
		version: SAVE_VERSION,
		updatedAt: new Date().toISOString()
	});

	if (existingIndex >= 0) {
		records[existingIndex] = nextRecord;
	} else {
		records.unshift(nextRecord);
	}

	records.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
	const cappedRecords = records.slice(0, MAX_BELL_ROLL_SAVED_GAMES);
	writeSavedGames(cappedRecords);
	setBellRollLastGameId(nextRecord.id);

	return cappedRecords;
}

export function deleteBellRollSavedGame(id: string): BellRollSavedGameRecord[] {
	const records = loadBellRollSavedGames().filter((record) => record.id !== id);
	writeSavedGames(records);

	if (loadBellRollLastGameId() === id) {
		const nextLastGameId = records[0]?.id ?? '';
		if (nextLastGameId) {
			setBellRollLastGameId(nextLastGameId);
		} else {
			localStorage.removeItem(LAST_GAME_KEY);
		}
	}

	return records;
}

export function buildBellRollSaveRecord(
	id: string,
	name: string,
	game: BellRollGameState,
	createdAt?: string
): BellRollSavedGameRecord {
	const now = new Date().toISOString();
	const savedName = name.trim() || createDefaultBellRollGameName();

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

export function setBellRollLastGameId(id: string): void {
	if (!browserStorageAvailable()) return;
	localStorage.setItem(LAST_GAME_KEY, id);
}

function migrateLegacySingleSave(): BellRollSavedGameRecord | null {
	if (!browserStorageAvailable() || localStorage.getItem(STORAGE_KEY)) return null;

	try {
		const rawValue = localStorage.getItem(BELL_ROLL_STORAGE_KEY);
		if (!rawValue) return null;

		const parsedValue = JSON.parse(rawValue);
		if (!parsedValue || typeof parsedValue !== 'object') return null;

		const game = parsedValue as BellRollGameState;
		const record = buildBellRollSaveRecord(
			createBellRollSaveId(),
			createDefaultBellRollGameName(),
			{
				...createBellRollGame(),
				...game
			}
		);

		writeSavedGames([record]);
		setBellRollLastGameId(record.id);
		localStorage.removeItem(BELL_ROLL_STORAGE_KEY);

		return record;
	} catch {
		return null;
	}
}

function writeSavedGames(records: BellRollSavedGameRecord[]): void {
	if (!browserStorageAvailable()) return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function getUniqueRecentRecords(records: BellRollSavedGameRecord[]): BellRollSavedGameRecord[] {
	const seenNames = new Set<string>();
	const sortedRecords = [...records].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
	const uniqueRecords: BellRollSavedGameRecord[] = [];

	for (const record of sortedRecords) {
		const name = normalizeName(record.name);
		if (seenNames.has(name)) continue;

		seenNames.add(name);
		uniqueRecords.push(record);

		if (uniqueRecords.length >= MAX_BELL_ROLL_SAVED_GAMES) break;
	}

	return uniqueRecords;
}

function cloneRecord(record: BellRollSavedGameRecord): BellRollSavedGameRecord {
	return structuredClone(record);
}

function normalizeName(name: string): string {
	return name.trim().toLocaleLowerCase();
}

function browserStorageAvailable(): boolean {
	return typeof localStorage !== 'undefined';
}

function isBellRollSavedGameRecord(value: unknown): value is BellRollSavedGameRecord {
	if (!value || typeof value !== 'object') return false;

	const record = value as BellRollSavedGameRecord;
	return (
		typeof record.id === 'string' &&
		typeof record.name === 'string' &&
		typeof record.createdAt === 'string' &&
		typeof record.updatedAt === 'string' &&
		typeof record.version === 'number' &&
		!!record.snapshot &&
		typeof record.snapshot === 'object' &&
		!!record.snapshot.game &&
		typeof record.snapshot.game === 'object'
	);
}
