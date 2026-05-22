/// <reference types="@sveltejs/kit" />

import { build, files, prerendered, version } from '$service-worker';

const CACHE_NAME = `games-${version}`;
const PRECACHE_URLS = [...build, ...files, ...prerendered];

declare const self: ServiceWorkerGlobalScope;

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll(PRECACHE_URLS))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
			)
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const { request } = event;
	const requestUrl = new URL(request.url);

	if (request.method !== 'GET' || requestUrl.origin !== self.location.origin) return;

	event.respondWith(
		caches.match(request).then((cachedResponse) => cachedResponse ?? fetch(request))
	);
});

export {};
