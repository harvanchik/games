import {
	CATEGORY_DEFINITIONS,
	getAllowedCategories,
	getUpperBonus,
	getUpperSubtotal,
	scoreCategory,
	UPPER_CATEGORIES
} from './scoring';
import type { CpuDifficulty, Dice, DiceValue, ScoreCategory, Scorecard } from './types';

type CpuProfile = {
	difficulty: CpuDifficulty;
	oversightRate: number;
	planningDepth: number;
	randomChoiceWindow: number;
	upperBonusWeight: number;
	chancePenalty: number;
	riskyComboWeight: number;
	earlyStopBias: number;
	scorecardLookaheadWeight: number;
};

type CategoryChoice = {
	category: ScoreCategory;
	score: number;
	value: number;
};

type HoldChoice = {
	holds: boolean[];
	value: number;
};

const CPU_PROFILES: Record<CpuDifficulty, CpuProfile> = {
	easy: {
		difficulty: 'easy',
		oversightRate: 0.24,
		planningDepth: 0,
		randomChoiceWindow: 5,
		upperBonusWeight: 0.35,
		chancePenalty: 2,
		riskyComboWeight: 0.3,
		earlyStopBias: 6,
		scorecardLookaheadWeight: 0.15
	},
	moderate: {
		difficulty: 'moderate',
		oversightRate: 0.1,
		planningDepth: 1,
		randomChoiceWindow: 3,
		upperBonusWeight: 0.8,
		chancePenalty: 6,
		riskyComboWeight: 0.75,
		earlyStopBias: 2,
		scorecardLookaheadWeight: 0.55
	},
	masterful: {
		difficulty: 'masterful',
		oversightRate: 0,
		planningDepth: 2,
		randomChoiceWindow: 1,
		upperBonusWeight: 1.2,
		chancePenalty: 11,
		riskyComboWeight: 1,
		earlyStopBias: 0,
		scorecardLookaheadWeight: 1
	}
};

const DICE_VALUES: DiceValue[] = [1, 2, 3, 4, 5, 6];
const UPPER_TARGET_TOTAL = 63;
const UPPER_TARGET_COUNTS: Record<DiceValue, number> = {
	1: 3,
	2: 6,
	3: 9,
	4: 12,
	5: 15,
	6: 18
};
const EXPECTED_FUTURE_CATEGORY_VALUE: Record<ScoreCategory, number> = {
	ones: 2.2,
	twos: 5.4,
	threes: 8.8,
	fours: 12.4,
	fives: 15.8,
	sixes: 19.0,
	threeKind: 21.5,
	fourKind: 14.5,
	fullHouse: 19.5,
	smallStraight: 24,
	largeStraight: 18,
	fiveKind: 9,
	chance: 23.5
};

const rerollDistributionCache = new Map<number, Array<{ values: DiceValue[]; weight: number }>>();

export function cpuMakesOversight(
	difficultyOrRandom: CpuDifficulty | (() => number) = 'moderate',
	random = Math.random
): boolean {
	if (typeof difficultyOrRandom === 'function') {
		return difficultyOrRandom() < CPU_PROFILES.moderate.oversightRate;
	}

	const profile = CPU_PROFILES[difficultyOrRandom];
	return random() < profile.oversightRate;
}

