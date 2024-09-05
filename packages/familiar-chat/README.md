
This is a demo weblet that demonstrates a permission management UI for the
pet daemon itself.

This command will set up the cat page, create a URL,
and open it.

```sh
endo open familiar-chat cat.js --powers HOST
```

Thereafter,

```sh
endo open famiar-chat
```

To interact with the permission manager, you can mock requests from a fake
guest.

```sh
endo eval 42 --name ft
endo request --as cat 'pet me'
```

At this point, the command will pause, waiting for a response.
In the Familiar Chat window, resolve the request with the pet name "ft" and
the request will exit with the number 42.
