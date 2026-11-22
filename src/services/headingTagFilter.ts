import { HeadingMeta } from '../models/FileMeta';

export function filterHeadingsForTag(
    headings: HeadingMeta[],
    sectionKey: string | undefined,
    tag: string,
    caseSensitive: boolean
): HeadingMeta[] {
    if (sectionKey === 'user') {
        return headings.filter(heading => heading.tags.includes(tag));
    }

    if (sectionKey === 'virtual') {
        const target = caseSensitive ? tag : tag.toLowerCase();

        return headings.filter(heading => {
            const text = caseSensitive
                ? heading.rawText
                : heading.rawText.toLowerCase();

            return text.includes(target);
        });
    }

    return [];
}
