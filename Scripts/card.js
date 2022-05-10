const {
  refCard,
  world,
  UIElement,
  VerticalBox,
  HorizontalBox,
  TextBox,
  Button,
  Rotator,
  Vector,
  Text,
  Border,
  fetch,
} = require("@tabletop-playground/api");

const SCRYFALL_URL = "https://api.scryfall.com/";

const ACTION_SET = "Set Card...",
  ACTION_ADD = "Add Card...",
  ACTION_TAP = "Tap",
  ACTION_UNTAP = "Untap",
  ACTION_XFORM = "Transform";

/////////////
// public API
/////////////

const thisCard = refCard;

refCard.getCardInfo = function (cardIndex) {
  const saveData = thisCard.getSavedData(cardIndex.toString());
  console.log(
    "[" +
      thisCard.getId() +
      "] getting data at index " +
      cardIndex +
      ": " +
      saveData
  );
  if (saveData) {
    try {
      return JSON.parse(saveData);
    } catch (e) {
      return {};
    }
  } else {
    return {};
  }
};

refCard.getAllCardInfo = function () {
  const result = [];
  for (let i = 0; i < thisCard.getStackSize(); i++) {
    result.push(thisCard.getCardInfo(i));
  }
  return result;
};

refCard.setCardInfo = function (cardIndex, newData) {
  console.log(
    "[" +
      thisCard.getId() +
      "] setting data at index " +
      cardIndex +
      ": " +
      JSON.stringify(newData)
  );
  thisCard.setSavedData(JSON.stringify(newData), cardIndex.toString());
  refresh(thisCard, cardIndex);
};

refCard.setAllCardInfo = function (newData) {
  for (let i = 0; i < newData.length; i++) {
    thisCard.setCardInfo(i, newData[i]);
  }
};

refCard.isTapped = function () {
  const saveData = thisCard.getSavedData();
  console.log("[" + thisCard.getId() + "] getting global state: " + saveData);
  if (saveData) {
    try {
      return JSON.parse(saveData).tapped;
    } catch (e) {
      return false;
    }
  } else {
    return false;
  }
};

refCard.setTapped = function (value) {
  const saveDataStr = thisCard.getSavedData();
  let saveData = {};
  if (saveDataStr) {
    try {
      saveData = JSON.parse(saveDataStr);
    } catch (e) {
      // do nothing
    }
  }
  saveData.tapped = value;
  console.log(
    "[" +
      thisCard.getId() +
      "] setting global state: " +
      JSON.stringify(saveData)
  );
  thisCard.setSavedData(JSON.stringify(saveData));
  refreshTappedState(thisCard);
};

refCard.toggleTapped = function () {
  let tapped = thisCard.isTapped();

  if (tapped) {
    thisCard.setRotation(
      thisCard.getRotation().compose(new Rotator(0, -90, 0)),
      1
    );
  } else {
    thisCard.setRotation(
      thisCard.getRotation().compose(new Rotator(0, 90, 0)),
      1
    );
  }

  thisCard.setTapped(!tapped);
};

refCard.scryfallData = function (cardIndex) {
  return fetchScryfallDataByID(thisCard.getCardInfo(cardIndex).id);
};

refCard.isTransformed = function () {
  const saveData = thisCard.getSavedData();
  console.log("[" + thisCard.getId() + "] getting global state: " + saveData);
  if (saveData) {
    try {
      return JSON.parse(saveData).xformed;
    } catch (e) {
      return false;
    }
  } else {
    return false;
  }
};

refCard.setTransformed = function (value) {
  const saveDataStr = thisCard.getSavedData();
  let saveData = {};
  if (saveDataStr) {
    try {
      saveData = JSON.parse(saveDataStr);
    } catch (e) {
      // do nothing
    }
  }
  saveData.xformed = value;
  console.log(
    "[" +
      thisCard.getId() +
      "] setting global state: " +
      JSON.stringify(saveData)
  );
  thisCard.setSavedData(JSON.stringify(saveData));
  refresh(thisCard, 0);
};

