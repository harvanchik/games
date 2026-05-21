import { formatDice, rollBellDice, scoreBellRoll } from './bellRollScoring';
import type {
	BellDiceValue,
	BellRollGameState,
	BellRollLogEntry,
	BellRollMode,
	BellRollPendingRoll,
	BellRollPlayer,
	BellRollStats,
	BellRollTable
} from './bellRollTypes';

export const BELL_ROLL_STORAGE_KEY = 'bell-roll-save-state:v1';

export function createBellRollGame(
	mode: BellRollMode = 'quick',
	names = ['Player 1', 'Player 2'],
	setCount: 1 | 3 | 4 = 1
): BellRollGameState {
	const players = createPlayers(names);
	const stats = createStats(players);

	return {
		mode,
		setupComplete: false,
		players,
		stats,
		setCount,
		currentSet: 1,
		currentRound: 1,
		dice: [1, 2, 3],
		rollVersion: 0,
		lastRoll: null,
		statusMessage: 'Score points to keep rolling.',
		turnLog: [],
		roundHistory: [],
		roundPerfectTriples: 0,
		roundMiniTriples: 0,
		gameOver: false,
		quick: {
			currentPlayerIndex: 0,
			roundScores: Object.fromEntries(players.map((player) => [player.id, 0]))
		},
		party: {
			tables: mode === 'party' ? createTables(players) : [],
			activeTableIndex: 0,
			roundEnding: false
		}
	};
}

export function startBellRollGame(
	mode: BellRollMode,
	names: string[],
	setCount: 1 | 3 | 4
): BellRollGameState {
	const game = createBellRollGame(mode, names, setCount);
	game.setupComplete = true;
	return game;
}

export function rollForBellRoll(game: BellRollGameState): void {
	const pendingRoll = prepareBellRollRoll(game);
	if (!pendingRoll) return;

	game.dice = pendingRoll.dice;
	game.rollVersion += 1;
	applyBellRollRoll(game, pendingRoll);
}

export function prepareBellRollRoll(game: BellRollGameState): BellRollPendingRoll | null {
	if (!game.setupComplete || game.gameOver) return null;

	const dice = rollBellDice();
	const result = scoreBellRoll(dice, game.currentRound);
	const player = getCurrentPlayer(game);

	return {
		dice,
		playerId: player.id,
		playerName: player.name,
		result
	};
}

export function applyBellRollRoll(
	game: BellRollGameState,
	pendingRoll: BellRollPendingRoll,
	options: { deferTurnEnd?: boolean } = {}
): boolean {
	const { dice, playerId, playerName, result } = pendingRoll;

	game.dice = dice;
	game.lastRoll = result;
	game.statusMessage = result.message;
	recordRollStats(game, playerId, result.points, result.label);
	addLog(game, playerName, dice, result.message, result.label, game.currentRound);

	if (game.mode === 'quick') {
		return applyQuickRoll(game, playerId, result.points, result.turnContinues, options.deferTurnEnd);
	}

	return applyPartyRoll(game, playerId, result.points, result.turnContinues, options.deferTurnEnd);
}

export function getCurrentPlayer(game: BellRollGameState): BellRollPlayer {
	if (game.mode === 'quick') {
		return game.players[game.quick.currentPlayerIndex] ?? game.players[0];
	}

	const table = game.party.tables[game.party.activeTableIndex];
	const team = table.activeTeamId === 'A' ? table.teamA : table.teamB;
	const playerId = team.playerIds[table.activePlayerIndex] ?? team.playerIds[0];
	return game.players.find((player) => player.id === playerId) ?? game.players[0];
}

export function getCurrentTable(game: BellRollGameState): BellRollTable | null {
	return game.mode === 'party' ? (game.party.tables[game.party.activeTableIndex] ?? null) : null;
}

