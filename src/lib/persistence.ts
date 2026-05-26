import type { PersistedGameSnapshot, SavedGameRecord } from './types';
import { isGameOver } from './game';

const STORAGE_KEY = 'five-dice-scorecard:saves:v1';
const LAST_GAME_KEY = 'five-dice-scorecard:last-game-id:v1';
const LAST_PLAYER_NAME_KEY = 'five-dice-scorecard:last-player-name:v1';
const SAVE_VERSION = 1;
export const MAX_SAVED_GAMES = 6;

export function createDefaultGameName(date = new Date()): string {
	const day = date.getDate();
	const month = date.toLocaleString('en-US', { month: 'short' });
	const year = date.getFullYear();
	let hours = date.getHours();
	const minutes = String(date.getMinutes()).padStart(2, '0');
	const meridiem = hours >= 12 ? 'pm' : 'am';

	hours = hours % 12 || 12;

	return `Poker Dice ${day} ${month} ${year} ${hours}:${minutes} ${meridiem}`;
}

export function createSaveId(): string {
	return `game-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadSavedGames(): SavedGameRecord[] {
	if (!browserStorageAvailable()) return [];

	try {
		const rawValue = localStorage.getItem(STORAGE_KEY);
		if (!rawValue) return [];

		const parsedValue = JSON.parse(rawValue);
		if (!Array.isArray(parsedValue)) return [];

		const parsedRecords = parsedValue.filter(isSavedGameRecord);
		const savedRecords = getUniqueRecentRecords(parsedRecords);

		if (savedRecords.length !== parsedRecords.length) {
			writeSavedGames(savedRecords);
		}

		return savedRecords;
	} catch {
		return [];
	}
}

export function loadLastGameId(): string | null {
	if (!browserStorageAvailable()) return null;
	return localStorage.getItem(LAST_GAME_KEY);
}

export function loadLastPlayerName(): string | null {
	if (!browserStorageAvailable()) return null;

	const name = localStorage.getItem(LAST_PLAYER_NAME_KEY)?.trim();
	return name || null;
}

export function saveGameRecord(record: SavedGameRecord): SavedGameRecord[] {
	const records = loadSavedGames().filter((savedRecord) => !isGameOver(savedRecord.snapshot.game));
	const nextName = normalizeName(record.name);
	const existingIndex = records.findIndex(
		(savedRecord) => savedRecord.id === record.id || normalizeName(savedRecord.name) === nextName
	);

	if (existingIndex < 0 && records.length >= MAX_SAVED_GAMES) {
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
	const cappedRecords = records.slice(0, MAX_SAVED_GAMES);
	writeSavedGames(cappedRecords);
	setLastGameId(nextRecord.id);

	return cappedRecords;
}

export function deleteSavedGame(id: string): SavedGameRecord[] {
	const records = loadSavedGames().filter((record) => record.id !== id);
	writeSavedGames(records);

	if (loadLastGameId() === id) {
		const nextLastGameId = records[0]?.id ?? '';
		if (nextLastGameId) {
			setLastGameId(nextLastGameId);
		} else {
			localStorage.removeItem(LAST_GAME_KEY);
		}
	}

	return records;
}

export function buildSaveRecord(
	id: string,
	name: string,
	snapshot: PersistedGameSnapshot,
	createdAt?: string
): SavedGameRecord {
	const now = new Date().toISOString();

	return {
		id,
		name: name.trim() || createDefaultGameName(),
		createdAt: createdAt ?? now,
		updatedAt: now,
		version: SAVE_VERSION,
		snapshot: cloneSnapshot({
			...snapshot,
			gameName: name.trim() || createDefaultGameName()
		})
	};
}

export function setLastGameId(id: string): void {
	if (!browserStorageAvailable()) return;
	localStorage.setItem(LAST_GAME_KEY, id);
}

export function setLastPlayerName(name: string): void {
	const trimmedName = name.trim();
	if (!browserStorageAvailable() || !trimmedName) return;

	localStorage.setItem(LAST_PLAYER_NAME_KEY, trimmedName);
}

export function cloneSnapshot(snapshot: PersistedGameSnapshot): PersistedGameSnapshot {
	return structuredClone(snapshot);
}

function writeSavedGames(records: SavedGameRecord[]): void {
	if (!browserStorageAvailable()) return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function cloneRecord(record: SavedGameRecord): SavedGameRecord {
	return structuredClone(record);
}

function getUniqueRecentRecords(records: SavedGameRecord[]): SavedGameRecord[] {
	const seenNames = new Set<string>();
	const sortedRecords = [...records].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
	const uniqueRecords: SavedGameRecord[] = [];

	for (const record of sortedRecords) {
		const name = normalizeName(record.name);
		if (seenNames.has(name)) continue;

		seenNames.add(name);
		uniqueRecords.push(record);

		if (uniqueRecords.length >= MAX_SAVED_GAMES) break;
	}

	return uniqueRecords;
}

function normalizeName(name: string): string {
	return name.trim().toLocaleLowerCase();
}

function browserStorageAvailable(): boolean {
	return typeof localStorage !== 'undefined';
}

function isSavedGameRecord(value: unknown): value is SavedGameRecord {
	if (!value || typeof value !== 'object') return false;

	const record = value as SavedGameRecord;
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
