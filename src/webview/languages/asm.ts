import type { LanguageFn } from 'highlight.js/lib/core';

const asm: LanguageFn = () => {
    return {
        name: 'Assembly',
        case_insensitive: true,

        contains: [
            // Comments
            {
                className: 'comment',
                begin: /;|\/\//,
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
                begin: /^\s*[A-Za-z_.$?@][\w.$?@]*:/,
                returnBegin: true,
                contains: [
                    {
                        className: 'title',
                        begin: /[A-Za-z_.$?@][\w.$?@]*(?=:)/,
                        relevance: 0
                    }
                ]
            },

            // Directives
            {
                className: 'keyword',
                begin: /(?:^|\s)\.?[A-Za-z_][\w.]*(?=\s|$)/,
                keywords: {
                    meta: [
                        'section',
                        'text',
                        'data',
                        'bss',
                        'global',
                        'globl',
                        'extern',
                        'public',
                        'extern',
                        'include',
                        'macro',
                        'endm',
                        'equ',
                        'set',
                        'org',
                        'align',
                        'byte',
                        'word',
                        'dword',
                        'qword',
                        'db',
                        'dw',
                        'dd',
                        'dq',
                        'dt',
                        'resb',
                        'resw',
                        'resd',
                        'resq'
                    ]
                }
            },

            // Registers
            {
                className: 'variable',
                begin: /\b(?:r(?:[0-9]|1[0-5])|e(?:ax|bx|cx|dx|si|di|bp|sp)|[re]ip|[re]flags|[abcd][lh]|xmm\d+|ymm\d+|zmm\d+|cr\d+|dr\d+|st(?:\d+)?|sp|fp|lr|pc)\b/
            },

            // Instructions
            {
                className: 'keyword',
                begin: /\b(?:adc|add|addc|addcc|and|andi|asr|b|bal|bcc|bcs|beq|bge|bgt|bhis|bhi|ble|blo|bls|blt|bmi|bne|bpl|bra|br|bsr|bt|bts|bvc|bvs|call|cmp|cmpi|cmpeq|cmphs|cmphi|cmpls|cmplt|cmpstr|dec|div|divu|eor|exg|ext|extb|extw|jmp|jsr|lea|link|lsl|lsr|mov|move|movem|movep|movq|muls|mulu|mul|neg|nop|not|or|ori|pop|push|ret|rol|ror|rts|sbcd|sbb|sbc|shl|shr|sll|sra|srl|st|sub|subc|subi|swap|test|trap|tst|xor|xori)\b/
            },

            // Numeric literals
            {
                className: 'number',
                begin: /\b(?:0x[0-9a-f]+|0b[01]+|[0-9]+[bh])\b|\b\d+\b/
            },

            // Character literals
            {
                className: 'string',
                begin: /'(?:\\.|[^'\\])'/
            }
        ]
    };
};

export default asm;