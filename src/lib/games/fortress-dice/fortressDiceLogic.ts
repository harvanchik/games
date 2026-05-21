import type {
	FortressActionOption,
	FortressCombo,
	FortressDiceValue,
	FortressGameState,
	FortressLane,
	FortressLaneId,
	FortressPlayer,
	FortressPlayerId,
	FortressSpeedTier
} from './fortressDiceTypes';

export const FORTRESS_LANE_IDS: FortressLaneId[] = [0, 1, 2];
export const FORTRESS_DEFAULT_HP = 30;
export const FORTRESS_MAX_ROLLS = 3;
export const FORTRESS_MAX_LANE_SHIELD = 12;
export const FORTRESS_COLLISION_DISTANCE = 3.5;
export const FORTRESS_DEFAULT_COOLDOWN_MS = 2000;
export const FORTRESS_SMALL_STRAIGHT_SHIELD = 10;
export const FORTRESS_LARGE_STRAIGHT_SHIELD = 8;
export const FORTRESS_FREEZE_MS = 3000;
export const FORTRESS_REGEN_MS = 5000;
export const FORTRESS_REGEN_HP_PER_SECOND = 1;
export const FORTRESS_SLOW_MS = 5000;
export const FORTRESS_SLOW_MULTIPLIER = 0.6;
export const FORTRESS_HASTE_MS = 5000;
export const FORTRESS_HASTE_MULTIPLIER = 1.4;

const LANE_NAMES = ['Left', 'Center', 'Right'];
const SPEED_TRAVEL_SECONDS: Record<FortressSpeedTier, number> = {
	single: 8,
	pair: 7,
	triple: 6,
	fourKind: 5,
	fiveKind: 6.5
};

export function createFortressGame(
	playerNames = ['Player 1', 'Player 2'],
	hpMax = FORTRESS_DEFAULT_HP,
	gameName = 'Fortress Dice'
): FortressGameState {
	const maxHp = clampHp(hpMax);
	return {
		setupComplete: false,
		gameName,
		phase: 'setup',
		hpMax: maxHp,
		players: [createPlayer(1, playerNames[0] || 'Player 1', maxHp), createPlayer(2, playerNames[1] || 'Player 2', maxHp)],
		lanes: createLanes(),
		activeCountdown: 0,
		winnerId: null,
		log: [],
		updatedAt: Date.now()
	};
}

export function startFortressGame(playerNames: string[], hpMax: number, gameName: string): FortressGameState {
	const game = createFortressGame(playerNames, hpMax, gameName);
	game.setupComplete = true;
	game.phase = 'ready';
	game.log = [createLog('Both players must tap Ready to begin.')];
	return game;
}

export function normalizeFortressGame(game: FortressGameState): FortressGameState {
	const fallback = createFortressGame();
	const normalized = {
		...fallback,
		...game,
		players: game.players ?? fallback.players,
		lanes: game.lanes ?? fallback.lanes,
		log: game.log ?? []
	} as FortressGameState;

	normalized.players = normalized.players.map((player, index) => ({
		...fallback.players[index],
		...player,
		damageDealt: player.damageDealt ?? 0,
		damageShielded: player.damageShielded ?? 0,
		damageRepaired: player.damageRepaired ?? 0,
		freezeEndsAt: player.freezeEndsAt ?? 0,
		regenEndsAt: player.regenEndsAt ?? 0,
		lastRegenTickAt: player.lastRegenTickAt ?? 0,
		dice: player.dice ?? [],
		lastRoll: player.lastRoll ?? []
	})) as [FortressPlayer, FortressPlayer];

	normalized.lanes = FORTRESS_LANE_IDS.map((laneId) => {
		const lane = normalized.lanes.find((candidate) => candidate.id === laneId) ?? createLane(laneId);
		return {
			id: laneId,
			shields: {
				1: clampShield(lane.shields?.[1] ?? 0),
				2: clampShield(lane.shields?.[2] ?? 0)
			},
			slowEndsAt: {
				1: lane.slowEndsAt?.[1] ?? 0,
				2: lane.slowEndsAt?.[2] ?? 0
			},
			hasteEndsAt: {
				1: lane.hasteEndsAt?.[1] ?? 0,
				2: lane.hasteEndsAt?.[2] ?? 0
			},
			units: (lane.units ?? []).map((unit) => {
				const legacyUnit = unit as typeof unit & { strength?: number };
				return {
					id: unit.id ?? createId('unit'),
					ownerId: unit.ownerId,
					laneId,
					combo: unit.combo ?? 'single',
					troops: Math.max(1, Math.ceil(unit.troops ?? legacyUnit.strength ?? 1)),
					speedTier: unit.speedTier ?? 'single',
					speed: getFortressUnitSpeed(unit.speedTier ?? 'single'),
					position: Math.max(0, Math.min(100, unit.position ?? (unit.ownerId === 1 ? 0 : 100))),
					direction: unit.ownerId === 1 ? 1 : -1,
					status: unit.status ?? 'moving'
				};
			})
		};
	});

	return normalized;
}

