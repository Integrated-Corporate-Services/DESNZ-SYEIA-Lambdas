// CommonJS wrapper for ES module Lambda handler
// This allows LocalStack to load the function properly
exports.handler = async (event, context) => {
  const { handler: esmHandler } = await import('./handler.js');
  return esmHandler(event, context);
};
