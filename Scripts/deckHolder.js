const {
  refObject,
  UIElement,
  Vector,
  Text,
} = require("@tabletop-playground/api");

let text;
const ui = new UIElement();
ui.position = new Vector(-4, 0, refObject.getScale().z / 2 + 0.01);
ui.widget = text = new Text().setText(refObject.getName()).setFontSize(10);
refObject.addUI(ui);
refObject.onTick.add(function (_, _) {
  text.setText(refObject.getName());
});
