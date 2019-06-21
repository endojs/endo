// Platform dependent portion of error stack shim

function getScrapedStackFramesUsing(getRawStackString) {
  
  /**
   * line2CWFrame(line) takes a (typically) single line string,
   * representing a single stackframe of a stacktrace, and returns an
   * Extended Causeway frame JSON object as defined above.
   *
   * <p>There is no standard for how these lines are formatted and
   * they vary widely between platforms. line2CWFrame scrapes this
   * line unreliably by using a variety of regular expressions that
   * we've accumulated over time, to cover all the cases we've seen
   * across platforms. There are a variety of user-triggered
   * conditions that can cause this scraping to fail, such as a
   * methodName that contains an "(" or "@" character.
   */
  var line2CWFrame = (function() {
    // Each of these frame patterns should have the first capture
    // group be the function name, and the second capture group be
    // the source URL together with position
    // information. Afterwards, the lineColPattern will pull apart
    // these source position components. On all, we assume the
    // function name, if any, has no colon (":"), at-sign ("@"), or
    // open paren ("("), as each of these are used to recognize
    // other parts of a debug line.
    
    // See https://code.google.com/p/v8/issues/detail?id=4268
    var V8NestedCallSitePattern = /^eval at (.*) \((.*)\)$/;
    
    // Seen on FF: The function name is sometimes followed by
    // argument descriptions enclosed in parens, which we
    // ignore. Then there is always an at-sign followed by possibly
    // empty source position.
    var FFFramePattern = /^\s*([^:@(]*?)\s*(?:\(.*\))?@(.*?)$/;
    
    // Seen on IE: The line begins with " at ", as on v8, which we
    // ignore. Then the function name, then the source position
    // enclosed in parens.
    var IEFramePattern = /^\s*(?:at\s+)?([^:@(]*?)\s*\((.*?)\)$/;
    
    // Seem on Safari (JSC): The name optionally followed by an
    // at-sign and source position information. This is like FF,
    // except that the at-sign and source position info may
    // together be absent.
    var JSCFramePatt1 = /^\s*([^:@(]*?)\s*(?:@(.*?))?$/;
    
    // Also seen on Safari (JSC): Just the source position info by
    // itself, with no preceding function name. The source position
    // always seems to contain at least a colon, which is how we
    // decide that it is a source position rather than a function
    // name. The pattern here is a bit more flexible, in that it
    // will accept a function name preceding the source position
    // and separated by whitespace.
    var JSCFramePatt2 = /^\s*?([^:@(]*?)\s*?(.*?)$/;
    
    // List the above patterns in priority order, where the first
    // matching pattern is the one used for any one stack line.
    var framePatterns = [V8NestedCallSitePattern,
                         FFFramePattern, IEFramePattern,
                         JSCFramePatt1, JSCFramePatt2];
    
    
    // Each of the LineColPatterns should have the first capture
    // group be the source URL if any, the second be the line
    // number if any, and the third be the column number if any.
    // If there are more, then we have an eval where the next three
    // are the function-name, line, and column within the evaled string.
    
    // Seen on FF Nightly 30 for execution in evaled strings.
    // On the left of the &gt; is the position from which eval was
    // called. On the right is the position within the evaled
    // string.
    //
    // TODO(erights): Handle multiple eval nestings. This is low
    // priority because SES only exposes eval through functions
    // that call eval, and so SES never has direct eval
    // nestings. In any case, if the multiple eval syntax is
    // encountered, e.g., 
    //   http://example.com line 16 > eval line 1 > eval:2:8
    // it will match this pattern, but with the first capture
    // group being "http://example.com line 16 > eval"
    var FFEvalLineColPatterns =
      /^(.*) line (\d+)() > ([^:]*):(\d+):(\d+)$/;
    
    // If the source position ends in either one or two
    // colon-digit-sequence suffixes, then the first of these are
    // the line number, and the second, if present, is the column
    // number.
    var MainLineColPattern = /^(.*?)(?::(\d+)(?::(\d+))?)?$/;
    
    // List the above patterns in priority order, where the first
    // matching pattern is the one used for any one stack line.
    var lineColPatterns = [FFEvalLineColPatterns, MainLineColPattern];
    
    function line2CWFrame(line) {
      var name = line.trim();
      var source = '?';
      var span = [];
      // Using .some here only because it gives us a way to escape
      // the loop early. We do not use the results of the .some.
      framePatterns.some(function(framePattern) {
        var match = framePattern.exec(line);
        if (match) {
          name = match[1] || '?';
          source = match[2] || '?';
          // Using .some here only because it gives us a way to escape
          // the loop early. We do not use the results of the .some.
          lineColPatterns.some(function(lineColPattern) {
            var sub = lineColPattern.exec(source);
            if (sub) {
              // sub[1] if present is the source URL.
              // sub[2] if present is the line number.
              // sub[3] if present is the column number.
              // sub[4] if present is the function name within the evaled
              // string.
              // sub[5] if present is the line number within the
              // evaled string.
              // sub[6] if present is the column number within
              // the evaled string.
              source = sub[1] || '?';
              if (sub[2]) {
                if (sub[3]) {
                  span = [[+sub[2], +sub[3]]];
                } else {
                  span = [[+sub[2]]];
                }
              }
              if (sub.length >= 5) {
                source = {
                  name: sub[4] === 'eval' ? '?' : (sub[4] || '?'),
                  source: source,
                  span: span
                };
                span = [];
                if (sub[5]) {
                  if (sub[6]) {
                    span = [[+sub[5], +sub[6]]];
                  } else {
                    span = [[+sub[5]]];
                  }
                }
              }
              return true;
            }
            return false;
          });
          return true;
        }
        return false;
      });
      if (name === 'Anonymous function') {
        // Adjust for weirdness seen on IE
        name = '?';
      } else if (name.indexOf('/') !== -1) {
        // Adjust for function name weirdness seen on FF.
        name = name.replace(/[/<]/g,'');
        var parts = name.split('/');
        name = parts[parts.length -1];
      }
      if (source === 'Unknown script code' || source === 'eval code') {
        // Adjust for weirdness seen on IE
        source = '?';
      }
      return {
        name: name,
        source: source,
        span: span
      };
    }
    
    
  });
}                    
                      
export { getScrapedStackFramesUsing };
                      
