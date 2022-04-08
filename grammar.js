//https://developer.salesforce.com/docs/atlas.en-us.soql_sosl.meta/soql_sosl/sforce_api_calls_sosl_syntax.htm
const DIGITS = token(sep1(/[0-9]+/, /_+/))
const HEX_DIGITS = token(sep1(/[A-Fa-f0-9]+/, '_'))
const PREC = {
    // https://introcs.cs.princeton.edu/java/11precedence/
    COMMENT: 0,      // //  /*  */
    ASSIGN: 1,       // =  += -=  *=  /=  %=  &=  ^=  |=  <<=  >>=  >>>=
    SWITCH_EXP: 1,   // always prefer to parse switch as expression over statement
    DECL: 2,
    ELEMENT_VAL: 2,
    TERNARY: 3,      // ?:
    OR: 4,           // ||
    AND: 5,          // &&
    BIT_OR: 6,       // |
    BIT_XOR: 7,      // ^
    BIT_AND: 8,      // &
    EQUALITY: 9,     // ==  !=
    GENERIC: 10,
    REL: 10,         // <  <=  >  >=  instanceof
    SHIFT: 11,       // <<  >>  >>>
    ADD: 12,         // +  -
    MULT: 13,        // *  /  %
    CAST: 14,        // (Type)
    OBJ_INST: 14,    // new
    UNARY: 15,       // ++a  --a  a++  a--  +  -  !  ~
    ARRAY: 16,       // [Index]
    OBJ_ACCESS: 16,  // .
    PARENS: 16,      // (Expression)
};

