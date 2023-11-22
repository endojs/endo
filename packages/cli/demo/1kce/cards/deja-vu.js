import { E, Far } from '@endo/far'

export const make = () => {
  return Far('deja vu', {
    async play (gameController) {
      const cards = await E(gameController).getDeckCards()
      await E(gameController).addCardsToDeck(cards)
    },
    getDetails () {
      return {
        name: 'deja vu',
        description: 'duplicate the cards in the deck, in the same order.\n\n-25 points',
        pointValue: -25,
      }
    },
    getRendererCode () {
      return `${makeRenderer}`
    },
  })
}

function makeRenderer() {
  let isInitialized = false;
  const elements = [];
  const speed = 0.1;

  function initialize(rect) {
    // Populate the elements array with initial elements
    for (let i = 0; i < 50; i++) {
      elements.push({
        x: Math.random() * rect.width,
        y: Math.random() * rect.height,
        size: Math.random() * 20 + 5,
        color: `hsla(${Math.random() * 360}, 100%, 50%, 0.7)`,
      });
    }
  }

  return function draw(context, rect, mousePos) {
    if (!isInitialized) {
      initialize(rect);
      isInitialized = true;
    }

    // Clear the canvas
    context.clearRect(0, 0, rect.width, rect.height);

    // // Draw lines between all elements and the mouse position, creating a web-like effect
    // elements.forEach(element => {
    //   context.beginPath();
    //   context.moveTo(mousePos.x, mousePos.y);
    //   context.lineTo(element.x, element.y);
    //   context.strokeStyle = element.color;
    //   context.stroke();
    // });

    // Draw each element as a circle
    elements.forEach(element => {
      context.beginPath();
      context.arc(element.x, element.y, element.size, 0, Math.PI * 2);
      context.fillStyle = element.color;
      context.fill();
    });

    // Update elements to create the "deja vu" effect
    elements.forEach((element, index) => {
      const margin = 2 * element.size;
      const maxWidth = rect.width + (margin * 2);
      const maxHeight = rect.height + (margin * 2);
      // Change position and size in a loop to create a repeating effect
      if (index % 2 === 0) { // Every other element
        element.x = (element.x + margin + speed + maxWidth) % (maxWidth) - margin;
        element.y = (element.y + margin + speed + maxHeight) % (maxHeight) - margin;
      } else {
        element.x = (element.x + margin - speed + maxWidth) % (maxWidth) - margin;
        element.y = (element.y + margin - speed + maxHeight) % (maxHeight) - margin;
      }
    });
  };
}
