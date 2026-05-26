import {
	CATEGORY_DEFINITIONS,
	canScoreCategory,
	createEmptyScorecard,
	getFinalTotal,
	hasFiveKindBonusAvailable,
	isScorecardComplete,
	scoreCategory
} from './scoring';
import type {
	CpuDifficulty,
	Dice,
	DiceValue,
	GameState,
	Player,
	PlayerCount,
	RollOffState,
	ScoreCategory
} from './types';

export function createGame(playerCount: PlayerCount = 1, cpuDifficulty: CpuDifficulty = 'moderate'): GameState {
	const players = Array.from({ length: playerCount }, (_, index) => createPlayer(index + 1));

	return {
		players,
		activePlayerIndex: 0,
		dice: createFreshDice(),
		rollCount: 0,
		roundNumber: 1,
		cpuDifficulty,
		rollOff: createRollOff(players)
	};
}

export function createCpuOpponentGame(cpuDifficulty: CpuDifficulty = 'moderate'): GameState {
	const game = createGame(2, cpuDifficulty);
	game.players[1] = {
		...game.players[1],
		name: 'CPU',
		isCpu: true
	};

	return game;
}

export function createPlayer(id: number): Player {
	return {
		id,
		name: `Player ${id}`,
		isCpu: false,
		scores: createEmptyScorecard(),
		fiveKindBonuses: 0,
		lastTurnScore: null,
		lastTurnCategory: null,
		screenRotation: 0
	};
}

export function createFreshDice(): Dice[] {
	return [1, 2, 3, 4, 5].map((value) => ({
		value: value as DiceValue,
		held: false
	}));
}

export function createCompletedRollOff(): RollOffState {
	return {
		active: false,
		eligiblePlayerIds: [],
		currentPlayerId: null,
		results: [],
		pickerPlayerId: null,
		status: 'complete'
	};
}

export function createRollOff(players: Player[]): RollOffState {
	return {
		active: true,
		eligiblePlayerIds: players.map((player) => player.id),
		currentPlayerId: players[0]?.id ?? null,
		results: [],
		pickerPlayerId: null,
		status: 'rolling'
	};
}

export function rollOpenDice(dice: Dice[]): Dice[] {
	return dice.map((die) => (die.held ? die : { value: rollDie(), held: false }));
}

export function toggleDieHold(dice: Dice[], index: number): Dice[] {
	return dice.map((die, dieIndex) => (dieIndex === index ? { ...die, held: !die.held } : die));
}

export function scoreTurn(game: GameState, category: ScoreCategory): GameState {
	if (!scoreCurrentTurn(game, category)) {
		return game;
	}

	completeTurn(game);

	return game;
}

export function scoreCurrentTurn(game: GameState, category: ScoreCategory): boolean {
	const player = game.players[game.activePlayerIndex];
	const diceValues = game.dice.map((die) => die.value);

	// Keep rule enforcement in the state helper so UI mistakes cannot save an illegal score.
	if (!canScoreCategory(category, diceValues, player.scores, game.rollCount)) {
		return false;
	}

	const score = scoreCategory(category, diceValues, player.scores);
	const earnsFiveKindBonus = hasFiveKindBonusAvailable(diceValues, player.scores);

	player.scores[category] = score;
	player.lastTurnScore = score + (earnsFiveKindBonus ? 100 : 0);
	player.lastTurnCategory = category;

	// Bonus Five of a Kinds only count when Five of a Kind was already scored as 50.
	if (earnsFiveKindBonus) {
		player.fiveKindBonuses += 1;
	}

	return true;
}

export function completeTurn(game: GameState): GameState {
	advanceTurn(game);
	game.dice = createFreshDice();
	game.rollCount = 0;

	return game;
}

export function isGameOver(game: GameState): boolean {
	return game.players.every((player) => isScorecardComplete(player.scores));
}

export function ensureActivePlayerCanMove(game: GameState): GameState {
	if (isGameOver(game)) return game;

	const activePlayer = game.players[game.activePlayerIndex];
	if (activePlayer && !isScorecardComplete(activePlayer.scores)) {
		game.roundNumber = getDisplayedRoundForPlayer(activePlayer);
		return game;
	}

	const nextPlayerIndex = getNextPlayerWithOpenCategory(game, game.activePlayerIndex);
	if (nextPlayerIndex !== null) {
		game.activePlayerIndex = nextPlayerIndex;
		game.roundNumber = getDisplayedRoundForPlayer(game.players[nextPlayerIndex]);
	}

	return game;
}

export function getWinnerText(players: Player[]): string {
	if (!players.every((player) => isScorecardComplete(player.scores))) {
		return '';
	}

	const rankedPlayers = [...players].sort(
		(a, b) => getFinalTotal(b.scores, b.fiveKindBonuses) - getFinalTotal(a.scores, a.fiveKindBonuses)
	);
	const highScore = getFinalTotal(rankedPlayers[0].scores, rankedPlayers[0].fiveKindBonuses);
	const winners = rankedPlayers.filter(
		(player) => getFinalTotal(player.scores, player.fiveKindBonuses) === highScore
	);

	return winners.length === 1
		? `${winners[0].name} wins with ${highScore} points.`
		: `Tie game at ${highScore} points.`;
}

function rollDie(): DiceValue {
	return (Math.floor(Math.random() * 6) + 1) as DiceValue;
}

function advanceTurn(game: GameState): void {
	if (isGameOver(game)) return;

	const nextPlayerIndex = getNextPlayerWithOpenCategory(game, game.activePlayerIndex);
	if (nextPlayerIndex === null) {
		return;
	}

	game.activePlayerIndex = nextPlayerIndex;
	ensureActivePlayerCanMove(game);
}

function getNextPlayerWithOpenCategory(game: GameState, fromIndex: number): number | null {
	const playerCount = game.players.length;
	if (playerCount === 0) return null;

	for (let offset = 1; offset <= playerCount; offset += 1) {
		const playerIndex = (fromIndex + offset) % playerCount;
		const player = game.players[playerIndex];
		if (player && !isScorecardComplete(player.scores)) {
			return playerIndex;
		}
	}

	return null;
}

function getDisplayedRoundForPlayer(player: Player): number {
	const scoredCategoryCount = CATEGORY_DEFINITIONS.filter(
		(category) => player.scores[category.id] !== null
	).length;

	return Math.min(scoredCategoryCount + 1, CATEGORY_DEFINITIONS.length);
}
