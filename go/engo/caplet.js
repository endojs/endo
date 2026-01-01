export const main = ({ fs }) => {
  const bytes = fs.readFileNow('hello.txt');
  const text = new TextDecoder().decode(bytes);
  print(text.trim());
};
