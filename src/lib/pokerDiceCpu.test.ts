import { describe, expect, it } from 'vitest';
import { createEmptyScorecard, scoreCategory } from './scoring';
import {
	chooseCpuHeldDice,
	chooseCpuScoreCategory,
	cpuMakesOversight,
	shouldCpuScoreNow
} from './pokerDiceCpu';
import type { Dice } from './types';

describe('Poker Dice CPU', () => {
	it('takes a strong large straight immediately', () => {
		const scorecard = createEmptyScorecard();

		expect(shouldCpuScoreNow([1, 2, 3, 4, 5], scorecard, 1)).toBe(true);
		expect(chooseCpuScoreCategory([1, 2, 3, 4, 5], scorecard)).toBe('largeStraight');
	});

	it('keeps matching dice when chasing kind scores', () => {
		const scorecard = createEmptyScorecard();
		const dice: Dice[] = [
			{ value: 6, held: false },
			{ value: 6, held: false },
			{ value: 6, held: false },
			{ value: 4, held: false },
			{ value: 1, held: false }
		];

		expect(chooseCpuHeldDice(dice, scorecard, 'easy', 1, () => 0.99)).toEqual([
			true,
			true,
			true,
			false,
			false
		]);
	});

	it('occasionally allows a non-optimal category when oversight is forced', () => {
		const scorecard = createEmptyScorecard();
		const category = chooseCpuScoreCategory([6, 6, 6, 2, 1], scorecard, true, () => 0.99);

		expect(category).not.toBe('');
	});

	it('never chooses a zero-point category during an oversight when scoring categories exist', () => {
		const scorecard = createEmptyScorecard();
		const dice = [6, 6, 2, 3, 4] as const;
		const category = chooseCpuScoreCategory([...dice], scorecard, true, () => 0.99);

		expect(scoreCategory(category, [...dice], scorecard)).toBeGreaterThan(0);
	});

	it('keeps masterful CPU from making intentional oversights', () => {
		expect(cpuMakesOversight('masterful', () => 0)).toBe(false);
	});

	it('lets masterful choose upper bonus progress over a lower immediate total', () => {
		const scorecard = createEmptyScorecard();
		const dice = [6, 6, 6, 6, 2] as const;

		expect(chooseCpuScoreCategory([...dice], scorecard, 'masterful')).toBe('sixes');
	});

	it('never chooses zero for any difficulty when a positive score is available', () => {
		const scorecard = createEmptyScorecard();
		const dice = [5, 5, 2, 3, 4] as const;

		for (const difficulty of ['easy', 'moderate', 'masterful'] as const) {
			const category = chooseCpuScoreCategory([...dice], scorecard, difficulty, () => 0.99);

			expect(scoreCategory(category, [...dice], scorecard)).toBeGreaterThan(0);
		}
	});

	it('uses expected value planning to chase an open large straight', () => {
		const scorecard = createEmptyScorecard();
		const dice: Dice[] = [
			{ value: 2, held: false },
			{ value: 3, held: false },
			{ value: 4, held: false },
			{ value: 5, held: false },
			{ value: 5, held: false }
		];

		expect(chooseCpuHeldDice(dice, scorecard, 'masterful', 1)).toEqual([
			true,
			true,
			true,
			true,
			false
		]);
	});

	it('lets masterful cash the upper bonus instead of taking a bigger full house', () => {
		const scorecard = createEmptyScorecard();
		scorecard.ones = 3;
		scorecard.twos = 6;
		scorecard.threes = 9;
		scorecard.fives = 15;
		scorecard.sixes = 18;

		expect(chooseCpuScoreCategory([4, 4, 4, 2, 2], scorecard, 'masterful')).toBe('fours');
	});

	it('lets masterful preserve chance when an equal kind category is available', () => {
		const scorecard = createEmptyScorecard();

		expect(chooseCpuScoreCategory([6, 6, 6, 5, 4], scorecard, 'masterful')).toBe('threeKind');
	});
});