export function getNextPlayer(game: BellRollGameState): BellRollPlayer {
	if (game.mode === 'quick') {
		const nextIndex = (game.quick.currentPlayerIndex + 1) % game.players.length;
		return game.players[nextIndex] ?? game.players[0];
	}

	const table = game.party.tables[game.party.activeTableIndex];
	if (!table) return game.players[0];

	let nextTableIndex = game.party.activeTableIndex;
	let nextTeamId = table.activeTeamId === 'A' ? 'B' : 'A';
	let nextPlayerIndex = table.activePlayerIndex;

	if (table.activeTeamId === 'B') {
		nextPlayerIndex = (table.activePlayerIndex + 1) % 2;
		nextTableIndex = (game.party.activeTableIndex + 1) % game.party.tables.length;
	}

	const nextTable = game.party.tables[nextTableIndex];
	const nextTeam = nextTeamId === 'A' ? nextTable.teamA : nextTable.teamB;
	const nextPlayerId = nextTeam.playerIds[nextPlayerIndex] ?? nextTeam.playerIds[0];
	return game.players.find((player) => player.id === nextPlayerId) ?? game.players[0];
}

export function getFinalRankings(game: BellRollGameState): BellRollPlayer[] {
	return [...game.players]
		.filter((player) => !player.ghost)
		.sort((a, b) => {
			const aStats = game.stats[a.id];
			const bStats = game.stats[b.id];
			return (
				bStats.wins + bStats.roundWins - (aStats.wins + aStats.roundWins) ||
				bStats.totalPoints - aStats.totalPoints ||
				bStats.perfectTriples - aStats.perfectTriples
			);
		});
}

export function getTotalRounds(game: BellRollGameState): number {
	return game.setCount * 6;
}

export function advanceBellRollTurn(game: BellRollGameState): void {
	if (game.mode === 'quick') {
		game.quick.currentPlayerIndex = (game.quick.currentPlayerIndex + 1) % game.players.length;
		return;
	}

	advancePartyTurn(game);
}

export function renameBellRollPlayer(game: BellRollGameState, playerId: number, name: string): void {
	const player = game.players.find((candidate) => candidate.id === playerId && !candidate.ghost);
	if (!player) return;

	player.name = name;
}

export function canRemoveBellRollPlayer(game: BellRollGameState): boolean {
	const playerCount = game.players.filter((player) => !player.ghost).length;
	return game.mode === 'party' ? playerCount > 4 : playerCount > 2;
}

export function removeBellRollPlayer(game: BellRollGameState, playerId: number): boolean {
	if (!canRemoveBellRollPlayer(game)) return false;

	const currentPlayerId = getCurrentPlayer(game).id;
	const remainingPlayers = game.players.filter((player) => !player.ghost && player.id !== playerId);
	const minimumPlayerCount = game.mode === 'party' ? 4 : 2;
	if (remainingPlayers.length < minimumPlayerCount) return false;

	const nextPlayers = ensureEvenPlayers(remainingPlayers);
	const nextStats: Record<number, BellRollStats> = {};

	for (const player of nextPlayers) {
		nextStats[player.id] =
			game.stats[player.id] ?? {
				wins: 0,
				losses: 0,
				roundWins: 0,
				roundLosses: 0,
				totalPoints: 0,
				perfectTriples: 0,
				miniTriples: 0
			};
	}

	game.players = nextPlayers;
	game.stats = nextStats;
	game.quick.roundScores = Object.fromEntries(
		nextPlayers.map((player) => [player.id, game.quick.roundScores[player.id] ?? 0])
	);
	game.quick.currentPlayerIndex = Math.max(
		0,
		nextPlayers.findIndex((player) => player.id === currentPlayerId)
	);

	if (game.mode === 'party') {
		game.party.tables = createTables(nextPlayers);
		game.party.activeTableIndex = 0;
	}

	return true;
}

function applyQuickRoll(
	game: BellRollGameState,
	playerId: number,
	points: number,
	turnContinues: boolean,
	deferTurnEnd = false
): boolean {
	game.quick.roundScores[playerId] = (game.quick.roundScores[playerId] ?? 0) + points;

	if (game.quick.roundScores[playerId] >= 21) {
		closeQuickRound(game);
		return false;
	}

	if (!turnContinues) {
		if (deferTurnEnd) return true;
		advanceBellRollTurn(game);
	}

	return false;
}