export function shouldCpuScoreNow(
	dice: DiceValue[],
	scorecard: Scorecard,
	rollCount: number,
	difficultyOrOversight: CpuDifficulty | boolean = 'moderate',
	random = Math.random
): boolean {
	if (rollCount >= 3) return true;

	const difficulty = normalizeDifficulty(difficultyOrOversight);
	const profile = CPU_PROFILES[difficulty];
	const oversight = typeof difficultyOrOversight === 'boolean' ? difficultyOrOversight : false;
	const bestChoice = getCategoryChoices(dice, scorecard, profile)[0];

	if (!bestChoice) return true;
	if (bestChoice.category === 'fiveKind' && bestChoice.score === 50) return true;
	if (bestChoice.category === 'largeStraight' && bestChoice.score === 40) return true;
	if (rollCount >= 2 && bestChoice.category === 'fullHouse' && bestChoice.score === 25) return true;
	if (oversight && rollCount >= 2 && bestChoice.score > 0) return true;

	if (profile.planningDepth === 0) {
		return bestChoice.score >= 20 + profile.earlyStopBias || (rollCount >= 2 && bestChoice.score >= 12);
	}

	const rollsLeft = Math.min(profile.planningDepth, 3 - rollCount);
	const futureValue = getBestHoldChoice(dice, scorecard, profile, rollsLeft).value;
	return bestChoice.value >= futureValue - profile.earlyStopBias;
}

export function chooseCpuScoreCategory(
	dice: DiceValue[],
	scorecard: Scorecard,
	difficultyOrOversight: CpuDifficulty | boolean = 'moderate',
	random = Math.random
): ScoreCategory {
	const difficulty = normalizeDifficulty(difficultyOrOversight);
	const profile = CPU_PROFILES[difficulty];
	const rankedChoices = getCategoryChoices(dice, scorecard, profile);

	if (!rankedChoices.length) return firstOpenCategory(scorecard);

	const positiveChoices = rankedChoices.filter((choice) => choice.score > 0);
	const pickableChoices = positiveChoices.length > 0 ? positiveChoices : rankedChoices;
	const oversight = typeof difficultyOrOversight === 'boolean' ? difficultyOrOversight : false;

	if (oversight || difficulty === 'easy') {
		const windowSize = Math.min(profile.randomChoiceWindow, pickableChoices.length);
		const pickableWindow = pickableChoices.slice(0, windowSize);
		return pickableWindow[Math.floor(random() * pickableWindow.length)].category;
	}

	return rankedChoices[0].category;
}

export function chooseCpuHeldDice(
	dice: Dice[],
	scorecard: Scorecard,
	difficultyOrOversight: CpuDifficulty | boolean = 'moderate',
	rollCount = 1,
	random = Math.random
): boolean[] {
	const values = dice.map((die) => die.value);
	const difficulty = normalizeDifficulty(difficultyOrOversight);
	const profile = CPU_PROFILES[difficulty];
	const oversight =
		typeof difficultyOrOversight === 'boolean' ? difficultyOrOversight : cpuMakesOversight(difficulty, random);

	if (oversight && difficulty !== 'masterful') {
		const heuristicHolds = getHeuristicHolds(values, scorecard, profile).holds;
		return heuristicHolds.map((hold) => (random() < 0.25 ? !hold : hold));
	}

	const rollsLeft = Math.min(profile.planningDepth, Math.max(0, 3 - rollCount));
	if (rollsLeft > 0) {
		return getBestHoldChoice(values, scorecard, profile, rollsLeft).holds;
	}

	return getHeuristicHolds(values, scorecard, profile).holds;
}

function getBestHoldChoice(
	values: DiceValue[],
	scorecard: Scorecard,
	profile: CpuProfile,
	rollsLeft: number
): HoldChoice {
	const memo = new Map<string, number>();
	let bestChoice: HoldChoice = { holds: values.map(() => false), value: Number.NEGATIVE_INFINITY };

	for (const mask of getHoldMasks(values.length)) {
		const heldValues = values.filter((_, index) => mask[index]);
		const expectedValue = getExpectedValueForHeldDice(heldValues, values.length - heldValues.length, scorecard, profile, rollsLeft, memo);

		if (expectedValue > bestChoice.value) {
			bestChoice = { holds: mask, value: expectedValue };
		}
	}

	return bestChoice;
}

