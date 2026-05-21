import type {
	CategoryDefinition,
	DiceValue,
	LowerCategory,
	ScoreCategory,
	Scorecard,
	UpperCategory
} from './types';

export const UPPER_CATEGORIES: UpperCategory[] = [
	'ones',
	'twos',
	'threes',
	'fours',
	'fives',
	'sixes'
];

export const LOWER_CATEGORIES: LowerCategory[] = [
	'threeKind',
	'fourKind',
	'fullHouse',
	'smallStraight',
	'largeStraight',
	'fiveKind',
	'chance'
];

export const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
	{ id: 'ones', name: 'Ones', section: 'upper', description: 'Add all dice showing 1.' },
	{ id: 'twos', name: 'Twos', section: 'upper', description: 'Add all dice showing 2.' },
	{ id: 'threes', name: 'Threes', section: 'upper', description: 'Add all dice showing 3.' },
	{ id: 'fours', name: 'Fours', section: 'upper', description: 'Add all dice showing 4.' },
	{ id: 'fives', name: 'Fives', section: 'upper', description: 'Add all dice showing 5.' },
	{ id: 'sixes', name: 'Sixes', section: 'upper', description: 'Add all dice showing 6.' },
	{
		id: 'threeKind',
		name: 'Three of a Kind',
		section: 'lower',
		description: 'At least 3 matching dice; score all dice.'
	},
	{
		id: 'fourKind',
		name: 'Four of a Kind',
		section: 'lower',
		description: 'At least 4 matching dice; score all dice.'
	},
	{
		id: 'fullHouse',
		name: 'Full House',
		section: 'lower',
		description: 'Three of one value and two of another; score 25.'
	},
	{
		id: 'smallStraight',
		name: 'Small Straight',
		section: 'lower',
		description: 'Any 4-number run; score 30.'
	},
	{
		id: 'largeStraight',
		name: 'Large Straight',
		section: 'lower',
		description: 'Any 5-number run; score 40.'
	},
	{
		id: 'fiveKind',
		name: 'Five of a Kind',
		section: 'lower',
		description: 'All 5 dice match; score 50.'
	},
	{ id: 'chance', name: 'Chance', section: 'lower', description: 'Score the total of all dice.' }
];

export const CATEGORY_BY_ID = Object.fromEntries(
	CATEGORY_DEFINITIONS.map((category) => [category.id, category])
) as Record<ScoreCategory, CategoryDefinition>;

const UPPER_VALUE_BY_CATEGORY: Record<UpperCategory, DiceValue> = {
	ones: 1,
	twos: 2,
	threes: 3,
	fours: 4,
	fives: 5,
	sixes: 6
};

const UPPER_CATEGORY_BY_VALUE: Record<DiceValue, UpperCategory> = {
	1: 'ones',
	2: 'twos',
	3: 'threes',
	4: 'fours',
	5: 'fives',
	6: 'sixes'
};

export function createEmptyScorecard(): Scorecard {
	return {
		ones: null,
		twos: null,
		threes: null,
		fours: null,
		fives: null,
		sixes: null,
		threeKind: null,
		fourKind: null,
		fullHouse: null,
		smallStraight: null,
		largeStraight: null,
		fiveKind: null,
		chance: null
	};
}

export function getUpperCategoryForValue(value: DiceValue): UpperCategory {
	return UPPER_CATEGORY_BY_VALUE[value];
}

export function isScorecardComplete(scorecard: Scorecard): boolean {
	return CATEGORY_DEFINITIONS.every((category) => scorecard[category.id] !== null);
}

export function getUpperSubtotal(scorecard: Scorecard): number {
	return UPPER_CATEGORIES.reduce((total, category) => total + (scorecard[category] ?? 0), 0);
}

export function getUpperBonus(scorecard: Scorecard): number {
	return getUpperSubtotal(scorecard) >= 63 ? 35 : 0;
}

export function getLowerSubtotal(scorecard: Scorecard): number {
	return LOWER_CATEGORIES.reduce((total, category) => total + (scorecard[category] ?? 0), 0);
}

export function getBaseTotal(scorecard: Scorecard): number {
	return getUpperSubtotal(scorecard) + getUpperBonus(scorecard) + getLowerSubtotal(scorecard);
}

export function getFinalTotal(scorecard: Scorecard, fiveKindBonuses: number): number {
	return getBaseTotal(scorecard) + fiveKindBonuses * 100;
}

