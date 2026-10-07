/**
 * Stand-in for the 3D dice library (@3d-dice/dice-box-threejs), which needs
 * WebGL. It records what the page asked it to roll: the "forced" notation
 * that makes the dice land on the server's numbers.
 */
globalThis.__diceBox ??= { thrown: [], fail: false };

export default class FakeDiceBox {
  constructor(selector, options) {
    this.selector = selector;
    this.options = options;
    this.theme_customColorset = options.theme_customColorset;
    this.sounds = options.sounds;
    this.diceList = [];
    this.container = document.querySelector(selector);
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

  clearDice() {}
}
