import { describe, expect, it } from 'vitest';
import { createGame } from './game';
import {
	applyVerifiedRoll,
	createRollCommitment,
	deriveVerifiedDice,
	getPokerDiceRoomPeerId,
	verifyRollCommitment
} from './pokerDiceOnline';

describe('Poker Dice online helpers', () => {
	it('builds a stable PeerJS room id from a player code', () => {
		expect(getPokerDiceRoomPeerId(' ab-c12 ')).toBe('poker-dice-room-ABC12');
	});

	it('verifies committed dice secrets before deriving shared dice', async () => {
		const sessionId = 'session-a';
		const rollId = 'roll-a';
		const hostNonce = 'host-secret';
		const guestNonce = 'guest-secret';
		const hostCommit = await createRollCommitment(sessionId, rollId, 'host', hostNonce);

		expect(await verifyRollCommitment(sessionId, rollId, 'host', hostNonce, hostCommit)).toBe(true);
		expect(await verifyRollCommitment(sessionId, rollId, 'host', 'different', hostCommit)).toBe(false);
		expect(await deriveVerifiedDice(sessionId, rollId, hostNonce, guestNonce)).toEqual(
			await deriveVerifiedDice(sessionId, rollId, hostNonce, guestNonce)
		);
	});

	it('keeps held dice while applying verified rerolls', () => {
		const game = createGame(2);
		game.rollOff.active = false;
		game.rollCount = 1;
		game.dice = [
			{ value: 6, held: true },
			{ value: 2, held: false },
			{ value: 3, held: false },
			{ value: 4, held: true },
			{ value: 5, held: false }
		];

		applyVerifiedRoll(game, [1, 1, 2, 2, 3]);

		expect(game.dice).toEqual([
			{ value: 6, held: true },
			{ value: 1, held: false },
			{ value: 1, held: false },
			{ value: 4, held: true },
			{ value: 2, held: false }
		]);
		expect(game.rollCount).toBe(2);
	});
});
