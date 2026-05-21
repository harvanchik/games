import { describe, expect, it } from 'vitest';
import { hasAnyScoringDice, scoreSelectedDice } from './farkleScoring';

describe('scoreSelectedDice', () => {
	it('scores single ones and fives', () => {
		const result = scoreSelectedDice([1, 5, 5]);

		expect(result.valid).toBe(true);
		expect(result.score).toBe(200);
	});

	it('scores three ones as 1000', () => {
		const result = scoreSelectedDice([1, 1, 1]);

		expect(result.valid).toBe(true);
		expect(result.score).toBe(1000);
	});

	it('scores other triples as value times 100', () => {
		const result = scoreSelectedDice([4, 4, 4]);

		expect(result.valid).toBe(true);
		expect(result.score).toBe(400);
	});

	it('scores a straight as 1500', () => {
		const result = scoreSelectedDice([1, 2, 3, 4, 5, 6]);

		expect(result.valid).toBe(true);
		expect(result.score).toBe(1500);
	});

	it('rejects selected non-scoring dice', () => {
		const result = scoreSelectedDice([2, 3, 4]);

		expect(result.valid).toBe(false);
		expect(result.score).toBe(0);
	});
});

describe('hasAnyScoringDice', () => {
	it('detects a farkle roll with no scoring dice', () => {
		expect(hasAnyScoringDice([2, 2, 3, 3, 4, 6])).toBe(false);
	});
});
