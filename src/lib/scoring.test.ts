import { describe, expect, it } from 'vitest';
import {
	canScoreCategory,
	createEmptyScorecard,
	getAllowedCategories,
	getFinalTotal,
	scoreCategory
} from './scoring';
import { createGame, scoreTurn } from './game';
import type { DiceValue } from './types';

const dice = (...values: DiceValue[]) => values;

describe('scoreCategory', () => {
	it('scores upper section totals by matching face value', () => {
		expect(scoreCategory('fours', dice(4, 4, 2, 4, 6), createEmptyScorecard())).toBe(12);
	});

	it('scores kind and chance categories from all dice', () => {
		const scorecard = createEmptyScorecard();

		expect(scoreCategory('threeKind', dice(2, 2, 2, 4, 6), scorecard)).toBe(16);
		expect(scoreCategory('fourKind', dice(5, 5, 5, 5, 1), scorecard)).toBe(21);
		expect(scoreCategory('chance', dice(1, 3, 4, 5, 6), scorecard)).toBe(19);
	});

	it('scores fixed lower-section patterns', () => {
		const scorecard = createEmptyScorecard();

		expect(scoreCategory('fullHouse', dice(3, 3, 3, 6, 6), scorecard)).toBe(25);
		expect(scoreCategory('smallStraight', dice(1, 2, 3, 4, 6), scorecard)).toBe(30);
		expect(scoreCategory('largeStraight', dice(2, 3, 4, 5, 6), scorecard)).toBe(40);
		expect(scoreCategory('fiveKind', dice(6, 6, 6, 6, 6), scorecard)).toBe(50);
	});

	it('returns zero when required patterns are missing', () => {
		const scorecard = createEmptyScorecard();

		expect(scoreCategory('fullHouse', dice(3, 3, 3, 3, 6), scorecard)).toBe(0);
		expect(scoreCategory('smallStraight', dice(1, 1, 3, 4, 6), scorecard)).toBe(0);
		expect(scoreCategory('largeStraight', dice(1, 2, 3, 4, 6), scorecard)).toBe(0);
	});
});

describe('joker rules and bonuses', () => {
	it('forces the matching upper category when it is open', () => {
		const scorecard = createEmptyScorecard();
		scorecard.fiveKind = 50;

		expect(getAllowedCategories(dice(4, 4, 4, 4, 4), scorecard)).toEqual(['fours']);
		expect(canScoreCategory('fours', dice(4, 4, 4, 4, 4), scorecard, 1)).toBe(true);
		expect(canScoreCategory('fullHouse', dice(4, 4, 4, 4, 4), scorecard, 1)).toBe(false);
	});

	it('allows lower categories and applies fixed joker scores when matching upper is filled', () => {
		const scorecard = createEmptyScorecard();
		scorecard.fiveKind = 50;
		scorecard.fours = 12;

		expect(getAllowedCategories(dice(4, 4, 4, 4, 4), scorecard)).toContain('fullHouse');
		expect(scoreCategory('fullHouse', dice(4, 4, 4, 4, 4), scorecard)).toBe(25);
		expect(scoreCategory('smallStraight', dice(4, 4, 4, 4, 4), scorecard)).toBe(30);
		expect(scoreCategory('largeStraight', dice(4, 4, 4, 4, 4), scorecard)).toBe(40);
	});

	it('adds a 100-point bonus only after Five of a Kind already scored 50', () => {
		const game = createGame(1);
		const player = game.players[0];

		player.scores.fiveKind = 50;
		player.scores.sixes = 30;
		game.dice = dice(6, 6, 6, 6, 6).map((value) => ({ value, held: false }));
		game.rollCount = 1;

		scoreTurn(game, 'chance');

		expect(player.fiveKindBonuses).toBe(1);
		expect(getFinalTotal(player.scores, player.fiveKindBonuses)).toBeGreaterThanOrEqual(180);
	});
});

describe('scoreTurn safeguards', () => {
	it('ignores attempts to score before the first roll', () => {
		const game = createGame(1);
		const player = game.players[0];

		scoreTurn(game, 'chance');

		expect(player.scores.chance).toBeNull();
		expect(game.roundNumber).toBe(1);
	});

	it('ignores attempts to reuse a filled category', () => {
		const game = createGame(1);
		const player = game.players[0];

		game.dice = dice(1, 2, 3, 4, 5).map((value) => ({ value, held: false }));
		game.rollCount = 1;
		scoreTurn(game, 'chance');

		game.dice = dice(6, 6, 6, 6, 6).map((value) => ({ value, held: false }));
		game.rollCount = 1;
		scoreTurn(game, 'chance');

		expect(player.scores.chance).toBe(15);
		expect(game.roundNumber).toBe(2);
	});

	it('ignores attempts to bypass forced Joker upper scoring', () => {
		const game = createGame(1);
		const player = game.players[0];

		player.scores.fiveKind = 50;
		game.dice = dice(4, 4, 4, 4, 4).map((value) => ({ value, held: false }));
		game.rollCount = 1;
		scoreTurn(game, 'fullHouse');

		expect(player.scores.fullHouse).toBeNull();
		expect(player.scores.fours).toBeNull();
		expect(game.roundNumber).toBe(1);
	});
});

describe('local multiplayer turns', () => {
	it('advances through up to ten players before incrementing the round', () => {
		const game = createGame(10);

		for (let turn = 0; turn < 10; turn += 1) {
			game.dice = dice(1, 2, 3, 4, 5).map((value) => ({ value, held: false }));
			game.rollCount = 1;
			scoreTurn(game, 'chance');
		}

		expect(game.activePlayerIndex).toBe(0);
		expect(game.roundNumber).toBe(2);
		expect(game.players.every((player) => player.scores.chance === 15)).toBe(true);
	});
});
