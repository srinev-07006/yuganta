// Character ids that have a battle sprite at public/sprites/characters/<id>.webp (cropped, 320px tall).
export const CHARACTER_SPRITE_IDS = ["bhishma", "arjuna", "krishna", "yudhishthira", "bhima", "nakula", "sahadeva", "draupadi", "karna", "duryodhana", "drona", "duhshasana", "shakuni", "shikhandi", "abhimanyu", "jayadratha", "ghatotkacha", "ashwatthama", "shalya", "dhritarashtra", "sanjaya", "vidura", "kunti", "gandhari", "vyasa", "kripacharya", "satyaki", "drupada", "dhrishtadyumna", "virata", "uttara"];
// Extra poses: public/sprites/characters/<id>_<pose>.webp, shown briefly while that hero attacks.
export const CHARACTER_POSES = [['arjuna', 'shooting']];
export const poseTextureKey = (id, pose) => `char_${id}_${pose}`;
export const spriteTextureKey = (id) => `char_${id}`;