export function isFiveOfKind(dice: DiceValue[]): boolean {
	return dice.length === 5 && dice.every((value) => value === dice[0]);
}

export function hasFiveKindBonusAvailable(dice: DiceValue[], scorecard: Scorecard): boolean {
	return isFiveOfKind(dice) && scorecard.fiveKind === 50;
}

export function getAllowedCategories(dice: DiceValue[], scorecard: Scorecard): ScoreCategory[] {
	const openCategories = CATEGORY_DEFINITIONS.filter((category) => scorecard[category.id] === null);

	// Joker rules only start after Five of a Kind has already been scored as 50.
	if (!hasFiveKindBonusAvailable(dice, scorecard)) {
		return openCategories.map((category) => category.id);
	}

	const matchingUpper = getUpperCategoryForValue(dice[0]);
	if (scorecard[matchingUpper] === null) {
		return [matchingUpper];
	}

	const openLowerCategories = openCategories
		.filter((category) => category.section === 'lower')
		.map((category) => category.id);

	// This fallback keeps an edge-case endgame from becoming stuck if only upper boxes remain open.
	return openLowerCategories.length > 0
		? openLowerCategories
		: openCategories.map((category) => category.id);
}

export function canScoreCategory(
	category: ScoreCategory,
	dice: DiceValue[],
	scorecard: Scorecard,
	rollCount: number
): boolean {
	return rollCount > 0 && getAllowedCategories(dice, scorecard).includes(category);
}

export function scoreCategory(
	category: ScoreCategory,
	dice: DiceValue[],
	scorecard: Scorecard
): number {
	const counts = getCounts(dice);
	const sum = dice.reduce((total, value) => total + value, 0);

	// Under Joker rules, filled matching upper boxes make several lower categories automatic.
	if (hasFiveKindBonusAvailable(dice, scorecard)) {
		const matchingUpper = getUpperCategoryForValue(dice[0]);
		const matchingUpperIsFilled = scorecard[matchingUpper] !== null;

		if (matchingUpperIsFilled) {
			if (category === 'fullHouse') return 25;
			if (category === 'smallStraight') return 30;
			if (category === 'largeStraight') return 40;
			if (category === 'threeKind' || category === 'fourKind' || category === 'chance') return sum;
		}
	}

	if (isUpperCategory(category)) {
		const targetValue = UPPER_VALUE_BY_CATEGORY[category];
		return dice.filter((value) => value === targetValue).reduce((total, value) => total + value, 0);
	}

	if (category === 'threeKind') return hasAtLeastOfAKind(counts, 3) ? sum : 0;
	if (category === 'fourKind') return hasAtLeastOfAKind(counts, 4) ? sum : 0;
	if (category === 'fullHouse') return isFullHouse(counts) ? 25 : 0;
	if (category === 'smallStraight') return hasSmallStraight(dice) ? 30 : 0;
	if (category === 'largeStraight') return hasLargeStraight(dice) ? 40 : 0;
	if (category === 'fiveKind') return isFiveOfKind(dice) ? 50 : 0;
	return sum;
}

function isUpperCategory(category: ScoreCategory): category is UpperCategory {
	return UPPER_CATEGORIES.includes(category as UpperCategory);
}

function getCounts(dice: DiceValue[]): Map<DiceValue, number> {
	const counts = new Map<DiceValue, number>();

	for (const value of dice) {
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}

	return counts;
}

function hasAtLeastOfAKind(counts: Map<DiceValue, number>, neededCount: number): boolean {
	return [...counts.values()].some((count) => count >= neededCount);
}

function isFullHouse(counts: Map<DiceValue, number>): boolean {
	const sortedCounts = [...counts.values()].sort((a, b) => a - b);
	return sortedCounts.length === 2 && sortedCounts[0] === 2 && sortedCounts[1] === 3;
}

function hasSmallStraight(dice: DiceValue[]): boolean {
	const values = new Set(dice);
	const straights: DiceValue[][] = [
		[1, 2, 3, 4],
		[2, 3, 4, 5],
		[3, 4, 5, 6]
	];

	return straights.some((straight) => straight.every((value) => values.has(value)));
}

function hasLargeStraight(dice: DiceValue[]): boolean {
	const values = new Set(dice);
	return (
		[1, 2, 3, 4, 5].every((value) => values.has(value as DiceValue)) ||
		[2, 3, 4, 5, 6].every((value) => values.has(value as DiceValue))
	);
}
