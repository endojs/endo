function evaluate(source, endowments = {}) {
  const names = Object.getOwnPropertyNames(endowments);
  const s = `(function(endowments) {
    const { ${names.join(',')} } = endowments;
    return ${source};
  })`;
  // eslint-disable-next-line no-eval
  return eval(s)(endowments);
}

module.exports = evaluate;
