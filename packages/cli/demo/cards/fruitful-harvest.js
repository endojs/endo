import { Far } from '@endo/far'

export const make = (powers) => {
  return Far('fruitful harvest', {
    async play (game) {
      await E(game).prependTurnPhase('draw')
    },
    getDetails () {
      return {
        name: 'fruitful harvest',
        description: 'each player now draws an additional card at the start of each turn.\n\n+25 points',
        pointValue: 50,
      }
    },
    getRendererCode () {
      return `${makeRenderer}`
    },
  })
}

function makeRenderer() {
  let fruits

  let isInitialized = false
  function initialize (rect) {
    // Initial setup
    fruits = Array.from({ length: 5 }, () => ({
      x: Math.random() * rect.width,
      y: Math.random() * rect.height,
      size: 10 + Math.random() * 10, // Size between 10 and 20
    }));
  }

  // Draw a simple fruit
  function drawFruit(context, fruit) {
    context.beginPath();
    context.arc(fruit.x, fruit.y, fruit.size, 0, 2 * Math.PI);
    context.fillStyle = 'orange'; // color of the fruit
    context.fill();
    context.stroke();
  }

  return function draw(context, rect, mousePos) {
    if (!isInitialized) {
      initialize(rect)
      isInitialized = true
    }

    // Clear the canvas
    context.clearRect(0, 0, rect.width, rect.height);

    // Draw each fruit
    fruits.forEach(fruit => drawFruit(context, fruit));

    // Optional: React to mouse position
    const isInFrame = mousePos.x >= 0 && mousePos.x <= rect.width && mousePos.y >= 0 && mousePos.y <= rect.height
    if (!isInFrame) {
      return
    }
    // Change something based on mousePos.x and mousePos.y
    // Example: Increase the size of the nearest fruit
    const nearestFruit = fruits.reduce((nearest, fruit) => {
      const distance = Math.sqrt((fruit.x - mousePos.x) ** 2 + (fruit.y - mousePos.y) ** 2);
      return distance < nearest.distance ? { fruit, distance } : nearest;
    }, { fruit: null, distance: Infinity });

    if (nearestFruit.fruit && nearestFruit.distance < nearestFruit.fruit.size) {
      nearestFruit.fruit.size += 0.1; // Grow the nearest fruit slightly
    }
  };
}