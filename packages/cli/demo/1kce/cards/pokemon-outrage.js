import { E, Far } from '@endo/far'

export const make = () => {
  return Far('pokemon-outrage', {
    async play (gameController) {

    },
    getDetails () {
      return {
        name: 'pokemon outrage',
        description: 'it gives you like like a hundred points every turn and...\n\n+50 points',
        pointValue: 50,
      }
    },
    getRendererCode () {
      return `${makeRenderer}`
    },
  })
}

function makeRenderer() {
  let isInitialized = false;
  let pokemons = [];

  function initialize(rect) {
    // Initialize pokemons with basic properties
    pokemons = [
      { x: rect.width / 4, y: rect.height / 2, color: 'yellow', size: 30 }, // Pikachu-like
      { x: rect.width / 2, y: rect.height / 2, color: 'blue', size: 40 },   // Squirtle-like
      { x: 3 * rect.width / 4, y: rect.height / 2, color: 'red', size: 35 }, // Charmander-like
    ];
    isInitialized = true;
  }

  function drawPokemon(context, pokemon, isNearMouse) {
    context.beginPath();
    context.arc(pokemon.x, pokemon.y, pokemon.size, 0, Math.PI * 2);
    context.fillStyle = pokemon.color;
    context.fill();

    // If the mouse is near, make the pokemon "jump"
    if (isNearMouse) {
      context.beginPath();
      context.arc(pokemon.x, pokemon.y - 10, pokemon.size / 2, 0, Math.PI * 2);
      context.fillStyle = 'white';
      context.fill();
    }
  }

  return function draw(context, rect, mousePos) {
    if (!isInitialized) {
      initialize(rect);
    }

    // Clear the canvas
    context.clearRect(0, 0, rect.width, rect.height);

    // Draw each Pokemon and check if the mouse is near
    pokemons.forEach(pokemon => {
      const isNearMouse = Math.hypot(pokemon.x - mousePos.x, pokemon.y - mousePos.y) < 50;
      drawPokemon(context, pokemon, isNearMouse);
    });
  };
}
