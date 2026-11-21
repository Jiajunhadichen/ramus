/**
 * Person palette, assigned in order: eight inks, so a discussion of up to eight people never repeats a colour;
 * the ninth person shares the first ink. Values are CSS vars defined in styles.css (day and night).
 * Order matters: green, ochre, blue first (people liked them), then the rest; see docs/design-principles.md §3.
 */
export const PERSON_COLORS = Array.from({ length: 8 }, (_, i) => `var(--person-${i + 1})`);
export const nextColor = (used: number) => PERSON_COLORS[used % PERSON_COLORS.length]!;
