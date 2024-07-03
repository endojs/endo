flow:

```sh
# fresh start
endo purge -f && \
# make game
endo mkhost handle-game agent-game && \
endo make ./src/game.js --powers agent-game --name agent-game.game && \
# make deck
endo mkhost handle-deck agent-deck && \
endo make ./src/deck.js --powers agent-deck --name deck-new && \
# make cards 
endo make src/cards/firmament.js -n card-firmament && \
endo make src/cards/lost-and-afraid.js -n card-lost && \
# app
endo bundle --name bundle-game ./src/weblet.js && \
endo install --bundle bundle-game --powers AGENT --listen 0 --name app-game
```

- create players
- start

    ui:
        select game agent / game invite/player
        game setup config



0. chat
1. send app
2. send cards
3. build deck
4. start play

TODO:
- [X] set deck
  - premake for demo
  - late set deck / reload deck after setting on game
    - useLookup
      - fails to update on depth >1
        - new dir method for subscribing to one name, applied recursively
- [x] modify deck (single player)
- [ ] start game
