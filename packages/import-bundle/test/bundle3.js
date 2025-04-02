import { readFileSync } from 'fs';

const fileContents = readFileSync('self.js', 'utf8');

export default fileContents;
