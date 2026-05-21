import { hasAnyScoringDice, rollFarkleDice, scoreSelectedDice } from './farkleScoring';
import type { FarkleDiceValue, FarkleGameState, FarklePlayer, FarkleScoreResult } from './farkleTypes';

export function createFarkleGame(
	playerNames = ['Player 1', 'Player 2'],
	targetScore = 5000,
	gameName = ''
): FarkleGameState {
	const players = playerNames.map((name, index) => createFarklePlayer(index + 1, name));

	return {
		setupComplete: false,
		gameName,
		targetScore,
		players,
		activePlayerIndex: 0,
		roundNumber: 1,
		dice: [],
		availableDiceCount: 6,
		turnPoints: 0,
		phase: 'ready',
		statusMessage: 'Roll all six dice to begin.',
		rollVersion: 0,
		lastRollScore: 0,
		lastRollLabel: '',
		turnLog: [],
		winnerId: null
	};
}

export function startFarkleGame(
	playerNames: string[],
	targetScore: number,
	gameName: string
): FarkleGameState {
	const game = createFarkleGame(playerNames, targetScore, gameName);
	game.setupComplete = true;
	return game;
}

export function rollDice(game: FarkleGameState): void {
	if (game.phase === 'game-over' || (game.phase !== 'ready' && game.phase !== 'farkle')) return;

	const count = game.availableDiceCount || 6;
	applyFarkleRoll(game, rollFarkleDice(count));
}

export function applyFarkleRoll(game: FarkleGameState, values: FarkleDiceValue[]): void {
	if (game.phase === 'game-over') return;

	game.dice = values.map((value, index) => ({ id: Date.now() + index, value, selected: false }));
	game.rollVersion += 1;
	game.lastRollScore = 0;
	game.lastRollLabel = '';

	if (!hasAnyScoringDice(values)) {
		const player = getActivePlayer(game);
		player.farkles += 1;
		player.lastTurnScore = 0;
		game.turnPoints = 0;
		game.phase = 'farkle';
		game.statusMessage = `${player.name} farkled. No points this turn.`;
		addLog(game, player.name, 'Farkle. Turn over.', 0, values);
		advanceTurn(game);
		return;
	}

	game.phase = 'selecting';
	game.statusMessage = 'Select scoring dice, then keep them or bank your turn points.';
}

export function toggleDie(game: FarkleGameState, dieId: number): void {
	if (game.phase !== 'selecting') return;

	const die = game.dice.find((candidate) => candidate.id === dieId);
	if (!die) return;

	die.selected = !die.selected;
}

export function getSelectedScore(game: FarkleGameState): FarkleScoreResult {
	return scoreSelectedDice(game.dice.filter((die) => die.selected).map((die) => die.value));
}

export function keepSelectedDice(game: FarkleGameState): boolean {
	if (game.phase !== 'selecting') return false;

	const selectedDice = game.dice.filter((die) => die.selected);
	const result = scoreSelectedDice(selectedDice.map((die) => die.value));
	if (!result.valid) {
		game.statusMessage = result.label;
		return false;
	}

	const player = getActivePlayer(game);
	game.turnPoints += result.score;
	game.lastRollScore = result.score;
	game.lastRollLabel = result.label;
	game.availableDiceCount -= selectedDice.length;
	addLog(game, player.name, `Kept ${result.label} for ${result.score} points.`, result.score, selectedDice.map((die) => die.value));

	if (game.availableDiceCount <= 0) {
		game.availableDiceCount = 6;
		game.statusMessage = 'Hot dice. Roll all six dice again or bank your turn points.';
	} else {
		game.statusMessage = `Kept ${result.score}. Roll ${game.availableDiceCount} dice or bank.`;
	}

	game.dice = [];
	game.phase = 'ready';
	return true;
}

export function bankTurn(game: FarkleGameState): boolean {
	if (game.turnPoints <= 0 || game.phase !== 'ready') return false;

	const player = getActivePlayer(game);
	player.totalScore += game.turnPoints;
	player.lastTurnScore = game.turnPoints;
	addLog(game, player.name, `Banked ${game.turnPoints} points.`, game.turnPoints);

	if (player.totalScore >= game.targetScore) {
		player.roundsWon += 1;
		game.winnerId = player.id;
		game.phase = 'game-over';
		game.statusMessage = `${player.name} wins with ${player.totalScore} points.`;
		return true;
	}

	game.turnPoints = 0;
	advanceTurn(game);
	return true;
}

export function resetTurnAfterFarkle(game: FarkleGameState): void {
	game.dice = [];
	game.availableDiceCount = 6;
	game.turnPoints = 0;
	game.phase = 'ready';
	game.lastRollScore = 0;
	game.lastRollLabel = '';
}

export function getActivePlayer(game: FarkleGameState): FarklePlayer {
	return game.players[game.activePlayerIndex] ?? game.players[0];
}

export function getNextPlayer(game: FarkleGameState): FarklePlayer {
	return game.players[(game.activePlayerIndex + 1) % game.players.length] ?? game.players[0];
}

export function renameFarklePlayer(game: FarkleGameState, playerId: number, name: string): void {
	const player = game.players.find((candidate) => candidate.id === playerId);
	if (!player) return;

	player.name = name;
}

export function removeFarklePlayer(game: FarkleGameState, playerId: number): boolean {
	if (game.players.length <= 2) return false;

	const playerIndex = game.players.findIndex((player) => player.id === playerId);
	if (playerIndex < 0) return false;

	game.players.splice(playerIndex, 1);
	if (game.activePlayerIndex >= game.players.length) game.activePlayerIndex = 0;
	if (game.activePlayerIndex > playerIndex) game.activePlayerIndex -= 1;
	return true;
}

export function normalizeFarkleGame(savedGame: FarkleGameState): FarkleGameState {
	const baseline = createFarkleGame();
	return {
		...baseline,
		...savedGame,
		dice: Array.isArray(savedGame.dice) ? savedGame.dice : [],
		players: normalizePlayers(savedGame.players),
		phase: savedGame.phase === 'farkle' ? 'ready' : savedGame.phase,
		statusMessage:
			savedGame.phase === 'farkle' ? 'Roll all six dice to begin.' : savedGame.statusMessage
	};
}

function advanceTurn(game: FarkleGameState): void {
	resetTurnAfterFarkle(game);
	game.activePlayerIndex = (game.activePlayerIndex + 1) % game.players.length;
	if (game.activePlayerIndex === 0) game.roundNumber += 1;
	game.statusMessage = `${getActivePlayer(game).name} is up. Roll all six dice.`;
}

function createFarklePlayer(id: number, name: string): FarklePlayer {
	return {
		id,
		name: name.trim() || `Player ${id}`,
		totalScore: 0,
		farkles: 0,
		roundsWon: 0,
		lastTurnScore: 0
	};
}

function normalizePlayers(players: FarklePlayer[]): FarklePlayer[] {
	if (!Array.isArray(players) || players.length < 1) return [createFarklePlayer(1, 'Player 1')];

	return players.map((player, index) => ({
		id: player.id ?? index + 1,
		name: player.name?.trim() || `Player ${index + 1}`,
		totalScore: player.totalScore ?? 0,
		farkles: player.farkles ?? 0,
		roundsWon: player.roundsWon ?? 0,
		lastTurnScore: player.lastTurnScore ?? 0
	}));
}

function addLog(
	game: FarkleGameState,
	playerName: string,
	message: string,
	points?: number,
	dice?: FarkleDiceValue[]
): void {
	game.turnLog = [{ id: Date.now() + Math.random(), playerName, message, points, dice }, ...game.turnLog].slice(0, 30);
}
