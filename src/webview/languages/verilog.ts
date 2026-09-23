import type { LanguageFn } from 'highlight.js/lib/core';

const verilog: LanguageFn = () => {
    return {
        name: 'Verilog',
        case_insensitive: true,

        keywords: {
            keyword: [
                'always',
                'always_comb',
                'always_ff',
                'always_latch',
                'assign',
                'begin',
                'buf',
                'bufif0',
                'bufif1',
                'case',
                'casex',
                'casez',
                'cmos',
                'deassign',
                'default',
                'disable',
                'else',
                'end',
                'endcase',
                'endfunction',
                'endmodule',
                'endprimitive',
                'endtask',
                'for',
                'force',
                'forever',
                'fork',
                'function',
                'if',
                'initial',
                'inout',
                'input',
                'integer',
                'join',
                'localparam',
                'module',
                'nand',
                'negedge',
                'nor',
                'not',
                'notif0',
                'notif1',
                'or',
                'output',
                'parameter',
                'posedge',
                'primitive',
                'pull0',
                'pull1',
                'pulldown',
                'pullup',
                'reg',
                'release',
                'repeat',
                'rnmos',
                'rpmos',
                'rtran',
                'rtranif0',
                'rtranif1',
                'signed',
                'specify',
                'strong0',
                'strong1',
                'supply0',
                'supply1',
                'table',
                'task',
                'time',
                'tran',
                'tranif0',
                'tranif1',
                'tri',
                'tri0',
                'tri1',
                'triand',
                'trior',
                'trireg',
                'wand',
                'weak0',
                'weak1',
                'wire',
                'wor',
                'xnor',
                'xor'
            ],
            type: [
                'bit',
                'byte',
                'chandle',
                'event',
                'genvar',
                'int',
                'logic',
                'longint',
                'shortint',
                'shortreal',
                'string',
                'typedef',
                'uwire',
                'var',
                'void',
                'wire'
            ],
            literal: [
                '0',
                '1',
                'x',
                'z'
            ],
            built_in: [
                '$display',
                '$monitor',
                '$finish',
                '$stop',
                '$time',
                '$realtime',
                '$random',
                '$signed',
                '$unsigned',
                '$clog2',
                '$bits'
            ]
        },

        contains: [
            // Single-line comments
            {
                className: 'comment',
                begin: /\/\//,
                end: /$/
            },

            // Block comments
            {
                className: 'comment',
                begin: /\/\*/,
                end: /\*\//
            },

            // Preprocessor directives
            {
                className: 'meta',
                begin: /`[A-Za-z_][A-Za-z0-9_]*/
            },

            // Module and primitive declarations
            {
                className: 'title',
                begin: /\b(?:module|primitive|interface|program)\s+[A-Za-z_][A-Za-z0-9_$]*/
            },

            // Parameter and local parameter names
            {
                className: 'attr',
                begin: /\b(?:parameter|localparam)\s+[A-Za-z_][A-Za-z0-9_$]*/
            },

            // Port declarations
            {
                className: 'variable',
                begin: /\b(?:input|output|inout)\s+(?:wire|reg|logic|bit)?\b/
            },

            // Numbers
            {
                className: 'number',
                begin: /(?:\d+)?'[sS]?[bodhBODH][0-9a-fA-F_xXzZ]+/
            },
            {
                className: 'number',
                begin: /\b\d+(?:\.\d+)?\b/
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

            // Operators
            {
                className: 'symbol',
                begin: /===|!==|==|!=|<=|>=|<<|>>|<<<|>>>|&&|\|\||\+\+|--|->|=>/
            }
        ]
    };
};

export default verilog;