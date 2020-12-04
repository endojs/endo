/* global trace */

export default function main(argv) {
  trace("hello world!\n");
  trace(`args:${JSON.stringify(argv)}\n`);
}

main();
