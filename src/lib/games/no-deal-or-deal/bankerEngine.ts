import type { BankerEngineInput, BankerEngineOutput, PrizeAmount } from './noDealOrDealTypes';

const TOP_PRIZES = [1_000_000, 750_000, 500_000, 400_000];
const HIGH_PRIZE_THRESHOLD = 100_000;
const LOW_PRIZE_THRESHOLD = 1_000;
const PSYCHOLOGICAL_THRESHOLDS = [10_000, 25_000, 50_000, 75_000, 100_000, 250_000, 500_000];

export function generateBankerOffer(input: BankerEngineInput): BankerEngineOutput {
	const sortedAmounts = [...input.remainingPrizeAmounts].sort((a, b) => a - b);
	const expectedValue = average(sortedAmounts);
	const medianValue = median(sortedAmounts);
	const maxRemaining = Math.max(...sortedAmounts);
	const minRemaining = Math.min(...sortedAmounts);
	const highPrizeCount = sortedAmounts.filter((amount) => amount >= HIGH_PRIZE_THRESHOLD).length;
	const lowPrizeCount = sortedAmounts.filter((amount) => amount <= LOW_PRIZE_THRESHOLD).length;
	const boardStrength = calculateBoardStrength(sortedAmounts);
	const volatilityIndex = calculateVolatility(sortedAmounts, expectedValue);
	const riskIndex = calculateRisk(sortedAmounts, highPrizeCount, volatilityIndex);
	const baseMultiplier = stageMultiplier(input.roundNumber, input.gameStage);
	const personalityAdjustment = personalityMultiplier(input.personality, volatilityIndex);
	const momentumAdjustment = calculateMomentum(input.lastOpenedValues, sortedAmounts);
	const pressureAdjustment = calculatePressure(input, boardStrength, riskIndex);
	const rawMultiplier = baseMultiplier + personalityAdjustment + momentumAdjustment + pressureAdjustment;
	const offerMultiplier = clamp(rawMultiplier, 0.1, input.gameStage === 'final' ? 1.05 : 0.98);
	const previousOffer = input.previousOffers.at(-1)?.offerAmount ?? null;
	const unsmoothedOffer = expectedValue * offerMultiplier;
	const smoothedOffer = smoothOffer(unsmoothedOffer, previousOffer, input.lastOpenedValues);
	const roundedOffer = applyPsychologicalRounding(smoothedOffer, input.personality);
	const offerAmount = clamp(roundOffer(roundedOffer), 1, maxRemaining);

	return {
		id: input.previousOffers.length + 1,
		roundNumber: input.roundNumber,
		casesRemaining: input.casesRemaining,
		expectedValue,
		medianValue,
		maxRemaining,
		minRemaining,
		highPrizeCount,
		lowPrizeCount,
		riskIndex,
		volatilityIndex,
		boardStrength,
		offerMultiplier,
		offerAmount,
		offerExplanation: explainOffer(input, offerAmount, expectedValue, boardStrength, riskIndex)
	};
}

function calculateBoardStrength(amounts: PrizeAmount[]): number {
	const retainedTopPrizeScore = TOP_PRIZES.reduce(
		(score, prize) => score + (amounts.includes(prize) ? prize / 1_000_000 : 0),
		0
	);
	const highPrizeCount = amounts.filter((amount) => amount >= HIGH_PRIZE_THRESHOLD).length;
	return clamp(retainedTopPrizeScore / 2.65 + highPrizeCount / 10, 0, 1);
}

function calculateVolatility(amounts: PrizeAmount[], expectedValue: number): number {
	const spread = Math.max(...amounts) - Math.min(...amounts);
	const variance =
		amounts.reduce((total, amount) => total + Math.pow(amount - expectedValue, 2), 0) / amounts.length;
	const normalizedSpread = spread / 1_000_000;
	const normalizedDeviation = Math.sqrt(variance) / 450_000;
	return clamp((normalizedSpread + normalizedDeviation) / 2, 0, 1);
}

function calculateRisk(amounts: PrizeAmount[], highPrizeCount: number, volatilityIndex: number): number {
	const maxRemaining = Math.max(...amounts);
	const topHeavy = maxRemaining >= 500_000 && highPrizeCount <= 2 ? 0.25 : 0;
	const lowHeavy = amounts.filter((amount) => amount <= LOW_PRIZE_THRESHOLD).length / amounts.length;
	return clamp(volatilityIndex * 0.65 + topHeavy + lowHeavy * 0.2, 0, 1);
}

