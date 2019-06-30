// Platform dependent portion of error stack shim, for unreliably
// scraping the error stack string to produce the proposed JSON
// representation.

// lineToFrame(line) takes a (typically) single line string,
// representing a single stackframe of a stacktrace, and returns a
// JSON object in the proposed stack frame representation.

// How these lines are formatted varies widely between platforms.
// lineToFrame scrapes this line unreliably by using a variety of
// regular expressions that we've accumulated over time, to cover all
// the cases we've seen across platforms. There are a variety of
// user-triggered conditions that can cause this scraping to fail,
// such as a methodName that contains an "(" or "@" character.

// ///////////// Frame Patterns /////////////

// Each of the following frame patterns should have the first capture
// group be the function name, and the second capture group be the
// source URL together with position information. Afterwards, the
// lineColPattern will pull apart these source position components. On
// all, we assume the function name, if any, has no colon (":"),
// at-sign ("@"), or open paren ("("), as each of these are used to
// recognize other parts of a debug line.

// See https://bugs.chromium.org/p/v8/issues/detail?id=4268
const V8NestedCallSitePattern = /^eval at (.*) \((.*)\)$/;

// Seen on FF: The function name is sometimes followed by argument
// descriptions enclosed in parens, which we ignore. Then there is
// always an at-sign followed by possibly empty source position.
const FFFramePattern = /^\s*([^:@(]*?)\s*(?:\(.*\))?@(.*?)$/;

// Seen on IE: The line begins with " at ", as on v8, which we
// ignore. Then the function name, then the source position enclosed
// in parens.
const IEFramePattern = /^\s*(?:at\s+)?([^:@(]*?)\s*\((.*?)\)$/;

// Seem on Safari (JSC): The name optionally followed by an at-sign
// and source position information. This is like FF, except that the
// at-sign and source position info may together be absent.
const JSCFramePatt1 = /^\s*([^:@(]*?)\s*(?:@(.*?))?$/;

// Also seen on Safari (JSC): Just the source position info by itself,
// with no preceding function name. The source position always seems
// to contain at least a colon, which is how we decide that it is a
// source position rather than a function name. The pattern here is a
// bit more flexible, in that it will accept a function name preceding
// the source position and separated by whitespace.
const JSCFramePatt2 = /^\s*?([^:@(]*?)\s*?(.*?)$/;

// Lists the above patterns in priority order, where the first
// matching pattern is the one used for any one stack line.
const framePatterns = [
  V8NestedCallSitePattern,
  FFFramePattern,
  IEFramePattern,
  JSCFramePatt1,
  JSCFramePatt2,
];

// /////////////// Line Column Patterns ////////////////

// Each of the following lineColPatterns should have the first capture
// group be the source URL if any, the second be the line number if
// any, and the third be the column number if any.  If there are more,
// then we have an eval where the next three are the function-name,
// line, and column within the evaled string.

// Seen on FF Nightly 30 for execution in evaled strings.  On the left
// of the &gt; is the position from which eval was called. On the
// right is the position within the evaled string.

// TODO: Handle multiple eval nestings. If the multiple eval syntax is
// encountered, e.g.,
//
//   http://example.com line 16 > eval line 1 > eval:2:8
//
// it will match this pattern, but with the first capture group being
// "http://example.com line 16 > eval"
const FFEvalLineColPatterns = /^(.*) line (\d+)() > ([^:]*):(\d+):(\d+)$/;

// If the source position ends in either one or two
// colon-digit-sequence suffixes, then the first of these are the line
// number, and the second, if present, is the column number.
const MainLineColPattern = /^(.*?)(?::(\d+)(?::(\d+))?)?$/;

// List the above patterns in priority order, where the first matching
// pattern is the one used for any one stack line.
const lineColPatterns = [FFEvalLineColPatterns, MainLineColPattern];

function lineToFrame(line) {
  let name = line.trim();
  let source = '?';
  let span = [];

  for (const framePattern of framePatterns) {
    const match = framePattern.exec(line);
    if (match) {
      const [
        // eslint-disable-next-line no-unused-vars
        ignore,
        optName,
        optSource,
      ] = match;
      name = optName || '?';
      source = optSource || '?';
      break;
    }
  }

  for (const lineColPattern of lineColPatterns) {
    const match = lineColPattern.exec(source);
    if (match) {
      const [
        // eslint-disable-next-line no-unused-vars
        ignore,
        optSourceURL,
        optLineNum,
        optColNum,
        optEvalFuncName,
        optEvalLineNum,
        optEvalColNum,
      ] = match;
      source = optSourceURL || '?';
      if (optLineNum) {
        if (optColNum) {
          span = [[+optLineNum, +optColNum]];
        } else {
          span = [[+optLineNum]];
        }
      }
      if (match.length >= 5) {
        source = {
          name: optEvalFuncName === 'eval' ? '?' : optEvalFuncName || '?',
          source,
          span,
        };
        span = [];
        if (optEvalLineNum) {
          if (optEvalColNum) {
            span = [[+optEvalLineNum, +optEvalColNum]];
          } else {
            span = [[+optEvalLineNum]];
          }
        }
      }
      break;
    }
  }

  if (name === 'Anonymous function') {
    // Adjust for weirdness seen on IE
    name = '?';
  } else if (name.indexOf('/') !== -1) {
    // Adjust for function name weirdness seen on FF.
    name = name.replace(/[/<]/g, '');
    const parts = name.split('/');
    name = parts[parts.length - 1];
  }
  if (source === 'Unknown script code' || source === 'eval code') {
    // Adjust for weirdness seen on IE
    source = '?';
  }
  return {
    name,
    source,
    span,
  };
}

function getScrapedStackFramesUsing(getRawStackString) {
  function getScrapedStackFrames(error) {
    // may error. Propagate?
    const rawStackString = `${getRawStackString(error)}`;

    let lines = rawStackString.split('\n');
    if (/^\w*Error:/.test(lines[0])) {
      lines = lines.slice(1);
    }
    lines = lines.filter(line => line !== '');
    return lines.map(lineToFrame);
  }
  return getScrapedStackFrames;
}

export { getScrapedStackFramesUsing, lineToFrame };
