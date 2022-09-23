const {
  UIElement,
  refObject,
  WebBrowser,
  Vector,
} = require("@tabletop-playground/api");

const browser = new WebBrowser();

const self = refObject;
refObject.getURL = function () {
  return self.getSavedData("url") || "https://scryfall.com";
};
refObject.setURL = function (url) {
  self.setSavedData(url, "url");
  browser.setURL(url);
};

const browserUI = new UIElement();
const targetSize = refObject.getSize();
const pxPerCm = 50;
const width = targetSize.y * pxPerCm;
const height = targetSize.x * pxPerCm;

browserUI.useWidgetSize = false;
browserUI.scale = 0.18;
browserUI.widget = browser;
browserUI.width = width;
browserUI.height = height;
browserUI.position = new Vector(0, 0, 0.2);

refObject.addUI(browserUI);

browser.setURL(refObject.getURL());
browser.onURLChanged.add(function (_, url) {
  self.setSavedData(url, "url");
});
