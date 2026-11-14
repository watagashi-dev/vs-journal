import type { LanguageFn } from 'highlight.js';

// Common rules
const commonRules = [
    // Severity words
    {
        className: 'keyword',
        begin: /\b(?:EMERG|ALERT|CRIT|ERROR|ERR|WARNING|WARN|NOTICE|INFO|DEBUG|TRACE|FATAL)\b/i
    },

    // Numbers
    {
        className: 'number',
        begin: /\b(?:0x[0-9a-f]+|[0-9a-f]{2}|\d+(?:\.\d+)?)\b/i
    }
];

// Log language
export const log: LanguageFn = () => {
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

            ...commonRules,

            {
                className: 'string',
                begin: /"/,
                end: /"/,
                contains: [
                    {
                        begin: /\\./
                    }
                ]
            }
        ]
    };
};

// Syslog language
export const syslog: LanguageFn = () => {
    return {
        name: 'Syslog',
        contains: [
            // RFC 5424 / RFC 3164 PRI
            {
                className: 'meta',
                begin: /<\d{1,3}>/
            },

            // RFC 5424 version
            {
                className: 'number',
                begin: /(?<=^<\d{1,3}>)\d+(?=\s)/
            },

            // RFC 5424 date
            {
                className: 'number',
                begin: /\b\d{4}-\d{2}-\d{2}(?=T|\s)/
            },

            // RFC 3164 date
            {
                className: 'number',
                begin: /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b/
            },

            // RFC 5424 time
            {
                className: 'string',
                begin: /(?<=T|\s)\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?\b/
            },

            // RFC 3164 time
            {
                className: 'string',
                begin: /\b\d{2}:\d{2}:\d{2}(?:\.\d+)?\b/
            },

            // RFC 5424 hostname
            {
                className: 'title',
                //                begin: /(?<=^<\d{1,3}>\d{1,2}\s+\S+\s+)[A-Za-z0-9]\(?:[A-Za-z0-9.-]\*[A-Za-z0-9])?(?=\s+\S+\s+(?:\S+|-)\s+(?:\S+|-)\s+)/
                begin: /(?<=^<\d{1,3}>\d{1,2}\s+\S+\s+)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?=\s+\S+\s+(?:\S+|-)\s+(?:\S+|-)\s+)/
            },

            // RFC 5424 APP-NAME
            {
                className: 'keyword',
                begin: /(?<=^<\d{1,3}>\d{1,2}\s+\S+\s+)[A-Za-z0-9._/-]+(?=\s+(?:\d+|-)\s+(?:[A-Za-z0-9._-]+|-)\s+)/
            },

            // RFC 5424 PROCID
            {
                className: 'number',
                begin: /(?<=\s)\d+(?=\s+(?:[A-Za-z0-9._-]+|-)\s+(?:\[|-|\S+))/
            },

            // RFC 5424 MSGID
            {
                className: 'symbol',
                begin: /(?<=^<\d{1,3}>\d{1,2}\s+\S+\s+\S+\s+(?:\S+|-)\s+(?:\S+|-)\s+)[A-Za-z0-9._-]+(?=\s+(?:\[|-))/
            },

            // RFC 5424 NILVALUE
            {
                className: 'literal',
                begin: /(?<!\S)-(?=\s|$)/
            },

            // RFC 5424 structured data
            {
                className: 'meta',
                begin: /\[/,
                end: /\]/,
                contains: [
                    {
                        className: 'title',
                        begin: /(?<=^\[)[A-Za-z0-9._@-]+/
                    },
                    {
                        className: 'attr',
                        begin: /\b[A-Za-z0-9._-]+(?==)/
                    },
                    {
                        className: 'string',
                        begin: /"/,
                        end: /"/,
                        contains: [
                            {
                                className: 'variable',
                                begin: /\\["\]\]]/
                            }
                        ]
                    }
                ]
            },

            // RFC 3164 tag with PID
            {
                className: 'title',
                begin: /\b[A-Za-z0-9._/-]+(?=\[\d+\]:)/
            },

            // RFC 3164 tag without PID
            {
                className: 'title',
                begin: /\b[A-Za-z0-9._/-]+(?=:)/
            },

            // RFC 3164 PID
            {
                className: 'number',
                begin: /\[\d+\](?=:)/
            },

            // RFC 3164 tag without PID
            {
                className: 'keyword',
                begin: /\b[A-Za-z0-9._/-]+(?=:)/
            },

            // IPv4 address
            {
                className: 'number',
                begin: /\b(?:\d{1,3}\.){3}\d{1,3}\b/
            },

            // IPv6 address
            {
                className: 'number',
                begin: /\b(?:[0-9A-Fa-f]{1,4}:){2,7}[0-9A-Fa-f]{1,4}\b/
            },

            ...commonRules,

            // Quoted strings in MESSAGE
            {
                className: 'string',
                begin: /"/,
                end: /"/,
                contains: [
                    {
                        className: 'variable',
                        begin: /\\["\\]/
                    }
                ]
            }
        ]
    };
};