export function rollFortressDice(count = 5, random = Math.random): FortressDiceValue[] {
	return Array.from({ length: count }, () => (Math.floor(random() * 6) + 1) as FortressDiceValue);
}

export function getComboOptions(dice: FortressDiceValue[]): FortressActionOption[] {
	if (!dice.length) return [];

	const sorted = [...dice].sort((a, b) => a - b);
	const counts = getValueCounts(sorted);

	const fiveKindFace = getFaceWithCount(counts, 5);
	if (fiveKindFace) {
		return [
			createOption({
				combo: 'five-kind',
				type: 'troopMarch',
				target: 'allLanes',
				label: `All-Lane March ${fiveKindFace}`,
				description: `Send ${fiveKindFace} troops down every lane.`,
				troops: fiveKindFace,
				speedTier: 'fiveKind'
			})
		];
	}

	if (hasLargeStraight(sorted)) {
		return [
			createOption({
				combo: 'large-straight',
				type: 'shield',
				target: 'allLanes',
				label: 'Shield Wall',
				description: `Add ${FORTRESS_LARGE_STRAIGHT_SHIELD} shield to all lanes.`,
				shieldAmount: FORTRESS_LARGE_STRAIGHT_SHIELD
			})
		];
	}

	const fullHouse = getFullHouseFaces(counts);
	if (fullHouse) {
		return [
			createOption({
				combo: 'full-house',
				type: 'fullHousePush',
				target: 'selectedLane',
				label: 'Full House Push',
				description: `Add ${fullHouse.pairFace} shield and send ${fullHouse.tripleFace} troops down one lane.`,
				troops: fullHouse.tripleFace,
				shieldAmount: fullHouse.pairFace,
				speedTier: 'triple'
			})
		];
	}

	const fourKindFace = getFaceWithCount(counts, 4);
	if (fourKindFace) {
		return [
			createOption({
				combo: 'four-kind',
				type: 'troopMarch',
				target: 'selectedLane',
				label: `Rapid March ${fourKindFace}`,
				description: `Send ${fourKindFace} troops down one lane at high speed.`,
				troops: fourKindFace,
				speedTier: 'fourKind'
			})
		];
	}

	if (hasSmallStraight(sorted)) {
		return [
			createOption({
				combo: 'small-straight',
				type: 'shield',
				target: 'selectedLane',
				label: 'Lane Shield',
				description: `Add ${FORTRESS_SMALL_STRAIGHT_SHIELD} shield to one lane.`,
				shieldAmount: FORTRESS_SMALL_STRAIGHT_SHIELD
			})
		];
	}

	const tripleFace = getFaceWithCount(counts, 3);
	if (tripleFace) {
		return [
			createOption({
				combo: 'triple',
				type: 'troopMarch',
				target: 'selectedLane',
				label: `Triple March ${tripleFace}`,
				description: `Send ${tripleFace} troops down one lane at triple speed.`,
				troops: tripleFace,
				speedTier: 'triple'
			})
		];
	}

	const pairFaces = getFacesWithCount(counts, 2);
	if (pairFaces.length >= 2) {
		return pairFaces.slice(0, 2).map((face) =>
			createOption({
				combo: 'two-pair',
				type: 'troopMarch',
				target: 'selectedLane',
				label: `Pair March ${face}`,
				description: `Send ${face} troops down one lane at pair speed.`,
				troops: face,
				speedTier: 'pair'
			})
		);
	}

	const pairFace = pairFaces[0];
	if (pairFace) {
		return [
			createOption({
				combo: 'pair',
				type: 'troopMarch',
				target: 'selectedLane',
				label: `Pair March ${pairFace}`,
				description: `Send ${pairFace} troops down one lane at pair speed.`,
				troops: pairFace,
				speedTier: 'pair'
			})
		];
	}

	if (sorted.length === 1) return getSingleDieOptions(sorted[0]);
	return [];
}

