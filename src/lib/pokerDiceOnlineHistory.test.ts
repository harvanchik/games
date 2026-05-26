import { describe, expect, it } from 'vitest';
import { createGame } from './game';
import {
	getOnlineGameSummary,
	getOnlineOpponentRecord,
	upsertOnlineGameLogEntry
} from './pokerDiceOnlineHistory';
import type { Scorecard } from './types';

const winningScores: Scorecard = {
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

const losingScores: Scorecard = {
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

describe('Poker Dice online history', () => {
	it('logs a completed online game from the local player perspective', () => {
		const game = createGame(2);
		game.players[0].name = 'Jake';
		game.players[1].name = 'Eric';
		game.players[0].scores = { ...winningScores };
		game.players[1].scores = { ...losingScores };

		const entries = upsertOnlineGameLogEntry(
			[],
			game,
			'online-1',
			game.players[0].id,
			undefined,
			'completed',
			'2026-05-21T12:00:00.000Z'
		);

		expect(entries[0]).toMatchObject({
			id: 'online-1',
			localName: 'Jake',
			opponentName: 'Eric',
			opponentKey: 'eric',
			localScore: 264,
			opponentScore: 134,
			result: 'win',
			finish: 'completed'
		});
	});

	it('groups opponent records without caring about name case', () => {
		const game = createGame(2);
		game.players[0].name = 'Jake';
		game.players[1].name = 'Eric';

		let entries = upsertOnlineGameLogEntry(
			[],
			game,
			'online-1',
			game.players[0].id,
			'win',
			'forfeit',
			'2026-05-21T12:00:00.000Z'
		);
		game.players[1].name = 'eRiC';
		entries = upsertOnlineGameLogEntry(
			entries,
			game,
			'online-2',
			game.players[0].id,
			'loss',
			'forfeit',
			'2026-05-21T13:00:00.000Z'
		);

		expect(getOnlineOpponentRecord(entries, 'ERIC')).toEqual({
			wins: 1,
			losses: 1,
			ties: 0,
			games: 2
		});
		expect(getOnlineGameSummary(entries)).toMatchObject({
			games: 2,
			wins: 1,
			losses: 1
		});
	});

	it('keeps the original completed date when the same online session is logged again', () => {
		const game = createGame(2);
		game.players[0].name = 'Jake';
		game.players[1].name = 'Eric';
		game.players[0].scores = { ...winningScores };
		game.players[1].scores = { ...losingScores };

		let entries = upsertOnlineGameLogEntry(
			[],
			game,
			'online-1',
			game.players[0].id,
			undefined,
			'completed',
			'2026-05-21T12:00:00.000Z'
		);
		entries = upsertOnlineGameLogEntry(
			entries,
			game,
			'online-1',
			game.players[0].id,
			undefined,
			'completed',
			'2026-05-26T12:00:00.000Z'
		);

		expect(entries).toHaveLength(1);
		expect(entries[0].endedAt).toBe('2026-05-21T12:00:00.000Z');
	});
});
