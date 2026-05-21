import type { BellDiceValue, BellRollResult } from './bellRollTypes';

export function scoreBellRoll(dice: BellDiceValue[], target: BellDiceValue): BellRollResult {
	const allMatch = dice.every((value) => value === dice[0]);
	const targetMatches = dice.filter((value) => value === target).length;

	if (allMatch && dice[0] === target) {
		return {
			dice,
			points: 21,
			label: 'Perfect Triple',
			message: 'Perfect Triple! +21',
			turnContinues: true
		};
	}

	if (allMatch) {
		return {
			dice,
			points: 5,
			label: 'Mini Triple',
			message: 'Mini Triple! +5',
			turnContinues: true
		};
	}

	if (targetMatches > 0) {
		return {
			dice,
			points: targetMatches,
			label: 'Matches',
			message: `+${targetMatches}`,
			turnContinues: true
		};
	}

	return {
		dice,
		points: 0,
		label: 'No Score',
		message: '+0 Turn over.',
		turnContinues: false
	};
}

export function rollBellDice(): BellDiceValue[] {
	return [rollDie(), rollDie(), rollDie()];
}

export function formatDice(dice: BellDiceValue[]): string {
	return dice.join('-');
}

function rollDie(): BellDiceValue {
	return (Math.floor(Math.random() * 6) + 1) as BellDiceValue;
}
