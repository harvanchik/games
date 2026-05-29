import { describe, expect, it } from 'vitest';
import {
	applyRoll,
	commitSelectedTiles,
	createShutBoxGame,
	getOpenTileSum,
	getTileCombinations,
	startShutBoxGame,
	toggleTile
} from './shutTheBoxGame';

describe('Shut the Box logic', () => {
	it('finds legal tile combinations for a roll total', () => {
		const combinations = getTileCombinations([1, 2, 3, 4, 5, 6, 7, 8, 9], 9);

		expect(combinations).toContainEqual([9]);
		expect(combinations).toContainEqual([4, 5]);
		expect(combinations).toContainEqual([1, 2, 6]);
	});

	it('closes selected tiles when they match the dice total', () => {
		const game = startShutBoxGame(['A', 'B'], 'local', 'Test');

		applyRoll(game, [3, 4]);
		toggleTile(game, 7);

		expect(commitSelectedTiles(game)).toBe(true);
		expect(game.players[0].closedTiles).toEqual([7]);
		expect(game.phase).toBe('ready');
	});

	it('ends a turn and advances when no move is available', () => {
		const game = startShutBoxGame(['A', 'B'], 'local', 'Test');
		game.players[0].closedTiles = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

		applyRoll(game, [1, 1]);

		expect(game.players[0].score).toBe(12);
		expect(game.activePlayerIndex).toBe(1);
		expect(game.phase).toBe('ready');
	});

	it('ends the game immediately when a player shuts the box', () => {
		const game = createShutBoxGame(['A', 'B']);
		game.setupComplete = true;
		game.players[0].closedTiles = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

		applyRoll(game, [6, 6]);
		toggleTile(game, 12);
		commitSelectedTiles(game);

		expect(getOpenTileSum(game.players[0])).toBe(0);
		expect(game.players[0].score).toBe(0);
		expect(game.phase).toBe('game-over');
		expect(game.winnerIds).toEqual([1]);
	});
});