export function commitFortressAction(
	game: FortressGameState,
	playerId: FortressPlayerId,
	option: FortressActionOption,
	laneId: FortressLaneId | null,
	now = Date.now()
): void {
	const player = getPlayer(game, playerId);
	const opponent = getPlayer(game, getOpponentId(playerId));
	const affectedLanes = getAffectedLanes(option, laneId);

	if (option.type === 'troopMarch') {
		for (const affectedLaneId of affectedLanes) addUnit(game, playerId, affectedLaneId, option.troops ?? 1, option.speedTier ?? 'single', option.combo);
	} else if (option.type === 'shield') {
		for (const affectedLaneId of affectedLanes) addLaneShield(game, playerId, affectedLaneId, option.shieldAmount ?? 0);
	} else if (option.type === 'fullHousePush') {
		if (laneId !== null) {
			addLaneShield(game, playerId, laneId, option.shieldAmount ?? 0);
			addUnit(game, playerId, laneId, option.troops ?? 1, option.speedTier ?? 'triple', option.combo);
		}
	} else if (option.type === 'freeze') {
		opponent.freezeEndsAt = now + (option.durationMs ?? FORTRESS_FREEZE_MS);
	} else if (option.type === 'regen') {
		player.regenEndsAt = now + (option.durationMs ?? FORTRESS_REGEN_MS);
		player.lastRegenTickAt = now;
	} else if (option.type === 'slowLane' && laneId !== null) {
		getLane(game, laneId).slowEndsAt[getOpponentId(playerId)] = now + (option.durationMs ?? FORTRESS_SLOW_MS);
	} else if (option.type === 'restoreShield' && laneId !== null) {
		getLane(game, laneId).shields[playerId] = FORTRESS_MAX_LANE_SHIELD;
	} else if (option.type === 'hasteLane' && laneId !== null) {
		getLane(game, laneId).hasteEndsAt[playerId] = now + (option.durationMs ?? FORTRESS_HASTE_MS);
	} else if (option.type === 'clearLane' && laneId !== null) {
		getLane(game, laneId).units = [];
	}

	player.cooldownEndsAt = now + getPlayerCooldown();
	player.rollCount = 0;
	player.dice = [];
	player.lastAction = option.label;
	game.log = [createLog(getActionLog(game, playerId, option, laneId)), ...game.log].slice(0, 12);
	game.updatedAt = now;
}

export function tickFortressGame(game: FortressGameState, elapsedMs: number, now = Date.now()): void {
	if (game.phase !== 'playing') return;

	applyRegeneration(game, now);
	const elapsedSeconds = Math.min(0.25, Math.max(0, elapsedMs / 1000));
	for (const lane of game.lanes) {
		moveLaneUnits(lane, elapsedSeconds, now);
		resolveUnitCollisions(lane);
		resolveFortressHits(lane, game);
	}

	for (const player of game.players) {
		if (player.freezeEndsAt <= now) player.freezeEndsAt = 0;
		if (player.hp <= 0 && !game.winnerId) {
			game.winnerId = getOpponentId(player.id);
			game.phase = 'game-over';
			game.log = [createLog(`${getPlayer(game, game.winnerId).name} wins the siege.`), ...game.log].slice(0, 12);
		}
	}

	game.updatedAt = now;
}

export function applyFortressDamage(player: FortressPlayer, lane: FortressLane, troops: number): number {
	let remainingTroops = Math.max(0, Math.ceil(troops));
	const shieldAbsorb = Math.min(lane.shields[player.id], remainingTroops);
	lane.shields[player.id] -= shieldAbsorb;
	remainingTroops -= shieldAbsorb;

	player.hp = Math.max(0, player.hp - remainingTroops);
	return remainingTroops;
}

export function resolveFightStrengths(firstTroops: number, secondTroops: number): [number, number] {
	const exchanged = Math.min(firstTroops, secondTroops);
	return [firstTroops - exchanged, secondTroops - exchanged];
}

