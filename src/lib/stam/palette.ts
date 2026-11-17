/** Person palette, assigned in order. Values are CSS vars defined in styles.css. */
export const PERSON_COLORS = ["var(--person-1)", "var(--person-2)", "var(--person-3)", "var(--person-4)", "var(--person-5)"];
export const nextColor = (used: number) => PERSON_COLORS[used % PERSON_COLORS.length]!;
