import { FileMeta } from '../models/FileMeta';

export type SortKey = 'title' | 'fileName' | 'ctime' | 'mtime';
export type SortOrder = 'asc' | 'desc';

export function sortFiles(
    files: FileMeta[],
    key: SortKey = 'title',
    order: SortOrder = 'asc'
): FileMeta[] {
    const sorted = [...files].sort((a, b) => {
        let result = 0;

        if (key === 'title' || key === 'fileName') {
            result = a[key].localeCompare(b[key]);
        } else {
            result = a[key] - b[key];
        }

        return order === 'asc' ? result : -result;
    });

    return sorted;
}
