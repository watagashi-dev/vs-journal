import type { LanguageFn } from 'highlight.js/lib/core';

const vhdl: LanguageFn = () => {
    return {
        name: 'VHDL',
        case_insensitive: true,

        keywords: {
            keyword: [
                'architecture',
                'begin',
                'block',
                'body',
                'buffer',
                'case',
                'component',
                'configuration',
                'constant',
                'disconnect',
                'else',
                'elsif',
                'end',
                'entity',
                'exit',
                'file',
                'for',
                'function',
                'generate',
                'generic',
                'if',
                'impure',
                'in',
                'inout',
                'is',
                'label',
                'library',
                'linkage',
                'loop',
                'map',
                'mod',
                'nand',
                'new',
                'next',
                'nor',
                'not',
                'null',
                'of',
                'on',
                'open',
                'or',
                'others',
                'out',
                'package',
                'port',
                'procedure',
                'process',
                'pure',
                'range',
                'record',
                'register',
                'reject',
                'rem',
                'report',
                'return',
                'select',
                'severity',
                'signal',
                'shared',
                'sla',
                'sll',
                'sra',
                'srl',
                'subtype',
                'then',
                'to',
                'transport',
                'type',
                'unaffected',
                'units',
                'until',
                'use',
                'variable',
                'wait',
                'when',
                'while',
                'with',
                'xnor',
                'xor'
            ],
            type: [
                'bit',
                'bit_vector',
                'boolean',
                'character',
                'integer',
                'natural',
                'positive',
                'real',
                'string',
                'time',
                'std_logic',
                'std_logic_vector',
                'signed',
                'unsigned'
            ],
            literal: [
                'true',
                'false',
                'null',
                'unaffected'
            ],
            built_in: [
                'rising_edge',
                'falling_edge',
                'now',
                'to_integer',
                'to_unsigned',
                'to_signed',
                'resize',
                'conv_integer',
                'conv_std_logic_vector'
            ]
        },

        contains: [
            // Comments
            {
                className: 'comment',
                begin: /--/,
                end: /$/
            },

            // Library clauses
            {
                className: 'meta',
                begin: /\b(?:library|use)\b/
            },

            // Entity declarations
            {
                className: 'title',
                begin: /\bentity\s+[A-Za-z_][A-Za-z0-9_]*/
            },

            // Architecture declarations
            {
                className: 'title',
                begin: /\barchitecture\s+[A-Za-z_][A-Za-z0-9_]*/
            },

            // Component declarations
            {
                className: 'title',
                begin: /\bcomponent\s+[A-Za-z_][A-Za-z0-9_]*/
            },

            // Signal / variable / constant names
            {
                className: 'variable',
                begin: /\b(?:signal|variable|constant)\s+[A-Za-z_][A-Za-z0-9_]*/
            },

            // Numeric literals
            {
                className: 'number',
                begin: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/
            },

            // Based literals
            {
                className: 'number',
                begin: /\b\d+#(?:[0-9A-Fa-f_]+)#/
            },

            // Character literals
            {
                className: 'string',
                begin: /'(?:[^']|'')'/
            },

            // Strings
            {
                className: 'string',
                begin: /"/,
                end: /"/,
                contains: [
                    {
                        className: 'variable',
                        begin: /""/
                    }
                ]
            },

            // Operators
            {
                className: 'symbol',
                begin: /<=|>=|:=|=>|\/=|\*\*|<<|>>|<>|[&|]/
            }
        ]
    };
};

export default vhdl;