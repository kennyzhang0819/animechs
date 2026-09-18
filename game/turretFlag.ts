/**
 * THE TURRET ART SWITCH.
 *
 * On, the twenty-one turret heads draw as FOUNDRY (game/turretArt.ts): one
 * gunmetal plating, a silhouette a kind, an accent per ammo — generated
 * at load and packed over the stock cells (game/atlas.ts), with the
 * stock base plates darkened under them. The HUD's turret pictures and
 * the placement ghost come off the same drawings. NOTHING under
 * public/mindustry is touched, and flipping this back restores
 * Mindustry's turrets byte for byte, plates included.
 *
 * The direction and the rules are written down in docs/turret-factions.md.
 */
export const FOUNDRY_ART = true;
