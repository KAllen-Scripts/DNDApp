/**
 * Stand-in for the 3D dice library (@3d-dice/dice-box-threejs), which needs
 * WebGL. It records what the page asked it to roll (the "forced" notation
 * that makes the dice land on the server's numbers) and which roller made it
 * (QuickDiceBox for the tuned one, FakeDiceBox for the classic).
 */
globalThis.__diceBox ??= { thrown: [], made: [], fail: false };

export default class FakeDiceBox {
  constructor(selector, options) {
    this.selector = selector;
    this.options = options;
    this.theme_customColorset = options.theme_customColorset;
    this.sounds = options.sounds;
    this.diceList = [];
    this.container = document.querySelector(selector);
    this.world = { steps: [], step(dt) { this.steps.push(dt); } };
    (globalThis.__diceBox.made ??= []).push(this.constructor.name);
    globalThis.__diceBox.last = this;
  }

  async initialize() {
    if (globalThis.__diceBox.fail) throw new Error('no WebGL');
  }

  async updateConfig(config) {
    Object.assign(this, config);
  }

  async loadSounds() {}

  async roll(notation) {
    globalThis.__diceBox.thrown.push(notation);
  }

  spawnDice(vectors, die = false) {
    if (!die) this.diceList.push({ body: {} });
  }

  clearDice() {}
}
