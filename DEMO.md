### demo

#### 1. (both) setup networking
on both machines setup network device
and perform invites
```bash
endo store --text 127.0.0.1:0 --name tcp-netstring-json-captp0-host-port
endo make --powers AGENT --name NETS.tcp --UNCONFINED ./packages/daemon/src/networks/tcp-netstring.js
# endo invite bob
# echo '(invitation)' | endo accept alice 
```

#### 2. (both) install wallet
```bash
endo install ./packages/familiar-chat/src/index.js --powers AGENT --listen 0 --name app-wallet
```

#### 3. (player 1) install game ui
```bash
# separately store bundle for sending via chat
endo bundle --name bundle-game ./packages/1kce/src/weblet.js
endo install --bundle bundle-game --powers AGENT --listen 0 --name app-game
```

#### 4. (player 1) install game cards
```bash
endo make ./packages/1kce/src/cards/firmament.js -n card-firmament
endo make ./packages/1kce/src/cards/lost-and-afraid.js -n card-lost-and-afraid
# see others in ./packages/1kce/src/cards/
```

#### 5. (player 1) open game ui and make deck, add cards

#### 6. (player 1) send game ui *bundle* deck to player 2
in wallet ui, send bundle-game in message, MUST be sent as "bundle-game". deck must be "deck".

#### 7. (player 2) install game in chat ui
click on "bundle-game" in message and "install app" named as "app-game".
adopt deck as deck.
open game app.

#### 8. (player 1) start create game
#### 9. (player 2) refresh game app
#### 10. (both) play. as prev demo. no end condition. can see other players cards. insert more interesting card game here.
