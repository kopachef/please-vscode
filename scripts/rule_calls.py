import ast
import json
import sys


def string_value(node):
    """Returns a string literal from Python ASTs across Python versions."""
    constant_node = getattr(ast, "Constant", None)
    if (
        constant_node is not None
        and isinstance(node, constant_node)
        and isinstance(node.value, str)
    ):
        return node.value

    string_node = getattr(ast, "Str", None)
    if string_node is not None and isinstance(node, string_node):
        return node.s

    return None


def get_rule_calls(build_file_contents):
    """
    Returns a list of top-level rule calls.
    ie. [{'id': 'python_test', 'name': 'calc_test', 'line': 1}, ...]
    """

    module_ast = ast.parse(build_file_contents)

    calls = []
    for stmt in module_ast.body:
        if isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Call) and isinstance(stmt.value.func, ast.Name):
            for kw in stmt.value.keywords:
                name = string_value(kw.value)
                if kw.arg == 'name' and name is not None:
                    calls.append({
                        'id': stmt.value.func.id,
                        'name': name,
                        'line': stmt.value.lineno,
                    })

    return calls

if __name__ == '__main__':
    build_file_contents = ''
    for line in sys.stdin:
        build_file_contents += line

    rule_calls = get_rule_calls(build_file_contents)
    print(json.dumps(rule_calls))
