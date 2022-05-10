const {
  refObject,
  world,
  UIElement,
  Vector,
  Text,
  Button,
  VerticalBox,
  HorizontalAlignment,
} = require("@tabletop-playground/api");

const CARD_TEMPLATE = "259D66CE415FF02DA2381FBCDB053E1B";

let label;
const labelUI = new UIElement();
labelUI.position = new Vector(-12.5, -22.5, refObject.getScale().z / 2 + 0.01);
labelUI.widget = label = new Text()
  .setText(refObject.getName())
  .setFontSize(10);
refObject.addUI(labelUI);
refObject.onTick.add(function (_, _) {
  label.setText(refObject.getName());
});

let untapAll;
const actionsUI = new UIElement();
actionsUI.position = new Vector(-11, 22.5, refObject.getScale().z / 2 + 0.01);
actionsUI.widget = new VerticalBox()
  .setHorizontalAlignment(HorizontalAlignment.Center)
  .addChild(new Text().setText("Actions:").setFontSize(10))
  .addChild((untapAll = new Button().setText("Untap All").setFontSize(10)));
refObject.addUI(actionsUI);
untapAll.onClicked.add(function (_, player) {
  world.getAllObjects(true).forEach(function (obj) {
    if (
      refObject.getOwningPlayer() !== undefined &&
      refObject.getOwningPlayer() != player
    ) {
      return;
    }
    const extents = refObject.getExtent(true),
      center = refObject.getExtentCenter(true),
      pos = obj.getPosition();
    if (
      obj.getTemplateId() == CARD_TEMPLATE &&
      obj.isTapped() &&
      pos.x >= center.x - extents.x &&
      pos.x <= center.x + extents.x &&
      pos.y >= center.y - extents.y &&
      pos.y <= center.y + extents.y
    ) {
      obj.toggleTapped();
    }
  });
});
