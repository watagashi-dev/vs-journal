import type { LanguageFn } from 'highlight.js/lib/core';

const log: LanguageFn = (hljs) => {
    return {
        name: 'Log',
        contains: [
            {
                className: 'meta',
                begin: /\[[^\]]+\]/
            },
            {
                className: 'number',
                begin: /\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})\b/
            },
            {
                className: 'string',
                begin: /\b\d{1,2}:\d{2}:\d{2}(?:\.\d+)?\b/
            },
            {
                className: 'number',
                begin: /\b\d+(?:\.\d+)?\b/
            },
            {
                className: 'keyword',
                begin: /\b(?:INFO|DEBUG|WARN|WARNING|ERROR|FATAL|TRACE)\b/
            },
            {
                className: 'string',
                begin: /"(?:\\.|[^"\\])*"/,
                end: /"/
            }
        ]
    };
};

export default log;