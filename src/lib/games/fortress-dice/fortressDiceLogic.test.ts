import { describe, expect, it } from 'vitest';
import {
	applyFortressDamage,
	commitFortressAction,
	createFortressGame,
	FORTRESS_DEFAULT_COOLDOWN_MS,
	FORTRESS_DEFAULT_HP,
	FORTRESS_LARGE_STRAIGHT_SHIELD,
	FORTRESS_MAX_LANE_SHIELD,
	FORTRESS_SMALL_STRAIGHT_SHIELD,
	getFortressUnitSpeed,
	getComboOptions,
	resolveFightStrengths,
	startFortressGame
} from './fortressDiceLogic';

describe('Fortress Dice troop-march actions', () => {
	it('defaults new games to 30 fortress hp', () => {
		const game = createFortressGame();

		expect(game.hpMax).toBe(FORTRESS_DEFAULT_HP);
		expect(game.players[0].hp).toBe(FORTRESS_DEFAULT_HP);
		expect(game.players[1].hp).toBe(FORTRESS_DEFAULT_HP);
	});

	it('shows march and tactical options for one selected die', () => {
		const one = getComboOptions([1]);
		const four = getComboOptions([4]);

		expect(one.map((option) => option.type)).toEqual(['troopMarch', 'freeze']);
		expect(one[0]).toMatchObject({ troops: 1, speedTier: 'single', target: 'selectedLane' });
		expect(four.map((option) => option.type)).toEqual(['troopMarch', 'restoreShield']);
	});

	it('uses face value as troop count and matching count as speed tier', () => {
		expect(getComboOptions([4, 4])[0]).toMatchObject({ combo: 'pair', type: 'troopMarch', troops: 4, speedTier: 'pair' });
		expect(getComboOptions([5, 5, 5])[0]).toMatchObject({ combo: 'triple', type: 'troopMarch', troops: 5, speedTier: 'triple' });
		expect(getComboOptions([6, 6, 6, 6])[0]).toMatchObject({ combo: 'four-kind', type: 'troopMarch', troops: 6, speedTier: 'fourKind' });
		expect(getComboOptions([2, 2, 2, 2, 2])[0]).toMatchObject({ combo: 'five-kind', type: 'troopMarch', troops: 2, speedTier: 'fiveKind', target: 'allLanes' });
	});

	it('only shows the strongest recognized repeated combo tier', () => {
		expect(getComboOptions([4, 4, 4]).every((option) => option.combo === 'triple')).toBe(true);
		expect(getComboOptions([6, 6, 6, 6]).every((option) => option.combo === 'four-kind')).toBe(true);
		expect(getComboOptions([2, 2, 2, 2, 2]).every((option) => option.combo === 'five-kind')).toBe(true);
		expect(getComboOptions([4, 4, 4, 1, 1]).every((option) => option.combo === 'full-house')).toBe(true);
	});

	it('shows one pair-speed march option per pair for two pair', () => {
		const options = getComboOptions([4, 4, 3, 3]);

		expect(options).toHaveLength(2);
		expect(options.every((option) => option.combo === 'two-pair' && option.type === 'troopMarch')).toBe(true);
		expect(options.map((option) => option.troops)).toEqual([3, 4]);
	});

	it('turns straights into shield actions only', () => {
		const small = getComboOptions([1, 2, 3, 4])[0];
		const large = getComboOptions([1, 2, 3, 4, 5])[0];

		expect(small).toMatchObject({ combo: 'small-straight', type: 'shield', target: 'selectedLane', shieldAmount: FORTRESS_SMALL_STRAIGHT_SHIELD });
		expect(large).toMatchObject({ combo: 'large-straight', type: 'shield', target: 'allLanes', shieldAmount: FORTRESS_LARGE_STRAIGHT_SHIELD });
	});

	it('turns full house into one shield plus troop push', () => {
		const fullHouse = getComboOptions([3, 3, 3, 5, 5])[0];

		expect(fullHouse).toMatchObject({
			combo: 'full-house',
			type: 'fullHousePush',
			troops: 3,
			shieldAmount: 5,
			speedTier: 'triple',
			target: 'selectedLane'
		});
	});

	it('uses the recommended travel-time speed tiers', () => {
		expect(getFortressUnitSpeed('single')).toBeCloseTo(12.5);
		expect(getFortressUnitSpeed('pair')).toBeGreaterThan(getFortressUnitSpeed('single'));
		expect(getFortressUnitSpeed('fourKind')).toBeGreaterThan(getFortressUnitSpeed('triple'));
		expect(getFortressUnitSpeed('fiveKind')).toBeLessThan(getFortressUnitSpeed('fourKind'));
	});
});

describe('Fortress Dice troop combat', () => {
	it('applies lane shields before fortress hp', () => {
		const game = createFortressGame(['A', 'B'], 30);
		const defender = game.players[0];
		const lane = game.lanes[0];
		lane.shields[1] = 5;

		const hpDamage = applyFortressDamage(defender, lane, 12);

		expect(hpDamage).toBe(7);
		expect(lane.shields[1]).toBe(0);
		expect(defender.hp).toBe(23);
	});

	it('returns leftover troops after a unit fight', () => {
		expect(resolveFightStrengths(12, 7)).toEqual([5, 0]);
		expect(resolveFightStrengths(4, 9)).toEqual([0, 5]);
	});

	it('commits selected-lane and all-lane troop marches', () => {
		const now = 1000;
		const game = startFortressGame(['A', 'B'], 30, 'Test');
		const pairMarch = getComboOptions([3, 3])[0];
		const fiveKindMarch = getComboOptions([6, 6, 6, 6, 6])[0];

		commitFortressAction(game, 1, pairMarch, 0, now);
		commitFortressAction(game, 2, fiveKindMarch, null, now);

		expect(game.players[0].cooldownEndsAt).toBe(now + FORTRESS_DEFAULT_COOLDOWN_MS);
		expect(game.lanes[0].units.find((unit) => unit.ownerId === 1)).toMatchObject({ troops: 3, speedTier: 'pair' });
		expect(game.lanes.every((lane) => lane.units.some((unit) => unit.ownerId === 2 && unit.troops === 6))).toBe(true);
	});

	it('commits tactical effects and shield caps', () => {
		const game = startFortressGame(['A', 'B'], 30, 'Test');
		const restoreShield = getComboOptions([4]).find((option) => option.type === 'restoreShield')!;
		const freeze = getComboOptions([1]).find((option) => option.type === 'freeze')!;
		const regen = getComboOptions([2]).find((option) => option.type === 'regen')!;
		const now = 1000;

		game.lanes[0].shields[1] = 2;
		commitFortressAction(game, 1, restoreShield, 0, now);
		commitFortressAction(game, 1, freeze, null, now);
		commitFortressAction(game, 1, regen, null, now);

		expect(game.lanes[0].shields[1]).toBe(FORTRESS_MAX_LANE_SHIELD);
		expect(game.players[1].freezeEndsAt).toBeGreaterThan(now);
		expect(game.players[0].regenEndsAt).toBeGreaterThan(now);
	});
});
