const { refCard, world, Vector } = require("@tabletop-playground/api");

const ACTION_DUP = "Copy Counter";

function duplicateCounter() {
  var pos = refCard.getPosition();
  world.createObjectFromTemplate(
    refCard.getTemplateId(),
    new Vector(pos.x + Math.random() * 2 - 1, pos.y + Math.random() * 2 - 1, pos.z + 4)
  );
}

refCard.onPrimaryAction.add(function (_, player) {
  duplicateCounter();
});
refCard.addCustomAction(ACTION_DUP, "Make a copy of this counter.");
refCard.onCustomAction.add(function (_, player, name) {
  switch (name) {
    case ACTION_DUP:
      duplicateCounter();
      break;
  }
});
