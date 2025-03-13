// deliberately offset
function TokenType() {}
const beforeExpr = 0;

export function createBinop(name, binop) {
  return new TokenType(name, {
    beforeExpr,
    binop,
  });
}
