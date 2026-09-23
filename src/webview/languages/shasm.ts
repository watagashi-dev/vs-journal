import type { LanguageFn } from 'highlight.js/lib/core';

const shasm: LanguageFn = () => {
    return {
        name: 'SuperH Assembly',
        case_insensitive: true,

        contains: [
            // Comments
            {
                className: 'comment',
                begin: /;|!|\/\//,
                end: /$/
            },

            // Strings
            {
                className: 'string',
                begin: /"/,
                end: /"/,
                contains: [
                    {
                        className: 'variable',
                        begin: /\\./
                    }
                ]
            },
            {
                className: 'string',
                begin: /'/,
                end: /'/
            },

            // Labels
            {
                className: 'title',
                begin: /^\s*[A-Za-z_.$][\w.$]*:/,
                returnBegin: true,
                contains: [
                    {
                        className: 'title',
                        begin: /[A-Za-z_.$][\w.$]*(?=:)/,
                        relevance: 0
                    }
                ]
            },

            // Directives
            {
                className: 'meta',
                begin: /\.(?:text|data|bss|section|global|globl|extern|align|alignw|balign|byte|word|long|4byte|2byte|ascii|asciz|string|space|skip|comm|lcomm|type|size|file|ident)\b/
            },

            // SuperH registers
            {
                className: 'type',
                begin: /\b(?:r(?:[0-9]|1[0-5])|r15|sr|gbr|vbr|mach|macl|pr|pc|fpul|fpscr|fr(?:[0-9]|1[0-5])|xf(?:[0-9]|1[0-5])|dr(?:[0-9]|1[0-5])|xd(?:[0-9]|1[0-5]))\b/
            },

            // SuperH instructions
            {
                className: 'keyword',
                begin: /\b(?:add|addc|addv|and|andi|bra|braf|bf|bf\/s|bfs|bf\/s|bt|bt\/s|cmp\/eq|cmp\/ge|cmp\/gt|cmp\/hi|cmp\/hs|cmp\/pl|cmp\/pz|cmp\/str|div0s|div0u|div1|dmuls|dmulu|dt|exts\.b|exts\.w|extu\.b|extu\.w|jmp|jsr|jsr@|ldc|ldcl|lds|ldtlb|mac|mov|movca\.l|movco\.l|movli\.l|movml|movmu|movt|mova|movs|movi20|movwi|mull|muls|mulu|neg|negc|nop|not|ocbi|ocbp|ocbwb|or|ori|pref|rotcl|rotcr|rotl|rotr|rte|rts|sets|sett|shal|shar|shll|shll2|shll8|shll16|shlr|shlr2|shlr8|shlr16|sleep|stc|stcl|sts|stsl|sub|subc|subv|swap\.b|swap\.w|tas\.b|trapa|tst|xtrct|xor|xori)\b/
            },

            // Numeric literals
            {
                className: 'number',
                begin: /\b(?:0x[0-9a-f]+|0b[01]+|[0-9]+)\b/
            },

            // Character literals
            {
                className: 'string',
                begin: /'(?:\\.|[^'\\])'/
            }
        ]
    };
};

export default shasm;