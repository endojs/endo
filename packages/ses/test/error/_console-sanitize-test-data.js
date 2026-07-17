/**
 * @type {[beforeArgs: any[], afterArgs: any[], beforeStr: string, afterStr: string][]}
 */
export const sanitizeBeforeAfterData = [
  [[], [], '', ''],
  // A %c beyond all args is not a format specifier
  [['a%cb'], ['a%cb'], 'a%cb', 'a%cb'],
  // Consume %c and its corresponding arg
  [['a%cb', 3, 4], ['ab', 4], 'ab 4', 'ab 4'],
  // %% is an escaped %, so this %c is not a format specifier
  [['a%%cb', 3, 4], ['a%%cb', 3, 4], 'a%cb 3 4', 'a%cb 3 4'],
  // %c after even number of % is a format specifier
  [['a%%%cb', 3, 4], ['a%%b', 4], 'a%b 4', 'a%b 4'],
  // Combo test of normal %c vs one beyond all args
  [['a%cb%cd', 3], ['ab%cd'], 'ab%cd', 'ab%cd'],
  // Unknown %<char> is not a specifier
  [['a%zb', 3, 4], ['a%%zb', 3, 4], 'a%zb 3 4', 'a%zb 3 4'],
  [
    ['a%zb', { x: 3 }, { y: 4 }],
    ['a%%zb', { x: 3 }, { y: 4 }],
    'a%zb { x: 3 } { y: 4 }',
    'a%zb { x: 3 } { y: 4 }',
  ],
  // Unspecified %<char> is not a specifier even if locally implemented.
  // The known case is %j is not in the whatwg std but Node implements it
  [['a%jb', 3, 4], ['a%%jb', 3, 4], 'a3b 4', 'a%jb 3 4'],
  [
    ['a%jb', { x: 3 }, { y: 4 }],
    ['a%%jb', { x: 3 }, { y: 4 }],
    'a{"x":3}b { y: 4 }', // on Node
    'a%jb { x: 3 } { y: 4 }',
  ],
];
