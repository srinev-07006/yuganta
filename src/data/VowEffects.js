// Vows that change something in battle. A hero's vow button appears in the unit menu only if its id is listed here;
// every other vow in lore.json is narrative-only. Toggled on by the player, read by CombatResolver.
//   versus: character_id the bonus applies against.   damageMultiplier: applied to the attacker's damage.
// Role 4 / design: these two are placeholders — confirm the real in-battle effects of each vow.
export const VOW_EFFECTS = Object.freeze({
    'slay-jayadratha-sunset': { versus: 'jayadratha', damageMultiplier: 2.0, description: 'damage ×2 against Jayadratha.' },
    'drink-duhshasana-blood': { versus: 'duhshasana', damageMultiplier: 2.0, description: 'damage ×2 against Duhshasana.' }
});