export function getPlayerCooldown(): number {
	return FORTRESS_DEFAULT_COOLDOWN_MS;
}

export function isCooldownReady(player: FortressPlayer, now = Date.now()): boolean {
	return player.cooldownEndsAt <= now;
}

export function isPlayerFrozen(player: FortressPlayer, now = Date.now()): boolean {
	return player.freezeEndsAt > now;
}

export function getOpponentId(playerId: FortressPlayerId): FortressPlayerId {
	return playerId === 1 ? 2 : 1;
}

export function getLaneName(laneId: FortressLaneId): string {
	return LANE_NAMES[laneId] ?? 'Lane';
}

export function formatPower(value: number): string {
	return Math.ceil(value).toString();
}

export function getFortressUnitSpeed(speedTier: FortressSpeedTier = 'single'): number {
	return 100 / SPEED_TRAVEL_SECONDS[speedTier];
}

export function getSpeedTierLabel(speedTier?: FortressSpeedTier): string {
	if (!speedTier) return 'Instant';
	if (speedTier === 'fourKind') return 'Four-kind';
	if (speedTier === 'fiveKind') return 'Five-kind';
	return `${speedTier[0].toUpperCase()}${speedTier.slice(1)}`;
}

function createPlayer(id: FortressPlayerId, name: string, maxHp: number): FortressPlayer {
	return {
		id,
		name,
		hp: maxHp,
		maxHp,
		damageDealt: 0,
		damageShielded: 0,
		damageRepaired: 0,
		ready: false,
		cooldownEndsAt: 0,
		freezeEndsAt: 0,
		regenEndsAt: 0,
		lastRegenTickAt: 0,
		dice: [],
		rollCount: 0,
		lastAction: '-',
		lastRoll: []
	};
}

function createLanes(): FortressLane[] {
	return FORTRESS_LANE_IDS.map(createLane);
}

function createLane(id: FortressLaneId): FortressLane {
	return {
		id,
		shields: { 1: 0, 2: 0 },
		slowEndsAt: { 1: 0, 2: 0 },
		hasteEndsAt: { 1: 0, 2: 0 },
		units: []
	};
}

function getSingleDieOptions(face: FortressDiceValue): FortressActionOption[] {
	const options = [
		createOption({
			combo: 'single',
			type: 'troopMarch',
			target: 'selectedLane',
			label: `March ${face}`,
			description: `Send ${face} troops down one lane.`,
			troops: face,
			speedTier: 'single'
		})
	];

	if (face === 1) {
		options.push(createOption({ combo: 'single', type: 'freeze', target: 'opponent', label: 'Freeze', description: 'Lock opponent dice and actions for 3 seconds.', durationMs: FORTRESS_FREEZE_MS }));
	} else if (face === 2) {
		options.push(createOption({ combo: 'single', type: 'regen', target: 'self', label: 'Regen', description: 'Restore 1 fortress HP per second for 5 seconds.', hpPerSecond: FORTRESS_REGEN_HP_PER_SECOND, durationMs: FORTRESS_REGEN_MS }));
	} else if (face === 3) {
		options.push(createOption({ combo: 'single', type: 'slowLane', target: 'selectedLane', label: 'Slow Lane', description: 'Slow enemy troops in one lane for 5 seconds.', slowMultiplier: FORTRESS_SLOW_MULTIPLIER, durationMs: FORTRESS_SLOW_MS }));
	} else if (face === 4) {
		options.push(createOption({ combo: 'single', type: 'restoreShield', target: 'selectedLane', label: 'Restore Shield', description: 'Refill one selected lane shield.', shieldAmount: FORTRESS_MAX_LANE_SHIELD }));
	} else if (face === 5) {
		options.push(createOption({ combo: 'single', type: 'hasteLane', target: 'selectedLane', label: 'Haste Lane', description: 'Speed up your troops in one lane for 5 seconds.', speedMultiplier: FORTRESS_HASTE_MULTIPLIER, durationMs: FORTRESS_HASTE_MS }));
	} else if (face === 6) {
		options.push(createOption({ combo: 'single', type: 'clearLane', target: 'selectedLane', label: 'Clear Lane', description: 'Remove all troops from both sides on one lane.' }));
	}

	return options;
}

