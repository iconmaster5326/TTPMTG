const {
  refObject,
  UIElement,
  Vector,
  HorizontalBox,
  Button,
  TextBox,
  Rotator,
  globalEvents,
  Color,
  world,
} = require("@tabletop-playground/api");

function updateValue(v) {
  refObject.value = v;
  text.setText(v);
  staticUI.widget.setText(v);
  refObject.setSavedData(v);
}

var minus, text, plus;

refObject.value = parseInt(refObject.getSavedData());
if (isNaN(refObject.value)) {
  refObject.value = 20;
}

let ui = new UIElement();
ui.position = new Vector(2, 0, 1);
ui.rotation = new Rotator(20, 0, 0);
ui.widget = new HorizontalBox()
  .addChild((minus = new Button().setText("-")))
  .addChild(
    (text = new TextBox().setText(refObject.value).setSelectTextOnFocus(true))
  )
  .addChild((plus = new Button().setText("+")));

minus.onClicked.add(function (_, player) {
  updateValue(refObject.value - 1);
});

plus.onClicked.add(function (_, player) {
  updateValue(refObject.value + 1);
});

text.onTextCommitted.add(function (_, player, textAdded, usingEnter) {
  var op = function (v) {
    return v;
  };

  if (textAdded.startsWith("+")) {
    op = function (v) {
      return refObject.value + v;
    };
    textAdded = textAdded.substring(1);
  } else if (textAdded.startsWith("-")) {
    op = function (v) {
      return refObject.value - v;
    };
    textAdded = textAdded.substring(1);
  } else if (textAdded.startsWith("*")) {
    op = function (v) {
      return refObject.value * v;
    };
    textAdded = textAdded.substring(1);
  } else if (textAdded.startsWith("/")) {
    op = function (v) {
      return refObject.value / v;
    };
    textAdded = textAdded.substring(1);
  } else if (textAdded.startsWith("=")) {
    textAdded = textAdded.substring(1);
  }

  let newValue = parseInt(textAdded);
  if (!isNaN(newValue)) {
    updateValue(op(newValue));
  } else {
    text.setText(refObject.value);
  }
});

var uiIndex = undefined;
globalEvents.onTick.add(function (_) {
  var player = refObject.getOwningPlayer();

  if (refObject.getOwningPlayerSlot() == -1) {
    if (uiIndex === undefined) {
      uiIndex = refObject.addUI(ui);
    }
  } else if (player !== undefined) {
    if (
      player.getCursorPosition().distance(refObject.getPosition()) <=
      refObject.getExtent().magnitude()
    ) {
      if (uiIndex === undefined) {
        uiIndex = refObject.addUI(ui);
      }
    } else {
      if (uiIndex !== undefined) {
        refObject.removeUI(uiIndex);
        uiIndex = undefined;
      }
    }
  }
});

let staticUI = new UIElement();
staticUI.position = new Vector(0, 0, 0.2);
staticUI.widget = new Text().setText(refObject.value);
refObject.addUI(staticUI);

let OWN_THIS = "Take Ownership",
  DISOWN_THIS = "Revoke Ownership";

function updateMenu() {
  refObject.removeCustomAction(OWN_THIS);
  refObject.removeCustomAction(DISOWN_THIS);

  if (refObject.getOwningPlayerSlot() == -1) {
    refObject.addCustomAction(OWN_THIS, "Sets you as this object's owner.");
  } else {
    refObject.addCustomAction(
      DISOWN_THIS,
      "Removes you as this object's owner."
    );
  }
}
updateMenu();

refObject.onCustomAction.add(function (_, player, name) {
  switch (name) {
    case OWN_THIS:
      refObject.setOwningPlayerSlot(player.getSlot());
      staticUI.widget.setTextColor(player.getPlayerColor());
      break;
    case DISOWN_THIS:
      refObject.setOwningPlayerSlot(-1);
      staticUI.widget.setTextColor(new Color(255, 255, 255));
      break;
  }
  updateMenu();
});

if (refObject.getOwningPlayerSlot() != -1) {
  staticUI.widget.setTextColor(
    world.getSlotColor(refObject.getOwningPlayerSlot())
  );
}
