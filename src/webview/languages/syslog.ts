import type { LanguageFn } from 'highlight.js/lib/core';

const syslog: LanguageFn = () => {
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

            // RFC 5424 timestamp
            {
                className: 'string',
                begin: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/
            },

            // RFC 3164 timestamp
            {
                className: 'string',
                begin: /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\b/
            },

            // RFC 5424 hostname
            {
                className: 'title',
                begin: /(?<=\s)(?:[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)(?=\s+\S+\s+(?:\S+|-)\s+(?:\S+|-)\s+)/
            },

            // RFC 5424 APP-NAME
            {
                className: 'keyword',
                begin: /(?<=\s)[A-Za-z0-9._/-]+(?=\s+(?:\d+|-)\s+(?:[A-Za-z0-9._-]+|-)\s+)/
            },

            // RFC 5424 PROCID
            {
                className: 'number',
                begin: /(?<=\s)\d+(?=\s+(?:[A-Za-z0-9._-]+|-)\s+(?:\[|-|\S+))/
            },

            // RFC 5424 MSGID
            {
                className: 'symbol',
                begin: /(?<=\s)[A-Za-z0-9._-]+(?=\s+(?:\[|-))/
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
                    // Structured data ID
                    {
                        className: 'title',
                        begin: /(?<=^\[)[A-Za-z0-9._@-]+/
                    },

                    // Parameter name
                    {
                        className: 'attr',
                        begin: /\b[A-Za-z0-9._-]+(?==)/
                    },

                    // Parameter value
                    {
                        className: 'string',
                        begin: /"/,
                        end: /"/,
                        contains: [
                            {
                                className: 'variable',
                                begin: /\\["\\\]]/
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

            // Common syslog severity words in MESSAGE
            {
                className: 'keyword',
                begin: /\b(?:emerg|alert|crit|err|error|warning|warn|notice|info|debug)\b/i
            },

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
            },

            // Numbers in MESSAGE
            {
                className: 'number',
                begin: /\b\d+(?:\.\d+)?\b/
            }
        ]
    };
};

export default syslog;