refCard.toggleTransformed = function () {
  thisCard.setTransformed(!thisCard.isTransformed());
};

///////////////////
// Helper functions
///////////////////

function refresh(cards, cardIndex) {
  const DFC_LAYOUTS = [
    "modal_dfc",
    "transform",
    "meld",
    "double_faced_token",
    "reversible_card",
  ];

  console.log("[" + cards.getId() + "] refreshing index " + cardIndex + "...");
  const cardState = cards.getCardInfo(cardIndex);

  cards.removeCustomAction(ACTION_SET);
  cards.removeCustomAction(ACTION_ADD);

  if (cardState.id === undefined) {
    cards.setTextureOverrideURLAt(undefined, cardIndex);
    if (cards.getStackSize() == 1) {
      cards.setName(undefined);
      cards.addCustomAction(ACTION_SET, "Set this card by name.");
    }
  } else {
    // add default actions
    cards.addCustomAction(ACTION_ADD, "Add a card by name to this stack.");
    // fetch card data
    world.fetchScryfallDataByID(cardState.id).then(function (cardData) {
      if (cardData !== undefined) {
        // add actions
        if (
          cards.getStackSize() == 1 &&
          DFC_LAYOUTS.includes(cardData.layout)
        ) {
          cards.addCustomAction(
            ACTION_XFORM,
            "Flip this double-faced card over."
          );
        } else {
          cards.removeCustomAction(ACTION_XFORM);
        }
        // fetch image
        if (DFC_LAYOUTS.includes(cardData.layout)) {
          // double-faced card
          let imageIndex;
          if (cards.isTransformed()) {
            imageIndex = 1;
          } else {
            imageIndex = 0;
          }
          if (cardData.card_faces[imageIndex].image_uris !== undefined) {
            cards.setTextureOverrideURLAt(
              cardData.card_faces[imageIndex].image_uris.large,
              cardIndex
            );
          }
        } else if (cardData.image_uris !== undefined) {
          // single-faced card
          cards.setTextureOverrideURLAt(cardData.image_uris.large, cardIndex);
        }
        // set metadata
        if (cards.getStackSize() == 1) {
          cards.setName(cardData.name);
        }
      }
    });
  }

  if (cards.getStackSize() != 1) {
    cards.setName(undefined);
  }
}

function refreshTappedState(cards) {
  console.log("[" + cards.getId() + "] refreshing tapped state...");
  if (cards.isTapped()) {
    cards.removeCustomAction(ACTION_TAP);
    cards.addCustomAction(ACTION_UNTAP, "Untap this card.");
  } else {
    cards.removeCustomAction(ACTION_UNTAP);
    cards.addCustomAction(ACTION_TAP, "Tap this card.");
  }
}

function updateGenericCardStackData(cards) {
  const metadata = JSON.stringify({ tapped: cards.isTapped() });
  console.log(
    "[" + cards.getId() + "] Saving card-stack metadata: " + metadata
  );
  cards.setSavedData(metadata);
}

/////////////////
// handle actions
/////////////////

let dialogUiIndex = undefined;

