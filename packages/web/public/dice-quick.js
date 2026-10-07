/**
 * The 3D dice library (dice-box-threejs), tuned to be quicker: no shadows,
 * stronger gravity, time running 1.5× fast, and dice that count as stopped
 * after 0.3 s of stillness instead of 0.9 s. A roll lands in about 1.5 s
 * instead of about 3.5 s, and each frame is cheaper to draw.
 *
 * The library first works the whole throw out (to see which faces come up and
 * relabel them to the server's numbers), then plays it back; both use the same
 * settings here, so the dice still land on the server's numbers.
 */
import DiceBox from '/vendor/dice/dice-box.js';

export const QUICK = {
  speed: 1.5, // simulated seconds per real second
  gravity: 700, // the library's default is 400
  body: { sleepTimeLimit: 0.3, linearDamping: 0.3, angularDamping: 0.3 }, // the library's: 0.9, 0.1, 0.1
};

export default class QuickDiceBox extends DiceBox {
  constructor(selector, options = {}) {
    super(selector, { ...options, shadows: false, gravity_multiplier: QUICK.gravity });
  }

  async initialize() {
    await super.initialize();
    const world = this.world;
    const step = world.step.bind(world);
    world.step = (dt, ...rest) => step(dt * QUICK.speed, ...rest);
  }

  spawnDice(vectors, die = false) {
    const before = this.diceList.length;
    super.spawnDice(vectors, die);
    const spawned = die || (this.diceList.length > before ? this.diceList.at(-1) : null);
    if (spawned?.body) Object.assign(spawned.body, QUICK.body);
  }
}
