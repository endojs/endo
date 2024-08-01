# setup

### setup cli
in `packages/cli`:

npm i -g .

### setup basic objects
in `packages/1kce`:

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

### webui steps
- open installed webui
- select `agent-game`
- from dropdown select deck `deck-new`
- add cards to deck
- create invite for player-0
- create invite for player-1
- start game
- open new tab of same url
- select player-1
- play game in both tabs


TODO:
- [X] set deck
  - premake for demo
  - late set deck / reload deck after setting on game
    - useLookup
      - fails to update on depth >1
        - new dir method for subscribing to one name, applied recursively
- [x] modify deck (single player)
- [ ] setup players
  - [x] add a new player invite
  - [ ] create first player by default?
- [x] start game
  - [x] failure to import deck
- [x] play game
  - [x] render hand
    - [x] target has no method
    - [x] playerHandGrain not updating ?
  - [x] render other players
    need to explicitly create all players
  - [x] ui needs sense of selected player
    - [x] select game via player interface
    - [x] select via game lobby
    - [x] unified flow for selecting player interface
      - game:
        - [x] getCardsAtPlayerLocationGrain
      - stateGrain:
        - [x] make loadable from control interface
      - gameMgmt:
        - [x] start (not needed during play)
        - [x] playCardByIdFromHand
- [x] dont show other players hand during their turn
- [ ] factor out game creation code