function applyPartyRoll(
	game: BellRollGameState,
	playerId: number,
	points: number,
	turnContinues: boolean,
	deferTurnEnd = false
): boolean {
	const table = game.party.tables[game.party.activeTableIndex];
	const team = table.activeTeamId === 'A' ? table.teamA : table.teamB;

	team.score += points;

	if (table.isHead && team.score >= 21) {
		game.party.roundEnding = true;
		closePartyRound(game);
		return false;
	}

	if (!turnContinues) {
		if (deferTurnEnd) return true;
		advancePartyTurn(game);
	}

	return false;
}

function closeQuickRound(game: BellRollGameState): void {
	const highestScore = Math.max(...Object.values(game.quick.roundScores));
	const winners = game.players.filter((player) => game.quick.roundScores[player.id] === highestScore);

	for (const player of game.players) {
		if (winners.some((winner) => winner.id === player.id)) {
			game.stats[player.id].roundWins += 1;
		} else {
			game.stats[player.id].roundLosses += 1;
		}
	}

	recordHistory(game, winners.map((player) => player.name).join(', '), highestScore);
	advanceRound(game);
}

function closePartyRound(game: BellRollGameState): void {
	for (const table of game.party.tables) {
		const teamAScore = table.teamA.score;
		const teamBScore = table.teamB.score;
		const winners = teamAScore >= teamBScore ? table.teamA.playerIds : table.teamB.playerIds;
		const losers = teamAScore >= teamBScore ? table.teamB.playerIds : table.teamA.playerIds;

		for (const playerId of winners) {
			if (!isGhost(game, playerId)) game.stats[playerId].wins += 1;
		}

		for (const playerId of losers) {
			if (!isGhost(game, playerId)) game.stats[playerId].losses += 1;
		}
	}

	const headTable = game.party.tables[0];
	const winningTeam = headTable.teamA.score >= headTable.teamB.score ? headTable.teamA : headTable.teamB;

	recordHistory(
		game,
		winningTeam.playerIds.map((id) => playerName(game, id)).join(' / '),
		Math.max(headTable.teamA.score, headTable.teamB.score)
	);
	rotatePartyTables(game);
	advanceRound(game);
}

function advanceRound(game: BellRollGameState): void {
	const nextRoundNumber = game.currentRound === 6 ? 1 : ((game.currentRound + 1) as BellDiceValue);
	const nextSet = game.currentRound === 6 ? game.currentSet + 1 : game.currentSet;

	if (nextSet > game.setCount) {
		game.gameOver = true;
		game.statusMessage = 'Game complete.';
		return;
	}

	game.currentRound = nextRoundNumber;
	game.currentSet = nextSet;
	game.lastRoll = null;
	game.statusMessage = 'Score points to keep rolling.';
	game.turnLog = [];
	game.roundPerfectTriples = 0;
	game.roundMiniTriples = 0;
	game.quick.roundScores = Object.fromEntries(game.players.map((player) => [player.id, 0]));
	game.quick.currentPlayerIndex = 0;
	game.party.roundEnding = false;

	for (const table of game.party.tables) {
		table.teamA.score = 0;
		table.teamB.score = 0;
		table.activeTeamId = 'A';
		table.activePlayerIndex = 0;
	}
}

function advancePartyTurn(game: BellRollGameState): void {
	const table = game.party.tables[game.party.activeTableIndex];

	if (table.activeTeamId === 'A') {
		table.activeTeamId = 'B';
		return;
	}

	table.activeTeamId = 'A';
	table.activePlayerIndex = (table.activePlayerIndex + 1) % 2;
	game.party.activeTableIndex = (game.party.activeTableIndex + 1) % game.party.tables.length;
}

function rotatePartyTables(game: BellRollGameState): void {
	const tables = game.party.tables;
	if (tables.length <= 1) return;

	const winnersByTable = tables.map((table) =>
		table.teamA.score >= table.teamB.score ? table.teamA.playerIds : table.teamB.playerIds
	);
	const losersByTable = tables.map((table) =>
		table.teamA.score >= table.teamB.score ? table.teamB.playerIds : table.teamA.playerIds
	);

	const nextSeats: number[][] = tables.map(() => []);

	for (let index = 0; index < tables.length; index += 1) {
		const winnerDestination = Math.max(0, index - 1);
		const loserDestination = index === 0 ? tables.length - 1 : Math.min(tables.length - 1, index + 1);

		nextSeats[winnerDestination].push(...winnersByTable[index]);
		nextSeats[loserDestination].push(...losersByTable[index]);
	}

	game.party.tables = nextSeats.map((playerIds, index) => createTable(index, rotatePartners(playerIds), index === 0));
	game.party.activeTableIndex = 0;
}

