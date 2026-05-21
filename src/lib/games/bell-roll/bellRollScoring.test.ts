import { describe, expect, it } from 'vitest';
import { scoreBellRoll } from './bellRollScoring';

describe('scoreBellRoll', () => {
	it('scores a Perfect Triple when all dice match the round target', () => {
		const result = scoreBellRoll([4, 4, 4], 4);

		expect(result.points).toBe(21);
		expect(result.label).toBe('Perfect Triple');
		expect(result.turnContinues).toBe(true);
	});

	it('scores a Mini Triple when all dice match each other but not the target', () => {
		const result = scoreBellRoll([6, 6, 6], 4);

		expect(result.points).toBe(5);
		expect(result.label).toBe('Mini Triple');
		expect(result.turnContinues).toBe(true);
	});

	it('scores one point per target match when no triple rule applies', () => {
		const result = scoreBellRoll([4, 4, 2], 4);

		expect(result.points).toBe(2);
		expect(result.label).toBe('Matches');
	});

	it('ends the turn when no scoring rule applies', () => {
		const result = scoreBellRoll([1, 2, 3], 4);

		expect(result.points).toBe(0);
		expect(result.label).toBe('No Score');
		expect(result.turnContinues).toBe(false);
	});
});
