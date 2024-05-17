
# Preparation

endo purge --force
endo make --UNCONFINED ~/endo/packages/daemon/src/networks/tcp-netstring.js \
    --name NETS.tcp \
    --powers AGENT
endo install ~/endo/packages/cli/demo/cat.js \
    --name cat \
    --powers AGENT \
    --listen 8920 \
    --open
endo store \
    --name hostport \
    --text 100.111.183.20:8921
endo resolve 0 hostport
endo dismiss 0

# Rock Paper Scissors Local

Kris: At terminal, show and create a bundle from roshambo.js.

endo bundle roshambo.js --name roshambo-app

Kris: At Familiar Chat, make Roshambo

# Invitation and Acceptance

Kris: Create an invitation and send it out of band

Switch to Erik’s screen

Erik: Accept an invitation received from Kris out of band

Erik: Send kris a message like Hi

# Multi-player

Switch to Kris’s screen

Kris: Create an attack with "paper" and send it to Erik.

Switch to Erik’s screen

Erik: Defends with "rock" and loses! Drat! Chats to Kris: "You rigged the game. Send me the app."

# An app you can trust

Switch to Kris’s screen

Kris: Sends Erik roshambo-app.

Switch to Erik:

Erik: Receives roshambo-app, adopts it, and makes roshambo. Erik starts a game and sends the defense facet to Kris. 

Switch to Kris:

Kris: receives the game and defends.

# A Strategist app enters the network

Switch to Kris’s Terminal.

Kris: Show Stratego.js and send to Erik.

    endo bundle stratego.js --name stratego-app
    endo send erik 'Try this provably perfect roshambo strategist app @stratego-app.'

Switch to Erik:

Erik installs Stratego and consults the oracle, then sends a game with that attack.


