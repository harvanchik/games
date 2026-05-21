<script lang="ts">
	import type { FortressActionType, FortressCombo } from './fortressDiceTypes';

	interface Props {
		type?: FortressActionType;
		combo?: FortressCombo;
		size?: 'sm' | 'md' | 'lg';
		label?: string;
	}

let { type = 'troopMarch', combo = 'pair', size = 'md', label = 'Fortress icon' }: Props = $props();

	let sizeClass = $derived(size === 'sm' ? 'h-7 w-7' : size === 'lg' ? 'h-11 w-11' : 'h-9 w-9');
	let iconKind = $derived(type);
	let isHeavyUnit = $derived(combo === 'four-kind' || combo === 'full-house' || combo === 'five-kind');
</script>

<svg
	class={['fortress-icon', sizeClass]}
	viewBox="0 0 48 48"
	role="img"
	aria-label={label}
	fill="none"
	stroke="currentColor"
	stroke-width="3.5"
	stroke-linecap="square"
	stroke-linejoin="miter"
>
	{#if iconKind === 'troopMarch'}
		{#if combo === 'five-kind'}
			<path d="M29 3 10 27h12l-3 18 19-26H26z" fill="currentColor" stroke="none" />
			<path d="M8 40h32" />
		{:else if isHeavyUnit}
			<path d="M8 34h28l4-8H12z" fill="currentColor" stroke="none" />
			<path d="M13 24h18l5 10H8z" />
			<path d="M18 24v-9h9v9" />
			<path d="M27 15h8" />
			<path d="M34 12v6" />
		{:else}
			<path d="M7 38 38 7" />
			<path d="M26 7h12v12" />
			<path d="M13 32h14" />
			<path d="M18 37V23" />
		{/if}
	{:else if iconKind === 'shield' || iconKind === 'restoreShield'}
		<path d="M24 5 39 11v11c0 10-5 16-15 21C14 38 9 32 9 22V11z" fill="currentColor" opacity="0.16" />
		<path d="M24 5 39 11v11c0 10-5 16-15 21C14 38 9 32 9 22V11z" />
		<path d="M24 11v25" />
		{#if iconKind === 'shield'}
			<path d="M14 18h20" />
			<path d="M16 26h16" />
		{/if}
	{:else if iconKind === 'fullHousePush'}
		<path d="M7 36 33 10" />
		<path d="M24 10h9v9" />
		<path d="M27 17 39 22v9c0 6-3 10-9 13-6-3-9-7-9-13v-9z" fill="currentColor" opacity="0.16" />
		<path d="M27 17 39 22v9c0 6-3 10-9 13-6-3-9-7-9-13v-9z" />
	{:else if iconKind === 'regen'}
		<path d="M20 7h8v13h13v8H28v13h-8V28H7v-8h13z" fill="currentColor" opacity="0.2" />
		<path d="M20 7h8v13h13v8H28v13h-8V28H7v-8h13z" />
		<path d="M12 40h24" />
	{:else if iconKind === 'freeze'}
		<path d="M24 6v36" />
		<path d="M9 15 39 33" />
		<path d="M39 15 9 33" />
		<path d="M18 10 24 16l6-6" />
		<path d="M18 38 24 32l6 6" />
	{:else if iconKind === 'slowLane'}
		<path d="M10 12h28" />
		<path d="M14 24h20" />
		<path d="M18 36h12" />
		<path d="M31 9v30" />
		<path d="M25 31 31 39l6-8" />
	{:else if iconKind === 'hasteLane'}
		<path d="M26 4 10 27h12l-2 17 18-25H27z" fill="currentColor" stroke="none" />
		<path d="M7 14h9" />
		<path d="M5 24h8" />
	{:else if iconKind === 'clearLane'}
		<path d="M12 12 36 36" />
		<path d="M36 12 12 36" />
		<path d="M8 24h32" />
	{/if}
</svg>

<style>
	.fortress-icon {
		display: inline-block;
		flex: 0 0 auto;
	}
</style>
