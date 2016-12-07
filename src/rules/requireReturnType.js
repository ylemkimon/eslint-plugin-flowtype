import _ from 'lodash';

export default (context) => {
  const annotateReturn = (_.get(context, 'options[0]') || 'always') === 'always';
  const annotateUndefined = (_.get(context, 'options[1].annotateUndefined') || 'never') === 'always';
  const skipArrows = _.get(context, 'options[1].excludeArrowFunctions') || false;

  const getRegExp = (str) => {
    return new RegExp(str);
  };

  let excludeMatching;
  let includeOnlyMatching;

  excludeMatching = _.get(context, 'options[1].excludeMatching', []);
  includeOnlyMatching = _.get(context, 'options[1].includeOnlyMatching', []);

  excludeMatching = _.map(excludeMatching, getRegExp);
  includeOnlyMatching = _.map(includeOnlyMatching, getRegExp);

  const targetNodes = [];

  const registerFunction = (functionNode) => {
    targetNodes.push({
      functionNode
    });
  };

  const isUndefinedReturnType = (returnNode) => {
    return returnNode.argument === null || returnNode.argument.name === 'undefined' || returnNode.argument.operator === 'void';
  };

  const getIsReturnTypeAnnotationUndefined = (targetNode) => {
    const isReturnTypeAnnotationLiteralUndefined = _.get(targetNode, 'functionNode.returnType.typeAnnotation.id.name') === 'undefined' && _.get(targetNode, 'functionNode.returnType.typeAnnotation.type') === 'GenericTypeAnnotation';
    const isReturnTypeAnnotationVoid = _.get(targetNode, 'functionNode.returnType.typeAnnotation.type') === 'VoidTypeAnnotation';

    return isReturnTypeAnnotationLiteralUndefined || isReturnTypeAnnotationVoid;
  };

  const getShouldFilterNode = (functionNode) => {
    const isArrow = functionNode.type === 'ArrowFunctionExpression';
    const identiferName = _.get(functionNode, isArrow ? 'parent.id.name' : 'id.name');

    const checkRegExp = _.partial((str, re) => {
      return re.test(str);
    }, identiferName);

    if (excludeMatching.length && _.some(excludeMatching, checkRegExp)) {
      return true;
    }

    if (includeOnlyMatching.length && !_.some(includeOnlyMatching, checkRegExp)) {
      return true;
    }

    return false;
  };

  const evaluateFunction = (functionNode) => {
    const targetNode = targetNodes.pop();

    if (functionNode !== targetNode.functionNode) {
      throw new Error('Mismatch.');
    }

    const isArrow = functionNode.type === 'ArrowFunctionExpression';
    const isArrowFunctionExpression = functionNode.expression;
    const hasImplicitReturnType = functionNode.async || functionNode.generator;
    const isFunctionReturnUndefined = !isArrowFunctionExpression && !hasImplicitReturnType && (!targetNode.returnStatementNode || isUndefinedReturnType(targetNode.returnStatementNode));
    const isReturnTypeAnnotationUndefined = getIsReturnTypeAnnotationUndefined(targetNode);

    if (skipArrows === 'expressionsOnly' && isArrowFunctionExpression || skipArrows === true && isArrow) {
      return;
    }

    if (isFunctionReturnUndefined && isReturnTypeAnnotationUndefined && !annotateUndefined) {
      context.report(functionNode, 'Must not annotate undefined return type.');
    } else if (isFunctionReturnUndefined && !isReturnTypeAnnotationUndefined && annotateUndefined) {
      context.report(functionNode, 'Must annotate undefined return type.');
    } else if (!isFunctionReturnUndefined && !isReturnTypeAnnotationUndefined) {
      const shouldFilterNode = getShouldFilterNode(functionNode);

      if (annotateReturn && !functionNode.returnType && !shouldFilterNode) {
        context.report(functionNode, 'Missing return type annotation.');
      }
    }
  };

  const evaluateNoise = () => {
    targetNodes.pop();
  };

  return {
    ArrowFunctionExpression: registerFunction,
    'ArrowFunctionExpression:exit': evaluateFunction,
    ClassDeclaration: registerFunction,
    'ClassDeclaration:exit': evaluateNoise,
    ClassExpression: registerFunction,
    'ClassExpression:exit': evaluateNoise,
    FunctionDeclaration: registerFunction,
    'FunctionDeclaration:exit': evaluateFunction,
    FunctionExpression: registerFunction,
    'FunctionExpression:exit': evaluateFunction,
    ReturnStatement: (node) => {
      if (targetNodes.length) {
        targetNodes[targetNodes.length - 1].returnStatementNode = node;
      }
    }
  };
};
