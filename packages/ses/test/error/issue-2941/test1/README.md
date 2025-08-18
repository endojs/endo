# repro

1. open index.js in the browser as file:// protocol
2. see

FireFox:
```
SES_UNCAUGHT_EXCEPTION: undefined ses.js:9178:27
    levelMethod file:///.../test1/ses.js:9178
    tameConsole file:///.../test1/ses.js:9618
```

Chromium:
```
SES_UNCAUGHT_EXCEPTION: null
error	@	ses.js:9178
```