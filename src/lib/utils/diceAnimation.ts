export function createDiceScrambleDurations(
	diceCount: number,
	minimumDuration = 1000,
	finalDuration = 2000,
	random = Math.random
): number[] {
	if (diceCount <= 0) return [];

	const finalDieIndex = Math.floor(clampRandom(random()) * diceCount);

	return Array.from({ length: diceCount }, (_, index) => {
		if (index === finalDieIndex) return finalDuration;

		const durationRange = Math.max(1, finalDuration - minimumDuration);
		return minimumDuration + Math.floor(clampRandom(random()) * durationRange);
	});
}

function clampRandom(value: number): number {
	return Math.max(0, Math.min(0.999999, value));
}