function createOption(input: Omit<FortressActionOption, 'id'>): FortressActionOption {
	const slug = `${input.combo}-${input.type}-${input.target}-${input.label.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`;
	return { id: slug, ...input };
}

function getValueCounts(dice: FortressDiceValue[]): Map<FortressDiceValue, number> {
	const counts = new Map<FortressDiceValue, number>();
	for (const value of dice) counts.set(value, (counts.get(value) ?? 0) + 1);
	return counts;
}

function getFaceWithCount(counts: Map<FortressDiceValue, number>, neededCount: number): FortressDiceValue | null {
	return [...counts.entries()].find(([, count]) => count >= neededCount)?.[0] ?? null;
}

function getFacesWithCount(counts: Map<FortressDiceValue, number>, neededCount: number): FortressDiceValue[] {
	return [...counts.entries()]
		.filter(([, count]) => count >= neededCount)
		.map(([face]) => face)
		.sort((a, b) => a - b);
}

function getFullHouseFaces(counts: Map<FortressDiceValue, number>): { tripleFace: FortressDiceValue; pairFace: FortressDiceValue } | null {
	const tripleFace = [...counts.entries()].find(([, count]) => count === 3)?.[0];
	const pairFace = [...counts.entries()].find(([, count]) => count === 2)?.[0];
	return tripleFace && pairFace ? { tripleFace, pairFace } : null;
}

function hasSmallStraight(dice: FortressDiceValue[]): boolean {
	const values = new Set(dice);
	return (
		[1, 2, 3, 4].every((value) => values.has(value as FortressDiceValue)) ||
		[2, 3, 4, 5].every((value) => values.has(value as FortressDiceValue)) ||
		[3, 4, 5, 6].every((value) => values.has(value as FortressDiceValue))
	);
}

function hasLargeStraight(dice: FortressDiceValue[]): boolean {
	const values = new Set(dice);
	return (
		[1, 2, 3, 4, 5].every((value) => values.has(value as FortressDiceValue)) ||
		[2, 3, 4, 5, 6].every((value) => values.has(value as FortressDiceValue))
	);
}

function getAffectedLanes(option: FortressActionOption, laneId: FortressLaneId | null): FortressLaneId[] {
	if (option.target === 'allLanes') return [0, 1, 2];
	if (option.target === 'selectedLane' && laneId !== null) return [laneId];
	return [];
}

function addUnit(
	game: FortressGameState,
	ownerId: FortressPlayerId,
	laneId: FortressLaneId,
	troops: number,
	speedTier: FortressSpeedTier,
	combo: FortressCombo
): void {
	const direction = ownerId === 1 ? 1 : -1;
	getLane(game, laneId).units.push({
		id: createId('unit'),
		ownerId,
		laneId,
		combo,
		troops,
		speedTier,
		speed: getFortressUnitSpeed(speedTier),
		position: ownerId === 1 ? 0 : 100,
		direction,
		status: 'moving'
	});
}

function addLaneShield(game: FortressGameState, ownerId: FortressPlayerId, laneId: FortressLaneId, amount: number): void {
	const lane = getLane(game, laneId);
	lane.shields[ownerId] = clampShield(lane.shields[ownerId] + amount);
}

function applyRegeneration(game: FortressGameState, now: number): void {
	for (const player of game.players) {
		if (player.regenEndsAt <= now || player.hp >= player.maxHp) {
			if (player.regenEndsAt <= now) player.regenEndsAt = 0;
			player.lastRegenTickAt = now;
			continue;
		}

		const elapsedMs = Math.max(0, now - (player.lastRegenTickAt || now));
		if (!elapsedMs) continue;
		const healed = Math.min(player.maxHp - player.hp, (elapsedMs / 1000) * FORTRESS_REGEN_HP_PER_SECOND);
		player.hp += healed;
		player.damageRepaired += healed;
		player.lastRegenTickAt = now;
	}
}

function moveLaneUnits(lane: FortressLane, elapsedSeconds: number, now: number): void {
	for (const unit of lane.units) {
		if (unit.status !== 'moving') continue;
		let speed = getFortressUnitSpeed(unit.speedTier);
		if (lane.slowEndsAt[unit.ownerId] > now) speed *= FORTRESS_SLOW_MULTIPLIER;
		if (lane.hasteEndsAt[unit.ownerId] > now) speed *= FORTRESS_HASTE_MULTIPLIER;
		unit.speed = speed;
		unit.position += unit.direction * speed * elapsedSeconds;
		unit.position = Math.max(0, Math.min(100, unit.position));
	}
}