function recordRollStats(
	game: BellRollGameState,
	playerId: number,
	points: number,
	label: string
): void {
	if (isGhost(game, playerId)) return;

	game.stats[playerId].totalPoints += points;
	if (label === 'Perfect Triple') {
		game.stats[playerId].perfectTriples += 1;
		game.roundPerfectTriples += 1;
	}
	if (label === 'Mini Triple') {
		game.stats[playerId].miniTriples += 1;
		game.roundMiniTriples += 1;
	}
}

function recordHistory(game: BellRollGameState, winners: string, highestScore: number): void {
	game.roundHistory.unshift({
		set: game.currentSet,
		round: game.currentRound,
		target: game.currentRound,
		winners,
		highestScore,
		perfectTriples: game.roundPerfectTriples,
		miniTriples: game.roundMiniTriples
	});
}

function addLog(
	game: BellRollGameState,
	playerName: string,
	dice: BellDiceValue[],
	resultText: string,
	resultLabel: BellRollLogEntry['resultLabel'],
	target: BellDiceValue
): void {
	const entry: BellRollLogEntry = {
		id: Date.now(),
		text: `${playerName} rolled ${formatDice(dice)}: ${resultText}`,
		playerName,
		dice,
		resultText,
		resultLabel,
		target
	};
	game.turnLog = [entry, ...game.turnLog].slice(0, 8);
}

function createPlayers(names: string[]): BellRollPlayer[] {
	const trimmedNames = names.map((name, index) => name.trim() || `Player ${index + 1}`);
	const needsGhost = trimmedNames.length % 2 === 1;
	const allNames = needsGhost ? [...trimmedNames, 'Ghost Player'] : trimmedNames;

	return allNames.map((name, index) => ({
		id: index + 1,
		name,
		ghost: needsGhost && index === allNames.length - 1
	}));
}

function ensureEvenPlayers(players: BellRollPlayer[]): BellRollPlayer[] {
	if (players.length % 2 === 0) return players;

	const nextGhostId = Math.max(...players.map((player) => player.id), 0) + 1;

	return [
		...players,
		{
			id: nextGhostId,
			name: 'Ghost Player',
			ghost: true
		}
	];
}

function createStats(players: BellRollPlayer[]): Record<number, BellRollStats> {
	return Object.fromEntries(
		players.map((player) => [
			player.id,
			{
				wins: 0,
				losses: 0,
				roundWins: 0,
				roundLosses: 0,
				totalPoints: 0,
				perfectTriples: 0,
				miniTriples: 0
			}
		])
	);
}

function createTables(players: BellRollPlayer[]): BellRollTable[] {
	const tableCount = Math.max(1, Math.ceil(players.length / 4));
	return Array.from({ length: tableCount }, (_, index) => {
		const seats = players.slice(index * 4, index * 4 + 4).map((player) => player.id);
		while (seats.length < 4) seats.push(players[players.length - 1].id);
		return createTable(index, seats, index === 0);
	});
}

function createTable(index: number, seats: number[], isHead: boolean): BellRollTable {
	return {
		id: index + 1,
		name: isHead ? 'Head Table' : `Table ${index + 1}`,
		isHead,
		teamA: { id: 'A', playerIds: [seats[0], seats[2]], score: 0 },
		teamB: { id: 'B', playerIds: [seats[1], seats[3]], score: 0 },
		activeTeamId: 'A',
		activePlayerIndex: 0
	};
}

function rotatePartners(playerIds: number[]): number[] {
	return playerIds.length < 4 ? playerIds : [playerIds[0], playerIds[2], playerIds[1], playerIds[3]];
}

function isGhost(game: BellRollGameState, playerId: number): boolean {
	return game.players.find((player) => player.id === playerId)?.ghost ?? false;
}

function playerName(game: BellRollGameState, playerId: number): string {
	return game.players.find((player) => player.id === playerId)?.name ?? 'Unknown';
}