function getExpectedTurnValue(
	values: DiceValue[],
	scorecard: Scorecard,
	profile: CpuProfile,
	rollsLeft: number,
	memo: Map<string, number>
): number {
	const sortedValues = [...values].sort((a, b) => a - b);
	const key = `${rollsLeft}:${sortedValues.join('')}`;
	const cachedValue = memo.get(key);
	if (cachedValue !== undefined) return cachedValue;

	if (rollsLeft <= 0) {
		const value = getCategoryChoices(sortedValues, scorecard, profile)[0]?.value ?? 0;
		memo.set(key, value);
		return value;
	}

	let bestValue = Number.NEGATIVE_INFINITY;
	for (const mask of getHoldMasks(sortedValues.length)) {
		const heldValues = sortedValues.filter((_, index) => mask[index]);
		const expectedValue = getExpectedValueForHeldDice(
			heldValues,
			sortedValues.length - heldValues.length,
			scorecard,
			profile,
			rollsLeft,
			memo
		);
		bestValue = Math.max(bestValue, expectedValue);
	}

	memo.set(key, bestValue);
	return bestValue;
}

function getExpectedValueForHeldDice(
	heldValues: DiceValue[],
	rerollCount: number,
	scorecard: Scorecard,
	profile: CpuProfile,
	rollsLeft: number,
	memo: Map<string, number>
): number {
	const distributions = getRerollDistributions(rerollCount);
	const totalWeight = distributions.reduce((total, distribution) => total + distribution.weight, 0);
	let weightedValue = 0;

	for (const distribution of distributions) {
		const nextValues = [...heldValues, ...distribution.values].sort((a, b) => a - b);
		weightedValue +=
			distribution.weight * getExpectedTurnValue(nextValues, scorecard, profile, rollsLeft - 1, memo);
	}

	return weightedValue / totalWeight;
}

function getCategoryChoices(
	dice: DiceValue[],
	scorecard: Scorecard,
	profile: CpuProfile
): CategoryChoice[] {
	const positionValueBefore = getScorecardPositionValue(scorecard, profile);
	const choices = getAllowedCategories(dice, scorecard).map((category) => {
		const score = scoreCategory(category, dice, scorecard);
		return {
			category,
			score,
			value: getCategoryValue(category, score, dice, scorecard, profile, positionValueBefore)
		};
	});
	const positiveChoices = choices.filter((choice) => choice.score > 0);
	const hasPositiveChoice = positiveChoices.length > 0;

	return choices
		.map((choice) => ({
			...choice,
			value: choice.score === 0 && hasPositiveChoice ? choice.value - 1000 : choice.value
		}))
		.sort((a, b) => b.value - a.value || b.score - a.score);
}

function getCategoryValue(
	category: ScoreCategory,
	score: number,
	dice: DiceValue[],
	scorecard: Scorecard,
	profile: CpuProfile,
	positionValueBefore: number
): number {
	if (score <= 0) {
		return (
			getZeroCategoryValue(category, scorecard) +
			getScorecardPositionDelta(category, score, scorecard, profile, positionValueBefore)
		);
	}

	let value = score;

	if (isUpperCategory(category)) {
		value += getUpperCategoryValue(category, score, scorecard, profile);
	}

	if (category === 'fiveKind') value += 30 * profile.riskyComboWeight;
	if (category === 'largeStraight') value += 18 * profile.riskyComboWeight;
	if (category === 'smallStraight') value += 9 * profile.riskyComboWeight;
	if (category === 'fullHouse') value += 7 * profile.riskyComboWeight;
	if (category === 'fourKind') value += score >= 24 ? 8 : 2;
	if (category === 'threeKind') value += score >= 23 ? 5 : 0;
	if (category === 'chance') value += score >= 24 ? 2 : -profile.chancePenalty;

	if (category === 'chance' && hasAnyOpenKindCategory(scorecard) && hasAtLeastMatchingDice(dice, 3)) {
		value -= 6;
	}

	return value + getScorecardPositionDelta(category, score, scorecard, profile, positionValueBefore);
}

