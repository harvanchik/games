import type {
	ShutBoxDiceValue,
	ShutBoxGameState,
	ShutBoxLogEntry,
	ShutBoxMode,
	ShutBoxPlayer
} from './shutTheBoxTypes';

export const SHUT_BOX_TILES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export function createShutBoxGame(
	playerNames = ['Player 1', 'Player 2'],
	mode: ShutBoxMode = 'local',
	gameName = ''
): ShutBoxGameState {
	return {
		setupComplete: false,
		gameName,
		mode,
		players: playerNames.map((name, index) => createPlayer(index + 1, name, false)),
		activePlayerIndex: 0,
		dice: [1, 2],
		rollVersion: 0,
		phase: 'ready',
		selectedTiles: [],
		lastRoll: null,
		statusMessage: 'Roll the dice to begin.',
		turnLog: [],
		winnerIds: []
	};
}

export function startShutBoxGame(
	playerNames: string[],
	mode: ShutBoxMode,
	gameName: string
): ShutBoxGameState {
	const game = createShutBoxGame(playerNames, mode, gameName);
	game.setupComplete = true;

	if (mode === 'cpu' && game.players[1]) {
		game.players[1].name = game.players[1].name.trim() || 'CPU';
		game.players[1].isCpu = true;
	}

	return game;
}

export function rollShutBoxDice(): [ShutBoxDiceValue, ShutBoxDiceValue] {
	return [rollDie(), rollDie()];
}

export function applyRoll(game: ShutBoxGameState, dice: [ShutBoxDiceValue, ShutBoxDiceValue]): void {
	if (game.phase !== 'ready') return;

	const player = getActivePlayer(game);
	const total = dice[0] + dice[1];
	game.dice = dice;
	game.rollVersion += 1;
	game.lastRoll = { dice, total };
	game.selectedTiles = [];

	if (!hasValidMove(getOpenTiles(player), total)) {
		endCurrentTurn(game, `Rolled ${total} with no available tiles.`);
		return;
	}

	game.phase = 'choosing';
	game.statusMessage = `${player.name} rolled ${total}. Choose open tiles that add to ${total}.`;
	addLog(game, player.name, `Rolled ${total}.`, dice);
}

export function toggleTile(game: ShutBoxGameState, tile: number): void {
	if (game.phase !== 'choosing' || !game.lastRoll) return;

	const player = getActivePlayer(game);
	if (!getOpenTiles(player).includes(tile)) return;

	const selected = new Set(game.selectedTiles);
	if (selected.has(tile)) selected.delete(tile);
	else selected.add(tile);

	const nextTiles = [...selected].sort((a, b) => a - b);
	if (sumTiles(nextTiles) > game.lastRoll.total) return;

	game.selectedTiles = nextTiles;
}

export function commitSelectedTiles(game: ShutBoxGameState): boolean {
	if (game.phase !== 'choosing' || !game.lastRoll) return false;
	if (sumTiles(game.selectedTiles) !== game.lastRoll.total) return false;

	const player = getActivePlayer(game);
	player.closedTiles = [...new Set([...player.closedTiles, ...game.selectedTiles])].sort((a, b) => a - b);
	addLog(
		game,
		player.name,
		`Closed ${formatTiles(game.selectedTiles)}.`,
		game.lastRoll.dice,
		game.selectedTiles
	);

	if (getOpenTiles(player).length === 0) {
		player.score = 0;
		player.shutTheBox = true;
		player.lastTurnScore = 0;
		game.winnerIds = [player.id];
		game.phase = 'game-over';
		game.statusMessage = `${player.name} shut the box and wins.`;
		game.selectedTiles = [];
		return true;
	}

	game.phase = 'ready';
	game.selectedTiles = [];
	game.statusMessage = `${player.name} closed tiles. Roll again.`;
	return true;
}

export function endCurrentTurn(game: ShutBoxGameState, reason = 'No available move.'): void {
	const player = getActivePlayer(game);
	const score = getOpenTileSum(player);
	player.score = score;
	player.lastTurnScore = score;
	game.selectedTiles = [];
	game.phase = 'turn-over';
	game.statusMessage = `${player.name} is stuck. Score: ${score}.`;
	addLog(game, player.name, `${reason} Turn score: ${score}.`, game.lastRoll?.dice);

	if (game.players.every((candidate) => candidate.score !== null)) {
		finishGame(game);
		return;
	}

	advanceToNextPlayer(game);
}

export function chooseCpuTiles(game: ShutBoxGameState): number[] {
	if (!game.lastRoll) return [];

	const combinations = getTileCombinations(getOpenTiles(getActivePlayer(game)), game.lastRoll.total);
	const ranked = [...combinations].sort((a, b) => getCombinationWeight(b) - getCombinationWeight(a));

	return ranked[0] ?? [];
}

export function getActivePlayer(game: ShutBoxGameState): ShutBoxPlayer {
	return game.players[game.activePlayerIndex] ?? game.players[0];
}

export function getOpenTiles(player: ShutBoxPlayer): number[] {
	const closed = new Set(player.closedTiles);
	return SHUT_BOX_TILES.filter((tile) => !closed.has(tile));
}

export function getOpenTileSum(player: ShutBoxPlayer): number {
	return sumTiles(getOpenTiles(player));
}

