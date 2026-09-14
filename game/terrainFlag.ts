/**
 * THE TERRAIN ART SWITCH.
 *
 * On, the ground is drawn as LINOCUT IN OCHRE (docs/terrain-directions.md,
 * direction 4, the ochre ink): every floor family a flat warmed colour
 * with a rare carved tick, every rock family a flat umber with a rare
 * gouge — the carved band the concepts drew along a hill's edges is
 * gone, the hill is shaded by the game's own darkness and rim shadow —
 * and the water a flat teal with a wave cut into a third of its cells, in
 * place of Mindustry's tiles under the same swell shader.
 * The floors' base colours shift with it, so the dust, the thumbnails and
 * the boulders follow without a second table. The hill-side shading the
 * renderer already does — the rim shadow on the floor, the darkness
 * inside the hill — is untouched either way.
 *
 * Off, the painted tiles are what they were (game/tiles.ts, the flat
 * repaint of Mindustry's set) and the water is Mindustry's, byte for byte.
 */
export const LINOCUT_TERRAIN = true;
