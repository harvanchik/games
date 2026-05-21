import { createNewGameState } from './noDealOrDealGameLogic';
import type {
	NoDealOrDealGameState,
	NoDealOrDealSavedGameRecord
} from './noDealOrDealTypes';

const STORAGE_KEY = 'no-deal-or-deal:saves:v1';
const LAST_GAME_KEY = 'no-deal-or-deal:last-game-id:v1';
const SAVE_VERSION = 1;
export const MAX_NO_DEAL_SAVED_GAMES = 6;

export function createDefaultNoDealGameName(date = new Date()): string {
	const day = date.getDate();
	const month = date.toLocaleString('en-US', { month: 'short' });
	const year = date.getFullYear();
	let hours = date.getHours();
	const minutes = String(date.getMinutes()).padStart(2, '0');
	const meridiem = hours >= 12 ? 'pm' : 'am';

	hours = hours % 12 || 12;

	return `No Deal or Deal ${day} ${month} ${year} ${hours}:${minutes} ${meridiem}`;
}

export function createNoDealSaveId(): string {
	return `no-deal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadNoDealSavedGames(): NoDealOrDealSavedGameRecord[] {
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

export function loadNoDealLastGameId(): string | null {
	if (!browserStorageAvailable()) return null;
	return localStorage.getItem(LAST_GAME_KEY);
}

export function saveNoDealGameRecord(
	record: NoDealOrDealSavedGameRecord
): NoDealOrDealSavedGameRecord[] {
	const records = loadNoDealSavedGames();
	const nextName = normalizeName(record.name);
	const existingIndex = records.findIndex(
		(savedRecord) => savedRecord.id === record.id || normalizeName(savedRecord.name) === nextName
	);

	if (existingIndex < 0 && records.length >= MAX_NO_DEAL_SAVED_GAMES) return records;

	const nextRecord = structuredClone({
		...record,
		createdAt: existingIndex >= 0 ? records[existingIndex].createdAt : record.createdAt,
		updatedAt: new Date().toISOString(),
		version: SAVE_VERSION
	});

	if (existingIndex >= 0) {
		records[existingIndex] = nextRecord;
	} else {
		records.unshift(nextRecord);
	}

	records.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
	const cappedRecords = records.slice(0, MAX_NO_DEAL_SAVED_GAMES);
	writeSavedGames(cappedRecords);
	setNoDealLastGameId(nextRecord.id);
	return cappedRecords;
}

export function deleteNoDealSavedGame(id: string): NoDealOrDealSavedGameRecord[] {
	const records = loadNoDealSavedGames().filter((record) => record.id !== id);
	writeSavedGames(records);

	if (loadNoDealLastGameId() === id) {
		const nextId = records[0]?.id ?? '';
		if (nextId) {
			setNoDealLastGameId(nextId);
		} else {
			localStorage.removeItem(LAST_GAME_KEY);
		}
	}

	return records;
}

export function buildNoDealSaveRecord(
	id: string,
	name: string,
	game: NoDealOrDealGameState,
	createdAt?: string
): NoDealOrDealSavedGameRecord {
	const now = new Date().toISOString();
	const savedName = name.trim() || createDefaultNoDealGameName();

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

export function setNoDealLastGameId(id: string): void {
	if (!browserStorageAvailable()) return;
	localStorage.setItem(LAST_GAME_KEY, id);
}

export function getBlankNoDealSnapshot(): NoDealOrDealGameState {
	return createNewGameState();
}

function writeSavedGames(records: NoDealOrDealSavedGameRecord[]): void {
	if (!browserStorageAvailable()) return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function getUniqueRecentRecords(records: NoDealOrDealSavedGameRecord[]): NoDealOrDealSavedGameRecord[] {
	const seenNames = new Set<string>();
	const sortedRecords = [...records].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
	const uniqueRecords: NoDealOrDealSavedGameRecord[] = [];

	for (const record of sortedRecords) {
		const name = normalizeName(record.name);
		if (seenNames.has(name)) continue;

		seenNames.add(name);
		uniqueRecords.push(record);

		if (uniqueRecords.length >= MAX_NO_DEAL_SAVED_GAMES) break;
	}

	return uniqueRecords;
}

function normalizeName(name: string): string {
	return name.trim().toLocaleLowerCase();
}

function browserStorageAvailable(): boolean {
	return typeof localStorage !== 'undefined';
}

function isSavedGameRecord(value: unknown): value is NoDealOrDealSavedGameRecord {
	if (!value || typeof value !== 'object') return false;

	const record = value as NoDealOrDealSavedGameRecord;
	return (
		typeof record.id === 'string' &&
		typeof record.name === 'string' &&
		typeof record.createdAt === 'string' &&
		typeof record.updatedAt === 'string' &&
		typeof record.version === 'number' &&
		!!record.snapshot &&
		typeof record.snapshot === 'object' &&
		!!record.snapshot.game
	);
}
