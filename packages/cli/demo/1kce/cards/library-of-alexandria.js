import { E, Far } from '@endo/far'

export const make = () => {

  return Far('library of alexandria', {
    async play (controller) {
      // tell the game to call "scoreFunction" on this card when it wants to calculate scores
      await E(controller).setScoreFn('scoreFunction')
    },
    async scoreFunction ({ cardsData }) {
      let score = 0
      for (const cardData of cardsData) {
        const { name } = await E(cardData.remote).getDetails()
        score += name.length * 10
      }
      return score
    },
    getDetails () {
      return {
        name: 'library of alexandria',
        description: 'scores are now based on the length of the name the cards.\n\nwhen they burned the library of Alexandria the crowd cheered in horrible joy. They understood that there was something older than wisdom, and it was fire, and something truer than words, and it was ashes.',
        pointValue: -100,
      }
    },
    getRendererCode () {
      return `${makeRenderer}`
    },
  })
}

function makeRenderer() {
  const particles = [];

  // Function to initialize particles
  function initParticles(rect) {
      for (let i = 0; i < 100; i++) {
          particles.push({
              x: Math.random() * rect.width,
              y: rect.height,
              size: Math.random() * 3 + 1,
              speed: Math.random() * 5 + 1,
              opacity: Math.random(),
              color: `rgba(255, ${Math.floor(Math.random() * 100)}, 0, ${Math.random()})`,
          });
      }
  }

  let isInitialized = false

  return function draw(context, rect, mousePos) {
      if (!isInitialized) {
        initParticles(rect)
        isInitialized = true
      }

      // Clear the canvas
      context.clearRect(0, 0, rect.width, rect.height);

      // Update and draw particles
      particles.forEach((particle, index) => {
          particle.y -= particle.speed;
          context.globalAlpha = particle.opacity;
          context.fillStyle = particle.color;
          context.beginPath();
          context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
          context.fill();

          // Reset particle if it goes above the canvas
          if (particle.y < 0) {
              particle.y = rect.height;
          }
      });

      context.globalAlpha = 1;
  };
}
