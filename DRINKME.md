
> It was all very well to say "Drink me," but the wise little Alice was not going to do that in a hurry. "No, I'll look first," she said

Hi, I'm a noob. Follow me as I explore the codebase.  

# Chapter 1: Down the Rabbit-Hole to see how CommonJS modules get loaded

Did you read up on what Endo's about? Stuff is running in compartments and these are there to lock things down inside them. 
TODO: link to an intro video or sth

I quickly discovered the thing that's responsible for loading modules with dependencies is called compartment-mapper.

## Hello, compartment-mapper

First I went to https://github.com/endojs/endo/blob/master/packages/compartment-mapper/README.md


### console.log first

With that context, it was time to run stuff.  
I started by picking a simple test, then instrumented https://github.com/endojs/endo/blob/289c906173a450d608f816ab83e702435ad80057/packages/compartment-mapper/src/parse-cjs.js#L28 by adding a console.log - don't judge.

```js
const execute = async (moduleExports, compartment, resolvedImports) => {
    const a = {};
    Error.captureStackTrace(a);
    console.log(location, a.stack);
    const functor = compartment.evaluate(
```
which I then executed
```
naugtur@localtoast:endo/packages/compartment-mapper $ yarn ava ./test/test-main.js
```
and got stack traces I could explore (some IDEs will navigate to lines when you ctrl/cmd + click on a link in their integrated terminal!)

The result was pretty dull, because most of it was inside the ses.umd.js :(

So I went and replaced `import 'ses'` with `import '../../ses/index.js';`
in test-main.js and also in scaffold.js

That got me the stacktrace I wanted

```
file:///endo/packages/compartment-mapper/test/fixtures-0/node_modules/typemodule/cjs.cjs Error: 
    at Object.execute (file:///endo/packages/compartment-mapper/src/parse-cjs.js:30:11)
    at Object.execute (file:///endo/packages/ses/src/module-instance.js:87:28)
    at imports (file:///endo/packages/ses/src/module-instance.js:345:16)
    at eval (file:///endo/packages/compartment-mapper/test/fixtures-0/node_modules/typemodule/main.js:1:102)
    at Object.execute (file:///endo/packages/ses/src/module-instance.js:421:9)
    at imports (file:///endo/packages/ses/src/module-instance.js:345:16)
    at eval (file:///endo/packages/compartment-mapper/test/fixtures-0/node_modules/app/main.js:1:143)
    at execute (file:///endo/packages/ses/src/module-instance.js:421:9)
    at compartmentImportNow (file:///endo/packages/ses/src/compartment-shim.js:87:3)
    at file:///endo/packages/ses/src/compartment-shim.js:156:27
file:///endo/packages/compartment-mapper/test/fixtures-0/node_modules/typecommon/main.js Error: 
    at Object.execute (file:///endo/packages/compartment-mapper/src/parse-cjs.js:30:11)
    at Object.execute (file:///endo/packages/ses/src/module-instance.js:87:28)
    at imports (file:///endo/packages/ses/src/module-instance.js:345:16)
    at eval (file:///endo/packages/compartment-mapper/test/fixtures-0/node_modules/app/main.js:1:143)
    at execute (file:///endo/packages/ses/src/module-instance.js:421:9)
    at compartmentImportNow (file:///endo/packages/ses/src/compartment-shim.js:87:3)
    at file:///endo/packages/ses/src/compartment-shim.js:156:27
    at file:///endo/packages/compartment-mapper/test/scaffold.js:66:27
…
```

Going through these files reveals a lot about where the packages are loaded. But there was still more I could get out of it.

### I'm a professional, gotta use serious tools!

Ok, so now I shamed myself into getting a debugger connected.  
*This is gonna be a demo of why I prefer to use console.log first...*

I want to plug in a debugger into tests. Ava is not very keen to cooperate. I had issues with the default way ava tests debugging is set up for vscode https://github.com/avajs/ava/blob/main/docs/recipes/debugging-with-vscode.md
It'd complain I should be using import() instead of require.

*It's either because of how ava works internally, or because the test is calling require because it's covering cjs modules. Not the rabbithole I'm after right now.*

I put a `debugger;` statement at the beginning of the test so I don't have to go through Ava bootstrap much.

Tests, even if running `ava --serial`, spawn more than one debugger for this test, so the port number must not collide.

I ended up plugging in the debugger with this:
```
node --inspect-brk=0  node_modules/.bin/ava --serial ./test/test-cjs-compat.js
```
(I took the simplest test with cjs I could find)

--inspect-brk=0 gives me a new random port each time.  
I opened chromium devtools and in the Connection tab added a new connection to 127.0.0.1:RANDOM_PORT_I_GOT 
- Connect to the first one and hit play.  
- Look up the next port.  
- Connect to the second one and hit play.  
- Now I'm at my `debugger;`

The fun began! 

----

I went through the `loadLocation` and `import` calls with the debugger.  
**See the [Loading and running - first pass](./docs/loading-code-guide.md) code guide**


My test case didn't load any modules inside packages, so `pendingJobs` was just 1 item and I didn't go on to explore how the recursion creates the jobs.  
I did notice that the recursion is returning results to the main load function by mutating items passed down as references. That's how jobs and errors are collected. 




