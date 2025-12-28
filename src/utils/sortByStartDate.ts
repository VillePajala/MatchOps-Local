type SortableByStartDate = {
  startDate?: string;
  name: string;
  archived?: boolean;
};

const parseStartDate = (value?: string): number | null => {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

export const sortByStartDateName = <T extends SortableByStartDate>(items: T[]): T[] => {
  return items
    .filter(item => !item.archived)
    .sort((a, b) => {
      const aDate = parseStartDate(a.startDate);
      const bDate = parseStartDate(b.startDate);

      if (aDate !== null && bDate !== null) {
        const dateCompare = bDate - aDate;
        if (dateCompare !== 0) return dateCompare;
      } else if (aDate !== null) {
        return -1;
      } else if (bDate !== null) {
        return 1;
      }

      return a.name.localeCompare(b.name);
    });
};