export function getTileCombinations(openTiles: number[], target: number): number[][] {
	const results: number[][] = [];

	function search(startIndex: number, remaining: number, current: number[]): void {
		if (remaining === 0) {
			results.push([...current]);
			return;
		}

		for (let index = startIndex; index < openTiles.length; index += 1) {
			const tile = openTiles[index];
			if (tile > remaining) continue;
			current.push(tile);
			search(index + 1, remaining - tile, current);
			current.pop();
		}
	}

	search(0, target, []);
	return results.sort((a, b) => a.length - b.length || getCombinationWeight(b) - getCombinationWeight(a));
}

export function hasValidMove(openTiles: number[], target: number): boolean {
	return getTileCombinations(openTiles, target).length > 0;
}

export function getWinnerText(game: ShutBoxGameState): string {
	if (game.phase !== 'game-over' || game.winnerIds.length === 0) return '';

	const winners = game.players.filter((player) => game.winnerIds.includes(player.id));
	const winningScore = winners[0]?.score ?? 0;

	if (winners.length === 1) {
		return `${winners[0].name} wins with ${winningScore}.`;
	}

	return `Tie game at ${winningScore}.`;
}

export function renameShutBoxPlayer(game: ShutBoxGameState, playerId: number, name: string): void {
	const player = game.players.find((candidate) => candidate.id === playerId);
	if (!player) return;
	player.name = name;
}

export function normalizeShutBoxGame(savedGame: ShutBoxGameState): ShutBoxGameState {
	const baseline = createShutBoxGame();
	return {
		...baseline,
		...savedGame,
		players: normalizePlayers(savedGame.players),
		dice: normalizeDice(savedGame.dice),
		selectedTiles: Array.isArray(savedGame.selectedTiles) ? savedGame.selectedTiles : [],
		turnLog: Array.isArray(savedGame.turnLog) ? savedGame.turnLog : [],
		winnerIds: Array.isArray(savedGame.winnerIds) ? savedGame.winnerIds : []
	};
}

function createPlayer(id: number, name: string, isCpu: boolean): ShutBoxPlayer {
	return {
		id,
		name: name.trim() || `Player ${id}`,
		isCpu,
		closedTiles: [],
		score: null,
		shutTheBox: false,
		lastTurnScore: null
	};
}

function normalizePlayers(players: ShutBoxPlayer[]): ShutBoxPlayer[] {
	if (!Array.isArray(players) || players.length < 1) return [createPlayer(1, 'Player 1', false)];

	return players.map((player, index) => ({
		id: player.id ?? index + 1,
		name: player.name?.trim() || `Player ${index + 1}`,
		isCpu: player.isCpu ?? false,
		closedTiles: Array.isArray(player.closedTiles) ? player.closedTiles : [],
		score: typeof player.score === 'number' ? player.score : null,
		shutTheBox: player.shutTheBox ?? false,
		lastTurnScore: typeof player.lastTurnScore === 'number' ? player.lastTurnScore : null
	}));
}

function normalizeDice(dice: [ShutBoxDiceValue, ShutBoxDiceValue]): [ShutBoxDiceValue, ShutBoxDiceValue] {
	const first = isDiceValue(dice?.[0]) ? dice[0] : 1;
	const second = isDiceValue(dice?.[1]) ? dice[1] : 2;
	return [first, second];
}

function isDiceValue(value: unknown): value is ShutBoxDiceValue {
	return typeof value === 'number' && value >= 1 && value <= 6;
}

function advanceToNextPlayer(game: ShutBoxGameState): void {
	const playerCount = game.players.length;
	for (let offset = 1; offset <= playerCount; offset += 1) {
		const nextIndex = (game.activePlayerIndex + offset) % playerCount;
		if (game.players[nextIndex].score === null) {
			game.activePlayerIndex = nextIndex;
			game.phase = 'ready';
			game.lastRoll = null;
			game.statusMessage = `${getActivePlayer(game).name} is up. Roll the dice.`;
			return;
		}
	}

	finishGame(game);
}

function finishGame(game: ShutBoxGameState): void {
	const bestScore = Math.min(...game.players.map((player) => player.score ?? getOpenTileSum(player)));
	game.winnerIds = game.players
		.filter((player) => (player.score ?? getOpenTileSum(player)) === bestScore)
		.map((player) => player.id);
	game.phase = 'game-over';
	game.statusMessage = getWinnerText(game);
}

function addLog(
	game: ShutBoxGameState,
	playerName: string,
	message: string,
	dice?: [ShutBoxDiceValue, ShutBoxDiceValue],
	tiles?: number[]
): void {
	const entry: ShutBoxLogEntry = {
		id: Date.now() + Math.random(),
		playerName,
		message,
		dice,
		tiles
	};

	game.turnLog = [entry, ...game.turnLog].slice(0, 40);
}

function rollDie(): ShutBoxDiceValue {
	return (Math.floor(Math.random() * 6) + 1) as ShutBoxDiceValue;
}

function sumTiles(tiles: number[]): number {
	return tiles.reduce((total, tile) => total + tile, 0);
}

function getCombinationWeight(tiles: number[]): number {
	return tiles.reduce((total, tile) => total + tile * tile, 0) + tiles.length * 0.1;
}

function formatTiles(tiles: number[]): string {
	return tiles.join(' + ');
}
