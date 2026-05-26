import { describe, expect, it } from 'vitest';
import { createCpuOpponentGame } from './game';
import { getCpuGameSummary, upsertCpuGameLogEntry } from './pokerDiceHistory';
import type { Scorecard } from './types';

const completedHumanScores: Scorecard = {
	ones: 3,
	twos: 6,
	threes: 9,
	fours: 12,
	fives: 15,
	sixes: 18,
	threeKind: 22,
	fourKind: 24,
	fullHouse: 25,
	smallStraight: 30,
	largeStraight: 40,
	fiveKind: 0,
	chance: 25
};

const completedCpuScores: Scorecard = {
	ones: 1,
	twos: 4,
	threes: 6,
	fours: 8,
	fives: 10,
	sixes: 12,
	threeKind: 18,
	fourKind: 0,
	fullHouse: 25,
	smallStraight: 30,
	largeStraight: 0,
	fiveKind: 0,
	chance: 20
};

describe('Poker Dice CPU history', () => {
	it('logs a completed CPU game with difficulty and final scores', () => {
		const game = createCpuOpponentGame('masterful');
		game.players[0].scores = { ...completedHumanScores };
		game.players[1].scores = { ...completedCpuScores };

		const entries = upsertCpuGameLogEntry([], game, 'game-1', 'Test Game', '2026-05-20T12:00:00.000Z');

		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			gameName: 'Test Game',
			difficulty: 'masterful',
			humanScore: 264,
			cpuScore: 134,
			result: 'win'
		});
	});

	it('summarizes wins, losses, ties, and average scores', () => {
		const summary = getCpuGameSummary([
			{
				id: 'game-1',
				gameName: 'Win',
				endedAt: '2026-05-20T12:00:00.000Z',
				difficulty: 'easy',
				humanName: 'Player',
				cpuName: 'CPU',
				humanScore: 250,
				cpuScore: 200,
				result: 'win'
			},
			{
				id: 'game-2',
				gameName: 'Loss',
				endedAt: '2026-05-20T13:00:00.000Z',
				difficulty: 'masterful',
				humanName: 'Player',
				cpuName: 'CPU',
				humanScore: 210,
				cpuScore: 260,
				result: 'loss'
			}
		]);

		expect(summary).toEqual({
			wins: 1,
			losses: 1,
			ties: 0,
			games: 2,
			averageHumanScore: 230,
			averageCpuScore: 230
		});
	});

	it('keeps the original completed date when the same game is logged again', () => {
		const game = createCpuOpponentGame('easy');
		game.players[0].scores = { ...completedHumanScores };
		game.players[1].scores = { ...completedCpuScores };

		let entries = upsertCpuGameLogEntry(
			[],
			game,
			'game-1',
			'Test Game',
			'2026-05-20T12:00:00.000Z'
		);
		entries = upsertCpuGameLogEntry(
			entries,
			game,
			'game-1',
			'Test Game',
			'2026-05-26T12:00:00.000Z'
		);

		expect(entries).toHaveLength(1);
		expect(entries[0].endedAt).toBe('2026-05-20T12:00:00.000Z');
	});
});
