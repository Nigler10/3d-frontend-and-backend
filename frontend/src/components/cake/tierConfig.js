export const CAKE_GROUP_POSITION = [0, -0.8, 0];
export const TIER_TOP_Y = [2.35, 1.80, 2.35, 2.73];
export const TIER_TOP_RADIUS = [1, 0.72, 0.52, 0.40];

export function getTierLoadingPosition(selectedTierIndex) {
    const topY = TIER_TOP_Y[selectedTierIndex] ?? TIER_TOP_Y[0];
    return [CAKE_GROUP_POSITION[0], CAKE_GROUP_POSITION[1] + topY, CAKE_GROUP_POSITION[2]];
}
