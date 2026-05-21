import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame } from './game';
import {
	buildSaveRecord,
	createDefaultGameName,
	createSaveId,
	deleteSavedGame,
	loadLastGameId,
	loadSavedGames,
	MAX_SAVED_GAMES,
	saveGameRecord
} from './persistence';

const storage = new Map<string, string>();

beforeEach(() => {
	storage.clear();

	vi.stubGlobal('localStorage', {
		getItem: (key: string) => storage.get(key) ?? null,
		setItem: (key: string, value: string) => storage.set(key, value),
		removeItem: (key: string) => storage.delete(key)
	});
});

describe('persistence helpers', () => {
	it('creates the requested default game name format', () => {
		const name = createDefaultGameName(new Date('2026-05-16T21:07:00'));

		expect(name).toBe('Poker Dice 16 May 2026 9:07 pm');
	});

	it('saves, replaces, and marks the last opened game', () => {
		const id = createSaveId();
		const firstRecord = buildSaveRecord(id, 'Game One', {
			game: createGame(2),
			gameName: 'Game One',
			playerCount: 2,
			selectedScorecardIndex: 0,
			setupVisible: false
		});

		saveGameRecord(firstRecord);
		saveGameRecord(
			buildSaveRecord(id, 'Renamed Game', {
				game: createGame(3),
				gameName: 'Renamed Game',
				playerCount: 3,
				selectedScorecardIndex: 1,
				setupVisible: false
			})
		);

		const savedGames = loadSavedGames();

		expect(savedGames).toHaveLength(1);
		expect(savedGames[0].name).toBe('Renamed Game');
		expect(savedGames[0].snapshot.playerCount).toBe(3);
		expect(loadLastGameId()).toBe(id);
	});

	it('deletes saved games and falls back to the newest remaining game', () => {
		const firstRecord = buildSaveRecord(createSaveId(), 'First', {
			game: createGame(1),
			gameName: 'First',
			playerCount: 1,
			selectedScorecardIndex: 0,
			setupVisible: false
		});
		const secondRecord = buildSaveRecord(createSaveId(), 'Second', {
			game: createGame(1),
			gameName: 'Second',
			playerCount: 1,
			selectedScorecardIndex: 0,
			setupVisible: false
		});

		saveGameRecord(firstRecord);
		saveGameRecord(secondRecord);
		const savedGames = deleteSavedGame(secondRecord.id);

		expect(savedGames).toHaveLength(1);
		expect(savedGames[0].id).toBe(firstRecord.id);
		expect(loadLastGameId()).toBe(firstRecord.id);
	});

	it('caps saved games at six and replaces duplicate names', () => {
		for (let index = 0; index < MAX_SAVED_GAMES; index += 1) {
			saveGameRecord(
				buildSaveRecord(createSaveId(), `Game ${index + 1}`, {
					game: createGame(1),
					gameName: `Game ${index + 1}`,
					playerCount: 1,
					selectedScorecardIndex: 0,
					setupVisible: false
				})
			);
		}

		saveGameRecord(
			buildSaveRecord(createSaveId(), 'Extra Game', {
				game: createGame(1),
				gameName: 'Extra Game',
				playerCount: 1,
				selectedScorecardIndex: 0,
				setupVisible: false
			})
		);

		expect(loadSavedGames()).toHaveLength(MAX_SAVED_GAMES);
		expect(loadSavedGames().some((savedGame) => savedGame.name === 'Extra Game')).toBe(false);

		saveGameRecord(
			buildSaveRecord(createSaveId(), 'Game 3', {
				game: createGame(3),
				gameName: 'Game 3',
				playerCount: 3,
				selectedScorecardIndex: 0,
				setupVisible: false
			})
		);

		const savedGames = loadSavedGames();

		expect(savedGames).toHaveLength(MAX_SAVED_GAMES);
		expect(savedGames.filter((savedGame) => savedGame.name === 'Game 3')).toHaveLength(1);
		expect(savedGames.find((savedGame) => savedGame.name === 'Game 3')?.snapshot.playerCount).toBe(3);
	});
});