function getScorecardPositionDelta(
	category: ScoreCategory,
	score: number,
	scorecard: Scorecard,
	profile: CpuProfile,
	positionValueBefore: number
): number {
	if (profile.scorecardLookaheadWeight <= 0) return 0;

	const nextScorecard = {
		...scorecard,
		[category]: score
	};

	return (
		(getScorecardPositionValue(nextScorecard, profile) - positionValueBefore) *
		profile.scorecardLookaheadWeight
	);
}

function getScorecardPositionValue(scorecard: Scorecard, profile: CpuProfile): number {
	const openCategories = CATEGORY_DEFINITIONS.filter((category) => scorecard[category.id] === null);
	const expectedOpenCategoryScore = openCategories.reduce(
		(total, category) => total + getExpectedFutureCategoryValue(category.id, scorecard, profile),
		0
	);

	return (
		expectedOpenCategoryScore +
		getExpectedUpperBonusValue(scorecard, profile) +
		getExpectedFiveKindBonusValue(scorecard, openCategories.length, profile)
	);
}

function getExpectedFutureCategoryValue(
	category: ScoreCategory,
	scorecard: Scorecard,
	profile: CpuProfile
): number {
	const baseValue = EXPECTED_FUTURE_CATEGORY_VALUE[category];

	if (!isUpperCategory(category)) {
		if (category === 'chance' && openCategoryCount(scorecard) > 8) return baseValue + profile.chancePenalty;
		if (category === 'fiveKind' && scorecard.fiveKind === null && openCategoryCount(scorecard) > 7) {
			return baseValue + 3 * profile.riskyComboWeight;
		}
		return baseValue;
	}

	const face = getUpperValue(category);
	if (!face) return baseValue;

	const upperSubtotal = getUpperSubtotal(scorecard);
	const openUpperCategories = UPPER_CATEGORIES.filter((upperCategory) => scorecard[upperCategory] === null);
	const remainingTarget = openUpperCategories.reduce(
		(total, upperCategory) => total + UPPER_TARGET_COUNTS[getUpperValue(upperCategory)!],
		0
	);
	const bonusStillLive = upperSubtotal + remainingTarget + openUpperCategories.length * 2 >= UPPER_TARGET_TOTAL;
	const highFacePressure = face >= 4 ? 2.5 * profile.upperBonusWeight : 0;

	return bonusStillLive ? baseValue + highFacePressure : baseValue * 0.8;
}

function getExpectedUpperBonusValue(scorecard: Scorecard, profile: CpuProfile): number {
	const upperSubtotal = getUpperSubtotal(scorecard);
	if (upperSubtotal >= UPPER_TARGET_TOTAL) return 35;

	const openUpperCategories = UPPER_CATEGORIES.filter((category) => scorecard[category] === null);
	if (openUpperCategories.length === 0) return 0;

	const expectedUpperTotal =
		upperSubtotal +
		openUpperCategories.reduce(
			(total, category) => total + EXPECTED_FUTURE_CATEGORY_VALUE[category],
			0
		);
	const practicalUpperCeiling =
		upperSubtotal +
		openUpperCategories.reduce(
			(total, category) => total + UPPER_TARGET_COUNTS[getUpperValue(category)!] + getUpperValue(category)!,
			0
		);

	if (practicalUpperCeiling < UPPER_TARGET_TOTAL) return 0;

	const bonusBuffer = expectedUpperTotal - UPPER_TARGET_TOTAL;
	const volatility = 5 + openUpperCategories.length * 3.25;
	const bonusProbability = clamp(1 / (1 + Math.exp(-bonusBuffer / volatility)), 0.05, 0.95);

	return 35 * bonusProbability * profile.upperBonusWeight;
}

function getExpectedFiveKindBonusValue(
	scorecard: Scorecard,
	openCategoryTotal: number,
	profile: CpuProfile
): number {
	if (scorecard.fiveKind !== 50 || openCategoryTotal < 2) return 0;

	return Math.min(18, openCategoryTotal * 1.5) * profile.riskyComboWeight;
}

