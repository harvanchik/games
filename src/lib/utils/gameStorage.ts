export function saveGameState<T>(key: string, state: T): void {
	const storage = getStorage();
	if (!storage) return;
	storage.setItem(key, JSON.stringify(state));
}

export function loadGameState<T>(key: string): T | null {
	const storage = getStorage();
	if (!storage) return null;

	try {
		const rawValue = storage.getItem(key);
		return rawValue ? (JSON.parse(rawValue) as T) : null;
	} catch {
		return null;
	}
}

export function clearGameState(key: string): void {
	const storage = getStorage();
	if (!storage) return;
	storage.removeItem(key);
}

function getStorage(): Storage | null {
	if (typeof window === 'undefined') return null;

	try {
		return window.localStorage;
	} catch {
		return null;
	}
}
