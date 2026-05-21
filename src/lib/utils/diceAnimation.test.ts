import { describe, expect, it } from 'vitest';
import { createDiceScrambleDurations } from './diceAnimation';

describe('createDiceScrambleDurations', () => {
	it('makes one random die last exactly two seconds', () => {
		const randomValues = [0.5, 0, 0.25, 0.75];
		const durations = createDiceScrambleDurations(3, 1000, 2000, () => randomValues.shift() ?? 0);

		expect(durations).toEqual([1000, 2000, 1250]);
	});

	it('keeps the only die at the final duration', () => {
		expect(createDiceScrambleDurations(1, 1000, 2000, () => 0)).toEqual([2000]);
	});
});