function stageMultiplier(roundNumber: number, gameStage: BankerEngineInput['gameStage']): number {
	if (gameStage === 'final') return 0.82;

	const ranges = [
		[0.18, 0.3],
		[0.25, 0.4],
		[0.35, 0.55],
		[0.45, 0.7],
		[0.55, 0.8]
	] as const;
	const [low, high] = ranges[Math.min(roundNumber - 1, ranges.length - 1)] ?? [0.65, 1.0];
	const lateBoost = roundNumber > 5 ? Math.min((roundNumber - 5) * 0.055, 0.22) : 0;

	return (low + high) / 2 + lateBoost;
}

function personalityMultiplier(personality: BankerEngineInput['personality'], volatilityIndex: number): number {
	if (personality === 'conservative') return -0.08;
	if (personality === 'generous') return 0.08;
	if (personality === 'dramatic') return volatilityIndex > 0.55 ? 0.09 : -0.02;
	return 0;
}

function calculateMomentum(openedValues: PrizeAmount[], remainingAmounts: PrizeAmount[]): number {
	if (!openedValues.length) return 0;

	const openedAverage = average(openedValues);
	const remainingAverage = average(remainingAmounts);
	const knockedTopPrize = openedValues.some((amount) => amount >= 750_000);
	const mostlyLow = openedValues.filter((amount) => amount <= 1_000).length >= Math.ceil(openedValues.length / 2);

	if (knockedTopPrize) return -0.16;
	if (mostlyLow) return 0.08;
	if (openedAverage > remainingAverage) return -0.07;
	return 0.04;
}

function calculatePressure(
	input: BankerEngineInput,
	boardStrength: number,
	riskIndex: number
): number {
	if (input.gameStage === 'final') return boardStrength * 0.12 - riskIndex * 0.1;
	if (input.topPrizeCountRemaining <= 1 && riskIndex > 0.7) return -0.06;
	if (input.highestPrizeStillInPlay && boardStrength > 0.7) return 0.05;
	return 0;
}

function smoothOffer(offer: number, previousOffer: number | null, openedValues: PrizeAmount[]): number {
	if (previousOffer === null) return offer;

	const majorHit = openedValues.some((amount) => amount >= 400_000);
	if (majorHit) return offer;

	const maxIncrease = previousOffer * 1.85 + 10_000;
	const maxDecrease = previousOffer * 0.42;
	return clamp(offer, maxDecrease, maxIncrease);
}

function applyPsychologicalRounding(offer: number, personality: BankerEngineInput['personality']): number {
	const threshold = PSYCHOLOGICAL_THRESHOLDS.find((value) => offer >= value * 0.92 && offer < value);
	if (threshold && (personality === 'dramatic' || personality === 'generous')) return threshold;
	return offer;
}

function roundOffer(offer: number): number {
	if (offer >= 100_000) return Math.round(offer / 5_000) * 5_000;
	if (offer >= 10_000) return Math.round(offer / 1_000) * 1_000;
	if (offer >= 1_000) return Math.round(offer / 100) * 100;
	if (offer >= 100) return Math.round(offer / 25) * 25;
	return Math.max(1, Math.round(offer));
}

function explainOffer(
	input: BankerEngineInput,
	offerAmount: number,
	expectedValue: number,
	boardStrength: number,
	riskIndex: number
): string {
	const openedMajorValue = input.lastOpenedValues.find((amount) => amount >= 400_000);
	if (openedMajorValue) {
		return `The Banker lowered pressure because you opened ${formatMoney(openedMajorValue)}.`;
	}

	const lowOpens = input.lastOpenedValues.filter((amount) => amount <= 1_000).length;
	if (lowOpens >= Math.max(1, Math.ceil(input.lastOpenedValues.length / 2))) {
		return 'The Banker raised the offer because you opened mostly low values.';
	}

	if (boardStrength > 0.7 && riskIndex > 0.6) {
		return 'This is a strong but cautious offer because the board is powerful and volatile.';
	}

	if (offerAmount >= expectedValue * 0.9) {
		return 'The offer is close to expected value because only a few cases remain.';
	}

	return 'The Banker is staying conservative while big prizes remain uncertain.';
}

function median(values: PrizeAmount[]): number {
	const middle = Math.floor(values.length / 2);
	return values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
}

function average(values: PrizeAmount[]): number {
	return values.reduce((total, value) => total + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(value, max));
}

function formatMoney(amount: number): string {
	return amount < 1
		? '$0.01'
		: amount.toLocaleString('en-US', {
				style: 'currency',
				currency: 'USD',
				maximumFractionDigits: 0
			});
}
