import { getFinalTotal, isScorecardComplete } from './scoring';
import type { CpuDifficulty, GameState, SavedGameRecord } from './types';

export interface CpuGameLogEntry {
	id: string;
	gameName: string;
	endedAt: string;
	difficulty: CpuDifficulty;
	humanName: string;
	cpuName: string;
	humanScore: number;
	cpuScore: number;
	result: 'win' | 'loss' | 'tie';
}

export interface CpuGameSummary {
	wins: number;
	losses: number;
	ties: number;
	games: number;
	averageHumanScore: number;
	averageCpuScore: number;
}

const STORAGE_KEY = 'poker-dice:cpu-game-history:v1';

export function loadCpuGameHistory(): CpuGameLogEntry[] {
	if (!browserStorageAvailable()) return [];

	try {
		const rawValue = localStorage.getItem(STORAGE_KEY);
		if (!rawValue) return [];

		const parsedValue = JSON.parse(rawValue);
		if (!Array.isArray(parsedValue)) return [];

		return parsedValue.filter(isCpuGameLogEntry).sort(compareEntriesByDateDesc);
	} catch {
		return [];
	}
}

export function saveCpuGameHistory(entries: CpuGameLogEntry[]): CpuGameLogEntry[] {
	const uniqueEntries = getUniqueEntries(entries).sort(compareEntriesByDateDesc);
	if (browserStorageAvailable()) {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(uniqueEntries));
	}

	return uniqueEntries;
}

export function migrateCpuGameHistoryFromSavedGames(
	savedGames: SavedGameRecord[],
	existingEntries = loadCpuGameHistory()
): CpuGameLogEntry[] {
	let entries = existingEntries;

	for (const savedGame of savedGames) {
		const entry = createCpuGameLogEntryFromSavedGame(savedGame);
		if (!entry || entries.some((existingEntry) => existingEntry.id === entry.id)) continue;

		entries = [entry, ...entries];
	}

	return saveCpuGameHistory(entries);
}

export function upsertCpuGameLogEntry(
	entries: CpuGameLogEntry[],
	game: GameState,
	gameId: string,
	gameName: string,
	endedAt = new Date().toISOString()
): CpuGameLogEntry[] {
	const entry = createCpuGameLogEntry(game, gameId, gameName, endedAt);
	if (!entry) return entries;

	const existingEntry = entries.find((candidate) => candidate.id === entry.id);
	const nextEntry = existingEntry ? { ...entry, endedAt: existingEntry.endedAt } : entry;

	return saveCpuGameHistory([
		nextEntry,
		...entries.filter((candidate) => candidate.id !== nextEntry.id)
	]);
}

export function getCpuGameSummary(entries: CpuGameLogEntry[]): CpuGameSummary {
	const games = entries.length;
	const wins = entries.filter((entry) => entry.result === 'win').length;
	const losses = entries.filter((entry) => entry.result === 'loss').length;
	const ties = entries.filter((entry) => entry.result === 'tie').length;
	const humanTotal = entries.reduce((total, entry) => total + entry.humanScore, 0);
	const cpuTotal = entries.reduce((total, entry) => total + entry.cpuScore, 0);

	return {
		wins,
		losses,
		ties,
		games,
		averageHumanScore: games > 0 ? Math.round(humanTotal / games) : 0,
		averageCpuScore: games > 0 ? Math.round(cpuTotal / games) : 0
	};
}

function createCpuGameLogEntryFromSavedGame(savedGame: SavedGameRecord): CpuGameLogEntry | null {
	return createCpuGameLogEntry(
		savedGame.snapshot.game,
		savedGame.id,
		savedGame.snapshot.gameName || savedGame.name,
		savedGame.updatedAt
	);
}

function createCpuGameLogEntry(
	game: GameState,
	gameId: string,
	gameName: string,
	endedAt: string
): CpuGameLogEntry | null {
	const human = game.players.find((player) => !player.isCpu);
	const cpu = game.players.find((player) => player.isCpu);
	if (!human || !cpu || game.players.length !== 2) return null;
	if (!game.players.every((player) => isScorecardComplete(player.scores))) return null;

	const humanScore = getFinalTotal(human.scores, human.fiveKindBonuses);
	const cpuScore = getFinalTotal(cpu.scores, cpu.fiveKindBonuses);
	const result = humanScore === cpuScore ? 'tie' : humanScore > cpuScore ? 'win' : 'loss';

	return {
		id: gameId,
		gameName: gameName.trim() || 'Poker Dice',
		endedAt,
		difficulty: game.cpuDifficulty ?? 'moderate',
		humanName: human.name || 'Player',
		cpuName: cpu.name || 'CPU',
		humanScore,
		cpuScore,
		result
	};
}

function getUniqueEntries(entries: CpuGameLogEntry[]): CpuGameLogEntry[] {
	const seenIds = new Set<string>();
	const uniqueEntries: CpuGameLogEntry[] = [];

	for (const entry of entries) {
		if (seenIds.has(entry.id)) continue;

		seenIds.add(entry.id);
		uniqueEntries.push(entry);
	}

	return uniqueEntries;
}

function compareEntriesByDateDesc(a: CpuGameLogEntry, b: CpuGameLogEntry): number {
	return Date.parse(b.endedAt) - Date.parse(a.endedAt);
}

function isCpuGameLogEntry(value: unknown): value is CpuGameLogEntry {
	if (!value || typeof value !== 'object') return false;

	const entry = value as CpuGameLogEntry;
	return (
		typeof entry.id === 'string' &&
		typeof entry.gameName === 'string' &&
		typeof entry.endedAt === 'string' &&
		isCpuDifficulty(entry.difficulty) &&
		typeof entry.humanName === 'string' &&
		typeof entry.cpuName === 'string' &&
		typeof entry.humanScore === 'number' &&
		typeof entry.cpuScore === 'number' &&
		(entry.result === 'win' || entry.result === 'loss' || entry.result === 'tie')
	);
}

function isCpuDifficulty(value: unknown): value is CpuDifficulty {
	return value === 'easy' || value === 'moderate' || value === 'masterful';
}

function browserStorageAvailable(): boolean {
	return typeof localStorage !== 'undefined';
}