function getUpperCategoryValue(
	category: ScoreCategory,
	score: number,
	scorecard: Scorecard,
	profile: CpuProfile
): number {
	const face = getUpperValue(category);
	if (!face) return 0;

	const upperSubtotalBefore = getUpperSubtotal(scorecard);
	const upperSubtotalAfter = upperSubtotalBefore + score;
	const bonusNow = upperSubtotalAfter >= UPPER_TARGET_TOTAL && getUpperBonus(scorecard) === 0 ? 35 : 0;
	const openUpperCategories = UPPER_CATEGORIES.filter((upperCategory) => scorecard[upperCategory] === null);
	const expectedTarget = UPPER_TARGET_COUNTS[face];
	const remainingTargetAfterThis = openUpperCategories
		.filter((upperCategory) => upperCategory !== category)
		.reduce((total, upperCategory) => total + UPPER_TARGET_COUNTS[getUpperValue(upperCategory)!], 0);
	const needsBonusHelp = upperSubtotalBefore + score + remainingTargetAfterThis >= UPPER_TARGET_TOTAL;
	const targetDifference = score - expectedTarget;

	let value = targetDifference * 1.6 * profile.upperBonusWeight + bonusNow * profile.upperBonusWeight;
	if (needsBonusHelp && score >= expectedTarget) value += 7 * profile.upperBonusWeight;
	if (face >= 4 && score >= expectedTarget) value += 4 * profile.upperBonusWeight;
	if (face <= 2 && score < expectedTarget) value -= 2 * profile.upperBonusWeight;

	return value;
}

function getZeroCategoryValue(category: ScoreCategory, scorecard: Scorecard): number {
	if (category === 'ones') return -1;
	if (category === 'twos') return -3;
	if (category === 'threeKind' && scorecard.fourKind !== null) return -8;
	if (category === 'fiveKind') return -12;
	if (category === 'chance') return -40;
	if (category === 'largeStraight') return -30;
	if (category === 'smallStraight') return -22;
	if (category === 'fullHouse') return -20;
	if (category === 'fourKind') return -18;
	return -10;
}

function getHeuristicHolds(
	values: DiceValue[],
	scorecard: Scorecard,
	profile: CpuProfile
): { holds: boolean[]; score: number } {
	const straightHolds = getStraightChaseHolds(values, scorecard, profile);
	const kindHolds = getKindChaseHolds(values, scorecard, profile);

	if (straightHolds.score > kindHolds.score) return straightHolds;
	return kindHolds;
}

function getKindChaseHolds(
	values: DiceValue[],
	scorecard: Scorecard,
	profile: CpuProfile
): { holds: boolean[]; score: number } {
	const counts = countValues(values);
	const sortedTargets = [...counts.entries()].sort((a, b) => {
		const countDiff = b[1] - a[1];
		if (countDiff !== 0) return countDiff;
		return b[0] - a[0];
	});
	const [targetValue, targetCount] = sortedTargets[0] ?? [values[0], 1];
	const upperCategory = getUpperCategory(targetValue);
	const upperOpen = scorecard[upperCategory] === null;
	const lowerOpen = hasAnyOpenKindCategory(scorecard);

	return {
		holds: values.map((value) => value === targetValue),
		score:
			targetCount * 13 +
			(upperOpen ? targetValue * profile.upperBonusWeight : 0) +
			(lowerOpen ? 8 * profile.riskyComboWeight : 0)
	};
}

