export const stableSort = <T>(items: readonly T[], compare: (a: T, b: T) => number): T[] => {
    return items
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
            const result = compare(a.item, b.item);
            if (result !== 0) return result;
            return a.index - b.index;
        })
        .map(({ item }) => item);
};

export const compareByValueDesc = <T extends { value: number }>(a: T, b: T) => b.value - a.value;

