import { Far } from "@endo/far"

export const make = (powers) => {
  return Far('the firmament', {
    async play (game) {
      // await E(game).currentPlayerScores(100)
    },
    getDetails () {
      return {
        name: 'the firmament',
        description: 'you have discovered the firmament, the mysteries of the universe unfold in a boundless dance.\n\n+100 points',
        pointValue: 100,
      }
    },
    getRendererCode () {
      return `${makeRenderer}`
    },
  })
}

function makeRenderer () {
  const gridh = 50;
  const gridw = 30;
  const maxDistance = 140;
  const power = 4;
  const friction = 0.9;
  const ratio = 0.25;
  const maxD2 = maxDistance * maxDistance;
  const a = power / maxD2;
  const pointsArray = [];

  init();

  function init() {
    for (let y = 0; y < gridh; ++y) {
      pointsArray[y] = [];
      for (let x = 0; x < gridw; ++x) {
        pointsArray[y][x] = new Point((x * 10) - 10, (y * 10) - 10);
      }
    }
  }
  function draw(context, rect, mousePos) {
    context.clearRect(0, 0, 600, 400);
    context.beginPath();
    context.fillStyle = "#EFEFEF";
    context.rect(0, 0, 600, 400);
    context.closePath();
    context.fill();
    for (let y = 0; y < gridh; ++y) {
      for (let x = 0; x < gridw; ++x) {
        const p = pointsArray[y][x];
        p.run(mousePos);
        const radius = 1.5;
        const px = p.x;
        const py = p.y;
        context.beginPath();
        context.fillStyle = "#000000";
        context.arc(px, py, radius, 0, Math.PI * 2, true);
        context.closePath();
        context.fill();
      }
    }
    // stats.update();
  }
  function Point(x, y) {
    this.startx = x;
    this.starty = y;
    this.speedx = 0;
    this.speedy = 0;
    this.x = x;
    this.y = y;
    this.run = function (mousePos) {
      const distanceX = mousePos.x - this.x;
      const distanceY = mousePos.y - this.y;
      const signX = (distanceX > 0) ? -1 : 1;
      const signY = (distanceY > 0) ? -1 : 1;
      const distance2 = distanceX * distanceX + distanceY * distanceY;
      let forceX = 0;
      let forceY = 0;
      if (distance2 <= maxD2) {
        const force = (-a * distance2 + power);
        forceX = (distanceX * distanceX) / distance2 * signX * force;
        forceY = (distanceY * distanceY) / distance2 * signY * force;
      }
      this.speedx = this.speedx * friction + (this.startx - this.x) * ratio + forceX;
      this.speedy = this.speedy * friction + (this.starty - this.y) * ratio + forceY;
      this.x += this.speedx;
      this.y += this.speedy;
    }
  }
  return draw;
}