function resolveUnitCollisions(lane: FortressLane): void {
	const units = [...lane.units];
	for (const first of units) {
		for (const second of units) {
			if (first.id >= second.id || first.ownerId === second.ownerId) continue;
			if (Math.abs(first.position - second.position) > FORTRESS_COLLISION_DISTANCE) continue;

			first.status = 'fighting';
			second.status = 'fighting';
			const [firstLeft, secondLeft] = resolveFightStrengths(first.troops, second.troops);
			first.troops = firstLeft;
			second.troops = secondLeft;

			if (first.troops <= 0) removeUnit(lane, first.id);
			if (second.troops <= 0) removeUnit(lane, second.id);
			if (first.troops > 0 && second.troops <= 0) first.status = 'moving';
			if (second.troops > 0 && first.troops <= 0) second.status = 'moving';
		}
	}
}

function resolveFortressHits(lane: FortressLane, game: FortressGameState): void {
	for (const unit of [...lane.units]) {
		if ((unit.ownerId === 1 && unit.position < 100) || (unit.ownerId === 2 && unit.position > 0)) continue;

		const defender = getPlayer(game, getOpponentId(unit.ownerId));
		const hpDamage = applyFortressDamage(defender, lane, unit.troops);
		const attacker = getPlayer(game, unit.ownerId);
		attacker.damageDealt += hpDamage;
		defender.damageShielded += Math.max(0, unit.troops - hpDamage);
		game.log = [createLog(`${attacker.name} sent ${unit.troops} troops through ${getLaneName(lane.id)}.`), ...game.log].slice(0, 12);
		removeUnit(lane, unit.id);
	}
}

function getActionLog(game: FortressGameState, playerId: FortressPlayerId, option: FortressActionOption, laneId: FortressLaneId | null): string {
	const player = getPlayer(game, playerId);
	const laneName = laneId === null ? '' : getLaneName(laneId);
	if (option.type === 'troopMarch' && option.target === 'allLanes') return `${player.name} launched ${option.troops} troops down every lane.`;
	if (option.type === 'troopMarch') return `${player.name} sent ${option.troops} troops down ${laneName}.`;
	if (option.type === 'shield' && option.target === 'allLanes') return `${player.name} raised shields across all lanes.`;
	if (option.type === 'shield') return `${player.name} added ${option.shieldAmount} shield to ${laneName}.`;
	if (option.type === 'fullHousePush') return `${player.name} added ${option.shieldAmount} shield and sent ${option.troops} troops down ${laneName}.`;
	if (option.type === 'freeze') return `${getPlayer(game, getOpponentId(playerId)).name} dice are frozen for 3 seconds.`;
	if (option.type === 'regen') return `${player.name} began regenerating HP.`;
	if (option.type === 'slowLane') return `Enemy troops are slowed on ${laneName}.`;
	if (option.type === 'restoreShield') return `${laneName} shield restored to full.`;
	if (option.type === 'hasteLane') return `Friendly troops are hastened on ${laneName}.`;
	if (option.type === 'clearLane') return `All troops were cleared from ${laneName}.`;
	return `${player.name}: ${option.label}`;
}

function getPlayer(game: FortressGameState, playerId: FortressPlayerId): FortressPlayer {
	return game.players.find((player) => player.id === playerId) ?? game.players[0];
}

function getLane(game: FortressGameState, laneId: FortressLaneId): FortressLane {
	return game.lanes.find((lane) => lane.id === laneId) ?? game.lanes[0];
}

function removeUnit(lane: FortressLane, unitId: string): void {
	lane.units = lane.units.filter((unit) => unit.id !== unitId);
}

function clampShield(value: number): number {
	return Math.min(FORTRESS_MAX_LANE_SHIELD, Math.max(0, Math.ceil(value || 0)));
}

function createLog(message: string) {
	return { id: createId('log'), message };
}

function createId(prefix: string): string {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampHp(hp: number): number {
	return Math.min(100, Math.max(10, Math.round(hp || FORTRESS_DEFAULT_HP)));
}
