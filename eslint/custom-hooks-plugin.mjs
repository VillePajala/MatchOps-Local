/**
 * ESLint plugin that enforces memoization of functions passed to custom hooks.
 */
const requireMemoizedFunctionPropsRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Require useCallback for function props passed to specific custom hooks",
      recommended: false,
    },
    schema: [
      {
        type: "object",
        properties: {
          hooks: {
            type: "array",
            items: {
              type: "object",
              required: ["name", "functionProps"],
              properties: {
                name: { type: "string" },
                functionProps: {
                  type: "array",
                  minItems: 1,
                  items: { type: "string" },
                },
                argumentIndex: {
                  type: "integer",
                  minimum: 0,
                },
              },
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      mustBeIdentifier:
        "Pass a named function (declared with useCallback) for '{{propName}}' when calling '{{hookName}}'.",
      mustBeMemoized:
        "Memoize '{{propName}}' with useCallback before passing it to '{{hookName}}' to avoid unstable references.",
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const hooks = Array.isArray(options.hooks) ? options.hooks : [];
    if (hooks.length === 0) {
      return {};
    }

    const memoizedVariables = new Set();
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const getScopeForNode =
      typeof sourceCode.getScope === "function"
        ? (node) => sourceCode.getScope(node)
        : () => context.getScope();

    const getVariableFromIdentifier = (identifier) => {
      if (!identifier) {
        return null;
      }
      let scope = getScopeForNode(identifier);
      while (scope) {
        if (scope.set && scope.set.has(identifier.name)) {
          return scope.set.get(identifier.name);
        }
        scope = scope.upper;
      }
      return null;
    };

    const isUseCallbackCall = (node) => {
      if (!node || node.type !== "CallExpression") {
        return false;
      }
      const callee = node.callee;
      if (callee.type === "Identifier") {
        return callee.name === "useCallback";
      }
      if (
        callee.type === "MemberExpression" &&
        !callee.computed &&
        callee.property.type === "Identifier"
      ) {
        return callee.property.name === "useCallback";
      }
      return false;
    };

    const isHookCall = (node, hookName) => {
      if (!node || node.type !== "CallExpression") {
        return false;
      }
      const callee = node.callee;
      if (callee.type === "Identifier") {
        return callee.name === hookName;
      }
      if (
        callee.type === "MemberExpression" &&
        !callee.computed &&
        callee.property.type === "Identifier"
      ) {
        return callee.property.name === hookName;
      }
      return false;
    };

    const getPropertyName = (key) => {
      if (!key) {
        return null;
      }
      if (key.type === "Identifier") {
        return key.name;
      }
      if (key.type === "Literal" && typeof key.value === "string") {
        return key.value;
      }
      return null;
    };

    const resolveObjectExpression = (node) => {
      if (!node) {
        return null;
      }
      if (node.type === "ObjectExpression") {
        return node;
      }
      if (node.type === "Identifier") {
        const variable = getVariableFromIdentifier(node);
        if (!variable) {
          return null;
        }
        for (const def of variable.defs) {
          if (
            def.node &&
            def.node.type === "VariableDeclarator" &&
            def.node.init &&
            def.node.init.type === "ObjectExpression"
          ) {
            return def.node.init;
          }
        }
      }
      return null;
    };

    const findHookConfig = (node) =>
      hooks.find((hook) => isHookCall(node, hook.name));

    return {
      VariableDeclarator(node) {
        if (
          node.id.type === "Identifier" &&
          node.init &&
          isUseCallbackCall(node.init)
        ) {
          const variable = getVariableFromIdentifier(node.id);
          if (variable) {
            memoizedVariables.add(variable);
          }
        }
      },
      CallExpression(node) {
        const hookConfig = findHookConfig(node);
        if (!hookConfig) {
          return;
        }

        const argumentIndex =
          typeof hookConfig.argumentIndex === "number"
            ? hookConfig.argumentIndex
            : 0;
        const targetArgument = node.arguments[argumentIndex];
        const optionsObject = resolveObjectExpression(targetArgument);
        if (!optionsObject) {
          return;
        }

        for (const propName of hookConfig.functionProps) {
          const targetProperty = optionsObject.properties.find(
            (property) =>
              property.type === "Property" &&
              !property.computed &&
              getPropertyName(property.key) === propName
          );
          if (!targetProperty) {
            continue;
          }

          const valueNode = targetProperty.value;
          if (valueNode.type !== "Identifier") {
            context.report({
              node: valueNode,
              messageId: "mustBeIdentifier",
              data: {
                hookName: hookConfig.name,
                propName,
              },
            });
            continue;
          }

          const variable = getVariableFromIdentifier(valueNode);
          if (!variable || !memoizedVariables.has(variable)) {
            context.report({
              node: valueNode,
              messageId: "mustBeMemoized",
              data: {
                hookName: hookConfig.name,
                propName,
              },
            });
          }
        }
      },
    };
  },
};

const customHooksPlugin = {
  rules: {
    "require-memoized-function-props": requireMemoizedFunctionPropsRule,
  },
};

export default customHooksPlugin;
