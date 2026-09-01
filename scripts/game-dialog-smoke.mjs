import assert from 'node:assert/strict';

import { Game } from '../src/game.js';
import { isFinalTrack, nextTrackAfter, TRACKS } from '../src/track-manifest.js';

globalThis.document = { activeElement: null };

function button(hidden = false) {
  return {
    hidden,
    disabled: false,
    clicks: 0,
    focus() { document.activeElement = this; },
    click() { this.clicks += 1; },
  };
}

function keyEvent(key) {
  return {
    key,
    repeat: false,
    prevented: false,
    preventDefault() { this.prevented = true; },
  };
}

const game = Object.create(Game.prototype);
game.messageEl = { classList: { contains: name => name === 'interactive' } };
game.messageActionsEl = { hidden: false };
game.nextButtonEl = button(false);
game.resumeButtonEl = button(true);
game.restartButtonEl = button(false);
game.menuButtonEl = button(false);

game.focusDialogButton(0);
assert.equal(document.activeElement, game.nextButtonEl);

const right = keyEvent('ArrowRight');
assert.equal(game.handleDialogKey(right, true), true);
assert.equal(right.prevented, true);
assert.equal(document.activeElement, game.restartButtonEl);

const enter = keyEvent('Enter');
assert.equal(game.handleDialogKey(enter, true), true);
assert.equal(game.restartButtonEl.clicks, 1);

game.nextButtonEl.hidden = true;
game.resumeButtonEl.hidden = false;
game.focusDialogButton(0);
assert.equal(document.activeElement, game.resumeButtonEl);

assert.equal(nextTrackAfter(TRACKS[0]), TRACKS[1]);
assert.equal(nextTrackAfter(TRACKS.at(-1)), TRACKS[0]);
assert.equal(isFinalTrack(TRACKS[0]), false);
assert.equal(isFinalTrack(TRACKS.at(-1)), true);

console.log('game dialog smoke ok');
