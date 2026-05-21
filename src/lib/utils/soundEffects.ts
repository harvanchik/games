import { base } from '$app/paths';

const DICE_ROLL_AUDIO_PATH = `${base}/audio/dice.wav`;

let diceRollAudio: HTMLAudioElement | null = null;

export function playDiceRollSound(): void {
	if (typeof Audio === 'undefined') return;

	try {
		diceRollAudio ??= new Audio(DICE_ROLL_AUDIO_PATH);
		diceRollAudio.pause();
		diceRollAudio.currentTime = 0;
		void diceRollAudio.play().catch(() => {
			// Browsers can block audio if the roll was not user-initiated.
		});
	} catch {
		// Audio should never interrupt game flow.
	}
}