function showSearchDialog(callback) {
  const ui = new UIElement();
  ui.position = new Vector(0, 0, refCard.isFaceUp() ? -1 : 1);
  ui.rotation = new Rotator(
    refCard.isFaceUp() ? 180 : 0,
    refCard.isFaceUp() ? 180 : 0,
    0
  );
  var searchBox, matches;
  var nMatches = 0;
  ui.widget = new Border().setChild(
    new VerticalBox()
      .addChild(
        new HorizontalBox()
          .addChild(new Text().setText("Search:"))
          .addChild((searchBox = new TextBox()))
      )
      .addChild((matches = new VerticalBox()))
  );
  dialogUiIndex = refCard.addUI(ui);

  searchBox.onTextChanged.add(function (_, player, text) {
    for (let i = 0; i < nMatches; i++) {
      matches.removeChildAt(0);
    }
    nMatches = 0;
    const MAX_MATCHES = 5;

    fetch(
      SCRYFALL_URL +
        "cards/autocomplete?q=" +
        encodeURI(text) +
        "&include_extras=true"
    )
      .then(function (response) {
        const catalog = response.json();
        catalog.data.forEach(function (cardName) {
          nMatches++;
          if (nMatches >= MAX_MATCHES) {
            return;
          }
          var cardButton;
          matches.addChild((cardButton = new Button().setText(cardName)));
          cardButton.onClicked.add(function (_, player) {
            world.fetchScryfallDataByName(cardName).then(function (card) {
              refCard.removeUI(dialogUiIndex);
              dialogUiIndex = undefined;
              callback(card);
            });
          });
        });
      })
      .catch(function (reason) {
        console.log(
          "[" +
            refCard.getId() +
            "] Problem in Scryfall autocomplete fetch: " +
            reason
        );
      });
  });
}

refCard.onCustomAction.add(function (_, player, name) {
  switch (name) {
    case ACTION_SET:
      showSearchDialog(function (card) {
        refCard.setAllCardInfo([{ id: card.id }]);
      });
      break;
    case ACTION_ADD:
      showSearchDialog(function (card) {
        var newCard = world.createObjectFromTemplate(
          "259D66CE415FF02DA2381FBCDB053E1B",
          player.getCursorPosition()
        );
        newCard.setAllCardInfo([{ id: card.id }]);
        refCard.addCards(newCard, true);
      });
      break;
    case ACTION_UNTAP:
    case ACTION_TAP:
      refCard.toggleTapped();
      break;
    case ACTION_XFORM:
      refCard.toggleTransformed();
      break;
  }
});

refCard.onPrimaryAction.add(function (_, player) {
  if (refCard.getStackSize() == 1) {
    // tap and untap only if we're not shuffling; that is, if we're 1 card
    refCard.toggleTapped();
  } else {
    // actually shuffle it here, as the TTP shuffler does not inform us of
    // changes to card states
    let data = refCard.getAllCardInfo();
    let currentIndex = data.length,
      randomIndex;
    while (currentIndex != 0) {
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
      [data[currentIndex], data[randomIndex]] = [
        data[randomIndex],
        data[currentIndex],
      ];
    }
    refCard.setAllCardInfo(data);
  }
});

///////////////////////////
// handle splitting/merging
///////////////////////////

refCard.onRemoved.add(function (_, removedCard, index, player) {
  console.log(
    "Removing index " +
      index +
      "(refCard = " +
      refCard.getId() +
      " x" +
      refCard.getStackSize() +
      ", removedCard = " +
      +removedCard.getId() +
      " x" +
      removedCard.getStackSize() +
      ")"
  );
  // fix up bad data
  const data = [];
  for (
    let i = 0;
    i < refCard.getStackSize() + removedCard.getStackSize();
    i++
  ) {
    data.push(refCard.getCardInfo(i));
  }
  // actually splice in good data
  removedCard.setAllCardInfo(data.splice(index, removedCard.getStackSize()));
  refCard.setAllCardInfo(data);
});

refCard.onInserted.add(function (_, insertedCard, index, player) {
  console.log(
    "Inserting index " +
      index +
      "(refCard = " +
      refCard.getId() +
      " x" +
      refCard.getStackSize() +
      ", insertedCard = " +
      insertedCard.getId() +
      " x" +
      insertedCard.getStackSize() +
      ")"
  );
  const data = refCard.getAllCardInfo();
  // fix up bad data
  data.splice(-insertedCard.getStackSize(), insertedCard.getStackSize());
  // actually splice in good data
  data.splice(index, 0, ...insertedCard.getAllCardInfo());
  refCard.setAllCardInfo(data);
});

///////////////
// initlization
///////////////

for (let i = 0; i < refCard.getStackSize(); i++) {
  refresh(refCard, i);
}

refreshTappedState(refCard);
