import type { FarkleDiceValue, FarkleScoreResult } from './farkleTypes';

export function rollFarkleDice(count: number): FarkleDiceValue[] {
	return Array.from({ length: count }, () => (Math.floor(Math.random() * 6) + 1) as FarkleDiceValue);
}

export function scoreSelectedDice(values: FarkleDiceValue[]): FarkleScoreResult {
	if (!values.length) return { score: 0, valid: false, label: 'Select scoring dice', scoringIndexes: [] };

	const counts = countValues(values);
	const scoringIndexes = values.map((_, index) => index);

	if (values.length === 6 && isStraight(counts)) {
		return { score: 1500, valid: true, label: 'Straight', scoringIndexes };
	}

	if (values.length === 6 && isThreePairs(counts)) {
		return { score: 1500, valid: true, label: 'Three Pairs', scoringIndexes };
	}

	if (values.length === 6 && isTwoTriplets(counts)) {
		return { score: 2500, valid: true, label: 'Two Triplets', scoringIndexes };
	}

	let score = 0;
	const labels: string[] = [];
	const remaining = new Map(counts);

	for (const [value, count] of [...remaining.entries()]) {
		if (count >= 6) {
			score += 3000;
			remaining.set(value, count - 6);
			labels.push('Six of a Kind');
		} else if (count >= 5) {
			score += 2000;
			remaining.set(value, count - 5);
			labels.push('Five of a Kind');
		} else if (count >= 4) {
			score += 1000;
			remaining.set(value, count - 4);
			labels.push('Four of a Kind');
		} else if (count >= 3) {
			score += value === 1 ? 1000 : value * 100;
			remaining.set(value, count - 3);
			labels.push(`${value}s Triple`);
		}
	}

	const ones = remaining.get(1) ?? 0;
	const fives = remaining.get(5) ?? 0;
	score += ones * 100 + fives * 50;
	if (ones) labels.push(`${ones} One${ones === 1 ? '' : 's'}`);
	if (fives) labels.push(`${fives} Five${fives === 1 ? '' : 's'}`);
	remaining.set(1, 0);
	remaining.set(5, 0);

	const hasUnscoredDice = [...remaining.values()].some((count) => count > 0);
	if (hasUnscoredDice || score === 0) {
		return { score: 0, valid: false, label: 'Selection includes non-scoring dice', scoringIndexes: [] };
	}

	return { score, valid: true, label: labels.join(' + '), scoringIndexes };
}

export function hasAnyScoringDice(values: FarkleDiceValue[]): boolean {
	const counts = countValues(values);
	return (
		values.some((value) => value === 1 || value === 5) ||
		[...counts.values()].some((count) => count >= 3) ||
		(values.length === 6 && (isStraight(counts) || isThreePairs(counts) || isTwoTriplets(counts)))
	);
}

function countValues(values: FarkleDiceValue[]): Map<FarkleDiceValue, number> {
	const counts = new Map<FarkleDiceValue, number>();
	for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
	return counts;
}

function isStraight(counts: Map<FarkleDiceValue, number>): boolean {
	return [1, 2, 3, 4, 5, 6].every((value) => counts.get(value as FarkleDiceValue) === 1);
}

function isThreePairs(counts: Map<FarkleDiceValue, number>): boolean {
	return [...counts.values()].filter((count) => count === 2).length === 3;
}

function isTwoTriplets(counts: Map<FarkleDiceValue, number>): boolean {
	return [...counts.values()].filter((count) => count === 3).length === 2;
}
