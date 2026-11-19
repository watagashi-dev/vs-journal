import type { LanguageFn } from 'highlight.js';

const makefile: LanguageFn = (hljs) => {
    const logicalLineEnd = /(?:(?<!\\)(?:\\\\)*\r?\n|(?![\s\S]))/;

    const variable = {
        className: 'variable',
        variants: [
            {
                begin: '\\$\\(' + hljs.UNDERSCORE_IDENT_RE + '\\)'
            },
            { begin: /\$[@%<?\^\+\*]/ }
        ]
    };

    const quoteString = {
        className: 'string',
        begin: /"/,
        end: /"/,
        contains: [
            variable
        ]
    };

    const continuedQuoteString = {
        ...quoteString,
        endsWithParent: true
    };

    const func = {
        className: 'variable',
        begin: /\$\([\w-]+\s/,
        end: /\)/,
        endsWithParent: true,
        keywords: {
            built_in: 'subst patsubst strip findstring filter filter-out sort '
                + 'word wordlist firstword lastword dir notdir suffix basename '
                + 'addsuffix addprefix join wildcard realpath abspath error warning '
                + 'shell origin flavor foreach if or and call eval file value'
        },
        contains: [
            variable,
            continuedQuoteString
        ]
    };

    const assignment = {
        begin: '^' + hljs.UNDERSCORE_IDENT_RE + '\\s*(?=[:+?]?=)'
    };

    const continuedAssignment = {
        begin: new RegExp('^' + hljs.UNDERSCORE_IDENT_RE + '[ \\t]*(?=[:+?]?=)'),
        returnBegin: true,
        end: logicalLineEnd,
        relevance: 0,
        contains: [
            hljs.HASH_COMMENT_MODE,
            func,
            continuedQuoteString,
            variable,
            assignment
        ]
    };

    const meta = {
        className: 'meta',
        begin: /^\.PHONY:/,
        end: logicalLineEnd,
        keywords: {
            $pattern: /[\.\w]+/,
            keyword: '.PHONY'
        }
    };

    const target = {
        className: 'section',
        begin: /^[^\s]+:/,
        end: logicalLineEnd,
        contains: [
            func,
            continuedQuoteString,
            variable
        ]
    };

    const recipe = {
        begin: /^\t/,
        end: logicalLineEnd,
        relevance: 0,
        contains: [
            hljs.HASH_COMMENT_MODE,
            func,
            continuedQuoteString,
            variable
        ]
    };

    return {
        name: 'Makefile',
        aliases: [
            'mk',
            'mak',
            'make'
        ],
        keywords: {
            $pattern: /[\w-]+/,
            keyword: 'define endef undefine ifdef ifndef ifeq ifneq else endif '
                + 'include -include sinclude override export unexport private vpath'
        },
        contains: [
            hljs.HASH_COMMENT_MODE,
            continuedAssignment,
            recipe,
            variable,
            quoteString,
            func,
            assignment,
            meta,
            target
        ]
    };
};

export default makefile;