module.exports = grammar({
    name: 'apex',

    extras: $ => [
        $.line_comment,
        $.block_comment,
        /\s/
    ],

    supertypes: $ => [
        $.expression,
        $.declaration,
        $.statement,
        $.primary_expression,
        $._literal,
        $._type,
        $._simple_type,
        $._unannotated_type,
        $.comment,
        $.database_query,
        $.dml_statement
    ],

    inline: $ => [
        $._name,
        $._simple_type,
        $._reserved_identifier,
        $._class_body_declaration,
        $._variable_initializer
    ],

    conflicts: $ => [
        [$.modifiers, $.annotated_type, $.receiver_parameter],
        [$._unannotated_type, $.primary_expression, $.inferred_parameters],
        [$._unannotated_type, $.primary_expression],
        [$._unannotated_type, $.primary_expression, $.scoped_type_identifier],
        [$._unannotated_type, $.scoped_type_identifier],
        [$._unannotated_type, $.generic_type],
        [$.generic_type, $.primary_expression],
    ],

    word: $ => $.identifier,

    rules: {
        program: $ => repeat($.statement),

        // Literals

        _literal: $ => choice(
            $.decimal_integer_literal,
            $.decimal_floating_point_literal,
            $.true,
            $.false,
            $.string_literal,
            $.null_literal
        ),

        decimal_integer_literal: $ => token(seq(
            DIGITS,
            optional(choice('l', 'L'))
        )),

        decimal_floating_point_literal: $ => token(choice(
            seq(DIGITS, '.', optional(DIGITS), optional(seq((/[eE]/), optional(choice('-', '+')), DIGITS)), optional(/[fFdD]/)),
            seq('.', DIGITS, optional(seq((/[eE]/), optional(choice('-', '+')), DIGITS)), optional(/[fFdD]/)),
            seq(DIGITS, /[eEpP]/, optional(choice('-', '+')), DIGITS, optional(/[fFdD]/)),
            seq(DIGITS, optional(seq((/[eE]/), optional(choice('-', '+')), DIGITS)), (/[fFdD]/))
        )),

        hex_floating_point_literal: $ => token(seq(
            choice('0x', '0X'),
            choice(
                seq(HEX_DIGITS, optional('.')),
                seq(optional(HEX_DIGITS), '.', HEX_DIGITS)
            ),
            optional(seq(
                /[eEpP]/,
                optional(choice('-', '+')),
                DIGITS,
                optional(/[fFdD]/)
            ))
        )),

        true: $ => caseInsensitive('true'),

        false: $ => caseInsensitive('false'),

        string_literal: $ => token(
            seq('\'', repeat(choice(/[^\\'\n]/, /\\(.|\n)/)), '\''),
        ),

        null_literal: $ => caseInsensitive('null'),

        // Expressions

        expression: $ => choice(
            $.assignment_expression,
            $.binary_expression,
            $.instanceof_expression,
            $.ternary_expression,
            $.update_expression,
            $.primary_expression,
            $.unary_expression,
            $.cast_expression,
            // prec(PREC.SWITCH_EXP, $.switch_expression), //TODO can remove?
        ),

        database_query: $ => choice($.soql_query, $.sosl_query),

        sosl_query: $ => seq(
            '[',
            $.sosl_find_clause,
            optional($.sosl_in_clause),
            $.sosl_returning_clause,
            ']'
        ),
        sosl_find_clause: $ => seq(
            caseInsensitive('find'),
            field("search_query", $._query_value_reference)
        ),

        sosl_in_clause: $ => seq(
            caseInsensitive('in'),
            choice(
                caseInsensitive('all'),
                caseInsensitive('email'),
                caseInsensitive('name'),
                caseInsensitive('phone'),
                caseInsensitive('sidebar')
            ),
            caseInsensitive('fields')
        ),
        // sosl_division_filters: $ => null,
        // sosl_data_category_filters: $ => null,
        // sosl_snippnet_filter: $ => null,
        // sosl_network_filter: $=>null,
        // sosl_pricebook_filter: $ => null,
        // sosl_metadata_filter: $=> null,
        // sosl_limit: $=> null,
        sosl_returning_clause: $ => seq(
            caseInsensitive('returning'),
            commaSep1($.sosl_entity_definition)
        ),

        sosl_entity_definition: $ => seq(
            field('sobject', $.identifier)
        ),

        _query_value_reference: $ => choice(
            seq(':', $.expression),
            $._literal
        ),

        soql_query: $ => seq(
            '[',
            $.select_clause,
            $.from_clause,
            optional($.where_clause),
            optional($.group_by_clause),
            optional($.having_clause),
            optional($.order_by_clause),
            optional($.limit_clause),
            optional($.offset_clause),
            ']'
        ),

        select_clause: $ => seq(
            caseInsensitive('SELECT'),
            commaSep(choice(
                $.field_name,
                $.aggregation_function,
                $.typeof_clause,
                field('relationship_query', $.soql_query)
            ))
        ),

        aggregation_function: $ => seq(
            field('aggr_function', $.identifier),
            '(',
            $.field_name,
            ')',
            optional(field('alias', $.identifier))
        ),

        queried_value: $ => choice($.aggregation_function, $.field_name),

        from_clause: $ => seq(
            caseInsensitive('FROM'),
            commaSep1($.from_clause_source)
        ),

        from_clause_source: $ => seq(
            field('relationship_name', $.field_name),
            optional(field('alias', $.identifier))
        ),

        where_clause: $ => seq(
            caseInsensitive('WHERE'),
            $._field_expression_wrapper
        ),

        field_expression: $ => choice(seq(
                field('field', $.field_name),
                field('operator', choice(
                    '=',
                    '!=',
                    caseInsensitive('in'),
                    caseInsensitive('like')
                )),
                field('value', $._query_value_reference)
            ),

            seq('(', $.field_expression, ')')
        ),

        _field_expression_wrapper: $ => choice(
            $.field_expression,
            $.complex_field_expression,
            // $.parenthesized_expression
        ),

        parenthesized_field_expression: $ => seq(
            '(',
            $._field_expression_wrapper,
            ')'
        ),

        complex_field_expression: $ => prec.left(10, seq(
            field('left', $._field_expression_wrapper),
            field('operator', choice(caseInsensitive('OR'), caseInsensitive('AND'))),
            field('right', $._field_expression_wrapper)
        )),

        where_condition: $ => choice(
            $.field_expression,
            seq('(', $.field_expression)
        ),

        typeof_clause: $ => seq(
            caseInsensitive('typeof'),
            $.field_name,
            repeat($.typeof_clause_branch),
            optional($.typeof_clause_else_branch),
            caseInsensitive('end')
        ),

        typeof_clause_else_branch: $ => seq(
            caseInsensitive('else'),
            commaSep1($.queried_value)
        ),

        typeof_clause_branch: $ => seq(
            caseInsensitive('WHEN'),
            field('object_type', $.identifier),
            caseInsensitive('THEN'),
            commaSep1($.queried_value)
        ),

        field_name: $ => dotSeparated($.identifier),

        //TODO
        order_by_clause: $ => seq(
            caseInsensitive('Order'),
            caseInsensitive('by'),
            commaSep1(seq(
                field("field", $.field_name),
                field("order", optional(choice(
                    caseInsensitive('ASC'),
                    caseInsensitive('desc')
                ))),
                field("null_order", optional(seq(
                    caseInsensitive('nulls'),
                    choice(
                        caseInsensitive('first'),
                        caseInsensitive('last')
                    )
                )))
            ))
        ),

        limit_clause: $ => seq(
            caseInsensitive('limit'),
            field('limit', $._query_value_reference)
        ),

        offset_clause: $ => seq(
            caseInsensitive('offset'),
            field('offset', $._query_value_reference)
        ),

        //TODO
        group_by_clause: $ => seq(
            caseInsensitive('GROUP'),
            caseInsensitive('BY')
        ),

        //TODO
        having_clause: $ => seq(
            caseInsensitive('having')
        ),

        dml_statement: $=> choice(
            $.dml_insert_statement,
            $.dml_update_statement,
            $.dml_upsert_statement,
            $.dml_delete_statement,
            $.dml_undelete_statemetn,
            // $.dml_merge_statement TODO
        ),

        dml_insert_statement: $=> seq(
            caseInsensitive('insert'),
            field('value', $.primary_expression),
            ';'
        ),

        dml_update_statement: $=> seq(
            caseInsensitive('update'),
            field('value', $.primary_expression),
            ';'
        ),

        dml_upsert_statement: $=> seq(
            caseInsensitive('upsert'),
            field('value', $.primary_expression),
            optional(field('field', $.field_name)),
            ';'
        ),

        dml_delete_statement: $=>seq(
            caseInsensitive('delete'),
            field('value', $.expression),
            ';'
        ),

        dml_undelete_statemetn: $=> seq(
            caseInsensitive('undelete'),
            field('value', $.expression),
            ';'
        ),

        // //TODO
        // dml_merge_statement: $=> seq(
        //     caseInsensitive('merge'),
        //     field('master_record', $.expression),
        //     field('merged', $.expression),
        //     ';'
        // ),

        cast_expression: $ => prec(PREC.CAST, seq(
            '(',
            sep1(field('type', $._type), '&'),
            ')',
            field('value', $.expression)
        )),

        assignment_expression: $ => prec.right(PREC.ASSIGN, seq(
            field('left', choice(
                $.identifier,
                $._reserved_identifier,
                $.field_access,
                $.array_access
            )),
            field('operator', choice('=', '+=', '-=', '*=', '/=', '&=', '|=', '^=', '%=', '<<=', '>>=', '>>>=')),
            field('right', $.expression)
        )),

        binary_expression: $ => choice(
            ...[
                ['>', PREC.REL],
                ['<', PREC.REL],
                ['>=', PREC.REL],
                ['<=', PREC.REL],
                ['==', PREC.EQUALITY],
                ['===', PREC.EQUALITY],
                ['!=', PREC.EQUALITY],
                ['&&', PREC.AND],
                ['||', PREC.OR],
                ['+', PREC.ADD],
                ['-', PREC.ADD],
                ['*', PREC.MULT],
                ['/', PREC.MULT],
                ['&', PREC.BIT_AND],
                ['|', PREC.BIT_OR],
                ['^', PREC.BIT_XOR],
                ['%', PREC.MULT],
                ['<<', PREC.SHIFT],
                ['>>', PREC.SHIFT],
                ['>>>', PREC.SHIFT],
            ].map(([operator, precedence]) =>
                prec.left(precedence, seq(
                    field('left', $.expression),
                    field('operator', operator),
                    field('right', $.expression)
                ))
            )),

        instanceof_expression: $ => prec(PREC.REL, seq(
            field('left', $.expression),
            caseInsensitive('instanceof'),
            field('right', $._type)
        )),

        inferred_parameters: $ => seq(
            '(',
            commaSep1($.identifier),
            ')'
        ),

        ternary_expression: $ => prec.right(PREC.TERNARY, seq(
            field('condition', $.expression),
            '?',
            field('consequence', $.expression),
            ':',
            field('alternative', $.expression)
        )),

        unary_expression: $ => choice(...[
            ['+', PREC.UNARY],
            ['-', PREC.UNARY],
            ['!', PREC.UNARY],
            ['~', PREC.UNARY],
        ].map(([operator, precedence]) =>
            prec.left(precedence, seq(
                field('operator', operator),
                field('operand', $.expression)
            ))
        )),

        update_expression: $ => prec.left(PREC.UNARY, choice(
            seq($.expression, choice('++', '--')),
            seq(choice('++', '--'), $.expression),
        )),

        primary_expression: $ => choice(
            $._literal,
            $.database_query,
            $.class_literal,
            $.this,
            $.identifier,
            // $._reserved_identifier,
            $.parenthesized_expression,
            $.object_creation_expression,
            $.field_access,
            $.array_access,
            $.method_invocation,
            $.array_creation_expression,
        ),

        array_creation_expression: $ => prec.right(seq(
            'new',
            field('type', $._simple_type),
            choice(
                seq(
                    field('dimensions', repeat1($.dimensions_expr)),
                    field('dimensions', optional($.dimensions))
                ),
                seq(
                    field('dimensions', $.dimensions),
                    field('value', $.array_initializer)
                )
            )
        )),

        dimensions_expr: $ => seq('[', $.expression, ']'),

        parenthesized_expression: $ => seq('(', $.expression, ')'),

        class_literal: $ => seq($._unannotated_type, '.', 'class'),

        object_creation_expression: $ => choice(
            $._unqualified_object_creation_expression,
            seq($.primary_expression, '.', $._unqualified_object_creation_expression)
        ),

        _unqualified_object_creation_expression: $ => prec.right(seq(
            'new',
            field('type_arguments', optional($.type_arguments)),
            field('type', $._simple_type),
            field('arguments', $.argument_list),
            optional($.class_body)
        )),

        field_access: $ => seq(
            field('object', choice($.primary_expression, $.super)),
            optional(seq(
                '.',
                $.super
            )),
            '.',
            field('field', choice($.identifier, $._reserved_identifier, $.this))
        ),

        array_access: $ => seq(
            field('array', $.primary_expression),
            '[',
            field('index', $.expression),
            ']',
        ),

        method_invocation: $ => seq(
            choice(
                field('name', choice($.identifier, $._reserved_identifier)),
                seq(
                    field('object', choice($.primary_expression, $.super)),
                    '.',
                    optional(seq(
                        $.super,
                        '.'
                    )),
                    field('type_arguments', optional($.type_arguments)),
                    field('name', choice($.identifier, $._reserved_identifier)),
                )
            ),
            field('arguments', $.argument_list)
        ),

        argument_list: $ => seq('(', commaSep($.expression), ')'),


        type_arguments: $ => seq(
            '<',
            commaSep(choice($._type, $.wildcard)),
            '>'
        ),

        wildcard: $ => seq(
            repeat($._annotation),
            '?',
            optional($._wildcard_bounds)
        ),

        _wildcard_bounds: $ => choice(
            seq('extends', $._type),
            seq($.super, $._type)
        ),

        dimensions: $ => prec.right(repeat1(
            seq('[', ']')
        )),

        //tODO change
        switch_expression: $ => seq(
            caseInsensitive('switch'),
            caseInsensitive('on'),
            field('condition', $.expression),
            field('body', $.switch_block)
        ),

        switch_block: $ => seq(
            '{',
                repeat(choice(
                    $.switch_block_statement_group,
                    $.sobject_switch_statement_group
                )),
            optional($.default_switch_statement_group),
            '}'
        ),

        switch_block_statement_group: $ => prec.left(seq(
            caseInsensitive('when'),
            field('condition', commaSep1($.expression)),
            $.block,
        )),

        default_switch_statement_group: $ => prec.left(seq(
            caseInsensitive('when'),
            caseInsensitive('default'),
            $.block
        )),

        sobject_switch_statement_group: $=> seq(
            caseInsensitive('when'),
            field('sobject_type', $.identifier),
            field('var_name', $.identifier),
            field('code', $.block)
        ),


        // Statements

        statement: $ => choice(
            $.declaration,
            $.expression_statement,
            $.if_statement,
            $.while_statement,
            $.for_statement,
            $.enhanced_for_statement,
            $.block,
            $.do_statement,
            $.break_statement,
            $.continue_statement,
            $.return_statement,
            $.switch_expression, //switch statements and expressions are identical
            $.local_variable_declaration,
            $.throw_statement,
            $.try_statement,
            $.dml_statement
        ),

        block: $ => seq(
            '{', repeat($.statement), '}'
        ),

        expression_statement: $ => seq(
            $.expression,
            ';'
        ),

        do_statement: $ => seq(
            caseInsensitive('do'),
            field('body', $.statement),
            caseInsensitive('while'),
            field('condition', $.parenthesized_expression),
            ';'
        ),

        break_statement: $ => seq(caseInsensitive('break'), optional($.identifier), ';'),

        continue_statement: $ => seq(caseInsensitive('continue'), optional($.identifier), ';'),

        return_statement: $ => seq(
            caseInsensitive('return'),
            optional($.expression),
            ';'
        ),

        throw_statement: $ => seq(caseInsensitive('throw'), $.expression, ';'),

        try_statement: $ => seq(
            caseInsensitive('try'),
            field('body', $.block),
            choice(
                repeat1($.catch_clause),
                seq(repeat($.catch_clause), $.finally_clause)
            )
        ),

        catch_clause: $ => seq(
            caseInsensitive('catch'),
            '(',
            $.catch_formal_parameter,
            ')',
            field('body', $.block)
        ),

        catch_formal_parameter: $ => seq(
            optional($.modifiers),
            $.catch_type,
            $._variable_declarator_id
        ),

        catch_type: $ => sep1($._unannotated_type, '|'),

        finally_clause: $ => seq(caseInsensitive('finally'), $.block),

        if_statement: $ => prec.right(seq(
            caseInsensitive('if'),
            field('condition', $.parenthesized_expression),
            field('consequence', $.statement),
            optional(seq(caseInsensitive('else'), field('alternative', $.statement)))
        )),

        while_statement: $ => seq(
            caseInsensitive('while'),
            field('condition', $.parenthesized_expression),
            field('body', $.statement)
        ),

        for_statement: $ => seq(
            caseInsensitive('for'), '(',
            choice(
                field('init', $.local_variable_declaration),
                seq(
                    commaSep(field('init', $.expression)),
                    ';'
                )
            ),
            field('condition', optional($.expression)), ';',
            commaSep(field('update', $.expression)), ')',
            field('body', $.statement)
        ),

        enhanced_for_statement: $ => seq(
            caseInsensitive('for'),
            '(',
            optional($.modifiers),
            field('type', $._unannotated_type),
            $._variable_declarator_id,
            ':',
            field('value', $.expression),
            ')',
            field('body', $.statement)
        ),

        // Annotations

        _annotation: $ => choice(
            $.marker_annotation,
            $.annotation
        ),

        marker_annotation: $ => seq(
            '@',
            field('name', $._name)
        ),

        annotation: $ => seq(
            '@',
            field('name', $._name),
            field('arguments', $.annotation_argument_list)
        ),

        annotation_argument_list: $ => seq(
            '(',
            choice(
                $._element_value,
                commaSep($.element_value_pair),
            ),
            ')'
        ),

        element_value_pair: $ => seq(
            field('key', $.identifier),
            '=',
            field('value', $._element_value)
        ),

        _element_value: $ => prec(PREC.ELEMENT_VAL, choice(
            $.expression,
            $.element_value_array_initializer,
            $._annotation
        )),

        element_value_array_initializer: $ => seq(
            '{',
            commaSep($._element_value),
            optional(','),
            '}'
        ),

        // Declarations

        declaration: $ => prec(PREC.DECL, choice(
            $.class_declaration,
            $.interface_declaration,
            $.enum_declaration,
        )),

        asterisk: $ => '*',

        enum_declaration: $ => seq(
            optional($.modifiers),
            caseInsensitive('enum'),
            field('name', $.identifier),
            field('interfaces', optional($.super_interfaces)),
            field('body', $.enum_body)
        ),

        enum_body: $ => seq(
            '{',
            commaSep($.enum_constant),
            optional(','),
            optional($.enum_body_declarations),
            '}'
        ),

        enum_body_declarations: $ => seq(
            ';',
            repeat($._class_body_declaration)
        ),

        enum_constant: $ => (seq(
            optional($.modifiers),
            field('name', $.identifier),
            field('arguments', optional($.argument_list)),
            field('body', optional($.class_body))
        )),

        class_declaration: $ => seq(
            optional($.modifiers),
            optional($.access_modifiers),
            caseInsensitive('class'),
            field('name', $.identifier),
            optional(field('type_parameters', $.type_parameters)),
            optional(field('superclass', $.superclass)),
            optional(field('interfaces', $.super_interfaces)),
            field('body', $.class_body)
        ),

        access_modifiers: $ => seq(
            choice(
                caseInsensitive('with'),
                caseInsensitive('without'),
                caseInsensitive('inherited')
            ),
            caseInsensitive('sharing')
        ),

        modifiers: $ => repeat1(choice(
            $._annotation,
            caseInsensitive('public'),
            caseInsensitive('protected'),
            caseInsensitive('private'),
            caseInsensitive('global'),
            caseInsensitive('virtual'),
            caseInsensitive('static'),
            caseInsensitive('final'),
        )),

        type_parameters: $ => seq(
            '<', commaSep1($.type_parameter), '>'
        ),

        type_parameter: $ => seq(
            repeat($._annotation),
            alias($.identifier, $.type_identifier),
            optional($.type_bound)
        ),

        type_bound: $ => seq('extends', $._type, repeat(seq('&', $._type))),

        superclass: $ => seq(
            'extends',
            $._type
        ),

        super_interfaces: $ => seq(
            'implements',
            $.interface_type_list
        ),

        interface_type_list: $ => seq(
            $._type,
            repeat(seq(',', $._type))
        ),

        class_body: $ => seq(
            '{',
            repeat($._class_body_declaration),
            '}'
        ),

        _class_body_declaration: $ => choice(
            $.field_declaration,
            $.method_declaration,
            $.class_declaration,
            $.interface_declaration,
            $.enum_declaration,
            $.block,
            $.static_initializer,
            $.constructor_declaration,
            ';'
        ),

        static_initializer: $ => seq(
            caseInsensitive('static'),
            $.block
        ),

        constructor_declaration: $ => seq(
            optional($.modifiers),
            $._constructor_declarator,
            field('body', $.constructor_body)
        ),

        _constructor_declarator: $ => seq(
            field('type_parameters', optional($.type_parameters)),
            field('name', $.identifier),
            field('parameters', $.formal_parameters)
        ),

        constructor_body: $ => seq(
            '{',
            optional($.explicit_constructor_invocation),
            repeat($.statement),
            '}'
        ),

        explicit_constructor_invocation: $ => seq(
            choice(
                seq(
                    field('type_arguments', optional($.type_arguments)),
                    field('constructor', choice($.this, $.super)),
                ),
                seq(
                    field('object', choice($.primary_expression)),
                    '.',
                    field('type_arguments', optional($.type_arguments)),
                    field('constructor', $.super),
                )
            ),
            field('arguments', $.argument_list),
            ';'
        ),

        _name: $ => choice(
            $.identifier,
            $._reserved_identifier,
            $.scoped_identifier
        ),

        scoped_identifier: $ => seq(
            field('scope', $._name),
            '.',
            field('name', $.identifier)
        ),

        field_declaration: $ => seq(
            optional($.modifiers),
            field('type', $._unannotated_type),
            $._variable_declarator_list,
            ';'
        ),

        _default_value: $ => seq(
            'default',
            field('value', $._element_value)
        ),

        interface_declaration: $ => seq(
            optional($.modifiers),
            caseInsensitive('interface'),
            field('name', $.identifier),
            field('type_parameters', optional($.type_parameters)),
            optional($.extends_interfaces),
            field('body', $.interface_body)
        ),

        extends_interfaces: $ => seq(
            caseInsensitive('extends'),
            $.interface_type_list
        ),

        interface_body: $ => seq(
            '{',
            repeat(choice(
                $.constant_declaration,
                $.enum_declaration,
                $.method_declaration,
                $.class_declaration,
                $.interface_declaration,
                ';'
            )),
            '}'
        ),

        constant_declaration: $ => seq(
            optional($.modifiers),
            field('type', $._unannotated_type),
            $._variable_declarator_list,
            ';'
        ),

        _variable_declarator_list: $ => commaSep1(
            field('declarator', $.variable_declarator)
        ),

        variable_declarator: $ => seq(
            $._variable_declarator_id,
            optional(seq('=', field('value', $._variable_initializer)))
        ),

        _variable_declarator_id: $ => seq(
            field('name', choice($.identifier, $._reserved_identifier)),
            field('dimensions', optional($.dimensions))
        ),

        _variable_initializer: $ => choice(
            $.expression,
            $.array_initializer
        ),

        array_initializer: $ => seq(
            '{',
            commaSep($._variable_initializer),
            optional(','),
            '}'
        ),

        // Types

        _type: $ => choice(
            $._unannotated_type,
            $.annotated_type
        ),

        _unannotated_type: $ => choice(
            $._simple_type,
            $.array_type
        ),

        _simple_type: $ => choice(
            $.void_type,
            $.integral_type,
            $.floating_point_type,
            $.boolean_type,
            alias($.identifier, $.type_identifier),
            $.scoped_type_identifier,
            $.generic_type
        ),

        annotated_type: $ => seq(
            repeat1($._annotation),
            $._unannotated_type
        ),

        scoped_type_identifier: $ => seq(
            choice(
                alias($.identifier, $.type_identifier),
                $.scoped_type_identifier,
                $.generic_type
            ),
            '.',
            repeat($._annotation),
            alias($.identifier, $.type_identifier)
        ),

        generic_type: $ => prec.dynamic(PREC.GENERIC, seq(
            choice(
                alias($.identifier, $.type_identifier),
                $.scoped_type_identifier
            ),
            $.type_arguments
        )),

        array_type: $ => seq(
            field('element', $._unannotated_type),
            field('dimensions', $.dimensions)
        ),

        integral_type: $ => choice(
            caseInsensitive('integer'),
            caseInsensitive('long'),
        ),

        floating_point_type: $ => choice(
            caseInsensitive('double'),
            caseInsensitive('decimal')
        ),

        boolean_type: $ => caseInsensitive('boolean'),

        void_type: $ => caseInsensitive('void'),

        _method_header: $ => seq(
            optional(seq(
                field('type_parameters', $.type_parameters),
                repeat($._annotation)
            )),
            field('type', $._unannotated_type),
            $._method_declarator,
        ),

        _method_declarator: $ => seq(
            field('name', choice($.identifier, $._reserved_identifier)),
            field('parameters', $.formal_parameters),
            field('dimensions', optional($.dimensions))
        ),

        formal_parameters: $ => seq(
            '(',
            optional($.receiver_parameter),
            //TODO in case of error binrg back commaSep(choice($.formal_parameter, $.spread_parameter)),
            commaSep($.formal_parameter),
            ')'
        ),

        formal_parameter: $ => seq(
            optional($.modifiers),
            field('type', $._unannotated_type),
            $._variable_declarator_id
        ),

        receiver_parameter: $ => seq(
            // TODO verify repeat($._annotation),
            $._unannotated_type,
            optional(seq($.identifier, '.')),
            $.this
        ),

        local_variable_declaration: $ => seq(
            optional($.modifiers),
            field('type', $._unannotated_type),
            $._variable_declarator_list,
            ';'
        ),

        method_declaration: $ => seq(
            optional($.modifiers),
            $._method_header,
            choice(field('body', $.block), ';')
        ),

        _reserved_identifier: $ => alias(choice(
            'open',
            'module'
        ), $.identifier),

        this: $ => caseInsensitive('this'),

        super: $ => caseInsensitive('super'),

        // https://docs.oracle.com/javase/specs/jls/se8/html/jls-3.html#jls-IdentifierChars
        identifier: $ => /[\p{L}_$][\p{L}\p{Nd}_$]*/,

        // http://stackoverflow.com/questions/13014947/regex-to-match-a-c-style-multiline-comment/36328890#36328890
        comment: $ => choice(
            $.line_comment,
            $.block_comment,
        ),

        line_comment: $ => token(prec(PREC.COMMENT, seq('//', /[^\n]*/))),

        block_comment: $ => token(prec(PREC.COMMENT,
            seq(
                '/*',
                /[^*]*\*+([^/*][^*]*\*+)*/,
                '/'
            )
        )),
    }
});

function sep1(rule, separator) {
    return seq(rule, repeat(seq(separator, rule)));
}

function commaSep1(rule) {
    return seq(rule, repeat(seq(',', rule)))
}

function dotSeparated(rule) {
    return seq(rule, optional(repeat(seq('.', rule))))

}

function commaSep(rule) {
    return optional(commaSep1(rule))
}

function caseInsensitive(keyword) {
    return new RegExp(keyword.split("").map(letter => `[${letter}${letter.toUpperCase()}]`).join(""))
}