function getStraightChaseHolds(
	values: DiceValue[],
	scorecard: Scorecard,
	profile: CpuProfile
): { holds: boolean[]; score: number } {
	if (scorecard.smallStraight !== null && scorecard.largeStraight !== null) {
		return { holds: values.map(() => false), score: 0 };
	}

	const runs: DiceValue[][] = [
		[1, 2, 3, 4, 5],
		[2, 3, 4, 5, 6],
		[1, 2, 3, 4],
		[2, 3, 4, 5],
		[3, 4, 5, 6]
	];
	let bestRun: DiceValue[] = [];
	let bestRunScore = 0;

	for (const run of runs) {
		const uniqueMatches = run.filter((value) => values.includes(value)).length;
		const runScore = uniqueMatches * 10 + (run.length === 5 ? 7 : 0) * profile.riskyComboWeight;
		if (runScore > bestRunScore) {
			bestRun = run;
			bestRunScore = runScore;
		}
	}

	const usedValues = new Set<DiceValue>();
	return {
		holds: values.map((value) => {
			if (!bestRun.includes(value) || usedValues.has(value)) return false;
			usedValues.add(value);
			return true;
		}),
		score: bestRunScore
	};
}

function getRerollDistributions(count: number): Array<{ values: DiceValue[]; weight: number }> {
	const cachedDistribution = rerollDistributionCache.get(count);
	if (cachedDistribution) return cachedDistribution;

	const weightedOutcomes = new Map<string, { values: DiceValue[]; weight: number }>();

	function buildOutcome(outcome: DiceValue[]): void {
		if (outcome.length === count) {
			const values = [...outcome].sort((a, b) => a - b);
			const key = values.join('');
			const existingOutcome = weightedOutcomes.get(key);

			if (existingOutcome) {
				existingOutcome.weight += 1;
			} else {
				weightedOutcomes.set(key, { values, weight: 1 });
			}

			return;
		}

		for (const value of DICE_VALUES) buildOutcome([...outcome, value]);
	}

	buildOutcome([]);
	const distributions = [...weightedOutcomes.values()];
	rerollDistributionCache.set(count, distributions);
	return distributions;
}

function getHoldMasks(length: number): boolean[][] {
	const masks: boolean[][] = [];
	const maskTotal = 1 << length;

	for (let mask = 0; mask < maskTotal; mask += 1) {
		masks.push(Array.from({ length }, (_, index) => Boolean(mask & (1 << index))));
	}

	return masks;
}

function countValues(values: DiceValue[]): Map<DiceValue, number> {
	const counts = new Map<DiceValue, number>();
	for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
	return counts;
}

function firstOpenCategory(scorecard: Scorecard): ScoreCategory {
	return CATEGORY_DEFINITIONS.find((category) => scorecard[category.id] === null)?.id ?? 'chance';
}

function isUpperCategory(category: ScoreCategory): boolean {
	return UPPER_CATEGORIES.includes(category as (typeof UPPER_CATEGORIES)[number]);
}

function getUpperValue(category: ScoreCategory): DiceValue | null {
	const values: Partial<Record<ScoreCategory, DiceValue>> = {
		ones: 1,
		twos: 2,
		threes: 3,
		fours: 4,
		fives: 5,
		sixes: 6
	};
	return values[category] ?? null;
}

function getUpperCategory(value: DiceValue): ScoreCategory {
	const categories: Record<DiceValue, ScoreCategory> = {
		1: 'ones',
		2: 'twos',
		3: 'threes',
		4: 'fours',
		5: 'fives',
		6: 'sixes'
	};
	return categories[value];
}

function hasAtLeastMatchingDice(dice: DiceValue[], neededCount: number): boolean {
	return [...countValues(dice).values()].some((count) => count >= neededCount);
}

function hasAnyOpenKindCategory(scorecard: Scorecard): boolean {
	return (
		scorecard.threeKind === null ||
		scorecard.fourKind === null ||
		scorecard.fiveKind === null ||
		scorecard.chance === null
	);
}

function openCategoryCount(scorecard: Scorecard): number {
	return CATEGORY_DEFINITIONS.filter((category) => scorecard[category.id] === null).length;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function normalizeDifficulty(difficultyOrOversight: CpuDifficulty | boolean): CpuDifficulty {
	if (difficultyOrOversight === 'easy' || difficultyOrOversight === 'moderate' || difficultyOrOversight === 'masterful') {
		return difficultyOrOversight;
	}

	return 'moderate';
}
